# 言智 (Yan-Zhi) — 项目任务规划

## 功能清单与进度

| 序号 | 功能 | 状态 | 说明 |
|------|------|------|------|
| 1 | 聊天工作台 | 已完成 | 流式对话、Markdown渲染、多会话、工具调用可视化 |
| 2 | 模型平台配置 | 部分完成 | 仅 OpenAI 协议可用，Anthropic 协议 UI 已声明但后端未实现 |
| 3 | MCP 服务管理 | 已有，保留 | stdio/SSE/HTTP 三种传输协议，工具管理重构不影响此模块 |
| 4 | Skill 本地管理 | 已有 | 内置 Skill + 用户自建，Markdown 格式 |
| 5 | 智能体管理 | 已有 | 工作流画布（Vue Flow），多节点类型 |
| 6 | 智能体配置 | 已有 | 模型绑定、系统提示词、温度等参数 |
| 7 | 工具调用 | 已有 | 内置工具注册、MCP 工具挂载、LLM 函数调用 |
| 8 | 自定义工具 | 待开发 | JS 沙箱执行，统一 CustomTool 协议，预留 Python/Java |
| 9 | 同源商城工具 | 待开发 | 连接其他言智节点，拉取对方公开的自定义工具 |
| 10 | Skill 商城（升级） | 待开发 | 本地+远程双商城，远程下载，统一 Marketplace 协议 |
| 11 | 远程智能体商城 | 待开发 | 远程浏览、搜索、复制到本地，统一 Marketplace 协议 |
| 12 | 商城服务端 | 待开发 | 本节点作为服务端暴露 API，供其他节点连接 |
| 13 | 接口工具化 | 待开发 | 所有管理操作注册为 LLM 工具函数，自然语言操控 |

---

## 工具管理 — 整体架构

```
工具管理
│
├── 本地 MCP 服务（已有，保留，不变）
│   连接外部 MCP Server，协议：stdio / SSE / Streamable HTTP
│
├── 内置工具（已有，保留）
│   file_read / file_write / web_search 等
│   编译在源码中，所有言智节点天然就有
│
├── 自定义工具（新增）
│   用户用 JS 编写，沙箱执行
│   可标记 is_public 发布到同源商城
│
└── 同源商城工具（新增）
    连接其他言智节点，只拉取对方的「自定义工具」
    内置工具每个节点都有，不需要商城传输
    下载后在本地沙箱执行，不依赖远程节点
```

---

## 阶段一：自定义工具

### 1.1 协议与类型
- [ ] 定义 CustomTool 数据结构：name, description, inputSchema, outputSchema, runtime, entry, code, timeout 等
- [ ] 内置工具与自定义工具的区分：内置工具无 code 字段，execute 编译在源码中
- [ ] 预留 Python/Java 运行时接口（runtime 字段 = 'node'|'python'|'java'）

### 1.2 后端
- [ ] 数据库新建 `custom_tool` 表
- [ ] 实现 JS 沙箱执行器（node:vm 隔离，超时控制，禁止危险 API）
- [ ] 扩展 ToolRegistry：启动时从 DB 加载 enabled=1 的自定义工具
- [ ] `/api/tools` CRUD：创建/编辑/删除/启用禁用自定义工具
- [ ] `/api/tools/builtin` 端点：列出内置工具的 name + description + inputSchema
- [ ] `/api/mcp-servers` 路由保持不变，不受影响

### 1.3 前端
- [ ] 工具管理页面 Tab：MCP 服务 / 内置工具 / 自定义工具 / 同源商城
- [ ] 自定义工具编辑器：名称 + Schema表单 + 代码编辑区（Monaco/CodeMirror）
- [ ] 自定义工具列表：启用/禁用开关、编辑、删除
- [ ] 每个自定义工具有"发布到商城"开关（设置 is_public）
- [ ] tools Pinia store

---

## 阶段二：同源商城工具

### 2.1 协议
- [ ] 同源商城只传输「自定义工具」—— 内置工具每个节点都有，不传输
- [ ] `GET /api/marketplace/tools?page=&pageSize=` — 只返回 is_public=true 的自定义工具
- [ ] `GET /api/marketplace/tools/:id` — 自定义工具详情（含 code + schema）
- [ ] `POST /api/marketplace/tools/search` — 搜索自定义工具

### 2.2 后端
- [ ] 新增 `remote_marketplace` 表（name, type='tool', base_url, auth_type, auth_config_enc）
- [ ] 创建 `/api/remote-sources` 远程源 CRUD + 连接测试
- [ ] 从同源商城拉取工具列表 → 前端展示 → 用户选择下载
- [ ] "安装到本地"：获取远程工具完整数据（含 code）→ 写入本地 custom_tool → 注册 ToolRegistry
- [ ] 下载后的工具在本地沙箱执行，不需要连远程节点
- [ ] 远程内容缓存 + 手动刷新

### 2.3 前端
- [ ] 同源商城 Tab：远程源管理面板（添加URL/认证/切换/删除）
- [ ] 远程自定义工具分页列表 + 搜索
- [ ] "安装到本地"按钮：下载状态、已安装检测、覆盖更新
- [ ] 与自定义工具 Tab 联动：从商城安装的工具也出现在自定义工具列表中（source=remote）

---

## 阶段三：Skill 商城升级

### 3.1 协议
- [ ] `GET /api/marketplace/skills?page=&pageSize=&category=` — 分页列表
- [ ] `GET /api/marketplace/skills/:id` — Skill 详情（含 frontmatter + body）
- [ ] `POST /api/marketplace/skills/search` — 搜索
- [ ] `GET /api/marketplace/skills/categories` — 分类列表

### 3.2 后端
- [ ] skill 表新增：source, remote_source_id, is_public
- [ ] 创建 `/api/marketplace/skills`：本地公开 Skill 商城 API
- [ ] 远程 Skill 列表拉取、详情获取、下载到本地
- [ ] 远程内容缓存

### 3.3 前端
- [ ] Skills.vue 本地/远程双视图切换
- [ ] 远程源管理、分页列表、分类筛选、搜索
- [ ] "安装到本地"按钮与状态
- [ ] skills store 更新

---

## 阶段四：智能体商城

### 4.1 协议
- [ ] `GET /api/marketplace/agents?page=&pageSize=` — 分页列表
- [ ] `GET /api/marketplace/agents/:id` — 详情（含 workflow_json）
- [ ] `POST /api/marketplace/agents/search` — 搜索

### 4.2 后端
- [ ] agent 表新增：source, remote_source_id, is_public
- [ ] `/api/marketplace/agents`：本地公开智能体商城 API
- [ ] 远程列表拉取、详情、复制到本地

### 4.3 前端
- [ ] Agents.vue 本地/远程双视图
- [ ] "复制到本地"按钮与状态
- [ ] 智能体编辑页"发布到商城"开关

---

## 阶段五：商城服务端（本项目作为服务端）

### 5.1 后端
- [ ] `/api/marketplace` 节点握手：返回 { name, version, capabilities }
- [ ] 统一响应格式：`{ success, data: { items, total, page, pageSize } }`
- [ ] 内容可见性过滤：仅返回 is_public=true
- [ ] 访问权限中间件：none / bearer / api-key / basic
- [ ] 商城服务端开关配置
- [ ] 同源工具商城 API 只返回自定义工具（不含内置工具）

### 5.2 前端
- [ ] Settings.vue 新增"商城服务端"配置区域
- [ ] 自动检测本机 IP 地址并显示（优先局域网 IP）
- [ ] 显示服务端口（默认 3001，支持自定义）
- [ ] 拼接完整连接 URL：`http://<IP>:<port>/api/marketplace`
- [ ] "复制连接地址"按钮，供其他节点粘贴使用
- [ ] 商城服务端开关
- [ ] 认证方式选择 + 凭证配置表单
- [ ] marketplace store

---

## 阶段六：接口工具化

将以下所有页面操作接口注册为 LLM 可调用的内置工具函数：

### 模型平台管理
- [ ] `list_platforms` / `add_platform` / `update_platform` / `delete_platform`
- [ ] `list_models` / `add_model` / `update_model` / `delete_model`
- [ ] `sync_models` — 从平台API拉取模型列表

### MCP 服务管理
- [ ] `list_mcp_servers` / `add_mcp_server` / `update_mcp_server` / `delete_mcp_server`
- [ ] `list_mcp_tools` / `update_mcp_tool` / `refresh_mcp_tools`

### 自定义工具管理
- [ ] `list_custom_tools` / `add_custom_tool` / `update_custom_tool` / `delete_custom_tool`
- [ ] `enable_tool` / `disable_tool`

### Skill 管理
- [ ] `list_skills` / `add_skill` / `update_skill` / `delete_skill`

### 智能体管理
- [ ] `list_agents` / `create_agent` / `update_agent` / `delete_agent`

### 商城管理
- [ ] `list_remote_sources` / `add_remote_source` / `remove_remote_source`
- [ ] `search_marketplace` / `install_from_market`

### 商城服务端
- [ ] `toggle_marketplace` / `set_marketplace_auth`

### 会话管理
- [ ] `list_conversations` / `create_conversation` / `delete_conversation`

### 通用要求
- [ ] 所有管理工具函数权限校验：仅已认证用户可调用
- [ ] 工具函数注册到 ToolRegistry，与 file_read/web_search 同列

---

## 跨节点互联

- [ ] 协议握手：`GET /api/marketplace` 验证对方是言智节点
- [ ] 连接后自动拉取对方公开的自定义工具/Skill/智能体列表
- [ ] 同源商城工具在本地沙箱执行（不依赖远程）
- [ ] 多个远程源并行管理

---

## 数据库变更汇总

### 新增表

| 表名 | 说明 |
|------|------|
| custom_tool | 自定义工具（source=local/remote） |
| remote_marketplace | 远程商城源配置（type=skill/agent/tool） |
| marketplace_cache | 远程内容本地缓存 |

### 现有表变更

| 表名 | 操作 | 新增字段 |
|------|------|---------|
| skill | ALTER | source, remote_source_id, is_public |
| agent | ALTER | source, remote_source_id, is_public |
| mcp_server | 不变 | — |
| mcp_tool | 不变 | — |

---

## 已知问题

### 1. Anthropic 协议未实现

`Protocol = 'openai' | 'anthropic' | 'custom'` 和 UI 中已声明 Anthropic 选项，但 `LlmClient` 只实现了 OpenAI 格式：
- 端点硬编码 `/v1/chat/completions`（Anthropic 实际为 `/v1/messages`）
- 鉴权写死 `Bearer`（Anthropic 需 `x-api-key`）
- 请求/响应结构不兼容 Anthropic Messages API

选 Anthropic 协议的平台无法正常使用。需后续增加协议适配层。
