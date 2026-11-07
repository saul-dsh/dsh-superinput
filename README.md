# dsh-superinput

dsh（DeepSeek Harness）**超级输入框套件**：一个插件，八个输入区模块，模块级失败隔离。

| 模块 | 功能 | 来源 |
|---|---|---|
| **cost** | 费用引擎：状态行费用 pill、官方用量旁的费用按钮+弹卡、月底预测、设置页统计/预算/导出、历史回填、官方价格同步、汇率自动刷新、预算超限系统通知 | 原 dsh-cost |
| **picker** | 模型选择器接管 + 推理强度滑条 + 模型行相对价格标记（×N） | 原 dsh-power-picker |
| **enhancer** | 提示词增强按钮：点一下把草稿增强成结构化提示词，悬浮调强度，支持发送时自动增强 | 原 dsh-prompt-enhancer |
| **followup** | 回合尾跟进建议 chips | 原 dsh-followup |
| **voice** | 语音输入 | 原 dsh-siri-voice |
| **prompts** | Prompt 模板库：手动保存常用模板，{{变量}} 占位符插入，内置 {{日期}}/{{时间}}/{{星期}}/{{剪贴板}} 动态变量；最近使用排序、JSON 导入导出、可 opt-in 注册为 / 斜杠命令；划选正文浮出「复制 / 评论到对话 / 添加到对话 / 存为模板」菜单：**「添加到对话」先插 chip、再在选区旁原位弹出评论卡片（Trae addThenComment 同义）**；「评论到对话」先弹卡片、保存后才带评论插入；**划选文字可直接拖进输入框落 chip（dragDropMention 等价）**。chip 视觉走 dsh 设计令牌（business 色、`--dsw-radius-sm`、明暗主题自适应），hover 变 ×，点 chip 打开只读详情（全文 + 评论 + 跳转原文）；随下一条消息注入模型，并在已发送消息里以同款 chip 展示 | 新模块 |
| **compaction** | 上下文占用圆环（模型选择器紧左侧，官方 `conversation.input.right` 槽位直渲染）+ 压缩参数调节（阈值/保留比例，写 profile 补丁层）+ 立即压缩按钮 + 压缩前自动落档（占用上穿阈值-5% 时让 agent 先把任务状态写进工作区 checkpoint.md 再压缩） | 原 dsh-compaction-control |
| **hub** | 设置总览：各模块生效配置聚合展示 + 运行时调节 | 新模块 |

片段管理器（snippets）0.4.0、草稿（drafts）/消息目录（outline）/会话导出（exporter）0.5.0 起
按用户决定移除；既有 snippets.json 数据保留在原处不再使用。压缩控制（dsh-compaction-control）
0.10.0 起并入套件为 compaction 模块，独立插件应从 profile 卸载（避免圆环双注册）。

## 架构

- 服务端 `index.js` 聚合八个模块的 Config（嵌套命名空间 `config.cost.*` 等）并逐模块 try/catch 调用；peer 注入取并集（`llm`、`tools`）。
- 客户端 `client.js` 是单 `__ModuleLoader__` 入口：八个工厂内联（由 `scripts/build-suite.mjs` 从上游各包机械生成），factory 与 apply 双层 try/catch。
- pre-step 瀑布含多个监听（enhancer 增强、prompts 上下文注入、compaction 落档、followup 缓存），按注册顺序链式执行；compaction 在 enhancer 之后应用，落档消息不会被二次增强。
- 跨模块协作保持原机制：调用来源分账走 `globalThis.__dshPluginCall` 5s 窗口；各模块调试日志维持原路径（`~/.dsh/cost-debug.log` 等）。
- 划选引用：客户端注册自定义 input source（`superinput-selection`），用官方
  `slash/input-insert-reference` 把引段插成输入框内的 reference chip；条目
  「选段 + 评论」同步到 prompts `/context`，服务端在 `agent/pre-step` 以
  sourced UserMessage 注入下一轮，注入后立即消费。已发送消息里的 token 由
  user-text 规则渲染成同款 chip（sessionStorage 保留条目文本/评论）。

## 安装

```powershell
dsh plugin --profile desktop add <本目录绝对路径>
```

从五个独立插件迁移：先装套件、确认 bundles 里有 `dsh-superinput`、重启验证，再移除旧插件（避免同槽位双注册冲突）。装完完整重启 dsh。

## 上游更新

改了 `packages/dsh-*` 的源码后，在套件目录重跑 `node scripts/build-suite.mjs` 再生成 `modules/` 与 `client.js`（幂等）。

## License

MIT
