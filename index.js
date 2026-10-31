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
import * as cost from './modules/cost.js'
import * as picker from './modules/picker.js'
import * as enhancer from './modules/enhancer.js'
import * as followup from './modules/followup.js'
import * as voice from './modules/voice.js'
import * as snippets from './modules/snippets.js'

export const name = 'composer'

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

export function apply(ctx, config) {
  for (const [key, mod] of MODULES) {
    try {
      mod.apply(ctx, config?.[key] ?? {})
    } catch (error) {
      console.error(`[dsh-composer] server module "${key}" failed:`, error)
    }
  }
}

export default { name, Config, apply }
