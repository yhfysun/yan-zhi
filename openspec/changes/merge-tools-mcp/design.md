# Context

`packages/ui/src/stores/mcp.ts` 已经集中保存 `servers`、`tools`、`resources` 和连接状态。`Mcp.vue` 是完整管理页；`ToolMarket.vue` 当前又内嵌了一套 mini card、新增卡片、`showMcpTools` / `mcpCurrentTools`、`editMcpServer` / `delMcp` 等重复逻辑。

# Goals / Non-Goals

**Goals:**

- 单一 MCP 管理入口。
- 工具市场仍能引用 MCP server 数据，但只能读。
- 抽出的 picker 可复用。

**Non-Goals:**

- 不重写 MCP store 或后端协议。
- 不把工具商城也并进 MCP 管理页。

# Decisions

## 1. 单一入口

所有 MCP 服务器生命周期操作归属 `Mcp.vue`。`ToolMarket.vue` 删除 MCP mini 管理区，替换为跳转到 `/mcp` 的只读提示卡或来源选择器。

## 2. 只读 picker

`McpServerPicker.vue` 通过 `useMcpStore()` 读取 `servers`，提供 `modelValue` 与 `readonly` 语义，不暴露新增、删除、连接接口。

## 3. 来源标签

工具卡片展示 `source` 的统一 label，`source === 'mcp'` 时通过 picker 显示 server 名，`source === 'skill'` 时显示 Skill 名。

# Risks / Trade-offs

- 删除 ToolMarket 内嵌 MCP 功能可能让原入口用户短期不习惯。通过“管理 MCP 服务”链接引导到 `/mcp`。
- 抽取 picker 时要保持 `modelValue` 类型兼容。
