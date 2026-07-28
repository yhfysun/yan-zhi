## Why

当前项目定位为本地 AI 助手，但 MCP 服务、Skill、智能体等资源分散管理，缺乏统一的市场机制和可扩展的远程协议。用户需要在"工具/Skill/智能体"三个维度上具备本地 + 远程双市场的能力，使项目不仅能独立使用，还可以作为市场服务端供其他节点连接。这是一次从"单机助手"到"可互联的智能体平台"的架构升级。

## What Changes

### 品牌重构
- 项目正式命名为"言智"（Yan-Zhi），定位为"语言可控的智能体平台"
- 更新 README 与应用元数据

### 工具管理（新增自定义工具 + 同源商城）
- MCP 服务管理模块保持不变（继续提供 stdio/SSE/HTTP 三种协议）
- 新增内置工具注册：file_read、file_write、web_search 等，所有节点编译自带
- 新增自定义工具：用户通过 JavaScript 编写的扩展工具，沙箱执行，统一 CustomTool 协议
- 自定义工具协议：支持多语言 Runtime（Node.js / Python / Java），通过 JSON Schema 定义接口
- 新增同源商城工具：连接其他言智节点，只拉取对方的「自定义工具」
  - 内置工具每个节点都有，无需通过商城传输
  - 下载后在本地沙箱执行，不依赖远程节点

### Skill 商城升级
- 本地 Skill 商城：统一管理内置 Skill 和用户自建 Skill
- 新增远程 Skill 商城：配置远程 URL 和认证信息，自动拉取 Skill 列表
- 远程 → 本地复制/下载功能
- 定义 Skill Marketplace Protocol（REST API 规范）：列表分页、详情、搜索接口

### 智能体商城
- 新增本地智能体商城：统一管理本地创建的所有智能体
- 新增远程智能体商城：配置远程 URL 和认证信息
- 智能体从远程复制到本地
- 定义 Agent Marketplace Protocol（REST API 规范）

### 本项目作为市场服务端
- 暴露标准化的商城 API，使其他运行言智的节点可以连接本节点获取工具/Skill/智能体
- 支持配置可见性和访问权限

### 聊天增强（待开发）
- 所有管理接口工具化：模型配置、工具管理、智能体管理、Skill 管理均可通过聊天自然语言操控

### README 与文档
- 重写 README，体现新的产品定位和架构
- 新增项目设计文档（design.md）
- 新增任务设计文档（tasks.md）

## Capabilities

### New Capabilities
- `tool-marketplace`: 工具商城（本地 + 远程），替代原 MCP 服务管理，支持内置工具和自定义工具
- `custom-tool-protocol`: 自定义工具协议规范，支持 JS/Python/Java 多语言运行时
- `skill-marketplace`: Skill 商城升级，支持本地商城 + 远程商城 + 远程下载到本地
- `agent-marketplace`: 智能体商城，支持本地商城 + 远程商城 + 远程复制到本地
- `marketplace-server`: 本项目作为商城服务端，暴露标准化 API 供其他节点连接
- `chat-toolification`: 所有管理接口工具化，支持通过自然语言操控项目功能

### Modified Capabilities
- `mcp-management`: 重构为 tool-marketplace，原 MCP 概念融入工具管理
- `skill-management`: 升级为 skill-marketplace，新增远程商城能力

## Impact

- `README.md` — 完全重写，体现新产品定位
- `apps/server/src/routes/mcp.ts` — 重构为工具管理路由
- `apps/server/src/` — 新增 marketplace、agent-marketplace 路由
- `packages/core/src/tool/` — 扩展自定义工具协议、代码执行器
- `packages/core/src/mcp/` — 合并入 tool 模块
- `packages/ui/src/views/Mcp.vue` — 重构为工具商城视图
- `packages/ui/src/views/Skills.vue` — 升级支持远程商城
- `packages/ui/src/views/Agents.vue` — 升级支持远程商城
- `packages/ui/src/stores/` — 新增 marketplace stores
- `packages/shared/src/types/` — 新增 marketplace 协议类型定义
- 新增 `docs/` 目录：项目设计文档、任务文档
- 数据库 schema 变更：新增 marketplace、remote_* 相关表
