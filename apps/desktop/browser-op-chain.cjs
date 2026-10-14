/**
 * 桥路径「同 tab 动作串行」（2026-10-14）。
 *
 * ★ 为什么单独成模块：`main.cjs` 需要 Electron 才能加载，对它的测试只能做**源码文本断言**
 *   （太弱）。而这里要防的两件事都是**行为级**的 —— 串行顺序、排队上限放行 —— 必须真跑，
 *   故照 `url-guard.cjs` 的先例抽出来，由 `test/browser-op-chain.test.cjs` 直接 require。
 *
 * ★ 与渲染层的 `chainBrowserOp`（packages/ui/src/stores/browser-op-queue.ts）**语义一致**
 *   （`prev.then(fn, fn)` + 吞错链尾），只多一条**排队上限**：
 *   主进程里被串行化的是可能挂死的宿主操作（`executeJavaScript` / `loadURL`），
 *   没有上限时"某个动作永不结束"会让后续动作**永久排队** —— 那比并发更糟。
 *
 * ★ 为什么需要串行（实测，非推测）：桥路径此前**全链路零串行** ——
 *   `browser-bridge.cjs` 每个 HTTP 请求各自独立 `await runAction`，main 也无锁；
 *   而上层超时是 `Promise.race`（只交还控制权，**不中断**正在跑的动作）。
 *   实测 ≥30s 的动作有 **98 次**，模型每次拿到超时提示后立刻发下一个动作
 *   ⇒ 两个动作在**同一 guest 上并发执行**，后一个 click/type 可能落在
 *   前一个动作尚未完成时的页面状态上。并发是常态，不是例外。
 */
const DEFAULT_MAX_WAIT_MS = 20000;

/**
 * 把 `fn` 挂到 `key` 的串行链尾并执行；返回 `fn` 自身的结果 Promise
 * （链尾只作排队信号，不携带结果，也不受 `fn` 成败影响）。
 *
 * @param chains     Map —— 由调用方持有（便于按生命周期清理），测试可直接注入
 * @param key        串行键：同一 key 串行、不同 key 并行；**为空表示不排队**（直接执行）
 * @param fn         要执行的动作
 * @param maxWaitMs  排队上限：到点即放行链尾（宁可并发，也不永久卡死）
 */
function chainTabAction(chains, key, fn, maxWaitMs = DEFAULT_MAX_WAIT_MS) {
  if (!key) return fn();
  const prev = chains.get(key) || Promise.resolve();
  const run = prev.then(fn, fn);
  chains.set(key, Promise.race([
    run.then(() => undefined, () => undefined),                // 吞错版链尾（防 unhandledRejection）
    new Promise((resolve) => setTimeout(resolve, maxWaitMs)),  // ★ 上限到点也放行，防死锁
  ]));
  return run;
}

module.exports = { chainTabAction, DEFAULT_MAX_WAIT_MS };
