# pageAgent 浏览器操作 IPC 直连改造方案

> 制定时间：2026-09-06
> 目标：去掉 pageAgent 对后端 Playwright 的依赖，改为前端通过 IPC 直接操作 Electron BrowserView，确保 pageAgent 操作的就是预览面板的浏览器，过程完全可见。

---

## 一、为什么要改

### 当前架构的问题（后端 Playwright + CDP）
```
pageAgent → browser_工具 → 后端 Playwright → CDP(9222) → Electron BrowserView
```

诊断证实的问题：
1. **CDP 限制多**：Electron 的 CDP 实现不完整，`Target.createTarget: Not supported`，无法创建新 page
2. **超时频繁**：getPage() 15秒超时，自动重置后还是超时，陷入死循环
3. **页面黑屏**：Playwright 通过 CDP 操作页面时触发 BrowserView 渲染崩溃
4. **操作不同步**：Playwright 操作的 page 和预览面板的 BrowserView 可能不是同一个
5. **双浏览器分裂历史**：之前 navigate 操作前端 BrowserView，其它工具操作后端 Playwright，两个页面不同步

### 改造后架构（前端 IPC 直连）
```
pageAgent → browser_工具 → 前端 dispatchToolCall → IPC → Electron 主进程 → BrowserView webContents
```

优势：
- 操作的就是预览面板的 BrowserView，**100% 同步可见**
- 不依赖 Playwright 库，去掉重量级依赖
- 没有 CDP 连接的各种限制和超时问题
- 更稳定，更符合 Electron 原生架构
- Web 端回退到后端 Playwright，保持兼容

---

## 二、改造范围

### 2.1 Electron 主进程（apps/desktop/main.cjs）
- 维护当前活动 BrowserView 引用（从 browserViews Map 获取 activeTabId 对应 entry）
- 新增统一 IPC 通道：`browser:call`，接收 action + args，分发到具体操作
- 实现所有 browser_ 工具对应的操作函数
- 注入元素注册表脚本到 BrowserView（支持 index 定位）

### 2.2 前端平台层（apps/desktop/src/platform.ts）
- 暴露 `window.electronAPI.browser.call(action, args)` 统一接口
- 超时保护（默认 15 秒）

### 2.3 前端状态层（packages/ui/src/stores/chat.ts）
- dispatchToolCall 中 browser_ 工具全部走 IPC 调用
- 保留 openTab 打开预览面板逻辑
- 每个工具调用后更新 browserSteps 日志
- Web 端检测：没有 electronAPI 时回退到后端 Playwright

### 2.4 后端 browser.ts（apps/server/src/routes/browser.ts）
- **保留不动**，继续给 Web 端使用
- 桌面端不再调用后端 browser API

### 2.5 工具定义（packages/core/src/tool/builtin/browser/index.ts）
- callBrowserApi 保留，Web 端继续使用
- 桌面端在 dispatchToolCall 层走 IPC，不调用 callBrowserApi

---

## 三、IPC 工具清单

### 核心工具（优先实现）
| 工具名 | IPC action | 说明 |
|--------|-----------|------|
| browser_navigate | navigate | 导航到 URL |
| browser_get_page_info | get_page_info | 返回 url/title/可交互元素列表（带 index） |
| browser_click | click | 点击元素（index/selector/x/y） |
| browser_type | type | 输入文本（index/selector + text） |
| browser_press_key | press_key | 按键（Enter/Tab/Escape 等） |
| browser_screenshot | screenshot | 截图 |
| browser_get_visible_text | get_visible_text | 获取干净可见文本 |
| browser_wait | wait | 等待指定时间 |

### 辅助工具
| 工具名 | IPC action | 说明 |
|--------|-----------|------|
| browser_scroll | scroll | 滚动页面 |
| browser_hover | hover | 悬停元素 |
| browser_get_text | get_text | 获取元素文本 |
| browser_get_dom | get_dom | 获取页面 DOM 摘要 |
| browser_wait_for | wait_for | 智能等待（元素/URL/文本） |

### 高级工具
| 工具名 | IPC action | 说明 |
|--------|-----------|------|
| browser_fill_form | fill_form | 批量填写表单 |
| browser_submit_form | submit_form | 提交表单 |
| browser_search | search | 页面搜索框输入并提交 |
| browser_next_page | next_page | 下一页 |
| browser_prev_page | prev_page | 上一页 |
| browser_select_option | select_option | 下拉选择 |
| browser_check | check | 勾选 |
| browser_uncheck | uncheck | 取消勾选 |
| browser_login_saved | login_saved | 用已保存密码自动登录 |
| browser_open_external | open_external | 用外部浏览器打开 |

### 多标签工具
| 工具名 | IPC action | 说明 |
|--------|-----------|------|
| browser_new_tab | new_tab | 新建标签页 |
| browser_switch_tab | switch_tab | 切换标签页 |
| browser_close_tab | close_tab | 关闭标签页 |
| browser_get_tabs | get_tabs | 获取所有标签页 |

---

## 四、关键设计

### 4.1 当前活动 BrowserView 获取
```javascript
function getActiveBrowserView() {
  if (activeTabId && browserViews.has(activeTabId)) {
    const entry = browserViews.get(activeTabId);
    if (entry && entry.view && !entry.view.isDestroyed()) {
      return entry.view;
    }
  }
  // 没有活动的 BrowserView，创建一个新的
  // ... 创建逻辑
  return newView;
}
```

### 4.2 元素注册表（index 定位）
延续后端 browser.ts 的设计：
- get_page_info 时注入 `ensureYzRefs()` 脚本，为每个可交互元素分配 index
- click/type 用 index 定位，通过 `page.evaluate` 找到对应元素
- 页面变化后 index 失效，需要重新调用 get_page_info

### 4.3 统一 IPC 通道
```javascript
// 主进程
ipcMain.handle('browser:call', async (event, action, args) => {
  const view = getActiveBrowserView();
  const webContents = view.webContents;
  switch (action) {
    case 'navigate': return await navigate(webContents, args);
    case 'click': return await click(webContents, args);
    case 'type': return await type(webContents, args);
    // ... 所有 action
    default: throw new Error(`Unknown browser action: ${action}`);
  }
});
```

### 4.4 超时保护
每个 IPC 操作加超时（默认 15 秒），超时返回错误：
```javascript
function withTimeout(promise, ms = 15000, msg = '操作超时') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
  ]);
}
```

### 4.5 Web 端兼容
前端 dispatchToolCall 中检测：
```typescript
const isElectronDesktop = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
if (isElectronDesktop) {
  // 走 IPC
  return await window.electronAPI.browser.call(action, args);
} else {
  // Web 端走后端 Playwright
  return await registry.execute(fullName, args);
}
```

---

## 五、实施步骤

### 阶段一：核心 IPC 通道（navigate/get_page_info/click/type/press_key/screenshot）
1. main.cjs 中实现 getActiveBrowserView()
2. 实现统一 IPC 通道 `browser:call`
3. 实现 navigate、get_page_info、click、type、press_key、screenshot
4. platform.ts 暴露 electronAPI.browser.call
5. chat.ts dispatchToolCall 中核心 browser_ 工具走 IPC

### 阶段二：辅助工具（get_visible_text/get_dom/scroll/hover/wait/wait_for/get_text）
1. main.cjs 中实现辅助工具操作函数
2. chat.ts 中接入

### 阶段三：高级工具（fill_form/submit_form/search/next_page/prev_page/select_option/check/uncheck）
1. main.cjs 中实现高级工具操作函数
2. chat.ts 中接入

### 阶段四：多标签工具（new_tab/switch_tab/close_tab/get_tabs）
1. main.cjs 中实现多标签操作（复用已有的 browserViews 管理）
2. chat.ts 中接入

### 阶段五：login_saved/open_external + 测试验证
1. 实现 login_saved（复用已有的密码管理）
2. 实现 open_external
3. 测试：pageAgent 打开百度 → 预览面板同步显示 → click/type 正常 → get_page_info 返回元素列表
4. Web 端回退验证

---

## 六、风险和注意事项

1. **元素注册表注入时机**：每次 get_page_info 时重新注入，页面变化后 index 失效
2. **iframe 穿透**：get_page_info 需要穿透 iframe/Shadow DOM，和后端实现一致
3. **IPC 性能**：频繁 IPC 调用有开销，但浏览器操作可以接受
4. **向后兼容**：后端 browser.ts 保留，Web 端继续使用
5. **错误处理**：每个 IPC 操作都要 try-catch，返回清晰错误信息
6. **BrowserView 生命周期**：操作前检查 view 是否被销毁，销毁时自动重建

---

## 七、回滚方案

如需回滚：
1. chat.ts dispatchToolCall 中 browser_ 工具改回走 registry.execute（后端 Playwright）
2. main.cjs 移除 browser:call IPC 通道
3. platform.ts 移除 electronAPI.browser.call
4. 保留后端 browser.ts 不变（一直没动）
