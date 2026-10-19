/**
 * 外部协议白名单（可单测）。
 *
 * ★ 为什么抽成独立模块（2026-10-08）：
 *   主进程 main.cjs 是 Electron 入口，require 即启动应用，无法直接单测；
 *   而这段判断恰恰是**出错代价最高的安全边界**：
 *   误放行一个未知协议 → 交给 Windows Shell → 本机无处理器 →
 *   系统弹「没有可打开此链接的应用」（任务跑起来后反复弹窗，用户看到的就是这个）。
 *   抽成纯函数后可在裸 Node 下秒级验证。
 *
 * 适用位置（main.cjs 共 4 处）：
 *   1) ipcMain 'shell:openExternal'        —— 渲染层显式请求
 *   2) mainWindow setWindowOpenHandler     —— 主窗口 window.open / target=_blank
 *   3) mainWindow 'will-navigate'          —— 主窗口整页导航逃逸
 *   4) 子窗口 setWindowOpenHandler         —— 二级 BrowserWindow
 */

/**
 * 是否允许把这个 URL 交给系统 Shell（shell.openExternal）。
 *
 * 只放行 http/https —— 其余一律拒绝，包括但不限于：
 *   - `bitbrowser://`（本机有第三方推广位会发这个链接，是本次弹窗的元凶）
 *   - `tel:` / `mailto:` / `ms-*` / `file:` / `javascript:` / `vbscript:`
 *
 * ⚠️ 有意**不做**「有注册处理器就放行」的判断：查询 Windows 协议注册表需要
 *    额外系统调用且易被绕过（HKCU 用户级覆盖），白名单比黑名单更安全、更可预测。
 *
 * @param {unknown} url 待校验地址
 * @returns {boolean} true = 可以 openExternal
 */
function isSafeExternalUrl(url) {
  if (!url || typeof url !== 'string') return false;
  // trim 后再判：`" bitbrowser://x"` 这类前导空白不应成为绕过口子
  return /^https?:\/\//i.test(url.trim());
}

/**
 * guest（webview / BrowserView 内页面）导航是否放行。
 *
 * guest 内的**页面自身跳转**必须区分对待：
 *   - http/https → 放行（预览面板正常导航，这是主用途）
 *   - about: / blob: / data: → 放行（页面内部机制，如空白页、blob 下载预览）
 *   - 其余（自定义协议） → 拦截
 *
 * ★ 为什么必须拦：guest 的 will-navigate 若不放行也不拦截，Electron 会尝试
 *   交给系统 Shell 处理自定义协议 —— 这正是 bitbrowser:// 弹窗的真正入口
 *   （主窗口的 will-navigate 管不到 guest，两套 webContents 是隔离的）。
 *
 * @param {unknown} url 目标地址
 * @returns {boolean} true = 允许导航
 */
function isAllowedGuestNavigation(url) {
  if (!url || typeof url !== 'string') return true; // 空值交给 Electron 自己处理
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return true;
  if (u.startsWith('about:') || u.startsWith('blob:') || u.startsWith('data:')) return true;
  return false;
}

/**
 * ★★★ 把「非 http(s) 导航一律拦截」收口成**唯一装配点**（2026-10-12）。
 *
 * ★ 为什么必须收口（这次弹窗"修了还出来"的真根因）：
 *   此前 4 处守卫各自手挂 `will-navigate`，其中 webview 引擎用
 *   `app.on('web-contents-created')` 兜底 —— 但它**跳过了 type==='webview'**，
 *   理由是"guest 各自处理"。而 guest 只覆盖「容器自治的 guest 顶层」，**iframe 子帧不在内**：
 *   Electron 33 起子帧导航**不再触发 `will-navigate`，只触发 `will-frame-navigate`**
 *   （2026-10-12 实测：iframe src=https://.../inner.html 只出 will-frame-navigate、
 *     isMainFrame=false；随后 iframe 内 location.href='bitbrowser://…' 同样只出 will-frame-navigate）。
 *   ⇒ 小说推文站点页里带推广位 iframe 的场景，子帧跳自定义协议**无人拦** → 系统弹窗。
 *   ★ 同类教训：`web-contents-created` 里对某类 contents 早早 `return`，等于把该类
 *     整个排除在安全装配之外 —— 后来新增的差异机制（子帧事件）就会静默漏出。
 *
 * ★ 设计：一个 wc 同时挂 `will-navigate` 与 `will-frame-navigate`，判定同一份函数。
 *   `will-frame-navigate` 的 event 在 Electron 33 上带 `preventDefault()`（实测生效：
 *   挂上后 iframe 的 bitbrowser:// 被拦、不再走 Shell）。
 *
 * @param {{on: Function}} wc Electron webContents
 * @returns {boolean} true = 已装配（重复调用返回 false，幂等）
 */
function guardNavigation(wc) {
  if (!wc || typeof wc.on !== 'function' || wc.__yzNavGuarded) return false;
  wc.__yzNavGuarded = true;
  const block = (event, url) => {
    if (isAllowedGuestNavigation(url)) return;
    // 扩展页面专用窗口（P1）：由主进程显式标记，只放行 chrome-extension://
    if (wc.__yzAllowExtensionUrls && /^chrome-extension:\/\//i.test(String(url || '').trim())) return;
    try { console.log('[nav] 拦截非 http(s) 导航:', url); } catch { /* ignore */ }
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
  };
  // 主帧导航（Electron 全版本）
  wc.on('will-navigate', (event, url) => block(event, url));
  // ★ 子帧（iframe）导航：Electron 33+ 的**唯一**钩子；旧版无此事件，注册无害
  wc.on('will-frame-navigate', (event, url) => block(event, url));
  return true;
}

module.exports = { isSafeExternalUrl, isAllowedGuestNavigation, guardNavigation };
