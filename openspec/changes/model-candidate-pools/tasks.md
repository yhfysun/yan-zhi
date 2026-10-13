# 模型候选池 · 任务清单

> 状态说明：`[x]` = 已实装**并有验证**；`[~]` = 已实装但验证方式有限；`[ ]` = 未做。
> 2026-10-13 逐项复核一遍，把先前误勾的项校正（见 P2 备注）。

## P0 内核（数据 + 解析）

- [x] `db.ts`：`agent` / `platform` 各加一条幂等 `ALTER TABLE ... ADD COLUMN model_pools_json TEXT`（820-826 行 try/catch 模式）
- [x] 新建 `apps/server/src/services/model-pools.ts`：
  - [x] `SLOTS` / `matchesSlot`（re-export `@yan-zhi/shared` 的 `matchesModelSlot`，前后端同源）
  - [x] `parsePoolsJson`（读路径宽容：坏 JSON → `{}`，非法项静默剔除 + warn）
  - [x] `loadEffectiveModels`（`enabled=1 AND visible=1 AND p.llm_enabled=1`）
  - [x] `resolvePool`：L1 agent → L2 platform（限本平台）→ L3 global → L4 autoPool，**逐槽位**回退
  - [x] `resolveFirstModel` / `resolveFailoverChain`（当前模型提到链首、去重、池外不越界纠正）
  - [x] `validateModelPools`（写路径严格：错槽位 / 越权 / 不存在 → 明确报错）
- [x] `listAvailableModels` 的 `CATEGORY_MAP` 改引用 `matchesSlot`（口径收敛，行为不变）——**推迟到 P2**（llm-task-manager.ts 为并行会话热点文件，P0 刻意不碰）
- [x] 测试 `apps/server/test/model-pools.test.ts`：
  - [x] 回退顺序（含「平台层该槽位为空 → 跳过平台落全局」的槽位粒度用例）
  - [x] 校验 7 种拒绝分支 + 去重 + 损坏 JSON + 跨用户隔离
- [x] `tsc` + 测试真跑通过

## P1 配置（API + 三层 UI）

- [x] 新建 `apps/server/src/routes/model-pools.ts`：
  - [x] `GET /api/model-pools?agentId=&platformId=` → `{global, platform, agent, effective}`
  - [x] `PUT /global | /platforms/:pid | /agents/:aid`（先校验后写）
- [x] `routes/platforms.ts` `PATCH /:id` 支持 `modelPools`（`llmEnabled` 同款早返回分支）
- [x] `routes/agents.ts` 保存/读取带 `model_pools_json`
- [x] 内置 agent seed 覆盖 SQL **排除** `model_pools_json` 列（防冲掉用户配置）
- [x] 前端 `stores/model-pool.ts`：三层读写 + **独立全量模型清单**（`allModels` / `ensureModels`）
- [x] `stores/agent.ts` / `stores/platform.ts` 映射带 `modelPools`
- [x] `AgentEditDialog.vue`：锁定模型下拉（留空走池）+ 四槽位多选
- [x] `Models.vue`：平台卡片「候选池」弹窗
- [x] `Settings.vue` 通用 tab：全局候选池区
- [x] API 测试（三层 PUT/GET + 校验拒绝分支）

## P2 消费（下拉瘦身 + 工具链）

- [x] 前端共用 `utils/model-pools.ts`：`POOL_SLOTS` / `POOL_LABELS` / `groupModelsForSlot` / `poolModelsOf`（**唯一实现**，四视图共用）
- [x] `ChatInputArea.vue` 三处下拉（桌面胶囊 / 移动端 / slash）数据源切生效池：
  - [x] 「显示全部模型」可点行（不新增 tip 文字）
  - [x] 池为空回落全部可见（行为不回归）
  - [x] 不碰「两个 popover 不共 visible」的既有结构（487-491）
- [x] `list_models`：新增 `slot` 参数返回生效池；平铺返回给池内候选打 `★` + 尾部提示
- [x] 系统提示词（`db.ts` 【模型选型】段）补「优先选池内模型」引导 + failover 说明 —— 2026-10-13 补做
- [ ] 前端组件测试：下拉渲染 / slash 模式 / 多选往返（现有测试覆盖到「数据源与元数据唯一实现」，渲染层仍缺）

## P3 运行时（failover + 池化选型）

- [x] 会话主任务（`llm-task-manager.ts` 2424 / 2872）：
  - [x] 任务启动解析候选链（带图 → vision 槽位；显式 `params.modelId` 不启用 failover）
  - [x] 失败换模型：cursor 推进、重建 client、本轮以完整历史重发
  - [x] 每轮重算 `supportsTools` / `contextWindow` / maxTokens
  - [x] 切换写 logger + llm-logs（不加用户侧提示）；全链耗尽 → 现状错误落库
- [x] `api_image_generate` / `api_video_generate`：未传 model → 池序遍历，错误列已尝试模型；池空保持 agnes 默认
- [x] 子智能体（4609 / 5161）：不显式传时 agent 池首选 → 父任务模型
- [x] `scheduled-tasks.ts` 默认模型先查池（低优先）
- [x] 测试：429/5xx/401/403/timeout 换模型；400/404/422 不换；链顺序/去重/池外
- [~] 链路真跑验证：已用 curl 验证 `GET /api/model-pools` 的**逐槽位回退**（agent 配 llm → 全 `source=agent`；vision/image/video 未配 → 回落 auto）与 3.6 校验拒绝分支。
       `list_models` 的行动态（模型真的按 ★ 选型）与媒体池遍历未在实跑会话中验证 —— 属"跑起来才知道"的机制，见 `TESTING-NOTES` 坑 60h。

## P4 收口

- [x] 回归：`model-pools` / `model-pool-failover` / `model-resolve` / `model-visibility` / `model-caps` / `workflow-preflight` 共 84 例全绿
- [x] 设置页帮助文本（`stores/settings.ts` 的「设置」条目）补候选池说明
- [x] 前端守门测试 `packages/ui/src/utils/model-pools.test.ts`（17 例）+ **变异测试 7/7 有效、源码零漂移**
- [x] UI 真跑核验（CDP，非 agent-browser）：设置页全局池 **173 个模型可选**、按平台分组；平台候选池弹窗 **159 个**；智能体编辑候选池已回显选中条目；`/models/:pid` 独立路由下平台池入口可见可开
- [x] 修用户实报两处：
  - 「平台级别的设置不了 / 进入管理按钮没用」→ `PlatformDetail.vue`（管理模型页）补候选池入口条 + 弹窗
  - 「设置页面都有问题了」→ 下拉全空（数据源错）+ 提示与按钮挤一行（排版）
- [ ] `openspec validate` + 变更归档
- [ ] 商城远程 agent 快照带 `model_pools_json` 往返验证（发布 → 安装 → 反序列化容错）