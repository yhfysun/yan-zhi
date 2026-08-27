# 1. 抽取只读选择器

- [x] 1.1 新建 `McpServerPicker.vue`
- [x] 1.2 提供 `modelValue` 和只读展示模式

# 2. 清理 ToolMarket

- [x] 2.1 移除 MCP 服务概览、新增卡片、编辑/删除/详情按钮
- [x] 2.2 移除 `showMcpTools`、`mcpCurrentTools`、`mcpToolsServerId` 及相关弹窗
- [x] 2.3 将 MCP 服务入口替换为跳转 `/mcp` 的只读卡

# 3. 统一来源

- [x] 3.1 工具卡片统一来源展示
- [x] 3.2 `ToolMarket` 引用 `McpServerPicker` 只读 server 名

# 4. 验证

- [ ] 4.1 浏览器走查 `/mcp` 与 `/tools`
- [x] 4.2 运行 `npx openspec validate --all`
