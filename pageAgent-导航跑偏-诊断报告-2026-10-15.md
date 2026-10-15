# 🔍 浏览器自动化「导航跑偏」诊断报告

**生成时间**: 2026-10-15 12:40
**对象**: ai-assistant（言智）桌面端 pageAgent 浏览器自动化
**背景**: 用户实报「最近运行的任务很不顺利，都打开别的页面了」，质疑前期稳定性优化无效
**数据来源**: 运行实例日志（`%APPDATA%\yan-zhi\logs\main-2026-10-13~15.log`、`server-data\logs\`）+ 运行库 `data.db` + 智能体自沉淀经验档（`小说推文\第一本\.yan-zhi\experience\sites\*.md`）
**性质**: 只诊断、出方案，未改任何代码

---

## 0. 结论速览（TL;DR）

**「打开别的页面」不是一个 bug，是五个机制叠加的复合症状：**

| # | 机制 | 一句话 | 实测证据 |
|---|------|--------|----------|
| 1 | **多执行流共享一个锚** | call_agent 并发（上限 2）后，主任务与子智能体、或两个子智能体**各自导航，全部打到同一个 tab-1**，互相覆盖 → 页面在 douyin/fanqie/本地文件页之间乒乓跳 | 21:11:08.946 与 21:11:09.000（相隔 54ms）两个不同站的 navigate **并行完成**（6797ms / 8033ms 交叠），同一会话、均无 openInNewTab 标记 |
| 2 | **编排层自动新开页 + 锚不跟随** | 同批第 2+ 个导航被自动转 `openInNewTab` → new_tab（**by design 只 touch 不抢锚**）→ 模型不带 tabId 时后续动作全部仍落在旧 tab-1 → **开出的 5 个新页全是孤儿** | 10-14 晚 new_tab 开了 tab-2/3/4/5/6；当天 453 次动作 `resolvedTabId` 全部 =tab-1，**没有任何一次显式用过 tab-2+** |
| 3 | **站点在隐藏页不渲染** | creator-micro 微前端在 `visibilityState=hidden` 时永远停在「加载中，请稍候…」→ 模型读不到内容 → 判定导航失败 → 反复 force 刷新 | 10-15 会话 12 次 navigate，其中同一 `/interactive/comment` 页 force 刷新 ≥5 次；**智能体自己已在经验档记录此坑（10-15 条目）** |
| 4 | **幻觉工具挂 480s×2** | 模型调用不存在的 `browser_get_info`（全代码库无此工具），桥 HTTP 400 → 降级 SSE 委托 → 前端也无此工具 → 各挂满 480 秒，16 分钟纯等待 | server-2026-10-14.log 20:54 桥 400 + 21:02/21:10 两条 480s 超时 |
| 5 | **「清场」指令没有落成 close_tab** | 任务提示词明确要求先关掉卡死 tab，模型实际 **close_tab 调用 = 0 次**，改为反复导航验证卡死页 | 用户 prompt「先 browser_get_tabs，关掉卡死的…」；两天日志 close_tab 计数 0 |

**一句话总纲**：10-12 那轮修的是「**单执行流内**的判据问题」（超时诱导重试 / 填表误判 / 上传不核验）——日志证实那些确实好转了；但 10-13 起代码把 **call_agent 并发化**（`llm-task-manager.ts:3367` 并发上限 2）之后，浏览器这种**有共享状态**的工具被当成「天生无共享状态」的工具放进了并发面 → 出现了新一层的病：**并发流抢同一个页面**。用户感觉「优化没用」，实际是**修好了一层，下面又塌了一层**。

---

## 1. 现状还原：10-14 晚会话时间线（conv 13822a0d「把 3 条作品加入合集骨债阴阳」）

| 时间 | 事件 |
|---|---|
| 20:48 | 任务启动。用户提示词含「【开始前先清场】关掉卡在 kol.fanqieopen.com 的 tab」 |
| 20:48–20:53 | douyin 正常导航（12.7s / 14.4s，慢但成功） |
| 20:50–21:10 | **幻觉工具 `browser_get_info` ×2**：桥 HTTP 400 → 降级 SSE → 前端无此工具 → 各挂 480s（合计 16 分钟空转） |
| 21:11:08.946 | `navigate → kol.fanqieopen.com`（无 openInNewTab） |
| 21:11:09.000 | `navigate → creator.douyin.com/interactive/comment`（无 openInNewTab）—— **54ms 内并发发出，并行完成** |
| 21:11–21:17 | **57 次 navigate 高频乒乓**：douyin comment ↔ fanqie ↔ 本地文件页（file:///…experience/sites/douyin.md）↔ JSON 接口页（/web/api/mix/list 等） |
| 21:12:37 起 | 编排层守卫把重复导航自动转 openInNewTab → **tab-2/3/4/5/6 五个孤儿 tab**（锚始终 tab-1，无一被显式使用） |
| 21:17 | 模型改走「把 API 端点当页面打开」路线（navigate 到 /web/api/... JSON）——跑偏的另一种形态 |
| 21:45:54 | `navigate → about:blank`（智能体按经验档的「通道假死判据」动作收尾） |
| 结果 | llm_task status=completed，但全程乒乓 + 16 分钟幻觉等待 + 5 个孤儿页 |

10-15 会话（7e99207b「发引导评论」）同样模式：12 次 navigate、同一页反复 force 刷新，最终 **aborted**。

---

## 2. 根因分析（按因果链）

### R1 🔴 call_agent 并发化撞上「浏览器单活动页状态机」——**多流抢锚**

**证据**：`apps/server/src/llm-task-manager.ts:3356-3372`

```ts
// ★ P0-4（2026-10-07）：并行面从 call_agent 推广为「call_agent ∪ 只读白名单」。
const parallelizableCalls = toolCallAcc.filter((tc) => {
  return n === 'call_agent' || READONLY_PARALLEL_TOOLS.has(n);
});
const MAX_CONCURRENT_AGENTS = … : 2;   // 并发上限 2
```

注释宣称「子智能体之间**无共享状态**……天生可并发」——**这对浏览器工具不成立**：

- 所有子智能体共享同一个浏览器面板、同一个会话锚（`agentTouchedTabs: tabId → convId` 按 **convId** 记账，子智能体继承父会话 id）。
- 子智能体 A `navigate(fanqie)`、子智能体 B `navigate(douyin)` → 各自批内只有一个导航（`markDuplicateNavigations` 管不到跨流），**串行化队列（8d32f6d）保证不并发打架，但管不了「先后打到同一页」** → A 刚导航完，B 立刻覆盖 → A 的后续读取读到 B 的页 → A 判定「我的导航没生效」→ 再导航 → **乒乓**。
- 日志里 21:11:08/09 的双导航 + 并行完成 + 同一 conv + 均无 openInNewTab 标记，与该机制完全吻合（高置信推断；建议后续在桥日志里加 `来源=主循环/子智能体#N` 字段可直接实证）。

**这是「打开别的页面」的第一主因。**

### R2 🔴 编排层自动 `openInNewTab` 与「new_tab 不抢锚」语义组合成孤儿页陷阱

**证据链**：

1. `llm-task-manager.ts:2017-2028` `markDuplicateNavigations`：同批第 2+ 个 navigate 自动标记 `openInNewTab:true`；
2. `packages/core/.../browser/index.ts:183-189`：`openInNewTab` → 调 `new_tab`，回执教模型「后续读取该页内容时传 tabId=tab-N」；
3. `apps/desktop/browser-target.cjs:38-40,143-145`：**new_tab 设计上只 touch 不抢锚**（"开新页 ≠ 切换操作目标"）。

设计本身各自有理，但组合效果是：

- 模型**并没有要求**开新页（是编排层注入的），它心智模型里「我导航到了 X」；
- 回执里的「请传 tabId」教导**被模型忽略**（453 : 0 的显式 tabId 使用比是铁证）；
- 后续所有无 tabId 动作落到锚 = tab-1（旧页）→ 读到旧页内容 → 判定导航失败 → **再导航 → 又被编排层转成又一个新 tab** → tab-2…tab-6 雪崩。

**用户看到的「打开一堆别的页面」= 孤儿 tab；「导航跑偏」= 读到的永远是 tab-1 旧页。**

### R3 🟠 站点在隐藏/失焦 webview 里不渲染（站点级，非框架 bug）

**证据**：经验档 `creator.douyin.com.md` 第 33-35 行（智能体 10-15 自己沉淀）：

> ⛔坑 | creator-micro 路由（如 /interactive/comment、/content/manage）在自动化浏览器里卡在"加载中，请稍候..."不挂载内容……原因很可能是自动化环境的页面处于隐藏/失焦状态（document.visibilityState=hidden），微应用/异步 chunk 的加载被暂停……规避：①优先用页面内 fetch 直调接口；②需要页面 UI 时尝试 browser_screenshot 让页面可见后重新加载

10-15 会话 12 次 navigate 中同一页 force 刷新 ≥5 次，正是模型不知道「刷新无用」的重复劳动。**经验档已总结，但没有固化进框架**——模型每次都要现场重新踩坑（或靠经验档召回，召回不稳定）。

### R4 🟠 幻觉工具 `browser_get_info` 无快速失败路径

**证据**：server-2026-10-14.log

```
20:54:31 [browser-bridge] 桥传输失败，降级回 SSE 委托: browser_get_info … err=浏览器桥返回 HTTP 400
21:02:31 前端工具执行超时(480s): browser_get_info callId=tc_mv843…（任务将以此错误继续）
21:10:31 前端工具执行超时(480s): browser_get_info callId=tc_mv84d…
```

- `browser_get_info` 在**整个代码库中不存在**（已 grep 全仓确认）——模型从 `browser_get_page_info` 泛化出来的名字；
- 失败路径：桥 400 → **降级 SSE 委托**（期望前端认识它）→ 前端也不认识 → 挂满 480s。两次 = 16 分钟。
- 正确行为应是：未知工具**立即**返回错误并列出可用工具名（`browser_get_page_info` 就差两个字），让模型当场改口。

### R5 🟡 「清场」类指令没有工具落点

用户 prompt 明确写「先 browser_get_tabs，关掉卡死的标签页」，但两天日志 **close_tab 调用 = 0**。模型面对卡死 tab 的实际行为是**反复导航验证**（27 次 fanqie 导航），而不是关掉。工具存在（`close_tab` 在 `main.cjs:3053` 的 action 集里），但没有被模型使用——工具描述引导不足 + 任务模板没有给出可抄的调用形态。

### 已确认既有修复「确实生效」的部分（避免误判「优化全没用」）

| 10-12~14 的修复 | 日志验证结果 |
|---|---|
| 超时分档 15s/30s + 排队宽限（c489197） | ✅ 「18s 超时×168 次」消失；出现「new_tab 排队等待 1891ms（同 tab 上一个动作尚未结束）」——串行化在工作 |
| 同 tab 动作串行化（8d32f6d） | ✅ 桥路径排队日志正常 |
| new_tab URL 守卫（dfe471e） | ✅ 无再出现 10-12 的「navigate 14474ms 后锚永不建立」链 |
| 报错带回真实异常（fff222d） | ✅ 模型改走 API 路线正是拿到了可读错误后的合理尝试 |
| force 刷新不清表单（8f3e30c） | ✅ alreadyOpen 语义在回执中出现 |
| system_prompt_snapshot 去重（a5e20a6） | ✅ 本次未复测体积（10-12 时 247MB/150MB 冗余） |

**结论**：不是「优化没用」，而是**修好了单流层，10-13 的并发化把问题顶到了多流层**——旧修复不覆盖新层。

---

## 3. 修复方案（按 ROI 排序，未动代码）

### P0 · 直击「导航跑偏」主因

**① 多流浏览器目标隔离**（治 R1）
- 方向 A（最小改动）：`call_agent` 子智能体**禁止直接用浏览器工具**，浏览器操作一律由主任务执行（子智能体只返回「要导航/读取什么」的意图，主任务代执行）。多任务协同里浏览器本就是单例资源，串行反而快。
- 方向 B（保留并发）：每个并发执行流（主/子#N）在桥层登记独立的"流 id"，浏览器动作必须带流 id；同一流内沿用现有锚，**跨流导航自动转 new_tab**（复用现有 openInNewTab 委派），使两个流天然分页。
- 桥日志加 `来源=主/子#N` 字段，让 R1 类问题以后一条日志定位（本次只能靠时间戳反推）。

**② 孤儿页陷阱收口**（治 R2，二选一或并用）
- 方向 A（语义跟随）：`navigate(openInNewTab:true)` 委派 new_tab 成功后**把锚切到新 tab**（touch→anchor）。理由：编排层是替模型做的决定，模型心智模型是「我导航到了 X」，锚就该跟着走；真正想「开着备用」的显式 `browser_new_tab` 工具调用维持 touch 不变。
- 方向 B（纠偏提示）：锚 tab ≠ 最近 new_tab 的 tab 时，读类回执追加一行「⚠ 你在 21:12 新开了 tab-2（creator…comment），但当前读取的是 tab-1（旧页）。若要读新页请传 tabId=tab-2」。

**③ 未知工具快速失败**（治 R4）
- 桥/工具注册表对不存在的 action **立即**返回：「未知工具 browser_get_info。可用浏览器工具：browser_navigate / browser_get_page_info / browser_get_page_content / …（相近：browser_get_page_info）」。删除「降级 SSE 委托」这条对未知浏览器工具的路径（它只制造 480s 空等）。

### P1 · 中等改动

**④ 隐藏页不渲染的前置判据**（治 R3）
- navigate 回执带上 `visibilityState`；为 hidden 时附提示「页面处于隐藏态，creator-micro 类站点可能不渲染；建议改用页面内 fetch 接口（见经验档）或让用户展开面板」。
- 把经验档结论固化进浏览器工具描述/系统提示词，不再依赖经验档召回。

**⑤ 「清场」落到工具**（治 R5）
- `get_tabs` 回执对 loading>30s 的 tab 追加「可用 browser_close_tab(tabId=…) 关闭」提示；
- 任务模板的「清场」段落给可抄调用示例（`browser_close_tab { "tabId": "tab-N" }`）。

### P2 · 结构性

**⑥ 幻觉工具预防**：系统提示词列出浏览器工具全集（名字逐字），并声明「工具名必须逐字匹配，禁止泛化」。

**⑦ 「把 API 当页面导航」的引导**：模型 21:17 起用 navigate 打开 /web/api/... JSON 页当 HTTP 客户端——功能上能跑通，但每次都占导航+渲染；应引导用 `run_script` 内 fetch（经验档已验证 credentials:'include' 可行），回执里对 JSON 端点导航给一句提示。

---

## 4. 优先级总表

| 优先级 | 优化项 | 预期影响 | 难度 |
|---|---|---|---|
| 🔴 P0-① | 多流浏览器目标隔离（禁子智能体直用浏览器 或 流 id 分页） | 直接消灭乒乓导航主因 | 中 |
| 🔴 P0-② | openInNewTab→锚跟随 或 锚错位提示 | 消灭孤儿页与「读旧页误判」 | 小 |
| 🔴 P0-③ | 未知浏览器工具快速失败 | 省下幻觉工具 480s×N | 小 |
| 🟠 P1-④ | visibilityState 判据 + 隐藏页引导 | 消灭「反复 force 刷新」 | 小 |
| 🟠 P1-⑤ | 清场→close_tab 落地 | 卡死 tab 不再污染后续任务 | 小 |
| 🟡 P2-⑥⑦ | 工具全集提示 / API 页导航引导 | 减少跑偏变体 | 小 |

---

## 5. 回答用户的质疑

> 「之前不是优化了稳定性、准确性、可持续性？感觉没用啊」

- 10-12 报告列的病（18s 超时诱导重试、填表误判、上传不核验、快照冗余）在 10-13~14 的提交里**确实修了**，日志证实那些症状没有复发；
- 但 10-13 前后落地的 **call_agent 并发化**引入了新的共享状态冲突（R1），加上 new_tab 语义组合陷阱（R2）——这是**上一层没暴露过的病**，旧优化自然管不到；
- 这次真正「没用」的感觉来自：任务还是能 completed/aborted 收尾，但过程中 16 分钟幻觉等待 + 57 次乒乓导航 + 5 个孤儿页，**过程质量崩了**。上面 P0 三项直指这个过程质量。

---

> ⚠️ 本报告基于 10-13~15 三天运行日志与代码静态分析；R1 的「子智能体并发导航」为时间戳反推的高置信推断，建议按 P0-① 的日志增强方案加字段后二次实证。
