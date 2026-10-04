# 数据查询：本体语义层 × QueryContract 融合方案

> 状态：方案（拍板 2026-10-03：**本体为主，结合 QueryContract 受控执行**——本体解决"查什么"，QueryContract 解决"怎么安全执行"）
> 关联提案：openspec/changes/data-ontology-agent（本体路线）、data-query-contract（受控执行路线）

## 1. 背景与决策

两条路线各写了半套：

| 已有资产 | 位置 | 作用 | 缺口 |
|---|---|---|---|
| 本体语义层 | `services/ontology.ts`（实体/关系/意图过滤 `resolveIntentFilters`）、`ontology-compiler.ts`（方言编译，**跨本体 JOIN `compileOntologyJoinQuery` 已实现且已接线** `ontology.ts:391`）、SQL 方言适配（mysql/postgres/dm/oracle/sqlite） | 把自然语言意图映射成**语义正确**的查询（表/关联/过滤条件由本体声明，不靠模型猜） | 直接产 SQL 交给执行层，参数化/白名单/审计口径不统一；草稿态、发布态链路半开放 |
| QueryContract | `services/data-query.ts`（`DataQueryInput`/`DataPaginateInput`，参数化受控执行，**不经大模型**） | 把执行收口成**结构化契约**：模型只产契约、代码执行，天然安全 | 没有"查什么"的语义来源——契约里的表/字段从哪来没有语义层支撑 |

**拍板（2026-10-03）**：查询**必须以本体为语义底座**（表/关联/字段映射由本体声明，模型不直接摸 SQL），执行必须走 **QueryContract 受控通道**（参数化、白名单、审计、翻页）。两者不是二选一，是上下游。

## 2. 融合架构

```
用户问题
  → ① 意图解析（resolveIntentFilters：实体/过滤条件/聚合意图）
  → ② 本体编译（ontology-compiler：单本体 compileOntologyQuery / 跨本体 compileOntologyJoinQuery，
       方言适配 mysql|postgres|dm|oracle|sqlite）
  → ③ 契约化（新增：编译结果 → QueryContract）
       contract = {
         sources: [{ ontologyId, dialect, fromSql(参数占位) }],
         joins: [{ via: 关系声明, type }],
         params: [{ name, type, required, from: 'intent' | 'user' }],   // ★ 全部参数化，禁字符串拼接
         columns: [{ name, label, from }],                              // 看板列映射
         limits: { maxRows, timeoutMs },                                // 执行护栏
       }
  → ④ 受控执行（data-query.ts 现有通道：参数绑定执行 / 翻页 / 只读校验）
  → ⑤ 动态看板 / 表格交付（现有 QueryContract 看板渲染）
```

**关键约束（钉死）**：
1. 大模型只产出**意图与参数**，永远不产出可执行的 SQL 字符串——SQL 由本体编译器生成（这是与"text2sql 直拼"路线的本质区别）。
2. `contract.params` 之外的任何用户输入不得进入 SQL 文本；字符串拼接在代码层禁用（lint/评审双查）。
3. 只读：执行通道保持 data-query.ts 现有只读校验，契约层再加 `limits.timeoutMs` 兜底。
4. 本体**发布态**才可被查询（草稿不可见——现有口径保持，见 `data-query.ts:87`）。

## 3. 改动点（文件级）

| 改动 | 文件 | 说明 |
|---|---|---|
| 新增契约装配器 | `services/ontology-contract.ts`（新） | 编译结果 → QueryContract 的唯一出口：方言 SQL + 参数清单 + 列映射 + 护栏。**编译器不直接执行** |
| data-query 接契约 | `services/data-query.ts` | 执行入口新增 `mode: 'contract'`：校验 params（类型/必填/白名单）→ 参数绑定执行 → 复用现有翻页 |
| 工具面收敛 | `mcp/api-tool-executor.ts` | `api_data_query` 入参增加契约模式；旧的直查模式保留一个版本期（标记 deprecated），智能体提示词改为"先 `api_ontology_list/detail` 再 `api_data_query`（契约模式）" |
| 提示词更新 | `db.ts` 数据查询助手 seed | 把两阶段工作流（先本体后契约）写进 SOP，禁止模型绕过本体直接描述表结构 |
| 跨本体 JOIN 补完 | `services/ontology-compiler.ts` | `compileOntologyJoinQuery` 已有；补扇出拒绝（fork rejection）的阈值配置与测试（Steiner 连接子树是 P3.3 后续，本期只做"关系链显式声明"的 JOIN，不自动探索） |
| 看板列映射 | 前端动态看板组件 | columns label 用本体声明的业务名（不再暴露物理列名） |

## 4. 分期

- **P1（本期）**：契约装配器 + data-query 契约模式 + 提示词收敛。验收：数据查询助手全流程只产意图与参数；对同一问题，切换方言（sqlite↔mysql）契约 SQL 正确改写。
- **P2**：跨本体 JOIN 显式关系链 + 看板列业务名映射 + 查询审计表（谁、哪个本体、什么参数、行数、耗时）。
- **P3（远期）**：Steiner 连接子树自动 JOIN、聚合意图（GROUP BY）编译、增量刷新看板。

## 5. 风险与回退

- 契约模式上线初期覆盖不了长尾查询 → 保留旧模式一个版本期，智能体优先契约、兜底直查并在回复里声明。
- 本体质量决定一切：内置项目库本体（`ontology.ts:648` "语义留白待富化"）需要先富化两个示范库再谈推广。
- 回退开关：`YZ_DATA_QUERY_CONTRACT=0` 关闭契约模式回到直查（保留一个版本期）。
