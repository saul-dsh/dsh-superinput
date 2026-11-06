# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
