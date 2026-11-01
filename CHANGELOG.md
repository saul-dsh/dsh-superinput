# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
