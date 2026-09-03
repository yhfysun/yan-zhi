# 设计：多数据源 + 本体(text2sql 语义层) + 数据查询分析智能体

> 方案阶段，仅设计不动代码。本文按现状架构给出落点（文件路径均基于本仓真实结构）。

## 0. 设计原则（对齐业界 + 现状约束）

| 业界共识 | 本方案采用 |
|---|---|
| 不要让 LLM 裸写 SQL（准确率低、不可控、无法治理） | **Text2Semantic2SQL**：LLM 只产受控查询 DSL，确定性引擎翻译成受限 SQL |
| 表是平面的，业务语义立体；需把 schema 转成业务对象 | **本体(Ontology)**：可复用语义对象 = 来源SQL + 选择器 + 过滤器 |
| Schema Linking 是 text2sql 第一道关（选对表~40%误差来源） | 用「本体检索 RAG」只把相关本体喂给 LLM，不喂全库几百张表 DDL |
| SQL 需治理(只读/LIMIT/隔离) | 引擎统一强制 SELECT、单数据源隔离、行数/超时上限、可审计 |
| 数据 Agent = 意图→语义→计划→查询→结果解释 | 复用现有 ReAct agent + skill 链编排 |
| 数据→洞察→报告是一条链 | 本体数据分析 skill + 报告生成 skill 逐级叠加 |

**现状架构硬约束（决定了落点）**
- server 是唯一数据源、`better-sqlite3` 单例 `data.db`（`db.ts:1,953`）；全平台 guest token 免登录走 Server-Api。
- Web 浏览器端无 shell、跑不了 python/db 驱动 → **所有 DB 连接与 SQL 执行必须在 server 进程内**；python 分析仅桌面/服务端可用，Web 端查询仍可用（SQL 在 server 执行）。
- 工具两条暴露通道：① 前端把 tools/schema 显式 POST /llm/tasks；② 后端兜底 `buildToolsForBackend`。后端直查类工具走 `api_*`（`mcp/api-tool-executor.ts` 的 SUPPORTED_API_TOOLS + switch 分派）。
- skill 是 markdown 指令文本，挂载后注入 system prompt「Skill 流程指引」(截 2000 字)；file_write 写 deliverable 自动落 conversation_file。
- 智能体 seed 在 server `db.ts:565` 与 core `schema.ts` 双份，加智能体必须两处同步。
- 内置浏览器 BrowserView 仅桌面且禁用户侧提示；本项目功能与它无关，但 DataResultPanel 挂右栏需按现有 PreviewTabKind 多 tab 机制扩展。

## 1. 整体架构

```
三端 UI (web/desktop/mobile) ──HTTP──▶ server(Express) ──► SQL 执行/元数据/翻译引擎(services)
   │  DataSources/Ontology/DataConsole 管理页                     │
   │  Chat + 数据智能体(ReAct) ──/llm/tasks──▶                     ▼
   │                                       data_source 连接池(内存)
   │                                       ├─ MySQL (mysql2)
   │                                       ├─ PostgreSQL (pg)
   │                                       ├─ 达梦 DM (dm 驱动/ODBC)
   │                                       ├─ Oracle (oracledb)
   │                                       ├─ SQLite (better-sqlite3)
   │                                       ├─ 内置项目库 data.db (better-sqlite3 单例)
   │                                       ├─ CSV (解析为内存表)
   │                                       └─ HTTP-JSON API 数据源(只读)
```

数据查询闭环：
```
自然语言问题
  → 本体检索 RAG (api_ontology_search: 命中相关本体)
  → LLM 依本体描述产 查询DSL(选择器/过滤器)   [只"问语义"，不碰物理表/join]
  → 翻译引擎 依本体.schema_sql 确定性拼装受限 SQL (SELECT + 自动join + WHERE + LIMIT)
  → 执行(只读、超时、行上限) → 列+行返回
  → 前端 markdown 表 / 右栏 DataResultPanel(翻页)
  → (可选) 挂 本体数据分析 skill: 对结果 python(pandas)/聚合 → 洞察文本 + 图表(图片/html)
  → (可选) 挂 报告生成 skill: 把洞察写 docx/xlsx 交付(file_write category=deliverable)
```

## 2. 数据模型（新增表，写入 db.ts 与 core/schema.ts 双份）

### data_source 数据源
```sql
CREATE TABLE data_source (
  id TEXT PRIMARY KEY,            -- ds_<shortid>
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,             -- 业务名
  type TEXT NOT NULL,             -- mysql|postgres|dm|oracle|sqlite|project|csv|http
  host TEXT, port INTEGER, database TEXT,      -- 关系型连接
  username TEXT, password_enc TEXT,            -- 密码 AES 加密存储(复用 saved_password 类似方案)
  file_path TEXT,                              -- sqlite/csv 本地路径(相对 server data dir / 绝对)
  url TEXT, auth_type TEXT,                    -- http json 数据源
  options_json TEXT DEFAULT '{}',              -- 驱动参数(schema、ssl、charset、maxRows、timeout)
  read_only INTEGER DEFAULT 1,                 -- 默认只读
  enabled INTEGER DEFAULT 1,
  project_ds INTEGER DEFAULT 0,                -- 是否内置项目库(不可删/改 type)
  last_sync_at INTEGER, created_at INTEGER, updated_at INTEGER
);
```
- 内置一条 `project` 类型数据源指向 server `data.db`(复用 `db.ts` 的 DB_PATH，只读/直连)，id 固定如 `ds_project_<userId>`（幂等 ensure，参照 agnes 平台 ensure 模式）。
- 密码加密：复用现有加密工具(搜 crypto 工具或 saved_password 逻辑)；不落明文。
- **连接池**：仅存「配置」，实际连接懒建缓存于 `services/connector.ts` 内存 Map（id→pool/connection），server 重启失效需重连(每请求可重连)。

### ontology 本体
```sql
CREATE TABLE ontology (
  id TEXT PRIMARY KEY,            -- on_<shortid>
  user_id TEXT NOT NULL,
  data_source_id TEXT NOT NULL,   -- 归属数据源
  code TEXT NOT NULL,             -- 业务唯一标识,如 user,order,user_order_stat
  name TEXT NOT NULL,             -- 中文业务名:用户/订单/用户订单汇总
  description TEXT,               -- 业务语义描述(喂给 LLM 主文本)
  source_sql TEXT NOT NULL,       -- 物理来源 SQL(单表或多表 join 子查询),引擎 FROM 用它
  default_limit INTEGER DEFAULT 200,
  filters_json TEXT DEFAULT '[]', -- 过滤器定义(见下)
  selectors_json TEXT DEFAULT '[]',-- 选择器/字段定义(见下)
  props_json TEXT DEFAULT '{}',   -- 扩展属性(域/标签/敏感级/别名/说明)
  enabled INTEGER DEFAULT 1,
  builtin INTEGER DEFAULT 0,      -- 自动本体(扫表生成)标记
  created_at INTEGER, updated_at INTEGER,
  UNIQUE(data_source_id, code)
);
```

**选择器 selector**（可 select 的字段 + 度量），元素结构：
```jsonc
{
  "name": "user_id",        // 业务字段名(可不同于物理列)
  "type": "dimension|measure",  // 维度(直接列) 或 度量(聚合)
  "sqlExpr": "u.id",        // 物理表达式(列名或聚合:COUNT(DISTINCT o.id))
  "agg": null,              // 仅 measure: SUM/COUNT/AVG/MIN/MAX/COUNT_DISTINCT
  "dataType": "string|number|date|bool",
  "displayName": "用户ID", "unit": "", "desc": "",
  "selectable": true
}
```
**过滤器 filter**（WHERE 候选），元素结构：
```jsonc
{
  "name": "status",
  "displayName": "状态", "desc": "",
  "sqlExpr": "o.status",
  "operators": ["=","!=","IN","LIKE",">=","<=","BETWEEN"], // 允许比较符
  "valueSource": "free|enum|date|daterange",  // 值来源
  "enumValues": [],      // 若是枚举给候选
  "required": false,     // 必填过滤
  "default": null        // 默认过滤值(如 排除已删除 is_deleted=0)
}
```

### ontology 使用方式（LLM 视角）
- LLM 不直接写 SQL、不感知 `source_sql` 与 join；只见：
  - 本体 `code/name/description`（这是选本体依据）
  - 选择器清单 `name/type/displayName/unit`（这是"能问什么字段/指标"）
  - 过滤器清单 `name/displayName/operators/enumValues`（这是"能怎么筛"）
- LLM 输出**查询 DSL**（函数调用/文本模式均可）：
  ```jsonc
  { "ontologyCode": "order", "selectors": [{"n":"order_date","agg":"month"},
      {"n":"pay_amount","agg":"SUM"}],
    "filters": [{"n":"region","op":"=","v":"华东"}],
    "orderBy": [{"n":"pay_amount","dir":"desc"}], "limit": 50 }
  ```
- 引擎 `translateDsl`：`SELECT <selectors[agg]> FROM (<source_sql>) __s WHERE <filters> GROUP BY <dimension selectors> [HAVING measure>=N] ORDER BY ... LIMIT <default|指定>`。WHERE 用 `__s.<expr>` 前缀防列歧义。**绝不把用户/LLM 的自由 SQL 拼进本体**。

### （自动本体生成）
启动/手动点「同步表结构」：扫项目库 INFORMATION_SCHEMA 等价物(better-sqlite3 用 `PRAGMA table_info` + 读 sqlite_master / 列注释) 与外部库(库的 information_schema/系统视图，按驱动实现)，对每张表生成 `builtin=1` 本体：
- `code = 表名`, `name = 表中文注释或表名`, `source_sql = SELECT * FROM 表`
- 每个可读列 → 一个 `type=dimension` selector + 一个 measure 版(数值列)，注释进 `desc/displayName`
- 若无法取注释(外部库权限不够)则用列名，供用户后续手工改。

## 3. 数据源驱动适配层（services/connector.ts）

统一接口：
```ts
interface Connector {
  test(): Promise<void>;
  getSchema(): Promise<{ tables: {name, comment?, columns:{name,type,comment?,pk}[]}[] }>;
  query(sql: string, opts:{maxRows,timeout}): Promise<{columns, rows, truncated}>;
  /* 仅 read_only=0 且显式授权才提供 */
  executeWrite?(sql: string): Promise<{affectedRows}>;
  close(): Promise<void>;
}
```
实现：
- mysql → `mysql2/promise`(池)；postgres → `pg`(池)；sqlite/项目库 → `better-sqlite3`(open 只读 `:memory:`? 不，sqlite 用 `new Database(path,{readonly:true})`)；dm → dm JDBC 兼容驱动(社区 node 驱动或经 ODBC 桥，纳入"驱动能力探测"，未装驱动时报可读安装指引)；oracle → `oracledb`；csv → 解析为 `:memory:` better-sqlite3 表或直接内存数组；http → fetch + 断言 JSON → 表化。
- **只读强制**：对非只读连接，用 `maxRows` 兜底 + 语句白名单校验(仅允许以 SELECT/WITH/EXPLAIN 开头，禁止多语句注入一次执行多条) 已是够强护栏；SQL 控制台允许显式开写时才对 read_only=0 的数据源放行并逐条执行。
- **依赖安装**：mysql2/pg/oracledb 等是 server 的 dependencies（桌面打包打进 asar 需要时再评估体积）。驱动缺失 → 返回可读错误 + 安装提示（对齐 python_exec 找不到 python 时的提示风格）。

## 4. 新增后端直查 API 工具（复用 api_* 通道）

在 `mcp/api-tool-executor.ts` SUPPORTED_API_TOOLS 增加并在 switch 实现，保证前后端 buildToolsForBackend / 前端 chat.ts buildTools 都能暴露（它们把 `api_*` 默认加进 function calling）：

| 工具 | 作用 |
|---|---|
| `api_datasource_list` | 列可用数据源(id/name/type)，供 LLM 选数据源 |
| `api_ontology_search(query)` | 本体检索 RAG：按文本/embedding 命中相关本体(code/name/description + 简要选择器/过滤器清单)；可选 dataSourceId 过滤 |
| `api_ontology_list` | 列某数据源全部本体(供同步/管理，含内置自动本体) |
| `api_data_query(dslOrPayload)` | 按 DSL 查一个本体；返回 `{columns, rows, count?, truncated}`(行数默认 cap,如 500)。它是数据智能体主查询入口 |
| `api_data_query_sql(dataSourceId, sql)` | 高级/控制台同款：对一个数据源执行只读 SELECT(仅桌面/服务端或需授权；限制行/超时)。供会写 SQL 的用户/agent 用，也供 SQL 控制台复用 |
| `api_data_paginate(token|params)` | 对超大结果翻页(offset/keyset) |

文本模式下行数太多会撑爆上下文 → api_data_query 结果 >N 行只回"前 N 行 + total + 提示可翻页/让 python 分析"，避免刷屏。

## 5. 管理页（前端，全部走 server）

### 5.1 DataSources 数据源管理
- SettingsDrawer 新增 section `data-sources`(图标+label「数据源」)+ 异步视图 `views/DataSources.vue`；可选 `/data-sources` 路由。
- 列表(固定顶部筛选、列表独立滚动，符合 UI 规范)：名称/类型/连接串(脱敏)/只读/状态/最近同步 + 操作(编辑/删除/测试连接/同步表结构)。
- 新建/编辑弹窗：类型下拉(mysql/pg/dm/oracle/sqlite/project(仅内置)/csv/http) 按类型切换表单字段；密码输入 + 显示「已加密存储」；「测试连接」按钮调 `/api/datasources/test`。
- 内置项目库卡片：只读，展示将自动生成本体的表数量，可点「重新同步本体」。

### 5.2 OntologyManage 本体管理
- SettingsDrawer 新增 section `ontology` + 视图 `views/OntologyManage.vue`；可选路由 `/ontology`。
- 左侧本体树(按数据源分组) + 右上搜索/筛选(顶部固定)；右侧两栏：**语义定义**(code/name/description/来源数据源/自动同步开启) + **技术映射**(source_sql 编辑器 + 选择器表格 + 过滤器表格)。
- 选择器表格列：业务名/类型(维度|度量)/聚合/物理表达式/数据类型/显示名/单位/说明。
- 过滤器表格列：业务名/物理表达式/允许比较符/值来源/枚举值/必填/默认。
- 底部「预览」：实时用当前 source_sql + 一条示例 DSL 跑一次，看翻译出的 SQL 与结果(闭环校验)。
- 自动本体默认 `builtin=1`，可改为自定义(改 description/选择器后 builtin 自动置 0，防止同步覆盖)。

### 5.3 DataConsole SQL 控制台
- 视图 `views/DataConsole.vue`，进 SettingsDrawer(「SQL 控制台」) 或 `/data-console`。简单数据库连接工具：
  - 左上：数据源下拉 + 「测试」；点开树显示该库表/字段(供提示)。
  - 编辑区：可多行 SQL；支持一次粘贴多条(以 `;`/`GO` 分隔识别，服务端逐条 `POST /api/sql-console/run` 或本地拆分多条发 `/run`，逐条展示结果 Tab)。
  - 「执行」：选中文本则只执行选中段，否则执行光标所在/全部；只读数据源默认拦截非 SELECT(或提示切只读)。
  - 结果：每条一个结果 Tab（列 + 行表格，el-table，行数>1000 分页/截断提示，导出 CSV）。
  - 快捷键：Ctrl/Cmd+Enter 执行；Ctrl/Cmd+Shift+Enter 执行全部。
- 该页为内部工具页，属用户主动使用，非 Agent 触发；只读默认。

## 6. 数据查询分析智能体 + 能力链

### 6.1 内置智能体 seed（server db.ts seedAgents + core schema.ts 同步）
```
id: 'a_builtin_data_agent'
name: 数据查询分析专家
description: 查询数据库/项目数据(自然语言)、过滤、翻页、聚合、python 分析、产出报告
type: harness
builtin_tool_ids: 默认工具 + api_datasource_list/api_ontology_search/api_data_query/api_data_paginate
skill_ids: [skill_data_analysis]        // 本体数据分析 skill(默认挂)
system_prompt: 见下
```
system_prompt 要点：只读、必须经本体或限定数据源、查询先 api_ontology_search 再 api_data_query、结果 >cap 时提示翻页/聚合/交 python 分析、能用 markdown 表格/CSV 呈现、需要图表或深入分析时按 skill_data_analysis 走、出报告时按报告 skill 走并落 deliverable。加 `is_public=1` + 归属 guest + 幂等 upsert(参照现有 upsert 逻辑)。

### 6.2 新增/复用的 Skill
- 新增 `skill_data_analysis`「本体数据分析」(seed 加一条，body 为 markdown 指令)：描述当拿到查询结果后如何做——转 CSV/写临时表、用 python_exec(pandas/matplotlib) 做聚合/趋势/分组、输出图表(保存 png/html 并可交付)、对结论用 markdown 结构化输出；强调结果来自 api_data_query、区分事实与推断、单位/时间口径。
- 报告生成能力 = 复用 `skill_docx_processing`/`skill_xlsx_data_processing` + 建议新增 `skill_report_doc`「数据报告生成」：把分析结论 + 图表 + 表格 组织成一份 docx/xlsx 报告，用 python-docx/openpyxl 生成并 file_write 成 `category=deliverable`。这样「查询展示(本体+skill_data_analysis) → 加报告 skill → 出 doc 报告」正好符合用户要求的两级叠加。

### 6.3 前端交互
- 新会话：ChatInputArea 智能体下拉选「数据查询分析专家」(现有 agent 下拉机制，无需新入口)。
- 结果展示：
  1. 聊天消息：api_data_query 结果由 agent 以 markdown 表格回(现有 markdown-it table)。补一个轻量 `.msg-content table` 样式使其可读(现无该样式)。
  2. 右栏 DataResultPanel：新 PreviewTabKind `data`；store.openTab({kind:'data', name:本体名, rows, columns, total})；ChatPreviewPane.vue 加分支(图标/标题/内容)，显示分页表格 + 导出 CSV + 「把当前结果喂回聊天做进一步分析」按钮。挂本体数据分析 skill 后可点「python 分析」把结果交 python_exec。
  3. 报告/图表交付走现有 DeliverableFileCard(点击 file_write 产物在 FilePreview 打开)。

## 7. Server 新增 REST（管理页/控制台用）
```
POST   /api/datasources                创建(密码加密)
GET    /api/datasources                列表(密码脱敏)
PATCH  /api/datasources/:id            更新
DELETE /api/datasources/:id            删除(级联 ontology)
POST   /api/datasources/test           测试连接
POST   /api/datasources/:id/sync-schema  扫表→生成自动本体
GET    /api/datasources/:id/schema     取表/字段(控制台提示用)
GET    /api/ontologies                 列表(可按 dataSourceId/code 搜)
POST   /api/ontologies                 创建/导入
PATCH  /api/ontologies/:id             更新(含选择器/过滤器/source_sql)
DELETE /api/ontologies/:id
POST   /api/ontologies/:id/preview     用示例 DSL 试跑→返回翻译 SQL + 结果
POST   /api/sql-console/run            控制台执行(body: dataSourceId, sql, readOnly=true)
POST   /api/ontology/search            管理页/agent 共用检索(也可走 api_ontology_search)
```
都需 user_id 鉴权；guest 默认也有(单用户桌面场景)。

## 8. 分阶段落地（每阶段可独立验收）

**P1 数据源底座**：data_source 表 + connector 池(mysql/pg/sqlite/项目库) + DataSources 管理页 + test/schema；内置项目库数据源。
**P2 SQL 控制台**：/api/sql-console/run + DataConsole.vue(选数据源/表提示/多条执行/结果表/只读护栏)。
**P3 本体管理 + 翻译引擎**：ontology 表 + CRUD + 选择器/过滤器 UI + 自动本体同步(项目库全表) + translateDsl + preview。CSV/达梦/Oracle/http 接入放此期或 P1.5。
**P4 数据智能体 + skill 链**：api_ontology_search/api_data_query/api_data_paginate/api_datasource_list + 内置 a_builtin_data_agent + skill_data_analysis + skill_report_doc + 右栏 DataResultPanel + markdown 表格样式。
**P5 打磨**：文本模式降级兼容本地模型、embedding 本体检索(可选接 ollama-embed)、行数/超时上限细化、分页 keyset、错误中文化。

## 9. 风险与对策
- **驱动/网络**：外部库受网络/驱动影响大 → 全走 server、连接池、超时可控；驱动缺失给安装提示(high，P1 就覆盖)。
- **SQL 注入/误写**：只读护栏 + 单语句校验 + 行/超时 cap + read_only 默认开 (high，贯穿)。
- **DM/Oracle 驱动体积与桌面打包**：驱动依赖进 server，可能增大 asar；DM 若走 ODBC 依赖系统组件 → 提供能力探测，缺失时可读提示 (medium)。
- **本体质量决定 text2sql 上限**：内置自动本体只是表级(粗)；真业务口径需人工把多表 join 建成一个语义本体 + description 写细 (high，靠 UI 引导 + 文档)。
- **上下文爆炸**：api_data_query 结果 cap + 聚合引导；本体系谱精简喂 (medium)。
- **三端差异**：python 分析仅桌面/服务端；Web 端查询可用但 python 图表不可用 → UI 在 Web 端隐藏需 shell 的分析按钮并提示 (low)。
- **seed 双份漂移**：agent/skill 改动两处 (server db.ts + core schema.ts) 同步 (medium)。

## 10. 备注（用户原始诉求 → 方案映射）
- 「mysql/pg/dm/oracle/当前项目库/sqlite等主流 + 非关系型」 → data_source 类型含 mysql/postgres/dm/oracle/sqlite/project + csv(文件) + http(JSON)；非关系型如 MongoDB/Redis 列为后续类型扩展点(本版先 CSV/HTTP 顶替"非关系"诉求，MongoDB 可在 connector 接口加一种驱动)。
- 「本体=一条查询sql(可表/数据量/多表联合) 抽象成 code/名称/描述/过滤器/选择器/属性」 → ontology 表即此；source_sql 支撑任意子查询/多表；选择器/过滤器即用户说的选择器/过滤器；props 承载属性。
- 「内置当前项目数据源和所有表本体信息」 → ds_project 数据源 + 自动本体同步全表。
- 「内置项目数据查询智能体：问库数据、过滤器筛选、翻页、python 分析」 → a_builtin_data_agent + api_data_query/paginate + skill_data_analysis(python)。
- 「数据源要有控制台执行SQL看结果，选SQL执行/多条都支持」 → DataConsole + /api/sql-console/run。
- 「智能体挂本体；有本体数据分析 skill；再挂报告生成 skill 出 doc」 → 挂载沿用现有 agent.builtin_tool_ids/skill_ids(本体=api_ontology_*工具+本体系谱)；skill_data_analysis(本体数据分析)；skill_report_doc/skill_docx_processing(报告生成 docx)。
