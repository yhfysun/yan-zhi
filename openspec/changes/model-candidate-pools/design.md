# 模型候选池 — 详细设计

## 1. 概念模型

```
槽位 slot:  llm | vision | image | video      （每类一个有序多选池）

配置层（优先级从高到低，按 slot 逐层回退）:
  L1 智能体   agent.model_pools_json[slot]      （该智能体专用）
  L2 模型平台 platform.model_pools_json[slot]   （该平台下所有智能体的默认池）
  L3 全局     app_config['model_pools'][slot]   （应用级默认）
  L4 自动兜底 autoPool(slot)                    （三层全空时）

生效过滤（解析时统一执行，四层都过）:
  model.enabled = 1
  AND model.visible = 1
  AND platform.llm_enabled = 1
  AND 槽位类型匹配（§3）
```

**回退语义**（对应用户确认的「全局没有设置就用模型平台里面的」）：按 **slot 粒度**回退，不是整池二选一。例如智能体只配了 `llm` 没配 `vision`，则 `vision` 落到平台池 → 全局 → 兜底。某层池数组为空或过滤后为空，继续往下层走。

**与既有 `model_id` 单选的关系**：`agent.model_id` / 调用参数里的显式 `modelId` / `model` 是「显式锁定」，优先于任何池（兼容存量，见 §8）。

## 2. 数据模型与迁移

### 2.1 结构（三层同构）

```jsonc
// model_pools（JSON）
{
  "llm":    ["<model.id 主键>", "..."],   // 有序，[0] 首选
  "vision": [],
  "image":  [],
  "video":  []
}
```

存 **model 主键 id**（如 `agens-guest-agnes-3.0-flash`），不存 API 名 `model_id` —— 双标识的坑见 `model-resolve.ts:1-19`，写库必须写主键。

### 2.2 落点与迁移

| 层 | 存储 | 迁移 |
|---|---|---|
| 智能体 | `agent.model_pools_json TEXT` | `ALTER TABLE agent ADD COLUMN model_pools_json TEXT`（try/catch 幂等，`db.ts:785-786` 模式） |
| 平台 | `platform.model_pools_json TEXT` | `ALTER TABLE platform ADD COLUMN model_pools_json TEXT`（同上） |
| 全局 | `app_config` key=`model_pools` | 无 schema 变更（`db.ts:3530-3537`） |

内置 agent / 内置平台（`is_builtin=1`）：内置 agent 的池不参与代码 seed 覆盖（与 `builtin_tool_ids` 等同为「用户可改」字段，见 `db.ts:211` 注释的 always 覆盖口径需排除本字段）；内置平台允许配池（与 `llmEnabled` 同款「使用偏好可改、连接配置禁改」，`platforms.ts:135-141`）。

### 2.3 API（集中一处：`routes/model-pools.ts`）

```
GET  /api/model-pools?agentId=&platformId=     → 三层合并视图 + 各层来源标注
PUT  /api/model-pools/global                   → { llm[], vision[], image[], video[] }（app_config）
PUT  /api/model-pools/platforms/:pid           → 平台层（内置平台也允许；仅偏好）
PUT  /api/model-pools/agents/:aid              → 智能体层
```

另有两条既有路由扩展（不新开端点）：
- `PATCH /api/platforms/:id`：body 加 `modelPools`，与 `llmEnabled` 一样支持「仅偏好」早返回（`platforms.ts:136-141` 同款分支）。
- agents 保存路由（`routes/agents.ts`）：form 已整体提交，`model_pools_json` 随存。

**保存时校验**（服务端，单一处）：每个 id 必须存在、属于该用户、且槽位类型匹配（§3）；不匹配返回明确错误（如「模型 agnes-image-2.5-flash 是图片生成模型，不能加入 llm 池」）。**过滤失效（停用/隐藏）不在保存时拦截**——用户可能先配池后临时停用某模型，停用由解析时生效过滤处理。

## 3. 槽位匹配规则（单一真相源）

```ts
type Slot = 'llm' | 'vision' | 'image' | 'video';

function matchesSlot(row: { type: string; capabilities: string[] }, slot: Slot): boolean {
  const caps = row.capabilities;
  switch (slot) {
    case 'llm':    return row.type === 'llm' && !caps.some(c => c === 'image' || c === 'video');
    case 'vision': return row.type === 'llm' && caps.includes('vision');
    case 'image':  return row.type === 'image' || caps.includes('image');
    case 'video':  return row.type === 'video' || caps.includes('video');
  }
}
```

口径来源：`model-caps.ts:15`（`MEDIA_CAPABILITIES = ['image','video']` 的模型不参与 ReAct）、`listAvailableModels` 的 `CATEGORY_MAP`（`llm-task-manager.ts:567-574`，vision 按 `cap='vision'` 过滤）。三处判据收敛到 `model-pools.ts` 一个导出，`list_models` 的 CATEGORY_MAP 改为引用它。

## 4. 解析算法（`services/model-pools.ts`）

```ts
resolvePool({ userId, agentId?, platformId? }, slot): PoolEntry[]
```

1. **L1**：`agentId` 有值 → 读 `agent.model_pools_json[slot]`；按生效过滤 + 槽位匹配清洗后非空 → 返回。
2. **L2**：`platformId` 有值 → 读 `platform.model_pools_json[slot]`；同样清洗。
3. **L3**：读 `app_config['model_pools'][slot]`；同样清洗。
4. **L4 兜底** `autoPool(slot)`：`SELECT ... FROM model JOIN platform ... WHERE enabled=1 AND visible=1 AND llm_enabled=1`，按 `matchesSlot` 筛，排序 `is_default DESC, created_at DESC`（对齐 `memory-dreaming.ts:67-68` / `scheduled-tasks.ts:207-208` 的既有默认模型挑选口味）。

返回 `PoolEntry[]`（含 `model` 领域对象 + `platform` 行 + `来源层` 标注，供 `list_models` 打标与日志诊断）。

**实现约束**（踩过的坑，`MEMORY.md` 五条最贵判据）：
- 「同一语义只有一处实现」：前端**不**自行实现回退顺序，统一调 `GET /api/model-pools` 拿后端解析结果；后端所有消费点调同一 `resolvePool`。
- 纯函数部分（回退顺序决策、`matchesSlot`、清洗）与 DB 访问分离：纯函数可单测；DB 部分走 better-sqlite3 真库测（`model-resolve.test.ts` 模式）。
- 池内**去重**（同一模型被多层配了就高层的）、**保序**（数组顺序 = 优先级）。

## 5. 运行时消费点

### 5.1 会话 ReAct 主任务（`llm-task-manager.ts`）

**现状**：`loadModel`（547-550）单模型 → `new LlmClient`（2371）构造一次 → `consumeStream`（2731）全程复用；失败仅 token 级重试。

**改造**：

```
任务启动:
  hasImages = 本轮消息含 image part
  slot = hasImages ? 'vision' : 'llm'
  chain = resolvePool({ userId, agentId: params.agentId, platformId: params.platformId }, slot)
  cursor = 0（显式锁定 params.modelId 时 chain = [that model]，行为不变）

每轮 consumeStream:
  current = chain[cursor]
  client = new LlmClient(current.platform, current.model)   // 每轮按 current 现造（廉价）
  supportsTools / contextWindow / maxTokens 全部按 current 重算   // ★ 换模型后能力可能不同
  try 流式消费
  catch 可重试错误（shouldRetryStatus 口径：429/5xx/网络/超时，token-pool.ts:119-121）:
    cursor++
    if cursor < chain.length: 重建 client 重试本轮（日志记 failover）
    else: 错误写进占位消息落库（现状 3446 行行为）
```

要点：
- **重试粒度 = 一轮**。流已产出部分内容时换模型：丢弃本轮半成品 output，以完整历史重发（现有截断续写机制 `STREAM_TRUNCATE_MAX_RETRY` 不管这个 case，别混用）。
- **不回到 chain[0]**：一次成功切换后后续轮次沿用当前模型，避免链首抖动；任务结束（或用户手动切模型）才重置。
- **视觉降级链**：带图消息而当前 llm 模型无 vision 能力 → 直接以 vision 槽位链续跑（而不是报错）。
- `params.modelId` 显式传入（定时任务、前端指定）时**不启用 failover**，保持单模型语义（显式锁定优先）。
- 静默换模型：只写 `logger` + llm-logs，**不加用户侧提示**（内部优化原则）。

### 5.2 媒体生成（`api-tool-executor.ts`）

```
api_image_generate / api_video_generate:
  model 参数显式传入 → 现状不变
  未传入 → pool = resolvePool({ userId, agentId? }, 'image' | 'video')
           for (const m of pool) { for (const key of keys(platform)) { try; catch 429/401/403 → 下一个 } }
           全pool失败 → 报错（错误信息里列已尝试的模型，便于诊断）
```

替换 660 行硬编码 `'agnes-image-2.5-flash'`；`resolveMediaPlatform`（460-493）不变（它管平台与 Key，模型维度由池接管）。池为空（autoPool 也无 image 模型）→ 保持现有「默认 agnes」行为不回归。

### 5.3 子智能体（`call_agent` / `spawn_subagent`，5062-5093）

```
显式 args.modelId            → 现状不变（最高优先，含可见性校验 5086-5093）
agent.model_id 有值          → 现状不变（显式锁定）
否则                          → resolvePool(agent, 'llm')[0] → 父任务当前模型（task.modelId）
```

即把「agent 单模型绑定」升级为「agent 池首选」，回退到父任务的语义保留。工作流型子智能体（4516-4519 的 `__modelId` 注入）同款升级：优先注入池首选。

### 5.4 `list_models` 工具（553-633）

- 新增入参 `slot`：直接返回 `resolvePool(当前上下文, slot)` 的池内清单（平铺格式不变）。
- 不带 `slot` 的平铺返回：给属于当前生效池的候选行打 `★` 标（`list_models` 输出文本里加一列说明），引导模型优先选池内；`CATEGORY_MAP` 改引用 §3 纯函数。
- 系统提示词（`db.ts:1174-1175` 附近的 list_models 使用说明）补一句：「优先选用带 ★ 的池内模型」。

### 5.5 定时任务（`scheduled-tasks.ts:195-215`，低优先 P3）

选默认模型的 SQL 增加「先看 agent/平台/全局池」分支；无池时维持原 SQL。

## 6. UI 改造

### 6.1 输入框模型下拉瘦身（`ChatInputArea.vue`，三处入口）

- 数据源：`GET /api/model-pools?agentId=当前&platformId=当前` → llm + vision 两池合并展示（vision 候选带「视觉」小标，复用现有 type tag 样式），组内排序即池序。
- 顶部保留一行「显示全部模型」（点击展开全部可见模型，与现有平台分组折叠同款交互，`togglePlatformGroup` 模式）——不是 tip 提示，是一个可点行。
- 池为空（未配置）：直接回落全部可见模型（现状行为），不加任何提示。
- 搜索框保留（池小也是加分项，且「显示全部」后需要）。
- slash 模式（244-255）同款数据源。
- **窄屏/桌面两个 popover 不共 visible 的既有坑**（487-491 注释）不碰，只换数据源 computed。

### 6.2 智能体编辑（`AgentEditDialog.vue`）

- 原「模型」单选（40-44）保留，label 改「锁定模型（可选）」，placeholder 说明「留空则按候选池顺序选用」。
- 「模型参数」tab 或基本信息区新增 **四槽位多选**（`el-select multiple filterable`，按平台分组，选项来自全部可见模型；保存时按槽位分组展示，类型不匹配的选项置灰不可选——直接用 `matchesSlot` 同款前端判定，口径从后端拿：选项数据里带 `type`/`capabilities`，前端 store 里算）。
- 多选值存 `model_pools_json`（顺序 = 用户添加顺序，提供「设为首选」按钮置顶）。

### 6.3 模型平台配置（`Models.vue` / `PlatformDetail.vue`）

- 平台卡片/详情加「候选池」四槽位多选（同 6.2 组件复用）。
- 与 `llmEnabled` 开关并列，标注为该平台下智能体的默认池。

### 6.4 全局设置（`Settings.vue` 通用 tab，86-100 行区域）

- 新增「模型候选池」区：四槽位多选 + 一行弱说明「智能体未配置时使用其平台的池，平台未配置时用此处」。
- 读写 `PUT/GET /api/model-pools/global`（app_config）。

### 6.5 前端 store（新建 `stores/model-pool.ts`）

- 缓存三层池 + 解析后的生效池（llm/vision/image/video 四个 computed，按当前 agentId/platformId 变化重算）。
- agent 切换 / 平台切换时失效重取。
- `stores/agent.ts` / `stores/platform.ts` 的 rowToX 映射带 `modelPools` 字段（`platform.ts:53-54` 同款容错默认值模式）。

## 7. 测试策略

| 层 | 测试 | 要点 |
|---|---|---|
| 纯函数 | `matchesSlot` / 回退顺序 / 清洗去重保序 | 表驱动，含「上层全失效回落下层」「同模型多层配置去重」 |
| 真库 | `resolvePool` 四层回退 + autoPool 兜底 | 造 platform/model/agent/app_config 行，断言返回顺序与来源标注 |
| API | 三层 PUT/GET + 保存校验（错槽位拒绝、越权 user_id 拒绝） | 401/403/400 分支 |
| 运行时 | 429 → 换模型续跑 → 全链耗尽才失败 | mock fetch 按模型返回 429/200，断言 cursor 推进与最终用哪个模型 |
| 前端 | 下拉渲染生效池、多选保存往返、slash 模式 | vitest 既有模式 |
| 链路验证 | `yan-zhi-verify-tool-chain-and-seed` | 证明「断言存在 ≠ 断言生效」：真跑 list_models / api_image_generate 走池 |

## 8. 兼容与迁移

- **零配置可用**：三层全空 → autoPool = 现状可见模型全集，行为不变。
- **存量 `agent.model_id`**：显式锁定优先，不破坏；UI 引导用户迁移到池（锁定下拉留空即走池）。
- **商城远程 agent 快照**：`model_pools_json` 随快照发布；反序列化对缺失/损坏字段宽容（`try/catch → {}`），不影响安装。
- **旧库升级**：两处 ALTER TABLE 幂等；app_config 无迁移。
- **双标识**：池内只存主键；存量若混入 API 名（不该发生，保存时校验挡住），解析时按 `findModelRow` 兼容一次并打 warn。

## 9. 风险与边界

| 风险 | 级别 | 缓解 |
|---|---|---|
| 换模型后 context_window 差异导致压缩阈值失真 | high | 每轮按 current 模型重算窗口（压缩逻辑已有按模型取窗口的口径，需确认随 current 走而非 task 初始模型） |
| 换模型后 function_call 支持度不同，工具集要跟着变 | high | 每轮重算 `modelSupportsTools`（`model-caps.ts:23`）；无工具模型走纯对话降级（LlmClient 已有 `shouldRetryWithoutTools` 降级，`client.ts:571`） |
| 流式输出到一半换模型，半成品内容处理 | medium | 丢弃本轮 output，以完整历史重发；不计入截断续写次数 |
| 池配错类型（video 进 llm 池） | medium | 保存时校验拒绝 + 明确错误文案 |
| 候选全失效（池里模型全被停用） | medium | 该层视为空，继续回退下一层；日志 warn |
| 静默换模型用户无感知 | low | llm-logs 可见；符合「内部优化不加提示」原则 |
| 内置 agent seed 覆盖把用户配的池冲掉 | medium | seed 覆盖 SQL 排除 `model_pools_json` 列（`db.ts:2280-2290` 的 UPDATE 清单不加该列） |
| 三处下拉数据源改造漏一处 | medium | 桌面/移动/slash 三处共用同一个 computed（`effectivePoolModels`），不允许各写各的 |

## 10. 分期

- **P0 内核**：迁移 + `model-pools.ts` + 单测（不含 UI、不含运行时切换）。
- **P1 配置**：三层 API + 智能体/平台/全局 UI。
- **P2 消费**：输入框下拉瘦身 + `list_models` 适配 + store。
- **P3 运行时**：会话 failover + 媒体生成池化 + 子智能体 + 定时任务。
- **P4 收口**：链路验证（真跑）+ 回归 + 文档（设置页帮助文本补池说明）。

每期可独立合入、独立回滚；P3 依赖 P0/P1，P2 依赖 P0/P1。
