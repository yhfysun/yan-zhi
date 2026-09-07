# pageAgent 桌面端「所见即所操作」统一方案

> 2026-09-06 · 状态：**已实施（方案 A）**，`vue-tsc` + server `tsc --noEmit` 通过，dev server 已热重载，端到端待用户实测

## 0. 背景：本次故障的精确根因

现象：桌面端发送「打开百度搜索 主控芯片不良率」，pageAgent 打开了百度但无法输入搜索词，`locator.fill: Timeout 30000ms` 死循环。

根因在 **服务端工具分发的白名单**，`apps/server/src/llm-task-manager.ts:870-890`：

```ts
// 浏览器工具 → 在线（有 SSE 订阅者）委托前端 BrowserView 桥接，离线后端 Playwright
const isBrowser = toolName === 'browser_navigate' || toolName === 'browser_open_external';
if (isBrowser && task.subscribers.size > 0) {
  return executeToolViaFrontend(task, toolName, args, toolCallId, depth);  // → 预览 BrowserView
}
...
if (registry.has(toolName)) {
  const r = await registry.execute(toolName, args);  // ← 其余全部 browser_* 走这里：服务端 Playwright
}
```

即：**在线时只有 `browser_navigate` / `browser_open_external` 两个工具委托前端（→ 可见 BrowserView），其余 30+ 个 `browser_*` 工具全部落到服务端 headless Playwright**（`apps/server/src/routes/browser.ts:54`，`chromium.launch({ headless: true })`）。

结果是一个「双浏览器分裂」：

| 工具 | 实际执行位置 | 用户所见 |
|---|---|---|
| browser_navigate | 前端 → IPC → 预览 BrowserView | ✅ 预览面板打开百度 |
| browser_click / type / search / get_page_info / get_dom / … | 服务端 headless Playwright（从未被导航） | ❌ 空白页上 fill 30s 超时 |

讽刺的是，**前端→IPC→BrowserView 的完整通道早已建成**，白名单却没放开：

- `packages/core/src/tool/builtin/browser/index.ts:12-21`：`callBrowserApi` 检测到 `window.electronAPI` 时，把 `/navigate` 和 `/action` **全部**转发到 IPC；
- `apps/desktop/preload.cjs:82`：`browserView.action(tabId, action, args)` 通道已暴露；
- `apps/desktop/main.cjs:1032-1373`：`browserView:action` handler 已实现 **25 个 action**（navigate/click/type/press/scroll/hover/screenshot/get_page_info/get_visible_text/fill_form/submit_form/search/next_page/prev_page/wait_for/select_option/check/uncheck/get_text/get_dom/wait/new_tab/switch_tab/close_tab/get_tabs），含虚拟鼠标光标注入（`injectYzAssistant`，main.cjs:956）。

历史报错 `page.evaluate: ReferenceError: __name is not defined` 是另一个已修复的独立问题（esbuild keepNames helper 丢失，`browser.ts:103` addInitScript polyfill），当前 dev server 活体探测已不复现。

## 1. 目标

桌面端在线会话中，pageAgent（含子智能体路径）的**所有**浏览器操作直接作用于预览面板可见的 BrowserView——用户看到虚拟鼠标移动、打字、点击；Web 端与离线（无人值守）场景行为不变。

## 2. 方案对比

### 方案 A：放开在线委托白名单（推荐）

把 `llm-task-manager.ts:871` 的两工具白名单扩大为**全部 `browser_*` 工具**：在线 + 浏览器工具 → `executeToolViaFrontend`；离线 → 维持服务端 Playwright。

- ✅ 改动最小（服务端一处 + 前端删一处冗余桥接），复用已建成的 IPC 通道与 main.cjs 25 个 action 实现
- ✅ 天然覆盖子智能体：`runSubAgent` 与主任务共用 `task.subscribers`，其 `browser_*` 工具经 `tool:execute` SSE 到前端后同样走 IPC
- ✅ Web 端零回归：前端 `dispatchToolCall → registry.execute → callBrowserApi` 无 electronAPI 时自动回落 HTTP → 服务端 Playwright（core/index.ts:22-37 现有逻辑）
- ✅ 离线零回归：`subscribers.size === 0`（定时任务/IM 闭环）继续走服务端 Playwright，无人值守能力保留
- ⚠️ main.cjs 未实现的高级 action（drag/upload/visual_locate/wait_for_request/get_network_log/extract_list/get_a11y_tree/scroll_into_view/is_visible）需给出明确「不支持」提示，禁止静默打到 Playwright 造成分裂

### 方案 B：Playwright connectOverCDP 附着 Electron BrowserView

桌面端开 `remote-debugging-port`，服务端 Playwright `chromium.connectOverCDP` 附着 BrowserView 的 target。

- ✅ 直接复用 Playwright 全部语义（locator/auto-wait/network）
- ❌ 需给生产 Electron 开远程调试端口（本机任意进程可接管，安全面扩大）
- ❌ BrowserView 生命周期（R4 LRU 挂起/重建、crash reload）与 CDP target 发现强耦合，崩溃恢复复杂
- ❌ Playwright 输入注入与 Electron 自身输入/快捷键拦截（main.cjs:424 Ctrl+R 等）互相打架
- 结论：备选，不建议本期实施

### 方案 C：维持分裂 + 双写同步（本次临时 hack 的加强版）

- ❌ 两个浏览器实例状态必然分叉（预览看到的 ≠ 模型操作的），登录态/Cookie/验证码全不一致，本质是假同步。仅作为方案 A 落地前的过渡

## 3. 改动点清单（方案 A）

| # | 文件 | 改动 | 状态 |
|---|---|---|---|
| 1 | `apps/server/src/llm-task-manager.ts:870-893` | `isBrowser` 改为按前缀 `browser_` 判定，在线时全量 `executeToolViaFrontend`；新增委托失败/断连回退：AbortError 直接上抛，其余回退一次服务端 Playwright 并在结果注明执行位置；离线分支保持不变 | ✅ 已实施 |
| 2 | `apps/desktop/main.cjs` | ~~不支持的 action 统一明确报错~~ 实测发现 drag/upload/download/visual_locate/wait_for_request/get_network_log/extract_list/get_a11y_tree/scroll_into_view/is_visible **均已实现**（main.cjs:1387-1596），仅多标签 4 个 action 降级提示且语义明确 → 无需改动 | ✅ 无需改动 |
| 3 | `packages/ui/src/stores/chat.ts:797-803` | 已删除「同步导航 server Playwright」双写 hack；保留 `browser_navigate` 的 openTab/currentBrowserUrl 预览 tab 联动 | ✅ 已实施 |
| 4 | （并入 #1 的 catch 分支） | 委托失败回退 + 结果注明执行位置 | ✅ 已实施 |

不改动：`packages/core`（callBrowserApi 已就绪）、`preload.cjs`、BrowserPanel.vue、routes/browser.ts（Playwright 保留给 Web 端与离线）。

## 4. action 覆盖矩阵

| 状态 | action | 处理 |
|---|---|---|
| ✅ main.cjs 已支持（25 个） | navigate click type press scroll hover screenshot get_page_info get_visible_text fill_form submit_form search next_page prev_page wait_for select_option check uncheck get_text get_dom wait new_tab switch_tab close_tab get_tabs | 直接走 IPC |
| ⛔ main.cjs 未实现 | drag upload download visual_locate wait_for_request get_network_log extract_list get_a11y_tree scroll_into_view is_visible | 明确报错 + 引导（如 visual_locate → 引导用 get_page_info；upload/download 引导走 browser_open_external 或二期补 IPC） |
| ↩ 特殊 | browser_open_external | core 工具内直接走 shell.openExternal，不经 /action，不受影响 |
| ↩ 特殊 | browser_login_saved | 走 `/login-saved` 端点（非 /action），本期维持服务端 Playwright，文档注明 |

二期可选：把 drag/upload/scroll_into_view/is_visible 在 main.cjs 补齐（均为 executeJavaScript + DOM 事件，实现模式与现有 click/type 相同）；网络监听类用 `webContents.debugger` 或 session webRequest 实现。

## 5. 风险评估

| 风险 | 级别 | 缓解 |
|---|---|---|
| 在线判定依赖 `task.subscribers.size > 0`，SSE 瞬断时浏览器工具落到 Playwright，分裂复现 | **medium** | 改动 #4 超时回退 + 结果注明执行位置；前端已有 reconnectActiveTask 重连机制 |
| main.cjs 的 `get_page_info` 元素编号注册表（`__yzElements`）存于页面内存，页面导航后失效 | **low** | 与 Playwright 语义一致（index 失效 → 重新 get_page_info），工具返回已带该提示 |
| 打包版：server runtime 依赖清单同步（prepare-server-runtime.cjs） | **low** | 本次不新增 npm 依赖，无影响；core 为 cpSync 源码拷贝，自动随包 |
| 子智能体工具 2min 委托超时（executeToolViaFrontend timer）内未完成慢页面操作 | **low** | browser_* 多数 action 秒级返回；wait_for 上限 30s < 2min |
| 删除 chat.ts Playwright 同步后，若 #1 未生效会出现 navigate 后工具仍打旧页 | **low** | #1 与 #3 同一提交落地，dev 验证通过再合入 |

## 6. 验证计划

- ✅ 桌面端 dev（1420/3001）：重发「打开百度搜索 主控芯片不良率」→ 预览面板全程可见虚拟鼠标移动/输入/跳转结果页，无 locator.fill 超时；期间 `/api/browser/state` 应无变化（Playwright 不被触碰）
- ✅ 子智能体路径：call_agent 委派 pageAgent（depth=1），工具经 tool:execute → 前端 IPC，消息流中工具结果含 `via:'real-mouse'`/BrowserView 特征
- ✅ Web 端 5173：同任务回归，走服务端 Playwright，行为与现状一致
- ✅ 离线：关闭前端页面触发定时任务/IM 闭环 → 服务端 Playwright 正常执行（无人值守不回归）
- ✅ 静态检查：`vue-tsc --noEmit`（packages/ui）+ server tsx 编译 + `vite build`（apps/web）
- ✅ 打包链：`electron:build` 后在打包版重复桌面端用例

## 7. 与本次已上线临时修复的关系

| 已上线 | 处置 |
|---|---|
| chat.ts SSE `message:added` 补 `parentToolCallId`（重复气泡修复） | **保留**，独立 bug 的正式修复 |
| chat.ts 桌面端 navigate 同步 Playwright（双写 hack） | 方案 A 落地时**删除**（见改动 #3） |
