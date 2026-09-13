/** 右击菜单边界检测：确保菜单不超出视窗右下边界 */
export function clampMenuPos(e: MouseEvent, menuWidth = 180, menuHeight = 320): { x: number; y: number } {
  const pad = 8;
  return {
    x: Math.min(e.clientX, window.innerWidth - menuWidth - pad),
    y: Math.min(e.clientY, window.innerHeight - menuHeight - pad),
  };
}