import { createHash } from 'node:crypto';
import { db } from '../db.js';

export type GoalOperationStatus =
  | 'prepared'
  | 'executing'
  | 'executed'
  | 'verified'
  | 'failed'
  | 'unknown';

export interface GoalOperation {
  idempotencyKey: string;
  goalId: string;
  batchId: string | null;
  stepId: string | null;
  toolName: string;
  argsHash: string;
  args: unknown;
  status: GoalOperationStatus;
  externalRef: string | null;
  result: unknown;
  resolution: unknown;
  resolvedAt: number | null;
  resolvedBy: string | null;
  createdAt: number;
  updatedAt: number;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, stable(v)]),
  );
}

function parse(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function map(row: any): GoalOperation {
  return {
    idempotencyKey: String(row.idempotency_key),
    goalId: String(row.goal_id),
    batchId: row.batch_id ? String(row.batch_id) : null,
    stepId: row.step_id ? String(row.step_id) : null,
    toolName: String(row.tool_name),
    argsHash: String(row.args_hash),
    args: parse(row.args_json),
    status: row.status as GoalOperationStatus,
    externalRef: row.external_ref ? String(row.external_ref) : null,
    result: parse(row.result_json),
    resolution: parse(row.resolution_json),
    resolvedAt: row.resolved_at == null ? null : Number(row.resolved_at),
    resolvedBy: row.resolved_by ? String(row.resolved_by) : null,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  };
}

export function operationKey(
  goalId: string,
  batchId: string | null | undefined,
  toolName: string,
  args: unknown,
): string {
  const argsJson = JSON.stringify(stable(args ?? null));
  return createHash('sha256')
    .update(`${goalId}\n${batchId || ''}\n${toolName}\n${argsJson}`)
    .digest('hex');
}

export function beginGoalOperation(input: {
  goalId: string;
  batchId?: string | null;
  stepId?: string | null;
  toolName: string;
  args: unknown;
}): { operation: GoalOperation; reused: boolean } {
  const key = operationKey(input.goalId, input.batchId, input.toolName, input.args);
  const existing = getGoalOperation(key);
  if (existing) {
    return {
      operation: existing,
      reused: existing.status === 'executed' || existing.status === 'verified',
    };
  }
  const now = Date.now();
  const argsHash = key.slice(0, 24);
  db.prepare(`
    INSERT INTO goal_operation (
      idempotency_key, goal_id, batch_id, step_id, tool_name, args_hash,
      args_json, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'prepared', ?, ?)
  `).run(
    key,
    input.goalId,
    input.batchId || null,
    input.stepId || null,
    input.toolName,
    argsHash,
    JSON.stringify(input.args ?? null).slice(0, 256_000),
    now,
    now,
  );
  return { operation: getGoalOperation(key)!, reused: false };
}

export function getGoalOperation(key: string): GoalOperation | null {
  const row = db.prepare('SELECT * FROM goal_operation WHERE idempotency_key = ?').get(key);
  return row ? map(row) : null;
}

export function listGoalOperations(goalId: string): GoalOperation[] {
  return (db.prepare(
    'SELECT * FROM goal_operation WHERE goal_id = ? ORDER BY created_at ASC',
  ).all(goalId) as any[]).map(map);
}

export function markGoalOperationExecuting(key: string): void {
  db.prepare(
    "UPDATE goal_operation SET status = 'executing', updated_at = ? WHERE idempotency_key = ?",
  ).run(Date.now(), key);
}

export function finishGoalOperation(
  key: string,
  status: 'executed' | 'failed' | 'verified',
  result: unknown,
  externalRef?: string | null,
): void {
  db.prepare(`
    UPDATE goal_operation
    SET status = ?, result_json = ?, external_ref = ?, updated_at = ?
    WHERE idempotency_key = ?
  `).run(
    status,
    JSON.stringify(result ?? null).slice(0, 256_000),
    externalRef || null,
    Date.now(),
    key,
  );
}

export function markUncertainGoalOperations(goalId: string): number {
  const info = db.prepare(`
    UPDATE goal_operation
    SET status = 'unknown', updated_at = ?
    WHERE goal_id = ? AND status IN ('prepared','executing')
  `).run(Date.now(), goalId);
  return Number(info?.changes || 0);
}

export function listUnknownGoalOperations(goalId: string): GoalOperation[] {
  return (db.prepare(
    "SELECT * FROM goal_operation WHERE goal_id = ? AND status = 'unknown' ORDER BY created_at ASC",
  ).all(goalId) as any[]).map(map);
}

export function resolveGoalOperation(
  key: string,
  outcome: 'done' | 'not_done',
  note: string,
  by: string,
  externalRef?: string | null,
): GoalOperation {
  const operation = getGoalOperation(key);
  if (!operation) throw new Error('目标操作不存在');
  if (operation.status !== 'unknown') {
    throw new Error(`只有 unknown 操作需要人工核实，当前状态：${operation.status}`);
  }
  const now = Date.now();
  const resolution = {
    outcome,
    note: String(note || '').slice(0, 2_000),
    by: String(by || 'user').slice(0, 200),
    resolvedAt: now,
  };
  db.prepare(`
    UPDATE goal_operation
    SET status = ?, resolution_json = ?, resolved_at = ?, resolved_by = ?,
        external_ref = COALESCE(?, external_ref), updated_at = ?
    WHERE idempotency_key = ?
  `).run(
    outcome === 'done' ? 'verified' : 'failed',
    JSON.stringify(resolution),
    now,
    resolution.by,
    externalRef || null,
    now,
    key,
  );
  return getGoalOperation(key)!;
}
