# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
