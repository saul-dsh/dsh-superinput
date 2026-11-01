/* dsh-superinput · exporter 模块客户端：会话标题栏「导出 Markdown」按钮。 */
function createExporterClient(require) {
  const React = require('react')
  const h = React.createElement

  const ENDPOINT = '/api/dsh-superinput/export'

  /** 异常留痕：走 prompts /diag（套件统一通道）。 */
  function report(message) {
    try {
      void fetch('/api/dsh-superinput/prompts/diag', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: `exporter: ${String(message).slice(0, 300)}` }),
      }).catch(() => {})
    } catch { /* ignore */ }
  }

  function ExportButton({ sessionId }) {
    const [busy, setBusy] = React.useState(false)
    const [done, setDone] = React.useState(false)

    const download = async () => {
      if (busy || !sessionId) return
      setBusy(true)
      try {
        const res = await fetch(`${ENDPOINT}/markdown?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`export ${res.status}`)
        const blob = new Blob([await res.text()], { type: 'text/markdown;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `dsh-session-${new Date().toISOString().slice(0, 10)}.md`
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
        setDone(true)
        setTimeout(() => setDone(false), 2000)
      } catch (error) {
        report(`export failed: ${error?.stack ?? error}`)
      } finally {
        setBusy(false)
      }
    }

    return h('button', {
      type: 'button',
      title: '导出会话 Markdown',
      'aria-label': '导出会话 Markdown',
      disabled: busy || !sessionId,
      onClick: () => { void download() },
      style: {
        width: 28, height: 28, padding: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, lineHeight: '16px',
        color: done ? '#22c55e' : 'var(--dsw-alias-label-secondary, rgba(232, 238, 250, 0.72))',
        background: 'transparent', border: 'none', borderRadius: 'var(--dsw-radius-sm, 6px)',
        cursor: 'pointer', opacity: sessionId ? 1 : 0.4,
      },
      onMouseEnter: (e) => { e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.07))' },
      onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent' },
    }, busy ? '…' : done ? '✓' : '⬇')
  }

  /** 错误边界：崩溃留痕而不是无声消失。 */
  class ExportBoundary extends React.Component {
    constructor(props) { super(props); this.state = { crashed: false } }
    static getDerivedStateFromError() { return { crashed: true } }
    componentDidCatch(error) {
      report(`boundary: ${String(error?.stack ?? error).slice(0, 400)}`)
    }
    render() { return this.state.crashed ? null : this.props.children }
  }

  return {
    inject: ['slots'],
    apply(ctx) {
      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: 'dsh-superinput-export-btn',
        order: -6,
      }, (props) => h(ExportBoundary, null, h(ExportButton, props))))
    },
  }
}
