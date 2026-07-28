# 言智 (Yan-Zhi) — 项目设计文档

## 1. 产品定位

言智是一款可以由语言完全控制的智能体平台应用。核心理念是"语言即界面"——项目所有管理接口都是大模型可直接调用的工具，用户通过自然语言聊天即可完成模型配置、工具管理、Skill 安装、智能体创建等所有操作。

项目覆盖桌面（Windows/macOS/Linux）、Web、移动端（iOS/Android）三端，统一一套 Vue 3 代码库。

## 2. 三层商城架构

```
┌──────────────────────────────────────────────────────────────┐
│                        言智 节点 A                            │
│                                                              │
│  ┌─ 工具管理 ──────────────────────────────────────────────┐ │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │ │
│  │ │MCP 服务  │ │内置工具  │ │自定义工具│ │同源商城工具│  │ │
│  │ │(已有保留)│ │(已有保留)│ │(新增)    │ │(新增)      │  │ │
│  │ │stdio     │ │file_read │ │JS 沙箱   │ │连接其他言智│  │ │
│  │ │SSE/HTTP  │ │file_write│ │执行      │ │节点拉取自定│  │ │
│  │ │          │ │web_search│ │          │ │义工具      │  │ │
│  │ └──────────┘ └──────────┘ └──────────┘ └────────────┘  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─ Skill 商城 ────────────────────────────────────────────┐ │
│  │ ┌──────────┐ ┌──────────┐ ┌────────────┐                │ │
│  │ │系统内置  │ │用户自建  │ │远程Skill商城│               │ │
│  │ └──────────┘ └──────────┘ └────────────┘                │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─ 智能体商城 ────────────────────────────────────────────┐ │
│  │ ┌──────────┐ ┌────────────┐                              │ │
│  │ │本地智能体│ │远程智能体商城│                             │ │
│  │ └──────────┘ └────────────┘                              │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─ 商城服务端 ────────────────────────────────────────────┐ │
│  │ 暴露标准化 API，供其他节点连接获取自定义工具/Skill/智能体 │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

每个商城维护本地列表 + 可配置的远程源列表。本项目可作为商城服务端，暴露标准化 API 供其他运行言智的节点连接。

## 3. 工具管理架构详解

### 3.1 工具分类

```
工具管理
│
├── 本地 MCP 服务（已有，保留）
│   ├── stdio（仅桌面端）— 启动子进程，stdin/stdout JSON-RPC 通信
│   ├── SSE（全端）— Server-Sent Events 长连接
│   └── Streamable HTTP（全端）— 单次 HTTP 流式
│   MCP 服务的工具由外部进程提供，项目本身只做连接和转发
│
├── 内置工具（已有，保留）
│   ├── file_read / file_write / web_search 等
│   ├── 项目原生编译在代码中，所有言智节点都一样
│   └── 不需要通过商城传输——每个节点天然就有
│
├── 自定义工具（新增）
│   ├── 用户通过 JS 代码编写的工具，沙箱执行
│   ├── 定义统一 CustomTool 协议，预留 Python/Java 扩展
│   ├── 可标记为"公开"，发布到同源商城供其他节点下载
│   └── 存储在本地 custom_tool 表
│
└── 同源商城工具（新增）
    ├── 连接其他言智节点的商城 API
    ├── 拉取对方已公开的「自定义工具」列表
    ├── 内置工具不需要拉取——每个节点都有，重复拉取无意义
    ├── 下载到本地后注册到 ToolRegistry，LLM 即可调用
    └── 执行时使用和本地自定义工具相同的沙箱机制
```

### 3.2 同源商城工具调用流程

```
节点 A（服务端）                        节点 B（客户端）
───────────────                        ───────────────
自定义工具 A1 (is_public=1)             
自定义工具 A2 (is_public=0, 不暴露)     
                                        │
                                        ├─ 1. 添加远程源
                                        │   URL: http://节点A:3001/api/marketplace
                                        │   type: tool
                                        │
                                        ├─ 2. 拉取工具列表
                                        │   GET /api/marketplace/tools
                                        │   返回: [A1]（仅公开的）
                                        │   （内置工具不在此列表中）
                                        │
                                        ├─ 3. 下载工具 A1
                                        │   GET /api/marketplace/tools/A1
                                        │   获取完整 code + schema
                                        │
                                        ├─ 4. 写入本地 custom_tool 表
                                        │   source = 'remote'
                                        │   remote_source_id = '节点A'
                                        │
                                        ├─ 5. 注册到 ToolRegistry
                                        │   LLM 可见，可调用
                                        │
                                        ├─ 6. LLM 调用 A1 时
                                        │   在节点 B 本地沙箱执行 A1 的代码
                                        │   （本地执行，不需要连节点 A）
```

## 4. CustomTool 协议

```typescript
interface CustomTool {
  name: string;               // 工具唯一名称
  description: string;        // 工具描述（给 LLM 看）
  inputSchema: JSONSchema;    // 入参 JSON Schema
  outputSchema?: JSONSchema;  // 出参 JSON Schema（可选）
  runtime: 'node' | 'python' | 'java'; // 运行时
  entry: string;              // 入口函数名
  code: string;               // 完整源代码
  dependencies?: string[];    // npm/pip/maven 依赖
  timeout?: number;           // 执行超时 ms，默认 30000
  env?: Record<string, string>; // 环境变量
}
```

首版仅支持 Node.js 运行时，代码在沙箱化 VM 中执行。Python/Java 运行时预留接口，后续通过子进程 + JSON-RPC 通信。

**内置工具 vs 自定义工具**：
- 内置工具：`execute` 逻辑编译在源码中，无 `code` 字段，所有节点都一样
- 自定义工具：`code` 存储在数据库，沙箱执行，可通过同源商城共享

## 5. Marketplace Protocol（统一商城 REST API 协议）

三种商城使用统一的响应格式：

```typescript
interface MarketplaceListResponse<T> {
  success: boolean;
  data: { items: T[]; total: number; page: number; pageSize: number; };
}
```

### Skill Marketplace API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/marketplace/skills` | GET | 分页获取 Skill 列表 |
| `/api/marketplace/skills/:id` | GET | 获取 Skill 详情 |
| `/api/marketplace/skills/search` | POST | 搜索 Skill |
| `/api/marketplace/skills/categories` | GET | 获取分类列表 |

### Agent Marketplace API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/marketplace/agents` | GET | 分页获取智能体列表 |
| `/api/marketplace/agents/:id` | GET | 获取智能体详情（含工作流定义） |
| `/api/marketplace/agents/search` | POST | 搜索智能体 |

### Tool Marketplace API（同源商城）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/marketplace/tools` | GET | 分页获取**自定义**工具列表（不含内置工具） |
| `/api/marketplace/tools/:id` | GET | 获取自定义工具详情（含 code、schema） |
| `/api/marketplace/tools/search` | POST | 搜索自定义工具 |

> 同源商城只传输自定义工具。内置工具每个节点编译时自带，不需要通过商城传输。

### 远程商城源配置

```typescript
interface RemoteMarketplaceSource {
  id: string;
  name: string;
  type: 'skill' | 'agent' | 'tool';
  baseUrl: string;
  authType: 'none' | 'bearer' | 'api-key' | 'basic';
  authConfig?: { token?: string; apiKey?: string; username?: string; password?: string; };
  enabled: boolean;
  createdAt: number;
}
```

`type: 'tool'` 的远程源为「同源商城工具源」，只拉取远程节点的自定义工具。

## 6. 数据库 Schema 扩展

新增表：

```sql
-- 自定义工具
CREATE TABLE custom_tool (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT,
  input_schema_json TEXT NOT NULL, output_schema_json TEXT,
  runtime TEXT NOT NULL DEFAULT 'node', entry TEXT NOT NULL, code TEXT NOT NULL,
  dependencies_json TEXT, timeout INTEGER DEFAULT 30000, env_json TEXT,
  enabled INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT 'local',
  remote_source_id TEXT, is_public INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

-- 远程商城源
CREATE TABLE remote_marketplace (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
  base_url TEXT NOT NULL, auth_type TEXT NOT NULL DEFAULT 'none',
  auth_config_enc TEXT, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);

-- 远程市场缓存
CREATE TABLE marketplace_cache (
  id TEXT PRIMARY KEY, remote_id TEXT NOT NULL REFERENCES remote_marketplace(id),
  item_type TEXT NOT NULL, item_id TEXT NOT NULL, data_json TEXT NOT NULL,
  cached_at INTEGER NOT NULL, UNIQUE(remote_id, item_type, item_id)
);
```

**现有表新增字段：**
- `skill`: 新增 `source`, `remote_source_id`, `is_public`
- `agent`: 新增 `source`, `remote_source_id`, `is_public`

> MCP 服务表（`mcp_server` / `mcp_tool`）保持不变，不受此次重构影响。

## 7. 接口工具化

所有页面操作接口注册为 LLM 可调用的内置工具函数：

```
模型平台管理:
  list_platforms       → GET  /api/platforms
  add_platform         → POST /api/platforms
  update_platform      → PATCH /api/platforms/:id
  delete_platform      → DELETE /api/platforms/:id
  list_models          → GET  /api/platforms/all-models
  add_model            → POST /api/platforms/:pid/models
  update_model         → PATCH /api/platforms/models/:mid
  delete_model         → DELETE /api/platforms/models/:mid
  sync_models          → POST /api/platforms/models/batch

MCP 服务管理:
  list_mcp_servers     → GET  /api/mcp-servers
  add_mcp_server       → POST /api/mcp-servers
  update_mcp_server    → PATCH /api/mcp-servers/:id
  delete_mcp_server    → DELETE /api/mcp-servers/:id
  list_mcp_tools       → GET  /api/mcp-servers/:id/tools
  update_mcp_tool      → PATCH /api/mcp-servers/:id/tools/:name
  refresh_mcp_tools    → PUT  /api/mcp-servers/:id/tools

工具管理（自定义）:
  list_custom_tools    → GET  /api/tools
  add_custom_tool      → POST /api/tools
  update_custom_tool   → PATCH /api/tools/:id
  delete_custom_tool   → DELETE /api/tools/:id
  enable_tool          → PATCH /api/tools/:id (enabled=1)
  disable_tool         → PATCH /api/tools/:id (enabled=0)

Skill 管理:
  list_skills          → GET  /api/skills
  add_skill            → POST /api/skills
  update_skill         → PATCH /api/skills/:id
  delete_skill         → DELETE /api/skills/:id

智能体管理:
  list_agents          → GET  (需新增路由)
  create_agent         → POST (需新增路由)
  update_agent         → PATCH (需新增路由)
  delete_agent         → DELETE (需新增路由)

商城管理:
  add_remote_source    → POST /api/remote-sources
  remove_remote_source → DELETE /api/remote-sources/:id
  list_remote_sources  → GET  /api/remote-sources
  search_marketplace   → POST /api/marketplace/:type/search
  install_from_market  → POST (下载远程内容到本地)

商城服务端:
  toggle_marketplace   → 开启/关闭本节点商城服务
  set_marketplace_auth → 配置商城访问权限

会话管理:
  list_conversations   → GET  /api/conversations
  create_conversation  → POST /api/conversations
  delete_conversation  → DELETE /api/conversations/:id
```

## 8. 设置页面 — 服务端连接信息

设置页面的「商城服务端」区域需要展示本节点的连接信息：

- **本机 IP 地址**：自动检测并显示（优先局域网 IP，便于其他节点连接）
- **服务端口**：默认 3001，支持自定义
- **完整连接 URL**：`http://<IP>:<port>/api/marketplace`
- **复制连接地址**按钮：一键复制供其他节点粘贴使用

这样其他运行言智的节点就能直接在「添加远程商城源」中填入该 URL 完成连接。

## 9. 已知问题

### 9.1 Anthropic 协议未实现

类型定义（`Protocol = 'openai' | 'anthropic' | 'custom'`）和 UI 中声明了 Anthropic 协议选项，但 `LlmClient`（`packages/core/src/llm/client.ts`）只实现了 OpenAI 兼容协议：

- 所有请求硬编码走 `/v1/chat/completions`、`/v1/models`、`/v1/embeddings` 端点
- 鉴权头写死 `Authorization: Bearer xxx`
- 请求体和响应解析均为 OpenAI 格式

Anthropic Messages API 与之不兼容（端点不同、`x-api-key` 头、system prompt 单独放置、tool_use 格式不同）。选 Anthropic 协议的平台实际无法使用。需要后续为 LlmClient 增加协议适配层，根据 platform.protocol 切换请求格式。
- 从同源商城下载的工具在本地沙箱执行，不依赖远程节点
