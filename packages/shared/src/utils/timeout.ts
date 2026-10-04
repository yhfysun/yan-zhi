// Promise 超时兜底（P6 收敛，2026-10-04）—— 此前仓库有 7+ 份手写实现
// （browser/recon/net-scan/dns-lookup/js-exec/tools 路由/window 摘要/llm-task 前端工具），
// 语义微差（抛错 vs resolve(undefined) vs resolve('')）且 timer 清理/unref 各写各的。

/** 给 Promise 套超时：超时 reject `Error(`${label} 超时（${ms}ms）`)` */
export function withTimeout<T>(p: Promise<T>, ms: number, label = '操作'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms);
    timer?.unref?.(); // 不阻止进程退出（浏览器端无 unref，可选调用）
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** 超时兜底为 undefined（如端口探测：超时 = 不可达，不是错误） */
export function withTimeoutOrUndefined<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    timer?.unref?.();
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(undefined); },
    );
  });
}
