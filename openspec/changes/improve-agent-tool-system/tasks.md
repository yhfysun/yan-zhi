## 1. API 工具按模块定义

- [ ] 1.1 创建 `packages/core/src/tool/builtin/api-tools/` 目录结构
- [ ] 1.2 实现 `api-tools/index.ts` — `createApiToolRegistry()` 返回 `Map<moduleName, ToolDef[]>`
- [ ] 1.3 实现 `api-tools/agent.ts` — Agent CRUD 接口工具定义
- [ ] 1.4 实现 `api-tools/conversation.ts` — Conversation/Message 接口工具定义
- [ ] 1.5 实现 `api-tools/platform.ts` — Platform/Model 接口工具定义
- [ ] 1.6 实现 `api-tools/mcp.ts` — MCP Server/Tool 接口工具定义
- [ ] 1.7 实现 `api-tools/skill.ts` — Skill 接口工具定义
- [ ] 1.8 实现 `api-tools/marketplace.ts` — Marketplace 接口工具定义
- [ ] 1.9 实现 `api-tools/workspace.ts` — 工作区/文件系统接口工具定义
- [ ] 1.10 实现 `api-tools/memory.ts` — Memory 接口工具定义

## 2. get_api_tools 内置工具

- [ ] 2.1 实现 `GetApiToolsTool` 类：接收 `module` 参数，从 ApiToolRegistry 返回工具定义
- [ ] 2.2 `module: "list"` 或不传时返回所有可用模块名称列表
- [ ] 2.3 不存在的 module 返回 `isError: true` 并提示可用模块名
- [ ] 2.4 在 `ToolRegistry` 中注册 `get_api_tools` 工具

## 3. 智能体双模式数据模型

- [ ] 3.1 Agent 接口增加 `type` 字段（`"harness"` 默认 | `"workflow"`）+ 挂载五字段
- [ ] 3.2 数据库 migration：`agent` 表加 `type`（TEXT，默认 `"harness"`）+ 5 个挂载列
- [ ] 3.3 Web 端 Dexie schema 同步更新
- [ ] 3.4 `agent.ts` store 的 `rowToAgent`、`createChatAgent`、`updateAgent` 读写新字段

## 4. 智能体编辑 UI

- [ ] 4.1 `AgentEditDialog` 增加"智能体类型"选择（Harness 默认 / Workflow）
- [ ] 4.2 Harness 模式显示"挂载配置"section（工具/Skill/子智能体 tab）
- [ ] 4.3 "工具"tab：内置工具 + 自定义工具 + MCP 工具（server 全选或 tool 细选）
- [ ] 4.4 "Skill"tab：已启用 Skill 多选
- [ ] 4.5 "子智能体"tab：除自身外智能体多选
- [ ] 4.6 Workflow 模式隐藏挂载配置区

## 5. AgentCanvas 双模式

- [ ] 5.1 Harness → 显示挂载配置面板，不显示 DAG 画布
- [ ] 5.2 Workflow → 保持现有 DAG 画布
- [ ] 5.3 根据 `agent.type` 切换

## 6. Chat 挂载合并与 System Prompt

- [ ] 6.1 `getMergedMounts()`：Harness 智能体挂载 ∪ 会话挂载；Workflow 只用会话挂载
- [ ] 6.2 `buildToolsDescription()`：根据合并挂载生成工具描述
- [ ] 6.3 `buildSubAgentsDescription()`：生成子智能体描述段
- [ ] 6.4 `buildSystemPrompt()`：Harness 拼接工具/Skill/子智能体；Workflow 保持现有
- [ ] 6.5 `buildTools()`：根据合并挂载构建 OpenAI tools 数组

## 7. Workflow 工具节点扩展

- [ ] 7.1 工具节点增加来源选择（MCP / 内置 / 自定义）
- [ ] 7.2 `ToolNodeHandler` 根据 `config.toolSource` 分派执行

## 8. 集成验证

- [ ] 8.1 Harness 智能体挂载完整流程：创建挂载 → Chat 生效 → LLM 调用
- [ ] 8.2 `get_api_tools` 在对话中正常使用
- [ ] 8.3 旧智能体兼容（type=NULL → harness，挂载为空行为不变）
- [ ] 8.4 Workflow DAG 画布不退化
