/* dsh-superinput · snippets 模块客户端：copy 捕获 + dock 入口 + 片段面板。 */
function createSnippetsClient(require) {
  const React = require('react')
  const { createPortal } = require('react-dom')
  const h = React.createElement

  const STYLE_ID = 'dsh-superinput-snippets-style'
  const ENDPOINT = '/api/dsh-superinput/snippets'
  const MAX_TEXT = 100_000

  const CSS = `
.dsh-cs-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  color: var(--dsw-alias-label-secondary, rgba(232, 238, 250, 0.72)) !important;
  font-size: 12px;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
  padding: 1px 8px;
  border-radius: var(--dsw-radius-sm, 6px);
  cursor: default;
  user-select: none;
}
.dsh-cs-btn:hover { background: var(--dsw-alias-interactive-bg-hover) !important; color: var(--dsw-alias-label-primary) !important; }
.dsh-cs-panel {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  border: 0;
  border-radius: var(--dsw-radius-lg, 12px);
  background: var(--dsw-specific-menu, rgba(67, 69, 74, 0.45));
  backdrop-filter: var(--dsw-menu-backdrop-filter, blur(40px) saturate(150%));
  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter, blur(40px) saturate(150%));
  width: min(340px, 100vw - 24px);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
  box-shadow: var(--dsw-elevation-prominent, 0 0 0 0.5px var(--dsw-elevation-stroke-color), 0 3px 8px 0 rgba(0, 0, 0, 0.04), 0 0 20px 0 rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-secondary);
  padding: 10px;
  font-size: 12px;
  line-height: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dsh-cs-search {
  box-sizing: border-box;
  width: 100%;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: var(--dsw-radius-sm, 6px);
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.06));
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  outline: none;
}
.dsh-cs-search::placeholder { color: var(--dsw-alias-label-tertiary); }
.dsh-cs-list { max-height: 320px; overflow: auto; overscroll-behavior: contain; display: flex; flex-direction: column; }
.dsh-cs-row { display: flex; align-items: center; gap: 6px; min-height: 30px; border-radius: 6px; padding: 2px 6px; }
.dsh-cs-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-cs-row + .dsh-cs-row { margin-top: 1px; }
.dsh-cs-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); cursor: default; }
.dsh-cs-meta { flex: none; font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.dsh-cs-act { flex: none; border: none; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; font-size: 12px; padding: 2px 4px; border-radius: 4px; }
.dsh-cs-act:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
.dsh-cs-empty { padding: 12px 6px; text-align: center; color: var(--dsw-alias-label-tertiary); }
.dsh-cs-pinned-title { padding: 2px 6px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
`

  function ensureStyle() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = CSS
    document.head.appendChild(style)
  }

  async function api(path, body) {
    const res = await fetch(`${ENDPOINT}/${path}`, body === undefined
      ? { cache: 'no-store' }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) return null
    return res.json().catch(() => null)
  }

  /** 复制捕获：capture 阶段监听，选中非空文本去重上报（服务端再按指纹去重）。 */
  function startCapture() {
    let lastSent = ''
    let lastSentAt = 0
    let timer = 0
    document.addEventListener('copy', () => {
      // 读选区放 debounce 外取不到（copy 后选区仍在，但稳妥起见同步取）。
      const text = String(window.getSelection?.() ?? '').slice(0, MAX_TEXT)
      if (!text || text.trim().length < 2) return
      if (text === lastSent && Date.now() - lastSentAt < 1500) return
      lastSent = text
      lastSentAt = Date.now()
      if (timer) return
      timer = setTimeout(() => {
        timer = 0
        void api('add', { text: lastSent, source: 'copy' }).catch(() => {})
      }, 600)
    }, true)
  }

  /** 片段面板：官方弹卡模板（半透明底 + 毛玻璃），向上展开，点外/Esc 关闭。 */
  function SnippetsPanel({ anchor, onClose }) {
    const [items, setItems] = React.useState(null)
    const [query, setQuery] = React.useState('')
    const inputRef = React.useRef(null)

    const reload = React.useCallback(async () => {
      const data = await api('list')
      if (data && Array.isArray(data.items)) setItems(data.items)
    }, [])
    React.useEffect(() => { void reload() }, [reload])

    React.useEffect(() => {
      inputRef.current?.focus()
      const onKey = (event) => { if (event.key === 'Escape') onClose() }
      const onClick = (event) => {
        if (!event.target.closest?.('.dsh-cs-panel') && !event.target.closest?.('.dsh-cs-btn')) onClose()
      }
      document.addEventListener('keydown', onKey)
      document.addEventListener('mousedown', onClick, true)
      return () => {
        document.removeEventListener('keydown', onKey)
        document.removeEventListener('mousedown', onClick, true)
      }
    }, [onClose])

    // 面板出现在按钮上方（输入区贴窗口底，向上展开防裁剪）。
    const [pos, setPos] = React.useState(null)
    React.useEffect(() => {
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const width = Math.min(340, window.innerWidth - 24)
      setPos({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: Math.max(8, rect.top - 8),
        transform: 'translateY(-100%)',
      })
    }, [anchor])

    const remove = async (id) => { await api('remove', { id }); void reload() }
    const pin = async (item) => { await api('pin', { id: item.id, pinned: !item.pinned }); void reload() }
    const insert = async (item) => {
      // 插入 = 追加到当前草稿尾部（无光标级插入 API；追加后由宿主聚焦编辑器）。
      const current = String(window.__dshSuperinputDraft?.() ?? '')
      const next = current ? `${current}\n${item.text}` : item.text
      window.__dshSuperinputSetDraft?.(next)
      onClose()
    }

    const q = query.trim().toLowerCase()
    const all = items ?? []
    const pinned = all.filter((item) => item.pinned && (!q || item.text.toLowerCase().includes(q)))
    const recent = all.filter((item) => !item.pinned && (!q || item.text.toLowerCase().includes(q)))

    // portal 容器：自建 div 挂 body——不直接用 document.body（与 prompts 同款，
    // 绕开 rc.5 环境下 React #200 "Target container is not a DOM element"）。
    const portalHost = React.useRef(null)
    if (!portalHost.current && typeof document !== 'undefined' && document.body) {
      try {
        portalHost.current = document.createElement('div')
        portalHost.current.setAttribute('data-dsh-superinput-portal', 'snippets')
        document.body.appendChild(portalHost.current)
      } catch { portalHost.current = null }
    }
    React.useEffect(() => () => { portalHost.current?.remove() }, [])

    return portalHost.current
      ? createPortal(h('div', { className: 'dsh-cs-panel', style: pos ?? { display: 'none' } },
      h('input', {
        ref: inputRef,
        className: 'dsh-cs-search',
        placeholder: '搜索片段…',
        value: query,
        onInput: (event) => setQuery(event.target.value),
      }),
      h('div', { className: 'dsh-cs-list' },
        !items
          ? h('div', { className: 'dsh-cs-empty' }, '加载中…')
          : (pinned.length === 0 && recent.length === 0)
            ? h('div', { className: 'dsh-cs-empty' }, q ? '没有匹配的片段' : '在输入区或正文里复制内容，就会出现在这里')
            : [
              pinned.length > 0 ? h('div', { className: 'dsh-cs-pinned-title', key: 'pt' }, '已收藏') : null,
              ...pinned.map((item) => h('div', { className: 'dsh-cs-row', key: item.id },
                h('span', { className: 'dsh-cs-text', title: item.text, onClick: () => { void insert(item) } }, item.text.split('\n')[0].slice(0, 120)),
                h('button', { className: 'dsh-cs-act', title: '取消收藏', onClick: () => { void pin(item) } }, '★'),
                h('button', { className: 'dsh-cs-act', title: '删除', onClick: () => { void remove(item.id) } }, '✕'))),
              recent.length > 0 ? h('div', { className: 'dsh-cs-pinned-title', key: 'rt' }, pinned.length > 0 ? '最近' : '') : null,
              ...recent.slice(0, 60).map((item) => h('div', { className: 'dsh-cs-row', key: item.id },
                h('span', { className: 'dsh-cs-text', title: item.text, onClick: () => { void insert(item) } }, item.text.split('\n')[0].slice(0, 120)),
                h('span', { className: 'dsh-cs-meta' }, new Date(item.at).toLocaleDateString([], { month: 'numeric', day: 'numeric' })),
                h('button', { className: 'dsh-cs-act', title: '收藏', onClick: () => { void pin(item) } }, '☆'),
                h('button', { className: 'dsh-cs-act', title: '删除', onClick: () => { void remove(item.id) } }, '✕'))),
            ])),
      portalHost.current)
      : null
  }

  const CLIPBOARD_ICON = h('svg', {
    width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    style: { display: 'block' },
  },
  h('path', { d: 'M5.5 3h-1.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1.5', stroke: 'currentColor', 'stroke-width': '1.2', 'stroke-linecap': 'round' }),
  h('rect', { x: '5.75', y: '1.75', width: '4.5', height: '2.5', rx: '0.75', stroke: 'currentColor', 'stroke-width': '1.2' }))

  /** dock 入口按钮：composer.dock 标准槽位（与费用 pill 同区）。 */
  function SnippetsButton(props) {
    const [open, setOpen] = React.useState(false)
    const buttonRef = React.useRef(null)
    // onClose 必须无条件调用：曾经写在下方三元分支里，open 翻转时 hook
    // 数量变化 → React 抛 "Rendered more hooks" → 边界把整个按钮卸成
    // null（真机表现即「剪贴板一点就消失」，0.1.1 修复）。
    const onClose = React.useCallback(() => setOpen(false), [])
    // 存活取证：挂载/卸载各记一条——按钮运行中消失时日志能区分
    // 「组件被卸载」还是「还在但不可见」。
    React.useEffect(() => {
      void fetch(`${ENDPOINT}/diag`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'dock button MOUNTED' }),
      }).catch(() => {})
      return () => {
        void fetch(`${ENDPOINT}/diag`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: 'dock button UNMOUNTED (host removed the slot component)' }),
        }).catch(() => {})
      }
    }, [])
    return h('span', { className: 'dsh-cs-anchor' },
      h('button', {
        ref: buttonRef,
        type: 'button',
        className: 'dsh-cs-btn',
        title: '片段管理器（自动捕获窗口内复制）',
        'aria-label': '片段管理器',
        onClick: (event) => { event.stopPropagation(); setOpen((value) => !value) },
      }, CLIPBOARD_ICON),
      open ? h(SnippetsPanel, { anchor: buttonRef.current, onClose }) : null)
  }

  /**
   * 错误边界 + 存活取证：真机曾出现「片段」按钮运行中消失（同槽位费用
   * pill 存活）——组件树抛错被宿主卸载时必须留下证据，否则无从排查。
   */
  class SnippetsBoundary extends React.Component {
    constructor(props) { super(props); this.state = { crashed: false } }
    static getDerivedStateFromError() { return { crashed: true } }
    componentDidCatch(error, info) {
      try {
        void fetch(`${ENDPOINT}/diag`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: `boundary: ${String(error?.message ?? error).slice(0, 200)} | stack: ${String(info?.componentStack ?? '').slice(0, 200)}` }),
        }).catch(() => {})
      } catch { /* ignore */ }
      console.error('[dsh-superinput] snippets crashed:', error)
    }
    render() {
      if (this.state.crashed) return null
      return this.props.children
    }
  }

  /** 草稿桥：面板插入用。挂 conversation.input.dock——该槽位确认注入
   * useInput / inputActions（followup 同款验证过）；composer.dock 不注入
   * 这些 props，在那边调用会 render 阶段抛错并连带整个槽位树崩掉
   * （0.1.0 实测根因：片段按钮随之消失且无 effect 日志）。 */
  function SnippetsDraftBridge({ useInput, inputActions }) {
    const draft = useInput((state) => state.draft)
    React.useEffect(() => {
      window.__dshSuperinputDraft = () => (typeof draft === 'string' ? draft : '')
      window.__dshSuperinputSetDraft = (value) => {
        try { inputActions?.setDraft?.(value) } catch { /* ignore */ }
      }
    }, [draft, inputActions])
    return null
  }

  return {
    inject: ['slots'],
    apply(ctx) {
      ensureStyle()
      if (typeof document !== 'undefined') startCapture()
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock',
        id: 'dsh-superinput-snippets-btn',
        order: 3,
      }, SnippetsButton))
      // 草稿桥挂 input.dock（props 注入 see SnippetsDraftBridge 注释）。
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'dsh-superinput-snippets-bridge',
        order: 95,
      }, SnippetsDraftBridge))
    },
  }
}
