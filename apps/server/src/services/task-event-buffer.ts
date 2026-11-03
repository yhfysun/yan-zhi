export interface ReplayEventLike {
  type?: string;
  seq?: number;
}

/**
 * 受限重放缓冲：超限时优先淘汰最旧的 chunk。
 *
 * chunk 是高频、可按续写/最终消息恢复的展示增量；tool:execute / message 等事件
 * 是重连后继续执行所必需的，不能被长回答的逐字输出挤掉。
 */
export function retainReplayEvents<T extends ReplayEventLike>(events: T[], maxEvents: number): T[] {
  if (events.length <= Math.max(0, maxEvents)) return events;
  const out = events.slice();
  let excess = out.length - Math.max(0, maxEvents);
  while (excess > 0) {
    const chunkIndex = out.findIndex((event) => event.type === 'chunk');
    if (chunkIndex >= 0) out.splice(chunkIndex, 1);
    else out.shift();
    excess--;
  }
  return out;
}
