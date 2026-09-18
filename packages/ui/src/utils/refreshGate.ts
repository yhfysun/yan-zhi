// 刷新去重闸门（合并并发 + 补跑一次）。
//
// 背景（开发模式 git 状态跨区同步引入）：
// 界面上有**两份** git 快照 —— 顶栏（CodeWorkbench 的本地 ref）与侧栏源码管理面板
// （ChatGitPanel 的 aheadBehind + gitStore.status）。两者都订阅 gitStore.statusVersion
// 做跨区同步。于是「一次 git 写操作」会从多条路触发同一个刷新函数：
//   · 操作方自己的收尾刷新（finally / onCommitted 回调）—— 本来就有
//   · statusVersion 的 watch —— 新增的跨区同步
// 两者几乎同时发生 → 同一份数据被请求多遍。
//
// 语义（两条都很关键）：
//   1) 同一时刻只跑一个循环体，运行期间到达的调用合并为「结束后补跑**一次**」；
//   2) ★ 并发调用方**加入同一个周期 Promise** 并在整个循环（含补跑）结束后才 resolve ——
//      不能一发现「有人正在跑」就立刻返回：调用方 await 之后往往要读结果
//      （例：pull 完 `await refresh(); if (gitConflicts.length) 弹冲突框`），
//      提前 resolve 会拿到上一轮的陈旧值，冲突框就不弹了。
//
// ⚠️ 只用于幂等的**只读**刷新函数。不要包住会改变仓库状态的写操作：
//    那些调用被合并掉就等于操作丢了。
// ⚠️ 不静默吞错：出错时 console.warn 记录（本机的 catch 不许静默约定），
//    并且不把 rejection 抛给「只是路过」的合并调用方（否则会变成未处理拒绝）。

export interface RefreshGate {
  /** 触发一次刷新。并发时合并；返回的 Promise 在整轮刷新结束后 resolve。 */
  (): Promise<void>;
  /** 当前是否有循环体在执行（测试/调试用） */
  readonly busy: boolean;
}

/**
 * 把幂等刷新函数包成带合并语义的闸门。
 * @param fn 幂等只读刷新函数
 * @param label 出错日志里的标识（便于定位是哪个面板刷新失败）
 */
export function createRefreshGate(fn: () => Promise<void>, label = 'refresh'): RefreshGate {
  let running = false;
  let pending = false;
  let cycle: Promise<void> = Promise.resolve();

  const gate = ((): Promise<void> => {
    if (running) {
      // 已在跑 → 登记补跑，并加入同一个周期（等补跑也结束，调用方拿到的是最新数据）
      pending = true;
      return cycle;
    }
    running = true;
    cycle = (async () => {
      try {
        do {
          // 先清标记再执行：执行期间新到达的调用会把 pending 重新置 true
          pending = false;
          try {
            await fn();
          } catch (e) {
            // 不静默：只读刷新失败要说出来，但不要让合并调用方一起炸
            console.warn(`[${label}] 刷新失败：`, e);
          }
        } while (pending);
      } finally {
        running = false;
      }
    })();
    return cycle;
  }) as RefreshGate;

  Object.defineProperty(gate, 'busy', { get: () => running });
  return gate;
}