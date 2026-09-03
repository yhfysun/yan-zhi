# data-ontology-agent Specification

## Purpose

定义「多数据源接入 + 本体(text2sql 语义层)管理 + 数据查询分析智能体能力链」的增量能力，供实施阶段对齐验收。当前为方案设计，落地时按此规格实现。

## ADDED Requirements

### Requirement: 多数据源管理(DataSource)

系统 SHALL 支持管理以下数据源类型：MySQL、PostgreSQL、达梦 DM、Oracle、SQLite、内置项目库(server data.db)、CSV、HTTP-JSON。每条连接记录 SHALL 含连接参数、加密存储的口令、默认只读标志与启用状态；系统 SHALL 提供「测试连接」能力并在失败时返回可读原因。所有数据库连接与 SQL 执行 SHALL 收敛于 server 进程内，三端不直接驱动外部数据库。

#### Scenario: 新增并测试一个 MySQL 连接
- **GIVEN** 用户填写 MySQL host/port/库名/账号/口令
- **WHEN** 用户点「测试连接」且参数正确
- **THEN** 返回连接成功；该数据源出现在数据源列表
- **AND** 若口令错误，返回含具体原因的错误，不写入无效连接

#### Scenario: 内置项目库数据源存在
- **GIVEN** server 首次启动
- **WHEN** 数据面初始化完成
- **THEN** 存在一条指向 server data.db、id 稳定的内置项目库数据源，且不可删除

### Requirement: SQL 控制台(DataConsole)

系统 SHALL 提供一个数据源控制台页面，支持选择数据源、查看其表/字段、选中一段 SQL 执行、查看结果表格，并支持一次粘贴多条 SQL 逐条执行且分别展示结果。系统 SHALL 对默认只读数据源拦截非 SELECT 语句，并对所有查询施加行数与超时上限。

#### Scenario: 执行单条与多条 SQL
- **GIVEN** 用户在编辑区粘贴一条或多条 SELECT SQL 并触发执行
- **WHEN** 选中文本则只执行选中段，否则执行全部
- **THEN** 每条结果以独立结果 Tab 展示(列+行)，超过行上限时截断并提示

#### Scenario: 默认只读拦截
- **GIVEN** 一个 read_only=1 的数据源
- **WHEN** 用户执行 INSERT/UPDATE/DELETE/DROP 等语句
- **THEN** 该语句被拦截并返回「该数据源只读」的提示

### Requirement: 本体管理(Ontology)

系统 SHALL 将「一条查询 SQL(可单表、可多表联合查询)」抽象为一个本体对象，字段含：code(业务唯一标识)、name、description、数据源归属、source_sql(物理映射 SQL 模板)、选择器(可 select 字段/度量及聚合)、过滤器(WHERE 候选与允许比较符)、扩展属性、启用状态。系统 SHALL 提供本体的增删改查与预览(用示例 DSL 试跑返回翻译 SQL 与结果)。

#### Scenario: 建一个多表联合查询本体
- **GIVEN** 用户为项目库定义一个「用户订单」本体，source_sql 为用户表 join 订单表
- **WHEN** 用户添加维度选择器(日期/地区)、度量选择器(SUM 支付金额)与过滤器(地区=华东)
- **THEN** 本体保存成功，code 在数据源内唯一；预览可翻译出受限 SELECT 并返回结果

### Requirement: 内置项目库全表本体信息

系统 SHALL 在项目库数据源启用时自动扫描其全部表并为每张表生成 builtin 自动本体(名称=表注释或表名、来源 SQL=SELECT * FROM 表、可读列映射为维度选择器)，供 text2sql 与数据智能体使用。自动本体被手工编辑后 SHALL 不再被后续同步覆盖。

#### Scenario: 同步表结构生成自动本体
- **GIVEN** 用户对内置项目库触发「同步表结构」
- **WHEN** 同步完成
- **THEN** 该库每张表都有对应 builtin 本体，可按 code/名称检索到

### Requirement: 数据查询采用 Text2Semantic2SQL

系统 SHALL 让 LLM 面向本体(选择器/过滤器/描述)产出受控查询 DSL，再由翻译引擎基于 source_sql 确定性拼装只读 SQL(自动 JOIN、WHERE、分组、LIMIT)；LLM 不得感知或拼装底层物理表连接。查询结果 SHALL 默认限制行数并可翻页。

#### Scenario: 自然语言转 DSL 转 SQL
- **GIVEN** 数据智能体已挂载项目库本体
- **WHEN** 用户问「华东地区订单按月支付金额」
- **THEN** 智能体选中 order 本体 → 产出含月份维度 + SUM(支付金额) 度量的 DSL → 引擎翻译成对 source_sql 的只读 SELECT 并执行成功

### Requirement: 数据查询分析智能体(内置)

系统 SHALL 内置一个「数据查询分析专家」智能体，默认挂载数据源/本体查询工具与本体系谱，并在 system prompt 中约束只读、先检索相关本体再查询、结果超限时引导聚合或转 python 分析。该智能体 SHALL 能过滤、翻页、并把查询结果用 markdown 表格呈现，可打开到右栏 DataResultPanel 分页浏览。

#### Scenario: 智能体问库数据并翻页
- **GIVEN** 用户新会话选择「数据查询分析专家」并问项目库某数据
- **WHEN** 智能体经 api_ontology_search 选中本体并调用 api_data_query
- **THEN** 返回正确过滤结果并以表格呈现；数据量大时可翻页

### Requirement: 数据智能体技能挂载链

系统 SHALL 提供「本体数据分析」skill(基于 python_exec/pandas 对查询结果做聚合、趋势、分组与图表)，并提供「数据报告生成」能力(复用/叠加 docx/xlsx 处理 skill，将分析结论与图表落成 deliverable 报告)。数据智能体 SHALL 可通过既有挂载机制(agent.skill_ids)叠加这些 skill，实现「查询展示 → 数据分析 → doc 报告」的逐级能力链。

#### Scenario: 挂载数据分析与报告 skill 生成 doc 报告
- **GIVEN** 数据智能体已挂载 skill_data_analysis 与报告生成 skill
- **WHEN** 用户要求对某查询结果做分析并生成一份报告
- **THEN** 智能体先用本体查询取数，再用 python(pandas) 分析并出图，最后把洞察写入 docx/xlsx 报告并以 deliverable 分类交付

#### Scenario: 只挂数据分析 skill 时可查询展示
- **GIVEN** 智能体仅挂载 skill_data_analysis 与本体查询工具
- **WHEN** 用户提出数据查询需求
- **THEN** 智能体完成取数与基础分析展示，但不会主动生成 doc 报告

## MODIFIED Requirements

### Requirement: 本体管理(Ontology)

系统 SHALL 将「一条查询 SQL(可单表、可多表联合查询)」抽象为一个本体对象。除 v1 字段(code/name/description/source_sql/选择器/过滤器/属性)外，SHALL 满足：

- 本体 `source_sql` 的每个输出列 **MUST** 具显式别名；选择器/过滤器的 `expr` 只能引用输出别名，系统 SHALL 在保存时校验并拒绝不合规定义（修正 v1 的 `__s.u.id` 别名 Bug）。
- 选择器 SHALL 区分 `dimension` / `time_dimension`（带粒度 day/week/month/quarter/year）/ `measure`；度量 SHALL 标记可加性（additive / semi_additive / non_additive），不可加度量禁止上卷求和。
- 选择器与过滤器 SHALL 支持 `synonyms[]` 与 `sample_values[]`。
- 本体 SHALL 有 `draft` / `published` 两态与 `domain` 归属；仅 published 本体对智能体可见。
- 过滤器 SHALL 支持相对时间（`last_7_days` / `this_month` / `last_month` 等），由引擎按方言解析。
- 本体 SHALL 支持行级强制策略 `policies`（用户不可绕过）与可覆盖的默认过滤区分开。

#### Scenario: 保存不合规本体被拦截
- **GIVEN** 用户为本体 source_sql 写了 `SELECT o.id FROM t_order o`（输出列无别名）
- **WHEN** 用户添加选择器 `expr: o.id` 并保存
- **THEN** 保存被拒绝，提示「输出列必须显式 AS 别名，选择器只能引用别名」

#### Scenario: 时间维度与相对时间
- **GIVEN** 本体含 `created_at` 时间维度（粒度 day/month）
- **WHEN** 用户问「上月订单量」
- **THEN** 引擎按目标库方言生成正确的月份表达式与相对时间区间，返回上月数据

### Requirement: 数据查询采用 Text2Semantic2SQL

系统 SHALL 让 LLM 面向本体产出受控查询 DSL（JSON），再由翻译引擎确定性地：选取涉及本体 → 在本体关系图上求最小连接子树 → 按声明的基数与 join 类型生成 JOIN → 套行级策略与过滤器 → 分组/排序/限流。**LLM SHALL NOT 生成 JOIN 或任何物理 SQL**。

- 当查询涉及两个及以上事实表的度量且连接路径存在一对多扇出时，系统 SHALL 拒绝执行并提示先建聚合本体。
- 同一查询 SHALL 只能落在单一数据源内；跨数据源需先建抽取型数据源。
- LLM 上下文 SHALL 使用裁剪后的 **YAML** 片段，且不得包含本体的 `source_sql` 物理实现。

#### Scenario: 跨本体关联查询自动 join
- **GIVEN** 存在 customer 与 order 两个本体，并已确认关系 `order.user_id → customer.id`（many_to_one）
- **WHEN** 用户问「华东区每个用户的订单数」
- **THEN** LLM 只输出「customer.name + order.order_count + region=华东」的 DSL；引擎依关系图自动拼 LEFT JOIN，结果正确

#### Scenario: 扇出被拦截
- **GIVEN** 用户问题同时涉及两个事实表的金额度量
- **WHEN** 引擎检测到连接路径存在扇出
- **THEN** 拒绝执行并返回「度量会重复计算，请先建聚合本体」的可读提示

## ADDED Requirements

### Requirement: 本体关系(Relation)与自动 JOIN

系统 SHALL 支持在同一数据源内声明本体之间的关系（左右本体、基数、join 类型、ON 条件），关系可由外键约束/命名启发式/值包含检验自动推断并置为 `suggested`，经人工确认后为 `confirmed`；仅 `confirmed` 关系参与自动 JOIN。

#### Scenario: 自动推断并确认关系
- **GIVEN** 同步表结构时检测到 `t_order.user_id` 值集合 ⊆ `t_user.id`
- **WHEN** 系统生成 suggested 关系
- **THEN** 用户在关系管理界面确认后，该关系参与后续自动 join

### Requirement: 标准属性(StdAttribute)与枚举字典

系统 SHALL 提供全局可复用的「标准属性」库，单个属性 SHALL 含：code、name、description、data_type、value_type(enum|state|boolean|range|hierarchy)、枚举项、语义分组。枚举项 SHALL 至少含 `key`(物理值)、`value`(展示值)、`def`(业务口径定义)，状态型枚举 SHALL 额外支持 `next`(允许的下一状态) 与 `synonyms`。本体字段 SHALL 可通过 `ref_attr` 引用标准属性，或引用并局部覆写。

枚举值 SHALL 支持三种录入来源：手工/JSON 粘贴、SQL 取字典表（可保存并一键刷新）、DISTINCT 采样。

#### Scenario: 用 SQL 录入并刷新枚举
- **GIVEN** 用户填写一条 SQL `SELECT dict_code AS key, dict_name AS value, remark AS def FROM sys_dict_item WHERE dict_type='order_status'`
- **WHEN** 用户点「预览映射」并确认入库
- **THEN** 标准属性 `order_status` 建立；后续点「刷新」时按同一 SQL 重新取数更新

#### Scenario: 引用标准属性的本体字段
- **GIVEN** 标准属性 `order_status` 已定义（含 key/value/def/next）
- **WHEN** 本体字段 `status` 设置 `ref_attr: order_status`
- **THEN** 该字段继承全部枚举与口径；修改标准属性时提示受影响的 N 个本体并可同步

### Requirement: SQL 方言适配

系统 SHALL 提供方言适配层，至少覆盖标识符引号、时间粒度截断/格式化、分页(offset/keyset)、TOP-N 限制、随机采样五类语法差异，覆盖 mysql / postgres / dm / oracle / sqlite。

### Requirement: 本体四类预览与数据编辑

系统 SHALL 在本体管理页提供四种互不相同的预览能力：
1. **预览定义**：不执行，返回 YAML 视图 + 编译后的物理 SQL + EXPLAIN 计划 + 校验诊断
2. **预览数据**：裸跑 `source_sql` 前 N 行（不套选择器/过滤器）
3. **试跑查询**：按当前选择器/过滤器/排序配置的完整 DSL 试跑
4. **发布影响面**：列出该本体改动会影响的已验证问答

系统 SHALL 另提供独立的数据编辑（写）能力：**默认完全关闭**，需数据源 writable 且用户显式开启（有时限自动关闭）。写操作 SHALL 经「预检影响行数 → 二次确认 → 事务执行 → 审计留痕（含变更前快照）」，并禁止 DDL、禁止无 WHERE 的 UPDATE/DELETE、禁止多语句。

### Requirement: AI 辅助本体富化

系统 SHALL 提供本体富化流水线，分三层：
1. **确定性画像**（不调用 LLM）：采集类型/注释/基数/空值率/数值分布/日期范围/样本值 TOP-N，按命名与分布启发式推断角色，低基数列标记为候选枚举
2. **知识库检索**：利用现有 knowledge_base 检索相关业务文档片段作为生成依据，并要求标注来源
3. **LLM 生成**：结合画像与知识库片段生成 displayName/description/synonyms/role/agg/枚举定义与置信度

AI 生成结果 SHALL 一律写入**草稿态**（`enriched_by=ai`），经人工逐项「采纳/编辑/丢弃」后生效；人工确认过的字段 SHALL 置 `locked` 且后续同步永不覆盖。

#### Scenario: 富化后人工审核
- **GIVEN** 用户对项目库某本体触发 AI 富化
- **WHEN** 富化完成
- **THEN** 生成结果以草稿态列出，低置信度项高亮；用户采纳后该字段 `enriched_by=human, locked=1`

### Requirement: 已验证问答(Verified Query)

系统 SHALL 支持为本体沉淀「问题 → 已验证 DSL/逻辑 SQL」的问答对，作为优先复用结果与 few-shot 样例；当 LLM 无法确定时，可退化为生成**逻辑 SQL**（仅引用本体 code 与字段 name，禁止物理表名/列名），经引擎逻辑名改写 + `dry-run` 校验 + 结构化错误自纠（最多 2 轮）后执行。

### Requirement: 非关系型数据源

系统 SHALL 支持文档型/键值型数据源（如 MongoDB / Elasticsearch）：以采样推导弱 schema，嵌套字段拍平为 `a.b.c` 形式的选择器，仅支持投影与筛选，不支持 JOIN 与聚合下推。
