/* dsh-superinput 服务端核心（由 scripts/build-suite.mjs 生成；勿手改）。
 * 入口拆分：index.js 是零依赖探针（先 trace 再动态 import 本文件并捕获失败）——
 * 顶层静态 import 的失败发生在入口任何语句之前，静默且永远取不到证据。 */
import { appendFileSync as diagAppend, mkdirSync as diagMkdir } from 'node:fs'
import { homedir as diagHomedir } from 'node:os'
import { dirname as diagDirname, join as pathJoin } from 'node:path'
import Schema from '@deepseek-ai/schemastery'
import { AsyncLocalStorage } from 'node:async_hooks'
import { appendFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, utimesSync, writeSync, writeFileSync, appendFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

const SUITE_DIAG = pathJoin(diagHomedir(), '.dsh', 'superinput-debug.log')
const trace = (line) => {
  try {
    diagMkdir(diagDirname(SUITE_DIAG), { recursive: true })
    diagAppend(SUITE_DIAG, `${new Date().toISOString()} ${line}\n`, 'utf8')
  } catch { /* ignore */ }
}

/* ==== module: cost（原 dsh-cost） ==== */
const costModule = (() => {
/* 由 scripts/build-suite.mjs 从 dsh-cost/index.js 机械生成；勿手改，重跑脚本再生成。 */
/**
 * dsh-cost — DeepSeek Harness (dsh) 会话费用统计插件
 *
 * 借鉴 Han-1413141/dsh-cost-meter（v1.9.39）的核心数据模式，MVP 落地：
 *   - 主通道 ctx.on('llm/stream', listener, { global: true })：llm 服务官方
 *     瀑布事件，链尾旁路观察逐 chunk 透传，捕获 usage 块（五桶
 *     input/output/cacheRead/cacheWrite/reasoning，宿主的 input 与
 *     cacheRead/cacheWrite 是互斥桶），流结束后按 DeepSeek 官方价格入账。
 *   - 计费数学与峰谷规则照抄 cost-meter lib/pricing.js：现行价（2026-09-10
 *     北京时间中午后）flash 谷 $0.003/$0.15/$0.60、pro 谷 $0.022/$0.66/$1.98，
 *     峰时 ×2；峰窗 UTC [01,04)∪[06,10)（北京 09-12 / 14-18 点），北京周六
 *     日与法定节假日全天谷价；历史流量按当时档位（rateHistory / legacyBase）。
 *   - 账本 ~/.dsh/storages/dsh-cost/ledger.json：按日聚合（总/按模型/按会话），
 *     金额恒为美元存储（与展示币种解耦，cost-meter 同款），临时文件原子
 *     重命名 + 防抖写盘。
 *   - HTTP 端点 GET /api/dsh-cost/state|prices 供客户端渲染。
 *   - 异步局部存储（ALS）深度标记防包装路由插件嵌套重复入账（cost-meter
 *     同款；本插件自己从不发起 llm 调用）。
 *
 * 已核对的 dsh API（对照 dsh-reference 与 cost-meter 源码）：
 *   - ctx.on('llm/stream', (options, next) => AsyncIterable, { global: true })
 *     监听器契约：必须调用 next() 推进瀑布并返回（包装的）流；嵌套时原样
 *     返回 next() 的下游
 *   - GenerateOptions：{ sessionId?, model, provider, messages, ... }
 *   - StreamChunk：{ type:'usage', usage:{inputTokens,outputTokens,
 *     cacheReadTokens,cacheWriteTokens,reasoningTokens} }（usage 位于 finish 前）
 *   - webServer.register({ kind:'prefix', path, handler }, label)
 */








const name = 'cost'

const DIAG_LOG = join(homedir(), '.dsh', 'cost-debug.log')
const STORE_DIR = join(homedir(), '.dsh', 'storages', 'dsh-cost')
const LEDGER_PATH = join(STORE_DIR, 'ledger.json')
const JOURNAL_PATH = join(STORE_DIR, 'journal.jsonl')

const report = async (line) => {
  try {
    await mkdir(dirname(DIAG_LOG), { recursive: true })
    await appendFile(DIAG_LOG, `${new Date().toISOString()} ${line}\n`, 'utf8')
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* 价格表（USD / 1M tokens；照抄 cost-meter lib/pricing.js 现行档）      */
/* ------------------------------------------------------------------ */

/** 峰谷时代分界（2026-08-16 16:00 UTC）：此前按历史基础价，无峰谷概念。 */
const LEGACY_BASE_BOUNDARY = Date.parse('2026-08-16T16:00:00Z')
/** Flash 调价边界（2026-09-10 北京时间中午 12:00 = UTC 04:00）；Pro 未调价。 */
const FLASH_PRICE_EFFECTIVE_AT = Date.parse('2026-09-10T04:00:00Z')
/** 周末全天谷价生效时刻（2026-08-23 北京时间零点）。 */
const WEEKEND_OFFPEAK_EFFECTIVE_AT = Date.parse('2026-08-22T16:00:00Z')

/** 峰时段窗口（UTC 小时，半开区间 [start,end)）= 北京 09-12 / 14-18 点。 */
const PEAK_WINDOWS = [{ start: 1, end: 4 }, { start: 6, end: 10 }]
/** 国务院办公厅 2026 年安排中峰谷规则生效后的剩余公众假期（北京日历日）。 */
const PEAK_HOLIDAYS = new Set([
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  '2026-10-05', '2026-10-06', '2026-10-07',
])

const double = (tier) => Object.fromEntries(Object.entries(tier).map(([key, value]) => [key, value * 2]))

/** 档位形状：{ legacyBase, august, offPeak, peak }（后三者带峰谷两档）。 */
const deepseekFlash = {
  legacyBase: { cacheHit: 0.0028, cacheMiss: 0.14, output: 0.28 },
  august: { cacheHit: 0.007, cacheMiss: 0.22, output: 0.66, peak: double({ cacheHit: 0.007, cacheMiss: 0.22, output: 0.66 }) },
  offPeak: { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 },
  peak: double({ cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 }),
}
const deepseekPro = {
  legacyBase: { cacheHit: 0.003625, cacheMiss: 0.435, output: 0.87 },
  august: { cacheHit: 0.022, cacheMiss: 0.66, output: 1.98, peak: double({ cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 }) },
  offPeak: { cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 },
  peak: double({ cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 }),
}
/** 已下架旧模型的唯一历史价（只可能出现在峰谷时代之前）。 */
const legacyOnlyModels = {
  deepseekchat: { legacyBase: { cacheHit: 0.07, cacheMiss: 0.27, output: 1.1 } },
  deepseekreasoner: { legacyBase: { cacheHit: 0.14, cacheMiss: 0.55, output: 2.19 } },
}

const normalizeModelId = (value) => String(value ?? '').toLowerCase().replace(/[._\-\s]/g, '')

function isPeakAt(atMs) {
  // 北京日界 = UTC+8；1970-01-01 为周四（weekday 4）。
  const day = Math.floor((atMs + 8 * 3600000) / 86400000)
  const weekday = (day + 4) % 7
  if (atMs >= WEEKEND_OFFPEAK_EFFECTIVE_AT && (weekday === 6 || weekday === 0)) return false
  const key = new Date(day * 86400000).toISOString().slice(0, 10)
  if (atMs >= WEEKEND_OFFPEAK_EFFECTIVE_AT && PEAK_HOLIDAYS.has(key)) return false
  const hour = new Date(atMs).getUTCHours()
  return PEAK_WINDOWS.some(({ start, end }) => hour >= start && hour < end)
}

/** 选档：历史时刻回落历史价（rateHistory 语义的简化实现）。 */
function tierFor(entry, atMs, peak) {
  if (entry.legacyBase && atMs < LEGACY_BASE_BOUNDARY) return entry.legacyBase
  if (entry.august && atMs < FLASH_PRICE_EFFECTIVE_AT) return entry.august
  return (peak && entry.peak) || entry.offPeak || entry.peak || entry.august || entry.legacyBase || { cacheHit: 0, cacheMiss: 0, output: 0 }
}

/**
 * 单次调用成本（USD）。数学照抄 cost-meter costOf：五桶互斥，
 * cacheWrite 缺价按 cacheHit，reasoning 缺价按 0（DeepSeek 推理并入输出）。
 */
function costOfBuckets(buckets, tier) {
  const amount = (value) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0 }
  const cost = (amount(buckets.input) * tier.cacheMiss
    + amount(buckets.output) * tier.output
    + amount(buckets.cacheRead) * tier.cacheHit
    + amount(buckets.cacheWrite) * (tier.cacheWrite ?? tier.cacheHit)
    + amount(buckets.reasoning) * (typeof tier.reasoning === 'number' ? tier.reasoning : 0)) / 1_000_000
  return Number.isFinite(cost) && cost > 0 ? cost : 0
}

/* ------------------------------------------------------------------ */
/* 用量指纹去重（cost-meter issue #70/#76 同款兜底）                     */
/* ------------------------------------------------------------------ */

/** 桶名 → 价格键（costOfBuckets 同款映射；cacheWrite 缺价按 cacheHit）。 */
const BUCKET_PRICE_KEYS = { input: 'cacheMiss', output: 'output', cacheRead: 'cacheHit', cacheWrite: 'cacheWrite', reasoning: 'reasoning' }

/** 一次调用的分桶计价行（cost-meter costFromSamples 同形状），供回合明细。 */
function bucketRows(buckets, tier) {
  const rows = []
  for (const [bucket, priceKey] of Object.entries(BUCKET_PRICE_KEYS)) {
    const tokens = Number(buckets[bucket]) > 0 ? Number(buckets[bucket]) : 0
    if (!tokens) continue
    const rate = Number(tier[priceKey] ?? (priceKey === 'cacheWrite' ? tier.cacheHit : 0))
    rows.push({ bucket, tokens, rate, cost: tokens * rate / 1_000_000 })
  }
  return rows
}

/**
 * (model, 五桶指纹) 10s 窗互斥：包装路由插件在 ALS 标记逃逸的异步上下文里
 * 发起上游调用时，同一请求的两份 usage 都会到达这里——五桶逐位相同即判重，
 * 无论到达顺序只记第一次。正常独立调用五桶逐位相同的概率可忽略。
 */
function createUsageDeduper(windowMs = 10_000) {
  const seen = new Map()
  return (model, buckets, atMs) => {
    const fingerprint = `${normalizeModelId(model)}|${buckets.input}|${buckets.output}|${buckets.cacheRead}|${buckets.cacheWrite}|${buckets.reasoning}`
    const last = seen.get(fingerprint)
    if (last !== undefined && atMs - last < windowMs) return false
    seen.set(fingerprint, atMs)
    if (seen.size > 512) {
      const cutoff = atMs - windowMs
      for (const [key, seenAt] of seen) if (seenAt < cutoff) seen.delete(key)
    }
    return true
  }
}

/* ------------------------------------------------------------------ */
/* 调用明细 journal（JSONL 追加；rotate 保留最近 3 卷）                  */
/* ------------------------------------------------------------------ */

const JOURNAL_MAX_BYTES = 8 * 1024 * 1024
const JOURNAL_KEEP = 3

function createJournal() {
  let lines = 0
  return {
    /** 明细纯记录，写失败绝不影响聚合账本。 */
    async write(record) {
      try {
        lines += 1
        if (lines % 500 === 0) {
          const info = await stat(JOURNAL_PATH).catch(() => null)
          if (info && info.size > JOURNAL_MAX_BYTES) {
            await rename(JOURNAL_PATH, join(STORE_DIR, `journal-${Date.now()}.jsonl`)).catch(() => {})
            try {
              const entries = await readdir(STORE_DIR)
              const archives = entries.filter((name) => /^journal-\d+\.jsonl$/.test(name)).sort()
              while (archives.length > JOURNAL_KEEP) {
                await unlink(join(STORE_DIR, archives.shift())).catch(() => {})
              }
            } catch { /* ignore */ }
          }
        }
        await appendFile(JOURNAL_PATH, `${JSON.stringify(record)}\n`, 'utf8')
      } catch { /* ignore */ }
    },
    /** 读当前卷的倒序明细（归档卷不参与，最近 UI 只看当下）。 */
    async recent({ sessionId = '', day = '', limit = 20 } = {}) {
      let text = ''
      try { text = await readFile(JOURNAL_PATH, 'utf8') } catch { return [] }
      const rows = []
      for (const line of text.split('\n')) {
        if (!line) continue
        try {
          const row = JSON.parse(line)
          if (sessionId && row.session !== sessionId) continue
          if (day && row.day !== day) continue
          rows.push(row)
        } catch { /* 半行跳过 */ }
      }
      rows.reverse()
      return rows.slice(0, Math.min(200, Math.max(1, limit)))
    },
    /**
     * 增量读取：从字节偏移起新增的完整行（字节级，避免多字节字符错位；
     * 轮转后新文件比偏移小 → 从头读新卷，天然不会重放旧卷）。
     * 供锁持有者把 journal 折叠进 ledger（跨进程单写者模型）。
     */
    async recordsAfter(offset = 0) {
      try {
        const info = await stat(JOURNAL_PATH)
        if (info.size === offset) return { rows: [], offset }
        if (info.size < offset) offset = 0
        const buf = await readFile(JOURNAL_PATH)
        let start = offset
        if (offset > 0) {
          // 偏移已在行边界（前一字节是换行）则直接用；落在行中间才跳到下一行。
          if (buf[offset - 1] !== 10) {
            const nl = buf.indexOf(10, offset)
            if (nl < 0) return { rows: [], offset: buf.length }
            start = nl + 1
          }
        }
        const rows = []
        for (const line of buf.slice(start).toString('utf8').split('\n')) {
          if (!line) continue
          try { rows.push(JSON.parse(line)) } catch { /* 半行跳过 */ }
        }
        return { rows, offset: buf.length }
      } catch { return { rows: [], offset } }
    },

    /**
     * 回合费用：会话在 [from,to] 时间窗内的调用聚合（客户端 turnTail 槽位
     * 传宿主 turn/start~turn/end 事件时间）。journal 只保当前卷——轮转掉的
     * 旧回合查不到，金额对 UI 恒标「≈」估算口径。
     */    async range({ sessionId = '', from = 0, to = Number.MAX_SAFE_INTEGER } = {}) {
      let text = ''
      try { text = await readFile(JOURNAL_PATH, 'utf8') } catch { return { found: false, cost: 0, rows: [], calls: [] } }
      const calls = []
      const parts = new Map()
      for (const line of text.split('\n')) {
        if (!line) continue
        let row
        try { row = JSON.parse(line) } catch { continue }
        if (row.session !== sessionId || !(row.at >= from && row.at <= to)) continue
        calls.push({ model: row.model, provider: row.provider, at: row.at, cost: row.cost })
        for (const item of Array.isArray(row.rows) ? row.rows : []) {
          const key = JSON.stringify([row.provider, row.model, item.bucket])
          const part = parts.get(key) ?? { provider: row.provider, model: row.model, bucket: item.bucket, tokens: 0, rate: item.rate, cost: 0 }
          part.tokens += item.tokens
          part.cost += item.cost
          parts.set(key, part)
        }
      }
      calls.sort((a, b) => a.at - b.at)
      const rows = [...parts.values()].sort((a, b) => b.cost - a.cost)
      return { found: calls.length > 0, cost: calls.reduce((sum, call) => sum + call.cost, 0), rows, calls }
    },
  }
}

/* ------------------------------------------------------------------ */
/* 账本                                                                 */
/* ------------------------------------------------------------------ */

const zeroBuckets = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 })
const localDayKey = (atMs) => {
  const d = new Date(atMs)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function createLedger(retentionDays) {
  let state = { version: 1, days: {}, imported: {} }
  let dirty = false
  let flushTimer = null
  /** 最近调用明细（内存，重启清空）：费用弹卡按时间倒序展示。 */
  const RECENT_CALLS_MAX = 200
  const recentCalls = []

  const load = () => {
    try {
      const raw = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'))
      if (raw && typeof raw === 'object' && raw.days && typeof raw.days === 'object') state = raw
    } catch { /* 首次运行或损坏：从空账本开始 */ }
  }

  const flushSync = () => {
    if (!dirty) return
    try {
      // 保留天数裁剪：超龄日直接移除（cost-meter 同口径）。
      if (Number.isFinite(retentionDays) && retentionDays > 0) {
        const cutoff = localDayKey(Date.now() - retentionDays * 86400000)
        for (const key of Object.keys(state.days)) if (key < cutoff) delete state.days[key]
      }
      mkdirSync(STORE_DIR, { recursive: true })
      const tmp = `${LEDGER_PATH}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify(state), 'utf8')
      renameSync(tmp, LEDGER_PATH)
      dirty = false
    } catch (error) {
      void report(`ledger flush failed: ${String(error?.message ?? error).slice(0, 200)}`)
    }
  }

  const scheduleFlush = () => {
    dirty = true
    if (flushTimer) return
    flushTimer = setTimeout(() => { flushTimer = null; flushSync() }, 800)
    flushTimer.unref?.()
  }

  const dayOf = (atMs) => {
    const key = localDayKey(atMs)
    let day = state.days[key]
    if (!day) {
      day = { ...zeroBuckets(), calls: 0, cost: 0, byModel: {}, sessions: {} }
      state.days[key] = day
    }
    return day
  }

  return {
    load,
    flushSync,
    dispose() { if (flushTimer) { clearTimeout(flushTimer); flushTimer = null } flushSync() },
    /** 回填游标：该会话日志已覆盖到的事件时刻（实时记账同样推进，幂等切割）。 */
    importedAt(sessionKey) {
      return state.imported?.[sessionKey] ?? 0
    },
    markImported(sessionKey, atMs) {
      if (!state.imported) state.imported = {}
      const current = state.imported[sessionKey] ?? 0
      if (atMs <= current) return false
      state.imported[sessionKey] = atMs
      // 裁剪：只保留最近 500 个会话的游标。
      const keys = Object.keys(state.imported)
      if (keys.length > 500) {
        for (const key of keys.slice(0, keys.length - 500)) delete state.imported[key]
      }
      scheduleFlush()
      return true
    },
    /** journal 折叠进度（字节偏移，随 ledger 一起落盘 → 崩溃安全，不重不漏）。 */
    journalOffset() { return state.journalOffset ?? 0 },
    setJournalOffset(offset) {
      if (!Number.isFinite(offset) || offset <= (state.journalOffset ?? 0)) return
      state.journalOffset = offset
      scheduleFlush()
    },
    /** 官方同步的现行价格（flash/pro 峰谷档）与汇率——覆盖内置表，历史档不动。 */
    livePrices() { return state.live?.prices ?? null },
    setLivePrices(tiers) {
      state.live = { ...(state.live ?? {}), prices: tiers }
      scheduleFlush()
    },
    liveExchangeRate() { return state.live?.exchangeRate ?? null },
    setExchangeRate(rate, fetchedAt) {
      state.live = { ...(state.live ?? {}), exchangeRate: { rate, fetchedAt } }
      scheduleFlush()
    },
    /** 最近调用明细，时间倒序（费用弹卡用）。 */
    recentCalls(limit = 50) {
      return recentCalls.slice(-Math.max(1, limit)).reverse()
    },
    /** 累加一次模型调用的用量与费用。source 区分对话 / 增强 / 建议生成。 */
    account({ sessionId, model, buckets, cost, atMs, source }) {
      const day = dayOf(atMs)
      const src = typeof source === 'string' && source ? source : 'chat'
      const addTo = (target) => {
        for (const key of Object.keys(zeroBuckets())) target[key] += buckets[key] ?? 0
        target.calls += 1
        target.cost += cost
      }
      addTo(day)
      // 按来源分账，费用弹卡才能把「增强」和「对话」分开显示。
      const bySource = day.bySource ?? (day.bySource = {})
      const srcEntry = bySource[src] ?? (bySource[src] = { ...zeroBuckets(), calls: 0, cost: 0 })
      addTo(srcEntry)
      // 最近调用明细（内存环形缓冲，重启清空；历史总额仍走 days）。
      recentCalls.push({
        at: atMs, session: sessionId || '', model: model || '', source: src,
        tokens: (buckets.input ?? 0) + (buckets.output ?? 0) + (buckets.cacheRead ?? 0) + (buckets.cacheWrite ?? 0),
        input: buckets.input ?? 0, output: buckets.output ?? 0,
        cacheRead: buckets.cacheRead ?? 0, cost,
      })
      if (recentCalls.length > RECENT_CALLS_MAX) recentCalls.splice(0, recentCalls.length - RECENT_CALLS_MAX)
      if (model) {
        const entry = day.byModel[model] ?? (day.byModel[model] = { ...zeroBuckets(), calls: 0, cost: 0 })
        addTo(entry)
      }
      if (sessionId) {
        const session = day.sessions[sessionId] ?? (day.sessions[sessionId] = { ...zeroBuckets(), calls: 0, cost: 0, at: 0 })
        addTo(session)
        const sessionBySource = session.bySource ?? (session.bySource = {})
        const sessionSrc = sessionBySource[src] ?? (sessionBySource[src] = { ...zeroBuckets(), calls: 0, cost: 0 })
        addTo(sessionSrc)
        session.at = Math.max(session.at, atMs)
        // 回填切割游标同步推进：回填只补「游标之后」的日志事件，幂等不重复。
        if (!state.imported) state.imported = {}
        if (atMs > (state.imported[sessionId] ?? 0)) state.imported[sessionId] = atMs
      }
      scheduleFlush()
    },
    snapshot() { return state },
  }
}

/* ------------------------------------------------------------------ */
/* 历史回填（cost-meter backfill 同思路：重放会话日志的 usage 事件）      */
/* ------------------------------------------------------------------ */

const SESSIONS_ROOT = join(homedir(), '.dsh', 'sessions')
/** 单日志解压上限（大会话整串解压占内存，超限跳过并留痕）。 */
const BACKFILL_MAX_LOG_BYTES = 64 * 1024 * 1024
const num = (value) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0 }

/** 多帧 zstd（追加写每帧独立）：按魔数切段逐帧解压，坏帧跳过。 */
async function decompressSessionLog(file) {
  const info = await stat(file).catch(() => null)
  if (!info || info.size > BACKFILL_MAX_LOG_BYTES) return null
  if (file.endsWith('.zstd')) {
    const zlib = await import('node:zlib')
    if (typeof zlib.zstdDecompressSync !== 'function') return null
    const buf = await readFile(file)
    const idxs = [0]
    for (let i = 4; i <= buf.length - 4; i += 1) {
      if (buf[i] === 0x28 && buf[i + 1] === 0xB5 && buf[i + 2] === 0x2F && buf[i + 3] === 0xFD) idxs.push(i)
    }
    let out = ''
    for (let k = 0; k < idxs.length; k += 1) {
      try { out += zlib.zstdDecompressSync(buf.subarray(idxs[k], idxs[k + 1] ?? buf.length)).toString('utf8') } catch { /* 截断/坏帧跳过 */ }
    }
    return out
  }
  return readFile(file, 'utf8')
}

/** 目录内最新的会话日志（版本号最大、zstd 优先）。 */
async function pickSessionLog(dir) {
  const entries = await readdir(dir).catch(() => [])
  const logs = entries.filter((name) => /^session(\.v\d+)?\.jsonl(\.zstd)?$/.test(name))
  if (logs.length === 0) return null
  logs.sort((a, b) => {
    const versionOf = (name) => Number((name.match(/\.v(\d+)\./) ?? [])[1] ?? 0)
    const zstdOf = (name) => (name.endsWith('.zstd') ? 1 : 0)
    return (versionOf(a) - versionOf(b)) || (zstdOf(a) - zstdOf(b))
  })
  return join(dir, logs[logs.length - 1])
}

/**
 * 重放会话事件流 → 用量样本（cost-meter replaySessionRecords 核心子集）：
 * request/header 切换当前路由；usage 取自 assistant/chunk(usage 块) /
 * assistant/message(data.usage) / compaction/summary，按「回合位置 + 五桶
 * 指纹」去重（同一步的 chunk 与 message 双份只记一次，retry 用量不同照记）；
 * 只取游标之后的事件（与实时计量幂等切割）。
 */
function samplesFromEvents(events, cursorAtMs) {
  let provider = 'deepseek'
  let model = 'default'
  let sessionId = ''
  const seen = new Set()
  const samples = []
  for (const event of events) {
    if (event.type === 'request/header') {
      const header = event.data?.header?.config
      if (typeof header?.model === 'string' && header.model) model = header.model
      if (typeof header?.provider === 'string' && header.provider) provider = header.provider
      continue
    }
    if (event.type === 'session' && typeof event.id === 'string' && !sessionId) sessionId = event.id
    let usage = null
    let positionKey = ''
    if (event.type === 'assistant/chunk' && event.data?.chunk?.type === 'usage' && event.data.chunk.usage != null) {
      usage = event.data.chunk.usage
      positionKey = `s:${num(event.data?.turn)}:${num(event.data?.step)}`
    } else if (event.type === 'assistant/message' && event.data?.usage != null) {
      usage = event.data.usage
      positionKey = `s:${num(event.data?.turn)}:${num(event.data?.step)}`
      const source = event.data?.message?.source
      if (typeof source?.model === 'string' && source.model) model = source.model
      if (typeof source?.provider === 'string' && source.provider) provider = source.provider
    } else if (event.type === 'compaction/summary' && event.data?.usage != null) {
      usage = event.data.usage
      positionKey = `c:${event.seq ?? ''}`
    } else {
      continue
    }
    const atMs = Number(event.time)
    if (!Number.isFinite(atMs) || atMs <= 0 || atMs <= cursorAtMs) continue
    const buckets = {
      input: num(usage.inputTokens),
      output: num(usage.outputTokens),
      cacheRead: num(usage.cacheReadTokens),
      cacheWrite: num(usage.cacheWriteTokens),
      reasoning: num(usage.reasoningTokens),
    }
    const fingerprint = `${positionKey}|${buckets.input}|${buckets.output}|${buckets.cacheRead}|${buckets.cacheWrite}|${buckets.reasoning}`
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)
    samples.push({ provider, model, buckets, atMs })
  }
  return { sessionId, samples }
}

/**
 * 扫描全部会话日志回填历史（仅锁持有者，boot 后延迟触发；游标幂等）。
 * 0.7.0 起回填样本写 journal（与实时计量同源），由 ingest 统一折叠——
 * 回填与实时对同一调用的重叠由 ingest 的指纹去重互斥，永不双计。
 */
async function runBackfill(journal, ledger, priceEntryFor) {
  const workspaces = await readdir(SESSIONS_ROOT, { withFileTypes: true }).catch(() => [])
  let touchedSessions = 0
  let importedCalls = 0
  for (const workspace of workspaces) {
    if (!workspace.isDirectory()) continue
    const workspaceDir = join(SESSIONS_ROOT, workspace.name)
    const sessionDirs = await readdir(workspaceDir, { withFileTypes: true }).catch(() => [])
    for (const sessionDir of sessionDirs) {
      if (!sessionDir.isDirectory()) continue
      const logFile = await pickSessionLog(join(workspaceDir, sessionDir.name))
      if (!logFile) continue
      try {
        const text = await decompressSessionLog(logFile)
        if (text === null) continue
        const events = []
        for (const line of text.split('\n')) {
          if (!line) continue
          try { events.push(JSON.parse(line)) } catch { /* 半行跳过 */ }
        }
        const probe = samplesFromEvents(events, 0)
        const sessionId = probe.sessionId
        const { samples } = samplesFromEvents(events, sessionId ? ledger.importedAt(sessionId) : 0)
        let maxAt = 0
        for (const sample of samples) {
          const entry = priceEntryFor(sample.model)
          if (!entry) continue
          const peak = isPeakAt(sample.atMs)
          const tier = tierFor(entry, sample.atMs, peak)
          const cost = costOfBuckets(sample.buckets, tier)
          await journal.write({
            at: sample.atMs,
            day: localDayKey(sample.atMs),
            session: sessionId || '',
            model: sample.model,
            provider: sample.provider,
            ...sample.buckets,
            rows: bucketRows(sample.buckets, tier),
            cost,
            peak,
          })
          maxAt = Math.max(maxAt, sample.atMs)
          importedCalls += 1
        }
        if (sessionId && maxAt > 0 && ledger.markImported(sessionId, maxAt)) touchedSessions += 1
        // 让出事件循环：几百个会话的解压不能卡住宿主启动。
        await new Promise((resolve) => setImmediate(resolve))
      } catch (error) {
        void report(`backfill ${sessionDir.name} failed: ${String(error?.message ?? error).slice(0, 160)}`)
      }
    }
  }
  if (importedCalls > 0) void report(`backfill appended ${importedCalls} journal rows across ${touchedSessions} sessions`)
  else void report('backfill done: nothing new')
}

/** 下一次峰谷状态翻转时刻（48h 内逐分钟扫描；周末/节假日边界自然覆盖）。 */
function nextPeakSwitch(now) {
  const current = isPeakAt(now)
  const start = Math.floor(now / 60_000) * 60_000 + 60_000
  for (let ms = start; ms <= now + 48 * 3_600_000; ms += 60_000) {
    if (isPeakAt(ms) !== current) return { atMs: ms, isPeak: isPeakAt(ms) }
  }
  return null
}

/** 官方定价页（预渲染 SSR）解析 → flash/pro 峰谷八字段（USD/1M）。 */
const OFFICIAL_PRICING_URL = 'https://api-docs.deepseek.com/quick_start/pricing/'

function parseOfficialPricing(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/\s+/g, ' ')
  const startIdx = text.indexOf('PRICING')
  const endIdx = text.indexOf('Concurrency Limit', startIdx)
  if (startIdx < 0 || endIdx < 0) throw new Error('pricing section not found')
  const section = text.slice(startIdx, endIdx)
  const nums = [...section.matchAll(/\$([0-9.]+)/g)].map((m) => Number(m[1]))
  if (nums.length < 12) throw new Error(`pricing layout changed: expected 12 rates, got ${nums.length}`)
  // 页面顺序（deepseek-flash | deepseek-v4-pro 两列）：
  // CACHE HIT off(a,b) peak(c,d) · CACHE MISS off(e,f) peak(g,h) · OUTPUT off(i,j) peak(k,l)
  const [fhOff, phOff, fhPk, phPk, fmOff, pmOff, fmPk, pmPk, foOff, poOff, foPk, poPk] = nums
  const pair = (flash, pro, label) => {
    if (!(flash > 0 && pro > 0)) throw new Error(`pricing layout changed: invalid ${label}`)
    return { flash, pro }
  }
  return {
    fetchedAt: Date.now(),
    currency: 'USD',
    cacheHit: { offPeak: pair(fhOff, phOff, 'cacheHit.offPeak'), peak: pair(fhPk, phPk, 'cacheHit.peak') },
    cacheMiss: { offPeak: pair(fmOff, pmOff, 'cacheMiss.offPeak'), peak: pair(fmPk, pmPk, 'cacheMiss.peak') },
    output: { offPeak: pair(foOff, poOff, 'output.offPeak'), peak: pair(foPk, poPk, 'output.peak') },
  }
}

async function fetchOfficialPricing() {
  const res = await fetch(OFFICIAL_PRICING_URL, { headers: { 'user-agent': 'dsh-cost' }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`official pricing page HTTP ${res.status}`)
  return parseOfficialPricing(await res.text())
}

/** 汇率（USD→CNY），frankfurter.dev 免钥公开端点。 */
async function fetchExchangeRate() {
  const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=CNY', { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`frankfurter HTTP ${res.status}`)
  const data = await res.json()
  const rate = Number(data?.rates?.CNY)
  if (!(rate > 0)) throw new Error('frankfurter returned no CNY rate')
  return rate
}

/** 把官方解析结果折成 tier 形状（flash/pro 各一），并校验峰=谷×2（±1%）。 */
function tiersFromOfficial(parsed) {
  const build = (family) => {
    const offPeak = { cacheHit: parsed.cacheHit.offPeak[family], cacheMiss: parsed.cacheMiss.offPeak[family], output: parsed.output.offPeak[family] }
    const peak = { cacheHit: parsed.cacheHit.peak[family], cacheMiss: parsed.cacheMiss.peak[family], output: parsed.output.peak[family] }
    for (const key of Object.keys(offPeak)) {
      if (Math.abs(peak[key] - offPeak[key] * 2) > offPeak[key] * 0.011) throw new Error(`peak != 2×offPeak for ${family}.${key} (official layout changed)`)
    }
    return { offPeak, peak: double(offPeak) }
  }
  return { fetchedAt: parsed.fetchedAt, currency: parsed.currency, flash: build('flash'), pro: build('pro') }
}

/* ------------------------------------------------------------------ */
/* 跨进程单写者锁（双进程同 boot 实锤；非持有者只 append journal）        */
/* ------------------------------------------------------------------ */

const LOCK_STALE_MS = 30_000

function acquireLedgerLock(path) {
  const tryWrite = () => {
    try {
      const fd = openSync(path, 'wx')
      writeSync(fd, String(process.pid))
      closeSync(fd)
      return true
    } catch (error) {
      if (error?.code === 'EEXIST') return false
      throw error
    }
  }
  if (tryWrite()) return { owner: true }
  try {
    const info = statSync(path)
    const holder = Number(readFileSync(path, 'utf8'))
    let alive = false
    if (Number.isSafeInteger(holder) && holder > 0) {
      try { process.kill(holder, 0); alive = true } catch (error) { alive = error?.code === 'EPERM' }
    }
    if (!alive || Date.now() - info.mtimeMs > LOCK_STALE_MS) {
      // 持有者已死或心跳超时：抢占（万一并发抢占，后写者败走非持有者，无害）。
      try { unlinkSync(path) } catch { /* ignore */ }
      return { owner: tryWrite() }
    }
  } catch { return { owner: tryWrite() } }
  return { owner: false }
}

function touchLedgerLock(path) {
  try { utimesSync(path, new Date(), new Date()) } catch { /* ignore */ }
}

function releaseLedgerLock(path) {
  try {
    if (Number(readFileSync(path, 'utf8')) === process.pid) unlinkSync(path)
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* 插件入口                                                             */
/* ------------------------------------------------------------------ */
const moduleInject = []

/** 官方余额查询：host 白名单（安全约束——只允许官方域名，内网/环回不可能出现）。 */
const BALANCE_HOST = 'api.deepseek.com'

const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('是否启用费用统计'),
  /** 展示汇率（USD → CNY）；金额账本恒存美元，展示时换算。 */
  exchangeRate: Schema.number().default(7.2).description('展示汇率（USD→CNY）'),
  /** 自定义单价覆盖：{ "模型id": { cacheHit, cacheMiss, output } }（USD/1M）。 */
  customPrices: Schema.object({}).default({}).description('自定义模型单价（USD/1M tokens）'),
  /** 账本保留天数。 */
  retentionDays: Schema.number().default(180).description('历史保留天数'),
  budgetEnabled: Schema.boolean().default(false).description('启用预算'),
  budgetAmount: Schema.number().default(50).description('预算金额（CNY）'),
  budgetPeriod: Schema.union(['day', 'month', 'all']).default('month').description('预算周期'),
  backfillEnabled: Schema.boolean().default(true).description('启动时回填历史会话费用'),
  peakAlertEnabled: Schema.boolean().default(false).description('峰谷切换前提醒'),
  peakAlertLeadMinutes: Schema.number().default(2).description('峰谷切换提前量（分钟，1-30）'),
  peakAlertNotify: Schema.boolean().default(false).description('同时发送系统通知'),
  /** DeepSeek 开放平台 API Key（选填）：配置后费用弹卡显示官方账户余额。 */
  apiKey: Schema.string().default('').description('DeepSeek 开放平台 API Key（查官方余额用，可选）'),
})

function apply(ctx, config) {
  // 运行时可变副本：POST /settings 改这里，立即生效；显式改过的键持久化
  // 到 storages、启动时回放（没改过的键继续跟随宿主配置）。
  const live = { ...config }
  // 官方余额缓存：10 分钟内直接回缓存；换 key 即失效。
  let balanceCache = null
  if (!live.enabled) return

  // 设置持久化：只落与 config 不同的键，防抖 400ms 原子写。
  const SETTINGS_KEYS = ['budgetEnabled', 'budgetAmount', 'budgetPeriod', 'peakAlertEnabled', 'peakAlertNotify', 'peakAlertLeadMinutes', 'exchangeRate', 'apiKey']
  const SETTINGS_PATH = join(homedir(), '.dsh', 'storages', 'dsh-cost', 'settings.json')
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

  const lockPath = join(STORE_DIR, 'ledger.lock')
  const lock = acquireLedgerLock(lockPath)
  void report(`server boot v0.8.2 pid=${process.pid} ledgerOwner=${lock.owner} retention=${live.retentionDays} rate=${live.exchangeRate} budget=${live.budgetEnabled ? `${live.budgetAmount}/${live.budgetPeriod}` : 'off'} backfill=${live.backfillEnabled && lock.owner ? 'on' : 'off'}`)

  const ledger = createLedger(live.retentionDays)
  if (lock.owner) ledger.load()
  ctx.effect(() => { ledger.dispose(); if (lock.owner) releaseLedgerLock(lockPath) }, 'dsh-cost: ledger flush + lock release')

  const admitUsage = createUsageDeduper()
  const journal = createJournal()

  /**
   * 锁持有者把 journal 增量折叠进 ledger（0.7.0 单写者模型）：
   * 两个进程都会 boot 并各听各的 llm/stream——都只 append journal（O_APPEND
   * 单行跨进程安全）；只有锁持有者写 ledger.json，彻底消除整文件互踩。
   * 指纹去重兜底：同一事件被两进程捕获 / 回填与实时重叠，10s 窗内互斥。
   */
  const ingestDedup = createUsageDeduper()
  let ingestedCount = 0
  let ingestBusy = false
  async function ingestJournal() {
    if (!lock.owner || ingestBusy) return
    ingestBusy = true
    try {
      const { rows, offset } = await journal.recordsAfter(ledger.journalOffset())
      for (const row of rows) {
        if (!row || !Number.isFinite(row.at) || !Number.isFinite(row.cost) || !row.model) continue
        const buckets = { input: row.input ?? 0, output: row.output ?? 0, cacheRead: row.cacheRead ?? 0, cacheWrite: row.cacheWrite ?? 0, reasoning: row.reasoning ?? 0 }
        if (!ingestDedup(`${row.session ?? ''}|${row.model}`, buckets, row.at)) continue
        ledger.account({ sessionId: row.session, model: row.model, buckets, cost: row.cost, atMs: row.at, source: row.source })
        // +60s 余量：日志事件记的是消息完成时刻，晚于实时流发起时刻；
        // 游标盖住整个调用时长，防回填重放同一条。
        if (row.session) ledger.markImported(row.session, row.at + 60_000)
        ingestedCount += 1
      }
      ledger.setJournalOffset(offset)
      if (rows.length > 0) touchLedgerLock(lockPath)
    } catch (error) {
      void report(`ingest failed: ${String(error?.message ?? error).slice(0, 160)}`)
    } finally {
      ingestBusy = false
    }
  }

  if (lock.owner) {
    const ingestTimer = setInterval(() => { void ingestJournal() }, 5000)
    ingestTimer.unref?.()
    ctx.effect(() => () => clearInterval(ingestTimer), 'dsh-cost: journal ingest timer')
  }

  // 历史回填：仅锁持有者执行（boot 后 3s，避开宿主启动高峰）；0.7.0 起
  // 改写 journal（与实时同源），由 ingest 统一折叠 + 指纹去重，天然不重。
  if (live.backfillEnabled && lock.owner) {
    const backfillTimer = setTimeout(() => { void runBackfill(journal, ledger, priceEntryFor).catch((error) => { void report(`backfill crashed: ${String(error?.message ?? error).slice(0, 200)}`) }) }, 3000)
    backfillTimer.unref?.()
    ctx.effect(() => () => clearTimeout(backfillTimer), 'dsh-cost: backfill timer')
  }

  // 汇率自动刷新：仅锁持有者，启动 5s 后首刷，之后每小时。失败静默（用旧值）。
  if (lock.owner) {
    const refreshRate = async () => {
      try {
        const rate = await fetchExchangeRate()
        ledger.setExchangeRate(rate, Date.now())
        void report(`exchange rate auto: ${rate}`)
      } catch (error) {
        void report(`exchange rate auto failed: ${String(error?.message ?? error).slice(0, 120)}`)
      }
    }
    const rateStart = setTimeout(() => { void refreshRate() }, 5000)
    rateStart.unref?.()
    const rateTimer = setInterval(() => { void refreshRate() }, 3_600_000)
    rateTimer.unref?.()
    ctx.effect(() => () => { clearTimeout(rateStart); clearInterval(rateTimer) }, 'dsh-cost: exchange rate timers')
  }

  /** 深度标记：存在即「已知会、不需要再入账」的 llm 流（嵌套排除）。 */
  const llmDepth = new AsyncLocalStorage()

  /**
   * 跨插件的调用来源标记。prompt-enhancer / followup 在发起自己的
   * llm.stream 前写 globalThis.__dshPluginCall，这里按 5 秒窗口读回：
   * 落在窗口内算它们的调用，否则一律算对话。读一次就清，避免串到下一次。
   */
  const CALL_SOURCE_TTL_MS = 5000

  /** 各插件自己的 prompt 特征：跨进程时 globalThis 不共享，只能看内容。 */
  const SOURCE_SIGNATURES = [
    { source: 'followup', needle: 'You generate follow-up suggestions' },
    { source: 'enhance', needle: "You are a Prompt Engineering Expert" },
  ]

  function callSource(options) {
    // 1) 同进程时的显式标记（prompt-enhancer / followup 调用前写入）
    const marker = globalThis.__dshPluginCall
    if (marker && typeof marker.at === 'number' && Date.now() - marker.at < CALL_SOURCE_TTL_MS) {
      const source = typeof marker.source === 'string' && marker.source ? marker.source : 'chat'
      globalThis.__dshPluginCall = undefined
      return source
    }
    // 2) 兜底：按 prompt 特征识别，插件跑在别的进程时也能分开记
    try {
      const messages = options?.messages
      if (messages) {
        const text = JSON.stringify(messages)
        for (const entry of SOURCE_SIGNATURES) {
          if (text.includes(entry.needle)) return entry.source
        }
      }
    } catch { /* 序列化失败就当普通对话 */ }
    return 'chat'
  }

  const unmatchedModels = new Set()
  let streamArmed = false
  let accountCount = 0

  function priceEntryFor(model) {
    if (model && live.customPrices && live.customPrices[model]) return { custom: true, ...live.customPrices[model] }
    const norm = normalizeModelId(model)
    if (legacyOnlyModels[norm]) return legacyOnlyModels[norm]
    if (norm.includes('deepseek')) {
      // 官方同步的现行价优先（fetch-prices 成功后覆盖内置表；历史档不变）。
      const live = ledger.livePrices()
      if (live && live.currency === 'USD') {
        const family = norm.includes('pro') ? 'pro' : 'flash'
        const t = live[family]
        return { legacyBase: (norm.includes('pro') ? deepseekPro : deepseekFlash).legacyBase, august: undefined, offPeak: t.offPeak, peak: t.peak, live: true }
      }
      return norm.includes('pro') ? deepseekPro : deepseekFlash
    }
    return null
  }

  ctx.on('llm/stream', (options, next) => {
    // 包装路由插件在嵌套上下文里再发起的上游调用：原样透传，不重复入账。
    if (llmDepth.getStore() !== undefined) return next()
    const downstream = next()
    if (!streamArmed) {
      streamArmed = true
      void report(`llm/stream first fire pid=${process.pid} — capture channel ALIVE in this process`)
    }
    const startedAtMs = Date.now()
    const model = typeof options?.model === 'string' ? options.model : ''
    const provider = typeof options?.provider === 'string' ? options.provider : ''
    const sessionId = typeof options?.sessionId === 'string' ? options.sessionId : ''
    let usage = null
    let downstreamIter = null
    let completed = false
    return (async function* costObserve() {
      try {
        downstreamIter = downstream[Symbol.asyncIterator]()
        for (;;) {
          // 深度标记内拉取：下游适配器（包装路由）在消费上下文里再发起的
          // ctx.llm.stream() 继承标记，内层监听器判定为嵌套、透传。
          const result = await llmDepth.run(1, () => downstreamIter.next())
          if (result.done) break
          const chunk = result.value
          // usage 块位于 finish 之前；多块时最后一块生效（cost-meter 同款）。
          if (chunk?.type === 'usage' && chunk.usage != null) usage = chunk.usage
          yield chunk
        }
        completed = true
      } finally {
        // 消费方提前中断也向下游传播 return()，防上游 HTTP 流悬挂。
        if (!completed) {
          try { await downstreamIter?.return?.() } catch { /* ignore */ }
        }
        try {
          if (usage) {
            const buckets = {
              input: usage.inputTokens ?? 0,
              output: usage.outputTokens ?? 0,
              cacheRead: usage.cacheReadTokens ?? 0,
              cacheWrite: usage.cacheWriteTokens ?? 0,
              reasoning: usage.reasoningTokens ?? 0,
            }
            const entry = priceEntryFor(model)
            if (entry) {
              // 指纹去重兜底：本进程内 ALS 逃逸/同流双 usage 互斥（10s 窗）。
              if (admitUsage(model, buckets, startedAtMs)) {
                const peak = isPeakAt(startedAtMs)
                const tier = tierFor(entry, startedAtMs, peak)
                const cost = costOfBuckets(buckets, tier)
                // 0.7.0 单写者模型：所有进程只 append journal（跨进程安全），
                // ledger 由锁持有者的 ingest 统一折叠。
                void journal.write({
                  at: startedAtMs,
                  day: localDayKey(startedAtMs),
                  session: sessionId || '',
                  model,
                  provider,
                  ...buckets,
                  rows: bucketRows(buckets, tier),
                  cost,
                  peak,
                  source: callSource(options),
                })
                accountCount += 1
                // 采样留痕（前 10 条全记，之后 1/20），足以判定通路与发现异常。
                if (accountCount <= 10 || accountCount % 20 === 0) {
                  void report(`journaled #${accountCount} pid=${process.pid} owner=${lock.owner ? 1 : 0} model=${model} provider=${provider} session=${sessionId ? sessionId.slice(0, 40) : '(none)'} peak=${peak ? 1 : 0} buckets=${JSON.stringify(buckets)} cost=$${cost.toFixed(6)}`)
                }
              } else {
                void report(`dedup skip model=${model} buckets=${JSON.stringify(buckets)}`)
              }
            } else if (model && !unmatchedModels.has(model)) {
              // 未内置价格的第三方模型按 default 档（flash 现行价）计费，
              // 首见留痕提醒用户在 customPrices 里补充精确单价。
              unmatchedModels.add(model)
              void report(`unmatched model "${model}" billed at default tier; add customPrices entry for accuracy`)
            }
          }
        } catch (error) {
          void report(`account failed: ${String(error?.message ?? error).slice(0, 200)}`)
        }
      }
    })()
  }, { global: true })

  /* -- HTTP 端点 ------------------------------------------------------ */

  ctx.inject(['webServer'], (webCtx) => {
    /** /state、/export 共用：锁持有者先折叠+落盘再读文件；非持有者直读
     （持有者 5s ingest + 800ms 防抖，两个进程的 UI 数据都足够新鲜）。 */
    async function ledgerSnapshotFresh() {
      if (lock.owner) {
        await ingestJournal()
        ledger.flushSync()
      }
      try { return JSON.parse(await readFile(LEDGER_PATH, 'utf8')) } catch { return { days: {} } }
    }
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: '/api/dsh-cost',
      handler: async (req, res) => {
        const send = (status, body) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        const path = (req.url ?? '').split('?')[0].replace(/^\/api\/dsh-cost/, '')
        if (path === '/settings' && req.method === 'GET') {
          send(200, {
            enabled: live.enabled,
            exchangeRate: live.exchangeRate,
            budgetEnabled: live.budgetEnabled,
            budgetAmount: live.budgetAmount,
            budgetPeriod: live.budgetPeriod,
            peakAlertEnabled: live.peakAlertEnabled,
            peakAlertLeadMinutes: live.peakAlertLeadMinutes,
            peakAlertNotify: live.peakAlertNotify,
            retentionDays: live.retentionDays,
          })
          return
        }
        // 运行时改参数：retentionDays 与 customPrices 不在白名单——前者启动时
        // 已传给 createLedger，后者是对象结构，运行时改要么无效要么要重建缓存。
        if (path === '/settings' && req.method === 'POST') {
          let raw = ''
          for await (const chunk of req) raw += chunk
          let body
          try { body = JSON.parse(raw) } catch { send(400, { error: 'invalid-json' }); return }
          if (body.budgetEnabled !== undefined) live.budgetEnabled = body.budgetEnabled === true
          if (body.budgetPeriod === 'day' || body.budgetPeriod === 'month') live.budgetPeriod = body.budgetPeriod
          if (body.peakAlertEnabled !== undefined) live.peakAlertEnabled = body.peakAlertEnabled === true
          if (body.peakAlertNotify !== undefined) live.peakAlertNotify = body.peakAlertNotify === true
          if (body.budgetAmount !== undefined) {
            const value = Number(body.budgetAmount)
            if (Number.isFinite(value)) live.budgetAmount = Math.min(1_000_000, Math.max(0, value))
          }
          if (body.exchangeRate !== undefined) {
            const value = Number(body.exchangeRate)
            if (Number.isFinite(value) && value > 0) live.exchangeRate = Math.min(20, Math.max(1, value))
          }
          if (body.peakAlertLeadMinutes !== undefined) {
            const value = Number(body.peakAlertLeadMinutes)
            if (Number.isFinite(value)) live.peakAlertLeadMinutes = Math.min(30, Math.max(1, Math.round(value)))
          }
          if (body.apiKey !== undefined) {
            live.apiKey = String(body.apiKey ?? '').trim()
            balanceCache = null // 换 key 立即失效缓存
          }
          persistSettings()
          send(200, { ok: true })
          return
        }


        if (path === '/state' && req.method === 'GET') {
          const snap = await ledgerSnapshotFresh()
          const now = Date.now()
          const todayKey = localDayKey(now)
          const monthPrefix = todayKey.slice(0, 7)
          const weekStartKey = localDayKey(now - 6 * 86400000)
          let month = null
          const total = { ...zeroBuckets(), calls: 0, cost: 0 }
          const recent = []
          const sessions = []
          for (const key of Object.keys(snap.days).sort()) {
            const day = snap.days[key]
            for (const bucketKey of Object.keys(zeroBuckets())) total[bucketKey] += day[bucketKey] ?? 0
            total.calls += day.calls ?? 0
            total.cost += day.cost ?? 0
            if (key.startsWith(monthPrefix)) month = month ? mergeDay(month, day) : summarize(day)
            if (key >= weekStartKey) {
              recent.push({ date: key, calls: day.calls ?? 0, cost: day.cost ?? 0, tokens: (day.input ?? 0) + (day.output ?? 0) + (day.cacheRead ?? 0) + (day.cacheWrite ?? 0) })
              for (const [id, session] of Object.entries(day.sessions ?? {})) {
                sessions.push({ id, date: key, calls: session.calls ?? 0, cost: session.cost ?? 0, input: session.input ?? 0, output: session.output ?? 0, at: session.at ?? 0 })
              }
            }
          }
          sessions.sort((a, b) => b.at - a.at)
          // 预算：以展示币种（CNY）计，used 由对应周期的账本金额换算。
          const budgetReady = live.budgetEnabled && Number(live.budgetAmount) > 0
          const budgetUsd = budgetReady
            ? (live.budgetPeriod === 'day'
              ? (snap.days[todayKey]?.cost ?? 0)
              : live.budgetPeriod === 'month'
                ? (month?.cost ?? 0)
                : total.cost)
            : 0
          send(200, {
            serverNow: now,
            display: { currency: 'CNY', rate: ledger.liveExchangeRate()?.rate ?? live.exchangeRate, rateSource: ledger.liveExchangeRate() ? 'auto' : 'config', rateFetchedAt: ledger.liveExchangeRate()?.fetchedAt ?? null },
            peak: { isPeak: isPeakAt(now), windows: PEAK_WINDOWS, nextSwitchAtMs: nextPeakSwitch(now)?.atMs ?? null, nextIsPeak: nextPeakSwitch(now)?.isPeak ?? null },
            today: todayKey in snap.days ? summarize(snap.days[todayKey]) : null,
            month,
            total: summarize(total),
            budget: budgetReady
              ? { amount: live.budgetAmount, period: live.budgetPeriod, used: budgetUsd * live.exchangeRate, usedPct: budgetUsd * live.exchangeRate / live.budgetAmount }
              : null,
            recent,
            sessions: sessions.slice(0, 20),
            unmatched: [...unmatchedModels],
            streamAlive: streamArmed,
            alerts: {
              peakEnabled: live.peakAlertEnabled === true,
              leadMinutes: Math.min(30, Math.max(1, Math.round(live.peakAlertLeadMinutes ?? 2))),
              notify: live.peakAlertNotify === true,
            },
          })
          return
        }

        /**
         * GET /forecast —— 月底花费预测。
         *
         * 用最近 7 个**完整**历史日的日均推算，不用今天（半天数据会把均值拉低）。
         * 样本少于 3 天时标 basis=insufficient，前端据此提示「数据不足」而不是
         * 显示一个不可信的数字。
         */
        if (path === '/forecast' && req.method === 'GET') {
          const snap = await ledgerSnapshotFresh()
          const now = Date.now()
          const todayKey = localDayKey(now)
          const monthPrefix = todayKey.slice(0, 7)

          let monthCost = 0
          let monthCalls = 0
          const recent = []

          for (const key of Object.keys(snap.days).sort()) {
            const day = snap.days[key]
            if (key.startsWith(monthPrefix)) {
              monthCost += day.cost ?? 0
              monthCalls += day.calls ?? 0
            }
            // 只取完整历史日，今天的数据还在增长
            if (key < todayKey && key >= localDayKey(now - 7 * 86400000)) {
              recent.push({ date: key, cost: day.cost ?? 0, calls: day.calls ?? 0 })
            }
          }

          const n = recent.length
          const sumCost = recent.reduce((acc, d) => acc + d.cost, 0)
          const sumCalls = recent.reduce((acc, d) => acc + d.calls, 0)
          const avgDaily = n > 0 ? sumCost / n : 0
          const avgCalls = n > 0 ? sumCalls / n : 0

          const nowDate = new Date(now)
          const daysInMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate()
          const daysLeft = daysInMonth - nowDate.getDate()
          const projected = monthCost + avgDaily * daysLeft

          return json({
            monthCost,
            monthCalls,
            avgDaily,
            avgCalls,
            daysLeft,
            projected,
            avgPerCall: monthCalls > 0 ? monthCost / monthCalls : 0,
            sampleDays: n,
            basis: n >= 3 ? 'recent' : 'insufficient',
            recent,
          })
        }

        if (path === '/calls' && req.method === 'GET') {
          const url = new URL(req.url ?? '/api/dsh-cost/calls', 'http://localhost')
          const sessionId = url.searchParams.get('session') ?? ''
          const day = url.searchParams.get('day') ?? ''
          const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 20)))
          // 全量按来源汇总（对话 / 增强 / 建议生成），供状态行费用弹卡分组显示。
          const snap = await ledgerSnapshotFresh()
          const bySource = {}
          let totalCost = 0
          let totalCalls = 0
          for (const key of Object.keys(snap.days)) {
            const d = snap.days[key]
            totalCost += d.cost ?? 0
            totalCalls += d.calls ?? 0
            for (const [src, entry] of Object.entries(d.bySource ?? {})) {
              const t = bySource[src] ?? (bySource[src] = { cost: 0, calls: 0 })
              t.cost += entry.cost ?? 0
              t.calls += entry.calls ?? 0
            }
          }
          send(200, { total: { cost: totalCost, calls: totalCalls, bySource }, calls: await journal.recent({ sessionId, day, limit }) })
          return
        }

        // 本对话累计费用：跨所有日期聚合 day.sessions[sessionId]，含来源分组。
        if (path === '/session' && req.method === 'GET') {
          const url = new URL(req.url ?? '/api/dsh-cost/session', 'http://localhost')
          const sessionId = url.searchParams.get('session') ?? ''
          if (!sessionId) { send(400, { error: 'missing session' }); return }
          const snap = await ledgerSnapshotFresh()
          const total = { ...zeroBuckets(), calls: 0, cost: 0, bySource: {} }
          for (const key of Object.keys(snap.days)) {
            const entry = snap.days[key].sessions?.[sessionId]
            if (!entry) continue
            for (const bucketKey of Object.keys(zeroBuckets())) total[bucketKey] += entry[bucketKey] ?? 0
            total.calls += entry.calls ?? 0
            total.cost += entry.cost ?? 0
            for (const [src, sub] of Object.entries(entry.bySource ?? {})) {
              const target = total.bySource[src] ?? (total.bySource[src] = { cost: 0, calls: 0 })
              target.cost += sub.cost ?? 0
              target.calls += sub.calls ?? 0
            }
          }
          send(200, {
            session: sessionId,
            total,
            calls: ledger.recentCalls(100).filter((call) => call.session === sessionId),
          })
          return
        }

        // 回合费用：turnTail 槽位传宿主 turn/start~turn/end 事件时间窗。
        if (path === '/turn' && req.method === 'GET') {
          const url = new URL(req.url ?? '/api/dsh-cost/turn', 'http://localhost')
          const sessionId = url.searchParams.get('session') ?? ''
          const from = Number(url.searchParams.get('from') ?? 0)
          const to = Number(url.searchParams.get('to') ?? Number.MAX_SAFE_INTEGER)
          if (!sessionId || !Number.isFinite(from) || !Number.isFinite(to)) { send(400, { error: 'missing session/from/to' }); return }
          send(200, await journal.range({ sessionId, from, to }))
          return
        }

        // 客户端调试上报：锚定/装配事件落 debug log（真机取证）。
        if (path === '/client-debug' && req.method === 'POST') {
          let body = ''
          for await (const chunk of req) body += chunk
          let message = ''
          try { message = String(JSON.parse(body).message ?? '').slice(0, 300) } catch { message = '' }
          if (message) void report(`client: ${message}`)
          send(200, { ok: true })
          return
        }

        // 导出：全量 JSON（含日/模型/会话聚合）或日汇总 CSV。
        if (path === '/export' && req.method === 'GET') {
          const url = new URL(req.url ?? '/api/dsh-cost/export', 'http://localhost')
          const snap = await ledgerSnapshotFresh()
          if ((url.searchParams.get('format') ?? 'json') === 'csv') {
            const lines = ['date,input,output,cache_read,cache_write,reasoning,calls,cost_usd']
            for (const key of Object.keys(snap.days).sort()) {
              const day = snap.days[key]
              lines.push([key, day.input ?? 0, day.output ?? 0, day.cacheRead ?? 0, day.cacheWrite ?? 0, day.reasoning ?? 0, day.calls ?? 0, (day.cost ?? 0).toFixed(6)].join(','))
            }
            res.statusCode = 200
            res.setHeader('content-type', 'text/csv; charset=utf-8')
            res.setHeader('content-disposition', 'attachment; filename="dsh-cost-days.csv"')
            res.end(lines.join('\n'))
            return
          }
          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.setHeader('content-disposition', 'attachment; filename="dsh-cost-ledger.json"')
          res.end(JSON.stringify({ exportedAt: Date.now(), display: { currency: 'CNY', rate: ledger.liveExchangeRate()?.rate ?? live.exchangeRate }, days: snap.days }))
          return
        }

        if (path === '/prices' && req.method === 'GET') {
          const now = Date.now()
          const peak = isPeakAt(now)
          const live = ledger.livePrices()
          send(200, {
            currency: 'USD',
            peak,
            peakWindowsUtc: PEAK_WINDOWS,
            holidays: [...PEAK_HOLIDAYS],
            source: live ? 'official-sync' : 'built-in',
            fetchedAt: live?.fetchedAt ?? null,
            models: {
              'deepseek-v4.1-flash / deepseek-flash': live ? tierFor({ offPeak: live.flash.offPeak, peak: live.flash.peak }, now, peak) : currentTier(deepseekFlash, now, peak),
              'deepseek-v4-pro': live ? tierFor({ offPeak: live.pro.offPeak, peak: live.pro.peak }, now, peak) : currentTier(deepseekPro, now, peak),
            },
            default: live ? tierFor({ offPeak: live.flash.offPeak, peak: live.flash.peak }, now, peak) : currentTier(deepseekFlash, now, peak),
          })
          return
        }

        // 官方价格同步：抓官方定价页解析，校验峰=谷×2 后覆盖现行档。
        if (path === '/fetch-prices' && req.method === 'POST') {
          try {
            const parsed = await fetchOfficialPricing()
            const tiers = tiersFromOfficial(parsed)
            ledger.setLivePrices(tiers)
            void report(`price sync ok: flash off ${JSON.stringify(tiers.flash.offPeak)} pro off ${JSON.stringify(tiers.pro.offPeak)}`)
            send(200, { ok: true, fetchedAt: tiers.fetchedAt, flash: tiers.flash, pro: tiers.pro })
          } catch (error) {
            void report(`price sync failed: ${String(error?.message ?? error).slice(0, 200)}`)
            send(502, { ok: false, error: String(error?.message ?? error).slice(0, 200) })
          }
          return
        }

        // 官方余额（选配 apiKey）：host 白名单写死官方域名，https 证书校验兜底。
        if (path === '/balance' && req.method === 'GET') {
          const key = String(live.apiKey ?? '').trim()
          if (!key) { send(200, { ok: false, reason: 'no-key' }); return }
          if (balanceCache && Date.now() - balanceCache.at < 600_000) { send(200, balanceCache.data); return }
          if (BALANCE_HOST !== 'api.deepseek.com') { send(200, { ok: false, reason: 'bad-host' }); return }
          try {
            const res = await fetch(`https://${BALANCE_HOST}/user/balance`, {
              headers: { accept: 'application/json', authorization: `Bearer ${key}`, 'user-agent': 'dsh-cost' },
              signal: AbortSignal.timeout(8000),
            })
            if (!res.ok) throw new Error(`balance ${res.status}`)
            const data = await res.json()
            const info = Array.isArray(data.balance_infos) ? data.balance_infos[0] : null
            const out = info
              ? { ok: true, currency: info.currency ?? 'CNY', total: String(info.total_balance ?? ''), granted: String(info.granted_balance ?? ''), toppedUp: String(info.topped_up_balance ?? ''), at: Date.now() }
              : { ok: false, reason: 'empty' }
            balanceCache = { at: Date.now(), data: out }
            send(200, out)
          } catch (error) {
            const out = { ok: false, reason: String(error?.message ?? error).slice(0, 120) }
            balanceCache = { at: Date.now(), data: out }
            send(200, out)
          }
          return
        }

        // 汇率手动刷新（自动刷新由每小时定时器执行）。
        if (path === '/fetch-rate' && req.method === 'POST') {
          try {
            const rate = await fetchExchangeRate()
            ledger.setExchangeRate(rate, Date.now())
            void report(`exchange rate ok: ${rate}`)
            send(200, { ok: true, rate })
          } catch (error) {
            void report(`exchange rate failed: ${String(error?.message ?? error).slice(0, 200)}`)
            send(502, { ok: false, error: String(error?.message ?? error).slice(0, 200) })
          }
          return
        }

        send(404, { error: 'not-found' })
      },
    }), 'dsh-cost: /api/dsh-cost/*')
  })

  function summarize(row) {
    return {
      input: row.input ?? 0, output: row.output ?? 0, cacheRead: row.cacheRead ?? 0,
      cacheWrite: row.cacheWrite ?? 0, reasoning: row.reasoning ?? 0,
      calls: row.calls ?? 0, cost: row.cost ?? 0,
    }
  }

  function mergeDay(a, b) {
    const merged = { ...zeroBuckets(), calls: 0, cost: 0 }
    for (const part of [a, b]) {
      for (const key of Object.keys(zeroBuckets())) merged[key] += part[key] ?? 0
      merged.calls += part.calls ?? 0
      merged.cost += part.cost ?? 0
    }
    return merged
  }

  function currentTier(entry, now, peak) {
    return tierFor(entry, now, peak)
  }
}
  return { apply, Config, inject: typeof moduleInject === 'undefined' ? undefined : moduleInject }
})()

/* ==== module: picker（原 dsh-power-picker） ==== */
const pickerModule = (() => {
/* 由 scripts/build-suite.mjs 从 dsh-power-picker/index.js 机械生成；勿手改，重跑脚本再生成。 */
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







const name = 'power-picker'

const DIAG_LOG = join(homedir(), '.dsh', 'power-picker-debug.log')

const Config = Schema.object({
  /** 关闭后客户端不再注册任何入口，模型选择恢复原样（无需卸载插件）。 */
  enabled: Schema.boolean().default(true).description('是否启用 Codex 风格选择器'),
  /**
   * Codex 实测形态：入口就是输入栏右下角「选择推理强度」按钮，面板从其
   * 上方弹出。默认 true；false 时输入栏不渲染入口（无任何入口）。
   */
  composerSeat: Schema.boolean().default(true).description('输入栏保留模型入口（Codex 同位：右下角，发送键旁）'),
})

function apply(ctx, config) {
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
  return { apply, Config, inject: typeof moduleInject === 'undefined' ? undefined : moduleInject }
})()

/* ==== module: enhancer（原 dsh-prompt-enhancer） ==== */
const enhancerModule = (() => {
/* 由 scripts/build-suite.mjs 从 dsh-prompt-enhancer/index.js 机械生成；勿手改，重跑脚本再生成。 */
/**
 * dsh-prompt-enhancer — 对话框提示词自动增强插件（DeepSeek Harness / dsh）
 *
 * 工作原理：
 *   挂载 `agent/pre-step` 瀑布流。每一步开始前，dsh 会把「即将进入本轮的
 *   用户消息批次」交给所有 pre-step 监听器裁决（PreStepDecision）。本插件
 *   在拿到默认裁决（kind === 'enter'）后，把批次里的纯文本用户消息先发给
 *   一次轻量模型调用，重写成清晰、具体、自包含的提示词，再放行进入会话——
 *   即 WorkBuddy / ChatGPT 风格的「发送前提示词增强」。
 *
 * 安全设计（fail-open）：
 *   增强调用失败、超时、找不到模型路由时，一律原样放行原始消息，
 *   绝不阻塞用户的正常对话。
 *
 * 已核对的 dsh API（deepseek-ai/deepseek-harness，developer preview）：
 *   - PreStepDecision = { kind: 'reject' } | { kind: 'enter', messages: UserMessage[], startsRequestSeries?: true }
 *   - ctx.on('agent/pre-step', async ({ agent }, next) => PreStepDecision)
 *   - ctx.llm.stream({ provider, model, messages }) → AsyncIterable<StreamChunk>
 *     （文本块为 { type: 'text-delta', text }；终帧为 { type: 'finish', reason }）
 *   - createUserMessage({ content, source }) 来自 '@deepseek-ai/dsh-llm'
 *   - defineTool(...) 来自 '@deepseek-ai/dsh-tools'；服务名 'llm' / 'tools'
 */










/** 排查日志：客户端把拦截决策写到这里，出问题时直接看文件。 */
const DEBUG_LOG = join(homedir(), '.dsh', 'prompt-enhancer-debug.log')

const name = 'prompt-enhancer'

const moduleInject = ['llm', 'tools']

const Config = Schema.object({
  /** 总开关：关闭后插件完全不参与 pre-step，也不注册工具行为变化。 */
  enabled: Schema.boolean().default(true).description('是否启用自动提示词增强'),
  /** auto：每条人类消息发送前自动增强；manual：只注册 enhance_prompt 工具，不自动改写。 */
  mode: Schema.union(['auto', 'manual']).default('auto').description('auto=自动增强, manual=仅工具'),
  /** 默认增强强度；前端选择器会覆盖它。off 表示默认不增强。 */
  level: Schema.union(['off', 'low', 'high', 'max']).default('high').description('默认增强强度：off/low/high/max'),
  /**
   * pre-step 兜底增强。默认关闭：前端拦截路径已经负责增强，服务端再动一次
   * 会让「自动增强关闭」失效（用户看不到，消息却被改了）。
   * 只有当前端拦截失效、又确实想要兜底时才手动打开。
   */
  preStepAuto: Schema.boolean().default(false).description('是否在 pre-step 兜底自动增强（默认关闭，前端已负责增强）'),
  /** 留空则跟随当前会话 Agent 的 provider 路由。 */
  provider: Schema.string().description('增强调用使用的 provider（留空跟随会话）'),
  /** 留空则跟随当前会话 Agent 的 model。建议配一个快模型降低延迟。 */
  model: Schema.string().description('增强调用使用的模型（留空跟随会话，建议快模型）'),
  /** 单次增强调用的超时时间，超时即放弃增强、原样放行。 */
  timeoutMs: Schema.number().default(20000).description('增强调用超时（毫秒）'),
  /** 短于该长度（字符）的输入不做增强（如「继续」「ok」）。 */
  minPromptLength: Schema.number().default(4).description('触发增强的最小输入长度（字符）'),
  /** 超过该长度的输入视为已经是完整提示词，不再增强。 */
  maxInputChars: Schema.number().default(4000).description('超过此长度不再增强（字符）'),
  /** 增强后提示词的语言：auto=跟随原始输入。 */
  language: Schema.union(['auto', 'zh', 'en']).default('auto').description('输出语言'),
  /** 追加到内置改写规则之后的自定义风格要求（可为空）。 */
  styleHint: Schema.string().default('').description('自定义风格要求（追加到改写规则后）'),
  /** 增强时把最近一轮会话拼进改写参考：代词/指代（它、这个）能被上下文消解。 */
  useContext: Schema.boolean().default(false).description('参考最近会话上下文（输入框按钮生效）'),
})

/* ------------------------------------------------------------------ */
/* 增强强度分级                                                         */
/* ------------------------------------------------------------------ */

/**
 * 四档强度的差异不在「想得多深」，而在「改多少、补多少、要不要改结构」。
 * 每档给独立的规则、token 上限和长度上限，避免 Max 档把一句话膨胀成论文。
 */
const LEVELS = {
  off: null,
  low: {
    label: 'Low',
    maxTokens: 900,
    maxRatio: 1.4,
    rules: [
      'INTENSITY: LOW (minimal edit).',
      'Change only what is necessary to remove ambiguity. Keep the original wording, tone and length as much as possible.',
      'Do: fix vague pronouns, unclear verbs, missing objects, redundancy, obvious typos. Split run-on sentences.',
      'Do NOT: add new sections, add headings, invent requirements, add constraints the user did not imply, expand into a spec.',
      'Target length: at most 1.4x the original. Shorter is better.',
      'If the input is already clear, return it almost unchanged.',
    ],
  },
  high: {
    label: 'High',
    maxTokens: 1800,
    maxRatio: 2.2,
    rules: [
      'INTENSITY: HIGH (structured completion).',
      'Rewrite into a clear, self-contained, directly executable request. Add the context, constraints and output expectation that a competent assistant would need.',
      'Do: state the goal explicitly, make implicit requirements explicit, specify the expected output form, keep the user\'s intent and scope.',
      'Do NOT: invent facts, technologies, file names or numbers the user never mentioned. When a detail is genuinely unknown, express it conditionally ("if X, then Y") or mark a default as "(default: ...)".',
      'Do NOT: reply with "please confirm these details first" or ask the user anything. That converts the prompt into a conversation. Fill the gap yourself and keep the request executable.',
      'Do NOT: turn the request into a tutorial, a plan, or an answer. It must stay a request.',
      'Prefer flowing paragraphs over markdown headings unless the task is clearly multi-part.',
      'Target length: 1.3x to 2.2x the original. For very short inputs (under 20 characters), 2-4x is fine — a bare phrase needs more scaffolding than a half-written spec.',
    ],
  },
  max: {
    label: 'Max',
    maxTokens: 3200,
    maxRatio: 3.5,
    rules: [
      'INTENSITY: MAX (first-principles reconstruction).',
      'First reason about what outcome the user actually wants, then rebuild the request from that outcome rather than patching the wording.',
      'Do: decompose into goal, context, constraints, deliverables, acceptance criteria when the task warrants it; surface hidden assumptions and mark each one inline as "(assumption: ...)"; make success verifiable.',
      'Do: point out missing critical information as conditional requirements inside the prompt, never as a question back to the user.',
      'Do NOT: invent facts. Every assumption must be labeled.',
      'Do NOT: pad with generic prompt-engineering boilerplate ("You are a world-class expert..."), role-play scaffolding, or restated instructions.',
      'FORMAT: plain text only, because the output lands in a plain-text composer. No "#" headings, no "**bold**", no "-" or "*" bullets, no code fences.',
      'Structure with short labeled lines instead: 目标：/ 背景：/ 约束：/ 产出：/ 验收： (or Goal:/Context:/Constraints:/Deliverables: when writing English). One requirement per line, sub-points indented with two spaces.',
      'Target length: 2x to 3.5x the original. Never exceed 3500 characters.',
    ],
  },
}

/* ------------------------------------------------------------------ */
/* 内置改写元提示词                                                      */
/* ------------------------------------------------------------------ */

// 基础规则来自 WorkBuddy 客户端内置的 enhance-prompt 代理（逆向自 app.asar，
// agentName = 'enhance-prompt'），改写为通用 agent 场景，并按强度分级。
const BASE_RULES = [
  'You are a Prompt Engineering Expert. You rewrite a user\'s rough input into a more effective prompt for an AI assistant that can read files, run commands and write code.',
  '',
  'CORE PRINCIPLES:',
  '- Preserve the user\'s original intent and scope. You are rewriting a request, not answering it.',
  '- Never fabricate specifics the user did not provide: no invented tech stack, file paths, numbers, names, or requirements.',
  '- Keep the output in the exact same language as the input. If the input mixes languages, keep the mix.',
  '- Remove redundancy, resolve ambiguity, make the ask actionable.',
  '- Do NOT explain HOW to do the task, do NOT answer the question, do NOT add a preamble like "Here is the enhanced prompt".',
  '- Do NOT request guides, tutorials, or code snippets unless the user asked for them.',
  '- Do NOT suggest specific technologies unless they appear in the input.',
  '',
  'MISSING INFORMATION — the most important rule:',
  '- NEVER turn a gap into a question for the user. You are writing a prompt that gets executed immediately, not starting a conversation. Output containing "please confirm...", "请先确认...", "我需要知道..." is a failure.',
  '- Handle a gap in one of two ways: state a reasonable default inline as "(default: ...)", or phrase it as a conditional requirement inside the prompt ("if the site requires login, ...").',
  '- Prefer filling in generally applicable constraints (runnable output, dependencies, error handling, acceptance criteria) over interrogating the user about specifics.',
  '- The rewritten prompt must be executable as-is. Whoever reads it should be able to start working without replying first.',
  '',
  'OUTPUT: only the rewritten prompt text. No commentary, no code fences, no quotes around it.',
].join('\n')

function buildMetaPrompt(raw, config, level, contextTurn) {
  const spec = LEVELS[level] ?? LEVELS.high
  const lines = [BASE_RULES, '', spec.rules.join('\n')]
  // 参考上下文：只用于消解指代、贴合讨论，绝不据此发明新需求。
  if (config.useContext && contextTurn?.userText && contextTurn?.assistantText) {
    lines.push(
      '',
      'Recent conversation context (the most recent user/assistant turn). Use it ONLY to resolve references (it / that / 上面提到的) and align the rewrite with the ongoing discussion; never invent requirements from it:',
      '<context>',
      `User: ${contextTurn.userText.slice(-1200)}`,
      `Assistant: ${contextTurn.assistantText.slice(-1200)}`,
      '</context>',
    )
  }
  // WorkBuddy 的提示词已内置「跟随输入语言」；这两个配置只用于强制覆盖。
  if (config.language === 'zh') lines.push('', 'OVERRIDE: write the rewritten prompt in Simplified Chinese.')
  else if (config.language === 'en') lines.push('', 'OVERRIDE: write the rewritten prompt in English.')
  if (config.styleHint && config.styleHint.trim().length > 0) {
    lines.push('', `Additional style requirements from the host config: ${config.styleHint.trim()}`)
  }
  // 用标签包住原文：即使原文本身长得像指令，也不会和改写规则混在一起。
  lines.push('', 'Raw input:', '<original_prompt>', raw, '</original_prompt>')
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* 最近一轮会话捕获（参考上下文用；深度标记模式照搬 followup 模块）      */
/* ------------------------------------------------------------------ */

const llmDepth = new AsyncLocalStorage()
const turnCache = new Map()
const TURN_CACHE_MAX = 24
const TURN_CACHE_TTL_MS = 10 * 60_000

/** options.messages 里最后一条用户消息的纯文本。 */
function lastUserTextOf(messages) {
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (m?.role !== 'user') continue
    const blocks = Array.isArray(m.content) ? m.content : []
    const joined = blocks
      .filter((b) => b?.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('')
    if (joined.trim()) return joined.trim()
  }
  return ''
}

function cachedTurnOf(sessionId) {
  const hit = turnCache.get(sessionId)
  if (!hit) return null
  if (Date.now() - hit.at > TURN_CACHE_TTL_MS) { turnCache.delete(sessionId); return null }
  return hit
}

function rememberTurn(sessionId, userText, assistantText) {
  if (!sessionId || !userText || !assistantText || assistantText.trim().length === 0) return
  const prev = turnCache.get(sessionId)
  // 同一轮的多步工具链 / 重试续流 userText 相同：助手文本追加累积。
  const merged = prev && prev.userText === userText
    ? `${prev.assistantText}\n\n${assistantText}`
    : assistantText
  turnCache.set(sessionId, { userText, assistantText: merged.slice(-6000), at: Date.now() })
  if (turnCache.size > TURN_CACHE_MAX) {
    let oldestKey = null
    let oldestAt = Infinity
    for (const [key, value] of turnCache) {
      if (value.at < oldestAt) { oldestAt = value.at; oldestKey = key }
    }
    if (oldestKey !== null) turnCache.delete(oldestKey)
  }
}

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

/** 提取消息里的纯文本内容；非「聊天框用户消息 / 单个文本块」返回 null（不处理）。 */
function singleTextOf(message) {
  if (!message || message.role !== 'user') return null
  // dsh 内部还会产生 role 为 user、source.kind 为 goal / session-reference /
  // notice 等的消息；它们不是用户在对话框里输入的内容，绝不能改写。
  if (message.source?.kind !== 'user') return null
  if (!Array.isArray(message.content)) return null
  if (message.content.length !== 1) return null
  const block = message.content[0]
  return block && block.type === 'text' && typeof block.text === 'string' ? block.text : null
}

/** 判断是否应该跳过增强。 */
function shouldSkip(text, config) {
  if (!text) return true
  const trimmed = text.trim()
  if (trimmed.length === 0) return true
  // 斜杠命令（/plan、/goal 等）绝不改写
  if (trimmed.startsWith('/')) return true
  if (trimmed.length < config.minPromptLength) return true
  if (trimmed.length > config.maxInputChars) return true
  return false
}

/** 去掉模型输出里常见的包裹物：代码围栏、引号、前缀说明行。 */
function cleanModelOutput(text) {
  let out = String(text ?? '').trim()
  // 去掉成对代码围栏 ```...```（含语言标注）
  const fence = out.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/)
  if (fence) out = fence[1].trim()
  // 去掉「增强后提示词：」「Enhanced prompt:」之类前缀行
  out = out.replace(/^(?:enhanced prompt|提示词增强|增强后的提示词|改写后(?:的提示词)?)\s*[:：]\s*/i, '')
  // 去掉最外层成对引号
  const q = out.match(/^"([\s\S]*)"$|^“([\s\S]*)”$/)
  if (q) out = (q[1] ?? q[2]).trim()
  // 兜底去 markdown：输入框是纯文本，留着 # 和 ** 只会变成噪音
  out = out
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^(\s*)[-*]\s+/gm, '$1· ')
  return out
}

/** 调一次 LLM 做改写；任何失败都抛错，由上层兜底放行。 */
async function rewriteWithLlm(ctx, route, raw, config, level, outerSignal, contextTurn) {
  const spec = LEVELS[level] ?? LEVELS.high
  // 超时与外部取消（用户中断 pre-step）收敛到同一个内部 signal，
  // 底层流会被及时中断，不会在后台继续烧 token。
  const controller = new AbortController()
  const forwardAbort = () => controller.abort(outerSignal.reason)
  if (outerSignal?.aborted) forwardAbort()
  else outerSignal?.addEventListener('abort', forwardAbort, { once: true })
  const timer = setTimeout(
    () => controller.abort(new Error('prompt-enhancer timeout')),
    config.timeoutMs,
  )

  const aborted = new Promise((_, reject) => {
    const fail = () => reject(controller.signal.reason ?? new Error('prompt-enhancer aborted'))
    // 外层 signal 可能一开始就已 abort：先检查，再挂监听。
    if (controller.signal.aborted) fail()
    else controller.signal.addEventListener('abort', fail, { once: true })
  })
  // 成功路径下 aborted 不会被消费，挂空 catch 避免 unhandled rejection。
  void aborted.catch(() => {})

  // 给 dsh-cost 的计量通道打来源标记：增强调用单独归类，费用弹卡里才能
  // 把「增强」和「对话」分开算。5 秒窗口足够覆盖一次调用的启动。
  globalThis.__dshPluginCall = { source: 'enhance', at: Date.now() }

  const iterator = ctx.llm.stream({
    provider: route.provider,
    model: route.model,
    messages: [{ role: 'user', content: [{ type: 'text', text: buildMetaPrompt(raw, config, level, contextTurn) }] }],
    maxTokens: spec.maxTokens,
    signal: controller.signal,
  })[Symbol.asyncIterator]()

  async function collect() {
    let text = ''
    for (;;) {
      // 深度标记内拉取：改写调用自己的流不进会话轮缓存。
      const result = await llmDepth.run(1, () => iterator.next())
      const { done, value } = result
      if (done) break
      if (value.type === 'text-delta') text += value.text
      else if (value.type === 'finish' && value.reason && (value.reason.kind === 'error' || value.reason.kind === 'aborted')) {
        throw new Error(`prompt-enhancer llm ${value.reason.kind}: ${value.reason.failure?.message ?? 'unknown'}`)
      }
    }
    return text
  }

  try {
    const collected = await Promise.race([collect(), aborted])
    const cleaned = cleanModelOutput(collected)
    if (!cleaned) throw new Error('prompt-enhancer got empty output')
    // 失控保护：模型把一句话膨胀成小作文时判失败，回退原文而不是塞给用户。
    // 短输入天然膨胀率高（12 字补成 300 字是合理的），所以保底 600 字；
    // 长输入按倍数算，但封顶 4000 字，避免 4000 字输入算出 2 万字上限。
    const limit = Math.min(Math.max(Math.round(raw.length * spec.maxRatio * 1.6), 600), 4000)
    if (cleaned.length > limit) {
      throw new Error(`prompt-enhancer output runaway: ${cleaned.length} chars > ${limit}`)
    }
    return cleaned
  } catch (err) {
    // 中断底层流，避免失败后还在后台烧 token。
    // 不 await：底层若卡死，等待 return() 会拖住 fail-open。
    try {
      const closing = iterator.return?.()
      if (closing && typeof closing.catch === 'function') closing.catch(() => {})
    } catch { /* ignore */ }
    throw err
  } finally {
    clearTimeout(timer)
    outerSignal?.removeEventListener('abort', forwardAbort)
  }
}

/* ------------------------------------------------------------------ */
/* 插件入口                                                            */
/* ------------------------------------------------------------------ */

function apply(ctx, config) {
  // 运行时可变副本：POST /settings 改这里，立即生效；显式改过的键持久化
  // 到 storages、启动时回放（没改过的键继续跟随宿主配置）。
  const live = { ...config }

  // 设置持久化：只落与 config 不同的键，防抖 400ms 原子写。必须先回放
  // 再初始化 currentLevel，重启后上次的强度档位才生效。
  const SETTINGS_KEYS = ['level', 'mode', 'preStepAuto', 'language', 'styleHint', 'timeoutMs', 'minPromptLength', 'maxInputChars', 'useContext']
  const SETTINGS_PATH = join(homedir(), '.dsh', 'storages', 'prompt-enhancer', 'settings.json')
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

  const log = (level, msg) => console[level === 'error' ? 'error' : 'log'](`[dsh-prompt-enhancer] ${msg}`)

  /** 最近一次见到的会话路由，供 enhance_prompt 工具和 web 端点在没有显式配置时复用。 */
  let lastRoute = null

  /**
   * 运行时增强强度。前端选择器通过 /api/prompt-enhancer/settings 改这里，
   * 让 pre-step 与手动按钮共用同一档位。初始值来自配置。
   */
  let currentLevel = Object.prototype.hasOwnProperty.call(LEVELS, live.level) ? live.level : 'high'

  /**
   * 前端刚增强过的文本指纹。发送拦截路径增强完再 submit 时，pre-step 会再看到
   * 这条消息；用它去重，避免同一句话被改两遍。两分钟自动过期。
   */
  const recentEnhanced = new Map()
  const DEDUPE_TTL = 120_000

  function fingerprint(text) {
    let h = 0
    for (let i = 0; i < text.length; i++) {
      h = (h * 31 + text.charCodeAt(i)) | 0
    }
    return `${text.length}:${h}`
  }

  function rememberEnhanced(text) {
    const now = Date.now()
    for (const [key, ts] of recentEnhanced) {
      if (now - ts > DEDUPE_TTL) recentEnhanced.delete(key)
    }
    recentEnhanced.set(fingerprint(text), now)
  }

  function wasJustEnhanced(text) {
    const ts = recentEnhanced.get(fingerprint(text))
    return ts !== undefined && Date.now() - ts < DEDUPE_TTL
  }

  /**
   * 全局默认模型选择（composer 里的模型选择器改的就是它），
   * 让输入框按钮在「会话还没创建、没有 agent」时也能拿到路由。
   */
  function defaultRoute() {
    const defaults = ctx.get('agentDefaultModel')
    const selection = defaults?.currentSelection?.()
    return selection?.provider && selection?.model
      ? { provider: selection.provider, model: selection.model }
      : null
  }

  /** 配置里显式指定的路由。 */
  function configRoute() {
    return live.provider && live.model ? { provider: live.provider, model: live.model } : null
  }

  function resolveRoute(agent) {
    const provider = agent?.options?.provider
    const model = agent?.options?.model
    return configRoute()
      ?? (provider && model ? { provider, model } : null)
      ?? defaultRoute()
  }

  /** web 端点没有 agent：配置 > 最近一次会话路由 > 全局默认选择。 */
  function endpointRoute() {
    return configRoute() ?? lastRoute ?? defaultRoute()
  }

  // 会话一建立就记住路由，这样输入框按钮在「还没发过消息」时也能工作。
  ctx.on('agent/created', ({ agent }) => {
    const route = resolveRoute(agent)
    if (route) lastRoute = route
  })

  /** 对单条消息做增强；不需要增强时原样返回同一个对象。 */
  async function enhanceOne(message, agent, signal) {
    const raw = singleTextOf(message)
    if (raw === null || shouldSkip(raw, config)) return message
    // 前端发送拦截路径已经增强过，这里放行，避免二次改写。
    if (wasJustEnhanced(raw.trim())) return message
    const level = currentLevel
    if (!level || level === 'off') return message
    const route = resolveRoute(agent) ?? lastRoute
    if (!route) return message
    if (!llmRef) return message // llm 服务尚未就绪（inject 未解析完）：fail-open 放行原文
    const enhanced = await rewriteWithLlm({ llm: llmRef }, route, raw.trim(), config, level, signal)
    log('log', `enhanced[${level}] ${raw.trim().length} -> ${enhanced.length} chars`)
    // 用官方工厂重建消息：获得全新稳定 id，source 沿用原消息
    return createUserMessage({
      content: [{ type: 'text', text: enhanced }],
      source: message.source,
    })
  }

  /** 批量增强；没有任何改动时原样返回原数组。 */
  async function enhanceBatch(messages, agent, signal) {
    const out = []
    let changed = false
    for (const message of messages) {
      let next = message
      try {
        next = await enhanceOne(message, agent, signal)
      } catch (err) {
        // fail-open：增强失败绝不阻塞对话
        log('error', `enhance failed, pass through original: ${err?.message ?? err}`)
        next = message
      }
      if (next !== message) changed = true
      out.push(next)
    }
    return changed ? out : messages
  }

  // pre-step 自动增强用的 llm 引用：在下方嵌套 inject 作用域里捕获。
  // 套件宿主不按插件级 inject 并集给顶层作用域授权属性访问——真机 0.3.0：
  // suite 联合声明了 tools，apply 里 ctx.tools 仍报 cannot get property
  // without inject；0.3.2 同款实锤蔓延到请求期 ctx.llm（/rewrite 全挂）。
  // 凡要用的服务，必须写进所在嵌套作用域自己的 inject 数组。
  let llmRef = null

  if (live.enabled) {
    // 最近一轮会话捕获：输入框按钮带 sessionId 来取（参考上下文开关）。
    // 自己的改写调用经 llmDepth 标记透传，不会被误当成对话轮。
    ctx.on('llm/stream', (options, next) => {
      if (llmDepth.getStore() !== undefined) return next()
      const downstream = next()
      const sessionId = typeof options?.sessionId === 'string' ? options.sessionId : ''
      const userText = lastUserTextOf(options?.messages)
      let assistantText = ''
      let downstreamIter = null
      let completed = false
      return (async function* peObserve() {
        try {
          downstreamIter = downstream[Symbol.asyncIterator]()
          for (;;) {
            const result = await llmDepth.run(1, () => downstreamIter.next())
            if (result.done) break
            const chunk = result.value
            if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
              assistantText += chunk.text
              if (assistantText.length > 8000) assistantText = assistantText.slice(-4000)
            }
            yield chunk
          }
          completed = true
        } finally {
          if (!completed) {
            try { await downstreamIter?.return?.() } catch { /* ignore */ }
          }
          try { rememberTurn(sessionId, userText, assistantText) } catch { /* 缓存失败不影响主对话流 */ }
        }
      })()
    }, { global: true })

    ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
      const decision = await next()
      if (decision.kind !== 'enter') return decision
      const route = resolveRoute(agent)
      if (route) lastRoute = route
      if (live.mode !== 'auto') return decision
      // 前端拦截发送并自行增强时，这里不再二次增强（否则同一句话被改两遍）。
      if (!live.preStepAuto) return decision
      const messages = await enhanceBatch(decision.messages, agent, signal)
      if (messages === decision.messages) return decision
      // spread 保留未来新增的 decision 字段
      return { ...decision, messages }
    })

    // 注册模型可调用的工具：agent 自己也能主动增强某段提示词。
    // 显式嵌套声明 ['llm','tools']（原因见上方 llmRef 注释）；顺手捕获
    // llm 引用，execute 里也不能用外层 ctx（同款报错，见 0.3.2）。
    ctx.inject(['llm', 'tools'], (scope) => {
      llmRef = scope.llm
      scope.tools.register(defineTool({
        name: 'enhance_prompt',
        description: [
          'Rewrite a rough user prompt into a clear, specific, self-contained prompt before using it.',
          'Use it when the user asks to improve/expand their prompt, or before re-running a vague earlier request.',
        ].join(' '),
        parameters: {
          prompt: { type: 'string', required: true, description: 'The raw prompt text to enhance' },
        },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        async execute(args, exec) {
          const route = endpointRoute()
          if (!route) throw new Error('No model route available: set provider/model in the plugin config.')
          const level = currentLevel === 'off' ? 'high' : currentLevel
          const enhanced = await rewriteWithLlm(scope, route, String(args.prompt ?? '').trim(), config, level, exec?.signal)
          return enhanced
        },
      }))
    })

    log('log', `loaded (mode=${live.mode}, timeout=${live.timeoutMs}ms)`)
  } else {
    log('log', 'loaded but disabled by config')
  }

  /* ------------------------------------------------------------------ */
  /* web 端「增强提示词」端点（只在有 webServer 的宿主里注册）              */
  /* ------------------------------------------------------------------ */

  // 可选注入：CLI / TUI 等没有 webServer 的宿主照常加载，只是没有输入框按钮。
  // webServer 作用域里请求期要调 llm：必须写进这个嵌套作用域自己的 inject
  // （真机 0.3.1：/rewrite 里 rewriteWithLlm(ctx) 报 cannot get property
  // "llm" without inject——顶层并集不授权属性访问，见上方 llmRef 注释）。
  ctx.inject(['webServer', 'llm'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: '/api/prompt-enhancer',
      handler: async (req, res) => {
        const send = (status, body) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        const path = (req.url ?? '').split('?')[0].replace(/^\/api\/prompt-enhancer/, '')

        // 前端初始化：读当前档位，避免刷新后选择器回落到默认值。
        if (path === '/settings' && req.method === 'GET') {
          send(200, { ...live, level: currentLevel, levels: Object.keys(LEVELS) })
          return
        }

        // 前端改档位：写进运行时状态，让 pre-step 与按钮共用同一档。
        if (path === '/settings' && req.method === 'POST') {
          let raw = ''
          for await (const chunk of req) raw += chunk
          let body
          try {
            body = JSON.parse(raw)
          } catch {
            send(400, { error: 'invalid-json' })
            return
          }
          // level 是运行时主开关，必须合法；其余字段宽松校验后写入 live。
          if (body?.level !== undefined) {
            const next = body.level
            if (typeof next !== 'string' || !(next in LEVELS)) {
              send(400, { error: `level must be one of ${Object.keys(LEVELS).join('/')}` })
              return
            }
            currentLevel = next
            live.level = next
            log('log', `level -> ${next}`)
          }
          if (body?.mode === 'auto' || body?.mode === 'manual') live.mode = body.mode
          if (body?.preStepAuto !== undefined) live.preStepAuto = body.preStepAuto === true
          if (body?.useContext !== undefined) live.useContext = body.useContext === true
          if (body?.language === 'auto' || body?.language === 'zh' || body?.language === 'en') live.language = body.language
          if (typeof body?.styleHint === 'string') live.styleHint = body.styleHint.slice(0, 500)
          for (const [key, min, max] of [['timeoutMs', 1000, 120000], ['minPromptLength', 1, 200], ['maxInputChars', 100, 100000]]) {
            if (body?.[key] === undefined) continue
            const value = Number(body[key])
            if (Number.isFinite(value)) live[key] = Math.min(max, Math.max(min, Math.round(value)))
          }
          persistSettings()
          send(200, { ...live, level: currentLevel })
          return
        }

        // 前端把拦截决策写进 ~/.dsh/prompt-enhancer-debug.log，排查用。
        if (path === '/debug' && req.method === 'POST') {
          let raw = ''
          for await (const chunk of req) raw += chunk
          try {
            await mkdir(dirname(DEBUG_LOG), { recursive: true })
            await appendFile(DEBUG_LOG, `${new Date().toISOString()} ${raw}\n`, 'utf8')
          } catch (err) {
            log('error', `debug log failed: ${err?.message ?? err}`)
          }
          send(200, { ok: true })
          return
        }

        if (path !== '/rewrite') {
          send(404, { error: 'not-found' })
          return
        }
        if (req.method !== 'POST') {
          res.setHeader('allow', 'POST')
          send(405, { error: 'method-not-allowed' })
          return
        }
        let raw = ''
        for await (const chunk of req) raw += chunk
        let body
        try {
          body = JSON.parse(raw)
        } catch {
          send(400, { error: 'invalid-json' })
          return
        }
        const text = typeof body?.text === 'string' ? body.text.trim() : ''
        if (text.length === 0) {
          send(400, { error: 'text must be a non-empty string' })
          return
        }
        if (text.length > live.maxInputChars) {
          send(413, { error: `text exceeds ${live.maxInputChars} chars` })
          return
        }
          // 单次请求可以覆盖档位（发送拦截路径会带上当前选择），否则用运行时档位。
          const requested = typeof body?.level === 'string' && body.level in LEVELS ? body.level : currentLevel
          const level = requested === 'off' ? null : requested
          if (!level) {
            send(200, { text, skipped: 'level-off' })
            return
          }
          const route = endpointRoute()
          if (!route) {
            send(409, { error: 'no model route available; set provider/model in the plugin config' })
            return
          }
          // 参考上下文开关：前端带 sessionId，服务端取该会话最近一轮。
          const contextTurn = live.useContext && typeof body?.sessionId === 'string'
            ? cachedTurnOf(body.sessionId)
            : null
          try {
            const enhanced = await rewriteWithLlm(webCtx, route, text, config, level, undefined, contextTurn)
          // 记下指纹：这条文本随后经 submit 进入 pre-step 时不再二次增强。
          rememberEnhanced(enhanced)
          send(200, { text: enhanced, level })
        } catch (err) {
          log('error', `composer enhance failed: ${err?.message ?? err}`)
          // 落盘：服务端错误只进 console 等于没有（排障教训）。
          try {
            await mkdir(dirname(DEBUG_LOG), { recursive: true })
            await appendFile(DEBUG_LOG, `${new Date().toISOString()} ${JSON.stringify({ phase: 'rewrite-error', error: String(err?.message ?? err).slice(0, 200) })}\n`, 'utf8')
          } catch { /* ignore */ }
          send(502, { error: 'enhance-failed' })
        }
      },
    }), 'prompt-enhancer: /api/prompt-enhancer/*')
  })
}
  return { apply, Config, inject: typeof moduleInject === 'undefined' ? undefined : moduleInject }
})()

/* ==== module: followup（原 dsh-followup） ==== */
const followupModule = (() => {
/* 由 scripts/build-suite.mjs 从 dsh-followup/index.js 机械生成；勿手改，重跑脚本再生成。 */
/**
 * dsh-followup — 每轮对话结束后的智能跟进推荐（DeepSeek Harness / dsh）
 *
 * Trae「智能跟进推荐」的同款交互：助手回复落定后，用一次轻量模型调用
 * 生成 2-3 条短跟进建议，缓存在内存里；web 端在输入框上方浮出可点击
 * 的 chip，点击把建议填进草稿（不自动发送）。
 *
 * 工作原理（服务端半）：
 *   主通道（0.2.3 起，借鉴 dsh-cost-meter 的链尾监听模式）：
 *   - ctx.on('llm/stream', listener, { global: true })：llm 服务的瀑布事件，
 *     每次 ctx.llm.stream() 都会经过。监听器拿到下游流后包一层旁路观察
 *     （逐 chunk 透传，不改流协议），累积 text-delta 得到助手回复；
 *     options.sessionId（GenerateOptions.sessionId，dsh-reference types.ts）
 *     关联会话，options.messages 里最后一个真实用户消息作为本轮输入。
 *     { global: true } 让监听器收到隔离 llm 作用域（记忆插件等）的流。
 *     AsyncLocalStorage 深度标记排除两类重复捕获：包装路由插件在自己
 *     stream() 体内再发起的上游调用（pull 下游时打标记），以及本插件
 *     自己发起的建议生成调用（发起时打标记）。
 *   回落通道：
 *   - 客户端回合落定后 POST /generate {sessionId}；服务端优先用 llm/stream
 *     实时捕获的缓存（10 分钟内），未命中才解压 session.v4.jsonl.zstd 直读
 *     （日志驱动，0.2.0 引入，对新架构进程分裂免疫）
 *   旧架构事件监听（agent/pre-step / assistant-stream / status）保留：
 *   收不到事件的宿主上它们是死代码，旧版本 dsh 上仍可用。
 *
 * 已核对的 dsh API（deepseek-ai/deepseek-harness，对照 dsh-reference）：
 *   - ctx.on('llm/stream', (options, next) => AsyncIterable, { global: true })
 *     监听器契约：必须调用 next() 推进瀑布并返回（包装的）流；嵌套/排除
 *     时原样返回 next() 的下游
 *   - GenerateOptions.sessionId?: Branded<'SessionId'>（packages/llm/llm/src/types.ts）
 *   - ctx.on('agent/status', ({ agent, status }) => ...)   // idle ⇄ running
 *   - ctx.on('agent/pre-step', async ({ agent, messages }, next) => PreStepDecision)
 *   - ctx.on('agent/assistant-stream', ({ agent, frame }) => ...)
 *     frame = { type: 'start' | 'chunk' | 'end', chunk?: StreamChunk, ... }
 *     文本块 chunk = { type: 'text-delta', text }
 *   - ctx.llm.stream({ provider, model, messages, maxTokens, signal })
 *     → AsyncIterable<{ type: 'text-delta', text } | { type: 'finish', reason }>
 *   - agent.options.provider / agent.options.model：会话当前的路由
 *   - ctx.get('agentDefaultModel')?.currentSelection?.() → { provider, model }
 *   - webServer.register({ kind: 'prefix', path, handler }, label)
 */








const name = 'followup'

const DIAG_LOG = join(homedir(), '.dsh', 'followup-debug.log')
const SESSIONS_ROOT = join(homedir(), '.dsh', 'sessions')
const PROFILES_ROOT = join(homedir(), '.dsh', 'profiles')
const SUGGEST_FILE = join(homedir(), '.dsh', 'followup-suggestions.json')

/** 每环节一行落盘：事件是否到、文本抓没抓到、生成成没成，一次复现即可定位断点。 */
const report = async (line) => {
  try {
    await mkdir(dirname(DIAG_LOG), { recursive: true })
    await appendFile(DIAG_LOG, `${new Date().toISOString()} ${line}\n`, 'utf8')
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* 会话日志直读（新架构进程分裂后 agent/* 事件到不了插件进程，           */
/* 0.2.0 起改为日志驱动：解压 session.v4.jsonl.zstd 取最后一轮文本）    */
/* ------------------------------------------------------------------ */

/** 多帧 zstd（追加写每帧独立）：按魔数切段逐帧解压，坏帧跳过。 */
async function decompressLog(file) {
  const zlib = await import('node:zlib')
  if (typeof zlib.zstdDecompressSync !== 'function') {
    throw new Error('node zlib 无 zstd 支持（需 Node ≥23.8）')
  }
  const buf = await readFile(file)
  const MAGIC = 0x28
  const idxs = [0]
  for (let i = 4; i <= buf.length - 4; i += 1) {
    if (buf[i] === MAGIC && buf[i + 1] === 0xB5 && buf[i + 2] === 0x2F && buf[i + 3] === 0xFD) idxs.push(i)
  }
  let out = ''
  for (let k = 0; k < idxs.length; k += 1) {
    try {
      out += zlib.zstdDecompressSync(buf.subarray(idxs[k], idxs[k + 1] ?? buf.length)).toString('utf8')
    } catch { /* 截断/坏帧跳过 */ }
  }
  return out
}

/** 找会话日志文件：目录名可能是裸 uuid 或 session-<uuid>。 */
async function findSessionFile(sessionId) {
  const bare = String(sessionId).replace(/^session-/, '')
  let workspaces = []
  try { workspaces = await readdir(SESSIONS_ROOT, { withFileTypes: true }) } catch { return null }
  for (const ws of workspaces) {
    if (!ws.isDirectory()) continue
    for (const name of [sessionId, `session-${bare}`, bare]) {
      const file = join(SESSIONS_ROOT, ws.name, name, 'session.v4.jsonl.zstd')
      try { await readFile(file); return file } catch { /* 尝试下一个 */ }
    }
  }
  return null
}

/** 从持久日志提取最后一轮：最后一个真实用户消息 + 其后最后的助手文本。 */
async function lastTurnFromLog(sessionId) {
  const file = await findSessionFile(sessionId)
  if (!file) return null
  const text = await decompressLog(file)
  const events = []
  for (const line of text.split('\n')) {
    if (line.length === 0) continue
    try { events.push(JSON.parse(line)) } catch { /* 半行跳过 */ }
  }
  const isRealUser = (e) => e?.type === 'user/message'
    && e.data?.source?.kind === 'user'
    && Array.isArray(e.data.content) && e.data.content.length === 1
    && e.data.content[0]?.type === 'text' && typeof e.data.content[0].text === 'string'
  const isAssistant = (e) => e?.type === 'assistant/message'
  let assistantText = null
  let userText = null
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]
    if (assistantText === null && isAssistant(e)) {
      const blocks = e.data?.message?.content
      if (Array.isArray(blocks)) {
        const joined = blocks.filter((b) => b?.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text).join('')
        if (joined.trim().length > 0) assistantText = joined
      }
      continue
    }
    if (assistantText !== null && isRealUser(e)) {
      userText = e.data.content[0].text
      break
    }
  }
  if (userText === null || assistantText === null) return null
  return { userText: userText.trim(), assistantText: assistantText.trim() }
}

/** 从 profile 用户补丁层读 agent-default-model 的 provider/model（兜底路由）。 */
async function patchDefaultRoute() {
  let profiles = []
  try { profiles = await readdir(PROFILES_ROOT, { withFileTypes: true }) } catch { return null }
  for (const p of profiles) {
    if (!p.isDirectory()) continue
    try {
      const raw = await readFile(join(PROFILES_ROOT, p.name, 'cordis.patch.yml'), 'utf8')
      const m = raw.match(/id:\s*agent-default-model[\s\S]{0,300}?provider:\s*(\S+)[\s\S]{0,120}?model:\s*(\S+)/)
      if (m) return { provider: m[1].replace(/^['"]|['"]$/g, ''), model: m[2].replace(/^['"]|['"]$/g, '') }
    } catch { /* 下一个 profile */ }
  }
  return null
}

const moduleInject = ['llm']

const Config = Schema.object({
  /** 总开关：关闭后不监听任何事件，也不注册 web 端点。 */
  enabled: Schema.boolean().default(true).description('是否启用智能跟进推荐'),
  /** 留空则跟随会话当前模型（agent.options）。 */
  provider: Schema.string().description('生成建议使用的 provider（留空跟随会话）'),
  /** 建议配一个快模型：这条调用在每轮回复结束后立刻发生。 */
  model: Schema.string().description('生成建议使用的模型（留空跟随会话，建议快模型）'),
  /** 单次生成超时；超时即放弃本轮建议。 */
  timeoutMs: Schema.number().default(12000).description('生成超时（毫秒）'),
  /** 回合落定后等多久再生成：缓冲多步回合的中间 idle。 */
  idleDelayMs: Schema.number().default(1200).description('回合结束后的缓冲时间（毫秒）'),
  /** 生成几条建议（最多 3）。 */
  maxSuggestions: Schema.number().default(2).description('最多生成几条建议（1-2）'),
  /** 上下文裁剪：超出截断，控制这条调用的 token 开销。 */
  userChars: Schema.number().default(400).description('用户消息最多带多少字符'),
  assistantChars: Schema.number().default(1200).description('助手回复最多带多少字符'),
  /** 助手回复短于此不生成：「好的」「完成」这类没有可跟进的实质内容。 */
  minAssistantChars: Schema.number().default(30).description('助手回复最小长度（字符）'),
})

/* ------------------------------------------------------------------ */
/* 提示词与解析                                                         */
/* ------------------------------------------------------------------ */

function clampTail(text, limit) {
  const clean = typeof text === 'string' ? text.trim() : ''
  if (clean.length <= limit) return clean
  return `…${clean.slice(-limit)}`
}

function buildPrompt(userText, assistantText, count, config) {
  return [
    `You generate follow-up suggestions for an AI chat session (DeepSeek Harness). Based on the exchange below, propose ${count} short follow-up prompts the user would most plausibly send next.`,
    '',
    'Rules:',
    '- Continue the conversation: refine, extend, verify or apply the assistant\'s last answer. Never generic filler like "还有吗" / "继续" / "tell me more".',
    '- One imperative sentence each: 8~24 Chinese characters or 6~16 English words. No trailing period, no quotes, no numbering, no emoji.',
    '- They must be sendable as-is: self-contained requests, not fragments.',
    '- Write in the same language as the exchange.',
    '- Output STRICT JSON only: an array of strings, nothing else. Example: ["第一条建议","第二条建议"]',
    '',
    '[User]',
    clampTail(userText, config.userChars),
    '',
    '[Assistant]',
    clampTail(assistantText, config.assistantChars),
  ].join('\n')
}

/** 从模型输出里抠 JSON 数组；抠不出就返回空数组，宁缺毋滥。 */
function parseSuggestions(text, count) {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let parsed
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().replace(/^[-*•\d.)、\s]+/, '').slice(0, 60))
    .filter((item) => item.length >= 2)
    .slice(0, count)
}

/* ------------------------------------------------------------------ */
/* 插件入口                                                             */
/* ------------------------------------------------------------------ */

function apply(ctx, config) {
  // 运行时可变副本：POST /settings 改这里，立即生效；显式改过的键持久化
  // 到 storages、启动时回放（没改过的键继续跟随宿主配置）。
  const live = { ...config }
  if (!live.enabled) return

  // 设置持久化：只落与 config 不同的键，防抖 400ms 原子写。
  const SETTINGS_KEYS = ['maxSuggestions', 'idleDelayMs', 'timeoutMs', 'minAssistantChars', 'userChars', 'assistantChars']
  const SETTINGS_PATH = join(homedir(), '.dsh', 'storages', 'dsh-followup', 'settings.json')
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

  void report(`server boot v0.3.3 enabled=true minAssistantChars=${live.minAssistantChars} idleDelayMs=${live.idleDelayMs} route=${live.provider || ''}/${live.model || ''}(follow-session)`)

  /** 每个 agent 的对话尾部累积：userText 来自 pre-step，assistantText 来自流帧。 */
  const buffers = new WeakMap()
  const seenFrameTypes = new Set()
  let bufCounter = 0
  const agentConstructorName = (agent) => (agent === undefined || agent === null
    ? 'none'
    : `${agent.constructor?.name ?? typeof agent}`)
  const bufferOf = (agent) => {
    let buf = buffers.get(agent)
    if (buf === undefined) {
      buf = { id: ++bufCounter, userText: '', assistantText: '', controller: null }
      buffers.set(agent, buf)
      void report(`buffer new #${buf.id} for agent=${agentConstructorName(agent)}`)
    }
    return buf
  }

  /** 供 web 端拉取的最近一份建议；seq 递增，客户端凭它去重。 */
  let latest = { seq: 0, suggestions: [], at: 0 }
  /** 最近一次生成的上下文，供「换一批」重生成。 */
  let lastContext = null
  let seqCounter = 0
  let pendingTimer = 0

  /* -- 建议持久化（0.2.4）：重启后打开会话还能拿到最近一轮的建议 ----- */
  /** sessionId → { seq, suggestions, at }，boot 时读回，成功生成时写入。 */
  let persisted = {}
  try {
    persisted = JSON.parse(readFileSync(SUGGEST_FILE, 'utf8'))
    if (!persisted || typeof persisted !== 'object') persisted = {}
    for (const entry of Object.values(persisted)) {
      if (Number.isInteger(entry?.seq) && entry.seq > seqCounter) seqCounter = entry.seq
    }
    say('info', `restored ${Object.keys(persisted).length} persisted suggestion set(s)`)
  } catch { /* 首次或损坏：空表开始 */ }

  function persistSuggestions(sessionId, seq, suggestions) {
    if (!sessionId || !Array.isArray(suggestions) || suggestions.length === 0) return
    persisted[sessionId] = { seq, suggestions, at: Date.now() }
    const keys = Object.keys(persisted)
    if (keys.length > 24) {
      let oldest = null
      let oldestAt = Infinity
      for (const key of keys) {
        if (persisted[key].at < oldestAt) { oldestAt = persisted[key].at; oldest = key }
      }
      if (oldest !== null) delete persisted[oldest]
    }
    void writeFile(SUGGEST_FILE, `${JSON.stringify(persisted)}\n`, 'utf8')
      .catch(() => { /* 持久化失败不影响主流程 */ })
  }

  /** Trae 逻辑：建议属于「每轮响应」——本轮没有新建议就清掉该会话的旧建议。 */
  function clearSuggestions(sessionId) {
    if (!sessionId || !(sessionId in persisted)) return
    delete persisted[sessionId]
    void writeFile(SUGGEST_FILE, `${JSON.stringify(persisted)}\n`, 'utf8')
      .catch(() => { /* ignore */ })
  }

  const say = (level, message) => {
    try {
      console[level === 'error' ? 'error' : 'info'](`[dsh-followup] ${message}`)
    } catch { /* ignore */ }
  }

  function singleTextOf(message) {
    if (!message || message.role !== 'user') return null
    // dsh 内部还有 goal / session-reference / notice 等来源的 user 消息，
    // 不是用户在对话框里输入的内容，不进上下文。
    if (message.source?.kind !== 'user') return null
    if (!Array.isArray(message.content) || message.content.length !== 1) return null
    const block = message.content[0]
    return block && block.type === 'text' && typeof block.text === 'string' ? block.text : null
  }

  /** llm/stream 捕获用：请求 messages 里最后一个真实用户文本。 */
  function singleTextOfLastUser(messages) {
    if (!Array.isArray(messages)) return null
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const text = singleTextOf(messages[i])
      if (text !== null) return text
    }
    return null
  }

  function defaultRoute() {
    const defaults = ctx.get('agentDefaultModel')
    const selection = defaults?.currentSelection?.()
    return selection?.provider && selection?.model
      ? { provider: selection.provider, model: selection.model }
      : null
  }

  function configRoute() {
    return live.provider && live.model ? { provider: live.provider, model: live.model } : null
  }

  function resolveRoute(agent) {
    const provider = agent?.options?.provider
    const model = agent?.options?.model
    return configRoute()
      ?? (provider && model ? { provider, model } : null)
      ?? defaultRoute()
  }

  function cancelPending(buf, reason) {
    if (buf.controller) {
      try { buf.controller.abort(new Error(reason)) } catch { /* ignore */ }
      buf.controller = null
    }
  }

  /* -- 事件监听：拼出对话尾部（旧架构回落通道） ---------------------- */
  /* 新架构进程分裂下这些 agent/* 事件到不了插件进程（0.1.x 实证零事件），
     保留是为了旧版本 dsh 仍然可用；新架构走上面的 llm/stream 捕获 + 日志回落。 */

  ctx.on('agent/pre-step', async ({ agent, messages }, next) => {
    const buf = bufferOf(agent)
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const text = singleTextOf(messages[i])
      if (text !== null) { buf.userText = text; break }
    }
    buf.assistantText = ''
    // 用户已经开始说下一句：上一份没生成的建议直接作废。
    cancelPending(buf, 'superseded by next user message')
    void report(`pre-step buf#${buf.id} agent=${agentConstructorName(agent)} msgs=${messages.length} userLen=${(buf.userText ?? '').length} userHead=${JSON.stringify((buf.userText ?? '').slice(0, 40))}`)
    return next()
  })

  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    const buf = bufferOf(agent)
    if (frame?.type && !seenFrameTypes.has(frame.type)) {
      seenFrameTypes.add(frame.type)
      void report(`stream frame-type first-seen: ${frame.type} agent=${agentConstructorName(agent)}`)
    }
    if (frame?.type === 'start') { buf.assistantText = ''; return }
    const chunk = frame?.type === 'chunk' ? frame.chunk : null
    if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
      buf.assistantText += chunk.text
      // 超长回复只保留尾部，控制内存。
      if (buf.assistantText.length > 20000) buf.assistantText = buf.assistantText.slice(-10000)
      return
    }
    if (frame?.type === 'end') {
      void report(`stream end buf#${buf.id} agent=${agentConstructorName(agent)} assistantLen=${(buf.assistantText ?? '').length}`)
    }
  })

  ctx.on('agent/status', ({ agent, status }) => {
    const buf = bufferOf(agent)
    if (status !== 'idle') {
      // 回合重新运转（工具链下一步）：撤销缓冲中的生成计划。
      cancelPending(buf, 'agent running again')
      if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = 0 }
      return
    }
    const userText = (buf.userText ?? '').trim()
    const assistantText = (buf.assistantText ?? '').trim()
    if (!userText || assistantText.length < live.minAssistantChars) {
      void report(`idle skip buf#${buf.id} agent=${agentConstructorName(agent)} userLen=${userText.length} assistantLen=${assistantText.length} (need user>0 & assistant>=${live.minAssistantChars})`)
      return
    }
    // 缓冲片刻：多步回合的步骤之间也会闪现 idle，期间回到 running 就作废。
    if (pendingTimer) clearTimeout(pendingTimer)
    pendingTimer = setTimeout(() => {
      pendingTimer = 0
      void generateFor(agent, buf, userText, assistantText)
    }, Math.max(200, live.idleDelayMs))
  })

  /* -- 主通道：llm/stream 瀑布旁路捕获（0.2.3，借鉴 dsh-cost-meter） -- */

  /** 深度标记：存在即「本插件已知会、不需要再捕获」的 llm 流。 */
  const llmDepth = new AsyncLocalStorage()

  /** 实时捕获的最近一轮：sessionId → { userText, assistantText, at }。 */
  const turnCache = new Map()
  const TURN_CACHE_MAX = 24
  const TURN_CACHE_TTL_MS = 10 * 60_000

  function cachedTurnOf(sessionId) {
    const hit = turnCache.get(sessionId)
    if (!hit) return null
    if (Date.now() - hit.at > TURN_CACHE_TTL_MS) { turnCache.delete(sessionId); return null }
    return hit
  }

  function rememberTurn(sessionId, userText, assistantText) {
    if (!sessionId || !userText || !assistantText || assistantText.trim().length === 0) return
    const prev = turnCache.get(sessionId)
    // 同一轮的多步工具链 / 重试续流 userText 相同：助手文本追加累积，
    // 让「最终答案」落在缓存尾部（生成时 clampTail 取尾部正好命中）。
    const merged = prev && prev.userText === userText
      ? `${prev.assistantText}\n\n${assistantText}`
      : assistantText
    turnCache.set(sessionId, { userText, assistantText: merged.slice(-20000), at: Date.now() })
    if (turnCache.size > TURN_CACHE_MAX) {
      let oldestKey = null
      let oldestAt = Infinity
      for (const [key, value] of turnCache) {
        if (value.at < oldestAt) { oldestAt = value.at; oldestKey = key }
      }
      if (oldestKey !== null) turnCache.delete(oldestKey)
    }
  }

  // llm/stream 捕获是否活着是 0.2.3 的关键真机问题（新架构进程分裂下
  // 事件归属未实证），首帧与每次入缓存都留痕，一次对话即可从日志判定。
  let llmStreamArmed = false

  ctx.on('llm/stream', (options, next) => {
    // 自己发起的建议生成调用 / 下游包装路由的嵌套调用：原样透传。
    if (llmDepth.getStore() !== undefined) return next()
    const downstream = next()
    if (!llmStreamArmed) {
      llmStreamArmed = true
      void report('llm/stream first fire: capture channel is ALIVE in this process')
    }
    const sessionId = typeof options?.sessionId === 'string' ? options.sessionId : ''
    const userText = (singleTextOfLastUser(options?.messages) ?? '').trim()
    let assistantText = ''
    let downstreamIter = null
    let completed = false
    return (async function* followupObserve() {
      try {
        downstreamIter = downstream[Symbol.asyncIterator]()
        for (;;) {
          // 深度标记内拉取：包装路由适配器在消费上下文里再发起的
          // ctx.llm.stream() 继承标记，内层监听器判定为已处理、透传。
          const result = await llmDepth.run(1, () => downstreamIter.next())
          if (result.done) break
          const chunk = result.value
          if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
            assistantText += chunk.text
            if (assistantText.length > 20000) assistantText = assistantText.slice(-10000)
          }
          yield chunk
        }
        completed = true
      } finally {
        // 消费方提前中断（用户改下一句、错误终止）也要收尾；流失败时
        // assistantText 不完整，通常过不了 minAssistantChars，无害。
        if (!completed) {
          try { await downstreamIter?.return?.() } catch { /* ignore */ }
        }
        try {
          rememberTurn(sessionId, userText, assistantText)
          void report(`llm/stream captured session=${sessionId ? sessionId.slice(0, 50) : '(none)'} userLen=${userText.length} assistantLen=${assistantText.length} ${!completed ? '(interrupted)' : ''}`)
        } catch { /* 缓存失败绝不影响主对话流 */ }
      }
    })()
  }, { global: true })

  /* -- 生成 --------------------------------------------------------- */

  async function runGeneration(llm, route, userText, assistantText, signal) {
    const count = Math.min(2, Math.max(1, Math.round(live.maxSuggestions)))
    // 深度标记内发起：本次生成调用经过 llm/stream 瀑布时，监听器读到
    // 标记即透传——建议生成的 prompt 不会被误缓存为对话轮。
    // reasoningEffort low + maxTokens 2000：真机 04:50 实测 profile 默认
    // high 推理把 600 上限全部烧光（raw len=0 → 无建议渲染）。
    // 给 dsh-cost 打来源标记：建议生成的费用单独归类，不混进对话。
    globalThis.__dshPluginCall = { source: 'followup', at: Date.now() }

    const iterator = llmDepth.run(1, () => llm.stream({
      provider: route.provider,
      model: route.model,
      reasoningEffort: 'low',
      messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(userText, assistantText, count, config) }] }],
      maxTokens: 2000,
      signal,
    })[Symbol.asyncIterator]())
    let text = ''
    try {
      for (;;) {
        const { done, value } = await iterator.next()
        if (done) break
        if (value?.type === 'text-delta' && typeof value.text === 'string') text += value.text
        else if (value?.type === 'finish' && value.reason && (value.reason.kind === 'error' || value.reason.kind === 'aborted')) {
          throw new Error(`followup llm ${value.reason.kind}`)
        }
      }
    } catch (err) {
      // 中断底层流，失败后不在后台继续烧 token。
      try {
        const closing = iterator.return?.()
        if (closing && typeof closing.catch === 'function') closing.catch(() => {})
      } catch { /* ignore */ }
      throw err
    }
    void report(`raw output len=${text.length}: ${JSON.stringify(text.slice(0, 300))}`)
    return parseSuggestions(text, count)
  }

  async function generateFor(agent, buf, userText, assistantText) {
    const route = resolveRoute(agent)
    if (!route) {
      say('info', 'no model route available, skip')
      void report('generate skip: no model route (config unset, agent.options empty, agentDefaultModel missing)')
      return
    }
    const controller = new AbortController()
    buf.controller = controller
    const timer = setTimeout(() => controller.abort(new Error('followup timeout')), live.timeoutMs)
    // 根作用域没声明 llm inject 时属性访问直接抛（真机 07:41 实证）；
    // 捕住降级——cache/日志路径不受影响。
    let eventLlm = null
    try { eventLlm = ctx.llm } catch { eventLlm = null }
    if (eventLlm === null) {
      void report('event-path skip: llm not injectable in this scope (cache path covers it)')
      return
    }
    try {
      void report(`generate start route=${route.provider}/${route.model} userLen=${userText.length} assistantLen=${assistantText.length}`)
      const suggestions = await runGeneration(eventLlm, route, userText, assistantText, controller.signal)
      if (suggestions.length) {
        lastContext = { route, userText, assistantText }
        latest = { seq: ++seqCounter, suggestions, at: Date.now() }
        let eventSessionId = ''
        try { eventSessionId = agent?.session?.id ?? '' } catch { eventSessionId = '' }
        persistSuggestions(eventSessionId, latest.seq, suggestions)
        say('info', `turn ${latest.seq}: ${suggestions.length} suggestions`)
        void report(`generate ok seq=${latest.seq} count=${suggestions.length} ${JSON.stringify(suggestions)}`)
      } else {
        void report('generate empty: model returned no parseable suggestions')
      }
    } catch (err) {
      if (!/aborted|superseded|timeout/i.test(String(err?.message ?? err))) {
        say('error', `generate failed: ${err?.message ?? err}`)
        void report(`generate failed: ${String(err?.message ?? err).slice(0, 300)}`)
      } else {
        void report(`generate aborted: ${String(err?.message ?? err).slice(0, 120)}`)
      }
    } finally {
      clearTimeout(timer)
      if (buf.controller === controller) buf.controller = null
    }
  }

  /* -- web 端点 ------------------------------------------------------ */

  // 可选注入：CLI / TUI 等没有 webServer 的宿主照常加载，只是没有 chips。
  // llm 必须在此作用域声明——cordis 的属性访问按作用域校验 inject，
  // 根作用域的静态 inject 不传导进嵌套作用域（真机实测报
  // cannot get property "llm" without inject）。
  ctx.inject(['webServer', 'llm'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: '/api/dsh-followup',
      handler: async (req, res) => {
        const send = (status, body) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        const path = (req.url ?? '').split('?')[0].replace(/^\/api\/dsh-followup/, '')
        if (path === '/settings' && req.method === 'GET') {
          send(200, { ...live })
          return
        }
        // 运行时改参数：白名单字段，provider/model 不在其中（改了要重建路由）。
        if (path === '/settings' && req.method === 'POST') {
          let raw = ''
          for await (const chunk of req) raw += chunk
          let body
          try { body = JSON.parse(raw) } catch { send(400, { error: 'invalid-json' }); return }
          const numeric = { maxSuggestions: [1, 3], idleDelayMs: [200, 10000], timeoutMs: [1000, 120000], minAssistantChars: [0, 500], userChars: [100, 4000], assistantChars: [100, 8000] }
          for (const [key, [min, max]] of Object.entries(numeric)) {
            if (body[key] === undefined) continue
            const value = Number(body[key])
            if (!Number.isFinite(value)) continue
            live[key] = Math.min(max, Math.max(min, Math.round(value)))
          }
          persistSettings()
          send(200, { ...live })
          return
        }


        // 客户端在每次「生成中 → 空闲」后拉取；seq 相同就静默忽略。
        // Trae 逻辑：建议随会话持久化、无时间过期，只被下一轮替换或清除。
        if (path === '/latest' && req.method === 'GET') {
          const qs = new URL(req.url ?? '', 'http://local').searchParams
          const wantSession = qs.get('sessionId') ?? ''
          const entry = wantSession ? persisted[wantSession] : undefined
          if (entry && Array.isArray(entry.suggestions) && entry.suggestions.length > 0) {
            send(200, entry)
            return
          }
          send(200, latest)
          return
        }

        /**
         * 生成建议（0.2.3 双通道）：优先用 llm/stream 实时捕获的对话轮
         * （零文件 IO、无解析时延），未命中才回落日志驱动（0.2.0 引入，
         * 解压 session.v4.jsonl.zstd 直读）。
         */
        if ((path === '/generate' || path === '/refresh') && req.method === 'POST') {
          let body = ''
          for await (const chunk of req) body += chunk
          let sessionId = ''
          try { sessionId = JSON.parse(body).sessionId ?? '' } catch { sessionId = '' }
          if (!sessionId) { send(400, { error: 'missing sessionId' }); return }
          const cached = cachedTurnOf(sessionId)
          const turn = cached
            ? { userText: cached.userText, assistantText: cached.assistantText }
            : await lastTurnFromLog(sessionId)
          if (!turn) {
            void report(`generate(${cached ? 'cache' : 'log'}) ${path}: no usable turn in session ${String(sessionId).slice(0, 50)}`)
            // Trae 逻辑：建议属于每轮响应——本轮拿不到可跟进内容即清掉旧建议
            clearSuggestions(String(sessionId))
            send(409, { error: 'no-turn' })
            return
          }
          const route = configRoute() ?? defaultRoute() ?? await patchDefaultRoute()
          if (!route) {
            void report(`generate(${cached ? 'cache' : 'log'}): no route (config/agentDefaultModel/patch all missing)`)
            send(503, { error: 'no-route' })
            return
          }
          const source = cached ? 'cache' : 'log'
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(new Error('followup timeout')), live.timeoutMs)
          try {
            void report(`generate(${source}) start route=${route.provider}/${route.model} userLen=${turn.userText.length} assistantLen=${turn.assistantText.length}`)
            const suggestions = await runGeneration(webCtx.llm, route, turn.userText, turn.assistantText, controller.signal)
            if (!suggestions.length) {
              void report(`generate(${source}) empty`)
              // 同上：本轮生成失败/为空，旧建议不再属于最新一轮
              clearSuggestions(String(sessionId))
              send(502, { error: 'generate-failed' })
              return
            }
            lastContext = { route, ...turn }
            latest = { seq: ++seqCounter, suggestions, at: Date.now() }
            persistSuggestions(String(sessionId), latest.seq, suggestions)
            void report(`generate(${source}) ok seq=${latest.seq} ${JSON.stringify(suggestions)}`)
            send(200, latest)
          } catch (err) {
            void report(`generate(${source}) failed: ${String(err?.message ?? err).slice(0, 200)}`)
            send(502, { error: 'generate-failed' })
          } finally {
            clearTimeout(timer)
          }
          return
        }

        send(404, { error: 'not-found' })
      },
    }), 'dsh-followup: /api/dsh-followup/*')
  })
}
  return { apply, Config, inject: typeof moduleInject === 'undefined' ? undefined : moduleInject }
})()

/* ==== module: voice（原 dsh-siri-voice） ==== */
const voiceModule = (() => {
/* 由 scripts/build-suite.mjs 从 dsh-siri-voice/index.js 机械生成；勿手改，重跑脚本再生成。 */
/**
 * dsh-siri-voice — 服务端半（无逻辑）。
 *
 * 这个插件只做 web 客户端的视觉层，但 dsh 的客户端模块扫描是从 Host 的
 * loader entries 出发的，所以包仍然需要一个可被加载的服务端入口：
 * 声明 `dsh.bundle.patch` 把一行插件插进 profile，`dsh.client.platform = 'web'`
 * 让 web 宿主把 client.js 挂到页面里。
 */

const name = 'siri-voice'

/** 不注册任何服务；所有效果都在客户端。 */
function apply() {}


const Config = Schema.object({ enabled: Schema.boolean().default(true).description('启用') })
  return { apply, Config, inject: typeof moduleInject === 'undefined' ? undefined : moduleInject }
})()

/* ==== module: compaction（原 dsh-compaction-control） ==== */
const compactionModule = (() => {
/* 由 scripts/build-suite.mjs 从 dsh-compaction-control/index.js 机械生成；勿手改，重跑脚本再生成。 */
/**
 * dsh-compaction-control — 上下文压缩控制中心（DeepSeek Harness / dsh）
 *
 * 三件事：
 *   1. 手动压缩：把官方 compaction 服务的 ctx.compaction.compactNow(agent, signal)
 *      暴露成 HTTP 路由，客户端面板一键触发（等价 /compact，免打字）。
 *   2. 调节自动压缩：把 {auto, thresholdRatio, retainRatio} 写进每个挂载了
 *      本插件的 profile 的用户补丁层（~/.dsh/profiles/<name>/cordis.patch.yml，
 *      id 定向覆盖 compaction-basic 的 config；applyEntryPatches 后写者胜）。
 *      补丁层是 initProfile 官方创建的用户文件，插件管理器不会回收它；
 *      但 loader 只在启动时读取——保存后需重启 dsh 生效。
 *   3. 状态源：~/.dsh/compaction-control.json 是唯一事实源（含 hideBuiltIn
 *      等 UI 偏好），补丁文件由它派生，可随时重生成。
 *
 * 已核对的 dsh API（dsh-reference 源码对照）：
 *   - ctx.agents.get(sessionId) → Agent（core/agent AgentRegistry，实现
 *     runMaintenance，满足 compaction 的 ManualCompactAgentContext）
 *   - ctx.compaction.compactNow(agent, signal) → CompactionResult |
 *     null；错误带 code: busy/cancelled/changed/summary/commit/persistence
 *   - BasicCompactionConfig 键集（compaction-basic/src/config.ts）：
 *     auto/thresholdRatio/retainRatio/headroomTokens/maxTokens/
 *     summarizationProvider/summarizationModel/compactionRetries/
 *     maxOverflowRetries/modelPolicies —— 只写前三个，其余走默认
 *   - applyEntryPatches（vendor/include）：{id, name, config} 直接整体
 *     替换目标条目的 config；未知键会让 compaction-basic 加载即抛错，
 *     所以这里的 config 永远是完整合法子集
 */








const require = createRequire(import.meta.url)

const name = 'compaction-control'

const DSH_DIR = join(homedir(), '.dsh')
const PROFILES_DIR = join(DSH_DIR, 'profiles')
const STATE_FILE = join(DSH_DIR, 'compaction-control.json')
const DIAG_LOG = join(DSH_DIR, 'compaction-control-debug.log')

/** 与 compaction-basic 的默认对齐（thresholdRatio 0.8 / retainRatio 0.16 / auto）。 */
const DEFAULT_STATE = { auto: true, thresholdRatio: 0.8, retainRatio: 0.16, hideBuiltIn: true, checkpoint: true }

const MANAGED_BEGIN = '# BEGIN dsh-compaction-control (managed)'
const MANAGED_END = '# END dsh-compaction-control'

/** 补丁文件语法校验用；运行时没带 yaml 就跳过校验（写入逻辑本身保守）。 */
let Yaml = null
try {
  const mod = require('yaml')
  if (typeof mod?.parse === 'function') Yaml = mod
} catch { Yaml = null }

const Config = Schema.object({
  /** 关闭后客户端不再注册圆环与面板（压缩行为恢复 compaction-basic 默认）。 */
  enabled: Schema.boolean().default(true).description('是否启用上下文压缩控制'),
})

/** 校验并归一化一份状态；不合法直接抛中文错误给面板显示。 */
function sanitizeState(input) {
  const ratio = (value, fallback, lo, hi, label) => {
    const n = Number(value ?? fallback)
    if (!Number.isFinite(n) || n < lo || n > hi) {
      throw new Error(`${label} 需在 ${lo}~${hi} 之间`)
    }
    return Math.round(n * 1000) / 1000
  }
  const state = {
    auto: input?.auto === undefined ? DEFAULT_STATE.auto : Boolean(input.auto),
    thresholdRatio: ratio(input?.thresholdRatio, DEFAULT_STATE.thresholdRatio, 0.3, 0.99, '触发阈值'),
    retainRatio: ratio(input?.retainRatio, DEFAULT_STATE.retainRatio, 0.02, 0.5, '保留比例'),
    hideBuiltIn: input?.hideBuiltIn === undefined ? DEFAULT_STATE.hideBuiltIn : Boolean(input.hideBuiltIn),
    checkpoint: input?.checkpoint === undefined ? DEFAULT_STATE.checkpoint : Boolean(input.checkpoint),
  }
  // compaction-basic 加载期硬约束：retainRatio >= thresholdRatio 直接抛错。
  if (state.retainRatio >= state.thresholdRatio) {
    throw new Error(`保留比例 (${state.retainRatio}) 必须小于触发阈值 (${state.thresholdRatio})`)
  }
  return state
}

async function readState() {
  try {
    return sanitizeState(JSON.parse(await readFile(STATE_FILE, 'utf8')))
  } catch {
    return { ...DEFAULT_STATE }
  }
}

/** 列出挂载了本插件的 profile 名（manifest 里出现包名即算）。 */
async function listMountedProfiles() {
  let entries = []
  try { entries = await readdir(PROFILES_DIR, { withFileTypes: true }) } catch { return [] }
  const mounted = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const raw = await readFile(join(PROFILES_DIR, entry.name, 'package.json'), 'utf8')
      if (raw.includes('dsh-compaction-control')) mounted.push(entry.name)
    } catch { /* 无 manifest 的目录不是 profile */ }
  }
  return mounted.sort()
}

function managedBlock(state) {
  return [
    MANAGED_BEGIN,
    '- id: compaction-basic',
    "  name: '@deepseek-ai/dsh-compaction-basic'",
    '  config:',
    `    auto: ${state.auto}`,
    `    thresholdRatio: ${state.thresholdRatio}`,
    `    retainRatio: ${state.retainRatio}`,
    MANAGED_END,
  ].join('\n')
}

/** 纯文本手术：由现有内容与目标状态算出下一版补丁文件内容（不落盘）。 */
function composePatch(raw, state) {
  const begin = raw.indexOf(MANAGED_BEGIN)
  const end = raw.indexOf(MANAGED_END)
  if (begin !== -1 && end !== -1 && end > begin) {
    return raw.slice(0, begin) + managedBlock(state) + raw.slice(end + MANAGED_END.length)
  }
  const stripped = raw
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
    .join('')
    .trim()
  if (stripped === '[]') {
    return raw.replace('[]', managedBlock(state))
  }
  if (stripped === '') {
    return `${managedBlock(state)}\n`
  }
  const base = raw.replace(/\s+$/, '')
  return `${base}\n${managedBlock(state)}\n`
}

/** 移除受管块后的剩余内容；没有受管块时返回 null（无需写回）。 */
function stripManaged(raw) {
  const begin = raw.indexOf(MANAGED_BEGIN)
  const end = raw.indexOf(MANAGED_END)
  if (begin === -1 || end === -1 || end < begin) return null
  return raw.slice(0, begin) + raw.slice(end + MANAGED_END.length)
}

/** 官方 initProfile 的用户补丁层模板（移除后文件为空时回填）。 */
const PATCH_TEMPLATE = '# Your patch layer for this dsh profile, applied after every bundle layer:\n'
  + '# a top-level YAML array of loader patch entries (id-targeted config\n'
  + '# overrides, disables, and insert lists; `!!js` expressions allowed).\n'
  + '[]\n'

/** 恢复默认：从 profile 补丁层移除受管块，让 compaction-basic 回落自身默认。 */
async function clearProfilePatch(profileName, report) {
  const file = join(PROFILES_DIR, profileName, 'cordis.patch.yml')
  let raw = ''
  try { raw = await readFile(file, 'utf8') } catch { return }
  const strippedManaged = stripManaged(raw)
  if (strippedManaged === null) return
  const stripped = strippedManaged
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
    .join('')
    .trim()
  const next = stripped === ''
    ? PATCH_TEMPLATE
    : `${strippedManaged.replace(/\s+$/, '')}\n`
  if (Yaml) {
    try {
      const parsed = Yaml.parse(next)
      if (!Array.isArray(parsed)) throw new Error('not an array')
    } catch (error) {
      throw new Error(`${profileName}/cordis.patch.yml 语法校验失败，未写入：${String(error?.message ?? error)}`)
    }
  } else {
    report(`yaml lib unavailable, rewrote ${profileName}/cordis.patch.yml without validation`)
  }
  await writeFile(file, next, 'utf8')
  return file
}

/**
 * 把受管块写入一个 profile 的 cordis.patch.yml。
 * 纯文本手术：只动 BEGIN/END 标记之间的内容，用户自己写的其他条目原样保留；
 * 全新文件（官方模板是注释 + `[]`）用受管块替换 `[]`。写前用 yaml 库校验
 * （如果运行时带了这个库），校验失败不落盘。
 */
async function syncProfilePatch(profileName, state, report) {
  const file = join(PROFILES_DIR, profileName, 'cordis.patch.yml')
  let raw = ''
  try { raw = await readFile(file, 'utf8') } catch { raw = '' }
  const next = composePatch(raw, state)

  if (Yaml) {
    try {
      const parsed = Yaml.parse(next)
      if (!Array.isArray(parsed)) throw new Error('not an array')
    } catch (error) {
      throw new Error(`${profileName}/cordis.patch.yml 语法校验失败，未写入：${String(error?.message ?? error)}`)
    }
  } else {
    report(`yaml lib unavailable, wrote ${profileName}/cordis.patch.yml without validation`)
  }

  await writeFile(file, next, 'utf8')
  return file
}

/** 把状态同步进所有挂载 profile；返回写入的 profile 名单。 */
async function syncAllProfiles(state, report) {
  const profiles = await listMountedProfiles()
  const written = []
  for (const profileName of profiles) {
    await syncProfilePatch(profileName, state, report)
    written.push(profileName)
  }
  return written
}

function apply(ctx, config) {
  const say = (message) => {
    try { console.info(`[dsh-compaction-control] ${message}`) } catch { /* ignore */ }
  }
  const report = async (line) => {
    try {
      await mkdir(dirname(DIAG_LOG), { recursive: true })
      await appendFile(DIAG_LOG, `${new Date().toISOString()} ${line}\n`, 'utf8')
    } catch { /* ignore */ }
  }

  say(`server boot, enabled=${config.enabled !== false}`)
  void report(`server boot enabled=${config.enabled !== false}`)

  // 压缩前自动落档：客户端圆环在占用率上穿「阈值-5%」时布防，本进程在
  // 该会话下一次模型调用前往消息尾追加落档指令——agent 用自己的文件工具
  // 把项目状态写进工作区 checkpoint.md，随后 compaction-basic 照常压缩。
  // 只注入一次（注入即解除布防；占用回落后客户端重新布防）。
  const armedSessions = new Set()
  const CHECKPOINT_MARKER = 'dsh-auto-checkpoint'
  const CHECKPOINT_TEXT = [
    '【自动落档】上下文即将压缩。请先把当前任务状态写入工作区文件 `checkpoint.md`（覆盖旧内容）：',
    '任务目标、已完成事项、待办事项、关键决定与约束、涉及的重要文件路径。',
    '写完落档后，再回答上一条消息的问题。（dsh-auto-checkpoint）',
  ].join('\n')

  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    try {
      if (!decision || decision.kind !== 'enter' || !Array.isArray(decision.messages)) return decision
      const sessionId = String(agent?.sessionId ?? '')
      if (!sessionId || !armedSessions.has(sessionId)) return decision
      const state = await readState()
      if (state.checkpoint === false) { armedSessions.delete(sessionId); return decision }
      const tail = decision.messages.slice(-3).map((m) => JSON.stringify(m?.content ?? '')).join('')
      armedSessions.delete(sessionId)
      if (tail.includes(CHECKPOINT_MARKER)) return decision
      const message = createUserMessage({ content: [{ type: 'text', text: CHECKPOINT_TEXT }] })
      await report(`checkpoint injected session=${sessionId} msgs=${decision.messages.length}`)
      return { ...decision, messages: [...decision.messages, message] }
    } catch (error) {
      await report(`checkpoint pre-step failed: ${String(error?.message ?? error).slice(0, 200)}`)
      return decision
    }
  })

  // compaction/agents 属于可选依赖：base bundle 没带它们时路由仍注册，
  // /compact 返回 503，面板其余功能（状态展示、参数保存）不受影响。
  let runtime = null

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: '/api/dsh-compaction-control',
      handler: async (req, res) => {
        const send = (status, body) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        const readBody = async () => {
          let raw = ''
          for await (const chunk of req) raw += chunk
          try { return raw ? JSON.parse(raw) : {} } catch { return null }
        }
        const path = (req.url ?? '').split('?')[0].replace(/^\/api\/dsh-compaction-control/, '')

        if (path === '/enabled' && req.method === 'GET') {
          send(200, { enabled: config.enabled !== false, name })
          return
        }

        if (path === '/diag' && req.method === 'POST') {
          await report(String((await readBody())?.line ?? '').slice(0, 2000))
          send(200, { ok: true })
          return
        }

        // 压缩前落档布防：客户端占用率上穿阈值-5% 时 arm=true（升沿只发一次），
        // 占用回落后 arm=false。服务端只记标记，注入发生在下一次 pre-step。
        if (path === '/checkpoint-arm' && req.method === 'POST') {
          const body = await readBody()
          const sessionId = String(body?.sessionId ?? '')
          if (!sessionId) { send(400, { error: '缺少 sessionId' }); return }
          const arm = body?.arm === true
          const state = await readState()
          if (arm && state.checkpoint === false) { send(200, { ok: true, armed: false, reason: 'checkpoint-disabled' }); return }
          if (arm) armedSessions.add(sessionId)
          else armedSessions.delete(sessionId)
          await report(`checkpoint ${arm ? 'armed' : 'disarmed'} session=${sessionId}`)
          send(200, { ok: true, armed })
          return
        }

        if (path === '/state' && req.method === 'GET') {
          try {
            const [state, profiles] = await Promise.all([readState(), listMountedProfiles()])
            send(200, { ok: true, state, defaults: DEFAULT_STATE, profiles, version: '0.1.0' })
          } catch (error) {
            send(500, { error: String(error?.message ?? error) })
          }
          return
        }

        if (path === '/state' && req.method === 'POST') {
          const body = await readBody()
          if (body === null) { send(400, { error: '请求体不是合法 JSON' }); return }
          try {
            const state = sanitizeState(body)
            await mkdir(DSH_DIR, { recursive: true })
            await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
            const profiles = await syncAllProfiles(state, report)
            await report(`state saved ${JSON.stringify(state)} profiles=${profiles.join(',') || 'none'}`)
            send(200, { ok: true, state, profiles, restartRequired: true })
          } catch (error) {
            send(400, { error: String(error?.message ?? error) })
          }
          return
        }

        if (path === '/reset' && req.method === 'POST') {
          try {
            const state = { ...DEFAULT_STATE }
            await mkdir(DSH_DIR, { recursive: true })
            await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
            const profiles = await listMountedProfiles()
            for (const profileName of profiles) await clearProfilePatch(profileName, report)
            await report(`state reset to defaults, managed block removed from: ${profiles.join(',') || 'none'}`)
            send(200, { ok: true, state, profiles, restartRequired: true })
          } catch (error) {
            send(400, { error: String(error?.message ?? error) })
          }
          return
        }

        if (path === '/compact' && req.method === 'POST') {
          if (!runtime) { send(503, { error: '压缩服务未就绪（本 profile 未挂载 compaction/agents）' }); return }
          const body = await readBody()
          const sessionId = body?.sessionId
          if (!sessionId) { send(400, { error: '缺少 sessionId' }); return }
          const agent = runtime.agents.get(sessionId)
          if (!agent) { send(409, { error: '未找到该会话的 agent' }); return }
          const controller = new AbortController()
          try {
            const result = await runtime.compaction.compactNow(agent, controller.signal)
            if (result === null) {
              send(200, { ok: true, empty: true, message: '暂无可压缩的历史' })
            } else {
              await report(`manual compact ok: ${result.shadowedSeqs.length} items ~${result.shadowedTokenCount} tokens`)
              send(200, {
                ok: true,
                shadowed: result.shadowedSeqs.length,
                tokens: result.shadowedTokenCount,
              })
            }
          } catch (error) {
            const code = typeof error?.code === 'string' ? error.code.toLowerCase() : ''
            const messages = {
              busy: '会话正忙（运行中或已有压缩任务），请在空闲时重试',
              cancelled: '压缩已取消',
              changed: '待压缩历史在提交前发生了变化，本次已放弃并记录',
              summary: '未能生成有效摘要，本次已记录',
              commit: '压缩未干净完成，请检查会话状态后再试',
              persistence: '压缩完成，但会话保存失败',
            }
            await report(`manual compact failed: code=${code || 'unknown'} ${String(error?.message ?? error).slice(0, 300)}`)
            if (messages[code]) { send(409, { error: messages[code], code }); return }
            send(500, { error: String(error?.message ?? error) })
          }
          return
        }

        send(404, { error: 'not-found' })
      },
    }), 'dsh-compaction-control: /api/dsh-compaction-control/*')

    webCtx.inject(['compaction', 'agents'], (deep) => {
      runtime = { compaction: deep.compaction, agents: deep.agents }
      say('compaction + agents ready')
      void report('runtime ready (compaction + agents)')
      return () => { runtime = null }
    })
  })
}


/** 仅供离线自测（scripts/ 与 CI 可直接 import），运行时不使用。 */
const __internals = { sanitizeState, managedBlock, composePatch, stripManaged, PATCH_TEMPLATE, DEFAULT_STATE }
  return { apply, Config, inject: typeof moduleInject === 'undefined' ? undefined : moduleInject }
})()

/* ==== module: prompts（手写） ==== */
const promptsModule = (() => {
/**
 * dsh-superinput · prompts 模块（提示词模板库）
 *
 * prompts 是手动保存的常用模板（划选正文可一键存入）。
 * 支持 {{变量}} 占位符，插入时由前端弹窗填值；服务端只存原文，不做替换。
 *
 * 存储 ~/.dsh/storages/dsh-superinput/prompts.json（结构 { items: [...] }）。
 */







const moduleInject = []

const STORE_DIR = join(homedir(), '.dsh', 'storages', 'dsh-superinput')
const STORE_PATH = join(STORE_DIR, 'prompts.json')
const CLIENT_DIAG = join(homedir(), '.dsh', 'superinput-debug.log')

/* 划选上下文：客户端把「选段 + 评论」暂存到这里，下一轮 pre-step 一次性
 * 注入成一条 sourced UserMessage，随后立即删除（只影响紧接着的一次发送）。 */
const CONTEXT_MAX_ITEMS = 8
const CONTEXT_TEXT_MAX = 4000
const CONTEXT_COMMENT_MAX = 600
const CONTEXT_TTL_MS = 10 * 60_000
const pendingContext = new Map()

function renderSelectionContext(items) {
  const lines = [
    '以下是我从对话中选中的上下文，按顺序附带我的评论。回答时请优先参考这些内容，并针对评论中的问题作答。',
  ]
  items.forEach((item, index) => {
    lines.push(`【选段 ${index + 1}】\n${item.text}${item.comment ? `\n我的评论：${item.comment}` : ''}`)
  })
  return lines.join('\n\n')
}

const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('启用提示词模板库'),
  maxItems: Schema.number().default(500).description('最多保存多少条模板（收藏不计入上限）'),
})

function createStore(maxItems) {
  let state = { items: [] }
  let dirty = false
  let timer = null

  const load = () => {
    try { state = JSON.parse(readFileSync(STORE_PATH, 'utf8')) } catch { /* 首次或损坏：空库 */ }
    if (!state || !Array.isArray(state.items)) state = { items: [] }
  }

  const flush = () => {
    if (!dirty) return
    try {
      mkdirSync(STORE_DIR, { recursive: true })
      const tmp = `${STORE_PATH}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify(state), 'utf8')
      renameSync(tmp, STORE_PATH)
      dirty = false
    } catch (error) {
      console.error('[dsh-superinput] prompts flush failed:', error?.message ?? error)
    }
  }

  const schedule = () => {
    dirty = true
    if (timer) return
    timer = setTimeout(() => { timer = null; flush() }, 500)
    timer.unref?.()
  }

  return {
    load,
    dispose() { if (timer) { clearTimeout(timer); timer = null } flush() },
    list() { return state.items },

    /** 新建或更新。title 为空时用正文前 40 字兜底，避免列表里出现无标题条目。 */
    save({ id, title, body, tags }) {
      const cleanBody = String(body ?? '').replace(/\0/g, '')
      if (!cleanBody.trim()) return { ok: false, reason: 'empty-body' }
      const cleanTitle = String(title ?? '').trim().slice(0, 80) || cleanBody.trim().slice(0, 40)
      const cleanTags = Array.isArray(tags)
        ? tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8)
        : []

      if (id) {
        const item = state.items.find((entry) => entry.id === id)
        if (!item) return { ok: false, reason: 'not-found' }
        item.title = cleanTitle
        item.body = cleanBody
        item.tags = cleanTags
        item.at = Date.now()
        schedule()
        return { ok: true, id, created: false }
      }

      const newId = randomUUID()
      state.items.unshift({
        id: newId,
        title: cleanTitle,
        body: cleanBody,
        tags: cleanTags,
        at: Date.now(),
        pinned: false,
      })
      // 收藏条目不占上限
      const overflow = state.items.filter((item) => !item.pinned).length - maxItems
      if (overflow > 0) {
        const drop = new Set(state.items.filter((item) => !item.pinned).slice(-overflow).map((item) => item.id))
        state.items = state.items.filter((item) => !drop.has(item.id))
      }
      schedule()
      return { ok: true, id: newId, created: true }
    },

    remove(id) {
      const before = state.items.length
      state.items = state.items.filter((item) => item.id !== id)
      if (state.items.length !== before) schedule()
      return state.items.length !== before
    },

    pin(id, pinned) {
      const item = state.items.find((entry) => entry.id === id)
      if (!item) return false
      item.pinned = !!pinned
      schedule()
      return true
    },

    /** 使用计数：面板点插入时调用，列表按最近使用排序。 */
    use(id) {
      const item = state.items.find((entry) => entry.id === id)
      if (!item) return false
      item.usedAt = Date.now()
      item.uses = (item.uses ?? 0) + 1
      schedule()
      return true
    },

    /** 是否注册为 / 斜杠命令（客户端按此标记同步 commandUi）。 */
    slash(id, on) {
      const item = state.items.find((entry) => entry.id === id)
      if (!item) return false
      item.slash = !!on
      schedule()
      return true
    },

    /**
     * 导入：按 id 合并；同 id 冲突保留 at（更新时间）较新的一方。
     * id 不在库中则原 id 收编（跨机重复导入可去重），缺 id 才新分配。
     */
    import(items) {
      let added = 0
      let updated = 0
      for (const raw of items.slice(0, 5000)) {
        const body = String(raw?.body ?? '').replace(/\0/g, '')
        if (!body.trim()) continue
        const incoming = {
          title: String(raw?.title ?? '').trim().slice(0, 80) || body.trim().slice(0, 40),
          body,
          tags: Array.isArray(raw?.tags)
            ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8)
            : [],
          at: Number.isFinite(raw?.at) ? raw.at : Date.now(),
          pinned: raw?.pinned === true,
          slash: raw?.slash === true,
          usedAt: Number.isFinite(raw?.usedAt) ? raw.usedAt : undefined,
          uses: Number.isFinite(raw?.uses) ? Math.max(0, Math.round(raw.uses)) : 0,
        }
        const existing = raw?.id ? state.items.find((entry) => entry.id === raw.id) : null
        if (existing) {
          if (incoming.at > (existing.at ?? 0)) {
            Object.assign(existing, incoming)
            updated++
          }
          continue
        }
        state.items.unshift({ id: raw?.id ? String(raw.id).slice(0, 64) : randomUUID(), ...incoming })
        added++
      }
      const overflow = state.items.filter((item) => !item.pinned).length - maxItems
      if (overflow > 0) {
        const drop = new Set(state.items.filter((item) => !item.pinned).slice(-overflow).map((item) => item.id))
        state.items = state.items.filter((item) => !drop.has(item.id))
      }
      if (added + updated > 0) schedule()
      return { added, updated }
    },
  }
}

function apply(ctx, config) {
  // 运行时可变副本：POST /settings 改这里，立即生效；显式改过的键持久化
  // 到 storages、启动时回放（没改过的键继续跟随宿主配置）。回放必须在
  // createStore 之前，重启后上次的 maxItems 才对裁剪生效。
  const live = { ...config }
  if (!live.enabled) return

  // 设置持久化：只落与 config 不同的键，防抖 400ms 原子写。
  const SETTINGS_KEYS = ['maxItems']
  const SETTINGS_PATH = join(homedir(), '.dsh', 'storages', 'dsh-superinput', 'prompts.settings.json')
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

  const store = createStore(Math.max(20, Math.round(live.maxItems ?? 500)))
  store.load()
  ctx.effect(() => store.dispose(), 'dsh-superinput: prompts store')

  // 划选上下文注入：挂在 pre-step 最前面，先让下游（含提示词增强）处理完，
  // 再把上下文作为一条独立的 sourced 用户消息追加到本轮送模消息末尾。
  ctx.on('agent/pre-step', async ({ agent, step, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal?.aborted) return decision
    const rawSession = agent?.session
    const sessionId = typeof rawSession === 'string'
      ? rawSession
      : rawSession?.id === undefined ? '' : String(rawSession.id)
    const pending = sessionId ? pendingContext.get(sessionId) : undefined
    if (step !== 1 || !pending) return decision
    pendingContext.delete(sessionId)
    if (pending.items.length === 0 || Date.now() - pending.at > CONTEXT_TTL_MS) return decision
    const text = renderSelectionContext(pending.items)
    try {
      appendFileSync(CLIENT_DIAG, `${new Date().toISOString()} context injected session=${sessionId.slice(0, 50)} items=${pending.items.length}\n`, 'utf8')
    } catch { /* 日志失败不影响注入 */ }
    return {
      ...decision,
      messages: [...decision.messages, createUserMessage({
        content: [{ type: 'text', text }],
        source: {
          kind: 'dsh-superinput-selection',
          form: 'snapshot',
          sections: [{ name: 'selection-context', text }],
        },
      })],
    }
  }, { prepend: true })

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: '/api/dsh-superinput/prompts',
      handler: async (req, res) => {
        const send = (status, body) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        const path = (req.url ?? '').split('?')[0].replace(/^\/api\/dsh-superinput\/prompts/, '')
        const readBody = async () => {
          let body = ''
          for await (const chunk of req) body += chunk
          try { return JSON.parse(body) } catch { return {} }
        }

        if (path === '/settings' && req.method === 'GET') {
          send(200, { ...live })
          return
        }
        // 运行时改参数：只接受白名单字段，其余忽略（provider/model 这类
        // 改了要重建路由，运行时改无效，不如不给入口）。
        if (path === '/settings' && req.method === 'POST') {
          let raw = ''
          for await (const chunk of req) raw += chunk
          let body
          try { body = JSON.parse(raw) } catch { send(400, { error: 'invalid-json' }); return }
          if (body.maxItems !== undefined) { const v = Number(body.maxItems); if (Number.isFinite(v)) live.maxItems = Math.min(5000, Math.max(20, Math.round(v))) }
          persistSettings()
          send(200, { ...live })
          return
        }
        // 套件客户端统一诊断通道（0.4.0 起从 snippets 迁来）：落
        // ~/.dsh/superinput-debug.log，与服务端 trace 同文件便于一次排查。
        if (path === '/diag' && req.method === 'POST') {
          let raw = ''
          for await (const chunk of req) raw += chunk
          try {
            let message = raw
            try { message = JSON.parse(raw).message ?? raw } catch { /* 纯文本也收 */ }
            mkdirSync(dirname(CLIENT_DIAG), { recursive: true })
            appendFileSync(CLIENT_DIAG, `${new Date().toISOString()} ${String(message).slice(0, 500)}\n`, 'utf8')
          } catch { /* 落盘失败不影响应答 */ }
          send(200, { ok: true })
          return
        }
        // 划选上下文暂存：items 为空表示清除；真正的注入在 agent/pre-step。
        if (path === '/context' && req.method === 'POST') {
          const body = await readBody()
          const sessionId = String(body.sessionId ?? '').trim().slice(0, 200)
          if (!sessionId) { send(400, { error: 'missing-session' }); return }
          const items = Array.isArray(body.items)
            ? body.items.slice(0, CONTEXT_MAX_ITEMS).map((item) => ({
              text: String(item?.text ?? '').replace(/\0/g, '').trim().slice(0, CONTEXT_TEXT_MAX),
              comment: String(item?.comment ?? '').replace(/\0/g, '').trim().slice(0, CONTEXT_COMMENT_MAX),
            })).filter((item) => item.text.length > 0)
            : []
          if (items.length === 0) pendingContext.delete(sessionId)
          else pendingContext.set(sessionId, { items, at: Date.now() })
          send(200, { ok: true, count: items.length })
          return
        }
        if (path === '/list' && req.method === 'GET') {
          send(200, { items: store.list() })
          return
        }
        if (path === '/save' && req.method === 'POST') {
          send(200, store.save(await readBody()))
          return
        }
        if (path === '/remove' && req.method === 'POST') {
          const body = await readBody()
          send(200, { ok: store.remove(String(body.id ?? '')) })
          return
        }
        if (path === '/pin' && req.method === 'POST') {
          const body = await readBody()
          send(200, { ok: store.pin(String(body.id ?? ''), body.pinned === true) })
          return
        }
        if (path === '/use' && req.method === 'POST') {
          const body = await readBody()
          send(200, { ok: store.use(String(body.id ?? '')) })
          return
        }
        if (path === '/slash' && req.method === 'POST') {
          const body = await readBody()
          send(200, { ok: store.slash(String(body.id ?? ''), body.slash === true) })
          return
        }
        if (path === '/export' && req.method === 'GET') {
          send(200, { version: 1, exportedAt: Date.now(), items: store.list() })
          return
        }
        // 兼容两种载荷：导出文件原样（{items:[...]}）和裸数组。
        if (path === '/import' && req.method === 'POST') {
          const body = await readBody()
          const items = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : null
          if (!items) { send(400, { error: 'invalid-payload' }); return }
          send(200, { ok: true, ...store.import(items) })
          return
        }
        send(404, { error: 'not-found' })
      },
    }), 'dsh-superinput: prompts endpoints')
  })
}
  return { apply, Config, inject: typeof moduleInject === 'undefined' ? undefined : moduleInject }
})()

/* ==== module: hub（手写） ==== */
const hubModule = (() => {
/**
 * dsh-superinput · hub 模块（设置总览）
 *
 * 把各模块的**最终生效配置**聚合成一张表，供设置页展示。
 *
 * 为什么不做写入：dsh 的插件 Config 在启动时由宿主读取，运行时改不了。
 * 各模块自己的 /settings 端点改的是内存 live 副本 + storages 持久化，
 * 重启后由模块自己回放。这里只回答「现在是什么状态」。
 *
 * 数据来源两层：apply 时聚合层塞进来的 snapshot（defaults 与宿主配置合并），
 * 叠加各模块落盘的显式改动（<storages>/dsh-superinput/<mod>.settings.json）——
 * 只吐快照会在重启后与实际运行值不符（快照不知道回放）。
 */





const moduleInject = []

const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('在设置页显示「输入栏」总览'),
})

/** 各模块持久化文件名（与各模块 SETTINGS_PATH 保持一致）。 */
const PERSISTED_FILES = [
  ['cost', 'cost.settings.json'],
  ['enhancer', 'enhancer.settings.json'],
  ['followup', 'followup.settings.json'],
  ['picker', 'picker.settings.json'],
  ['prompts', 'prompts.settings.json'],
]

function loadPersisted() {
  const persisted = {}
  const dir = join(homedir(), '.dsh', 'storages', 'dsh-superinput')
  for (const [mod, file] of PERSISTED_FILES) {
    try {
      const saved = JSON.parse(readFileSync(join(dir, file), 'utf8'))
      if (saved && typeof saved === 'object' && Object.keys(saved).length > 0) persisted[mod] = saved
    } catch { /* 模块无存档：跟随配置 */ }
  }
  return persisted
}

function apply(ctx, config) {
  if (!config.enabled) return
  const snapshot = config.snapshot ?? {}

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: '/api/dsh-superinput/hub',
      handler: async (req, res) => {
        const send = (status, body) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        const path = (req.url ?? '').split('?')[0].replace(/^\/api\/dsh-superinput\/hub/, '')
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
    }), 'dsh-superinput: hub endpoint')
  })
}
  return { apply, Config, inject: typeof moduleInject === 'undefined' ? undefined : moduleInject }
})()

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
  console.info(`[dsh-superinput] server apply: host config keys=${keys.length ? keys.join(',') : '(none)'} — merging schema defaults`)
  // 先算出每个模块的最终生效配置，hub 用它做总览（自己拿不到别人的 config）。
  const merged = {}
  for (const [key] of MODULES) {
    merged[key] = { ...(DEFAULTS.get(key) ?? {}), ...(config?.[key] ?? {}) }
  }
  for (const [key, mod] of MODULES) {
    try {
      const own = merged[key]
      mod.apply(ctx, key === 'hub' ? { ...own, snapshot: merged } : own)
      trace(`module "${key}" applied OK`)
    } catch (error) {
      console.error(`[dsh-superinput] server module "${key}" failed:`, error)
      trace(`module "${key}" FAILED: ${String(error?.stack ?? error).slice(0, 600)}`)
    }
  }
}

export default { name, Config, apply }
