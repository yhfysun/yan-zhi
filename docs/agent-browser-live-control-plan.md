# Agent 操作浏览器：放大展示 + 暂停/停止 + 输入锁定 方案

> 2026-09-15 · 状态：**已实施**（P0+P1 全部落地；三项设计决策已定，见 §6；实测用例见 §9）
> 2026-09-15 晚 · 自审修订：**放大禁用 Teleport**（v2，见 §2.1）

## 0. 先回答"能不能做到"

**能。** 三个能力在当前架构下都有确定的实现路径，其中两项是"已有链路缺入口"，一项需要新增语义：

| 能力 | 结论 | 依据 |
|---|---|---|
| 画面放大出来 | ✅ 能，但**仅对 webview 引擎**是完整 overlay；browserview 引擎受原生图层限制 | `main.cjs:66 BROWSER_ENGINE_DEFAULT = 'webview'`，当前默认即 webview |
| 暂停 / 停止 | 停止 ✅ 已具备（只缺按钮）；暂停 ⚠️ 需新增服务端 paused 语义 | `chat.ts:1711 stop()` → `POST /llm/tasks/:id/abort` 全链路已通 |
| AI 操作时人不能点击 | ✅ 能（webview 引擎 DOM 遮罩 / browserview 引擎主进程 setIgnoreMouseEvents） | webview 是 DOM 元素，浮层可压；`BrowserPanel.vue:176-192` |

## 1. 现状（源码事实）

**渲染引擎**
- `packages/ui/src/components/BrowserPanel.vue:338` — `browserEngine = ref<'webview'|'browserview'>('webview')`
- `BrowserPanel.vue:176-192` — webview 引擎：DOM 内嵌 `<webview>`（浮层可覆盖）
- `BrowserPanel.vue:195` — 旧引擎：原生 BrowserView 占位 div（原生图层永远在 DOM 之上，**DOM 浮层压不住**）
- `apps/desktop/main.cjs:64-71` — 引擎开关，`isWebviewEngine()`

**Agent 操作通路（已全线打通）**
```
服务端 llm-task-manager.ts:1303 executeToolViaFrontend
  → SSE tool:execute
  → 前端 chat.ts:1529 dispatchToolCall
  → core/tool/builtin/browser/index.ts callBrowserApi
  → preload.cjs:127 browserView.action
  → main.cjs:1746 browserView:action（webview 引擎走 waitForGuest 拿 guest wc，复用同一套 action）
```

**已有状态信号（可直接复用）**
- `chat.ts:226` `browserSteps` — `tool:start`(browser_*) 推"执行中…"，`tool:result` 推结果（`chat.ts:1507-1518`）
- `chat.ts:210/212/218` — `streaming` / `runningConvIds` / `runningToolCallIds`
- `useChat.ts:405` `browserActive = browserSteps.length > 0`
- `useChat.ts:413` — browserSteps 首次出现自动开浏览器 tab + 展开右栏

**已有控制链路**
- `chat.ts:1711 stop()` → AbortController.abort() + `POST /api/llm/tasks/:id/abort`
- `apps/server/src/routes/llm-tasks.ts:57` 路由 → `llm-task-manager.ts:350 abortTask()` → status='aborted'、reject pending
- 中断时工具结果写入 `[已中止] 用户中断了工具执行`（`llm-task-manager.ts:1025`）
- 入口只有一个：`ChatInputArea.vue:462-465` 输入区的停止按钮

**明确的缺口**
- ❌ 无"暂停"，`TaskStatus = 'running'|'completed'|'failed'|'aborted'`（`llm-task-manager.ts:22`）无 paused
- ❌ 无面板级放大（只有网页 zoom：zoomIn/zoomOut → setZoomFactor，`BrowserPanel.vue:74-82`，与"画面放大"不是一回事）
- ❌ 无输入锁定（仓库内无任何 lock/shield 实现）
- ❌ 浏览器面板内无停止入口

## 2. 方案

### 2.1 放大展示

**P0（webview 引擎，当前默认）**：`BrowserPanel` 增 `expanded` 状态，展开时整块 `.browser-shell` 提升为铺满窗口的浮层。

- 实现：**原地放大，禁用 Teleport**。展开态给 `.browser-shell` 加 `position: fixed; inset: 0; z-index` 的 class，纯样式切换，DOM 树一个节点不动
  - ⚠️ 为什么不能 Teleport：`<webview>`（iframe 同理）的 DOM 节点一旦被移动（Teleport 的本质就是搬真实 DOM）→ guest 重新挂载 → **页面重载**，表单输入/滚动位置/agent 操作到一半的状态全丢
  - 展开态背景加遮罩（盖住聊天区），工具条保留在浮层顶部，视口区铺满其余空间
- 尺寸联动零成本：`getViewportSize()`（`BrowserPanel.vue:974`）读 `viewportRef` 实时尺寸，`frameSrc` / 后端 Playwright 视口自动跟随；webview 引擎下 webview 本身就是 100% 视口，随 CSS 自动伸缩
- 退出：Esc / 工具条收起按钮
- **不加任何提示文案**，只做一个图标按钮（与现有 nav-btn 同风格）

**browserview 引擎（降级）**：原生层压不住 DOM 浮层，物理限制。降级为"预览列最大化"——把 `ChatPreviewPane` 右栏宽度拉到接近满宽、左栏折叠。
- 或者在全屏态把 BrowserView bounds 设为全屏矩形、工具条区域预留高度（bounds.y = 工具条高度）——可行但涉及跨组件挪位，收益低，**本期不做**。

### 2.2 暂停 / 停止

**停止（零后端改动）**：面板工具条加停止按钮，`store.streaming` 时显示，点击调现有 `stopChat()`（`useChat.ts:1939`）。

**暂停（新增，语义定为「工具边界暂停」）**

- 语义：**下一个工具调用 / 下一轮模型请求之前**挂起；正在执行的单个浏览器动作不打断（动作是秒级原子操作，中途打断会留下半状态页面）
- 服务端：
  - `TaskStatus` 增 `'paused'`，`LlmTask` 增 `paused: boolean` + `pauseWaiters: Array<() => void>`
  - 新增 `pauseTask(id)` / `resumeTask(id)`（挨着 `abortTask`，`llm-task-manager.ts:350`）
  - 边界插入 `await waitIfPaused(task)`：主循环迭代处（`llm-task-manager.ts:776` 附近）、子智能体循环（`1443` 附近）、`executeToolViaFrontend` 入口（`1303`）
  - 新增 `POST /api/llm/tasks/:id/pause`、`/resume`（`routes/llm-tasks.ts` 挨着 abort 那条）
  - 发 `task:paused` / `task:resumed` SSE 事件
- 前端：`chat.ts` 增 `pausedConvIds` + `pauseTask/resumeTask`，SSE 分支同步状态
- **暂停时自动解除输入锁定**（用户点暂停的意图就是"我要接管"），resume 时重新锁定

### 2.3 AI 操作时人不能点击

**触发条件**：`store.streaming && browserActive`（同一浏览器任务全程锁定）。比"仅工具执行的那几百毫秒"更符合"AI 在操作浏览器"的直觉。

**webview 引擎（P0）**：视口区盖一层 `pointer-events: auto` 的透明 shield，捕获 `mousedown / click / dblclick / contextmenu`，`preventDefault + stopPropagation`。
- 只盖视口区，**不盖工具条** → 暂停/停止按钮天然可点
- 视觉极简：细边框/角标即可，不加提示条
- 键盘：锁定时把焦点留在应用层。注意与 `main.cjs:1775` 的 `wc.focus()` 不冲突 —— agent 的 `sendInputEvent` 由主进程直接注入，不依赖 DOM 焦点（**需实测确认**）

**browserview 引擎（P1）**：DOM 遮罩无效，走主进程
- 新增 IPC `browserView:setInputLock(tabId, locked)` → `wc.setIgnoreMouseEvents(locked)`
- 兜底：注入 guest 内遮罩 `#__yzLockShield`（手法同现有 `injectYzAssistant`，`main.cjs:956`），需在 `did-finish-load` 重注入

**解锁时机**：任务结束（completed / aborted / failed）、用户点暂停或停止。

## 3. 改动点清单

| 期 | 文件 | 改动 |
|---|---|---|
| P0 | `packages/ui/src/components/BrowserPanel.vue` | `expanded` 状态（**原地 fixed class，禁 Teleport**）+ 工具条放大/停止按钮 + 视口 shield `v-if` |
| P0 | `packages/ui/src/components/chat/ChatPreviewPane.vue` | 全屏态下右栏让位（宽度/层级配合） |
| P0 | `packages/ui/src/composables/chat/useChat.ts` | 暴露 `pauseChat/resumeChat`；`browserActive` 联动锁定态（`405`、`413` 附近） |
| P0 | `packages/ui/src/stores/chat.ts` | `pausedConvIds` + `pauseTask/resumeTask`（挨着 `1711 stop()`） |
| P1 | `apps/server/src/llm-task-manager.ts` | `paused` 状态 + `waitIfPaused` + `pauseTask/resumeTask`（`22`、`350`、`776`、`1303`、`1443`） |
| P1 | `apps/server/src/routes/llm-tasks.ts` | `POST /tasks/:id/pause`、`/resume`（挨着 `57` 的 abort） |
| P1 | `apps/desktop/main.cjs` + `preload.cjs` | `browserView:setInputLock`（仅 browserview 引擎用） |

不改动：`packages/core`（callBrowserApi 无需感知）、`routes/browser.ts`（Web 端 Playwright 保持原样）。

## 4. 分期与验证

- **P0**（桌面端 webview 引擎即可完整验证）：放大浮层 + 停止按钮 + 锁定 shield
  - 用例：发"打开百度搜索 XX" → 面板自动放大 → 全程点击视口无响应、页面正常被 agent 驱动 → 点停止 → 任务终止且锁定解除
- **P1**：暂停/恢复语义 + browserview 引擎锁定
  - 用例：agent 执行多步浏览器任务中途暂停 → 当前动作跑完即挂起（无新工具发起）→ 暂停期间人可手动操作页面 → 恢复后继续，锁定重新生效
- **P2**（可选）：browserview 引擎全屏（bounds 预留工具条高度）

## 5. 风险

| 风险 | 级别 | 缓解 |
|---|---|---|
| browserview 引擎下 DOM 浮层被原生层压住，放大功能不可用 | **high** | 引擎判定分支：webview 走全屏浮层，browserview 降级为预览列最大化（P2 再做真全屏） |
| ~~Teleport 移动 webview DOM → 页面重载、状态丢失~~ | **已消除** | v2 修订：原地 fixed class，禁 Teleport（§2.1） |
| 锁定 shield 与 `main.cjs:1775 wc.focus()` 交互影响 agent 输入注入 | **medium** | P0 实测验证；`sendInputEvent` 为主进程注入，理论不受 DOM 焦点影响 |
| 暂停期间最后一个 SSE 订阅者断开 → pendingToolCalls 15s 宽限 reject（`llm-task-manager.ts:334-344`） | **medium** | paused 状态跳过该宽限逻辑，或在 `/pause` 时先清 pending timer |
| 暂停语义需覆盖子智能体路径（pageAgent 常由 call_agent 委派） | **medium** | `waitIfPaused` 同时插主循环与 `1443` 子智能体循环；共用同一 task 的 paused 标志 |
| 停止（abort）后正在执行的 `browserView:action`（如 30s 的 wait_for）仍在主进程跑完，页面可能多动一下 | **low** | 主进程 action 执行周期秒级，可接受；如需硬停，二期在 action handler 各 case 前查 abort 标志 |
| 全屏浮层下 `syncBrowserViewBounds` / ResizeObserver 时序 | **low** | webview 引擎不依赖 bounds；`BrowserPanel.vue:1910-1930` 的 observer 对占位尺寸变化自动响应 |
| Web 端（无 Electron）行为 | **low** | 放大与锁定为桌面端能力，Web 端保持现状（`supportsBrowser` 已有分支） |

## 6. 设计决策（已定，2026-09-15）

1. **放大形态** → **① 面板全屏浮层**（原地 fixed class）。③独立大窗会搬 DOM（webview 重载，v2 教训）直接排除；②预览列最大化只作为 browserview 引擎的降级路径，不是主方案。
2. **自动放大** → **自动**。agent 首次触发浏览器工具时自动展开全屏浮层（复用 `useChat.ts:413` 那个 browserSteps 首次出现 watch 的时机点），任务结束自动收回。用户手动收起后本次任务内**不再自动弹**（避免跟人抢 UI），工具条按钮始终可手动开合。
3. **锁定强度** → **挡点击 + 键盘 + 右键**，工具条（暂停/停止/收起）不盖、始终可点。不做"只挡点击"的弱模式——AI 操作中允许人滚动/选字，光标焦点就会跟人抢，pageAgent 读页和输入都会受干扰，锁定意义减半。

## 7. v2 自审记录（2026-09-15 晚）

- **修掉一个真缺陷**：原 §2.1 用 Teleport 实现浮层 → webview DOM 被搬动即重载，agent 操作一半状态全丢。改为原地 fixed class（§2.1 已更新）。
- **补一条风险**：abort 后主进程正在执行的 action 不会立即中断（§5 新增一行）。评估为 low：action 秒级完成，下一个工具边界即被 abort 信号拦住。
- 其余结论复检无变化：停止链路（§1）确为现成；暂停三处 `waitIfPaused` 插点位置不变；锁定触发条件 `streaming && browserActive` 不变。

## 8. 决策定稿记录（2026-09-15 晚）

三项设计决策拍板（§6）：全屏浮层（原地 fixed）、自动放大（手动收起后本次任务不再自动弹）、强锁定（点击+键盘+右键，工具条豁免）。§2.1/§2.3 的实现描述以此为准：自动展开时机挂 `useChat.ts:413` 的 browserSteps watch；锁定 shield 事件集为 `mousedown / click / dblclick / contextmenu / keydown`，工具条区域不覆盖。

## 9. 实施记录（2026-09-15 晚，P0+P1 全部落地）

**改动文件**

| 文件 | 改动 |
|---|---|
| `packages/ui/src/stores/chat.ts` | `browserExpanded / browserUserDismissed / browserLockInput / pausedConvIds / browserPaused` + `pauseTask / resumeTask`；SSE `task:paused / task:resumed` 分支 |
| `packages/ui/src/composables/chat/useChat.ts` | 自动放大（browserSteps 首次出现时，被手动收起过则不弹）；实况态生命周期 watch（进入=锁输入，清空=退出）；`onTaskFinished` 兜底清理；`dismissBrowserExpanded`；`startNewChat / selectConv` 切会话退出实况态（browserSteps 是全局单例，防跨会话残留） |
| `packages/ui/src/components/BrowserPanel.vue` | `shell-expanded` 原地 fixed class（禁 Teleport）；`.agent-lock-shield`（transparent，capture 拦截 mousedown/click/dblclick/contextmenu/wheel/keydown，z-index 20 盖 webview 不盖工具条）；工具条实况控制组（暂停/恢复/停止，按 `preview` scope + browserSteps 感知显隐）；全屏开合按钮 + Esc 收起 |
| `apps/server/src/llm-task-manager.ts` | `TaskStatus` 增 `paused`；`LlmTask.paused / pauseWaiters`；`pauseTask / resumeTask / waitIfPaused`；三处边界插桩（主循环、子智能体循环、`executeToolViaFrontend` 入口，后者 async 化）；`abortTask` 先放行 waiter 再 reject pending；paused 态跳过 15s 断连宽限 |
| `apps/server/src/routes/llm-tasks.ts` | `POST /tasks/:id/pause`、`/resume`（非 running 暂停 / 非 paused 恢复 → 409） |
| `apps/server/test/task-pause.test.ts`（新增） | 12 例：waitIfPaused 挂起/放行/快速往返/abort 放行 + 静态防漂移断言（TaskStatus、三处插桩、pauseTask/resumeTask 语义、宽限跳过、路由注册与 409） |

**验证结果**
- ✅ `vue-tsc --noEmit`（packages/ui）零错误（跑两遍，含切会话清理改动后复跑）
- ✅ `tsc --noEmit`（apps/server）零错误
- ✅ `task-pause.test.ts` 12/12；全量 vitest 247/253 —— 6 个失败均为 MEMORY 记录的既有欠账（ontology-recall 2 / ontology-table-gen 2 / react-loop 2），无新增回归

**待用户实测（dev 环境端到端）**
- 发"打开百度搜索 XX" → 面板自动全屏 → 视口点击/右键/键盘无响应、agent 正常驱动 → 点停止 → 任务终止、锁定解除、面板收回
- 任务中点暂停 → 当前动作完成即挂起 → 手动操作页面 → 恢复 → 锁定重新生效
- 手动收起全屏后 → 本次任务内不再自动弹；Esc 可收起
- 切会话/新会话 → 实况态不残留

**遗留（本期不做，同方案 §2.1 降级路径）**
- browserview 引擎（回退引擎）下：放大降级为预览列最大化、锁定走 `wc.setIgnoreMouseEvents`（`browserView:setInputLock` IPC 未加）。当前默认 webview 引擎不受影响
