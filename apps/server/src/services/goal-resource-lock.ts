import { createHash } from 'node:crypto';
import path from 'node:path';
import { db } from '../db.js';

export interface GoalResourceLock {
  resourceKey: string;
  goalId: string;
  kind: string;
  label: string;
  createdAt: number;
  heartbeatAt: number;
}

export interface GoalResourceAcquireResult {
  acquired: boolean;
  resourceKey: string;
  holder?: GoalResourceLock;
}

function normalizeResource(kind: string, resource: string): string {
  if (kind === 'workspace') {
    const resolved = path.resolve(resource).replace(/[\\/]+$/, '');
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }
  return String(resource || '').trim();
}

function map(row: any): GoalResourceLock {
  return {
    resourceKey: String(row.resource_key),
    goalId: String(row.goal_id),
    kind: String(row.kind),
    label: String(row.label || ''),
    createdAt: Number(row.created_at) || 0,
    heartbeatAt: Number(row.heartbeat_at) || 0,
  };
}

export function acquireGoalResource(
  goalId: string,
  kind: string,
  resource: string,
  label = resource,
): GoalResourceAcquireResult {
  const normalized = normalizeResource(kind, resource);
  if (!normalized) throw new Error('资源标识不能为空');
  const resourceKey = createHash('sha256').update(`${kind}\n${normalized}`).digest('hex');
  const now = Date.now();
  db.prepare(`
    INSERT OR IGNORE INTO goal_resource_lock
      (resource_key, goal_id, kind, label, created_at, heartbeat_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(resourceKey, goalId, kind, String(label || normalized).slice(0, 1_000), now, now);

  const row = db.prepare('SELECT * FROM goal_resource_lock WHERE resource_key = ?').get(resourceKey);
  const holder = row ? map(row) : undefined;
  if (holder?.goalId === goalId) {
    db.prepare('UPDATE goal_resource_lock SET heartbeat_at = ? WHERE resource_key = ?').run(now, resourceKey);
    return { acquired: true, resourceKey, holder: { ...holder, heartbeatAt: now } };
  }
  return { acquired: false, resourceKey, holder };
}

export function getGoalResourceLock(goalId: string): GoalResourceLock | null {
  const row = db.prepare(
    'SELECT * FROM goal_resource_lock WHERE goal_id = ? ORDER BY created_at DESC LIMIT 1',
  ).get(goalId);
  return row ? map(row) : null;
}

export function listGoalResourceLocks(goalId: string): GoalResourceLock[] {
  return (db.prepare(
    'SELECT * FROM goal_resource_lock WHERE goal_id = ? ORDER BY created_at ASC',
  ).all(goalId) as any[]).map(map);
}

export function releaseGoalResourceLocks(goalId: string): number {
  const info = db.prepare('DELETE FROM goal_resource_lock WHERE goal_id = ?').run(goalId);
  return Number(info?.changes || 0);
}
