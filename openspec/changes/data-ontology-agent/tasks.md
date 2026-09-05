# 任务清单（方案 v2 + UI 设计：供评审，非实施清单）

> 用户要求「先出方案」。本 change 现为 **design.md(v1) + design-addendum.md(v2 修正) + ui-design.md(UI 规范) + ui-prototype.html(高保真原型) + spec + 本清单** 齐备、待评审状态。
> v2 修正了 v1 的 12 个 HIGH/MEDIUM 问题（缺关系层、别名 Bug、缺方言适配、缺时间维度/同义词/样本值、非关系型偷懒顶替、写操作含糊等），
> **功能语义冲突以 design-addendum.md 为准；视觉与交互以 ui-design.md + ui-prototype.html 为准**。
> 评审通过后再逐项勾选。全部为服务端权威 + Server-Api，三端前端只加页面。

## P0 地基（v2 新增，后面一切依赖它）

- [x] 0.1 `services/dialect.ts`：标识符引号 / 时间粒度 / 分页(offset+keyset) / TOP-N / 采样 五类，覆盖 mysql|postgres|dm|oracle|sqlite
- [x] 0.2 本体保存校验器：解析 `source_sql` SELECT 列表 → 输出列必须有别名 → 选择器/过滤器 `expr` 必须在别名集合内，否则拒绝保存
- [ ] 0.3 `ontology` 表字段扩容：role/time_dimension/granularities/additive/synonyms/sample_values/ref_attr/sensitive/domain/policies/status(draft|published)/locked/enriched_by/confidence

## P1 数据源底座

- [ ] 1.1 db.ts + core/schema.ts 加 `data_source` 表；密码加密/脱敏工具
- [x] 1.2 `services/connector.ts`：Connector 接口 + mysql2/pg/better-sqlite3(项目库/sqlite) 实现 + 连接池缓存（内部走 dialect.ts）
- [x] 1.3 `routes/datasources.ts`：CRUD + test + schema；内置项目库数据源 ensure(id 稳定)
- [x] 1.4 `views/DataSourcesPage.vue` + SettingsDrawer 加 `data-sources` section（可加路由）
- [x] 1.5 dm/oracle connector（动态探测+安装指引，真实联调需本机装驱动） + 驱动能力探测与安装提示

## P2 SQL 控制台 + 数据编辑

- [x] 2.1 `routes/sql-console.ts`：/run 执行 + `services/sql-guard.ts` 只读护栏（DDL 一律拒/写引导走数据编辑/SET 等 admin 拒/EXPLAIN ANALYZE 写语句拦/字符串与注释不误伤）+ `@yan-zhi/shared` sql-text 切分器（两端共用）——冒烟 22/22
- [x] 2.2 `views/DataConsolePage.vue`：数据源下拉（默认项目库）+ schema 树（搜索/点列插入）+ 行号深色编辑器 + Ctrl+Enter 运行选中/光标语句 + Ctrl+Shift+Enter 全部 + 结果多 Tab（状态点/截断提示/出错即停标 skipped）+ 导出 CSV（BOM）+ 轻量格式化
- [ ] 2.3 **数据编辑（默认关闭）**：`data_edit_audit` 表 + 写权限开关（15min 自动关）+ 预检影响行数 + 二次确认 + 事务 + 审计（含变更前快照）
- [ ] 2.4 网格内编辑：结果集必须带主键，否则禁止；禁止 DDL / 无 WHERE 的 UPDATE·DELETE / 多语句

## P2.5 schema 同步升级为富化流水线（v2 新增）

- [ ] 2.5.1 确定性画像采集：类型/注释/基数/空值率/数值分布/日期范围/样本值 TOP-N
- [ ] 2.5.2 命名与分布启发式：推断角色+displayName 初值；低基数列标候选枚举
- [ ] 2.5.3 自动关系推断（外键 + 命名 + 值包含检验）→ 写 `ontology_relation(status=suggested)`
- [ ] 2.5.4 自动本体生成（每表一个，builtin=1，含样本值/候选枚举/同义词留空待富化）

## P3 本体管理（v2 大幅扩展）

- [x] 3.1 db.ts 加 `ontology` / `std_attribute` / `ontology_relation` / `ontology_example` / `ontology_enrich_job` 表
- [x] 3.2 `services/ontology.ts`：CRUD + YAML 导入导出（yaml 库）+ 编译校验
- [ ] 3.3 **翻译引擎 v2**（v1 单本体编译已落地 `ontology-compiler.ts`，跨本体 JOIN 待做）：关系图最小连接子树(Steiner) → 按基数定 JOIN → 扇出检测 → 行级策略 → 过滤器 → 分组/HAVING/排序 → 方言化 LIMIT
- [ ] 3.4 **四个预览按钮**：预览定义(YAML+SQL+EXPLAIN+诊断) / 预览数据(裸跑前 N 行) / 试跑查询(DSL) / 发布影响面
- [x] 3.5 `routes/ontologies.ts`：CRUD + yaml/import-yaml/compile/explain/preview-data/try-run/publish/impact
- [x] 3.6 `views/OntologyPage.vue` + SettingsDrawer 加 `ontology` section：语义区 + 技术映射区 + 四按钮 + draft/published 态
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

## P6 UI 设计落地（对齐 ui-design.md + ui-prototype.html）

- [ ] 6.1 `packages/ui/src/styles/data-workbench.css`：落地设计令牌（表面/状态/语义角色色/`--void*` 深色仪器面板/三字体角色），深色模式下 `--void*` 提亮以保住与背景的层级差
- [ ] 6.2 `CompileTrack.vue` 编译轨道组件（**全局可复用**的多阶段指示器，结构同步与 AI 富化流程复用同一语言）
- [ ] 6.3 `DataSourceList.vue` + `DataSourceForm.vue`：类型按语族分 3 组（分组标题写明 JOIN 能力差异）、四种连接态、**失败态错误码折叠诊断**、新建表单弱化为白底+左侧品牌竖线
- [ ] 6.4 `OntologyWorkbench.vue` 三栏骨架 + 5 子页签（带计数徽标）；语义页分「标识/语义/物理」三段，同义词改 chip 输入
- [ ] 6.5 `OntologyFieldTable.vue`：角色徽标 + 置信度列（<0.70 浅黄底且禁止发布）+ 锁图标（locked 不被同步覆盖）
- [ ] 6.6 `OntologyRelationMap.vue` SVG 关系图（不引图库）+ 关系表 + **扇出风险警示卡**
- [ ] 6.7 源文件态/派生产物视觉区分：YAML 用 `--void-2` + `源文件 · 可改`；编译 SQL 用 `--void` + `派生 · 只读`（防止用户改错地方）
- [ ] 6.8 **发布预检浮层**：口径 diff（+/−）+ 引用本体的智能体清单（受影响项玫红标注）+ 24h 回滚承诺 + 版本号；配套「N 处未保存改动 + 撤销」
- [ ] 6.9 `StdAttributeEditor.vue`：key/value/def/next 四列 + 同义词 + 语义分组；三种录入（表格⇄JSON 双模式 / SQL 取字典表预览映射 / DISTINCT 采样）+ 改动影响 N 个本体提示
- [ ] 6.10 `SqlConsole.vue`：schema 树 + 深色编辑器（选中段高亮、未选中灰化、`N 条语句 · 光标在第 M 条`）+ 常驻只读护栏徽标 + 键位标注 + 结果网格（NULL 弱化显示 / 耗时行数截断）
- [ ] 6.11 `DataResultPanel.vue` 注册为 `PreviewTab` 新 kind：本体来源标注 + 过滤器 chip 条 + 迷你趋势图 + 分页 + 底部「导出 CSV / Python 分析 / 生成报告」三出口
- [ ] 6.12 SettingsDrawer 新增 `data-sources` / `ontology` / `std-attribute` 三个 section（**不往 SideNav 平铺**，沿用 2026-09-03 精简约定）
- [ ] 6.13 中英混排标题字形断层：为中文标题单独声明 `PingFang SC` 600 字重
- [ ] 6.14 **零数据引导态**：本体数为 0 时中栏不显示空表单，改显示「从数据源同步 → AI 生成草稿 → 你只需复核」三步引导（对应 ui-design.md §5 开放问题 1）
- [ ] 6.15 无障碍与响应式：焦点环（`:focus-visible` 2px 品牌色）、表格键盘导航、<1280px 时标准属性 def 列换行策略
