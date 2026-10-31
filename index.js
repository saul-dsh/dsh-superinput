/**
 * dsh-composer — DeepSeek Harness 超级输入框套件
 *
 * 一个插件，六个输入区模块（模块级 try/catch 隔离，单模块失败不拖垮其他）：
 *   cost      费用引擎（状态行 pill / 用量旁弹卡 / 设置页 / 回填 / 价格同步）
 *   picker    模型选择器接管 + 推理强度滑条（原 dsh-power-picker）
 *   enhancer  提示词增强按钮（原 dsh-prompt-enhancer）
 *   followup  回合尾跟进建议（原 dsh-followup）
 *   voice     语音输入（原 dsh-siri-voice）
 *   snippets  片段管理器（新：窗口内复制捕获 / 收藏 / 搜索 / 插入草稿）
 *
 * 模块代码由 scripts/build-suite.mjs 从上游各包机械生成（勿手改 modules/
 * 下 *_生成 文件；改上游后重跑脚本）。dsh-compaction-control 不在套件内：
 * 它是宿主配置补丁层 + /compact 命令桥，保持独立插件。
 *
 * 跨模块协作：
 *   - 调用来源分账仍走 globalThis.__dshPluginCall 5s 窗口（enhancer/followup
 *     写，cost 读）——与分装时同机制，套件内同进程，行为不变。
 *   - 各模块调试日志维持原路径（~/.dsh/cost-debug.log 等），排障习惯不变。
 */

import Schema from '@deepseek-ai/schemastery'
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import * as cost from './modules/cost.js'
import * as picker from './modules/picker.js'
import * as enhancer from './modules/enhancer.js'
import * as followup from './modules/followup.js'
import * as voice from './modules/voice.js'
import * as snippets from './modules/snippets.js'

export const name = 'composer'

/** 决定性取证：顶层 LOAD（宿主是否 import 了本入口）/ APPLY（row 是否 apply）。 */
const DIAG = join(homedir(), '.dsh', 'composer-debug.log')
const trace = (line) => {
  try {
    mkdirSync(dirname(DIAG), { recursive: true })
    appendFileSync(DIAG, `${new Date().toISOString()} ${line}\n`, 'utf8')
  } catch { /* ignore */
  }
}
trace(`suite module LOAD pid=${process.pid}`)

const MODULES = [
  ['cost', cost],
  ['picker', picker],
  ['enhancer', enhancer],
  ['followup', followup],
  ['voice', voice],
  ['snippets', snippets],
]

export const inject = [...new Set(MODULES.flatMap(([, mod]) => mod.inject ?? []))]

export const Config = Schema.object({
  cost: cost.Config,
  picker: picker.Config,
  enhancer: enhancer.Config,
  followup: followup.Config,
  voice: voice.Config,
  snippets: snippets.Config,
})

/**
 * 嵌套默认值兜底：宿主对插件 row config 的解析深度未知（旧插件顶层字段
 * 靠 schema 默认能跑，嵌套后 config.cost 可能是 undefined）——套件层自己
 * 跑一遍每个模块的 Config({}) 拿完整默认，与宿主传入的 slice 合并，
 * 无论宿主行为如何模块都能拿到正确默认值。
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
