/**
 * dsh-superinput 冒烟测试：桩服务逐模块 apply + prompts 端到端
 * （save/use/slash/list/export/import 合并逻辑）。
 *
 * 会临时写真实存储 ~/.dsh/storages/dsh-superinput/prompts.json——
 * 启动时自动备份，结束时（无论成败）恢复原文件；存储不存在则清理测试残留。
 * 用法：node scripts/smoke.mjs（退出码 0 = 全过）
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import mod from '../server.js'

const STORE = join(homedir(), '.dsh', 'storages', 'dsh-superinput', 'prompts.json')
const hadStore = existsSync(STORE)
const backup = hadStore ? readFileSync(STORE) : null

let promptsHandler = null
const webPaths = []
const services = {
  webServer: { register(spec) { webPaths.push(spec.path); if (spec.path.endsWith('/prompts')) promptsHandler = spec.handler } },
  tools: { register() {} },
  llm: {},
  slots: { inject() {}, register() {} },
}
const ctx = {
  effect(fn) { fn() },
  inject(deps, cb) {
    const scope = Object.create(this)
    for (const d of deps) if (!(d in scope)) scope[d] = services[d] ?? {}
    cb(scope)
  },
  on() { return () => {} },
}

const assert = (cond, label) => { if (!cond) throw new Error(label); console.log('ok:', label) }
const call = async (method, sub, body) => {
  const chunks = body === undefined ? [] : [JSON.stringify(body)]
  const req = { url: `/api/dsh-superinput/prompts${sub}`, method, async *[Symbol.asyncIterator]() { for (const c of chunks) yield c } }
  let status = 0
  let out = null
  const res = { setHeader() {}, set statusCode(v) { status = v }, end(b) { out = b ? JSON.parse(b) : null } }
  await promptsHandler(req, res)
  return { status, out }
}
const byLastUsed = (x, y) => (y.usedAt ?? y.at ?? 0) - (x.usedAt ?? x.at ?? 0)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let failed = false
try {
  const config = {}
  for (const key of ['cost', 'picker', 'enhancer', 'followup', 'voice', 'snippets', 'prompts', 'hub']) config[key] = {}
  mod.apply(ctx, config)
  for (const path of ['/api/dsh-cost', '/api/dsh-superinput/prompts', '/api/dsh-superinput/hub']) {
    assert(webPaths.includes(path), `module apply: ${path} registered`)
  }
  assert(!!promptsHandler, 'module apply: prompts handler captured')

  const a = await call('POST', '/save', { title: 'e2e-写周报', body: '写周报，日期 {{日期}}', tags: ['test'] })
  const b = await call('POST', '/save', { title: 'e2e-plain', body: 'plain body' })
  assert(a.out.ok && b.out.ok, 'save two templates')
  const idA = a.out.id
  const idB = b.out.id

  await sleep(5) // 避免 usedAt 与保存 at 同毫秒打平（稳定排序会保留原序）
  assert((await call('POST', '/use', { id: idA })).out.ok, 'use A')
  assert((await call('POST', '/use', { id: idA })).out.ok, 'use A again')
  assert((await call('POST', '/slash', { id: idA, slash: true })).out.ok, 'slash A on')
  assert((await call('POST', '/slash', { id: idB, slash: true })).out.ok, 'slash B on')

  const list1 = (await call('GET', '/list')).out.items
  const itemA = list1.find((i) => i.id === idA)
  assert(itemA.uses === 2 && itemA.usedAt > 0, 'list: A carries uses=2 + usedAt')
  assert(itemA.slash === true && list1.find((i) => i.id === idB).slash === true, 'list: slash flags on')
  assert([...list1].sort(byLastUsed)[0].id === idA, 'client sort: A (recently used) first')

  const dump = (await call('GET', '/export')).out
  assert(dump.version === 1 && dump.items.length >= 2, 'export: version+items')

  const modA = { ...dump.items.find((i) => i.id === idA), title: 'e2e-写周报-v2', at: Date.now() + 10 }
  const c = await call('POST', '/save', { title: 'e2e-temp-c', body: 'ccc' })
  const delC = c.out.id
  await call('POST', '/remove', { id: delC })
  const importedC = { id: delC, title: 'e2e-C-imported', body: 'ccc', tags: [], at: Date.now(), pinned: false }
  const stale = { ...dump.items.find((i) => i.id === idB), body: 'stale-overwrite-should-skip', at: 1 }
  const imp = await call('POST', '/import', { items: [modA, importedC, stale, { body: '' }] })
  assert(imp.out.ok && imp.out.updated === 1 && imp.out.added === 1, `import: added=${imp.out.added} updated=${imp.out.updated}`)
  const list2 = (await call('GET', '/list')).out.items
  assert(list2.find((i) => i.id === idA).title === 'e2e-写周报-v2', 'import: newer A overwrote')
  assert(list2.find((i) => i.id === delC).title === 'e2e-C-imported', 'import: deleted C back with original id')
  assert(list2.find((i) => i.id === idB).body !== 'stale-overwrite-should-skip', 'import: stale skipped')
  assert((await call('POST', '/import', { items: 'not-an-array' })).status === 400, 'import: invalid payload rejected')

  console.log('SMOKE ALL PASS')
} catch (error) {
  failed = true
  console.log('SMOKE FAIL:', error?.message ?? error)
} finally {
  try {
    if (backup) writeFileSync(STORE, backup)
    else unlinkSync(STORE)
  } catch { /* 恢复失败只能报出来 */ }
  if (!backup) console.log('(no prior store: test artifacts removed)')
}
process.exit(failed ? 1 : 0)
