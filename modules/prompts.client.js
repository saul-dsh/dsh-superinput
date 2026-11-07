/* dsh-superinput · prompts 模块客户端：模板库入口 + 面板。 */
function createPromptsClient(require) {
  const React = require('react')
  const { createPortal } = require('react-dom')
  const h = React.createElement

  const STYLE_ID = 'dsh-superinput-prompts-style'
  const ENDPOINT = '/api/dsh-superinput/prompts'

  /* 划选引用：官方 reference chip + Trae 规格。
   * CHIP_MARK 是不可见分隔符（U+2063），作为标签前缀用于 CSS 精确选中
   * 「我们插入的 chip」而不波及官方 @file chip；视觉与文本内容无影响。 */
  const SELECTION_SOURCE = 'superinput-selection'
  const SELECTION_RULE = 'dsh-superinput-selection'
  const CHIP_MARK = '\u2063'
  const CONTEXT_MAX = 8
  const CONTEXT_TEXT_MAX = 4000
  const CONTEXT_COMMENT_MAX = 600
  const STORAGE_KEY = 'dsh-superinput-selection-items'

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
/* 四选项横条（0.8.x 形态，用户拍板恢复）：深色圆角条 + 背景模糊 */
.dsh-cp-selmenu { display: flex; flex-direction: row; align-items: center; gap: 2px; padding: 3px; border-radius: var(--dsw-radius-lg, 12px);
  background: var(--dsw-specific-menu, rgba(67, 69, 74, 0.85));
  backdrop-filter: var(--dsw-menu-backdrop-filter, blur(40px) saturate(150%));
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
  box-shadow: var(--dsw-elevation-prominent, 0 0 0 0.5px var(--dsw-elevation-stroke-color), 0 3px 8px 0 rgba(0, 0, 0, 0.1));
}
.dsh-cp-selitem { border: none; background: transparent; text-align: left; padding: 5px 10px; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-primary, rgba(232, 238, 250, 0.92)); border-radius: var(--dsw-radius-sm, 6px); cursor: pointer; white-space: nowrap; }
.dsh-cp-selitem:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.07)); }
/* 官方浮动「引用文本」pill 由横条里的同名功能取代（同一 insertQuote API），隐藏避免双浮层 */
[class*="U4oBDW_action"] { display: none !important; }
.dsh-cp-toast { padding: 5px 12px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary, #fff);
  background: rgba(50, 50, 54, 0.95); border-radius: 8px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25); }
/* ---- 划选引用 chip：Trae comment-mention 规格（ai-modules-chat/index.css）----
   规格：高 22px / 圆角 --dsw-radius-sm(8) / business 浅色底 + business 主色文字 /
   12px 500 / max-width 240；左图标在 hover 时换成 ×（Trae remove-mention-icon
   同义）。颜色全部走 dsh 设计令牌，明暗主题各自生效，不再写死 Trae 的灰/蓝。 */
[contenteditable] span[title^="${CHIP_MARK}"] {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 18px;
  max-width: 240px;
  padding: 1px 6px 1px 4px;
  border: none;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-1, rgba(116, 126, 148, .18));
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family, inherit);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -.02em;
  line-height: 16px;
  vertical-align: middle;
  cursor: pointer;
  overflow: hidden;
  transition: background .14s ease;
}
[contenteditable] span[title^="${CHIP_MARK}"]:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(116, 126, 148, .28));
}
/* 隐藏宿主默认前缀（@ / file 图标），换 Trae 同款气泡图标（mask 跟随文字色） */
[contenteditable] span[title^="${CHIP_MARK}"] > span:first-child { display: none; }
[contenteditable] span[title^="${CHIP_MARK}"]::before {
  content: '';
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
  margin-right: 2px;
  background: currentColor;
  -webkit-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M14.3332 8.0013C14.3332 11.3346 11.8702 13.3346 7.99984 13.3346C6.8331 13.3346 5.60267 13.2116 4.56857 12.668C4.56857 12.668 3.07391 13.7639 1.6665 13.0972C2.70858 11.7228 2.44754 10.7933 2.38257 10.6161C2.37481 10.595 2.36622 10.576 2.35754 10.5552C2.26265 10.3277 1.6665 8.86419 1.6665 8.0013C1.6665 4.66797 4.12947 2.66797 7.99984 2.66797C11.8702 2.66797 14.3332 4.66797 14.3332 8.0013Z' fill='black'/><circle cx='5.6' cy='8' r='0.9' fill='white'/><circle cx='8' cy='8' r='0.9' fill='white'/><circle cx='10.4' cy='8' r='0.9' fill='white'/></svg>") center / 14px 14px no-repeat;
  mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M14.3332 8.0013C14.3332 11.3346 11.8702 13.3346 7.99984 13.3346C6.8331 13.3346 5.60267 13.2116 4.56857 12.668C4.56857 12.668 3.07391 13.7639 1.6665 13.0972C2.70858 11.7228 2.44754 10.7933 2.38257 10.6161C2.37481 10.595 2.36622 10.576 2.35754 10.5552C2.26265 10.3277 1.6665 8.86419 1.6665 8.0013C1.6665 4.66797 4.12947 2.66797 7.99984 2.66797C11.8702 2.66797 14.3332 4.66797 14.3332 8.0013Z' fill='black'/><circle cx='5.6' cy='8' r='0.9' fill='white'/><circle cx='8' cy='8' r='0.9' fill='white'/><circle cx='10.4' cy='8' r='0.9' fill='white'/></svg>") center / 14px 14px no-repeat;
  opacity: .85;
}
[contenteditable] span[title^="${CHIP_MARK}"]:hover::before {
  content: '×';
  background: none;
  -webkit-mask: none;
  mask: none;
  color: var(--dsw-alias-label-primary, currentColor);
  font-size: 14px;
  line-height: 14px;
  text-align: center;
}
/* 消息正文里的同款 chip（user-text 规则节点；不在 contenteditable 里） */
.dsh-si-msgchip { box-sizing: border-box; display: inline-flex; align-items: center; gap: 4px; height: 18px; max-width: 240px;
  padding: 1px 6px 1px 4px; border: none; border-radius: 4px; background: var(--dsw-alias-bg-layer-1, rgba(116, 126, 148, .18));
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family, inherit); font-size: 13px; font-weight: 500; letter-spacing: -.02em; line-height: 16px;
  vertical-align: middle; overflow: hidden; user-select: none; }
.dsh-si-msgchip.interactive { cursor: pointer; }
.dsh-si-msgchip.interactive:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(116, 126, 148, .28)); }
.dsh-si-msgchip-icon { flex: 0 0 14px; width: 14px; height: 14px; margin-right: 2px; opacity: .8; background: currentColor;
  -webkit-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M6.6 3.2C4.5 4.3 3 6.3 3 8.6c0 2.3 1.3 3.7 3.2 3.7 1.6 0 2.7-1 2.7-2.5 0-1.4-.9-2.3-2.2-2.3-.4 0-.7 0-1 .2.3-1 .9-1.8 1.7-2.4L6.6 3.2Zm7 0c-2.1 1.1-3.6 3.1-3.6 5.4 0 2.3 1.3 3.7 3.2 3.7 1.6 0 2.7-1 2.7-2.5 0-1.4-.9-2.3-2.2-2.3-.4 0-.7 0-1 .2.3-1 .9-1.8 1.7-2.4l-.8-1.9Z' fill='black'/></svg>") center / 14px 14px no-repeat;
  mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M6.6 3.2C4.5 4.3 3 6.3 3 8.6c0 2.3 1.3 3.7 3.2 3.7 1.6 0 2.7-1 2.7-2.5 0-1.4-.9-2.3-2.2-2.3-.4 0-.7 0-1 .2.3-1 .9-1.8 1.7-2.4L6.6 3.2Zm7 0c-2.1 1.1-3.6 3.1-3.6 5.4 0 2.3 1.3 3.7 3.2 3.7 1.6 0 2.7-1 2.7-2.5 0-1.4-.9-2.3-2.2-2.3-.4 0-.7 0-1 .2.3-1 .9-1.8 1.7-2.4l-.8-1.9Z' fill='black'/></svg>") center / 14px 14px no-repeat; }
.dsh-si-msgchip-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 详情弹窗：dsh 原生 Dialog 观感（layer-1 表面 / 16 圆角 / 突出投影 / 标准按钮） */
.dsh-si-mask { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, .24)); }
.dsh-si-dialog { box-sizing: border-box; width: min(480px, 100%); max-height: min(600px, 82vh); display: flex; flex-direction: column; gap: 12px;
  padding: 16px; border-radius: var(--dsw-radius-lg, 16px); color: var(--dsw-alias-label-primary, #e8eefa); overflow-y: auto;
  font-family: var(--dsw-font-family, inherit);
  background: var(--dsw-alias-bg-layer-1, #232324);
  border: .5px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, .08));
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l4, rgba(255, 255, 255, .2));
  box-shadow: var(--dsw-elevation-prominent, 0 0 0 .5px var(--dsw-elevation-stroke-color), 0 8px 28px rgba(0, 0, 0, .28)); }
.dsh-si-dialog-head { display: flex; align-items: center; gap: 8px; }
.dsh-si-dialog-title { flex: 1 1 auto; min-width: 0; font-size: 16px; font-weight: 500; line-height: 24px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-si-dialog-x { flex: 0 0 auto; width: 24px; height: 24px; padding: 0; border: 0; border-radius: var(--dsw-radius-xs, 4px); cursor: pointer;
  background: transparent; color: var(--dsw-alias-label-tertiary, #8a9096); font-size: 15px; line-height: 1; }
.dsh-si-dialog-x:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, .08)); }
.dsh-si-dialog-quote { box-sizing: border-box; flex: 1 1 auto; min-height: 40px; max-height: 240px; overflow: auto; padding: 10px 12px; border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-bg-module-platform, rgba(255, 255, 255, .06));
  border-left: 2px solid var(--dsw-alias-state-business-primary, #3a83f7);
  font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; overflow-wrap: anywhere; }
.dsh-si-dialog-label { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary, #8a9096); }
.dsh-si-dialog-detail { font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; overflow-wrap: anywhere; }
.dsh-si-dialog-comment { box-sizing: border-box; width: 100%; min-height: 64px; max-height: 160px; resize: vertical; padding: 8px 10px;
  font-size: 14px; line-height: 22px; font-family: inherit; color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, .06)); border: .5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, .12));
  border-radius: var(--dsw-radius-sm, 8px); outline: none; }
.dsh-si-dialog-comment:focus {
  border-color: var(--dsw-alias-state-business-primary, #3a83f7);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary, #3a83f7) 16%, transparent);
}
.dsh-si-dialog-foot { display: flex; align-items: center; gap: 8px; }
.dsh-si-dialog-spacer { flex: 1 1 auto; }
.dsh-si-dialog-btn { height: 30px; padding: 0 14px; font-size: 13px; font-weight: 500; line-height: 20px; cursor: pointer;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-button-elevated-fill, transparent);
  border: .5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, .12)); border-radius: var(--dsw-radius-sm, 8px); }
.dsh-si-dialog-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, .08)); }
.dsh-si-dialog-btn.ghost { background: transparent; border-color: transparent; color: var(--dsw-alias-label-secondary); }
.dsh-si-dialog-btn.ghost:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, .08)); }
.dsh-si-dialog-btn.primary { color: var(--dsw-alias-label-primary-foreground, #fff);
  background: var(--dsw-alias-button-primary-fill, #3a83f7); border-color: transparent; }
.dsh-si-dialog-btn.primary:hover { background: var(--dsw-alias-button-primary-hover, #4f8ef9); }
.dsh-si-dialog-btn.danger { background: transparent; border-color: transparent; color: var(--dsw-alias-state-error-primary, #f87171); }
.dsh-si-dialog-btn.danger:hover { background: var(--dsw-alias-interactive-bg-hover-danger, rgba(248, 113, 113, .12)); }
/* 划选评论编辑器：照抄 Trae CommentEditorCard（solo-lite 7920 包源码）——
   previewCommentCardContainer（菜单底/1px 中性描边/radius 8/双层阴影）内嵌
   commentEditorCard（320px/padding 8/gap 4 列布局）；无标题无预览无取消钮，
   单行 = 透明自增 textarea（13px/20px，max-height 140）+ ✓ 主按钮；Enter 提交、
   Shift+Enter 换行、Esc/点外取消。 */
.dsh-si-comment-editor { position: fixed; z-index: 1300; box-sizing: border-box; width: 320px; padding: 8px;
  display: flex; flex-direction: column; gap: 4px;
  border-radius: var(--dsw-radius-sm, 8px); color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family, inherit); background: var(--dsw-specific-menu, #202124);
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, .1));
  box-shadow: 0 2px 6px rgba(0, 0, 0, .19), 0 .5px rgba(255, 255, 255, .06), inset 0 .5px rgba(255, 255, 255, .06);
  overflow: hidden;
  transition: width .25s cubic-bezier(.4, 0, .2, 1), height .25s cubic-bezier(.4, 0, .2, 1);
  visibility: hidden; }
.dsh-si-comment-row { display: flex; align-items: center; gap: 8px; }
.dsh-si-comment-input { flex: 1; min-width: 0; box-sizing: border-box; background: none; border: none; outline: none; resize: none;
  color: var(--dsw-alias-label-primary); font-family: var(--dsw-font-family, inherit);
  font-size: 13px; font-weight: 400; line-height: 20px; max-height: 140px;
  padding: 0 8px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, .16)) transparent; }
.dsh-si-comment-input::placeholder { color: var(--dsw-alias-label-tertiary); }
.dsh-si-comment-submit { flex: 0 0 auto; width: 24px; height: 24px; padding: 0; display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 6px; cursor: pointer;
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, .12)); color: var(--dsw-alias-label-primary); }
.dsh-si-comment-submit:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, .2)); }
.dsh-si-comment-submit:disabled { opacity: .5; cursor: default; }
/* 点击标签跳源时对源元素的闪烁高亮。 */
.dsh-cp-flash { outline: 2px solid var(--dsw-alias-state-business-primary, #3a83f7) !important; outline-offset: 1px; border-radius: 3px; transition: outline-color .3s ease; }
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
  /* 划选引用：输入框内联 chip（官方 reference source）+ /context 同步    */
  /* ------------------------------------------------------------------ */

  const selectionItems = new Map()      // id -> item（发送后归档，供消息正文的 chip 渲染）
  const selectionSyncTimers = new Map()
  const selectionActions = new Map()    // sessionId -> InputActions
  const selectionDetailSubs = new Set()
  let selectionDetailRequest = null
  let selectionSessions = null          // ClientSessions 服务（取每会话 binding.ctx 发输入事件）
  let selectionIdSeq = 0
  let selectionStorageTimer = null

  const tokenOf = (id) => `[选段#${id}]`
  const previewOf = (text, max = 220) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

  /** 选区矩形兜底：菜单给的 rect 失效时退回锚点元素/默认位置。 */
  const normalizeSelectionRect = (rect, anchorEl) => {
    const finite = (n) => typeof n === 'number' && Number.isFinite(n)
    if (rect && finite(rect.left) && finite(rect.top) && finite(rect.right) && finite(rect.bottom)) return rect
    const el = anchorEl instanceof Element ? anchorEl : null
    if (el) {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
    }
    return { left: 16, top: 80, right: 16, bottom: 80, width: 0, height: 0 }
  }

  /** chip 标签：Trae 是 `N. 选段文本 · 评论`（评论内联在标签里）。
   * 有评论时把选段压到 ~14 字（Trae 的 text-content 也只占 50%），
   * 否则 240px 的 chip 会把评论整段挤没。 */
  const chipTextOf = (seq, text, comment) => {
    const quote = String(text ?? '').replace(/\s+/g, ' ').trim()
    const note = String(comment ?? '').replace(/\s+/g, ' ').trim()
    if (!note) return `${seq}. ${quote}`
    const head = quote.length > 14 ? `${quote.slice(0, 14)}…` : quote
    return `${seq}. ${head} · ${note.slice(0, 40)}`
  }
  const chipLabelOf = (item) => `${CHIP_MARK}${chipTextOf(item.seq, item.text, item.comment)}`

  /**
   * 某条 chip 在 detect 坐标里的跨度。occurrences 的 offset 是 clipboard
   * 坐标（chip 展开成 clipboardText），detect 坐标里每条 chip 只占 1 个
   * U+FFFC——把前面所有 chip 的 (length-1) 扣掉即得。
   */
  function chipSpanOf(occurrences, ref, draftRev) {
    const own = (occurrences ?? []).find((occ) => occ.source === SELECTION_SOURCE && occ.ref === ref)
    if (!own) return null
    let start = own.offset
    for (const occ of occurrences) if (occ.offset < own.offset) start -= occ.length - 1
    return { start, end: start + 1, draftRev }
  }

  /** 当前草稿里真实存在的条目，按草稿里的先后顺序（Trae 的编号顺序）。 */
  function liveSelectionItems(sessionId, occurrences) {
    if (!sessionId) return []
    const seen = new Set()
    const live = []
    for (const occ of occurrences ?? []) {
      if (occ.source !== SELECTION_SOURCE || seen.has(occ.ref)) continue
      seen.add(occ.ref)
      const item = selectionItems.get(occ.ref)
      if (item && item.sessionId === sessionId) live.push(item)
    }
    return live
  }

  async function postContext(sessionId, items) {
    if (!sessionId) return
    try {
      await fetch(`${ENDPOINT}/context`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          items: items.map(({ text, comment }) => ({
            text: String(text ?? '').slice(0, CONTEXT_TEXT_MAX),
            comment: String(comment ?? '').slice(0, CONTEXT_COMMENT_MAX),
          })),
        }),
        keepalive: true,
      })
    } catch { /* 网络失败时服务端保留上一份，不打断输入 */ }
  }

  /** 服务端 /context 同步：150ms 防抖；发送意图用 immediate flush。 */
  function syncSelectionContext(sessionId, items, immediate) {
    if (!sessionId) return
    const previous = selectionSyncTimers.get(sessionId)
    if (previous) clearTimeout(previous)
    const send = () => {
      selectionSyncTimers.delete(sessionId)
      void postContext(sessionId, items)
    }
    if (immediate) send()
    else selectionSyncTimers.set(sessionId, setTimeout(send, 150))
  }

  /** 落 sessionStorage：消息正文的 chip 在刷新后仍有文本/评论可渲染。 */
  function persistSelectionItems() {
    if (typeof sessionStorage === 'undefined' || selectionStorageTimer) return
    selectionStorageTimer = setTimeout(() => {
      selectionStorageTimer = null
      try {
        const snapshot = [...selectionItems.values()].slice(-120).map((item) => ({
          id: item.id,
          sessionId: item.sessionId,
          seq: item.seq,
          text: item.text,
          comment: item.comment,
          sent: item.sent === true,
          at: item.at,
        }))
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
      } catch { /* 配额/隐私模式：忽略 */ }
    }, 400)
  }

  function loadSelectionItems() {
    if (typeof sessionStorage === 'undefined') return
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]')
      if (!Array.isArray(saved)) return
      for (const raw of saved) {
        if (!raw?.id || !raw?.text) continue
        const id = String(raw.id)
        if (selectionItems.has(id)) continue
        const sessionId = String(raw.sessionId ?? '')
        const seq = Number(raw.seq) || 0
        selectionItems.set(id, {
          id, sessionId, seq,
          text: String(raw.text),
          comment: String(raw.comment ?? ''),
          anchor: null,
          sent: raw.sent === true,
          archived: true, // 历史条目：chip 已不在草稿里，只用于消息正文展示
          at: Number(raw.at) || Date.now(),
        })
      }
    } catch { /* 存档损坏：忽略 */ }
  }

  /** 走会话作用域的 slash/input-insert-reference 事件把 chip 插进官方编辑器。 */
  function applySelectionInsert(sessionId, item, span) {
    if (!span) return false
    const binding = selectionSessions?.binding?.(sessionId)
    const actx = binding?.ctx
    if (!actx) return false
    const request = {
      reference: {
        source: SELECTION_SOURCE,
        ref: item.id,
        label: chipLabelOf(item),
        clipboardText: tokenOf(item.id),
      },
      span,
    }
    try {
      if (typeof actx.bail === 'function') {
        try { return actx.bail(actx, 'slash/input-insert-reference', request) === true }
        catch { /* 有些版本只接受 (name, payload) */ }
        try { return actx.bail('slash/input-insert-reference', request) === true }
        catch { return false }
      }
      if (typeof actx.emit === 'function') {
        actx.emit(actx, 'slash/input-insert-reference', request)
        return true
      }
    } catch { return false }
    return false
  }

  /** 删除一条 chip：用 insertText('') 替换它的 detect 跨度（空文本即删除）。 */
  function applySelectionRemove(sessionId, item, span) {
    if (!span) return false
    const actions = selectionActions.get(sessionId)
    if (typeof actions?.insertText !== 'function') return false
    try { return actions.insertText('', span) === true } catch { return false }
  }

  function requestSelectionDetail(sessionId, id, focus) {
    selectionDetailRequest = { sessionId, id, focus: focus === true }
    for (const listener of selectionDetailSubs) {
      try { listener() } catch { /* ignore */ }
    }
  }

  loadSelectionItems()

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
    // 评论编辑器在 React 侧保存后要提示，复用这个文档级 toast。
    window.__dshSuperinputToast = toast

    /* 四选项横条（用户拍板恢复 0.8.x 形态）：复制 / 引用文本（官方
     * insertQuote 机制）/ 添加评论（Trae 评论卡 → chip）/ 存为模板。
     * 官方自己的浮动「引用文本」pill 用 CSS 隐藏——横条里的「引用文本」
     * 调同一个官方 API，避免双浮层。 */
    let showTimer = 0
    document.addEventListener('selectionchange', () => {
      try {
        if (showTimer) { clearTimeout(showTimer); showTimer = 0 }
        const selection = window.getSelection?.()
        const text = String(selection ?? '').trim()
        if (!text || !selection.rangeCount) { hide(); return }
        showTimer = setTimeout(() => {
          try {
            const sel = window.getSelection?.()
            const current = String(sel ?? '').trim()
            if (!current || !sel.rangeCount) { hide(); return }
            const node = sel.anchorNode
            const el = node instanceof Element ? node : node?.parentElement
            // 只收对话正文：跳过输入区、我们自己的弹层，以及侧栏/设置等非对话区域
            if (!el || el.closest('[data-dsh-superinput-portal]') || el.closest('[contenteditable="true"], textarea, input')) { hide(); return }
            if (!el.closest('[data-chat-flow], [data-slot="conversation.chat.flow"]')) { hide(); return }
            const rect = sel.getRangeAt(0).getBoundingClientRect()
            if (!rect || (rect.width === 0 && rect.height === 0)) { hide(); return }
            const container = ensureHost()
            // 横排四项 ≈320px：左缘对齐选区，右侧防溢出
            container.style.left = `${Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - 330))}px`
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
              b.addEventListener('click', () => { void action(current, el, rect) })
              return b
            }
            menu.append(
              mkItem('复制', copySel),
              mkItem('引用文本', quoteToComposer),
              mkItem('添加评论', (text2) => openComment(text2, el, rect)),
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

    /** 官方「引用文本」同款：inputActions.insertQuote 插 Markdown blockquote。
     * plain 模式限制下返回 false 时，退回草稿桥手写 `> ` 前缀（发送后官方
     * quoteRule 一样渲染成引用样式）。 */
    const quoteToComposer = (text) => {
      hide()
      const insert = window.__dshSuperinputInsertQuote
      if (typeof insert === 'function' && insert(text) === true) { toast('已引用到输入框'); return }
      try {
        const set = window.__dshSuperinputSetDraft
        if (!set) { toast('输入框桥未就绪，刷新后重试'); return }
        const block = text.split('\n').map((line) => `> ${line}`).join('\n')
        const current = String(window.__dshSuperinputDraft?.() ?? '')
        set(current ? `${current}\n${block}` : block)
        toast('已引用到输入框')
      } catch {
        toast('引用失败')
      }
    }

    /** Trae 的「添加评论」：在选区旁弹评论卡，保存后才插 chip（带评论）。
     * rect 是选区矩形，React 侧用它把卡片锚在选区附近。 */
    const openComment = (text, anchorEl, rect) => {
      hide()
      const open = window.__dshSuperinputCommentContext
      if (typeof open !== 'function') { toast('评论编辑器未就绪，刷新后重试'); return }
      let status = 'failed'
      try {
        status = open(text, anchorEl, {
          left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
          width: rect.width, height: rect.height,
        })
      } catch { status = 'failed' }
      if (status === 'full') toast(`最多添加 ${CONTEXT_MAX} 段对话内容`)
      else if (status === 'empty') toast('选段为空')
      else if (status === 'failed') toast('打开评论编辑器失败')
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

    /* Trae dragDropMention 等价：把对话里划选的文字拖进输入框，落成引用 chip。
     * dragstart 时对选区打自定义 dataTransfer 标记 + stash 文本；dragover 放行
     * composer；drop 拦截宿主的纯文本插入，走 __dshSuperinputDropContext 插 chip。 */
    let dragSelection = null // { text, anchorEl }
    document.addEventListener('dragstart', (event) => {
      try {
        const selection = window.getSelection?.()
        const text = String(selection ?? '').trim()
        const node = selection?.anchorNode
        const el = node instanceof Element ? node : node?.parentElement
        if (!text || !el?.closest?.('[data-chat-flow], [data-slot="conversation.chat.flow"]')
          || el.closest?.('[contenteditable="true"], textarea, input')) { dragSelection = null; return }
        dragSelection = { text: text.slice(0, CONTEXT_TEXT_MAX), anchorEl: el }
        try { event.dataTransfer?.setData('application/x-dsh-selection', '1') } catch { /* 标记失败只影响识别 */ }
      } catch { dragSelection = null }
    }, true)
    document.addEventListener('dragover', (event) => {
      try {
        if (!dragSelection) return
        const target = event.target
        if (!(target instanceof Element) || !target.closest?.('[contenteditable="true"]')) return
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      } catch { /* ignore */ }
    }, true)
    document.addEventListener('drop', (event) => {
      try {
        if (!dragSelection) return
        const target = event.target
        if (!(target instanceof Element) || !target.closest?.('[contenteditable="true"]')) return
        event.preventDefault()
        event.stopPropagation()
        const { text, anchorEl } = dragSelection
        dragSelection = null
        // 尽力把光标挪到落点：宿主 captureInsertion 读到哪就是哪。
        try {
          const range = typeof document.caretRangeFromPoint === 'function'
            ? document.caretRangeFromPoint(event.clientX, event.clientY)
            : null
          if (range) {
            window.getSelection()?.removeAllRanges()
            window.getSelection()?.addRange(range)
          }
        } catch { /* 定位失败就落原 caret */ }
        const insert = window.__dshSuperinputDropContext ?? window.__dshSuperinputAddContext
        if (typeof insert === 'function') {
          const status = insert(text, anchorEl)
          const toast = window.__dshSuperinputToast
          if (typeof toast === 'function') {
            if (status === 'added') toast('已添加到对话')
            else if (status === 'dup') toast('该选段已在列表中')
            else if (status === 'full') toast(`最多添加 ${CONTEXT_MAX} 段对话内容`)
          }
        }
      } catch { /* ignore */ }
    }, true)
    document.addEventListener('dragend', () => { dragSelection = null }, true)
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

  /** 详情弹窗：Trae 点 chip 打开的**只读** Dialog（引用全文 + 评论 + 跳转原文）。
   * 评论不在这个弹窗里编辑——Trae 的评论在选区旁的 previewCommentCard 输入；
   * 这里只展示结果（与 ai-modules-chat 的 mention-info-modal 同构）。 */
  function SelectionDetail({ title, text, comment, onNavigate, onClose }) {
    const maskRef = React.useRef(null)

    /* 桌面壳（Electron）里 body 会变成 0×0 的 fixed 包含块：`inset: 0` 的遮罩
     * 缩在左下角，弹窗被裁掉。打开后量一次遮罩实际矩形，若没有铺满视口，
     * 就按测量偏移把遮罩校正回视口原点并铺满——不依赖宿主沿用哪种 portal。 */
    React.useEffect(() => {
      const mask = maskRef.current
      if (!mask || typeof window === 'undefined') return undefined
      let corrected = false
      const fix = () => {
        const vw = window.innerWidth
        const vh = window.innerHeight
        if (!corrected) {
          const rect = mask.getBoundingClientRect()
          if (rect.width >= vw * 0.8 && rect.height >= vh * 0.8) return
          corrected = true
          mask.style.position = 'fixed'
          mask.style.inset = 'auto'
          mask.style.left = `${-rect.left}px`
          mask.style.top = `${-rect.top}px`
          mask.style.display = 'flex'
          mask.style.alignItems = 'center'
          mask.style.justifyContent = 'center'
          report(`selection dialog: corrected mask ${Math.round(rect.width)}x${Math.round(rect.height)}@${Math.round(rect.left)},${Math.round(rect.top)} to viewport ${vw}x${vh}`)
        }
        mask.style.width = `${vw}px`
        mask.style.height = `${vh}px`
        mask.style.boxSizing = 'border-box'
      }
      fix()
      window.addEventListener('resize', fix)
      return () => window.removeEventListener('resize', fix)
    }, [])

    return h('div', {
      ref: maskRef,
      className: 'dsh-si-mask',
      onMouseDown: (event) => { event.stopPropagation(); onClose?.() },
    },
      h('div', {
        className: 'dsh-si-dialog',
        onMouseDown: (event) => event.stopPropagation(),
        onClick: (event) => event.stopPropagation(),
      },
        h('div', { className: 'dsh-si-dialog-head' },
          h('span', { className: 'dsh-si-dialog-title' }, title),
          h('button', { className: 'dsh-si-dialog-x', 'aria-label': '关闭', onClick: () => onClose?.() }, '×')),
        h('div', { className: 'dsh-si-dialog-quote' }, text),
        comment ? h(React.Fragment, null,
          h('div', { className: 'dsh-si-dialog-label' }, '评论'),
          h('div', { className: 'dsh-si-dialog-detail' }, comment)) : null,
        h('div', { className: 'dsh-si-dialog-foot' },
          onNavigate ? h('button', { className: 'dsh-si-dialog-btn', onClick: onNavigate }, '跳转原文') : null,
          h('span', { className: 'dsh-si-dialog-spacer' }),
          h('button', { className: 'dsh-si-dialog-btn ghost', onClick: () => onClose?.() }, '关闭')))
    )
  }

  /** 划选评论编辑器：照抄 Trae CommentEditorCard——无标题/无预览/无取消钮，
   * 单行 = 透明自增 textarea + ✓ 按钮；Enter 提交、Shift+Enter 换行、
   * Esc/点外取消；IME 组合期不提交。锚在选区旁，不遮罩。 */
  function SelectionCommentEditor({ draft, onSave, onCancel }) {
    const [value, setValue] = React.useState(draft.comment ?? '')
    const cardRef = React.useRef(null)
    const inputRef = React.useRef(null)
    const valueRef = React.useRef(value)
    React.useEffect(() => { valueRef.current = value }, [value])

    // textarea 自增高（Trae 同款：height auto → scrollHeight，上限 140）
    React.useEffect(() => {
      const el = inputRef.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`
    }, [value])

    React.useEffect(() => {
      const card = cardRef.current
      if (!card || typeof window === 'undefined') return
      const vw = window.innerWidth
      const vh = window.innerHeight
      const margin = 8
      const width = Math.min(320, vw - margin * 2)
      card.style.width = `${width}px`
      const height = card.getBoundingClientRect().height || 44
      const rect = draft.rect ?? {}
      let left = Math.min(Math.max(margin, (rect.left ?? 16) + 20), Math.max(margin, vw - width - margin))
      let top = (rect.bottom ?? 80) + 8
      if (top + height > vh - margin) top = Math.max(margin, (rect.top ?? 80) - height - 8)
      // 先放到期望位置；桌面壳若把 fixed 包含块变成 0×0，再按实际偏差校正。
      card.style.visibility = 'hidden'
      card.style.left = `${left}px`
      card.style.top = `${top}px`
      const actual = card.getBoundingClientRect()
      const dx = actual.left - left
      const dy = actual.top - top
      if (Math.abs(dx) > 1) card.style.left = `${left - dx}px`
      if (Math.abs(dy) > 1) card.style.top = `${top - dy}px`
      card.style.visibility = 'visible'
      const textarea = card.querySelector('textarea')
      if (textarea) {
        textarea.focus()
        textarea.setSelectionRange?.(textarea.value.length, textarea.value.length)
      }
    }, [draft])

    React.useEffect(() => {
      const onDown = (event) => {
        if (cardRef.current?.contains(event.target)) return
        onCancel?.()
      }
      document.addEventListener('mousedown', onDown, true)
      return () => document.removeEventListener('mousedown', onDown, true)
    }, [onCancel])

    const submit = () => {
      if (!value.trim()) return
      onSave?.(value)
    }

    return createPortal(h('div', {
      ref: cardRef,
      className: 'dsh-si-comment-editor',
      onMouseDown: (event) => event.stopPropagation(),
      onClick: (event) => event.stopPropagation(),
    },
      h('div', { className: 'dsh-si-comment-row' },
        h('textarea', {
          ref: inputRef,
          className: 'dsh-si-comment-input',
          rows: 1,
          value,
          placeholder: '输入你的评论...',
          'aria-label': '输入你的评论...',
          onInput: (event) => setValue(event.target.value),
          onKeyDown: (event) => {
            if (event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229) return
            event.stopPropagation()
            if (event.key === 'Escape') { event.preventDefault(); onCancel?.() }
            else if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
              event.preventDefault()
              submit()
            }
          },
        }),
        h('button', {
          className: 'dsh-si-comment-submit',
          title: draft.comment ? '保存' : '评论到对话',
          'aria-label': draft.comment ? '保存' : '评论到对话',
          disabled: !value.trim(),
          onClick: submit,
        },
          h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true },
            h('path', {
              d: 'M13.5 4.5L6.5 11.5L2.5 7.5',
              fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8',
              'stroke-linecap': 'round', 'stroke-linejoin': 'round',
            }))))
    ), document.body)
  }

  /** 划选引用桥：把「添加到对话」插成输入框内的官方 reference chip。
   * Trae 的引用是编辑器里的内联节点（conversation-selection-mention-symbol），
   * dsh 对外只开放 reference chip 这一条内联通道——这里注册自定义 source，
   * 用 slash/input-insert-reference 落 chip，并按 Trae 规格重着色。
   * 输入框上方不再有独立 pill 行。 */
  function SelectionContextBridge({ session, useInput, inputActions }) {
    const sessionId = session?.sessionId === undefined ? '' : String(session.sessionId)
    const draftRev = useInput((state) => state?.draftRev ?? 0)
    const occurrences = useInput((state) => state?.occurrences)
    const phase = useInput((state) => state?.phase)
    const snapshotRef = React.useRef({ draftRev, occurrences })
    const actionsRef = React.useRef(inputActions)
    const previousPhase = React.useRef(phase)
    const [, setVersion] = React.useState(0)
    const [dialog, setDialog] = React.useState(null)
    const [editor, setEditor] = React.useState(null)
    const bump = () => setVersion((value) => value + 1)

    React.useEffect(() => {
      snapshotRef.current = { draftRev, occurrences }
      actionsRef.current = inputActions
    }, [draftRev, occurrences, inputActions])

    React.useEffect(() => {
      if (!sessionId || !inputActions) return undefined
      selectionActions.set(sessionId, inputActions)
      return () => {
        if (selectionActions.get(sessionId) === inputActions) selectionActions.delete(sessionId)
      }
    }, [sessionId, inputActions])

    /** 发送意图：把当前 chip 立即同步给服务端（pre-step 读取），并标记发送。 */
    const flushForSend = () => {
      if (!sessionId) return
      const live = liveSelectionItems(sessionId, snapshotRef.current.occurrences)
      if (live.length === 0) return
      syncSelectionContext(sessionId, live, true)
      for (const item of live) item.sent = true
      persistSelectionItems()
    }

    /** 插入/更新一条选段 chip；comment === undefined 表示「不改已有评论」。 */
    const insertSelection = (text, anchorEl, comment) => {
      const clean = String(text ?? '').trim().slice(0, CONTEXT_TEXT_MAX)
      if (!clean) return { status: 'empty' }
      const live = liveSelectionItems(sessionId, snapshotRef.current.occurrences)
      const existing = live.find((entry) => entry.text === clean)
      if (existing) {
        if (comment !== undefined) {
          const next = String(comment ?? '').slice(0, CONTEXT_COMMENT_MAX).trim()
          if (next !== (existing.comment ?? '')) {
            existing.comment = next
            const span = chipSpanOf(snapshotRef.current.occurrences, existing.id, snapshotRef.current.draftRev)
            if (span) applySelectionInsert(sessionId, existing, span)
            bump()
            syncSelectionContext(sessionId, liveSelectionItems(sessionId, snapshotRef.current.occurrences), false)
            persistSelectionItems()
          }
        }
        return { status: 'dup', id: existing.id, item: existing }
      }
      if (live.length >= CONTEXT_MAX) return { status: 'full' }
      const actions = actionsRef.current
      if (typeof actions?.captureInsertion !== 'function') return { status: 'failed' }
      let span
      try {
        const insertion = actions.captureInsertion()
        // 折叠到选区末尾：只插入、不替换用户已选中的草稿文字。
        span = { start: insertion.end, end: insertion.end, draftRev: insertion.draftRev }
      } catch { return { status: 'failed' } }
      // 显示序号按当前输入框里的条目数重排（Trae 每个草稿从 1 开始）。
      const seq = live.reduce((max, entry) => Math.max(max, entry.seq ?? 0), 0) + 1
      const id = `${Date.now().toString(36)}${(++selectionIdSeq).toString(36)}`
      const item = {
        id, sessionId, seq,
        text: clean,
        comment: comment === undefined ? '' : String(comment ?? '').slice(0, CONTEXT_COMMENT_MAX).trim(),
        anchor: anchorEl instanceof Element ? new WeakRef(anchorEl) : null,
        sent: false,
        archived: false,
        at: Date.now(),
      }
      if (!applySelectionInsert(sessionId, item, span)) return { status: 'failed' }
      selectionItems.set(id, item)
      bump()
      syncSelectionContext(sessionId, [...live, item], false)
      persistSelectionItems()
      return { status: 'added', id, item }
    }

    /** 删除一条选段：chip + 条目 + 服务端同步（hover × / 编辑器移除共用）。 */
    const dropSelectionItem = (item) => {
      if (!item) return
      const span = chipSpanOf(snapshotRef.current.occurrences, item.id, snapshotRef.current.draftRev)
      if (span) applySelectionRemove(item.sessionId, item, span)
      selectionItems.delete(item.id)
      bump()
      syncSelectionContext(item.sessionId, liveSelectionItems(item.sessionId, snapshotRef.current.occurrences), false)
      persistSelectionItems()
    }

    React.useEffect(() => {
      const was = previousPhase.current
      previousPhase.current = phase
      if (was !== 'submitting' && phase === 'submitting') flushForSend()
    }, [phase, sessionId])

    // 发送按钮 / Enter 比 phase 更早、更可靠；window capture 先于宿主监听。
    React.useEffect(() => {
      if (!sessionId) return undefined
      const onClick = (event) => {
        const target = event.target
        if (target?.closest?.('button[aria-label*="发送消息"], button[aria-label*="Send"], button[aria-label*="send"]')) flushForSend()
      }
      const onKey = (event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
        if (!event.target?.closest?.('[contenteditable="true"]')) return
        flushForSend()
      }
      window.addEventListener('click', onClick, true)
      window.addEventListener('keydown', onKey, true)
      return () => {
        window.removeEventListener('click', onClick, true)
        window.removeEventListener('keydown', onKey, true)
      }
    }, [sessionId])

    // 草稿里的 chip 被键盘删掉 / 发送后清空：以 occurrences 为真相修剪条目。
    React.useEffect(() => {
      if (!sessionId) return
      const refs = new Set()
      for (const occ of occurrences ?? []) if (occ.source === SELECTION_SOURCE) refs.add(occ.ref)
      let changed = false
      for (const [id, item] of selectionItems) {
        if (item.sessionId !== sessionId) continue
        if (item.archived) {
          // 草稿恢复出的历史 chip：重新激活，参与同步
          if (refs.has(id)) { item.archived = false; item.sent = false; changed = true }
          continue
        }
        if (refs.has(id)) continue
        if (item.sent) { item.archived = true; changed = true; continue }
        selectionItems.delete(id)
        changed = true
      }
      if (changed) bump()
      syncSelectionContext(sessionId, liveSelectionItems(sessionId, occurrences), false)
      persistSelectionItems()
    }, [occurrences, sessionId])

    // 详情弹窗请求（chip 点击 → source.openReference；添加成功后也会主动打开）。
    React.useEffect(() => {
      if (!sessionId) return undefined
      const listener = () => {
        const request = selectionDetailRequest
        if (!request || request.sessionId !== sessionId) return
        selectionDetailRequest = null
        const item = selectionItems.get(request.id)
        if (!item) return
        setEditor(null)
        setDialog({ id: request.id })
      }
      selectionDetailSubs.add(listener)
      listener()
      return () => { selectionDetailSubs.delete(listener) }
    }, [sessionId])

    // Trae 的两个入口（previewCommentCard）：
    // - 添加到对话：先插 chip，再把选区旁的卡片原位切成评论编辑器（addThenComment）；
    // - 评论到对话：先弹评论卡片，保存后才插 chip（带评论）。
    React.useEffect(() => {
      if (!sessionId) return undefined
      const add = (text, anchorEl, rect) => {
        const result = insertSelection(text, anchorEl, undefined)
        if (result.status === 'added' || result.status === 'dup') {
          const item = result.item ?? (result.id ? selectionItems.get(result.id) : null)
          if (item) {
            // Trae addThenComment：chips 已经进输入框，卡片原位切换为评论编辑。
            setDialog(null)
            setEditor({
              id: item.id,
              text: item.text,
              comment: item.comment ?? '',
              anchorEl: anchorEl instanceof Element ? anchorEl : null,
              rect: normalizeSelectionRect(rect, anchorEl),
            })
          }
        }
        return result.status
      }
      const openComment = (text, anchorEl, rect) => {
        const clean = String(text ?? '').trim().slice(0, CONTEXT_TEXT_MAX)
        if (!clean) return 'empty'
        const live = liveSelectionItems(sessionId, snapshotRef.current.occurrences)
        const existing = live.find((entry) => entry.text === clean)
        if (!existing && live.length >= CONTEXT_MAX) return 'full'
        setDialog(null)
        setEditor({
          id: existing?.id ?? null,
          text: clean,
          comment: existing?.comment ?? '',
          anchorEl: anchorEl instanceof Element ? anchorEl : null,
          rect: normalizeSelectionRect(rect, anchorEl),
        })
        return 'opened'
      }
      window.__dshSuperinputAddContext = add
      window.__dshSuperinputCommentContext = openComment
      // Trae dragDropMention 同义：拖放进来的引用只插 chip，不弹评论卡
      //（拖拽是快速引用手势；要评论走划选菜单的「评论到对话」）。
      window.__dshSuperinputDropContext = (text, anchorEl) => insertSelection(text, anchorEl, undefined)
      return () => {
        if (window.__dshSuperinputAddContext === add) delete window.__dshSuperinputAddContext
        if (window.__dshSuperinputCommentContext === openComment) delete window.__dshSuperinputCommentContext
        if (window.__dshSuperinputDropContext === insertSelection) delete window.__dshSuperinputDropContext
      }
    }, [sessionId])

    // chip 悬停时左侧图标变 ×（Trae remove-mention-icon）；点左侧 20px 移除。
    React.useEffect(() => {
      if (!sessionId) return undefined
      const onClick = (event) => {
        const target = event.target
        const chip = target?.closest?.('span[title]')
        if (!chip || !chip.closest?.('[contenteditable="true"]')) return
        if (!String(chip.title || '').startsWith(CHIP_MARK)) return
        const rect = chip.getBoundingClientRect()
        if (event.clientX > rect.left + 20 || !chip.matches(':hover')) return
        const label = String(chip.title)
        const item = [...selectionItems.values()].find((entry) => entry.sessionId === sessionId && chipLabelOf(entry) === label)
        if (!item) return
        event.preventDefault()
        event.stopPropagation()
        dropSelectionItem(item)
      }
      document.addEventListener('click', onClick, true)
      return () => document.removeEventListener('click', onClick, true)
    }, [sessionId])

    const navigateTo = (item) => {
      try {
        const el = item.anchor?.deref?.()
        if (el?.isConnected) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('dsh-cp-flash')
          setTimeout(() => el.classList.remove('dsh-cp-flash'), 1600)
        }
      } catch { /* 锚点失效：静默降级 */ }
    }

    /** 评论卡片保存：已有条目更新评论，新条目插 chip（带评论）。 */
    const saveEditorComment = (comment) => {
      const draft = editor
      if (!draft) return
      const next = String(comment ?? '').slice(0, CONTEXT_COMMENT_MAX).trim()
      const existing = draft.id ? selectionItems.get(draft.id) : null
      if (existing) {
        if (next !== (existing.comment ?? '')) {
          existing.comment = next
          const span = chipSpanOf(snapshotRef.current.occurrences, existing.id, snapshotRef.current.draftRev)
          if (span) applySelectionInsert(existing.sessionId, existing, span)
          bump()
          syncSelectionContext(existing.sessionId, liveSelectionItems(existing.sessionId, snapshotRef.current.occurrences), false)
          persistSelectionItems()
          window.__dshSuperinputToast?.('已保存评论')
        }
      } else {
        const result = insertSelection(draft.text, draft.anchorEl, next)
        if (result.status === 'added' || result.status === 'dup') window.__dshSuperinputToast?.('已添加到对话')
        else if (result.status === 'full') window.__dshSuperinputToast?.(`最多添加 ${CONTEXT_MAX} 段对话内容`)
        else if (result.status === 'failed') window.__dshSuperinputToast?.('保存失败')
      }
      setEditor(null)
    }

    const dialogItem = dialog ? selectionItems.get(dialog.id) : null
    const editorNode = editor ? h(SelectionCommentEditor, {
      key: `comment:${editor.id ?? 'new'}:${editor.text}`,
      draft: editor,
      onSave: saveEditorComment,
      onCancel: () => setEditor(null),
    }) : null
    const detailNode = dialogItem ? createPortal(h(SelectionDetail, {
      title: `${dialogItem.seq}. ${previewOf(dialogItem.text, 48)}`,
      text: dialogItem.text,
      comment: dialogItem.comment,
      onNavigate: dialogItem.anchor ? () => navigateTo(dialogItem) : null,
      onClose: () => setDialog(null),
    }), document.body) : null
    if (!editorNode && !detailNode) return null
    return h(React.Fragment, null, editorNode, detailNode)
  }

  /** 消息正文的选段 chip：user-text 规则把 token 换成同款标签（Trae 消息里的
   * mention chip 同义）。刷新后条目由 sessionStorage 恢复。 */
  const selectionUserTextRule = {
    id: SELECTION_RULE,
    order: 5,
    match(text, from) {
      const re = /\[选段#([0-9a-z]+)\]/g
      re.lastIndex = from
      const found = re.exec(text)
      if (!found) return undefined
      const item = selectionItems.get(found[1])
      if (!item) return undefined
      return {
        id: SELECTION_RULE,
        start: found.index,
        end: found.index + found[0].length,
        data: { id: item.id, seq: item.seq, text: item.text, comment: item.comment },
      }
    },
  }

  function SelectionMessageChip({ node, interactive }) {
    const data = node?.data ?? {}
    const [open, setOpen] = React.useState(false)
    const label = chipTextOf(data.seq, data.text, data.comment)
    return h(React.Fragment, null,
      h('span', {
        className: `dsh-si-msgchip${interactive ? ' interactive' : ''}`,
        title: data.text,
        onClick: interactive ? () => setOpen(true) : undefined,
      },
        h('span', { className: 'dsh-si-msgchip-icon', 'aria-hidden': true }),
        h('span', { className: 'dsh-si-msgchip-label' }, label)),
      open ? createPortal(h(SelectionDetail, {
        title: label,
        text: data.text,
        comment: data.comment,
        onClose: () => setOpen(false),
      }), document.body) : null)
  }

  /** 草稿桥：划选「添加评论」、模板插入、/ 命令插入、横条「引用文本」共用。
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
      // 官方「引用文本」同款 API（0.2.2-rc.1 起可用）：plain 模式下插 blockquote
      window.__dshSuperinputInsertQuote = (text) => {
        try { return typeof inputActions?.insertQuote === 'function' && inputActions.insertQuote(text) === true } catch { return false }
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
    inject: ['slots', 'sessions', 'uiConversation'],
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

      /* 划选引用的官方 input source：codec 决定 chip 的粘贴文本与送模文本；
       * candidates 恒空——只是借 @ 触发器的注册位拿到一个合法的自定义
       * source（官方 chip 插入/序列化按 source 名路由），不往 @ 菜单加条目。 */
      const selectionSource = {
        trigger: '@',
        name: SELECTION_SOURCE,
        showGroupTitle: false,
        async candidates() { return [] },
        onPick() { return undefined },
        openReference(session, reference) {
          const targetSession = session?.sessionId === undefined ? '' : String(session.sessionId)
          const ref = String(reference?.ref ?? '')
          if (!targetSession || !selectionItems.has(ref)) return false
          requestSelectionDetail(targetSession, ref, false)
          return true
        },
        codec: {
          clipboardText: (ref) => tokenOf(ref),
          serialize: async (ref) => tokenOf(ref),
        },
      }
      ctx.inject(['inputTriggers'], (scope) => {
        try {
          const service = scope.get('inputTriggers')
          ctx.effect(() => service.registerSource(selectionSource), 'dsh-superinput: selection source')
        } catch (error) {
          report(`selection source register failed: ${error?.message ?? error}`)
        }
      })
      ctx.inject(['sessions'], (scope) => {
        selectionSessions = scope.get('sessions')
      })

      // 消息正文里的同款 chip：user-text 规则 + 节点渲染槽位。
      ctx.inject(['uiConversation'], (scope) => {
        try {
          const ui = scope.get('uiConversation')
          if (typeof ui?.userText?.register === 'function') {
            ctx.effect(() => ui.userText.register(selectionUserTextRule), 'dsh-superinput: selection user-text rule')
          }
        } catch (error) {
          report(`selection user-text rule failed: ${error?.message ?? error}`)
        }
      })
      ctx.slots.inject('conversation.user.text.node', () => ctx.slots.register({
        name: 'conversation.user.text.node',
        key: SELECTION_RULE,
        priority: 20,
      }, SelectionMessageChip))

      // 草稿桥挂 input.dock（该槽位注入 useInput / inputActions）
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'dsh-superinput-prompts-bridge',
        order: 96,
      }, PromptsDraftBridge))

      // 划选引用桥：chip 已内联在编辑器里，这个槽位只提供入口与详情弹窗。
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'dsh-superinput-selection-context',
        order: 97,
      }, (props) => h(PromptsBoundary, null, h(SelectionContextBridge, props))))
    },
  }
}
