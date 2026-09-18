# 为什么

用户提出（2026-09-18）：**工作流智能体现在没法在正常任务里执行，是不是只能作为子智能体被挂载？** 应该有专门运行它的地方 —— 建议新增「工作流模式」，与代码 / 运维 / 安全一样有两个形态：

1. **手动运行**：自己填好需要的入参、配置中间节点需要用户配置的参数（模型参数等），点击运行。
2. **AI 模式**：固定一个「工作流助手」作为 harness 智能体，输入框里可以选择对应的工作流智能体供他使用（作为他的子智能体）；工作流助手自己也有通用工具与定制 skill。

用户已拍板的三项决策：

- ✅ 范围：**双形态 + 单节点调试 + 定时任务，全都要**
- ✅ AI 模式调用方式：**工作流注册为工具为主 + `call_agent` 委派为辅**
- ✅ 助手来源：**新建内置智能体 `a_builtin_workflow_assistant`（`type='harness'`）**

### 竞品调研结论（2026-09-18）

| 产品 | 编排对象 | 工作流的运行入口 | 值得抄的点 |
|---|---|---|---|
| 扣子 Coze | Agent（壳）/ Workflow（芯片）/ Chatflow（对话流，Beta） | ① 挂到 Bot 上被调用（默认同步，可开异步，超时 10min→24h）② 不绑 Bot，独立发 API + 定时触发（无人值守）③ 画布试运行（节点绿框、看输入输出、存测试集） | 「Bot 管接客派单、工作流管干活」的职责切分；同一个画布三种触发态 |
| Dify | Workflow（run once）/ Chatflow（每轮触发，带会话变量、Answer 流式） | User Input 或 Trigger（Schedule/Webhook/Integration，与 User Input 互斥）开始；可发布为 WebApp / API / MCP Server / **工具** | **workflow-as-tool**（被 Agent 与其他 workflow 调用）；单节点运行、运行到指定节点、Variable Inspector 改中间变量后从失败节点重跑 |
| n8n | 一个画布 + 多种 Trigger | Manual / Schedule / Webhook / Chat / Form；Executions 历史 + 单执行重放 + pin data；可发布为 MCP Server | 执行历史是一等公民；从历史一键重跑 |

**共同规律**：画布只有一份，**「谁触发」和「怎么触发」是正交的**；手动运行不是编辑页里的一个按钮，而是一个**独立场所** —— 表单 + 历史 + 日志 + 产物 + 重跑。AI 调工作流有两条路：Coze 式「靠提示词派单」（松、易选错）与 Dify 式「发布为工具」（紧、schema 强约束），**取后者**。

### 现状核查（代码事实，2026-09-18）

| 能力 | 现状 | 位置 |
|---|---|---|
| 画布运行 + 入参表单 | ✅ 有，但埋在智能体编辑页里 | `AgentCanvas.vue:736 doRun()` → `stores/agent.ts:552` |
| `call_agent` 委派 + 产物回写 + 重启补投 | ✅ 有 | `workflow-delegate.ts` / `llm-task-manager.ts:1509-1648` |
| `POST /workflow/run`、`GET /runs`、`GET /runs/:id`、SSE `/runs/:id/stream` | ✅ 有（含 seq 续传） | `routes/workflow.ts:22/47/59/86` |
| 节点级事件（node:start/ok/error + seq） | ✅ 后端已有，**前端未订阅**（现为 1s 轮询） | `workflow-runner.ts:166/76-85`；前端 `stores/agent.ts:556/563` |
| 可运行工作流列表 + 输入 schema 接口 | ❌ 缺 | — |
| 运行历史 UI / 取消运行 / 单节点调试 | ❌ 缺（DAG 无中断机制） | `workflow-delegate.ts:192` 注释 |
| 定时触发 | ⚠️ **DB 列与前端 store 已预留，后端未接线** | `db.ts:2460-2463`；`stores/scheduledTask.ts:48-54`；`routes/scheduled-tasks.ts` 与 `services/scheduled-tasks.ts` 均未使用 |
| 手动运行（无会话）的产物落盘 | ❌ **产物只留在 `result_json`，不落盘** | `llm-task-manager.ts:1624-1648` 依赖 `conversationId` |

**顺带发现的两个既有缺陷**（本批一并修，见「改什么」第 7 条）：

1. `llm-task-manager.ts:1535` 调 `startWorkflowRun` **未传第 4 个 `delivery`** → `delivery_json` 恒为 NULL → 进程重启后 `resumeWorkflowDeliveries()` 补投链路实际不生效（只靠内存订阅）。
2. `ToolRegistry` 是**进程级单例**且 `register` 重名即 throw → 「为每个工作流动态生成一个工具」不能简单做，需按 `wf_<agentId>` 稳定命名（见 design 决策 4）。

核心矛盾：**三种运行入口里只有两种存在，第三种（运行台）缺席**，于是工作流智能体看起来只能被挂载。

# 改什么

## 1. 第五种模式：工作流模式（`wf` → `/workflow`）

与 `four-mode-workspace` 完全同构，复用其 `lead`（主导方）机制，**零新增概念**：

| 形态 | lead | 中栏 | 右栏 |
|---|---|---|---|
| 运行模式（人工主导） | `human` | 运行台：工作流选择 + 运行表单 + 运行面板 | 对话（共享同一会话） |
| AI 模式（AI 主导） | `ai` | 对话（工作流助手） | 运行面板（被调起的工作流实时进度） |

- 切换控件复用 `LeadToggle.vue`，标签 `[AI 模式 | 运行模式]`；默认 `lead='human'`（先跑通手动，符合"调试优先"直觉）。
- **两形态共享同一个会话**（沿用 `four-mode-workspace` 决策 1b）：手动跑出来的产物在 AI 模式里能接着聊，反之亦然。
- 新增场景定义 `wf`（提示词 + Skill 关键词），走 `config/scenes.ts`；**不进欢迎卡**（同 `code`/`ops`/`sec`）。

## 2. 运行模式（人工主导）：从「编辑页里的一个按钮」升级为独立运行台

- **左：工作流列表** —— 列出所有 `type='workflow'` 的智能体（新增 `GET /api/workflow/agents`，返回 id/名称/描述/输入字段 schema/最近运行状态）。
- **中：运行表单** —— 由 input 节点 `config.schema` 自动生成（`extractWorkflowInputFields`），字段类型沿用现有简写与 JSON Schema 双轨。
- **节点配置覆盖** —— 只有节点配置里显式标记 `runtimeOverridable` 的字段才出现在表单（折叠区「覆盖节点配置」），**其余一律走画布默认值并预填隐藏**（抄 Dify「隐藏并预填」，避免 LLM 节点十几个参数撑爆表单）。
- **运行面板** —— 订阅 SSE 显示节点级进度（绿/红/运行中 + 耗时 + 输入输出），支持**取消**；完成后展示产物与「重跑（复用上次参数）」。
- **运行历史** —— 复用已有 `GET /runs`（当前前端完全没调），列表 + 详情 + 一键重跑 + 查看产物。

## 3. AI 模式：工作流助手 + 工作流即工具

- 新建内置智能体 **`a_builtin_workflow_assistant`**（`type='harness'`，`agent_kind` 默认即会话可选）：
  - **绝不**拿 workflow 型 agent 当宿主 —— 它的 `system_prompt` 为 NULL、`builtin_tool_ids` 为 `[]`，连 `ask_user`/`confirm_user` 都进不来（既有坑）。
  - 人格：参数补全、结果解读、失败重试建议、工作流推荐。
  - 挂载通用工具（`file_*` / `browser_*` / `api_*` 通用集）+ 定制 skill（工作流编排指南、节点排障手册）。
- **工作流注册为工具（主）**：为所有 `type='workflow'` 的智能体注册 `wf_<agentId>` 工具，参数 schema 直接来自 input 节点；模型按强约束传参，比「靠提示词选子智能体」稳。进程启动时注册、增删工作流时同步（仿 `registerManagementTools`）。**暴露给模型的只是会话 `builtin_tool_ids` 里挂载的子集**，避免工具清单膨胀。
- **`call_agent` 委派（辅）**：长流程（Coze 式异步、超时放宽）继续走既有链路，保留。
- 输入框里的「选择可用工作流」= 勾选后写入会话 `builtin_tool_ids`（`wf_*` 条目），与工具挂载机制合一，不另起一套。

## 4. 单节点调试（抄 Dify）

- **单节点运行**：给定上游变量快照，只跑一个节点。
- **运行到指定节点**（step-run）：从开始跑到目标节点后暂停，中间产物进入调试缓存。
- **Variable Inspector**：查看并可编辑已执行节点的输出变量，改完后**从失败/暂停节点继续跑**，不重跑上游（省 LLM 调用）。
- 需要引擎侧开放：`export buildExecutionPlan` / `buildSubgraphPlan`、`RunOptions` 增 `stopAtNodeId`、调试缓存（内存，随 run 30 分钟生命周期）。

## 5. 定时触发（接线，非新建）

DB 列（`task_type` / `workflow_agent_id` / `workflow_bundle_json` / `workflow_inputs_json`）与前端 store（`taskType` / `workflowAgentId` / `workflowBundle` / `workflowInputs`）**已预留**，本批只接线：

- 后端 `routes/scheduled-tasks.ts`：`rowToTask` 补 4 字段、创建/更新解构补白名单。
- `services/scheduled-tasks.ts:292 runScheduledTask`：`:337` 前加 `task_type === 'workflow'` 分支 → `startWorkflowRun`（带 delivery，产物回写到绑定会话）。
- 前端 `ScheduledTaskDialog.vue`：`form` 增任务类型选择（对话任务 / 工作流任务）+ 工作流选择器 + 固定入参编辑器，提交体带上。

## 6. 补齐后端缺口

- `GET /api/workflow/agents` —— 可运行工作流列表 + 输入字段 schema。
- `POST /api/workflow/runs/:id/cancel` —— 取消运行（新增 `cancelWorkflowRun`，状态 `aborted`）。
- `GET /api/workflow/runs/:id/artifacts` —— 运行产物列表与下载。
- `POST /api/workflow/debug/node`、`POST /api/workflow/debug/run-to` —— 单节点调试。
- 运行请求体增 `nodeOverrides`、引擎增 `signal`（取消）。

## 7. 顺带修两个既有缺陷

- `llm-task-manager.ts:1535` 补传 `delivery` → 重启补投链路真正生效。
- 手动运行（无会话）产物落盘：`ensureArtifactDirFor({ conversationId: runId })` + 允许 `conversation_file.conversation_id` 为空（或新增 `run_artifact`），使运行台能拿到产物。

## 8. 不做什么

- 不改工作流引擎的节点执行语义（loop body 取 `ctx.inputs.<iterateKey>`、code 节点 catch 吞错等既有行为**保持原样**，本批只加 overrides / signal / stopAt）。
- 不做 Coze 式 Chatflow（问答节点、会话变量、跨轮记忆）—— 那是另一种应用类型，另立变更。
- 不做工作流发布为 WebApp / MCP Server / 对外 API。
- 不做工作流版本管理与多人协作。
- 不改 `ops`/`sec` 的合规红线与插件逻辑。
- 不新增办公岗位智能体（`a_builtin_workflow_assistant` 是本批唯一新增）。

# 影响

**新增**

- `packages/ui/src/views/WorkflowWorkbench.vue` —— 工作流模式主视图（两形态共用外壳）
- `packages/ui/src/components/workflow/WorkflowList.vue` —— 可运行工作流列表
- `packages/ui/src/components/workflow/RunFormPanel.vue` —— 入参表单 + 可覆盖节点配置
- `packages/ui/src/components/workflow/RunMonitor.vue` —— 节点级进度 / 日志 / 取消 / 产物
- `packages/ui/src/components/workflow/RunHistory.vue` —— 运行历史与重跑
- `packages/ui/src/components/workflow/DebugInspector.vue` —— 单节点调试 + 变量检查器
- `packages/ui/src/components/workflow/WorkflowPicker.vue` —— AI 模式输入框里的可用工作流勾选
- `apps/server/src/routes/workflow.ts` —— 新增 5 条路由（见第 6 节）
- `apps/server/src/services/workflow-tool-registry.ts` —— `wf_<agentId>` 动态工具注册与同步
- 内置智能体 `a_builtin_workflow_assistant` + 配套 skill（db.ts seed）
- 测试：`packages/ui/src/stores/mode.test.ts` 增用例；`apps/server` 侧新增 `workflow-mode.test.ts`（列表/取消/覆盖/调试/定时分支）
- `openspec/changes/workflow-mode/mockup-workflow-mode.html` —— 可交互原型

**修改**

- `packages/ui/src/stores/mode.ts` —— `AppMode` 加 `wf`、`MODE_DEFS`、`LEAD_DEFAULTS`、`chatPlacementOf`
- `packages/ui/src/components/workbench/ModeSwitcher.vue` —— 图标映射
- `packages/ui/src/config/scenes.ts` —— 新增 `wf` 场景（不进 `WELCOME_SCENES`）
- `packages/ui/src/router/index.ts` —— 新增 `/workflow` 路由与白名单
- `packages/ui/src/components/chat/ChatInputArea.vue` —— 工作流模式挂载 `WorkflowPicker`
- `packages/ui/src/components/chat/ScheduledTaskDialog.vue` —— 任务类型 + 工作流选择 + 入参
- `packages/core/src/workflow/engine.ts` —— `RunContext.signal`、`RunOptions.stopAtNodeId`、导出 plan 函数
- `apps/server/src/workflow-runner.ts` —— `annotateBundle` 支持 overrides、handler 透传 signal、`cancelWorkflowRun`、调试缓存
- `apps/server/src/routes/workflow.ts` / `services/scheduled-tasks.ts` / `routes/scheduled-tasks.ts` —— 定时触发接线
- `apps/server/src/llm-task-manager.ts` —— 补传 `delivery`、`wf_*` 工具拦截分发
- `apps/server/src/db.ts` —— 新智能体 seed；按需增量迁移（`conversation_file.conversation_id` 可空 或 `run_artifact` 表）
- `packages/ui/src/stores/agent.ts` —— 运行改 SSE 订阅（替 1s 轮询）

**风险分级**

- high：`ToolRegistry` 进程级单例 + 重名 throw（工具注册需稳定命名与幂等）；引擎加 signal 要动 llm/tool 节点与 MCP 调用链
- medium：手动运行产物落盘路径（`conversation_file` 允许空 conversation_id 会影响其他查询）；SSE 走 `authMiddleware`，`EventSource` 不带 header
- low：模式注册与场景定义（沿用 `four-mode-workspace` 成熟路径）

# 与旧变更的关系

- **`four-mode-workspace`**：直接复用其模式/形态（`lead`）机制、`WorkbenchShell`、`LeadToggle`、共享会话决策；本变更是第五个模式的同构扩展，不回退其任何结论。
- **`decompose-chat-view`**：复用 `components/chat/*` 与 `useChat` 作为 AI 模式对话栏底座。
- **`improve-agent-tool-system`**：`wf_*` 工具注册依赖其工具注册/挂载机制，遵循其 id 命名与 `registry.has` 过滤规则。
- **`sec-lab-workbench` / `ops-shell`**：不涉及。

# 所需 Skill 标注

- **`openspec`**（必需）：提案 / 设计 / 规格 / 任务清单与结构校验。
- **`yan-zhi-code-ui-verify`**（必需，落地后）：工作流模式两形态与调试面板的实际渲染核验。
- **`agent-browser`**（可选，落地后）：运行表单与节点进度的交互截图核验。
