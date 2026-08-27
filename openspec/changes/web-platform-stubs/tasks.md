# 1. Web 文件与数据库

- [x] 1.1 `WebFs` 返回明确 `NotSupportedError`，浏览器端显式降级
- [x] 1.2 `WebDatabase.exec` 未知 SQL 显式失败并记录结构化 warning
- [x] 1.3 `WebDatabase.query` 未知查询显式失败并记录结构化 warning

# 2. Desktop MCP stdio

- [x] 2.1 Electron `main.cjs` 已实现完整 stdio JSON-RPC；Tauri 壳明确不支持并返回错误
- [x] 2.2 不能完整实现时在 `mcp_start` 返回明确 capability，UI 禁用 stdio

# 3. Server api_* 工具

- [x] 3.1 整理现有 `api_*` 工具清单
- [x] 3.2 未实现工具显式返回不支持，配置页禁用

# 4. Anthropic embeddings

- [x] 4.1 暴露 `supportsEmbeddings`
- [x] 4.2 UI 隐藏 Anthropic embedding 入口

# 5. 验证

- [ ] 5.1 浏览器 Web 端文件上传/读取走查
- [x] 5.2 运行 `npx openspec validate --all`
