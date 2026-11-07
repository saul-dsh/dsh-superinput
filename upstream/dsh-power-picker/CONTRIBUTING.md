# 贡献指南

感谢你愿意改进这个插件。

## 提 Issue 之前

先看 README 的「已知边界」一节。仍然需要提 issue 时，请带上：

- 操作系统与版本
- dsh 版本（`dsh --version`）
- 复现步骤：做了什么、期望什么、实际什么
- DevTools 控制台里 `[dsh-power-picker]` 开头的日志（尤其 `snapshot keys:`）

## 提 PR 之前

1. 先开 issue 讨论，避免方向不对白写一版。
2. 一个 PR 只做一件事。
3. 跑一遍自检：

```sh
node --check index.js
node --check client.js
```

4. 改了行为就更新 README。
5. 提交信息用 `feat:` / `fix:` / `docs:` / `refactor:` / `chore:` 前缀。

## 代码约定

- **只用官方通路**。读目录/切换模型一律走 `modelDirectories`（subscribe/getSnapshot/select），不碰内部 RPC、不伪造目录数据。
- **遮蔽而非破坏**。靠 single 槽位的 priority 语义遮蔽内置选择器，不删改内置 DOM。
- **快照字段防御式读取**。dsh 升级可能改字段名；`readSnapshotShape` 是唯一的字段映射点，别在组件里到处取字段。
- **失败留后路**。组件崩溃渲染为空（ErrorBoundary）；`enabled: false` 必须能完整恢复内置选择器。

## 客户端改动特别注意

- `conversation.input.model` 是 single 槽位，`priority: -1` 是遮蔽的关键，改动前先理解 ui-slots 的 "lowest renders" 语义。
- 滑条是离散档位：拖拽只做本地预览，松手才 `select`，避免刷 RPC。
- 子代理会话（`subagentAddress !== undefined`）不渲染座位。

## 本地联调

```sh
dsh plugin --profile web add /absolute/path/to/dsh-power-picker
dsh plugin --profile desktop add /absolute/path/to/dsh-power-picker
```

改完 `client.js` / `index.js` 需要重启 dsh 才生效。

## License

提交 PR 即表示你同意以 [MIT](LICENSE) 协议授权你的贡献。
