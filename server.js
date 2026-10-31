/* dsh-composer 服务端核心（由 scripts/build-suite.mjs 生成；勿手改）。
 * 入口拆分：index.js 是零依赖探针（先 trace 再动态 import 本文件并捕获失败）——
 * 顶层静态 import 的失败发生在入口任何语句之前，静默且永远取不到证据。 */
import Schema from '@deepseek-ai/schemastery'
import { AsyncLocalStorage } from 'node:async_hooks'
import { appendFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, utimesSync, writeSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const MODULES = [
  ['cost', costModule],
  ['picker', pickerModule],
  ['enhancer', enhancerModule],
  ['followup', followupModule],
  ['voice', voiceModule],
  ['snippets', snippetsModule],
]

export const name = 'composer'

export const inject = [...new Set(MODULES.flatMap(([, mod]) => mod.inject ?? []))]

export const Config = Schema.object({
  cost: costModule.Config,
  picker: pickerModule.Config,
  enhancer: enhancerModule.Config,
  followup: followupModule.Config,
  voice: voiceModule.Config,
  snippets: snippetsModule.Config,
})

/**
 * 嵌套默认值兜底：宿主对插件 row config 的解析深度未知——套件层自己跑
 * 一遍每个模块的 Config({}) 拿完整默认，与宿主传入的 slice 合并。
 */
const DEFAULTS = new Map()
for (const [key, mod] of MODULES) {
  try { DEFAULTS.set(key, mod.Config ? mod.Config({}) : {}) } catch { DEFAULTS.set(key, {}) }
}

export function apply(ctx, config) {
  const keys = Object.keys(config ?? {})
  console.info(`[dsh-composer] server apply: host config keys=${keys.length ? keys.join(',') : '(none)'} — merging schema defaults`)
  for (const [key, mod] of MODULES) {
    try {
      mod.apply(ctx, { ...(DEFAULTS.get(key) ?? {}), ...(config?.[key] ?? {}) })
    } catch (error) {
      console.error(`[dsh-composer] server module "${key}" failed:`, error)
    }
  }
}

export default { name, Config, apply }
