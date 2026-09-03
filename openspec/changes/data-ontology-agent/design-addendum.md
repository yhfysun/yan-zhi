# 方案 v2 补充与修正：本体模型、连表查询、AI 富化、枚举/标准属性、YAML 组装

> 本文是 `design.md`（v1）的**修订补充**。v1 的大方向（Text2Semantic2SQL、本体语义层、server 内执行）不变；
> 本节修正 v1 中**设计不到位/有 bug/会踩坑**的点，并回答评审问题。凡与 v1 冲突处，**以本文为准**。

---

## 1. v1 方案 review：哪里不对劲

按严重度分级（high 必须改，medium 应当改，low 可后置）。

### HIGH（不改会出事或做不成）

| # | 问题 | v1 的做法 | 为什么不对 | v2 修正 |
|---|---|---|---|---|
| H1 | **缺少关系层（relationships）** | 一个本体 = 一段 `source_sql`，多表 join 靠人写死 | ① 跨本体关联问答做不了（"每个用户的订单数"要求 user×order，只能事先建宽表本体）；② join 逻辑散落在 SQL 文本里无法复用、无法被引擎优化；③ 业界（dbt MetricFlow / WrenAI MDL / Cortex Analyst / Snowflake Semantic View / LookML）**全部**是「实体 + 关系声明 → 引擎自动解析 join」，且明确建议 *"No surface SQL in metric YAML, joins are resolved by entity declarations"* | 新增 `ontology_relation` 表 + 关系图；引擎按查询涉及的实体求最小连接子树自动拼 JOIN（§3） |
| H2 | **选择器表达式的别名 Bug（真 bug）** | `selector.sqlExpr = "u.id"`，引擎拼 `SELECT __s.u.id FROM (source_sql) __s` | 子查询输出列名是 `id`（SQLite/MySQL）或 `ID`（Oracle 大写），`__s.u.id` **必然报错**；且 join 后列名歧义 | 强制：本体 `source_sql` 的每个输出列**必须显式 AS 别名**；选择器 `expr` 只能引用**别名**（裸标识符）；引擎用 `__s.<quote(alias)>`。保存时做校验：解析 SELECT 列表，无别名则报错 |
| H3 | **缺方言适配（dialect adapter）** | 写 `agg:"month"` 就完事 | 按月聚合在 MySQL 是 `DATE_FORMAT(x,'%Y-%m')`、SQLite 是 `strftime('%Y-%m',x)`、PG 是 `to_char(x,'YYYY-MM')`、Oracle 是 `TO_CHAR(x,'YYYY-MM')`、DM 又不同。SQL 控制台要连 5 种库，这一层不做就是空谈 | 新增 `dialect.ts`：把「时间粒度/分页/引号/限流/取样本」5 类语法按 type 分派，其余走 ANSI 通用 |
| H4 | **时间维度与相对时间缺位** | 只有 `dataType:"date"` | 时间是最常用维度，必须独立建模：粒度（日/周/月/季/年）+ 相对时间（最近 7 天/本月/上月/同比环比）。否则 "上月销售额" 每次都要 LLM 硬算日期 | 选择器增加 `role: time_dimension` + `granularities[]`；过滤器支持 `valueSource: relative_date`，引擎解析 `last_7_days` 等 token |
| H5 | **缺同义词 / 样本值** | 无 | 中文场景同义表达极多（营收/GMV/销售额/收入）；LLM 不知道 `status` 里存的是 `0/1/2` 还是 `'paid'`。这两项是业界公认**性价比最高**的准确率提升项（Cortex Analyst 的 `synonyms` + `sample_values` 是标配） | 选择器/过滤器增加 `synonyms[]`、`sampleValues[]`；样本值**自动采样**填充（§5 L1） |
| H6 | **非关系型被偷懒顶替** | 用 csv/http "顶替非关系型诉求" | 用户明确要非关系型（Mongo/ES/Redis）。文档型是弱 schema，必须单独设计采集方式 | 文档型：采样 N 条 → 推导嵌套结构 → 字段拍平成 `a.b.c` 选择器；只支持投影/筛选，不支持 join 与聚合下推（全量拉回内存聚合） |
| H7 | **数据编辑（写操作）含糊** | 一句 `read_only=0 显式授权` | 写库是不可逆操作，需要独立流程：影响行数预检 → 事务 → 二次确认 → 审计留痕。不能混在查询里 | 独立「数据编辑」能力（§2），四眼确认 + dry-run 影响行数 + 审计表 |

### MEDIUM（会显著影响可用性与准确率）

| # | 问题 | v2 修正 |
|---|---|---|
| M1 | 缺**已验证问答（verified_queries / few-shot）**：Cortex VQR 与 WrenAI 都证明这是提升准确率最有效手段之一 | 新增 `ontology_example`（question + 逻辑 SQL/DSL），命中相似问题优先复用；人工审核后可作 onboarding 示例 |
| M2 | 度量**不可加性**未标记：比率类度量（毛利率、客单价）跨维度 SUM 会算错 | 度量加 `additive: additive\|semi_additive\|non_additive`，非可加度量禁止上卷求和，只能重算（ratio metrics） |
| M3 | **Join 扇出（fan-out / chasm trap）**未防护：事实表×事实表直接 join 会让金额翻倍 | 关系声明 `cardinality`；引擎检测到「度量 + 多对多路径」时报错并要求先建聚合本体 |
| M4 | 缺**行级/列级治理**：v1 只有 filter 的 `default` | 拆成 `rowPolicy`（强制注入，用户不可绕过的行过滤）与 `defaultFilter`（可覆盖默认值）；列加 `sensitive` 标记 → 脱敏展示/禁止导出 |
| M5 | 本体**改动的血缘与影响面**缺失 | 改本体时列出受影响的示例问答/已保存查询，做影响面提示 |
| M6 | **draft/published 两态**缺失：边改边生效会让线上问答抖动 | 本体两态：草稿随便改 → 发布才对智能体可见 |
| M7 | **跨数据源联邦**不可能但没明说 | 明确：一次查询只能落在**单一数据源内**；跨源需先建"抽取型数据源"（定时同步到 SQLite） |
| M8 | 翻页需稳定排序未强调 | keyset 翻页必须有唯一键兜底排序，否则重复/漏行 |
| M9 | 上下文喂给 LLM 的形式未定 | 见 §7：YAML 片段（不是 JSON） |

### LOW
- L1 本体分组/域（domain/subject area）标签，便于检索裁剪。
- L2 本体健康度（描述覆盖率、样本值缺失、无同义词）看板。
- L3 查询结果缓存（同一 DSL + 数据源新鲜度）。

---

## 2. 五个概念厘清：本体编辑 / 数据编辑 / 本体预览 / 数据预览 / 本体数据预览

v1 把它们混成"底部一个预览按钮"，这是不对的。这是 **5 个不同动作**，落在 4 个按钮 + 1 个独立开关上：

| 概念 | 回答什么问题 | 是否执行 SQL | 产物 | 入口 |
|---|---|---|---|---|
| **本体编辑** | 这个业务对象的语义定义是什么 | 否 | 草稿态本体定义 | 本体管理页主表单（语义区 + 技术映射区） |
| **本体预览** | **定义被编译成什么**（给人和给 LLM 的东西长什么样） | 否（dry-run，最多 EXPLAIN） | ① YAML 视图 ② 编译出的物理 SQL ③ EXPLAIN 计划 ④ 校验诊断 | 按钮「预览定义」：三 Tab |
| **数据预览** | 这个本体**底下到底是什么数据**（裸数据，不带任何语义加工） | 是（受限） | 前 50 行原始列 + 行数 + 列空值率 | 按钮「预览数据」：`SELECT * FROM (source_sql) __s LIMIT 50` |
| **本体数据预览** | 用户按这个本体**问出来长什么样**（套上选择器/过滤器/排序） | 是（受限） | 完整 DSL 试跑结果（列=选择器，行=结果） | 按钮「试跑查询」：选几个选择器/过滤器 → 跑一次 |
| **数据编辑** | 改库里的**数据**（不是定义） | 是（写） | 影响行数 + 事务结果 | 独立能力，需显式开启（见下） |

### 数据编辑（写操作）独立流程
默认**完全关闭**。开启条件：数据源 `writable=1` **且**用户在会话中显式开启「数据编辑模式」（有时限，如 15 分钟自动关闭）。

1. 输入 SQL/在结果网格上直接改格 → 生成 `UPDATE/DELETE/INSERT`（网格编辑要求结果集带主键，否则禁止）。
2. **预检**：先 `SELECT COUNT(*)` 用同一 WHERE 求影响行数；> 阈值（默认 100）拒绝并要求收窄条件。
3. **二次确认弹窗**：展示将执行的 SQL + 影响行数 + 受影响表的行数占比。
4. **事务执行**：单语句 auto-commit；网格批量编辑走一个事务，失败全回滚。
5. **审计**：写 `data_edit_audit`（who/when/sql/rows/before 快照前 20 行），可回滚参考。
6. 禁止：`DROP/TRUNCATE/ALTER/GRANT`、无 WHERE 的 UPDATE/DELETE、多语句。

---

## 3. 大模型生成连表查询怎么办（H1 的正面回答）

**核心原则：不让大模型写 JOIN。** 分四档，按优先级降级使用：

### L0（默认，覆盖 ~80% 问题）：单本体 + 关系图自动 join
大模型只输出「**取哪些实体的哪些字段/度量 + 过滤条件 + 排序 + 分页**」，不输出任何 SQL、不输出 JOIN。

```
用户："华东区每个用户的订单数"
LLM → { entities:["customer","order"],
        select:[{entity:"customer",field:"name"},{entity:"order",measure:"order_count"}],
        filters:[{entity:"customer",field:"region",op:"=",value:"华东"}],
        groupBy:["customer.name"], orderBy:[{...}], limit:50 }
```
引擎做的事（确定性，非 LLM）：
1. **选本体**：按涉及实体取本体集合。
2. **求最小连接子树**：在 `ontology_relation` 无向图上，对涉及的实体集求 Steiner 树（实体数 ≤ 6 用精确/近似即可），得到 join 路径。
3. **定基数方向**：读关系的 `cardinality`（many_to_one / one_to_many / one_to_one），决定 JOIN 类型（事实→维用 LEFT JOIN，避免丢行）。
4. **拼 SQL**：`FROM <root> LEFT JOIN <rel> ON <on>`，ON 条件来自关系声明的 `leftKey/rightKey`（不是 LLM 给的字符串）。
5. **扇出检测**：若同一查询里出现两个**不同事实表**的度量且路径含一对多扇出 → 直接拒绝并提示"请先建聚合本体"（M3）。
6. 套行级策略 → 套用户过滤器 → GROUP BY 维度 → HAVING 度量阈值 → ORDER BY → LIMIT。

### L1：人工预建的"业务视图本体"（复杂/高频口径）
对确实复杂的口径（跨 5 表 + 窗口函数 + 业务口径），人工建 `source_sql` 的宽表/视图本体，配 `description` 写清楚"这个本体回答什么问题"。这是 v1 已有的能力，**保留但降级为 L1**（不是唯一手段）。

### L2：已验证问答（verified_queries / few-shot）
高频问题沉淀成 `ontology_example`：`question` + 已验证的 `dsl`（或逻辑 SQL）。
- 命中相似问题 → **直接复用已验证结果**（去重/相似度阈值），或作为 few-shot 样例喂给 LLM。
- 这是业界公认提升准确率最有效手段之一（Cortex VQR、WrenAI memory）。

### L3（兜底，受限）：逻辑 SQL + 自纠循环
仅对 L0~L2 都答不了的问题开放，且**必须**满足：
- LLM 写的是**逻辑 SQL**：只能引用本体 code（表别名写 `__<code>`）与本体的字段 name，**禁止出现任何物理表名/物理列名**。
- 引擎做逻辑名→物理名改写；改写失败或引用了未声明对象 → 返回**结构化错误**（"可用字段：a,b,c"），让 LLM 自纠，最多 2 轮。
- 改写完强制执行 `dry-run`（`EXPLAIN` / `LIMIT 0`）通过后才真跑（WrenAI 的 dry-plan → dry-run → structured error 三步法）。
- 仍只允许 SELECT/WITH，禁止 DDL/DML/多语句。

> 一句话：**JOIN 由关系图决定，不由大模型决定；大模型只决定"问什么"，不决定"怎么连"。**

### 补充：关系从哪来
1. **自动推断**（同步表结构时）：外键约束 + 命名启发式（`xxx_id` ↔ 表 `xxx` 的主键）+ 值包含检验（左侧 DISTINCT 值 ⊆ 右侧主键值）。置信度打分。
2. **AI 建议**（§5 L3）：LLM 结合字段描述/样本值建议关系与基数。
3. **人工确认**：自动/AI 建议一律入 `status='suggested'`，需人工确认才生效。

---

## 4. 连接三方库时，AI 能否自动填充本体与属性的业务描述？（H5 + 用户提问）

能，而且这是**必须做的**——否则"扫表生成自动本体"只是把物理 schema 换个名字，对 text2sql 的价值约等于零。
设计成 **L1 → L2 → L3 三层富化 + 人工审核入库**，且**永不自动覆盖人工内容**。

### L1 确定性画像（不烧 token，同步表结构时必做）
对每个字段采集并直接写入：
- 物理类型、是否主键/外键、是否可空、默认值、列注释（MySQL `COLUMN_COMMENT` / PG `col_description` / Oracle `ALL_COL_COMMENTS` / DM 系统表 / SQLite 建表注释解析）
- 行数、`COUNT(DISTINCT)` 基数、`NULL` 率、最大/最小长度
- 数值列：`min/max/avg/中位数/是否疑似金额(小数位+量级)/是否疑似百分比(0~1 或 0~100)`
- 日期列：`min/max` → 判断是"创建时间"还是"业务日期"
- **样本值 TOP 10**（按频次）：基数低（≤ 30）且稳定 → 自动标记为**候选枚举**
- 命名启发式：`created_at`→创建时间、`is_xxx`→布尔标记、`_id`→标识符/外键、`_amount/_amt/_fee`→金额、`_count`→计数、`_rate/_pct`→比率

产出直接落 `sampleValues`、候选枚举、`displayName` 初值。

### L2 知识库 RAG（有据可依，抑制幻觉）
用**现有** `knowledge_base` + `api_kb_search`（项目已有 RAG 能力）检索与表/字段相关的业务文档：数据字典、需求文档、指标口径说明、历史问答。
- 命中片段作为**依据**一起喂给 LLM，并要求 LLM 在输出里标注 `source`（来自哪份文档的哪一段）。
- 无命中就明确"无依据"，让 LLM 只做保守描述（不臆造业务口径）。

### L3 LLM 生成 + 人工审核
输入：L1 画像 + L2 片段 + 用户补充术语 + 同表的其他字段上下文 + 相似字段的 few-shot exemplar（业界做法：把已有人类写好的字段描述做 embedding 检索取 exemplar，效果显著优于零样本）。
输出（严格 JSON）：
```jsonc
{ "displayName":"订单实付金额",
  "description":"用户实际支付的金额，已扣除优惠与运费补贴，不含退款。单位：元。",
  "synonyms":["实付","支付金额","成交额"],
  "role":"measure", "agg":"SUM", "additive":"additive",
  "enumValues":[], "confidence":0.86,
  "source":"kb://数据字典v3.md#订单域", "reviewNeeded": false }
```
- `confidence < 0.7` 或 `reviewNeeded=true` → UI 高亮待复核。
- 全部写入**草稿态**（`status='draft'`、`enriched_by='ai'`），逐个「采纳 / 编辑 / 丢弃」。
- **字段级 `locked` 标志**：人工改过的字段锁定，后续同步永不覆盖（`enriched_by='human'` 优先于 AI）。
- 用户补充知识的入口：① 本体页「业务术语/口径表」（term → 别名/口径/排除规则，优先级**高于** AI 生成）；② 每个字段的「补充知识」文本框。

### 富化任务形态
`POST /api/ontologies/enrich`（可选 `ontologyIds[]`、`fields[]`、`useKb`）：后台任务 → 逐字段生成 → 写草稿 → 前端轮询/列表批量审核。**不阻塞、可中断、可重跑单个字段**。

---

## 5. 枚举：key / value / def / 下一个状态

用户的直觉是对的。枚举不只是候选值列表，它是**口径知识**，尤其"下一个状态"对 text2sql 至关重要（否则 LLM 不知道"未完结"该翻译成什么）。

### 枚举项结构
```yaml
valueType: state          # enum|state|boolean|range|hierarchy
values:
  - key: 0                # 物理值（库里存的东西，必填）
    value: 待支付          # 展示值（给人和 LLM 看的）
    def: 用户已下单但未完成支付；30 分钟未支付系统自动关闭   # 口径定义（LLM 判断语义的关键）
    next: [1, -1]         # 允许的下一状态（状态机）；空数组或 omit = 终态
    synonyms: [未付款, 待付款, 新建订单]
    deprecated: false
  - key: 1
    value: 已支付
    def: 支付成功，等待商家发货
    next: [2, 4]
    synonyms: [已付款, 支付完成]
  - key: 3
    value: 已完成
    def: 用户确认收货，订单进入终态
    next: []
groups:                   # 语义分组：解决"已完结/未完结/有效订单"这类聚合语义
  - code: finished
    value: 已完结（终态）
    def: 不再发生状态流转的订单，含已完成与已取消
    members: [3, -1]
  - code: unpaid
    value: 未支付
    members: [0]
```
- `def` 是**给 LLM 的判断依据**（"这个状态意味着什么、业务上怎么处理"），不是给人看的备注，必须写业务口径。
- `next` 让引擎支持：状态流转合规校验、漏斗分析（各状态数量与转化率）、"进行中"这类区间语义（`key NOT IN (终态集合)`）。
- `groups` 直接消解大量歧义提问。

### 枚举值的三种来源（都支持）
| 来源 | 说明 | 场景 |
|---|---|---|
| `manual` | 手填 / 贴 JSON | 无字典表 |
| `dict_sql` | 执行一条 SQL 取字典表 → 映射成枚举（`SELECT code,name,def FROM sys_dict WHERE type=?`），**可定时/手动刷新** | 库里本来就有字典表（最常见） |
| `sample` | `SELECT DISTINCT col FROM t LIMIT 50` 采样，人工补 `def/next` | 无字典表但有数据 |

---

## 6. 标准属性库（std_attribute）：枚举复用

**结论：必须抽。** 同一份状态字典在 10 张表里出现 10 次，不改就是"改一处漏九处"，而且 LLM 每次看到重复描述还浪费上下文。

### 模型
```sql
CREATE TABLE std_attribute (          -- 标准属性（全局可复用语义属性）
  id TEXT PRIMARY KEY,                -- attr_<shortid>
  user_id TEXT NOT NULL,
  code TEXT NOT NULL,                 -- order_status / region / pay_type
  name TEXT NOT NULL,                 -- 订单状态
  description TEXT,
  data_type TEXT NOT NULL,            -- string|number|date|bool
  value_type TEXT NOT NULL,           -- enum|state|boolean|range|hierarchy
  source TEXT NOT NULL,               -- manual|dict_sql|sample
  source_sql TEXT,                    -- dict_sql/sample 的取数 SQL
  values_json TEXT NOT NULL DEFAULT '[]',  -- 枚举项数组（key/value/def/next/synonyms）
  groups_json TEXT DEFAULT '[]',      -- 语义分组
  last_refreshed_at INTEGER,
  created_at INTEGER, updated_at INTEGER,
  UNIQUE(user_id, code)
);
```
本体字段引用方式（二者取一）：
- **引用**：`refAttr: "order_status"` → 直接继承标准属性的全部定义（枚举/口径/同义词）。
- **继承 + 覆写**：`refAttr: "order_status", override: { value: "订单状态(历史)", values: [...] }` → 局部改名/加值。

改标准属性时：可选「同步到所有引用本体」（默认提示影响 N 个本体）或「断开引用（转为本地副本）」。

### 录入方式：JSON / SQL 都支持（用户提问的正面回答）
| 形式 | 示例 | 说明 |
|---|---|---|
| **JSON** | `[{"key":0,"value":"待支付","def":"...","next":[1,-1]},{"key":1,"value":"已支付","def":"...","next":[2]}]` | 直接粘贴/表单编辑，前端提供「表格模式 ⇄ JSON 模式」双向切换（表格模式就是 key/value/def/next 四列网格） |
| **SQL** | `SELECT dict_code AS key, dict_name AS value, remark AS def FROM sys_dict_item WHERE dict_type='order_status' ORDER BY sort` | 执行后按列名映射（别名决定语义：`key`/`value`/`def`/`next`/`synonyms`），支持「预览映射结果 → 确认入库」；SQL 可保存并**一键刷新** |
| **采样** | `SELECT DISTINCT status FROM t_order LIMIT 50` | 只取 key/value，def 与 next 由人工补或 AI 补 |

> 业界佐证：SQL 形式并非异想天开——Snowflake 2025 的 **Semantic Views** 就是 `CREATE SEMANTIC VIEW ... LOGICAL TABLES ... RELATIONSHIPS ... METRICS` 的 SQL DDL 形态；而 YAML 是文件态主流。两者我们都要：YAML 做本体文件态，SQL 做枚举/字典取值。

---

## 7. 本体组装用什么形式？（用户提问：是不是主流都用 YAML）

### 结论：**是，YAML 为准**。但不是"只有 YAML"，而是**四种表示各司其职**：

| 表示 | 用在 | 为什么 |
|---|---|---|
| **YAML（源文件态）** | 人写、人读、导入导出、版本 diff、评审、**喂给 LLM 的上下文** | 业界主流一致：WrenAI MDL（YAML 源 → 编译 `target/mdl.json`）、Snowflake Cortex Analyst（直接吃 YAML）、dbt MetricFlow（YAML）、Cube（YAML/JS）、Lightdash（YAML）、LookML（类 YAML）。理由：省 token（无引号/无大括号，同一内容比 JSON 少 ~20~30%）、可写注释、diff 友好、人可评审 |
| **JSON（LLM 输出）** | 大模型输出的查询意图 / function calling 参数 | 结构化、可 schema 校验、模型生成 JSON 比生成 YAML 稳定得多 |
| **JSON manifest（引擎内部）** | 翻译引擎的运行时输入 | 编译产物，与 WrenAI 的 `mdl.json` 同一思路；YAML 解析一次即可 |
| **关系表（存储）** | SQLite 持久化 | 便于按字段检索/裁剪/权限控制；导出即 YAML |

**一句话：存 JSON 表、导出 YAML、喂 LLM 用裁剪后的 YAML 片段、LLM 回 JSON 意图、引擎吃编译后的 manifest。**

### 本体 YAML 形态（本项目采用，MDL + Cortex + MetricFlow 融合）
```yaml
# ontology: order   —— 可直接导出/导入，也是喂给 LLM 的形态
version: 1
datasource: ds_project
code: order
name: 订单
description: >
  一笔订单的完整生命周期记录。一笔订单 = 一个用户一次下单行为，含金额、状态、渠道。
  金额口径统一为「实付金额」（已扣优惠，不含退款）。
domain: 交易域
base:                                   # 物理来源（H2：输出列必须显式别名）
  type: sql                             # sql | table
  sql: |
    SELECT o.id AS order_id, o.user_id AS user_id, u.name AS user_name,
           u.region AS region, o.pay_amount AS pay_amount,
           o.status AS status, o.created_at AS created_at
    FROM t_order o LEFT JOIN t_user u ON u.id = o.user_id
    WHERE o.is_deleted = 0
entities:                               # 参与 join 的键（H1）
  - name: order
    type: primary
    expr: order_id
  - name: user
    type: foreign
    expr: user_id
dimensions:
  - name: order_id
    expr: order_id
    data_type: string
    description: 订单唯一标识
    synonyms: [订单号, 单号]
  - name: region
    expr: region
    data_type: string
    description: 用户所属大区
    synonyms: [地区, 区域, 大区]
    ref_attr: region                    # 引用标准属性（§6）
    sample_values: [华东, 华北, 华南]
    sensitive: false
  - name: status
    expr: status
    data_type: string
    description: 订单当前状态
    synonyms: [订单状态, 单据状态]
    ref_attr: order_status              # 枚举 + 状态机来自标准属性
time_dimensions:                        # H4
  - name: created_at
    expr: created_at
    data_type: date
    description: 下单时间
    synonyms: [下单日期, 创建时间]
    granularities: [day, week, month, quarter, year]
measures:
  - name: order_count
    expr: order_id
    agg: count_distinct
    description: 订单笔数
    synonyms: [单量, 订单量]
    additive: additive
  - name: pay_amount_sum
    expr: pay_amount
    agg: sum
    description: 实付金额合计（元）
    synonyms: [销售额, 成交额, GMV]
    additive: additive
  - name: avg_order_value
    expr: pay_amount_sum / order_count   # 派生度量（M2）
    description: 客单价 = 实付金额 / 订单笔数
    additive: non_additive               # 不可加：禁止上卷求和，只能重算
filters:
  - name: status
    expr: status
    operators: [=, !=, in]
    value_source: ref_attr               # 值取自标准属性枚举
    ref_attr: order_status
  - name: region
    expr: region
    operators: [=, in]
    value_source: enum
    enum_values: [华东, 华北, 华南, 华中, 西南, 西北, 东北]
  - name: created_at
    expr: created_at
    operators: [between, >=, <=]
    value_source: relative_date          # last_7_days / this_month / last_month …
policies:                                # M4 行级强制策略（用户不可绕过）
  - name: only_valid
    expr: o.is_deleted = 0
    enforced: true
relations:                               # H1 关系（也可独立建在数据源级）
  - name: order_to_user
    left: order
    right: user
    cardinality: many_to_one
    on: order.user_id = user.user_id
    join_type: left
    status: confirmed                    # suggested | confirmed
examples:                                # M1 已验证问答
  - question: 华东区上月的订单量和销售额
    dsl:
      select: [order_count, pay_amount_sum]
      filters: [{n: region, op: "=", v: "华东"}, {n: created_at, op: "last_month"}]
    verified_by: yhfy
    verified_at: 1788000000
meta:
  status: published                      # draft | published（M6）
  enriched_by: ai                        # ai | human
  locked: false                          # 人工确认后锁定，同步不覆盖
```

### 喂给 LLM 时怎么裁剪（上下文控制）
只喂**命中的本体**，且按分级裁剪，避免上下文爆炸：
- **精简档**（检索阶段，每个本体 ~10 行）：`code/name/description(截断 200 字)/维度名/度量名`。
- **完整档**（确定要用，1~3 个本体）：维度带 `description + sample_values + synonyms`，度量带 `agg + additive`，过滤器带 `operators + 枚举`。
- **不喂**：`base.sql`（物理 SQL 不进上下文，这是 Text2Semantic 的核心——LLM 不该看见物理实现）、`policies`、`relations` 的 on 条件（引擎用）。

---

## 8. 修正后的数据模型（v1 增量）

在 v1 的 `data_source`、`ontology` 之外新增/调整：

```sql
-- 1) 标准属性（§6）
CREATE TABLE std_attribute ( ... 见上 ... );

-- 2) 本体关系（H1）
CREATE TABLE ontology_relation (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data_source_id TEXT NOT NULL,
  left_ontology TEXT NOT NULL,      -- 本体 code
  right_ontology TEXT NOT NULL,
  cardinality TEXT NOT NULL,        -- many_to_one | one_to_many | one_to_one | many_to_many
  join_type TEXT DEFAULT 'left',    -- inner | left
  on_sql TEXT NOT NULL,             -- 'left.user_id = right.user_id'（仅允许引用两侧本体的输出别名）
  status TEXT DEFAULT 'suggested',  -- suggested(自动/AI) | confirmed(人工)
  confidence REAL,
  created_at INTEGER, updated_at INTEGER,
  UNIQUE(data_source_id, left_ontology, right_ontology)
);

-- 3) 已验证问答（M1）
CREATE TABLE ontology_example (
  id TEXT PRIMARY KEY,
  ontology_id TEXT NOT NULL,
  question TEXT NOT NULL,
  dsl_json TEXT,                    -- 查询 DSL
  logical_sql TEXT,                 -- 或逻辑 SQL（L3 用）
  verified_by TEXT, verified_at INTEGER,
  use_as_onboarding INTEGER DEFAULT 0,
  created_at INTEGER
);

-- 4) 富化任务（§4）
CREATE TABLE ontology_enrich_job (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data_source_id TEXT,
  scope_json TEXT NOT NULL,         -- {ontologyIds:[], fields:[]}
  use_kb INTEGER DEFAULT 1,
  status TEXT,                      -- running | done | failed | canceled
  progress_json TEXT, error TEXT,
  created_at INTEGER, finished_at INTEGER
);

-- 5) 数据编辑审计（H7）
CREATE TABLE data_edit_audit (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data_source_id TEXT NOT NULL,
  sql_text TEXT NOT NULL,
  affected_rows INTEGER,
  before_snapshot_json TEXT,        -- 前 20 行快照，便于回滚
  result TEXT, error TEXT,
  created_at INTEGER
);
```

`ontology` 表字段调整：
- `selectors_json` 元素扩：`role`(dimension|time_dimension|measure)、`agg`、`additive`、`granularities[]`、`synonyms[]`、`sample_values[]`、`ref_attr`、`sensitive`、`locked`、`enriched_by`、`confidence`。
- `filters_json` 元素扩：`value_source` 增 `ref_attr|relative_date`；`ref_attr`。
- 新增列：`domain`、`policies_json`、`status`(draft|published)、`relations_owned`。
- `source_sql` **校验规则（H2）**：保存时解析 SELECT 列表，输出列无别名 → 拒绝保存并提示；选择器 `expr` 不在输出别名集合内 → 拒绝保存。

新增 `dialect.ts`（H3）：`quoteIdent(type)`、`dateTrunc(type, expr, grain)`、`paginate(type, {offset,limit|keyset})`、`limitTop(type,n)`、`sampleRows(type, sql, n)` 五类，按 `mysql|postgres|dm|oracle|sqlite` 分派。

---

## 9. REST 增补（在 v1 §7 基础上）

```
GET    /api/std-attributes                     列表
POST   /api/std-attributes                     创建（body 含 values_json 或 source_sql）
POST   /api/std-attributes/preview-sql         执行 SQL 预览枚举映射结果（不入库）
POST   /api/std-attributes/:id/refresh         dict_sql/sample 重新取数
GET    /api/ontologies/:id/yaml                导出 YAML
POST   /api/ontologies/import-yaml             导入 YAML（校验 + 冲突提示）
POST   /api/ontologies/:id/compile             编译 → 返回物理 SQL + 诊断（本体预览·不执行）
POST   /api/ontologies/:id/explain             EXPLAIN（本体预览）
POST   /api/ontologies/:id/preview-data        数据预览（裸跑前 N 行）
POST   /api/ontologies/:id/try-run             本体数据预览（套 DSL 试跑）
POST   /api/ontologies/:id/publish             草稿 → 发布（影响面提示）
GET    /api/ontologies/:id/impact              改动影响面（哪些示例/保存查询会失效）
POST   /api/ontologies/enrich                  触发 AI 富化（后台任务）
GET    /api/ontologies/enrich/:jobId           进度
POST   /api/ontologies/enrich/:jobId/accept    批量采纳/丢弃草稿字段
GET    /api/relations                          关系列表（可按数据源）
POST   /api/relations                          新建/确认关系
POST   /api/datasources/:id/suggest-relations  自动推断关系（入 suggested）
POST   /api/data-edit/preview                  写操作预检（影响行数）
POST   /api/data-edit/exec                     写操作执行（事务 + 审计）
GET    /api/data-edit/audit                    审计日志
```

---

## 10. 分期调整（原 P1~P5 基础上插入）

| 期 | 内容 | 变化 |
|---|---|---|
| P0 | `dialect.ts` + 本体保存校验（别名规则）+ 选择器引用校验 | **新增，是后面一切的地基** |
| P1 | 数据源底座（mysql/pg/sqlite/项目库）+ 管理页 | 不变 |
| P2 | SQL 控制台（只读）+ 数据编辑（开关式，默认关） | 增加写操作审计 |
| P2.5 | **schema 同步升级为富化流水线**：L1 画像 + 样本值 + 候选枚举 + 自动关系推断 | v1 的"同步表结构"太薄 |
| P3 | 本体管理：YAML 导入导出 + 四按钮（预览定义/预览数据/试跑/发布）+ 标准属性库 + 枚举三来源 + 关系图维护 | 大幅扩展 |
| P3.5 | **L2 知识库 RAG + L3 LLM 富化 + 草稿审核流** | 新增 |
| P4 | 翻译引擎升级：关系图自动 join（Steiner）+ 扇出检测 + 行级策略 + 方言适配 + 结构化错误自纠 | v1 只有单表翻译 |
| P5 | 数据智能体 + skill 链 + 右栏结果面板 + 已验证问答沉淀 | 不变（+ examples） |
| P6 | 非关系型（Mongo/ES/Redis）+ 打磨 | Mongo/ES 从"CSV 顶替"改为正式支持 |

---

## 11. 评审问题 → 结论速查

| 你的问题 | 结论 |
|---|---|
| 方案哪里不对劲 | 12 个 HIGH/MEDIUM 问题，最要命是**缺关系层**（连表靠人写 SQL）、**别名 Bug**、**缺方言适配**、**缺时间维度/同义词/样本值** |
| 本体编辑/数据编辑/本体预览/数据预览/本体数据预览 | 5 个动作 → 4 个按钮（预览定义/预览数据/试跑/发布）+ 1 个独立开关（数据编辑，默认关、四眼确认、事务、审计） |
| 大模型生成连表查询怎么办 | **不让大模型写 JOIN**：L0 关系图自动 join（默认）→ L1 人工宽表本体 → L2 已验证问答复用 → L3 逻辑 SQL + dry-run + 结构化自纠（兜底） |
| AI 自动填充业务描述？ | 能且必须做：L1 确定性画像（含样本值/候选枚举）→ L2 知识库 RAG 给依据 → L3 LLM 生成 → **草稿态人工审核**，`locked` 字段永不覆盖 |
| 属性的枚举？ | key / value / def（业务口径）/ next（下一状态）/ synonyms / deprecated + groups（语义分组） |
| 枚举重复能不能抽成标准属性？ | **必须抽**：`std_attribute` 全局库，本体字段 `refAttr` 引用或继承覆写，改一处可同步全部引用 |
| 标准属性能用 JSON 或 SQL 填入？ | **都支持**：JSON 粘贴（表格⇄JSON 双模式）、SQL 取字典表（可一键刷新）、DISTINCT 采样。业界佐证：Snowflake Semantic View 就是 SQL DDL 形态 |
| 枚举值是不是有 key/value/def/下个状态？ | 是，正是这四项（+synonyms/groups），`next` 支撑状态流转校验与漏斗分析 |
| 本体组装用什么形式？主流是 YAML？ | **是，YAML 为主流且应采用**：WrenAI MDL / Cortex Analyst / dbt MetricFlow / Cube / Lightdash 全用 YAML（WrenAI 是 YAML 源→编译 mdl.json）。我们采用四态分工：**存表 / 导出 YAML / 喂 LLM 裁剪 YAML 片段 / LLM 回 JSON 意图 / 引擎吃编译 manifest** |
