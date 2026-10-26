/**
 * 标签页拖拽排序的纯函数（不碰响应式、不碰 DOM，便于单测）。
 *
 * 接入参考（AgentScope 客户端 BrowserTabBar）：拖到哪一格就占哪一格，
 * 顺序变化立即落盘到 store，下次打开面板保持。
 */
export function moveTabOrder<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to) return list.slice();
  if (from < 0 || to < 0 || from >= list.length || to >= list.length) return list.slice();
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
