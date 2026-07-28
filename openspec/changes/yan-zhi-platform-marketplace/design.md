## Context

言智（Yan-Zhi）是一款可以由语言完全控制的智能体平台。当前项目已实现基本的模型平台管理、MCP 服务管理、聊天工作台、Skill 管理和智能体编排。本次设计在保留 MCP 服务管理的基础上，新增自定义工具和同源商城工具能力，并为工具、Skill、智能体三个维度引入"本地+远程双市场"架构。

**当前状态**：
- MCP 服务管理通过 `apps/server/src/routes/mcp.ts` 提供 CRUD API
- 工具系统通过 `packages/core/src/tool/` 提供内置工具注册和执行
- Skill 管理通过 `packages/core/src/skill/loader.ts` 加载本地 Skill
- 前端使用 Vue 3 + Element Plus，存储在 Pinia stores 中

## Goals / Non-Goals

**Goals:**
- 保留 MCP 服务管理模块不变，在其基础上新增自定义工具和同源商城工具
- 定义 CustomTool 协议规范，支持 JS/Python/Java 多语言运行时
- 为工具、Skill、智能体分别建立本地商城 + 远程商城双市场架构
- 同源商城工具只传输自定义工具，内置工具每个节点都有无需传输
- 定义标准化的 Marketplace REST API 协议，支持跨节点互联
- 本项目可作为商城服务端暴露 API 供其他节点连接
- 所有管理接口工具化，支持通过聊天自然语言操控

**Non-Goals:**
- 不实现真实的多节点同步/联邦机制（仅定义协议）
- 不实现 Skill/Agent 的版本管理和冲突解决
- 不实现商城内容的审核/评分系统
- 不改变现有的聊天流式输出和上下文压缩逻辑
- Python/Java Runtime 仅定义协议，首版仅实现 Node.js 执行器

## Decisions

### 1. 三层商城架构

```
┌──────────────────────────────────────────────────────────────┐
│                        言智 节点 A                            │
│  ┌─ 工具管理 ──────────────────────────────────────────────┐ │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │ │
│  │ │MCP 服务  │ │内置工具  │ │自定义工具│ │同源商城工具│  │ │
│  │ │(已有保留)│ │(已有保留)│ │(新增)    │ │(新增)      │  │ │
│  │ └──────────┘ └──────────┘ └──────────┘ └────────────┘  │ │
│  └──────────────────────────────────────────────────────────┘ │
│  ┌─ Skill 商城 ──┐  ┌─ 智能体商城 ──┐                        │
│  │ 本地│远程     │  │ 本地│远程     │                        │
│  └───────────────┘  └───────────────┘                        │
│  ┌─ 商城服务端 ────────────────────────────────────────────┐ │
│  │  暴露 API，只传输自定义工具/Skill/智能体（内置工具不传）  │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**工具管理关键设计**：
- **MCP 服务**（已有，保留）：stdio/SSE/HTTP 连接外部 MCP Server
- **内置工具**（已有，保留）：编译在源码中，所有节点天然就有，不属于商城传输范围
- **自定义工具**（新增）：用户编写的 JS 代码，沙箱执行，可标记公开后发布到同源商城
- **同源商城工具**（新增）：连接其他言智节点，只拉取对方的「自定义工具」——内置工具不传

**同源商城工具调用流程**：远程拉取 code + schema → 下载写入本地 custom_tool 表 → 注册到 ToolRegistry → LLM 调用时在本地沙箱执行

**Alternatives considered**:
- 中央化市场服务器：需要单独的中心服务，增加运维复杂度。选择去中心化的节点互联方案。
- 仅支持 Git 仓库作为 Skill 源：不够通用，第三方可能已有 HTTP API。

### 2. CustomTool 协议设计

```
CustomTool = {
  name: string;              // 工具唯一名称
  description: string;       // 工具描述（给 LLM 看）
  inputSchema: JSONSchema;   // 入参 JSON Schema
  outputSchema?: JSONSchema; // 出参 JSON Schema（可选）
  runtime: 'node' | 'python' | 'java'; // 运行时
  entry: string;             // 入口：JS 函数名 / Python 模块:函数 / Java 类:方法
  code: string;              // 源代码
  dependencies?: string[];   // npm/pip/maven 依赖
  timeout?: number;          // 执行超时 ms，默认 30000
  env?: Record<string, string>; // 环境变量
}
```

**内置工具**：项目原生提供的工具（file_read、file_write、web_search 等），无需用户编写代码，由系统预注册到 ToolRegistry。

**自定义工具**：用户通过 JS 代码编写的工具。代码在沙箱化 VM 中执行，只能访问传入的 args 和有限的全局 API。

**Decision**: 首版仅支持 Node.js 运行时，利用 Node.js 原生模块隔离执行。自定义工具的 `code` 字段存储完整源代码，执行时通过沙箱化 VM 运行。Python/Java 运行时预留接口定义，后续通过子进程 + JSON-RPC 方式通信。

**Alternatives considered**:
- WebAssembly 沙箱：隔离性好但开发复杂度高，且无法直接使用 npm 生态。
- Docker 容器执行：隔离性最好但启动慢、资源开销大，不适合桌面端。

### 3. Marketplace Protocol（统一商城协议）

三种商城（工具、Skill、智能体）使用统一的分页 REST API 规范：

```typescript
// 通用商城响应格式
interface MarketplaceListResponse<T> {
  success: boolean;
  data: {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
  };
}

// 通用商城详情格式
interface MarketplaceDetailResponse<T> {
  success: boolean;
  data: T;
}
```

**Skill Marketplace API:**

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/marketplace/skills` | GET | 分页获取 Skill 列表 |
| `/api/marketplace/skills/:id` | GET | 获取 Skill 详情 |
| `/api/marketplace/skills/search` | POST | 搜索 Skill |
| `/api/marketplace/skills/categories` | GET | 获取分类列表 |

**Agent Marketplace API:**

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/marketplace/agents` | GET | 分页获取智能体列表 |
| `/api/marketplace/agents/:id` | GET | 获取智能体详情（含工作流定义） |
| `/api/marketplace/agents/search` | POST | 搜索智能体 |

**Tool Marketplace API:**

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/marketplace/tools` | GET | 分页获取工具列表 |
| `/api/marketplace/tools/:id` | GET | 获取工具详情 |
| `/api/marketplace/tools/search` | POST | 搜索工具 |

**远程源配置：**

```typescript
interface RemoteMarketplaceSource {
  id: string;
  name: string;
  type: 'skill' | 'agent' | 'tool';
  baseUrl: string;          // 如 https://example.com/api/marketplace
  authType: 'none' | 'bearer' | 'api-key' | 'basic';
  authConfig?: {
    token?: string;         // bearer token
    apiKey?: string;        // API key header value
    username?: string;      // basic auth
    password?: string;      // basic auth
  };
  enabled: boolean;
  createdAt: number;
}
```

**Decision**: 采用 RESTful JSON API，与项目现有的 Express 后端风格一致。三种商城使用统一的分页/详情/搜索接口模式。远程源的认证信息加密存储。

**Alternatives considered**:
- GraphQL：灵活但增加复杂度，商城固定查询场景 REST 足够。
- gRPC：性能好但不适合 Web 端直接调用。

### 4. 远程内容同步（下载/复制）

远程商城中的 Skill 和智能体可"安装"到本地：从远程获取完整数据 → 写入本地数据库 → 标记 `source: 'remote'` 和 `remoteSourceId`。

**Decision**: 复制而非引用——远程内容可能随时变更或下线，复制到本地保证可用性。定期检查更新（手动触发）。

### 5. 数据库 Schema 扩展

新增表：

```sql
-- 自定义工具
CREATE TABLE custom_tool (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  input_schema_json TEXT NOT NULL,
  output_schema_json TEXT,
  runtime TEXT NOT NULL DEFAULT 'node',
  entry TEXT NOT NULL,
  code TEXT NOT NULL,
  dependencies_json TEXT,
  timeout INTEGER DEFAULT 30000,
  env_json TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'local',
  remote_source_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 远程商城源
CREATE TABLE remote_marketplace (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'skill' | 'agent' | 'tool'
  base_url TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'none',
  auth_config_enc BLOB,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- 远程市场缓存
CREATE TABLE marketplace_cache (
  id TEXT PRIMARY KEY,
  remote_id TEXT NOT NULL REFERENCES remote_marketplace(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  cached_at INTEGER NOT NULL,
  UNIQUE(remote_id, item_type, item_id)
);
```

### 6. 所有接口工具化

每个管理操作注册为 LLM 可调用的工具函数：

```typescript
// 工具函数映射
const managementTools = [
  'list_platforms', 'add_platform', 'config_model',
  'list_tools', 'enable_tool', 'disable_tool', 'add_custom_tool',
  'list_skills', 'install_skill',
  'list_agents', 'create_agent',
  'add_remote_source', 'search_marketplace',
];
```

**Decision**: 注册为内置工具，在 ToolRegistry 中管理。所有管理操作工具函数的 execute 逻辑调用现有的后端 CRUD API。

## Risks / Trade-offs

- **[沙箱安全] 自定义工具代码执行** → 使用 isolated-vm 或 vm2 沙箱，限制文件系统和网络访问。首版通过 AST 白名单检查禁止危险调用。
- **[远程内容质量] 第三方商城内容不可控** → 用户需自行评估信任度。敏感操作在启用前可预览完整内容。
- **[协议兼容] 自定义协议可能与其他平台不兼容** → 协议设计参考 OpenAI function calling 和 MCP 规范，保持最大兼容性。
- **[性能] 远程商城拉取延迟** → 本地缓存 + 后台定时同步，避免每次加载都请求远程。
- **[数据库迁移] MCP→Tool 重构涉及 schema 变更** → 提供迁移脚本，保留旧数据兼容。
