# dsh-superinput

dsh（DeepSeek Harness）**超级输入框套件**：一个插件，八个输入区模块，模块级失败隔离。

| 模块 | 功能 | 来源 |
|---|---|---|
| **cost** | 费用引擎：状态行费用 pill、官方用量旁的费用按钮+弹卡、月底预测、设置页统计/预算/导出、历史回填、官方价格同步、汇率自动刷新 | 原 dsh-cost |
| **picker** | 模型选择器接管 + 推理强度滑条 | 原 dsh-power-picker |
| **enhancer** | 提示词增强按钮：点一下把草稿增强成结构化提示词，悬浮调强度，支持发送时自动增强 | 原 dsh-prompt-enhancer |
| **followup** | 回合尾跟进建议 chips | 原 dsh-followup |
| **voice** | 语音输入 | 原 dsh-siri-voice |
| **snippets** | 片段管理器：自动捕获窗口内复制 → 收藏/搜索/点击插入草稿 | 新模块 |
| **prompts** | Prompt 模板库：手动保存常用模板，{{变量}} 占位符插入，内置 {{日期}}/{{时间}}/{{星期}}/{{剪贴板}} 动态变量；最近使用排序、JSON 导入导出、可 opt-in 注册为 / 斜杠命令 | 新模块 |
| **hub** | 设置总览：各模块生效配置聚合展示 + 运行时调节 | 新模块 |

`dsh-compaction-control` 不在套件内（宿主配置补丁层 + /compact 命令桥，保持独立插件）。

## 架构

- 服务端 `index.js` 聚合六个模块的 Config（嵌套命名空间 `config.cost.*` 等）并逐模块 try/catch 调用；peer 注入取并集（`llm`、`tools`）。
- 客户端 `client.js` 是单 `__ModuleLoader__` 入口：六个工厂内联（由 `scripts/build-suite.mjs` 从上游各包机械生成），factory 与 apply 双层 try/catch。
- 跨模块协作保持原机制：调用来源分账走 `globalThis.__dshPluginCall` 5s 窗口；各模块调试日志维持原路径（`~/.dsh/cost-debug.log` 等）。

## 安装

```powershell
dsh plugin --profile desktop add <本目录绝对路径>
```

从五个独立插件迁移：先装套件、确认 bundles 里有 `dsh-superinput`、重启验证，再移除旧插件（避免同槽位双注册冲突）。装完完整重启 dsh。

## 上游更新

改了 `packages/dsh-*` 的源码后，在套件目录重跑 `node scripts/build-suite.mjs` 再生成 `modules/` 与 `client.js`（幂等）。

## License

MIT
