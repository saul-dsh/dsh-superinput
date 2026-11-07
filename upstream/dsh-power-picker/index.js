/**
 * dsh-power-picker — Codex 风格的模型 + 推理强度选择器（DeepSeek Harness / dsh）
 *
 * 服务端半很薄：`enabled` 开关 + 诊断落盘。所有真正的逻辑都在客户端——
 * 以更低 priority 注册 `conversation.input.model` 槽位遮蔽内置选择器，
 * 数据走官方 modelDirectories 会话模型目录。服务端唯一的职责：
 *   1. 让「关闭插件」有一个不用卸载的开关（客户端注册遮蔽前先来确认）；
 *   2. 接收客户端诊断事件，落到 ~/.dsh/power-picker-debug.log，
 *      座位异常时看这份文件就能定位卡在哪一环（服务端起没起、客户端
 *      模块加载没有、inject 是否失败、快照字段长什么样）。
 *
 * 已核对的 dsh API（0.2.1-rc.3 已装运行时反推 + dsh-reference 对照）：
 *   - 客户端 ctx.modelDirectories.directoryFor(sessionId) → 目录
 *   - 组件拿到的是 directory.store（SnapshotStore）：subscribe/getSnapshot
 *   - 快照：{ current: {provider, model, reasoningEffort?} | null,
 *            groups: [{ id, name, models: [{ id, name, reasoning? }] }],
 *            retainedEffort?, pending, ... }
 *     档位阶梯在 groups[].models[].reasoning = { defaultEffort?, efforts: [{id, name}] }
 *   - directory.select({ provider, model, reasoningEffort? }) 官方切换
 *   - conversation.input.model 是 single 槽位，多注册按 priority 只渲染最低者
 */

import Schema from '@deepseek-ai/schemastery'
import { appendFile, mkdir } from 'node:fs/promises'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'power-picker'

const DIAG_LOG = join(homedir(), '.dsh', 'power-picker-debug.log')

export const Config = Schema.object({
  /** 关闭后客户端不再注册任何入口，模型选择恢复原样（无需卸载插件）。 */
  enabled: Schema.boolean().default(true).description('是否启用 Codex 风格选择器'),
  /**
   * Codex 实测形态：入口就是输入栏右下角「选择推理强度」按钮，面板从其
   * 上方弹出。默认 true；false 时输入栏不渲染入口（无任何入口）。
   */
  composerSeat: Schema.boolean().default(true).description('输入栏保留模型入口（Codex 同位：右下角，发送键旁）'),
})

export function apply(ctx, config) {
  // 运行时可变副本：POST /settings 改这里，立即生效；显式改过的键持久化
  // 到 storages、启动时回放（没改过的键继续跟随宿主配置）。
  const live = { ...config }

  // 设置持久化：只落与 config 不同的键，防抖 400ms 原子写。
  const SETTINGS_KEYS = ['enabled', 'composerSeat']
  const SETTINGS_PATH = join(homedir(), '.dsh', 'storages', 'dsh-power-picker', 'settings.json')
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

  const say = (message) => {
    try { console.info(`[dsh-power-picker] ${message}`) } catch { /* ignore */ }
  }
  const report = async (line) => {
    try {
      await mkdir(dirname(DIAG_LOG), { recursive: true })
      await appendFile(DIAG_LOG, `${new Date().toISOString()} ${line}\n`, 'utf8')
    } catch { /* ignore */ }
  }

  say(`server boot, enabled=${live.enabled !== false}`)
  void report(`server boot enabled=${live.enabled !== false}`)

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: '/api/dsh-power-picker',
      handler: async (req, res) => {
        const send = (status, body) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        const path = (req.url ?? '').split('?')[0].replace(/^\/api\/dsh-power-picker/, '')
        if (path === '/settings' && req.method === 'POST') {
          let raw = ''
          for await (const chunk of req) raw += chunk
          let body
          try { body = JSON.parse(raw) } catch { send(400, { error: 'invalid-json' }); return }
          if (body.enabled !== undefined) live.enabled = body.enabled === true
          if (typeof body.composerSeat === 'string') live.composerSeat = body.composerSeat.slice(0, 40)
          persistSettings()
          send(200, { ...live })
          return
        }


        // 客户端注册前读取设置：enabled 总开关 + composerSeat 入口位置。
        if (path === '/settings' && req.method === 'GET') {
          send(200, {
            enabled: live.enabled !== false,
            composerSeat: live.composerSeat === true,
            name,
          })
          return
        }

        // 诊断上报：一行一条 JSON，出问题时看 ~/.dsh/power-picker-debug.log。
        if (path === '/diag' && req.method === 'POST') {
          let raw = ''
          for await (const chunk of req) raw += chunk
          await report(raw.slice(0, 2000))
          send(200, { ok: true })
          return
        }

        send(404, { error: 'not-found' })
      },
    }), 'dsh-power-picker: /api/dsh-power-picker/*')
  })
}

export default { name, Config, apply }
