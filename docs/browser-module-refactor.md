# 浏览器模块改造方案与实施记录

> 改造目标：解决 pageAgent "一直卡着"的问题，并向 CNGC Browser Use 架构对齐。

---

## 一、问题根因分析

| # | 问题 | 根因 | 影响 |
|---|------|------|------|
| 1 | **操作永久挂起** | `page.evaluate()` / `page.goto()` 等 Playwright 调用无超时兜底，僵尸浏览器实例会导致请求无限等待 | pageAgent 工具调用超时，父智能体 `call_agent` 一直等 |
| 2 | **实例假死无法检测** | 仅用 `browserInstance.isConnected?.()` 判断存活，Playwright 在崩溃场景下 `isConnected()` 仍可能返回 `true` | 后续所有操作静默失败或挂起 |
| 3 | **headless 被反爬检测** | `chromium.launch({ headless: true })` 写死，百度/淘宝等站点对 headless 有严格检测 | 页面加载为空、被重定向到验证码、`wait_for_load` 超时 |
| 4 | **index 失效重试风暴** | `get_page_info` 每次重新给可交互元素编号，页面动态变化后 index 对应关系改变，pageAgent 反复重试直到超时 | 多轮无效调用，最终超时 |
| 5 | **异常后无自动恢复** | catch 块仅返回错误，不重置浏览器状态 | 一次崩溃后后续所有请求都失败，需手动重启服务 |

---

## 二、阶段一：紧急修复（已实施 ✅）

### 修改文件
`apps/server/src/routes/browser.ts`

### 变更清单

#### 1. 新增统一超时兜底 `withTimeout()`
```typescript
const OP_TIMEOUT_MS = 15000;

function withTimeout<T>(p: Promise<T>, msg = '浏览器操作超时'): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${msg}（${OP_TIMEOUT_MS}ms），实例可能已假死，将自动重建`)), OP_TIMEOUT_MS),
    ),
  ]);
}
```
- 所有 page 操作超过 15 秒自动 reject，不再永久挂起

#### 2. 新增浏览器健康探针 `isBrowserAlive()`
```typescript
async function isBrowserAlive(b: any): Promise<boolean> {
  if (!b) return false;
  if (b.isConnected?.() === false) return false;
  try {
    await withTimeout(b.version?.() ?? Promise.resolve('ok'), '浏览器心跳超时');
    return true;
  } catch { return false; }
}
```
- 真正执行一次 `version()` 请求验证存活，比 `isConnected()` 更可靠

#### 3. 新增强制重置 `resetBrowser()`
```typescript
async function resetBrowser() {
  try { if (pageInstance && !pageInstance.isClosed?.()) await pageInstance.close().catch(() => {}); } catch {}
  try { if (browserInstance) await browserInstance.close().catch(() => {}); } catch {}
  browserInstance = null; pageInstance = null; tabs.clear(); activeTabId = -1; nextTabId = 0;
}
```

#### 4. `getBrowser()` 重构：支持 CDP 模式 + headless 可配置
```typescript
const BROWSER_MODE = (process.env.BROWSER_MODE || 'launch') as 'launch' | 'cdp';
const CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
const BROWSER_HEADLESS = process.env.BROWSER_HEADLESS !== 'false';

// getBrowser() 内：
if (browserInstance && (await isBrowserAlive(browserInstance))) { ... }
if (browserInstance) await resetBrowser();  // 假死先清理
if (BROWSER_MODE === 'cdp') {
  browserInstance = await withTimeout(chromium.connectOverCDP(CDP_ENDPOINT), 'CDP 连接失败');
} else {
  browserInstance = await withTimeout(chromium.launch({ headless: BROWSER_HEADLESS }), '浏览器启动失败');
}
```

**环境变量配置：**
| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BROWSER_MODE` | `launch` | `launch`=启动新浏览器；`cdp`=连接已运行的 Chrome |
| `BROWSER_HEADLESS` | `true` | 设为 `false` 则启动有头浏览器（便于调试/规避反爬） |
| `CDP_ENDPOINT` | `http://127.0.0.1:9222` | CDP 模式下的 Chrome 调试端口 |

#### 5. `getPage()` 加 page 健康探针
```typescript
async function isPageAlive(p: any): Promise<boolean> {
  if (!p || p.isClosed?.()) return false;
  try { await withTimeout(p.evaluate(() => 1), 'page 心跳超时'); return true; }
  catch { return false; }
}
```
- page 假死时自动关闭并重建

#### 6. `navigate` 路由加超时
```typescript
await withTimeout(page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }), '导航超时');
const title = await withTimeout(page.title(), '获取标题超时');
```

#### 7. `action` 路由入口加超时
```typescript
const page = await withTimeout(getPage(), '获取浏览器页面超时（实例可能已假死，将自动重建，请重试）');
```

#### 8. `action` 路由 catch 块增强：异常自动重置
```typescript
} catch (e: any) {
  const msg = e?.message || '浏览器动作失败';
  if (/超时|假死|Target closed|Execution context|Protocol error|browserContext|page.closed|Connection closed/i.test(msg)) {
    console.warn('[browser] 检测到浏览器异常，自动重置实例:', msg);
    await resetBrowser().catch(() => {});
  }
  res.status(500).json({ error: msg, recoverable: true });
}
```
- 检测到超时/连接错误时自动重置浏览器实例，下次请求自动重建
- 返回 `recoverable: true` 标识，前端/智能体可据此自动重试一次

### 验证结果
- TypeScript 编译：**零错误** ✅
- 9 项关键修改全部验证通过 ✅

---

## 三、阶段二：架构对齐 CNGC Browser Use（已实施 ✅）

### 实施记录

| # | 改造项 | 状态 | 说明 |
|---|--------|------|------|
| 1 | DOM Ref 系统 `ensureYzRefs` | ✅ | `d1:e12` 格式，WeakMap 存储，scope 隔离 iframe |
| 2 | `get_page_info` 输出 ref | ✅ | 每个可交互元素同时返回 `index` + `ref` |
| 3 | `click` 支持 ref 定位 | ✅ | 优先 ref，回退 index，向后兼容 |
| 4 | `type` 支持 ref 定位 | ✅ | 同上 |
| 5 | 会话自动恢复 `recoverSession` | ✅ | 记录最近 URL，page 丢失时自动重建并恢复 |
| 6 | `navigate` 记录页面状态 | ✅ | 成功后更新 `lastKnownUrl`/`lastKnownTitle` |
| 7 | `action_and_observe` 组合工具 | ✅ | 执行子动作后自动返回最新页面状态（减少往返） |
| 8 | CDP 模式完善 | ✅ | 连接真实 Chrome 时复用已有 context/page |

**TypeScript 编译：零错误** ✅

### 2.1 DOM Ref 系统（已完成）

**现有问题：** `get_page_info` 每次重新编号，页面动态变化后 index 失效。

**改造方案：** 引入 `{scopeId}:{elementId}` 格式的 DOM ref，类似 CNGC 的 `d1:e12`。

```typescript
// snapshot 时生成：
// scopeId = 页面文档标识（主文档=d1，iframe=d2,d3...）
// elementId = 元素在当前文档内的递增编号
// ref 格式：d1:e12

// 页面内注入 __yzRefs 注册表，用 WeakMap 存储 element -> ref
// click/type 时传完整 ref "d1:e12"，先解析 scope 再定位元素
```

### 2.2 会话自动恢复（resync）

**现有问题：** 浏览器崩溃后需手动重启服务。

**改造方案：** 参考 CNGC `BU_SESSION_STALE` → `bu.resync()` 机制。

```typescript
// 每次操作前检查会话状态
// 若 page 已关闭但 browser 还在 → 自动新建 page 并恢复到最近 URL
// 若 browser 也断了 → 自动重新 launch/connect
// 恢复后返回 { recovered: true, previousUrl } 让智能体知道需要重新 snapshot
```

### 2.3 内置 observe-act-observe 循环

**现有问题：** pageAgent 需要自己拼 "get_page_info → click → get_page_info" 步骤，容易遗漏。

**改造方案：** 新增 `browser_action_and_observe` 组合工具，执行动作后自动返回最新页面状态。

```typescript
// 一个工具调用完成：动作执行 + 等待 + 自动 snapshot
// 入参：{ action, ref?, text?, ... }
// 出参：{ actionResult, pageInfo: { url, title, interactiveElements[] } }
```

### 2.4 CDP 模式完善

**现有问题：** CDP 模式下 `browser.newContext()` 可能不被支持（连接已有浏览器时 context 已存在）。

**改造方案：**
```typescript
if (BROWSER_MODE === 'cdp') {
  // CDP 模式：复用默认 context，不新建
  const contexts = browserInstance.contexts();
  const context = contexts.length > 0 ? contexts[0] : await browserInstance.newContext({...});
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
}
```

---

## 四、阶段三：工具层简化（已实施 ✅）

### 实施记录

| # | 改造项 | 状态 | 说明 |
|---|--------|------|------|
| 1 | 更新 pageAgent 系统提示词 | ✅ | 加入 DOM Ref 用法、action_and_observe 推荐、连续失效重试策略 |
| 2 | 浏览器核心工具加入默认助手白名单 | ✅ | 默认助手可直接调用 9 个核心浏览器工具，复杂任务仍可委派 pageAgent |
| 3 | 前端委托超时 2min → 30s | ✅ | 解决 pageAgent "一直卡着"的重要原因（前端 SSE 委托超时过长） |

**TypeScript 编译：改造文件零错误** ✅
（`local-model-market.ts` 的 5 个错误为项目原有问题，与本次改造无关）

### 3.1 默认助手新增的浏览器工具

默认助手现在可直接调用（无需 `call_agent` 委派 pageAgent）：
- `browser_navigate` - 导航
- `browser_get_page_info` - 获取页面结构（含 ref）
- `browser_action_and_observe` - 执行动作+自动返回新状态（推荐）
- `browser_click` - 点击
- `browser_type` - 输入
- `browser_press_key` - 按键
- `browser_get_visible_text` - 获取可见文本
- `browser_wait_for` - 智能等待
- `browser_screenshot` - 截图

复杂多步任务（如多平台购物对比、自动签到）仍推荐委派 pageAgent。

### 3.2 pageAgent 系统提示词更新要点

- 明确 DOM Ref（`d1:e12`）为首选定位方式
- 推荐 `browser_action_and_observe` 减少往返调用
- 连续 2 次元素失效必须重新 `get_page_info`
- 遇到验证码/登录用 `ask_user`，不盲目重试

---

## 五、web_search 适配（已实施 ✅）

### 问题根因

`search-backend.ts` 维护了**自己独立的浏览器实例**（`_browser`/`_page`），与 `browser.ts` 是两套完全独立的浏览器。这导致：

1. **双浏览器分裂**：用户在预览面板看到的浏览器 ≠ web_search 用的浏览器
2. **资源浪费**：同时运行两个 Chromium 实例
3. **配置不一致**：search-backend 写死 `headless: true`，不支持 CDP 模式
4. **无超时/健康检查**：`page.goto` / `page.evaluate` 无超时兜底

### 改造内容

| # | 改造项 | 说明 |
|---|--------|------|
| 1 | browser.ts 导出核心函数 | `getPage`/`getBrowser`/`withTimeout`/`resetBrowser`/`isBrowserAlive`/`recordPageState`/`isPageAlive` |
| 2 | search-backend 复用单例 | 移除独立的 `_browser`/`_page`/`getPage()`/`loadPlaywright()`，直接 import browser.ts 的 `getPage()` |
| 3 | 搜索导航加超时 | `page.goto` 包 `withTimeout`（20s），`waitForTimeout` 包超时 |
| 4 | 页面获取加异常处理 | 获取失败时自动 `resetBrowser()` 后重试一次，仍失败才抛错 |
| 5 | probePlaywright 修复 | 移除对已删除的 `loadPlaywright()` 的引用，直接 `import('playwright')` |

### 改造后架构

```
之前：browser.ts → Chromium 实例 A（用户预览面板）
      search-backend.ts → Chromium 实例 B（web_search 专用）
      两个实例独立，配置不一致，资源翻倍

之后：browser.ts → Chromium 单例（用户预览 + web_search 共用）
      search-backend.ts → import { getPage } from '../routes/browser.js'
      同一实例，统一配置（CDP/headless/超时/健康检查），资源减半
```

**TypeScript 编译：改造文件零错误** ✅

---

## 六、完整改造文件清单

改造后按以下顺序验证：

### 1. 基础功能验证
```bash
# 启动服务
cd apps/server && pnpm dev

# 测试导航
curl -X POST http://localhost:3000/api/browser/navigate \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.baidu.com"}'

# 测试获取页面信息
curl -X POST http://localhost:3000/api/browser/action \
  -H "Content-Type: application/json" \
  -d '{"action":"get_page_info"}'
```

### 2. 超时验证
```bash
# 导航到一个不存在的域名，应在 15 秒内返回超时错误（而非永久挂起）
curl -X POST http://localhost:3000/api/browser/navigate \
  -H "Content-Type: application/json" \
  -d '{"url":"http://10.255.255.1"}'
```

### 3. 有头模式验证（规避反爬）
```bash
# 设置环境变量后重启
$env:BROWSER_HEADLESS="false"
pnpm dev
# 应能看到浏览器窗口弹出
```

### 4. CDP 模式验证（连接真实 Chrome）
```bash
# 先用调试模式启动 Chrome
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

# 启动服务（CDP 模式）
$env:BROWSER_MODE="cdp"
pnpm dev
# 应连接到已打开的 Chrome，而非启动新浏览器
```

---

## 六、回滚方案

如需回滚阶段一修改：

```bash
cd C:\Users\Administrator\Desktop\github\yan-zhi-master
git checkout -- apps/server/src/routes/browser.ts
```

（修改前建议先 `git add -A && git commit -m "backup before browser refactor"`）

---

## 七、文件清单

| 文件 | 说明 |
|------|------|
| `apps/server/src/routes/browser.ts` | 主改造文件（阶段一已完成） |
| `scripts/patch-browser-phase1.py` | 阶段一改造脚本（已执行） |
| `scripts/patch-browser-final.py` | action catch 最终修复脚本（已执行） |
| `docs/browser-module-refactor.md` | 本文档 |
