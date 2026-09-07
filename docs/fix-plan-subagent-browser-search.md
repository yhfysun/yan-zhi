# 修复方案：子智能体可见性 / 浏览器 Tab 丢失 / pageAgent 桥接 / web_search

> 2026-09-06 排查，基于当前 dev0.1 源码逐行定位，未改任何代码。
> 每个问题给出：根因（文件:行号）→ 修复方案 → 验证方式 → 风险分级。

---

## 问题 1：子智能体执行过程前端看不到

### 根因（确认，硬 bug）

后端链路是完整的：`runSubAgent`（apps/server/src/llm-task-manager.ts:1005 起）会 emit `sub_agent:start` / `message:added` / `chunk`（带 subAgentId）/ `tool_call` / `sub_agent:end`；前端 SSE handler（packages/ui/src/stores/chat.ts:1436-1522）也正确把子智能体消息 push 进消息列表、chunk 按 `subAgentMsgIds` 路由。

断点在渲染层：子智能体消息被 `messageRounds`（useChat.ts:751-800）归入父 step 的 `subAgentRounds`，由 `SubAgentRoundView` 渲染。但 ChatMessageList.vue 三处渲染条件写的是：

```
ChatMessageList.vue:98   v-show="... tc.toolName === 'call_agent' && ..."
ChatMessageList.vue:105  v-if="tc.toolName !== 'call_agent'"
ChatMessageList.vue:112  v-if="tc.toolName === 'call_agent' && step.subAgentRounds?..."
```

而 `step.toolCalls` 里的对象是 `DeltaToolCall`（`{ id, function: { name, arguments } }`），**全项目没有任何地方给 toolCalls 项写入 `toolName` 字段**（grep 验证：chat.ts / useChat.ts 均只有读取）。所以 `tc.toolName === 'call_agent'` 恒为 false → **SubAgentRoundView 永远不渲染** → 子智能体的推理、工具调用、流式回复全部不可见，只剩 call_agent 工具卡片里的最终结果文本。

### 修复方案

1. 统一取名 helper（ChatMessageList.vue 或 useChat.ts）：
   ```ts
   const tcName = (tc: any) => tc.function?.name || tc.toolName || '';
   ```
   98 / 105 / 112 三处条件替换为 `tcName(tc) === 'call_agent'`。
2. 执行中即时可见：`sub_agent:start` 时对应 call_agent 工具卡片默认展开（`isToolItemOpen` 已支持第三参 forceOpen，可在 `runningToolCallIds.has(tc.id)` 时强制展开）；子智能体轮次出现后随 chunk 实时滚动。
3. 附带核对：后端对子智能体（depth=1）发出的 `tool:start` / `tool:result` 事件是否正常 emit（当前前端只对 browser_ 前缀消费，不影响本问题，验证时顺带确认）。

### 验证

让主智能体委派 pageAgent：工具卡片内应实时出现子智能体轮次（名称 / 推理 / 工具调用 / 流式回复），结束后显示 finalContent 卡片。

风险：**low**（纯渲染条件修复，不动数据流）。

---

## 问题 2：浏览器开两个 tab，切走再回来变回初始状态

### 根因（三个叠加）

1. **BrowserPanel.vue:1367 onMounted 无条件 `newTab()`**。每次组件挂载都新建一个空白 tab 并激活它。触发场景：`/browser ↔ /chat` 路由切换、对话页右侧预览窗 browser tab 重开。切回来看到的就是新空白 tab（起始页）——"变成初始的了"。
2. **两个 BrowserPanel 实例共享 store**：浏览器页（Browser.vue）和对话页（ChatPreviewPane.vue:46）各挂一个实例，交替挂载/卸载，每挂一次就多一个空 tab。主进程侧 `MAX_TABS=8`（main.cjs:39）+ LRU 逐出（main.cjs:532）——空 tab 反复累积很快占满 8 个，用户真实的百度/淘宝 tab 被 LRU 逐出（挂起后复活需重新加载，内容丢）。
3. **主进程与渲染层两套 activeTabId**：`browserView:ensureActiveTab`（main.cjs:819）只认主进程自己的 activeTabId。渲染层恢复后若激活 tab A，主进程记忆可能还是 B；pageAgent 导航会打到 B（用户看到另一个 tab 内容被覆盖或无反应）。

### 修复方案

1. **onMounted 改为恢复式**（核心，BrowserPanel.vue:1367）：
   ```ts
   onMounted(() => {
     if (tabs.value.length > 0) {
       // 恢复：激活原 activeTabId（失效则取最后一个有 url 的 tab），不新建
       const tid = activeTabId.value || [...tabs.value].reverse().find(t => t.url)?.id;
       if (tid) await switchTab(tid);
     } else {
       await newTab();
     }
     // 路由 query 初始 URL 逻辑保持不变
   });
   ```
   注意：主进程侧该 tab 可能已被 LRU 挂起——`activateTab` 会复活（main.cjs:475 注释确认复活路径存在），switchTab 已有 activateTab + bounds 同步，无需额外处理。
2. 空白 tab 不再累积后，LRU 逐出真实 tab 的诱因消除；`MAX_TABS=8` 保持不变。
3. （二期可选）tabs 列表持久化到 localStorage（URL 级），应用重启后恢复 tab 壳；主进程复活时按 tab.url 重新 load。

### 验证

浏览器页开百度 + 淘宝 → 切对话页（含点开任务）→ 切回浏览器页：两个 tab 原样、激活 tab 与离开时一致、tab 栏无新增空白 tab；对话页预览窗与浏览器页互切同样验证。

风险：**medium**——恢复路径要覆盖"主进程 tab 已被 LRU 挂起 / 已被 pageAgent 挪作他用"两种状态，需要实机验证。

---

## 问题 3：pageAgent 与预览不同一（对齐豆包 pageAgent 模式）

### 设计原则（用户定版）

**智能体操作和页面显示必须是同一套，不搞两套** —— pageAgent 操作的就是预览窗里那个 BrowserView 实例，所见即所操作（对齐豆包 pageAgent：打开浏览器 → 操作浏览器 → 页面实时显示）。工具集收口为精简四件套：

| 工具 | 作用 | 主进程 action（均已存在） |
|---|---|---|
| `browser_navigate` | 智能体访问 URL | `navigate` |
| `browser_type` | 在输入框输入内容（支持回车提交） | `type` |
| `browser_click` | 点击元素（搜索按钮等） | `click` |
| `browser_get_page_content` | **专门获取当前页面内容**：title + url + 可见正文 + 可交互元素，一次返回 | 新增聚合 action（合并现有 `get_page_info` + `get_visible_text`） |

执行通道唯一：后端 `tool:execute`（SSE）→ 前端 `dispatchToolCall` → `electronAPI.browserView.action(激活tab)` → 用户在预览窗实时看到虚拟操作。**此通道之外不再有第二条浏览器执行路径**。

### 现状根因（保留排查结论）

1. **渲染层无壳 = 导航黑洞**：`ensureActiveTab`（main.cjs:819-833）超时自建 tab，渲染层无壳即忽略（BrowserPanel.vue:1444）→ 导航发生但预览看不到。
2. **双套分裂**（违反单一执行面）：
   - 前端委托失败/超时 2 分钟 → 静默回退 server Playwright（llm-task-manager.ts:879-890）；
   - 桌面端未映射进 actionMap 的 browser_* 工具直接回退 Playwright（chat.ts:897）→ headless chromium，百度必弹验证码、预览完全分裂。
3. **Electron 默认 UA 未伪装**：main.cjs 无 `setUserAgent`，百度/淘宝风控高概率验证码。
4. **tab 标题永远是 URL**：主进程无 `did-page-title-updated` 监听，tab.title 恒空 → fallback 显示网址。

### 修复方案

1. **四件套工具面**：
   - 主进程新增聚合 action `get_page_content`（get_page_info + get_visible_text 合并，一次 IPC 给齐模型所需）；
   - core 内置工具新增 `browser_get_page_content`（描述引导模型：先 navigate → type → click → get_page_content 循环）；
   - pageAgent（a_builtin_page_agent）的 builtin_tool_ids 收口为四件套，prompt 按四件套流程改写。
2. **删除双套回退**（桌面端）：
   - 移除 chat.ts:897"未映射回退 Playwright"分支——未映射工具返回明确错误让模型换四件套工具；
   - llm-task-manager.ts:879-890 的超时回退改为直接报错（"前端浏览器不可达，请稍后重试"），不再静默切 Playwright；
   - Playwright 仅保留给 web 端（无 BrowserView）与无人值守（无订阅者）两个真实需要的场景，桌面在线时永远不走。
3. **UA 伪装**（一行级）：main.cjs 建 session 时 `setUserAgent`（标准 Chrome UA，去掉 Electron 标识）。
4. **tab 壳闭环**：主进程自建兜底 tab 时广播 `browserView:tabCreated(tid)`，渲染层补建 tab 壳（替换"无壳即忽略"分支），保证"主进程有 view ↔ 渲染层有壳"一一对应。
5. **page-title 事件**：`did-page-title-updated` → `send('browserView:pageTitle', tid, title)` → 更新 tab.title / ChatPreviewPane tab 名。

### 验证

对话内委派 pageAgent"打开百度搜 X"：预览面板自动展开 browser tab（真实 title"百度一下，你就知道"），navigate → type → click 全程虚拟操作实时可见，`get_page_content` 一次拿到搜索结果页正文，无验证码、无 Playwright 参与（结果注明执行器为预览 BrowserView）。

风险：**high**——tab 壳闭环与回退删除涉及主进程 + 渲染层 + chat 桥接三方协议；UA 伪装低风险但需回归登录态网站。

---

## 问题 4：web_search 经常搜不了

### 现状与根因

- server 端已重构为纯 fetch 链（apps/server/src/mcp/search-backend.ts）：默认 **DuckDuckGo HTML**（html.duckduckgo.com）→ Bing API（需 `YANZHI_BING_API_KEY`）→ 外部 endpoint（`YANZHI_SEARCH_ENDPOINT`）。Playwright 抓搜索页的错误路径已删（注释明确"永远不开浏览器"），**当前已不依赖宿主机浏览器环境**。
- 真正的问题：`html.duckduckgo.com` 在国内/受限网络**不可达** → 默认后端必失败；无 Bing key、无自定义 endpoint 时整个链没有可达出口 → "根本没用"。

### 修复方案（分层，仍坚持零浏览器依赖）

1. **多后端并发竞速**：`Promise.any` 同时打多个源，谁先成功用谁（替代现在的串行降级链），并保留每源健康探测缓存（web_search 启动探测思路复用）。
2. **接入国内可达源**（按推荐序）：
   - **博查 API**（bochaai.com，国内直连、按量付费、接口简单）——推荐默认付费源；
   - 智谱 web-search / 百度千帆 AI 搜索——用户已有 key 则优先；
   - **必应中国 cn.bing.com 纯 fetch HTML 解析**——零 key 零依赖兜底（明确注明：属于抓结果页 DOM，反爬/改版会崩，仅作最后兜底，结果页解析需带降级检测）；
   - Tavily / Serper——海外源放竞速池后位。
3. **配置面**：搜索源 + API key 进设置（环境变量继续支持），不硬编码；`YANZHI_SEARCH_ENDPOINT` 自定义源保持最高优先级。
4. **失败透明化**：多源全挂时聚合各源失败原因返回（现在是整体报错），方便定位是网络还是配置。

### 验证

受限网络 + 无 key：`web_search('近期新闻', timeRange=week)` 经 cn.bing 兜底返回结果；配博查 key 后走博查；全源不可达时报错信息含各源具体原因。

风险：**low/medium**——cn.bing 兜底有改版脆弱性（竞速池中失败自动切换，不影响可用性）；新增源均为独立后端类，符合现有 `SearchBackend` 接口。

---

## 实施顺序建议

| 优先级 | 内容 | 改动面 |
|---|---|---|
| P0 | 问题 1 toolName 条件修复（3 处） | ChatMessageList.vue，~5 行 |
| P0 | 问题 2 onMounted 恢复式挂载 | BrowserPanel.vue，~15 行 |
| P0 | 问题 3 UA 伪装 | main.cjs，~3 行 |
| P1 | 问题 3 四件套工具面 + 删除双套回退 + tab 壳闭环 + page-title 事件 | main.cjs / core / BrowserPanel / chat.ts |
| P1 | 问题 4 多源竞速 + cn.bing 兜底 + 博查 | core 新增后端类 + search-backend.ts |
| P2 | tab 列表 localStorage 持久化、搜索源设置页、子智能体过程 UX 增强 | 各自独立 |

风险分级：high = tab 壳闭环；medium = onMounted 恢复、cn.bing 兜底；low = 其余。

确认后按 P0 → P1 顺序实施，每步写→验→报。
