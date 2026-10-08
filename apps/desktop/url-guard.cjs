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

module.exports = { isSafeExternalUrl, isAllowedGuestNavigation };
