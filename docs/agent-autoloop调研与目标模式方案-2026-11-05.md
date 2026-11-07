# Agent Autoloop 调研与言智「目标模式」自研方案

> 调研日期：2026-11-05
> 调研对象：`KKKKhazix/agent-autoloop`
> 快照：v1.2.0，约 2.9k stars，MIT，2026-11-03 创建
> 范围：只做调研与方案，不改业务代码

## 零、结论先行

| 结论 | 建议 |
|---|---|
| Agent Autoloop 解决的是「任务如何不断线」，不是「目标是否真的完成」 | 言智需要补一层可验证的 Goal Run，而不是只加 `while(true)` |
| autoloop 的可靠性来自事件日志、租约、心跳、幂等回执和会话续接 | 借机制，不直接嵌整个内核 |
| 官方目前只支持 macOS/Linux，Windows 版本仍在 issue #17 | 不能作为 Windows 桌面版的核心依赖 |
| 言智已有自动接力、计划回注、子智能体接力、暂停与插话 | 不要重写 ReAct 循环，在其上增加持久化调度层 |
| 当前最大的断点是进程重启后任务不可原地恢复 | 新增 `goal_run`、租约恢复和可重放检查点 |
| 当前通用看门狗会在 2 小时强杀长任务 | Goal Run 必须与普通任务分开治理，按心跳判断存活，不按总时长直接判死 |
| 「绝对保证任务完成」无法工程承诺 | 可以保证状态不丢、自动重派、可审计恢复；外部世界不可达时必须诚实进入阻塞态 |

推荐路线：

1. **P0 先修持久化地基**：重启恢复、参数快照、租约、心跳、幂等操作账本。
2. **P1 原生做「目标模式」**：目标、验收标准、计划、批次、验证、审批、阻塞、自动重试形成闭环。
3. **P2 自研验证与副作用安全**：确定性验收、人工审批、非幂等操作核对，不引入外部执行内核。
4. **P3 自研任务能力扩展**：目标模板、内部事件触发、多目标排队、资源锁和审计导出。

产品边界：

- 目标模式完整运行不依赖 Agent Autoloop，也不依赖任何其他智能体平台或外部自动化中台。
- 不要求用户额外安装 autoloop、CLI Agent、独立 Node 服务或第二套账号体系。
- Agent Autoloop 只作为本次调研和架构参考，相关机制全部在言智内部重新实现。

### 2026-11-07 实施进度

已完成首个可运行切片：

- 新增 `goal_run`、`goal_batch`、`goal_event`、`goal_approval`、`goal_operation` 表。
- 新增 Goal Store：活动目标唯一约束、状态迁移、事件日志、重启重排队。
- 新增 Goal Runner：批次创建、任务关联、LLM 验收、人工验收、指数退避、连续无进展阻塞。
- `llm_task` 持久化目标关联、真实参数快照、心跳时间和 pending 工具入参。
- 普通任务看门狗改为按最近活动判断；目标批次不走普通 2 小时强杀。
- 服务启动时恢复目标状态并把执行中的批次转为 unknown 后重排。
- 新增目标 HTTP 生命周期：创建、查询、暂停、恢复、结束、人工验收。
- 前端「+」菜单新增目标模式，输入框上方显示目标状态、重试提示和验收操作。
- 任务执行窗口不再根据最后一条消息猜 completed。

尚未完成：

- 确定性验收项执行器（文件、命令、HTTP、页面状态）。
- 非幂等工具的操作前落账与外部状态核对。
- 多目标资源锁、目标模板、内部定时/IM/Webhook 事件源。
- 更细的逐工具检查点和整轮回滚。

## 一、Agent Autoloop 调研

### 1.1 它到底是什么

它不是新的编码 Agent，也不是给现有 Agent 注入一个无限循环。它更像一个极轻量的自动化调度中台：

```text
事件来源 -> 规则匹配 -> 排队 -> 接单程序 -> 启动一次 Agent 进程 -> 读取最后一条消息
                                      <- 回执 / 卡片 / 定时复查 <-
```

四个边界很清楚：

- **事件**：时间、GitHub、HTTP、业务系统、人工回答，最终都归一成事件。
- **一轮**：Agent 启动一次，处理一批事件，输出结论和回执，然后退出。
- **事项**：同一规则、同一对象的一组事件和会话，可以跨很多轮持续存在。
- **卡片**：需要人拍板时结束当前轮，不占进程、不耗 Token；回答后重新派活。

这与言智当前的单进程 ReAct 循环不同。autoloop 把「执行一次」与「事情是否结束」拆开了，因此进程崩溃、用户离开、等待审批都不会把事项本身弄丢。

### 1.2 最值得借的六个机制

| 机制 | autoloop 的做法 | 对言智的价值 |
|---|---|---|
| 事件溯源 | 所有状态从只追加事实日志计算，日志与投影同事务落盘 | 进程重启后可恢复，能查清每一轮为什么跑 |
| 有限轮次 | Agent 每次只干一轮，需要继续时由中台再次派发 | 不把长任务压在一个不可恢复的调用栈里 |
| 挂起零消耗 | 要人决定时交回执、退出进程；回答变成新事件 | 等审批三天也不必挂进程或持续扣 Token |
| 租约与心跳 | 接单程序持续报告手上任务；5 分钟无心跳进入 unknown，10 分钟无连接提醒用户 | 区分「还在干」和「失联」，不把正常长任务误杀 |
| 幂等 | 同一 claim 重领得到同一任务；同一 token 重交相同结果得到相同确认 | 断网重试不重复派发、不重复记账 |
| 会话续接 | 保存 session，重派和回答后尽量回到原会话，接不上才开新会话 | 避免重头再来和重复副作用 |

补充机制：

- 失败重试从 5 分钟开始指数退避，最长 1 小时，连续 10 次停止自动重试。
- 不同来源事件按 `(source, id)` 去重。
- Agent 自己触发的新事件有 8 层 hop 上限，防止自循环。
- 规则文件、事件正文和 Agent 权限分离，外部文本不直接决定执行目录与权限。
- 进程强杀、重复提交、乱序请求有模拟测试与崩溃测试覆盖。

### 1.3 它没有解决什么

autoloop 没有显式的「goal / objective / acceptance criteria」模型。它保证的是：

- 事情不会因为 Agent 退出而丢失；
- 临时失败会被重派；
- 人工等待不会占用执行资源；
- 每轮结果和原因可追踪。

它不保证：

- Agent 说「做完了」就真的满足目标；
- 外部网页、接口、账号状态真的已经成功；
- 非幂等操作在崩溃前后绝不会执行两次；
- 目标本身可实现；
- 没有验收标准时，可以机械判断完成。

因此言智的「目标模式」不能只抄 autoloop 的调度器，还必须增加：

- 结构化目标；
- 可执行验收标准；
- 独立验证阶段；
- 证据与产物绑定；
- 非幂等操作账本；
- 无进展升级机制。

### 1.4 成熟度与集成风险

有利因素：

- 架构边界清楚，MIT 许可；
- 测试覆盖明显强于普通新项目；
- 文档明确了失败、重试、幂等、崩溃恢复语义；
- 协议是 HTTP + JSON，适合做语言无关适配。

需要谨慎的地方：

- 项目 2026-11-03 创建，三天内发布到 v1.2.0，迭代速度很快；
- 官方 README 明确 Windows 仍待完成，issue #17 仍为 open；
- 依赖 Node 24；
- 默认面向已安装并登录的 CLI Agent；
- 没有产品级可视化界面；
- 不能直接复用言智现有的浏览器桥、记忆、工作目录、权限和 UI 工具；
- 其 benchmark 与兼容性验证主要基于 macOS。

结论：**适合作为架构参考，不适合也不采用为言智的运行时依赖或外部自动化适配层。**

## 二、言智当前基础与真实差距

### 2.1 已经有的能力

言智不是从零开始，下面这些能力可以直接复用：

| 能力 | 当前实现 |
|---|---|
| 批次自动接力 | `apps/server/src/llm-task-manager.ts:3877` 外层批次循环，达单批步数后结账、自评、继续 |
| 防失控 | 30 批硬顶、连续无进展停滞判定、4 小时设计上限、循环闸门 |
| 计划回注 | `apps/server/src/llm-task-manager.ts:8860` 把 `task_plan_json` 渲染进系统提示词 |
| 计划重规划 | 接力边界检查计划是否过期，必要时改写剩余步骤 |
| 子智能体接力 | `apps/server/src/llm-task-manager.ts:7353` 子智能体也有分批继续 |
| 记忆与进度 | 每批写空间记忆和 `progress.md`，任务结束做记忆整理 |
| 前端断线继续 | ReAct 在服务端运行，前端只订阅事件 |
| 暂停、恢复、插话 | WebSocket/HTTP 已有 pause、resume、abort、inject |
| 工具心跳 | `llm_task.step/updated_at` 在工具活动时刷新 |
| 任务级持久化 | `llm_task` 保留状态、步数和 pending 工具名 |

### 2.2 真正阻碍「不中断」的差距

| 级别 | 差距 | 证据与后果 |
|---|---|---|
| P0 | 生产重启后不会自动恢复 | `markOrphanTasksInterrupted()` 把 running 改成 `interrupted`，只补一句「把要求再发一次」；热重载才有 `resumable`，仍需用户手动继续 |
| P0 | 运行参数没有完整快照 | `persistTaskRow()` 的 `params_json` 固定写 `null`；重启后只能靠会话和智能体现值猜回任务 |
| P0 | pending 工具信息不完整 | `pending_tool_json` 只保存 `callId/toolName/requestedAt`，没有入参、审批上下文和可恢复状态 |
| P0 | 通用看门狗会杀死正常长任务 | `cleanupTasks()` 对 running 超过 2 小时直接 abort；与代码注释中的 4 小时设计上限冲突 |
| P0 | 完成状态可能由 UI 猜测 | `TaskRunWindow.vue:141` 先查活动任务，查不到时按最后一条消息角色推断 completed，可能把中断误显示为完成 |
| P1 | 没有目标与验收标准 | 当前完成判据主要是「模型不再调工具」或模型自评 CONTINUE，不是外部可验证结果 |
| P1 | 没有操作幂等账本 | 发评论、提交表单、上传、发布等非幂等动作在崩溃后无法判断是否已经执行 |
| P1 | 无租约模型 | 只有内存任务和 DB 状态，不能安全判断某个任务是否仍由当前进程持有 |
| P1 | 审批无持久卡片 | `ask_user/confirm_user` 依赖当前进程和前端连接；重启后无法完全恢复同一个待审批点 |
| P2 | 没有事件级审计 | 有消息和进度，但没有统一的「计划、批次、验证、重试、人工决定」时间线 |
| P2 | 工作区并发缺语义 | 两个目标可能同时操作同一目录或浏览器站点，缺少资源锁和冲突提示 |

### 2.3 关键判断

言智当前已经能处理「单批步数耗尽」这一种断点，但还不能处理：

- 进程重启；
- 应用升级；
- 机器休眠后恢复；
- 等用户审批期间重启；
- 工具执行到一半时崩溃；
- 外部接口超时后结果未知；
- 长时间没有进展但也没有明确失败。

所以目标模式的重点不是把 `maxSteps` 调得更大，而是把任务状态从进程内存搬到可恢复的持久化状态里。

## 三、集成路线比较

### 方案 A：直接嵌入 autoloop 内核

做法：把 `kernel/`、`host/`、`worker/` 以源码或 sidecar 形式打包进言智。

优点：

- 直接获得事件溯源、租约、卡片的成熟语义；
- 崩溃恢复测试现成；
- 后续可复用其规则和来源插件。

缺点：

- Windows 官方支持未完成；
- Node 24 与现有打包链耦合；
- `worker` 依赖 `/bin/sh`、`ps`、进程组信号等 Unix 语义；
- 与言智现有 LlmTask、工具、记忆、浏览器、权限体系形成两套执行内核；
- 需要重新做产品级 UI、鉴权和数据迁移；
- 新项目迭代快，直接嵌入的升级风险高。

结论：不推荐作为主路线。

### 方案 B：外部 sidecar + 协议适配

做法：把 autoloop 作为独立服务运行；言智通过 HTTP/MCP 提供事件、读取状态、回答卡片；言智自身也可以作为 autoloop 的一个 `command` Agent。

优点：

- 对现有主程序侵入小；
- 可以直接利用 autoloop 的调度与审批能力；
- 适合服务器版、Linux、macOS 和开发者工作流；
- 后续可以接入 GitHub、飞书、企业微信等事件源。

缺点：

- Windows 桌面版暂时无法作为默认能力；
- 需要额外维护一个 CLI/headless 入口；
- 需要处理两套身份、权限和日志；
- 无法自然复用言智的 UI 工具与浏览器面板；
- 产品会依赖另一个智能体/自动化平台的安装、版本和运行状态；
- 与「目标模式开箱即用、完整自研」的产品方向冲突。

结论：不采用，也不进入后续 roadmap。

### 方案 C：原生 Goal Run 调度层

做法：保留现有 ReAct 循环，在其上方新增持久化目标运行器。

```text
目标定义
  -> 计划
  -> 执行一批
  -> 写检查点
  -> 验证
  -> 未完成：生成纠偏反馈，下一批继续
  -> 需要人：落审批卡片并释放执行资源
  -> 通过：完成
```

优点：

- 直接复用言智现有工具、记忆、权限、浏览器和 UI；
- 不受 autoloop Windows 进度影响；
- 可先把「不丢状态」做扎实，再逐步引入外部事件；
- 能针对言智的真实任务增加验收与证据。

缺点：

- 需要自己实现调度、租约、检查点和幂等；
- 工作量大于简单接一个外部服务；
- 必须补正式测试，尤其崩溃与重复执行。

结论：**推荐作为主方案。**

### 方案 D：完全自研的目标状态与事件层

做法：目标模式使用言智自己的目标表、事件日志、调度器、审批卡片和验证器；定时任务、IM 回调、内部 Webhook 等只作为言智自己的事件来源。

优点：

- 不依赖其他智能体平台；
- 可以复用现有模型、工具、记忆、浏览器、权限和 UI；
- 数据、审计、升级和故障处理都在一个产品边界内；
- 后续可以独立演进目标模板、并发控制和多端审批。

结论：**与方案 C 一起作为最终路线。**

## 四、言智目标模式设计

### 4.1 用户心智

输入框「+」菜单现有：

- 深度思考；
- 计划；
- 仅回答。

建议新增独立开关：

- **目标模式**：给定目标与验收标准，持续执行到验证通过、需要人处理或被用户停止。

目标模式不是计划模式的升级版。区别是：

- 计划模式解决「先列步骤再动手」；
- 目标模式解决「跨批次、跨重启、跨人工等待，直到验证完成」。

建议首版只允许：

- 一个会话最多一个活动目标；
- 一个目标同一时刻最多一个执行者；
- 目标必须绑定当前工作目录、智能体和模型；
- 用户可随时暂停、插话、终止；
- 外部有副作用动作必须先经过审批策略判断。

### 4.2 目标定义

首版不要让用户手写 JSON。模型用结构化表单生成，用户只确认关键项：

```json
{
  "objective": "为目标项目生成可发布的中文介绍页，并通过构建与页面验收",
  "deliverables": [
    "页面源码",
    "构建产物",
    "验收记录"
  ],
  "acceptance": [
    {
      "id": "build",
      "kind": "command",
      "command": "pnpm build",
      "expect": { "exitCode": 0 }
    },
    {
      "id": "page",
      "kind": "browser",
      "url": "http://localhost:5173",
      "expect": { "visibleText": ["产品介绍"] }
    },
    {
      "id": "approval",
      "kind": "human",
      "prompt": "请确认视觉和文案可以交付"
    }
  ],
  "constraints": [
    "不修改工作目录外文件",
    "不自动发布到公网"
  ],
  "approvalRequired": [
    "对外发送",
    "付费",
    "删除数据",
    "生产环境写入"
  ],
  "cost": {
    "noticeCny": 5,
    "hardStopCny": null
  }
}
```

约束：

- 验收项必须有稳定 `id`；
- 执行结果必须能关联证据；
- 主观项只能由人工确认或标记为 `review`；
- 没有验收项时不能自动显示「已完成」，只能请求人工验收；
- `hardStopCny` 默认空，只提醒不终止；用户显式设置后才硬停。

### 4.3 状态机

```text
idle
  -> planning
  -> running
  -> checkpointing
  -> verifying
       -> completed
       -> needing_approval
       -> waiting_external
       -> retry_wait
       -> running
       -> blocked
       -> failed
  -> paused
  -> cancelled
```

状态含义：

| 状态 | 含义 | 是否占执行资源 |
|---|---|---|
| planning | 生成或修订目标、计划、验收标准 | 是 |
| running | 当前批次正在执行 | 是 |
| checkpointing | 持久化计划、进度、产物、操作账本 | 短暂 |
| verifying | 执行确定性检查、模型检查或人工验收 | 可能短暂 |
| needing_approval | 等待用户审批或补充信息 | 否 |
| waiting_external | 等待外部任务、时间、网络或第三方状态 | 否 |
| retry_wait | 临时失败后等待重试 | 否 |
| blocked | 连续无进展、能力不足、外部阻塞 | 否 |
| failed | 不可恢复错误或策略拒绝 | 否 |
| completed | 验收通过 | 否 |
| paused | 用户主动暂停 | 否 |
| cancelled | 用户主动停止 | 否 |

完成态只能由验证器写入。模型输出的「完成了」只是候选结果。

### 4.4 执行循环

```text
while goal 未终态:
  claim goal lease
  if goal 到期且没有其他执行者:
    if 没有计划或计划已失效:
      生成计划与验收标准
      持久化 checkpoint

    选择下一个可执行步骤
    运行现有 ReAct 批次
      - 注入目标、验收标准、计划、已完成证据、上次验证失败原因
      - 禁止仅凭模型自评结束目标
      - 等待用户时落审批卡片并释放进程

    持久化本批结果
    执行验证
    if 全部通过:
      completed
    else if 需要人:
      needing_approval
    else if 等待外部:
      waiting_external + next_run_at
    else if 临时失败:
      retry_wait + backoff
    else if 连续无进展:
      blocked + 明确证据
    else:
      把验证失败原因加入下一批上下文
  heartbeat / release lease
```

关键点：

- 每批只做有限工作，不把整个目标压在一次调用里；
- 每批开始前重新读取持久化目标与计划；
- 等待人工或外部条件时不让进程空转；
- 验证失败不是任务失败，而是下一批的输入；
- 无进展不能无限烧钱，需要转成可解释的阻塞态。

### 4.5 数据模型

建议新增五张表。首版不必复制 autoloop 的完整事件溯源投影，采用「状态表 + 追加事件日志」更贴合现有 SQLite 体系。

#### `goal_run`

```sql
CREATE TABLE goal_run (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  agent_id TEXT,
  platform_id TEXT,
  model_id TEXT,
  status TEXT NOT NULL,
  objective TEXT NOT NULL,
  completion_spec_json TEXT NOT NULL,
  constraints_json TEXT NOT NULL DEFAULT '[]',
  approval_policy_json TEXT NOT NULL DEFAULT '{}',
  plan_version INTEGER NOT NULL DEFAULT 0,
  current_batch INTEGER NOT NULL DEFAULT 0,
  stall_count INTEGER NOT NULL DEFAULT 0,
  next_run_at INTEGER,
  lease_owner TEXT,
  lease_until INTEGER,
  heartbeat_at INTEGER,
  last_error TEXT,
  result_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);
```

#### `goal_batch`

```sql
CREATE TABLE goal_batch (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  llm_task_id TEXT,
  status TEXT NOT NULL,
  prompt_json TEXT NOT NULL,
  checkpoint_json TEXT,
  started_at INTEGER,
  finished_at INTEGER,
  UNIQUE(goal_id, seq)
);
```

#### `goal_event`

```sql
CREATE TABLE goal_event (
  goal_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(goal_id, seq)
);
```

事件类型建议：

- `goal.created`
- `plan.created`
- `plan.revised`
- `batch.started`
- `batch.checkpoint`
- `verification.failed`
- `verification.passed`
- `approval.requested`
- `approval.answered`
- `retry.scheduled`
- `goal.blocked`
- `goal.completed`
- `goal.cancelled`

#### `goal_approval`

```sql
CREATE TABLE goal_approval (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  batch_id TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  status TEXT NOT NULL,
  answer_json TEXT,
  requested_at INTEGER NOT NULL,
  answered_at INTEGER
);
```

#### `goal_operation`

```sql
CREATE TABLE goal_operation (
  idempotency_key TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  batch_id TEXT,
  step_id TEXT,
  tool_name TEXT NOT NULL,
  args_hash TEXT NOT NULL,
  args_json TEXT NOT NULL,
  status TEXT NOT NULL,
  external_ref TEXT,
  result_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

`status` 建议：

- `prepared`
- `executing`
- `executed`
- `verified`
- `failed`
- `unknown`

### 4.6 重启恢复

启动时按以下顺序处理：

1. 对活动 goal 的过期租约标记为可重领；
2. 对 `executing` 操作执行结果核对，不直接重放；
3. 对 `needing_approval` 恢复审批卡片；
4. 对 `waiting_external` 恢复下一次唤醒时间；
5. 对 `retry_wait` 恢复退避时间；
6. 对没有任何运行者的 `running` goal 重新排队；
7. 启动 Goal Scheduler，只根据 `next_run_at` 和租约拉起执行。

不要采用「服务启动后把所有 running 改成 failed」的语义。普通一次性任务可以这样回收，但目标模式必须保留目标状态。

### 4.7 完成验证

验证顺序建议：

1. **确定性检查**：文件存在、哈希、命令退出码、JSON 字段、数据库查询、HTTP 状态、页面可见文本。
2. **证据检查**：每项通过结果绑定产物 ID、消息 ID、命令输出摘要或页面快照。
3. **模型检查**：只用于判断证据是否覆盖需求，不能替代确定性检查。
4. **人工验收**：主观质量、对外发送、生产变更等必须人工确认。

建议验证结果结构：

```json
{
  "status": "passed",
  "checks": [
    {
      "id": "build",
      "passed": true,
      "evidence": {
        "type": "command",
        "exitCode": 0,
        "outputFile": "artifacts/build.log"
      }
    }
  ],
  "unmet": [],
  "nextAction": "complete"
}
```

如果验证不通过：

- `unmet` 必须进入下一批提示词；
- 不允许模型忽略失败项直接宣告完成；
- 连续多批同一检查失败时升级为修订计划或阻塞，不原样重试。

### 4.8 幂等与副作用

这是「保证不断」里最容易出错的部分。

可以先明确承诺：

- 调度是 at-least-once；
- 持久化账本保证重复派发可识别；
- 外部副作用只有在具备幂等键或结果核对时才能安全重试。

不能承诺：

- 任意工具在网络超时后恰好执行一次。

建议按工具分类处理：

| 工具类型 | 恢复策略 |
|---|---|
| 纯读、搜索、查询 | 可直接重试 |
| 本地文件写 | 写前记录目标与哈希，写后校验；必要时用检查点恢复 |
| 幂等 API | 使用服务端幂等键或业务唯一键 |
| 非幂等外部动作 | 先查外部状态，再决定是否执行；无法确认时转人工 |
| 付费、发布、删除、发消息 | 强制审批，记录外部引用，禁止盲目重放 |

Goal Run 提供的 `idempotency_key` 建议由：

```text
goalId + stepId + toolName + normalizedArgsHash
```

组成。同一逻辑步骤重试时复用同一 key。

### 4.9 用户交互

建议在目标面板中显示：

- 目标与验收标准；
- 当前状态；
- 已完成、进行中、剩余步骤；
- 当前批次和总批次；
- 最近一次心跳；
- 下一次自动重试或复查时间；
- 需要用户处理的卡片；
- 已完成证据；
- 成本提醒；
- 暂停、恢复、终止按钮。

审批卡片必须落库，不能只依赖当前 WebSocket：

- 用户刷新后仍能看到；
- 应用重启后仍能回答；
- 同一审批重复提交只生效一次；
- 回答后生成新事件唤醒 goal。

## 五、落到言智代码的实施边界

### 5.1 新增模块

建议新增：

- `apps/server/src/services/goal-runner.ts`：目标状态机与批次调度
- `apps/server/src/services/goal-recovery.ts`：启动恢复与租约
- `apps/server/src/services/goal-verifier.ts`：确定性验证与证据
- `apps/server/src/services/goal-approval.ts`：持久审批卡片
- `apps/server/src/services/goal-operation.ts`：幂等操作账本

### 5.2 需要修改的现有模块

| 文件 | 改动 |
|---|---|
| `apps/server/src/db.ts` | 新增 goal 表、迁移、索引 |
| `apps/server/src/llm-task-manager.ts` | `LlmTask` 增加 goalId/batchId；持久化 params 快照；goal 批次不套普通 2 小时看门狗 |
| `apps/server/src/index.ts` | 启动时先恢复 goal 租约，再启动 scheduler |
| `apps/server/src/routes/llm-tasks.ts` | 新增 goal create/status/pause/resume/cancel/approve 路由 |
| `apps/server/src/chat-ws.ts` | 新增 goal 事件订阅与审批消息 |
| `packages/shared/src/types/index.ts` | GoalSpec、GoalRun、GoalEvent、GoalApproval 类型 |
| `packages/ui/src/stores/chat.ts` | 目标模式状态与请求装配 |
| `packages/ui/src/components/chat/ChatInputArea.vue` | 「+」菜单新增目标模式入口 |
| `packages/ui/src/views/TaskRunWindow.vue` | 不再根据最后一条消息猜 completed；展示 goal 状态与验收结果 |

### 5.3 与现有 ReAct 循环的关系

不重写 `runReActLoop`，而是把它当成一个可执行批次：

```text
GoalRunner
  -> 生成批次 prompt
  -> createTask({ goalId, batchId, modeFlags.goal: true, ... })
  -> 现有 ReAct 执行
  -> 批次结束写 checkpoint
  -> GoalRunner 验证并决定下一状态
```

现有自动接力仍然可以保留，但 Goal Run 中应限制它在单批次内部的作用：

- 单批次内用于避免因 `maxSteps` 频繁打断；
- 批次完成后必须回到 GoalRunner 做验证；
- GoalRunner 才是「目标是否完成」的唯一裁决者。

### 5.4 与计划模式的关系

`task_plan_json` 可以继续使用，但建议：

- Goal Run 保存计划版本号；
- 每次重规划追加 `plan.revised` 事件；
- 计划历史不能只覆盖，否则无法解释为什么改变了方向；
- 批次 prompt 同时注入当前计划与最近一次验证失败项。

### 5.5 与子智能体的关系

子智能体继续作为执行器使用：

- 父目标负责验收和状态；
- 子智能体返回阶段结果与证据；
- 子智能体不能自行把 goal 标记完成；
- 子智能体等待用户输入时，必须把审批上抛到 GoalRunner。

## 六、分阶段实施

### P0：可靠性地基，2 到 3 人日

交付：

- 修复普通任务运行超 2 小时被看门狗强杀的问题；
- goal 关联任务不再套普通任务 2 小时规则；
- `llm_task.params_json` 真实保存任务参数；
- pending 工具保存入参与审批上下文；
- 启动恢复不再把可恢复目标直接当失败；
- TaskRunWindow 状态改为查真实任务记录。

验收：

- 在 planning、tool execution、approval、retry 四个阶段分别强杀进程，重启后状态不丢；
- 同一会话不会出现两个并发执行者；
- 2 小时以上正常心跳任务不会被误杀。

### P1：Goal Run MVP，5 到 8 人日

交付：

- goal_run/goal_batch/goal_event 表；
- GoalRunner 状态机；
- 目标创建、状态查询、暂停、恢复、终止；
- 计划、检查点、验证失败反馈；
- 前端目标模式开关和目标面板；
- 人工阻塞落库。

验收：

- 一个需要跨 3 个批次的真实任务可以自动跑完；
- 前端关闭、重新打开后状态不丢；
- 服务重启后从最近检查点继续；
- 验证未通过时不会显示完成。

### P2：验证与副作用安全，5 到 8 人日

交付：

- goal_approval/goal_operation；
- 确定性验收器；
- 非幂等操作查重与核对；
- 人工验收卡片；
- 连续无进展升级为 blocked；
- 成本和时长可观测。

验收：

- 模拟「请求已发出但响应丢失」，重启后先核对再决定是否重放；
- 重复提交审批只生效一次；
- 未满足验收项时任务不能进入 completed；
- 发布、发消息、删除等动作必须经过正确权限。

### P3：自研目标能力扩展，3 到 5 人日

交付：

- 目标模板与最近目标复用；
- 言智内部事件触发，包括定时目标、IM 回调、内部 Webhook 和任务完成事件；
- 多目标排队与工作目录、浏览器站点、外部账号资源锁；
- 桌面通知、IM 审批卡片和跨端恢复；
- 目标审计视图与事件导出；
- 目标级模型回退、成本提醒和并发上限。

验收：

- 定时目标到点创建并继续执行；
- 两个目标争用同一工作目录时被正确排队或提示冲突；
- 用户从桌面、Web 或 IM 回答审批后都能恢复同一目标；
- 在没有安装任何其他智能体平台的环境中，目标模式完整可用。

## 七、验收测试矩阵

| 场景 | 期望 |
|---|---|
| 前端关闭 30 分钟后重开 | goal 继续运行，状态和证据可见 |
| 服务在 planning 阶段被杀 | 重启后重新计划，不产生重复产物 |
| 服务在工具执行中被杀 | 先核对操作账本，再决定重试或转人工 |
| 等审批时服务重启 | 卡片仍存在，回答后恢复 |
| 上游 429/超时 | 进入 retry_wait，指数退避，不丢目标 |
| 流式输出半截结束 | 沿用现有截断检测，不把半截当完成 |
| 连续多批同一验收失败 | 修订计划或进入 blocked，不无限重复 |
| 没有验收标准 | 只能人工验收，不能自动 completed |
| 重复创建目标 | 同会话只保留一个活动目标 |
| 重复审批 | 只生效一次 |
| 两个目标写同一工作区 | 资源锁或明确冲突提示 |
| 用户终止 | 立即停止调度，保留证据和日志 |
| 成本超提醒阈值 | 提醒但默认不停，除非用户设置硬停 |
| 机器重启 | 活跃 goal 自动重领，等待型 goal 按 next_run_at 唤醒 |

崩溃测试建议采用确定性故障注入：

- 在写 goal_event 前后注入退出；
- 在工具执行前后注入退出；
- 在审批落库前后注入退出；
- 在验证通过但未写完成态时注入退出；
- 重复提交同一批次结果；
- 随机打乱 WS 重连和 HTTP 重试顺序。

## 八、必须提前拍板的决策

| 决策 | 推荐值 | 原因 |
|---|---|---|
| 一个会话能有几个活动 goal | 1 个 | 输入、计划、审批和事件流不串台 |
| 默认是否有总时长上限 | 不设硬上限 | 长任务不应被墙钟直接判死 |
| 是否允许无验收标准 | 可以，但只能人工验收 | 避免模型自证完成 |
| 默认成本策略 | 提醒不硬停 | 与现有产品决策一致；用户可显式设硬停 |
| 无进展如何处理 | 连续 N 批后 blocked | 比无限循环更诚实 |
| 是否接入或依赖 autoloop | 不接入、不依赖 | 产品必须独立运行，避免外部平台版本与安装风险 |
| 是否复制 autoloop 代码 | 不复制 | 只参考公开设计，核心实现由言智自研维护 |
| 目标事件来源是否进入 MVP | 不进入 | 先把手动目标跑稳，P3 再做言智自己的定时、IM 和 Webhook 事件源 |

## 九、最终建议

1. **不要把 Agent Autoloop 直接嵌进言智主进程。**
2. **先做原生 Goal Run 调度层，复用现有 ReAct、工具、记忆、浏览器和权限。**
3. **把「完成」从模型话术改成验证结果。**
4. **把「不中断」从单进程重试改成持久化租约与检查点。**
5. **目标模式全链路自研，不接入 autoloop，也不依赖其他智能体或自动化平台。**

一句话概括：

> autoloop 值得学的是它如何让一轮任务可以安全地结束并由中台再次接上；言智会把这类机制重新实现在自己的 Goal Run 中，并补上「验收什么才算完成」以及「重启后如何不重复副作用」。

## 十、调研来源

Agent Autoloop：

- 仓库与 README：https://github.com/KKKKhazix/agent-autoloop
- 协议：https://github.com/KKKKhazix/agent-autoloop/blob/main/docs/protocol.md
- Windows 支持跟踪：https://github.com/KKKKhazix/agent-autoloop/issues/17
- v1.2.0 发布说明：https://github.com/KKKKhazix/agent-autoloop/releases/tag/v1.2.0
- MIT 许可：https://github.com/KKKKhazix/agent-autoloop/blob/main/LICENSE

言智现状：

- `apps/server/src/llm-task-manager.ts:178`：自动接力 30 批硬顶
- `apps/server/src/llm-task-manager.ts:3877`：主循环批次结构
- `apps/server/src/llm-task-manager.ts:4670`：自动接力分支
- `apps/server/src/llm-task-manager.ts:3174`：任务清理与 2 小时看门狗
- `apps/server/src/llm-task-manager.ts:3356`：启动时孤儿任务回收
- `apps/server/src/llm-task-manager.ts:3059`：任务持久化字段
- `apps/server/src/llm-task-manager.ts:7353`：子智能体自动接力
- `apps/server/src/llm-task-manager.ts:8860`：任务计划回注
- `apps/server/src/db.ts:5395`：现有 `llm_task` 表结构
- `apps/server/src/routes/llm-tasks.ts`：任务 HTTP 生命周期
- `apps/server/src/chat-ws.ts`：任务 WebSocket 生命周期
- `packages/ui/src/views/TaskRunWindow.vue:141`：任务窗口状态推断

