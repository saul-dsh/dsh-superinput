#!/usr/bin/env node
/**
 * dsh-superinput 套件生成器：从五个独立插件机械搬迁模块代码。
 *
 * 服务端：**单文件内联**——宿主 interception loader 对 link 包内部的相对
 * 导入没有先例（五个旧插件都是自包含单文件；套件首版因相对导入静默不被
 * import）。六个模块各包进 IIFE（作用域隔离顶层 const），import 提升到
 * 顶部去重，modules/*.js 仅作生成中间产物保留可读源。
 * 客户端：client.js 单文件闭包（宿主不拆模块），各包 __ModuleLoader__
 * 头尾改写为 `function createX(require)` 工厂按序拼入，套件 factory 里
 * 逐模块 try/catch（一个模块失败不拖垮其他）。
 *
 * 上游插件更新后重跑本脚本即可再生成；重复执行幂等。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url))) // packages/dsh-superinput
const pkgRoot = join(root, '..')

/** key → [包目录, 客户端工厂名] */
const MODULES = [
  ['cost', 'dsh-cost', 'createCostClient'],
  ['picker', 'dsh-power-picker', 'createPickerClient'],
  ['enhancer', 'dsh-prompt-enhancer', 'createEnhancerClient'],
  ['followup', 'dsh-followup', 'createFollowupClient'],
  ['voice', 'dsh-siri-voice', 'createVoiceClient'],
  // 0.10.0 起并入套件（此前独立插件）；apply 顺序在 enhancer 之后——
  // pre-step 瀑布里压缩落档消息在增强之后追加，不会被二次改写。
  ['compaction', 'dsh-compaction-control', 'createCompactionClient'],
]

function transformServer(pkg, key) {
  let src = readFileSync(join(pkgRoot, pkg, 'index.js'), 'utf8')
  const head = `/* 由 scripts/build-suite.mjs 从 ${pkg}/index.js 机械生成；勿手改，重跑脚本再生成。 */\n`
  src = src.replace(/^export const name = /m, 'const name = ')
  src = src.replace(/^export default \{[^\n]*\}\s*$/m, '')
  if (/^const inject = /m.test(src)) src += '\nexport { inject }\n'
  if (!/export const Config/.test(src)) {
    src += "import Schema from '@deepseek-ai/schemastery'\nexport const Config = Schema.object({ enabled: Schema.boolean().default(true).description('启用') })\n"
  }
  return head + src
}

function transformClient(pkg, factoryName) {
  let src = readFileSync(join(pkgRoot, pkg, 'client.js'), 'utf8').trimEnd()
  // 不锚定行首：各包文件头都有注释块。
  const headRe = /window\.__ModuleLoader__\.load\(\{\s*\n\s*id:\s*'[^']+',\s*\n\s*factory\(require\) \{/
  if (!headRe.test(src)) throw new Error(`${pkg}/client.js head pattern mismatch`)
  src = src.replace(headRe, `function ${factoryName}(require) {`)
  const tailRe = /\n  \},\n\}\)\s*$/
  if (!tailRe.test(src)) throw new Error(`${pkg}/client.js tail pattern mismatch`)
  src = src.replace(tailRe, '\n}')
  return `/* 由 scripts/build-suite.mjs 从 ${pkg}/client.js 机械生成；勿手改。 */\n${src}\n`
}

/* ---- 服务端：单文件内联 ---- */

/** 抽顶层 import（单行）、去 export 关键字，返回 { imports, body }。 */
function inlineSource(src) {
  const imports = []
  let body = src.replace(/^import [^\n]+$/gm, (line) => { imports.push(line.trim()); return '' })
  body = body
    .replace(/^export const name = /m, 'const name = ')
    .replace(/^export const inject = /m, 'const moduleInject = ')
    .replace(/^export const Config/m, 'const Config')
    .replace(/^export function apply\(/m, 'function apply(')
    .replace(/^export \{ inject \}\s*$/m, '')
    .replace(/^export default \{[^\n]*\}\s*$/m, '')
    // compaction-control 尾部的离线自测导出（CI import 用，运行时无用）
    .replace(/^export const __internals/m, 'const __internals')
  return { imports, body: body.trim() }
}

/** 按 source 分组合并 import 绑定符（整行去重不够：不同行的子集会重复声明）。 */
function mergeImports(importLines) {
  const bySource = new Map() // source → { defaults:Set, names:Set }
  for (const line of importLines) {
    const m = line.match(/^import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/)
    if (!m) throw new Error(`unparsed import: ${line}`)
    const [, defaults, named, source] = m
    const entry = bySource.get(source) ?? { defaults: new Set(), names: new Set() }
    if (defaults) entry.defaults.add(defaults)
    if (named) for (const part of named.split(',')) {
      const name = part.trim()
      if (name) entry.names.add(name)
    }
    bySource.set(source, entry)
  }
  const lines = []
  for (const [source, { defaults, names }] of bySource) {
    const parts = []
    if (defaults.size > 0) parts.push([...defaults][0])
    if (names.size > 0) parts.push(`{ ${[...names].join(', ')} }`)
    lines.push(`import ${parts.join(', ')} from '${source}'`)
  }
  return lines.sort()
}

mkdirSync(join(root, 'modules'), { recursive: true })
const importLines = []
const iifes = []
for (const [key, pkg] of MODULES) {
  const transformed = transformServer(pkg, key)
  writeFileSync(join(root, 'modules', `${key}.js`), transformed) // 可读中间产物
  const { imports, body } = inlineSource(transformed)
  importLines.push(...imports.filter((line) => !line.includes("@deepseek-ai/schemastery")))
  iifes.push(`/* ==== module: ${key}（原 ${pkg}） ==== */\nconst ${key}Module = (() => {\n${body}\n  return { apply, Config, inject: typeof moduleInject === 'undefined' ? undefined : moduleInject }\n})()`)
  console.log(`✓ inline ${key}`)
}
// prompts（手写模块源）同样内联。
{
  const src = readFileSync(join(root, 'modules', 'prompts.js'), 'utf8')
  const { imports, body } = inlineSource(src)
  importLines.push(...imports)
  iifes.push(`/* ==== module: prompts（手写） ==== */\nconst promptsModule = (() => {\n${body}\n  return { apply, Config, inject: typeof moduleInject === 'undefined' ? undefined : moduleInject }\n})()`)
  console.log('✓ inline prompts')
}
// hub（手写模块源）同样内联。
{
  const src = readFileSync(join(root, 'modules', 'hub.js'), 'utf8')
  const { imports, body } = inlineSource(src)
  importLines.push(...imports)
  iifes.push(`/* ==== module: hub（手写） ==== */\nconst hubModule = (() => {\n${body}\n  return { apply, Config, inject: typeof moduleInject === 'undefined' ? undefined : moduleInject }\n})()`)
  console.log('✓ inline hub')
}
const allImports = mergeImports(importLines)
// schemastery 由 glue 使用，保证在列。
if (!allImports.some((line) => line.includes('@deepseek-ai/schemastery'))) {
  allImports.unshift("import Schema from '@deepseek-ai/schemastery'")
}

const server = `/* dsh-superinput 服务端核心（由 scripts/build-suite.mjs 生成；勿手改）。
 * 入口拆分：index.js 是零依赖探针（先 trace 再动态 import 本文件并捕获失败）——
 * 顶层静态 import 的失败发生在入口任何语句之前，静默且永远取不到证据。 */
import { appendFileSync as diagAppend, mkdirSync as diagMkdir } from 'node:fs'
import { homedir as diagHomedir } from 'node:os'
import { dirname as diagDirname, join as pathJoin } from 'node:path'
${allImports.join('\n')}

const SUITE_DIAG = pathJoin(diagHomedir(), '.dsh', 'superinput-debug.log')
const trace = (line) => {
  try {
    diagMkdir(diagDirname(SUITE_DIAG), { recursive: true })
    diagAppend(SUITE_DIAG, \`\${new Date().toISOString()} \${line}\\n\`, 'utf8')
  } catch { /* ignore */ }
}

${iifes.join('\n\n')}

const MODULES = [
  ['cost', costModule],
  ['picker', pickerModule],
  ['enhancer', enhancerModule],
  ['followup', followupModule],
  ['voice', voiceModule],
  ['prompts', promptsModule],
  ['compaction', compactionModule],
  ['hub', hubModule],
]

export const name = 'superinput'

export const inject = [...new Set(MODULES.flatMap(([, mod]) => mod.inject ?? []))]

export const Config = Schema.object({
  cost: costModule.Config,
  picker: pickerModule.Config,
  enhancer: enhancerModule.Config,
  followup: followupModule.Config,
  voice: voiceModule.Config,
  prompts: promptsModule.Config,
  compaction: compactionModule.Config,
  hub: hubModule.Config,
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
  console.info(\`[dsh-superinput] server apply: host config keys=\${keys.length ? keys.join(',') : '(none)'} — merging schema defaults\`)
  // 先算出每个模块的最终生效配置，hub 用它做总览（自己拿不到别人的 config）。
  const merged = {}
  for (const [key] of MODULES) {
    merged[key] = { ...(DEFAULTS.get(key) ?? {}), ...(config?.[key] ?? {}) }
  }
  for (const [key, mod] of MODULES) {
    try {
      const own = merged[key]
      mod.apply(ctx, key === 'hub' ? { ...own, snapshot: merged } : own)
      trace(\`module "\${key}" applied OK\`)
    } catch (error) {
      console.error(\`[dsh-superinput] server module "\${key}" failed:\`, error)
      trace(\`module "\${key}" FAILED: \${String(error?.stack ?? error).slice(0, 600)}\`)
    }
  }
}

export default { name, Config, apply }
`

const entry = `/* dsh-superinput 入口：零依赖探针（由 scripts/build-suite.mjs 生成；勿手改）。
 * 静态 import 的失败发生在本文件第一条语句之前（宿主静默），所以核心代码
 * 全部放在 server.js 由这里动态加载——成败都会留下取证记录。 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const DIAG = join(homedir(), '.dsh', 'superinput-debug.log')
const trace = (line) => {
  try {
    mkdirSync(dirname(DIAG), { recursive: true })
    appendFileSync(DIAG, \`\${new Date().toISOString()} \${line}\\n\`, 'utf8')
  } catch { /* ignore */ }
}

trace(\`suite ENTRY pid=\${process.pid}\`)

let core
try {
  core = await import('./server.js')
  trace(\`server.js LOADED pid=\${process.pid}\`)
} catch (error) {
  trace(\`server.js FAILED: \${String(error?.stack ?? error).slice(0, 600)}\`)
  throw error
}

export const name = core.name
export const inject = core.inject
export const Config = core.Config
export function apply(ctx, config) {
  trace(\`suite APPLY pid=\${process.pid}\`)
  return core.apply(ctx, config)
}
export default core.default
`
writeFileSync(join(root, 'server.js'), server)
writeFileSync(join(root, 'index.js'), entry)
console.log(`✓ index.js 零依赖探针入口（${entry.length} bytes）+ server.js 核心（${server.length} bytes）`)

/* ---- 客户端：六工厂内联 + glue ---- */
const clientFiles = []
for (const [key, pkg, factory] of MODULES) {
  clientFiles.push(transformClient(pkg, factory))
  console.log(`✓ client ${factory}`)
}
clientFiles.push(readFileSync(join(root, 'modules', 'prompts.client.js'), 'utf8'))
clientFiles.push(readFileSync(join(root, 'modules', 'hub.client.js'), 'utf8'))

const glue = `/* dsh-superinput 客户端：单 __ModuleLoader__ 入口，内部逐模块装配。
 * 本文件由 scripts/build-suite.mjs 生成（模块工厂内联 + 下方 glue）；勿手改模块工厂。 */

${clientFiles.join('\n')}

window.__ModuleLoader__.load({
  id: 'dsh-superinput',
  factory(require) {
    const defs = [
      ['cost', createCostClient],
      ['picker', createPickerClient],
      ['enhancer', createEnhancerClient],
      ['followup', createFollowupClient],
      ['voice', createVoiceClient],
      ['prompts', createPromptsClient],
      ['compaction', createCompactionClient],
      ['hub', createHubClient],
    ]
    // 模块异常上报：console 不落盘，失败必须走 prompts /diag 留痕。
    const reportModuleError = (key, when, error) => {
      console.error(\`[dsh-superinput] client module "\${key}" \${when}:\`, error)
      try {
        void fetch('/api/dsh-superinput/prompts/diag', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: \`client module "\${key}" \${when}: \${String(error?.stack ?? error).slice(0, 400)}\` }),
        }).catch(() => {})
      } catch { /* ignore */ }
    }
    const modules = []
    for (const [key, create] of defs) {
      try { modules.push([key, create(require)]) }
      catch (error) { reportModuleError(key, 'factory failed', error) }
    }
    console.info('[dsh-superinput] client active:', modules.map(([key]) => key).join('+'))
    return {
      // 各模块 client 的 inject 并集：picker 需要 sessions/remote/modelDirectories
      // 等，只声明 slots 会让它在 apply 时报 cannot get property without inject。
      inject: [...new Set(modules.flatMap(([, mod]) => mod.inject ?? ['slots']))],
      apply(ctx) {
        for (const [key, mod] of modules) {
          try { mod.apply(ctx) }
          catch (error) { reportModuleError(key, 'apply failed', error) }
        }
      },
    }
  },
})
`
// Electron 渲染器禁用 API 门禁：window.prompt/alert/confirm 在 Electron 直接
// 抛错（2026-11-01 真机事故：prompts 模板一点就消失）。构建期拦截。
const forbiddenHits = []
for (const [re, why] of [
  [/window\.prompt\s*\(/, 'window.prompt（Electron 不支持，改用面板内表单）'],
  [/window\.alert\s*\(/, 'window.alert（Electron 不支持，改用面板内提示）'],
  [/window\.confirm\s*\(/, 'window.confirm（Electron 不支持，改用面板内按钮）'],
]) {
  if (re.test(glue)) forbiddenHits.push(why)
}
if (forbiddenHits.length) {
  console.error('✗ client.js 含 Electron 渲染器禁用 API:\n  ' + forbiddenHits.join('\n  '))
  process.exit(1)
}
writeFileSync(join(root, 'client.js'), glue)
const clientModuleCount = (glue.match(/\['\w+', create\w+\]/g) ?? []).length
console.log(`✓ client.js (${glue.length} bytes, ${clientModuleCount} modules)`)
