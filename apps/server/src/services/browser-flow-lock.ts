// 浏览器「执行流锁」—— 同一任务内，同一时刻只允许**一个**执行流驱动浏览器（2026-10-15）
//
// ★★★ 为什么需要（「导航跑偏」P0-① 的第二层防线）：
//   浏览器是**单活动页状态机**（会话锚只有一个"当前操作页"）。只要有两条逻辑流并发
//   驱动它，就会互踩：A 导航完 B 立刻覆盖同一锚 tab → A 读到 B 的页 → 判定"我的导航
//   没生效" → 再导航（实测 10-14 晚 conv 13822a0d 单会话 57 次乒乓、5 个孤儿 tab）。
//
//   第一层防线（同批并发 call_agent 串行化）覆盖了主路径，但漏三条：
//     · `call_agent { async: true }` 后台子智能体 —— fire-and-forget，与主循环真并发；
//     · PlanRunner 的**并行计划项**（无依赖项同时跑）；
//     · 主循环自身的 `browser_*` 调用与上述后台流并发。
//   ⇒ 本模块提供**任务级**互斥，三条路径共用同一把锁。
//
// ★ 语义（三条，缺一条就会出"静默继续"或"无限等"）：
//   · `acquireFlow` —— 排队等待，**有界**（超时返回 false，由调用方给出可读原因）；
//   · `releaseFlow` —— 释放并唤醒下一个等待者；**非持有者调用是幂等 no-op**
//     （因此"子智能体收尾"与"后台包装层收尾"都放一行也安全）；
//   · 同一 flowId 重复 acquire → 立即成功（幂等：后台路径先占位、ReAct 层再取）。
//
// ★ 为什么锁是**每任务**一份（`LlmTask.browserFlow`）而不是全局单锁：
//   不同会话各自驱动自己的锚页是既有设计（A4 会话隔离）；本模块只治**同一任务内**的互踩。

/** 等待上限：覆盖"后台子任务收尾"的常见时长；超时即明确拒绝（不无限等、不静默） */
export const BROWSER_FLOW_WAIT_MS = 5 * 60 * 1000;

interface Waiter {
  flowId: string;
  finish: (ok: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface BrowserFlowLock {
  /** 当前持有者（flowId）；null = 空闲 */
  owner: string | null;
  /** FIFO 等待队列 */
  queue: Waiter[];
}

export function createFlowLock(): BrowserFlowLock {
  return { owner: null, queue: [] };
}

/**
 * 非阻塞尝试：空闲 → 拿到；被别的流占着 → false；**已属于自己的流** → true（幂等）。
 * 用于"后台启动时先占位"这种不能阻塞的路径。
 */
export function tryAcquireFlow(lock: BrowserFlowLock, flowId: string): boolean {
  if (!lock.owner) { lock.owner = flowId; return true; }
  return lock.owner === flowId;
}

/**
 * 排队获取（FIFO、有界、可中止）。
 * @returns true=已持有；false=超时/任务已中止（调用方**必须**据此回一条可读原因，不得静默继续）
 */
export function acquireFlow(
  lock: BrowserFlowLock,
  flowId: string,
  signal: AbortSignal | undefined,
  timeoutMs: number = BROWSER_FLOW_WAIT_MS,
): Promise<boolean> {
  if (tryAcquireFlow(lock, flowId)) return Promise.resolve(true);
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const waiter: Waiter = { flowId, finish: () => {}, timer: setTimeout(() => {}, 0) };
    // finish：把自己从队列摘掉（若还在）+ 清定时器 + 只 resolve 一次
    let settled = false;
    waiter.finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(waiter.timer);
      const i = lock.queue.indexOf(waiter);
      if (i >= 0) lock.queue.splice(i, 1);
      resolve(ok);
    };
    waiter.timer = setTimeout(() => waiter.finish(false), timeoutMs);
    lock.queue.push(waiter);
    // 任务中止：不再等待（调用方随后走中止分支，不会继续驱动浏览器）
    try { signal?.addEventListener('abort', () => waiter.finish(false), { once: true }); } catch { /* ignore */ }
  });
}

/** 释放（非持有者 = 幂等 no-op）；唤醒下一个等待者并把所有权交给它。 */
export function releaseFlow(lock: BrowserFlowLock, flowId: string): void {
  if (lock.owner !== flowId) return;
  const next = lock.queue.shift();
  if (!next) { lock.owner = null; return; }
  clearTimeout(next.timer);
  lock.owner = next.flowId;
  next.finish(true);
}

/** 诊断用：当前持有者（写日志，一眼看出"谁占着浏览器"）。 */
export function flowOwnerOf(lock: BrowserFlowLock | undefined | null): string | null {
  return lock ? lock.owner : null;
}
