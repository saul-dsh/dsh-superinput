/**
 * dsh-composer · snippets 模块（片段管理器）
 *
 * 捕获 dsh 窗口内的复制（客户端 copy 事件上报），持久化到
 * ~/.dsh/storages/dsh-composer/snippets.json；客户端 dock 按钮弹官方
 * 样式面板：搜索 / 收藏 / 点击插入草稿 / 删除。能力边界：只能看见
 * dsh 窗口内的复制，宿主没有系统剪贴板桥，全局监控做不到。
 *
 * 服务端只做存储与去重（按文本归一指纹，重复复制置顶不重复占用）。
 */
import Schema from '@deepseek-ai/schemastery'
import { readFile, writeFile, rename, mkdir, appendFile } from 'node:fs/promises'
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const inject = []

const STORE_DIR = join(homedir(), '.dsh', 'storages', 'dsh-composer')
const STORE_PATH = join(STORE_DIR, 'snippets.json')

export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('启用片段管理器'),
  captureEnabled: Schema.boolean().default(true).description('自动捕获窗口内复制'),
  maxItems: Schema.number().default(200).description('历史保留条数（收藏不计入上限）'),
  minChars: Schema.number().default(2).description('捕获最小字符数'),
})

/** 归一指纹：去首尾空白 + 压缩连续空白，同文重复只留一条。 */
const fingerprintOf = (text) => createHash('sha256').update(text.trim().replace(/\s+/g, ' ')).digest('hex').slice(0, 16)

function createStore(maxItems) {
  let state = { items: [] }
  let dirty = false
  let timer = null
  const load = () => {
    try { state = JSON.parse(readFileSync(STORE_PATH, 'utf8')) } catch { /* 首次或损坏：空库 */ }
    if (!state || !Array.isArray(state.items)) state = { items: [] }
  }
  const flush = () => {
    if (!dirty) return
    try {
      mkdirSync(STORE_DIR, { recursive: true })
      const tmp = `${STORE_PATH}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify(state), 'utf8')
      renameSync(tmp, STORE_PATH)
      dirty = false
    } catch (error) { console.error('[dsh-composer] snippets flush failed:', error?.message ?? error) }
  }
  const schedule = () => {
    dirty = true
    if (timer) return
    timer = setTimeout(() => { timer = null; flush() }, 500)
    timer.unref?.()
  }
  return {
    load,
    dispose() { if (timer) { clearTimeout(timer); timer = null } flush() },
    list() { return state.items },
    /** 新增/置顶（同指纹已有则移到最前并更新时间）；返回是否新增。 */
    capture(text, source) {
      const clean = String(text ?? '').replace(/\0/g, '')
      if (!clean.trim()) return false
      const fp = fingerprintOf(clean)
      const existing = state.items.find((item) => item.fp === fp)
      if (existing) {
        existing.at = Date.now()
        state.items = [existing, ...state.items.filter((item) => item !== existing)]
        schedule()
        return false
      }
      state.items.unshift({ id: randomUUID(), fp, text: clean, at: Date.now(), pinned: false, source: source === 'paste' ? 'paste' : 'copy' })
      // 只裁剪未收藏的；收藏条目不受上限约束。
      const overflow = state.items.filter((item) => !item.pinned).length - maxItems
      if (overflow > 0) {
        const drop = new Set(state.items.filter((item) => !item.pinned).slice(-overflow).map((item) => item.id))
        state.items = state.items.filter((item) => !drop.has(item.id))
      }
      schedule()
      return true
    },
    remove(id) {
      const before = state.items.length
      state.items = state.items.filter((item) => item.id !== id)
      if (state.items.length !== before) schedule()
      return state.items.length !== before
    },
    pin(id, pinned) {
      const item = state.items.find((entry) => entry.id === id)
      if (!item) return false
      item.pinned = !!pinned
      schedule()
      return true
    },
  }
}

// 同步 fs 用于小文件原子写（store 数据量小，同步足够；异步 API 只在别处用）。

export function apply(ctx, config) {
  // 运行时可变副本：POST /settings 改这里，立即生效；显式改过的键持久化
  // 到 storages、启动时回放（没改过的键继续跟随宿主配置）。回放必须在
  // createStore 之前，重启后上次的 maxItems 才对裁剪生效。
  const live = { ...config }
  if (!live.enabled) return

  // 设置持久化：只落与 config 不同的键，防抖 400ms 原子写。
  const SETTINGS_KEYS = ['captureEnabled', 'maxItems', 'minChars']
  const SETTINGS_PATH = join(homedir(), '.dsh', 'storages', 'dsh-composer', 'snippets.settings.json')
  try {
    const saved = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'))
    for (const key of SETTINGS_KEYS) if (saved?.[key] !== undefined) live[key] = saved[key]
  } catch { /* 无存档：全部跟随配置 */ }
  let settingsTimer = null
  const persistSettings = () => {
    if (settingsTimer) return
    settingsTimer = setTimeout(() => {
      settingsTimer = null
      try {
        mkdirSync(dirname(SETTINGS_PATH), { recursive: true })
        const out = {}
        for (const key of SETTINGS_KEYS) if (live[key] !== config[key]) out[key] = live[key]
        const tmp = `${SETTINGS_PATH}.tmp`
        writeFileSync(tmp, JSON.stringify(out, null, 2))
        renameSync(tmp, SETTINGS_PATH)
      } catch { /* ignore */ }
    }, 400)
  }

  const store = createStore(Math.max(20, Math.round(live.maxItems ?? 200)))
  store.load()
  ctx.effect(() => store.dispose(), 'dsh-composer: snippets store')
  const minChars = Math.max(1, Math.round(live.minChars ?? 2))
  const cap = (text) => (String(text ?? '').length > 100_000 ? String(text).slice(0, 100_000) : String(text ?? ''))

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: '/api/dsh-composer/snippets',
      handler: async (req, res) => {
        const send = (status, body) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        const path = (req.url ?? '').split('?')[0].replace(/^\/api\/dsh-composer\/snippets/, '')
        const readBody = async () => {
          let body = ''
          for await (const chunk of req) body += chunk
          try { return JSON.parse(body) } catch { return {} }
        }

        if (path === '/settings' && req.method === 'GET') {
          send(200, { ...live })
          return
        }
        // 运行时改参数：只接受白名单字段，其余忽略（provider/model 这类
        // 改了要重建路由，运行时改无效，不如不给入口）。
        if (path === '/settings' && req.method === 'POST') {
          let raw = ''
          for await (const chunk of req) raw += chunk
          let body
          try { body = JSON.parse(raw) } catch { send(400, { error: 'invalid-json' }); return }
          if (body.captureEnabled !== undefined) live.captureEnabled = body.captureEnabled === true
          if (body.maxItems !== undefined) { const v = Number(body.maxItems); if (Number.isFinite(v)) live.maxItems = Math.min(2000, Math.max(20, Math.round(v))) }
          if (body.minChars !== undefined) { const v = Number(body.minChars); if (Number.isFinite(v)) live.minChars = Math.min(100, Math.max(1, Math.round(v))) }
          persistSettings()
          send(200, { ...live })
          return
        }
        if (path === '/diag' && req.method === 'POST') {
          let body = ''
          for await (const chunk of req) body += chunk
          let message = ''
          try { message = String(JSON.parse(body).message ?? '').slice(0, 400) } catch { message = '' }
          if (message) {
            try {
              mkdirSync(STORE_DIR, { recursive: true })
              appendFile(join(STORE_DIR, 'snippets-debug.log'), `${new Date().toISOString()} ${message}\n`, 'utf8')
            } catch { /* ignore */ }
          }
          send(200, { ok: true })
          return
        }
        if (path === '/list' && req.method === 'GET') {
          send(200, { items: store.list(), captureEnabled: live.captureEnabled === true })
          return
        }
        if (path === '/add' && req.method === 'POST') {
          const body = await readBody()
          const text = cap(body.text)
          if (text.trim().length < minChars) { send(200, { ok: false, reason: 'too-short' }); return }
          const added = store.capture(text, body.source)
          // 超出上限的旧条目在 capture 内裁剪；此处只回执。
          send(200, { ok: true, added })
          return
        }
        if (path === '/remove' && req.method === 'POST') {
          const body = await readBody()
          send(200, { ok: store.remove(String(body.id ?? '')) })
          return
        }
        if (path === '/pin' && req.method === 'POST') {
          const body = await readBody()
          send(200, { ok: store.pin(String(body.id ?? ''), body.pinned === true) })
          return
        }
        send(404, { error: 'not-found' })
      },
    }), 'dsh-composer: snippets endpoints')
  })
}

export default { Config, apply }
