/**
 * Android 预测返回可能同时产生 WebView 历史回退和 Capacitor backButton。
 * 页面内层级（如资讯正文）先由 popstate 消费后，原生回调必须忽略这一次重复信号。
 */
export const BACK_SIGNAL_COALESCE_MS = 750;

export interface HistoryBackGuard {
  noteHistoryPop(): void;
  shouldIgnoreNativeBack(): boolean;
}

export function createHistoryBackGuard(
  now: () => number = Date.now,
  coalesceMs = BACK_SIGNAL_COALESCE_MS,
): HistoryBackGuard {
  let lastHistoryPopAt = Number.NEGATIVE_INFINITY;

  return {
    noteHistoryPop(): void {
      lastHistoryPopAt = now();
    },
    shouldIgnoreNativeBack(): boolean {
      return now() - lastHistoryPopAt <= coalesceMs;
    },
  };
}
