# 言智平台浏览器模块 & 搜索工具 & pageAgent 改造优化方案

> 整理时间：2026-09-06
> 目标：对齐豆包 CNGC Browser Use 架构，解决 pageAgent 卡死、双浏览器分裂、任务终止不了、搜索工具不稳定等核心问题

---

## 一、核心问题诊断

### 1.1 pageAgent 卡死的 5 个根因
| # | 根因 | 表现 |
|---|------|------|
| 1 | page.evaluate 无超时兜底 | 页面假死后永久挂起 |
| 2 | 仅用 isConnected() 判断存活 | 连接在但页面已死，误判存活 |
| 3 | headless:true 写死被反爬检测 | 百度返回验证码页，工具超时 |
| 4 | 全局递增 index 页面变化后失效 | click/type 点错元素或找不到 |
| 5 | 异常后无自动恢复 | 一次失败后整个 pageAgent 永久卡死 |

### 1.2 双浏览器分裂（最严重）
```
browser_navigate → 前端 BrowserView（设置 currentBrowserUrl）
browser_get_page_info → 后端 Playwright（about:blank）← 不同步！
browser_click/type → 后端 Playwright（无元素，超时挂起）
```
前端 BrowserView 和后端 Playwright 是两个不同的浏览器实例，navigate 操作了 A，其它工具操作 B，B 还是 about:blank，工具全部超时。

### 1.3 CDP 模式下错误操作主窗口
后端通过 CDP 连接 Electron 后，`createTabPage` 的页面选择逻辑只检查 `^https?://`，但 Electron 主窗口是 `http://localhost:1420` 也匹配，导致**错误地选中主窗口**，pageAgent 导航时把聊天界面变成了百度。

### 1.4 未知工具卡住主流程
pageAgent 系统提示词推荐了不存在的 `browser_action_and_observe` 工具和 `ref` 参数，大模型调用后走前端兜底，前端没有这个工具不返回结果，卡 30 秒超时，反复调用累计卡死。

### 1.5 任务终止不了
终止按钮只发信号，但工具执行循环中没有检查停止标记，工具运行完/下一次调用前不会终止。executeToolViaFrontend 等待前端 POST 结果时也无法被中断。

---

## 二、浏览器模块改造（CDP 统一架构）

### 2.1 架构目标：和豆包一样
**一个浏览器实例，所有工具操作同一个页面，预览面板就是这个浏览器。**

```
所有 browser_ 工具 → 后端 Playwright → CDP(9222) → Electron BrowserView
预览面板 = BrowserView = 工具操作的页面 ✅
```

### 2.2 Electron 主进程改造（main.cjs）

#### 开启 CDP 远程调试端口
```javascript
const CDP_PORT = process.env.YANZHI_CDP_PORT || '9222';
app.commandLine.appendSwitch('remote-debugging-port', CDP_PORT);
```
- 必须在 `app.whenReady()` 之前调用
- 端口可通过 `YANZHI_CDP_PORT` 环境变量覆盖

#### 启动后端 server 时传递 CDP 环境变量
三个启动位置（开发模式 tsx / 开发模式 npx tsx / 生产模式）都加：
```javascript
env: {
  ...process.env,
  BROWSER_MODE: 'cdp',
  CDP_ENDPOINT: 'http://127.0.0.1:' + CDP_PORT,
  // ...
}
```

#### 单实例锁
```javascript
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) { app.quit(); }
else {
  app.on('second-instance', () => { /* 激活已有窗口 */ });
}
```
- 确保同一时间只有一个 yan-zhi 实例运行
- 避免安装新版本后旧进程残留导致数据冲突

### 2.3 后端 browser.ts 改造

#### getBrowser() 支持 CDP / launch 双模式
```typescript
if (BROWSER_MODE === 'cdp') {
  browserInstance = await withTimeout(
    chromium.connectOverCDP(CDP_ENDPOINT), 'CDP 连接失败'
  );
} else {
  browserInstance = await withTimeout(
    chromium.launch({ headless: BROWSER_HEADLESS }), '浏览器启动失败'
  );
}
```

#### createTabPage CDP 模式页面选择（核心修复）
**排除 localhost/127.0.0.1 主窗口，只选真正的外部网页：**

```typescript
const isExternalPage = (p: any) => {
  try {
    const url = p.url();
    if (url === 'about:blank' || url === '') return true; // BrowserView 初始态
    if (!/^https?:\/\//i.test(url)) return false;
    // 排除 localhost / 127.0.0.1 / 0.0.0.0（主窗口或本地 dev server）
    return !/^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i.test(url);
  } catch { return false; }
};
```

**页面选择优先级：**
1. 遍历所有 context，优先找外部网页（非 localhost）
2. 没找到找 about:blank 页面（BrowserView 初始态）
3. 还是没有，用第一个 context 的第一个页面（**绝不创建新 page**，CDP 下创建容易卡住）
4. 极端情况所有 context 假死，才创建新 context + page（加超时）

**new_tab 场景：**
- 优先在有外部网页的 context 中创建（BrowserView 的 partition）
- `context.newPage()` 加超时保护（CDP 下容易卡住）

#### 超时保护全覆盖
| 操作 | 超时 | 说明 |
|------|------|------|
| withTimeout 统一封装 | 15s（OP_TIMEOUT_MS） | 所有浏览器操作入口 |
| getBrowser 启动/连接 | 15s | 启动失败快速报错 |
| page.goto 导航 | 30s | domcontentloaded 等待 |
| context.newPage | 15s | CDP 模式下创建新 page |
| page.addInitScript | 15s | 注入初始化脚本 |
| isPageAlive 心跳 | 15s | page.evaluate 探针 |
| isBrowserAlive 心跳 | 15s | browser.version 探针 |
| callBrowserApi（前端） | 30s | IPC / fetch 调用 |

#### 健康探针（替代不可靠的 isConnected）
```typescript
async function isPageAlive(p: any): Promise<boolean> {
  try {
    await withTimeout(p.evaluate(() => 1), 'page 心跳超时');
    return true;
  } catch { return false; }
}

async function isBrowserAlive(b: any): Promise<boolean> {
  try {
    await withTimeout(b.version?.() ?? Promise.resolve('ok'), '浏览器心跳超时');
    return true;
  } catch { return false; }
}
```

#### 自动恢复机制
- getPage() 检测到 page 假死 → resetBrowser() 强制清理 → 重建
- action catch 检测到超时 → 自动 resetBrowser() → 返回 recoverable:true
- recoverSession()：browser 还在但 page 丢了 → 重建 page 并导航到最近 URL
- scheduleIdleCheck()：空闲超时自动关闭浏览器释放资源（CDP 模式只断开连接，不关用户浏览器）

#### CDP 模式安全约束
- resetBrowser / 空闲超时 / close 路由：CDP 模式下只关闭我们创建的 page，**不关用户的真实 Chrome/Electron**
- createTabPage 加 reuseExisting 参数：getPage 首次调用传 true（复用），new_tab 传 false（真正新建）

### 2.4 前端 chat.ts 改造

#### browser_navigate 走后端 CDP（消除双浏览器分裂）
```typescript
if (fullName === 'browser_navigate') {
  if (isElectronDesktop && rawUrl) {
    // 只保留 openTab 打开预览面板
    openTab({ kind: 'browser', name: host, url: target });
  }
  // 导航由后端 Playwright（CDP 模式下操作 BrowserView）执行
  const res = await registry.execute('browser_navigate', args);
  return { ok: !res.isError, result: text };
}
```
- **不再设置 currentBrowserUrl**（之前这是双浏览器分裂的根源）
- 保留 openTab 打开预览面板
- 导航由后端 CDP 操作 BrowserView，预览面板同步显示

#### 未知工具直接报错（不走前端兜底卡住）
```typescript
// browser_ 前缀但不在注册表中 → 直接报错，列出可用工具
if (toolName.startsWith('browser_') && !registry.has(toolName)) {
  return `工具不存在: ${toolName}。可用浏览器工具: ...`;
}
// 所有未知工具 → 直接报错
return `工具不存在: ${toolName}。可用工具（前30个）: ...`;
```

### 2.5 dev-desktop.bat 改造
启动前自动清理残留进程：
```batch
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -match 'electron|node|tsx|vite') -and ($_.CommandLine -match 'yan-zhi|yan_zhi|yanzhi|apps.DEdesktop|apps.DEserver') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
```
- 只杀命令行含 yan-zhi 的进程，不误杀 VS Code 等其它 Electron 应用
- 解决直接关窗口导致的孤儿进程残留问题

---

## 三、网络搜索工具（web_search）改造

### 3.1 复用 browser.ts 单例（消除独立浏览器实例）
- 移除 search-backend.ts 中独立的 `_browser/_page` 实例管理
- `import { getBrowser, withTimeout, resetBrowser } from './browser.js'`
- PlaywrightSearchBackend.search() 加 withTimeout 兜底
- 页面获取失败时自动 resetBrowser 后重试一次

### 3.2 多搜索引擎支持

#### 引擎配置
| 引擎 | 搜索 URL | 状态 |
|------|---------|------|
| Bing | https://www.bing.com/search?q= | 默认首选 |
| 百度 | https://www.baidu.com/s?wd= | 易触发验证码 |
| 搜狗 | https://www.sogou.com/web?query= | 新增 |
| DuckDuckGo | https://duckduckgo.com/html/?q= | 兜底 |

#### 验证码检测（14 个关键词）
```
安全验证 / 滑块 / 验证通过 / 拖动 / 扫码验证 / 网络不给力 /
请完成下方验证 / 图片未转正 / 正在验证 / captcha / CAPTCHA /
访问验证 / 异常流量
```
检测到验证码就抛错，触发降级链。

#### MultiEngineSearchBackend（串行执行）
- 执行顺序：Bing → 百度 → 搜狗
- **串行而非并行**：避免同时开多个 tab 抢资源
- 已有足够结果时提前终止
- 全部失败时 DuckDuckGo 兜底

#### 工具参数扩展
```typescript
WebSearchTool.inputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string', description: '搜索关键词' },
    engine: {
      type: 'string',
      enum: ['auto', 'bing', 'baidu', 'sogou', 'duckduckgo'],
      description: '指定搜索引擎，不指定默认 auto 跑三个',
    },
    timeRange: { /* ... */ },
  },
  required: ['query'],
};
```
- 大模型可指定搜索源，不指定默认 auto 跑三个

### 3.3 独立 tab 隔离 + Tab 缓存池

#### 独立 context（与 pageAgent 隔离）
- launch 模式：web_search 创建独立 context，与 pageAgent 主 context 隔离
- CDP 模式：复用用户 context 但新建 page
- 每次搜索 `context.newPage()` 创建独立 tab
- `try-finally` 确保所有路径都关闭/归还 tab

#### TabPool 缓存池
| 配置项 | 值 | 说明 |
|--------|-----|------|
| maxSize | 3 | 池大小 |
| idleTimeoutMs | 5分钟 | 空闲 tab 自动回收 |
| acquire() | - | 从池中取健康 tab，池空则创建新 tab |
| release() | - | 导航到 about:blank + 清 cookies 后放回池，池满则真正关闭 |
| isHealthy() | 2s | page.evaluate 心跳检查 |

- 减少 newPage/close 开销
- 假死 tab 直接关闭，不放回池
- context 重置时清空整个池

---

## 四、pageAgent 智能体改造

### 4.1 系统提示词修正（核心）

#### 修正前的问题
- 推荐了不存在的 `browser_action_and_observe` 工具
- 说"优先用 ref（d1:e12）定位"，但实际工具只支持 index/selector/x/y
- 导致大模型调用不存在的工具或传不支持的参数，走前端兜底卡住

#### 修正后的核心工作方式
```
【核心工作方式 — 元素编号定位（最重要）】
1. 每到一个新页面或弹窗出现后，先调用 browser_get_page_info
   获取带编号（index）的可交互元素列表
2. 用列表中的 index 直接调用 browser_click / browser_type
   不要自己猜动态 hash class 选择器，不要凭截图猜坐标
3. 页面变化后 index 会失效，重新调用 browser_get_page_info 刷新
4. noChangeStreak ≥ 3 时必须停止重复操作，改换定位方式或 ask_user
```

#### 推荐工具列表（只列真实存在的工具）
browser_navigate / browser_click / browser_type / browser_press_key /
browser_scroll / browser_get_page_info / browser_get_visible_text /
browser_fill_form / browser_search / browser_submit_form /
browser_next_page / browser_wait_for / browser_screenshot / ask_user

### 4.2 描述修正
- **修正前**："内置 pageAgent：通过 Playwright 驱动真实浏览器..."
- **修正后**："内置 pageAgent：驱动应用内浏览器预览面板，执行导航/点击/输入/截图等自动化任务"
- 原因：桌面端走 IPC 操作 BrowserView，不是 Playwright；Web 端才走 Playwright

### 4.3 工具白名单
```typescript
PAGE_AGENT_BUILTIN_TOOLS = [
  // 浏览器核心工具（约39个 browser_*）
  'browser_navigate', 'browser_click', 'browser_type', 'browser_press_key',
  'browser_scroll', 'browser_hover', 'browser_get_text', 'browser_get_dom',
  'browser_wait', 'browser_screenshot', 'browser_fill_form', 'browser_submit_form',
  'browser_search', 'browser_next_page', 'browser_prev_page', 'browser_wait_for',
  'browser_get_visible_text', 'browser_select_option', 'browser_check', 'browser_uncheck',
  'browser_get_page_info', 'browser_login_saved', 'browser_open_external',
  // ... 其它 browser_* 工具
  // 通用工具
  'ask_user', 'confirm_user', 'file_read', 'file_write',
  'web_search', 'cmd_exec', 'task_plan', 'task_step', 'image_analyze',
];
```

### 4.4 数据库同步问题
智能体配置在首次启动时写入数据库，修改 db.ts 源码后**不会自动更新数据库**。需要：
- 删除旧数据库重新初始化（会丢失聊天记录）
- 或手动 UPDATE 数据库中的 agent 表
- 或在代码中加版本检测，启动时自动同步内置智能体配置

---

## 五、任务终止修复

### 5.1 协作式取消设计
```
用户点停止任务 → 后端 abortController.abort() → 打停止标记
  ↓
工具执行前检查：if(aborted) throw AbortError
  ↓
工具执行后立即检查：if(aborted) throw AbortError
  ↓
请求大模型前检查：if(aborted) 直接结束
  ↓
abortTask 拒绝所有 pendingToolCall（executeToolViaFrontend 不再永久等待）
```

### 5.2 两道检查点
- **主任务工具执行循环**：执行工具前 + 工具执行后检查 `task.abortController.signal.aborted`
- **子智能体工具执行循环**：同样两道检查
- **executeTool 中**：AbortError 不被 catch 吞掉，重新抛出

### 5.3 abortTask 完整清理
```typescript
export function abortTask(taskId: string) {
  task.abortController.abort();
  task.status = 'aborted';
  for (const [, pending] of task.pendingToolCalls) {
    if (pending.timer) clearTimeout(pending.timer);
    pending.reject(new DOMException('Aborted', 'AbortError'));
  }
  task.pendingToolCalls.clear();
}
```

### 5.4 停止任务按钮
- tooltip 从"终止 (停止生成)"改为"停止任务"
- 按钮只是发信号，不是立马停止任务——给停止标记，工具运行完/下一次调用前/请求大模型前检查标记并结束

---

## 六、验证清单

### 6.1 TypeScript 编译
- 改造的所有文件零错误
- 项目原有错误仅在 local-model-market.ts（与本次改造无关）

### 6.2 pageAgent 测试用例（15个）
- browser_navigate/click/type/get_page_info/press_key 参数解析
- 系统提示词与工具白名单一致性
- callBrowserApi 超时处理
- 工具不存在时错误处理
- 空参返回引导不永久挂起

### 6.3 功能验证
- [ ] pageAgent 打开百度，预览面板显示百度页面
- [ ] 主窗口聊天界面不受影响（不变成百度）
- [ ] browser_get_page_info 返回页面元素列表
- [ ] browser_click/browser_type 用 index 正常操作
- [ ] web_search 多引擎搜索正常，验证码自动降级
- [ ] 停止任务能正常终止
- [ ] 子智能体执行细节前端可见（待修复）
- [ ] CDP 模式下 getPage 不超时（刚修复，待验证）

---

## 七、待解决问题

| # | 问题 | 优先级 | 说明 |
|---|------|--------|------|
| 1 | 子智能体执行细节前端不可见 | 高 | pageAgent 的工具调用、中间结果在前端看不到，需要排查消息渲染逻辑 |
| 2 | 数据库中 pageAgent 配置还是旧版本 | 中 | 需要加版本检测自动同步，或手动更新数据库 |
| 3 | CDP 模式下 createTabPage 超时 | 中 | 刚修复（优先复用页面不创建新 page），待验证 |
| 4 | pageAgent 最终结果回传主智能体 | 低 | 代码逻辑正确（return fullContent），但需验证前端显示 |

---

## 八、回滚方案

如需回滚，按以下顺序：
1. 还原 main.cjs：移除 CDP 端口、单实例锁、BROWSER_MODE 环境变量
2. 还原 browser.ts：CDP 模式相关代码、createTabPage 页面选择逻辑
3. 还原 chat.ts：browser_navigate 桌面端特殊处理（设置 currentBrowserUrl）
4. 还原 search-backend.ts：独立浏览器实例管理、移除 TabPool
5. 还原 db.ts：pageAgent 系统提示词和描述
6. 还原 llm-task-manager.ts：任务终止检查、未知工具报错
7. 删除 dev-desktop.bat 中的清理残留进程步骤
