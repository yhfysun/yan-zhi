// 浏览器 tab「保活（别休眠/别重载）」判据 —— 纯函数模块，唯一实现。
//
// ★ 为什么需要（2026-10-29）：支付宝小游戏页（wanyiwan.top/game/sc33t）一旦被重载就废 ——
//   渲染主线程不再回包、`[game.js](httpGet) onerror status: 0`、随后的 guest 消失。
//   任何触发重载的东西（HMR、应用重启、tab 休眠唤醒、LRU 逐出后复活）都会把它打回 Login。
//   主进程的休眠/LRU/空闲回收原本只认「当前激活 / 会话锚定 / 正在跑动作」三个保护条件，
//   游戏窗里用户没有操作、agent 也没锚定时就会被当成普通页回收 ⇒ 唤醒即重载 ⇒ 报废。
//   ⇒ 这里给 tab 一个 keepAlive 判据：命中的 tab 不参与休眠 / LRU / 空闲回收 / 降帧。
//
// ★ 显式刷新（工具栏按钮 / browserView:reload）不经过这些休眠路径，天然允许强制重载 ——
//   这是用户主动要求的"重来一次"，不该被保活挡住。
//
// ★ 判据来源（顺序即优先级）：
//   ① scope === 'game'：独立游戏窗里的所有页一律保活（用户开游戏窗就是为了别断）；
//   ② URL 规则：/browser 主窗口里打开的同一游戏页也要保活（规则见 PROTECTED_URL_RULES）。
//   新增受保护站点：在 PROTECTED_URL_RULES 加一条，不要在各消费点写第二份判断。

/** 受保护的 URL 规则：host 后缀匹配 + 路径前缀（pathPrefix 为空表示整站） */
const PROTECTED_URL_RULES = [
  // 支付宝小游戏（卡加载真因：页面一被重载就废）
  { host: 'wanyiwan.top', hostMatch: 'suffix', pathPrefix: '/game/' },
];

function parseUrl(raw) {
  try {
    const u = new URL(String(raw == null ? '' : raw).trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

function hostMatches(hostname, rule) {
  const h = String(hostname || '').toLowerCase();
  const target = String((rule && rule.host) || '').toLowerCase();
  if (!h || !target) return false;
  if (rule.hostMatch === 'exact') return h === target;
  // 后缀匹配必须有"."边界：evilwanyiwan.top 不算 wanyiwan.top
  return h === target || h.endsWith('.' + target);
}

/** URL 是否命中「一重载就废」规则（非法/空 URL 一律 false，不误保护） */
function isProtectedGameUrl(url) {
  const u = parseUrl(url);
  if (!u) return false;
  const pathname = u.pathname || '/';
  for (const rule of PROTECTED_URL_RULES) {
    if (!hostMatches(u.hostname, rule)) continue;
    if (rule.pathPrefix && !pathname.startsWith(rule.pathPrefix)) continue;
    return true;
  }
  return false;
}

/**
 * tab 是否应保活。
 * @param {{scope?: string, url?: string}} tab
 * @returns {boolean}
 */
function keepAliveOf(tab) {
  const t = tab || {};
  if (String(t.scope || '') === 'game') return true;
  return isProtectedGameUrl(t.url);
}

module.exports = { PROTECTED_URL_RULES, isProtectedGameUrl, keepAliveOf };
