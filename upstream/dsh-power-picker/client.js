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

window.__ModuleLoader__.load({
  id: 'dsh-power-picker',
  factory(require) {
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
  },
})
