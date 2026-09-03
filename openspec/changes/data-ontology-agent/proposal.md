# 为什么

言智当前只能查「自家 server 的 data.db」（业务硬编码 SQL），没有任何面向用户/智能体的数据查询能力：

- 无法接入外部数据库（MySQL / PostgreSQL / 达梦 DM / Oracle / SQLite 等），也没有关系型之外的数据源（CSV、API 等）。
- 没有「SQL 控制台」：没有一块能选中 SQL 执行、看结果、支持多条 SQL 的页面。
- 没有「本体」概念：无法把「一条查询 SQL / 一张表 / 多表联合查询」抽象成带 code / 名称 / 描述 / 过滤器 / 选择器 / 属性的可复用语义对象，因此做不了可靠的 text2sql。
- 没有「数据查询分析智能体」：无法用自然语言直接查库里数据、过滤、翻页、用 python 分析并图表化。
- 缺一条「数据 → 洞察 → 报告」的能力链：智能体挂了本体 + 数据分析 skill 就能查数展示，再挂报告生成 skill 就能把分析结果做成 doc 报告交付。

# 改什么

按「数据源 → 本体 → 控制台 → 智能体能力链」四条主线新增能力（全部服务端权威 + 三端可用的 Server-Api 架构）：

## 主线 A：多数据源管理（DataSource）
- 支持类型：MySQL / PostgreSQL / 达梦 DM / Oracle / SQLite / 当前项目库(内置 data.db) / CSV / 外部 HTTP-JSON(API) 数据源。
- 每条连接存 host/port/库名/用户名/密码(加密存)/驱动参数/超时/只读开关；带「测试连接」。
- 连接与查询全部收敛在 **server 进程内**（内存连接池），Web/桌面/移动三端只发 SQL 到 server 执行，避免浏览器端跑 DB 驱动的不可行。

## 主线 B：本体管理（Ontology，text2sql 语义层）
- 一个「本体」= 一个可复用语义对象，对应一段来源 SQL（可单表 / 多表 join / 任意子查询），并声明：
  - `code`(唯一标识)、`name`、`description`(业务语义，喂给 LLM)
  - `fields/选择器`(可 select 的字段/维度 + 度量聚合函数 + 业务名/类型/单位)
  - `filters/过滤器`(WHERE 候选：字段、比较符、值来源；可带默认/必填过滤)
  - `properties/属性`(扩展元数据：所属域、标签、敏感级、别名、说明)
  - `schema_sql`(物理映射 SQL 模板，LLM 不直接写 join，由引擎按选择器/过滤器确定性拼装)
  - 归属数据源；`enabled`；血缘/变更。
- 设计理念对齐业界 **Text2Semantic2SQL**：LLM 只「问业务语义」→ 输出受控的查询 DSL(选哪些选择器、套哪些过滤器) → 引擎把 DSL 翻译成受限 SQL(自动 join 来源 SQL、只读、强制 LIMIT、行数上限)，比让 LLM 裸写 SQL 准确且可控得多。
- 「内置当前项目数据源和所有表本体信息」：启动时自动扫描 data.db 全部表/列，为每张表生成一个「自动本体」（名称=表中文注释/表名，字段=列注释/列名，内置项目库一条数据源）。

## 主线 C：SQL 控制台（简单数据库连接工具页）
- 左侧：数据源树 + 表列表/字段提示；编辑器选中一段 SQL；执行看结果表格；支持一次粘贴多条 SQL 逐条执行；结果集分页/导出 CSV。
- 这是纯工具页（DataConsole），进 SettingsDrawer 或 /data-console 路由。

## 主线 D：数据查询分析智能体 + 能力链
- 内置智能体 `a_builtin_data_agent`(数据查询分析专家)：默认挂「SQL/本体查询」工具集 + 项目库全表本体，system_prompt 约束只读、强制 LIMIT、声明用哪个数据源/本体。
- 新增后端直查 API 工具（复用 api_* 通道）：`api_datasource_list` / `api_ontology_search|list`(本体检索，RAG 选本体) / `api_data_query`(按 DSL 或 SQL 查，返回列+行、限制行数/超时) / `api_data_paginate`。
- 复用既有能力链：查询结果给 LLM，需要分析时走已有 `python_exec` + 挂载 **本体数据分析 skill**(新增 `skill_data_analysis`)，出报告时挂 **报告生成 skill**(复用 skill_docx_processing / skill_xlsx_data_processing / skill_data_visualization / 新建 skill_report_doc)，交付走已有 `file_write`(category=deliverable) 链路。
- 结果在聊天里以 markdown 表格呈现，并支持把查询结果开进右栏 DataResultPanel(新 kind) 看表/翻页。

# 验收目标

- `npx openspec validate --all` 通过。
- 数据源页可新增 MySQL/PG/达梦/Oracle/SQLite 连接、测试连接；失败给出可读原因。
- SQL 控制台可执行单条/多条 SELECT，结果表格展示 + 分页；非只读语句(INSERT/UPDATE/DROP)默认拦截(仅显式开写才放行)。
- 内置「当前项目库」数据源 + 其全部表自动本体已生成；本体 CRUD(建 code/选择器/过滤器/属性) 可用。
- 新会话选「数据查询分析智能体」，用自然语言问项目库数据能返回正确结果(过滤/翻页正确)；
  挂本体数据分析 skill 后能做聚合/趋势/python 分析；再挂报告生成 skill 能产出 doc 报告并出现在交付物区。
- 三端可用（Web/桌面/移动至少查询路径可用）。

# 影响（方案落点文件清单，实施时再改）

- server 数据面：`apps/server/src/db.ts`(新增表)、`routes/`(datasources.ts / ontology.ts / sql-console.ts)、`services/`(connector 池/元数据/翻译引擎)、`mcp/api-tool-executor.ts`(新增 api_data_* 分派)、`db.ts` seed(数据智能体 + 本体数据分析/报告 skill)。
- core：`packages/core/src/db/schema.ts` 同构建表；`packages/core/src/tool` 若新增内置数据工具则注册。
- UI：`SettingsDrawer.vue` 加 section；新增 `views/DataSources.vue`、`views/OntologyManage.vue`、`views/DataConsole.vue`；`ChatPreviewPane.vue`/`stores/chat.ts` 加 data kind；可选 router 加路由。
- 内置 agent/skill seed 双份(server db.ts + core schema.ts)需同步。
- 桌面/web/mobile 因全部走 server，前端基本只加页面，无平台分支。
