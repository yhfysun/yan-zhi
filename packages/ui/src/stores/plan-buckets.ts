// 任务计划（task_plan / task_step）的分桶存储与变更逻辑。
//
// 为什么单独成模块：计划归属**发起该任务的会话**。早期实现用两个全局 ref
// （planTitle / planSteps），全应用只有一份 —— A 会话登记的计划会原样出现在
// B 会话的进度卡片里（用户实测串台）。这里把「按会话分桶」的规则收敛成纯函数，
// 既让 store 变薄，也能脱离 pinia 直接写单测钉住行为（plan-buckets.test.ts）。

import { uid } from '@yan-zhi/shared';

export type PlanStepStatus = 'pending' | 'running' | 'done' | 'failed';

export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  status: PlanStepStatus;
  note?: string;
}

export interface Plan {
  title: string;
  steps: PlanStep[];
}

/** 计划表：会话 id → 该会话的计划 */
export type PlanMap = Record<string, Plan>;

/** 草稿态键：会话尚未建立（首页刚发第一条消息）时计划先落这里 */
export const DRAFT_PLAN_KEY = '__draft__';

/**
 * 解析计划归属键。
 * 优先用显式传入的 convId（SSE tool:execute 透传的任务归属会话），
 * 其次回退到当前查看的会话，都没有则用草稿键。
 */
export function planKeyOf(currentConvId?: string | null, explicitConvId?: string | null): string {
  return (explicitConvId || currentConvId || '').trim() || DRAFT_PLAN_KEY;
}

/** 读某会话的计划（无则 undefined，不伪造空计划） */
export function readPlan(map: PlanMap, key: string): Plan | undefined {
  return map[key];
}

/** 清掉某会话的计划；无该键时原样返回（保持引用稳定，避免无谓的响应式触发） */
export function removePlan(map: PlanMap, key: string): PlanMap {
  if (!map[key]) return map;
  const next = { ...map };
  delete next[key];
  return next;
}

/** 同一批删除多个会话时用：一步算出新表 */
export function removePlans(map: PlanMap, keys: string[]): PlanMap {
  if (!keys.some((k) => map[k])) return map;
  const next = { ...map };
  for (const k of keys) delete next[k];
  return next;
}

export interface PlanMutationResult {
  ok: boolean;
  /** 成功时的回写给模型的文本 */
  result?: string;
  /** 失败原因 */
  msg?: string;
}

/**
 * task_plan：创建（或整体替换）某会话的计划。
 * 入参 steps 里缺 title 的项直接丢弃（模型偶尔给出空步骤）。
 */
export function applyTaskPlan(
  map: PlanMap,
  key: string,
  args: Record<string, unknown>,
): { map: PlanMap; outcome: PlanMutationResult } {
  const rawSteps = Array.isArray(args.steps) ? (args.steps as any[]) : [];
  const title = String(args.title || '任务计划');
  const steps: PlanStep[] = rawSteps
    .filter((s: any) => s && s.title)
    .map((s: any) => ({
      id: uid(),
      title: String(s.title),
      description: s.description ? String(s.description) : undefined,
      status: 'pending' as PlanStepStatus,
    }));
  return {
    map: { ...map, [key]: { title, steps } },
    outcome: { ok: true, result: `已创建任务计划「${title}」，共 ${steps.length} 步` },
  };
}

/**
 * task_step：推进某会话计划里的一步。
 *
 * 边界一律显式报错而非静默通过 —— 模型若在没建计划的会话里直接推进步骤，
 * 以前会写到「别的会话的计划」上（index 恰好落在范围内时还会成功），
 * 现在直接拒绝并要求先 task_plan。
 */
export function applyTaskStep(
  map: PlanMap,
  key: string,
  args: Record<string, unknown>,
): { map: PlanMap; outcome: PlanMutationResult } {
  const plan = map[key];
  const steps = plan?.steps || [];
  if (!steps.length) {
    return {
      map,
      outcome: { ok: false, msg: '当前会话还没有任务计划，请先调用 task_plan 建立计划再推进步骤' },
    };
  }
  const idx = Number(args.index);
  if (!Number.isFinite(idx) || idx < 1 || idx > steps.length) {
    return { map, outcome: { ok: false, msg: `task_step 的 index 超出范围（1-${steps.length}）` } };
  }
  const status = String(args.status || 'done') as PlanStepStatus;
  const note = args.note != null ? String(args.note) : undefined;
  const step = steps[idx - 1];
  if (step) {
    step.status = status;
    if (note !== undefined) step.note = note;
  }
  return {
    // steps 是同一个数组引用（原地改），外层 map 引用需换新以触发响应式
    map: { ...map },
    outcome: { ok: true, result: `已更新第 ${idx} 步状态为 ${status}` },
  };
}

/** 计划完成度（供卡片与测试复用）：已完成步数 / 总步数 / 是否出现失败 */
export function planProgress(plan: Plan | undefined): { total: number; done: number; failed: boolean } {
  const steps = plan?.steps || [];
  return {
    total: steps.length,
    done: steps.filter((s) => s.status === 'done').length,
    failed: steps.some((s) => s.status === 'failed'),
  };
}