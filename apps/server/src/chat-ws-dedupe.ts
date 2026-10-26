// 聊天建任务的「重发幂等」记账（2026-10-26）。
//
// ★ 为什么需要：dev 后端重启（或任何连接中断）恰好落在 create_task 的往返中间时，
//   前端拿不到应答 —— 也就**无从判断服务端到底建没建任务**。此时若自动重发，
//   而上一次其实已经落库，库里就会出现两条同内容 user 消息，模型把同一句话执行两遍。
//   ⇒ 前端每次发送带一个稳定的 clientMsgId（重发沿用同一个），服务端据此去重：
//     命中即把上次建好的 taskId 还回去，前端照常订阅即可（事件缓冲会重放整个过程）。
//
// ★ 为什么是内存态 + TTL：幂等键只服务于「网络重发」这一小段时间窗，不做长期去重；
//   过期即丢，避免进程常驻后无限增长。
// ★ 只按 (conversationId, clientMsgId) 记：不同会话即便撞了 id 也互不影响。
// ★ 进程重启后记账清空 —— 这正是想要的：重启后的第一次发送就是一次全新的发送。

/** 幂等窗口：10 分钟足够覆盖任何网络重发，又不至于让记账常驻内存 */
const TTL_MS = 10 * 60_000;

type Entry = { taskId: string; at: number };

const recent = new Map<string, Entry>();

function keyOf(conversationId: string, clientMsgId: string): string {
  return `${conversationId}::${clientMsgId}`;
}

/** 丢掉过期条目（同时在写入与查询时调用，两条路径都不会让记账无限增长） */
function prune(now: number): void {
  for (const [k, v] of recent) {
    if (now - v.at > TTL_MS) recent.delete(k);
  }
}

/** 记下「这条客户端消息已经建/并入了哪个任务」 */
export function rememberCreatedTask(
  conversationId: string,
  clientMsgId: string | undefined,
  taskId: string,
  now: number = Date.now(),
): void {
  const cid = String(clientMsgId || '').trim();
  if (!cid || !conversationId) return;
  prune(now);
  recent.set(keyOf(conversationId, cid), { taskId, at: now });
}

/** 查这条客户端消息是否已处理过：命中返回当时的 taskId，未命中返回 null */
export function findCreatedTask(
  conversationId: string,
  clientMsgId: string | undefined,
  now: number = Date.now(),
): string | null {
  const cid = String(clientMsgId || '').trim();
  if (!cid || !conversationId) return null;
  prune(now);
  return recent.get(keyOf(conversationId, cid))?.taskId ?? null;
}

/** 仅供测试：清空记账（真实运行不需要） */
export function resetCreatedTaskLedger(): void {
  recent.clear();
}
