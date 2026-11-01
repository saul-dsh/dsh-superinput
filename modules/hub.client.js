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
      key: 'snippets',
      label: '片段管理',
      endpoint: '/api/dsh-superinput/snippets/settings',
      fields: [
        { key: 'captureEnabled', label: '自动捕获', type: 'bool' },
        { key: 'maxItems', label: '上限', type: 'number', min: 20, max: 2000 },
        { key: 'minChars', label: '最小字数', type: 'number', min: 1, max: 100 },
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
