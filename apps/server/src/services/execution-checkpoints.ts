import { randomUUID } from 'node:crypto';
import type { ExecutionReceipt } from '@yan-zhi/shared';
import { db } from '../db.js';

export interface ExecutionCheckpointRow {
  id: string;
  conversationId: string;
  taskId: string;
  step: number | null;
  target: string;
  action: string;
  ok: boolean;
  beforeRevision: string | null;
  afterRevision: string | null;
  changed: boolean | null;
  receipt: ExecutionReceipt | null;
  createdAt: number;
}

export function recordExecutionCheckpoint(input: {
  userId: string;
  conversationId: string;
  taskId: string;
  step?: number | null;
  receipt: ExecutionReceipt;
}): string {
  const id = `execck_${randomUUID()}`;
  db.prepare(`
    INSERT INTO execution_checkpoint (
      id, user_id, conversation_id, task_id, step, target, action, ok,
      before_revision, after_revision, changed, receipt_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.userId,
    input.conversationId,
    input.taskId,
    input.step ?? null,
    input.receipt.target,
    input.receipt.action,
    input.receipt.ok ? 1 : 0,
    input.receipt.beforeRevision || null,
    input.receipt.afterRevision || null,
    input.receipt.changed === undefined ? null : input.receipt.changed ? 1 : 0,
    JSON.stringify(input.receipt),
    input.receipt.finishedAt || Date.now(),
  );
  return id;
}

export function listExecutionCheckpoints(userId: string, taskId: string): ExecutionCheckpointRow[] {
  const rows = db.prepare(`
    SELECT * FROM execution_checkpoint
    WHERE user_id = ? AND task_id = ?
    ORDER BY created_at ASC
  `).all(userId, taskId) as any[];
  return rows.map((row) => ({
    id: String(row.id),
    conversationId: String(row.conversation_id),
    taskId: String(row.task_id),
    step: row.step == null ? null : Number(row.step),
    target: String(row.target || ''),
    action: String(row.action || ''),
    ok: Number(row.ok) === 1,
    beforeRevision: row.before_revision ? String(row.before_revision) : null,
    afterRevision: row.after_revision ? String(row.after_revision) : null,
    changed: row.changed == null ? null : Number(row.changed) === 1,
    receipt: (() => {
      try { return JSON.parse(String(row.receipt_json || 'null')) as ExecutionReceipt; } catch { return null; }
    })(),
    createdAt: Number(row.created_at) || 0,
  }));
}
