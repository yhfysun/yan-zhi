# BrowserView 剩余项（P1 / P2 / P3）详细方案

> 版本：2026-09-02 · 状态：**R1~R6 全部落地（2026-09-02），待桌面端冷启动验收**
> 前置文档：`docs/browserview-optimization.md`（P0 已完成部分）
> 本文档基于 2026-09-02 当前工作区源码逐行核准，所有行号可直接定位。

---

## §0 当前工作区状态（改动账本）

未提交改动 7 文件（**均为前几轮 P0 阶段产出，本轮未新增**）：

| 文件 | 增删 | 内容 |
|---|---|---|
| `apps/desktop/main.cjs` | +238 | entry 三态（attached/visible/bounds）、`applyVisibility()` 唯一收敛、窗口几何事件分流、崩溃去重+上限 |
| `apps/desktop/preload.cjs` | +3 | `onCrashed` 暴露 |
| `packages/ui/src/components/BrowserPanel.vue` | +78 | `shouldBeVisible` 单闸门、bounds 同步节流、崩溃回调停 loading |
| `ChatTopbar.vue` / `useChat.ts` / `stores/chat.ts` / `chat.css` | +57 | 顶栏下拉、右栏默认开、左栏 CSS 压缩 |

校验状态：`node --check main.cjs` ✅ / `preload.cjs` ✅ / `vue-tsc --noEmit` 0 错误。

**R1 + R2 增量（2026-09-02 已实施，用户拍板"开始动手"后落地）**：
- `apps/desktop/main.cjs`：模块级 `let lastGoodBounds = null;`；`entry` 增 `zoomFactor: 1`；`browserView:resize` 写 `lastGoodBounds`；`ensureFallbackBounds()` 优先复用 `lastGoodBounds`（480px 仅兜底）；`browserView:setZoomFactor` 写 `entry.zoomFactor`；`did-finish-load` 按 `entry.zoomFactor` 回放；新增 `browserView:getZoomFactor` handler；删除无主 `browserView:insertScrollbarCSS` handler。
- `apps/desktop/preload.cjs`：删除 `insertScrollbarCSS` 暴露；新增 `getZoomFactor` 暴露。
- `packages/ui/src/components/BrowserPanel.vue`：`switchTab` 激活后回读 `getZoomFactor` 校正 `pageZoom`；`onLoaded` 改 async，加载完成后回读校正（只同步数值，无新 UI）。
- `node --check main.cjs` ✅ / `preload.cjs` ✅。

**R3 + R4 + R5 + R6 增量（2026-09-02 已实施，用户"干活吧"拍板后落地）**：
- **R3 后台静音**：`applyVisibility()` 摘除分支 `setAudioMuted(true)`、可见分支 `setAudioMuted(false)`，常量开关 `MUTE_ON_DETACH = true`（保留后台音乐改 false 一行回退）。按方案默认"全部静音"。
- **R4 tab 内存管理**：`MAX_TABS = 8`（存活 webContents 上限）+ `TAB_IDLE_UNLOAD_MS = 10min`（空闲卸载）；`ensureBrowserView` 拆为 `createBrowserViewFor(tabId, entry)`（首建与复活共用同一套事件挂接）+ 挂起复活分支（内部先 `evictLruTabIfNeeded()` 腾位再重建）；`suspendBrowserViewEntry()`（摘除+销毁 webContents、保留 entry：url/zoom/bounds/lastActiveAt）；`activateTab` 复活时懒加载 `entry.url`；每分钟空闲巡检 `scheduleTabIdleCheck()`（窗口 closed 清理）；entry 新增 `url`（did-navigate 持续更新）/ `lastActiveAt` / `suspended` 三字段；所有 handler（back/forward/reload/canGoBack/canGoForward/getUrl/setZoomFactor/action/injectScrollbarCss）补挂起态守卫或降级（getUrl 返回记忆 url、canGo* 返回 false、setZoomFactor 只落账、reload/pageAgent 复活加载）。
- **R5 closeTab 顶替**：主进程 `browserView:closeTab` 收 `fromUi` 参数 —— UI 路径（渲染层自顶替相邻 tab）传 `true`，主进程不顶替不广播；非 UI 路径主进程按 `lastActiveAt` 顶替 + 广播 `browserView:tabActivated`；渲染层 `onTabActivated` 幂等处理（activeTabId 已一致 / tab 壳不存在则忽略）。
- **R6 ownerWindow**：entry 创建时记 `ownerWindow: mainWindow`；`applyVisibility` / `refreshAllBrowserViewBounds` / `ensureFallbackBounds` 改读 `entry.ownerWindow || mainWindow`（单窗口下行为等价，两级 Map 留待真有第二窗口再拆）。
- 校验：`node --check main.cjs` ✅ / `preload.cjs` ✅ / `vue-tsc --noEmit` 0 错误。

---

## §1 ⚠️ 本轮读码更正的 4 处方案错误

上一版方案（`browserview-optimization.md` §6）有 4 条描述与实际代码不符，**先更正再动手**，否则会照着错的前提改。

### 更正 1 · L4「后台 tab 未节流」——已被 P0 顺手解决

原描述：`setBackgroundThrottling(true)` 只在隐藏分支调，非激活 tab 全速跑。

**实际**：P0 重构后 `applyVisibility()`（`main.cjs:426-459`）已经双向处理：

```js
// main.cjs:446  —— 可见时
try { entry.view.webContents.setBackgroundThrottling(false); } catch {}
// main.cjs:456  —— 摘除时
try { entry.view.webContents.setBackgroundThrottling(true); } catch {}
```

由于同一时刻只有一个 tab 可 attached（`setBrowserView` 单槽 + `activateTab` 先清场），**所有非激活 tab 都已处于 throttling 状态**。

⇒ L4 的定时器节流部分**关闭**。剩余真实缺口只有两项：**音频未静音**、**无 tab 数量上限**（转入 §3 P2-1）。

### 更正 2 · L5「closeTab 后无顶替」——严重性从 P1 降到 P2

原描述：`activeTabId = null` 后渲染层 resize 静默失败，"点了没反应"。

**实际**：渲染层已自行顶替（`BrowserPanel.vue:456-477`）：

```js
tabs.value.splice(idx, 1);
if (activeTabId.value === tabId) {
  const nextTab = tabs.value[idx] || tabs.value[idx - 1];
  if (nextTab) await switchTab(nextTab.id);   // → api.browserView.activateTab()
  else { activeTabId.value = ''; ... }
}
```

且关闭按钮有 `v-if="tabs.length > 1"`（`:15`），**UI 上无法关掉最后一个 tab**，不会走到"零 tab"分支。

⇒ 真实缺口缩小为：**非 UI 路径**（pageAgent 工具、页面自身 `window.close()`、将来的批量关闭）调 `closeTab` 时主进程不顶替、也不通知渲染层，导致主/渲染两侧 `activeTabId` 不一致。属健壮性补强，降 P2（§3 P2-3）。

### 更正 3 · L6「zoom 后 bounds 不重算」——判断错误，问题不在 bounds

原描述：`setZoomFactor` 只改缩放不重算 bounds，缩放来回切内容错位。

**实际**：`setBounds` 用的是**窗口逻辑像素**，`setZoomFactor` 只缩放 BrowserView **内部页面内容**，两者互不影响 —— bounds 不会因 zoom 失效。

**真正的 bug 是 zoom 与 UI 显示脱钩**（见 §2 L6'），根因是 Electron 的 zoom **按 origin 记忆**，跨源导航后回落默认值，而 UI 的 `pageZoom` ref 不知情。

### 更正 4 · L3「崩溃无恢复」——上一轮已更正并修完

`main.cjs:346-374` 现已有：单一 `onBrowserViewCrash()` + 1s 去重 + `CRASH_RELOAD_LIMIT=3` + `did-finish-load` 清零 + 超限 `send('browserView:crashed')`。**本项关闭。**

---

## §2 P1 —— 两项（原三项，L5 降级）

### P1-1 · L1 滚动条 CSS 每次隐藏泄漏一份 🟡

**证据链**

正常注入路径是自洽的（`main.cjs:568-581`）：先 `removeInsertedCSS(旧 key)` 再 `insertCSS` 存新 key。

```js
// main.cjs:574-579
if (entry.scrollbarCssKey && typeof wc.removeInsertedCSS === 'function') {
  try { await wc.removeInsertedCSS(entry.scrollbarCssKey); } catch {}
  entry.scrollbarCssKey = null;
}
const pageDark = await detectPageDark(wc);
entry.scrollbarCssKey = await wc.insertCSS(scrollbarCssForTheme(pageDark ? 'dark' : 'light'));
```

但另外**两处把 key 直接丢掉、CSS 却还留在页面里**：

```js
// main.cjs:692   resize 的 0 尺寸分支
if (entry.scrollbarCssKey) entry.scrollbarCssKey = null;
// main.cjs:715   hide handler
// 清理上次注入的滚动条样式 key（下次显示时 injectScrollbarCss 会重新注入）
if (entry.scrollbarCssKey) entry.scrollbarCssKey = null;
```

**关键事实**：隐藏 BrowserView **不会重新加载页面**，`insertCSS` 注入的样式表仍在页面文档里。key 是移除它的**唯一凭证**，丢了 key 就永远移不掉。

**泄漏累积路径**

| 次数 | 动作 | 页面内滚动条样式表数量 |
|---|---|---|
| 1 | 显示 → 注入 | 1 |
| 2 | 收起右栏（key 被置 null，CSS 仍在） | 1（不可移除） |
| 3 | 再展开 → `setTheme` → 注入（无旧 key 可删） | **2** |
| 4 | 再收起 → 再展开 | **3** |

⇒ 反复切主题 / 反复收展右栏，页面内叠加 N 份 `::-webkit-scrollbar` 规则。同名规则后者覆盖前者，**视觉上一般不出错**，但：
- 每份都参与样式计算，长会话下滚动性能下降；
- 若前后主题不同（dark 注入过一次、light 注入过一次），CSS 优先级相同时按插入顺序取最后一份 —— 一旦某次注入失败（`insertCSS` 抛错被 catch 吞掉），会**停留在上一个主题的旧样式**，表现为"深色模式下滚动条还是浅色"。

**改法**：删掉这两行即可。

```diff
   // main.cjs:687-694  resize 0 尺寸分支
   if (w < 1 || h < 1) {
     entry.bounds = null;
     entry.visible = false;
     applyVisibility(entry);
-    if (entry.scrollbarCssKey) entry.scrollbarCssKey = null;
     return;
   }
```

```diff
   // main.cjs:706-716  hide handler
   entry.visible = false;
   entry.bounds = null;
   applyVisibility(entry);
-  // 清理上次注入的滚动条样式 key（下次显示时 injectScrollbarCss 会重新注入）
-  if (entry.scrollbarCssKey) entry.scrollbarCssKey = null;
+  // 注意：不要在这里清 scrollbarCssKey —— 隐藏不会重载页面，CSS 仍在文档内，
+  // key 是 removeInsertedCSS 的唯一凭证，丢了就永久泄漏一份样式表。
```

导航后 key 会变成陈旧值，但 `injectScrollbarCss` 的 `removeInsertedCSS` 外面就套着 try/catch，**陈旧 key 无害**（`did-finish-load` 会立刻覆盖成新 key）。

- 影响面：2 行删除 + 1 条注释
- 风险：🟢 极低
- 验证：右栏收展 5 次后，主进程加临时日志打印 `entry.scrollbarCssKey`，应始终非 null；DevTools 里 `document.styleSheets.length` 不随收展次数增长

### P1-2 · L6' zoom 与 UI 百分比脱钩（原 L6 重新定义）🟡

**现状**

```js
// main.cjs:735-739
ipcMain.handle('browserView:setZoomFactor', (_e, tabId, factor) => {
  const entry = ...;
  if (!entry) return;
  try { entry.view.webContents.setZoomFactor(Number(factor) || 1); } catch {}
});
```

渲染层 `pageZoom` 是**纯前端 ref**（`BrowserPanel.vue:344`），只在 `zoomIn/zoomOut/resetZoom` 时下发（`:356-371`），`switchTab` 只做显示恢复（`:439 pageZoom.value = tab.pageZoom`）**不重新下发**。

**三个脱钩场景**

| 场景 | 现象 |
|---|---|
| 跨源导航（Electron zoom 按 origin 记忆） | 页面回落默认缩放，UI 仍显示 `120%` |
| `switchTab` 切回旧 tab | UI 恢复该 tab 记录值，但没下发；若期间发生过导航，实际与显示不一致 |
| 崩溃自动 reload（`main.cjs:370`） | 重载后 zoom 可能回落，UI 不变 |

> ⚠️ Electron 的 zoom 记忆粒度（per-origin / per-webContents）随版本有差异，**动手前先实测**：本项目 Electron 33，用 `wc.getZoomFactor()` 在 `did-finish-load` 里打印一次即可确认。若实测不回落，本项只需做 §2 的"单一出口"收敛，不必补重下发。

**改法（主进程持有唯一真值）**

1. `entry` 增加 `zoomFactor: 1` 字段（`main.cjs:327-334` 初始化处）
2. `setZoomFactor` handler 记录到 `entry.zoomFactor` 后再下发
3. `did-finish-load`（`:388`）内补一次 `applyZoom(entry)`，与 `injectScrollbarCss` 同级
4. 新增 `browserView:getZoomFactor` handler；渲染层 `switchTab` 与 `onLoaded` 回调里回读并同步 `pageZoom`（**只同步数值，不新增任何 UI**）

```js
/** zoom 的唯一出口：主进程 entry.zoomFactor 是真值，页面加载完成后必须重放一次 */
function applyZoom(entry) {
  if (!entry) return;
  try { entry.view.webContents.setZoomFactor(entry.zoomFactor || 1); } catch { /* ignore */ }
}
```

- 影响面：`main.cjs` 4 处、`preload.cjs` 1 处、`BrowserPanel.vue` 2 处
- 风险：🟡 中低（触碰 `did-finish-load`，那里还串着 scrollbar 与 pageAgent 注入，顺序不能乱）
- 验证：150% → 跳转到另一个域名 → 缩放与 UI 显示的百分比应一致；切 tab 再切回，百分比不变

---

## §3 P2 —— 三项

### P2-1 · L4 残留：后台 tab 音频未静音 + 无数量上限 🟢

定时器节流已解决（§1 更正 1）。剩下两点：

**① 音频**：`applyVisibility` 摘除分支（`:450-458`）没有 `setAudioMuted`。收起右栏后视频/音乐**继续出声**，用户找不到源头。

```diff
   if (entry.attached) {
     try { mainWindow.removeBrowserView(entry.view); } catch {}
     try { mainWindow.setBrowserView(null); } catch {}
     try { entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 }); } catch {}
     try { entry.view.webContents.setBackgroundThrottling(true); } catch {}
+    try { entry.view.webContents.setAudioMuted(true); } catch {}
     entry.attached = false;
   }
```

可见分支对应加 `setAudioMuted(false)`。

> 决策点：**静音是否符合预期？** 有的用户会故意开着后台音乐。建议先只对"收起右栏"（`hide`）静音，切 tab 不静音 —— 需要你拍板，默认按"全部静音"实现（更符合"收起了就该安静"的直觉）。

**② 数量上限**：`browserView:createTab`（`:602-606`）无上限，每个 tab 一个完整渲染进程（Chromium 约 60~120 MB）。开 15 个 tab 就是 1~2 GB。

建议 `MAX_TABS = 8`：超限时按 LRU 挑最久未激活的 tab **卸载 webContents 但保留 tab 壳**（记住 url，再次激活时懒加载）。需要 `entry.lastActiveAt` 时间戳（`activateTab` 内打点）。

- 风险：🟡 中（懒加载复活路径要单测，否则表现为"点了 tab 空白"）
- 建议：**②拆为独立一轮做**，与 L7 合并（见下）

### P2-2 · L7 内存回收（与 P2-1② 同源，合并实施）🟡

完整方案：

| 机制 | 规则 |
|---|---|
| 硬上限 | `MAX_TABS = 8`，超限拒绝新建并复用最久未用 tab |
| 空闲卸载 | tab 非激活 **> 10 分钟** → `destroy()` webContents，`entry.suspended = true` + 保留 `entry.url` |
| 复活 | `activateTab` 命中 `suspended` → 重建 BrowserView + `loadURL(entry.url)` |
| 状态保留 | 仅保留 URL 与标题；滚动位置、表单内容**明确不保留**（要保留得存 sessionStorage 快照，成本不值） |

- 风险：🟡 中。**必须**处理复活期间的 `activeTabId` 竞态（用户快速连点两个 tab）
- 工时：0.5~1 天

### P2-3 · L5 残留：closeTab 非 UI 路径顶替 🟢

```diff
 ipcMain.handle('browserView:closeTab', (_e, tabId) => {
   const entry = browserViews.get(tabId);
   if (entry) { ... browserViews.delete(tabId); }
-  if (activeTabId === tabId) activeTabId = null;
+  if (activeTabId === tabId) {
+    activeTabId = null;
+    // 主进程自行顶替最近激活的剩余 tab（UI 路径下渲染层也会顶替，activateTab 幂等）；
+    // 非 UI 路径（pageAgent 工具 / 页面 window.close）没有渲染层参与，必须在这里收口
+    let next = null, newest = -1;
+    for (const [id, e] of browserViews) {
+      if ((e.lastActiveAt || 0) >= newest) { newest = e.lastActiveAt || 0; next = id; }
+    }
+    if (next) {
+      activateTab(next);
+      mainWindow?.webContents.send('browserView:tabActivated', next);
+    }
+  }
```

依赖 `entry.lastActiveAt`（与 P2-1② 共用）。渲染层收到 `tabActivated` 时若 `activeTabId` 已一致则忽略（幂等，避免与自身顶替打架）。

- 风险：🟢 低，但**必须保证幂等**，否则 UI 关 tab 会触发两次 switchTab 抖动

---

## §4 P3 —— L8 多窗口预留 🟠

`applyVisibility`（`:427`）、`refreshAllBrowserViewBounds`（`:468`）、`ensureFallbackBounds`（`:507`）全部直接引用模块级 `mainWindow` 单例。将来开第二个窗口（对比视图 / 独立浏览器窗口），BrowserView 会挂错窗口。

改法：`entry.ownerWindow = mainWindow`（创建时记录），上述三个函数改用 `entry.ownerWindow`；`browserViews` 由全局 Map 改为 `窗口 → Map` 两级。

- 风险：🟠 高（触碰全部挂载路径）
- 建议：**现在只做第一步**——`ensureBrowserView` 里存 `entry.ownerWindow`，三个函数改成读它（行为完全等价，单窗口下零变化），把两级 Map 留到真有第二窗口需求时再拆

---

## §5 本轮新发现 2 项

### N1 · `browserView:insertScrollbarCSS` 是无主 API 🟢

```js
// main.cjs:747-751
ipcMain.handle('browserView:insertScrollbarCSS', async (_e, tabId, css) => {
  const entry = ...;
  try { await entry.view.webContents.insertCSS(css); } catch {}
});
```

两个问题：
1. **不追踪返回 key** → 每次调用注入一份，永远无法移除，比 L1 更彻底的泄漏
2. **全仓无调用方**：`preload.cjs:80` 暴露了，但 `packages/ui` 里没有任何 `.vue/.ts` 调它（已 grep 确认）

处理：二选一 —— ①删掉 handler + preload 暴露（推荐，减少攻击面）；②保留但按 `entry.customCssKeys[]` 追踪并提供移除通道。

> 记忆库里"滚动条用 `browserView:insertScrollbarCSS` IPC 注入 CSS"的说法**已过时**：实际走的是主进程 `injectScrollbarCss()` + `browserView:setTheme`。修完后需同步纠正 `.workbuddy/memory/MEMORY.md`。

### N2 · `ensureFallbackBounds` 硬编码 480px 🟢

```js
// main.cjs:505-514
const [w, h] = mainWindow.getContentSize();
const width = Math.min(480, Math.max(1, w));
entry.bounds = { x: Math.max(0, w - width), y: 0, width, height: Math.max(1, h) };
```

假设右栏宽 480 且占满全高。实际右栏宽度是 CSS 变量 `--chat-right-w`（用户可拖拽），且上方有顶栏、内部还有 tabbar + 工具栏 —— 兜底矩形会**比真实区域大一圈**，首次导航瞬间可能盖住顶栏，直到渲染层第一次 resize 才纠正（约 1 帧）。

改法：兜底矩形高度减去一个保守顶部偏移（如 `y: 96, height: h - 96`），或让渲染层在 `load` 之前先推一次 bounds（更彻底：`browserView:load` 前置要求携带 bounds 参数）。

- 风险：🟢 低
- 建议：并入 P1-1 一起做（都是小改）

---

## §6 实施顺序与工时

| 轮次 | 内容 | 风险 | 工时 |
|---|---|---|---|
| **R1** | P1-1（滚动条泄漏，2 行）+ N1（删无主 API）+ N2（兜底矩形） | 🟢 | 0.5 h |
| **R2** | P1-2（zoom 单一出口，**先实测 Electron 33 行为**） | 🟡 | 2 h |
| **R3** | P2-1①（后台静音，需你拍板策略） | 🟢 | 0.5 h |
| **R4** | P2-1② + P2-2（tab 上限 + LRU + 空闲卸载 + 复活） | 🟡 | 0.5~1 d |
| **R5** | P2-3（closeTab 顶替，依赖 R4 的 `lastActiveAt`） | 🟢 | 1 h |
| **R6** | P3 L8 第一步（`ownerWindow` 字段替换） | 🟢 | 1 h |

推荐先做 **R1 + R2**（半天内可验收），R4 单独排一轮。

---

## §7 验收清单

R1：
- [ ] 右栏收展 5 次 → DevTools 内 `document.styleSheets.length` 不增长
- [ ] 深浅主题各切 3 次 → 滚动条颜色始终跟随，无停留在旧主题
- [ ] 首次从 Agent 打开网页 → 无覆盖顶栏的闪现

R2：
- [ ] 设 150% → 导航到另一域名 → 显示百分比与实际缩放一致
- [ ] 切到另一 tab 再切回 → 百分比与实际一致
- [ ] 触发一次崩溃自动重载 → 缩放保持

R3/R4/R5：
- [ ] 后台播视频 → 收起右栏 → 无声音
- [ ] 开到第 9 个 tab → 最久未用的被卸载，点击可正常复活
- [ ] pageAgent 工具关掉当前 tab → 自动顶替，UI 与主进程 activeTabId 一致
- [ ] 只剩 1 个 tab 时 UI 无关闭按钮（回归确认）

---

## §8 风险与回滚

| 项 | 最坏情况 | 回滚方式 |
|---|---|---|
| P1-1 | 无（纯删除） | 恢复 2 行 |
| P1-2 | `did-finish-load` 内注入顺序被打乱，滚动条或 pageAgent 失效 | zoom 重放放在 `injectYzAssistant` **之后**，独立 try/catch，不阻塞其余注入 |
| P2-1① | 用户抱怨后台音乐被掐 | 加 `MUTE_ON_HIDE` 常量开关，一行切回 |
| P2-2 | 复活失败 → 点 tab 空白 | `suspended` 复活失败时回退为"重新 loadURL 并显示加载态"，不要静默 |
| P3 | 挂载路径回归 | 第一步纯字段替换，单窗口下逻辑等价 |

**统一约束（不得违反）**：
- 任何隐藏一律走 `applyVisibility()`，禁止业务代码直接 `setBrowserView` / `setBounds(0,0,0,0)`
- 不新增任何用户侧提示、按钮、图标（崩溃/复活都走 console + 现有 loading 态）
- 每改一处跑 `node --check main.cjs` + `vue-tsc --noEmit`
