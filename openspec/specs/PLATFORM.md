# 言智平台基线

## Purpose

记录三端共享 UI 的导航、市场边界和平台适配契约，作为后续布局与拆分变更的基线锚点。

## Platform boundaries

- 共享 UI：`packages/ui` 为 Electron 桌面端、Web 端和移动端提供统一界面。
- 导航：桌面端使用带文字的左侧导航；宽屏 Web 使用 52px 图标 dock；移动端使用底部 TabBar。
- 市场：Skills、ToolMarket、Agents 各自维护本地、远程和商城入口；商城 API 由服务端统一暴露。

## Platform adapters

- 文件系统通过 `FsAdapter` 抽象，桌面端接 Tauri/Rust，Web 端接 File System Access API 或 IndexedDB。
- MCP 服务器管理集中在 `Mcp.vue`，ToolMarket 仅引用 MCP 服务和工具商城。
- 模型平台、Skill、工具和智能体均可通过 REST Marketplace 协议跨节点发现与复制。
