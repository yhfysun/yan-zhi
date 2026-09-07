# 言智项目问题分析与修复报告

> 报告时间：2026-09-06 ｜ 分支：dev0.1 ｜ 范围：桌面端 BrowserView 残留 + 安卓端无后端



***

## 问题一：桌面端 HMR 后预览面板关闭，浏览器页面仍悬浮显示

### 1.1 现象

代码热更新（HMR）后，右侧预览面板（DOM）默认关闭，但 Electron 原生 BrowserView 渲染的网页仍悬浮在窗口上，无法通过 UI 操作关闭。表现为 "预览页面没了，浏览器页面还在"。

### 1.2 根因分析

**技术背景**：言智桌面端使用 Electron 原生 `BrowserView`（而非 `<webview>` 标签或 iframe）承载网页预览。`BrowserView` 是**主进程管理的原生图层**，独立于渲染进程的 DOM 树，其生命周期**不会自动跟随前端组件**，必须通过 IPC 手动同步显隐和 bounds。

**失效链路**：



1. **主进程状态持久**：HMR 只重载渲染进程模块，主进程 `browserViews` Map（`main.cjs:28`）中的 tab 实例、`entry.visible`、`entry.attached` 状态全部保留。

2. **前端&#x20;**`onUnmounted`**&#x20;hide 可能失效**：`BrowserPanel.vue:1514-1519` 虽有遍历 `tabs.value` 调用 `hide()` 的逻辑，但 HMR 模块替换时，旧生命周期回调的闭包可能引用新模块的空状态（`tabs.value` 已被重置），导致 hide 遍历空数组，旧 tab 未被隐藏。

3. **新组件&#x20;**`onMounted`**&#x20;隐藏了错误的 tab**：`onMounted` 中 `newTab()` 是异步 IPC，`syncBrowserViewBounds()` 同步先执行时 `activeTabId` 为空；等 rAF 回调时新空 tab 已创建，`hide()` 隐藏的是**新空 tab**，而**旧的有 URL 的 tab 变成孤儿**，永远不会被新组件操作。

4. **主进程无兜底**：主进程未监听渲染进程重载事件，无法在导航起点统一清理 BrowserView。

**为什么 WorkBuddy / Trae 没有这个问题**：它们基于 VS Code 架构，使用 VS Code 封装的 Webview API（生命周期由编辑器视图系统严格接管，视图关闭即销毁），而非 Electron 原生 BrowserView。`<webview>` 标签和 iframe 同样跟随 DOM 生命周期自动销毁。言智选择 BrowserView 是为了精确 setBounds、独立渲染进程高性能和浏览器自动化配合，但代价是手动生命周期管理的复杂度。

### 1.3 修复内容

**文件**：`apps/desktop/main.cjs`（新增 `did-start-navigation` 监听，约 249-261 行）



```
// 渲染进程完整重载（HMR full-reload / F5）时，隐藏并摘除所有 BrowserView。

// BrowserView 是主进程原生图层，生命周期不跟随渲染进程 DOM；HMR 只替换渲染模块、

// 主进程 browserViews Map 不动，旧组件 onUnmounted 的 hide 可能因模块闭包替换而失效，

// 导致预览面板已关、网页却还浮在窗口上。这里在导航起点统一摘除，是不依赖渲染状态的兜底。

// SPA 内部路由（pushState）不会触发 did-start-navigation，不误伤。

mainWindow.webContents.on('did-start-navigation', (\_e, \_url) => {

&#x20; for (const entry of browserViews.values()) {

&#x20;   if (!entry.view) continue;

&#x20;   entry.visible = false;

&#x20;   entry.bounds = null;

&#x20;   applyVisibility(entry);

&#x20; }

});
```

**修复原理**：



* `did-start-navigation` 在渲染进程**完整页面导航开始时**触发（HMR full-reload、F5、手动 reload 都会触发）。

* SPA 内部路由（Vue Router 的 pushState/replaceState）**不会触发**此事件，不误伤正常使用。

* 遍历所有 `browserViews`，统一走 `applyVisibility(entry)` 收敛函数摘除（`removeBrowserView` + `setBrowserView(null)` 双保险 + 后台节流），根治 Windows GPU 合成层残留。

* 不依赖渲染进程的任何状态，是纯主进程兜底。

**修复层级**：



* 第一道防线：前端 `onUnmounted` hide（正常组件销毁场景）。

* 第二道防线（本次新增）：主进程 `did-start-navigation` 兜底（HMR /reload 等异常场景）。

### 1.4 验证方法



1. **HMR 复现验证**：启动 `pnpm dev:desktop`，打开浏览器预览任意网页，修改 `packages/ui` 下任意文件触发 HMR，确认 BrowserView 随面板关闭而摘除，无悬浮残留。

2. **F5 验证**：在预览面板打开网页时按 F5（注意：F5 被 `before-input-event` 拦截为刷新 BrowserView，需用 DevTools 的 reload 或 Ctrl+Shift+R 触发主窗口 reload），确认 reload 后 BrowserView 被摘除。

3. **正常使用回归**：正常打开 / 关闭预览面板、切换 tab、切换浏览器 / 文件模式，确认 BrowserView 显隐正常，bounds 对齐。

4. **SPA 路由不误伤**：在聊天页和浏览器页之间切换（Vue Router 内部导航），确认 BrowserView 不被误摘除。

5. **语法检查**：`node --check apps/desktop/main.cjs` 已通过。

### 1.5 后续优化建议（非必须）



* **中期评估**：如果浏览器预览不需要 BrowserView 的独特能力（精确 bounds、自动化），可评估换回 `<webview>` 标签，彻底消除手动生命周期管理的复杂度。

* **增强前端**：在 `onMounted` 的 `newTab().then()` 回调中补一次 `syncBrowserViewBounds(true)`，确保新 tab 创建后能正确同步（当前依赖 ResizeObserver 和 watch 兜底，非必须）。



***

## 问题二：安卓端（APK）无后端，核心功能不可用

### 2.1 现象

构建出的 `app-debug.apk` 安装后，聊天、知识库、商城、记忆等功能全部不可用，表现为 API 请求失败或无响应。

### 2.2 根因分析

**架构事实**：



1. **后端只在桌面端内嵌启动**：`apps/desktop/main.cjs:98-181` 的 `startServer()` 在 Electron 启动时用 `spawn` 拉起 `apps/server`（dev 用 tsx，prod 用打包后的 index.js），监听 `127.0.0.1:3001`。移动端 APK 不包含此逻辑。

2. **后端只绑定回环地址**：`apps/server/src/index.ts:100` `app.listen(PORT, '127.0.0.1', ...)` —— 即使后端跑在电脑上，手机也无法通过局域网 IP 访问。

3. **移动端 API 基地址指向手机本机**：`packages/ui/src/api/client.ts:4`



```
export const API\_BASE = isElectron ? 'http://127.0.0.1:3001/api' : '/api';
```

移动端 `isElectron = false`，`API_BASE = '/api'`。在 Capacitor Android WebView（`androidScheme: 'https'`）中，`/api` 被解析为 `https://localhost/api` —— 指向**手机本机的 3001 端口**，而手机上没有后端服务。



1. **移动端无后端地址配置入口**：全项目搜索 `serverUrl`/`apiBase`/`后端地址` 等关键词，移动端无任何配置后端地址的机制。

2. **核心功能全部依赖&#x20;**`/api`：

* 聊天：`chat.ts` 中 `API_BASE/llm/tasks/${taskId}/stream`、`/tool-result`、`/abort` —— LLM 任务由后端代理，非前端直连模型。

* 知识库：`/knowledge/*` 路由在 `apps/server`。

* 商城：`/marketplace/*` 路由在 `apps/server`。

* 记忆：`memory.ts` 中 `API_BASE + path`。

* 智能体 / 工作流：`agent.ts` 中 `API_BASE/workflow/runs/*`。

1. **移动端本地存储只覆盖部分数据**：`apps/mobile/src/platform.ts` 的 Capacitor SQLite 插件只存会话 / 配置 / 平台配置 / 工具等本地数据，共享数据（知识库等）按设计统一存服务端。

**结论**：安卓端不是 "部分功能不可用"，而是**架构上依赖一个永远不存在的本地后端**——APK 只打包前端 Web 资源，既没有内嵌后端进程，也没有配置外部后端地址的入口，服务器还只监听 127.0.0.1。

### 2.3 修复方案（三条路径对比）



| 维度           | 方案 A：连远程节点（推荐先做）              | 方案 B：内嵌 Node.js 后端                                                      | 方案 C：移动端瘦身后端                              |
| ------------ | ----------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| **原理**       | 手机连接跑在电脑 / 服务器上的言智后端（节点互联）    | APK 内嵌入 Node.js 运行时，跑完整 apps/server                                     | 移动端本地 SQLite 承接全部数据，聊天改直连模型               |
| **工作量**      | 0.5\~1 天                      | 2\~4 周（含原生模块交叉编译）                                                       | 4\~6 周（重写聊天链路）                            |
| **离线可用**     | 否（需网络连后端）                     | 是                                                                       | 是                                         |
| **体积增加**     | 0                             | +30\~80MB（Node 运行时 + 原生模块）                                              | 少量                                        |
| **技术难点**     | 无（改配置 + 监听地址 + cleartext）     | better-sqlite3、sqlite-vec 需为 Android ABI 交叉编译；playwright 需禁用；Node 运行时集成 | 聊天从 "后端代理" 改为 "前端直连模型"，流式 / 工具调用 / 记忆全部重写 |
| **与项目理念契合度** | 高（"节点互联" 是言智核心理念，移动端本就应是轻客户端） | 中（移动端变重节点，违背轻客户端定位）                                                     | 低（需维护两套后端逻辑）                              |
| **现成方案**     | 需自行实现配置入口                     | Capacitor-NodeJS 插件（基于 nodejs-mobile）、better-sqlite3-nodejs-mobile 预编译  | 无现成方案                                     |

### 2.4 推荐实施路径

**第一步（立即做，0.5\~1 天）：方案 A — 让移动端能连远程后端**



1. `packages/ui/src/api/client.ts`：增加移动端 API 基地址配置。Capacitor 环境（`window.Capacitor` 存在）下，从 `localStorage`/`Preferences` 读取用户配置的后端地址，默认空（空时提示配置）。



```
const isCapacitor = typeof window !== 'undefined' && !!(window as any).Capacitor;

const mobileApiBase = isCapacitor ? (localStorage.getItem('mobile\_api\_base') || '') : '';

export const API\_BASE = isElectron

&#x20; ? 'http://127.0.0.1:3001/api'

&#x20; : (mobileApiBase ? mobileApiBase.replace(/\\/\$/, '') + '/api' : '/api');
```



1. `apps/server/src/index.ts`：监听地址从 `'127.0.0.1'` 改为 `process.env.HOST || '127.0.0.1'`，允许通过环境变量 `HOST=0.0.0.0` 暴露到局域网。

2. `apps/mobile/android/app/src/main/AndroidManifest.xml`：`application` 标签加 `android:usesCleartextTraffic="true"`（Android 9+ 默认禁止 http 明文，局域网后端通常是 http）。或配置 `networkSecurityConfig` 仅允许特定局域网 IP。

3. **设置页增加 "后端地址" 配置项**：输入框 + 连通性测试按钮，保存到 `localStorage`/Capacitor Preferences。

4. **使用方式**：电脑跑 `HOST=0.0.0.0 pnpm dev`（后端监听 0.0.0.0:3001），手机连同一 WiFi，在 App 设置里填 `http://电脑局域网IP:3001`，即可使用完整功能。

**第二步（中长期，按需）：方案 B — 内嵌 Node.js 后端实现离线可用**



1. 集成 `Capacitor-NodeJS` 插件（`hampoelz/Capacitor-NodeJS`，基于 nodejs-mobile），在 Android 原生层启动 Node.js 运行时。

2. 将 `apps/server` 打包为移动端可运行的版本：

* `better-sqlite3`：使用 `better-sqlite3-nodejs-mobile` 预编译包，或自行用 NDK 交叉编译（arm64-v8a /armeabi-v7a /x86\_64）。

* `sqlite-vec`：Android 支持目前是 open issue（`asg017/sqlite-vec#68`），需自行编译 `.so` 扩展，或暂时降级为关键词检索。

* `playwright`：移动端禁用（README 已声明移动端不支持浏览器自动化），相关路由和依赖需条件裁剪。

* `tesseract.js`、`adm-zip`、`ws`、`mysql2`、`pg` 等纯 JS 依赖可直接使用。

1. Node.js 后端在手机上监听 `127.0.0.1:3001`，前端 `API_BASE` 在 Capacitor 环境默认指向 `http://127.0.0.1:3001/api`。

2. 体积预估：Node 运行时～15MB + 原生模块～10MB + 后端代码～5MB，合计增加～30MB。

### 2.5 验证方法（方案 A）



1. 电脑执行 `HOST=0.0.0.0 pnpm dev`，确认后端监听 `0.0.0.0:3001`（`netstat -ano | findstr 3001` 验证）。

2. 电脑防火墙放行 3001 端口入站。

3. 手机连同一 WiFi，浏览器访问 `http://电脑IP:3001/api/health`，确认返回健康状态。

4. APK 安装后在设置页填入后端地址，测试聊天、知识库等功能。

5. 切换网络 / 断开后端，确认 App 有合理的错误提示而非白屏。



***

## 总结



| 问题                     | 严重度             | 状态            | 修复文件                                                   |
| ---------------------- | --------------- | ------------- | ------------------------------------------------------ |
| 桌面端 BrowserView HMR 残留 | 中（影响开发体验，不影响生产） | ✅ 已修复（主进程兜底）  | `apps/desktop/main.cjs`                                |
| 安卓端无后端                 | 高（移动端完全不可用）     | ⏳ 待实施（推荐方案 A） | `client.ts` / `index.ts` / `AndroidManifest.xml` / 设置页 |

**桌面端修复已落地**，重启 `pnpm dev:desktop` 后生效。**安卓端建议先实施方案 A**（半天到一天工作量），让移动端能通过局域网连接电脑后端使用完整功能；离线内嵌后端作为中长期选项按需推进。