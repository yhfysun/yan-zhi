import { db } from '../db.js';
import type { GoalRun } from './goal-store.js';
import { getDefaultGoalCostLimit } from './goal-governance.js';

export interface GoalCostState {
  usedCny: number;
  limitCny: number;
  estimatedCalls: number;
  exceeded: boolean;
}

export function isGoalCostLimitExceeded(
  usedCny: number,
  limitCny: number | null | undefined,
): boolean {
  const limit = Number(limitCny) || 0;
  return limit > 0 && (Number(usedCny) || 0) >= limit;
}

export function getGoalCostState(goal: GoalRun): GoalCostState {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(ue.cost_cny), 0) AS used_cny,
      COALESCE(SUM(CASE WHEN ue.estimated = 1 THEN 1 ELSE 0 END), 0) AS estimated_calls
    FROM usage_event ue
    JOIN llm_task lt ON lt.id = ue.task_id
    WHERE lt.goal_id = ?
  `).get(goal.id) as any;
  const usedCny = Number(row?.used_cny) || 0;
  const configured = Number(goal.costLimitCny) || 0;
  const limitCny = configured > 0 ? configured : getDefaultGoalCostLimit();
  return {
    usedCny,
    limitCny,
    estimatedCalls: Number(row?.estimated_calls) || 0,
    exceeded: isGoalCostLimitExceeded(usedCny, limitCny),
  };
}
