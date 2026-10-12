# 模型候选池（Model Candidate Pools）方案

> 变更目录：`openspec/changes/model-candidate-pools/`
> 状态：**方案评审中（先出方案，未动代码）**
> 配套文档：`design.md`（详细设计）、`tasks.md`（分期任务）

# 为什么

三个已存在、且互相纠缠的问题：

1. **模型太多，下拉失控**。一个平台可挂几百个模型（生产库实测 561 个），聊天下拉、智能体编辑下拉、`list_models` 工具返回全是平铺清单，用户和模型都要在长列表里淘。
2. **长任务被单模型限流打死**。会话 ReAct 主任务启动时 `new LlmClient(platform, model)` 只构造一次（`llm-task-manager.ts:2371`），整个任务（默认 500 步）无论多少轮都打同一个模型；上游 429/5xx 时只有 token 级换 Key 重试（`token-pool.ts:6,119-121`，最多 3 次），**没有模型级故障转移**——长任务跑几十分钟后撞上限流只能整体失败。
3. **动态选型可能选到差模型**。`list_models`（`llm-task-manager.ts:553-633`）把全部可见模型平铺给模型自己挑，池子越大挑错的概率越高；用户也无法表达"这个智能体只准用这几个模型"。

**核心思路**：按用途把模型收敛成四类**有序多选候选池**（llm / vision / image / video），配置分三层——**智能体 > 模型平台 > 全局默认**，全局没配就落到平台，平台也没配才自动兜底。所有消费点（输入框下拉、`list_models`、`call_agent`、媒体生成、长任务重试）统一从池里按序取，长任务遇限流自动换池中下一个模型。

# 改什么（范围）

1. **四槽位候选池**：`llm`（对话）/ `vision`（视觉理解）/ `image`（生图）/ `video`（生视频），每个槽位一个**有序多选**（数组顺序即优先级，`[0]` 为首选）。槽位语义与既有 `model.type` / `capabilities` 对齐（`shared/types/index.ts:9`、`model-caps.ts:15`）。
2. **三层配置，逐槽位回退**：
   - 智能体：`agent.model_pools_json`（新增列）
   - 模型平台：`platform.model_pools_json`（新增列）——「全局没有设置就用模型平台里面的」
   - 全局：`app_config` key = `model_pools`（沿用 `embedding_config` / `memory_dreaming_config` 先例，`db.ts:3530-3537`）
   - 三层该槽位都为空 → 自动兜底：全部可见模型按类型筛，`is_default` 优先（等价现状行为，零配置可用）
3. **单一解析模块** `apps/server/src/services/model-pools.ts`：读池 / 逐层回退 / 兜底 / 生效过滤（`enabled + visible + platform.llm_enabled`）只此一处实现，前端与后端、运行时与工具链共用同一口径（模式同 `model-resolve.ts`）。
4. **运行时改造**：
   - 会话主任务：LLM 调用失败（429/5xx/网络/超时）→ 沿候选链自动换下一个模型重建 client 重试，全链耗尽才落库报错（现状行为）；每轮按当前模型重算 `supportsTools` / 上下文窗口。
   - 媒体生成：`api_image_generate` / `api_video_generate` 不显式传 `model` 时从 image/video 池按序取，替换硬编码默认 `'agnes-image-2.5-flash'`（`api-tool-executor.ts:660`）。
   - 子智能体（`call_agent` / `spawn_subagent`）：不显式传 `modelId` 时用「智能体自己的 llm 池首选」→ 父任务当前模型（现有回退链升级）。
5. **UI 改造**：
   - 智能体编辑（`AgentEditDialog.vue:40-44`）：原单选「模型」降级为「显式锁定（可选）」，新增四槽位多选。
   - 模型平台配置（`Models.vue` / `PlatformDetail.vue`）：平台级四槽位多选（与 `llmEnabled` 同属使用偏好，内置平台可配）。
   - 全局设置（`Settings.vue:86-100` 通用 tab）：新增「模型候选池」四槽位多选，读写 `app_config`。
   - **输入框模型下拉瘦身**（`ChatInputArea.vue` 三处入口：桌面胶囊 591-627 / 移动端 495-531 / slash 244-255）：数据源从「全部可见模型」改为「当前智能体 llm + vision 生效池」，保留一行「显示全部」入口与搜索；池为空时回落全部可见。
6. **工具链适配**：
   - `list_models`（`llm-task-manager.ts:553-633`）：新增 `slot` 参数直接返回该槽位生效池；平铺返回时给池内候选打标（如 `★池内`），引导模型优先选池内。
   - `call_agent` / `spawn_subagent` / 媒体工具：入参 `modelId` / `model` 显式点名仍最高优先（兼容不变），未点名走池。

# 明确不做（范围外）

- 不改 token 池 / Key 轮换 / `pauseIfNeeded` 限速停顿（`token-pool.ts` 继续作为 Key 维度兜底，与模型维度正交）。
- 不改 `model` 表主键/`model_id` 双标识体系（`model-resolve.ts` 口径不动）；池内存 **model 主键 id**。
- 不新增用户侧提示按钮（内部优化原则）：长任务静默换模型，只落 `llm-logs` 与任务事件，不加 toast/角标。
- 不做模型质量自动评估/打分（池的质量由用户配置保证）。
- 不动商城发布/远程智能体快照结构（`model_pools_json` 随 agent 快照走，反序列化宽容降级）。

# 影响面（文件级）

**后端**
- `apps/server/src/db.ts`：`agent` / `platform` 两处幂等 `ALTER TABLE ... ADD COLUMN model_pools_json TEXT`（沿用 820-826 行迁移模式）。
- `apps/server/src/services/model-pools.ts`（新建）：解析内核。
- `apps/server/src/routes/model-pools.ts`（新建）：三层读写 API（集中一处，避免散落）。
- `apps/server/src/routes/agents.ts`：agent 保存/读取带 `modelPools`。
- `apps/server/src/routes/platforms.ts`：`PATCH /:id` 支持 `modelPools`（与 `llmEnabled` 同款「仅偏好」早返回分支）。
- `apps/server/src/llm-task-manager.ts`：主任务候选链 + failover（2371/2731 附近）；`listAvailableModels` 加 slot/池标注（553-633）；子智能体解析升级（5062-5093）。
- `apps/server/src/mcp/api-tool-executor.ts`：`mediaGenerateImage` / `mediaGenerateVideo` 池化默认（660 附近 + `resolveMediaPlatform` 460-493）。
- `apps/server/src/services/scheduled-tasks.ts`：定时任务选模型时读池（195-215 附近，低优先）。

**前端**
- `packages/ui/src/stores/model-pool.ts`（新建）：三层池 store（global + 当前平台 + 当前智能体）。
- `packages/ui/src/components/AgentEditDialog.vue`：四槽位多选 + 「显式锁定」说明。
- `packages/ui/src/views/Models.vue` + `views/PlatformDetail.vue`：平台级池配置。
- `packages/ui/src/views/Settings.vue`：全局池配置区。
- `packages/ui/src/components/chat/ChatInputArea.vue`：三处下拉数据源切生效池 + 「显示全部」行。
- `packages/ui/src/stores/agent.ts` / `stores/platform.ts`：字段映射带 `modelPools`。

**测试**
- `apps/server/test/model-pools.test.ts`（新建）：回退顺序 / 槽位匹配 / 失效过滤 / 兜底（纯函数 + 真库，参考 `model-resolve.test.ts`）。
- `apps/server/test/llm-task-failover.test.ts`（新建或并入现有）：模拟 429 换模型续跑。
- 前端：候选池下拉渲染、AgentEditDialog 多选保存（沿用既有 vitest 模式）。

# 与旧变更的关系

- **`improve-agent-tool-system`**（`list_models` / `call_agent` 选型体系）：本变更是其「选型收敛」增强，不推翻；显式传参路径保持兼容。
- **`data-ontology-agent` / `four-mode-workspace` 等**：无交集，不联动。
- 无删除性变更：`agent.model_id` / `platform_id` 单模型绑定语义保留（显式锁定），所有存量配置零迁移可用。

# 所需 Skill 标注

- **`openspec`**（必需）：proposal/design/tasks 编写与 `openspec validate`。
- **`yan-zhi-verify-tool-chain-and-seed`**（落地后必需）：证明池解析在真实链路（list_models / 媒体生成 / 子智能体）生效，而非只存在于代码。
- **`agent-browser`**（落地后）：输入框下拉瘦身 UI 截图核验。
- ❌ Makers 系列不适用。
