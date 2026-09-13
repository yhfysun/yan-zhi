# 言智 (Yan-Zhi) — 项目任务规划

## 功能清单与进度

| 序号 | 功能 | 状态 | 说明 |
|------|------|------|------|
| 1 | 聊天工作台 | ✅ 已完成 | 流式对话、Markdown渲染、多会话、工具调用可视化 |
| 2 | 模型平台配置 | ⚠️ 部分完成 | 仅 OpenAI 协议可用，Anthropic 协议后端未实现 |
| 3 | MCP 服务管理 | ✅ 已完成 | stdio/SSE/HTTP，保持不变 |
| 4 | Skill 本地管理 | ✅ 已完成 | 内置 + 用户自建，Markdown |
| 5 | 智能体管理 | ✅ 已完成 | Vue Flow 画布，多节点 |
| 6 | 智能体配置 | ✅ 已完成 | 模型绑定、提示词、参数 |
| 7 | 工具调用 | ✅ 已完成 | 内置工具 + MCP 工具挂载 + LLM 函数调用 |
| 8 | 自定义工具 | ✅ 已完成 | JS沙箱执行 + CustomTool协议 |
| 9 | 同源商城工具 | ✅ 已完成 | /api/tool-marketplace 连接其他节点 |
| 10 | Skill 商城升级 | ✅ 已完成 | /api/skill-marketplace 本地+远程双商城 |
| 11 | 远程智能体商城 | ✅ 已完成 | /api/agent-marketplace 浏览+复制到本地 |
| 12 | 商城服务端 | ✅ 已完成 | /api/marketplace API + Settings配置 |
| 13 | 接口工具化 | ✅ 已完成 | 7个管理工具函数注册 |
| 14 | Git 集成能力 | ✅ 已完成 | 冲突解决 UI、checkout/restore/stash/tag/revert、状态查询 |
| 15 | AI 提交信息 | ✅ 已完成 | useGitAi 生成提交信息（标准/简洁/详细/自定义提示词） |
| 16 | 会话只读权限 | ✅ 已完成 | readonly 拦截写类工具，conversation.permission_mode |
| 17 | 代码工作台 | ✅ 已完成 | CodeWorkbench 文件树/编辑/Git 联动增强 |
| 18 | 文件系统 base64 写入 | ✅ 已完成 | FsAdapter.writeFileBase64（桌面端/Web 端） |
| 19 | 数据源收敛 | ✅ 已完成 | auth.useServerApi 恒为 true，后端唯一数据源 |

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
- [x] 定义 CustomTool 数据结构
- [x] 内置工具与自定义工具的区分
- [x] 预留 Python/Java 运行时接口

### 1.2 后端
- [x] 数据库 custom_tool 表
- [x] JS 沙箱执行器
- [x] ToolRegistry 启动时从 DB 加载自定义工具
- [x] /api/tools CRUD
- [x] /api/tools/builtin 端点
- [x] /api/mcp-servers 路由保持不变

### 1.3 前端
- [x] 工具管理四 Tab
- [x] 自定义工具编辑器
- [x] 启用/禁用、编辑、删除
- [x] 发布到商城开关
- [x] tools store

---

## 阶段二：同源商城工具

### 2.1 协议
- [x] 只传输自定义工具
- [x] GET /api/marketplace/tools 分页
- [x] GET /api/marketplace/tools/:id 详情
- [x] POST /api/marketplace/tools/search 搜索

### 2.2 后端
- [x] remote_marketplace 表
- [x] /api/tool-marketplace 远程源 CRUD + 连接测试
- [x] 远程工具列表 → 安装到本地
- [x] 远程内容缓存

### 2.3 前端
- [x] 同源商城 Tab
- [x] 远程工具分页列表
- [x] 安装到本地按钮

---

## 阶段三：Skill 商城升级

### 3.1 协议
- [x] GET /api/marketplace/skills 分页列表
- [x] GET /api/marketplace/skills/:id 详情
- [x] POST /api/marketplace/skills/search 搜索
- [x] GET /api/marketplace/skills/categories 分类

### 3.2 后端
- [x] skill 表新增 source, remote_source_id, is_public
- [x] /api/marketplace/skills 公开商城 API
- [x] /api/skill-marketplace 远程 Skill 列表拉取、下载到本地
- [x] 远程内容缓存

### 3.3 前端
- [x] Skills.vue 本地/远程双视图
- [x] 远程源管理、分页列表
- [x] 安装到本地按钮
- [x] skills store 更新

---

## 阶段四：智能体商城

### 4.1 协议
- [x] GET /api/marketplace/agents 分页列表
- [x] GET /api/marketplace/agents/:id 详情
- [x] POST /api/marketplace/agents/search 搜索

### 4.2 后端
- [x] agent 表新增 source, remote_source_id, is_public
- [x] /api/marketplace/agents 公开商城 API
- [x] /api/agent-marketplace 远程列表拉取、复制到本地

### 4.3 前端
- [x] Agents.vue 本地/远程双视图
- [x] 复制到本地按钮
- [x] 智能体编辑页发布到商城开关

---

## 阶段五：商城服务端（本项目作为服务端）

### 5.1 后端
- [x] /api/marketplace 节点握手
- [x] 统一响应格式
- [x] 内容可见性过滤
- [x] 访问权限中间件
- [x] 商城服务端开关配置
- [x] 同源工具商城只返回自定义工具

### 5.2 前端
- [x] Settings.vue 商城服务端配置
- [x] 自动检测本机 IP 地址
- [x] 端口配置 + 连接 URL
- [x] 复制连接地址按钮
- [x] 商城服务端开关 + 认证配置
- [x] marketplace store

---

## 阶段六：接口工具化

所有页面操作接口注册为 LLM 可调用的内置工具函数：

### 模型平台管理
- [x] list_platforms / add_platform / update_platform / delete_platform
- [x] list_models / add_model / update_model / delete_model / sync_models

### MCP 服务管理
- [x] list_mcp_servers / add_mcp_server / update_mcp_server / delete_mcp_server
- [x] list_mcp_tools / update_mcp_tool / refresh_mcp_tools

### 自定义工具管理
- [x] list_custom_tools / add_custom_tool / update_custom_tool / delete_custom_tool
- [x] enable_tool / disable_tool

### Skill 管理
- [x] list_skills / add_skill / update_skill / delete_skill

### 智能体管理
- [x] list_agents / create_agent / update_agent / delete_agent

### 商城管理
- [x] list_remote_sources / add_remote_source / remove_remote_source
- [x] search_marketplace / install_from_market

### 商城服务端
- [x] toggle_marketplace / set_marketplace_auth

### 会话管理
- [x] list_conversations / create_conversation / delete_conversation

### 通用要求
- [x] 管理工具函数权限校验
- [x] 工具函数注册到 ToolRegistry

---

## 数据库变更汇总

## 跨节点互联

- [ ] 协议握手：`GET /api/marketplace` 验证对方是言智节点
- [ ] 连接后自动拉取对方公开的自定义工具/Skill/智能体列表
- [ ] 同源商城工具在本地沙箱执行（不依赖远程）
- [ ] 多个远程源并行管理

---

## 阶段七：Git 集成与代码工作台

### 7.1 Git 后端
- [x] services/git.ts 扩展：checkout / restore / stash save&pop / tag create&delete / revert
- [x] routes/git.ts：新增对应 API 端点
- [x] stores/git.ts：前端状态与操作封装

### 7.2 Git 冲突解决 UI
- [x] GitConflictResolver：合并冲突逐段查看/选择
- [x] GitCheckoutConflictDialog：checkout 冲突处理
- [x] GitTreeRow：文件树行组件
- [x] ChatGitPanel 联动代码工作台

### 7.3 AI 提交信息
- [x] useGitAi 组合式：规则（标准/简洁/详细/自定义）+ 自定义提示词持久化
- [x] GitCommitDialog：调用 AI 生成 commit message

### 7.4 会话只读权限
- [x] tool-permission.ts：黑名单写操作 + 不可控来源（custom_/mcp_/call_agent）拦截
- [x] conversation.permission_mode 列（readonly/default/full）+ 迁移
- [x] 后端 checkToolPermission / filterToolsByPermission / permissionModePrompt

### 7.5 代码工作台与基础设施
- [x] CodeWorkbench 文件树/编辑/Git 联动增强
- [x] FsAdapter.writeFileBase64（桌面端/Web 端）
- [x] auth.useServerApi 恒为 true（数据源收敛）
- [x] 皮肤接管 SettingsDrawer 文本色（--skin-text）

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
| conversation | ALTER | permission_mode |

---

## 已知问题

### 1. Anthropic 协议（已实现）

`LlmClient` 已完整支持 OpenAI 与 Anthropic 双协议（`packages/core/src/llm/anthropic.ts` 适配层）：
- OpenAI：`/v1/chat/completions` + `Bearer` 鉴权
- Anthropic：`/v1/messages` + `x-api-key` 鉴权，自动完成 system 提取、tool_use/tool_result 转换、流式 SSE 解析

注意：Anthropic 官方无公开模型列表接口，"拉取模型"可能返回空，需手动添加模型 ID。Anthropic 不支持 embeddings。
