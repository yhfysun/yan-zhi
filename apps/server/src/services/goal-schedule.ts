import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { createGoal, getGoal, type GoalCriterion, type GoalRun } from './goal-store.js';
import { tickDueGoals } from './goal-runner.js';
import { findGoalTrigger, saveGoalTrigger } from './goal-trigger.js';
import { nextCronTime } from './scheduled-tasks.js';

const MINUTE_MS = 60_000;

export interface GoalSchedule {
  id: string;
  userId: string;
  name: string;
  sourceConversationId: string | null;
  templateId: string | null;
  agentId: string | null;
  platformId: string;
  modelId: string;
  spaceId: string | null;
  objective: string;
  criteria: GoalCriterion[];
  constraints: string[];
  approvalRequired: string[];
  maxBatches: number;
  maxStallBatches: number;
  costLimitCny: number;
  intervalMinutes: number | null;
  cronExpr: string | null;
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  lastGoalId: string | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface GoalScheduleRun {
  id: string;
  scheduleId: string;
  userId: string;
  scheduledFor: number;
  eventId: string;
  goalId: string | null;
  conversationId: string | null;
  status: 'created' | 'failed';
  error: string | null;
  createdAt: number;
}

export interface GoalScheduleCreateInput {
  userId: string;
  name: string;
  sourceConversationId?: string | null;
  templateId?: string | null;
  agentId?: string | null;
  platformId: string;
  modelId: string;
  spaceId?: string | null;
  objective: string;
  criteria?: GoalCriterion[];
  constraints?: string[];
  approvalRequired?: string[];
  maxBatches?: number;
  maxStallBatches?: number;
  costLimitCny?: number;
  intervalMinutes?: number | null;
  cronExpr?: string | null;
  enabled?: boolean;
}

export interface GoalSchedulePatch {
  name?: string;
  agentId?: string | null;
  platformId?: string;
  modelId?: string;
  intervalMinutes?: number | null;
  cronExpr?: string | null;
  enabled?: boolean;
}

export interface MaterializeGoalScheduleResult {
  created: boolean;
  run: GoalScheduleRun;
  goal: GoalRun | null;
  goalId: string | null;
}

const parse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const clampInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
};

const normalizeStrings = (value: unknown, max: number): string[] => (
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, max)
    : []
);

function mapSchedule(row: any): GoalSchedule {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    sourceConversationId: row.source_conversation_id || null,
    templateId: row.template_id || null,
    agentId: row.agent_id || null,
    platformId: String(row.platform_id),
    modelId: String(row.model_id),
    spaceId: row.space_id || null,
    objective: String(row.objective),
    criteria: parse<GoalCriterion[]>(row.criteria_json, []),
    constraints: parse<string[]>(row.constraints_json, []),
    approvalRequired: parse<string[]>(row.approval_policy_json, []),
    maxBatches: clampInt(row.max_batches, 20, 1, 200),
    maxStallBatches: clampInt(row.max_stall_batches, 3, 1, 20),
    costLimitCny: Math.max(0, Number(row.cost_limit_cny) || 0),
    intervalMinutes: row.interval_minutes == null ? null : Number(row.interval_minutes),
    cronExpr: row.cron_expr || null,
    enabled: Number(row.enabled) === 1,
    lastRunAt: row.last_run_at == null ? null : Number(row.last_run_at),
    nextRunAt: row.next_run_at == null ? null : Number(row.next_run_at),
    lastGoalId: row.last_goal_id || null,
    lastError: row.last_error || null,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  };
}

function mapRun(row: any): GoalScheduleRun {
  return {
    id: String(row.id),
    scheduleId: String(row.schedule_id),
    userId: String(row.user_id),
    scheduledFor: Number(row.scheduled_for),
    eventId: String(row.event_id),
    goalId: row.goal_id || null,
    conversationId: row.conversation_id || null,
    status: row.status === 'failed' ? 'failed' : 'created',
    error: row.error || null,
    createdAt: Number(row.created_at) || 0,
  };
}

export function computeNextGoalRun(
  schedule: Pick<GoalSchedule, 'intervalMinutes' | 'cronExpr'>,
  from = Date.now(),
): number | null {
  if (schedule.intervalMinutes && schedule.intervalMinutes > 0) {
    return from + schedule.intervalMinutes * MINUTE_MS;
  }
  if (schedule.cronExpr && schedule.cronExpr.trim()) {
    return nextCronTime(schedule.cronExpr, from);
  }
  return null;
}

export function validateGoalSchedule(
  intervalMinutes?: number | null,
  cronExpr?: string | null,
): string | null {
  if (intervalMinutes && intervalMinutes > 0) return null;
  if (cronExpr && cronExpr.trim()) {
    return nextCronTime(cronExpr, Date.now()) === null
      ? 'cron 表达式无效（应为 5 字段分钟粒度，如 "30 9 * * *"）'
      : null;
  }
  return '请设置定时方式';
}

export function getGoalSchedule(id: string): GoalSchedule | null {
  const row = db.prepare('SELECT * FROM goal_schedule WHERE id = ?').get(id);
  return row ? mapSchedule(row) : null;
}

export function listGoalSchedules(userId: string): GoalSchedule[] {
  return (db.prepare(
    'SELECT * FROM goal_schedule WHERE user_id = ? ORDER BY created_at DESC, rowid DESC',
  ).all(userId) as any[]).map(mapSchedule);
}

export function createGoalSchedule(input: GoalScheduleCreateInput): GoalSchedule {
  const name = String(input.name || '').trim().slice(0, 120);
  const objective = String(input.objective || '').trim().slice(0, 20_000);
  if (!input.userId || !name || !objective || !input.platformId || !input.modelId) {
    throw new Error('缺少目标计划名称、目标、平台或模型');
  }
  const scheduleError = validateGoalSchedule(input.intervalMinutes, input.cronExpr);
  if (scheduleError) throw new Error(scheduleError);

  const id = `goalsched_${randomUUID()}`;
  const now = Date.now();
  const enabled = input.enabled === undefined ? true : !!input.enabled;
  const intervalMinutes = input.intervalMinutes && input.intervalMinutes > 0
    ? Math.max(1, Math.round(input.intervalMinutes))
    : null;
  const cronExpr = input.cronExpr?.trim() || null;
  const nextRunAt = enabled
    ? computeNextGoalRun({ intervalMinutes, cronExpr }, now)
    : null;
  if (enabled && nextRunAt === null) throw new Error('定时方式无效');

  db.prepare(`
    INSERT INTO goal_schedule (
      id, user_id, name, source_conversation_id, template_id, agent_id,
      platform_id, model_id, space_id, objective, criteria_json, constraints_json,
      approval_policy_json, max_batches, max_stall_batches, interval_minutes,
      cost_limit_cny,
      cron_expr, enabled, last_run_at, next_run_at, last_goal_id, last_error,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, ?)
  `).run(
    id,
    input.userId,
    name,
    input.sourceConversationId || null,
    input.templateId || null,
    input.agentId || null,
    input.platformId,
    input.modelId,
    input.spaceId || null,
    objective,
    JSON.stringify(Array.isArray(input.criteria) ? input.criteria : []),
    JSON.stringify(normalizeStrings(input.constraints, 50)),
    JSON.stringify(normalizeStrings(input.approvalRequired, 50)),
    clampInt(input.maxBatches, 20, 1, 200),
    clampInt(input.maxStallBatches, 3, 1, 20),
    intervalMinutes,
    Math.max(0, Number(input.costLimitCny) || 0),
    cronExpr,
    enabled ? 1 : 0,
    nextRunAt,
    now,
    now,
  );
  return getGoalSchedule(id)!;
}

export function updateGoalSchedule(id: string, userId: string, patch: GoalSchedulePatch): GoalSchedule {
  const existing = db.prepare(
    'SELECT * FROM goal_schedule WHERE id = ? AND user_id = ?',
  ).get(id, userId) as any;
  if (!existing) throw new Error('目标计划不存在');

  const sets: string[] = [];
  const values: any[] = [];
  if (patch.name !== undefined) {
    const name = String(patch.name || '').trim().slice(0, 120);
    if (!name) throw new Error('目标计划名称不能为空');
    sets.push('name = ?');
    values.push(name);
  }
  if (patch.agentId !== undefined) { sets.push('agent_id = ?'); values.push(patch.agentId || null); }
  if (patch.platformId !== undefined) { sets.push('platform_id = ?'); values.push(String(patch.platformId)); }
  if (patch.modelId !== undefined) { sets.push('model_id = ?'); values.push(String(patch.modelId)); }
  if (patch.intervalMinutes !== undefined) {
    sets.push('interval_minutes = ?');
    values.push(patch.intervalMinutes && patch.intervalMinutes > 0 ? Math.round(patch.intervalMinutes) : null);
  }
  if (patch.cronExpr !== undefined) {
    sets.push('cron_expr = ?');
    values.push(patch.cronExpr?.trim() || null);
  }
  if (patch.enabled !== undefined) { sets.push('enabled = ?'); values.push(patch.enabled ? 1 : 0); }

  const intervalMinutes = patch.intervalMinutes !== undefined
    ? (patch.intervalMinutes && patch.intervalMinutes > 0 ? Math.round(patch.intervalMinutes) : null)
    : (existing.interval_minutes == null ? null : Number(existing.interval_minutes));
  const cronExpr = patch.cronExpr !== undefined
    ? (patch.cronExpr?.trim() || null)
    : (existing.cron_expr || null);
  const scheduleChanged = patch.intervalMinutes !== undefined || patch.cronExpr !== undefined;
  const enabled = patch.enabled !== undefined ? !!patch.enabled : Number(existing.enabled) === 1;
  if (sets.length > 0) {
    const scheduleError = validateGoalSchedule(intervalMinutes, cronExpr);
    if (scheduleError) throw new Error(scheduleError);
    if (!enabled) {
      sets.push('next_run_at = NULL');
    } else if (scheduleChanged || (patch.enabled === true && Number(existing.enabled) !== 1)) {
      sets.push('next_run_at = ?');
      values.push(computeNextGoalRun({ intervalMinutes, cronExpr }, Date.now()));
    }
    sets.push('updated_at = ?');
    values.push(Date.now());
    values.push(id, userId);
    db.prepare(`UPDATE goal_schedule SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
  }
  return getGoalSchedule(id)!;
}

export function deleteGoalSchedule(id: string, userId: string): boolean {
  const info = db.prepare('DELETE FROM goal_schedule WHERE id = ? AND user_id = ?').run(id, userId);
  return Number(info?.changes || 0) > 0;
}

export function listGoalScheduleRuns(scheduleId: string, userId: string, limit = 100): GoalScheduleRun[] {
  return (db.prepare(`
    SELECT * FROM goal_schedule_run
    WHERE schedule_id = ? AND user_id = ?
    ORDER BY scheduled_for DESC
    LIMIT ?
  `).all(scheduleId, userId, Math.max(1, Math.min(500, Math.floor(limit)))) as any[]).map(mapRun);
}

function titleForOccurrence(schedule: GoalSchedule, scheduledFor: number): string {
  const at = new Date(scheduledFor);
  const stamp = `${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return `${schedule.name} · ${stamp}`.slice(0, 120);
}

export function materializeGoalSchedule(
  scheduleId: string,
  scheduledFor: number,
  options: { wake?: boolean; manual?: boolean } = {},
): MaterializeGoalScheduleResult {
  const schedule = getGoalSchedule(scheduleId);
  if (!schedule) throw new Error('目标计划不存在');
  if (!schedule.enabled && !options.manual) throw new Error('目标计划已停用');
  const eventId = `scheduled:${schedule.id}:${Math.round(scheduledFor)}`;

  let result: MaterializeGoalScheduleResult | null = null;
  const transaction = db.transaction(() => {
    const existingRun = db.prepare(
      'SELECT * FROM goal_schedule_run WHERE schedule_id = ? AND scheduled_for = ?',
    ).get(schedule.id, Math.round(scheduledFor));
    if (existingRun) {
      const run = mapRun(existingRun);
      result = {
        created: false,
        run,
        goal: run.goalId ? getGoal(run.goalId) : null,
        goalId: run.goalId,
      };
      return;
    }

    const runId = `goalschedrun_${randomUUID()}`;
    const now = Date.now();
    db.prepare(`
      INSERT INTO goal_schedule_run (
        id, schedule_id, user_id, scheduled_for, event_id, goal_id,
        conversation_id, status, error, created_at
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL, 'created', NULL, ?)
    `).run(runId, schedule.id, schedule.userId, Math.round(scheduledFor), eventId, now);

    const existingTrigger = findGoalTrigger(schedule.userId, 'goal-schedule', eventId);
    if (existingTrigger) {
      const goal = getGoal(existingTrigger.goalId);
      db.prepare(`
        UPDATE goal_schedule_run SET goal_id = ?, conversation_id = ? WHERE id = ?
      `).run(existingTrigger.goalId, goal?.conversationId || null, runId);
      db.prepare(`
        UPDATE goal_schedule
        SET last_run_at = ?, next_run_at = ?, last_goal_id = ?, last_error = NULL, updated_at = ?
        WHERE id = ?
      `).run(
        now,
        computeNextGoalRun(schedule, now),
        existingTrigger.goalId,
        now,
        schedule.id,
      );
      result = {
        created: false,
        run: mapRun(db.prepare('SELECT * FROM goal_schedule_run WHERE id = ?').get(runId)),
        goal,
        goalId: existingTrigger.goalId,
      };
      return;
    }

    const conversationId = `conv_${randomUUID()}`;
    db.prepare(`
      INSERT INTO conversation (
        id, user_id, title, agent_id, platform_id, model_id, space_id,
        mcp_servers_json, skill_ids_json, pinned, goal_schedule_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]', 0, ?, ?, ?)
    `).run(
      conversationId,
      schedule.userId,
      titleForOccurrence(schedule, scheduledFor),
      schedule.agentId,
      schedule.platformId,
      schedule.modelId,
      schedule.spaceId,
      schedule.id,
      now,
      now,
    );

    const goal = createGoal({
      userId: schedule.userId,
      conversationId,
      agentId: schedule.agentId,
      platformId: schedule.platformId,
      modelId: schedule.modelId,
      objective: schedule.objective,
      criteria: schedule.criteria,
      constraints: schedule.constraints,
      approvalRequired: schedule.approvalRequired,
      maxBatches: schedule.maxBatches,
      maxStallBatches: schedule.maxStallBatches,
      costLimitCny: schedule.costLimitCny,
    });
    saveGoalTrigger({
      userId: schedule.userId,
      source: 'goal-schedule',
      eventId,
      goalId: goal.id,
      payload: {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        scheduledFor,
      },
    });
    db.prepare(`
      UPDATE goal_schedule_run SET goal_id = ?, conversation_id = ? WHERE id = ?
    `).run(goal.id, conversationId, runId);
    db.prepare(`
      UPDATE goal_schedule
      SET last_run_at = ?, next_run_at = ?, last_goal_id = ?, last_error = NULL, updated_at = ?
      WHERE id = ?
    `).run(
      now,
      computeNextGoalRun(schedule, now),
      goal.id,
      now,
      schedule.id,
    );
    result = {
      created: true,
      run: mapRun(db.prepare('SELECT * FROM goal_schedule_run WHERE id = ?').get(runId)),
      goal,
      goalId: goal.id,
    };
  });

  try {
    transaction();
  } catch (error: any) {
    const existing = db.prepare(
      'SELECT * FROM goal_schedule_run WHERE schedule_id = ? AND scheduled_for = ?',
    ).get(schedule.id, Math.round(scheduledFor));
    if (existing) {
      const run = mapRun(existing);
      return {
        created: false,
        run,
        goal: run.goalId ? getGoal(run.goalId) : null,
        goalId: run.goalId,
      };
    }
    const now = Date.now();
    const message = String(error?.message || error).slice(0, 2_000);
    const runId = `goalschedrun_${randomUUID()}`;
    db.prepare(`
      INSERT OR IGNORE INTO goal_schedule_run (
        id, schedule_id, user_id, scheduled_for, event_id, goal_id,
        conversation_id, status, error, created_at
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL, 'failed', ?, ?)
    `).run(runId, schedule.id, schedule.userId, Math.round(scheduledFor), eventId, message, now);
    db.prepare(`
      UPDATE goal_schedule
      SET last_run_at = ?, next_run_at = ?, last_error = ?, updated_at = ?
      WHERE id = ?
    `).run(now, computeNextGoalRun(schedule, now), message, now, schedule.id);
    const run = db.prepare(
      'SELECT * FROM goal_schedule_run WHERE schedule_id = ? AND scheduled_for = ?',
    ).get(schedule.id, Math.round(scheduledFor));
    return { created: false, run: mapRun(run), goal: null, goalId: null };
  }

  const finalResult = result as MaterializeGoalScheduleResult | null;
  if (!finalResult) throw new Error('目标计划未能生成目标');
  if (finalResult.created && options.wake !== false) {
    queueMicrotask(() => { void tickDueGoals().catch(() => {}); });
  }
  return finalResult;
}

export function tickDueGoalSchedules(now = Date.now(), options: { wake?: boolean } = {}): number {
  const due = db.prepare(`
    SELECT * FROM goal_schedule
    WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
    ORDER BY next_run_at ASC
    LIMIT 20
  `).all(now) as any[];
  let created = 0;
  for (const row of due) {
    try {
      const result = materializeGoalSchedule(row.id, Number(row.next_run_at), {
        wake: false,
        manual: false,
      });
      if (result.created) created++;
    } catch {
      // materializeGoalSchedule persists the error and advances this occurrence.
    }
  }
  if (created > 0 && options.wake !== false) {
    queueMicrotask(() => { void tickDueGoals().catch(() => {}); });
  }
  return created;
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let startupTimer: ReturnType<typeof setTimeout> | null = null;

function hasEnabledGoalSchedule(): boolean {
  const row = db.prepare(
    'SELECT COUNT(*) AS count FROM goal_schedule WHERE enabled = 1',
  ).get() as any;
  return Number(row?.count || 0) > 0;
}

function startGoalScheduleTimer(): void {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => { tickDueGoalSchedules(); }, 30_000);
  startupTimer = setTimeout(() => { tickDueGoalSchedules(); }, 3_000);
  schedulerTimer.unref?.();
  startupTimer.unref?.();
}

function stopGoalScheduleTimer(): void {
  if (schedulerTimer) clearInterval(schedulerTimer);
  if (startupTimer) clearTimeout(startupTimer);
  schedulerTimer = null;
  startupTimer = null;
}

export function refreshGoalScheduleScheduler(): void {
  if (hasEnabledGoalSchedule()) startGoalScheduleTimer();
  else stopGoalScheduleTimer();
}

export function startGoalScheduleScheduler(): void {
  tickDueGoalSchedules();
  refreshGoalScheduleScheduler();
}

export function stopGoalScheduleScheduler(): void {
  stopGoalScheduleTimer();
}
