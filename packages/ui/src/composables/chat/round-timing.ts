/**
 * 轮次耗时统计（2026-10-23 用户需求：「这里把任务耗时加上，最耗时的 3 个也要着重标注」）。
 *
 * 数据来源全部是已落库的消息时间戳：
 *   · 每步（助手消息）的 createdAt → AgentStep.at
 *   · 每条工具结果消息的 createdAt → toolResults[].at
 * 两者相减就是**这次工具调用**的耗时；一轮从「用户提问」到最后一条消息就是任务总耗时。
 *
 * ★ 抽成纯函数：ChatMessageList 在 v-for 里每帧都会问耗时，必须可单测且零依赖
 *   （与 reasoning-summary.ts 同一取向：模板热路径不做重活）。
 */
import type { MessageRound } from './message-rounds';

/** 人类可读时长：<60s → "42 秒"；其余 → "3 分 5 秒" / "1 小时 12 分" */
export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m} 分 ${rest} 秒` : `${m} 分`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h} 小时 ${mm} 分` : `${h} 小时`;
}

/** 本轮总耗时：用户提问 → 最后一条消息（最终回答 / 最后一次工具结果） */
export function roundElapsedMs(round: MessageRound | null | undefined): number {
  const start = round?.user?.createdAt;
  if (!start) return 0;
  let end = round?.finalAssistant?.createdAt || 0;
  for (const step of round?.steps ?? []) {
    if (step.at && step.at > end) end = step.at;
    for (const r of step.toolResults || []) {
      if (r.at && r.at > end) end = r.at;
    }
  }
  return end > start ? end - start : 0;
}

export interface SlowToolCall {
  name: string;
  ms: number;
  /** 第几步（从 0 起，与过程区的步骤顺序一致） */
  stepIndex: number;
}

/**
 * 每次工具调用的耗时：结果消息时间 − 发起消息时间。
 * ★ 同一步里多次调用共用同一个起点 → 各自减自己的结果时间，仍是"这次调用花了多久"的合理近似；
 *   ToolCall 若已带 durationMs（后端上报）则优先用它。
 */
export function toolCallDurations(round: MessageRound | null | undefined): SlowToolCall[] {
  const out: SlowToolCall[] = [];
  (round?.steps ?? []).forEach((step, si) => {
    const start = step.at;
    for (const tc of step.toolCalls || []) {
      const name = String(tc?.name || tc?.toolName || tc?.function?.name || '工具');
      const res = (step.toolResults || []).find((r) => r.callId === tc?.id);
      const reported = Number(tc?.durationMs);
      const ms = Number.isFinite(reported) && reported > 0
        ? reported
        : (start && res?.at ? res.at - start : 0);
      if (ms > 0) out.push({ name, ms, stepIndex: si });
    }
  });
  return out;
}

/** 最耗时的 N 次工具调用（降序） */
export function slowestToolCalls(
  round: MessageRound | null | undefined,
  n = 3,
): SlowToolCall[] {
  return toolCallDurations(round)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, Math.max(0, n));
}
