/* dsh-superinput · rewrite 模块客户端：草稿改写菜单。 */
function createRewriteClient(require) {
  const React = require('react')
  const { createPortal } = require('react-dom')
  const h = React.createElement

  const STYLE_ID = 'dsh-superinput-rewrite-style'
  const ENDPOINT = '/api/dsh-superinput/rewrite'

  const ACTIONS = [
    { id: 'toEn', label: '翻译成英文' },
    { id: 'toZh', label: '翻译成中文' },
    { id: 'polish', label: '润色' },
    { id: 'expand', label: '扩写' },
    { id: 'shorten', label: '缩写' },
    { id: 'formal', label: '正式语气' },
    { id: 'casual', label: '口语化' },
  ]

  const CSS = `
.dsh-cw-btn {
  display: inline-flex;
  align-items: center;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  color: var(--dsw-alias-label-secondary, rgba(232, 238, 250, 0.72)) !important;
  font-size: 12px;
  line-height: 20px;
  padding: 1px 8px;
  border-radius: var(--dsw-radius-sm, 6px);
  cursor: default;
  user-select: none;
}
.dsh-cw-btn:hover { background: var(--dsw-alias-interactive-bg-hover) !important; color: var(--dsw-alias-label-primary) !important; }
.dsh-cw-panel {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  border: 0;
  border-radius: var(--dsw-radius-lg, 12px);
  background: var(--dsw-specific-menu, rgba(67, 69, 74, 0.45));
  backdrop-filter: var(--dsw-menu-backdrop-filter, blur(40px) saturate(150%));
  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter, blur(40px) saturate(150%));
  width: min(300px, 100vw - 24px);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
  box-shadow: var(--dsw-elevation-prominent, 0 0 0 0.5px var(--dsw-elevation-stroke-color), 0 3px 8px 0 rgba(0, 0, 0, 0.04), 0 0 20px 0 rgba(0, 0, 0, 0.05));
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dsh-cw-title { font-size: 12px; line-height: 20px; font-weight: 500; color: var(--dsw-alias-label-secondary); padding: 0 4px; }
.dsh-cw-row { display: flex; align-items: center; height: 28px; padding: 0 8px; border-radius: var(--dsw-radius-sm, 6px); border: none; width: 100%; background: transparent; color: var(--dsw-alias-label-primary); font-size: 12px; cursor: pointer; text-align: left; }
.dsh-cw-row:hover:not([disabled]) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-cw-row[disabled] { opacity: 0.5; cursor: default; }
.dsh-cw-result { max-height: 200px; overflow-y: auto; padding: 8px 10px; border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12)); border-radius: var(--dsw-radius-sm, 6px); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary); white-space: pre-wrap; word-break: break-word; }
.dsh-cw-result-label { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }
.dsh-cw-actions { display: flex; justify-content: flex-end; gap: 6px; }
.dsh-cw-action {
  padding: 4px 12px; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.06));
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  border-radius: var(--dsw-radius-sm, 6px);
  cursor: pointer;
}
.dsh-cw-action:hover { color: var(--dsw-alias-label-primary); }
.dsh-cw-action.primary { color: #fff; background: #3a83f7; border-color: transparent; }
.dsh-cw-action.primary:hover { background: #4f8ef9; }
.dsh-cw-empty { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); padding: 2px 6px; }
`

  function ensureStyle() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = CSS
    document.head.appendChild(style)
  }

  /** 异常留痕：走 snippets /diag（rewrite 服务端日志在 superinput-debug.log）。 */
  function report(message) {
    try {
      void fetch('/api/dsh-superinput/snippets/diag', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: `rewrite: ${String(message).slice(0, 300)}` }),
      }).catch(() => {})
    } catch { /* ignore */ }
  }

  class RewriteBoundary extends React.Component {
    constructor(props) { super(props); this.state = { crashed: false } }
    static getDerivedStateFromError() { return { crashed: true } }
    componentDidCatch(error) {
      report(`boundary: ${String(error?.message ?? error).slice(0, 200)} | stack: ${String(error?.stack ?? '').slice(0, 400)}`)
    }
    render() { return this.state.crashed ? null : this.props.children }
  }

  function RewritePanel({ anchor, onClose }) {
    const [busy, setBusy] = React.useState(null)
    const [result, setResult] = React.useState(null)
    const [flash, setFlash] = React.useState(null)
    const [pos, setPos] = React.useState(null)

    React.useEffect(() => {
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const width = Math.min(300, window.innerWidth - 24)
      setPos({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: Math.max(8, rect.top - 8),
        transform: 'translateY(-100%)',
      })
    }, [anchor])

    React.useEffect(() => {
      if (!flash) return undefined
      const timer = setTimeout(() => setFlash(null), 3500)
      return () => clearTimeout(timer)
    }, [flash])

    // portal 容器：自建 div 挂 body（与 prompts/snippets 同款，绕开 rc.5 的
    // React #200 "Target container is not a DOM element"）。
    const portalHost = React.useRef(null)
    if (!portalHost.current && typeof document !== 'undefined' && document.body) {
      try {
        portalHost.current = document.createElement('div')
        portalHost.current.setAttribute('data-dsh-superinput-portal', 'rewrite')
        document.body.appendChild(portalHost.current)
      } catch { portalHost.current = null }
    }
    React.useEffect(() => () => { portalHost.current?.remove() }, [])

    React.useEffect(() => {
      const onKey = (event) => { if (event.key === 'Escape' && !busy) onClose() }
      const onClick = (event) => {
        if (busy) return
        if (!event.target.closest?.('.dsh-cw-panel') && !event.target.closest?.('.dsh-cw-btn')) onClose()
      }
      document.addEventListener('keydown', onKey)
      document.addEventListener('mousedown', onClick, true)
      return () => {
        document.removeEventListener('keydown', onKey)
        document.removeEventListener('mousedown', onClick, true)
      }
    }, [onClose, busy])

    const run = async (action) => {
      const text = String(window.__dshSuperinputDraft?.() ?? '').trim()
      if (!text) { setFlash('输入框是空的，先写点内容'); return }
      setBusy(action.id)
      setFlash(null)
      setResult(null)
      try {
        const res = await fetch(`${ENDPOINT}/run`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, action: action.id }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) setFlash(data?.error ?? `改写失败（HTTP ${res.status}）`)
        else setResult({ label: action.label, text: String(data.text ?? '') })
      } catch (error) {
        report(`run failed: ${error?.stack ?? error}`)
        setFlash(`请求失败：${String(error?.message ?? error)}`)
      } finally {
        setBusy(null)
      }
    }

    const replaceDraft = () => {
      try {
        if (!window.__dshSuperinputSetDraft) {
          setFlash('草稿桥未就绪，请关掉面板重开再试')
          report('replace skipped: draft bridge missing')
          return
        }
        window.__dshSuperinputSetDraft(result.text)
        onClose()
      } catch (error) {
        report(`replace failed: ${error?.stack ?? error}`)
        setFlash(`替换失败：${String(error?.message ?? error)}`)
      }
    }

    return portalHost.current
      ? createPortal(h('div', { className: 'dsh-cw-panel', style: pos ?? { display: 'none' } },
        h('div', { className: 'dsh-cw-title' }, '草稿改写'),
        result
          ? [
            h('div', { className: 'dsh-cw-result-label', key: 'rl' }, `${result.label}结果，替换后原稿不保留：`),
            h('div', { className: 'dsh-cw-result', key: 'rb' }, result.text),
            h('div', { className: 'dsh-cw-actions', key: 'ra' },
              h('button', { className: 'dsh-cw-action', onClick: () => setResult(null) }, '放弃'),
              h('button', { className: 'dsh-cw-action primary', onClick: replaceDraft }, '替换草稿')),
          ]
          : h('div', {},
            ACTIONS.map((action) => h('button', {
              key: action.id,
              className: 'dsh-cw-row',
              disabled: busy !== null,
              onClick: () => { void run(action) },
            },
            h('span', { className: 'dsh-cw-label' }, action.label),
            busy === action.id ? h('span', { className: 'dsh-cw-busy' }, '改写中…') : null))),
        flash ? h('div', { className: 'dsh-cw-empty' }, flash) : null), portalHost.current)
      : null
  }

  function RewriteButton() {
    const [open, setOpen] = React.useState(false)
    const ref = React.useRef(null)
    // onClose 必须无条件调用（hook 数量在 open 翻转时要稳定，条件 hook 陷阱）。
    const onClose = React.useCallback(() => setOpen(false), [])
    return h('span', { ref, style: { display: 'inline-flex' } },
      h('button', {
        className: 'dsh-cw-btn',
        title: '草稿改写（翻译/润色/扩写/缩写/语气）',
        onClick: () => setOpen((value) => !value),
      }, '改写'),
      open ? h(RewritePanel, { anchor: ref.current, onClose }) : null)
  }

  return {
    inject: ['slots'],
    apply(ctx) {
      ensureStyle()
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock',
        id: 'dsh-superinput-rewrite-btn',
        order: 5,
      }, (props) => h(RewriteBoundary, null, h(RewriteButton, props))))
    },
  }
}
