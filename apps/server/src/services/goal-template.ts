import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { getGoal, type GoalCriterion } from './goal-store.js';

export interface GoalTemplate {
  id: string;
  userId: string;
  name: string;
  objective: string;
  criteria: GoalCriterion[];
  constraints: string[];
  approvalRequired: string[];
  maxBatches: number;
  maxStallBatches: number;
  createdAt: number;
  updatedAt: number;
}

const parse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

function map(row: any): GoalTemplate {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    objective: String(row.objective),
    criteria: parse<GoalCriterion[]>(row.criteria_json, []),
    constraints: parse<string[]>(row.constraints_json, []),
    approvalRequired: parse<string[]>(row.approval_policy_json, []),
    maxBatches: Number(row.max_batches) || 20,
    maxStallBatches: Number(row.max_stall_batches) || 3,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  };
}

export function createGoalTemplate(goalId: string, userId: string, nameInput: string): GoalTemplate {
  const goal = getGoal(goalId);
  if (!goal || goal.userId !== userId) throw new Error('目标不存在或不属于当前用户');
  const name = String(nameInput || '').trim().slice(0, 120);
  if (!name) throw new Error('模板名称不能为空');
  const id = `goaltpl_${randomUUID()}`;
  const now = Date.now();
  try {
    db.prepare(`
      INSERT INTO goal_template (
        id, user_id, name, objective, criteria_json, constraints_json,
        approval_policy_json, max_batches, max_stall_batches, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      name,
      goal.objective,
      JSON.stringify(goal.criteria),
      JSON.stringify(goal.constraints),
      JSON.stringify(goal.approvalRequired),
      goal.maxBatches,
      goal.maxStallBatches,
      now,
      now,
    );
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE')) throw new Error(`模板名称已存在：${name}`);
    throw error;
  }
  return getGoalTemplate(id)!;
}

export function getGoalTemplate(id: string): GoalTemplate | null {
  const row = db.prepare('SELECT * FROM goal_template WHERE id = ?').get(id);
  return row ? map(row) : null;
}

export function listGoalTemplates(userId: string): GoalTemplate[] {
  return (db.prepare(
    'SELECT * FROM goal_template WHERE user_id = ? ORDER BY updated_at DESC, rowid DESC',
  ).all(userId) as any[]).map(map);
}

export function deleteGoalTemplate(id: string, userId: string): boolean {
  const info = db.prepare('DELETE FROM goal_template WHERE id = ? AND user_id = ?').run(id, userId);
  return Number(info?.changes || 0) > 0;
}
