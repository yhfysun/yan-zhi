// 浏览器操作「会话级串行」纯逻辑（2026-10-09）。
//
// ★★★ 为什么 pageAgent 要特殊处理（用户实测）：
//   浏览器是**单活动页状态机** —— 前端 `ensureActiveTab(scope)` 每 scope 单值、
//   桌面主进程 `activeTabId` 全局单值、服务端 Playwright 的 `activeTabId` 进程级单值。
//   同一会话里多个 pageAgent（或一次并发派发的多个 browser_* 调用）同时操作，
//   会互相抢同一个活动页：后到的 navigate 覆盖前一页，读取只能读到"当前页"，
//   表现为「多个 pageAgent 只有一个在动 / 结果错乱」（实测：操作跑到用户停留的页面上）。
//   ⇒ 会话内把 browser_* **串行化**（排队），一个操作完整跑完再放下一个。
//   ★ 只在**同一会话内**串行：不同会话有各自锚定的 tab（agentAnchoredTabs 按 convId 隔离），
//     互不阻塞 —— 与既有 scope 隔离口径一致。
//   ★ 为什么不做"真并行多标签页"：预览面板一次只显示一个活动页，真并行**用户看不到**；
//     且需把"活动页"从单值改成按 agent 隔离（动 main.cjs + 前端分发 + 服务端），收益/风险不成比例。
//
// 抽成纯模块的理由（与 plan-buckets 同风格）：chat.ts 依赖 pinia，单测引不动；
// 这里只有「链式排队」这一件事，可脱离 store 直接断言顺序与隔离。

/** 会话 id → 该会话浏览器操作的串行链尾（已吞错，避免 reject 污染后续） */
export type BrowserOpChains = Map<string, Promise<unknown>>;

/**
 * 把一次操作挂到指定会话的串行链尾（前一个跑完才轮到它）。
 * - 无 key（会话未建立）→ 不串行，直接执行（退化旧行为，不制造无主队列）。
 * - 前一个失败**也放行**（不卡死整条链）：用 `.then(fn, fn)` 而不是 `.then(fn)`。
 */
export function chainBrowserOp<T>(
  chains: BrowserOpChains,
  key: string | undefined | null,
  fn: () => Promise<T>,
): Promise<T> {
  if (!key) return fn();
  const prev = chains.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  // 链尾存"吞错版"：next 的成败不影响后续排队者，也避免 unhandledRejection 告警
  chains.set(key, next.then(() => undefined, () => undefined));
  return next;
}

/** 会话结束/清理时丢弃其链（防内存泄漏；进行中的操作不受影响，只是不再接新活） */
export function dropBrowserOpChain(chains: BrowserOpChains, key: string): void {
  chains.delete(key);
}