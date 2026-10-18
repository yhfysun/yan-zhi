// 独立模式窗口标记（2026-10-18）：模式可像 Trae 那样弹到独立 OS 窗口，
// 窗口里**固定当前模式**——所有模式切换入口（顶栏 ModeSwitcher / 侧栏模式条目）都要隐藏。
// 判定走 URL：子窗口加载 `#/code?window=mode&szwin=1` 这类路由，hash 里带 window=mode。
// 纯函数而非响应式：子窗口自身不会跨模式导航（打开即锁定），静态判定足够。
import { MODE_DEFS } from '../stores/mode';

/** 当前渲染进程是否是「独立模式窗口」（锁定单模式）。 */
export function isModeWindow(): boolean {
  try {
    return window.location.hash.includes('window=mode');
  } catch {
    return false;
  }
}

/** 从路由路径反查模式 key（MODE_DEFS.route 反向映射；/chat 下还有 /chat/:convId 子路径）。 */
export function modeKeyOfRoute(path: string): string | null {
  const hit = MODE_DEFS.find((d) => path === d.route || path.startsWith(d.route + '/'));
  return hit?.key || null;
}

// ── 会话独立窗口（2026-10-18）─────────────────────────────────────────────
// 与模式窗口同形态的完整交互窗口：打开后固定加载指定会话（office 工作台全套保留）。
// URL 形如 `#/chat?window=conv&conv=<convId>&szwin=1`。

/** 当前渲染进程是否是「会话独立窗口」（固定打开某个会话）。 */
export function isConvWindow(): boolean {
  try {
    return window.location.hash.includes('window=conv');
  } catch {
    return false;
  }
}

/** 会话独立窗口要打开的会话 id（hash query 的 conv 参数；非会话窗口返回空串）。 */
export function convIdOfWindow(): string {
  try {
    const m = window.location.hash.match(/[?&]conv=([A-Za-z0-9_-]+)/);
    return m?.[1] || '';
  } catch {
    return '';
  }
}

/** 独立窗口统称（模式窗口 / 会话窗口）：顶栏主导航在这类窗口里都要隐藏 ——
 *  任何 router-link 都会切走上下文且丢失 window= 标记，之后就"切不回去"了。 */
export function isStandaloneWindow(): boolean {
  return isModeWindow() || isConvWindow();
}
