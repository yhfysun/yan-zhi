# 数据查询增强：校验闭环 × 交互图表 × 看板 × 原生 Word 导出 方案

> 状态：方案（v2，2026-10-26 修订）
> 对标来源：`agentscope-java` 的 `agentscope-examples/agents/agentscope-dataagent`（HarnessAgent + 沙箱 + skill/subagent + marketplace）、`QwenPaw-Data`
> 关联文档：`docs/数据查询-本体语义层与QueryContract融合-方案.md`

## 0. v2 修订说明

v1 把 AgentScope 的数据查询当成「一套 SKILL.md 方法论 + matplotlib」，判断偏浅。实际它是一个完整的**数据智能体运行时**：Spring Boot WebFlux + HarnessAgent + 每用户文件系统叠加 + 沙箱 + 子智能体 + 技能市场 + 分布式状态。

但结论要分两层看：

- **平台层**（多租户、沙箱生命周期、Redis 分布式、技能市场、IM 通道）：复杂度极高，**不适合搬到我们的 Electron 单机/小团队形态**。
- **取数层**（schema 发现、SQL 校验、失败重试、探查子智能体、产物化）：**这才是值得抄的**，而且我们目前恰好缺其中三块。

同时要纠正一个误判：**我们的语义层工具面比它更强**。它有 `list_data_sources / describe_table`（v1 还是接口桩），我们是 `api_ontology_overview/brief/detail/values + api_data_query(contract=true) + api_data_paginate`，字段口径、过滤器、关联、行级策略都由本体声明，模型无法幻觉字段。这块不需要学它。

## 1. AgentScope 的 SQL 链路到底复杂在哪

| 层 | 它怎么做 | 证据 |
|---|---|---|
| 1. 运行时 | HarnessAgent + SandboxFilesystem；每 `(user, agent)` 一套文件系统叠加层；脚本在独立沙箱执行 | dataagent README 架构图 |
| 2. 工具面 | `list_data_sources` / `describe_table` / `run_sql_preview` / `render_chart`，通过 `DataSourceRegistry`、`ChartRenderer` SPI 插真实实现 | `docs/agent-definition.md` |
| 3. 语义发现 | 先看 `knowledge/` 里的 schema 笔记/数据字典/历史查询；找不到就**委派 `data-explorer` 子智能体**去探 | `sql-analysis` SKILL.md |
| 4. SQL 规约 | 问题重述成「指标 / 分组 / 时间窗 / 过滤」四要素；显式列名、禁 `SELECT *`、必须带时间窗、超两层嵌套用 CTE | 同上 |
| 5. 校验闭环 | 先 `run_sql_preview`，再看行数量级是否合理、分组列有无 NULL、至少一个数值对账；不对就改，最多重试 N 轮 | 同上 + 官方 LoopAgent 示例（生成 → 打分 → 循环到阈值） |
| 6. 产物化 | `render_chart` 出 PNG，脚本存档可复现；`report-writer` 子智能体把多图 + 结论 + 来源拼成报告 | `chart-rendering`、`data-report` skill |
| 7. 演进 | 每用户 memory + 可贡献 skill 到共享库，管理员审批后全租户可见 | README Marketplace 流程 |

**一句话**：它的「复杂」是**把模型的不确定性用工程手段收住**——先预览、再验证、失败重试、歧义委派、产物可复现。

## 2. 我们的现状：取数层已经更强，缺三块

| 能力 | 我们 | 结论 |
|---|---|---|
| 语义层 | 本体声明维度/时间维度/度量/过滤器/选择列/关联/行级策略；`contract=true` 强制按名引用 | **强于它**，不动 |
| 工具面 | overview/brief/detail/values + query + paginate + `js_exec` 里的 `dataQuery()` 桥 | **强于它**，不动 |
| SOP | `db.ts` 数据助手 seed 写得很细：工具结果即事实、禁编数字、过滤值必须先采样、失败最多 2 次 | 已有，缺「数值自检」 |
| 预览 | 没有。`api_data_query` 直接执行返回数据 | **缺** |
| 探查子智能体 | 明确禁止（`db.ts:2258`「你没有子智能体」） | **缺** |
| 图表/报告产物 | 只有 `data_query_view` 内嵌 UI；无 `render_chart`、无 report-writer | **缺** |
| 图表质量 | 手搓 SVG，3 种图、单系列 | 弱 |
| 看板 | 无 | 缺 |
| Word 导出 | 只有段落 + 图片 | 弱 |

## 3. 抄什么、不抄什么

### 抄（按性价比排序）

1. **校验闭环**：新增 `api_data_preview`（只编译 + 计数 + 抽样，不返回全量）+ 提示词强制「行数量级 / 分组列 NULL / 数值对账」三项自检。
2. **探查子智能体**：新增 `data-explorer` 子智能体，只在「本体不明确、需要跨多个本体比对」时委派，避免主上下文被探查过程污染。
3. **产物化**：新增 `render_chart` 工具（产出图片产物）+ `report-writer` 子智能体（产出 docx）。
4. **图表选型规则**：把 `chart-rendering` 的「问题形态 → 图种」映射写进图表默认选型与 skill。
5. **四要素重述**：并入现有 seed 提示词开头。

### 不抄

| 项 | 不抄的理由 |
|---|---|
| SandboxFilesystem / 容器生命周期 | 我们是 Electron 单机，`js_exec`/`python_exec` 已有沙箱口径 |
| Redis 分布式会话 / 多副本 | 单机 + 本地 SQLite 是产品定位 |
| 技能市场 + 管理员审批流 | 用户量级不匹配，现有 skill 表够用 |
| 每用户文件系统叠加层 | 已有工作空间目录模型 |
| DingTalk / webhook 通道 | 与本次无关 |
| matplotlib 出图 | 我们渲染端是 Chromium，直接 ECharts 更清晰、可交互、可复用 |

## 4. 目标架构

```
                         ┌──────────────────────────────┐
 用户提问 ──▶ 数据助手 ──▶│ api_ontology_*  （已有）      │
                         │ api_data_preview （新增）      │──▶ 编译 + COUNT + 抽样，不返回全量
                         │ api_data_query   （已有）      │
                         │ render_chart     （新增）      │──▶ ChartSpec 产物
                         └──────────────┬───────────────┘
                                        │ ChartSpec
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
           UI 渲染（ECharts）                     离线产物渲染
       DataQueryWorkbench / 内嵌看板           Electron 离屏窗口（无新原生依赖）
                    │                                       │
                    └──────────▶ PNG ──▶ report-docx ──▶ .docx
```

**关键决策**：图表统一用 `ChartSpec` 契约表达，**渲染放在 Chromium**（前端或 Electron 离屏窗口），不引入 matplotlib，也不给服务端加 `sharp`/canvas 原生依赖。

## 5. 分期与文件级改动

### P0：图表层 + PNG 导出（1–2 天）

1. 新增 `packages/ui/src/components/chat/DataChart.vue`
   - ECharts 按需引入（`echarts/core` + Line/Bar/Pie/Scatter + Grid/Tooltip/Legend/DataZoom + CanvasRenderer），动态 `import()`，不进首屏。
   - 对外暴露 `toPng(): string`。
2. 扩展 `apps/server/src/services/query-contract.ts` 的 `runAggregate`：

| 字段 | 说明 |
|---|---|
| `series?: string` | 第二维度，多系列 |
| `timeGrain?: TimeGrain` | 复用 `dialect.ts:30 dateTrunc`（六方言已实现） |
| `topN?: number` | 前 N + 「其他」，上限 50 |
| `orderBy?: 'measure' \| 'dim'` | 排序口径 |
| `percent?: boolean` | 返回占比 |

返回改为 `{ series: string[], points: { key, values[] }[], total, sql }`。安全不变量不变：白名单、`quoteIdent`、占位绑定、limit ≤ 500、series ≤ 20。

3. `DataQueryWorkbench.vue`：视图改为「表格 / 图表」，配置区（X、系列、度量、聚合、粒度、TopN、图种），工具栏加「导出 PNG / 导出 Word / 导出 Excel / 钉到看板」。

### P0.5：校验闭环（1 天，抄 AgentScope 最值钱的一块）

1. 新增工具 `api_data_preview`（`packages/core/src/tool/builtin/api-tools/data.ts` + `apps/server/src/mcp/api-tool-executor.ts`）：
   - 入参与 `api_data_query` 一致（ontology/intent/contract，或 sql）；
   - 服务端只做三件事：编译出 SQL → `SELECT COUNT(*)` → 抽样前 5 行看类型/空值；
   - 返回 `{ sql, total, sample, nullInGroupCols?, warnings }`，**不返回全量**；
   - 复用 `query-contract.ts` 的编译/白名单逻辑，不新开执行通道。
2. 提示词（`db.ts` 数据助手 seed）加三步硬要求：
   - 报数前必须 `api_data_preview`；
   - 行数量级与预期间量级不符（如预期 30 条日桶却返回 30000 条）先改查询；
   - 分组列出现 NULL 且非预期 → 先修正；
   - 至少一个数值对账（已知总数 / 参考值 / 合理区间）。
3. 失败重试沿用现有「最多 2 次」口径，不引入 LoopAgent 式的打分循环（本地模型成本划不来）。

### P1：探查子智能体（1–2 天）

- 新增 `data-explorer` 子智能体定义（走现有 agent 表 + 子智能体调用机制）：
  - 只挂本体检索类工具（overview/search/brief/detail/values），**不挂取数与写工具**；
  - 输入：指标定义 + 候选数据源；输出：推荐的 ontology code + 字段清单 + 不确定点；
  - 主助手仅在「无明确本体」或「需要跨本体比对」时调用。
- 解除 `db.ts:2258` 的「不要找子智能体」限制，改为「仅在探查阶段可调用 data-explorer」。

### P1：图表/报告产物（2–3 天）

1. `render_chart` 工具：入参 `ChartSpec`，服务端只校验与落盘 spec（不渲染），返回产物 id；渲染由前端或 Electron 离屏窗口完成，PNG 回写产物目录。
2. `report-docx`（新 `packages/ui/src/utils/report-docx.ts`）：
   - 依赖 `docx`（npm v9），支持 heading / table / image / header / footer；
   - `buildReportDocx({ title, subtitle, blocks })`，block 支持 heading / paragraph / table / image / pageBreak；
   - 图表用 `DataChart.toPng()` 的 dataURL 转 `ImageRun`，图注统一「图 N」、表注「表 N」。
3. `report-writer` 子智能体：输入若干 ChartSpec + 结论要点，输出 docx 产物（走同一 builder）。
4. 聊天正文导出（`ChatMessageList.vue:1291`）迁移到新 builder，补标题/表格映射；旧实现保留一个版本期。

### P1：看板（2–3 天）

表（`apps/server/src/db.ts`，沿用 `CREATE TABLE IF NOT EXISTS` + `ALTER ... try/catch` 风格）：

```sql
CREATE TABLE IF NOT EXISTS dashboard (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_widget (
  id TEXT PRIMARY KEY,
  dashboard_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,             -- chart | table | text
  title TEXT,
  contract_json TEXT NOT NULL,    -- DataTabContract
  chart_json TEXT,                -- ChartSpec
  pos_json TEXT NOT NULL,         -- { x, y, w, h }
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

API 新增 `apps/server/src/routes/dashboards.ts`（CRUD + widgets），全部强制 `user_id = req.user.userId`。
前端 `DashboardPanel.vue` + `stores/dashboard.ts`；布局用 `grid-layout-plus`；P1 只做手动刷新。

### P2：本体接入工作台（2 天）

- `DataTabContract` 增加 `mode: 'table' | 'base' | 'ontology'` 与 `ontology?: string`。
- `GET /api/query-contract/ontology/:ref` 复用 `buildOntologyContract()` 返回字段菜单。
- `POST /api/query-contract/ontology/run` 调 `runOntologyContract()`；先限 1000 行 + 前端分页。
- 工作台显示业务名（`columnsOf` 已映射），过滤按 name 引用，禁止自由 SQL。

### P2：Excel 多 sheet + 报告预览（2 天）

- 明细 + 聚合各一 sheet，走现有 `xlsx`/`exceljs`。
- `ReportTab.vue`：markdown + 图表快照，一键导出 docx。

## 6. 关键文件清单

| 文件 | 改动 |
|---|---|
| `packages/core/src/tool/builtin/api-tools/data.ts` | 新增 `api_data_preview`、`render_chart` 工具声明 |
| `apps/server/src/mcp/api-tool-executor.ts` | 两个新工具的执行分支 |
| `apps/server/src/db.ts` | 数据助手 SOP 增「预览 + 三项自检」；新增 dashboard 表；子智能体限制放开为「探查阶段可用」 |
| `apps/server/src/services/query-contract.ts` | `runAggregate` 扩展 series/grain/topN/percent；抽出 preview 复用编译逻辑 |
| `apps/server/src/routes/query-contract.ts` | 本体取数两个路由 |
| `apps/server/src/routes/dashboards.ts` | 新增 CRUD |
| `packages/ui/src/components/chat/DataChart.vue` | 新增，ECharts + `toPng()` |
| `packages/ui/src/components/chat/DataQueryWorkbench.vue` | 图表视图、导出、钉看板 |
| `packages/ui/src/utils/report-docx.ts` | 新增结构化 docx |
| `packages/ui/src/components/dashboard/DashboardPanel.vue` | 新增 |
| `packages/shared/src/types/index.ts` | `ChartSpec`、`DataTabContract` 扩展 |

## 7. 风险与回退

| 风险 | 应对 |
|---|---|
| ECharts 包体 | 按需 + 动态 import，首屏不加载；实测 gzip 增量 ≤ 200KB |
| 新增工具让模型多绕一步 | preview 只允许在 query 之前调一次；提示词写死调用顺序，避免原地打转 |
| 子智能体重回上下文爆炸 | data-explorer 只返回「推荐的 ontology code + 字段 + 不确定点」，不返回原始探查过程 |
| docx 兼容 | Office/WPS 各验一次；旧 `buildDocx` 保留一个版本期 |
| 聚合方言 | 只覆盖 project(sqlite)/mysql/postgres；dm/oracle 沿用现有拒绝口径 |
| 无 UI 场景产物 | 用 Electron 离屏窗口渲染，不给服务端加原生依赖；纯服务端部署时该能力降级为「只出 spec」 |
| 大结果集 | 明细导出上限 5 万行；聚合上限 500 点；preview 只做 COUNT + 5 行抽样 |

## 8. 验收标准

**P0**
- 多系列折线/柱、饼、散点可用，tooltip/图例/坐标轴正常；
- 时间粒度（日/周/月/季/年）在 sqlite 与 mysql 上 SQL 正确；
- 导出 PNG 在亮/暗主题下清晰（≥2x）。

**P0.5**
- `api_data_preview` 不返回全量数据，只返回 SQL、总数、抽样；
- 数据助手在报数前必定先 preview；人为构造「行数量级异常」的问题时，助手能先修正再回答。

**P1**
- 跨多个本体的模糊问题能委派 data-explorer 并拿到推荐本体；
- 3 图 + 1 表钉成看板，保存重开布局一致；
- 导出的 Word 含标题层级、表格、图表、图注，Office/WPS 无修复提示。

**P2**
- 工作台可选本体，维度/度量显示业务名；
- 全链路无自由 SQL 拼接（评审 + 单测各拦一次）。

## 9. 排期

| 阶段 | 内容 | 估时 |
|---|---|---|
| P0 | 图表层 + 聚合扩展 + PNG | 1–2 天 |
| P0.5 | 校验闭环（preview + 自检） | 1 天 |
| P1 | data-explorer + 图表/报告产物 | 3–5 天 |
| P1 | 看板 | 2–3 天 |
| P2 | 本体接 UI + Excel/报告预览 | 4 天 |
