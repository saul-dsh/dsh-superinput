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
.dsh-cp-uses { color: var(--dsw-alias-label-tertiary); font-size: 10px; margin-left: 4px; }
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
.dsh-cp-mini.active { color: #3a83f7; }
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
.dsh-cp-selmenu { display: flex; flex-direction: row; align-items: center; gap: 2px; padding: 3px; border-radius: var(--dsw-radius-lg, 12px);
  background: var(--dsw-specific-menu, rgba(67, 69, 74, 0.85));
  backdrop-filter: var(--dsw-menu-backdrop-filter, blur(40px) saturate(150%));
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
  box-shadow: var(--dsw-elevation-prominent, 0 0 0 0.5px var(--dsw-elevation-stroke-color), 0 3px 8px 0 rgba(0, 0, 0, 0.1));
}
.dsh-cp-selitem { border: none; background: transparent; text-align: left; padding: 5px 10px; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-primary, rgba(232, 238, 250, 0.92)); border-radius: var(--dsw-radius-sm, 6px); cursor: pointer; white-space: nowrap; }
.dsh-cp-selitem:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.07)); }
.dsh-cp-toast { padding: 5px 12px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary, #fff);
  background: rgba(50, 50, 54, 0.95); border-radius: 8px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25); }
.dsh-cp-ctxbar { box-sizing: border-box; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; width: 100%; padding: 0 12px 8px; }
/* 引用标签：照抄 Trae comment-mention-tag 规格（ai-modules-chat/index.css）——
   高 18px / padding 1px 6px 1px 4px / 中性底 rgba(116,126,148,.18) / 字重 500 /
   字距 -.02em；结构 = 引用文本 · 💬 评论（评论内联在标签里，Trae 同构）。 */
.dsh-cp-ctxpill { box-sizing: border-box; display: inline-flex; align-items: center; gap: 2px; height: 18px; max-width: 300px;
  padding: 1px 6px 1px 4px; border: none; border-radius: 4px;
  background: var(--dsw-alias-bg-layer-1, rgba(116, 126, 148, 0.18)); cursor: pointer;
  font-size: 11px; font-weight: 500; letter-spacing: -0.02em;
  transition: background .14s ease; }
.dsh-cp-ctxpill:hover, .dsh-cp-ctxpill.hovered { background: var(--dsw-alias-interactive-bg-hover, rgba(116, 126, 148, 0.28)); }
.dsh-cp-ctxpill-icon { flex: 0 0 auto; width: 12px; height: 12px; color: var(--dsw-alias-label-tertiary, #8a9096); }
.dsh-cp-ctxpill-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-secondary); }
.dsh-cp-ctxpill-sep { flex-shrink: 0; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary, #8a9096); }
.dsh-cp-ctxpill-comment { display: inline-flex; align-items: center; gap: 2px; min-width: 0; flex: 1 1 0; overflow: hidden; }
.dsh-cp-ctxpill-bubble { flex-shrink: 0; width: 12px; height: 12px; color: var(--dsw-alias-label-tertiary, #8a9096); }
.dsh-cp-ctxpill-comment-text { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--dsw-alias-label-tertiary, #8a9096); line-height: 16px; }
.dsh-cp-ctxpill-btn { flex: 0 0 auto; width: 16px; height: 16px; padding: 0; display: inline-flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 1; border-radius: 3px; cursor: pointer; }
.dsh-cp-ctxpill-btn:hover { color: var(--dsw-alias-label-primary); background: rgba(255, 255, 255, 0.1); }
.dsh-cp-ctxpill-excluded { opacity: .55; }
.dsh-cp-ctxpill-excluded .dsh-cp-ctxpill-label { text-decoration: line-through; }
.dsh-cp-ctxpill-comment { cursor: pointer; }
.dsh-cp-ctxpill-open { outline: 1px solid #3a83f7; }
/* 评论编辑浮层：Trae 在采集时输入评论——这里添加后立即展开，全文预览+输入。 */
.dsh-cp-ctxopen { box-sizing: border-box; flex: 1 1 100%; display: flex; flex-direction: column; gap: 4px;
  padding: 6px 8px; border-radius: var(--dsw-radius-sm, 6px);
  background: var(--dsw-alias-bg-layer-1, rgba(116, 126, 148, 0.12)); }
.dsh-cp-ctxopen-text { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap;
  display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; }
.dsh-cp-ctxopen input { box-sizing: border-box; width: 100%; padding: 3px 6px; font-size: 11px; line-height: 16px;
  color: var(--dsw-alias-label-primary); background: transparent; border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  border-radius: var(--dsw-radius-sm, 6px); outline: none; font-family: inherit; }
.dsh-cp-ctxopen input:focus { border-color: #3a83f7; }
/* 点击标签跳源时对源元素的闪烁高亮。 */
.dsh-cp-flash { outline: 2px solid #3a83f7 !important; outline-offset: 1px; border-radius: 3px; transition: outline-color .3s ease; }
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

  /** 异常留痕：走 prompts /diag（0.4.0 起套件统一通道，落 superinput-debug.log）。 */
  function report(message) {
    try {
      void fetch('/api/dsh-superinput/prompts/diag', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: `prompts: ${String(message).slice(0, 300)}` }),
      }).catch(() => {})
    } catch { /* ignore */ }
  }

  /* ------------------------------------------------------------------ */
  /* 划选上下文：会话级暂存 + 服务端 /context 同步                        */
  /* ------------------------------------------------------------------ */

  const CONTEXT_MAX = 8
  let contextSeq = 0
  const contextBySession = new Map()
  const contextSyncTimers = new Map()

  const contextItemsOf = (sessionId) => contextBySession.get(sessionId) ?? []

  async function postContext(sessionId, items) {
    if (!sessionId) return
    try {
      await fetch(`${ENDPOINT}/context`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          // 排除项（👁）不随发送：Trae 的 eye/eyeClosed 同语义——保留在列表但不注入
          items: items.filter((item) => !item.excluded).map(({ text, comment }) => ({ text, comment })),
        }),
        keepalive: true,
      })
    } catch { /* 网络失败时服务端保留上一份，不打断输入 */ }
  }

  function snapshotContext(sessionId, items) {
    if (!sessionId) return
    if (items.length === 0) contextBySession.delete(sessionId)
    else contextBySession.set(sessionId, items)
    const previous = contextSyncTimers.get(sessionId)
    if (previous) clearTimeout(previous)
    const timer = setTimeout(() => {
      contextSyncTimers.delete(sessionId)
      void postContext(sessionId, items)
    }, 150)
    contextSyncTimers.set(sessionId, timer)
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

  /** / 命令插入路径：内置动态变量自动取值，手填变量保留 {{名}} 原样由用户行内改。 */
  function insertViaBridge(item) {
    try {
      void api('/use', { id: item.id })
      let out = String(item.body ?? '')
      for (const name of varsOf(out)) {
        const auto = autoValue(name)
        if (auto !== null) out = out.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g'), auto)
      }
      const set = window.__dshSuperinputSetDraft
      if (!set) {
        report('slash insert skipped: draft bridge missing')
        return
      }
      // action 执行时草稿里还留着刚敲的命令行（/e2e），官方壳清 token 与我们的
      // 写入有时序竞争——首行是无空格的 /xxx 就剥掉，两种时序下都只留正文。
      const current = String(window.__dshSuperinputDraft?.() ?? '')
      let base = current
      const firstLine = current.split('\n')[0] ?? ''
      if (current && firstLine.startsWith('/') && !firstLine.includes(' ')) {
        base = current.slice(firstLine.length).replace(/^\n+/, '')
      }
      set(base ? `${base}\n${out}` : out)
    } catch (error) {
      report(`slash insert failed: ${error?.stack ?? error}`)
    }
  }

  /** 划选正文文字浮出「存」按钮 → 存为模板 / 存为片段（两个库的收集入口）。 */
  function installSelectionSaver() {
    if (typeof document === 'undefined') return
    // 安装守卫：宿主重挂载时 apply 可能跑第二次，重复监听会造出多个浮层。
    if (document.documentElement.dataset.dshSelectionSaver) return
    document.documentElement.dataset.dshSelectionSaver = '1'
    let host = null
    let hideTimer = 0

    const ensureHost = () => {
      // 文档级单例：无论模块实例化几次，全页只留一个浮层容器。
      const existing = document.querySelectorAll('[data-dsh-superinput-portal="selection"]')
      for (let i = 1; i < existing.length; i += 1) existing[i].remove()
      if (existing[0]?.isConnected) {
        host = existing[0]
        return host
      }
      host = document.createElement('div')
      host.setAttribute('data-dsh-superinput-portal', 'selection')
      host.style.cssText = 'position:fixed;z-index:1150;display:none;'
      document.body.appendChild(host)
      return host
    }
    const hide = () => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0 }
      if (host) host.style.display = 'none'
    }
    const toast = (text) => {
      const el = ensureHost()
      const div = document.createElement('div')
      div.className = 'dsh-cp-toast'
      div.textContent = text
      el.replaceChildren(div) // 原生 DOM——h() 产物是 React 对象，replaceChildren 会把它强转成 "[object Object]"
      el.style.left = '50%'
      el.style.top = '72px'
      el.style.transform = 'translateX(-50%)'
      el.style.display = 'block'
      if (hideTimer) clearTimeout(hideTimer)
      hideTimer = setTimeout(hide, 1800)
    }
    const copySel = async (text) => {
      hide()
      if (!navigator.clipboard?.writeText) { toast('当前环境不支持复制'); return }
      try {
        await navigator.clipboard.writeText(text)
        toast('已复制')
      } catch {
        toast('复制失败')
      }
    }

    /** 把选中文字加到输入框上方的上下文卡片（无卡片环境回退到草稿桥）。
     * anchorEl：选区起始元素，点 pill 跳回源文用（Trae 同款交互）。 */
    const addToDraft = (text, anchorEl) => {
      hide()
      const addContext = window.__dshSuperinputAddContext
      if (typeof addContext === 'function') {
        try {
          const status = addContext(text, anchorEl)
          toast(status === 'added' ? '已添加到对话'
            : status === 'dup' ? '该选段已在列表中'
              : status === 'full' ? `最多添加 ${CONTEXT_MAX} 段对话内容`
                : '添加失败')
          return
        } catch { /* 回退到草稿桥 */ }
      }
      try {
        const set = window.__dshSuperinputSetDraft
        if (!set) { toast('草稿桥未就绪，刷新后重试'); return }
        const current = String(window.__dshSuperinputDraft?.() ?? '')
        set(current ? `${current}\n${text}` : text)
        toast('已添加到输入框')
      } catch {
        toast('添加失败')
      }
    }

    const save = async (text) => {
      const title = text.replace(/\s+/g, ' ').trim().slice(0, 40)
      hide()
      try {
        const res = await fetch('/api/dsh-superinput/prompts/save', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title, body: text }),
        })
        const data = res.ok ? await res.json() : null
        toast(data?.ok ? '已存为模板' : '保存失败')
      } catch {
        toast('保存失败')
      }
    }

    // 选区变化驱动（dblclick 选词在 mouseup 之后才成形，selectionchange 才是可靠信号）
    let showTimer = 0
    document.addEventListener('selectionchange', () => {
      try {
        if (showTimer) { clearTimeout(showTimer); showTimer = 0 }
        const selection = window.getSelection?.()
        const text = String(selection ?? '').trim()
        if (!text || text.length < 4 || !selection.rangeCount) { hide(); return }
        showTimer = setTimeout(() => {
          try {
            const sel = window.getSelection?.()
            const current = String(sel ?? '').trim()
            if (!current || current.length < 4 || !sel.rangeCount) { hide(); return }
            const node = sel.anchorNode
            const el = node instanceof Element ? node : node?.parentElement
            // 只收对话正文：跳过输入区、我们自己的弹层，以及侧栏/设置等非对话区域
            if (!el || el.closest('[data-dsh-superinput-portal]') || el.closest('[contenteditable="true"], textarea, input')) { hide(); return }
            if (!el.closest('[data-chat-flow], [data-slot="conversation.chat.flow"]')) { hide(); return }
            const rect = sel.getRangeAt(0).getBoundingClientRect()
            if (!rect || (rect.width === 0 && rect.height === 0)) { hide(); return }
            const container = ensureHost()
            // 横排菜单（复制 / 添加到对话 / 存为模板 ≈210px）：左缘对齐选区，右侧防溢出
            container.style.left = `${Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - 226))}px`
            container.style.top = `${Math.max(8, rect.top - 44)}px`
            container.style.transform = ''
            container.style.display = 'block'
            const menu = document.createElement('div')
            menu.className = 'dsh-cp-selmenu'
            // 阻止默认聚焦/清选区：否则 mousedown 触发 selectionchange，菜单会在 click 前被隐藏
            menu.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault() })
            const mkItem = (label, action) => {
              const b = document.createElement('button')
              b.className = 'dsh-cp-selitem'
              b.textContent = label
              b.addEventListener('click', () => { void action(current) })
              return b
            }
            menu.append(
              mkItem('复制', copySel),
              mkItem('添加到对话', (text) => addToDraft(text, el)),
              mkItem('存为模板', save))
            container.replaceChildren(menu)
          } catch { /* ignore */ }
        }, 250)
      } catch { /* ignore */ }
    })
    document.addEventListener('mousedown', (e) => {
      if (host?.style.display === 'block' && !e.target.closest?.('[data-dsh-superinput-portal="selection"]')) hide()
    }, true)
    window.addEventListener('scroll', hide, true)
    document.addEventListener('selectionchange', () => {
      if (!String(window.getSelection?.() ?? '').trim()) hide()
    })
  }

  function PromptsPanel({ anchor, onClose, onSyncSlash }) {
    const [items, setItems] = React.useState(null)
    const [query, setQuery] = React.useState('')
    const [draft, setDraft] = React.useState(null)
    const [fill, setFill] = React.useState(null)
    const [flash, setFlash] = React.useState(null)
    const inputRef = React.useRef(null)

    const reload = React.useCallback(async () => {
      const data = await api('/list')
      if (data && Array.isArray(data.items)) setItems(data.items)
      onSyncSlash?.() // 模板增删改后重新对齐 / 命令注册
    }, [onSyncSlash])
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
        void api('/use', { id: item.id }) // 使用计数：列表按最近使用排序
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
    const toggleSlash = async (item) => { await api('/slash', { id: item.id, slash: !item.slash }); void reload() }

    /** 导出：拉全量 JSON，走浏览器下载落到系统下载目录。 */
    const doExport = async () => {
      try {
        const res = await fetch(`${ENDPOINT}/export`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`export ${res.status}`)
        const blob = new Blob([await res.text()], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const name = `dsh-prompts-${new Date().toISOString().slice(0, 10)}.json`
        const a = document.createElement('a')
        a.href = url
        a.download = name
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
        setFlash(`已导出到下载目录：${name}`)
      } catch (error) {
        report(`export failed: ${error?.stack ?? error}`)
        setFlash(`导出失败：${String(error?.message ?? error)}`)
      }
    }

    /** 导入：临时 file input 走系统文件选择框，JSON 解析后交给 /import 按 id 合并。 */
    const doImport = () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json,application/json'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return
        try {
          const payload = JSON.parse(await file.text())
          const res = await api('/import', payload)
          if (!res?.ok) throw new Error(res?.error ?? 'import rejected')
          setFlash(`导入完成：新增 ${res.added ?? 0}，更新 ${res.updated ?? 0}`)
          void reload()
        } catch (error) {
          report(`import failed: ${error?.stack ?? error}`)
          setFlash(`导入失败：${String(error?.message ?? error)}`)
        }
      }
      input.click()
    }

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
          h('div', { className: 'dsh-cp-title' },
            item.title,
            item.uses > 0 ? h('span', { className: 'dsh-cp-uses' }, `${item.uses}次`) : null),
          h('div', { className: 'dsh-cp-preview' }, String(item.body).split('\n')[0].slice(0, 100)),
          vars.length > 0
            ? h('div', { className: 'dsh-cp-vars' }, vars.map((name) => h('span', { className: 'dsh-cp-var', key: name }, `{{${name}}}`)))
            : null),
        h('div', { className: 'dsh-cp-row-actions' },
          h('button', { className: 'dsh-cp-mini', title: item.pinned ? '取消收藏' : '收藏', onClick: () => { void pin(item) } }, item.pinned ? '★' : '☆'),
          h('button', {
            className: `dsh-cp-mini${item.slash ? ' active' : ''}`,
            title: item.slash ? '取消 / 命令注册' : '注册为 / 命令（输入 / 按标题搜到）',
            onClick: () => { void toggleSlash(item) },
          }, '/'),
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
    // 组内按最近使用排序：没插过的退回创建时间，新模板仍在顶部
    const byLastUsed = (a, b) => (b.usedAt ?? b.at ?? 0) - (a.usedAt ?? a.at ?? 0)
    const pinned = all.filter((item) => item.pinned && match(item)).sort(byLastUsed)
    const recent = all.filter((item) => !item.pinned && match(item)).sort(byLastUsed)

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
        h('button', { className: 'dsh-cp-new', title: '导出全部模板（JSON）', onClick: () => { void doExport() } }, '↓'),
        h('button', { className: 'dsh-cp-new', title: '从 JSON 备份导入', onClick: () => doImport() }, '↑'),
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

  /** 错误边界：面板渲染崩溃时留痕（走 prompts /diag）而不是无声消失。 */
  class PromptsBoundary extends React.Component {
    constructor(props) { super(props); this.state = { crashed: false } }
    static getDerivedStateFromError() { return { crashed: true } }
    componentDidCatch(error, info) {
      report(`boundary: ${String(error?.message ?? error).slice(0, 200)} | stack: ${String(error?.stack ?? '').slice(0, 400)}`)
    }
    render() { return this.state.crashed ? null : this.props.children }
  }

  /** 划选上下文卡片：输入框上方的独立列表，支持逐条评论/移除。 */
  function SelectionContextChips({ session, useInput }) {
    const sessionId = session?.sessionId === undefined ? '' : String(session.sessionId)
    const [items, setItems] = React.useState([])
    const itemsRef = React.useRef(items)
    const phase = useInput((state) => state.phase)
    const previousPhase = React.useRef(phase)

    React.useEffect(() => {
      const next = sessionId ? contextItemsOf(sessionId) : []
      itemsRef.current = next
      setItems(next)
    }, [sessionId])

    React.useEffect(() => {
      itemsRef.current = items
    }, [items])

    React.useEffect(() => {
      if (!sessionId) return undefined
      const add = (text, anchorEl) => {
        const clean = String(text ?? '').trim()
        if (!clean) return 'empty'
        // Trae addContext 按 id 去重：同一段选文不重复入列，改为展开已有
        // 条目让用户直接补评论。
        const existing = itemsRef.current.find((entry) => entry.text === clean)
        if (existing) {
          const next = itemsRef.current.map((entry) => entry.id === existing.id ? { ...entry, open: true } : entry)
          itemsRef.current = next
          setItems(next)
          snapshotContext(sessionId, next)
          return 'dup'
        }
        if (itemsRef.current.length >= CONTEXT_MAX) return 'full'
        // 源锚点：Trae 的 payload 带源位置（点击卡片 revealRangeInCenter）——
        // 这里存选区起始元素的弱引用，点 pill 跳回源文并闪烁；断线（重渲染
        // 重建节点）时跳转静默降级为无操作。
        // open:true：Trae 在采集时即收集评论（SoloBrowser 选段流程），这里
        // 添加后立即展开评论框，省一次寻找入口的成本。
        const next = [...itemsRef.current, {
          id: `ctx-${Date.now().toString(36)}-${contextSeq += 1}`,
          text: clean,
          comment: '',
          excluded: false,
          open: true,
          anchor: anchorEl instanceof Element ? new WeakRef(anchorEl) : null,
        }]
        itemsRef.current = next
        setItems(next)
        snapshotContext(sessionId, next)
        return 'added'
      }
      window.__dshSuperinputAddContext = add
      return () => {
        if (window.__dshSuperinputAddContext === add) delete window.__dshSuperinputAddContext
      }
    }, [sessionId])

    const clearForSend = () => {
      if (itemsRef.current.length === 0) return
      // 发送意图已发生：先撤销未触发的防抖计时器（否则它会在清空后把旧
      // 数据写回服务端，下一轮被重复注入），再把最新评论同步给服务端。
      const pendingTimer = contextSyncTimers.get(sessionId)
      if (pendingTimer) { clearTimeout(pendingTimer); contextSyncTimers.delete(sessionId) }
      void postContext(sessionId, itemsRef.current)
      itemsRef.current = []
      setItems([])
      contextBySession.delete(sessionId)
    }

    React.useEffect(() => {
      const was = previousPhase.current
      previousPhase.current = phase
      if (was === 'submitting' || phase !== 'submitting') return
      clearForSend()
    }, [phase, sessionId])

    // 发送按钮点击 / 输入框 Enter 是比 phase 更可靠的发送意图信号；
    // 挂 window capture，先于宿主与 enhancer 的 document 监听执行。
    React.useEffect(() => {
      if (!sessionId) return undefined
      const onClick = (event) => {
        const target = event.target
        if (target?.closest?.('button[aria-label*="发送消息"], button[aria-label*="Send"], button[aria-label*="send"]')) clearForSend()
      }
      const onKey = (event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
        if (!event.target?.closest?.('[contenteditable="true"]')) return
        clearForSend()
      }
      window.addEventListener('click', onClick, true)
      window.addEventListener('keydown', onKey, true)
      return () => {
        window.removeEventListener('click', onClick, true)
        window.removeEventListener('keydown', onKey, true)
      }
    }, [sessionId])

    const update = (id, patch) => {
      const next = itemsRef.current.map((item) => item.id === id ? { ...item, ...patch } : item)
      itemsRef.current = next
      setItems(next)
      snapshotContext(sessionId, next)
    }

    if (items.length === 0) return null

    /** 点标签主体：展开态聚焦评论框；否则跳回源文（Trae revealRangeInCenter 同义）并展开。 */
    const activate = (item) => {
      if (item.open) return
      try {
        const el = item.anchor?.deref?.()
        if (el?.isConnected) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('dsh-cp-flash')
          setTimeout(() => el.classList.remove('dsh-cp-flash'), 1600)
        }
      } catch { /* 锚点失效：静默降级 */ }
      update(item.id, { open: true })
    }

    return h('div', { className: 'dsh-cp-ctxbar' },
      items.map((item, index) => h(React.Fragment, { key: item.id },
        h('div', {
          className: `dsh-cp-ctxpill${item.open ? ' dsh-cp-ctxpill-open' : ''}${item.excluded ? ' dsh-cp-ctxpill-excluded' : ''}`,
          title: item.text,
          onClick: () => activate(item),
        },
          h('span', { className: 'dsh-cp-ctxpill-label' },
            `选段 ${index + 1} · ${String(item.text).replace(/\s+/g, ' ').slice(0, 30)}`),
          item.comment
            ? [
              h('span', { className: 'dsh-cp-ctxpill-sep', key: 'sep' }, '·'),
              h('span', {
                className: 'dsh-cp-ctxpill-comment', key: 'cmt',
                title: item.comment,
                onClick: (event) => { event.stopPropagation(); update(item.id, { open: true }) },
              },
                h('svg', { className: 'dsh-cp-ctxpill-bubble', viewBox: '0 0 16 16', 'aria-hidden': true },
                  h('path', {
                    d: 'M8 2.5c3.1 0 5.7 2.1 5.7 4.8S11.1 12.1 8 12.1c-.8 0-1.5-.1-2.2-.4L3.4 13l.7-2.2C2.8 9.9 2.3 8.7 2.3 7.3c0-2.7 2.6-4.8 5.7-4.8z',
                    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.3', 'stroke-linejoin': 'round',
                  })),
                h('span', { className: 'dsh-cp-ctxpill-comment-text' }, item.comment)),
            ]
            : null,
          h('button', {
            className: 'dsh-cp-ctxpill-btn',
            title: item.excluded ? '已排除，点击恢复随发送' : '临时排除（保留但不随发送）',
            'aria-label': item.excluded ? '恢复随发送' : '临时排除',
            onClick: (event) => { event.stopPropagation(); update(item.id, { excluded: !item.excluded }) },
          }, item.excluded ? '🚫' : '👁'),
          h('button', {
            className: 'dsh-cp-ctxpill-btn',
            title: item.comment ? '编辑评论' : '添加评论',
            'aria-label': item.comment ? '编辑评论' : '添加评论',
            onClick: (event) => { event.stopPropagation(); update(item.id, { open: !item.open }) },
          }, '💬'),
          h('button', {
            className: 'dsh-cp-ctxpill-btn',
            title: '移除这段上下文',
            'aria-label': '移除这段上下文',
            onClick: (event) => {
              event.stopPropagation()
              const next = itemsRef.current.filter((entry) => entry.id !== item.id)
              itemsRef.current = next
              setItems(next)
              snapshotContext(sessionId, next)
            },
          }, '×')),
        item.open ? h('div', {
          className: 'dsh-cp-ctxopen',
          // 拦下 mousedown/mouseup/click：宿主输入框会在点击外部时抢焦点，
          // 不拦住评论框就打不了字（「评论添加不到输入框」的直接原因）。
          onMouseDown: (event) => event.stopPropagation(),
          onMouseUp: (event) => event.stopPropagation(),
          onClick: (event) => event.stopPropagation(),
        },
          h('div', { className: 'dsh-cp-ctxopen-text' }, item.text),
          h('input', {
            value: item.comment,
            placeholder: '对这段内容的评论（可选），发送时一并带给模型',
            autoFocus: true,
            onInput: (event) => update(item.id, { comment: event.target.value }),
            onKeyDown: (event) => {
              event.stopPropagation()
              if (event.key === 'Enter' || event.key === 'Escape') update(item.id, { open: false })
            },
          })) : null))
    )
  }

  /** 草稿桥：划选「添加到对话」、模板插入、/ 命令插入共用。
   * 挂 conversation.input.dock——该槽位会注入 useInput / inputActions；
   * composer.dock 不注入这些 props。片段模块移除时桥被一并删掉，这里补回。 */
  function PromptsDraftBridge({ useInput, inputActions }) {
    const draft = useInput((state) => state?.draft)
    React.useEffect(() => {
      window.__dshSuperinputDraft = () => (typeof draft === 'string' ? draft : '')
      if (typeof inputActions?.setDraft === 'function') {
        window.__dshSuperinputSetDraft = (value) => {
          try { inputActions.setDraft(value) } catch { /* ignore */ }
        }
      }
    }, [draft, inputActions])
    return null
  }

  function PromptsButton({ onSyncSlash }) {
    const [open, setOpen] = React.useState(false)
    const ref = React.useRef(null)
    return h('span', { ref, style: { display: 'inline-flex' } },
      h('button', {
        className: 'dsh-cp-btn',
        title: 'Prompt（提示词模板）',
        onClick: () => setOpen((value) => !value),
      }, 'Prompt'),
      open ? h(PromptsPanel, { anchor: ref.current, onClose: () => setOpen(false), onSyncSlash }) : null)
  }

  return {
    inject: ['slots'],
    apply(ctx) {
      ensureStyle()
      installSelectionSaver()

      /* / 斜杠命令同步：标记了 slash 的模板注册进官方 / 菜单（action 命令）。
       * commandUi 是官方 ui-commands 的客户端服务；旧宿主没有它时 inject 不解析，整块跳过。
       * 按模板 opt-in 而不是全量注册，避免几十条模板淹没 / 菜单；同名冲突 register 会
       * 抛错（官方约定 fail loud），这里 try/catch 吞掉并留痕，不影响其它模板。 */
      const slashDisposers = new Map() // id -> { dispose, fp }
      let commandUi = null
      const slashName = (item) => {
        const slug = String(item.title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
        return `tpl-${slug || String(item.id ?? '').slice(0, 8)}`
      }
      const slashFp = (item) => `${slashName(item)}|${item.title}`
      const syncSlash = async () => {
        if (!commandUi) return
        let items = []
        try {
          const data = await api('/list')
          items = Array.isArray(data?.items) ? data.items : []
        } catch { return }
        const wanted = new Map(items.filter((item) => item.slash === true).map((item) => [item.id, item]))
        for (const [id, entry] of slashDisposers) {
          const fresh = wanted.get(id)
          if (!fresh || entry.fp !== slashFp(fresh)) {
            entry.dispose?.()
            slashDisposers.delete(id)
          }
        }
        for (const [id, item] of wanted) {
          if (slashDisposers.has(id)) continue
          try {
            const dispose = commandUi.register({
              name: slashName(item),
              label: () => item.title,
              description: () => '插入提示词模板',
              available: () => true,
              ui: { kind: 'action', run: () => insertViaBridge(item) },
            })
            slashDisposers.set(id, { dispose: typeof dispose === 'function' ? dispose : null, fp: slashFp(item) })
          } catch (error) {
            report(`slash register "${item.title}": ${error?.message ?? error}`)
          }
        }
      }
      ctx.inject(['commandUi'], (scope) => {
        commandUi = scope.get('commandUi')
        void syncSlash()
      })

      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock',
        id: 'dsh-superinput-prompts-btn',
        order: 4,
      }, (props) => h(PromptsBoundary, null, h(PromptsButton, { ...props, onSyncSlash: syncSlash }))))

      // 草稿桥挂 input.dock（该槽位注入 useInput / inputActions）
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'dsh-superinput-prompts-bridge',
        order: 96,
      }, PromptsDraftBridge))

      // 划选上下文卡片：同一槽位的独立列表项，渲染在输入框上方。
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'dsh-superinput-selection-context',
        order: 97,
      }, (props) => h(PromptsBoundary, null, h(SelectionContextChips, props))))
    },
  }
}
