/**
 * reasoning-summary.ts — 一轮对话「深度思考」汇总（WorkBuddy 式徽标的数据源）
 *
 * ★ 为什么单独抽成纯函数（2026-10-21）：
 *   ChatMessageList 的模板在 v-for 里，每次渲染都要问"这轮有多少字思考 / 全文是什么"。
 *   agent 模式一轮可能有几十到上百步，每步的 reasoningContent 合起来几万字 ——
 *   **拼串绝不能进渲染热路径**。所以拆成两个成本不同的函数：
 *     · roundReasoningChars —— 只累加 length，供徽标显示与 v-if 判定（O(步数)，微秒级）；
 *     · roundReasoningText  —— 真拼全文，**只在用户展开时调用**。
 *
 * ★ 为什么 agent 模式不再被排除（2026-10-21 用户确认）：
 *   此前 `!round.hasAgentProcess` 把带工具调用的轮次挡掉了，导致开发模式（几乎总在调工具）
 *   根本看不到「深度思考」标识 —— 用户的实际体感就是"思考内容不展示/没提示"。
 */
import type { MessageRound } from './message-rounds';

/** 展开全量的字数上限：超过只给尾部（各步骤的「推理 N」里仍能看到完整片段） */
export const REASONING_TEXT_MAX = 20000;

/**
 * 本轮思考的总字数。
 * 有最终回答的 reasoningContent 就用它（那通常是收尾思考，且与最后一步同源，不重复计）；
 * 否则把各步骤推理累加。
 */
export function roundReasoningChars(round: MessageRound | null | undefined): number {
  if (!round) return 0;
  const own = round.finalAssistant?.reasoningContent;
  if (own) return own.length;
  let total = 0;
  for (const step of round.steps ?? []) {
    if (step.reasoningContent) total += step.reasoningContent.length;
  }
  return total;
}

/**
 * 本轮思考全文（**展开时才调用**）。
 *
 * - 有最终回答的 reasoningContent → 直接用它（agent 模式下它就是收尾那步的思考）；
 * - 否则按步骤拼接，加 `── 步骤 N ──` 分隔，便于对照过程里的「推理 N」；
 * - 超 [max] 字只保留尾部并前置说明，避免一次往 DOM 塞几万字造成明显卡顿。
 */
export function roundReasoningText(
  round: MessageRound | null | undefined,
  max: number = REASONING_TEXT_MAX,
): string {
  if (!round) return '';
  const own = round.finalAssistant?.reasoningContent;
  if (own) return clampText(own, max);

  const parts: string[] = [];
  (round.steps ?? []).forEach((step, i) => {
    if (step.reasoningContent) parts.push(`── 步骤 ${i + 1} ──\n${step.reasoningContent}`);
  });
  return clampText(parts.join('\n\n'), max);
}

function clampText(text: string, max: number): string {
  if (max <= 0 || text.length <= max) return text;
  return `…（本轮思考过长，仅显示最后 ${max} 字；完整内容见过程里各步骤的「推理 N」）\n\n${text.slice(-max)}`;
}
