# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.11.5] - 2026-11-07

### chip 对齐官方编辑器引用节点 + 评论卡毛玻璃

- **chip 照官方编辑器引用节点（`_quote_at713`）重做**：无底/无框/无圆角、
  文字 `state-business-primary` 蓝、14px/20px、max-width min(80%,300px)、
  baseline 对齐、❝ 引用标记 hover 变 ×（官方 closeMark 同款交互）——与
  官方「引用文本」插进输入框的引用节点**在编辑器里视觉完全一致**（此前
  Trae 式灰底胶囊和官方引用节点同框反差明显）。消息内 chip 同步。
- **评论卡背景加官方毛玻璃**：`--dsw-specific-menu` 本身是半透明底，必须
  配 `--dsw-menu-backdrop-filter`（官方弹卡成对规则）——修复「评论框背景
  太透明」。

## [0.11.4] - 2026-11-07

### 横条样式对齐官方（QuoteSelection 令牌）

- 横条容器与条目按官方 QuoteSelection 按钮的令牌重做：**999px 胶囊圆角**
  （替代 12px）、`--dsw-alias-button-floating-fill` 底（替代 specific-menu
  + blur——官方无模糊）、`--dsw-elevation-panel` 阴影（border-l3 描边）、
  条目 `--dsw-font-xs-13` 13px + 字距 -.02em、hover/focus 用
  `button-floating-hover`。整条就是一个加宽的官方浮动 pill。

## [0.11.3] - 2026-11-07

### 恢复四选项横条（用户拍板），引用文本走官方 API

- 划选恢复 0.8.x 的**深色横排菜单条**：**复制 / 引用文本 / 添加评论 / 存为
  模板**。0.11.x 的独立 pill（官方样式吸附方案）退役——点击命中不稳。
- **「引用文本」走官方机制**：经草稿桥调用官方 `inputActions.insertQuote`
  （0.2.2-rc.1 新 API，plain 模式插 Markdown blockquote）；API 不可用时
  退回草稿桥手写 `> ` 前缀（发送后官方 quoteRule 一样渲染引用样式）。
- **官方浮动「引用文本」pill 隐藏**（`[class*="U4oBDW_action"]` display
  none）——横条里的同名功能调同一个官方 API，避免双浮层重叠、点击互遮。
- 添加评论 = Trae 评论卡 → chip（0.10.1 规格）；拖拽、去重、8 条上限不变。

## [0.11.2] - 2026-11-07

### 修复：pill 建了没挂进 DOM（游离节点不渲染）

- 0.11.1 的「添加评论」pill 创建后漏了 `document.body.appendChild`——元素
  游离在文档外，样式与逻辑全对也不会显示。补挂载。真机 CUA 复测路径：
  选区 → pill 出现（官方「引用文本」右侧）→ 点击 → 评论卡 → chip。

## [0.11.1] - 2026-11-07

### 修复：「添加评论」按钮不出现（interaction 分发首个即胜）

- **根因**：宿主 `uiConversation.interactions.dispatch` 按**注册顺序遍历、
  首个 open 即返回**——官方 `quote` 在 base bundle 先注册，自有
  `dsh-comment` interaction 永远轮不到分发，按钮自然不渲染（0.11.0 的
  同面板方案在宿主语义下行不通）。
- **改法**：撤销自有 interaction/槽位注册；「添加评论」改为**独立 pill，
  样式复用官方 `.U4oBDW_action` 类**（与官方「引用文本」视觉完全一致）。
  选区存在期间每帧扫描：官方 pill 就位则吸附其右侧 8px 拼成一条工具带，
  2 秒内未出现则回落选区上方；桌面壳 fixed 包含块偏移照评论卡同款校正；
  mousedown preventDefault 保住选区（官方同款），点击清选区后开 Trae
  评论卡。

## [0.11.0] - 2026-11-07

### 官方「引用文本」落地后的对齐：评论入口挂上官方选区动作面板

dsh 0.2.2-rc.1 官方新增 message-quotes 插件（选区 →「引用文本」→
`inputActions.insertQuote` → Markdown blockquote，消息渲染 QuotePreview）。
本版把套件的评论入口**移植到官方机制之上**：

- **旧 DOM 浮动菜单整体退役**（复制/评论到对话/添加到对话/存为模板）——
  官方面板 + 套件按钮取而代之，划选不再出现双浮层。
- **「添加评论」按钮挂进官方选区动作面板**：注册自有 interaction
  （`dsh-comment`，准入逻辑照抄官方 quote）+ `conversation.chat.text-interaction`
  槽（key `dsh-comment`）；按钮复用官方 `.U4oBDW_action` 类（浮动 pill：
  floating-fill 底/999px 圆角/`--dsw-font-xs-13`/panel 阴影），老宿主回落
  自带 `.dsh-si-quote-action` 同款声明。点击清选区 → 打开 Trae 评论卡
  （0.10.1 规格）→ 保存后插 chip（评论到对话流）。
- prompts 客户端 inject 增至 `['slots', 'sessions', 'uiConversation']`
  （interactions 注册需要；要求 dsh ≥ 0.2.2-rc.1）。
- 划选引用 chip（Trae 式评论流）与官方 blockquote 引用并存：两条路各自
  渲染（chip 走 user-text 规则，官方 blockquote 走 QuotePreview）。
- 拖拽引用、去重、8 条上限保留；「复制」「存为模板」菜单项随旧菜单移除
  （复制走 Ctrl+C；存模板走 Prompt 面板）。

## [0.10.1] - 2026-11-07

### 评论卡与引用 chip 按 Trae 源码重着色（solo-lite 7920 包逆向）

- **评论卡照抄 CommentEditorCard 真实规格**：去掉标题「评论到对话」、选段
  预览、取消/保存按钮排——Trae 的卡只有**单行 = 透明无边框自增 textarea
  （13px/20px，max-height 140）+ ✓ 主按钮（24px，空文本禁用）**；容器
  320px / padding 8 / 菜单底 / 1px 中性描边 / radius 8 / 双层阴影 /
  宽高 .25s 过渡；Enter 提交（IME 组合期保护）、Shift+Enter 换行、
  Esc/点外取消（取消按钮不存在——Trae 同款）。
- **chip 照 query-mention-symbol 规格**：高 22→18px、去描边、radius 8→4、
  business 蓝字 → 默认文字色、13px/500/字距 -.02em、padding 1px 6px 1px 4px；
  引号图标 → Trae 同款**气泡图标**（带三点，消息内 chip 同步）。
- 上一版 0.10.0 的 compaction 并入内容不变。

## [0.10.0] - 2026-11-07

### 压缩控制并入套件（compaction 模块，八模块定稿）

- **dsh-compaction-control 并入为 compaction 模块**：上下文占用圆环
  （`conversation.input.right` 槽位直渲染，模型选择器紧左侧）、压缩参数
  调节（profile 补丁层）、立即压缩、压缩前自动落档——全部随套件走。
  **独立插件应从 profile 卸载**（两 profile 已同步卸载），否则圆环双注册。
- pre-step 瀑布新增第三个监听（compaction 落档）；模块应用顺序在 enhancer
  之后，落档消息在增强之后追加、不会被二次改写。
- smoke 升级：ctx.on 桩改为瀑布链（同名事件多监听按注册顺序链式执行，
  套件合并后 pre-step 有 4 个监听）；断言 `/api/dsh-compaction-control`
  注册 + 全链注入一次性消费；补 payload.messages 字段（followup pre-step
  依赖真机宿主字段）。
- build 作业线：兼容上游尾部的 `export const __internals`（离线自测导出）。

## [0.9.1] - 2026-11-07

### 拖拽引用（Trae dragDropMention 等价）——最后一块对齐项

- 对话里划选的文字现在可以**直接拖进输入框**：dragstart 给选区打
  `application/x-dsh-selection` 标记并暂存文本；dragover 放行 composer；
  drop 拦截宿主的纯文本插入（window capture preventDefault +
  stopPropagation），尽力把光标定位到落点（caretRangeFromPoint），走
  `__dshSuperinputDropContext` 插 chip。
- 拖放只插 chip 不弹评论卡（Trae 拖拽即引用、无评论提示——要评论走划选
  菜单「评论到对话」）；去重 / 8 条上限 / 提示 toast 与划选路径一致。
- 至此与 Trae 的行为差异只剩实现说明项（dsh chip 走官方 reference 通道
  序列化送模，Trae 是 Lexical 原生节点——用户体验已对齐）。

## [0.9.0] - 2026-11-04

### 划选引用改为 Trae 同款「输入框内联 chip」

- **不再使用输入框上方的独立 pill 行**：注册自定义 input source
  （`superinput-selection`）+ 官方 `slash/input-insert-reference`，把选段直接
  插成编辑器里的 reference chip（与 @file 同一套机制）。chip 落在光标处，
  可与草稿文字混排、可整体删除；发送时按 source 的 codec 序列化为
  `[选段#id]` token。
- **chip 视觉**：保留 Trae `comment-mention` 的内联结构（高 22px / 12px 500 /
  max-width 240 / 评论内联在标签里），颜色与圆角改用 dsh 设计令牌
  （`state-business-tertiary` 底 + `state-business-primary` 文字 +
  `--dsw-radius-sm` 8px）；隐藏宿主默认的 @ 前缀，换成引号图标；hover 时
  图标变 ×，点左侧图标区即移除（Trae `remove-mention-icon` 同义）。
- **评论流程按 Trae 的 `previewCommentCard` 重做**：划选菜单新增「评论到
  对话」；「添加到对话」先插 chip，再把选区旁的小卡片**原位切成评论编辑器**
  （Trae `addThenComment` 同义）；「评论到对话」则不插 chip，保存后才带评论
  插入。编辑器是锚在选区旁的 340px 小卡片，不遮罩、点外取消；取消后已添加
  的 chip 保留（只是没有评论）。
- **点 chip 打开只读详情 Dialog**（引用全文 + 评论 + 跳转原文），评论不再在
  这个弹窗里编辑（与 Trae `mention-info-modal` 同构）。评论保存后重插同 ref
  的 chip 刷新标签：有评论时按 Trae `has-comment-content` 语义给评论留出
  可见空间（选段压到 ~14 字）；编号按当前草稿重排（每轮从 1 开始）。
- **已发送消息也显示 chip**：user-text 规则把 `[选段#id]` token 渲染成同款
  标签（点开可读全文/评论）；条目文本与评论落 sessionStorage，刷新后仍可
  渲染。
- 删除旧的独立 pill 行与 👁 排除切换（Trae 没有该交互）；去重、8 条上限、
  源文锚点跳转保留。发送按钮/Enter 触发 `/context` 立即 flush，服务端
  `agent/pre-step` 仍按会话一次性注入。
- **修桌面壳里详情弹窗错位**：Electron 壳会把 `body` 变成一个 0×0 的
  fixed 包含块，`inset: 0` 的遮罩缩在窗口左下角，弹窗被裁掉且没有遮罩。
  打开时测量遮罩实际矩形，未铺满视口就按测量偏移校正回视口原点并居中
  （border-box + resize 跟随）；Web 端铺满视口时不触发，保持原样。
- **UI 适配 Harness 设计令牌**：chip 从 Trae 的硬编码灰/蓝改为 dsh 的
  `state-business-tertiary` 底 + `state-business-primary` 文字 +
  `--dsw-radius-sm`，图标用 CSS mask 跟随文字色；详情弹窗改用
  `bg-layer-1` 表面、`--dsw-radius-lg`、`bg-mask-1` 遮罩、dsh 字体与
  标准按钮（主按钮黑/白、移除为幽灵红、跳转为幽灵文本），标题 16px，
  引用区弹性收缩；明暗主题随宿主 body 令牌自动切换。
- 真机验证（dsh web 0.2.1-rc.5）：添加 → 内联 chip → 评论 → 标签刷新 →
  hover × 删除 → 重复添加去重 → 发送（服务端日志 `items=1`）→ 已发送消息
  内的 chip；@ 菜单未被自定义 source 污染。

## [0.8.3] - 2026-11-02

### 划选弹层门槛降为非空即弹

- 此前要求划选 ≥4 字，双字词/单字不弹；按用户要求改为非空即弹（一个字也弹）。

## [0.8.2] - 2026-11-02

### 补齐与 Trae 的三处行为差距

- **去重**（Trae addContext 按 id 去重的同语义）：同一段选文不重复入列，
  重复添加时改为展开已有条目并提示「该选段已在列表中」。
- **👁 排除切换**（Trae eye/eyeClosed 同语义）：标签上新增 👁——临时排除
  不随发送但保留在列表，🚫 表示已排除可恢复；排除项同步 /context 时被
  过滤（永不注入）；排除态视觉 = 半透明 + 标签文本划线。
- **评论再编辑**：点标签内评论区域直接展开评论编辑（此前只有 💬 钮一条路）。

## [0.8.1] - 2026-11-02

### 引用标签按 Trae 真实规格重写（ai-modules-chat 逆向）+ 评论流程修复

- **深挖 @byted-icube/ai-modules-chat 后按真实规格重写**：Trae 的评论不是
  挂在卡片上的输入框，而是 `comment-mention-tag`——引用文本 · 💬 评论内联
  在一个 18px 标签里（padding 1px 6px 1px 4px、中性底 rgba(116,126,148,.18)、
  字重 500、字距 -.02em、评论气泡 12px 三级色）。dsh 标签照此重做（尺寸按
  dsh 行高微调），有评论时标签内直接显示评论内容（Trae has-comment-content
  同构）。
- **修「评论打不了字」**：评论框此前只拦 click，宿主输入框在 mousedown 阶段
  就抢走焦点——现在 mousedown/mouseup/click 全拦，添加后立即展开评论框并
  自动聚焦（Trae 也是采集时即收集评论）。
- **修发送后回写竞态**：150ms 防抖计时器在发送 flush 后仍会把旧数据写回
  /context，下一轮被重复注入——clearForSend 现在先撤销未触发的计时器。

## [0.8.0] - 2026-11-02

### 划选「添加到对话」：Trae 式引用 pill + 可评论上下文

- **交互对齐 Trae（逆向自 workbench.desktop.main.js 的
  `workbench.action.icubeAi.addToChat` 链路）**：卡片改为 Trae 同款引用
  pill（高 20px/圆角 4px/1px 描边/11px 字/单行省略，容器 flex wrap gap 4px，
  替代此前的 260px 大卡横滚）；添加时记录选区源锚点（WeakRef），**点 pill
  平滑滚回源文并闪烁高亮**（Trae 点击卡片 revealRangeInCenter 的同义实现，
  锚点断线静默降级）。
- 评论交互：pill 常态只显示「选段 N · 预览」，💬 钮展开全文预览 + 评论输入
  （Trae 在 SoloBrowser 采集 comment，这里延后到卡片上、密度更高）；有评论
  的 pill 文字提亮区分；Enter 收起、Esc 收起。移除仍走 pill 上的 ×。
- 划选菜单的「添加到对话」不再把文字直接塞进草稿，改为在输入框上方生成
  上下文卡片；最多 8 条。
- 评论或内容变化经 150ms 防抖同步到 prompts `/context`；点击发送按钮或
  输入框 Enter 时立即 flush、清空卡片，不依赖瞬时 phase 状态。
- 服务端在 `agent/pre-step` 按会话读取暂存，把「选段 + 评论」作为一条
  sourced UserMessage 追加到本轮送模消息末尾；注入后删除（one-shot，
  10 分钟 TTL），不影响后续回合。
- 修复会话 key 错配：`agent.session` 是 Session 对象而非字符串，改用
  `agent.session.id`；web 真机全链路验证通过（添加 → 评论 → 发送 →
  pre-step 注入日志）。
- 冒烟新增 `/context` 存储、pre-step 注入/一次性消费、客户端卡片注册断言。

## [0.7.1] - 2026-11-02

### 修复：划选菜单与模板插入的草稿桥丢失

- 0.4.0 移除 snippets 模块时，`__dshSuperinputSetDraft` / `__dshSuperinputDraft`
  的桥接赋值被一并删除；0.7.0 的划选「添加到对话」、模板插入、`/` 命令插入
  因此全部失效（前者只弹「草稿桥未就绪」）。
- prompts 新增 `conversation.input.dock` 草稿桥组件，恢复两个全局；真机验证
  划选后点「添加到对话」可正确写入输入框。
- 划选菜单限定在对话正文（`[data-chat-flow]`），侧栏/设置页划选不再弹出。
- 菜单 `mousedown` 阻止默认行为，避免清掉选区导致 click 前菜单消失。
- 无 Clipboard API 时不再假报「已复制」。
- 冒烟新增草稿桥静态断言（setter + input.dock 注册），防止再次整块丢失。

## [0.7.0] - 2026-11-02

### 发布工程（补 0.6.0 之后未归档的提交）

- `files` 白名单补入 `server.js`——此前 `index.js` 动态 import 的核心文件
  不在 npm 产物里，发布出去必然加载失败。
- `modules` 改为 `modules/*.js`，新增 `.npmignore` 排除 `.mimosa` 工具状态与
  日志、tarball；清掉 `modules/.mimosa` 本地残留。
- 移除 `files` 中并不存在的 `README.en.md`；描述从「八个模块 / 片段管理器」
  校正为当前七模块。
- 新增 `build` / `check` / `test` npm scripts，发布前可直接跑生成器、语法
  检查与冒烟测试。

### prompts 划选菜单增强

- 选区浮层改为横排三动作：**复制**、**添加到对话**（追加进输入框草稿）、
  **存为模板**；左缘对齐选区，右侧防溢出。
- 文档级单例 host + 安装守卫：宿主重挂载导致 apply 重跑时不再叠加多个浮层。

## [0.6.0] - 2026-11-01

### 吸收上游三件新功能（市场对标项）

- enhancer 0.3.0：✨ 面板新增「参考会话上下文」开关——增强时把最近一轮
  对话拼进改写参考，消解指代、贴合当前讨论（对标市场 dsh-prompt-rewriter
  205★ 的关键差异点）。
- cost 0.9.0：费用弹卡顶部新增「官方余额」行（选配 DeepSeek 开放平台
  apiKey，10 分钟缓存；调用明细弹窗已有）。
- picker 0.12.5：模型行相对价格 ×N 标记（上一版已并入，本版无新变更）。
- 同批配套：dsh-compaction-control 0.3.0 压缩前自动落档（套件外独立插件）。

## [0.5.0] - 2026-11-01

### 移除消息目录与会话导出（用户裁定）

- **outline（消息目录）与 exporter（会话导出 Markdown）整体移除**——上线
  不到半天被用户判定不需要。套件回到七模块：cost / picker / enhancer /
  followup / voice / prompts / hub。
- 多帧 zstd 会话日志直读与 /diag 通道经验保留在案（followup 与 prompts）。

## [0.4.0] - 2026-11-01

### 新增三模块 + 两处既有模块增强；移除草稿与片段（用户裁定）

- **outline（消息目录）**：状态行「目录」按钮 → 按用户消息列大纲（/outline
  端点直读会话日志），点击 TreeWalker 定位正文滚动跳转。
- **exporter（会话导出）**：标题栏 ⬇ 按钮 → /markdown 端点把整会话（用户+
  助手，连续助手快照去重）导出为 Markdown 下载；真机用真实会话日志验证
  （outline 4 条 / md 6527 字节 / 下载头正确）。
- **prompts 划选存模板**：对话正文划选后浮「存为模板」（selectionchange
  驱动，dblclick 选词后才成形），原生 DOM 渲染（React h() 产物过
  replaceChildren 会被强转成 "[object Object]"，真机踩过）。
- **cost 预算超限系统通知**：预算跨线 100% 时每周期弹一次系统通知（80%
  只走既有 UI 变色）。
- **picker 模型行价格标记**：按 dsh-cost /prices 档价算相对当前模型的 ×N
  倍数（>1 暖色），10 分钟缓存，取不到不显示。
- **移除 drafts（草稿快照/↑召回）与 snippets（片段管理器）**：用户裁定
  没什么用。诊断通道从 snippets /diag 迁到 prompts /diag（落
  superinput-debug.log）；hub 总览同步移除片段区；既有 snippets.json
  数据保留不再使用。
- 冒烟扩展：exporter 端点（缺参 400 / 未知会话 404）+ 九模块 apply。

## [0.3.4] - 2026-11-01

### 修复：/ 模板命令插入后草稿残留触发行（真机验证发现）

- 真机全链路验证（0.3.1 的 / 命令功能首次实机走查）：注册 → 官方 / 菜单
  「指令」组出现（label 中文可搜）→ 回车执行 → 模板入草稿，全部通过；
  唯一毛刺是 action 执行时草稿里还留着刚敲的 `/e2e`，官方壳清 token 与
  我们的 setDraft 时序竞争。修法：首行是无空格的 `/xxx` 就剥掉再接正文，
  两种时序下都只留模板内容。同轮确认使用计数（2次）与 / 按钮激活态正常。

## [0.3.3] - 2026-11-01

### 修复：followup chips 流式回合不实时渲染（自 dsh-followup 0.3.4 再生成）

- turn-tail 组件的 `isLatestTurn` effect 把 `boxRef.current` 捕获进闭包，
  流式重渲染重建回合尾容器后旧节点脱离 DOM，`contains` 恒 false——POST 与
  渲染都被挡，刷新才恢复。check() 改为每次现读 ref（真机四轮 CUA 实测：
  修复前两轮失败、修复后实时渲染 + 点 chip 填草稿全通过）。
- 客户端关键决策点 diag 落盘（snippets-debug.log 的 `followup:` 行）。
- 同轮真机验证：voice 模块叠加层在官方语音录音态正常出现/退出。

## [0.3.2] - 2026-11-01

### 修复：enhance /rewrite 请求期 "cannot get property \"llm\" without inject"

- **真机实锤（套件顶层 inject 授权不可靠的第二例）**：0.3.0 修复的
  tools.register 报错是 apply 期同款问题；本版发现 0.3.1 起的运行期版本——
  /rewrite 处理器把**外层 ctx** 传给 rewriteWithLlm，ctx.llm 在套件宿主里
  抛 cannot get property "llm" without inject，✨ 点增强永远 502（之前客户端
  出错只写 console，看起来就是「点了没反应」）。
- 修法（沿用 followup 模块的成熟模式）：webServer 嵌套作用域改成
  `ctx.inject(['webServer', 'llm'], ...)`、处理器改传 `webCtx`；工具 execute
  改传所在 `['llm','tools']` 作用域；pre-step 路径在嵌套作用域里捕获
  `llmRef`，未就绪时 fail-open 放行原文。上游 dsh-prompt-enhancer 0.2.9
  同步修复（独立安装形态同样受益），客户端增强失败从静默 console 改为
  按钮短暂红 ✕ + title 带原因，4 秒消退。

## [0.3.1] - 2026-11-01

### prompts 模板库：使用排序 / 导入导出 / 斜杠命令

- **最近使用排序**：点插入即计数（`uses` / `usedAt`），面板收藏组与全部组内
  按「最近使用 → 创建时间」排序，标题旁显示使用次数。
- **JSON 导入导出**：面板头部 ↓/↑ 两个按钮；导出走浏览器下载落系统下载目录
  （`dsh-prompts-YYYY-MM-DD.json`），导入弹系统文件选择框。服务端 `/import`
  按 id 合并：同 id 冲突保留 `at`（更新时间）较新的一方，id 不在库中按原 id
  收编（跨机重复导入可去重），空 body / 非法载荷拒绝，条目上限 5000。
- **注册为 / 斜杠命令**：模板行新增 `/` 切换按钮（opt-in，避免淹没官方菜单）。
  标记的模板经官方 `ctx.commandUi.register` 注册为 action 命令（`tpl-<slug>`
  前缀防撞宿主命令，标题即 label，/ 菜单按 label 模糊匹配中文可搜）；执行时
  经草稿桥插入，内置动态变量（日期/时间/星期）自动取值，手填变量保留 `{{名}}`
  由用户行内改。同名冲突按官方约定 fail loud，这里 try/catch 留痕跳过；
  标题修改/删除在面板刷新时注销重注册。
- **修复**：prompts 设置持久化引用了未导入的 `dirname`，每次防抖写盘都抛
  ReferenceError 被空 catch 吞掉——设置从来没落过盘。补导入后持久化恢复。
- **测试**：新增 `scripts/smoke.mjs`——桩服务逐模块 apply + prompts 端到端
  18 项断言（含导入合并/冲突/非法载荷），自动备份并恢复真实存储，随时可跑。

## [0.1.0] - 2026-10-31

### 首个版本：六模块超级输入框套件

- 由 dsh-cost / dsh-power-picker / dsh-prompt-enhancer / dsh-followup /
  dsh-siri-voice 机械搬迁 + 新模块 **snippets（片段管理器）** 组成：
  自动捕获 dsh 窗口内复制（copy 事件，指纹去重、上限 200 条、收藏不限），
  dock「片段」按钮弹官方样式面板（搜索 / 收藏 / 删除 / 点击追加到草稿）。
  能力边界：宿主无系统剪贴板桥，只捕获 dsh 窗口内复制。
- 服务端：Config 嵌套命名空间（config.cost.* 等，默认值经 schemastery
  嵌套解析验证）；peer 注入并集 llm+tools；模块级 try/catch 隔离。
- 客户端：单 __ModuleLoader__ 入口 + 六工厂内联，factory/apply 双层隔离。
- 生成器 `scripts/build-suite.mjs`：上游包更新后重跑即再生成（幂等），
  自动补 inject 再导出与缺失 Config 的空 schema 兜底。
- 验证：全文件语法通过；宿主环境 import 通过；嵌套 Config 解析断言通过
  （cost/followup/snippets/voice 默认值逐项核对）。
