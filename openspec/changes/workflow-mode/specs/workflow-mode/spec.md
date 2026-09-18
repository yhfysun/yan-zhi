# 变更规格：工作流模式

## ADDED Requirements

### Requirement: 工作流模式作为第五种模式

系统 SHALL 提供模式键 `wf`（工作流模式，路由 `/workflow`），与 office/dev/ops/sec 同构注册，支持 `human`（运行模式）与 `ai`（AI 模式）两种主导形态，默认 `human`。

#### Scenario: 模式切换
- GIVEN 用户在任意模式
- WHEN 通过模式下拉选择「工作流」
- THEN 进入 `/workflow`，左栏为可运行工作流列表，中栏为运行台，右栏为任务对话
- AND 既不新建会话也不清空消息（沿用共享会话语义）

#### Scenario: 形态切换
- GIVEN 用户处于工作流模式
- WHEN 切换 `[AI 模式 | 运行模式]`
- THEN 仅改变布局与对话位置（`human` → 对话在右、`ai` → 对话居中），不换会话、不中断正在进行的运行
- AND 该模式的形态选择被持久化

### Requirement: 可运行工作流清单与输入字段

系统 SHALL 提供 `GET /api/workflow/agents`，返回所有 `type='workflow'` 智能体的 id / 名称 / 描述 / 输入字段 schema / 最近一次运行状态。输入字段 SHALL 由 `extractWorkflowInputFields` 从 `workflow_json` 的 input 节点解析，**不得**依赖 `inputs_schema_json`。

#### Scenario: 内置工作流的字段解析
- GIVEN 一个内置工作流智能体（`inputs_schema_json` 为 NULL，输入定义在 input 节点 `config.schema`）
- WHEN 请求可运行工作流清单或生成运行表单
- THEN 返回真实字段列表（如 `topic`），而不是空列表或退化为单一 `input` 字段

### Requirement: 运行时节点参数覆盖

系统 SHALL 支持节点配置声明 `runtimeOverridable: string[]`，仅这些字段允许在运行表单中覆盖；运行请求 SHALL 支持 `nodeOverrides`，引擎在执行前把覆盖值合并进 `node.config`。

#### Scenario: 覆盖 LLM 节点模型
- GIVEN 某 LLM 节点的 `runtimeOverridable` 为 `['modelId']`
- WHEN 用户在运行表单把该节点模型改为另一个模型并运行
- THEN 该节点以用户所选模型执行，其余参数仍取画布默认值

#### Scenario: 未声明的字段不被覆盖
- GIVEN 某节点未声明 `runtimeOverridable`
- WHEN 运行表单渲染
- THEN 该节点的参数不出现在表单中，运行请求也不得携带其覆盖值

### Requirement: 运行监控、取消与历史

系统 SHALL 通过 SSE 推送节点级进度事件，提供 `POST /api/workflow/runs/:id/cancel` 取消运行，并提供运行历史列表（复用 `GET /runs`）与「按上次参数重跑」。

#### Scenario: 前端订阅进度
- GIVEN 一次正在进行的运行
- WHEN 前端打开运行面板
- THEN 通过 `EventSource` 按 seq 游标订阅事件，实时显示每个节点的开始/成功/失败与耗时，不再使用 1 秒轮询

#### Scenario: 取消运行
- GIVEN 一次正在进行的运行
- WHEN 用户点击取消
- THEN 引擎在下一个检查点中止执行，运行状态置为已终止，已完成的节点产物保留，前端停止订阅

### Requirement: 单节点调试

系统 SHALL 支持「运行到指定节点后暂停」与「单独运行某个节点」，并允许查看、编辑已执行节点的输出变量后从该节点继续。

#### Scenario: 运行到指定节点
- GIVEN 一次调试运行指定了目标节点
- WHEN 执行到该节点完成
- THEN 流程暂停并返回截至目前所有节点的输出快照

#### Scenario: 改变量后重跑下游
- GIVEN 流程已暂停或某节点失败
- WHEN 用户在变量检查器修改某节点输出并点击「从此节点继续」
- THEN 下游节点使用修改后的值执行，**不重跑上游节点**

### Requirement: 手动运行的产物落盘

系统 SHALL 为无会话触发的运行（运行台手动触发、定时触发未绑定会话）落盘产物并提供 `GET /api/workflow/runs/:id/artifacts` 与下载通道。

#### Scenario: 手动运行产出文件
- GIVEN 用户在运行台手动运行一个会产出文件的工作流
- WHEN 运行成功
- THEN 产物写入以 runId 归属的交付目录，并可在运行面板与历史中查看/下载

### Requirement: 工作流注册为工具

系统 SHALL 为每个 `type='workflow'` 的智能体注册 `wf_<agentId>` 工具（参数 schema 来自输入字段），执行由后端分发；暴露给模型的工具 SHALL 仅为该会话 `builtin_tool_ids` 中挂载的子集，单会话挂载上限 8 个。

#### Scenario: 助手调用工作流工具
- GIVEN 会话挂载了 `wf_a_wf_drama_pipeline`
- WHEN 模型发出该工具调用并传入符合 schema 的参数
- THEN 后端启动对应工作流运行，回执与产物回写到当前会话

#### Scenario: 未挂载的工作流不进入工具清单
- GIVEN 存在 20 个工作流，会话仅挂载 2 个
- WHEN 构造模型请求的工具清单
- THEN 只包含这 2 个 `wf_*` 工具（其余虽已注册但不发送）

### Requirement: 工作流助手

系统 SHALL 提供内置智能体 `a_builtin_workflow_assistant`（`type='harness'`），具备参数补全、结果解读、失败重试建议与工作流推荐能力，挂载通用工具集与定制 skill。

#### Scenario: 工作流助手可独立对话
- GIVEN 用户在 AI 模式
- WHEN 直接向工作流助手提问（未调用任何工作流）
- THEN 助手正常作答并可使用通用工具，不出现「平台不存在」或静默闲聊退化

#### Scenario: 禁止以工作流智能体作为会话宿主
- GIVEN 某个 `type='workflow'` 的智能体
- WHEN 尝试把它设为会话智能体
- THEN 系统拒绝并给出明确引导（表明其只能通过运行台、定时或委派执行）

### Requirement: 定时触发工作流

系统 SHALL 支持 `task_type='workflow'` 的定时任务：选择工作流智能体 + 固定入参，按计划执行，并把 `delivery` 上下文传给运行以便回写与补投。

#### Scenario: 定时运行工作流
- GIVEN 一个 `task_type='workflow'` 且绑定了会话的定时任务
- WHEN 到达计划时间
- THEN 后端以固定入参启动工作流运行（不经过 ReAct / 不拼 `[定时任务]` 前缀 prompt），产物回写到绑定会话

#### Scenario: 立即运行
- GIVEN 一个工作流定时任务
- WHEN 用户点击「立即运行」
- THEN 与定时触发走同一条分支
