# 数据查询分析看板 · 架构方向修正（QueryContract，非本体 DSL 中介）

> 性质：**架构方向修正方案**，先评审不动码。
> 目标读者：yhfy（需求来源）。评审通过后再拆 tasks 实施。
> 关联：本 change 重定义了 `openspec/changes/data-ontology-agent` 落地链路在「明细/看板」这条线上的实现路径；本体语义层是否废弃/降级，见 §6 取舍，需你拍板。

---

## §0 TL;DR（看懂你要什么 → 方案是什么）

你要的「动态看板 / 数据查询分析」正确时序是这样的（**分工边界已澄清**），我照此定方案：

**分工**：大模型只负责【一次性生成初始 SQL / 脚本】；一旦这个“模板”落地并被后端收束为可参数化的只读契约，**此后所有交互（筛选、翻页、换图表、再次取数）都不再调大模型**——纯由后端参数化执行 + 前端契约渲染完成。

1. **初始 SQL 由大模型生成**（这一步当然走模型）：你问「拉一下本周各渠道的订单明细，金额要能筛选」，LLM 把它翻译成一段**只读 SQL 模板/脚本**，并把想当过滤器的列、想怎么展示声明出来 → 产出 `QueryContract`。
2. **后端把模板收束成受控查询**：白名单校验（只读、单语句、参数白名单）→ 把模板编译成“带绑定点”的查询；此后只接收**运行时参数**（过滤器值/页码）。
3. **交互不复调 LLM，全走参数化执行**：页面上改过滤器 / 翻页 / 切表格·折线·饼·柱 → 前端**复用同一个后端端点**，携带新参数（绝非每次重新让 LLM 出 DSL）→ 后端参数绑定（绝不字符串拼）→ 返回一页/一个视图的 series。
4. **前端动态渲染**：chat 消息内嵌卡片读此契约 → 自动渲染各列过滤器（文本/下拉/日期/区间，按列类型与值）→ 用户筛选/翻页 → 结果在 表格 / 折线 / 饼图 / 柱状图 间切换。

一句话：**模型一次性生成“初始 SQL/脚本 + 过滤/分页/视图契约” → 后端固定地参数化绑定执行 → 前端契约化动态渲染。之后分页与过滤不再是模型动作，是纯 SQL 的事**。这消除了“太重”：不是每次筛选翻页都重新让 LLM 走一遍语义回溯。


**现状为什么“不对（太绕/太重）”**：当前 `data-ontology-agent` 落地为「先 `api_ontology_search` 召回本体 → LLM 产 DSL → `data-query.ts` 编辑器(ontology-compiler) 编译成受限 SQL」，链路预设了**必须有人把每张表/每个查询预建成“本体”**，明细/看板也绑死这套维护成本高的语义层——这正是你觉得重的来源。本方案把该链路拉直：能裸用 SQL 模板 + 参数下推的，不再经过本体语义资产。

---

## §1 现状核对（只列真实代码，不臆造）

| 项 | 现状 | 与本方案的关系 |
|---|---|---|
| 数据执行 | `apps/server/src/services/connector.ts` `Connector.query(sql,{maxRows,timeoutMs})` 已支持更好 sqlite/mysql/pg；回 `{columns,rows,rowCount,truncated,latencyMs}` | **复用**；需扩展一版“参数绑定”入口（见 §4） |
| 只读护栏 | `services/sql-guard.ts` `guardSqlConsole()`：只放行 SELECT/WITH/…，写/DDL/admin 全拦，多语句拆条 | **复用**；再加一层“模板编译期变量绑定校验” |
| 取数工具 | `packages/core/.../api-tools/data.ts` `api_data_query/api_data_paginate`（本体 DSL）与裸 `sql` 兜底 | SQL 兜底分支正是参数下推的基底，往上扩成 QueryContract 主路径 |
| 前端预览 | `packages/ui/src/stores/chat.ts` `PreviewTabKind = 'file'\|'browser'\|'git'`；`ChatPreviewPane.vue` 渲染 | **缺 `data` kind** → 本方案补“聊天内嵌可交互数据卡/右栏数据面板” |
| 图表库 | `packages/ui` 未引 echarts 等（无现成图表组件） | 需新增轻量图表渲染（见 §4 依赖评估），或借内嵌 HTML/SVG 通道 |
| 画布只读表 | `OntologyPage.vue` / OntologyManage 已提交 | 见 §6 取舍 |

结论：**数据执行/护栏/连接池是现成可用的，缺的是“参数化查询契约收发 + 前端动态过滤/分页/可切换图表卡”这一段**。这一段正是问题所在。

---

## §2 目标链路

```
你（聊天）: 拉“上周华东区每笔订单，含状态、金额、下单时间”
   │
   ▼
[LLM]  翻译 → 产出 QueryContract（JSON，见 §3）
   │      { sqlTemplate, columnsOfInterest?, filterDef, page, views:[{type:'table'|'line'|'bar'|'pie', ...}], datasourceId, limit }
   │
   ▼
[server /api/query-contract/run]（确定动作，不再走 LLM）
   ① guardSqlConsole：只读白名单、单语句
   ② compileTemplate：把 filterDef/分页绑定成下推参数（参数绑定，防注入）
   ③ getConnector(datasource).queryParam(sql, params) → 一页 {columns, rows, total?, filters sample}
   ④ 若带聚合视图(line/bar/pie)：同一模板上把“维度分组列”替换为聚合 SQL 出 series 数据
   │
   ▼
[前端 chat 内嵌交互卡 DataQueryCard]（读契约渲染，按需再请求）
   ① 顶部：动态过滤器行（依据契约.filterDef + 后端回的候选值；文本框/下拉/日期/数值区间）
   ② 主体：视图切换条 [表格|折线|饼|柱]（缺省按契约.views 第一个，可切）
       - 表格视图：el-table 分页（后端分页、页码/页大小）
       - 其它图：取该视图的 series API 渲染
   ③ 条件变化/翻页 → 重新 POST /run（同样的模板 + 新参数）
```

**模型工作量被压到最低 / 交互不复走 LLM**：

- 模型**只在查询一开始被调用一次**：产出“一条对口的只读 SQL（或一段取数脚本）+ 想把哪些列当过滤器 + 想怎么展示”。
- 契约一经生成注册（带 `contractId`），**同一次问答内的筛选/翻页/切图都不再经 LLM**——前端把“改后的过滤器参数 + 页码 + 视图名”直接 POST 给 `/api/query-contract/run`，后端用注册时的同一模板做参数绑定执行。
- 只有用户**换一个全新问法**（新语义、新表）才再让大模型产一份新契约。

---

## §3 QueryContract 契约草案（示例字段用占位名，不用真实业务数据）

模型在“要出数据卡”时才调用一个工具 `api_query_contract_make`，产出契约；或直接作为受控的 function call 参数。数据结构：

```jsonc
{
  "datasourceId": "__ds_id__",          // 可空=内置项目库；来自 api_datasource_list
  "sqlTemplate": "SELECT * FROM __T__ WHERE __where__ AND created_at >= __from__ AND created_at <= __to__",
      // 变量 = 供后端绑定替换的占位符；__where__ = 过滤器组合点
  "idExpr": "__pk_or_unique__",         // 缺省时后端从 columns 推断，供 keyset 稳定翻页
  "filters": [                          // 前端要渲染的列过滤定义（模型声明哪些可筛）
    { "name": "__status__", "label": "状态",
      "control": "multi-select",        // text|select|multi-select|date|date-range|number-range
      "sqlOperand": "__status_col__", "mode": "in", "candidatesFromSql": "SELECT DISTINCT __status_col__ FROM __T__" },
    { "name": "__amount__", "label": "金额",
      "control": "number-range", "sqlOperand": "__amount_col__", "mode": "between" }
  ],
  "page": { "size": 50, "default": 1 },
  "views": [                            // 可切换视图声明
    { "type": "table", "label": "明细" },
    { "type": "line",  "label": "趋势",  "x": "__dim_date__", "series": [{ "name": "订单量", "agg": "count" }] },
    { "type": "bar",   "label": "按状态", "x": "__status__",  "series": [{ "name": "金额合计", "agg": "sum", "field": "__amount_col__" }] },
    { "type": "pie",   "label": "渠道占比", "x": "__channel__", "measure": { "agg": "count" } }
  ]
}
```

要点：
- `filters` 决定“前端动态生成过滤器”；`page` 决定分页；`views` 决定“表格/图切换”。
- 后端**不执行模型给的自由 SQL**，而是把 `sqlTemplate` 与 `filterDef` 一起**编译成一张受控查询**并参数绑定。
- **聚合视图(line/bar/pie)不由前端猜**——模型声明 `x/agg/series`，后端据此在同一模板上生成聚合 SQL（GROUP BY x），前端只请求 series。

---

## §4 后端落点（真实文件，改动列表）

| 文件 | 改动 | 说明 |
|---|---|---|
| `apps/server/src/services/connector.ts` | 新增 `queryParam(sql, params, {maxRows,timeoutMs})` | **参数绑定执行**：MySQL `?`/PG `$1`/SQLite `?`，值经驱动转义，杜绝字符串拼接 |
| `apps/server/src/services/query-contract.ts`（新增） | `compileTemplate(sqlTemplate, filterParams, dialect)` → 生成绑定 SQL + 最终 param 数组；`buildAggQuery(contract.view)` → 聚合 series SQL | 模板编译的核心：把 filterDef+分页编译进 WHERE/LIMIT；只读白名单复用 sql-guard |
| `apps/server/src/services/query-contract.ts` | `run(userId, contract, runtimeParams)` | 编排：guard → compile → queryParam →（按需聚合）→ 返回 {table, series, filtersCandidates, total} |
| `apps/server/src/routes/query-contract.ts`（新增） | `POST /api/query-contract/run`、`POST /api/query-contract/run/:view` | 明细/翻页一次调用；切换视图二次调用取 series |
| `apps/server/src/routes/…`（注册） | 挂到 server | 三端只发契约与参数，执行全在 server（既定硬约束） |

## 复用 / 不重复造
- sql-guard、connector 池、dialect 分页已有 → 不新建另一套执行。
- `api_data_query` 的裸 `sql` 兜底路径存在，但那是“模型每调用填一条 SQL”；本方案把它从一次性调用升级为**可携带视图、可被前端反查的持久契约执行**。

## 前端落点
| 位置 | 改动 |
|---|---|
| `packages/ui/src/stores/chat.ts` | `PreviewTabKind` 增 `'data'`，`openTab` 支持 kind 'data' 存契约 id |
| `packages/ui/src/components/chat/DataQueryCard.vue`（新增） | 聊天消息内嵌卡：动态过滤器 + 视图切换条 + 表格分页 + 图 |
| `packages/ui/src/components/chat/ChatPreviewPane.vue` | 加 kind 'data' 分支（大屏数据面板，复用同一渲染核心） |
| 图表渲染 | 评估引入轻量体积可控方案：优先**内嵌 HTML/SVG 通道**（不引 echarts 重依赖），弱图表由内嵌浏览器或自绘折线/饼/柱渲染；必须引时选小包 |

## 消息侧
模型工具收尾调 `api_query_contract_make` 产契约并透传 `contractId` → 前端成功拿到卡。参考现有 git/file 卡把产物开进聊天回流路径（`DeliverableFileCard` 类似的触发点）。

---

## §5 安全（必须列进方案）

| 风险 | 对策 | 等级 |
|---|---|---|
| SQL 注入（模板占位符换值） | **一律驱动参数绑定**，禁字符串拼值；模板变量只允许白名单规则（见下） | 🔴 high |
| 模板被 LLM 乱写新语句 | `sqlTemplate` 编译前过 `guardSqlConsole`：只读白名单、单语句、拒 DDL/写/admin；把 `__where__`/LIMIT 的注入点白名单化 | 🔴 high |
| 聚合视图 SQL 由声明生成 | `x`/`field` 只允许取自有列（token 表驱动），不拼字符串进 GROUP BY/SELECT | 🔴 high |
| 行数/耗时失控 | 复用 `withRowCap` + timeoutMs 上限；分页默认小页（如 ≤200）；keyset 需唯一键兜底 | 🟠 medium |
| 前端误信视图导致渲染空集 | series API 返回空时给引导文案，不空 render | 🟡 low |

---

## §6 与既有“本体/DataScienceAgent 语义层”的取舍（需你拍板）

`data-ontology-agent` 已投入：ontology 表/CRUD/OntologyPage/compiler(单表)/多条 api_ontology_* 工具/内置项目数据源。本方向修正会改变它其中两条线的用途：

| 本方案选项 | 含义 | 若选它，对既有本体资产的动作 |
|---|---|---|
| **A. 本体降级为“已存查询/口径资产”**（推荐、最省） | 本体仍保留，但只当**预置好的参数化查询/宽表口径**供复用；明细/看板主链不要求人人提前建本体，可直接用 SQL 模板即问即得 | 不删本体；QueryContract 模板可直接“从一个已发布本体取 source_sql”作为其 sqlTemplate；本体不再作为每问必经的语义网关 |
| B. 彻底冻结 ontology 语义层开发 | 停掉 text2semantic2SQL 深化（跨表/关系/标准化 enrich 不再扩展），只留“登记表→可查询”最薄能力 | 冻结 P3.3~P4 深层 items；保留已用 CRUD |
| C. 维持 ontology 为全链路中枢 | 与用户“绕/重”判断相反，不予采纳 | 仅当用户改需求才考虑 |

> 建议先按 **A** 出可验收最小闭环（Model出契约→后端跑→前端卡展示过滤/分页/表格），聚合图(line/bar/pie)作为第二迭代，避免一次全铺。本体取舍另开一次决策，不与本闭环耦合。

---

## §7 分期建议（每期可验收）

| 期 | 内容 | 验收 |
|---|---|---|
| **Q1 契约底 + 明细表/过滤/分页** | connector.queryParam + query-contract.ts(compile+run) + route；chat.ts 加 kind 'data' + DataQueryCard（表格视图：动态过滤器+分页） | chat 里一句话出“可筛可翻页明细表”；过滤条件变化/翻页走同一后端 |
| **Q2 聚合视图切换** | query-contract buildAggQuery + DataQueryCard 视图条（折线/柱/饼）+ series API | 表/图一键切换，图数据由声明生成 |
| **Q3 收口与防注入加固、错误中文化** | keyset 稳定、模板越权拒绝、Web 端适配 | 三端截图回归 + `openspec validate` |

---

## §8 交付物建议
- 本 change 的 specs 细化（spec.md）+ tasks（分期清单）。
- Q1 可交付：模型「数据查询分析助理」的 system_prompt 收敛为“优先产 QueryContract”，弱化本体必经语义回溯。

---

## §9 实施现状（本会话内已落盘，评审用；见 git diff / 新增文件）

### 已实现（tsc / vue-tsc 对本改动零错误）
- 后端：
  - `apps/server/src/services/connector.ts`：Connector 增 `queryParam(sql, params, {maxRows,timeoutMs})`（sqlite/mysql/pg 真参数绑定；mysql/pg 不套 withRowCap 以免破坏占位符作用域；oracle/dm 抛可读错误）。
  - `apps/server/src/services/query-contract.ts`：`runContractQuery` = resolve(guard 只读单语句) → 探列白名单 → WHERE/ORDER 仅白名单列 + 值占位绑定(IN 展开) → LIMIT/OFFSET → COUNT 总数；支持 `sampleFilters`（对列 DISTINCT 顶N + kind 粗判）供前端动态渲染过滤器。`runAggregate` = 同 base 同过滤 GROUP BY dim（count/sum/avg/min/max）→ points。
  - `apps/server/src/routes/query-contract.ts`：POST /run、/aggregate；已挂载 `index.ts` `app.use('/api/query-contract',…)`。
- 前端：
  - `stores/chat.ts`：PreviewTabKind 增 `data`；PreviewTab.contract?/DataTabContract；openTab 对 data 单例覆盖契约；`dispatchToolCall` 拦截 `data_query_view` 经 `openDataViewFromArgs` openTab；兼容 computed rightPanelTab 类型放宽 PreviewTabKind。
  - `components/chat/DataQueryWorkbench.vue`：读契约 → 动态列过滤器(下拉候选/文本 fallback)+ el-table 分页(sortable/截断/总数) + 表格/折线/柱/饼(项目内联轻量 SVG, 无第三方) + 表/图只调后端参数化接口。
  - `components/chat/ChatPreviewPane.vue`：kind 'data' tab（Grid icon/body DataQueryWorkbench）+ 空态「数据浏览」入口（默认内置项目库 conversation + pinned 过滤演示）。

### 待实现 / 需要运行环境联调后才能验收的点（#5 的后半段）
- “数据智能体自动产标记段 → 前端检测开面板”尚未可靠打通：数据智能体推理循环跑在 **server**（llm-task-manager/api-tool-executor），server 进程无法直接 openTab。已采取的 FE 侧 `data_query_view` 拦截仅覆盖 FE 执行路径，不足以覆盖 server 驱动的子智能体。
- 下一步（需你在能起 server 的 Electron/dev 环境做）：
  1. 后端侧把 `data_query_view` 挂为数据智能体可调工具，执行时只返回“契约 JSON 段”，并内置默认 datasource/table 供从 schema 探得列；或
  2. 前端 `useChat` 监听后端流事件里该工具/契约段 → 调 `store.openTab({kind:'data', contract})`。
- 本机验证差距（真实约束，非接口问题）：本机裸 `node`(v22, ABI 127) 无法加载 better-sqlite3(ABI130)，server E2E 需要 Electron 内嵌 node/dev 运行（承接 172dadc 根因）。

### 验收路径（请在你的运行环境执行一次）
1. 左/右下「数据浏览」手动入口 → 出现 conversation 分页明细 + pinned 下拉过滤 + 切折线/柱/饼 → 证明面板+接口链路可用。
2. （#5）对一个可跑的助理提问触发 `data_query_view`，确认数据面板自动展开。

> 备注：若坚持“本体即资产/口径”价值，Q1 的最小闭环不依赖本体，但仍保留 A 的入口（自带 source_sql 的本体可作为 sqlTemplate 来源），两法不打架。
