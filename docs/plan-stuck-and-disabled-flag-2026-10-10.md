# 方案：Agent 卡 / 禁用标志残留 / navigate 异常耗时（2026-10-10 深夜）

> 用户诉求：「**卡**的问题，和这个**禁用标志**，**没有任务**也一直存在着（**你只需要出方案**）」
> 结论先行：**禁用标志残留的主因 = 自愈巡检有 120s 盲区 + 判据是"双条件与"，两个条件都能各自假阳**。

---

## 一、先厘清三条现象的准确定义（避免改错目标）

| 用户说法 | 代码落点 | 触发条件 |
|---|---|---|
| **禁用标志** | `BrowserPanel.vue` 的 `inputLocked` → `.agent-lock-shield`（挡住网页一切点击/键盘）+ `.wv-locked`（`pointer-events:none`） | `inputLocked === true` |
| **没有任务也一直存在** | 同上的 `inputLocked` 在任务已结束后**仍为 true** | `browserTaskActive` 未被清 或 `streaming` 假为真 |
| **卡** | ① 主进程 `navigate` 稳定 **14.4s**（`loadURL` 12s 超时 + 注入 1.5s）② 模型 **36 次**重试穷举 ③ tab 无限堆积 | R1/R2（见 `log-analysis-2026-10-10-2348.md`） |

**这三个是同一根因链的三个表现**：navigate 失败 → 模型重试穷举 → tab 堆积 + 任务长时间 running
→ `streaming` 长期为真 → 禁用标志长期挂着 → 任务真结束后自愈又有 120s 盲区 → "没有任务还一直存在"。

---

## 二、禁用标志链路（完整判据，逐环可查）

```
inputLocked = isPreviewScope            // ① 只在 preview:<convId> 面板生效
            && !chatStore.browserPaused // ② 用户没点暂停
            && convTaskRunning          // ③ = chatStore.streaming = runningConvIds.has(currentConvId)
            && chatStore.browserTaskActive // ④ = browserTaskConvs.has(currentConvId)
```
（`BrowserPanel.vue:491-496`）

**再拼一层展示门控**（决定"看得见"）：
```
liveControlVisible = isPreviewScope && convTaskRunning && browserLiveFresh
                     && (browserTaskActive || browserSteps.length > 0)
browserLiveFresh   = pausedNow || (now - lastBrowserToolAt < 45_000)   // 走秒节拍，3s 一跳
```
（`BrowserPanel.vue:504-513`）

### 🔴 缺陷 1：`streaming` 假阳性 ⇒ 禁用标志残留（**主因**）

`runningConvIds` 由 **SSE 终态事件**清除。一旦终态丢失（断流放弃重连 / 服务重启把任务标
`interrupted` / 用户强杀），`runningConvIds` 就**永久残留** ⇒ `streaming` 恒 true。

已有的自愈是 `sweepStaleBrowserTakeover()`（`chat.ts:2503`，每 30s 一跳），但它有**两道延迟**：

```js
// chat.ts:2506 —— 浏览器会话的 2 分钟宽限
const browserIdle = Date.now() - lastBrowserToolAt.value > 120000;
// chat.ts:2514 —— 未到宽限就整会话跳过
if (browserTaskConvs.value.has(convId) && !browserIdle) continue;
```

⇒ **只要本会话跑过浏览器工具，任务结束后的 2 分钟内禁用标志一定挂着**。
若任务恰好在一次 `wait_for(30s)` 之后结束，用户感受到的"没有任务还挂着"就是 **120s+**。

> ⚠️ 注释说这个宽限是"长任务编排间隙浏览器空闲 2 分钟是常态，反复重订会抖动流"——
> **理由成立但手段错了**：它用"浏览器工具静默时长"当"任务是否还在跑"的代理信号。
> 而任务是否还在跑，服务端 `/llm/tasks/active` 一句话就能问清楚，**不需要靠猜**。

### 🟡 缺陷 2：`browserTaskActive` 与 `streaming` 是"与"关系，两者都会假阳

`inputLocked` 要求 ③④ **同时**为真。看起来更安全，实际是"两个假阳源串联"：
- ③ 假阳：SSE 终态丢失（上文）
- ④ 假阳：`browserTaskConvs` 同样只在"任务收尾/切会话/reset"清（`useChat.ts:481`、`chat.ts:2459/2524/2614`），**终态丢失时同样残留**

⇒ 任一为真即可残留；两个都为真时更难自愈（宽限还叠加）。

### 🟡 缺陷 3：`browserLiveFresh` 的 45s 宽限与 R1 叠加放大体感

R1（navigate 每次 14.4s）会让 `browserSteps` **持续 push**（每次都算"浏览器工具事件"）
⇒ `lastBrowserToolAt` 一直被刷新 ⇒ `browserLiveFresh` 恒真 ⇒ **接管条 + 禁用标志一直亮**
⇒ 但页面实际什么都没干成 ⇒ 用户感受 = "卡着 + 一直禁用"。

---

## 三、方案 → 落地状态（2026-10-11 更新：**已按方案实施**）

> ⚠️ 本节原为"仅方案"，2026-10-11 已全部落地 + 提交。下表为**最终实施结果**。

### 🔴 P0 —— 禁用标志残留：**改为"会话级长连推送"（比原方案更根治）**

原方案想「缩短轮询宽限 + 硬上限兜底」；实施时发现**更根本的修法** ——
去掉轮询本身（用户要求「轮询都去掉」）：

| 步骤 | 最终做法 | 状态 |
|---|---|---|
| 1 | ★★★ 服务端 `emit()` 末尾**终态双发到会话总线**（`emitConversation`）；前端挂**会话级长连订阅** → 任务结束**实时**感知 | ✅ 已做（`8869732`） |
| 2 | 自愈巡检**降级为最后保险**：周期 30s → **60s**、宽限 **120s → 30s** | ✅ 已做 |
| 3 | `inputLocked` 加**硬上限兜底** `lockStaleByHardLimit`（>5min 无浏览器事件即解锁，不依赖网络） | ✅ 已做 |
| 4 | 终态立即清：会话级订阅收到 `completed/aborted/error` 即清 `runningConvIds`/`browserTaskConvs` | ✅ 已做 |
| 5 | 判定抽到纯函数 `stores/stale-run-sweep.ts` 的 `shouldSweepConv()`（可单测） | ✅ 已做 |

> ⚠️ 原方案担心的反例（"长任务编排间隙浏览器空闲 2 分钟"）**已解决**：
> 现在不再用"工具静默时长"代理"任务是否在跑" —— 服务端 `emitConversation` 会主动推终态，
> 前端无需猜；真在跑时服务端不会发终态 ⇒ 不会被误清。

### 🔴 P0 —— 卡的根因（R1/R2）：**已修**

见 `docs/log-analysis-2026-10-10-2348.md`：
- **R1**：锚永建不起来（含第四次根因：`isMine` 挡首次 navigate，补 `isCurrentView`）→ ✅ 已修（80/80 + 变异）
- **R2**：webview tab 无上限 → `evictLruWebviewTabIfNeeded()` ✅ 已修
- **✅ 本方案新增建议已做**：`navigate` 返回体加 `loading`/`note` —— 12s 超时时明说
  "已开始加载，**不要换 URL 重试**"（修模型 36 次穷举的直接诱因）。

### 🟡 P1 —— 接管条与"任务真在跑"解耦：**部分做了**

- ✅ 主路径已改为**服务端推送终态**（不再是前端推测）
- ⬜ 接管条本体仍用 `browserSteps` + 45s 宽限做**展示**门控（它是纯展示层，
  控制层已由会话级订阅保证）。**刻意不做**：接管条是"最近有没有浏览器动作"的视觉提示，
  改成"服务端有活动任务"反而会让"主智能体在跑非浏览器步骤时"条子空挂着（旧问题的另一面）。

### 🟢 P2 —— 顺手可做：**已完成**

| 项 | 状态 |
|---|---|
| `about:blank` 被拒 | ✅ **已放行**（`main.cjs:3005` `isBlank`） |
| `openInNewTab` 锚语义 | ⬜ **仍未定案**（见下方"遗留项"） |
| 禁用标志的**可观测性** | ✅ 已做 —— `[browser-action] 锚定决策` 日志 + 会话级订阅日志 |

---

## ★ 遗留项（明确未做，非遗忘）

| # | 项 | 为什么留着 |
|---|---|---|
| 1 | **`openInNewTab` 的锚语义未定案/未写测试** | 需要产品判断："navigate + openInNewTab" 到底是"开新页"（不抢锚，同 `new_tab`）还是"导航当前页"（抢锚）。**语义未定就不该写死测试**（会把错的行为固化）。当前按"显式 tabId=false → anchor"处理。 |
| 2 | **真机跑 dev 验证** | R1/R2 是多进程时序改动，纯函数测试全过 ≠ 实机跑通。需跑一次 `pnpm dev:desktop` + 真实抖音任务，确认：锚建立 / 无 tab 跳格 / 无 `MaxListenersExceededWarning` / navigate 耗时恢复正常。**这一步只能人工触发**（要真实登录态与页面）。 |
| 3 | **未推送远端** | 7 个提交在本地 `dev0.1-mobile`，等你确认后 push。 |
| 4 | `messageRounds` 优化 | **实测否决**（重算仅 0.187ms = 主线程 0.37%，不值得引入"复用引用"的高风险优化）；真正解法是虚拟滚动（大改动）。注释已钉住实测数据。 |

---

## 四、验证方案（方案落地后怎么证）

| 断言 | 方法 |
|---|---|
| 任务结束后 ≤10s 禁用标志消失 | 真机跑任务 → 强杀后端（模拟终态丢失）→ 计时看 shield 何时消失 |
| 任务真在跑时不误清 | 跑一个"浏览器步骤 + 长思考步骤"混合任务，确认间隙中 shield **不消失** |
| `inputLocked` 三条件可观测 | dev 日志打印 ③④ 布尔值 |
| navigate 不再 14.4s 稳定复现 | 真机 navigate 抖音首屏，确认耗时分布（首屏 4s / 慢资源才 12s） |
| 无 tab 堆积 | 跑 3 分钟任务，确认 `webviewTabs.size` 有上限、无 `MaxListenersExceededWarning` |

---

## 五、一句话总结

- **禁用标志"没有任务也在"** = `runningConvIds`/`browserTaskConvs` 终态丢失后残留，
  而自愈巡检有 **120s 盲区**（`browserIdle` 宽限）⇒ **方案：让巡检立刻去问服务端（缩短宽限 + 加硬上限兜底）**。
- **卡** = navigate 失败 → 模型穷举重试 → tab 堆积 + `browserSteps` 不停 push ⇒
  **方案：修 R1/R2（昨日报告）+ navigate 返回值带上"已开始加载"语义**。
- 两者同源，**R1/R2 修好后"禁用标志一直挂着"的体感会大幅缓解**，但**残留判据本身仍需按 P0 改**。

---

# 补充（2026-10-11 00:05）：回应"浏览器任务为啥影响前端交互"的质疑

> 用户质疑：「后台任务为啥影响前端应用的交互效果？浏览器页面就只影响浏览器页面啊，
> 输入框、消息列表、内容区域滚动这样不应该受影响啊」
> **这个质疑方向是对的 —— 我逐条查证后确认：前端层面确实不耦合，卡来自别处。**

## A. 逐条查证结果（**结论：你的直觉成立**）

| 用户怀疑的耦合 | 查证 | 结论 |
|---|---|---|
| 浏览器任务 → 消息列表重渲？ | `ChatMessageList.vue` 模板里引用的 store 字段全量统计：只有 `pendingPathAuth` / `pendingQuestion` / `streaming` / `pendingConfirmation` / `currentMessages` / `currentConvId`。**零处**引用 `browserSteps` / `agentCursor` / `browserTaskActive` | ✅ **不耦合** |
| 浏览器事件 → `flushNow`（消息重渲）？ | `flushNow` 只在 `tool_call` / `message:updated` / 任务终态调用（`chat.ts:2180/2190/2342-2344/2380`）。`tool:start`/`tool:result`（浏览器事件）**不走 flushNow** | ✅ **不耦合** |
| 全局遮罩挡住输入框？ | 全仓 grep：**没有**覆盖整个聊天页的 mask/shield。唯一 shield 是 `.agent-lock-shield`，位于 `BrowserPanel` 的 `.browser-viewport` **内部**（`position:absolute; inset:0` 相对视口区） | ✅ **不越界** |
| 3s 的 `nowTick` 拖累全局？ | `nowTick` 只在 `BrowserPanel` 作用域内被 `browserLiveFresh` 读到。Vue 响应式是**组件级依赖追踪**，不会外溢到消息列表 | ✅ **不外溢** |
| `tabs.push` 重挂所有 webview？ | `v-for="t in tabs" :key="t.id"` —— push 只新增，Vue diff 按 key 复用已有元素，**不会重挂** | ✅ **不重挂** |
| `ChatHub.vue` 的 3s 轮询？ | 它是**独立的 IM/节点消息页**（`views/ChatHub.vue`），不在聊天页挂载 | ✅ **不影响聊天页** |

## B. 那"卡"到底卡在哪？—— 卡在**主进程/浏览器进程**，不是前端框架

关键区分：**"卡"有两种，体感像但根因完全不同**。

| 类型 | 现象 | 根因 |
|---|---|---|
| **真卡（本次）** | 整个应用点不动、输入框无响应、网页也不动 | **主进程事件循环 + Chromium 渲染进程被占满** |
| 假象（视觉误判） | 只有浏览器页面转圈，别处正常 | 单页加载慢，非应用问题 |

真卡的机制（有日志铁证）：
1. **`runBrowserAction` 在主进程里 `await loadURL` 最长 12s** —— 主进程是**单线程**，
   `webview` 的 guest 创建/销毁、`tabClosed`/`tabCreated` 广播、`waitForGuest` 轮询
   （每 100ms 一次）**全排在这条线程上**。agent 每 14.4s 一次 navigate × 36 次重试
   ⇒ 主进程几乎全程在处理浏览器动作 ⇒ **窗口管理/菜单/快捷键等主进程职责一起变慢**。
2. **每个 webview tab = 一个独立 Chromium 渲染进程**（webview 引擎的固有代价）。
   R2（tab 无上限）下 3 分钟堆出十几个 ⇒ **CPU/内存被十几个渲染进程分食**
   ⇒ 你的笔记本（31.6 GB，常驻 WorkBuddy/Trae/WSL/Defender）整体变卡，**输入框卡是整机被拖累的结果**。
3. **`injectYzAssistant` 每次 navigate 后注入 1.5s**（`main.cjs:2986`），也是主进程/guest 开销。

⇒ **所以你的判断是对的**：不是"浏览器任务的 UI 状态污染了输入框"，
而是**主进程与 GPU/渲染进程被浏览器动作占满**，整机层面的资源争抢让所有交互变慢。
⇒ 这也解释了为什么 **R1/R2 修好后卡顿会大幅缓解**：导航不再失败 ⇒ 不再 36 次重试 ⇒
不再堆积 tab ⇒ 主进程与渲染进程压力回落。

## C. 通信机制查证（用户问"有没有 WebSocket / 轮询"）

### C1. WebSocket —— **业务主链路零 WebSocket**

全仓 grep 结果：只有三处 WS，**都不是任务流**：
- `apps/server/src/mcp/edge-tts.ts` — 手写 WS 连微软 TTS（外部服务）
- `apps/server/src/services/debug-manager.ts` — Node inspector 的 CDP（WS）
- `apps/server/src/services/dingtalk-stream.ts` — 钉钉推送长连

**任务流走的是 `fetch` + `ReadableStream` 手读 SSE**（`chat.ts:2064`），
刻意不用 `EventSource`（因为要带 `x-license` 自定义头）。**这是合理选择**（SSE 单向、走 HTTP、易穿代理）。

### C2. 轮询 —— **确实有多处，但需逐一判断是否必要**

| 位置 | 周期 | 用途 | 是否可优化 |
|---|---|---|---|
| `chat.ts:2532` | **30s** | `sweepStaleBrowserTakeover()` 查活动任务（残留自愈） | ★ 应缩到 10s（见 P0 方案） |
| `BrowserPanel.vue:503` | 3s | `nowTick` 走秒（活性门控） | 可改事件驱动（不必要，开销极小） |
| `ChatInputArea.vue:846` | 1s | 任务计时走秒 | 必要（用户可见计时） |
| `ChatHub.vue:279/281` | 3s / 15s | IM 轮询 + 心跳 | 不在聊天页，不影响 |
| `OpsMetricsPanel.vue:74` | 10s | 运维指标 | 非聊天页 |
| `Peers.vue:149` | 3s | 节点消息 | 非聊天页 |

⇒ **聊天页实际只有 1s（计时）+ 3s（nowTick）+ 30s（自愈）**，且都在各自组件作用域内，
**不会互相引发重渲**。SSE 已覆盖实时性需求，**不需要引入 WebSocket**。

## D. 建议（追加，优先级不变）

1. 🔴 **R1/R2 仍是第一优先** —— 它们是"整机变卡"的源头（重试 + tab 堆积）。
2. 🔴 **禁用标志 P0**（缩短自愈盲区）—— 与卡同源，先修 R1/R2 可缓解，但判据仍要改。
3. 🟡 **把 `ChatHub` 的两条轮询与聊天页彻底隔离**（已在独立 view，确认无共享 store 高频写入即可）。
4. 🟢 **不必引入 WebSocket** —— 现有 SSE + 少量轮询已够；引入 WS 反而增加复杂度与穿透成本。
5. 🟢 若要进一步降主进程压力：把 `injectYzAssistant`（1.5s）改为**按需注入**（仅首次导航），
   以及 `waitForGuest` 轮询间隔 100ms → 自适应退避。
