import { randomUUID } from 'node:crypto';
import { db } from '../db.js';

export type GoalStatus =
  | 'queued'
  | 'planning'
  | 'running'
  | 'verifying'
  | 'needing_approval'
  | 'waiting_external'
  | 'retry_wait'
  | 'blocked'
  | 'failed'
  | 'completed'
  | 'paused'
  | 'cancelled';

export interface GoalCriterion {
  id: string;
  title: string;
  kind?: string;
  command?: string;
  path?: string;
  url?: string;
  expect?: unknown;
}

export interface GoalCreateInput {
  userId: string;
  conversationId: string;
  agentId?: string | null;
  platformId?: string | null;
  modelId?: string | null;
  objective: string;
  criteria?: GoalCriterion[];
  constraints?: string[];
  approvalRequired?: string[];
  maxBatches?: number;
  maxStallBatches?: number;
}

export interface GoalRun {
  id: string;
  userId: string;
  conversationId: string;
  agentId: string | null;
  platformId: string | null;
  modelId: string | null;
  status: GoalStatus;
  objective: string;
  criteria: GoalCriterion[];
  constraints: string[];
  approvalRequired: string[];
  maxBatches: number;
  maxStallBatches: number;
  currentBatch: number;
  stallCount: number;
  nextRunAt: number | null;
  heartbeatAt: number | null;
  lastError: string | null;
  result: unknown;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface GoalBatch {
  id: string;
  goalId: string;
  seq: number;
  llmTaskId: string | null;
  status: string;
  prompt: unknown;
  checkpoint: unknown;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface GoalEvent {
  goalId: string;
  seq: number;
  type: string;
  payload: unknown;
  createdAt: number;
}

const ACTIVE_STATUSES: GoalStatus[] = [
  'queued', 'planning', 'running', 'verifying', 'needing_approval',
  'waiting_external', 'retry_wait', 'paused',
];

const TERMINAL_STATUSES: GoalStatus[] = ['completed', 'failed', 'cancelled', 'blocked'];

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function mapGoal(row: any): GoalRun {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    conversationId: String(row.conversation_id),
    agentId: row.agent_id ? String(row.agent_id) : null,
    platformId: row.platform_id ? String(row.platform_id) : null,
    modelId: row.model_id ? String(row.model_id) : null,
    status: row.status as GoalStatus,
    objective: String(row.objective || ''),
    criteria: parseJson<GoalCriterion[]>(row.criteria_json, []),
    constraints: parseJson<string[]>(row.constraints_json, []),
    approvalRequired: parseJson<string[]>(row.approval_policy_json, []),
    maxBatches: Number(row.max_batches) || 20,
    maxStallBatches: Number(row.max_stall_batches) || 3,
    currentBatch: Number(row.current_batch) || 0,
    stallCount: Number(row.stall_count) || 0,
    nextRunAt: row.next_run_at == null ? null : Number(row.next_run_at),
    heartbeatAt: row.heartbeat_at == null ? null : Number(row.heartbeat_at),
    lastError: row.last_error ? String(row.last_error) : null,
    result: parseJson<unknown>(row.result_json, null),
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
    completedAt: row.completed_at == null ? null : Number(row.completed_at),
  };
}

function mapBatch(row: any): GoalBatch {
  return {
    id: String(row.id),
    goalId: String(row.goal_id),
    seq: Number(row.seq) || 0,
    llmTaskId: row.llm_task_id ? String(row.llm_task_id) : null,
    status: String(row.status || 'queued'),
    prompt: parseJson<unknown>(row.prompt_json, {}),
    checkpoint: parseJson<unknown>(row.checkpoint_json, null),
    startedAt: row.started_at == null ? null : Number(row.started_at),
    finishedAt: row.finished_at == null ? null : Number(row.finished_at),
  };
}

function normalizeCriteria(criteria: GoalCriterion[] | undefined): GoalCriterion[] {
  if (!Array.isArray(criteria)) return [];
  return criteria
    .filter(item => item && typeof item.title === 'string' && item.title.trim())
    .map((item, index) => ({
      ...item,
      id: String(item.id || `criterion_${index + 1}`).slice(0, 120),
      title: item.title.trim().slice(0, 500),
      kind: String(item.kind || 'text').slice(0, 40),
    }))
    .slice(0, 30);
}

function normalizeStrings(value: string[] | undefined, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .map(item => item.slice(0, 500))
    .slice(0, limit);
}

export function createGoal(input: GoalCreateInput): GoalRun {
  const objective = String(input.objective || '').trim();
  if (!objective) throw new Error('目标不能为空');
  if (!input.userId || !input.conversationId) throw new Error('缺少用户或会话');

  const existing = getActiveGoalForConversation(input.conversationId);
  if (existing) throw new Error(`该会话已有活动目标：${existing.objective.slice(0, 80)}`);

  const id = `goal_${randomUUID()}`;
  const now = Date.now();
  const criteria = normalizeCriteria(input.criteria);
  try {
    db.prepare(`
      INSERT INTO goal_run (
        id, user_id, conversation_id, agent_id, platform_id, model_id, status,
        objective, criteria_json, constraints_json, approval_policy_json,
        max_batches, max_stall_batches, current_batch, stall_count,
        next_run_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
    `).run(
      id,
      input.userId,
      input.conversationId,
      input.agentId || null,
      input.platformId || null,
      input.modelId || null,
      objective.slice(0, 20_000),
      JSON.stringify(criteria),
      JSON.stringify(normalizeStrings(input.constraints, 50)),
      JSON.stringify(normalizeStrings(input.approvalRequired, 50)),
      clampInt(input.maxBatches, 20, 1, 200),
      clampInt(input.maxStallBatches, 3, 1, 20),
      now,
      now,
      now,
    );
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE')) {
      throw new Error('该会话已有活动目标');
    }
    throw error;
  }
  appendGoalEvent(id, 'goal.created', { objective, criteria });
  return getGoal(id)!;
}

export function getGoal(id: string): GoalRun | null {
  const row = db.prepare('SELECT * FROM goal_run WHERE id = ?').get(id);
  return row ? mapGoal(row) : null;
}

export function getActiveGoalForConversation(conversationId: string): GoalRun | null {
  const placeholders = ACTIVE_STATUSES.map(() => '?').join(',');
  const row = db.prepare(
    `SELECT * FROM goal_run WHERE conversation_id = ? AND status IN (${placeholders})
     ORDER BY created_at DESC LIMIT 1`,
  ).get(conversationId, ...ACTIVE_STATUSES);
  return row ? mapGoal(row) : null;
}

export function isGoalTerminal(status: GoalStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function transitionGoal(
  id: string,
  status: GoalStatus,
  patch: {
    lastError?: string | null;
    result?: unknown;
    stallCount?: number;
    currentBatch?: number;
    nextRunAt?: number | null;
    heartbeatAt?: number | null;
    leaseOwner?: string | null;
    leaseUntil?: number | null;
  } = {},
): GoalRun {
  const goal = getGoal(id);
  if (!goal) throw new Error('目标不存在');
  const now = Date.now();
  const sets = ['status = ?', 'updated_at = ?'];
  const values: any[] = [status, now];
  const add = (column: string, value: any) => {
    sets.push(`${column} = ?`);
    values.push(value);
  };
  if (patch.lastError !== undefined) add('last_error', patch.lastError);
  if (patch.result !== undefined) add('result_json', patch.result == null ? null : JSON.stringify(patch.result));
  if (patch.stallCount !== undefined) add('stall_count', Math.max(0, Math.floor(patch.stallCount)));
  if (patch.currentBatch !== undefined) add('current_batch', Math.max(0, Math.floor(patch.currentBatch)));
  if (patch.nextRunAt !== undefined) add('next_run_at', patch.nextRunAt);
  if (patch.heartbeatAt !== undefined) add('heartbeat_at', patch.heartbeatAt);
  if (patch.leaseOwner !== undefined) add('lease_owner', patch.leaseOwner);
  if (patch.leaseUntil !== undefined) add('lease_until', patch.leaseUntil);
  if (isGoalTerminal(status)) {
    add('completed_at', now);
    add('lease_owner', null);
    add('lease_until', null);
  }
  db.prepare(`UPDATE goal_run SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  return getGoal(id)!;
}

export function appendGoalEvent(goalId: string, type: string, payload: unknown = {}): GoalEvent {
  const row = db.prepare(
    'SELECT COALESCE(MAX(seq), 0) AS seq FROM goal_event WHERE goal_id = ?',
  ).get(goalId) as { seq?: number } | undefined;
  const seq = Number(row?.seq || 0) + 1;
  const now = Date.now();
  db.prepare(
    'INSERT INTO goal_event (goal_id, seq, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(goalId, seq, type, JSON.stringify(payload ?? {}), now);
  return { goalId, seq, type, payload, createdAt: now };
}

export function listGoalEvents(goalId: string): GoalEvent[] {
  return (db.prepare(
    'SELECT * FROM goal_event WHERE goal_id = ? ORDER BY seq ASC',
  ).all(goalId) as any[]).map(row => ({
    goalId: String(row.goal_id),
    seq: Number(row.seq),
    type: String(row.type),
    payload: parseJson<unknown>(row.payload_json, {}),
    createdAt: Number(row.created_at),
  }));
}

export function startGoalBatch(
  goalId: string,
  input: { llmTaskId?: string | null; prompt?: unknown } = {},
): GoalBatch {
  const goal = getGoal(goalId);
  if (!goal) throw new Error('目标不存在');
  const row = db.prepare(
    'SELECT COALESCE(MAX(seq), 0) AS seq FROM goal_batch WHERE goal_id = ?',
  ).get(goalId) as { seq?: number } | undefined;
  const seq = Number(row?.seq || 0) + 1;
  const id = `gobatch_${randomUUID()}`;
  const now = Date.now();
  db.prepare(`
    INSERT INTO goal_batch (id, goal_id, seq, llm_task_id, status, prompt_json, started_at)
    VALUES (?, ?, ?, ?, 'running', ?, ?)
  `).run(id, goalId, seq, input.llmTaskId || null, JSON.stringify(input.prompt ?? {}), now);
  transitionGoal(goalId, 'running', { currentBatch: seq, nextRunAt: null });
  appendGoalEvent(goalId, 'batch.started', { batchId: id, seq, llmTaskId: input.llmTaskId || null });
  return getGoalBatch(id)!;
}

export function getGoalBatch(id: string): GoalBatch | null {
  const row = db.prepare('SELECT * FROM goal_batch WHERE id = ?').get(id);
  return row ? mapBatch(row) : null;
}

export function listGoalBatches(goalId: string): GoalBatch[] {
  return (db.prepare(
    'SELECT * FROM goal_batch WHERE goal_id = ? ORDER BY seq ASC',
  ).all(goalId) as any[]).map(mapBatch);
}

export function attachGoalBatchTask(batchId: string, llmTaskId: string): void {
  db.prepare('UPDATE goal_batch SET llm_task_id = ? WHERE id = ?').run(llmTaskId, batchId);
}

export function finishGoalBatch(
  id: string,
  status: 'completed' | 'failed' | 'aborted' | 'unknown',
  checkpoint?: unknown,
): GoalBatch {
  const batch = getGoalBatch(id);
  if (!batch) throw new Error('目标批次不存在');
  const now = Date.now();
  db.prepare(
    'UPDATE goal_batch SET status = ?, checkpoint_json = ?, finished_at = ? WHERE id = ?',
  ).run(status, checkpoint === undefined ? null : JSON.stringify(checkpoint), now, id);
  appendGoalEvent(batch.goalId, `batch.${status}`, { batchId: id, seq: batch.seq, checkpoint });
  return getGoalBatch(id)!;
}

export function recoverInterruptedGoals(now = Date.now()): number {
  const active = db.prepare(
    `SELECT * FROM goal_run WHERE status IN ('planning','running','verifying')`,
  ).all() as any[];
  let recovered = 0;
  for (const row of active) {
    const goalId = String(row.id);
    db.prepare(
      "UPDATE goal_batch SET status = 'unknown', finished_at = ? WHERE goal_id = ? AND status = 'running'",
    ).run(now, goalId);
    db.prepare(`
      UPDATE goal_run
      SET status = 'queued', next_run_at = ?, lease_owner = NULL, lease_until = NULL,
          last_error = '服务重启，目标已重新排队', updated_at = ?
      WHERE id = ?
    `).run(now, now, goalId);
    appendGoalEvent(goalId, 'goal.recovered', { reason: 'service_restart' });
    recovered++;
  }
  return recovered;
}
