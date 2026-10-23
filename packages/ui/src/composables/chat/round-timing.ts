/**
 * 轮次与计划步骤耗时统计（2026-10-23 用户需求：「任务耗时 + 最耗时的 3 个」）。
 *
 * 两个口径：
 *   · 轮次总耗时：用户提问 → 最后一条消息（消息时间戳，见 roundElapsedMs）
 *   · Top3：**计划步骤**的耗时（服务端 task-plan-file 写入的 startedAt/finishedAt）
 *     —— 用户明确要求「不按工具来，按规划的任务步骤；没有规划任务就只统计总时间」。
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

/**
 * 本轮总耗时：用户提问 → 最后一条消息（最终回答 / 最后一次工具结果）。
 * ★ 分页兜底（2026-10-23 实报）：长会话只加载最近 50 条，轮次的 user 消息常在更早的页里
 *   → `round.user` 为 null，旧实现直接返回 0，摘要行连「耗时」都不显示。
 *   没有轮头时退回**窗口内最早一条消息**作为起点（会比真实总耗时小，但不再是空）。
 */
export function roundElapsedMs(round: MessageRound | null | undefined): number {
  let end = round?.finalAssistant?.createdAt || 0;
  let earliest = 0;
  for (const step of round?.steps ?? []) {
    if (step.at) {
      if (step.at > end) end = step.at;
      if (!earliest || step.at < earliest) earliest = step.at;
    }
    for (const r of step.toolResults || []) {
      if (r.at) {
        if (r.at > end) end = r.at;
        if (!earliest || r.at < earliest) earliest = r.at;
      }
    }
  }
  const start = Number(round?.user?.createdAt) || earliest;
  return start && end > start ? end - start : 0;
}

export interface PlanTimingLike extends PlanLike {
  /** 计划创建时间（服务端 task_plan 落库，任务耗时的权威起点） */
  createdAt?: number;
  startedAt?: number;
  /** 全部步骤进入终态的时间（服务端写入） */
  finishedAt?: number;
}

/**
 * 计划级总耗时（**落盘记录**，不依赖消息时间戳/分页）：
 *   finishedAt − (createdAt || startedAt)；运行中用 now 作为终点。
 * 这是摘要行优先使用的值；只有存量计划没有 createdAt 时才回退到 roundElapsedMs。
 */
export function planElapsedMs(plan: PlanTimingLike | null | undefined, now = 0): number {
  const start = Number(plan?.createdAt) || Number(plan?.startedAt) || 0;
  if (!start) return 0;
  const finished = Number(plan?.finishedAt) || 0;
  const end = finished || (now > start ? now : 0);
  return end > start ? end - start : 0;
}

export interface TimedPlanStep {
  title?: string;
  status?: string;
  startedAt?: number;
  finishedAt?: number;
  activeMs?: number;
}

export interface PlanLike {
  steps?: TimedPlanStep[];
}

export interface PlanStepDuration {
  /** 从 1 起的步骤下标（与 task_step 的 index 同口径） */
  index: number;
  title: string;
  ms: number;
}

/**
 * 单步耗时：返工累计的 activeMs + 当前时间窗。
 * ★ 传入 now 才能算「运行中」步骤的实时时长；不传则只统计已结算的步骤（纯函数，可单测）。
 */
export function planStepElapsedMs(step: TimedPlanStep | null | undefined, now = 0): number {
  if (!step) return 0;
  const active = Number(step.activeMs) || 0;
  const started = Number(step.startedAt) || 0;
  const finished = Number(step.finishedAt) || 0;
  const end = finished || (started && now > started ? now : 0);
  return active + (started && end > started ? end - started : 0);
}

/** 所有有计时的计划步骤（无时间戳的存量步骤自然为 0 → 不进入 Top3） */
export function planStepDurations(plan: PlanLike | null | undefined): PlanStepDuration[] {
  const steps = Array.isArray(plan?.steps) ? plan!.steps! : [];
  return steps
    .map((s, i) => ({ index: i + 1, title: String(s?.title || `步骤 ${i + 1}`), ms: planStepElapsedMs(s) }))
    .filter((d) => d.ms > 0);
}

/** 最耗时的 N 个计划步骤（降序）；无计划或全部无计时 → 空数组 */
export function slowestPlanSteps(
  plan: PlanLike | null | undefined,
  n = 3,
): PlanStepDuration[] {
  return planStepDurations(plan)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, Math.max(0, n));
}
