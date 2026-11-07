import { db } from '../db.js';
import { appendGoalEvent, getGoal, type GoalRun } from './goal-store.js';
import { resolvePool } from './model-pools.js';

interface GoalModelCandidate {
  platformId: string;
  modelId: string;
}

export function selectGoalFallbackCandidate(
  candidates: GoalModelCandidate[],
  current: GoalModelCandidate,
  attempted: Set<string>,
): GoalModelCandidate | null {
  return candidates.find((candidate) => (
    candidate.modelId !== current.modelId
    && !attempted.has(candidate.modelId)
  )) || null;
}

export function isGoalModelFailure(error: string | null | undefined): boolean {
  return /(?:429|rate.?limit|too many requests|timeout|timed out|network|fetch failed|5\d\d|model.*(?:unavailable|not found)|platform.*(?:unavailable|deleted))/i
    .test(String(error || ''));
}

export function advanceGoalModelFallback(
  goal: GoalRun,
  error: string | null | undefined,
): GoalRun | null {
  if (!goal.platformId || !goal.modelId) return null;
  const current = { platformId: goal.platformId, modelId: goal.modelId };
  const now = Date.now();
  db.prepare(`
    INSERT INTO goal_model_attempt
      (goal_id, platform_id, model_id, status, error, attempted_at)
    VALUES (?, ?, ?, 'failed', ?, ?)
    ON CONFLICT(goal_id, model_id) DO UPDATE SET
      status = excluded.status,
      error = excluded.error,
      attempted_at = excluded.attempted_at
  `).run(goal.id, current.platformId, current.modelId, String(error || '').slice(0, 2_000), now);

  const attempted = new Set(
    (db.prepare(
      'SELECT model_id FROM goal_model_attempt WHERE goal_id = ?',
    ).all(goal.id) as any[]).map((row) => String(row.model_id)),
  );
  const candidates = resolvePool(db, {
    userId: goal.userId,
    agentId: goal.agentId,
  }, 'llm').map((entry) => ({
    platformId: entry.platformId,
    modelId: entry.model.id,
  }));
  const next = selectGoalFallbackCandidate(candidates, current, attempted);
  if (!next) return null;
  db.prepare(`
    UPDATE goal_run
    SET platform_id = ?, model_id = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  `).run(
    next.platformId,
    next.modelId,
    `模型 ${current.modelId} 失败，已切换至 ${next.modelId}：${String(error || '').slice(0, 500)}`,
    now,
    goal.id,
  );
  appendGoalEvent(goal.id, 'model.fallback', {
    from: current,
    to: next,
    reason: String(error || '').slice(0, 2_000),
  });
  return getGoal(goal.id);
}
