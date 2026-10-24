// 历史窗口的驻留不变量（2026-10-24，用户实报「跑着跑着历史都没了？用户发出的任务也没了？」）
//
// ★ 症状（截图 + 主进程日志双证）：
//   任务跑到 18 分钟时，聊天区只剩尾部一个隐式轮（没有用户气泡），
//   更早的所有轮次连同「用户发的任务」一起消失。
//   `logs/main-2026-10-24.log`：
//     [15:18:09] [watchdog] 渲染进程 2 心跳停止 35209ms → 自动重载窗口
//     [15:21:58] [watchdog] 渲染进程 9 心跳停止 29473ms → 自动重载窗口
//
//   ★ 真正的元凶有两条，这里只负责**内存驻留**那一条：
//     ① 分页口径（服务端）：`limit` 数的是原始行，被 1862 条子智能体/工具执行明细占满，
//        首屏没有 user 消息 —— 已在 routes/conversations.ts 的 `/:id/messages` 修正为
//        「按页面显示消息计数、不下发子智能体明细」；
//     ② 驻留裁剪（本文件）：600 条上限按行数切头部，会把当前这一轮的轮头
//        （用户刚发的任务）一起切走，且**翻页游标不跟着走** ⇒ 被切掉的那段既不在内存、
//        也翻不回来（游标还指着旧位置，翻页取到的是"洞的另一端"）。
//
// 抽取的纯函数（零依赖、可单测）：
//   ① 裁剪**绝不能切掉最新一轮的轮头**（否则视图里整轮断头，用户以为消息丢了）；
//   ② 裁剪后必须把翻页游标对齐到新的头（否则被裁的历史永远拿不回来）。
import type { Message } from '@yan-zhi/shared';

export interface PagingCursor {
  createdAt: number;
  id: string;
}

export interface PagingStateLike {
  hasMore: boolean;
  loading: boolean;
  cursor: PagingCursor | null;
}

/**
 * 裁剪起点：数组前 `[0, start)` 条可以移出内存。
 *
 * 规则：既按条数上限裁，又**至少保留最新一轮（最后一条主链路 user）之后的所有消息**。
 *
 * ★ 为什么不能纯粹按条数裁：浏览器的窗口化按「轮」开窗，一个长任务可能整轮就是
 *   上千条（子智能体）。按条数裁会把这一轮的轮头切掉 ⇒ `buildMessageRounds` 只能
 *   合成 `user: null` 的隐式轮 ⇒ 用户看到"我发的任务没了"（本次实报）。
 *   代价是超长单轮的驻留会高于上限——这是保留语义锚点必须付的钱；
 *   真正防止 DOM 爆量的闸门是轮次窗口（12 轮）与单轮步数上限（40 步），不是这条内存上限。
 */
export function trimStartIndex(
  msgs: Array<Pick<Message, 'role'> & { parentToolCallId?: string | null }>,
  limit: number,
): number {
  const n = msgs.length;
  const cap = Math.max(1, limit);
  if (n <= cap) return 0;
  let lastUser = -1;
  for (let i = n - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === 'user' && !m.parentToolCallId) { lastUser = i; break; }
  }
  const byCount = n - cap;
  return lastUser >= 0 ? Math.min(byCount, lastUser) : byCount;
}

/**
 * 裁剪后把翻页游标对齐到新的头。
 *
 * ★ 必须做：`loadMoreHistory` 按 `cursor` 向前取页。游标停在裁剪前的位置时，
 *   取回来的是被裁掉之前那一页的**更早**内容，中间整段永远补不回来（历史洞）。
 *   对齐到新头之后，用户往上滚取到的正是刚被移出内存的那一段 —— 连续、不跳。
 */
export function syncPagingAfterTrim(
  paging: PagingStateLike,
  dropped: number,
  keptHead: Pick<Message, 'id' | 'createdAt'> | undefined,
): void {
  if (dropped <= 0 || !keptHead) return;
  paging.cursor = { createdAt: keptHead.createdAt || 0, id: keptHead.id };
  paging.hasMore = true;
}
