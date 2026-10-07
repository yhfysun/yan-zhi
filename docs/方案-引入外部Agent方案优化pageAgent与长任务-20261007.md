# 方案：引入 2026 外部模型/Agent 方案优化 pageAgent、长任务与工具调用

> 2026-10-07 · 基于项目现状实查（pageAgent / llm-task-manager / client.ts / context-policy）+ 外部方案扫描（GPT-6 Astra harness 拆解、Stagehand v3、Skyvern、MolmoWeb、Browser Use、Anthropic/OpenAI function calling 官方文档 2026.04）。
> 原则：只引入与现有架构同构、可最小改动落地的做法；不引入新框架。

## 一、现状盘点（与外部方案的 gap）

| 能力 | yan-zhi 现状 | 外部 2026 共识 | gap |
|---|---|---|---|
| 工具产出可靠性 | 提示词 + 文本模式兜底解析 + healToolCallIds 自愈 | **tool_choice 强制 + strict json_schema 约束解码**，解析失败率 ~0% | 无 tool_choice，json_schema 仅 2 处非主链路使用 |
| 元素定位 | 自建编号元素清单（index）+ selector + 坐标 + 视觉标注兜底 | **Astra：a11y 树为主、截图为辅**；社区三层递进 AX→DOM→坐标 | 自建清单 ≈ 简化版 AX 树，但无稳定 ref、无原生 a11y 语义 |
| 重复操作成本 | 每步一次 LLM 调用（200 步上限） | **Stagehand/Astra「代码模式」**：重复 80% 收敛为 Playwright 脚本，只对 20% 需推理的步骤用 LLM | 无脚本化逃生通道，固定流程每步都烧 token |
| 动作生效验证 | noChangeStreak≥3 提示换策略 | Skyvern **validator** 阶段：动作后显式验证页面变化 | 有雏形，未形式化为独立验证判定 |
| 长任务规划 | task_plan 落盘 + 接力棒回注 + decideAutoContinue 自评 | **planner-executor 分层**（>7 步任务可靠性大增，92% 完成率、3.6× 提速）+ 计划中途 re-planning | 有计划、有接力，**缺计划中途修订**（世界变了计划不跟着变） |
| 预算闸门 | 步数上限、条数闸门 400、空转断路器 3 | 步数 + token 预算 + **墙钟时间** + 无进度检测，四件套 | 缺 token 总预算与墙钟预算 |
| 并行执行 | 仅 call_agent 并行（上限 4） | 独立只读调用应并行 | 串行偏保守 |
| 错误回填 | emptyTargetHint（pageAgent 专用）、拉编号清单 | 错误必须带上下文（有效候选值），推广到全部工具 | 覆盖不全 |
| Prompt 缓存 | 无意识设计 | 稳定前缀缓存 = 60~90% 成本下降（Anthropic 缓存 token 10% 计价） | pageAgent 200 步循环每步重发全量上下文，未按「稳定→易变」排序 |
| Critic 自检 | 接力自评（纯文本 CONTINUE） | 结构化 critic（json_schema 强制置信度输出） | 自评无结构、无置信度 |

已达标项（无需引入）：子智能体上下文隔离、压缩落库 + compact_boundary SSE、有效窗口 25% 策略、去重键「名字+参数」、空转断路器单一常量、双协议 LlmClient。

## 二、引入方案（按优先级）

### P0 — 低成本、不改架构

**1. tool_choice / strict schema 支持（client.ts）**
- LlmClient 选项层新增 `toolChoice`（auto / required / 指定工具），OpenAI 协议透传 `tool_choice`，Anthropic 协议透传 `tool_choice: {type:"tool", name}`。
- 工具 schema 加 `strict: true`（OpenAI 兼容端点支持不一 → **特性探测：首次连接测试时探测，不支持则静默降级为现状**，不做配置项）。
- 落地点：`packages/core/src/llm/client.ts`（chat/stream 请求体）+ `ChatOptions` 类型。
- 收益：空参/错参问题的根治路径；现有 healToolCallIds 保留为历史数据自愈层，不删。
- 风险：low（透传参数，降级保底）。

**2. Prompt 缓存友好化（上下文分段排序）**
- `buildContextView` 产出顺序改为：系统提示 + 工具定义（稳定，放头部）→ 摘要/压缩段（半稳定）→ 工具输出与用户输入（易变，放尾部）。关键指令同时出现在头尾（lost in the middle）。
- Anthropic 端点在系统提示与工具定义处打 `cache_control` 断点；OpenAI 端 ≥1024 token 自动缓存，只需保证前缀逐字节稳定（现有 SummaryCache 前缀复用方向一致）。
- 落地点：`apps/server/src/services/context-view.ts` + `llm-task-manager.ts` 消息组装段。
- 收益：pageAgent 200 步循环的成本/延迟主杠杆。
- 风险：medium（动上下文组装顺序，需回归既有压缩失效判定，`messageIds` 逐项比对逻辑不动）。

**3. 工具错误回填带上下文（全工具统一）**
- 把 pageAgent 的 `emptyTargetHint` 模式推广：所有工具执行错误回执必须含「有效候选」（如路径错误附目录列表、字段错误附 schema 摘要）。
- 落地点：`packages/core/src/tool/builtin/` 各工具错误分支 + `runToolCallAndPersist` 统一出口格式化。
- 风险：low。

**4. 只读工具并行白名单**
- `runToolCallAndPersist` 之外的批处理：按工具元数据声明 `readonly: true`（文件读、搜索、`browser_get_page_content` 除外——浏览器是状态机），同批只读调用 `Promise.all`，结果按原序回填（沿用 call_agent 并行的既有模式与落库配对规则）。
- 落地点：`apps/server/src/llm-task-manager.ts` L2090-2109 执行段 + 工具元数据。
- 风险：medium（回填必须严格保序，现有配对落库约束不破坏）。

### P1 — pageAgent 增强

**5. 「代码模式」逃生通道（Astra/Stagehand 模式）**
- 新增一个 `browser_run_script` 工具：接收一段受限 Playwright/JS 脚本（桌面端走 BrowserView `executeJavaScript`，Web 端走 Playwright evaluate），一次执行多步操作并返回最终页面状态。
- 提示词引导：固定重复流程（登录、翻页列表、批量提取）改写为脚本，只对需要判断的节点回到单步工具。
- 沙箱约束：脚本在页面上下文执行、禁网络请求白名单外域名、超时 30s、结果截断 8K（对齐工具输出截断规则）。
- 收益：固定流程 token 成本降一个数量级；这是 2026 浏览器 Agent 最大的架构共识。
- 风险：medium（安全面：脚本注入面收口在工具实现单点 + path-guard 同级审计）。

**6. 页面状态签名 + validator 形式化（Skyvern 模式）**
- 每次动作后计算轻量页面签名（URL + 标题 + 交互元素 index 集合哈希），与签名对比产出结构化 `{changed: boolean, changedRegions}` 回执。
- `noChangeStreak` 判定从提示词软约束升级为工具回执硬字段，≥3 时由主循环强制注入换策略指令（不再依赖模型自觉）。
- 落地点：`browser/index.ts`（get_page_content 已可携带）+ pageAgent 提示词。
- 风险：low。

**7. a11y 树升级（Astra 方向，二期可选）**
- 现有自建编号清单保留为主路径（已验证稳定）；增量补 a11y 语义：元素清单加 `role` / `name` 字段（桌面端可经 CDP `Accessibility.getFullAXTree`，Web 端 Playwright `page.accessibility`）。
- 定位优先级不变：index → selector → 坐标；a11y 语义只用于提升清单质量，不推翻现有机制。
- 收益：canvas/iframe/Shadow DOM 场景清单更完整；token 更省（语义化文本替代 DOM 行）。
- 风险：medium（CDP 桥接需验证 BrowserView 场景）。

### P1 — 长任务

**8. 计划中途修订（re-planning checkpoint）**
- 现状：task_plan 在接力时回注，但计划本身从不修订。
- 引入：每次自动接力（decideAutoContinue 触发处）增加一次轻量检查——当前步结果是否与计划冲突（剩余步骤是否还有效），冲突则用小模型改写 plan.md 剩余部分（复用接力总结的 json_object 通道）。
- 落地点：`llm-task-manager.ts` L2117-2290 接力段 + `task-plan.ts` 增加 rewrite 动作。
- 风险：medium（多一次 LLM 调用；只在接力边界触发，频率可控）。

**9. 预算四件套补全**
- 新增：单任务 token 总预算（按有效窗口 × 任务类型系数）与墙钟上限（用户可配，默认 15 分钟）；触达后走与步数上限相同的「结账 → 自评 → 接力确认」路径，不硬杀。
- 落地点：`context-policy.ts`（预算常量唯一定义处）+ 主循环累计统计（已落库的 token 数据可直接累计）。
- 风险：low。

**10. 结构化 Critic 自评**
- decideAutoContinue 的纯文本 CONTINUE 改为 json_schema 强制：`{continue: bool, confidence: 0-1, reason, planStillValid}`；confidence < 0.6 时拒绝自动接力转人工（对齐外部「无进度检测 + 置信度阈值」共识）。
- 依赖 P0-1 的 toolChoice 通道；不支持强制输出的端点降级为现状文本判定。
- 风险：low。

### P2 — 观望项（本轮不做）

- **工具动态路由**（>20 工具裁剪）：主链路工具数目前可控，等自定义工具生态膨胀后再做。
- **MolmoWeb 纯视觉路线**：视觉兜底（annotate 截图 + visual_locate）已具备，纯视觉不解决 token 成本，不跟。
- **CrewAI/LangGraph 类框架引入**：与现有自研 ReAct + workflow DAG 同构，引入只增复杂度，明确不做。

## 三、实施顺序建议

1. 第一批（P0-1/3/4 + P1-10）：工具调用可靠性主线，互相依赖，一起验收。
2. 第二批（P0-2）：缓存排序独立回归（压缩判定不动）。
3. 第三批（P1-5/6）：pageAgent 主升级，配 A/B 对照（同任务新旧路径成功率 + token 消耗）。
4. 第四批（P1-8/9）：长任务收口。
5. P1-7 视第三批效果决定是否做。

## 四、验收口径

- 工具调用：空参率（按会话内调用序号统计）对比；strict 模式端点探测覆盖率。
- pageAgent：固定流程任务（如小说推文链路）步数与 token 消耗下降 ≥50%；noChangeStreak 误循环次数归零。
- 长任务：接力时计划修订触发率、confidence 拒绝接力后人工接管率。
- 全部改动按既有硬性约束：真编译 → 产物核验 → 不跑后端全量测试，只跑本轮相关。
