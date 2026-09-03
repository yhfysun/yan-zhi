# BrowserView 生命周期与体验优化方案

> 文档状态：**方案稿，本轮不动代码**
> 最后更新：2026-09-02
> 涉及文件：`apps/desktop/main.cjs`、`apps/desktop/preload.cjs`、`packages/ui/src/components/BrowserPanel.vue`、`packages/ui/src/stores/chat.ts`

---

## §0 一句话结论

> **病根不是一个 handler 写错了，是「可见性状态」被写在 7 个地方、且一个字段混用了两个语义。**
> 修法不是打补丁，是**收敛成单一出口**：主进程一个 `applyVisibility()`，渲染层一个 `shouldBeVisible`。

---

## §1 先回答：是不是抄 WorkBuddy？

**不是，也抄不了。** 三层对比：

| 层 | WorkBuddy | 言智 | 能否抄 |
|---|---|---|---|
| 网页渲染载体 | 纯 DOM（iframe / webview），在主渲染进程内 | Electron 原生 **BrowserView**：独立原生图层，挂在 BrowserWindow 上 | **抄不来**。WorkBuddy 压根没有原生图层，也就没有"图层残留"这类问题 |
| 隐藏机制 | `v-show` / `display:none`，一行 CSS | 必须显式 `setBrowserView(null)` / `removeBrowserView(view)` | 复杂度不在一个量级 |
| 能力上限 | 只能渲染**允许被 iframe** 的页面 | 能渲染 **X-Frame-Options / CSP 严格**的页面（你截图里的 `finance.sina.com.cn` 就是） | 言智**更强** |
| 交互层（多 tab、真实文件名、三栏） | 有 | 缺 | **这部分在对齐** |

**准确表述**：底层方案是言智独有的（因为选了更强的能力），交互层在对齐 WorkBuddy 的体验。

你报的「侧栏没了浏览器页面还在」这个 bug，**WorkBuddy 想犯都犯不了** —— 它不需要管生命周期。言智要管，所以必须有这份文档。

---

## §2 病根分析（基于改动前的代码）

### 2.1 状态散落 7 处

改动前，`BrowserView` 的"是否显示"由下面这些地方各自决定，互不协商：

| # | 位置 | 行为 |
|---|---|---|
| 1 | `resize` handler | `if (entry.hidden) return;` ← **墓碑闸门** |
| 2 | `hide` handler | `setBrowserView(null)` + `setBounds(0,0,0,0)` + `hidden = true` |
| 3 | `activateTab()` | 只 `setBounds(0,0,0,0)` 其他 tab，**不摘除** |
| 4 | `load` handler | `activateTab()` + `setBrowserView(bv)` |
| 5 | `closeTab` handler | 仅 `!entry.hidden` 时才摘除 |
| 6 | `before-input-event`（line 236） | 读 `entry.hidden` 决定是否拦截快捷键 |
| 7 | 渲染层 `syncBrowserViewBounds` | 独立算一遍 `rightPanelOpen && rightPanelTab === 'browser'` |

### 2.2 一个字段混用两个语义

```js
entry.hidden
```

同时表达：
- **A. 物理挂载态**：这个 BrowserView 是不是挂在 BrowserWindow 上？
- **B. 业务可见意图**：用户现在想不想看到它？

**爆雷路径**（就是用户报的 bug）：

```
① 浏览器加载完        → resize 路径：setBrowserView(view)、hidden=false     ✅ 正常
② 收起右栏            → hide 路径：setBrowserView(null)、hidden=true        ✅ 摘除
③ 再展开右栏          → 渲染层算 visible=true → 调 resize
                       → 主进程：`if (entry.hidden) return;`                ❌ 直接 return
                       → hidden 永远是 true，页面再也回不来
```

代码注释写的是「resize 会主动重附 BrowserView」，但 `entry.hidden` 闸门**反向拦截了这层防御** —— 注释与代码自相矛盾。

### 2.3 Windows 下为什么是"残留"而不是"消失"

`entry.hidden = true` 之后：

- 若 `setBrowserView(null)` 生效 → 页面**消失**（用户说"页面没了"）
- 若 GPU 合成层未及时清理（Windows 开启 GPU 加速时常见）→ 图层**残留**，且会**吞掉下方 UI 的点击**（用户说"侧栏没了浏览器页面还在"）

`setBounds(0,0,0,0)` **不是隐藏**，在部分 Electron 版本里是伪隐藏 —— 这正是残留的元凶。

---

## §3 目标架构：三态 + 单一出口 + 单一闸门

### 3.1 数据模型（entry 从 4 字段扩到 6 字段）

```js
entry = {
  view,                 // BrowserView 实例
  cacheClearPromise,    // 首次 loadURL 前的缓存清理 Promise
  scrollbarCssKey,      // 已注入滚动条样式的 key

  attached: false,      // 【新增】物理挂载态：是否已 attach 到 BrowserWindow
  visible:  false,      // 【新增】业务可见意图：右栏开 && 该 tab 激活
  bounds:   null,       // 【新增】最近一次有效矩形；null = 无有效尺寸
}
```

**铁律**：
- `attached` 只能由 `applyVisibility()` 写，别处**只读**
- `visible` 由业务 handler 写（hide / resize / activateTab / load）
- **禁止任何业务代码直接调 `setBrowserView` / `setBounds(0,0,0,0)`**

### 3.2 唯一收敛函数 `applyVisibility(entry)`

```js
function applyVisibility(entry) {
  if (!entry || !mainWindow || mainWindow.isDestroyed()) return;

  const b = entry.bounds;
  const hasValidBounds = !!b && b.width >= 1 && b.height >= 1;
  const shouldShow = !!entry.visible && hasValidBounds;   // ← 唯一判定：意图 AND 尺寸

  if (shouldShow) {
    if (!entry.attached) {
      mainWindow.setBrowserView(entry.view);              // 挂上（带 try/catch）
      entry.attached = true;
    }
    entry.view.setBounds({ x, y, width, height });        // 同步矩形
    entry.view.webContents.setBackgroundThrottling(false); // 恢复渲染
    return;
  }

  if (entry.attached) {
    // 双保险摘除：
    //   removeBrowserView  → 触发 GPU 合成层清理（根治 Windows 残留）
    //   setBrowserView(null)→ 兜底（老版本 Electron 无 removeBrowserView）
    mainWindow.removeBrowserView(entry.view);
    mainWindow.setBrowserView(null);
    entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    entry.view.webContents.setBackgroundThrottling(true); // 后台节流，省 GPU
    entry.attached = false;
  }
}
```

**为什么这样能根治**：所有路径最终都问同一个问题「意图可见 **且** 有尺寸吗」，答错一次也只是这一次错，不会像 `hidden` 墓碑那样**永久卡死**。

### 3.3 渲染层单一闸门

`BrowserPanel.vue` 里曾经有**两份**重复判断（改动前 `syncBrowserViewBounds` 与 `onNavigated` 各写一遍 `rightPanelOpen && rightPanelTab === 'browser'`），容易漂移。收敛为：

```ts
const shouldBeVisible = computed(() =>
  chatStore.rightPanelOpen && chatStore.rightPanelTab === 'browser');

watch(shouldBeVisible, () => { nextTick(() => syncBrowserViewBounds(true)); }, { flush: 'post' });
```

配合 **100ms 节流 + 尾部补一次**的 bounds 同步：

> 纯 `requestAnimationFrame` 防抖在拖拽期间会被每帧回调**饿死**（一次都不执行，bounds 永远滞后）；
> 改成节流后拖拽过程可见跟随，松手后再补一次（`force = true`）保证精确对齐。

---

## §4 IPC 契约表（每条 handler 的目标行为）

`preload.cjs` 暴露 12 个方法，逐个定义目标语义：

| IPC | 允许写 `visible` | 允许写 `bounds` | 目标行为 |
|---|---|---|---|
| `createTab` | ❌（初始 false） | ❌（null） | 建 entry，不挂载 |
| `load` | ✅（激活后 true） | 兜底填充 | 先激活 → `ensureFallbackBounds()` 兜底 → `loadURL` |
| `resize` | ✅（`isActive`） | ✅ | 0 尺寸 = 隐藏请求（清 bounds + 摘除）；非激活 tab **只记 bounds 不挂载**（单槽机制，否则会顶掉正在显示的那个） |
| `hide` | ✅（false） | ✅（null） | 清 bounds + `applyVisibility` + 清 scrollbar key |
| `activateTab` | ✅（目标 true / 其他 false） | 不变 | **先清场再挂目标**；目标无 bounds 时等下一次 resize |
| `closeTab` | — | — | 无条件先摘除 → `webContents.destroy()` → 从 Map 删除 |
| `back` / `forward` / `reload` | ❌ | ❌ | 纯导航，不改挂载态 |
| `getUrl` / `canGoBack` / `canGoForward` | ❌ | ❌ | 纯查询 |
| `setZoomFactor` | ❌ | ❌ | 缩放（**遗留 L6**：缩放后应重算 bounds） |
| `insertScrollbarCSS` / `setTheme` | ❌ | ❌ | 注入样式（**遗留 L1**：key 管理有泄漏） |
| `action` | ❌ | ❌ | 页面内自动化操作；导航类 action 需过可见性守卫 |

---

## §5 当前进度：已做 vs 未做

### ✅ 已完成（本轮之前已落地，对应方案 §3.2 / §3.3）

| 项 | 文件 | 内容 |
|---|---|---|
| A1-1 | `main.cjs:383-420` | 新增 `applyVisibility()` 唯一收敛函数 |
| A1-2 | `main.cjs:314-316` | entry 增加 `attached` / `visible` / `bounds` 三字段，移除 `hidden` |
| A1-3 | `main.cjs:597-616` | `resize` 重写：0 尺寸走隐藏路径、非激活 tab 只记 bounds |
| A1-4 | `main.cjs:624-634` | `hide` 走收敛函数（双保险摘除） |
| A1-5 | `main.cjs:434-450` | `activateTab` 先清场再挂目标 |
| A1-6 | `main.cjs:422-432` | `ensureFallbackBounds()`：首次导航时兜底矩形 |
| A1-7 | `main.cjs:240` | `before-input-event` 改用 `entry.attached` 判断 |
| A2-1 | `BrowserPanel.vue:1036` | `shouldBeVisible` 单一闸门（原先 2 处重复判断） |
| A2-2 | `BrowserPanel.vue:486-543` | 100ms 节流 + 尾部补一次的 bounds 同步 |
| A2-3 | `BrowserPanel.vue:1386` | `onNavigated` 过同一闸门 |

**校验**：`node --check main.cjs` 通过；`vue-tsc --noEmit` 0 错误；`grep -n "\.hidden" main.cjs` → BrowserView 相关残留 0 处。

### ✅ P0 已完成（2026-09-02 追加）

| 项 | 文件 | 内容 |
|---|---|---|
| L2 | `main.cjs:467-500` | 新增 `refreshAllBrowserViewBounds(forceReattach)` + 50ms 合并器 `scheduleBoundsRefresh(force)`；`createWindow` 内按类型分流挂 7 个事件 |
| L2 | `main.cjs:286-288` | **强制重挂组**：restore / maximize / unmaximize / show / enter-full-screen / leave-full-screen；**仅更新 bounds 组**：resize（拖拽时摘挂会闪烁） |
| L2 | `main.cjs:471-476` | 无 bounds 时先 `ensureFallbackBounds()` 兜底 —— 否则强制摘挂后无尺寸可挂，且 DOM 尺寸未变不会再触发 ResizeObserver，**页面永久消失** |
| L3 | `main.cjs:346-374` | 单一 `onBrowserViewCrash(reason)`：1 秒内**双事件去重**（`render-process-gone` 与 `crashed` 新版都触发）+ `CRASH_RELOAD_LIMIT=3` 上限 + 超限 `send('browserView:crashed')` |
| L3 | `main.cjs:379` | `did-finish-load` 成功渲染后**清零** crashCount（只有连续崩溃才停手） |
| L3 | `preload.cjs:89-91` | 暴露 `onCrashed` |
| L3 | `BrowserPanel.vue:1410-1417` | 收到崩溃通知只**收尾 loading**，`console.warn` 记录；**不新增任何可见 UI**（遵守禁新增用户侧提示约束） |

**校验**：`node --check main.cjs` ✅ / `preload.cjs` ✅ / `vue-tsc --noEmit` 0 错误。

### ⬜ 未完成（本文档 §6 逐项展开）

剩余 7 项：L1 / L4 / L5 / L6 / L7 / L8 / L9。

---

## §6 遗留项（9 项）：现状 / 症状 / 改法 / 风险

### L1 · `scrollbarCssKey` 泄漏 🟡

**现状**：`main.cjs:610`（resize 0 尺寸分支）与 `:633`（hide）都写：

```js
if (entry.scrollbarCssKey) entry.scrollbarCssKey = null;
```

只把 key 丢了，**没有调 `wc.removeInsertedCSS(key)`**。

**症状**：key 丢失后旧样式再也无法移除；主题反复切换时新旧两套滚动条 CSS 在页面内**叠加累积**，滚动条样式逐渐错乱。

**改法**：清 key 前先 `await wc.removeInsertedCSS(entry.scrollbarCssKey)`；或干脆**不清 key** —— CSS 留在页面内无害，hide/show 不需要重新注入（注释里"下次显示会重新注入"的说法与代码不符，实为误导）。

**风险**：🟢 低。只动样式，不影响生命周期。

---

### L2 · 窗口级事件未挂钩 🟠 **最高优先级**

**现状**：`main.cjs` 里 BrowserView 相关**完全没有**监听窗口事件。只有：

```js
ipcMain.on('window-minimize', () => mainWindow?.minimize());   // :504
ipcMain.on('window-maximize', () => {...});                     // :505
```

**症状**（Windows 高发）：
- 窗口 **最小化再恢复** 后，BrowserView 图层不重绘 → 黑块 / 残留
- 窗口 **最大化/还原** 后 bounds 错位 → 网页被裁切或偏移
- 窗口 **边缘拖拽缩放** 时，渲染层 ResizeObserver 有 100ms 节流，快速拖拽会短暂露白

**改法**：主进程补挂三类事件，统一调 `applyVisibility` 或重算 bounds：

```js
mainWindow.on('restore',   () => refreshAllBounds());
mainWindow.on('maximize',  () => refreshAllBounds());
mainWindow.on('unmaximize',() => refreshAllBounds());
mainWindow.on('resize',    () => refreshAllBounds());
mainWindow.on('enter-full-screen', () => refreshAllBounds());
mainWindow.on('leave-full-screen', () => refreshAllBounds());

function refreshAllBounds() {
  for (const entry of browserViews.values()) {
    if (entry.visible) {
      // 关键：先强制摘一次再挂，强制 GPU 重新合成
      try { mainWindow.removeBrowserView(entry.view); mainWindow.setBrowserView(null); } catch {}
      entry.attached = false;
      applyVisibility(entry);
    }
  }
}
```

**风险**：🟡 中。事件风暴下频繁摘挂可能引起闪烁 → 需加 rAF/50ms 合并。

---

### L3 · 渲染进程崩溃：有自动重载，但无上限、无通知 🟠

> **2026-09-02 更正**：初版方案写「只 console.warn 无恢复动作」是**错的**。代码里已有自动重载：

**现状**：`main.cjs:331-337`

```js
wc.on('render-process-gone', (_e, details) => {
  console.warn('[browserView] render-process-gone:', details?.reason);
  try { wc.reload(); } catch { /* ignore */ }     // ← 已有自动重载
});
wc.on('crashed' /* 兼容旧事件名 */, () => {
  try { wc.reload(); } catch { /* ignore */ }     // ← 旧别名
});
```

**真实缺口有三个**：

| # | 缺口 | 症状 |
|---|---|---|
| a | **无次数上限** | 页面本身有问题（死循环 / OOM / 崩溃型站点）时会**无限重载打转**，CPU 与内存持续被吃 |
| b | **双事件重复触发** | Electron 新版本 `render-process-gone` 与 `crashed` **都会触发**，同一个 handler 逻辑跑两遍（当前只是 reload 两次，加了计数后会直接误判翻倍） |
| c | **不通知渲染层** | 重载期间右栏是空白的，前端 `loading` 状态转圈不停；超过上限停在错误态时，用户完全不知道发生了什么 |

**改法**：
1. 抽单一 `onCrash(reason)` handler，用 **1 秒内时间戳去重**，消除 b
2. 加 `CRASH_RELOAD_LIMIT = 3` 上限；`did-finish-load` 成功后清零计数，消除 a
3. 超限后 `mainWindow.webContents.send('browserView:crashed', tabId, reason)`，preload 暴露 `onCrashed`，渲染层收尾（停 loading + 极简错误态），消除 c

**风险**：🟡 中。渲染层的错误态 UI 属「错误恢复反馈」，不是功能提示，但**仍需用户确认是否接受**（用户偏好：禁新增用户侧提示/按钮）。

---

### L4 · 后台 tab 未节流 🟡

**现状**：`setBackgroundThrottling(true)` **只在 `applyVisibility` 的隐藏分支调用**（`main.cjs:417`）。
非激活但仍在 Map 里的 tab 从未被节流。

**症状**：多 tab 场景下每个 BrowserView 一个独立渲染进程，全部满速跑 → 内存与 GPU 占用持续走高（这跟用户长期反馈的"应用卡"可能直接相关）。

**改法**：`activateTab` 清场时对被切走的 entry 调 `setBackgroundThrottling(true)`；激活时恢复 `false`。
另建议：给 `browserViews` 设 **tab 数上限（建议 6）**，超出时按 LRU 销毁最久未激活的 tab。

**风险**：🟢 低。

---

### L5 · `closeTab` 后无 tab 顶替 🟡

**现状**：`closeTab` 只做摘除 + destroy + `if (activeTabId === tabId) activeTabId = null;`。

**症状**：关掉当前 tab 后 `activeTabId = null`，渲染层后续 `resize(activeTabId=null, ...)` 走的是「取 activeTabId」分支 → 找不到 entry → **静默失败**。用户看到"点了没反应"。

**改法**：关掉激活 tab 时，从剩余 tab 里挑最近激活的一个顶替并 `activateTab(newId)`；若无剩余则通知渲染层回到空态。

**风险**：🟢 低。

---

### L6 · `setZoomFactor` 后 bounds 不重算 🟡

**现状**：`browserView:setZoomFactor` 只改缩放，**不重算 bounds**。

**症状**：缩放到 150% 再切回 100%，页面内容与占位区错位（尤其配合窗口缩放时）。

**改法**：handler 末尾补 `applyVisibility(entry)`，并触发渲染层一次 `syncBrowserViewBounds(true)`。

**风险**：🟢 低。

---

### L7 · tab 数量无上限 / 内存无回收 🟡

同 L4 的 LRU 上限方案。另外 `webContents.destroy()` 之后应校验 `browserViews.size`，并在 dev 日志里定期打印，便于定位泄漏。

**风险**：🟢 低。

---

### L8 · 多窗口假设 🟠（架构级）

**现状**：`mainWindow` 是模块级单例，`applyVisibility` 直接引用它。

**症状**：一旦将来开第二个 BrowserWindow（如"从右栏拖出独立窗口"），BrowserView 会挂到错误的窗口上。

**改法**：`entry` 增加 `ownerWindow` 字段，`createTab` 时从 `BrowserWindow.fromWebContents(e.sender)` 反查；`applyVisibility` 用 `entry.ownerWindow` 而非全局 `mainWindow`。
另需监听 `ownerWindow.on('closed')` 清理该窗口名下的所有 tab。

**风险**：🟠 高（改动面大，但现在是**未雨绸缪**，不做会在将来变成大坑）。建议**先只加字段不改行为**，等真有多窗口需求再启用。

---

### L9 · 首次导航竞态（已缓解，待观察）🟢

**现状**：已加 `ensureFallbackBounds()`（`main.cjs:422-432`），首次导航时若渲染层还没同步过 bounds，用「窗口右侧 480px 宽」兜底。

**遗留**：兜底矩形写死 `Math.min(480, w)`，与 CSS 变量 `--chat-right-w` 可能不一致（用户拖宽右栏后首次导航会闪一下）。

**改法**：兜底宽度改为从渲染层传入，或读 CSS 变量。属可观察项，不急。

**风险**：🟢 低。

---

## §7 分期建议

| 分期 | 项目 | 风险 | 工作量 |
|---|---|---|---|
| **P0** | L2 窗口事件挂钩 + L3 崩溃恢复 | 🟠 | 0.5~1 天 |
| **P1** | L1 CSS 泄漏 + L5 closeTab 顶替 + L6 缩放重算 | 🟢 | 0.5 天 |
| **P2** | L4 后台节流 + L7 LRU 上限 | 🟢 | 0.5 天 |
| **P3** | L8 多窗口 ownerWindow 预留 | 🟠 | 1 天（建议只加字段） |
| — | L9 观察项 | 🟢 | 不排期 |

---

## §8 验收清单（P0/P1 完成后逐条复现）

- [ ] 浏览器加载页面 → 收起右栏 → **展开右栏**，页面正常回来（无消失、无残留）
- [ ] 收起右栏后，点击右栏区域下方 UI **可正常响应**（验证残留图层吞点击已解决）
- [ ] 窗口**最小化 → 恢复**，BrowserView 正常重绘，无黑块
- [ ] 窗口**最大化 → 还原**，bounds 正确无错位
- [ ] 快速拖拽窗口边缘缩放，无长时间露白
- [ ] 单页面内 `window.open` 或被强制跳转后，tab 标题更新为真实网站名
- [ ] 渲染进程崩溃后自动重载一次，连续崩溃停在错误态
- [ ] 连续开关右栏 10 次，无图层累积（dev 日志 `browserViews.size` 稳定）
- [ ] 深色 / 浅色主题切换 5 次，滚动条样式不叠加错乱
- [ ] 关闭当前激活 tab 后，剩余 tab 自动顶替且正常显示

---

## §9 明确不做的事

- ❌ 不改动 BrowserView 的**技术选型**（仍是原生 BrowserView，不退回 iframe —— 那会丢掉渲染 finance.sina 这类拒绝 iframe 页面的能力）
- ❌ 不新增用户侧的功能说明、引导按钮、hover tip
- ❌ 不在此轮改动 LLM 工具桥接（`chat.ts:738-741` 的 `browser_navigate`），多 tab 化时再统一迁移
- ❌ 不动 `pageAgent` 的页面操作脚本（`main.cjs` 内 `get_visible_text` / `is_visible` 等 case）
