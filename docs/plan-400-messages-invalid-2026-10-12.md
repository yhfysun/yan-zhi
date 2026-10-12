# 400「messages 参数非法」根因分析（2026-10-12）

> 现场：会话 `f0a901e3-1819-4048-9644-2b738139caca`，10:52:21
> 报错：`LLM 请求失败: 400 Bad Request {"error":{"message":"messages 参数非法。请检查文档。","type":"upstream_error","param":"","code":"1214"}}`
> 结论：**发送侧清洗漏了一种「同一 tool_call_id 的回执远离其组头」的形态** —— 与既有 `reorderToolGroups` 的设计前提不符。

---

## 一、现场还原（来自生产库 data.db 只读查询，非推测）

任务：`任务：复核抖音某视频标题是否已改成功，没改成功就完成修改。`（10:50:48 注入的 user 消息）

关键区间（按 `created_at` 排序，共 1204 条消息）：

| # | 时间 | role | tool_call_id / tool_calls | 说明 |
|---|---|---|---|---|
| 1183 | 10:50:31 | assistant | **tcids=[`call_ab998b32…`]** (call_agent) | 主智能体委派「只读核查」子智能体 |
| 1184 | 10:50:48 | user | — | **用户注入的新任务**（追加/切会话） |
| 1185–1199 | 10:50:48–10:51:50 | assistant/tool 交替 | 各自的 call_* | 主循环继续跑了 8 个浏览器工具轮次 |
| 1200 | 10:52:20 | **tool** | **tcid=`call_ab998b32…`** | ⚠️ 18 号的那个子智能体结果，**迟到 109 秒才落库** |
| 1201 | — | assistant | — | `（调用失败：400 …）` |
| 1202–1203 | — | assistant | — | 任务失败落库 |

**配对关系存在、但相邻顺序被破坏**：`call_ab998b32…` 的组头在 **#1183**，回执在 **#1200** —— 中间夹了 **16 条消息**（含一条 user、8 组完整的 assistant+tool 对）。

---

## 二、根因（三处叠加，逐层定案）

### 2.1 为什么回执会迟到 109 秒

`call_agent` 走**并发批次**（`llm-task-manager.ts:3032` `Promise.all(batchToRun…)`）+ `runSubAgent` 内部递归跑完整子 ReAct 循环。
子智能体跑了 ~109s；期间主循环**没有等它**（并发批次只 await `Promise.all`，但 #1184 的 user 注入让主循环先推进了下一轮）→ 子结果 `concurrentResults.set(tcId, r)` 在主循环**已经进入新轮次之后**才回来 → 落库时排在了 16 条消息之后。

> ★ 注意：`#3032` 的 `Promise.all` 理论上是等待的。真实时序是「用户注入 user 消息 + 任务被 resume/续跑」导致主循环推进点与预期不符 ——
> **无论具体触发路径如何，落库结果就是「组头与回执被 16 条消息隔开」**，这才是 400 的充分条件。

### 2.2 为什么 `reorderToolGroups` 没能修好它（**核心缺陷**）

`packages/core/src/llm/message-order.ts` 的算法：

```
遇到组头 #1183 → 收集紧随其后的 tool 回执
  ↓ 下一条是 #1184 的 user → 不是 tool、不是组头 → 塞进 displaced，i++
  ↓ #1185 是 assistant 且带 tool_calls（新组头）→ **break**（本组到此为止）
→ 把 displaced（那条 user）追加到组头之后 → 继续处理 #1185 的新组
```

**它只做「把夹心消息后移」，不做「跨距离把回执拉回组头身边」。**
⇒ 输出仍是 `assistant(call_ab998b32) → user → …16 条… → tool(call_ab998b32)`
⇒ 违反 OpenAI 硬约束「带 tool_calls 的 assistant 之后**必须紧跟**其配对 tool 消息」→ 上游 400（`1214`）。

**已用最小复现验证**（`/tmp/test-reorder.mjs`，逐字复刻该函数逻辑）：

```
✗ assistant[a1] 的 call_ab99 后跟的是 user/u1      ← 不满足相邻约束
```

### 2.3 为什么 `sanitizeToolMessages` 也没拦住

`client.ts:311-335` 的过滤按 **id 配对**（`toolCallIds` 是全局 Set）——
`call_ab998b32…` 两边都在，**配对完整**，所以：
- 组头不被剥（`kept.length > 0`）
- tool 回执不被丢弃（`toolCallIds.has(...)` 为真）

⇒ 清洗全程认为「历史健康」，把破坏相邻顺序的序列**原样发给上游**。

---

## 三、影响面

- **触发条件**：`call_agent`（或任一长耗时工具）的组头与回执之间，主循环又推进了 ≥1 轮（user 注入 / 续跑 / resume）。
- **频率**：长任务 + 追加消息的组合下**必然复现**（本次即「追加了新任务」）。
- **后果**：**整轮 LLM 请求 400**、任务直接 failed，用户看到「调用失败」。（不是降级，是硬失败）
- 与 2026-10-09 修的「立即发送注入 user 落在组内」**同族但更严苛**：那次夹心只有 1 条，`reorderToolGroups` 的 displaced 后移够用；本次夹心是 **16 条且含新组头**，后移策略失效。

---

## 四、修复方案（✅ 已实施）

### ✅ P0 — `reorderToolGroups` 支持「跨距回执归位」

在现有「组内收拢 + displaced 后移」基础上，增加**全局回执查找**：

1. 第一遍：扫全表建 `toolCallId → tool 消息下标` 映射（同 id 多回执保留最早）。
2. 遇组头：**先在本组窗口内**按原逻辑收拢；窗口关闭后若仍有 `pending` 未满足，
   从全局映射把该回执**迁移**到组头之后（原位置由 `consumed` 集合跳过）。
3. 迁移时先接回执、再接 displaced（保证「紧挨着组头」）。
4. **幂等**：顺序已正确时窗口内即收齐，全局迁移不触发 → 输出与输入逐项相同。

> 只读、不写库；语义等价（消息内容一字不改，只调「谁紧挨着谁」）。

**实施位置**：`packages/core/src/llm/message-order.ts`

### ✅ P1 — 落库侧相邻性告警（治本观测）

新增纯模块 `apps/server/src/services/tool-receipt-adjacency.ts`：
- `gapBetweenToolHeadAndReceipt(tail, toolCallId)` —— 组头与回执之间夹了几条（-1/0/>0）
- `shouldWarnOnGap(gap)` —— 是否需告警

`insertToolMessageAndEmit` 落库 `tool` 消息前调用（**非子智能体路径**，try/catch 兜底，
绝不影响主流程）；`gap > 0` 时 `logger.warn` 打出现场证据。

### ✅ P1 — 上游 400 兜底判据放宽

`packages/core/src/llm/client.ts`：判据抽为纯函数 `shouldRetryWithoutTools(text, messages, hasTools)`：
- 原正则保留（OpenAI 官方文案）
- **新增网关同义文案**：`messages 参数非法` / `invalid.*messages` / `invalid_request_error`
- **新增结构判据**：历史含 tool 痕迹（`role:'tool'` 或带 `tool_calls`）即视为可疑 → 降级重试
- 降级本身安全（只改发送形态、不写库）

---

## 五、守门测试（✅ 已落地）

| 测试 | 项数 | 钉住 |
|---|---|---|
| `packages/core/src/llm/message-order.test.ts` | 9（新增 5） | 跨距归位 / 幂等 / 真 orphan 不臆造 / 回执只消费一次 |
| `packages/core/src/llm/retry-without-tools.test.ts` | 7（新增） | 网关文案 + 结构判据 + 不误伤 + 无 tools 不降级 |
| `apps/server/test/tool-receipt-adjacency.test.ts` | 9（新增） | 纯逻辑 gap 判定 + 接线守卫（必须调判据/必须 warn/必须 reverse） |

**变异验证**（`message-order`）：① 关掉跨距归位块 → **3 项红**；② 去掉 `consumed` 原位置跳过 → **3 项红**（重复引用）。均证明测试非纸老虎。

---

## 六、本次已排除的误判

- ❌ 不是 `reasoning_content` 缺失（10-10 已修，且本次所有 assistant 带 tool_calls 的都有 rc）
- ❌ 不是孤儿 tool（全库统计：**0 条** id 对不上的）
- ❌ 不是 `toApiMessage` 取参错误（本次不涉及 arguments 形态）
- ❌ 不是图片/多模态问题（该会话此轮无 imageParts）
- ❌ 不是工具循环闸门（`FORCE_STOP` 已正常触发并收尾，与 400 是两件事）
