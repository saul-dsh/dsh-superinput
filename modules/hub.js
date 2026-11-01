/**
 * dsh-composer · hub 模块（设置总览）
 *
 * 把各模块的**最终生效配置**聚合成一张表，供设置页展示。
 *
 * 为什么不做写入：dsh 的插件 Config 在启动时由宿主读取，运行时改不了。
 * 各模块自己的 /settings 端点改的是内存 live 副本 + storages 持久化，
 * 重启后由模块自己回放。这里只回答「现在是什么状态」。
 *
 * 数据来源两层：apply 时聚合层塞进来的 snapshot（defaults 与宿主配置合并），
 * 叠加各模块落盘的显式改动（<storages>/dsh-composer/<mod>.settings.json）——
 * 只吐快照会在重启后与实际运行值不符（快照不知道回放）。
 */
import Schema from '@deepseek-ai/schemastery'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const inject = []

export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('在设置页显示「输入栏」总览'),
})

/** 各模块持久化文件名（与各模块 SETTINGS_PATH 保持一致）。 */
const PERSISTED_FILES = [
  ['cost', 'cost.settings.json'],
  ['enhancer', 'enhancer.settings.json'],
  ['followup', 'followup.settings.json'],
  ['picker', 'picker.settings.json'],
  ['snippets', 'snippets.settings.json'],
  ['prompts', 'prompts.settings.json'],
]

function loadPersisted() {
  const persisted = {}
  const dir = join(homedir(), '.dsh', 'storages', 'dsh-composer')
  for (const [mod, file] of PERSISTED_FILES) {
    try {
      const saved = JSON.parse(readFileSync(join(dir, file), 'utf8'))
      if (saved && typeof saved === 'object' && Object.keys(saved).length > 0) persisted[mod] = saved
    } catch { /* 模块无存档：跟随配置 */ }
  }
  return persisted
}

export function apply(ctx, config) {
  if (!config.enabled) return
  const snapshot = config.snapshot ?? {}

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: '/api/dsh-composer/hub',
      handler: async (req, res) => {
        const send = (status, body) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        const path = (req.url ?? '').split('?')[0].replace(/^\/api\/dsh-composer\/hub/, '')
        if (path === '/state' && req.method === 'GET') {
          const persisted = loadPersisted()
          const modules = {}
          for (const [mod, cfg] of Object.entries(snapshot)) modules[mod] = { ...cfg, ...(persisted[mod] ?? {}) }
          for (const [mod, saved] of Object.entries(persisted)) {
            if (!modules[mod]) modules[mod] = { ...saved }
            else modules[mod].persistedKeys = Object.keys(saved)
          }
          send(200, { modules })
          return
        }
        send(404, { error: 'not-found' })
      },
    }), 'dsh-composer: hub endpoint')
  })
}

export default { Config, apply }
