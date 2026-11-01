/**
 * dsh-superinput · exporter 模块（会话导出 Markdown + 消息目录数据）
 *
 * 复用 followup 趟通的会话日志直读：多帧 zstd 解压 session.v4.jsonl.zstd，
 * 解析 user/message 与 assistant/message 事件流。两个只读端点：
 *   GET /outline?sessionId=  → 用户消息列表（目录面板数据，文本截 120 字）
 *   GET /markdown?sessionId= → 整会话 Markdown 文件下载
 * 助手消息在日志里是多份渐增快照，连续助手事件只保留最后一份。
 */
import Schema from '@deepseek-ai/schemastery'
import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const inject = []

const SESSIONS_ROOT = join(homedir(), '.dsh', 'sessions')

/** 多帧 zstd（追加写每帧独立）：按魔数切段逐帧解压，坏帧跳过。 */
async function decompressLog(file) {
  const zlib = await import('node:zlib')
  if (typeof zlib.zstdDecompressSync !== 'function') {
    throw new Error('node zlib 无 zstd 支持（需 Node ≥23.8）')
  }
  const buf = await readFile(file)
  const idxs = [0]
  for (let i = 4; i <= buf.length - 4; i += 1) {
    if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) idxs.push(i)
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

const isRealUser = (e) => e?.type === 'user/message'
  && e.data?.source?.kind === 'user'
  && Array.isArray(e.data.content) && e.data.content.length === 1
  && e.data.content[0]?.type === 'text' && typeof e.data.content[0].text === 'string'

/** 事件流 → 顺序消息：{role, at, text}；连续助手事件视为渐增快照，只留最后一份。 */
function turnsOf(events) {
  const turns = []
  for (const e of events) {
    if (isRealUser(e)) {
      turns.push({ role: 'user', at: e.time ?? null, text: String(e.data.content[0].text ?? '') })
      continue
    }
    if (e?.type === 'assistant/message' && Array.isArray(e.data?.message?.content)) {
      const joined = e.data.message.content
        .filter((b) => b?.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text).join('')
      if (!joined.trim()) continue
      const last = turns[turns.length - 1]
      if (last && last.role === 'assistant') last.text = joined
      else turns.push({ role: 'assistant', at: e.time ?? null, text: joined })
    }
  }
  return turns
}

async function loadTurns(sessionId) {
  const file = await findSessionFile(sessionId)
  if (!file) return null
  const text = await decompressLog(file)
  const events = []
  for (const line of text.split('\n')) {
    if (line.length === 0) continue
    try { events.push(JSON.parse(line)) } catch { /* 半行跳过 */ }
  }
  return turnsOf(events)
}

const clockOf = (at) => (Number.isFinite(at)
  ? new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  : '')

function toMarkdown(sessionId, turns) {
  const users = turns.filter((t) => t.role === 'user').length
  const lines = [
    '# dsh 会话导出',
    '',
    `- 会话：\`${String(sessionId).replace(/[`\\]/g, '')}\``,
    `- 导出时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    `- 消息：${turns.length} 条（用户 ${users} · 助手 ${turns.length - users}）`,
    '',
    '---',
    '',
  ]
  for (const turn of turns) {
    const clock = clockOf(turn.at)
    lines.push(`## ${turn.role === 'user' ? '🧑 用户' : '🤖 助手'}${clock ? ` · ${clock}` : ''}`)
    lines.push('')
    lines.push(turn.text.trim())
    lines.push('')
  }
  return lines.join('\n')
}

export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('启用会话导出与消息目录'),
})

export function apply(ctx, config) {
  if (config?.enabled === false) return

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: '/api/dsh-superinput/export',
      handler: async (req, res) => {
        const json = (status, body) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        const path = (req.url ?? '').split('?')[0].replace(/^\/api\/dsh-superinput\/export/, '')
        const sessionId = new URL(req.url ?? '', 'http://local').searchParams.get('sessionId') ?? ''
        if (!sessionId) { json(400, { error: 'missing sessionId' }); return }

        const turns = await loadTurns(sessionId)
        if (!turns || turns.length === 0) { json(404, { error: 'session log not found' }); return }

        if (path === '/outline') {
          const items = turns
            .filter((t) => t.role === 'user')
            .map((t, i) => ({ i: i + 1, at: t.at, text: t.text.replace(/\s+/g, ' ').slice(0, 120) }))
          json(200, { ok: true, items })
          return
        }
        if (path === '/markdown') {
          const md = toMarkdown(sessionId, turns)
          res.statusCode = 200
          res.setHeader('content-type', 'text/markdown; charset=utf-8')
          res.setHeader('content-disposition', `attachment; filename="dsh-session-${new Date().toISOString().slice(0, 10)}.md"`)
          res.end(md)
          return
        }
        json(404, { error: 'not-found' })
      },
    }), 'dsh-superinput: export endpoints')
  })
}

export default { Config, apply }
