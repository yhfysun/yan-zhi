/**
 * 按 key 串行的执行队列（A2，2026-10-10）。
 *
 * ★★★ 为什么必须有（实测缺陷：文件级「读-改-写」非原子）：
 *   `space-memory.ts:appendLineWithHeader` 是 `await readFile` → 拼接 → `await writeFile`
 *   —— **中间有真正的 await**（fs 异步），两个并发调用会各自读到同一份旧内容、
 *   各自写回 ⇒ **后写覆盖先写**（丢更新）。
 *
 *   触发场景（都是本项目真实路径）：
 *   · `appendTaskDecision` 是 **fire-and-forget**（`void appendTaskDecision(...)`），
 *     用户连续确认/终止时两次调用**并发**；
 *   · 两条任务**同时收尾**（`call_agent` 并行编排 / 自动接力）都会写同一空间记忆文件；
 *   · `appendTaskProgress` 一次调用里**连续写两份文件**（MEMORY.md + progress.md）。
 *
 *   丢了什么（静默、不报错）：空间记忆丢条目、计划进度回退 →
 *   **模型看到旧状态、重复干活**。这是本项目「静默失效」家族的一员。
 *
 * ★ 为什么放 `shared` 而不是 server/ui 各写一份：
 *   前端已有同款思路（`ui/stores/browser-op-queue.ts` 的链式排队），服务端也需要 ——
 *   两处各写一份必然漂移。`shared` 同时被 `core` / `ui` / `server` 依赖
 *   （实测三者的 package.json），是三端唯一可复用的位置。
 *
 * ★ 设计（与前端既有 `chainBrowserOp` 同范式，便于理解与合并）：
 *   · Map<key, Promise> 存"该 key 的链尾"；
 *   · 链尾存**吞错版**（`next.then(()=>undefined, ()=>undefined)`）——
 *     这是"前一个失败也放行"的**真正机制**（下一个任务从永远 resolved 的链尾开始）；
 *   · 无 key → 不串行、直接执行（退化旧行为，不制造无主队列）；
 *   · **只保证"同 key 内串行"**：不同 key 完全并行（文件路径 / 会话 id 之间本无冲突）。
 *
 * ★★ 一处**实测纠正**（2026-10-10，防后人被误导）：
 *   本文件初版写的是 `prev.then(fn, fn)`，注释称"失败也放行" —— 但**实验证明这不成立**：
 *   把链尾的吞错版保留时，`prev.then(fn)` 与 `prev.then(fn, fn)` 行为**完全相同**
 *   （因为下一个任务永远从已 resolve 的吞错版开始）。
 *   ⇒ `, fn` 这个失败 handler **实际从不被使用**（纯冗余）；真正的机制是"链尾吞错版"。
 *   现已移除该冗余参数（保留纯 `prev.then(fn)`），避免"看似在处理失败、实则靠别处兜住"的误导。
 */
export type SerialChains = Map<string, Promise<unknown>>;

/**
 * 把一次操作挂到指定 key 的串行链尾（前一个跑完才轮到它）。
 *
 * @param chains 由调用方持有的链表（**同一份链表才能串行**——别每次新建）
 * @param key 串行键（如文件绝对路径 / conversationId）；空值表示不串行
 * @param fn 要执行的操作
 */
export function runSerial<T>(
  chains: SerialChains,
  key: string | undefined | null,
  fn: () => Promise<T>,
): Promise<T> {
  if (!key) return fn();
  const prev = chains.get(key) || Promise.resolve();
  const next = prev.then(fn);
  // ★ 链尾存"吞错版"：这是"前一个失败也放行"的**唯一机制**（见上方实测纠正）。
  //   同时避免 unhandledRejection 告警（next 的 rejection 由调用方 await 处理）。
  chains.set(key, next.then(() => undefined, () => undefined));
  return next;
}

/**
 * 丢弃某 key 的链（对象销毁 / 会话结束时调用，防链表泄漏）。
 * ★ 进行中的操作**不受影响**（只是不再接新活）。
 */
export function dropSerialChain(chains: SerialChains, key: string): void {
  chains.delete(key);
}

/**
 * 链表规模上限兜底：超出时淘汰**最早插入**的键（Map 迭代序 = 插入序）。
 *
 * ★ 为什么需要：链表是"按路径/会话"长期持有的话会随对象数增长；
 *   而某些 key（如临时文件路径）可能永远不再出现 → 需要兜底淘汰。
 * ★ 只淘汰"链已跑完"的键（`prev === 链尾` 的判断由调用方语义保证：
 *   这里直接删最早的即可 —— 被删的键若仍被并发使用，最坏是那一次不串行，
 *   而不是死锁，属可接受的降级）。
 */
export function pruneSerialChains(chains: SerialChains, maxKeys = 500): void {
  while (chains.size > maxKeys) {
    const oldest = chains.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    chains.delete(oldest);
  }
}