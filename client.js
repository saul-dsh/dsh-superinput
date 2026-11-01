/* dsh-superinput 客户端：单 __ModuleLoader__ 入口，内部逐模块装配。
 * 本文件由 scripts/build-suite.mjs 生成（模块工厂内联 + 下方 glue）；勿手改模块工厂。 */

/* 由 scripts/build-suite.mjs 从 dsh-cost/client.js 机械生成；勿手改。 */
/**
 * dsh-cost 的 web 客户端。
 *
 * 三个界面（借鉴 dsh-cost-meter 的槽位布局，样式走 --dsw-* 官方令牌）：
 *  - conversation.input.dock：本会话累计费用 chip（hover 明细，点击刷新）
 *  - sidebar.footer.action：今日费用行
 *  - settings.section「费用」：今日/本月/累计概览卡 + 近 7 天 + 会话列表
 *
 * 数据通道：GET /api/dsh-cost/state（服务端 ledger 聚合）。
 * 轮询：全局 15s 共享 poller；回合落定（生成键从停止翻回发送）立即 poke。
 * 槽位注册复用 dsh-followup 已验证的模式（ctx.slots.inject + register）。
 */

function createCostClient(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement

    const STYLE_ID = 'dsh-cost-style'
    const ENDPOINT = '/api/dsh-cost'
    const POLL_MS = 15000

    /** 客户端调试通道：关键锚定/装配事件上报服务端 debug log（真机取证）。 */
    function clientDebug(message) {
      try {
        void fetch(`${ENDPOINT}/client-debug`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: String(message).slice(0, 300) }),
        }).catch(() => {})
      } catch { /* ignore */ }
    }

    /* 官方 token 配色（compaction-control / cost-meter 同基准），无自创色。 */
    const CSS = `
.dsh-cost-inline {
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-secondary, rgba(232, 238, 250, 0.72));
  white-space: nowrap;
}
.dsh-cost-statusrow {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 2px;
  font-size: 12px;
  line-height: 20px;
}
.dsh-cost-sidebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  margin-top: 8px;
  padding: 7px 12px;
  border: none;
  border-top: 1px solid var(--dsw-alias-border-l3, transparent);
  background: transparent;
  color: var(--dsw-alias-label-secondary, rgba(232, 238, 250, 0.72));
  font-size: 12px;
  line-height: 20px;
  cursor: default;
  user-select: none;
}
.dsh-cost-sidebar:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-cost-sidebar:focus-visible { box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary); outline: none; }
.dsh-cost-sidebar .dsh-cost-sidebar-value {
  color: var(--dsw-alias-label-primary);
  font-variant-numeric: tabular-nums;
}
.dsh-cost-sidebar.warn .dsh-cost-sidebar-value { color: var(--dsw-alias-state-warn-primary); }
.dsh-cost-alert {
  position: fixed;
  top: calc(var(--dsh-frame-chrome-top, var(--dsh-frame-top-clearance, 0px)) + 16px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border: 1px solid var(--dsw-alias-border-l1, transparent);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, #1d232e);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  font-size: 12px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
}
.dsh-cost-alert button { border: none; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 12px; padding: 0; }
.dsh-cost-alert button:hover { color: var(--dsw-alias-label-primary); }
.dsh-cost-badge.action { cursor: pointer; user-select: none; border: none; }
.dsh-cost-badge.action:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
/* 动作行费用按钮：对齐官方「用量」按钮（tertiary 纯文字、无底色；
   !important 用于压过宿主动作行对 button 元素的默认底色/文字色）。 */
.dsh-cost-usage-anchor {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  color: var(--dsw-alias-label-tertiary, rgba(232, 238, 250, 0.55)) !important;
  font-size: 12px;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
  padding: 0 4px;
  border-radius: 4px;
  cursor: default;
  user-select: none;
}
.dsh-cost-usage-anchor:hover {
  color: var(--dsw-alias-label-secondary, rgba(232, 238, 250, 0.72)) !important;
  background: var(--dsw-alias-interactive-bg-hover) !important;
}
/* 官方弹卡基准。底色照 dsh 的 macOS 档写死 0.94，不用 --dsw-specific-menu：
   Windows 默认是 rgba(67,69,74,.45)，那是给带 MenuSurface 底衬的官方菜单用的；
   插件直接 portal 到 body 没有底衬，0.45 一旦 backdrop-filter 失效就发灰糊在背景上。 */
/* 状态行费用 pill：规格对齐 dsh 自带的 token / 缓存命中 pill（padding 1/8、
   圆角 sm、12px、tabular-nums、悬停淡底）。 */
.dsh-cost-pill-anchor {
  display: inline-flex;
  min-width: 0;
  font-size: 12px;
  line-height: 20px;
}
.dsh-cost-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 1px 8px;
  border: none;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary, rgba(232, 238, 250, 0.5));
  font: inherit;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
/* 内联写了 background/color 兜底，hover 必须 !important 才盖得住。
   值同 dsh：--dsw-alias-interactive-bg-hover / --dsw-alias-label-secondary。 */
.dsh-cost-pill:hover,
.dsh-cost-pill[aria-expanded="true"] {
  background: rgba(255, 255, 255, 0.08) !important;
  color: rgb(207, 211, 214) !important;
}
.dsh-cost-pill svg { width: 14px; height: 14px; flex: none; }

/* 弹卡里的来源分组与明细行 */
.dsh-cost-src {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 11.5px;
}
.dsh-cost-src .name { flex: 1; color: var(--dsw-alias-label-secondary, rgba(232,238,250,.72)); }
.dsh-cost-src .num { font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary, rgba(232,238,250,.92)); }
.dsh-cost-src .cnt { color: var(--dsw-alias-label-tertiary, rgba(232,238,250,.45)); font-variant-numeric: tabular-nums; }

.dsh-cost-pop {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  border: 0;
  border-radius: 12px;
  background: rgba(248, 249, 250, 0.94);
  backdrop-filter: blur(40px) saturate(150%);
  -webkit-backdrop-filter: blur(40px) saturate(150%);
  width: min(300px, 100vw - 24px);
  box-shadow:
    0 0 0 0.5px rgba(0, 0, 0, 0.07),
    0 3px 8px 0 rgba(0, 0, 0, 0.04),
    0 0 20px 0 rgba(0, 0, 0, 0.05);
  color: rgba(28, 30, 34, 0.86);
  cursor: default;
  padding: 12px;
  font-size: 12px;
  line-height: 20px;
}
body[data-ds-dark-theme] .dsh-cost-pop {
  background: rgba(48, 49, 54, 0.94);
  box-shadow:
    0 0 0 0.5px rgba(255, 255, 255, 0.10),
    0 3px 8px 0 rgba(0, 0, 0, 0.04),
    0 0 20px 0 rgba(0, 0, 0, 0.05);
  color: rgba(232, 238, 250, 0.72);
}
.dsh-cost-pop-head { display: flex; justify-content: space-between; gap: 12px; padding-bottom: 6px; margin-bottom: 4px; border-bottom: 1px solid var(--dsw-alias-border-l3, transparent); font-weight: 500; }
.dsh-cost-pop-row { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-cost-pop-num { flex: none; color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; }
.dsh-cost-section { display: flex; flex-direction: column; gap: 16px; padding: 4px 2px 24px; font-size: 13px; color: var(--dsw-alias-label-primary); }
.dsh-cost-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 1023px) { .dsh-cost-cards { grid-template-columns: 1fr; } }
.dsh-cost-card { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: 10px; background: var(--dsw-alias-bg-layer-1, transparent); }
.dsh-cost-card .dsh-cost-card-title { font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-tertiary); }
.dsh-cost-card .dsh-cost-card-value { font-size: 20px; line-height: 28px; font-weight: 500; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.dsh-cost-card .dsh-cost-card-sub { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.dsh-cost-forecast { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: 10px; background: var(--dsw-alias-bg-layer-1, transparent); }
.dsh-cost-forecast .dsh-cost-forecast-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.dsh-cost-forecast .dsh-cost-forecast-value { font-size: 20px; line-height: 28px; font-weight: 500; font-variant-numeric: tabular-nums; }
.dsh-cost-forecast .dsh-cost-forecast-sub { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.dsh-cost-forecast[data-over="true"] .dsh-cost-forecast-value { color: #f87171; }
.dsh-cost-table { display: flex; flex-direction: column; border-radius: 10px; background: var(--dsw-alias-bg-layer-1, transparent); overflow: hidden; }
.dsh-cost-row { display: flex; align-items: center; gap: 12px; min-height: 30px; padding: 4px 14px; font-size: 12px; line-height: 20px; font-variant-numeric: tabular-nums; }
.dsh-cost-row + .dsh-cost-row { border-top: 1px solid var(--dsw-alias-border-l3, transparent); }
.dsh-cost-row .dsh-cost-grow { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-secondary); }
.dsh-cost-row .dsh-cost-num { flex: none; color: var(--dsw-alias-label-primary); }
.dsh-cost-row .dsh-cost-dim { flex: none; color: var(--dsw-alias-label-tertiary); }
.dsh-cost-empty { padding: 12px 14px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.dsh-cost-badge { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2, transparent); font-size: 11px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-cost-budget { display: flex; flex-direction: column; gap: 6px; padding: 10px 14px; border-radius: 10px; background: var(--dsw-alias-bg-layer-1, transparent); }
.dsh-cost-budget-head { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.dsh-cost-bar { height: 6px; border-radius: 3px; background: var(--dsw-alias-interactive-bg-hover); overflow: hidden; }
.dsh-cost-fill { height: 100%; border-radius: 3px; background: var(--dsw-alias-brand-primary); }
.dsh-cost-fill.warn { background: var(--dsw-alias-state-warn-primary); }
.dsh-cost-fill.over { background: var(--dsw-alias-state-error-primary); }
`

    function ensureStyle() {
      if (typeof document === 'undefined') return
      if (document.getElementById(STYLE_ID)) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }

    /* -- 共享 poller：一个请求喂三个界面 ------------------------------ */

    const listeners = new Set()
    let latestState = null
    let timer = 0

    /** 预算超限系统通知：跨线 100% 时每周期弹一次（80% 只走 UI 变色不打扰）。 */
    let budgetNoticeKey = null
    function notifyBudgetOnce(state) {
      try {
        const budget = state?.budget
        if (!budget || !(budget.usedPct >= 1)) return
        const key = `${budget.period}:${budget.amount}`
        if (budgetNoticeKey === key) return
        budgetNoticeKey = key
        if (typeof Notification === 'undefined') return
        const periodLabel = budget.period === 'day' ? '今日' : budget.period === 'month' ? '本月' : '累计'
        const fire = () => {
          try {
            const n = new Notification('dsh 费用预算已超限', {
              body: `${periodLabel}费用 ¥${Number(budget.used).toFixed(2)}，已达预算 ¥${Number(budget.amount).toFixed(2)} 的 ${(budget.usedPct * 100).toFixed(0)}%。`,
            })
            n.onclick = () => { window.focus?.(); n.close() }
          } catch { /* 通知不可用：UI 超限变色兜底 */ }
        }
        if (Notification.permission === 'granted') fire()
        else if (Notification.permission === 'default') {
          void Notification.requestPermission?.().then((p) => { if (p === 'granted') fire() }).catch(() => {})
        }
      } catch { /* ignore */ }
    }

    async function pollOnce() {
      try {
        const res = await fetch(`${ENDPOINT}/state`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!data || typeof data !== 'object') return
        latestState = data
        notifyBudgetOnce(latestState)
        for (const listener of listeners) {
          try { listener(latestState) } catch { /* 单订阅者异常不断链 */ }
        }
        renderSessionAnchor()
      } catch { /* 服务端未就绪：静默，下轮再试 */ }
    }

    function startPoller() {
      if (timer) return
      void pollOnce()
      timer = setInterval(() => { void pollOnce() }, POLL_MS)
    }

    function useCostState() {
      const [state, setState] = React.useState(latestState)
      React.useEffect(() => {
        const listener = (value) => setState(value)
        listeners.add(listener)
        startPoller()
        return () => { listeners.delete(listener) }
      }, [])
      return state
    }

    /** 月底预测：数据变化慢，挂载时拉一次即可，不跟 poller 每 10 秒刷。 */
    function useForecast() {
      const [data, setData] = React.useState(null)
      React.useEffect(() => {
        let alive = true
        fetch(`${ENDPOINT}/forecast`, { cache: 'no-store' })
          .then((res) => (res.ok ? res.json() : null))
          .then((value) => { if (alive) setData(value) })
          .catch(() => {})
        return () => { alive = false }
      }, [])
      return data
    }

    /* -- 回合落定感知（followup 同款：生成键从停止翻回发送） ---------- */

    function composerRoot() {
      const dock = document.querySelector('[data-composer-dock]')
      return dock ? dock.parentElement : null
    }
    function composerBusy(root) {
      if (!root) return false
      const buttons = root.querySelectorAll('button[aria-label]')
      for (const button of buttons) {
        if (button.offsetParent === null) continue
        const label = button.getAttribute('aria-label') ?? ''
        if (/停止|stop/i.test(label)) return true
      }
      return false
    }
    function useTurnEnd(onTurnEnd) {
      const callbackRef = React.useRef(onTurnEnd)
      callbackRef.current = onTurnEnd
      React.useEffect(() => {
        let wasBusy = composerBusy(composerRoot())
        const timerId = setInterval(() => {
          const root = composerRoot()
          const busy = composerBusy(root)
          if (wasBusy && !busy) callbackRef.current()
          wasBusy = busy
        }, 500)
        return () => { clearInterval(timerId) }
      }, [])
    }

    /* -- 展示辅助 ------------------------------------------------------ */

    function moneyOf(state, cost) {
      if (!state || !Number.isFinite(cost)) return '—'
      const value = cost * (state.display?.rate ?? 7.2)
      const unit = state.display?.currency === 'CNY' ? '¥' : '$'
      return value > 0 && value < 0.01 ? `${unit}${value.toFixed(4)}` : `${unit}${value.toFixed(2)}`
    }
    function tokensOf(row) {
      if (!row) return 0
      return (row.input ?? 0) + (row.output ?? 0) + (row.cacheRead ?? 0) + (row.cacheWrite ?? 0) + (row.reasoning ?? 0)
    }

    /* -- 界面一：宿主状态行末尾的会话费用 ------------------------------ */

    /**
     * 会话 id 感知器：input.dock 槽位组件只用来拿标准 props 里的 sessionId
     * （渲染 null），写进模块级变量供锚定 span 读取；切会话即时更新。
     */
    let currentSessionId = ''
    const sessionWatchers = new Set()

    function SessionIdSensor({ sessionId }) {
      React.useEffect(() => {
        currentSessionId = typeof sessionId === 'string' ? sessionId : ''
        for (const notify of sessionWatchers) {
          try { notify() } catch { /* 单订阅者异常不断链 */ }
        }
      }, [sessionId])
      return null
    }

    /**
     * 锚定进宿主会话指标行（「5 轮 31 步 · 207 tok/s · … 缓存命中 88%」）。
     * compaction-control 0.1.7 同款思路：React/宿主都不管理我们的 span 位置，
     * span 断线（宿主整行重建）时 MutationObserver 重挂；找不到特征行就不渲染
     * （宁缺毋滥，不在官方容器外悬空）。
     */
    const sessionAnchor = { span: null, host: null, observer: null, state: null, lastFailLog: 0 }

    function sessionCostText() {
      const state = latestState
      if (!state || !currentSessionId || !Array.isArray(state.sessions)) return ''
      const session = state.sessions.find((item) => item.id === currentSessionId)
      if (!session) return ''
      return ` · ${moneyOf(state, session.cost)}`
    }

    function renderSessionAnchor() {
      const span = sessionAnchor.span
      if (!span || !span.isConnected) return
      const text = sessionCostText()
      span.textContent = text
      sessionAnchor.host.style.display = text ? '' : 'none'
    }

    /** 找宿主状态行容器：可见文本含「缓存命中」/「tok/s」，向上爬到含 ≥2 个
     * 直接 button 子女的层——状态行由「5轮68步」「8M tok」「上下文 16%」等
     * 多个指标按钮组成，锚要插在这一层之后才是整行末尾。 */
    function findStatusRow() {
      // 优先认宿主的 dock 容器：InputBar 里 <div data-composer-dock> 同时装
      // composer.dock 槽位（各 pill）和 ContextMeter。比按文本 + 按钮数猜稳。
      const dock = document.querySelector('[data-composer-dock]')
      if (dock && dock.offsetParent !== null) return dock
      // 兜底：老版本的文本扫描
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? ''
        if (!text.includes('缓存命中') && !text.includes('tok/s')) continue
        let el = node.parentElement
        if (!el || el.offsetParent === null) continue
        let row = el
        for (let depth = 0; depth < 6 && row.parentElement; depth += 1) {
          const directButtons = [...row.children].filter((child) => child.tagName === 'BUTTON')
          if (directButtons.length >= 2) break
          row = row.parentElement
        }
        if (row.offsetParent === null) continue
        return row
      }
      return null
    }

    function mountSessionAnchor() {
      // 状态行费用改由 composer.dock 的 pill 负责：这里不但不再插新的一份，
      // 还要把旧版本已经插进去的 .dsh-cost-statusrow 清掉，否则会显示成两行。
      if (document.querySelector('.dsh-cost-pill-anchor')) {
        for (const stale of document.querySelectorAll('.dsh-cost-statusrow')) stale.remove()
        sessionAnchor.host = null
        sessionAnchor.span = null
        return
      }
      // 已挂且仍在文档中：不重复锚。
      if (sessionAnchor.host?.isConnected) return
      const row = findStatusRow()
      if (!row) {
        // 失败节流：MutationObserver 每次页面变动都会进到这里，不节流会
        // 每秒刷几十条 debug 日志（真机曾积累 3002 条）。首见记一条，
        // 之后每 5 分钟最多记一次。
        const now = Date.now()
        if (!sessionAnchor.lastFailLog || now - sessionAnchor.lastFailLog > 300_000) {
          sessionAnchor.lastFailLog = now
          void clientDebug('anchor: status row not found (no visible tok/s text; throttled 5m)')
        }
        return
      }
      // 插到状态行的**兄弟位置**（compaction-control 0.1.7 教训：append 进
      // React 管理的容器会被重渲染清掉，兄弟位置宿主不管、重锚不打架）。
      const host = document.createElement('div')
      host.className = 'dsh-cost-statusrow'
      const span = document.createElement('span')
      span.className = 'dsh-cost-inline'
      span.textContent = sessionCostText()
      host.appendChild(span)
      host.style.display = span.textContent ? '' : 'none'
      row.insertAdjacentElement('afterend', host)
      sessionAnchor.host = host
      sessionAnchor.span = span
      void clientDebug('anchor: mounted after status row')
    }

    function startSessionAnchor() {
      mountSessionAnchor()
      sessionAnchor.observer = new MutationObserver(() => {
        // 只处理我们 host 断线或脱离状态行的情况，防自触发循环。
        const host = sessionAnchor.host
        if (host?.isConnected) {
          const prev = host.previousElementSibling
          const text = prev?.textContent ?? ''
          if (prev && (text.includes('缓存命中') || text.includes('tok/s'))) return
        }
        sessionAnchor.host = null
        sessionAnchor.span = null
        mountSessionAnchor()
      })
      sessionAnchor.observer.observe(document.body, { childList: true, subtree: true })
    }

    /* -- 界面二：侧栏今日费用（分隔线 + 左右对齐行） -------------------- */

    function TodayCost() {
      const state = useCostState()
      if (!state) return null
      const today = state.today
      const title = today
        ? `${today.calls} 次调用 · token ${(tokensOf(today) / 1000).toFixed(1)}k · ${state.peak?.isPeak ? '峰时' : '谷时'}`
        : '今日暂无调用'
      const overBudget = state.budget && state.budget.usedPct >= 0.8
      return h('button', {
        type: 'button',
        className: 'dsh-cost-sidebar' + (overBudget ? ' warn' : ''),
        title,
        onClick: () => { void pollOnce() },
      },
      h('span', null, '今日'),
      h('span', { className: 'dsh-cost-sidebar-value' }, moneyOf(state, today?.cost ?? 0)))
    }

    /* -- 回合边界感知（turnTail 槽位，隐形数据载体） -------------------- */

    const TURN_BUCKET_NAMES = { input: '输入', output: '输出', cacheRead: '缓存读取', cacheWrite: '缓存写入', reasoning: '推理' }

    /**
     * 用户要求去掉回合尾部的可见费用行（0.6.1）；此组件退化为隐形载体：
     * 每回合渲染一个 display:none 的节点，把宿主给的回合时间边界写到
     * dataset——动作行的「费用」按钮（用量旁）靠它把弹卡对到正确的回合。
     */
    function TurnCost(props) {
      const turn = props.turn
      const start = turn?.start?.time
      const end = turn?.end?.time
      if (start == null || end == null) return null
      return h('span', {
        className: 'dsh-cost-turn-data',
        'data-turn-from': String(start),
        'data-turn-to': String(end),
        style: { display: 'none' },
      })
    }

    /* -- 峰谷切换提醒（fixed 覆盖层 portal 到 body，防祖先链裁剪） ------ */

    let lastAlertedSwitch = 0

    function PeakAlert() {
      const state = useCostState()
      const [visible, setVisible] = React.useState(false)
      const [message, setMessage] = React.useState('')
      React.useEffect(() => {
        const alerts = state?.alerts
        const nextSwitchAtMs = state?.peak?.nextSwitchAtMs
        if (!alerts?.peakEnabled || !nextSwitchAtMs) return
        const lead = (alerts.leadMinutes ?? 2) * 60_000
        const remaining = nextSwitchAtMs - Date.now()
        if (remaining > lead || remaining < 0) return
        if (lastAlertedSwitch === nextSwitchAtMs) return
        lastAlertedSwitch = nextSwitchAtMs
        const time = new Date(nextSwitchAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const text = state.peak.nextIsPeak ? `即将进入峰时计价（${time}）` : `即将进入谷时计价（${time}）`
        setMessage(text)
        setVisible(true)
        if (alerts.notify) {
          try { new Notification('dsh-cost 峰谷计价', { body: text }) } catch { /* 权限未授予则忽略 */ }
        }
      }, [state])
      if (!visible) return null
      return createPortal(h('div', { className: 'dsh-cost-alert' },
        h('span', null, message),
        h('button', { type: 'button', onClick: () => setVisible(false) }, '知道了')), document.body)
    }

    /* -- 动作行费用按钮：锚定在官方「用量」按钮旁，弹卡同官方样式 ------- */

    const usageAnchors = { observer: null, scanning: false, pop: null, anchor: null }

    /** 从「用量」按钮向上找同回合的隐形边界载体（限深，宁缺毋错）。 */
    function findTurnDetails(usageButton) {
      let level = usageButton.parentElement
      for (let depth = 0; depth < 6 && level; depth += 1) {
        const marker = level.querySelector?.('.dsh-cost-turn-data[data-turn-from]')
        if (marker) return marker
        level = level.parentElement
      }
      return null
    }

    function closeTurnCostPop(event) {
      // 点在费用按钮上不在这里关：capture 阶段比按钮自己的 click 先跑，
      // 这里关了按钮又会重新打开，永远关不掉。toggle 交给按钮自己做。
      if (event?.target instanceof Node) {
        if (event.target.closest?.('.dsh-cost-usage-anchor')) return
        // 点弹卡内部（文字、数字）也不该收起，只有点外面才关。
        if (usageAnchors.pop?.contains(event.target)) return
      }
      usageAnchors.pop?.remove()
      usageAnchors.pop = null
      usageAnchors.anchor = null
      document.removeEventListener('click', closeTurnCostPop, true)
    }

    function openTurnCostPop(anchor) {
      closeTurnCostPop()
      const from = anchor.dataset.turnFrom
      const to = anchor.dataset.turnTo
      if (!from || !to) return
      const pop = document.createElement('div')
      pop.className = 'dsh-cost-pop'
      pop.textContent = '加载中…'
      document.body.appendChild(pop)
      usageAnchors.pop = pop
      usageAnchors.anchor = anchor
      // 动作行贴近窗口底部：按官方弹卡惯例向上展开（compaction-control 教训）。
      const rect = anchor.getBoundingClientRect()
      pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 280))}px`
      pop.style.top = `${rect.top - 8}px`
      pop.style.transform = 'translateY(-100%)'
      document.addEventListener('click', closeTurnCostPop, true)
      fetch(`${ENDPOINT}/turn?session=${encodeURIComponent(currentSessionId)}&from=${from}&to=${to}`, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((value) => {
          if (!usageAnchors.pop || !value) return
          while (pop.firstChild) pop.removeChild(pop.firstChild)
          const head = document.createElement('div')
          head.className = 'dsh-cost-pop-head'
          const title = document.createElement('span')
          title.textContent = '本轮费用'
          const total = document.createElement('span')
          total.className = 'dsh-cost-pop-num'
          total.textContent = value.found ? moneyOf(latestState, value.cost) : '—'
          head.appendChild(title)
          head.appendChild(total)
          pop.appendChild(head)
          for (const row of value.rows ?? []) {
            const line = document.createElement('div')
            line.className = 'dsh-cost-pop-row'
            const label = document.createElement('span')
            label.textContent = `${String(row.model ?? '').replace(/^deepseek-/, '')} · ${TURN_BUCKET_NAMES[row.bucket] ?? row.bucket}`
            const numEl = document.createElement('span')
            numEl.className = 'dsh-cost-pop-num'
            numEl.textContent = `${Number(row.tokens).toLocaleString()} tok · ${moneyOf(latestState, row.cost)}`
            line.appendChild(label)
            line.appendChild(numEl)
            pop.appendChild(line)
          }
          if (!value.found) {
            const empty = document.createElement('div')
            empty.className = 'dsh-cost-pop-row'
            empty.textContent = '该回合暂无用量记录'
            pop.appendChild(empty)
          }
        })
        .catch(() => closeTurnCostPop())
    }

    /** 扫描官方「用量 X tok」按钮，在其后插入同款费用按钮（按钮自身打标记防重复）。 */
    function mountUsageAnchors() {
      const buttons = document.querySelectorAll('button')
      for (const button of buttons) {
        if (button.offsetParent === null) continue
        // 标记挂在用量按钮自身：兄弟检查在 afterend 插入后会漏判导致无限堆叠。
        if (button.dataset.dshCostAnchor === '1') continue
        const text = (button.textContent ?? '').trim()
        if (!text.startsWith('用量') || !text.includes('tok')) continue
        const details = findTurnDetails(button)
        if (!details) continue
        button.dataset.dshCostAnchor = '1'
        const anchor = document.createElement('button')
        anchor.className = 'dsh-cost-usage-anchor'
        anchor.type = 'button'
        anchor.textContent = '费用 —'
        const from = details.getAttribute('data-turn-from') ?? ''
        const to = details.getAttribute('data-turn-to') ?? ''
        anchor.dataset.turnFrom = from
        anchor.dataset.turnTo = to
        anchor.addEventListener('click', (event) => {
          event.stopPropagation()
          // 再点同一个按钮 = 收起；点另一个回合的按钮 = 切过去。
          if (usageAnchors.pop && usageAnchors.anchor === anchor) {
            closeTurnCostPop()
            return
          }
          openTurnCostPop(anchor)
        })
        // 插到「用量」按钮右侧（用户指定：用量在左、费用在右）。
        button.insertAdjacentElement('afterend', anchor)
        // 金额异步补：同回合 /turn 已被 turnTail 查过，这里独立补一次。
        fetch(`${ENDPOINT}/turn?session=${encodeURIComponent(currentSessionId)}&from=${from}&to=${to}`, { cache: 'no-store' })
          .then((res) => (res.ok ? res.json() : null))
          .then((value) => {
            if (value?.found && anchor.isConnected) {
              anchor.textContent = `费用 ${moneyOf(latestState, value.cost)}`
              anchor.title = '本轮费用明细'
            } else if (anchor.isConnected) {
              anchor.textContent = '费用 —'
            }
          })
          .catch(() => {})
      }
    }

    function startUsageAnchors() {
      let timer = 0
      const scan = () => {
        timer = 0
        usageAnchors.scanning = false
        try { mountUsageAnchors() } catch { /* 扫描失败下轮再试 */ }
      }
      const scheduleScan = () => {
        if (usageAnchors.scanning || timer) return
        usageAnchors.scanning = true
        timer = setTimeout(scan, 400)
      }
      scheduleScan()
      usageAnchors.observer = new MutationObserver(scheduleScan)
      usageAnchors.observer.observe(document.body, { childList: true, subtree: true })
    }

    /* -- 界面四：设置页「费用」分节 ------------------------------------ */

    function BudgetCard({ state }) {
      const budget = state?.budget
      if (!budget) return null
      const pct = Math.min(100, Math.max(0, budget.usedPct * 100))
      const tier = budget.usedPct >= 1 ? 'over' : budget.usedPct >= 0.8 ? 'warn' : ''
      const periodLabel = budget.period === 'day' ? '今日' : budget.period === 'month' ? '本月' : '累计'
      return h('div', { className: 'dsh-cost-budget' },
        h('div', { className: 'dsh-cost-budget-head' },
          h('span', null, `预算（${periodLabel}）`),
          h('span', null, `¥${Number(budget.used).toFixed(2)} / ¥${Number(budget.amount).toFixed(2)} · ${(budget.usedPct * 100).toFixed(0)}%`)),
        h('div', { className: 'dsh-cost-bar' }, h('div', { className: `dsh-cost-fill ${tier}`, style: { width: `${pct}%` } })))
    }

    function RecentCalls({ state }) {
      const [calls, setCalls] = React.useState(null)
      React.useEffect(() => {
        let alive = true
        const load = async () => {
          try {
            const res = await fetch(`${ENDPOINT}/calls?limit=10`, { cache: 'no-store' })
            if (!res.ok) return
            const data = await res.json()
            if (alive && Array.isArray(data.calls)) setCalls(data.calls)
          } catch { /* ignore */ }
        }
        void load()
        const timerId = setInterval(load, POLL_MS * 2)
        return () => { alive = false; clearInterval(timerId) }
      }, [])
      if (!calls) return null
      if (calls.length === 0) return null
      return h('div', { className: 'dsh-cost-table' },
        calls.map((call, index) => h('div', { className: 'dsh-cost-row', key: `${call.at}-${index}` },
          h('span', { className: 'dsh-cost-dim' }, new Date(call.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
          h('span', { className: 'dsh-cost-grow' }, String(call.model ?? '').replace(/^deepseek-/, '')),
          h('span', { className: 'dsh-cost-dim' }, `${((call.input ?? 0) + (call.output ?? 0) + (call.cacheRead ?? 0) + (call.cacheWrite ?? 0)).toLocaleString()} tok`),
          h('span', { className: 'dsh-cost-num' }, moneyOf(state, call.cost)))))
    }

    function CostCard({ title, row, state }) {
      return h('div', { className: 'dsh-cost-card' },
        h('div', { className: 'dsh-cost-card-title' }, title),
        h('div', { className: 'dsh-cost-card-value' }, moneyOf(state, row?.cost ?? 0)),
        h('div', { className: 'dsh-cost-card-sub' },
          `${row?.calls ?? 0} 次调用 · token ${(tokensOf(row) / 1000).toFixed(1)}k`))
    }

    /* -- 状态行费用 pill：累计费用，点开看每笔调用（含提示词增强） ------ */

    const SOURCE_LABEL = { chat: '对话', enhance: '提示词增强', followup: '跟进建议' }
    let overviewPop = null

    function closeOverviewPop(event) {
      // 点 pill 本身不在这里关，交给按钮做 toggle；点弹卡内部也不关。
      if (event?.target instanceof Node) {
        if (event.target.closest?.('.dsh-cost-pill-anchor')) return
        if (overviewPop?.contains(event.target)) return
      }
      overviewPop?.remove()
      overviewPop = null
      document.removeEventListener('click', closeOverviewPop, true)
    }

    function renderOverview(data) {
      const state = latestState
      const box = document.createElement('div')

      const head = document.createElement('div')
      head.className = 'dsh-cost-pop-head'
      const title = document.createElement('span')
      title.textContent = '本对话费用'
      const sum = document.createElement('span')
      sum.textContent = moneyOf(state, data.total?.cost ?? 0)
      head.append(title, sum)
      box.appendChild(head)

      // 官方余额（选配 apiKey）：打开弹卡后异步补一行；未配置/失败整行不占位。
      const balRow = document.createElement('div')
      balRow.className = 'dsh-cost-src'
      const balName = document.createElement('span')
      balName.className = 'name'
      balName.textContent = '官方余额'
      const balNum = document.createElement('span')
      balNum.className = 'num'
      balNum.textContent = '…'
      balRow.append(balName, balNum)
      box.appendChild(balRow)
      void fetch(`${ENDPOINT}/balance`, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((bal) => {
          if (bal?.ok && bal.total !== '') balNum.textContent = `${bal.currency} ${bal.total}`
          else balRow.remove()
        })
        .catch(() => balRow.remove())

      const bySource = data.total?.bySource ?? {}
      const order = ['chat', 'enhance', 'followup']
      const keys = [
        ...order.filter((key) => bySource[key]),
        ...Object.keys(bySource).filter((key) => !order.includes(key)),
      ]
      for (const key of keys) {
        const entry = bySource[key]
        const row = document.createElement('div')
        row.className = 'dsh-cost-src'
        const name = document.createElement('span')
        name.className = 'name'
        name.textContent = SOURCE_LABEL[key] ?? key
        const cnt = document.createElement('span')
        cnt.className = 'cnt'
        cnt.textContent = entry.calls + ' 次'
        const num = document.createElement('span')
        num.className = 'num'
        num.textContent = moneyOf(state, entry.cost)
        row.append(name, cnt, num)
        box.appendChild(row)
      }

      const sep = document.createElement('div')
      sep.className = 'dsh-cost-pop-head'
      sep.style.marginTop = '8px'
      const sepTitle = document.createElement('span')
      sepTitle.textContent = '最近调用'
      sep.appendChild(sepTitle)
      box.appendChild(sep)

      for (const call of (data.calls ?? []).slice(0, 20)) {
        const row = document.createElement('div')
        row.className = 'dsh-cost-src'
        const time = document.createElement('span')
        time.className = 'cnt'
        time.textContent = new Date(call.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        const name = document.createElement('span')
        name.className = 'name'
        name.textContent = (SOURCE_LABEL[call.source] ?? call.source) + ' · ' + (call.model || '—')
        const num = document.createElement('span')
        num.className = 'num'
        num.textContent = moneyOf(state, call.cost)
        row.append(time, name, num)
        box.appendChild(row)
      }
      return box
    }

    /** 弹卡只负责定位与渲染；数据由 pill 从 /session 拉好传进来。 */
    function openOverviewPop(anchor, data) {
      closeOverviewPop()
      if (!anchor) return
      const pop = document.createElement('div')
      pop.className = 'dsh-cost-pop'
      document.body.appendChild(pop)
      overviewPop = pop
      const rect = anchor.getBoundingClientRect()
      pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 300)) + 'px'
      pop.style.top = rect.top - 8 + 'px'
      pop.style.transform = 'translateY(-100%)'
      document.addEventListener('click', closeOverviewPop, true)
      pop.appendChild(data ? renderOverview(data) : document.createTextNode('读取失败'))
    }

    /** 状态行 pill：显示「本对话」累计费用，点开看分组与每笔调用。 */
    function CostPill() {
      // useCostState 只用来在轮询到新账本时触发重渲染，值本身不用。
      const tick = useCostState()
      const anchorRef = React.useRef(null)
      const [open, setOpen] = React.useState(false)
      const [session, setSession] = React.useState(null)

      React.useEffect(() => {
        // pill 挂载即接管状态行费用：把旧版本锚定插入的那一份清掉。
        for (const stale of document.querySelectorAll('.dsh-cost-statusrow')) stale.remove()
        // 弹卡被点外部关掉时，把按钮的展开态同步回来。
        const timer = window.setInterval(() => { setOpen(Boolean(overviewPop)) }, 200)
        return () => window.clearInterval(timer)
      }, [])

      React.useEffect(() => {
        if (!currentSessionId) { setSession(null); return undefined }
        let alive = true
        // 优先 /session（跨所有日期折当前会话）。服务端还没热更新时它 404，
        // 退回 /state 里的 sessions（近 7 天，同 id 可能按天拆成多条，累加）。
        const fallback = () => {
          const rows = (latestState?.sessions ?? []).filter((item) => item.id === currentSessionId)
          if (rows.length === 0) { setSession(null); return }
          const total = { cost: 0, calls: 0, bySource: {} }
          for (const row of rows) {
            total.cost += row.cost ?? 0
            total.calls += row.calls ?? 0
          }
          setSession({ session: currentSessionId, total, calls: [], fallback: true })
        }
        fetch(ENDPOINT + '/session?session=' + encodeURIComponent(currentSessionId), { cache: 'no-store' })
          .then((res) => (res.ok ? res.json() : null))
          .then((value) => {
            if (!alive) return
            if (value && value.total) setSession(value)
            else fallback()
          })
          .catch(() => { if (alive) fallback() })
        return () => { alive = false }
      }, [tick, currentSessionId])

      const state = latestState
      const amount = session ? moneyOf(state, session.total?.cost ?? 0) : '—'
      // 不用图标：宿主的 dock 对 svg 没有约束，一旦样式没跟上就撑成方块。
      // 关键排版用内联兜底，不依赖外部 CSS 是否已注入。
      return h('span', {
        className: 'dsh-cost-pill-anchor',
        ref: anchorRef,
        style: { display: 'inline-flex', alignItems: 'center' },
      },
      h('button', {
        type: 'button',
        className: 'dsh-cost-pill',
        'aria-expanded': open ? 'true' : 'false',
        title: '费用明细',
        // 数值全部来自 dsh 的状态行规范：font-size 12px / line-height 20px /
        // 文字色 --dsw-alias-label-tertiary(暗色 rgb(173,178,184)) /
        // padding 1px 8px / 圆角 --dsw-radius-sm(8px)。不用 inherit，宿主那层
        // 拿到的字号和色号都不是 pill 该用的。
        style: {
          display: 'inline-flex',
          flexDirection: 'row',
          alignItems: 'center',
          width: 'auto',
          height: 'auto',
          minWidth: 0,
          padding: '1px 8px',
          border: 'none',
          borderRadius: '8px',
          background: 'transparent',
          color: 'rgb(173, 178, 184)',
          fontSize: '12px',
          lineHeight: '20px',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        },
        onClick: () => {
          if (overviewPop) { closeOverviewPop(); setOpen(false); return }
          setOpen(true)
          openOverviewPop(anchorRef.current, session)
        },
      }, amount))
    }

    function CostSection() {
      const state = useCostState()
      const forecast = useForecast()
      const budgetAmount = state?.budget?.amount
      const rate = state?.display?.rate ?? 7.2
      const overBudget = forecast && forecast.basis === 'recent'
        && Number.isFinite(budgetAmount) && budgetAmount > 0
        && forecast.projected * rate > budgetAmount
      const forecastCard = forecast && forecast.basis === 'recent'
        ? h('div', { className: 'dsh-cost-forecast', 'data-over': String(!!overBudget) },
          h('div', { className: 'dsh-cost-forecast-head' },
            h('span', { className: 'dsh-cost-card-title' }, '月底预计'),
            h('span', { className: 'dsh-cost-forecast-value' }, moneyOf(state, forecast.projected))),
          h('div', { className: 'dsh-cost-forecast-sub' },
            `已花 ${moneyOf(state, forecast.monthCost)} · 日均 ${moneyOf(state, forecast.avgDaily)} · 剩 ${forecast.daysLeft} 天${overBudget ? ' · 超出预算' : ''}`))
        : forecast && forecast.basis === 'insufficient'
          ? h('div', { className: 'dsh-cost-forecast' },
            h('div', { className: 'dsh-cost-forecast-sub' },
              `预测需要至少 3 天完整数据（当前 ${forecast.sampleDays ?? 0} 天）`))
          : null
      const cards = h('div', { className: 'dsh-cost-cards' },
        h(CostCard, { title: '今日', row: state?.today, state }),
        h(CostCard, { title: '本月', row: state?.month, state }),
        h(CostCard, { title: '累计', row: state?.total, state }))
      const recent = Array.isArray(state?.recent) && state.recent.length > 0
        ? h('div', { className: 'dsh-cost-table' },
          state.recent.slice().reverse().map((day) => h('div', { className: 'dsh-cost-row', key: day.date },
            h('span', { className: 'dsh-cost-dim' }, day.date.slice(5)),
            h('span', { className: 'dsh-cost-grow' }, `${day.calls} 次调用`),
            h('span', { className: 'dsh-cost-num' }, moneyOf(state, day.cost)))))
        : h('div', { className: 'dsh-cost-table' }, h('div', { className: 'dsh-cost-empty' }, '暂无记录'))
      const sessions = Array.isArray(state?.sessions) && state.sessions.length > 0
        ? h('div', { className: 'dsh-cost-table' },
          state.sessions.slice(0, 10).map((session) => h('div', { className: 'dsh-cost-row', key: `${session.date}-${session.id}` },
            h('span', { className: 'dsh-cost-dim' }, new Date(session.at || session.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
            h('span', { className: 'dsh-cost-grow' }, String(session.id).replace(/^session-/, '').slice(0, 8)),
            h('span', { className: 'dsh-cost-grow' }, `${session.calls} 次`),
            h('span', { className: 'dsh-cost-num' }, moneyOf(state, session.cost)))))
        : null
      const footerBits = []
      if (state?.peak) {
        footerBits.push(h('span', { className: 'dsh-cost-badge', key: 'peak' }, state.peak.isPeak ? '峰时计价' : '谷时计价'))
      }
      if (Array.isArray(state?.unmatched) && state.unmatched.length > 0) {
        footerBits.push(h('span', { className: 'dsh-cost-badge', key: 'unmatched', title: state.unmatched.join(', ') }, `${state.unmatched.length} 个模型按默认档计费`))
      }
      const downloadExport = (format) => {
        const link = document.createElement('a')
        link.href = `${ENDPOINT}/export?format=${format}`
        link.download = ''
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
      footerBits.push(h('button', { className: 'dsh-cost-badge action', key: 'export-json', title: '导出全部费用记录（JSON）', onClick: () => downloadExport('json') }, '导出 JSON'))
      footerBits.push(h('button', { className: 'dsh-cost-badge action', key: 'export-csv', title: '导出日汇总（CSV）', onClick: () => downloadExport('csv') }, '导出 CSV'))
      // 官方价格同步 + 汇率刷新（点击后按钮短暂显示结果，再自动复原）。
      const [syncNote, setSyncNote] = React.useState('')
      React.useEffect(() => {
        if (!syncNote) return
        const timerId = setTimeout(() => setSyncNote(''), 4000)
        return () => clearTimeout(timerId)
      }, [syncNote])
      const postSync = async (endpoint, okLabel) => {
        try {
          const res = await fetch(`${ENDPOINT}/${endpoint}`, { method: 'POST' })
          const data = await res.json().catch(() => null)
          if (res.ok && data?.ok) setSyncNote(okLabel)
          else setSyncNote(`失败：${data?.error ?? res.status}`)
          if (res.ok) void pollOnce()
        } catch (error) { setSyncNote(`失败：${String(error?.message ?? error).slice(0, 60)}`) }
      }
      footerBits.push(h('button', {
        className: 'dsh-cost-badge action',
        key: 'sync-prices',
        title: '从官方定价页同步现行价格（峰谷两档，历史账目不受影响）',
        onClick: () => { void postSync('fetch-prices', '价格已同步') },
      }, '同步官方价格'))
      footerBits.push(h('button', {
        className: 'dsh-cost-badge action',
        key: 'sync-rate',
        title: '立即刷新 USD→CNY 汇率（平时每小时自动刷新）',
        onClick: () => { void postSync('fetch-rate', '汇率已刷新') },
      }, '刷新汇率'))
      if (syncNote) {
        footerBits.push(h('span', { className: 'dsh-cost-badge', key: 'sync-note' }, syncNote))
      }
      return h('div', { className: 'dsh-cost-section' },
        h(BudgetCard, { state }),
        cards,
        forecastCard,
        recent,
        sessions,
        h(RecentCalls, { state }),
        h('div', { style: { display: 'flex', gap: '6px' } }, footerBits))
    }

    /* -- 装配 ---------------------------------------------------------- */

    return {
      inject: ['slots'],
      apply(ctx) {
        ensureStyle()
        startPoller()
        startSessionAnchor()
        startUsageAnchors()
        sessionWatchers.add(renderSessionAnchor)
        console.info('[dsh-cost] client 0.8.0 active')
        // 只当 sessionId 感知器（渲染 null），费用本体锚定在宿主状态行末尾。
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'dsh-cost-session',
          order: 90,
        }, SessionIdSensor))
        // 隐形回合边界载体：动作行「费用」按钮的弹卡按回合对齐靠它（0.6.1 起不再渲染可见费用行）。
        // 状态行费用 pill：order 2 排在 dsh 的 activity(0) / usage(1) 之后。
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'cost',
          order: 2,
        }, CostPill))
        // order 5：dsh-followup 也注册了这个槽位且用 10，同序可能互相挤掉。
        ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: 'dsh-cost-turn',
          order: 5,
        }, TurnCost))
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'dsh-cost-today',
          order: 3,
        }, TodayCost))
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'dsh-cost-peak-alert',
          order: 2,
        }, PeakAlert))
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'dsh-cost',
          order: 30,
          label: '费用',
        }, CostSection))
      },
    }
}

/* 由 scripts/build-suite.mjs 从 dsh-power-picker/client.js 机械生成；勿手改。 */
/**
 * dsh-power-picker 的 web 客户端部分。
 *
 * 把 dsh 输入栏的模型选择器改造成 Codex 桌面端的样式（渐变 power 滑条 +
 * 星点 + 白色旋钮 + 内联模型列表），数据走官方通路：
 *
 *  - `conversation.input.model` 是 single 槽位；多注册只渲染 priority 最低
 *    者，本插件以 priority: -1 遮蔽内置选择器（ui-slots "lowest renders"）。
 *  - 注册契约与内置 ui-model-selection 完全一致（0.2.1-rc.3 反推）：组件
 *    拿到的是 `directory.store`（SnapshotStore）+ load/select 两个动词；
 *    档位阶梯在 groups[].models[].reasoning = { defaultEffort?, efforts }。
 *  - select 返回 RemoteResult：失败不抛异常，必须检查 ok。
 *  - react shim 没有 createPortal，portal 从 require('react-dom') 取。
 *
 * 0.3.1 数值稳定（修「滑杆异常跳动」）：
 *  - 乐观值钉住——选档立即显示，select 在途/回滚期间显示值不被 store
 *    中间态翻转；失败才回弹并上报。
 *  - 档位标签激活态去掉 font-weight 变化（相邻标签宽度重排会造成抖动），
 *    改用颜色 + 透明度过渡。
 *  - 星点固定 5 槽位按填充比例淡入淡出，不再随比例增删重挂载。
 *
 * 布局对齐 Codex 参考图：单面板自上而下 = 头部（渐变标题 + 副标题 + 右上
 * 刷新）→ power 滑条（10px 轨道 / 22px 旋钮 / 档位标签）→ 分隔线 →
 * 「选择模型」内联列表（当前项 ✓）。
 *
 * 诊断：boot/register/inject/snapshot/open/close/select-* 上报到
 * /api/dsh-power-picker/diag，落盘 ~/.dsh/power-picker-debug.log。
 */

function createPickerClient(require) {
    const React = require('react')
    const h = React.createElement

    // dsh 客户端的 react shim 不带 createPortal（0.2.2 实测 crash：
    // "React.createPortal is not a function"）。加载器的 require 表里有
    // react-dom——内置 ui-model-selection 自己就 require('react-dom')——
    // portal 必须从那里取；取不到就退回原地渲染并上报。
    let createPortal = null
    try {
      const ReactDOM = require('react-dom')
      if (typeof ReactDOM?.createPortal === 'function') createPortal = ReactDOM.createPortal
    } catch { createPortal = null }

    const STYLE_ID = 'dsh-power-picker-style'
    const ENDPOINT = '/api/dsh-power-picker'
    /** 遮蔽内置选择器：single 槽位只渲染 priority 最低的注册。 */
    const SHADOW_PRIORITY = -1
    const VERSION = '0.12.3'
    const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

    const CSS = `
.dsh-power-seat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, rgba(232, 238, 250, 0.72));
  font-size: 12.5px;
  line-height: 1;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.dsh-power-seat:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
  color: var(--dsw-alias-label-primary, rgba(232, 238, 250, 0.9));
}
.dsh-power-seat[disabled] { opacity: 0.5; cursor: default; }
.dsh-power-seat-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-power-seat-caret {
  flex: none;
  font-size: 10px;
  opacity: 0.7;
  transition: transform 180ms ${EASE};
}
.dsh-power-seat[data-open="true"] .dsh-power-seat-caret { transform: rotate(180deg); }

/* 面板宿主：portal 到 body，宽度对齐 Codex 实测 ~250px，居中弹出 */
.dsh-power-host {
  position: fixed;
  z-index: 9999;
  width: min(250px, calc(100vw - 24px));
  transform-origin: bottom center;
  animation: dsh-power-in 200ms ${EASE} both;
}
@keyframes dsh-power-in {
  from { opacity: 0; transform: translateY(6px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) { .dsh-power-host { animation: none; } }

.dsh-power-panel {
  position: relative;
  padding: 14px;
  border: 0;
  border-radius: var(--dsw-radius-lg, 14px);
  /* 官方卡 = rgba(48,49,54,.94) + blur(40px) saturate(150%)（已装 asar 实测）。
     94% 透明度在无毛玻璃的宿主层会露底，这里预合成不透明等色：
     0.94×rgb(48,49,54) + 0.06×rgb(32,33,36)（dsh 暗底）= rgb(47,48,53) */
  background: #2f3035;
  box-shadow: var(--dsw-elevation-prominent, 0 12px 36px rgba(0, 0, 0, 0.45));
  color: var(--dsw-alias-label-secondary, rgba(232, 238, 250, 0.72));
  font-size: 12px;
  line-height: 20px;
  overflow: hidden;
}

/* 头部：Codex 实测为居中排版——渐变标题 + 居中副标题，刷新悬浮右上角 */
.dsh-power-header {
  position: relative;
  text-align: center;
  margin-bottom: 12px;
}
.dsh-power-title {
  display: block;
  max-width: 100%;
  margin: 0 auto;
  font-size: 18px;
  font-weight: 700;
  line-height: 24px;
  background: linear-gradient(92deg, #c7d2fe 0%, #a5b4fc 45%, #818cf8 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-power-subtitle {
  display: block;
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--dsw-alias-label-tertiary, rgba(232, 238, 250, 0.5));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 非最高档时标题用实色 chart-blue（Codex 实测：高=蓝、Ultra=紫渐变） */
.dsh-power-title-solid {
  background: none;
  -webkit-text-fill-color: currentColor;
  color: var(--color-chart-blue, #3a83f7);
}
/* 副标题即模型入口（Codex：模型名 ›，点击展开模型列表） */
.dsh-power-subtitle-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
  padding: 1px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, rgba(232, 238, 250, 0.5));
  font-size: 12.5px;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.dsh-power-subtitle-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--dsw-alias-label-primary, rgba(232, 238, 250, 0.9));
}
.dsh-power-subtitle-caret { flex: none; font-size: 9px; opacity: 0.7; }
.dsh-power-refresh {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary, rgba(232, 238, 250, 0.5));
  font-size: 13px;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, transform 320ms ${EASE};
}
.dsh-power-refresh:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
  color: var(--dsw-alias-label-primary, rgba(232, 238, 250, 0.9));
}
.dsh-power-refresh:active { transform: rotate(180deg); }

/* 滑条区：官方 headline 样式的小节标题 + Codex _1bucx 实测规格
   （Container 32px / Root 28px / Track 24px r12 带内描边与斜纹 /
     Thumb 28px 白底极轻阴影 / Tick 4px / easing .23,1,.32,1） */
.dsh-power-slider-caption {
  font-size: 12px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary, rgba(232, 238, 250, 0.5));
  margin-bottom: 6px;
  animation: dsh-power-fade 220ms ease both;
}
.dsh-power-slider-section { animation: dsh-power-fade 220ms ease both; }
@keyframes dsh-power-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .dsh-power-slider-section { animation: none; } }
/* _Container_1bucx_1：32px 列容器 */
.dsh-power-slider {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 32px;
  margin-inline: 2px;
  padding-block: 2px;
  padding-inline: 6px;
  position: relative;
}
/* _Root_1bucx_19：28px 行根，motion 变量与官方一致 */
.dsh-power-hitzone {
  --dsh-power-motion-duration: 0.3s;
  --dsh-power-motion-easing: cubic-bezier(0.23, 1, 0.32, 1);
  align-items: center;
  width: 100%;
  height: 28px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  display: flex;
  position: relative;
  cursor: var(--cursor-interaction, pointer);
}
.dsh-power-hitzone:focus-visible { outline: 2px solid rgba(77, 107, 254, 0.65); outline-offset: 2px; border-radius: 12px; }
/* _Track_1bucx_48：24px 高、r12、text 10% 底、.5px 内描边、135° 斜纹 */
.dsh-power-track {
  position: relative;
  flex-grow: 1;
  height: 24px;
  border-radius: 12px;
  background:
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0, rgba(255, 255, 255, 0.05) 2px, transparent 2px, transparent 8px),
    color-mix(in srgb, rgba(232, 238, 250, 1) 10%, transparent);
  box-shadow: inset 0 0 0 0.5px var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.12));
  overflow: hidden;
}
/* _Range_1bucx_239：填充实色 chart-blue，左圆右直；MAX 时官方观感为紫→蓝渐变
   （WebGL 辉光层之下再加 CSS 渐变兜底，两层任一生效都是正确观感） */
.dsh-power-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 12px 0 0 12px;
  background: var(--color-chart-blue, #3a83f7);
  transition: width var(--dsh-power-motion-duration, 0.3s) var(--dsh-power-motion-easing, ease);
}
.dsh-power-fill[data-max="true"] {
  background: linear-gradient(90deg, #8b5cf6 0%, #6366f1 45%, #3a83f7 100%);
}
/* 官方 data-dragging：拖拽中位移过渡时长降到 0.15s（阻尼跟手，非 1:1） */
.dsh-power-hitzone[data-live="true"] { --dsh-power-motion-duration: 0.15s; }
/* _FastTrackParticles_1m50z_1：填充内的移动粒子（官方 DOM 方案，非 canvas） */
.dsh-power-ftp {
  pointer-events: none;
  position: absolute;
  inset: 0;
  overflow: hidden;
}
/* _FastTrackParticlePath_1m50z_7：全宽路径，travel 关键帧 100%→92%→8%→0；
   官方默认 running（仅 data-animation-active=false 时暂停） */
.dsh-power-ftp-path {
  opacity: 0;
  will-change: transform;
  height: 0;
  animation-name: dsh-power-ftp-travel;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  position: absolute;
  inset-inline: 0;
  transform: translate(100%);
}
@keyframes dsh-power-ftp-travel {
  0% { opacity: 0; transform: translate(100%); }
  8% { opacity: 1; transform: translate(92%); }
  92% { opacity: 1; transform: translate(8%); }
  to { opacity: 0; transform: translate(0, 0); }
}
/* _TrackParticle_1m50z_22：3px 白点带辉光 */
.dsh-power-track-particle {
  background: #ffffffb8;
  border-radius: 999px;
  width: 3px;
  height: 3px;
  position: absolute;
  box-shadow: 0 0 5px #ffffff57;
  top: 0;
  left: 0;
  will-change: left, top;
}
/* _Burst_1m50z_76：76x76 爆发盒（MAX 到达时 16 粒弹出），锚在旋钮位置 */
.dsh-power-burst-host {
  position: absolute;
  top: 50%;
  width: 0;
  height: 0;
  z-index: 2;
}
.dsh-power-burst {
  z-index: 2;
  pointer-events: none;
  width: 76px;
  height: 76px;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
.dsh-power-burst > span {
  --particle-color: var(--color-chart-purple, #a78bfa);
  --particle-x: 0px;
  --particle-y: -36px;
  background: var(--particle-color);
  border-radius: 999px;
  width: 5px;
  height: 5px;
  animation: 0.62s cubic-bezier(0.25, 1, 0.5, 1) both dsh-power-burst-pop;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.2);
}
.dsh-power-burst > span:nth-child(4n+3) { --particle-color: color-mix(in srgb, var(--color-chart-purple, #a78bfa) 82%, var(--color-chart-blue, #3a83f7)); }
.dsh-power-burst > span:nth-child(4n+1):not(:first-child) { --particle-color: color-mix(in srgb, var(--color-chart-purple, #a78bfa) 68%, var(--color-chart-blue, #3a83f7)); }
.dsh-power-burst > span:first-child { --particle-x: -3px; --particle-y: -34px; }
@keyframes dsh-power-burst-pop {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.25); }
  22% { opacity: 1; transform: translate(calc(-50% + var(--particle-x)), calc(-50% + var(--particle-y))) scale(1.28); }
  to { opacity: 0; transform: translate(calc(-50% + var(--particle-x)), calc(-50% + var(--particle-y))) scale(0.55); }
}
/* _Fill/_Mask/_Canvas_1azzv：MAX 档 WebGL 紫色辉光（官方 MaxFill，GLSL 逐行移植） */
/* 官方 g3r 变换层：粒子层跟随旋钮平移（(百分比-100)×n%），
   圆点层 n=1、辉光层 n=-0.9（官方 Te 的系数）——两层反向视差 */
.dsh-power-mfx {
  position: absolute;
  inset: 0;
  pointer-events: none;
  transition: transform var(--dsh-power-motion-duration, 0.3s) var(--dsh-power-motion-easing, ease);
  will-change: transform;
}
.dsh-power-maxfill {
  position: absolute;
  inset: 0;
  animation: dsh-power-fade 300ms ease both;
}
.dsh-power-maxfill canvas { width: 100%; height: 100%; display: block; }
@media (prefers-reduced-motion: reduce) { .dsh-power-maxfill { animation: none; } }
/* _Tick_1bucx_40：4px 刻度点，官方配色（选中白 30% / 未选中 description 50%）、
   悬停放大 2 倍 + 降亮（官方 data-pointer-down=false hover 规则）、
   滑条悬停时整排淡出缩小（官方 data-highlighted） */
/* 档位点击热区：透明不可见（用户要求滑条上只留动态粒子），
   保留点击选档能力 */
.dsh-power-tick {
  appearance: none;
  border: none;
  padding: 0;
  position: absolute;
  top: 50%;
  width: 12px;
  height: 28px;
  margin-left: -6px;
  background: transparent;
  pointer-events: auto;
  cursor: var(--cursor-interaction, pointer);
  transform: translate(0, -50%);
}
/* 官方端点标签：交互 150ms 后显示首末档位名 */
.dsh-power-endlabels {
  position: absolute;
  inset-inline: 0;
  top: calc(50% + 17px);
  display: flex;
  justify-content: space-between;
  pointer-events: none;
  font-size: 10.5px;
  line-height: 1.3;
  color: var(--dsw-alias-label-tertiary, rgba(232, 238, 250, 0.5));
  animation: dsh-power-fade 200ms ease both;
}
/* _Thumb_1bucx_12 + _ThumbScale：28px 白底、.5px 边、极轻阴影（官方 0 0 2px #0000001a） */
.dsh-power-knob {
  position: absolute;
  top: 50%;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #fff;
  border: 0.5px solid var(--dsw-alias-border-strong, rgba(255, 255, 255, 0.25));
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.1);
  transform: translate(-50%, -50%) scale(1);
  transition:
    left var(--dsh-power-motion-duration, 0.3s) var(--dsh-power-motion-easing, ease),
    transform 200ms ${EASE},
    box-shadow 200ms ease;
  will-change: left;
}
.dsh-power-hitzone:hover .dsh-power-knob { transform: translate(-50%, -50%) scale(1.06); }
.dsh-power-hitzone[data-live="true"] .dsh-power-knob {
  transform: translate(-50%, -50%) scale(1.15);
  box-shadow: 0 3px 14px rgba(0, 0, 0, 0.5), 0 0 0 6px rgba(77, 107, 254, 0.20);
}
/* 官方 ThumbSpring：按下瞬间的弹性回缩 */
.dsh-power-hitzone[data-grab="true"] .dsh-power-knob {
  transform: translate(-50%, -50%) scale(0.9);
  transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dsh-power-stop-label {
  flex: 1;
  border: none;
  background: transparent;
  padding: 2px 0;
  color: rgba(232, 238, 250, 0.42);
  font-size: 11px;
  line-height: 1.3;
  cursor: pointer;
  text-align: center;
  transition: color 180ms ease, opacity 180ms ease, transform 120ms ease;
}
.dsh-power-stop-label:first-child { text-align: left; padding-left: 2px; }
.dsh-power-stop-label:last-child { text-align: right; padding-right: 2px; }
.dsh-power-stop-label:hover { color: rgba(232, 238, 250, 0.75); }
.dsh-power-stop-label:active { transform: scale(0.95); }
.dsh-power-stop-label[data-active="true"] { color: rgba(240, 244, 255, 0.95); }
.dsh-power-hint {
  margin-top: 8px;
  font-size: 11px;
  color: rgba(251, 191, 36, 0.8);
  animation: dsh-power-fade 220ms ease both;
}

/* 标题可点击（Codex：点模型名选其他模型），展开模型列表 pane */
.dsh-power-title-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 1px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: background 140ms ease;
}
.dsh-power-title-btn:hover { background: rgba(255, 255, 255, 0.06); }
.dsh-power-title-caret {
  flex: none;
  font-size: 9px;
  color: var(--dsw-alias-label-tertiary, rgba(232, 238, 250, 0.5));
  transition: transform 180ms ${EASE};
}
.dsh-power-title-btn[data-open="true"] .dsh-power-title-caret { transform: rotate(180deg); }

/* 标题可点击已移至副标题（模型名 ›）；标题本体为当前档位名 */
.dsh-power-panel .dsh-power-title-btn,
.dsh-power-panel .dsh-power-title-caret,
.dsh-power-panel .dsh-power-subtitle { display: none; }

/* 模型列表 pane（Codex：标题点击后展开；返回行 + 分组 + 行式条目） */
.dsh-power-pane { animation: dsh-power-pane-in 160ms ${EASE} both; }
@keyframes dsh-power-pane-in {
  from { opacity: 0; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
}
@media (prefers-reduced-motion: reduce) { .dsh-power-pane { animation: none; } }
.dsh-power-back-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 -4px 8px;
  padding: 4px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, rgba(232, 238, 250, 0.6));
  font-size: 11.5px;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.dsh-power-back-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.07));
  color: var(--dsw-alias-label-primary, rgba(232, 238, 250, 0.9));
}
.dsh-power-models-heading {
  font-size: 12px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary, rgba(232, 238, 250, 0.5));
  margin: 0 0 2px;
}
.dsh-power-model-list {
  max-height: 196px;
  overflow-y: auto;
  scrollbar-width: thin;
  margin: 0 -6px;
}
.dsh-power-group-label {
  margin: 6px 6px 0;
  font-size: 12px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary, rgba(232, 238, 250, 0.5));
}
.dsh-power-model-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: calc(100% - 12px);
  padding: 2px 6px;
  margin: 0 6px;
  border: none;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-secondary, rgba(232, 238, 250, 0.72));
  font-size: 12px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.dsh-power-model-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.07)); }
.dsh-power-model-row[data-current="true"] { color: var(--dsw-alias-label-primary, rgba(232, 238, 250, 0.92)); }
.dsh-power-model-price {
  flex: 0 0 auto;
  font-size: 10px; line-height: 16px; padding: 0 5px;
  border-radius: 4px; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary, rgba(232, 238, 250, 0.5));
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.06));
}
.dsh-power-model-price[data-tone="warm"] { color: #f0b429; }
.dsh-power-model-price[data-tone="cool"] { color: #4ade80; }
.dsh-power-model-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 官方 swatch：8x8 r2，颜色随 provider 组轮换三色 */
.dsh-power-swatch {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--meter-tint, rgba(255, 255, 255, 0.4));
}
.dsh-power-model-check {
  flex: none;
  font-size: 11px;
  color: var(--dsw-alias-label-primary, rgba(232, 238, 250, 0.92));
  opacity: 0;
  transform: scale(0.6);
  transition: opacity 200ms ease, transform 240ms ${EASE};
}
.dsh-power-model-row[data-current="true"] .dsh-power-model-check { opacity: 1; transform: scale(1); }
.dsh-power-state {
  padding: 8px 4px 0;
  text-align: center;
  color: rgba(232, 238, 250, 0.5);
  font-size: 12px;
}

.dsh-power-state {
  padding: 8px 4px 0;
  text-align: center;
  color: rgba(232, 238, 250, 0.5);
  font-size: 12px;
}
.dsh-power-retry {
  margin-top: 6px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: transparent;
  color: rgba(232, 238, 250, 0.8);
  font-size: 11.5px;
  padding: 3px 10px;
  cursor: pointer;
}
`

    function ensureStyle() {
      if (typeof document === 'undefined') return
      if (document.getElementById(STYLE_ID)) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }

    /* -- 价格标记（数据来自 dsh-cost 的 /prices 档价端点） -------------- */

    let priceCache = null // { at, data }
    async function loadPrices() {
      if (priceCache && Date.now() - priceCache.at < 10 * 60 * 1000) return priceCache.data
      try {
        const res = await fetch('/api/dsh-cost/prices', { cache: 'no-store' })
        if (!res.ok) return null
        const data = await res.json()
        priceCache = { at: Date.now(), data }
        return data
      } catch { return null }
    }
    /** 模型 id → 档位：pro/reasoner 走 pro 档，其余（flash/chat/第三方）走 flash(默认) 档。 */
    function tierKeyOf(modelId) {
      return /pro|reasoner/i.test(String(modelId ?? '')) ? 'pro' : 'flash'
    }
    /** 当前峰谷下的输出价（USD/1M）；取不到返回 null。 */
    function priceOf(data, modelId) {
      if (!data) return null
      const models = data.models ?? {}
      const key = tierKeyOf(modelId)
      const tier = key === 'pro'
        ? Object.entries(models).find(([k]) => /pro/i.test(k))?.[1] ?? data.default
        : Object.entries(models).find(([k]) => /flash/i.test(k))?.[1] ?? data.default
      const t = data.peak === true ? tier?.peak : tier?.offPeak
      return typeof t?.output === 'number' ? t.output : null
    }

    /* ---------------------------------------------------------------- */
    /* 诊断                                                              */
    /* ---------------------------------------------------------------- */

    function report(phase, data) {
      try {
        const line = JSON.stringify({ phase, ...data, v: VERSION })
        console.info(`[dsh-power-picker] ${phase}`, data)
        fetch(`${ENDPOINT}/diag`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: line,
          keepalive: true,
        }).catch(() => { /* ignore */ })
      } catch { /* ignore */ }
    }

    /* ---------------------------------------------------------------- */
    /* 快照形状（0.2.1-rc.3 实测契约）                                     */
    /* ---------------------------------------------------------------- */

    let snapshotLogged = false
    /** 快照：{ current: {provider, model, reasoningEffort?} | null, groups: [{id, name, models: [{id, name, reasoning}]}], pending, retainedEffort? } */
    function readState(state) {
      if (!snapshotLogged && state && typeof state === 'object') {
        snapshotLogged = true
        try {
          const sample = Array.isArray(state.groups) ? state.groups[0] : null
          report('snapshot', {
            keys: Object.keys(state).join(','),
            groupKeys: sample ? Object.keys(sample).join(',') : null,
            modelKeys: sample && Array.isArray(sample.models) && sample.models[0]
              ? Object.keys(sample.models[0]).join(',')
              : null,
            groupCount: Array.isArray(state.groups) ? state.groups.length : -1,
          })
        } catch { /* ignore */ }
      }
      const groups = Array.isArray(state?.groups) ? state.groups : []
      const current = state?.current ?? null
      const model = current
        ? (groups.find((group) => group?.id === current.provider)?.models ?? [])
          .find((entry) => entry?.id === current.model)
        : null
      return {
        groups,
        current,
        model,
        reasoning: model?.reasoning ?? null,
        pending: state?.pending ?? null,
      }
    }

    /* ---------------------------------------------------------------- */
    /* power 滑条                                                        */
    /* ---------------------------------------------------------------- */

    /* 官方 seeded rand（particles-489ba2692717.js 逐行移植） */
    const rand = (index, seed) => {
      const n = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453
      return n - Math.floor(n)
    }

    function stopPosition(index, count) {
      return count <= 1 ? 50 : (index / (count - 1)) * 100
    }

    /* _FastTrackParticles（fast-track-particles chunk 逐行移植）：
       14 个粒子沿填充区往返，时长 1.9s 基准 ±20% 抖动，负延迟分布在
       动画中段，top 12~88%、透明度 0.4~1.0、缩放 0.5~0.95 */
    const FTP_COUNT = 14
    const FTP_LOOP = 1.9
    const FTP_JITTER = 0.2
    function FastTrackParticles({ percent }) {
      const phase = 1 - Math.min(Math.max(percent, 0), 100) / 100
      const step = FTP_LOOP / FTP_COUNT
      const items = []
      for (let i = 0; i < FTP_COUNT; i += 1) {
        const jitter = 1 + (rand(i, 21) - 0.5) * 2 * FTP_JITTER
        const duration = FTP_LOOP / jitter
        const delay = i * step - duration * phase
        const opacity = 0.4 + rand(i, 11) * 0.6
        const scale = 0.5 + rand(i, 12) * 0.45
        items.push(h('span', {
          key: i,
          className: 'dsh-power-ftp-path',
          style: {
            animationDelay: `${delay}s`,
            animationDuration: `${duration}s`,
            top: `${12 + rand(i, 23) * 76}%`,
          },
        }, h('span', {
          className: 'dsh-power-track-particle',
          style: { opacity, transform: `translate(-50%, -50%) scale(${scale})` },
        })))
      }
      return h('span', { className: 'dsh-power-ftp', 'aria-hidden': true }, items)
    }

    /* _MaxBurst（max-burst chunk 逐行移植）：到达 MAX 档时 16 粒从旋钮
       位置弹出，颜色按官方 nth-child 规则紫/紫蓝混色轮换 */
    function Burst() {
      const items = []
      for (let i = 0; i < 16; i += 1) {
        items.push(h('span', {
          key: i,
          style: {
            '--particle-x': i === 0 ? '-3px' : `${(rand(i, 31) - 0.5) * 60}px`,
            '--particle-y': i === 0 ? '-34px' : `${-(16 + rand(i, 32) * 44)}px`,
          },
        }))
      }
      return h('span', { className: 'dsh-power-burst', 'aria-hidden': true }, items)
    }

    /* _MaxFill（max-fill chunk 逐行移植）：MAX 档填充的 WebGL 紫色
       metaball 辉光，GLSL 着色器为官方原版；reduced-motion 只画一帧 */
    const MAXFILL_VERT = `
  attribute vec2 aPosition;
  varying vec2 vUv;

  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`
    const MAXFILL_FRAG = `
  precision highp float;

  varying vec2 vUv;

  uniform float uTime;
  uniform vec2 uResolution;

  const vec3 COLOR_1 = vec3(0.592, 0.388, 0.945);
  const vec3 COLOR_2 = vec3(0.831, 0.710, 0.953);
  const vec3 COLOR_3 = vec3(0.286, 0.000, 0.404);
  const vec3 COLOR_4 = vec3(0.145, 0.055, 0.478);
  const vec3 COLOR_5 = vec3(0.592, 0.000, 0.996);
  const vec3 COLOR_6 = vec3(0.780, 0.459, 0.914);
  const vec3 COLOR_7 = vec3(0.725, 0.576, 1.000);
  const vec3 COLOR_8 = vec3(0.400, 0.212, 0.820);
  const vec3 COLOR_9 = vec3(0.882, 0.690, 1.000);
  const vec3 COLOR_10 = vec3(0.498, 0.345, 0.957);
  const vec3 COLOR_11 = vec3(0.659, 0.275, 0.910);
  const vec3 COLOR_12 = vec3(0.212, 0.063, 0.400);

  float grain(vec2 uv) {
    vec2 grainUv = uv * uResolution * 0.5;
    return fract(sin(dot(grainUv + uTime, vec2(12.9898, 78.233))) * 43758.5453) * 2.0 - 1.0;
  }

  float fieldWeight(vec2 point, vec2 center) {
    return exp(-dot(point - center, point - center) * 12.0);
  }

  vec3 fieldColor(vec2 rawUv) {
    const float speed = 1.25;
    vec2 uv = vec2(rawUv.x, 0.40 + rawUv.y * 0.18);
    vec2 spatialScale = vec2(1.55, 1.0);
    vec2 point = uv * spatialScale;
    vec2 center1 = vec2(0.18 + sin(uTime * speed * 0.42) * 0.18, 0.36 + cos(uTime * speed * 0.50) * 0.42) * spatialScale;
    vec2 center2 = vec2(0.34 + cos(uTime * speed * 0.62) * 0.24, 0.62 + sin(uTime * speed * 0.47) * 0.38) * spatialScale;
    vec2 center3 = vec2(0.52 + sin(uTime * speed * 0.38) * 0.28, 0.30 + cos(uTime * speed * 0.58) * 0.36) * spatialScale;
    vec2 center4 = vec2(0.70 + cos(uTime * speed * 0.54) * 0.24, 0.68 + sin(uTime * speed * 0.41) * 0.36) * spatialScale;
    vec2 center5 = vec2(0.88 + sin(uTime * speed * 0.74) * 0.16, 0.36 + cos(uTime * speed * 0.64) * 0.40) * spatialScale;
    vec2 center6 = vec2(0.12 + cos(uTime * speed * 0.48) * 0.20, 0.72 + sin(uTime * speed * 0.70) * 0.30) * spatialScale;
    vec2 center7 = vec2(0.30 + sin(uTime * speed * 0.58) * 0.22, 0.44 + cos(uTime * speed * 0.52) * 0.42) * spatialScale;
    vec2 center8 = vec2(0.46 + cos(uTime * speed * 0.68) * 0.26, 0.72 + sin(uTime * speed * 0.56) * 0.32) * spatialScale;
    vec2 center9 = vec2(0.60 + sin(uTime * speed * 0.44) * 0.28, 0.26 + cos(uTime * speed * 0.60) * 0.38) * spatialScale;
    vec2 center10 = vec2(0.76 + cos(uTime * speed * 0.50) * 0.22, 0.54 + sin(uTime * speed * 0.66) * 0.40) * spatialScale;
    vec2 center11 = vec2(0.92 + sin(uTime * speed * 0.70) * 0.15, 0.66 + cos(uTime * speed * 0.46) * 0.30) * spatialScale;
    vec2 center12 = vec2(0.06 + cos(uTime * speed * 0.40) * 0.14, 0.32 + sin(uTime * speed * 0.60) * 0.40) * spatialScale;
    float weight1 = fieldWeight(point, center1) * (0.7 + 0.3 * sin(uTime * 0.91));
    float weight2 = fieldWeight(point, center2) * (0.7 + 0.3 * cos(uTime * 1.07));
    float weight3 = fieldWeight(point, center3) * (0.7 + 0.3 * sin(uTime * 0.76));
    float weight4 = fieldWeight(point, center4) * (0.7 + 0.3 * cos(uTime * 1.18));
    float weight5 = fieldWeight(point, center5) * (0.7 + 0.3 * sin(uTime * 1.03));
    float weight6 = fieldWeight(point, center6) * (0.7 + 0.3 * cos(uTime * 0.83));
    float weight7 = fieldWeight(point, center7) * (0.7 + 0.3 * sin(uTime * 1.24));
    float weight8 = fieldWeight(point, center8) * (0.7 + 0.3 * cos(uTime * 0.96));
    float weight9 = fieldWeight(point, center9) * (0.7 + 0.3 * sin(uTime * 1.11));
    float weight10 = fieldWeight(point, center10) * (0.7 + 0.3 * cos(uTime * 0.72));
    float weight11 = fieldWeight(point, center11) * (0.7 + 0.3 * sin(uTime * 1.29));
    float weight12 = fieldWeight(point, center12) * (0.7 + 0.3 * cos(uTime * 0.88));
    float totalWeight = max(
      weight1 + weight2 + weight3 + weight4 + weight5 + weight6 +
        weight7 + weight8 + weight9 + weight10 + weight11 + weight12,
      0.0001
    );
    vec3 color = (
      COLOR_1 * weight1 + COLOR_2 * weight2 + COLOR_3 * weight3 +
      COLOR_4 * weight4 + COLOR_5 * weight5 + COLOR_6 * weight6 +
      COLOR_7 * weight7 + COLOR_8 * weight8 + COLOR_9 * weight9 +
      COLOR_10 * weight10 + COLOR_11 * weight11 + COLOR_12 * weight12
    ) / totalWeight;
    color = mix(COLOR_4, color, 0.96);

    return pow(clamp(color, vec3(0.0), vec3(1.0)), vec3(0.9));
  }

  void main() {
    vec3 color = fieldColor(vUv);
    color += grain(vUv) * 0.012;
    color.r += sin(uTime * 0.5) * 0.02;
    color.g += cos(uTime * 0.7) * 0.02;
    color.b += sin(uTime * 0.6) * 0.02;
    color = pow(color, vec3(0.92));

    gl_FragColor = vec4(color, 1.0);
  }
`
    const MAXFILL_QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])

    function compileShader(gl, type, source) {
      const shader = gl.createShader(type)
      if (shader === null) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    function MaxFill({ active, reducedMotion }) {
      const canvasRef = React.useRef(null)
      React.useEffect(() => {
        if (active !== true) return undefined
        const canvas = canvasRef.current
        if (canvas === null) return undefined
        if (typeof WebGLRenderingContext === 'undefined' || typeof ResizeObserver === 'undefined') return undefined
        const gl = canvas.getContext('webgl', {
          alpha: true, antialias: false, depth: false,
          powerPreference: 'high-performance', stencil: false,
        })
        if (gl === null) {
          report('maxfill', { error: 'no-webgl-context' })
          return undefined
        }
        const vert = compileShader(gl, gl.VERTEX_SHADER, MAXFILL_VERT)
        const frag = compileShader(gl, gl.FRAGMENT_SHADER, MAXFILL_FRAG)
        if (vert === null || frag === null) {
          if (vert !== null) gl.deleteShader(vert)
          if (frag !== null) gl.deleteShader(frag)
          return undefined
        }
        const program = gl.createProgram()
        if (program === null) return undefined
        gl.attachShader(program, vert)
        gl.attachShader(program, frag)
        gl.linkProgram(program)
        gl.deleteShader(vert)
        gl.deleteShader(frag)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          report('maxfill', { error: 'program-link-failed' })
          gl.deleteProgram(program)
          return undefined
        }
        const buffer = gl.createBuffer()
        if (buffer === null) {
          gl.deleteProgram(program)
          return undefined
        }
        const aPosition = gl.getAttribLocation(program, 'aPosition')
        const uResolution = gl.getUniformLocation(program, 'uResolution')
        const uTime = gl.getUniformLocation(program, 'uTime')
        const startedAt = performance.now()
        let frame = 0
        gl.useProgram(program)
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.bufferData(gl.ARRAY_BUFFER, MAXFILL_QUAD, gl.STATIC_DRAW)
        gl.enableVertexAttribArray(aPosition)
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0)
        const draw = (time) => gl.uniform1f(uTime, time)
        const resize = () => {
          const ratio = Math.min(window.devicePixelRatio, 2)
          const { height, width } = canvas.getBoundingClientRect()
          const wide = Math.max(Math.round(width), 1)
          const tall = Math.max(Math.round(height), 1)
          canvas.width = Math.round(wide * ratio)
          canvas.height = Math.round(tall * ratio)
          gl.viewport(0, 0, canvas.width, canvas.height)
          gl.uniform2f(uResolution, wide, tall)
          draw(reducedMotion ? 0 : (performance.now() - startedAt) / 1000)
        }
        const observer = new ResizeObserver(resize)
        resize()
        observer.observe(canvas)
        if (!reducedMotion) frame = window.requestAnimationFrame(function loop(time) {
          frame = window.requestAnimationFrame(loop)
          draw((time - startedAt) / 1000)
        })
        return () => {
          if (frame !== 0) window.cancelAnimationFrame(frame)
          observer.disconnect()
          gl.deleteBuffer(buffer)
          gl.deleteProgram(program)
        }
      }, [reducedMotion])
      return h('span', { className: 'dsh-power-maxfill' },
        h('canvas', { ref: canvasRef, className: 'dsh-power-maxfill-canvas' }))
    }

    /**
     * 离散档位滑条。显示值由父层钉住（optimistic 优先），本组件只负责
     * 交互与动画：点击/拖拽按档位吸附，交互期间（拖拽或键盘逐档）走
     * data-live 1:1 跟手，松手与外部数值变化走 280ms 弹性过渡。
     */
    /**
     * 离散档位滑条——交互机制按官方 c3r 组件源码移植：
     *  - 抓住偏移：按住旋钮拖动保持抓取点，不跳指针位置
     *  - 拖拽中填充跟随**连续原始百分比**（0.15s 阻尼过渡），松手才吸附档位
     *  - 滚轮换档：累积 ±30px 步进一档，160ms 无操作重置
     *  - 按住 150ms 后显示两端端点标签（官方 areEndpointLabelsVisible）
     *  - tween = 0.3s cubic-bezier(.23,1,.32,1)（官方 j3r 常量，CSS 过渡实现）
     */
    /**
     * 离散档位滑条——交互按官方 c3r 机制 + 稳定工程化：
     *  - 指针事件挂 window 且在 pointerdown 内**同步挂载**（无 effect 间隙），
     *    preventDefault 阻断文字选择
     *  - 位置走 posRef + 直写 DOM（拖拽零渲染依赖），previewIndex 仅跨档更新
     *  - 抓住偏移 / 拖拽阻尼 0.15s / 滚轮换档 / 端点标签 / 点击刻度选档
     */
    function PowerSlider({ efforts, value, onPick }) {
      const hitzoneRef = React.useRef(null)
      const fillRef = React.useRef(null)
      const knobRef = React.useRef(null)
      const grabRef = React.useRef(null)
      const dragRef = React.useRef(null)
      const posRef = React.useRef(stopPosition(Math.max(0, efforts.findIndex((effort) => effort.id === value)), efforts.length))
      const wheelRef = React.useRef({ accumulated: 0, lastTime: 0 })
      const [dragging, setDragging] = React.useState(false)
      const [previewIndex, setPreviewIndex] = React.useState(null)
      const [labels, setLabels] = React.useState(false)

      // 官方 16ms 启用：挂载后短暂延迟才开启位移过渡，开面板时旋钮就位不飞入
      const [armed, setArmed] = React.useState(false)
      React.useEffect(() => {
        const timer = setTimeout(() => setArmed(true), 16)
        return () => clearTimeout(timer)
      }, [])
      // 官方 MaxBurst：值到达最高档时 16 粒弹出
      const [burst, setBurst] = React.useState(false)
      React.useEffect(() => {
        if (efforts.length >= 3 && value === efforts[efforts.length - 1]?.id) {
          setBurst(true)
          const timer = setTimeout(() => setBurst(false), 650)
          return () => clearTimeout(timer)
        }
      }, [value, efforts])

      const count = efforts.length
      const activeIndex = Math.max(0, efforts.findIndex((effort) => effort.id === value))
      const shownIndex = dragging && previewIndex !== null ? previewIndex : activeIndex
      const fill = posRef.current
      const isMax = count >= 3 && value === efforts[count - 1]?.id
      const reducedMotion = typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches

      // 旋钮/填充位置直写 DOM；posRef 同步供渲染读取
      const applyPos = (pct) => {
        posRef.current = pct
        if (fillRef.current) fillRef.current.style.width = `calc(${pct}% + 14px)`
        if (knobRef.current) knobRef.current.style.left = `${pct}%`
      }

      // 提交值变化（选档/外部）后吸附到新档位（CSS 过渡补间这段距离）
      React.useEffect(() => {
        if (dragging) return
        const target = stopPosition(activeIndex, count)
        if (Math.abs(posRef.current - target) > 0.01) applyPos(target)
      }, [activeIndex, dragging, count])

      const onPointerDown = (event) => {
        if (count <= 1 || event.button !== 0) return
        // 官方同款：阻断文字选择启动（拖出滑条也不会选中文本）
        event.preventDefault()
        const rect = hitzoneRef.current.getBoundingClientRect()
        // 点击即跳：按下就把 thumb 移到指针位置，offset 归零让后续拖动直接跟随。
        // 旧写法记的是「点击点 - 当前 thumb」的抓取偏移，可它只在 pointermove 里
        // 生效，单击（按下即松开）永远不动，点两端时偏差最大。
        const raw = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
        const pct = raw * 100
        const index = Math.round(raw * (count - 1))
        grabRef.current = { start: rect.left, width: rect.width, offset: 0 }
        dragRef.current = { pct, index }
        setDragging(true)
        setPreviewIndex(index)
        applyPos(pct)
        // 官方 C3r=150：按住 150ms 后显示端点标签
        setTimeout(() => setLabels(true), 150)

        // window 监听在 pointerdown 内同步挂载（无 effect 间隙，不丢首帧）
        const move = (event) => {
          const grab = grabRef.current
          if (grab === null) return
          const raw = Math.min(1, Math.max(0, (event.clientX - grab.start - grab.offset) / grab.width))
          const pct = raw * 100
          dragRef.current = { pct, index: Math.round(raw * (count - 1)) }
          applyPos(pct)
          setPreviewIndex((current) => (current === dragRef.current.index ? current : dragRef.current.index))
        }
        const up = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          window.removeEventListener('pointercancel', up)
          setLabels(false)
          const committed = dragRef.current
          grabRef.current = null
          dragRef.current = null
          setDragging(false)
          if (committed !== null) {
            const effort = efforts[committed.index]
            if (effort && effort.id !== value) onPick(effort.id)
          }
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        window.addEventListener('pointercancel', up)
      }
      // 官方滚轮换档：累积 ±30px 触发一步，方向反转或 160ms 停顿即重置
      const onWheel = (event) => {
        if (event.ctrlKey || count <= 1) return
        event.preventDefault()
        event.stopPropagation()
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : -event.deltaY
        if ('webkitDirectionInvertedFromDevice' in event && event.webkitDirectionInvertedFromDevice === true) delta *= -1
        const step = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? delta : Math.sign(delta) * 30
        if (step === 0) return
        const wheel = wheelRef.current
        if (event.timeStamp - wheel.lastTime > 160 || Math.sign(step) !== Math.sign(wheel.accumulated)) wheel.accumulated = 0
        wheel.lastTime = event.timeStamp
        wheel.accumulated += step
        if (Math.abs(wheel.accumulated) < 30) return
        const direction = Math.sign(wheel.accumulated)
        wheel.accumulated -= direction * 30
        const next = Math.max(0, Math.min(shownIndex + direction, count - 1))
        if (next === shownIndex) { wheel.accumulated = 0; return }
        const effort = efforts[next]
        if (effort && effort.id !== value) onPick(effort.id)
      }
      const onKeyDown = (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          event.preventDefault()
          const effort = efforts[Math.max(0, activeIndex - 1)]
          if (effort && effort.id !== value) onPick(effort.id)
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          event.preventDefault()
          const effort = efforts[Math.min(count - 1, activeIndex + 1)]
          if (effort && effort.id !== value) onPick(effort.id)
        }
      }

      return h('div', { className: 'dsh-power-slider' },
        h('div', {
          ref: hitzoneRef,
          className: 'dsh-power-hitzone',
          role: 'slider',
          tabIndex: 0,
          'aria-label': '推理强度',
          'aria-valuemin': 0,
          'aria-valuemax': Math.max(0, count - 1),
          'aria-valuenow': activeIndex,
          'aria-valuetext': efforts[activeIndex]?.name ?? '',
          'data-live': dragging ? 'true' : 'false',
          'data-armed': armed ? 'true' : 'false',
          'data-burst': burst ? 'true' : 'false',
          onPointerDown,
          onWheel,
          onKeyDown,
        },
          // 官方结构：Track 只含填充（overflow hidden 负责圆角裁剪）+ 官方
          // 粒子层；TickRail、Thumb、Burst 在 Root 层——28px 旋钮不被裁剪
          h('div', { className: 'dsh-power-track' },
            // 官方填充延伸到旋钮中心 + 半旋钮宽（clip 公式 - D3r/2）；MAX 时紫蓝渐变
            h('div', {
              ref: fillRef,
              className: 'dsh-power-fill',
              style: { width: `calc(${fill}% + 14px)` },
              'data-max': isMax ? 'true' : 'false',
            },
              // 官方形态：穿梭圆点常显（静止截图亦有），拖拽时随 fast-mode 加速
              h(FastTrackParticles, { percent: fill }),
              isMax && h(MaxFill, { active: true, reducedMotion }),
            ),
          ),
          // 官方 TickRail：刻度点是透明的 ExplicitOption 按钮（官方点击选档机制），
          // data-selected 官方配色
          count > 2 && efforts.map((effort, index) => (
            index !== 0 && index !== count - 1
              ? h('button', {
                key: `tick-${effort.id ?? index}`,
                type: 'button',
                className: 'dsh-power-tick',
                'data-selected': index === shownIndex ? 'true' : 'false',
                'aria-label': effort.name ?? effort.id,
                style: { left: `${stopPosition(index, count)}%` },
                onClick: () => onPick(effort.id),
              })
              : null
          )),
          burst && h('span', { className: 'dsh-power-burst-host', style: { left: `${fill}%` } }, h(Burst)),
          h('div', { ref: knobRef, className: 'dsh-power-knob', style: { left: `${fill}%` } }),
          // 官方端点标签：交互 150ms 后显示首末档位名（areEndpointLabelsVisible）
          labels && count > 1 && h('div', { className: 'dsh-power-endlabels', 'aria-hidden': true },
            h('span', null, efforts[0]?.name ?? ''),
            h('span', null, efforts[count - 1]?.name ?? ''),
          ),
        ),
      )
    }

    /* ---------------------------------------------------------------- */
    /* 面板                                                              */
    /* ---------------------------------------------------------------- */

    /** 官方 ContextMeter 图例三色（provider 组轮换）：neutral-bluish / 紫 / blue */
    const GROUP_TINTS = [
      'var(--dsw-static-neutral-bluish-400, #8b93a7)',
      '#a78bfa',
      'var(--dsw-static-blue-450, #4d6bfe)',
    ]
    const tintOf = (index) => GROUP_TINTS[index % GROUP_TINTS.length]

    function PickerPanel({ store, select, load, onClose }) {
      const state = React.useSyncExternalStore(
        (fn) => store.subscribe(fn),
        () => store.getSnapshot(),
      )
      const { groups, current, model, reasoning } = readState(state)
      const efforts = Array.isArray(reasoning?.efforts) ? reasoning.efforts : []
      const storeEffort = current?.reasoningEffort ?? reasoning?.defaultEffort

      // 乐观值钉住：选档立即显示；select 在途/回滚期间 store 会先后发出
      // pending、旧值、新值等中间快照，显示值不被它们翻转——这是「滑杆
      // 自行跳动」的根因。store 追上乐观值即解除；失败或超时回弹。
      const [optimisticEffort, setOptimisticEffort] = React.useState(null)
      const shownEffort = optimisticEffort !== null && efforts.some((e) => e.id === optimisticEffort)
        ? optimisticEffort
        : storeEffort
      React.useEffect(() => {
        if (optimisticEffort === null) return undefined
        if (current?.reasoningEffort === optimisticEffort) {
          setOptimisticEffort(null)
          return undefined
        }
        const timer = setTimeout(() => setOptimisticEffort(null), 5000)
        return () => clearTimeout(timer)
      }, [current?.reasoningEffort, optimisticEffort])

      // Codex 同款：点卡片上方的模型名展开模型列表选其他模型。
      const [pane, setPane] = React.useState('root')

      // 价格标记：dsh-cost 的档价（flash/pro，峰谷感知）+ 当前模型基准 → 每行 ×N。
      // 10 分钟缓存；cross-module 数据走 cost 的 /prices 端点，取不到就不显示。
      const [priceIndex, setPriceIndex] = React.useState(priceCache?.data ?? null)
      React.useEffect(() => {
        let alive = true
        void loadPrices().then((data) => { if (data && alive) setPriceIndex(data) })
        return () => { alive = false }
      }, [])

      const failure = state?.error ?? null

      const pickModel = (provider, modelId) => {
        // 换模型保留当前档位——目标模型不支持就回落到它的默认档。
        const keep = shownEffort !== undefined
          && efforts.some((effort) => effort.id === shownEffort)
        const selection = {
          provider,
          model: modelId,
          ...(keep ? { reasoningEffort: shownEffort } : {}),
        }
        // select 返回 RemoteResult：失败时面板留住（store 会进 error 态），
        // 成功才收起。无条件关面板会让失败看起来像「点了立刻消失」。
        Promise.resolve(select(selection)).then((result) => {
          if (result && result.ok === false) {
            report('select-rejected', {
              provider: selection.provider,
              model: selection.model,
              result: JSON.stringify(result).slice(0, 300),
            })
          } else {
            onClose()
          }
        }).catch((err) => {
          report('select-error', { message: String(err?.message ?? err) })
        })
      }

      const pickEffort = (effortId) => {
        if (!current || effortId === shownEffort) return
        setOptimisticEffort(effortId)
        Promise.resolve(select({
          provider: current.provider,
          model: current.model,
          reasoningEffort: effortId,
        })).then((result) => {
          if (result && result.ok === false) {
            setOptimisticEffort(null)
            report('select-rejected', { effort: effortId, result: JSON.stringify(result).slice(0, 300) })
          }
          // 成功：store 追上后由 effect 解除钉住；异常快照期间显示值不动。
        }).catch((err) => {
          setOptimisticEffort(null)
          report('select-error', { message: String(err?.message ?? err) })
        })
      }

      // Codex 实测：大标题 = 当前推理强度名（非顶档实色蓝，顶档 "Ultra" 紫渐变）；
      // 副标题 = 模型名 ›（点击展开模型列表）
      const title = efforts.find((effort) => effort.id === shownEffort)?.name ?? '推理强度'
      const shownIndex = efforts.findIndex((effort) => effort.id === shownEffort)
      const topEffort = efforts.length >= 3 && shownIndex === efforts.length - 1
      const modelName = model?.name ?? current?.model ?? ''

      return h('div', { className: 'dsh-power-panel', role: 'dialog', 'aria-label': '模型与推理强度' },
        h('div', { className: 'dsh-power-header' },
          h('div', { style: { minWidth: 0, width: '100%' } },
            h('span', {
              className: topEffort ? 'dsh-power-title' : 'dsh-power-title dsh-power-title-solid',
            }, title),
            h('button', {
              type: 'button',
              className: 'dsh-power-subtitle-btn',
              title: '选择其他模型',
              onClick: () => setPane((value) => (value === 'models' ? 'root' : 'models')),
            },
              h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                modelName || current?.provider || '选择模型'),
              h('span', { className: 'dsh-power-subtitle-caret' }, '›'),
            ),
          ),
          h('button', {
            type: 'button',
            className: 'dsh-power-refresh',
            title: '重新加载模型目录',
            'aria-label': '重新加载模型目录',
            onClick: () => load(),
          }, '↻'),
        ),
        failure && h('div', { className: 'dsh-power-state' },
          String(failure?.message ?? failure ?? '选择失败'),
          h('div', null,
            h('button', { type: 'button', className: 'dsh-power-retry', onClick: () => load() }, '重试')),
        ),
        pane === 'models'
          ? h('div', { key: 'models', className: 'dsh-power-pane' },
              h('button', {
                type: 'button',
                className: 'dsh-power-back-row',
                onClick: () => setPane('root'),
              }, '‹ 返回'),
              h('div', { className: 'dsh-power-models-heading' }, '选择模型'),
              (!groups.length)
                ? h('div', { className: 'dsh-power-state' }, '正在加载模型…')
                : h('div', { className: 'dsh-power-model-list' },
                    groups.map((group, groupIndex) => h('div', { key: group.id },
                      group.name && group.name !== group.id
                        ? h('div', { className: 'dsh-power-group-label' }, group.name)
                        : null,
                      (Array.isArray(group.models) ? group.models : []).map((entry) => {
                        const isCurrent = current
                          && group.id === current.provider
                          && entry.id === current.model
                        // 相对当前模型的价格倍数：×1 不显示，>1 暖色提醒切贵
                        let priceBadge = null
                        const rowPrice = priceOf(priceIndex, entry.id)
                        const basePrice = priceOf(priceIndex, current?.model)
                        if (rowPrice && basePrice) {
                          const ratio = rowPrice / basePrice
                          if (ratio >= 1.05) priceBadge = { text: `×${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}`, tone: 'warm' }
                          else if (ratio <= 0.95) priceBadge = { text: `×${ratio.toFixed(1)}`, tone: 'cool' }
                        }
                        return h('button', {
                          key: `${group.id}:${entry.id}`,
                          type: 'button',
                          className: 'dsh-power-model-row',
                          'data-current': isCurrent ? 'true' : 'false',
                          onClick: () => !isCurrent && pickModel(group.id, entry.id),
                        },
                          h('span', {
                            className: 'dsh-power-swatch',
                            style: { '--meter-tint': tintOf(groupIndex) },
                          }),
                          h('span', { className: 'dsh-power-model-name' }, entry.name ?? entry.id),
                          priceBadge
                            ? h('span', {
                              className: 'dsh-power-model-price',
                              'data-tone': priceBadge.tone,
                              title: `输出价约为当前模型的 ${priceBadge.text}`,
                            }, priceBadge.text)
                            : null,
                          h('span', { className: 'dsh-power-model-check' }, '✓'),
                        )
                      }),
                    )),
                  ),
            )
          : h('div', { key: 'root', className: 'dsh-power-pane' },
        efforts.length > 0 && h('div', { className: 'dsh-power-slider-section' },
          h('div', { className: 'dsh-power-slider-caption' }, '选择推理强度'),
          h(PowerSlider, {
            efforts,
            value: shownEffort,
            onPick: pickEffort,
          }),
        ),
            ),
      )
    }

    /* ---------------------------------------------------------------- */
    /* 座位组件                                                           */
    /* ---------------------------------------------------------------- */

    /** 崩溃兜底：只包面板内容，座位按钮永远存活，出错时上报。 */
    class QuietBoundary extends React.Component {
      constructor(props) { super(props); this.state = { failed: false } }
      static getDerivedStateFromError(error) {
        report('crash', { message: String(error?.message ?? error) })
        return { failed: true }
      }
      render() { return this.state.failed ? null : this.props.children }
    }

    /**
     * 外点关闭：只在面板开启时挂监听（open 进依赖），点击落在座位或
     * 面板内部不关闭。capture 阶段先于按钮 onClick，开面板的那次点击
     * 时监听还没挂，不会自吞。
     */
    function useDismiss(seatRef, panelRef, open, onClose) {
      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const target = event.target instanceof Element ? event.target : null
          if (target && (seatRef.current?.contains(target) || panelRef.current?.contains(target))) return
          onClose()
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') onClose()
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [seatRef, panelRef, open, onClose])
    }

    /**
     * 座位组件（唯一入口，Codex 同位：输入栏右下角模型控件，面板从其
     * 上方弹出、右对齐）。props 契约与内置 ModelSelect 一致：
     * { locked }（owner）+ { available, directory, load, select }（inject 脸，
     * 其中 directory 是 SnapshotStore）。
     */
    function PowerPicker({ locked, available, directory, load, select }) {
      const [open, setOpen] = React.useState(false)
      const seatRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const close = React.useCallback(() => setOpen(false), [])
      useDismiss(seatRef, panelRef, open, close)

      // 入口挂载证据。
      React.useEffect(() => {
        report('seat-mounted', { available: available !== false, hasDirectory: !!directory })
      }, [])

      // 目录可能为 null（inject 降级）：订阅必须做成空安全，hook 顺序保持不变。
      const state = React.useSyncExternalStore(
        (fn) => (directory && typeof directory.subscribe === 'function' ? directory.subscribe(fn) : () => {}),
        () => (directory && typeof directory.getSnapshot === 'function' ? directory.getSnapshot() : null),
      )
      const { current, model, reasoning } = readState(state)
      const efforts = Array.isArray(reasoning?.efforts) ? reasoning.efforts : []
      const effectiveEffort = current?.reasoningEffort ?? reasoning?.defaultEffort
      const effortName = efforts.find((effort) => effort.id === effectiveEffort)?.name
      const modelName = model?.name ?? current?.model
      const caption = modelName
        ? (effortName ? `${modelName} · ${effortName}` : modelName)
        : '选择推理强度'

      // 面板与入口按钮居中对齐（Codex：卡片中线对准触发钮），越界时钳回视口
      React.useLayoutEffect(() => {
        if (!open) return
        const panel = panelRef.current
        const seat = seatRef.current
        if (!panel || !seat) return
        const rect = seat.getBoundingClientRect()
        const width = panel.offsetWidth || 300
        const centered = rect.left + rect.width / 2 - width / 2
        panel.style.left = `${Math.max(8, Math.min(centered, window.innerWidth - width - 8))}px`
        panel.style.top = `${Math.max(8, rect.top - panel.offsetHeight - 8)}px`
      }, [open])

      if (!available || !directory) return null
      return h('div', { ref: seatRef, style: { display: 'inline-flex', position: 'relative' } },
        h('button', {
          type: 'button',
          className: 'dsh-power-seat',
          'data-open': open ? 'true' : 'false',
          disabled: !!locked,
          'aria-haspopup': 'dialog',
          'aria-expanded': open ? 'true' : 'false',
          title: '选择模型与推理强度',
          onClick: () => {
            report(open ? 'close' : 'open', {})
            if (!open) { try { load() } catch { /* ignore */ } }
            setOpen((value) => !value)
          },
        },
          h('span', { className: 'dsh-power-seat-label' }, caption),
          h('span', { className: 'dsh-power-seat-caret' }, '▾'),
        ),
        // 面板 portal 到 body（react-dom 的 createPortal，内置选择器同款）：
        // 输入栏祖先链的 transform/overflow 会把 fixed 面板裁没。加载器
        // 给不了 react-dom 时退回原地渲染并上报。崩溃兜底只包面板——按钮永远活着。
        open && (() => {
          const panel = h('div', {
            ref: panelRef,
            className: 'dsh-power-host',
            style: { left: -9999, top: -9999 },
          },
            h(QuietBoundary, null, h(PickerPanel, { store: directory, select, load, onClose: close })))
          return createPortal ? createPortal(panel, document.body) : panel
        })(),
      )
    }

    /* ---------------------------------------------------------------- */
    /* 注册                                                              */
    /* ---------------------------------------------------------------- */

    return {
      // modelDirectories 的服务链要求调用方也声明 sessions/remote/remote.session
      // （ModelDirectoryResolver static inject；缺了 cordis 会以
      // "cannot get property remote.session without inject" 拒绝目录解析）。
      inject: ['slots', 'sessions', 'remote', 'remote.session', 'modelDirectories'],
      apply(ctx) {
        ensureStyle()
        report('boot', {
          services: {
            slots: typeof ctx.slots,
            modelDirectories: typeof ctx.modelDirectories,
            sessions: typeof ctx.sessions,
            remote: typeof ctx.remote,
          },
          portal: createPortal ? 'react-dom' : 'inline-fallback',
        })
        console.info(`[dsh-power-picker] client ${VERSION} loading`)

        // 可选注入：服务齐了才注册；缺服务时内置选择器原样保留。
        ctx.inject(['slots', 'sessions', 'remote', 'remote.session', 'modelDirectories'], (scope) => {
          const gate = Promise.race([
            fetch(`${ENDPOINT}/settings`)
              .then((res) => (res.ok ? res.json() : { enabled: true, composerSeat: false }))
              .catch(() => ({ enabled: true, composerSeat: false })),
            new Promise((resolve) => setTimeout(() => resolve({ enabled: true, composerSeat: false }), 2500)),
          ])

          gate.then(({ enabled, composerSeat }) => {
            if (enabled === false) {
              report('skip-disabled', {})
              return
            }
            // 两个入口共用同一张 inject 脸（契约同内置 ModelSelect）。
            const faceFor = (sessionId) => {
              try {
                const directory = scope.modelDirectories.directoryFor(sessionId)
                const available = scope.sessions.subagentAddress(sessionId) === undefined
                report('inject', { available, sessionId: String(sessionId) })
                return {
                  available,
                  // rc.3 契约：组件拿到的是 store（subscribe/getSnapshot 在它身上）。
                  directory: directory.store,
                  load: () => {
                    if (available) directory.load?.()?.catch?.(() => {})
                  },
                  select: (selection) => (available
                    ? directory.select(selection)
                    : Promise.resolve(undefined)),
                }
              } catch (err) {
                report('inject-error', { message: String(err?.message ?? err) })
                return {
                  available: false,
                  directory: null,
                  load: () => {},
                  select: () => Promise.resolve(undefined),
                }
              }
            }

            // Codex 实测形态：唯一入口 = 输入栏右下角的模型座位（发送键旁），
            // 面板从其上方弹出、右对齐。composerSeat=false 时不渲染入口。
            scope.slots.inject('conversation.input.model', () => scope.slots.register({
              name: 'conversation.input.model',
              id: 'power-picker',
              priority: SHADOW_PRIORITY,
              inject: faceFor,
            }, composerSeat
              ? (props) => h(QuietBoundary, null, h(PowerPicker, props))
              : () => null))
            report('register', { priority: SHADOW_PRIORITY, composerSeat: !!composerSeat })
          }).catch((err) => report('gate-error', { message: String(err?.message ?? err) }))
        })
      },
    }
}

/* 由 scripts/build-suite.mjs 从 dsh-prompt-enhancer/client.js 机械生成；勿手改。 */
/**
 * dsh-prompt-enhancer 的 web 客户端部分。
 *
 * 交付形态遵循 dsh 的客户端插件协议：一个 ESM 文件，调用
 * `window.__ModuleLoader__.load({ id, factory(require) })`，返回 cordis 插件对象。
 *
 * 做三件事：
 *   1. 输入框左侧 Sparkle 按钮：点一下手动增强当前草稿。
 *   2. 同一个按钮上悬浮静置：向上弹出强度滑块（Low / High / Max）+ 发送时自动增强开关。
 *   3. 发送拦截：自动增强开启时，点发送按钮或按 Enter 不会立刻发出，而是先把
 *      草稿送去增强、期间发送按钮显示三点旋转，拿到结果后写回草稿再 submit()。
 *
 * 拦截策略是捕获阶段监听（document capture），拿到事件后阻止它到达 React
 * 的事件根，避免 dsh 自己的 onClick 先触发。
 *
 * 定位方式：`[data-composer-dock]` 只是输入区底部那条 dock，编辑器和发送按钮
 * 都在它的**兄弟节点**里，所以容器要取 dock 的 parentElement，再按 aria-label
 * 语义（send / 发送 / 排队 / steer）找发送按钮。任何一步失败都直接放行原消息，
 * 绝不卡住发送。
 */

function createEnhancerClient(require) {
    const React = require('react')
    const { Button, IconSparkleRegular, IconLoadingOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const ENDPOINT = '/api/prompt-enhancer'
    // 滑块只有三档；服务端仍认 off（配置层关闭用），但前端不再暴露。
    const LEVELS = ['low', 'high', 'max']
    const STORAGE_KEY = 'dsh-prompt-enhancer:settings'
    // 改默认值时抬版本号，旧数据直接丢弃，避免老用户卡在旧默认上。
    const STORAGE_VERSION = 3
    const STYLE_ID = 'dsh-prompt-enhancer-style'

    const LEVEL_META = {
      low: { label: 'Low', grad: 'linear-gradient(90deg,#3a83f7,#4f8ef9)' },
      high: { label: 'High', grad: 'linear-gradient(90deg,#4f8ef9,#6366f1)' },
      max: { label: 'Max', grad: 'linear-gradient(90deg,#8b5cf6,#6366f1 45%,#3a83f7)' },
    }

    // 填充区里从右往左流动的小点。delay 错开形成连续的光流，
    // size 不同是照抄 dsh 那个面板的观感：点大小不齐才不像机器画的。
    const SPARKS = [
      { delay: 0, size: 3, top: 30 },
      { delay: 0.22, size: 2, top: 62 },
      { delay: 0.45, size: 4, top: 42 },
      { delay: 0.68, size: 2, top: 70 },
      { delay: 0.9, size: 3, top: 26 },
      { delay: 1.13, size: 2, top: 58 },
      { delay: 1.35, size: 4, top: 36 },
      { delay: 1.58, size: 3, top: 66 },
    ]
    const SPARK_COUNT = { low: 3, high: 5, max: 8 }

    const PANEL_W = 240
    const PANEL_H = 178
    const HOVER_DELAY = 1500
    const CLOSE_DELAY = 260
    const EXIT_MS = 130

    /* ---------------------------------------------------------------- */
    /* 跨组件共享的设置（面板和拦截器都要读）                              */
    /* ---------------------------------------------------------------- */

    const settings = (() => {
      const fallback = { level: 'high', autoSend: false, useContext: false }
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return fallback
        const parsed = JSON.parse(raw)
        if (parsed?.v !== STORAGE_VERSION) return fallback
        return {
          // 旧版本存过 off，迁移成 high。
          level: LEVELS.includes(parsed?.level) ? parsed.level : fallback.level,
          autoSend: typeof parsed?.autoSend === 'boolean' ? parsed.autoSend : fallback.autoSend,
          useContext: typeof parsed?.useContext === 'boolean' ? parsed.useContext : fallback.useContext,
        }
      } catch {
        return fallback
      }
    })()

    const settingsListeners = new Set()

    function subscribeSettings(fn) {
      settingsListeners.add(fn)
      return () => { settingsListeners.delete(fn) }
    }

    function notifySettings() {
      for (const fn of settingsListeners) {
        try { fn({ ...settings }) } catch { /* ignore */ }
      }
    }

    function updateSettings(patch) {
      Object.assign(settings, patch)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, v: STORAGE_VERSION })) } catch { /* ignore */ }
      notifySettings()
      // 同步给服务端：pre-step 兜底增强要用同一档位，上下文开关同源。
      if (patch.level !== undefined || patch.useContext !== undefined) {
        fetch(`${ENDPOINT}/settings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ level: settings.level, useContext: settings.useContext }),
        }).catch(() => { /* 端点不可达时不影响前端增强 */ })
      }
    }

    /* ---------------------------------------------------------------- */
    /* 样式                                                              */
    /* ---------------------------------------------------------------- */

    function ensureStyle() {
      if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = `
@keyframes dsh-pe-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes dsh-pe-dots{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}

/* 发送按钮上的三点旋转：盖住原图标，用三个圆点绕中心转 */
button[data-dsh-pe-busy]{position:relative!important}
button[data-dsh-pe-busy]>*{opacity:0!important}
button[data-dsh-pe-busy]::after{
  content:'';position:absolute;inset:0;margin:auto;width:14px;height:14px;
  background:
    radial-gradient(circle 1.7px at 7px 2px,currentColor 100%,transparent 0),
    radial-gradient(circle 1.7px at 11.3px 9.5px,currentColor 100%,transparent 0),
    radial-gradient(circle 1.7px at 2.7px 9.5px,currentColor 100%,transparent 0);
  animation:dsh-pe-dots .85s linear infinite;
  transform-origin:center;
}

.dsh-pe-panel{
  position:fixed;z-index:9999;width:240px;padding:14px 16px 12px;
  border-radius:10px;border:1px solid rgba(255,255,255,.10);
  background:#262626;color:#e8e8e8;
  box-shadow:0 12px 32px rgba(0,0,0,.42),0 2px 6px rgba(0,0,0,.28);
  font-size:11px;line-height:1.45;
  user-select:none;
  /* 从按钮一侧「长出来」：底部中心为原点缩放，配合快出慢收的缓动 */
  transform-origin:50% 100%;
  animation:dsh-pe-pop .18s cubic-bezier(.16,1,.3,1) both;
  will-change:transform,opacity;
}
.dsh-pe-panel[data-closing="true"]{
  animation:dsh-pe-unpop .13s cubic-bezier(.4,0,.7,.2) both;
}
@keyframes dsh-pe-pop{
  from{opacity:0;transform:scale(.82) translateY(10px)}
  60%{opacity:1}
  to{opacity:1;transform:scale(1) translateY(0)}
}
@keyframes dsh-pe-unpop{
  from{opacity:1;transform:scale(1) translateY(0)}
  to{opacity:0;transform:scale(.92) translateY(5px)}
}
.dsh-pe-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px}
.dsh-pe-title{font-size:11px;color:rgba(255,255,255,.55);letter-spacing:.02em}
.dsh-pe-value{font-size:15px;font-weight:500;color:#fff;letter-spacing:.01em}
.dsh-pe-track{position:relative;height:32px;display:flex;align-items:center;cursor:pointer;touch-action:none}
.dsh-pe-rail{
  /* 规格对齐 power-picker：28px 高、14px 圆角，两端缩进等于手柄半径 */
  position:absolute;left:14px;right:14px;height:28px;border-radius:14px;
  background:rgba(255,255,255,.10);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.05);
}
.dsh-pe-fill{
  position:absolute;left:14px;top:50%;height:28px;border-radius:14px 0 0 14px;
  transform:translateY(-50%);overflow:hidden;
  transition:width .18s cubic-bezier(.4,0,.2,1),background .2s ease;
}
.dsh-pe-spark{
  position:absolute;border-radius:50%;background:rgba(255,255,255,.88);
  animation:dsh-pe-flow 1.8s linear infinite;
}
/* 小点从右往左流动，像能量被吸进手柄，不是原地闪。 */
@keyframes dsh-pe-flow{
  from{left:100%;opacity:0}
  10%{opacity:.85}
  85%{opacity:.85}
  to{left:-6px;opacity:0}
}
.dsh-pe-tick{
  position:absolute;top:50%;width:3px;height:3px;border-radius:50%;
  background:rgba(255,255,255,.28);transform:translate(-50%,-50%);pointer-events:none;
}
.dsh-pe-knob{
  position:absolute;top:50%;width:28px;height:28px;border-radius:50%;
  background:#fff;
  border:0.5px solid rgba(255,255,255,.25);
  box-shadow:0 0 2px rgba(0,0,0,.1);
  transform:translate(-50%,-50%) scale(1);
  transition:left .18s cubic-bezier(.4,0,.2,1),transform .12s ease;
  pointer-events:none;
}
.dsh-pe-track:hover .dsh-pe-knob{transform:translate(-50%,-50%) scale(1.06)}
.dsh-pe-knob[data-dragging="true"]{
  transition:left 0s,transform .12s ease;
  transform:translate(-50%,-50%) scale(1.12);
}
.dsh-pe-legend{display:flex;justify-content:space-between;margin-top:10px;padding:0 10px}
.dsh-pe-legend span{font-size:11px;color:rgba(255,255,255,.36);cursor:pointer;transition:color .15s}
.dsh-pe-legend span[data-active="true"]{color:#fff;font-weight:500}
.dsh-pe-legend span:hover{color:rgba(255,255,255,.75)}
.dsh-pe-sep{height:1px;margin:13px 0 9px;background:rgba(255,255,255,.08)}
.dsh-pe-row{
  display:flex;align-items:center;justify-content:space-between;cursor:pointer;
  padding:4px 6px;margin:0 -6px;border-radius:6px;
  transition:background .14s ease;
}
.dsh-pe-row:hover{background:rgba(255,255,255,.06)}
.dsh-pe-row:hover .dsh-pe-row-label{color:#fff}
.dsh-pe-row-label{font-size:11px;color:rgba(255,255,255,.80);transition:color .14s ease}
.dsh-pe-switch{
  position:relative;width:28px;height:16px;border-radius:8px;
  background:rgba(255,255,255,.14);transition:background .18s;
}
.dsh-pe-switch[data-on="true"]{background:#22c55e}
.dsh-pe-switch::after{
  content:'';position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;
  background:#fff;transition:transform .18s cubic-bezier(.4,0,.2,1);
}
.dsh-pe-switch[data-on="true"]::after{transform:translateX(12px)}
`
      document.head.appendChild(style)
    }

    /* ---------------------------------------------------------------- */
    /* 网络                                                              */
    /* ---------------------------------------------------------------- */

    async function enhance(text, level, sessionId) {
      const res = await fetch(`${ENDPOINT}/rewrite`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, level, sessionId }),
      })
      if (!res.ok) throw new Error(`prompt-enhancer rewrite ${res.status}`)
      const data = await res.json()
      return typeof data?.text === 'string' ? data.text : ''
    }

    /** 把拦截决策写进宿主的排查日志，出问题时直接看 ~/.dsh/prompt-enhancer-debug.log。 */
    function report(payload) {
      try {
        fetch(`${ENDPOINT}/debug`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => { /* ignore */ })
      } catch { /* ignore */ }
    }

    /* ---------------------------------------------------------------- */
    /* 发送拦截                                                          */
    /* ---------------------------------------------------------------- */

    /** 当前会话的输入动作与草稿，由挂载的组件持续写入。 */
    const live = { actions: null, draft: '' }

    /**
     * 输入区根节点。
     * `[data-composer-dock]` 只是底部那条 dock（ContextMeter 之类），
     * 编辑器和发送按钮都在它的**兄弟节点** css.composer 里，
     * 所以容器要取 dock 的父元素，否则一个按钮都找不到。
     */
    function composerRoot() {
      const dock = document.querySelector('[data-composer-dock]')
      return dock && dock.parentElement ? dock.parentElement : null
    }

    /** 发送按钮 = 输入区里最后一个 aria-label 语义为「发送」的可见按钮。 */
    function findSendButton() {
      // 优先在输入区里找；输入区认不出来就全局找，不把成败绑在某个容器的层级上。
      const scopes = []
      const root = composerRoot()
      if (root) scopes.push(root)
      scopes.push(document)

      for (const scope of scopes) {
        const buttons = scope.querySelectorAll('button[aria-label]')
        for (let i = buttons.length - 1; i >= 0; i--) {
          const btn = buttons[i]
          if (btn.disabled) continue
          if (btn.offsetParent === null) continue
          const label = (btn.getAttribute('aria-label') || '').toLowerCase()
          if (label.includes('send') || label.includes('发送') || label.includes('排队') || label.includes('steer')) {
            return btn
          }
        }
      }
      return null
    }

    function inComposer(node) {
      if (!node || !node.closest) return false
      // 编辑器本身是 contenteditable，直接认它，不用往上找容器。
      if (node.closest('[contenteditable="true"]')) return true
      const root = composerRoot()
      return !!(root && root.contains(node))
    }

    let intercepting = false

    function shouldIntercept() {
      return settings.autoSend && settings.level !== 'off' && !intercepting && live.actions !== null
    }

    /** 增强结果写回草稿后停留多久再自动发送。太短用户看不见变化，像直接发原文。 */
    const REVEAL_MS = 700

    async function enhanceThenSend(button) {
      if (intercepting) return
      const raw = live.draft.trim()
      const actions = live.actions
      if (!actions) return

      // 空草稿（纯附件发送）或斜杠命令：不增强，直接放行原始发送。
      if (raw.length === 0 || raw.startsWith('/')) {
        actions.submit()
        return
      }

      intercepting = true
      if (button) button.setAttribute('data-dsh-pe-busy', '1')
      try {
        const enhanced = await enhance(raw, settings.level)
        if (enhanced.length > 0 && enhanced !== raw) {
          actions.setDraft(enhanced)
          // 先把增强结果摆进输入框让用户看见，停一下再发出去。
          await new Promise((r) => setTimeout(r, REVEAL_MS))
        }
      } catch (err) {
        // 增强失败就按原文发，不能让用户卡在输入框里。
        console.error('[dsh-prompt-enhancer] enhance failed, sending original', err)
      }
      if (button) button.removeAttribute('data-dsh-pe-busy')
      // 提交前一直占着锁，避免 700ms 里重复点击触发第二次增强。
      intercepting = false
      actions.submit()
    }

    function onClickCapture(e) {
      if (!(e.target instanceof Node)) return
      const hit = e.target.closest ? e.target.closest('button') : null
      const hitLabel = hit ? (hit.getAttribute('aria-label') || '') : ''
      const looksLikeSend = /send|发送|排队|steer/i.test(hitLabel)

      if (!shouldIntercept()) {
        // 只记录「像发送按钮」的点击，避免刷屏。
        if (looksLikeSend) {
          report({
            phase: 'skip',
            label: hitLabel,
            autoSend: settings.autoSend,
            level: settings.level,
            hasActions: live.actions !== null,
            intercepting,
          })
        }
        return
      }

      const btn = findSendButton()
      if (!btn || !btn.contains(e.target)) {
        if (looksLikeSend) {
          report({ phase: 'no-target', label: hitLabel, found: btn ? btn.getAttribute('aria-label') : null })
        }
        return
      }

      // 正常拦截不记日志，只有出问题的分支才写，避免日志无限增长。
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      void enhanceThenSend(btn)
    }

    function onKeyDownCapture(e) {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      // 中文输入法组合中的回车是在选词，不是发送。
      if (e.isComposing || e.keyCode === 229) return
      if (!inComposer(e.target)) return
      if (!shouldIntercept()) return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      void enhanceThenSend(findSendButton())
    }

    let listening = false
    function installInterceptors() {
      if (listening || typeof document === 'undefined') return
      listening = true
      document.addEventListener('click', onClickCapture, true)
      document.addEventListener('keydown', onKeyDownCapture, true)
      syncFromServer()
    }

    /** 本机没存过设置时，沿用服务端配置的档位，避免刷新后跳回默认值。 */
    function syncFromServer() {
      try {
        if (localStorage.getItem(STORAGE_KEY)) return
      } catch { /* ignore */ }
      fetch(`${ENDPOINT}/settings`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data || !LEVELS.includes(data.level)) return
          settings.level = data.level
          notifySettings()
        })
        .catch(() => { /* 端点不可达就用本地默认 */ })
    }

    /* ---------------------------------------------------------------- */
    /* 组件：强度面板（纯展示）                                            */
    /* ---------------------------------------------------------------- */

    const LEVEL_DESC = {
      low: '只修歧义和冗余，不动结构',
      high: '补全目标与约束，保留原意',
      max: '第一性原理重构，假设逐条标注',
    }

    function LevelPanel({ level, autoSend, useContext, dragging, trackRef, onPick, onDragEnd, onChangeLevel, onToggleAuto, onToggleContext }) {
      const index = Math.max(0, LEVELS.indexOf(level))
      const pct = (index / (LEVELS.length - 1)) * 100
      const meta = LEVEL_META[level] ?? LEVEL_META.high
      // 轨道左右各留 12px 给手柄半径，手柄不会压在轨道圆角外。
      const knobLeft = `calc(${pct}% + ${(12 - pct * 0.24).toFixed(2)}px)`
      const fillWidth = `calc(${pct}% - ${(pct * 0.28).toFixed(2)}px)`
      const tickLeft = (i) => {
        const p = (i / (LEVELS.length - 1)) * 100
        return `calc(${p}% + ${(14 - p * 0.28).toFixed(2)}px)`
      }

      return h('div', null,
        h('div', { className: 'dsh-pe-head' },
          h('span', { className: 'dsh-pe-title' }, '增强强度'),
          h('span', { className: 'dsh-pe-value' }, meta.label),
        ),
        h('div', {
          className: 'dsh-pe-track',
          ref: trackRef,
          onPointerDown: (ev) => {
            ev.preventDefault()
            try { ev.currentTarget.setPointerCapture(ev.pointerId) } catch { /* ignore */ }
            onPick(ev.clientX, true)
          },
          onPointerMove: (ev) => { if (dragging) onPick(ev.clientX, false) },
          onPointerUp: (ev) => {
            try { ev.currentTarget.releasePointerCapture(ev.pointerId) } catch { /* ignore */ }
            onDragEnd()
          },
          onPointerCancel: onDragEnd,
        },
        h('div', { className: 'dsh-pe-rail' }),
        h('div', { className: 'dsh-pe-fill', style: { width: fillWidth, background: meta.grad } },
          ...SPARKS.slice(0, SPARK_COUNT[level] ?? 5).map((s, i) => h('i', {
            key: `spark-${i}`,
            className: 'dsh-pe-spark',
            style: {
              top: `${s.top}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              marginTop: `${-s.size / 2}px`,
              animationDelay: `${s.delay}s`,
            },
          })),
        ),
        ...LEVELS.map((lv, i) => h('div', {
          key: `tick-${lv}`,
          className: 'dsh-pe-tick',
          style: { left: tickLeft(i) },
        })),
        h('div', {
          className: 'dsh-pe-knob',
          'data-dragging': String(dragging),
          style: { left: knobLeft },
        }),
        ),
        h('div', { className: 'dsh-pe-legend' },
          ...LEVELS.map((lv) => h('span', {
            key: lv,
            'data-active': String(level === lv),
            title: LEVEL_DESC[lv],
            onClick: () => onChangeLevel(lv),
          }, LEVEL_META[lv].label)),
        ),
        h('div', { className: 'dsh-pe-sep' }),
        h('div', {
          className: 'dsh-pe-row',
          title: '开启后每条消息发送前自动增强（强度用上面的滑条调）',
          onClick: onToggleAuto,
        },
          h('span', { className: 'dsh-pe-row-label' }, '发送时自动增强'),
          h('span', { className: 'dsh-pe-switch', 'data-on': String(autoSend) }),
        ),
        h('div', {
          className: 'dsh-pe-row',
          title: '增强时结合最近一轮对话，消解「它 / 这个 / 上面提到的」等指代',
          onClick: onToggleContext,
        },
          h('span', { className: 'dsh-pe-row-label' }, '参考会话上下文'),
          h('span', { className: 'dsh-pe-switch', 'data-on': String(useContext) }),
        ),
      )
    }

    /* ---------------------------------------------------------------- */
    /* 组件：增强按钮 + 悬浮强度面板                                       */
    /* ---------------------------------------------------------------- */

    function EnhanceButton({ useInput, inputActions, sessionId }) {
      const draft = useInput((s) => s.draft)
      const [busy, setBusy] = React.useState(false)
      /** 增强后保留原文，草稿没被改动前可以一键撤销。 */
      const [undo, setUndo] = React.useState(null)
      /** 增强失败的可见反馈：按钮短暂变红 ✕ + title 带原因（console 无声等于没反应）。 */
      const [errFlash, setErrFlash] = React.useState(null)
      const [state, setState] = React.useState({ ...settings })
      const [open, setOpen] = React.useState(false)
      const [closing, setClosing] = React.useState(false)
      const [pos, setPos] = React.useState(null)
      const [dragging, setDragging] = React.useState(false)
      const anchorRef = React.useRef(null)
      const trackRef = React.useRef(null)
      const hoverTimer = React.useRef(null)
      const closeTimer = React.useRef(null)
      const exitTimer = React.useRef(null)

      const text = typeof draft === 'string' ? draft.trim() : ''
      const empty = text.length === 0

      // 把最新的草稿和动作暴露给发送拦截器。
      live.draft = typeof draft === 'string' ? draft : ''
      live.actions = inputActions ?? null

      React.useEffect(() => subscribeSettings(setState), [])
      React.useEffect(() => () => {
        clearTimeout(hoverTimer.current)
        clearTimeout(closeTimer.current)
        clearTimeout(exitTimer.current)
      }, [])

      // 撤销只在草稿被改动后失效。增强结果还留在输入框里就一直挂着，
      // 不设超时：用户可能看半天才决定要不要退回去。
      React.useEffect(() => {
        if (undo === null) return
        if (typeof draft !== 'string' || draft !== undo.enhanced) setUndo(null)
      }, [draft, undo])

      // 开始增强时，已经打开的面板立刻收起，别挡着看结果。
      React.useEffect(() => {
        if (busy) hide()
      }, [busy])

      // 失败提示挂 4 秒自动消退，恢复 ✨ 本貌。
      React.useEffect(() => {
        if (!errFlash) return undefined
        const timer = setTimeout(() => setErrFlash(null), 4000)
        return () => clearTimeout(timer)
      }, [errFlash])

      const place = () => {
        const el = anchorRef.current
        if (!el) return null
        const r = el.getBoundingClientRect()
        let left = r.left + r.width / 2 - PANEL_W / 2
        left = Math.max(8, Math.min(left, (window.innerWidth || 1024) - PANEL_W - 8))
        // 输入框贴着屏幕底部，面板默认向上；上方真的放不下才落到下方。
        const above = r.top - PANEL_H - 10
        return { top: above > 8 ? above : r.bottom + 10, left }
      }

      const show = () => {
        // 增强进行中不弹面板：这时候鼠标只是停在按钮上等结果，不是在挑档位。
        if (busy) return
        clearTimeout(closeTimer.current)
        clearTimeout(exitTimer.current)
        setClosing(false)
        const p = place()
        if (!p) return
        setPos(p)
        setOpen(true)
      }

      /** 先播退场动画再卸载，避免面板「啪」地消失。 */
      const hide = () => {
        if (!open) return
        clearTimeout(exitTimer.current)
        setClosing(true)
        exitTimer.current = setTimeout(() => {
          setOpen(false)
          setClosing(false)
        }, EXIT_MS)
      }

      const onEnter = () => {
        clearTimeout(closeTimer.current)
        clearTimeout(exitTimer.current)
        if (busy) return
        if (open) {
          // 正在退场时鼠标又回来了：撤销关闭。
          setClosing(false)
          return
        }
        clearTimeout(hoverTimer.current)
        hoverTimer.current = setTimeout(show, HOVER_DELAY)
      }

      const onLeave = () => {
        clearTimeout(hoverTimer.current)
        if (dragging) return
        clearTimeout(closeTimer.current)
        closeTimer.current = setTimeout(hide, CLOSE_DELAY)
      }

      React.useEffect(() => {
        if (!open) return
        const onEsc = (ev) => { if (ev.key === 'Escape') hide() }
        const onResize = () => hide()
        document.addEventListener('keydown', onEsc, true)
        window.addEventListener('resize', onResize)
        return () => {
          document.removeEventListener('keydown', onEsc, true)
          window.removeEventListener('resize', onResize)
        }
      }, [open, dragging])

      const pick = (clientX, start) => {
        if (start) setDragging(true)
        const track = trackRef.current
        if (!track) return
        const r = track.getBoundingClientRect()
        if (r.width <= 0) return
        const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
        const next = LEVELS[Math.round(ratio * (LEVELS.length - 1))]
        if (next !== state.level) updateSettings({ level: next })
      }

      const levelLabel = (LEVEL_META[state.level] ?? LEVEL_META.high).label
      const showUndo = undo !== null && !busy && text === undo.enhanced
      const label = busy
        ? '正在增强提示词…'
        : errFlash
          ? `增强失败：${errFlash}（可重试）`
          : showUndo
            ? '撤销增强，恢复原文'
            : `增强提示词（强度 ${levelLabel}）`
      const icon = busy
        ? h('span', {
          style: { display: 'inline-flex', animation: 'dsh-pe-spin 1s linear infinite' },
        }, h(IconLoadingOutlineRegular, { size: 16 }))
        : errFlash
          ? h('span', { style: { color: '#ef4444', fontSize: 13, lineHeight: '16px', fontWeight: 700 } }, '✕')
          : showUndo
          ? h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true },
            h('path', {
              d: 'M5.5 4.5L2 8l3.5 3.5',
              fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6,
              'stroke-linecap': 'round', 'stroke-linejoin': 'round',
            }),
            h('path', {
              d: 'M2 8h7.5a3.5 3.5 0 010 7H7.5',
              fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6,
              'stroke-linecap': 'round',
            }))
          : h(IconSparkleRegular, { size: 16 })

      return h('span', {
        ref: anchorRef,
        style: { display: 'inline-flex' },
        onMouseEnter: onEnter,
        onMouseLeave: onLeave,
      },
      h(Button, {
        variant: 'ghost',
        size: 'sm',
        'aria-label': label,
        title: label,
        disabled: busy || empty,
        style: {
          width: 28, height: 28, padding: 0,
          opacity: empty ? 0.45 : 1,
          color: errFlash || showUndo ? '#ef4444' : undefined,
        },
        onClick: async () => {
          if (busy) return
          if (showUndo) {
            inputActions.setDraft(undo.original)
            setUndo(null)
            return
          }
          if (empty) return
          setBusy(true)
          try {
            const enhanced = await enhance(text, settings.level, sessionId)
            if (enhanced.length > 0 && enhanced !== text) {
              setUndo({ original: text, enhanced })
              inputActions.setDraft(enhanced)
            }
          } catch (err) {
            console.error('[dsh-prompt-enhancer] enhance failed', err)
            setErrFlash(String(err?.message ?? err).replace(/^prompt-enhancer rewrite \d+: ?/, '').slice(0, 80) || '未知错误')
          } finally {
            setBusy(false)
          }
        },
      }, icon),

      open && pos ? h('div', {
        className: 'dsh-pe-panel',
        'data-closing': String(closing),
        style: { top: pos.top, left: pos.left },
        onMouseEnter: () => { clearTimeout(closeTimer.current) },
        onMouseLeave: onLeave,
        onMouseDown: (ev) => ev.stopPropagation(),
      }, h(LevelPanel, {
        level: state.level,
        autoSend: state.autoSend,
        useContext: state.useContext,
        dragging,
        trackRef,
        onPick: pick,
        onDragEnd: () => setDragging(false),
        onChangeLevel: (lv) => updateSettings({ level: lv }),
        onToggleAuto: () => updateSettings({ autoSend: !state.autoSend }),
        onToggleContext: () => updateSettings({ useContext: !state.useContext }),
      })) : null,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ensureStyle()
        installInterceptors()
        // 排查用：控制台执行 __dshPeDebug.findSendButton() 能直接看到能不能定位到发送按钮。
        if (typeof window !== 'undefined') {
          window.__dshPeDebug = {
            version: '0.2.9',
            settings,
            live,
            composerRoot,
            findSendButton,
            intercepting: () => intercepting,
          }
          // 启动 2.5 秒后记一次现场，DOM 那时才渲染完。
          setTimeout(() => {
            const btn = findSendButton()
            report({
              phase: 'load',
              version: '0.2.9',
              autoSend: settings.autoSend,
              level: settings.level,
              hasDock: !!document.querySelector('[data-composer-dock]'),
              hasRoot: !!composerRoot(),
              sendBtn: btn ? btn.getAttribute('aria-label') : null,
              buttons: [...document.querySelectorAll('button[aria-label]')]
                .filter((b) => b.offsetParent !== null)
                .slice(0, 12)
                .map((b) => b.getAttribute('aria-label')),
            })
          }, 2500)
        }
        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: 'prompt-enhancer',
          order: 100,
        }, EnhanceButton))
      },
    }
}

/* 由 scripts/build-suite.mjs 从 dsh-followup/client.js 机械生成；勿手改。 */
/**
 * dsh-followup 的 web 客户端部分。
 *
 * 只做两件事：
 *  1. 感知「生成中 → 空闲」：观察输入区按钮的 aria-label（生成时发送键
 *     会变成停止键），从忙翻到闲即视为一轮回复落定，POST /generate 拿建议。
 *  2. 把建议渲染成 Trae 同款的纵向文本链接行（逆向自 Trae workbench
 *     desktop.main.css 的 .interactive-session-followups：右箭头 + 12px
 *     链接色、padding 4/8、无边框、hover 淡底、gap 6px 纵向堆叠），
 *     整行点击直接发送；尾部一条淡色「换一批」。用户一改草稿即隐藏。
 *
 * 定位与空闲判定复用已验证的稳定标识：
 *  - 输入区根 = `[data-composer-dock]` 的父节点（dock 只是底部那条，
 *    编辑器和按钮都在它的兄弟节点里）。
 *  - 忙判定 = 存在可见的 aria-label 含 停止/stop 的按钮。
 *  - CSS Modules class 是 hash，一律不依赖。
 */

function createFollowupClient(require) {
    const React = require('react')
    const h = React.createElement

    const STYLE_ID = 'dsh-followup-style'
    const ENDPOINT = '/api/dsh-followup'
    /** 落定后稍等一拍再拉取：让服务端的缓冲窗口先走完，避免拉到旧 seq。 */
    const FETCH_DELAY_MS = 400

    /* Trae 同款跟进建议（逆向自 D:\Trae CN workbench.desktop.main.css 的
       .interactive-session-followups 规则 + dark_blue.json 主题 token）：
       纵向堆叠的文本链接行——右箭头 + 12px 链接色文字，padding 4/8，
       无边框无胶囊，hover 淡底，容器 gap 6px 左对齐贴输入框上方。 */
    const CSS = `
.dsh-followup-anchor { display: none; }
.dsh-followup-box {
  /* 挂在 conversation.chat.turnTail：回合末尾、AI 正文下方、操作图标上方。
     流式元素，跟对话一起滚动，天然占位。 */
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 0 2px;
}
@keyframes dsh-followup-in {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: none; }
}
/* 数值取自 Trae 截图的实测：背景 #171717、卡片 #222222，
   反推白色叠加 11/232 ≈ 0.05；卡片高 36px，圆角 6px，文字 #e5e5e5。 */
.dsh-followup-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  height: 36px;
  padding: 0 6px 0 12px;
  border: none;
  border-radius: var(--dsw-radius-xl, 20px);
  background: rgba(255, 255, 255, 0.05);
  color: #e5e5e5;
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
  animation: dsh-followup-in 200ms ease-out both;
  transition: background 120ms ease;
}
.dsh-followup-item:hover { background: rgba(255, 255, 255, 0.09); }
@media (prefers-reduced-motion: reduce) { .dsh-followup-item { animation: none; } }
.dsh-followup-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 箭头平时无底色；卡片 hover 时提亮，图标自己 hover 时出圆角底 */
.dsh-followup-send {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--dsw-radius-sm, 8px);
  color: rgba(255, 255, 255, 0.55);
  transition: background 120ms ease, color 120ms ease;
}
.dsh-followup-item:hover .dsh-followup-send { color: rgba(255, 255, 255, 0.78); }
.dsh-followup-item .dsh-followup-send:hover {
  background: rgba(255, 255, 255, 0.10);
  color: #ffffff;
}
.dsh-followup-add {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--dsw-radius-sm, 8px);
  color: rgba(255, 255, 255, 0.62);
  transition: background 120ms ease, color 120ms ease;
}
.dsh-followup-item:hover .dsh-followup-add { color: rgba(255, 255, 255, 0.80); }
.dsh-followup-item .dsh-followup-add:hover {
  background: rgba(255, 255, 255, 0.10);
  color: #ffffff;
}
`

    function ensureStyle() {
      if (typeof document === 'undefined') return
      if (document.getElementById(STYLE_ID)) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }

    /* ---------------------------------------------------------------- */
    /* 输入区探测                                                        */
    /* ---------------------------------------------------------------- */

    /** 输入区根节点：dock 只是底部那条，编辑器和按钮都在它的父节点下。 */
    function composerRoot() {
      const dock = document.querySelector('[data-composer-dock]')
      return dock ? dock.parentElement : null
    }

    function isVisible(button) {
      return button.offsetParent !== null || button.getClientRects().length > 0
    }

    /** 生成中：输入区里存在可见的「停止」按钮。 */
    function composerBusy(root) {
      if (!root) return false
      for (const button of root.querySelectorAll('button[aria-label]')) {
        const label = button.getAttribute('aria-label') ?? ''
        if (/停止|stop|中断/i.test(label) && isVisible(button)) return true
      }
      return false
    }

    /**
     * 观察忙 → 闲的翻转，即「一轮回复落定」。
     * 误报（语音停止键消失、会话切换）由服务端 seq 去重兜底，静默无害。
     */
    function useTurnEnd(onTurnEnd) {
      const callback = React.useRef(onTurnEnd)
      callback.current = onTurnEnd
      React.useEffect(() => {
        if (typeof document === 'undefined') return () => {}
        let wasBusy = composerBusy(composerRoot())
        let scheduled = false
        const check = () => {
          scheduled = false
          const busy = composerBusy(composerRoot())
          if (wasBusy && !busy) callback.current()
          wasBusy = busy
        }
        const schedule = () => {
          if (scheduled) return
          scheduled = true
          queueMicrotask(check)
        }
        const observer = new MutationObserver(schedule)
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['aria-label'],
        })
        return () => observer.disconnect()
      }, [])
    }

    /* ---------------------------------------------------------------- */
    /* 浮层组件                                                          */
    /* ---------------------------------------------------------------- */

    async function fetchJson(path, options) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10000)
      try {
        const res = await fetch(`${ENDPOINT}${path}`, { ...options, signal: controller.signal })
        if (!res.ok) return null
        return await res.json()
      } catch {
        return null
      } finally {
        clearTimeout(timer)
      }
    }

    /** 关键决策点留痕：chips 不出现时能从 snippets-debug.log 分辨断在哪一环。 */
    function diag(message) {
      try {
        void fetch('/api/dsh-superinput/snippets/diag', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: `followup: ${String(message).slice(0, 300)}` }),
        }).catch(() => { /* ignore */ })
      } catch { /* ignore */ }
    }

    /* dock 槽位的标准 props 带 inputActions，overlay 槽位没有——用隐形
       桥接组件在 dock 里捕获（compaction-control 0.1.9 同款模式），
       视觉则完全交给 overlay 槽位。 */
    let inputActionsBridge = null

    function InputActionsBridge(props) {
      React.useEffect(() => {
        inputActionsBridge = props.inputActions ?? null
        return () => { if (inputActionsBridge === props.inputActions) inputActionsBridge = null }
      }, [props.inputActions])
      return null
    }

    /** 输入卡正上方的建议行（Trae 同位：输入区顶部的专属带）。 */
    function FollowupChips({ sessionId }) {
      const [items, setItems] = React.useState(null)
      const shownSeq = React.useRef(0)
      const boxRef = React.useRef(null)
      // turnTail 每个回合都会渲染一次，只有最后一个回合该显示建议。
      const [isLatestTurn, setIsLatestTurn] = React.useState(false)

      React.useEffect(() => {
        diag(`chips mount session=${sessionId ? String(sessionId).slice(0, 8) : 'none'}`)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      React.useEffect(() => {
        // box 必须每次 check 现读：流式重渲染会重建回合尾容器，挂载时捕获的
        // 节点会脱离 DOM，闭包里拿旧节点 contains 恒 false = 实例永久失明，
        // chips 就再也不出现（真机 0.3.3 实测）。
        const check = () => {
          const box = boxRef.current
          if (!box) return
          const tails = document.querySelectorAll('[data-turn-tail]')
          const last = tails[tails.length - 1]
          const next = Boolean(last && last.contains(box))
          setIsLatestTurn((prev) => {
            if (prev !== next) diag(`turn-tail latest=${next} tails=${tails.length}`)
            return next
          })
        }
        check()
        const observer = new MutationObserver(check)
        observer.observe(document.body, { childList: true, subtree: true })
        return () => observer.disconnect()
      }, [])

      // 会话切换时收起，避免把上一个会话的建议带过去。
      React.useEffect(() => { setItems(null); shownSeq.current = 0 }, [sessionId])

      // 会话打开/切换时拉一次持久化建议——重启后打开对话仍然显示最近
      // 一轮的建议（Trae 逻辑：随会话持久化，无时间过期，下一轮替换）。
      // Trae 打字时建议保持可见（不做草稿联动隐藏）。
      const fetchLatest = React.useCallback(async () => {
        if (!sessionId) { diag('latest skip: no sessionId'); return }
        const data = await fetchJson(`/latest?sessionId=${encodeURIComponent(sessionId)}`)
        diag(`latest resp seq=${data?.seq ?? 'null'} n=${data?.suggestions?.length ?? 0}`)
        if (!data || !Array.isArray(data.suggestions) || data.suggestions.length === 0) return
        if (data.seq === shownSeq.current) return
        shownSeq.current = data.seq
        setItems(data.suggestions)
      }, [sessionId])
      // turnTail 每个回合一个实例，只在最后一个回合拉数据，否则 N 个回合
      // 会同时打 N 次 /latest。
      React.useEffect(() => {
        if (!isLatestTurn) return
        void fetchLatest()
      }, [sessionId, isLatestTurn, fetchLatest])

      const load = React.useCallback(async () => {
        if (!sessionId || !inputActionsBridge) {
          diag(`generate skip: session=${sessionId ? String(sessionId).slice(0, 8) : 'none'} bridge=${Boolean(inputActionsBridge)}`)
          return
        }
        // 0.2.0：日志驱动生成——服务端直读会话日志取最后一轮，不再依赖
        // 到不了插件进程的 agent 事件（现走 llm/stream 捕获缓存 + 日志兜底）。
        const data = await fetchJson('/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        diag(`generate resp seq=${data?.seq ?? 'null'} n=${data?.suggestions?.length ?? 0}`)
        // Trae 逻辑：建议属于本轮响应——本轮没有新建议（生成失败/为空/
        // 无可跟进内容）就清掉旧建议，而不是继续显示上一轮的。
        if (!data || !Array.isArray(data.suggestions) || data.suggestions.length === 0) {
          setItems(null)
          return
        }
        if (data.seq === shownSeq.current) return
        shownSeq.current = data.seq
        setItems(data.suggestions)
      }, [sessionId])

      const loadRef = React.useRef(load)
      loadRef.current = load
      // useTurnEnd 可能只注册一次，用 ref 读最新的「是不是最后一个回合」，
      // 否则闭包里永远是初始的 false。
      const latestRef = React.useRef(isLatestTurn)
      latestRef.current = isLatestTurn
      useTurnEnd(() => {
        diag(`turn-end fired latest=${latestRef.current}`)
        if (!latestRef.current) return
        window.setTimeout(() => { void loadRef.current() }, FETCH_DELAY_MS)
      })

      /**
       * Trae 同款双区：点正文/箭头直接发送（先落草稿再 submit，让 Lexical
       * 先吃下文本）；点气泡图标只填进草稿编辑。绝不静默绕过编辑——
       * 直接发送也会先在输入框里闪现整句，用户看得到发的是什么。
       */
      /** Trae 行为：点建议直接作为下一条消息发出（先落草稿再 submit，
       *  Lexical 先吃下文本，输入框里会闪现整句）；发出即收起本行。 */
      const sendSuggestion = (text) => {
        const actions = inputActionsBridge
        if (!actions) return
        setItems(null)
        actions.setDraft(text)
        window.setTimeout(() => {
          try { actions.submit() } catch { /* fail-silent */ }
        }, 250)
      }

      /** 点气泡图标：只把建议填进草稿，编辑后再发，不直接提交。 */
      const addToDraft = (text) => {
        const actions = inputActionsBridge
        if (!actions) return
        setItems(null)
        actions.setDraft(text)
      }

      // 锚点必须常驻：turnTail 每个回合都渲染一次，靠它判断自己是第几个，
      // 只在最后一个回合挂出建议。锚点本身 display:none，不占位。
      return h(React.Fragment, null,
        h('span', { ref: boxRef, className: 'dsh-followup-anchor', 'aria-hidden': true }),
        items !== null && isLatestTurn
          ? h('div', { className: 'dsh-followup-box' },
            items.slice(0, 2).map((text, index) => h('div', {
              key: index,
              className: 'dsh-followup-item',
              title: text,
              onClick: () => sendSuggestion(text),
            },
            h('span', { className: 'dsh-followup-text' }, text),
            // 右侧「发送」：独立的浅色方块，和 Trae 一致
            h('span', { className: 'dsh-followup-send' },
              h('svg', { viewBox: '0 0 16 16', width: 15, height: 15, 'aria-hidden': true },
                h('path', { d: 'M4.5 11.5L11.5 4.5M6.8 4.5h4.7v4.7', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }))),
            // 「添加到对话」：只填草稿，所以要挡住冒泡，避免顺带发送
            h('span', {
              className: 'dsh-followup-add',
              title: '添加到对话',
              onClick: (event) => { event.stopPropagation(); addToDraft(text) },
            },
            h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
              h('path', {
                d: 'M8 2.5c3.1 0 5.7 2.1 5.7 4.8S11.1 12.1 8 12.1c-.8 0-1.5-.1-2.2-.4L3.4 13l.7-2.2C2.8 9.9 2.3 8.7 2.3 7.3c0-2.7 2.6-4.8 5.7-4.8z',
                fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3, 'stroke-linejoin': 'round',
              }),
              h('circle', { cx: 5.9, cy: 7.3, r: 0.75, fill: 'currentColor' }),
              h('circle', { cx: 8, cy: 7.3, r: 0.75, fill: 'currentColor' }),
              h('circle', { cx: 10.1, cy: 7.3, r: 0.75, fill: 'currentColor' }))))))
          : null)
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ensureStyle()
        console.info('[dsh-followup] client 0.3.2 active')
        // 视觉：turnTail 槽位（回合末尾、AI 正文下方、操作图标上方），
        // 流式占位，跟对话一起滚动。Trae 同款位置。
        ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: 'dsh-followup',
          order: 10,
        }, FollowupChips))
        // 隐形桥：dock 槽拿 inputActions（overlay 槽的 props 不带）。
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'dsh-followup-bridge',
          order: 60,
        }, InputActionsBridge))
      },
    }
}

/* 由 scripts/build-suite.mjs 从 dsh-siri-voice/client.js 机械生成；勿手改。 */
/**
 * dsh-siri-voice 的 web 客户端部分。
 *
 * 只做一件事：内置语音输入进入**录音**状态时，在输入框卡片上覆盖一层
 * Siri 风格跑马灯——沿卡片边缘旋转的流光 + 接管内置声纹位置的波浪。
 *
 * 触发信号不抢槽位、不改内置插件：内置语音栏在录音阶段会给自己的容器加
 * `data-voice-activity="recording"`（见 VoiceInput.tsx），这里用 MutationObserver
 * 观察这个属性即可知道何时开始/结束。音量由本插件自己开一路 Web Audio
 * 分析器获取（此时麦克风权限已由内置按钮授予，不会二次弹窗）。
 *
 * 视觉层用 fixed 定位，每帧把「编辑器 + 语音栏」的外接矩形当作输入框卡片，
 * 直接盖在它上面（pointer-events: none），未激活时完全不渲染、不占布局。
 */

function createVoiceClient(require) {
    const React = require('react')
    const h = React.createElement

    const STYLE_ID = 'dsh-siri-voice-style'
    const ACTIVITY_SELECTOR = '[data-voice-activity]'

    const CSS = `
.dsh-siri-band {
  position: fixed;
  border-radius: 16px;
  overflow: hidden;
  pointer-events: none;
  z-index: 30;
  background: radial-gradient(140% 120% at 50% 100%, rgba(96, 140, 255, 0.10), rgba(12, 14, 22, 0) 68%);
  box-shadow: inset 0 0 22px rgba(96, 140, 255, 0.18);
}
.dsh-siri-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.dsh-siri-ring {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.5px;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  pointer-events: none;
}
.dsh-siri-ring-spin {
  position: absolute;
  inset: -150%;
  background: conic-gradient(from 0deg, transparent 0 55%, rgba(96, 150, 255, 0.95) 70%, rgba(190, 120, 255, 0.95) 82%, transparent 96%);
  animation: dsh-siri-spin 2.6s linear infinite;
}
@keyframes dsh-siri-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .dsh-siri-ring-spin { animation: none; } }

/* 点击麦克风后的点火反馈：边框先亮一下再回落。 */
.dsh-siri-band--requesting { animation: dsh-siri-ignite 480ms ease-out both; }
@keyframes dsh-siri-ignite {
  0% { box-shadow: inset 0 0 0 rgba(96, 140, 255, 0); }
  35% { box-shadow: inset 0 0 36px rgba(120, 170, 255, 0.42); }
  100% { box-shadow: inset 0 0 22px rgba(96, 140, 255, 0.20); }
}

/* 转写中：只保留边框呼吸，不画波。 */
.dsh-siri-band--transcribing { animation: dsh-siri-breath 1.7s ease-in-out infinite; }
.dsh-siri-band--transcribing .dsh-siri-ring-spin { animation-duration: 4.4s; }
@keyframes dsh-siri-breath {
  0%, 100% { box-shadow: inset 0 0 12px rgba(96, 140, 255, 0.12); }
  50% { box-shadow: inset 0 0 30px rgba(120, 170, 255, 0.34); }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-siri-band--requesting, .dsh-siri-band--transcribing { animation: none; }
}

/* 录音开始的一瞬间：边框点亮，让"开始"这件事有明确反馈。 */
.dsh-siri-band--recording { animation: dsh-siri-ignite 520ms ease-out both; }

/* 停止键：外圆内方改成"外圆内声纹"——圆形按钮里放随音量起伏的竖条，
   没有常驻光晕；按钮本身也随音量轻微缩放。 */
[data-voice-activity] .dsh-siri-stop,
[data-voice-activity] .dsh-siri-cancel {
  width: 32px !important;
  height: 32px !important;
  border-radius: 50% !important;
  position: relative;
}
[data-voice-activity] .dsh-siri-stop {
  /* 和旁边 +、模型等工具栏按钮保持一致：默认透明，悬停才出现一层浅底；
     竖条用次级文字色，比正文的白更收敛。 */
  background: transparent !important;
  color: var(--dsw-alias-label-secondary, rgba(232, 238, 250, 0.72)) !important;
  box-shadow: none !important;
  animation: none !important;
  transform-origin: center center;
  transition: background 120ms ease;
}
[data-voice-activity] .dsh-siri-stop:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08)) !important;
}
[data-voice-activity] .dsh-siri-stop > svg { visibility: hidden !important; }
.dsh-siri-bars {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2.5px;
  pointer-events: none;
}
.dsh-siri-bars i {
  display: block;
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: currentColor;
  transform: scaleY(0.3);
  transform-origin: center center;
  transition: transform 220ms ease-out;
  will-change: transform;
}
@media (prefers-reduced-motion: reduce) {
  .dsh-siri-band--recording { animation: none; }
}

/* 点击麦克风时的按下反馈：缩放 + 光晕。 */
.dsh-siri-pressed {
  transform: scale(0.9) !important;
  box-shadow: 0 0 0 6px rgba(96, 150, 255, 0.20), 0 0 26px rgba(96, 150, 255, 0.55) !important;
  transition: transform 110ms ease, box-shadow 110ms ease !important;
}

/* 隐藏内置的点状声纹（仍占位，保持取消/停止按钮位置不变），由本插件的波浪接管。
   用它的独特几何 viewBox 兜底，避免依赖父容器的属性。 */
[data-voice-activity="recording"] svg[role="img"],
svg[viewBox="0 0 640 40"] { visibility: hidden !important; }
`

    function ensureStyle() {
      if (typeof document === 'undefined') return
      if (document.getElementById(STYLE_ID)) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }

    /** 给麦克风按钮加按下反馈：缩放 + 光晕，松手或超时后移除。 */
    function installPressFeedback() {
      if (typeof document === 'undefined') return () => {}
      const pressed = new Set()
      const release = () => {
        for (const element of pressed) element.classList.remove('dsh-siri-pressed')
        pressed.clear()
      }
      const onDown = (event) => {
        const target = event.target instanceof Element ? event.target.closest('button[aria-label]') : null
        if (target === null) return
        // 只认语音按钮；不用类名，避免绑定到哈希后的 CSS module 名。
        if (!/听写|语音|录音|dictat|voice|record/i.test(target.getAttribute('aria-label') ?? '')) return
        target.classList.add('dsh-siri-pressed')
        pressed.add(target)
        window.setTimeout(release, 600)
      }
      document.addEventListener('pointerdown', onDown, true)
      window.addEventListener('pointerup', release, true)
      window.addEventListener('pointercancel', release, true)
      return () => {
        document.removeEventListener('pointerdown', onDown, true)
        window.removeEventListener('pointerup', release, true)
        window.removeEventListener('pointercancel', release, true)
        release()
      }
    }

    /** 读取内置语音栏当前相位：requesting / recording / transcribing / feedback。 */
    function useVoicePhase() {
      const [phase, setPhase] = React.useState(null)
      React.useEffect(() => {
        let scheduled = false
        const read = () => {
          scheduled = false
          const host = document.querySelector(ACTIVITY_SELECTOR)
          setPhase(host === null ? null : host.getAttribute('data-voice-activity'))
        }
        const schedule = () => {
          if (scheduled) return
          scheduled = true
          queueMicrotask(read)
        }
        read()
        const observer = new MutationObserver(schedule)
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-voice-activity'] })
        return () => observer.disconnect()
      }, [])
      return phase
    }

    /* ---------------------------------------------------------------- */
    /* 转写清理：去语气词、合并重复字词、修停顿造成的句号                    */
    /* ---------------------------------------------------------------- */

    // 语气词只在行首或标点后删除，避免误伤「啊」作叹词、「呢」作疑问助词的情况。
    const FILLERS = '嗯呃额唔哦诶唉'
    const LEADING_FILLER = new RegExp(`^([${FILLERS}]+)[，,、\\s]*`, 'gm')
    const MID_FILLER = new RegExp(`([，。！？、])([${FILLERS}]+)(?=[^，。！？、])`, 'g')
    // 夹在汉字中间的语气词只处理「嗯呃额唔」这类纯填充音。
    // 「啊哦诶唉」放进来会把「好啊我们走」改成「好我们走」，太危险。
    const INLINE_FILLER = /([\u4e00-\u9fa5])([嗯呃额唔]+)(?=[\u4e00-\u9fa5])/g
    // 句首的「那个，」是典型的口头填充，但「那个文件」是指示代词，所以限定后面跟逗号。
    const LEADING_DEMONSTRATIVE = /^那个[，,]\s*/gm
    // 同字三连以上（「我我我」）。两连保留，因为「看看」「刚刚」是合法叠词。
    const TRIPLE_CHAR = /([\u4e00-\u9fa5])\1{2,}/g
    // 两三个字的词连续重复（「这个这个」）。
    const DUP_WORD = /([\u4e00-\u9fa5]{2,3})\1+/g

    /**
     * 说话时停顿会把一句话切成一串短句：「我今天。想去公园。带上相机。」
     * 整段没有逗号、平均句长又很短，才判定为停顿碎片，把中间的句号换成逗号。
     * 正常短句（已经有逗号，或者句子够长）不动。
     */
    function mergePausePeriods(text) {
      const parts = text.split(/(?<=[。！？])/).filter((part) => part.length > 0)
      if (parts.length < 2) return text
      if (/[，,]/.test(text)) return text
      if (text.length / parts.length > 12) return text
      return parts.join('').replace(/。(?=.)/g, '，')
    }

    /** 清理一段转写文本；结果为空或改动过大时放弃，宁可保留原样。 */
    function cleanTranscript(text) {
      const source = typeof text === 'string' ? text : ''
      if (source.length < 2) return source
      const stripped = source
        .replace(LEADING_FILLER, '')
        // 放在语气词之后：「呃，那个，我」要先删掉「呃，」，「那个」才落到行首。
        .replace(LEADING_DEMONSTRATIVE, '')
        .replace(MID_FILLER, '$1')
        .replace(INLINE_FILLER, '$1')
        .replace(TRIPLE_CHAR, '$1')
        .replace(DUP_WORD, '$1')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
      const out = mergePausePeriods(stripped)
      // 改动超过 40% 说明规则失控了，放弃清理。
      if (out.length === 0 || Math.abs(out.length - source.length) > source.length * 0.4) return source
      return out
    }

    /**
     * 转写落地后清理草稿。
     * 时序：内置插件先 insertText 再 setPhase('idle')，所以看到 transcribing → null
     * 之后还要等一拍，草稿状态才同步过来。
     */
    function useTranscriptCleanup(phase, draft, inputActions) {
      const draftRef = React.useRef('')
      draftRef.current = typeof draft === 'string' ? draft : ''
      const previous = React.useRef(phase)

      React.useEffect(() => {
        const from = previous.current
        previous.current = phase
        if (from !== 'transcribing' || phase !== null || !inputActions) return
        const timer = setTimeout(() => {
          const text = draftRef.current
          if (!text.trim()) return
          const cleaned = cleanTranscript(text)
          if (cleaned !== text) {
            console.info('[dsh-siri-voice] transcript cleaned', text.length, '->', cleaned.length)
            inputActions.setDraft(cleaned)
          }
        }, 180)
        return () => clearTimeout(timer)
      }, [phase, inputActions])
    }

    const LAYERS = [
      { amplitude: 1, frequency: 1.5, speed: 1.35, width: 2.8, alpha: 0.95, rgb: '96, 150, 255' },
      { amplitude: 0.62, frequency: 2.4, speed: 1.9, width: 2.0, alpha: 0.7, rgb: '168, 118, 255' },
      { amplitude: 0.4, frequency: 3.7, speed: 2.6, width: 1.4, alpha: 0.5, rgb: '86, 224, 255' },
    ]

    /**
     * 画布动画：音量驱动振幅，三条相位不同的正弦叠加成 Siri 波纹；
     * 每帧把浮层贴到输入框卡片上，波浪只画在内置声纹原来的格子里。
     */
    function useVisualizer(bandRef, canvasRef, phase) {
      React.useEffect(() => {
        const recording = phase === 'recording'
        if (!recording && phase !== 'transcribing' && phase !== 'requesting') return
        const band = bandRef.current
        const canvas = canvasRef.current
        if (!band || !canvas) return

        let disposed = false
        let frame = 0
        let stream
        let audio
        let analyser
        let samples
        let level = 0
        let barLevel = 0
        let card = null
        const started = performance.now()
        // CSS 之外再直接改一次内联样式：不依赖样式表的选择器匹配结果。
        const hiddenWaveforms = new Set()

        const hideBuiltinWaveform = () => {
          const svg = document.querySelector('svg[viewBox="0 0 640 40"]')
            ?? document.querySelector('[data-voice-activity] svg[role="img"]')
          if (svg === null || svg.style.visibility === 'hidden') return
          svg.style.setProperty('visibility', 'hidden', 'important')
          hiddenWaveforms.add(svg)
        }

        const restoreBuiltinWaveform = () => {
          for (const svg of hiddenWaveforms) svg.style.removeProperty('visibility')
          hiddenWaveforms.clear()
        }

        // 给录音行的停止 / 取消按钮打标记，样式在 CSS 里按标记类生效。
        const markedControls = new Set()
        const markControls = () => {
          const row = document.querySelector('[data-voice-activity="recording"]')
          if (row === null) return
          for (const button of row.querySelectorAll('button[aria-label]')) {
            const label = button.getAttribute('aria-label') ?? ''
            const kind = /停止|stop/i.test(label)
              ? 'dsh-siri-stop'
              : /取消|丢弃|cancel|discard/i.test(label) ? 'dsh-siri-cancel' : null
            if (kind === null) continue
            if (!button.classList.contains(kind)) {
              button.classList.add(kind)
              markedControls.add({ button, kind })
            }
            if (kind === 'dsh-siri-stop' && button.dataset.dshSiriBars !== '1') {
              button.dataset.dshSiriBars = '1'
              const svg = button.querySelector('svg')
              if (svg !== null) svg.style.setProperty('visibility', 'hidden', 'important')
              const bars = document.createElement('span')
              bars.className = 'dsh-siri-bars'
              for (let index = 0; index < 4; index += 1) bars.appendChild(document.createElement('i'))
              button.appendChild(bars)
            }
          }
        }
        const unmarkControls = () => {
          for (const { button, kind } of markedControls) {
            button.classList.remove(kind)
            if (kind === 'dsh-siri-stop') {
              button.querySelector('.dsh-siri-bars')?.remove()
              button.querySelector('svg')?.style.removeProperty('visibility')
              delete button.dataset.dshSiriBars
            }
          }
          markedControls.clear()
        }

        if (recording && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
          navigator.mediaDevices.getUserMedia({ audio: true }).then((next) => {
            if (disposed) { next.getTracks().forEach((track) => track.stop()); return }
            stream = next
            const AudioCtx = window.AudioContext ?? window.webkitAudioContext
            audio = new AudioCtx()
            const source = audio.createMediaStreamSource(next)
            analyser = audio.createAnalyser()
            analyser.fftSize = 1024
            source.connect(analyser)
            samples = new Float32Array(analyser.fftSize)
          }).catch(() => {
            // 权限被拒或设备被占用：保持合成呼吸，不打断录音本身。
          })
        }

        const pickEditor = () => [...document.querySelectorAll('textarea, [contenteditable="true"]')]
          .filter((element) => {
            const rect = element.getBoundingClientRect()
            return rect.width > 200 && rect.height > 0
          })
          .sort((left, right) => right.getBoundingClientRect().width - left.getBoundingClientRect().width)[0]

        /** 编辑器与语音栏的最小公共祖先就是输入框卡片本身，直接用它的矩形和圆角。 */
        const measure = () => {
          const host = document.querySelector(ACTIVITY_SELECTOR)
          const editor = pickEditor()
          if (host && editor) {
            let node = editor.parentElement
            while (node && node !== document.body && !node.contains(host)) node = node.parentElement
            if (node && node !== document.body) {
              const rect = node.getBoundingClientRect()
              if (rect.width > 0 && rect.height > 0) {
                const radius = parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0
                return { rect, radius }
              }
            }
          }
          return null
        }

        /** 严丝合缝盖在卡片上：同矩形、同圆角，不做任何外扩。 */
        const place = () => {
          const found = measure()
          card = found ? found.rect : null
          const viewport = window.innerWidth
          const width = found ? found.rect.width : Math.max(240, viewport * 0.62)
          const left = found ? found.rect.left : (viewport - width) / 2
          const top = found ? found.rect.top : 96
          const height = found ? found.rect.height : 72
          const radius = found !== null && found.radius > 0 ? found.radius : 16
          band.style.width = `${width}px`
          band.style.height = `${height}px`
          band.style.left = `${left}px`
          band.style.top = `${top}px`
          band.style.borderRadius = `${radius}px`
        }

        const draw = (now) => {
          frame = requestAnimationFrame(draw)
          place()
          hideBuiltinWaveform()
          markControls()
          const dpr = window.devicePixelRatio || 1
          const width = canvas.clientWidth
          const height = canvas.clientHeight
          if (width === 0 || height === 0) return
          if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
            canvas.width = Math.round(width * dpr)
            canvas.height = Math.round(height * dpr)
          }
          const ctx = canvas.getContext('2d')
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          ctx.clearRect(0, 0, width, height)

          const time = (now - started) / 1000
          // 拿不到麦克风数据时不要退回一条直线：给一个明显的合成起伏，
          // 至少让动效看起来是"在听"。
          let target = 0.45 + 0.22 * Math.sin(time * 3.1) + 0.12 * Math.sin(time * 7.3)
          target = Math.min(1, Math.max(0.2, target))
          if (analyser && samples) {
            analyser.getFloatTimeDomainData(samples)
            let sum = 0
            for (const value of samples) sum += value * value
            const rms = Math.sqrt(sum / samples.length)
            // 麦克风被内置录音器独占时这里可能一直是 0：那种情况保留合成起伏，
            // 不要退回一条直线。语音 RMS 通常 0.02–0.15，放大 24 倍再压缩。
            if (rms > 0.001) target = Math.min(1, Math.pow(Math.min(1, rms * 24), 0.65))
          }
          level += (target - level) * 0.32
          const drive = 0.15 + level * 0.65

          // 停止键本身尺寸不变，只让内部竖条随音量起伏。
          const stopButton = document.querySelector('[data-voice-activity="recording"] .dsh-siri-stop')
          if (stopButton !== null) {
            // 慢速取样 + 三档量化：不跟声音瞬时抖动；左右严格对称，中间最高。
            barLevel += (level - barLevel) * 0.05
            const stepped = Math.round(barLevel * 3) / 3
            const shapes = [0.45, 1, 1, 0.45]
            const bars = stopButton.querySelectorAll('.dsh-siri-bars i')
            for (let index = 0; index < bars.length; index += 1) {
              const shape = shapes[index] ?? 0.45
              bars[index].style.transform = `scaleY(${(0.3 + stepped * shape * 0.85).toFixed(3)})`
            }
          }

          // 只在拿到内置声纹的格子时画波：停止/转写阶段它已卸载，
          // 这时没有可接管的区域，就只留边流光，不再铺一条横贯卡片的线。
          const slot = document.querySelector('[data-voice-activity="recording"] svg[role="img"]')
          const slotRect = slot ? slot.getBoundingClientRect() : null
          if (card && slotRect && slotRect.width > 0) {
            const startX = slotRect.left - card.left
            const span = slotRect.width
            const mid = slotRect.top + slotRect.height / 2 - card.top
            const wave = Math.max(7, Math.min(13, slotRect.height / 2 - 7))
            for (const layer of LAYERS) {
              ctx.beginPath()
              for (let x = 0; x <= span; x += 2) {
                const u = span === 0 ? 0 : x / span
                const envelope = Math.sin(Math.PI * u)
                const px = startX + x
                const y = mid
                  + Math.sin(u * Math.PI * 2 * layer.frequency + time * layer.speed) * wave * layer.amplitude * drive * envelope
                  + Math.sin(u * Math.PI * layer.frequency - time * layer.speed * 0.7) * wave * layer.amplitude * 0.35 * drive * envelope
                if (x === 0) ctx.moveTo(px, y)
                else ctx.lineTo(px, y)
              }
              ctx.strokeStyle = `rgba(${layer.rgb}, ${layer.alpha * (0.45 + level * 0.55)})`
              ctx.lineWidth = layer.width
              ctx.lineCap = 'round'
              ctx.shadowBlur = 8
              ctx.shadowColor = `rgba(${layer.rgb}, 0.55)`
              ctx.stroke()
            }
          }
        }
        frame = requestAnimationFrame(draw)

        return () => {
          disposed = true
          cancelAnimationFrame(frame)
          restoreBuiltinWaveform()
          unmarkControls()
          if (stream) stream.getTracks().forEach((track) => track.stop())
          if (audio) void audio.close().catch(() => {})
        }
      }, [bandRef, canvasRef, phase])
    }

    /** 输入框上方的跑马灯：点火 / 录音 / 转写三个阶段各有自己的状态。 */
    function SiriVoiceBand({ useInput, inputActions }) {
      const phase = useVoicePhase()
      const draft = useInput((state) => state.draft)
      useTranscriptCleanup(phase, draft, inputActions)
      const bandRef = React.useRef(null)
      const canvasRef = React.useRef(null)
      useVisualizer(bandRef, canvasRef, phase)
      if (phase !== 'requesting' && phase !== 'recording' && phase !== 'transcribing') return null
      return h('div', { ref: bandRef, className: `dsh-siri-band dsh-siri-band--${phase}`, 'aria-hidden': true },
        h('canvas', { ref: canvasRef, className: 'dsh-siri-canvas' }),
        h('div', { className: 'dsh-siri-ring' }, h('div', { className: 'dsh-siri-ring-spin' })))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ensureStyle()
        console.info('[dsh-siri-voice] client 0.2.0 active')
        ctx.effect(() => installPressFeedback())
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'siri-voice',
          order: 50,
        }, SiriVoiceBand))
      },
    }
}

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
    let host = null
    let hideTimer = 0

    const ensureHost = () => {
      if (host?.isConnected) return host
      if (host) host.remove()
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
      try {
        await navigator.clipboard?.writeText(text)
        toast('已复制')
      } catch {
        toast('复制失败')
      }
    }

    /** 把选中文字追加进输入框草稿（草稿桥是 enhancer 客户端挂的全局）。 */
    const addToDraft = (text) => {
      hide()
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
            // 只收对话正文：跳过输入区和我们自己的弹层
            if (!el || el.closest('[data-dsh-superinput-portal]') || el.closest('[contenteditable="true"], textarea, input')) { hide(); return }
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
            menu.addEventListener('mousedown', (e) => e.stopPropagation())
            const mkItem = (label, action) => {
              const b = document.createElement('button')
              b.className = 'dsh-cp-selitem'
              b.textContent = label
              b.addEventListener('click', () => { void action(current) })
              return b
            }
            menu.append(
              mkItem('复制', copySel),
              mkItem('添加到对话', addToDraft),
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
    },
  }
}

/* dsh-superinput · hub 模块客户端：设置页「输入栏」总览 + 运行时调节。 */
function createHubClient(require) {
  const React = require('react')
  const h = React.createElement

  const STYLE_ID = 'dsh-superinput-hub-style'
  const ENDPOINT = '/api/dsh-superinput/hub'

  const CSS = `
.dsh-hub { display: flex; flex-direction: column; gap: 12px; padding: 4px 2px 24px; font-size: 13px; color: var(--dsw-alias-label-primary); }
.dsh-hub-note { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); padding: 8px 12px; border-radius: 8px; background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.04)); }
.dsh-hub-card { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 10px; background: var(--dsw-alias-bg-layer-1, transparent); }
.dsh-hub-title { font-size: 12px; line-height: 20px; font-weight: 500; color: var(--dsw-alias-label-secondary); }
.dsh-hub-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px 16px; }
.dsh-hub-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.dsh-hub-key { font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-tertiary); flex: 0 0 auto; }
.dsh-hub-ctl { flex: 0 1 auto; min-width: 0; display: flex; justify-content: flex-end; }
.dsh-hub-num {
  width: 80px; box-sizing: border-box; padding: 2px 6px;
  font-size: 12px; line-height: 18px; text-align: right;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.06));
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  border-radius: 5px; outline: none; font-variant-numeric: tabular-nums;
}
.dsh-hub-num:focus { border-color: #3a83f7; }
.dsh-hub-sel {
  padding: 2px 4px; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.06));
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  border-radius: 5px; outline: none;
}
.dsh-hub-sw {
  width: 34px; height: 18px; border-radius: 9px; border: none; padding: 0;
  position: relative; cursor: pointer; transition: background 0.15s;
  background: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
}
.dsh-hub-sw[data-on="true"] { background: #3a83f7; }
.dsh-hub-sw::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 14px; height: 14px; border-radius: 50%; background: #fff;
  transition: transform 0.15s;
}
.dsh-hub-sw[data-on="true"]::after { transform: translateX(16px); }
.dsh-hub-val { font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; }
.dsh-hub-empty { font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-tertiary); }
.dsh-hub-msg { font-size: 11px; line-height: 16px; color: #f87171; }
`

  function ensureStyle() {
    if (typeof document === 'undefined') return
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = CSS
    document.head.appendChild(style)
  }

  // 每个模块：endpoint 是它自己的 /settings 写入地址；fields 只列可运行时改的项。
  const MODULE_META = [
    {
      key: 'enhancer',
      label: '提示词增强',
      endpoint: '/api/prompt-enhancer/settings',
      fields: [
        { key: 'level', label: '强度', type: 'select', options: ['off', 'low', 'high', 'max'] },
        { key: 'mode', label: '模式', type: 'select', options: ['auto', 'manual'] },
        { key: 'timeoutMs', label: '超时(ms)', type: 'number', min: 1000, max: 120000 },
        { key: 'minPromptLength', label: '最小字数', type: 'number', min: 1, max: 200 },
      ],
    },
    {
      key: 'followup',
      label: '跟进建议',
      endpoint: '/api/dsh-followup/settings',
      fields: [
        { key: 'maxSuggestions', label: '条数', type: 'number', min: 1, max: 3 },
        { key: 'idleDelayMs', label: '延迟(ms)', type: 'number', min: 200, max: 10000 },
        { key: 'timeoutMs', label: '超时(ms)', type: 'number', min: 1000, max: 120000 },
      ],
    },
    {
      key: 'picker',
      label: '模型选择器',
      endpoint: '/api/dsh-power-picker/settings',
      fields: [
        { key: 'enabled', label: '启用', type: 'bool' },
      ],
    },
    {
      key: 'prompts',
      label: '模板库',
      endpoint: '/api/dsh-superinput/prompts/settings',
      fields: [
        { key: 'maxItems', label: '上限', type: 'number', min: 20, max: 5000 },
      ],
    },
    {
      key: 'cost',
      label: '费用引擎',
      endpoint: '/api/dsh-cost/settings',
      fields: [
        { key: 'budgetEnabled', label: '预算开关', type: 'bool' },
        { key: 'budgetAmount', label: '预算额', type: 'number', min: 0, max: 1000000 },
        { key: 'budgetPeriod', label: '预算周期', type: 'select', options: ['day', 'month'] },
        { key: 'exchangeRate', label: '汇率', type: 'number', min: 1, max: 20, step: 0.1 },
        { key: 'peakAlertEnabled', label: '峰时提醒', type: 'bool' },
      ],
    },
    { key: 'voice', label: '语音输入', endpoint: null, fields: [] },
  ]

  function HubSection() {
    const [state, setState] = React.useState(null)
    const [saving, setSaving] = React.useState('')
    const [error, setError] = React.useState('')

    const reload = React.useCallback(() => {
      fetch(`${ENDPOINT}/state`, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((value) => setState(value))
        .catch(() => {})
    }, [])
    React.useEffect(() => { reload() }, [reload])

    const modules = state?.modules ?? {}

    const save = async (meta, field, value) => {
      if (!meta.endpoint) return
      const id = `${meta.key}.${field.key}`
      setSaving(id)
      setError('')
      try {
        const res = await fetch(meta.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ [field.key]: value }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setState((prev) => {
          if (!prev) return prev
          const next = { modules: { ...prev.modules } }
          next.modules[meta.key] = { ...(prev.modules?.[meta.key] ?? {}), [field.key]: value }
          return next
        })
        reload()
      } catch (err) {
        setError(`${meta.label} · ${field.label} 保存失败：${err?.message ?? err}`)
      } finally {
        setSaving('')
      }
    }

    const renderControl = (meta, field, value) => {
      if (field.type === 'bool') {
        return h('button', {
          className: 'dsh-hub-sw',
          'data-on': String(value === true),
          disabled: saving === `${meta.key}.${field.key}`,
          onClick: () => save(meta, field, value !== true),
        })
      }
      if (field.type === 'select') {
        return h('select', {
          className: 'dsh-hub-sel',
          value: value ?? '',
          onChange: (event) => save(meta, field, event.target.value),
        }, field.options.map((option) => h('option', { key: option, value: option }, option)))
      }
      if (field.type === 'number') {
        return h('input', {
          className: 'dsh-hub-num',
          type: 'number',
          min: field.min,
          max: field.max,
          step: field.step ?? 1,
          defaultValue: value ?? '',
          onBlur: (event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next) && next !== value) save(meta, field, next)
          },
          onKeyDown: (event) => { if (event.key === 'Enter') event.currentTarget.blur() },
        })
      }
      return h('span', { className: 'dsh-hub-val' }, String(value ?? '—'))
    }

    return h('div', { className: 'dsh-hub' },
      h('div', { className: 'dsh-hub-note' },
        '运行时调节立即生效，重启后回到配置文件里的值。要长期生效请改 profile 的 cordis.patch.yml。'),
      error ? h('div', { className: 'dsh-hub-msg' }, error) : null,
      ...MODULE_META.map((meta) => {
        const cfg = modules[meta.key]
        return h('div', { className: 'dsh-hub-card', key: meta.key },
          h('div', { className: 'dsh-hub-title' }, meta.label),
          meta.fields.length === 0
            ? h('div', { className: 'dsh-hub-empty' }, '无配置项')
            : h('div', { className: 'dsh-hub-grid' },
              meta.fields.map((field) => h('div', { className: 'dsh-hub-item', key: field.key },
                h('span', { className: 'dsh-hub-key' }, field.label),
                h('span', { className: 'dsh-hub-ctl' }, cfg ? renderControl(meta, field, cfg[field.key]) : h('span', { className: 'dsh-hub-val' }, '—'))))))
      }))
  }

  return {
    inject: ['slots'],
    apply(ctx) {
      ensureStyle()
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'dsh-superinput-hub',
        order: 29,
        label: '输入栏',
      }, HubSection))
    },
  }
}


window.__ModuleLoader__.load({
  id: 'dsh-superinput',
  factory(require) {
    const defs = [
      ['cost', createCostClient],
      ['picker', createPickerClient],
      ['enhancer', createEnhancerClient],
      ['followup', createFollowupClient],
      ['voice', createVoiceClient],
      ['prompts', createPromptsClient],
      ['hub', createHubClient],
    ]
    // 模块异常上报：console 不落盘，失败必须走 prompts /diag 留痕。
    const reportModuleError = (key, when, error) => {
      console.error(`[dsh-superinput] client module "${key}" ${when}:`, error)
      try {
        void fetch('/api/dsh-superinput/prompts/diag', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: `client module "${key}" ${when}: ${String(error?.stack ?? error).slice(0, 400)}` }),
        }).catch(() => {})
      } catch { /* ignore */ }
    }
    const modules = []
    for (const [key, create] of defs) {
      try { modules.push([key, create(require)]) }
      catch (error) { reportModuleError(key, 'factory failed', error) }
    }
    console.info('[dsh-superinput] client active:', modules.map(([key]) => key).join('+'))
    return {
      // 各模块 client 的 inject 并集：picker 需要 sessions/remote/modelDirectories
      // 等，只声明 slots 会让它在 apply 时报 cannot get property without inject。
      inject: [...new Set(modules.flatMap(([, mod]) => mod.inject ?? ['slots']))],
      apply(ctx) {
        for (const [key, mod] of modules) {
          try { mod.apply(ctx) }
          catch (error) { reportModuleError(key, 'apply failed', error) }
        }
      },
    }
  },
})
