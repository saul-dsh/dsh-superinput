/* dsh-superinput · prompts 模块客户端：模板库入口 + 面板。 */
function createPromptsClient(require) {
  const React = require('react')
  const { createPortal } = require('react-dom')
  const h = React.createElement

  const STYLE_ID = 'dsh-superinput-prompts-style'
  const ENDPOINT = '/api/dsh-superinput/prompts'

  const CSS = `
.dsh-cp-btn {
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
.dsh-cp-btn:hover { background: var(--dsw-alias-interactive-bg-hover) !important; color: var(--dsw-alias-label-primary) !important; }
.dsh-cp-panel {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  border: 0;
  border-radius: var(--dsw-radius-lg, 12px);
  background: var(--dsw-specific-menu, rgba(67, 69, 74, 0.45));
  backdrop-filter: var(--dsw-menu-backdrop-filter, blur(40px) saturate(150%));
  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter, blur(40px) saturate(150%));
  width: min(380px, 100vw - 24px);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
  box-shadow: var(--dsw-elevation-prominent, 0 0 0 0.5px var(--dsw-elevation-stroke-color), 0 3px 8px 0 rgba(0, 0, 0, 0.04), 0 0 20px 0 rgba(0, 0, 0, 0.05));
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dsh-cp-head { display: flex; gap: 6px; align-items: center; }
.dsh-cp-search {
  flex: 1 1 auto; min-width: 0; box-sizing: border-box;
  padding: 6px 10px; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.06));
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  border-radius: var(--dsw-radius-sm, 6px);
  outline: none;
}
.dsh-cp-search:focus { border-color: var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.2)); }
.dsh-cp-new {
  flex: 0 0 auto; width: 26px; height: 26px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 16px; line-height: 1;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.06));
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  border-radius: var(--dsw-radius-sm, 6px);
  cursor: pointer;
}
.dsh-cp-new:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
.dsh-cp-list { display: flex; flex-direction: column; gap: 2px; max-height: 320px; overflow-y: auto; }
.dsh-cp-group { font-size: 11px; line-height: 18px; color: var(--dsw-alias-label-tertiary); padding: 4px 6px 2px; }
.dsh-cp-row { display: flex; align-items: flex-start; gap: 6px; padding: 6px; border-radius: var(--dsw-radius-sm, 6px); }
.dsh-cp-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-cp-row-main { flex: 1 1 auto; min-width: 0; cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
.dsh-cp-title { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-cp-preview { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-cp-vars { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.dsh-cp-var { font-size: 10px; line-height: 14px; padding: 0 4px; border-radius: 3px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.08)); }
.dsh-cp-row-actions { flex: 0 0 auto; display: flex; gap: 2px; }
.dsh-cp-mini {
  width: 20px; height: 20px; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; line-height: 1;
  color: var(--dsw-alias-label-tertiary);
  background: transparent; border: none; border-radius: 4px; cursor: pointer;
}
.dsh-cp-mini:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.08)); }
.dsh-cp-mini.danger:hover { color: #f87171; }
.dsh-cp-empty { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); padding: 12px 6px; text-align: center; }
.dsh-cp-editor { display: flex; flex-direction: column; gap: 6px; }
.dsh-cp-input, .dsh-cp-textarea {
  box-sizing: border-box; width: 100%;
  padding: 6px 10px; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.06));
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  border-radius: var(--dsw-radius-sm, 6px);
  outline: none; font-family: inherit; resize: vertical;
}
.dsh-cp-textarea { min-height: 120px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dsh-cp-actions { display: flex; justify-content: flex-end; gap: 6px; }
.dsh-cp-action {
  padding: 4px 12px; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.06));
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  border-radius: var(--dsw-radius-sm, 6px);
  cursor: pointer;
}
.dsh-cp-action:hover { color: var(--dsw-alias-label-primary); }
.dsh-cp-action.primary { color: #fff; background: #3a83f7; border-color: transparent; }
.dsh-cp-action.primary:hover { background: #4f8ef9; }
`

  function ensureStyle() {
    if (typeof document === 'undefined') return
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = CSS
    document.head.appendChild(style)
  }

  async function api(path, body) {
    try {
      const res = await fetch(`${ENDPOINT}${path}`, body
        ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
        : { cache: 'no-store' })
      return res.ok ? res.json() : null
    } catch { return null }
  }

  /** 异常留痕：走 snippets /diag（服务端落 snippets-debug.log），prompts 自己没有 diag 端点。 */
  function report(message) {
    try {
      void fetch('/api/dsh-superinput/snippets/diag', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: `prompts: ${String(message).slice(0, 300)}` }),
      }).catch(() => {})
    } catch { /* ignore */ }
  }

  /** 找出正文里的 {{变量}}，去重保序。 */
  function varsOf(text) {
    const found = []
    const re = /\{\{\s*([a-zA-Z_$][\w$]*)\s*\}\}/g
    let match
    while ((match = re.exec(String(text ?? '')))) {
      if (!found.includes(match[1])) found.push(match[1])
    }
    return found
  }

  /** 内置动态变量：同步可取的自动填值；取不到的（如剪贴板）留空手填/异步预填。 */
  function autoValue(name) {
    const now = new Date()
    if (name === '日期') return now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    if (name === '时间') return now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    if (name === '星期') return now.toLocaleDateString('zh-CN', { weekday: 'long' })
    return null
  }

  function PromptsPanel({ anchor, onClose }) {
    const [items, setItems] = React.useState(null)
    const [query, setQuery] = React.useState('')
    const [draft, setDraft] = React.useState(null)
    const [fill, setFill] = React.useState(null)
    const [flash, setFlash] = React.useState(null)
    const inputRef = React.useRef(null)

    const reload = React.useCallback(async () => {
      const data = await api('/list')
      if (data && Array.isArray(data.items)) setItems(data.items)
    }, [])
    React.useEffect(() => { void reload() }, [reload])

    // 编辑/填变量中不响应 Esc / 点外，避免丢失刚输入的内容。
    React.useEffect(() => {
      const onKey = (event) => { if (event.key === 'Escape' && !draft && !fill) onClose() }
      const onClick = (event) => {
        if (draft || fill) return
        if (!event.target.closest?.('.dsh-cp-panel') && !event.target.closest?.('.dsh-cp-btn')) onClose()
      }
      document.addEventListener('keydown', onKey)
      document.addEventListener('mousedown', onClick, true)
      return () => {
        document.removeEventListener('keydown', onKey)
        document.removeEventListener('mousedown', onClick, true)
      }
    }, [onClose, draft, fill])

    React.useEffect(() => {
      if (!flash) return undefined
      const timer = setTimeout(() => setFlash(null), 3500)
      return () => clearTimeout(timer)
    }, [flash])

    const [pos, setPos] = React.useState(null)
    React.useEffect(() => {
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const width = Math.min(380, window.innerWidth - 24)
      setPos({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: Math.max(8, rect.top - 8),
        transform: 'translateY(-100%)',
      })
    }, [anchor])

    const insert = (item, values) => {
      try {
        let out = String(item.body ?? '')
        for (const [name, value] of Object.entries(values ?? {})) {
          out = out.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g'), value ?? '')
        }
        if (!window.__dshSuperinputSetDraft) {
          setFlash('草稿桥未就绪，请关掉面板重开再试')
          report('insert skipped: draft bridge missing')
          return
        }
        const current = String(window.__dshSuperinputDraft?.() ?? '')
        window.__dshSuperinputSetDraft(current ? `${current}\n${out}` : out)
        onClose()
      } catch (error) {
        report(`insert failed: ${error?.stack ?? error}`)
        setFlash(`插入失败：${String(error?.message ?? error)}`)
      }
    }

    const remove = async (id) => { await api('/remove', { id }); void reload() }
    const pin = async (item) => { await api('/pin', { id: item.id, pinned: !item.pinned }); void reload() }
    const save = async () => {
      if (!draft || !String(draft.body ?? '').trim()) return
      await api('/save', {
        id: draft.id,
        title: draft.title,
        body: draft.body,
        tags: String(draft.tagsText ?? '').split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
      })
      setDraft(null)
      void reload()
    }

    function row(item) {
      const vars = varsOf(item.body)
      return h('div', { className: 'dsh-cp-row', key: item.id },
        h('div', {
          className: 'dsh-cp-row-main',
          onClick: () => {
            const vars = varsOf(item.body)
            if (vars.length === 0) { insert(item); return }
            // 内置动态变量（日期/时间/星期）自动取值；全部能自动取就一键直插。
            const values = {}
            let pending = false
            for (const name of vars) {
              const auto = autoValue(name)
              if (auto !== null) values[name] = auto
              else pending = true
            }
            if (!pending) { insert(item, values); return }
            setFill({ item, names: vars, values })
            // {{剪贴板}} 异步预填：读不到就留空手填。
            if (vars.includes('剪贴板')) {
              void navigator.clipboard?.readText?.()
                .then((text) => {
                  if (typeof text === 'string' && text) {
                    setFill((f) => (f && f.names.includes('剪贴板') && f.values['剪贴板'] === undefined
                      ? { ...f, values: { ...f.values, 剪贴板: text } }
                      : f))
                  }
                })
                .catch(() => {})
            }
          },
        },
          h('div', { className: 'dsh-cp-title' }, item.title),
          h('div', { className: 'dsh-cp-preview' }, String(item.body).split('\n')[0].slice(0, 100)),
          vars.length > 0
            ? h('div', { className: 'dsh-cp-vars' }, vars.map((name) => h('span', { className: 'dsh-cp-var', key: name }, `{{${name}}}`)))
            : null),
        h('div', { className: 'dsh-cp-row-actions' },
          h('button', { className: 'dsh-cp-mini', title: item.pinned ? '取消收藏' : '收藏', onClick: () => { void pin(item) } }, item.pinned ? '★' : '☆'),
          h('button', {
            className: 'dsh-cp-mini',
            title: '编辑',
            onClick: () => setDraft({ id: item.id, title: item.title, body: item.body, tagsText: (item.tags ?? []).join(', ') }),
          }, '✎'),
          h('button', { className: 'dsh-cp-mini danger', title: '删除', onClick: () => { void remove(item.id) } }, '×')))
    }

    const q = String(query).trim().toLowerCase()
    const all = items ?? []
    const match = (item) => !q || String(item.title).toLowerCase().includes(q) || String(item.body).toLowerCase().includes(q)
    const pinned = all.filter((item) => item.pinned && match(item))
    const recent = all.filter((item) => !item.pinned && match(item))

    const editor = draft
      ? h('div', { className: 'dsh-cp-editor' },
        h('input', {
          className: 'dsh-cp-input',
          placeholder: '标题（留空取正文前 40 字）',
          value: draft.title,
          onInput: (event) => setDraft({ ...draft, title: event.target.value }),
        }),
        h('textarea', {
          className: 'dsh-cp-textarea',
          placeholder: '模板正文，可用 {{变量}} 占位符',
          value: draft.body,
          rows: 8,
          onInput: (event) => setDraft({ ...draft, body: event.target.value }),
        }),
        h('input', {
          className: 'dsh-cp-input',
          placeholder: '标签，逗号分隔',
          value: draft.tagsText ?? '',
          onInput: (event) => setDraft({ ...draft, tagsText: event.target.value }),
        }),
        h('div', { className: 'dsh-cp-actions' },
          h('button', { className: 'dsh-cp-action', onClick: () => setDraft(null) }, '取消'),
          h('button', { className: 'dsh-cp-action primary', onClick: () => { void save() } }, '保存')))
      : null

    const fillForm = fill
      ? h('div', { className: 'dsh-cp-editor' },
        h('div', { className: 'dsh-cp-group' }, `填写「${fill.item.title || '模板'}」的变量`),
        ...fill.names.map((name) => h('input', {
          key: name,
          className: 'dsh-cp-input',
          placeholder: `{{${name}}}`,
          value: fill.values[name] ?? '',
          onInput: (event) => setFill({ ...fill, values: { ...fill.values, [name]: event.target.value } }),
        })),
        h('div', { className: 'dsh-cp-actions' },
          h('button', { className: 'dsh-cp-action', onClick: () => setFill(null) }, '取消'),
          h('button', {
            className: 'dsh-cp-action primary',
            onClick: () => { const f = fill; setFill(null); insert(f.item, f.values) },
          }, '插入')))
      : null

    // portal 容器：自建 div 挂 body——不再直接用 document.body（rc.5 环境里
    // 出现过 React #200 "Target container is not a DOM element"，自建元素
    // 结构上必然是 Element，绕开该判定的任何环境怪癖）。
    const portalHost = React.useRef(null)
    if (!portalHost.current && typeof document !== 'undefined' && document.body) {
      try {
        portalHost.current = document.createElement('div')
        portalHost.current.setAttribute('data-dsh-superinput-portal', 'prompts')
        document.body.appendChild(portalHost.current)
      } catch (error) {
        report(`portal host create failed: ${error?.stack ?? error}`)
        portalHost.current = null
      }
    }
    React.useEffect(() => () => { portalHost.current?.remove() }, [])

    return portalHost.current
      ? createPortal(h('div', { className: 'dsh-cp-panel', style: pos ?? { display: 'none' } },
      h('div', { className: 'dsh-cp-head' },
        h('input', {
          ref: inputRef,
          className: 'dsh-cp-search',
          placeholder: '搜索模板…',
          value: query,
          onInput: (event) => setQuery(event.target.value),
        }),
        h('button', {
          className: 'dsh-cp-new',
          title: '新建模板',
          onClick: () => setDraft({ title: '', body: '', tagsText: '' }),
        }, '+')),
      editor,
      fillForm,
      (draft || fill) ? null : h('div', { className: 'dsh-cp-list' },
        !items
          ? h('div', { className: 'dsh-cp-empty' }, '加载中…')
          : (pinned.length === 0 && recent.length === 0)
            ? h('div', { className: 'dsh-cp-empty' }, q ? '没有匹配的模板' : '点右上角 + 新建第一个模板')
            : [
              pinned.length > 0 ? h('div', { className: 'dsh-cp-group', key: 'pg' }, '已收藏') : null,
              ...pinned.map(row),
              pinned.length > 0 && recent.length > 0 ? h('div', { className: 'dsh-cp-group', key: 'rg' }, '全部') : null,
              ...recent.map(row),
            ]),
      flash ? h('div', { className: 'dsh-cp-empty' }, flash) : null), portalHost.current)
      : null
  }

  /** 错误边界：面板渲染崩溃时留痕（走 snippets /diag）而不是无声消失。 */
  class PromptsBoundary extends React.Component {
    constructor(props) { super(props); this.state = { crashed: false } }
    static getDerivedStateFromError() { return { crashed: true } }
    componentDidCatch(error, info) {
      report(`boundary: ${String(error?.message ?? error).slice(0, 200)} | stack: ${String(error?.stack ?? '').slice(0, 400)}`)
    }
    render() { return this.state.crashed ? null : this.props.children }
  }

  function PromptsButton() {
    const [open, setOpen] = React.useState(false)
    const ref = React.useRef(null)
    return h('span', { ref, style: { display: 'inline-flex' } },
      h('button', {
        className: 'dsh-cp-btn',
        title: 'Prompt（提示词模板）',
        onClick: () => setOpen((value) => !value),
      }, 'Prompt'),
      open ? h(PromptsPanel, { anchor: ref.current, onClose: () => setOpen(false) }) : null)
  }

  return {
    inject: ['slots'],
    apply(ctx) {
      ensureStyle()
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock',
        id: 'dsh-superinput-prompts-btn',
        order: 4,
      }, (props) => h(PromptsBoundary, null, h(PromptsButton, props))))
    },
  }
}
