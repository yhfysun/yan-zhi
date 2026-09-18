# 任务清单

> **第一批（已交付）**：模式骨架 + 运行台闭环（选工作流 → 填入参 → 覆盖节点参数 → 运行 → 看节点级进度 → 历史重跑）。
> **第二批（已交付）**：取消运行 + 单节点调试（运行到节点 / 单跑节点 / 改变量后从此节点继续）。
> **第三批（已交付）**：AI 形态（工作流助手 + `wf_*` 工具注册与分发 + 输入区挂载器）、运行前预检、字段中文标签与下拉化。
> **第四批（已交付）**：定时触发接线（任务类型 + 工作流选择 + 固定入参）、手动运行产物落盘、只读权限门禁。
> 剩：`yan-zhi-code-ui-verify` 实机渲染核验、可交互原型、工作流助手定制 skill。

## 1. 模式骨架（第五模式 `wf`）

- [x] 1.1 `packages/ui/src/stores/mode.ts:10` `AppMode` 加 `'wf'`
- [x] 1.2 `mode.ts:29` `MODE_DEFS` 加 `wf` 项（`route:'/workflow'`，不填 `pluginId`）
- [x] 1.3 `mode.ts:43` `LEAD_DEFAULTS.wf = 'human'`；`mode.ts:129 chatPlacementOf` 加分支（`human→right`，`ai→center`）
- [x] 1.4 `components/workbench/ModeSwitcher.vue:95` `ICONS` 加图标映射（`Connection`）
- [x] 1.5 `config/scenes.ts` 新增 `wf` 场景（提示词 + Skill 关键词 + `agentId: a_builtin_workflow_assistant`），确认不进 `WELCOME_SCENES`
- [x] 1.8 `useChat.startNewChat` 补 `wf → setScene('wf')`（原来只有 dev 会自动挂场景，wf 场景定义了却从不激活）
- [x] 1.9 `App.vue` 的 `fallbackAgent` 加 `wf → a_builtin_workflow_assistant`（否则进工作流模式绑的是「日常办公助手」）
- [x] 1.6 `router/index.ts` 新增 `/workflow` 路由 + 白名单，检查 `:218-220` 模式守卫
- [x] 1.7 新建 `views/WorkflowWorkbench.vue` 骨架（左列表+历史 / 中运行台 / 右对话；`LeadToggle` 切形态）

## 2. 后端接口补齐

- [x] 2.1 `routes/workflow.ts` 新增 `GET /agents`（列表 + `buildWorkflowInputFieldDefs` 输出字段 + 节点可覆盖项 + 最近运行状态）
- [x] 2.2 新增 `POST /runs/:id/cancel` + `workflow-runner.ts` 的 `cancelWorkflowRun(runId)`（状态 `aborted`，发 `run:aborted` 事件）
- [ ] 2.3 新增 `GET /runs/:id/artifacts`
- [x] 2.4 新增 `POST /debug/run-to`、`POST /debug/node`、`POST /debug/continue`（配套 `debugRunTo` / `debugRunNode` / `debugRunFrom`）
- [x] 2.5 运行请求体接收 `nodeOverrides` 并透传到引擎（`annotateBundle` 第二参 + `pickNodeOverrides` 白名单）
- [x] 2.6 `services/workflow-tool-registry.ts`：`syncWorkflowTools()` 幂等注册/注销 `wf_*`（先 unregister 再 register，规避单例重名 throw）
- [x] 2.7 `index.ts` 启动时（seed 内置工作流之后）调用 `syncWorkflowTools`；新增/删除工作流再同步
- [x] 2.8 新增 `POST /preflight`：运行前预检（含 API 工具集并入、模型可用性、入参类型）

## 3. 运行模式（人工主导）

- [x] 3.1 可运行工作流卡片列表（搜索 + 节点数 + 最近运行状态点）—— 内联在 `WorkflowWorkbench.vue` 左栏，未单独成文件
- [x] 3.2 运行表单：按字段 schema 生成（文本/多行/数字/布尔/JSON），**字段带中文标签**（`INPUT_LABEL_HINTS` 兜底 + 富写法显式声明优先）
- [x] 3.3 折叠区「覆盖节点配置」—— 只渲染默认白名单 + 画布显式声明的字段；**模型/平台是下拉、数值是数字输入、每项显示「当前：xxx」**
- [x] 3.8 预检问题清单 UI：逐条列出（code → 中文名）+「知道了，我去改」/「忽略警告，仍然运行」
- [x] 3.4 `components/workflow/RunMonitor.vue`：`EventSource` 订阅 SSE（按 seq 续传），替换 1s 轮询
- [x] 3.5 节点状态色 + 耗时 + 失败信息 + 完成态结果 + **取消按钮**（含「已取消 / 已暂停」两种终态样式）
- [x] 3.6 运行历史：复用 `GET /runs`（已补回 `inputs` 供重跑），列表 + 点击回看 + 回填入参
- [x] 3.7 `DebugInspector.vue`：节点下拉「运行到此节点」+ 快照列表（可编辑 JSON）+ 单跑 / 从此节点继续 + code 节点吞错提示

## 4. 引擎扩展

- [x] 4.1 `packages/core/src/workflow/engine.ts`：`RunContext` 增 `signal?`，`RunOptions` 增 `signal?` 与 `stopAtNodeId?`；新增 `WorkflowAbortError` / `throwIfAborted`
- [x] 4.2 `engine.ts` 的 `executePlan` 每个节点前 + loop 每轮迭代检查 `signal.aborted`；执行完 `stopAtNodeId` 后 return
- [x] 4.3 `export buildExecutionPlan` / `buildSubgraphPlan` / `createRunContext`；新增 `public runPlan(plan, agent, ctx, opts)`
- [x] 4.4 `apps/server/src/workflow-runner.ts:153 annotateBundle` 加 `overrides` 参数并在 `:156` 合并
- [x] 4.5 `executeBundle`(:602) / `startWorkflowRun`(:658) 逐层透传 `overrides` / `signal` / `stopAtNodeId`
- [x] 4.6（**改为：刻意不做**）llm/tool 节点不接 signal —— 取消只在**节点之间**生效，不强行中断单个 LLM/MCP 请求（中断一半的响应没有可用结果，不如让它落地）。已落 `aborted` 状态与注释说明
- [x] 4.7 同上（tool 节点不加 signal）
- [x] 4.8 `WorkflowRunState` 增 `snapshots`（节点输出快照）+ `abort`（AbortController）+ `bundle` / `inputs` / `finished` / `settle`；状态枚举加 `aborted` / `paused`
- [x] 4.9 调试接口实现（run-to / node / continue），含快照复原与「改变量后继续」

## 5. AI 模式（工作流助手 + 工具化）

- [x] 5.1 `db.ts:1481 seedAgents` 新增 `a_builtin_workflow_assistant`（`type:'harness'`、`force_sync:true`、maxReActSteps=32、不挂 call_agent）
- [x] 5.2 编写其 system_prompt（先查入参再调 / 按节点顺序讲结果 / 失败定位到节点 / 长流程预期管理；**正文无反引号**）
- [ ] 5.3 定制 skill「工作流编排指南」「节点排障手册」（提示词已覆盖主要能力，skill 待补）
- [x] 5.4 为每个 `type='workflow'` 智能体生成 `wf_<agentId>` 工具定义（schema 来自输入字段，带中文标签与必填标记）
- [x] 5.5 `llm-task-manager.ts` 加 `wf_` 前缀分支 → 结构化参数直传 → `startWorkflowRun`（**传 delivery**，顺带修了 1535 漏传的老 bug）
- [ ] 5.6 `tool-permission.ts` 放行 `wf_` 前缀（当前 `wf_*` 走的是"已注册即放行"路径，需实测确认是否还需白名单）
- [x] 5.7 工具清单经会话 `builtin_tool_ids` 挂载子集暴露；单会话上限 8（前后端各一道校验）
- [x] 5.8 `WorkflowPicker.vue`：勾选工作流 → 写会话 `builtinToolIds`；**只在 WorkflowWorkbench 渲染，不进共享 ChatInputArea**
- [x] 5.9 保留 `call_agent` 委派通道作为长流程异步路径

## 6. 定时触发接线

- [x] 6.1 `routes/scheduled-tasks.ts:10 rowToTask` 补 `taskType / workflowAgentId / workflowBundle / workflowInputs`
- [x] 6.2 创建与更新解构白名单同步补 4 字段；创建时校验「工作流任务必须有 workflowAgentId / 对话任务必须有 prompt」
- [x] 6.3 `services/scheduled-tasks.ts` 加 `task_type === 'workflow'` 分支（**在确定模型与拼 prompt 之前 return**）：解析 bundle → 校验必填入参 → `startWorkflowRun` 带 delivery
- [x] 6.4 `ScheduledTaskDialog.vue` 加任务类型单选 + 工作流选择器 + 按字段生成入参输入 + 按类型分别校验；编辑态回填类型与入参
- [x] 6.5 定时运行产物回写绑定会话（delivery 传 conversationId，复用既有反写链路）

## 7. 既有缺陷修复

- [x] 7.1 `llm-task-manager.ts:1535` 补传 `delivery` → `delivery_json` 落库 → 重启补投生效（随 5.5 一并修）
- [x] 7.2 ★ **不需要改表**：产物用 `runId` 当 `conversation_file.conversation_id`（该列本就 NOT NULL，
  而 runId 非空且不会串进任何真实会话的文件列表）→ 落 `.yan-zhi/tasks/<runId>/deliverable/`
- [x] 7.3 `persistRunArtifacts()`：从结果里提取 files/artifacts/deliverables 落盘 + 登记；无 delivery 的运行自动调用
- [x] 7.4 ★ **只读权限门禁**（既有缺陷，本轮发现）：`wf_*` 原本在 readonly 会话被放行，
  而运行台绕过会话主体直接起 DAG → 只读用户能跑写文件的流水线。三层修复：
  ① `checkToolPermission` 把 `wf_` 并入不可控前缀；② 新增 `checkWorkflowPermission` 按节点内容判（白名单）；
  ③ `POST /run` 与 `/debug/run-to` 加会话权限校验。

## 6b. 权限判定口径（实测修正，务必保持）
- ★ **必须用白名单，不能用写工具黑名单**：第一版按 `WRITE_TOOLS` 判，结果短剧流水线在只读会话**放行了** ——
  它的写操作是 `api_image_generate` / `api_tts_speak` / `api_srt_generate`（产媒体文件），不在写清单里。
  黑名单枚举「哪些会写」注定静默漏；白名单只放行明确只读的工具，最坏是误拒（用户可见、可放权）。
- 需显式拒的非 tool 节点：`sub_agent`（子流程可能写）、**`memory_write`（直接写记忆库，没有工具名可查，更隐蔽）**。
- 需放行的：`task_plan` / `task_step` / `ask_user`（纯交互无副作用）、`memory_read`、只读 API 工具、`api_kb_search` 等。
- 拿不到工作流定义时**一律拒绝**（信息不足宁可误拒，绝不静默放行）。

## 8. 测试与验证

- [x] 8.1 新增 `apps/server/test/workflow-mode.test.ts`（字段解析含中文标签兜底 / 覆盖白名单 / 覆盖项元数据）—— **15 例**
- [x] 8.1b 新增 `apps/server/test/workflow-preflight.test.ts`（结构错误 / 模型下线 / 工具误报防护 / 入参类型）—— **18 例**
- [x] 8.1c 新增 `apps/server/test/workflow-engine-control.test.ts`（取消 / 断点 / 单节点执行）—— **7 例**
- [x] 8.1d 新增 `apps/server/test/workflow-permission.test.ts`（只读门禁：媒体工具拒绝 / 纯取数放行 / memory_write / 白名单边界）—— **12 例**
- [x] 8.6 Electron 下实机验证（`DATA_DIR` 指向库副本）：
  - 后端启动无崩溃、`wf_*` 注册 3 个、插件全激活
  - `/agents` 返回中文标签 + `control`/`current` 元数据
  - `/preflight` 缺参 / 类型错 / 通过 三种情形正确
  - 定时任务：缺 workflowAgentId → 400；正常创建回传 `taskType/workflowAgentId/inputs`
  - ★ 只读会话跑短剧流水线 → **403 并指出节点 `d_img` 与工具名**；放开权限后正常启动
- [x] 8.2 `mode.test.ts` 补 `wf` 用例；`scenes.test.ts` 同步（14 项、欢迎卡排除 wf、wf 提示词断言）
- [x] 8.3 后端 `tsc` + `fix-esm-extensions`（分两步）并重编 dist；核对 dist import 路径
- [x] 8.4 UI 类型检查 + 全量测试 **173 例通过**
- [x] 8.5 实机验证：后端启动无崩溃、`wf_*` 注册 3 个、插件全激活；`/workflow/agents` 返回中文标签与覆盖项元数据；`/workflow/preflight` 三种情形（通过/缺参/类型错）行为正确
- [ ] 8.6 UI 渲染核验走 `yan-zhi-code-ui-verify`（需重启桌面端后进 /workflow）

## 9. 原型与文档

- [ ] 9.1 `openspec/changes/workflow-mode/mockup-workflow-mode.html` 可交互原型（两形态 + 调试面板 + 定时配置）
- [ ] 9.2 完成后 `openspec validate workflow-mode --json`，通过后归档
