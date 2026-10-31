#!/usr/bin/env node
/**
 * dsh-composer 套件生成器：从五个独立插件机械搬迁模块代码。
 *
 * 服务端（modules/<key>.js）：index.js 原样搬入，仅去 name/inject 的
 * export（套件聚合）与末尾 export default；apply/Config 保持 export。
 * 客户端（client.js 单文件闭包，宿主不拆模块）：各包 client.js 的
 * __ModuleLoader__.load({id, factory}) 头尾改写为 `function createX(require)`
 * 工厂函数，与手写的 snippets 模块一起按序拼进套件 client.js，
 * 套件 factory 里逐模块 try/catch 调用（一个模块失败不拖垮其他）。
 *
 * 上游插件更新后重跑本脚本即可再生成；重复执行是幂等的。
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
  // 去导出：name/inject 降为模块内常量（套件聚合），default 行删除。
  src = src.replace(/^export const name = /m, 'const name = ')
  src = src.replace(/^export const inject = /m, 'const inject = ')
  src = src.replace(/^export default \{[^\n]*\}\s*$/m, '')
  // 套件要读 mod.inject 聚合 peer 注入——模块内声明过 inject 就补回导出。
  if (/^const inject = /m.test(src)) src += '\nexport { inject }\n'
  // 客户端-only 模块（如 voice）没有 Config：补一个空 schema，避免套件
  // Config 里出现 undefined 子模式。
  if (!/export const Config/.test(src)) {
    src += "import Schema from '@deepseek-ai/schemastery'\nexport const Config = Schema.object({ enabled: Schema.boolean().default(true).description('启用') })\n"
  }
  return head + src
}

function transformClient(pkg, factoryName) {
  let src = readFileSync(join(pkgRoot, pkg, 'client.js'), 'utf8').trimEnd()
  // 头：window.__ModuleLoader__.load({ id: '…', factory(require) { → function factoryName(require) {
  // （不锚定行首：各包文件头都有注释块。）
  const headRe = /window\.__ModuleLoader__\.load\(\{\s*\n\s*id:\s*'[^']+',\s*\n\s*factory\(require\) \{/
  if (!headRe.test(src)) throw new Error(`${pkg}/client.js head pattern mismatch`)
  src = src.replace(headRe, `function ${factoryName}(require) {`)
  // 尾：最后的 "  },\n})" 是 factory 闭合 + load 调用闭合 → 只留 factory 的 "}"。
  const tailRe = /\n  \},\n\}\)\s*$/
  if (!tailRe.test(src)) throw new Error(`${pkg}/client.js tail pattern mismatch`)
  src = src.replace(tailRe, '\n}')
  return `/* 由 scripts/build-suite.mjs 从 ${pkg}/client.js 机械生成；勿手改。 */\n${src}\n`
}

const serverFiles = [], clientFiles = []
for (const [key, pkg, factory] of MODULES) {
  writeFileSync(join(root, 'modules', `${key}.js`), transformServer(pkg, key))
  clientFiles.push(transformClient(pkg, factory))
  console.log(`✓ modules/${key}.js + ${factory}`)
}

// 片段管理器（手写模块）客户端工厂原样拼入。
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
