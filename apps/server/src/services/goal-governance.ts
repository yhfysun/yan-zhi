import { db } from '../db.js';
import { appendGoalEvent, getGoal, transitionGoal, type GoalRun } from './goal-store.js';

const ACTIVE_STATUSES = ['planning', 'running', 'verifying'] as const;
const USER_LIMIT_KEY_PREFIX = 'goal.max_running_per_user:';
const GLOBAL_LIMIT_KEY = 'goal.max_running_global';
const DEFAULT_COST_LIMIT_KEY = 'goal.default_cost_limit_cny';

export interface GoalGovernanceSnapshot {
  maxRunningGlobal: number;
  maxRunningPerUser: number;
  runningGlobal: number;
  runningForUser: number;
  defaultCostLimitCny: number;
}

export interface GoalAdmissionResult {
  admitted: boolean;
  reason?: 'terminal' | 'global_limit' | 'user_limit';
  goal: GoalRun | null;
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function readConfig(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(key) as
    | { value?: string | null }
    | undefined;
  return row?.value == null ? null : String(row.value);
}

function writeConfig(key: string, value: string): void {
  db.prepare(`
    INSERT INTO app_config (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, Date.now());
}

export function getGlobalGoalConcurrencyLimit(): number {
  return integer(
    readConfig(GLOBAL_LIMIT_KEY) ?? process.env.YZ_GOAL_MAX_RUNNING_GLOBAL,
    4,
    1,
    50,
  );
}

export function getUserGoalConcurrencyLimit(userId: string): number {
  return integer(
    readConfig(`${USER_LIMIT_KEY_PREFIX}${userId}`) ?? process.env.YZ_GOAL_MAX_RUNNING_PER_USER,
    2,
    1,
    20,
  );
}

export function setUserGoalConcurrencyLimit(userId: string, limit: number): number {
  const normalized = integer(limit, 2, 1, 20);
  writeConfig(`${USER_LIMIT_KEY_PREFIX}${userId}`, String(normalized));
  return normalized;
}

export function getDefaultGoalCostLimit(): number {
  return Math.max(0, Number(readConfig(DEFAULT_COST_LIMIT_KEY) || 0) || 0);
}

export function setDefaultGoalCostLimit(limit: number): number {
  const normalized = Math.max(0, Math.min(100_000, Number(limit) || 0));
  writeConfig(DEFAULT_COST_LIMIT_KEY, String(normalized));
  return normalized;
}

function activeCount(userId?: string): number {
  const placeholders = ACTIVE_STATUSES.map(() => '?').join(',');
  const row = userId
    ? db.prepare(
        `SELECT COUNT(*) AS count FROM goal_run WHERE user_id = ? AND status IN (${placeholders})`,
      ).get(userId, ...ACTIVE_STATUSES) as any
    : db.prepare(
        `SELECT COUNT(*) AS count FROM goal_run WHERE status IN (${placeholders})`,
      ).get(...ACTIVE_STATUSES) as any;
  return Number(row?.count || 0);
}

export function getGoalGovernance(userId: string): GoalGovernanceSnapshot {
  return {
    maxRunningGlobal: getGlobalGoalConcurrencyLimit(),
    maxRunningPerUser: getUserGoalConcurrencyLimit(userId),
    runningGlobal: activeCount(),
    runningForUser: activeCount(userId),
    defaultCostLimitCny: getDefaultGoalCostLimit(),
  };
}

export function admitGoalExecution(goalId: string, now = Date.now()): GoalAdmissionResult {
  const goal = getGoal(goalId);
  if (!goal) return { admitted: false, reason: 'terminal', goal: null };
  if (['completed', 'failed', 'cancelled', 'blocked', 'paused', 'needing_approval'].includes(goal.status)) {
    return { admitted: false, reason: 'terminal', goal };
  }
  if ((ACTIVE_STATUSES as readonly string[]).includes(goal.status)) {
    return { admitted: true, goal };
  }

  const maxGlobal = getGlobalGoalConcurrencyLimit();
  const maxPerUser = getUserGoalConcurrencyLimit(goal.userId);
  const runningGlobal = activeCount();
  const runningForUser = activeCount(goal.userId);
  const reason = runningGlobal >= maxGlobal
    ? 'global_limit'
    : runningForUser >= maxPerUser
      ? 'user_limit'
      : null;
  if (reason) {
    const nextRunAt = now + 15_000;
    const updated = transitionGoal(goal.id, 'retry_wait', {
      nextRunAt,
      lastError: reason === 'global_limit' ? '全局目标并发已达上限，等待执行槽' : '当前账号目标并发已达上限，等待执行槽',
      leaseOwner: null,
      leaseUntil: null,
    });
    appendGoalEvent(goal.id, 'goal.deferred', {
      reason,
      runningGlobal,
      runningForUser,
      maxGlobal,
      maxPerUser,
      nextRunAt,
    });
    return { admitted: false, reason, goal: updated };
  }

  const admitted = transitionGoal(goal.id, 'planning', {
    nextRunAt: null,
    lastError: null,
    leaseOwner: null,
    leaseUntil: null,
  });
  appendGoalEvent(goal.id, 'goal.admitted', {
    runningGlobal,
    runningForUser,
    maxGlobal,
    maxPerUser,
  });
  return { admitted: true, goal: admitted };
}
