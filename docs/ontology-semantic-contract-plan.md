# 本体语义契约：选择列 / 过滤器 / 关联关系（v2，按用户语义修订）

> 核心：本体 → 大模型上下文是**两级组装**——默认项直接拼进本体 YAML，非默认项按问题与关键字召回匹配。召回阈值与数量可配置。

## 1. 数据模型

### 1.1 选择列（= 维度/度量/时间维度 + 召回字段，不设平行列表）

```ts
interface OntologyDimension {
  name: string;
  expr: string;
  keywords?: string[];    // 召回命中词
  isDefault?: boolean;    // 默认：用户没指定查哪些列时，这些列直接进 SELECT
  description?: string;
}
// OntologyMeasure / OntologyTimeDimension 同样加 keywords + isDefault
```

- **默认选择列**：组装 YAML 时无条件全部拼入 → 大模型问题没指定列时 `SELECT a,b,c,d...`
- **非默认选择列**：问题与 keywords 匹配评分达标才进入 YAML
- 度量同理：默认度量总是可用，非默认度量命中才给

### 1.2 过滤器（新实体 + filters_json 列）

```ts
interface OntologyFilter {
  name: string;           // 「近30天」
  keywords?: string[];    // 召回命中词
  expr: string;           // created_at >= DATE('now','-30 day')
  isDefault?: boolean;    // 默认过滤器：直接拼进 YAML，无需召回
  description?: string;
}
```

- 默认过滤器 ≠ 行级策略：policies 是编译器硬注入（安全边界，模型绕不过）；默认过滤器只是总在 YAML 里（模型看到就会带）。两者叠加
- 编译器：intent.filters 引用过滤器 name → spec 白名单解析展开；非白名单 → compileErrors 拦幻觉

### 1.3 关联关系（沿用 v1 设计）

```ts
interface OntologyRelation {
  type: '1:1' | '1:N' | 'N:1' | 'N:N';
  target: string;              // 对方本体 code
  sourceAttr: string;  targetAttr: string;
  via?: { table: string; sourceColumn: string; targetColumn: string };  // 仅 N:N
  description?: string;
}
```

编译 v1 只做单跳（N:N 展开两跳）；多跳/循环/扇出拒绝。数量少，组装 YAML 时全量拼入（不做召回）。

## 2. 召回器（P4.2 第一版，server 服务）

```ts
interface RecallConfig {
  threshold: number;   // 最低分数，默认 0.6
  maxItems: number;    // 每类 topK 上限，默认 8
}
```

- 评分规则 v1（纯规则，无向量）：
  - 问题分段（按标点/空白切）与关键词**整段相等** → 1.0
  - 问题**包含**关键词（子串）→ 0.8
  - 多关键词取最高分
  - score < threshold 丢弃；按分数降序截 maxItems
- 配置：v1 环境变量 `ONTOLOGY_RECALL_THRESHOLD` / `ONTOLOGY_RECALL_MAX`，默认 0.6 / 8；后续进设置分区 UI
- 分词精度问题留口子：score 函数独立可替换，后续可换 embedding

## 3. 摘要组装器 `buildOntologyDigest(user, question, opts)` → YAML 片段

```
1. 取该数据源（或指定）已发布本体
2. 每本体：默认选择列/过滤器/度量 直拼
3. 非默认项：question 召回（threshold/maxItems）→ 命中才拼
4. 关联关系全量拼入
5. 输出紧凑 YAML → 挂数据智能体上下文
```

示例输出：

```yaml
- code: agent
  选择列(默认): name(名称) / platform_id(平台) / ...
  选择列(命中): avatar(头像)      # 召回命中 0.8
  度量(默认): temperature_sum
  过滤器(默认): 近30天 → created_at >= DATE('now','-30 day')
  过滤器(命中): 已删除 → is_deleted = 1
  关联: conversation N:1 ← agent.id；tag N:N — via tag_map(agent_id, tag_id)
  行级策略(强制): is_deleted = 0
```

## 4. UI（OntologyPage.vue）

- 维度/度量/时间维度行加：「默认」checkbox + 「关键字」输入
- 新增「过滤器」表：名称 / 关键字 / 默认checkbox / 条件SQL / 描述
- 新增「关联关系」表：类型 / 对方本体 / 本体字段 / 对方字段 / N:N 时中间表三列
- 编译预览意图区过滤器支持填过滤器 name 或裸条件（沿用）

## 5. 改动清单

| # | 内容 | 文件 |
|---|---|---|
| 1 | db.ts `filters_json` 列迁移 | apps/server/src/db.ts |
| 2 | OntologyFilter/Relation/keywords+isDefault 类型 + 存取 + YAML | ontology-compiler.ts, ontology.ts |
| 3 | 召回器（评分/阈值/topK/环境变量）+ buildOntologyDigest | services/ontology-recall.ts（新） |
| 4 | 编译器：filters 白名单解析 + via 单跳 JOIN + 扇出拒绝 | ontology-compiler.ts |
| 5 | UI 三块 | OntologyPage.vue, ontology.css |
| 6 | 单测 | *.test.ts |

## 6. 本阶段不做

- embedding 向量召回（score 函数留接口）
- 参数化过滤器 `{{param}}`
- 多跳 JOIN 图搜索
- 召回参数设置 UI（先环境变量）
