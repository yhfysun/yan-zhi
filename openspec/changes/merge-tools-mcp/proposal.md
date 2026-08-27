# 为什么

`ToolMarket.vue` 在“工具商城”里内嵌了 MCP 服务概览、新增、编辑、删除、工具列表弹窗，与 `Mcp.vue` 的职责完全重叠。用户会在两个入口看到同一批 MCP 服务，造成“到底在哪管理服务器”的困惑，也放大了后续改动的回归面。

# 改什么

- MCP 服务器增删改查、连接、工具/资源/日志查看只保留在 `Mcp.vue`。
- `ToolMarket.vue` 只负责工具商城：本地/远程商城、工具浏览、安装、启用、发布、编辑与删除。
- 抽取 `McpServerPicker.vue`，让 `ToolMarket.vue` 或其他页面只读引用已注册的 MCP server，用于标识工具来源，不重复管理服务器。
- 统一工具来源标签：`内置`、`自定义`、`MCP`、`Skill`。

# 影响

- `packages/ui/src/views/ToolMarket.vue`：移除 MCP 管理 UI 与对应 script 状态、函数。
- `packages/ui/src/views/Mcp.vue`：成为 MCP 唯一管理页。
- `packages/ui/src/components/McpServerPicker.vue`：新增只读选择器。
- `packages/ui/src/stores/mcp.ts`：保持共享数据源，不新增 API。

# 验收目标

- MCP 服务管理不再出现双入口。
- 工具市场不能新增/编辑/删除 MCP server。
- `McpServerPicker` 在两个页面只读引用同一数据源，状态一致。
- `npx openspec validate --all` 通过。
