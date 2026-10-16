/** 右击菜单边界检测：确保菜单不超出视窗右下边界 */
export function clampMenuPos(e: MouseEvent, menuWidth = 180, menuHeight = 320): { x: number; y: number } {
  const pad = 8;
  return {
    x: Math.min(e.clientX, window.innerWidth - menuWidth - pad),
    y: Math.min(e.clientY, window.innerHeight - menuHeight - pad),
  };
}

/**
 * 按**真实尺寸**把菜单贴到光标旁，且不越出应用可视区（用户实报 2026-10-16）。
 *
 * ★ 为什么不能继续只用 clampMenuPos：它拿调用方**猜的**高度（默认 320）去夹，光标越靠下，
 *   `min(clientY, innerHeight - 320 - 8)` 就把菜单顶得越远 —— 840 高的窗口里在底部右击，
 *   三行菜单（真实高 ~160）会被推到光标上方 245px，看着「隔着老远」；宽度也是猜的，
 *   菜单比猜的宽时照样越界。
 *   这里改成**渲染后量出 offsetWidth/offsetHeight 再定位**（配合 useMenuPlacement）：
 *     · 放得下 → 贴着光标右下（与系统右键菜单同感）；
 *     · 下方放不下 → 翻到光标**上方**（菜单底边贴光标），上方也放不下才贴顶；
 *     · 右侧放不下 → 先按最小位移左移，实在放不下才贴右边。
 */
export function placeMenuNear(x: number, y: number, w: number, h: number, pad = 8): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.min(x, Math.max(pad, vw - w - pad));
  const above = y - h;                       // 翻到光标上方时菜单的 top
  const top = y + h + pad > vh ? Math.max(pad, above >= pad ? above : vh - h - pad) : y;
  return { x: left, y: top };
}