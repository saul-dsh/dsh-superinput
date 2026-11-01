/* dsh-superinput 入口：零依赖探针（由 scripts/build-suite.mjs 生成；勿手改）。
 * 静态 import 的失败发生在本文件第一条语句之前（宿主静默），所以核心代码
 * 全部放在 server.js 由这里动态加载——成败都会留下取证记录。 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const DIAG = join(homedir(), '.dsh', 'superinput-debug.log')
const trace = (line) => {
  try {
    mkdirSync(dirname(DIAG), { recursive: true })
    appendFileSync(DIAG, `${new Date().toISOString()} ${line}\n`, 'utf8')
  } catch { /* ignore */ }
}

trace(`suite ENTRY pid=${process.pid}`)

let core
try {
  core = await import('./server.js')
  trace(`server.js LOADED pid=${process.pid}`)
} catch (error) {
  trace(`server.js FAILED: ${String(error?.stack ?? error).slice(0, 600)}`)
  throw error
}

export const name = core.name
export const inject = core.inject
export const Config = core.Config
export function apply(ctx, config) {
  trace(`suite APPLY pid=${process.pid}`)
  return core.apply(ctx, config)
}
export default core.default
