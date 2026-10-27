// 交付文件 → 轮次归组（纯函数）
//
// 背景（2026-10-27 用户实报「三个交付文件只显示一个」）：聊天里的交付卡片按**轮次**渲染，
// 而归组原先只认 messageId —— agent `file_write` 产出的文件带 messageId；
// 前端导出通道（saveDeliverableBytes：Excel / Word / PNG）登记时没有 messageId，
// 第 ① 步命中不了、第 ② 步又被直接跳过 ⇒ 只有一份能上图。
//
// 归组口径：
//   ① messageId 精确命中本轮（steps 或 finalAssistant 的 id）；
//   ② 没命中 / 没有 messageId → 按创建时间归轮：
//      取「用户消息时间 ≤ 文件时间」的最后一轮；早于第一轮（更早历史没加载）归第一轮；
//      没有时间戳归最后一轮 —— 宁可挂错一轮，也不能让交付物直接消失。
//
// 沿用 message-rounds.ts 的模式：零依赖纯函数，组件只做取值，行为可以真单测。
import type { ConversationFile } from '@yan-zhi/shared';
import type { MessageRound } from '../composables/chat/message-rounds';

/** 文件创建时间 → 所属轮次下标（见文件头 ②） */
export function roundIndexForTime(at: number | undefined | null, rounds: MessageRound[]): number {
  if (!rounds.length) return 0;
  if (!at) return rounds.length - 1;
  let idx = 0;
  for (let i = 0; i < rounds.length; i++) {
    if ((rounds[i].user?.createdAt || 0) <= at) idx = i;
    else break;
  }
  return idx;
}

/** 把交付文件按轮次归组；返回数组下标 = 全局轮次号，元素 = 该轮的交付文件 */
export function groupDeliverablesByRound(
  rounds: MessageRound[],
  files: ConversationFile[],
): ConversationFile[][] {
  const out: ConversationFile[][] = rounds.map(() => []);
  if (!rounds.length || !files.length) return out;
  const used = new Set<string>();
  rounds.forEach((r, i) => {
    const ids = new Set<string>();
    r.steps.forEach((s) => { if (s.messageId) ids.add(s.messageId); });
    if (r.finalAssistant?.id) ids.add(r.finalAssistant.id);
    for (const f of files) {
      if (!f.messageId || used.has(f.id) || !ids.has(f.messageId)) continue;
      out[i].push(f);
      used.add(f.id);
    }
  });
  for (const f of files) {
    if (used.has(f.id)) continue;
    out[roundIndexForTime(f.createdAt, rounds)].push(f);
    used.add(f.id);
  }
  return out;
}
