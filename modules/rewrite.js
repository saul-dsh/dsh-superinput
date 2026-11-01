/**
 * dsh-superinput · rewrite 模块（草稿改写菜单）
 *
 * 输入框里的文字一键变换：翻译/润色/扩写/缩写/语气。调用链：
 *   面板选动作 → POST /run {text, action} → ctx 侧 llm.stream（路由来自
 *   llm/stream 瀑布旁路捕获的最近一次真实对话路由——会话用什么模型，
 *   改写就用什么模型，零配置）→ 收集 text-delta → 返回改写文本。
 *
 * 约束与坑位：
 *   - 改写调用打 globalThis.__dshPluginCall.source = 'rewrite'（dsh-cost
 *     按来源分账，不混进对话费）；
 *   - 自己的 llm/stream 监听只做路由捕获，AsyncLocalStorage 深度标记
 *     防止自己的生成再进监听器（followup 同款机制）；
 *   - 无会话路由时明确 503（先正常发一条消息），绝不静默失败；
 *   - maxTokens 按原文长度动态给（中文 tokens≈chars），防推理吃光配额。
 */
import Schema from '@deepseek-ai/schemastery'
import { AsyncLocalStorage } from 'node:async_hooks'
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const inject = []

const DIAG = join(homedir(), '.dsh', 'superinput-debug.log')
const report = (line) => {
  try {
    mkdirSync(dirname(DIAG), { recursive: true })
    appendFileSync(DIAG, `${new Date().toISOString()} rewrite ${line}\n`, 'utf8')
  } catch { /* ignore */ }
}

export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('启用草稿改写菜单'),
})

/** 动作清单：id → 面板标签 + 改写指令（只输出文本约束防模型加戏）。 */
const ACTIONS = {
  toEn: { label: '翻译成英文', task: '将以下文本翻译成地道的英文，保留原意、语气与格式' },
  toZh: { label: '翻译成中文', task: '将以下文本翻译成通顺自然的中文，保留原意、语气与格式' },
  polish: { label: '润色', task: '在保持原意的前提下润色这段文字：修正语病、提升流畅度与表达质量，不显著改变长度' },
  expand: { label: '扩写', task: '在保持原意的前提下扩写这段文字，补充合理的细节与支撑，长度约为原来的 1.5 到 2 倍' },
  shorten: { label: '缩写', task: '在保留全部关键信息的前提下精简这段文字，去除冗余表达' },
  formal: { label: '正式语气', task: '将这段文字改写为正式、专业的语气，保持原意与信息量' },
  casual: { label: '口语化', task: '将这段文字改写为轻松自然的口语语气，保持原意与信息量' },
}

export function apply(ctx, config) {
  if (!config.enabled) return

  /** 最近一次真实对话的模型路由：会话用什么，改写就用什么。 */
  let lastRoute = null
  const llmDepth = new AsyncLocalStorage()

  ctx.on('llm/stream', (options, next) => {
    // 自己发起的改写生成：透传，不刷新路由（路由本来就来自对话）。
    if (llmDepth.getStore() !== undefined) return next()
    const provider = typeof options?.provider === 'string' ? options.provider : ''
    const model = typeof options?.model === 'string' ? options.model : ''
    if (provider && model) lastRoute = { provider, model }
    return next()
  }, { global: true })

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: '/api/dsh-superinput/rewrite',
      handler: async (req, res) => {
        const send = (status, body) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        const path = (req.url ?? '').split('?')[0].replace(/^\/api\/dsh-superinput\/rewrite/, '')
        if (path === '/run' && req.method === 'POST') {
          let raw = ''
          for await (const chunk of req) raw += chunk
          let body
          try { body = JSON.parse(raw) } catch { send(400, { ok: false, error: 'invalid-json' }); return }
          const text = String(body?.text ?? '').trim()
          const action = ACTIONS[String(body?.action ?? '')]
          if (!text) { send(400, { ok: false, error: '输入框是空的' }); return }
          if (!action) { send(400, { ok: false, error: '未知动作' }); return }
          const route = lastRoute
          if (!route) {
            send(503, { ok: false, error: '暂无可用模型路由——先正常发一条消息，再回来用改写' })
            return
          }
          report(`run action=${body?.action} len=${text.length} route=${route.provider}/${route.model}`)
          // 给 dsh-cost 打来源标记：改写的费用单独归类，不混进对话。
          globalThis.__dshPluginCall = { source: 'rewrite', at: Date.now() }
          const prompt = `你是文字改写助手。任务：${action.task}。\n要求：只输出改写后的文本本身，不要任何解释、前缀、后缀或引号。\n\n原文：\n"""\n${text}\n"""`
          try {
            const iterator = llmDepth.run(1, () => webCtx.llm.stream({
              provider: route.provider,
              model: route.model,
              messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
              maxTokens: Math.min(8000, Math.max(1000, Math.round(text.length * 2.5))),
            })[Symbol.asyncIterator]())
            let out = ''
            try {
              for (;;) {
                const { done, value } = await iterator.next()
                if (done) break
                if (value?.type === 'text-delta' && typeof value.text === 'string') out += value.text
                else if (value?.type === 'finish' && value.reason && (value.reason.kind === 'error' || value.reason.kind === 'aborted')) {
                  throw new Error(`rewrite llm ${value.reason.kind}`)
                }
              }
            } catch (streamError) {
              // 中断底层流，失败后不在后台继续烧 token。
              try {
                const closing = iterator.return?.()
                if (closing && typeof closing.catch === 'function') closing.catch(() => {})
              } catch { /* ignore */ }
              throw streamError
            }
            out = out.trim().replace(/^["“”']+/, '').replace(/["“”']+$/, '')
            if (!out) { send(502, { ok: false, error: '模型没有返回内容' }); return }
            report(`run ok len=${out.length}`)
            send(200, { ok: true, text: out })
          } catch (error) {
            report(`run failed: ${String(error?.message ?? error)}`)
            send(502, { ok: false, error: String(error?.message ?? error).slice(0, 200) })
          }
          return
        }
        send(404, { error: 'not-found' })
      },
    }), 'dsh-superinput: rewrite endpoint')
  })
}

export default { Config, apply }
