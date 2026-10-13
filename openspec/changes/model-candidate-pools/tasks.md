# 模型候选池 · 任务清单

> 状态说明：`[x]` = 已实装**并有验证**；`[~]` = 已实装但验证方式有限；`[ ]` = 未做。
> 2026-10-13 逐项复核一遍，把先前误勾的项校正（见 P2 备注）。
> **2026-10-13 语义修正（用户指正）**：第二层是「**智能体平台**」（/agents，所有智能体的默认池，
> 跨供应商可选），**不是**「模型平台」（/models = 百炼/agnes 这类大模型供应商）。
> 详见下方「P5 语义修正」与 `services/model-pools.ts` 文件头。

## P0 内核（数据 + 解析）

- [x] `db.ts`：`agent` 加一条幂等 `ALTER TABLE ... ADD COLUMN model_pools_json TEXT`（820-826 行 try/catch 模式）
- [x] 新建 `apps/server/src/services/model-pools.ts`：
  - [x] `SLOTS` / `matchesSlot`（re-export `@yan-zhi/shared` 的 `matchesModelSlot`，前后端同源）
  - [x] `parsePoolsJson`（读路径宽容：坏 JSON → `{}`，非法项静默剔除 + warn）
  - [x] `loadEffectiveModels`（`enabled=1 AND visible=1 AND p.llm_enabled=1`）
  - [x] `resolvePool`：L1 agent → L2 agentPlatform → L3 global → L4 autoPool，**逐槽位**回退
  - [x] `resolveFirstModel` / `resolveFailoverChain`（当前模型提到链首、去重、池外不越界纠正）
  - [x] `validateModelPools`（写路径严格：错槽位 / 越权 / 不存在 → 明确报错）
- [x] `listAvailableModels` 的 `CATEGORY_MAP` 改引用 `matchesSlot`（口径收敛，行为不变）——**推迟到 P2**（llm-task-manager.ts 为并行会话热点文件，P0 刻意不碰）
- [x] 测试 `apps/server/test/model-pools.test.ts`：
  - [x] 回退顺序（含「该槽位为空 → 跳过该层落下一层」的槽位粒度用例）
  - [x] 校验 7 种拒绝分支 + 去重 + 损坏 JSON + 跨用户隔离
- [x] `tsc` + 测试真跑通过

## P1 配置（API + 三层 UI）

- [x] 新建 `apps/server/src/routes/model-pools.ts`：
  - [x] `GET /api/model-pools?agentId=` → `{global, agentPlatform, agent, effective}`
  - [x] `PUT /global | /agent-platform | /agents/:aid`（先校验后写）
- [x] `routes/agents.ts` 保存/读取带 `model_pools_json`
- [x] 内置 agent seed 覆盖 SQL **排除** `model_pools_json` 列（防冲掉用户配置）
- [x] 前端 `stores/model-pool.ts`：三层读写 + **独立全量模型清单**（`allModels` / `ensureModels`）
- [x] `stores/agent.ts` / `stores/platform.ts` 映射带 `modelPools`
- [x] `AgentEditDialog.vue`：锁定模型下拉（留空走池）+ 四槽位多选
- [x] `Agents.vue`（智能体平台页）：页头「候选池」入口 + 四槽位弹窗（**P5 修正后迁到这里**）
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

- [x] 回归：`model-pools` / `model-pool-failover` / `model-resolve` / `model-visibility` / `model-caps` / `workflow-preflight` 全绿
- [x] 设置页帮助文本（`stores/settings.ts` 的「设置」条目）补候选池说明
- [x] 前端守门测试 `packages/ui/src/utils/model-pools.test.ts` + **变异测试 12/12 有效、源码零漂移**
      （变异覆盖：L2 语义退回模型平台 / 入口塞回 /models / store 退回 per-platform 端点 / 入口缺失 …）
- [x] UI 真跑核验（CDP）：设置页全局池 **173 个模型可选**、按平台分组；「智能体平台」页候选池弹窗
      **173 个**、按 3 个平台分组；「模型平台」页与「管理模型」页**已无候选池**（符合修正后语义）
- [x] 修用户实报两处：
  - 「设置页面都有问题了」→ 下拉全空（数据源错）+ 提示与按钮挤一行（排版）
- [ ] `openspec validate` + 变更归档（CLI 未安装，跳过）
- [ ] 商城远程 agent 快照带 `model_pools_json` 往返验证（发布 → 安装 → 反序列化容错）

## P5 语义修正（2026-10-13，用户指正）

> 用户原话：「候选是智能体平台啊不是大模型平台啊。。。。」
> 项目里 `/models` 的导航名是「**模型平台**」（= 百炼/agnes 这类大模型供应商），
> `/agents` 是「**智能体平台**」。旧实现把第二层挂在 platform 表（模型平台）上 ⇒ 配错了层。

- [x] `services/model-pools.ts`：L2 改读 `app_config['agent_platform_model_pools']`（应用级单例，
      **跨供应商可选**）；删除 `readPlatformPools`；`resolvePool` 去掉 `platformId` 入参；
      `PoolEntry.source` 的 `'platform'` → `'agentPlatform'`
- [x] `routes/model-pools.ts`：GET 返回 `agentPlatform`（不再有 `platform` 字段）；
      `PUT /agent-platform` 取代 `PUT /platforms/:pid`
- [x] `routes/platforms.ts`：撤掉 `modelPools` 写入分支（该层不存在于模型平台）
- [x] 6 处 `resolve*` 调用点去掉 `platformId`（llm-task-manager ×4 / api-tool-executor / scheduled-tasks）
- [x] `db.ts`：`platform.model_pools_json` 列**保留但停用**（既有库可能有残留值，删列风险大于收益）
- [x] 前端 `stores/model-pool.ts`：`platformPools` 字典 → `agentPlatformPools` 单例；
      `savePlatform/loadPlatform/platformPoolOf` → `saveAgentPlatform`
- [x] `Models.vue` / `PlatformDetail.vue`：**移除**候选池 UI（模型平台不该有）
- [x] `Agents.vue`（智能体平台页）：页头加「候选池」入口 + 弹窗（含"对所有智能体生效"说明）
- [x] 全部文案改口径（设置页 hint / 智能体编辑注释 / 帮助文档）
- [x] 测试同步：`model-pools.test.ts` 改断言 + 新增 4 例（跨供应商可选 / L2 不依赖 agent 上下文 /
      source 旧名不得残留 / platform 表写池不生效）；前端守门测试改断言 + 新增 3 例
- [x] 真跑验证（curl）：跨三供应商（百炼 + agnes + 本地 ollama）写入成功；L1 空 → 回退 L2 生效；
      L1 有 llm → `source=agent`，image/video 未配各自回落 `auto`（逐槽位回退）