// 可见性感知的定时轮询 —— 页面不可见时自动停，可见时立即补一次。
//
// ★★★ 为什么要这个（2026-10-11，用户："轮询都去掉啊记得"）：
//   项目里仍有多处**必要的轮询**（外部 IM 拉取、节点消息、运维指标、模型市场进度等），
//   它们无法立刻改成推送（服务端没有对应通道，加 SSE 是独立工程）。但这些轮询有一个
//   共同的浪费：**用户切到别的标签页/最小化时，它们仍在跑** —— 白白占用主线程 + 网络 + 电池。
//
//   ⇒ 统一收口成一个工具：**document.hidden 时不 tick**；恢复可见时**立即补一次**
//     （保证切回来数据是新的，不需要用户等一个周期）。
//   ★ 为什么不用 setInterval + 内部 if(hidden) return：那样定时器仍会唤醒主线程。
//     这里用**递归 setTimeout**：隐藏时**根本不安排下一次**，是真正的零唤醒。
//
// ★ 使用约定：
//   const stop = startVisiblePolling(fn, 3000);
//   onBeforeUnmount(stop);   // 必须收口，否则泄漏
//
// ★ 首次调用默认**立即执行一次**（`immediate: true`），符合"进来就有数据"的直觉。

export interface VisiblePollingOptions {
  /** 页面可见时的轮询间隔（ms）。 */
  intervalMs: number;
  /** 是否挂载后立即执行一次（默认 true）。 */
  immediate?: boolean;
  /**
   * 即使页面不可见也继续轮询（默认 false）。
   * ★ 只在"中断会丢数据/掉线"的场景才开（如心跳维持在线状态）。
   */
  runWhenHidden?: boolean;
}

/**
 * 启动一个可见性感知的轮询，返回停止函数（必须调用，通常在 onBeforeUnmount）。
 *
 * @param fn 每次 tick 执行的函数（可为 async；其 Promise 会被忽略，异常不会中断轮询）
 */
export function startVisiblePolling(
  fn: () => void | Promise<void>,
  options: VisiblePollingOptions,
): () => void {
  const { intervalMs, immediate = true, runWhenHidden = false } = options;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const isHidden = (): boolean =>
    typeof document !== 'undefined' && document.visibilityState === 'hidden';

  /** 跑一次 fn（吞掉异常 —— 轮询不该因单次失败而中断） */
  const run = (): void => {
    try { void Promise.resolve(fn()).catch(() => { /* 单次失败不中断轮询 */ }); }
    catch { /* 同步异常同样吞掉 */ }
  };

  const schedule = (): void => {
    if (stopped) return;
    // ★ 隐藏且不允许后台跑 → **不安排下一次**（真正的零唤醒，而不是"唤醒了再 return"）
    if (isHidden() && !runWhenHidden) return;
    timer = setTimeout(tick, intervalMs);
  };

  const tick = (): void => {
    if (stopped) return;
    run();
    schedule();
  };

  /** 可见性变化：恢复可见 → 立即补一次（用户切回来数据就是新的） */
  const onVisibilityChange = (): void => {
    if (stopped) return;
    if (!isHidden()) {
      if (timer) { clearTimeout(timer); timer = null; }
      run();
      schedule();
    } else if (!runWhenHidden && timer) {
      // 转入隐藏且不允许后台跑 → 取消已挂的定时器
      clearTimeout(timer);
      timer = null;
    }
  };

  // ★ immediate 也要过隐藏判定：隐藏时启动不该"立即跑一次"（那仍是一次无谓唤醒）。
  if (immediate && (!isHidden() || runWhenHidden)) run();
  schedule();
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  return () => {
    stopped = true;
    if (timer) { clearTimeout(timer); timer = null; }
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };
}
