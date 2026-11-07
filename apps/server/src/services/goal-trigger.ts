import { randomUUID } from 'node:crypto';
import { db } from '../db.js';

export interface GoalTriggerEvent {
  id: string;
  userId: string;
  source: string;
  eventId: string;
  goalId: string;
  payload: unknown;
  createdAt: number;
}

const parse = (value: unknown): unknown => {
  if (typeof value !== 'string' || !value) return {};
  try { return JSON.parse(value); } catch { return {}; }
};

function map(row: any): GoalTriggerEvent {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    source: String(row.source),
    eventId: String(row.event_id),
    goalId: String(row.goal_id),
    payload: parse(row.payload_json),
    createdAt: Number(row.created_at) || 0,
  };
}

export function findGoalTrigger(userId: string, source: string, eventId: string): GoalTriggerEvent | null {
  const row = db.prepare(
    'SELECT * FROM goal_trigger_event WHERE user_id = ? AND source = ? AND event_id = ?',
  ).get(userId, source, eventId);
  return row ? map(row) : null;
}

export function saveGoalTrigger(input: {
  userId: string;
  source: string;
  eventId: string;
  goalId: string;
  payload?: unknown;
}): GoalTriggerEvent {
  const id = `goaltrigger_${randomUUID()}`;
  try {
    db.prepare(`
      INSERT INTO goal_trigger_event
        (id, user_id, source, event_id, goal_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.userId,
      input.source.slice(0, 120),
      input.eventId.slice(0, 300),
      input.goalId,
      JSON.stringify(input.payload ?? {}).slice(0, 256_000),
      Date.now(),
    );
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE')) {
      throw new Error('这个来源事件已处理过');
    }
    throw error;
  }
  return findGoalTrigger(input.userId, input.source, input.eventId)!;
}

export function listGoalTriggers(userId: string, limit = 100): GoalTriggerEvent[] {
  return (db.prepare(
    'SELECT * FROM goal_trigger_event WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
  ).all(userId, Math.max(1, Math.min(500, Math.floor(limit)))) as any[]).map(map);
}
