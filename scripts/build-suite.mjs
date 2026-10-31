#!/usr/bin/env node
/**
 * dsh-composer 套件生成器：从五个独立插件机械搬迁模块代码。
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

const root = dirname(dirname(fileURLToPath(import.meta.url))) // packages/dsh-composer
const pkgRoot = join(root, '..')

/** key → [包目录, 客户端工厂名] */
const MODULES = [
  ['cost', 'dsh-cost', 'createCostClient'],
  ['picker', 'dsh-power-picker', 'createPickerClient'],
  ['enhancer', 'dsh-prompt-enhancer', 'createEnhancerClient'],
  ['followup', 'dsh-followup', 'createFollowupClient'],
  ['voice', 'dsh-siri-voice', 'createVoiceClient'],
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
// snippets（手写模块源）同样内联。
{
  const src = readFileSync(join(root, 'modules', 'snippets.js'), 'utf8')
  const { imports, body } = inlineSource(src)
  importLines.push(...imports)
  iifes.push(`/* ==== module: snippets（手写） ==== */\nconst snippetsModule = (() => {\n${body}\n  return { apply, Config, inject: typeof moduleInject === 'undefined' ? undefined : moduleInject }\n})()`)
  console.log('✓ inline snippets')
}
const allImports = mergeImports(importLines)
// schemastery 由 glue 使用，保证在列。
if (!allImports.some((line) => line.includes('@deepseek-ai/schemastery'))) {
  allImports.unshift("import Schema from '@deepseek-ai/schemastery'")
}

const server = `/* dsh-composer 服务端：由 scripts/build-suite.mjs 生成（六模块 IIFE 内联，无相对导入）；勿手改。 */
${allImports.join('\n')}

/** 决定性取证：顶层 LOAD（宿主是否 import 了本入口）/ APPLY（row 是否 apply）。 */
const DIAG = join(homedir(), '.dsh', 'composer-debug.log')
const trace = (line) => {
  try {
    mkdirSync(dirname(DIAG), { recursive: true })
    appendFileSync(DIAG, \`\${new Date().toISOString()} \${line}\\n\`, 'utf8')
  } catch { /* ignore */ }
}
trace(\`suite module LOAD pid=\${process.pid}\`)

${iifes.join('\n\n')}

export const name = 'composer'

const MODULES = [
  ['cost', costModule],
  ['picker', pickerModule],
  ['enhancer', enhancerModule],
  ['followup', followupModule],
  ['voice', voiceModule],
  ['snippets', snippetsModule],
]

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
  trace(\`suite APPLY pid=\${process.pid} hostConfigKeys=\${keys.length ? keys.join(',') : '(none)'}\`)
  console.info(\`[dsh-composer] server apply: host config keys=\${keys.length ? keys.join(',') : '(none)'} — merging schema defaults\`)
  for (const [key, mod] of MODULES) {
    try {
      mod.apply(ctx, { ...(DEFAULTS.get(key) ?? {}), ...(config?.[key] ?? {}) })
    } catch (error) {
      console.error(\`[dsh-composer] server module "\${key}" failed:\`, error)
      trace(\`module \${key} FAILED: \${String(error?.stack ?? error).slice(0, 300)}\`)
    }
  }
}

export default { name, Config, apply }
`
writeFileSync(join(root, 'index.js'), server)
console.log(`✓ index.js 单文件内联（${server.length} bytes，无相对导入）`)

/* ---- 客户端：六工厂内联 + glue ---- */
const clientFiles = []
for (const [key, pkg, factory] of MODULES) {
  clientFiles.push(transformClient(pkg, factory))
  console.log(`✓ client ${factory}`)
}
clientFiles.push(readFileSync(join(root, 'modules', 'snippets.client.js'), 'utf8'))

const glue = `/* dsh-composer 客户端：单 __ModuleLoader__ 入口，内部逐模块装配。
 * 本文件由 scripts/build-suite.mjs 生成（模块工厂内联 + 下方 glue）；勿手改模块工厂。 */

${clientFiles.join('\n')}

window.__ModuleLoader__.load({
  id: 'dsh-composer',
  factory(require) {
    const defs = [
      ['cost', createCostClient],
      ['picker', createPickerClient],
      ['enhancer', createEnhancerClient],
      ['followup', createFollowupClient],
      ['voice', createVoiceClient],
      ['snippets', createSnippetsClient],
    ]
    const modules = []
    for (const [key, create] of defs) {
      try { modules.push([key, create(require)]) }
      catch (error) { console.error(\`[dsh-composer] client module "\${key}" failed:\`, error) }
    }
    console.info('[dsh-composer] client active:', modules.map(([key]) => key).join('+'))
    return {
      inject: ['slots'],
      apply(ctx) {
        for (const [key, mod] of modules) {
          try { mod.apply(ctx) }
          catch (error) { console.error(\`[dsh-composer] client module "\${key}" apply failed:\`, error) }
        }
      },
    }
  },
})
`
writeFileSync(join(root, 'client.js'), glue)
console.log(`✓ client.js (${glue.length} bytes, 6 modules)`)
