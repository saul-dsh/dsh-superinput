/* dsh-superinput · outline 模块客户端：长会话消息目录（按用户消息列大纲，点击滚动跳转）。 */
function createOutlineClient(require) {
  const React = require('react')
  const { createPortal } = require('react-dom')
  const h = React.createElement

  const STYLE_ID = 'dsh-superinput-outline-style'
  const ENDPOINT = '/api/dsh-superinput/export'

  const CSS = `
.dsh-co-btn {
  display: inline-flex; align-items: center;
  border: none !important; background: transparent !important; box-shadow: none !important;
  color: var(--dsw-alias-label-secondary, rgba(232, 238, 250, 0.72)) !important;
  font-size: 12px; line-height: 20px; padding: 1px 8px;
  border-radius: var(--dsw-radius-sm, 6px); cursor: default; user-select: none;
}
.dsh-co-btn:hover { background: var(--dsw-alias-interactive-bg-hover) !important; color: var(--dsw-alias-label-primary) !important; }
.dsh-co-panel {
  position: fixed; z-index: 1100; box-sizing: border-box;
  border: 0; border-radius: var(--dsw-radius-lg, 12px);
  background: var(--dsw-specific-menu, rgba(67, 69, 74, 0.45));
  backdrop-filter: var(--dsw-menu-backdrop-filter, blur(40px) saturate(150%));
  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter, blur(40px) saturate(150%));
  width: min(360px, 100vw - 24px);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
  box-shadow: var(--dsw-elevation-prominent, 0 0 0 0.5px var(--dsw-elevation-stroke-color), 0 3px 8px 0 rgba(0, 0, 0, 0.04), 0 0 20px 0 rgba(0, 0, 0, 0.05));
  padding: 10px; display: flex; flex-direction: column; gap: 6px;
}
.dsh-co-list { display: flex; flex-direction: column; gap: 2px; max-height: 360px; overflow-y: auto; }
.dsh-co-row { display: flex; align-items: baseline; gap: 8px; padding: 6px 8px; border-radius: var(--dsw-radius-sm, 6px); cursor: pointer; }
.dsh-co-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-co-idx { flex: 0 0 auto; font-size: 10px; line-height: 16px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.dsh-co-text { flex: 1 1 auto; min-width: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-co-time { flex: 0 0 auto; font-size: 10px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }
.dsh-co-empty { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); padding: 12px 6px; text-align: center; }
`

  function ensureStyle() {
    if (typeof document === 'undefined') return
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = CSS
    document.head.appendChild(style)
  }

  function report(message) {
    try {
      void fetch('/api/dsh-superinput/prompts/diag', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: `outline: ${String(message).slice(0, 300)}` }),
      }).catch(() => {})
    } catch { /* ignore */ }
  }

  /** 在会话 DOM 里找含片段的文本节点并滚到视中；找不到返回 false。 */
  function scrollToSnippet(snippet) {
    const needle = snippet.replace(/\s+/g, ' ').slice(0, 24)
    if (!needle) return false
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const el = node.parentElement
        if (!el) return NodeFilter.FILTER_REJECT
        // 跳过我们自己的弹层，避免滚到自己
        if (el.closest('[data-dsh-superinput-portal]')) return NodeFilter.FILTER_REJECT
        return node.textContent.replace(/\s+/g, ' ').includes(needle)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT
      },
    })
    const hit = walker.nextNode()
    if (!hit) return false
    hit.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return true
  }

  function OutlinePanel({ sessionId, onClose, pos }) {
    const [items, setItems] = React.useState(null)

    React.useEffect(() => {
      let alive = true
      if (!sessionId) { setItems([]); return undefined }
      void (async () => {
        try {
          const res = await fetch(`${ENDPOINT}/outline?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
          const data = res.ok ? await res.json() : null
          if (alive) setItems(Array.isArray(data?.items) ? data.items : [])
        } catch (error) {
          report(`outline fetch failed: ${error?.stack ?? error}`)
          if (alive) setItems([])
        }
      })()
      return () => { alive = false }
    }, [sessionId])

    React.useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') onClose() }
      const onClick = (e) => {
        if (!e.target.closest?.('.dsh-co-panel') && !e.target.closest?.('.dsh-co-btn')) onClose()
      }
      document.addEventListener('keydown', onKey)
      document.addEventListener('mousedown', onClick, true)
      return () => {
        document.removeEventListener('keydown', onKey)
        document.removeEventListener('mousedown', onClick, true)
      }
    }, [onClose])

    const jump = (text) => {
      const ok = scrollToSnippet(text)
      if (ok) onClose()
    }

    const portalHost = React.useRef(null)
    if (!portalHost.current && typeof document !== 'undefined' && document.body) {
      try {
        portalHost.current = document.createElement('div')
        portalHost.current.setAttribute('data-dsh-superinput-portal', 'outline')
        document.body.appendChild(portalHost.current)
      } catch { portalHost.current = null }
    }
    React.useEffect(() => () => { portalHost.current?.remove() }, [])

    if (!portalHost.current) return null
    return createPortal(h('div', { className: 'dsh-co-panel', style: pos ?? { display: 'none' } },
      h('div', { className: 'dsh-co-list' },
        items === null
          ? h('div', { className: 'dsh-co-empty' }, '加载中…')
          : items.length === 0
            ? h('div', { className: 'dsh-co-empty' }, '还没有用户消息')
            : items.map((item) => h('div', {
              className: 'dsh-co-row', key: `${item.i}:${item.at ?? ''}`,
              onClick: () => jump(item.text),
            },
              h('span', { className: 'dsh-co-idx' }, `#${item.i}`),
              h('span', { className: 'dsh-co-text' }, item.text),
              h('span', { className: 'dsh-co-time' }, item.at
                ? new Date(item.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                : ''))))), portalHost.current)
  }

  function OutlineButton({ sessionId }) {
    const [open, setOpen] = React.useState(false)
    const btnRef = React.useRef(null)
    const [pos, setPos] = React.useState(null)
    React.useEffect(() => {
      if (!open || !btnRef.current) return
      const rect = btnRef.current.getBoundingClientRect()
      const width = Math.min(360, window.innerWidth - 24)
      setPos({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: Math.max(8, rect.top - 8),
        transform: 'translateY(-100%)',
      })
    }, [open])
    return h('span', { ref: btnRef, style: { display: 'inline-flex', position: 'relative' } },
      h('button', {
        className: 'dsh-co-btn',
        title: '消息目录（按你的提问跳转）',
        onClick: () => setOpen((v) => !v),
      }, '目录'),
      open ? h(OutlinePanel, { sessionId, onClose: () => setOpen(false), pos }) : null)
  }

  /** 错误边界：崩溃留痕而不是无声消失。 */
  class OutlineBoundary extends React.Component {
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
      ensureStyle()
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock',
        id: 'dsh-superinput-outline-btn',
        order: 6,
      }, (props) => h(OutlineBoundary, null, h(OutlineButton, props))))
    },
  }
}
