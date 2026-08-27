# 为什么

Web 端文件系统与数据库适配器仍有全量 `throw`、静默忽略和返回空数组的桩逻辑；桌面端 MCP stdio 只返回占位 JSON；服务端 `api_*` 工具列表没有明确能力声明；Anthropic embeddings 能力缺少上层降级提示。这些位置看起来像“功能没完成”，而不是受平台约束的明确能力边界。

# 改什么

- `apps/web/src/platform.ts`：
  - `WebFs` 改用 File System Access API 或 IndexedDB 文件存储；确实无法运行时给明确错误，而不是一律 `throw`。
  - `WebDatabase` 增加明确能力声明，不支持的 SQL 不再静默忽略。
- `apps/desktop/src-tauri/src/commands/mcp.rs`：实现 stdio JSON-RPC 请求/响应，或显式关闭 stdio 并在 UI 禁用。
- `apps/server/src/mcp/api-tool-executor.ts`：补充缺失的 `api_*` 工具，或返回“不支持”清单，供智能体配置时禁用。
- `packages/core/src/llm/client.ts`：提供 Anthropic embeddings 支持状态，UI 对 Anthropic 模型隐藏 embeddings 相关入口。

# 影响

- `apps/web/src/platform.ts`
- `apps/desktop/src-tauri/src/commands/mcp.rs`
- `apps/server/src/mcp/api-tool-executor.ts`
- `packages/core/src/llm/client.ts`
- 可能影响 MCP 服务 UI 对 stdio transport 的可用性判断。

# 验收目标

- Web 端文件读写可用，或不可用时给明确、可降级的提示。
- 数据库不支持的 SQL 不再静默吞错。
- MCP stdio 要么真实可用，要么 UI 禁用并说明“仅 SSE/HTTP”。
- `api_*` 工具要么可执行，要么在工具列表中不可选。
- `npx openspec validate --all` 通过。
