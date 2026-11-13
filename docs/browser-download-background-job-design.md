# 浏览器大文件下载接入后台长任务设计

> 状态：P0 / P1 已实现（2026-11-13）
> 日期：2026-11-13
> 范围：浏览器下载、后台作业、任务唤醒与 token 收敛

## 1. 目标

把浏览器大文件下载从“模型持续轮询”升级为真正的后台长任务：

- 下载启动后立即返回 `jobId`，模型不必占着一次工具调用等文件完成。
- 下载器持续写入进度、速度、ETA、暂停状态和产物路径。
- 任务完成、失败、取消或中断时产生一次持久化终态事件。
- 原会话任务未结束：把结果投递到该任务的待续队列。
- 原会话任务已结束：按 `wakePolicy` 自动创建续跑任务或只发通知。
- 不靠固定 30/40 分钟定时器判断下载是否完成。定时器只做心跳、停滞检查和兜底恢复。

## 2. 非目标

- 不把 1 小时下载做成一次阻塞工具调用。
- 不每 30 秒唤醒模型查询一次；这只会把轮询搬到后台。
- 不在第一阶段承诺应用重启后继续同一个 `.part` 文件。跨重启续传需要独立的断点文件协议和 Range 下载器。
- 不让后台任务结果跨会话污染其它任务。

## 3. 当前能力与缺口

### 已有

- `python_exec { background: true }` 能把 Python 长任务 detach 出去。
- `job_status` 能读取文件系统中的 `status.json` 和日志尾部，并支持有限 `waitSeconds`。
- 浏览器下载已有进度、速度、ETA、暂停/恢复和 `downloadId`。
- `task_event`、`conv_event` WebSocket 通道已经存在。
- goal runner 已有异步等待任务终态、写入会话消息和继续调度的模式。

### 缺口

- `job_status` 只面向 Python 作业目录，不是统一长任务注册表。
- 浏览器下载只存在进程内存，不能可靠跨任务恢复或重启恢复。
- 完成事件没有统一进入任务调度器，模型仍要主动轮询。
- 没有统一的 `wakePolicy`、终态事件去重和续跑任务语义。
- 当前下载记录没有绑定 `conversationId`、`taskId`、`toolCallId` 和租约。

## 4. 总体设计

分成两层，避免把浏览器细节塞进通用长任务系统：

```text
LongJobManager
  - 持久化任务状态
  - 进度节流
  - 终态事件
  - 唤醒策略
  - 恢复与停滞检测

JobAdapter
  - browser_download
  - python_process
  - package_build
  - future: browser_export / media_transcode
```

浏览器下载 adapter 只负责：

- 启停底层下载；
- 暂停、恢复、取消；
- 上报进度；
- 在完成或失败时提交终态。

LongJobManager 负责：

- 生成稳定 `jobId`；
- 将任务绑定到会话、任务和工具调用；
- 去重事件；
- 决定是否唤醒模型；
- 产出统一摘要。

## 5. 状态机

```text
queued
  -> starting
  -> running
  -> paused
  -> finalizing
  -> verifying
  -> completed

任意非终态
  -> failed
  -> cancelled
  -> stalled
```

| 状态 | 含义 | 是否终态 |
|---|---|---|
| `queued` | 已登记，尚未真正启动 | 否 |
| `starting` | 浏览器下载/进程已发起 | 否 |
| `running` | 正在下载或执行 | 否 |
| `paused` | 用户或模型暂停 | 否 |
| `finalizing` | 字节已写完，正在 flush/rename | 否 |
| `verifying` | 校验文件存在、非空、大小/哈希 | 否 |
| `completed` | 产物已验证 | 是 |
| `failed` | 下载器或校验失败 | 是 |
| `cancelled` | 明确取消 | 是 |
| `stalled` | 心跳超时/进程消失 | 是 |

关键约束：

- `completed` 必须经过 `verifying`，不能只凭下载器报告完成。
- `paused` 不产生终态事件。
- 终态事件使用 `(jobId, terminalVersion)` 幂等键，重复回调不能重复唤醒。

## 6. 核心数据模型

建议新增通用表，而不是继续只靠文件系统：

```sql
CREATE TABLE background_job (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  task_id TEXT,
  tool_call_id TEXT,
  wake_policy TEXT NOT NULL DEFAULT 'resume',
  title TEXT NOT NULL,
  progress REAL,
  bytes_done INTEGER NOT NULL DEFAULT 0,
  bytes_total INTEGER,
  speed_bps REAL,
  eta_ms INTEGER,
  eta_at INTEGER,
  artifact_json TEXT,
  result_json TEXT,
  error TEXT,
  checkpoint_json TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  updated_at INTEGER NOT NULL,
  terminal_at INTEGER,
  terminal_version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE background_job_event (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  delivered_at INTEGER
);
```

大文件进度不要频繁写数据库。内存中更新，按以下规则落库：

- 每 2 秒最多一次；
- 进度跨过 5% 整数点时写一次；
- 状态变化立即写；
- 终态立即写。

## 7. 统一任务契约

### 7.1 启动

```ts
interface StartLongJobInput {
  kind: 'browser_download' | 'python_process' | 'package_build';
  conversationId: string;
  taskId?: string;
  toolCallId?: string;
  wakePolicy?: 'resume' | 'notify' | 'silent';
  parentGoalId?: string;
  spec: Record<string, unknown>;
}

interface StartLongJobResult {
  jobId: string;
  status: 'queued' | 'starting' | 'running';
  progress?: LongJobProgress;
  nextCheckInMs?: number;
}
```

默认 `wakePolicy`：

- 交互式用户任务：`resume`
- 定时/无人值守任务：`notify`
- 明确 fire-and-forget：`silent`

### 7.2 状态查询

`job_status` 从 Python 专用改为通用：

```ts
interface JobStatusInput {
  jobId?: string;
  waitSeconds?: number; // 0-30，只做短等待
  tailLines?: number;
}

interface LongJobSnapshot {
  jobId: string;
  kind: string;
  status: string;
  title: string;
  progress?: LongJobProgress;
  artifactPaths?: string[];
  summary?: string;
  error?: string;
  nextCheckInMs?: number;
  nextCheckAt?: number;
}
```

`waitSeconds` 不是长任务主机制，只是给短任务减少一轮对话。超过 30 秒仍运行的任务应返回 `nextCheckInMs`，而不是继续阻塞。

### 7.3 控制

```ts
type JobControlOperation = 'pause' | 'resume' | 'cancel';
```

- 浏览器桌面端：暂停/恢复由 Electron `DownloadItem` 支持。
- Playwright 端：可取消，暂停/恢复返回 `unsupported`。
- Python 进程：第一阶段只支持 cancel，不支持进程级暂停。

## 8. 浏览器下载 Adapter

### 8.1 启动策略

不要在点击下载前猜“大不大”。按以下顺序处理：

1. 点击导出/下载后先捕获下载开始事件。
2. 在 3-5 秒的短窗口内直接完成的小文件，仍走同步回执。
3. 超过窗口仍未完成，升级为 `background_job`：
   - 分配 `jobId`；
   - 绑定 `conversationId/taskId/toolCallId`；
   - 立即返回 `jobId + progress + wakePolicy`。
4. 如果模型显式传 `background: true`，跳过短等待，直接登记后台任务。

这样不依赖 ETA 是否准确，也不会把所有小下载都推成后台任务。

### 8.2 Desktop / Electron

数据源：

- `DownloadItem.getReceivedBytes()`
- `DownloadItem.getTotalBytes()`
- `DownloadItem.canResume()`
- `DownloadItem.isPaused()`
- `DownloadItem.on('updated')`
- `DownloadItem.once('done')`

映射：

- `updated` -> 进度事件，按节流写 LongJobManager。
- `pause/resume` -> 状态变化。
- `done(completed)` -> `finalizing -> verifying`。
- `done(interrupted/cancelled)` -> `failed/cancelled`。
- `canResume=false` -> 不向用户承诺断点续传。

应用退出时：

- 已完成的 job 保持 completed。
- 仍在运行的 job 标记为 `stalled`，附带 `canResume` 和已有文件路径。
- 第一阶段不自动恢复；第二阶段引入持久 `.part` 任务后才能自动续传。

### 8.3 Playwright

数据源：

- `page.on('download')`
- `download.createReadStream()`
- `content-length` 响应头
- pipeline 完成/异常

映射：

- 每写入一块 -> 更新内存进度。
- `content-length` 可得时给出百分比和 ETA。
- pipeline 成功 -> verify 文件。
- pipeline 异常 -> failed，并删除不完整文件。

Playwright 不支持暂停/恢复，状态回执必须明确。

## 9. 完成通知与唤醒

### 9.1 事件流

```text
DownloadAdapter terminal
  -> LongJobManager.finish()
  -> background_job terminal update
  -> background_job_event(job.completed/failed)
  -> conversation event
  -> wake scheduler
```

事件只发终态，不把每次进度变化都推给模型。进度只用于 UI 和短查询。

### 9.2 wakePolicy

`resume`：

- 原任务已结束：创建一次续跑任务，内容是紧凑的任务结果摘要和产物路径。
- 原任务仍运行：把事件加入该任务 inbox，当前 ReAct 循环在安全点读取一次。
- 续跑任务完成或失败后不再重复唤醒。

`notify`：

- 只向原会话插入 assistant/系统通知和“查看产物”入口。
- 不额外调用模型。

`silent`：

- 只更新任务卡和数据库。

### 9.3 唤醒消息示例

```text
后台任务完成：browser_download
jobId: job_dl_xxx
文件: invoice-2026-11.zip
大小: 2.4GB
保存路径: D:/workspace/downloads/invoice-2026-11.zip
校验: 文件存在且非空

请从原任务断点继续：验证压缩包内容，然后上传到目标系统。
```

唤醒消息必须紧凑。不能把整段日志再次塞进模型上下文。

### 9.4 并发与去重

- 终态事件写库后用 `terminal_version` 去重。
- 唤醒任务使用幂等键 `wake:<jobId>:<terminalVersion>`。
- 同一个 job 最多一个 active wake。
- 用户已手动处理该 job 时，wake 标记为 superseded，不再创建任务。
- 唤醒任务只绑定原 `conversationId`，不改变当前正在看的其它会话。

## 10. 定时器怎么用

下载完成的主判据是下载器终态事件，不用 30/40 分钟定时器判断。

定时器只用于：

- 5 秒一次心跳检查：更新 UI、检测长时间无进度；
- 30-60 秒一次滞停检查：进程消失、事件失联、任务卡在 `finalizing`；
- `etaAt` 到达后检查一次健康状态，不把 ETA 当完成判据；
- 浏览器/服务器重启后的恢复扫描。

## 11. 工具与 UI 变化

工具层只暴露稳定闭包：

```ts
download_file({ ... , background: true, wakePolicy: 'resume' })
// -> { jobId, status: 'running', progress, nextCheckInMs }

job_status({ jobId })
// -> 通用后台任务快照

job_control({ jobId, operation: 'pause' | 'resume' | 'cancel' })
```

UI 展示：

- 会话内后台任务卡：文件名、进度、速度、ETA、暂停/恢复/取消；
- 完成任务显示产物路径和“继续处理”；
- 失败任务显示失败阶段和一条可执行处置；
- 不展示高频进度日志。

模型提示词：

```text
长任务启动后不要轮询。除非你要修改/取消任务，否则继续其它工作或结束当前回复。
任务完成会自动回到本会话；届时应先读取 artifactPaths，再继续原计划。
```

## 12. 安全与权限

- `jobId` 基于随机 id，不能使用文件路径拼接。
- 所有产物路径必须限制在工作区和允许的下载目录内。
- 唤醒任务只能访问原任务的 conversation、workspace 和授权范围。
- 下载 URL、文件名、页面文本一律按不可信数据处理。
- 取消/删除不完整文件需要明确审批规则。

## 13. 分阶段落地

### P0：统一任务壳

- 新增 `background_job` 表与 `LongJobManager`。
- `job_status` 支持通用 jobId；新增 `job_control`。
- 浏览器下载可在短等待后转后台任务。
- 完成时写终态事件并推送 UI。

已落地：

- `apps/server/src/services/background-jobs.ts`：统一状态机、进度节流、终态幂等、人工续跑。
- `apps/server/src/routes/background-jobs.ts`：公开查询/控制接口 + 回环内部回调和 token 校验。
- Desktop Electron 下载、服务端 Playwright 下载、`python_exec background=true`、
  `cmd_exec background=true`（含打包/构建）全部登记到同一张任务表。
- `job_status` / `job_control` 支持统一 `job_bg_*` 任务；旧 Python 文件系统作业保持兼容。

### P1：唤醒闭环

- `wakePolicy=resume/notify/silent` 已实现。
- 原任务已结束时继承最近任务的模型/智能体配置创建续跑任务。
- 原任务运行时注入下一轮上下文；同一 `(jobId, terminalVersion)` 只唤醒一次。
- 会话输入区上方已增加后台任务卡：进度、速度、ETA、暂停/恢复/取消、产物定位和人工继续。

运行策略：

- 小浏览器下载先短等约 4.5 秒，可同步返回完成结果。
- 大下载超过短等窗口立即返回 `jobId`，不占住工具调用。
- 终态由下载器/进程事件触发；定时器只用于 Python/命令状态重挂、浏览器任务失联扫描和重启恢复。

### P2：跨重启续传

尚未实现。当前会把可续传能力写入任务快照并在重启后如实标为 `stalled`，不会伪装成仍然运行；
跨重启自动续传需要 Electron 持久 `.part` 文件、Range 元数据和 Playwright 自有 Range 下载器。

后续工作：

- Electron 使用持久 `.part` 文件和 Range 元数据。
- Playwright 改为自有 HTTP Range 下载器，支持断点、校验和恢复。
- 启动时恢复 `stalled` 任务。

## 14. 验收标准

1. 1 小时下载启动后 5 秒内返回 `jobId`，不占用长工具调用。
2. 模型不再需要每 30 秒轮询；完成事件能自动续跑原会话。
3. 下载完成事件重复回调 3 次，只产生一次续跑任务。
4. 原任务已结束时唤醒原会话；不会污染用户当前正在看的其它会话。
5. 页面刷新、应用重启后，任务卡仍能看到最终状态。
6. Playwright 不支持暂停时，工具明确返回 `unsupported`，不假报暂停。
7. `completed` 必须经过文件存在、非空和大小校验。
8. 终态通知只携带摘要和产物路径，不重复灌入全部日志。
