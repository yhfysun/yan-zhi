# Skill 蒸馏对标 WorkMateAI · 融合方案（2026-10-15）

> **触发点**：用户提供 WorkMateAI「技能库 → 技能蒸馏」界面截图，要求与我们已有的 Skill 蒸馏功能对比，
> 取两边优点出融合方案。
>
> **本文件只出方案、不动代码**；确认 §7 分期范围后开干。

---

## 1. 结论先行（TL;DR）

两边是**同一功能的两条产品思路**：

| | 我们（SkillDistill 三屏工作台） | WorkMateAI（技能蒸馏） |
|---|---|---|
| 生成路径 | 一步到位：勾选消息 → 直接产出 SKILL.md | **两段式**：勾选消息 → AI 生成结构化「技能概览」（可手改）→ AI 提炼成技能 |
| 质量控制点 | 全在事前（消息勾选/权限档）+ 事后（改造 refine） | 事中多一个**可编辑的概览中间态**，AI 提炼被概览约束 |
| 结果呈现 | 裸 Markdown 原文（front-matter + body 分块展示） | **渲染后的技能卡片**（名称/说明/输入/步骤）+ 编辑/预览切换 |
| 生命周期 | 保存即进 Skill 商店（无草稿态） | 草稿 → **去调试** → **发布为正式技能**（显式发布） |
| 任务持久化 | ❌ 纯内存，刷新即丢（硬伤） | ✅ 页面态完整 |
| 消息筛选 | 手动勾选 + **三态权限档**（normal/required/excluded）+ 角色筛选 | 气泡勾选 + **AI 自动过滤**无效信息（一键） |
| 模型可控性 | ✅ 平台/模型/温度/提示词全可配 | 截图未见暴露 |
| 自动蒸馏 | ✅ 服务端经验档案触发（重复流程 ≥2 次自动出草稿） | ❌ 纯手动 |
| 新手引导 | 无 | 顶部 4 步流程条 + 「AI一键提炼技能」快捷路径 |

**融合判断**：他们的**交互骨架**（两段式概览、渲染预览、草稿→发布、自动过滤）明显更成熟；
我们的**可控性底座**（权限档、模型配置、refine 循环、商店联动、服务端自动蒸馏）是他们没有的。
方案 = 保留我们的底座，把他们的交互骨架搬进来。

---

## 2. 双方能力盘点（基于代码核实）

### 2.1 我们现有的三个入口

| 入口 | 文件 | 说明 |
|---|---|---|
| 三屏工作台 | `packages/ui/src/views/SkillDistill.vue`（1257 行） | 左：会话+消息勾选；中：模型配置+蒸馏指令+任务列表；右：一键生成+预览+保存/发布/启停 |
| 聊天内弹窗 | `packages/ui/src/components/DistillDialog.vue` | 对话里「蒸馏为 Skill」轻量路径：预览消息 → 蒸馏 → 改造 → 保存 |
| 服务端自动蒸馏 | `apps/server/src/services/skill-distill.ts` | 经验档案同一主题 ✅步骤累计 ≥2 次自动生成草稿到 `.yan-zhi/skill-drafts/`，不静默生效 |

核心逻辑在 `packages/ui/src/stores/distill.ts`（356 行）：`distill / refineSkill / refineMd / redistill /
saveAsSkill / saveMdAsSkill / parseSkillMd`，配置持久化到 keyring（`settings:distill`），
**tasks 数组是纯内存 ref，刷新即丢**。

### 2.2 WorkMateAI 的流程（从截图还原）

顶部流程条：`1. 从任务处理过程中滤无效信息（可选）→ 2. 点击[AI生成概览]，手动修正 →
3. 点击[AI提炼技能]，去调试，手工/AI 辅助精调 → 4. 发布为正式技能`；
另有右上角「+ AI一键提炼技能」跳过中间态的快捷路径。

| 屏 | 内容 |
|---|---|
| 左栏「任务处理过程」 | 气泡式对话回放（用户右/助手左），每条带 ✓ 勾选；「自动过滤」下拉；tab 切「任务处理过程 / 交付内容 2/2」；「AI生成概览」按钮 |
| 中栏「提炼」 | 「AI提炼技能」按钮；**技能概览表单**：中文名称 / 英文标识（kebab-case）/ 技能说明 / 前置输入 / 处理过程概述（编号步骤）/ 输出内容——AI 生成、可手动修正 |
| 右栏「技能」 | SKILL.md 文件节点；**渲染预览**（名称/nameZh/说明卡片 + 正文 Inputs/Steps，工具引用可点击）；「编辑/预览」切换；「去调试」「发布为正式技能」 |

---

## 3. 逐环节交互对比

| 环节 | 我们 | WorkMateAI | 判定 |
|---|---|---|---|
| 消息勾选 | 复选框列表 + 三态权限档 + 全选/反选/角色筛选 | 气泡回放 + 简单勾选 + AI 自动过滤 | **各取一半**：气泡回放观感好、保留任务语境；我们的权限档更精细。→ 气泡化 + 保留权限档 + 补 AI 过滤 |
| 生成流程 | 一步直出 | 概览（可改）→ 提炼，两段式 | **采他们的**。概览是质量控制点，也正好解决「改一个词要整篇重蒸」的问题 |
| 预览 | 裸 Markdown | 渲染卡片 + 编辑/预览切换 | **采他们的**。仓库已有 markdown-it（`useChat.ts:8`、`FilePreview.vue:203` 在用），成本低 |
| 迭代修改 | refine 循环（指令→整篇重生成） | 手工/AI 辅助精调 | 我们已有且更强，保留 |
| 落库 | 保存即进商店 | 草稿 → 调试 → 显式发布 | **采他们的**。现在「保存到 Skill 商店」按钮太重，误存成本高 |
| 试跑验证 | 无 | 去调试 | **采他们的**，且我们有现成挂载机制（`conversation.skill_ids_json`），实现便宜 |
| 模型配置 | 平台/模型/温度/提示词可配 | 未暴露 | 保留我们的 |
| 自动蒸馏 | 服务端经验触发 | 无 | 保留我们的 |
| 命名 | 从 front-matter 解析，不可直接编辑 | 中文名/英文标识表单化可编辑 | **采他们的**表单化；中文名存 `frontmatter_json.nameZh`，不加列 |
| 新手引导 | 无 | 顶部 4 步流程条 | 采他们的，一行静态说明条成本极低 |

**WorkMateAI 我们明确不抄的**：「交付内容 2/2」tab（场景不明确，P2 再议）、工具引用点击跳转（依赖他们的工具体系）。

---

## 4. 融合方案（目标形态）

页面仍是三屏，但每屏职责升级：

```
左屏（选材）    气泡式回放 + 权限档 + 「自动过滤」AI 一键滤噪 + 会话/消息选择（保留现有）
中屏（概览→提炼）新增「技能概览」表单（AI 生成、可手改）→「AI 提炼技能」；
               模型配置保留可折叠；蒸馏任务列表改为「草稿列表」（带状态 tag）
右屏（成品）    SKILL.md 渲染预览 + 编辑/预览切换 + refine 循环 + 「存为草稿」→「去调试」→「发布为正式技能」
页顶           4 步流程引导条（静态）
```

关键数据结构（新增，建议放 `@yan-zhi/shared`）：

```ts
/** 技能概览：两段式生成的中间态，人可编辑 */
interface SkillOverview {
  nameZh: string;        // 中文名称，如「停电排查与报障处理」
  slug: string;          // 英文标识 kebab-case，如 power-outage-investigation-and-reporting
  description: string;   // 一句话说明
  inputs: string[];      // 前置输入
  steps: string[];       // 处理过程概述（编号步骤）
  outputs: string[];     // 输出内容
  triggers: string[];    // 触发词（保留我们已有的概念）
}

/** 草稿状态机：overview（仅概览）→ draft（已提炼）→ published（已发布）；failed 只在前端提示不落库 */
type DraftStatus = 'overview' | 'draft' | 'published';
```

LLM 提示词两段化：
1. **概览生成**：勾选消息 → 输出 `SkillOverview` JSON（`responseFormat: json_object`，
   `apps/server/src/services/skill-distill.ts:63` 已有同款先例可抄）；
2. **技能提炼**：`SkillOverview`（用户改过的版本）+ 勾选消息 → 输出完整 SKILL.md。
   概览在此是**硬约束**：步骤与输入输出不得超出概览范围，只允许细化。

「AI一键提炼技能」= 两段自动连跑不停顿，等价现状直通路径，保留。

---

## 5. 分期落地

### P0 — 补硬伤 + 低成本高收益（约 1~1.5 天）

| # | 事项 | 触点 |
|---|---|---|
| 1 | **蒸馏任务/草稿持久化**：新表 `skill_draft`（id, title, status, source_conv_id, source_msg_ids_json, overview_json, result_md, error, created_at, updated_at），迁移按 `packages/core/src/db/schema.ts` 既有 `ALTER TABLE` try/catch 惯例追加；`stores/distill.ts` 的 tasks 改为读写 DB（桌面本地 sqlite / server 双通道走现有 adapter 模式） | schema.ts、distill.ts、server 路由 |
| 2 | **右屏预览升级**：body 用 markdown-it 渲染 + 「编辑/预览」切换（编辑态保留现有原文展示并可改） | SkillDistill.vue |
| 3 | **概览数据结构与互转**：`SkillOverview` 类型 + `parseSkillMd` ↔ overview 双向转换（老任务无概览时从 front-matter 反推） | distill.ts、`@yan-zhi/shared` |
| 4 | 页顶 4 步流程引导条 | SkillDistill.vue |

### P1 — 对标核心交互（约 2~3 天）

| # | 事项 | 触点 |
|---|---|---|
| 5 | **两段式生成**：「AI 生成概览」按钮 + 概览表单（中屏，全部可编辑）→「AI 提炼技能」；distill store 新增 `generateOverview()` / `distillFromOverview()`；保留一键直通 | distill.ts、SkillDistill.vue |
| 6 | **自动过滤**：左栏「自动过滤」下拉（保守/激进）→ LLM 给消息打噪标签（工具中间态/报错重试/空消息）→ 自动置 excluded；打标结果可撤销（恢复 normal） | distill.ts、SkillDistill.vue |
| 7 | **气泡式回放**：左屏消息列表改聊天气泡样式（用户右/助手左），勾选与权限档入口保留（气泡角标） | SkillDistill.vue |
| 8 | **草稿→发布生命周期**：右屏操作改为「存为草稿」（默认）/「去调试」/「发布为正式技能」（调 `skillStore.createCustom`）；草稿列表带状态 tag；SkillDistill.vue 顺手拆子组件（当前 1257 行超 800 上限：`DistillOverviewForm.vue`、`DistillBubbleList.vue`、`DistillPreview.vue`） | distill.ts、SkillDistill.vue、skill.ts |
| 9 | **双语命名表单**：概览表单含 nameZh + slug；发布时 nameZh 写入 `frontmatter_json` | 同上 |

### P2 — 锦上添花（约 1~2 天，可后置）

| # | 事项 | 触点 |
|---|---|---|
| 10 | **去调试（试跑）**：草稿卡片「去调试」→ 创建临时会话并挂载该草稿技能（`conversation.skill_ids_json` 现成机制）→ 预填一条测试 prompt → 跑完回到蒸馏页迭代 | chat store、SkillDistill.vue |
| 11 | 「交付内容」tab（任务过程 vs 交付物分流）——先观察 P1 上线后使用情况再定 | SkillDistill.vue |
| 12 | DistillDialog（聊天弹窗）同步最小改动：加「存为草稿」按钮，**不加**概览阶段（保持轻量） | DistillDialog.vue |

**服务端自动蒸馏（skill-distill.ts）不动**：它是独立触发链（经验档案），产出直接是草稿文件；
P0 后可让它同样写 `skill_draft` 表，统一草稿入口——放 P2 顺带做。

---

## 6. 风险与开放问题

| # | 风险/问题 | 对策 |
|---|---|---|
| 1 | 概览 JSON 输出不稳（模型跑飞） | `responseFormat: json_object` + 逐字段类型校验 + 失败回退「一键直通」路径，不阻塞 |
| 2 | 自动过滤的 LLM 成本（长会话几百条消息） | 只对 tool/超长消息打标、分批（每批 ≤50 条）；可选走便宜模型；过滤结果缓存到草稿 |
| 3 | 新表迁移 | 全部 try/catch 包裹，CREATE IF NOT EXISTS，老库零破坏 |
| 4 | 旧内存任务丢失 | **不做迁移**（都是临时试验产物，迁移成本高于收益），发版说明提一句 |
| 5 | 气泡化在窄屏/移动端表现 | 复用现有 `@media (max-width:1023px)` 堆叠断点，P1 内真机复测 |
| 6 | 草稿表 vs keyring 选型 | **定 DB 新表**：消息原文与结果 markdown 体积大，keyring 是配置级存储，不合适 |
| 7 | 「去调试」的会话创建入口 | P2 开工前确认复用桌面/移动端哪个创建接口，避免双写 |

## 7. 确认点

开工前请拍板：
1. **分期范围**：P0 + P1 一起做？还是先 P0 验证持久化与预览改造？
2. **气泡回放**（P1-7）：纯视觉改造，若嫌工作量可降级为「保留列表样式、只补自动过滤」。
3. **「存为草稿」默认化**（P1-8）：发布改为显式动作后，现有「保存到 Skill 商店」按钮语义变化，确认接受。

---

## 8. 实施记录（2026-10-15，P0 + P1 已落地）

用户拍板：**P0 + P1 一起做，不影响其他任务**。本节记录实际改动与偏差。

### 8.1 改动清单

| 层 | 文件 | 内容 |
|---|---|---|
| 表结构 | `packages/core/src/db/schema.ts`、`apps/server/src/db.ts` | 新增 `skill_draft` 表 + `idx_skill_draft_user` 索引（两处 DDL 同步，`CREATE TABLE IF NOT EXISTS` 幂等，旧库零破坏） |
| 服务端 | `apps/server/src/routes/skill-drafts.ts`（新增） | GET 列表 / GET 详情 / POST / PATCH / DELETE，`authMiddleware` + `user_id OR 'guest'` 归属过滤；JSON 字段逐条安全解析（坏数据只降级自己） |
| 服务端 | `apps/server/src/index.ts` | 挂载 `app.use('/api/skill-drafts', skillDraftRoutes)` |
| 类型 | `packages/shared/src/types/index.ts` | 新增 `SkillOverview`（nameZh/slug/description/inputs/steps/outputs/triggers）与 `SkillDraftStatus` |
| store | `packages/ui/src/stores/distill.ts` | ① tasks 从内存 ref 改 DB 草稿（`loadTasks/persistTask`，走 `api` client 带鉴权）；② 两段式 `generateOverview()` / `distillFromOverview()`；③ `autoFilter()` 噪消息打标（只对候选消息分批、每批 ≤50）；④ `updateOverview/updateResultMd/saveMdAsDraft/publishDraft`；⑤ `SkillOverview ↔ SKILL.md` 互转与逐字段校验 |
| 视图 | `packages/ui/src/views/SkillDistill.vue` | 顶部 4 步流程引导条；左屏 AI 自动过滤 + 撤销（气泡样式纯 CSS 改造，勾选与三态权限档保留）；中屏「技能概览」表单（AI 生成 → 手改 → 保存修正 → AI 提炼技能）；右屏 Body 渲染预览 / 原文编辑双视图（markdown-it）+「存为草稿 / 发布为正式技能」 |
| 测试 | `apps/server/test/skill-drafts.test.ts`（新增） | 表列齐全 / JSON 字段写入读回 / 状态推进 / 路由可加载 |

### 8.2 相对方案的偏差（有意为之）

1. **概览表单没有拆成独立组件**（原 P1-8 计划拆三个子组件）：改为在 `SkillDistill.vue` 内直接实现，
   避免一次性大重构带来的回归面；后续需要时再拆。
2. **`DistillDialog.vue`（聊天弹窗）未改动**（原 P2-12）：作为「一键直通」的轻量路径保持不变，
   不引入概览阶段，避免影响聊天内既有交互。
3. **`nameZh` 不进 `frontmatter_json`**：改为**发布时用中文名作为 skill 显示名**（本仓 `skill.name`
   本就支持中文，内置技能如「网站自动化任务」即中文名），避免为此加列；英文标识 slug 保留在
   SKILL.md 的 front-matter `name` 里。
4. **气泡回放用纯 CSS 实现**（用户右 / 助手左 + 圆角气泡底色），未重构左屏 DOM 结构，
   勾选与三态权限档（normal/required/excluded）行为完全不变。
5. **「去调试」（原 P2-10）未实现**：试跑需要先确认复用桌面/移动端哪个会话创建接口（方案 §6 风险 7），
   仍按 P2 待办。

### 8.3 验证

- `packages/ui`：`vue-tsc --noEmit` 零错误；`vitest run` **60 文件 / 850 用例全过**（5 skipped）。
- `apps/server`：`tsc --noEmit` 零错误；新增守卫测试 3 用例全过；既有 skill 相关测试
  （`project-skills` / `novel-tuiwen-skill`）与 db 迁移测试（`agent-max-tokens-migration`）全过。
- **未做**：桌面端真机点击验证（本机未启动应用）——上线前建议手工过一遍
  「勾选消息 → AI 生成概览 → 改概览 → AI 提炼 → 编辑 Body → 存为草稿 → 刷新页面看草稿是否还在 → 发布」。

### 8.4 P2 待办（未做；改动点已探明，新会话可直接开工）

> 现状：P0 + P1 已交付并验证（见 8.3）。**第 12、13 项已于当天交付（见 8.5）**；
> 以下第 10、11 项**代码未动**。

#### 10. 去调试（试跑）

- **目标**：草稿「去调试」→ 建临时会话并挂载该技能 → 预填一条测试 prompt → 跑完回蒸馏页迭代。
- **已探明的事实**：
  - 会话创建入口唯一：`packages/ui/src/stores/chat.ts:1251`
    `createConversation(title, { platformId, modelId, skillIds, spaceId, agentId, taskType })`；
    挂载落 `conversation.skill_ids_json`（第 1291/1294 行）。
  - **技能挂载只认 `skill` 表的 id**（`chat.ts:1542-1586` 合并 `agent.skillIds` 与 `conv.skillIds`）——
    **草稿不在 `skill` 表里，所以不能直接挂**。这是本项的核心待决问题，二选一：
    - **方案 A（推荐）**：调试前先落一条 skill 行（`skillStore.createCustom`），`category='调试'` 或名字前缀
      「[调试]」，挂载后进聊天；调试满意再走「发布为正式技能」，不满意则 `uninstall` 掉。语义直白，零新机制。
    - **方案 B**：不建 skill 行，把 SKILL.md 正文注入临时会话的 `systemPrompt`。不污染技能库，
      但"调试的不是真正的挂载路径"，验证价值打折。
- **注意**：`apps/desktop` 与 `apps/mobile` 共用 `packages/ui` 的 chat store，**不存在双写风险**（原方案 §6 风险 7 可关闭）。

#### 11. 「交付内容」tab（任务过程 vs 交付物分流）

- 数据已具备：`conversation_file` 表有 `category`（`upload` / `intermediate` / `deliverable`），
  见 `packages/core/src/db/schema.ts` 的 `conversation_file`。
- 左屏把当前「任务记录」列表加 tab：`任务处理过程` / `交付内容`，后者按 `category='deliverable'` 过滤。
- **建议**：先看 P1 上线后是否有真实诉求，再动手（本项优先级最低）。

#### 12. `DistillDialog` 加「存为草稿」（✅ 已交付，见 8.5）

- 文件：`packages/ui/src/components/DistillDialog.vue`（当前 300 行级，轻量路径）。
- 加一个按钮，调 `distillStore.saveMdAsDraft(result)`（已实现，见 8.1）。
- **不要**在弹窗里加概览阶段——它是「一键直通」的轻量入口，保持轻。

#### 13. 服务端自动蒸馏写入 `skill_draft` 表（✅ 已交付，见 8.5）

- 现状：`apps/server/src/services/skill-distill.ts` 的 `proposeSkillDraft()` 只落盘
  `<root>/.yan-zhi/skill-drafts/<slug>/SKILL.md`（**不进库**，UI 看不到）。
- 调用点：`apps/server/src/llm-task-manager.ts:6319-6334`（同一 `✅步骤` 第 2 次成功时触发，
  `r.deduped && r.entryCount === 2`），随后用 `skillDraftNotifyText()` 发会话内轻提示。
- 改法：`proposeSkillDraft()` 成功后**额外 INSERT 一行 `skill_draft`**
  （`user_id` 取自调用方 `task.userId`，`title`=技能名，`status='draft'`，`result_md`=完整 SKILL.md 正文，
  `source_conv_id`=对话 id），让自动草稿与手动草稿汇入同一个「草稿列表」。
- 注意：`skill_draft` 是**服务端 `db.ts` 与 core `schema.ts` 双份 DDL**，改字段要两处同步。
- 顺带：`skillDraftNotifyText()` 的文案可指向蒸馏工作台（现在是提示用户手动移目录）。

### 8.5 P2-12 / P2-13 实施记录（2026-10-15 当天补做）

按 §8.4 原计划实施，未偏离方案；额外抽了一处共用写入原语（见偏差 1）。

| 项 | 层 | 文件 | 内容 |
|---|---|---|---|
| 13 | 服务端 | `apps/server/src/services/skill-draft-store.ts`（**新增**） | `insertSkillDraft()` —— `skill_draft` 表**唯一 INSERT 入口**，字段收敛规则与原路由 POST 完全一致；返回落库后的行 |
| 13 | 服务端 | `apps/server/src/routes/skill-drafts.ts` | POST 的内联 INSERT 改走共用原语，`uuid` 依赖随之移除（行为不变） |
| 13 | 服务端 | `apps/server/src/services/skill-distill.ts` | ① `SkillDraftResult` 增 `resultMd`（完整 SKILL.md 正文），落盘与返回同一份文本；② `skillDraftNotifyText()` 文案从「手动移入 `.yan-zhi/skills/`」改为指向「Skill 蒸馏」页的草稿列表 → 发布为正式技能 |
| 13 | 服务端 | `apps/server/src/llm-task-manager.ts` | `proposeSkillDraft` 成功后（`ok && !existed && resultMd`）额外落一行 `skill_draft`：`user_id`=`task.userId`、`title`=技能名、`status='draft'`、`source_conv_id`=`task.conversationId`。**单独 try/catch**：落库失败不得连带吞掉会话内提示（此时 SKILL.md 文件已写成功） |
| 12 | 前端 | `packages/ui/src/components/DistillDialog.vue` | 结果区新增「存为草稿」按钮（`DocumentAdd` 图标，`savingDraft` loading），调 `distillStore.saveMdAsDraft(md, parseSkillMd(md).name)` 后关闭弹窗；**未**引入概览阶段，弹窗保持「一键直通」轻量 |
| 12 | 前端 | `packages/ui/src/stores/distill.ts` | `saveMdAsDraft()` 严格化：`persistTask` 是刻意 fail-safe 的（失败不抛），原先"没落库"也照样返回 id，调用方一律报「已存为草稿」——**假成功**（下次进页面 `loadTasks` 从服务端重建列表，草稿凭空消失且零提示）。改为未落库即抛错，并清掉内存里的幻影任务 |
| 测试 | 服务端 | `apps/server/test/skill-distill-auto-draft.test.ts`（新增） | 5 用例：落库字段与默认值（含 epoch 毫秒时间戳）/ `status` 缺省=`overview` / 草稿列表查得到 / `skillDraftNotifyText` 三态 / 调用点接线（`userId: task.userId`、排除 `existed`） |
| 测试 | 前端 | `packages/ui/src/components/distillDialogSaveDraft.test.ts`（新增） | 5 用例：按钮绑 `saveDraft` / 走 `saveMdAsDraft` 而非 `saveMdAsSkill` / `DocumentAdd` 已 import / **弹窗不得混入概览阶段** |
| 测试 | 前端 | `packages/ui/src/stores/distillDraftPersistence.test.ts`（新增） | 3 用例：成功路径返回服务端 id / 服务端不可达（返回 `{error,status:0}` 错误信封**而非抛错**，连调用方 catch 都进不去的那条路）→ 抛错且不留幻影 / 5xx 抛错同理 |

**相对方案的偏差（有意为之）**

1. **抽出 `skill-draft-store.ts` 而非在调用点直接 `db.prepare`**：`skill_draft` 是 core `schema.ts` 与
   服务端 `db.ts` 双份 DDL，两处写路径（HTTP 路由 / 后台自动蒸馏）若各写各的列清单，列名一漂移就
   静默写空——两条路径都是 fail-safe 的，线上表现为「草稿悄无声息没落库」。收口后只有一份 INSERT。
2. **`existed` 分支不落库**：磁盘上已有同名草稿时 `proposeSkillDraft` 提前返回，此时也不再写库，
   否则草稿列表里会堆同名重复项。
3. **文案不再暴露磁盘路径**：`.yan-zhi/skill-drafts/<slug>/SKILL.md` 是内部实现细节，用户无从操作；
   改为直接指向「Skill 蒸馏」页（手动蒸馏与自动蒸馏现在汇入同一个列表）。
4. **「存为草稿」不沿用 store 的 fail-safe 语义**：`persistTask` 对持久化失败刻意不抛（蒸馏/概览等
   调用点的内存态还在，体验连续）。但「存为草稿」的**唯一**产出就是那一行落库，沿用同一语义只会
   制造假成功 → 故 `saveMdAsDraft()` 单独严格化（未落库即抛错 + 清幻影）。
5. **已知边界（本次不修）**：自动草稿的落库判据沿用 `existed`（=磁盘同名目录），文件与 DB 行是
   两个独立状态，理论上可漂移（文件在、行不在）。实际**不可达**：触发条件是"同一步骤**恰好第 2 次**
   成功"（`entryCount === 2`），一次性，之后计数只增不重触发——不存在"下次再补一行"的机会，
   也就没有重复插入或自愈的需求。真要收口得让判据去查 DB，超出本次范围。

**验证**

- `packages/ui`：`vue-tsc --noEmit` 零错误；`vitest run --no-file-parallelism` **62 文件 / 858 用例全过**
  （5 skipped）。★ 默认并行模式下 `multi-session-send` / `queue-inject-idempotency` / `childWindow`
  这 3 个**计时敏感**用例会误报（本机同时有另一个 `apps/server` 的 vitest 与 IDE 的 vitest explorer
  在跑，`collect` 从 10s 涨到 85s）——串行跑即全绿，与本轮改动无关，验证时以串行为准。
- `apps/server`：`tsc --noEmit` 零错误；新增守卫 5 用例全过；受影响面（`llm-task-manager` 的全部引用方
  + 技能/db 迁移，共 17 文件 / 167 用例）全过。
- **顺带修复一处既有红测试**（非本次引入）：`packages/ui/src/composables/fileWriteAndPreviewFix.test.ts`
  的「调用点必须把 artifactDirs 算好传进去」用裸串 `indexOf("registry.has(toolName)")` 定位，先命中
  了它上面的**取反守卫** `if (!registry.has(toolName)) {`；同工作区「导航跑偏」那批改动在 `executeTool`
  里插入了并发批次判定后，固定 3000 字符窗口够不到产物目录块，断言误报。已改为锚定完整分支头
  `if (registry.has(toolName)) {`（HEAD 与本工作区均验证：窗口内 `resolveArtifactDirFor(` 恰为 3 处）。
- **未做**：桌面端真机点击验证（本机未启动应用）。上线前建议手工过一遍
  「聊天里勾选消息 → 蒸馏 → 存为草稿 → 到「Skill 蒸馏」页看到该草稿 → 发布」，
  以及自动链路的「同一步骤第 2 次成功 → 会话内提示 → 草稿列表出现自动草稿」。


