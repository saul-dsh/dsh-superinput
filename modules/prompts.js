/**
 * dsh-superinput · prompts 模块（提示词模板库）
 *
 * 和 snippets 互补：snippets 自动捕获窗口内复制，prompts 是手动保存的常用模板。
 * 支持 {{变量}} 占位符，插入时由前端弹窗填值；服务端只存原文，不做替换。
 *
 * 存储 ~/.dsh/storages/dsh-superinput/prompts.json（结构 { items: [...] }）。
 */
import Schema from '@deepseek-ai/schemastery'
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const inject = []

const STORE_DIR = join(homedir(), '.dsh', 'storages', 'dsh-superinput')
const STORE_PATH = join(STORE_DIR, 'prompts.json')

export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('启用提示词模板库'),
  maxItems: Schema.number().default(500).description('最多保存多少条模板（收藏不计入上限）'),
})

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
    } catch (error) {
      console.error('[dsh-superinput] prompts flush failed:', error?.message ?? error)
    }
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

    /** 新建或更新。title 为空时用正文前 40 字兜底，避免列表里出现无标题条目。 */
    save({ id, title, body, tags }) {
      const cleanBody = String(body ?? '').replace(/\0/g, '')
      if (!cleanBody.trim()) return { ok: false, reason: 'empty-body' }
      const cleanTitle = String(title ?? '').trim().slice(0, 80) || cleanBody.trim().slice(0, 40)
      const cleanTags = Array.isArray(tags)
        ? tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8)
        : []

      if (id) {
        const item = state.items.find((entry) => entry.id === id)
        if (!item) return { ok: false, reason: 'not-found' }
        item.title = cleanTitle
        item.body = cleanBody
        item.tags = cleanTags
        item.at = Date.now()
        schedule()
        return { ok: true, id, created: false }
      }

      const newId = randomUUID()
      state.items.unshift({
        id: newId,
        title: cleanTitle,
        body: cleanBody,
        tags: cleanTags,
        at: Date.now(),
        pinned: false,
      })
      // 收藏条目不占上限
      const overflow = state.items.filter((item) => !item.pinned).length - maxItems
      if (overflow > 0) {
        const drop = new Set(state.items.filter((item) => !item.pinned).slice(-overflow).map((item) => item.id))
        state.items = state.items.filter((item) => !drop.has(item.id))
      }
      schedule()
      return { ok: true, id: newId, created: true }
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

export function apply(ctx, config) {
  // 运行时可变副本：POST /settings 改这里，立即生效；显式改过的键持久化
  // 到 storages、启动时回放（没改过的键继续跟随宿主配置）。回放必须在
  // createStore 之前，重启后上次的 maxItems 才对裁剪生效。
  const live = { ...config }
  if (!live.enabled) return

  // 设置持久化：只落与 config 不同的键，防抖 400ms 原子写。
  const SETTINGS_KEYS = ['maxItems']
  const SETTINGS_PATH = join(homedir(), '.dsh', 'storages', 'dsh-superinput', 'prompts.settings.json')
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

  const store = createStore(Math.max(20, Math.round(live.maxItems ?? 500)))
  store.load()
  ctx.effect(() => store.dispose(), 'dsh-superinput: prompts store')

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: '/api/dsh-superinput/prompts',
      handler: async (req, res) => {
        const send = (status, body) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        const path = (req.url ?? '').split('?')[0].replace(/^\/api\/dsh-superinput\/prompts/, '')
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
          if (body.maxItems !== undefined) { const v = Number(body.maxItems); if (Number.isFinite(v)) live.maxItems = Math.min(5000, Math.max(20, Math.round(v))) }
          persistSettings()
          send(200, { ...live })
          return
        }
        if (path === '/list' && req.method === 'GET') {
          send(200, { items: store.list() })
          return
        }
        if (path === '/save' && req.method === 'POST') {
          send(200, store.save(await readBody()))
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
    }), 'dsh-superinput: prompts endpoints')
  })
}

export default { Config, apply }
