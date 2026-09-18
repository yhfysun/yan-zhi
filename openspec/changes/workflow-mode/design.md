# 设计

## 架构总览

```
                      ┌────────────────── 第五模式 wf (/workflow) ──────────────────┐
                      │                                                             │
  ┌───────────────────┴──────────────┐        ┌──────────────────────────────────┐  │
  │ 运行模式 lead=human              │        │ AI 模式 lead=ai                  │  │
  │  WorkflowList → RunFormPanel     │        │  a_builtin_workflow_assistant    │  │
  │  → RunMonitor(SSE) → RunHistory  │        │  + wf_<id> 工具 + call_agent     │  │
  │  + DebugInspector（单节点调试）   │        │  + WorkflowPicker（勾选挂载）     │  │
  └──────────────────┬───────────────┘        └───────────────┬──────────────────┘  │
                     │     共享同一会话 · 同一份运行记录与产物   │                      │
                     └──────────────────┬─────────────────────┘                      │
                                        ▼                                            │
                    apps/server  /api/workflow/*  (run / runs / stream / cancel /    │
                    agents / artifacts / debug)  +  scheduled-tasks  workflow 分支    │
                                        ▼                                            │
                    workflow-runner.ts  (overrides / signal / stopAtNodeId)          │
                                                                                     │
  定时触发 ──────► services/scheduled-tasks.ts:292  task_type === 'workflow' ────────┘
```

## 决策 1：模式注册走 `four-mode-workspace` 的成熟路径，不新造机制

`packages/ui/src/stores/mode.ts` 的 `ModeDef.pluginId` 是**可选**的（office/dev 都未填），内置模式完全支持；`desktopOnly` 只对插件模式生效。因此新增 `wf` 只需四处：

- `mode.ts:10` `AppMode` 联合类型加 `'wf'`
- `mode.ts:29` `MODE_DEFS` 加 `{ key:'wf', label:'工作流', route:'/workflow', ... }`（**不填 pluginId**，非 desktopOnly —— 工作流模式三端都应可用）
- `mode.ts:43` `LEAD_DEFAULTS.wf = 'human'`（先手动跑通，符合调试优先直觉）
- `mode.ts:129` `chatPlacementOf('wf', lead)` → `human:'right'` / `ai:'center'`

外加 `ModeSwitcher.vue:95 ICONS` 加图标映射（`:110 shortLabel` 自动遍历 MODE_DEFS，无需改）、`router/index.ts` 加路由与白名单（注意 `:218-220` 的 `activeMode.value !== 'office'` 守卫）、`config/scenes.ts` 加 `wf` 场景且不进 `WELCOME_SCENES`。

> 移动端：工作流模式**不设 desktopOnly**，但单节点调试面板在窄屏降级为纵向抽屉。

## 决策 2：运行列表与表单的 schema 来源固定为 `extractWorkflowInputFields`

内置工作流的 `inputs_schema_json` **恒为 NULL**，真实 schema 在 `workflow_json` 的 input 节点 `config.schema`。必须统一用 `services/workflow-delegate.ts:87 extractWorkflowInputFields(agent)`，**禁止**用 `parseInputsSchema(agent.inputs_schema_json)`（既有坑：字段为空 → 参数被塞进 `key=input` → DAG 读 `ctx.inputs.topic` 取不到 → 「未命名主题」）。

新增 `GET /api/workflow/agents` 返回：

```
{ id, name, description, fields: Array<{ key, label, type, required, default, options? }>,
  lastRun?: { id, status, createdAt } }
```

## 决策 3：节点参数覆盖 = 白名单 + 运行时 overrides（抄 Dify「隐藏并预填」）

**问题**：LLM 节点光模型/温度/提示词就有七八项，十几个节点全暴露会撑爆表单。

**方案**：

1. 画布节点配置新增可选字段 `runtimeOverridable: string[]`（列出允许运行时覆盖的 config 键，如 `['modelId','temperature']`），在节点配置面板以勾选形式维护。
2. 运行请求体增 `nodeOverrides: Record<nodeId, Record<string, unknown>>`，只传被勾选的键。
3. 引擎侧**唯一交接点**是 `packages/core/src/workflow/engine.ts:149 handler.execute(node.config, ctx)`；因此最小侵入是在 `apps/server/src/workflow-runner.ts:153 annotateBundle(bundle)` 加第二参 `overrides`，在 `:156` 处合并：`{ ...n.config, ...(overrides?.[n.id] || {}), __nodeId }`。
4. 透传链：`startWorkflowRun(bundle, inputs, userId, delivery)` → `executeBundle`(:602) → `annotateBundle`(:609) → 路由 `workflow.ts:22` 从 `body.nodeOverrides` 读入。

未覆盖的键一律走画布默认值，表单里**不显示**。

## 决策 4：工作流注册为工具 —— 全局注册 + 会话挂载子集

**约束**：`packages/core/src/tool/registry.ts:5 ToolRegistry` 是**进程级单例**，`register` 重名直接 throw；且 `llm-task-manager.ts:2443` 有 `if (!registry.has(name)) continue;` —— 未注册的 tool id 会被**静默丢弃**。

**方案**：

- 命名：`wf_<agentId>`（id 唯一，天然不重名）。新增 `apps/server/src/services/workflow-tool-registry.ts`，导出 `syncWorkflowTools(getDb)`：扫描 `type='workflow'` 的智能体，为每个注册/更新一个 `BuiltInTool`（`execute` 仅占位，注释标明「后端执行」），并处理已删除工作流的 `unregister`。
- 时机：server 启动时调一次（仿 `registerManagementTools`，由 `mcp/index.ts:19` 那种入口调用）；新增/删除工作流智能体后再调一次。
- 参数 schema：由 `extractWorkflowInputFields` 结果生成 `{ type:'object', properties, required }`。
- **暴露给模型的只是子集**：工具清单由会话 `builtin_tool_ids` 决定（`llm-task-manager.ts:2440` 合并规则 = `agent.builtin_tool_ids ∪ conv.builtinToolIds`）。全部注册进 registry 无害（不传模型就不占 context），只有被勾选的 `wf_*` 才进请求。清单拼装在 `:2549-2556`（call_agent/list_sub_agents 追加处）之后追加。
- **执行**：`llm-task-manager.ts:1350` 附近（`if (toolName === 'call_agent')` 同一层）加 `if (toolName.startsWith('wf_'))` 分支 → 解析 agentId → `startWorkflowRun`（**必须传第 4 参 delivery**，见决策 9）。
- **权限**：`apps/server/src/tool-permission.ts` 的白名单需放行 `wf_` 前缀（否则被拦截）。
- **上限保护**：单个会话挂载 `wf_*` 上限 8 个，超出时在 UI 提示「一次挂载过多会让模型难以选择」。

`call_agent` 保持现状作为长流程异步通道（Coze 式，超时放宽），两条路并存。

## 决策 5：单节点调试 = 导出 plan 函数 + stopAtNodeId + 调试缓存

引擎现状：`buildExecutionPlan(nodes, edges)`（`engine.ts:178`）、`buildSubgraphPlan`(:187) 均为模块私有；`RunContext`（:8-14）= `inputs` + `outputs: Map` + `get/set`，由 `createRunContext(inputs, callStack)`(:16) 构造；`RunOptions`(:39)。

改动：

1. `export` `buildExecutionPlan` / `buildSubgraphPlan` / `createRunContext`（供调试复用，不改语义）。
2. `RunOptions` 增 `stopAtNodeId?: string`；`executePlan` 循环在命中目标节点执行完后 return，状态置 `paused`。**loop 节点内联分支单独处理**（`continue` 会跳过通用断点检查，必须在 loop 的 `continue` 之前补一次比对）。
3. 新增 `public runPlan(plan, agent, ctx, opts)` —— `run()` 是「从入口跑整条」，调试需要「跑一个子图 / 只跑一个节点」，且 ctx 要由调用方给（里面是复原出来的快照）。
4. 调试缓存：`WorkflowRunState`（`workflow-runner.ts:59`）增 `snapshots: Map<nodeId, unknown>`（每个节点 ok 后由 `wrapHandler` 写入）、`bundle` / `inputs`（复原 ctx 用）、`finished` / `settle`（调试接口要 await 跑完再返回快照）。随既有 30 分钟生命周期一起清理；**不落库**（避免迁移），重启后由孤立回收兜底。
5. 三条调试路由：
   - `POST /api/workflow/debug/run-to` —— 跑到目标节点暂停，返回 runId + 各节点输出快照（同步等待）。
   - `POST /api/workflow/debug/node` —— 只执行该节点（`runPlan({pending:[nodeId]}, stopAtNodeId:nodeId)`），返回输出并写回快照。
   - `POST /api/workflow/debug/continue` —— 从某节点继续（`buildSubgraphPlan(fromNodeId)`），支持 `variableOverrides` 覆盖任意节点输出后推进下游；会把上一步 `aborted`/`paused` 的运行重新置为 `running` 并换新 AbortController（否则断点后无法续跑）。
6. 前端 `DebugInspector.vue`：节点下拉「运行到此节点」+ 快照列表（可编辑 JSON）+「单跑」/「从此继续」+ code 节点吞错提示。

> ★ 实施中发现的坑（已写进测试）：如果用「ctx 里最后一个输出」当上游，**重跑同一个节点会读到它自己上一次的输出**，出现 `saw:saw:saw:原始值` 这种套娃。调试续跑必须让下游按**节点 id** 取值（`ctx.get('<nodeId>')`），且「从此继续」是从该节点本身重跑子图，不是只跑下游。

## 决策 6：取消运行 = AbortSignal + 新增 `cancelWorkflowRun`（★ 实施后修正）

现状：`RunContext`/`RunOptions` 全无 signal，`workflow-runner.ts` 零 AbortController；`withAbortAndTimeout`（`workflow-delegate.ts:195`）只包了反写，不包 DAG。`LlmClient.chat` 已支持 `options.signal`（`packages/core/src/llm/client.ts:179`）。

实施后的方案（与原方案第 2/3 条不同，见下方说明）：

1. `RunContext` 增 `signal?: AbortSignal`，`RunOptions` 增 `signal?` + `stopAtNodeId?`；新增 `WorkflowAbortError` 与 `throwIfAborted()`。
2. 取消检查点 = **节点之间**（`executePlan` 每轮 while 顶部）+ **loop 每轮迭代**（长循环必须能停，否则 loop 里的迭代跑完整个循环才响应取消）。loop 的子 ctx 也要带上同一个 signal。
3. ★ **不做**：llm / tool 节点内部不接 signal，不强行中断单个 LLM 或 MCP 请求。
   - 理由：掐断到一半的 LLM 响应拿不到可用结果，剩下的上游产物也拼不成有效节点输出；让它跑完当前这一跳，代价是最多多等几秒。
   - 结果：这是**协作式取消**，不是 kill。因此运行历史的文案与状态要能表达"取消"而不是"出错"。
4. `WorkflowRunState` 增 `abort: AbortController`；`cancelWorkflowRun(runId)` 置 `status:'aborted'` 并发 `run:aborted`（**不是** `run:failed` —— 原方案这里写错了，会让主动取消在历史里显示成红叉，用户分不清是自己点的还是流程崩了）。
5. `startWorkflowRun` 的 catch 里按 `e.name === 'WorkflowAbortError'` 区分取消与失败，二者落不同状态。
6. 路由 `POST /api/workflow/runs/:id/cancel`；`markOrphanWorkflowRunsInterrupted` 回收范围从 `running` 扩到 `running + paused`（断点运行的续跑依赖内存 snapshots，重启后必须回收）。

## 决策 6b：状态机（实施后确立）

```
running ──成功──→ completed
   │   └─失败──→ failed
   ├─取消──→ aborted        （用户主动；可重跑，不算错误）
   └─断点──→ paused          （单节点调试停在 stopAtNodeId；可「从此节点继续」）
```

`paused` 与 `aborted` 都是**可继续/可重跑**的中间态，UI 上不能渲染成失败色。

## 决策 7：SSE 订阅（替换 1s 轮询），无鉴权障碍

- 后端事件只有 `data:` 行、无 `event:` 名（`routes/workflow.ts:97-108`），`WorkflowRunEvent` = `{ type, seq, nodeId, nodeType, msg, result }`，`seq` 自增、内存留痕上限 500、`subscribeWorkflowRun(runId, since, onEvent)` 支持续传。
- **好消息**：`authMiddleware`（`apps/server/src/auth.ts:34`）本地模式恒 guest、不看 token，所以原生 `EventSource` 可以直接用，无需把 token 拼到 query。
- 前端 `stores/agent.ts:556/563` 的「POST /run + 1s 轮询 600 次」改为 `EventSource('/api/workflow/runs/{id}/stream?since=' + lastSeq)`，按 seq 游标续传；`req.on('close')` 已退订。
- 事件不落库：刷新页面后历史运行只显示终态（够用）；**运行历史列表**走 `GET /runs`。

## 决策 8：手动运行（无会话）的产物落盘

现状：产物登记 `deliverWorkflowFile`（`llm-task-manager.ts:1624-1648`）依赖 `WorkflowDeliveryCtx.conversationId`，手动运行根本不走落盘，产物只留在 `result_json`。

方案：

- 手动运行以 `runId` 作为兜底归属：`ensureArtifactDirFor({ conversationId: runId, category: 'deliverable' })`（`services/artifact-dir.ts:156`）。
- `conversation_file.conversation_id` 允许为空（该列本就无 NOT NULL 约束时直接写入；若有约束则按 `db.ts:2469` 附近的裸 try/catch 惯例放宽），或新增 `run_artifact(run_id, path, ...)` 表。**实施时先查该列约束**，二选一，优先复用 `conversation_file` 以免多一套表。
- 新增 `GET /api/workflow/runs/:id/artifacts` 返回产物清单，下载走既有 `/api/generated/<kind>/...` 通道（**不要把 `C:/...` 绝对路径喂给 `<img>`**，既有教训）。

## 决策 9：定时触发 —— 只接线，不新建

已具备：`db.ts:2460-2463` 的 `task_type / workflow_bundle_json / workflow_inputs_json / workflow_agent_id`；`packages/ui/src/stores/scheduledTask.ts:48-54` 的 `taskType / workflowAgentId / workflowBundle / workflowInputs` 与 `rowToTask`(:105-108)、`createTask`(:214-223)。

缺的三处：

1. `apps/server/src/routes/scheduled-tasks.ts:10 rowToTask` 补 4 个字段；`:60` 创建与 `:85` 更新的解构/白名单同步补。
2. `apps/server/src/services/scheduled-tasks.ts:292 runScheduledTask` 在 `:337` 前加分支：
   ```
   if (task.task_type === 'workflow') {
     const bundle = resolveBundle(task.workflow_agent_id, task.workflow_bundle_json)
     startWorkflowRun(bundle, task.workflow_inputs_json ?? {}, task.user_id,
                      { conversationId: task.conversation_id, ... })   // 必须传 delivery
     return
   }
   ```
   注意 chat 分支把 `prompt` 拼成 `[定时任务] name\n prompt`（:343），workflow 分支**不走**这段。
3. `ScheduledTaskDialog.vue:290-316` 的 `form` 增 `taskType`（对话任务 / 工作流任务）+ 工作流选择器 + 固定入参编辑器（schema 来自 `/api/workflow/agents`），提交体（`:683-693`）带上。store 无需改。

## 决策 10：内置智能体 `a_builtin_workflow_assistant`

- 加在 `db.ts:1481 seedAgents` 数组末尾（`:1701` 之前），`type:'harness'`、`is_builtin:1`、`force_sync:true`（与项目内置智能体惯例一致；已知副作用：用户对它的名称/工具/提示词改动会在启动时被覆盖）。
- **绝不**用 workflow 型 agent 当宿主：`agent.system_prompt` 为 NULL + `builtin_tool_ids` 为 `[]`，提示词无角色/无工具段，连 `ask_user` 都进不来（既有坑，已在 `runReActLoop` 入口拦截）。
- 工具挂载：通用集（`file_*` / `browser_*` / 通用 `api_*`）+ `list_sub_agents`；**挂载的 id 必须已在 registry 注册**，否则被 `registry.has` 静默丢弃。
- skill：定制「工作流编排指南」「节点排障手册」；**若改内置 skill body 必须把 id 加进 `SKILL_BODY_REFRESH_IDS`（`db.ts:2381`）**，否则批量 upsert 不覆盖已有 body。
- 提示词正文里**禁止出现反引号**（prompt 是 TS 模板字符串，已有事故）；改完必须 `tsc --noEmit` 验语法。

## 决策 11：两形态共享会话（沿用 four-mode 决策 1b）

复用 `chatStore.currentConvId`，切形态不新建会话、不清消息；手动运行的产物登记到该会话（`conversation_file`）并推 `file:registered`，AI 模式里可直接引用。

## 数据模型变更（一律增量迁移）

- `agent` 表：仅 seed 新增一行，无结构变更。
- `conversation_file.conversation_id`：按需放宽为可空（先查约束）。
- `scheduled_task`：**无新增列**（已预留）。
- `workflow_run`：不新增列，调试缓存存内存。
- 迁移写法照 `db.ts:2469` 附近惯例：`try { db.exec('ALTER TABLE ...'); } catch {}`。**禁止只改 CREATE TABLE**（旧库无增量会 500）。

## 风险与验证

| 风险 | 级别 | 对策 |
|---|---|---|
| `ToolRegistry` 单例 + 重名 throw | high | `wf_<agentId>` 稳定命名；`syncWorkflowTools` 幂等（已存在先 unregister 再 register）；启动失败不能崩 server，try/catch 包住 |
| 引擎加 signal 波及 llm/tool/MCP 调用链 | high | signal 一律**可选参数**，默认行为不变；先只让 llm 节点响应取消，tool 节点视改动面分批 |
| 手动运行产物落盘影响既有查询 | medium | 若放宽 `conversation_id` 可空，需全量检索该表查询点（文件管理弹窗三段：已上传/中间文件/已交付）确认不漏不串 |
| code 节点 catch 吞错 | medium | 调试面板显式提示；不在本批改引擎语义 |
| 定时分支与 chat 分支串味 | low | `runScheduledTask` 的 workflow 分支在拼 prompt 之前 return |
| seed 报错被吞 | low | `db.ts:1724` 的 try/catch 会吞掉 seed 错误 → 新增 agent 后必须重启冒烟确认落库 |

**测试**（正式测试类，非临时脚本）：

- `apps/server/src/workflow-mode.test.ts`：`/workflow/agents` 列表与 schema、nodeOverrides 合并、cancel 状态机、debug run-to / node、定时 workflow 分支、手动运行产物落盘
- `packages/ui/src/stores/mode.test.ts`：补 `wf` 模式与 lead 默认值用例（文件已存在，追加）
- UI：工作流模式两形态渲染核验走 `yan-zhi-code-ui-verify`
