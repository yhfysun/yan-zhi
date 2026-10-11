# 方案：任务运行时聊天页卡顿（前端渲染热函数）（2026-10-11）

> **状态：✅ 已实施（2026-10-11 11:02）** —— P0-a / P0-b / P1 全部落地，P2 列为远期。
> 验证：ui 全量 **45 文件 / 670 通过**（5 跳过）、`vue-tsc --noEmit` exit 0、变异测试 2 处全抓。

> 用户实报：「最近运行的任务报错啊啊，而且**页面很卡根本滚动不了**。。。预览的浏览器页面也不会打开了」
> 关键澄清：**「停掉任务就不卡了」** ⇒ 卡发生在**任务运行期间**，不是静态页面本身的问题。

---

## 一、先分清「三条现象」与各自根因（避免改错目标）

| # | 现象 | 根因 | 状态 |
|---|---|---|---|
| 1 | 预览浏览器打不开 | `BrowserPanel.vue` **TDZ 崩溃**（`nowTick` 声明晚于引用；`watch(inputLocked, cb)` 创建时同步求值 getter → 读未初始化 const） | ✅ **已修**（本日，含守门测试 6 项） |
| 2 | 任务报错 | 同 #1 的下游（组件挂载失败 → `<webview>` 不创建 → 浏览器工具全挂 + 循环拦截） | ✅ **随 #1 一起修** |
| 3 | **页面卡死滚不动** | **本方案主角**：任务运行时**前端渲染热函数**每 50ms 全量重执行 | ⬜ **本方案** |

★ 注意 #3 与 #1 的关系：#1 的产物之一是"每次 update 重试刷爆主线程"，但**那只是 #3 的一部分**。
   **停掉任务就不卡** 证明 #3 是**流式渲染**引入的，即使 #1 修好，#3 依然存在（除非任务不跑）。

---

## 二、与既有分析的关系（不重复劳动）

已有 `docs/plan-stuck-and-disabled-flag-2026-10-10.md` 处理的是**另一条链**（主进程 / 浏览器进程）：

- R1 锚永建不起来 → 模型穷举重试 → tab 堆积 ⇒ ✅ 已修
- R2 webview tab 无上限 ⇒ ✅ 已修
- 该文档"遗留项 #4"**实测否决**了「`messageRounds` 重算优化」：重算仅 **0.187ms**（主线程 0.37%）

**本方案与它不冲突、不重复**：
- 它讨论的是 **`messageRounds` computed 本身的耗时** → 确实不慢
- 本方案讨论的是 **computed 重算之后，模板内热函数的重复执行** → **完全不同的开销**

---

## 三、根因：模板内热函数 O(n) 全表扫描 + JSON.parse

### 3.1 触发链

```
任务流式输出
  → SSE chunk 到达（推理模型逐字吐 reasoning，频率极高）
  → chat.ts 的 chunkBuffer 累积，每 50ms flush 一次（scheduleFlush）
  → arr[idx].content 变化
  → store.currentMessages 变
  → messageRounds (computed) 重算 —— 实测 0.187ms，不慢 ✅
  → ★ 但返回**全新数组 + 全新 round 对象引用**
  → ChatMessageList 整棵 v-for 重新求值
  → ★★ 模板内所有「函数调用绑定」被重新执行（这才是元凶）
```

### 3.2 元凶：`getToolResult` / `isToolError` —— O(n) × JSON.parse

`packages/ui/src/composables/chat/useChat.ts`：

```js
function getToolResult(toolCallId: string): string | null {
  const toolMsg = store.currentMessages.find(m => m.role === 'tool' && m.toolCallId === toolCallId);
  //          ^^^^^^^^^^^^^^^^^^^^ O(n) 遍历全部消息（实测会话 445 条）
  if (!toolMsg?.content) return null;
  try {
    const parsed = JSON.parse(toolMsg.content);   // ★ 解析可能 15.8KB 的 JSON
    ...filter/map/join/JSON.stringify...
  } catch { return toolMsg.content; }
}

function isToolError(toolCallId: string): boolean {
  const toolMsg = store.currentMessages.find(m => m.role === 'tool' && m.toolCallId === toolCallId);
  //                          ^^^^^^^^^^^^^^^^^^^^ 同样的 O(n)
  ...JSON.parse(toolMsg.content)...
}
```

### 3.3 调用密度（模板内实测统计）

`ChatMessageList.vue` 里这几类函数**直接写在模板绑定里**（Vue 模板函数调用**不缓存**）：

| 函数 | 模板出现次数 | 每次内部复杂度 |
|---|---|---|
| `getToolResult(tc.id)` | **8 处** | O(n) 遍历 + JSON.parse |
| `getStepToolResult(step, tc.id)` | **10 处** | O(该 step 的 toolResults) |
| `isToolError` / `isStepToolError` | **6 处** | O(n) + JSON.parse（`isToolError`） |
| `resolveToolDisplay(tc)` | **6 处**（每个 tc 被调 3 次） | O(mcpServers) × 3 次正则 |
| `resolveToolArgs(tc)` | **2 处** | JSON.parse + stringify(2 空格缩进) |
| `toolTargetHint(tc)` | **2 处** | JSON.parse + 遍历 20 个 key |
| `toolMedia` / `resolveScreenshotUrl` / `detectPath` | **各 2-3 处** | 字符串处理 |

**算一笔账**（一屏 50 个工具调用、会话 445 条消息）：

```
getToolResult:     50 × 8  = 400 次/帧 × (445 遍历 + JSON.parse)
isToolError:       50 × 2  = 100 次/帧 × (445 遍历 + JSON.parse)
isToolGroupRunning: 每条 allToolCalls 组 × 组内每个 tc × 再调 getToolResult
                    → 又一层 O(n) 嵌套
```

⇒ 单帧约 **数万次数组遍历 + 数千次 JSON.parse**；流式期间 **每秒 20 帧**。
   这就是「滚动卡死」的物理来源。

### 3.4 为什么 Markdown LRU 缓存没救回来

`useChat.ts` 的 `renderMarkdown` 已有 LRU 缓存（`MD_CACHE_MAX=300`），但它**只覆盖 markdown 解析**。
`ChatMessageList.vue:805` 的 `renderAssistantMarkdown` 是**组件本地函数**，它在调缓存前**先做 4 次贪婪正则 + split**
（剥 `[TOOL_CALL]` / `<function=>` / `[[PLATFORM_CONFIG]]` / `@@REASON@@`）：

```js
function renderAssistantMarkdown(content?: string) {
  let c = content || '';
  c = c.replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, '')
       .replace(/\[TOOL_CALL\][\s\S]*$/i, '')
       .replace(/<function\s*=\s*\w+\s*>[\s\S]*?<\/function>/gi, '')
       .replace(/<function\s*=\s*\w+\s*>[\s\S]*$/i, '');
  c = c.replace(/\[\[PLATFORM_CONFIG:[^\]]*\]\]\s*$/g, '').split('\n@@REASON@@\n')[0].trim();
  return c.split(/(\[tool_call\])/g).map(...).join('');
}
```
⇒ **正则预处理未缓存，每次重渲都跑**（15.8KB × 每秒 20 次）。

---

## 四、方案（✅ 已全部实施）

### 🔴 P0-a — 建索引，把热函数从 O(n) 降为 O(1) ✅ 已完成

**做法**：新增 `utils/tool-result.ts`（纯函数模块，可单测）：
- `parseToolResultContent(raw)` —— 覆盖旧 `getToolResult` 的**全部 6 个分支**
- `buildToolResultIndex(messages)` —— 一次遍历建 `callId -> {content, isError}` Map

`useChat.ts` 加 `toolResultIndex` computed（`= buildToolResultIndex(store.currentMessages)`），
`getToolResult` / `isToolError` 改为 **O(1) 查表**：

```js
function getToolResult(id) { return toolResultIndex.value.get(id)?.content ?? null; }
function isToolError(id)   { return toolResultIndex.value.get(id)?.isError || false; }
```

★ 索引与 `messageRounds` **同源同生命周期**（都依赖 `store.currentMessages`）⇒ 天然不脏读。
★ 旧实现保留为 `getToolResultUncached`（仅供对照，模板不引用）。

### 🔴 P0-b — `renderAssistantMarkdown` 的正则预处理接进缓存 ✅ 已完成

- 实现从 `ChatMessageList.vue` **移入 `useChat.ts`**，整体（正则预处理 + markdown）作为缓存单元，
  独立 LRU（`assistantMdCache`，上限 200）
- `ChatMessageList.vue` 删本地实现，改为从 `useChat` 导入（4 处模板调用点不变）
- ⇒ 消除"平行实现漂移"，且正则不再每帧重跑

### 🟡 P1 — `resolveToolDisplay` / `resolveToolArgs` / `toolTargetHint` 加 WeakMap 缓存 ✅ 已完成

- 三个函数各加 `WeakMap<tc, result>` 缓存；原逻辑保留为 `*Uncached`
- ★★ **正确性关键**：`resolveToolDisplay` 依赖 `mcpStore.servers`（会变）⇒ 缓存条目**带上 servers 引用**，
  命中时 `hit.servers === servers` 才返回；否则重算（防 MCP 改名/新增后显示脏数据）
- ★ `WeakMap` 以 tc 对象为 key：tc 引用稳定（`messageRounds` 直接引用 `msg.toolCalls` 元素），
  只有 `tool_call` 事件（低频）会整组替换 ⇒ 高频 chunk 路径稳定命中，无泄漏

### 🟢 P2 — 减少无谓重渲（**未做，列为远期**）

- `v-memo` / 拆 `<ChatRound>` 子组件
- 评估：P0/P1 已消除主要开销（O(n) 全表扫描 + 未缓存正则）；重渲本身（Vue diff）经实测非瓶颈
- 若未来会话规模再上一个量级，再考虑虚拟滚动

---

## 五、验证（✅ 已完成）

| 断言 | 方法 | 结果 |
|---|---|---|
| 解析分支**与原实现一致** | `src/utils/tool-result.test.ts`（14 项：6 分支 + 索引行为） | ✅ 全过 |
| 索引**不脏读 / 首个优先 / 跳过非 tool** | 同上 | ✅ 全过 |
| 热函数**不得退回 O(n)** | `src/composables/chat/chatRenderPerf.test.ts`（15 项，扫源码） | ✅ 全过 |
| `renderAssistantMarkdown` **必须带缓存** | 同上 | ✅ 全过 |
| WeakMap 缓存 + **servers 引用比对** | 同上（④ 组 4 项） | ✅ 全过 |
| **变异测试**：getToolResult 改回 `find()` | 手工变异 → 测试变红（报"卡顿会回归"） | ✅ 抓住 |
| **变异测试**：组件加回本地 renderAssistantMarkdown | 手工变异 → 测试变红 | ✅ 抓住 |
| 无回归 | `packages/ui` 全量 vitest | ✅ **45 文件 / 670 通过**（5 跳过） |
| 类型安全 | `vue-tsc --noEmit` | ✅ exit 0 |

★ **待补（需要你的环境）**：真机跑一个长任务，观察滚动是否顺畅。
  更强的证据是 Playwright + `PerformanceObserver`（longtask）对比修复前后 —— 需要 dev 实例运行中。

---

## 六、一句话总结

- **卡** = 流式每 50ms 重渲整列表 × 模板内热函数 `getToolResult`/`isToolError` 每次 **O(n) 遍历 + JSON.parse** ⇒ 每秒数万次遍历 + 数千次解析。
- **修** = ①`toolResultIndex` computed 建 **callId 索引**，热函数降为 O(1)；②`renderAssistantMarkdown` 正则预处理**接进 LRU**；③纯函数用 `WeakMap`（`resolveToolDisplay` 带 servers 引用比对）。
- **不动** `messageRounds` computed 本身（已实测 0.187ms，非瓶颈）；虚拟滚动列为远期。

## 七、改动清单

| 文件 | 改动 |
|---|---|
| `packages/ui/src/utils/tool-result.ts` | **新增** —— 解析纯函数（`parseToolResultContent` / `buildToolResultIndex`） |
| `packages/ui/src/utils/tool-result.test.ts` | **新增** —— 14 项分支等价性 + 索引行为 |
| `packages/ui/src/composables/chat/useChat.ts` | 加 `toolResultIndex` computed；`getToolResult`/`isToolError` 改 O(1)；加 `renderAssistantMarkdown`（带 LRU）；`resolveToolDisplay`/`resolveToolArgs`/`toolTargetHint` 加 WeakMap；导出 3 个新符号 |
| `packages/ui/src/components/chat/ChatMessageList.vue` | 删本地 `renderAssistantMarkdown`；改为从 useChat 导入 |
| `packages/ui/src/composables/chat/chatRenderPerf.test.ts` | **新增** —— 15 项源码守门（防退回 O(n) / 防丢缓存） |
