# 任务清单（方案 v2：供评审，非实施清单）

> 用户要求「先出方案」。本 change 现为 **design.md(v1) + design-addendum.md(v2 修正) + spec + 本清单** 齐备、待评审状态。
> v2 修正了 v1 的 12 个 HIGH/MEDIUM 问题（缺关系层、别名 Bug、缺方言适配、缺时间维度/同义词/样本值、非关系型偷懒顶替、写操作含糊等），
> **冲突处以 design-addendum.md 为准**。评审通过后再逐项勾选。全部为服务端权威 + Server-Api，三端前端只加页面。

## P0 地基（v2 新增，后面一切依赖它）

- [ ] 0.1 `services/dialect.ts`：标识符引号 / 时间粒度 / 分页(offset+keyset) / TOP-N / 采样 五类，覆盖 mysql|postgres|dm|oracle|sqlite
- [ ] 0.2 本体保存校验器：解析 `source_sql` SELECT 列表 → 输出列必须有别名 → 选择器/过滤器 `expr` 必须在别名集合内，否则拒绝保存
- [ ] 0.3 `ontology` 表字段扩容：role/time_dimension/granularities/additive/synonyms/sample_values/ref_attr/sensitive/domain/policies/status(draft|published)/locked/enriched_by/confidence

## P1 数据源底座

- [ ] 1.1 db.ts + core/schema.ts 加 `data_source` 表；密码加密/脱敏工具
- [ ] 1.2 `services/connector.ts`：Connector 接口 + mysql2/pg/better-sqlite3(项目库/sqlite) 实现 + 连接池缓存（内部走 dialect.ts）
- [ ] 1.3 `routes/datasources.ts`：CRUD + test + schema；内置项目库数据源 ensure(id 稳定)
- [ ] 1.4 `views/DataSources.vue` + SettingsDrawer 加 `data-sources` section（可加路由）
- [ ] 1.5 dm/oracle connector + 驱动能力探测与安装提示

## P2 SQL 控制台 + 数据编辑

- [ ] 2.1 `routes/sql-console.ts`：/run 执行，只读校验 + 单语句校验 + maxRows/timeout
- [ ] 2.2 `views/DataConsole.vue`：数据源下拉 + 表/字段树 + 多行编辑 + 多语句逐条 + 结果多 Tab + 导出 CSV + Ctrl+Enter
- [ ] 2.3 **数据编辑（默认关闭）**：`data_edit_audit` 表 + 写权限开关（15min 自动关）+ 预检影响行数 + 二次确认 + 事务 + 审计（含变更前快照）
- [ ] 2.4 网格内编辑：结果集必须带主键，否则禁止；禁止 DDL / 无 WHERE 的 UPDATE·DELETE / 多语句

## P2.5 schema 同步升级为富化流水线（v2 新增）

- [ ] 2.5.1 确定性画像采集：类型/注释/基数/空值率/数值分布/日期范围/样本值 TOP-N
- [ ] 2.5.2 命名与分布启发式：推断角色+displayName 初值；低基数列标候选枚举
- [ ] 2.5.3 自动关系推断（外键 + 命名 + 值包含检验）→ 写 `ontology_relation(status=suggested)`
- [ ] 2.5.4 自动本体生成（每表一个，builtin=1，含样本值/候选枚举/同义词留空待富化）

## P3 本体管理（v2 大幅扩展）

- [ ] 3.1 db.ts/core 加 `ontology` / `std_attribute` / `ontology_relation` / `ontology_example` / `ontology_enrich_job` 表
- [ ] 3.2 `services/ontology.ts`：CRUD + YAML 导入导出（yaml 库）+ 编译校验
- [ ] 3.3 **翻译引擎 v2**：关系图最小连接子树(Steiner) → 按基数定 JOIN → 扇出检测 → 行级策略 → 过滤器 → 分组/HAVING/排序 → 方言化 LIMIT
- [ ] 3.4 **四个预览按钮**：预览定义(YAML+SQL+EXPLAIN+诊断) / 预览数据(裸跑前 N 行) / 试跑查询(DSL) / 发布影响面
- [ ] 3.5 `routes/ontologies.ts`：CRUD + yaml/import-yaml/compile/explain/preview-data/try-run/publish/impact
- [ ] 3.6 `views/OntologyManage.vue` + SettingsDrawer 加 `ontology` section：语义区 + 技术映射区 + 四按钮 + draft/published 态
- [ ] 3.7 **标准属性库**：`routes/std-attributes.ts` + CRUD + preview-sql + refresh；枚举三来源（手工/JSON、SQL 字典、DISTINCT 采样）；表格⇄JSON 双模式编辑
- [ ] 3.8 关系管理 UI：suggested 列表 → 确认/拒绝；关系图可视化（可选）

## P3.5 AI 富化（v2 新增）

- [ ] 3.5.1 L2 知识库检索接入：复用 knowledge_base + api_kb_search，命中片段作为依据并要求标注来源
- [ ] 3.5.2 L3 LLM 生成：few-shot exemplar（复用已有人写描述做相似检索）+ 严格 JSON 输出 + confidence
- [ ] 3.5.3 富化任务：`ontology_enrich_job` 后台任务 + 进度 + 批量采纳/丢弃草稿
- [ ] 3.5.4 `locked` 保护：人工确认字段永不被同步/富化覆盖；用户「业务术语表」优先级高于 AI

## P4 数据智能体 + skill 链

- [ ] 4.1 api-tool-executor.ts 加 api_datasource_list/api_ontology_search/api_ontology_list/api_data_query/api_data_paginate
- [ ] 4.2 喂给 LLM 的上下文改为**裁剪后的 YAML 片段**（分级：精简档/完整档；不含 source_sql 物理实现）
- [ ] 4.3 seedAgents 加 `a_builtin_data_agent`（server db.ts + core schema.ts 同步）
- [ ] 4.4 seed skills 加 `skill_data_analysis`「本体数据分析」、`skill_report_doc`「数据报告生成」
- [ ] 4.5 前端：chat.ts PreviewTabKind 加 `data`；ChatPreviewPane.vue 加 DataResultPanel 分支（分页表/导出/转分析）
- [ ] 4.6 `.msg-content table` markdown 表格样式；文件交付链路沿用
- [ ] 4.7 已验证问答沉淀：`ontology_example` 命中复用 + 用作 few-shot；L3 逻辑 SQL + dry-run + 结构化错误自纠（≤2 轮）

## P5 非关系型与打磨

- [ ] 5.1 文档型/键值型 connector（Mongo/ES）：采样推导弱 schema + 嵌套字段拍平为 `a.b.c`，仅投影/筛选
- [ ] 5.2 本地模型文本模式降级（DSL 走文本 [TOOL_CALL]）
- [ ] 5.3 行数/超时/翻页 keyset（必须唯一键兜底排序）；错误中文化
- [ ] 5.4 Web 端隐藏需 shell 的 python 分析按钮并提示
- [ ] 5.5 敏感列脱敏/禁止导出；本体健康度看板（描述覆盖率/缺样本值/缺同义词）
- [ ] 5.6 `npx openspec validate --all` + 三端查询/控制台回归截图
