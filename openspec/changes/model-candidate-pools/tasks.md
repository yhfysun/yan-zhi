# 模型候选池 — 分期任务清单

> 节奏：先出方案 → 用户确认 → 开干。每期独立合入、独立回滚。
> 每期收尾：`tsc` 编译过 + 相关测试真跑 + `git log` 逐提交点复核（并行会话防裹走）。

## P0 内核（数据 + 解析）

- [x] `db.ts`：`agent` / `platform` 各加一条幂等 `ALTER TABLE ... ADD COLUMN model_pools_json TEXT`（820-826 行 try/catch 模式）
- [x] 新建 `apps/server/src/services/model-pools.ts`：
  - [x] `Slot` 类型 + `matchesSlot()` 纯函数（§3 四条规则）
  - [x] `parsePoolsJson()`（宽容反序列化：损坏 → `{}`）
  - [x] `readPoolAt(scope)` 三层读取
  - [x] `resolvePool()` 逐槽位回退 + 生效过滤（enabled/visible/llm_enabled）+ 去重保序
  - [x] `autoPool(slot)` 兜底（is_default DESC, created_at DESC）
- [ ] `listAvailableModels` 的 `CATEGORY_MAP` 改引用 `matchesSlot`（口径收敛，行为不变）——**推迟到 P2**（llm-task-manager.ts 为并行会话热点文件，P0 刻意不碰）
- [x] 测试 `apps/server/test/model-pools.test.ts`：
  - [x] `matchesSlot` 表驱动（llm/vision/image/video × type/caps 组合）
  - [x] 回退顺序：agent 全失效 → platform → global → autoPool
  - [x] 去重保序、损坏 JSON 容错、user_id 隔离
- [x] `tsc` + 测试真跑通过

## P1 配置（API + 三层 UI）

- [x] 新建 `apps/server/src/routes/model-pools.ts`：
  - [x] `GET /api/model-pools?agentId=&platformId=`（三层合并 + 来源标注）
  - [x] `PUT /api/model-pools/global | /platforms/:pid | /agents/:aid`
  - [x] 保存校验：id 存在 / 属主 / 槽位匹配，错误文案明确；内置平台允许写（仅偏好）
- [x] `routes/platforms.ts` `PATCH /:id` 支持 `modelPools`（`llmEnabled` 同款早返回分支）
- [x] `routes/agents.ts` 保存/读取带 `model_pools_json`
- [x] 内置 agent seed 覆盖 SQL **排除** `model_pools_json` 列（防冲掉用户配置）
- [x] 前端 `stores/model-pool.ts`：三层缓存 + 四槽位生效池 computed（agent/platform 切换失效）
- [x] `stores/agent.ts` / `stores/platform.ts` 映射带 `modelPools`
- [x] `AgentEditDialog.vue`：锁定模型下拉（留空走池）+ 四槽位多选（类型不匹配置灰、设为首选置顶）
- [x] `Models.vue` / `PlatformDetail.vue`：平台级四槽位多选
- [x] `Settings.vue` 通用 tab：全局候选池区
- [x] API 测试（三层 PUT/GET + 校验拒绝分支）+ 前端组件测试

## P2 消费（下拉瘦身 + 工具链）

- [x] 新建共用 computed `effectivePoolModels`（llm + vision 合并，单一来源，三处入口共用）
- [x] `ChatInputArea.vue` 三处下拉（桌面胶囊 / 移动端 / slash）数据源切生效池：
  - [ ] 「显示全部模型」可点行（不新增 tip 文字）
  - [ ] 池为空回落全部可见（行为不回归）
  - [ ] 不碰「两个 popover 不共 visible」的既有结构（487-491）
- [x] `list_models`：新增 `slot` 参数返回生效池；平铺返回给池内候选打 `★`
- [x] 系统提示词（`db.ts:1174-1175` 附近）补「优先选池内模型」引导
- [ ] 前端测试：下拉渲染 / slash 模式 / 多选往返（留 P4 回归补）
- [ ] UI 截图核验（agent-browser，留 P4）

## P3 运行时（failover + 池化选型）

- [x] 会话主任务（`llm-task-manager.ts` 2371/2731 附近）：
  - [ ] 任务启动解析候选链（带图 → vision 槽位；显式 `params.modelId` 不启用 failover）
  - [ ] 失败换模型：cursor 推进、重建 client、本轮以完整历史重发
  - [ ] 每轮重算 `supportsTools` / `contextWindow` / maxTokens；确认压缩阈值随 current 模型走
  - [ ] 切换写 logger + llm-logs（不加用户侧提示）；全链耗尽 → 现状错误落库
- [x] `api_image_generate` / `api_video_generate`：未传 model → 池序遍历（model × key 双层循环），错误列已尝试模型；池空保持 agnes 默认
- [x] 子智能体（5062-5093）：不显式传时 agent 池首选 → 父任务模型；工作流 `__modelId` 注入同款
- [x] `scheduled-tasks.ts` 默认模型先查池（低优先）
- [x] 测试：mock fetch 429→200 断言换模型续跑；全链耗尽失败；媒体池序遍历
- [ ] 链路真跑验证（verify-tool-chain skill）：list_models / api_image_generate / 子智能体（需起服务实测，留本轮之后）

## P4 收口

- [ ] 回归：既有 model-visibility / model-resolve / workflow-preflight 测试全绿
- [ ] 设置页帮助文本（`settings.ts` 帮助内容 472-473 行附近）补候选池说明
- [ ] `openspec validate` + 变更归档
- [ ] 商城远程 agent 快照带 `model_pools_json` 往返验证（发布 → 安装 → 反序列化容错）
