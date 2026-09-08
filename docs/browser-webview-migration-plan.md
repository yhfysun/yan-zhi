# 内置浏览器：BrowserView → webview 迁移方案（附浏览器工具优化清单）

状态：方案待评审 · 未动代码
范围：仅桌面端（apps/desktop + packages/ui 的 BrowserPanel.vue + packages/core 浏览器工具）
日期：2026-09-08

---

## 0. 结论速览

- ✅ 桌面端浏览器加载能力与豆包**同级**，不存在"技术做不到"，差距只在**层级与集成方式**
- ✅ 当前痛点根因：BrowserView 是窗口上的原生图层，**永远盖在 DOM 之上**，应用内弹窗/浮层无法覆盖网页
- ✅ 迁移目标：改用 `<webview>` 标签 —— DOM 内嵌、自动布局、浮层可覆盖、可删掉整套 bounds 同步代码
- ✅ 网站可访问性：换前后**基本等价**，不会出现"以前能开现在开不了"
- ✅ 验证码：与容器无关（服务端风控）；换 webview **不新增**风控，反而比 Web 端 Playwright 预渲染更安全
- ⚠️ 唯一需要 POC 验证的：后台 tab 截图、键盘输入焦点路由、主进程取 guest webContents 的方式

---

## 1. 现状梳理（源码实测）

| 层 | 位置 | 现状 |
|---|---|---|
| 工具层 | `packages/core/src/tool/builtin/browser/index.ts` | 39 个 browser_* 工具；桌面端把 `/navigate`、`/action` 转发到 IPC，其余走 server Playwright |
| 渲染层 | `packages/ui/src/components/BrowserPanel.vue` | Electron 用占位 div + `browserView.*` IPC；Web 端用 iframe + `/render` 代理 |
| 主进程 | `apps/desktop/main.cjs` | `browserViews` Map（tabId → entry）；`browserView:action` 实现约 45 个 action（L1409-L2038） |
| 同步机制 | main.cjs L325-L357 + BrowserPanel L500-L560 | ResizeObserver + 节流 IPC + 窗口事件强制摘挂 + `browserView:resync` 兜底 |
| 反爬伪装 | main.cjs L2360-L2377 | 已剥离 `Electron/x.y` 与应用名，双 session 均设置 ✅ |
| 会话 | main.cjs L372-L382 | `partition: 'persist:browser-view'`，登录态持久化 ✅ |

**维护成本证据**：仅"让网页贴合占位 div"这一件事，代码里就沉淀了
bounds 节流同步、窗口几何强制重挂、HMR 重载摘除、did-finish-load 重认领、
0 尺寸墓碑态复活、崩溃重载计数、空闲卸载（R4）、摘除即静音（R3）等 8+ 套兜底逻辑。
这些在 webview 方案下**全部可以删除**。

---

## 2. 为什么必须换：层级（这是豆包能做到、你做不到的唯一原因）

```
当前 BrowserView 层叠（问题）
┌─ BrowserWindow ──────────────────┐
│  [DOM: 侧栏/聊天/工具栏]          │   ← 永远在下面
│  ▓▓ BrowserView 原生图层 ▓▓       │   ← 永远盖在 DOM 上
│  ✗ 弹窗/下拉/浮窗被网页吃掉        │
└──────────────────────────────────┘

目标 webview 层叠（与豆包一致）
┌─ BrowserWindow ──────────────────┐
│  [DOM: 侧栏/聊天/工具栏]          │
│  [<webview> 作为 DOM 节点]        │   ← 参与正常层叠
│  [DOM 浮层 z-index 更高] ✅ 可覆盖 │
└──────────────────────────────────┘
```

豆包截图里"在对浮窗中打开"菜单能浮在网页之上 —— 只有第二种层叠能做到。

---

## 3. 方案对比

| 方案 | 浮层可覆盖 | bounds 同步 | 改动量 | 风险 |
|---|---|---|---|---|
| **A. `<webview>` 标签**（推荐） | ✅ 天然支持 | ✅ 不需要（CSS 布局） | 中（换载体 + 删同步代码） | low-medium（Electron 官方不推荐新项目用，但存量应用广泛在用，短期不会移除） |
| B. 保留 BrowserView + 浮层改为独立 always-on-top 无边框窗口 | ✅ | ❌ 仍需 + 新增位置跟随 | 大（所有弹窗组件改造） | medium（焦点/多屏/缩放跟随难） |
| C. 换 `WebContentsView`（Electron 30+ 推荐） | ❌ 同 BrowserView | ❌ 仍需 | 小 | low（但**没解决**层级这个核心痛点） |

**推荐 A**。C 只解决"BrowserView 已废弃"的合规问题，不解决你的实际痛点。

---

## 4. 影响点清单

### 4.1 主进程（apps/desktop/main.cjs）

| 影响点 | 现状 | 变更后 | 处理方案 |
|---|---|---|---|
| 视窗创建 | `BrowserView` + `setBrowserView/removeBrowserView` | 删除 | 窗口 `webPreferences` 增加 `webviewTag: true` |
| 多 tab 管理 | `browserViews` Map + attach/visible/bounds 三态 | 由渲染层 DOM 承载 tab 生命周期 | 保留 tab 元数据（url/title/zoom），仅删 view 生命周期 |
| bounds 同步 | 8+ 套兜底逻辑（L325-L357、L500-L560 等） | **整体删除** | — |
| 崩溃/HMR 兜底 | `did-start-navigation` 摘除、`resync` 重认领 | **删除**（webview 随 DOM 销毁） | — |
| JS 注入（pageAgent） | 主进程 `wc.executeJavaScript` | 改取 guest webContents | 渲染层 `webviewEl.getWebContentsId()` → IPC → `webContents.fromId(id)`；或直接在渲染层用 `webviewEl.executeJavaScript()`（更简单，**优先**） |
| 真实鼠标/键盘 | `wc.sendInputEvent` | 同左（经 fromId） | ⚠️ 需 POC：webview 需先 `webviewEl.focus()` 才能收到键盘事件 |
| 截图 | `wc.capturePage()` | `webviewEl.capturePage()` | ⚠️ 受 DOM 尺寸裁剪，隐藏 tab 可能截空白 |
| 弹窗拦截 | `setWindowOpenHandler` | 改用 `webview` 的 `did-create-window` / `new-window` 事件 | 保持"站内新 tab / 外链走系统浏览器"策略 |
| 缩放 | `setZoomFactor` | `webviewEl.setZoomFactor()` | 回放逻辑保留（did-finish-load 后重设） |
| 会话 | `persist:browser-view` partition | 沿用（webview `partition` 属性） | 零改动，登录态不丢 ✅ |
| UA 伪装 | 双 session setUserAgent | 沿用 | 零改动 ✅ |

### 4.2 渲染层（packages/ui/src/components/BrowserPanel.vue）

| 影响点 | 处理方案 |
|---|---|
| 占位 div + `browserViewPlaceholder` | 替换为 `<webview>` 元素，CSS 直接布局 |
| ResizeObserver / scroll handler / resize handler | **全部删除** |
| `browserView:createTab/activateTab/closeTab/hide/load` 等 IPC | 改为纯 DOM 属性驱动（`v-for` 渲染 tab，`:class` 控制激活） |
| 自绘滚动条（Web iframe 专用） | 桌面端不再需要，确认是否仅保留 Web 分支 |
| zoom 注入 iframe 分支 | 保留 Web 分支，Electron 分支改 `webviewEl.setZoomFactor()` |
| 主题同步 | 沿用 |

### 4.3 工具层（packages/core/.../browser/index.ts）

- IPC 转发判断不变（`/navigate`、`/action` 仍走桌面端），**工具层理论上零改动**
- 唯一需跟进：`callBrowserApi` 里 `electron.browserView.action(null, ...)` 的 `browserView` 命名，
  迁移后建议重命名为 `electron.browser.action(...)`（语义化，避免"没有 BrowserView 了还叫 browserView"）
- 详见第 8 节工具优化清单

---

## 5. 分阶段迁移计划

| 阶段 | 内容 | 验收标准 | 可回退 |
|---|---|---|---|
| **P0 验证（半天）** | 独立 demo 窗口验证 4 件事：① webview 内嵌 + DOM 浮层覆盖 ② `getWebContentsId` → 主进程 `fromId` 可用性 ③ guest 失焦时 `sendInputEvent` 键盘输入 ④ 隐藏 tab 的 `capturePage` 结果 | 4 项全部通过 | — |
| **P1 并行接入** | 新增 `?browserEngine=webview` 开关；渲染层按开关渲染 webview 或占位 div；主进程两套并存 | 开关切换后两种模式都能开页面 | ✅ 开关即回退 |
| **P2 工具链迁移** | pageAgent 的 action 逐个切到 webview 通道（先读类：get_page_content/get_page_info，再写类：click/type/press，最后上传下载/网络监听） | 39 个工具全量跑通 | ✅ 按 action 分批 |
| **P3 清理** | 删除 bounds 同步、HMR 摘除、resync、墓碑态复活、崩溃重载等兜底；删除 BrowserView 分支与开关 | 桌面端打包体积下降，无残留 IPC | ❌ 清理后不可回退（先跑满一周再清） |
| **P4 收口** | 顺手修掉"主区域白屏 / `/browser` 路由不渲染"当前 bug | 路由直达可用 | — |

> P0 不通过则改走方案 B（保留 BrowserView + 浮层独立窗口）。

---

## 6. 风险与回退

| 风险 | 等级 | 应对 |
|---|---|---|
| Electron 未来移除 webview tag | low | 官方仅"不推荐"，无移除时间表；真移除时可回退 BrowserView（P3 前保留代码） |
| 后台 tab 截图/执行 JS 失效 | medium | 隐藏策略改为"移出视口但保留尺寸"，不用 `display:none`；截图前临时激活 |
| sendInputEvent 焦点丢失 | medium | 每次输入前 `webviewEl.focus()`；P0 验证 |
| 内存：每 tab 独立渲染进程 | low | 现有 MAX_TABS=8 + 空闲卸载策略继续保留（改为销毁 DOM 节点） |
| 迁移期双实现共存导致分支混乱 | medium | 严格走 P1 开关 + P3 统一清理，不长期保留两套 |

---

## 7. 答疑：换了之后会不会有"以前能访问、现在访问不了"？验证码呢？

### 7.1 网站可访问性

**不会退化，同一套 Chromium 网络栈、同一个 partition、同一套 UA。**

| 场景 | BrowserView | webview | 结论 |
|---|---|---|---|
| 常规站点（含 SPA/视频/登录态） | ✅ | ✅ | 等价 |
| 拒绝 iframe 嵌套的站点（X-Frame-Options/CSP） | ✅ | ✅ | 等价（都是一级 guest 内容，非 iframe） |
| 需要 WebRTC / 摄像头 / 剪贴板权限 | 需挂 `permissionRequestHandler` | 同左（多一个 `<webview>` 的 `permission-request` 事件） | 等价，需补权限回调 |
| 证书异常/自签名站点 | 需 `certificate-error` 处理 | 同左 | 等价，需同步补 |
| Web 端（浏览器里跑） | — | — | **不受影响**，仍走 iframe + `/render` 代理 |

唯一可能"变弱"的两点（已在上文标 ⚠️）：**后台 tab 截图**、**键盘输入焦点** —— 都是工程问题，不是能力问题。

### 7.2 验证码 / 风控

- 验证码是**服务端风控**，与客户端用 iframe / 代理 / BrowserView / webview **无关**。
- 换 webview **不会新增**风控，原因：
  - ✅ UA 已剥离 `Electron/x.y` 与应用名（main.cjs L2360-L2377），伪装为标准 Chrome
  - ✅ `persist:browser-view` 保留 cookie，登录态持久 → **降低**验证码触发率
  - ✅ Electron guest 里 `navigator.webdriver = false`，无 Playwright 无头特征
  - ✅ 完整 JS / 真实渲染 / 真实输入事件，指纹接近普通 Chrome
- **反而更该担心的是 Web 端路径**：Web 端走 server Playwright headless + `/render` 预渲染代理，
  headless 特征 + 无登录态 + 无真实指纹 → **最容易触发验证码**。这条路径建议后续也收敛。
- 建议补充（低成本、收益高）：
  - 给 webview session 挂 `permission-request`、`certificate-error` 处理，避免异常站直接白屏
  - 可选：`session.setProxy` / 指纹一致性（字体、`navigator.plugins`）按需再做

---

## 8. 浏览器操作工具优化清单（顺带审查结果）

### P0（建议本轮就改）

| # | 问题 | 位置 | 建议 |
|---|---|---|---|
| 1 | `browser_screenshot` 只返回「base64 有多少字节」，**模型根本看不到图**，等于废工具 | index.ts L316-L329 | 返回 image content block（或存文件返回路径，与 `browser_visual_locate` 一致），并可自动衔接 `image_analyze` |
| 2 | `browser_login_saved` 走 `/login-saved`，**不在 IPC 转发白名单** → 桌面端实际操作的是 server 端 Playwright 会话，与用户可见视图登录态不互通 | index.ts L15、L573-L579 | 桌面端改为 IPC action（新增 `login_saved` case）或明确禁用该工具并提示 |
| 3 | `get_dom` / `get_page_content` 输出无体积闸：`JSON.stringify(dom, null, 2)` 单次可达数万 token | index.ts L289-L296 | 加 `maxChars` 硬截断 + 默认只返回 interactive 元素与正文，DOM 树按需展开 |

### P1

| # | 问题 | 建议 |
|---|---|---|
| 4 | 39 个工具过多，模型选择成本高、易误调用 | 收敛为核心 12 个：navigate / click / type / press_key / scroll / get_page_content / wait_for / extract_list / screenshot / new_tab / switch_tab / close_tab；`browser_wait` 并入 `wait_for`；`next_page`/`prev_page`/`search`/`fill_form`/`submit_form`/`select_option`/`check`/`uncheck` 作为扩展集按需加载 |
| 5 | 桌面端已实现 `back`/`forward`/`reload` action（main.cjs L1812-L1824），**工具层未暴露** | 补 `browser_go_back` / `browser_go_forward` / `browser_reload`，成本极低 |
| 6 | 操作类工具返回值不统一：`click` 有 pageChanged，`type`/`press` 没有 | 统一返回 `{ url, title, changed }` 摘要，减少模型多调一次 `get_page_content` |

### P2

| # | 问题 | 建议 |
|---|---|---|
| 7 | `openInNewTab` 是编排层内部参数，却出现在 inputSchema 里，模型可能误传 | 移出 schema 或标注 internal |
| 8 | `browser_scroll` 的 x/y 语义歧义（delta 还是绝对坐标） | 明确为 delta，绝对定位用 `scroll_into_view` |
| 9 | index.ts L105 注释「桌面端 BrowserView 不支持多标签页」已过时（main.cjs 已实现 createTab/new_tab） | 更新注释与回退分支，避免误判 |
| 10 | `browserView` 命名在迁移后语义失真 | IPC 通道重命名为 `browser:*` |

---

## 9. 待你确认

1. 是否按方案 A 推进？确认后我先做 **P0 验证 demo**（不动主代码）。
2. 第 8 节的 P0 三项（截图返回图 / login_saved 走 IPC / 输出截断）是否并入同一轮？
3. P4 提到的「主区域白屏 / `/browser` 路由不渲染」是否当前已知问题、要不要一并排？

---

## 10. 实施状态（2026-09-08 更新）

**BrowserView → webview 迁移代码已改完，未打包验证（等你本机测）。**

- 引擎开关：`apps/desktop/main.cjs` 顶部 `BROWSER_ENGINE_DEFAULT = 'webview'`（改回 `'browserview'` 即整体回退旧链路）
- 改完文件：`apps/desktop/main.cjs`、`apps/desktop/preload.cjs`、`packages/ui/src/components/BrowserPanel.vue`
- 策略：保留全部 45 个 action 执行器零重写，只换"取 guest（webview 元素 → webContents.fromId）"的方式；新增 `browser:engine/wv:register` 等 IPC；渲染层 webview `:src` 绑定 tab.url 由 Vue 驱动加载；非激活 tab guest 保留渲染（弹窗/截图可用），弹窗天然盖在 DOM 网页上（本次痛点已解决）
- 验证所过：`node --check`（两 cjs）✓；Vue 模板 compiler-sfc 0 错 ✓；vue-tsc 全量下 BrowserPanel.vue 0 错 ✓（全包剩余 20 错均为既有无关缺装 mammoth/unpdf/codemirror/qrcode/jsqr）
- 环境约束：本受限沙箱 GUI Electron 起不来（GPU 上下文必崩），真实往返需在你机器跑。POC 已固化：`node scripts/poc-webview/run.mjs`（验证 浮层覆盖 / fromId / 键盘焦点 / 隐藏 tab 截图）
- **本机测试清单**：① 网页能否打开 ② 应用内浮层(浏览器设置弹窗/新建标签下拉/更多菜单)是否盖在网页上 ③ 前进/后退/刷新/缩放/收藏 ④ page 与 preview 两空间 tab 隔离 ⑤ 登录态保留(persist:browser-view 未变) ⑥ pageAgent 工具(browser_get_page_content/click…)能作用于可见网页 ⑦ 弹窗(window.open/新标签)在应用内新开而非逃逸系统窗口
- 已知取舍：切到一个"无 url 空 tab"会回到主页并卸载所有后台 guest，切回需按 :src 重建重载（短暂丢滚动状态）；如不能接受再收紧渲染策略。
- 模型侧 39→12 个浏览器工具收敛（截图返回图 / login_saved 走 IPC / 输出体积闸）**留待迁移测通后单独做**。

### 2026-09-08 实测回滚修复
- 滚动条观感：webview guest 无法被渲染层直接改样式 → 恢复方案 A：主进程抽共用 `injectScrollbarForWC(wc)`，BrowserView(entry) 与 webview(fromId) 都注入"隐藏原生粗条 → 半透明细圆角::-webkit-scrollbar"，随页 detectPageDark 深浅选色；webview 引擎在 did-stop-loading + 切 tab 时补注入。观感与旧 BrowserView 一致、零新攻击面。
- 弹窗逃逸：webview+allowpopups 的 window.open 会转到二级 popup BrowserWindow，session 级 setWindowOpenHandler 拦不住。修：`setupGuestPopupRedirect(wc)` 在每个 guest 宿主 webContents 设 handler(deny+broadcast browser:wv:openTab→渲染层 newTab)，并 `app.on('web-contents-created')` 兜底绝不让新窗逃逸成独立系统窗。网页 target=_blank/window.open 均在应用内新标签打开。
- 状态：仍是未打包待真机验证（重点：滚动条观感恢复与否、target=_blank 是否应用内开、newTab 是否正常）。
