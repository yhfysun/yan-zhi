# Context

当前跨平台适配层已经抽象出 `FsAdapter`、`DatabaseAdapter`、`KeyringAdapter`。Web 端 `WebFs` 抛错、`WebDatabase` 对未知 SQL 打 warning 后继续执行；桌面端 `mcp_call` 明确标注 TODO；服务端 default 分支返回 `未实现的 API 工具`；Anthropic embeddings 直接抛错。

# Goals / Non-Goals

**Goals:**

- 把“桩”转成“可验证的能力”。
- 不实现不可能的平台能力时，显式降级而不是静默失败。

**Non-Goals:**

- 不重写数据库 schema。
- 不引入新的服务端依赖。
- 不改变 MCP 协议定义。

# Decisions

## 1. WebFs

浏览器存在 File System Access API 时，保留目录句柄到 IndexedDB，并在用户授权后支持 read/write/readDir；不支持时抛带降级文案的 `NotSupportedError`，而不是对所有路径统一 throw。

## 2. WebDatabase

`exec` 对 DDL 之外的未知 SQL 记录结构化 warning 并返回拒绝，而不是静默 return。`query` 对不支持的查询同样记录。

## 3. Desktop MCP stdio

Electron 主壳的 `main.cjs` 已实现完整 stdio JSON-RPC，适配器以 `McpProcessAdapter.supportsStdio = true` 声明该能力；UI 据此启用 stdio。未实现完整协议的最小壳（如 Tauri 壳）应在 `supportsStdio` 返回 false，并在 `mcp_call` 中明确报错，UI 会禁用 stdio 并提示改用 Electron 桌面端或 SSE/HTTP。

## 4. api_* 工具

在 `api-tool-executor.ts` 中维护显式 tool 清单；未实现的名称直接进入 default fail 分支，前端配置页不展示未注册的 api 工具。

## 5. Anthropic embeddings

`LlmClient` 暴露 `supportsEmbeddings` 只读能力；UI 对 `isAnthropic` 平台隐藏 embedding 配置入口。

# Risks / Trade-offs

- File System Access API 需要用户手势授权，且 Safari 支持不完整。用 IndexedDB 文件层兜底。
- Rust stdio 实现涉及子进程读写并发，必须加读写锁并防止 stdout 阻塞。
