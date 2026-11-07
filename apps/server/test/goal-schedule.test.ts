import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { getGoal } from '../src/services/goal-store.js';
import { findGoalTrigger } from '../src/services/goal-trigger.js';
import {
  createGoalSchedule,
  getGoalSchedule,
  listGoalSchedules,
  materializeGoalSchedule,
  tickDueGoalSchedules,
  updateGoalSchedule,
} from '../src/services/goal-schedule.js';

const USER = 'u_goal_schedule';
const CONV = 'conv_goal_schedule_source';

beforeAll(() => {
  db.prepare(
    'INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run(USER, 'u_goal_schedule', '!test-no-login', 0);
  db.prepare(
    'INSERT OR IGNORE INTO conversation (id, user_id, title, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(CONV, USER, '目标计划来源', 'default', 0, 0);
});

function createSchedule(name: string) {
  return createGoalSchedule({
    userId: USER,
    name,
    sourceConversationId: CONV,
    platformId: 'platform_schedule_test',
    modelId: 'model_schedule_test',
    objective: '每天核对经营数据并产出异常清单',
    criteria: [
      { id: 'report', title: '异常清单已生成', kind: 'file_exists', path: 'exceptions.md' },
    ],
    constraints: ['只读源数据'],
    approvalRequired: ['对外发送'],
    maxBatches: 14,
    maxStallBatches: 4,
    intervalMinutes: 60,
    enabled: true,
  });
}

describe('goal schedules', () => {
  it('persists the complete goal policy and clears nextRunAt while disabled', () => {
    const schedule = createSchedule('经营异常巡检');

    expect(schedule.id).toMatch(/^goalsched_/);
    expect(schedule.criteria[0].path).toBe('exceptions.md');
    expect(schedule.constraints).toEqual(['只读源数据']);
    expect(schedule.approvalRequired).toEqual(['对外发送']);
    expect(schedule.maxBatches).toBe(14);
    expect(schedule.nextRunAt).toBeGreaterThan(Date.now());
    expect(listGoalSchedules(USER).some((item) => item.id === schedule.id)).toBe(true);

    const disabled = updateGoalSchedule(schedule.id, USER, { enabled: false });
    expect(disabled.enabled).toBe(false);
    expect(disabled.nextRunAt).toBeNull();

    const enabled = updateGoalSchedule(schedule.id, USER, { enabled: true });
    expect(enabled.enabled).toBe(true);
    expect(enabled.nextRunAt).toBeGreaterThan(Date.now());
  });

  it('materializes one independent goal per occurrence and is idempotent for retries', () => {
    const schedule = createSchedule('周报自动生成');
    const scheduledFor = Date.now() - 1_000;
    db.prepare('UPDATE goal_schedule SET next_run_at = ? WHERE id = ?').run(scheduledFor, schedule.id);

    const result = materializeGoalSchedule(schedule.id, scheduledFor, { wake: false });
    expect(result.created).toBe(true);
    expect(result.run.status).toBe('created');
    expect(result.goalId).toBeTruthy();

    const goal = getGoal(result.goalId!)!;
    expect(goal.conversationId).not.toBe(CONV);
    expect(goal.objective).toBe(schedule.objective);
    expect(goal.criteria).toEqual(schedule.criteria);
    expect(goal.constraints).toEqual(['只读源数据']);
    expect(goal.approvalRequired).toEqual(['对外发送']);
    expect(goal.maxBatches).toBe(14);

    const conversation = db.prepare(
      'SELECT goal_schedule_id FROM conversation WHERE id = ?',
    ).get(goal.conversationId) as any;
    expect(conversation.goal_schedule_id).toBe(schedule.id);
    expect(findGoalTrigger(USER, 'goal-schedule', `scheduled:${schedule.id}:${scheduledFor}`)?.goalId).toBe(goal.id);

    const duplicate = materializeGoalSchedule(schedule.id, scheduledFor, { wake: false });
    expect(duplicate.created).toBe(false);
    expect(duplicate.goalId).toBe(goal.id);
    const runCount = db.prepare(
      'SELECT COUNT(*) AS c FROM goal_schedule_run WHERE schedule_id = ?',
    ).get(schedule.id) as any;
    expect(runCount.c).toBe(1);
  });

  it('catches up an overdue occurrence after restart without replaying the backlog', () => {
    const schedule = createSchedule('每日晨报');
    const overdueAt = Date.now() - 3 * 24 * 60 * 60 * 1000;
    db.prepare('UPDATE goal_schedule SET next_run_at = ? WHERE id = ?').run(overdueAt, schedule.id);

    const created = tickDueGoalSchedules(Date.now(), { wake: false });
    expect(created).toBeGreaterThanOrEqual(1);

    const updated = getGoalSchedule(schedule.id)!;
    expect(updated.lastGoalId).toBeTruthy();
    expect(updated.nextRunAt).toBeGreaterThan(Date.now());
    expect(updated.lastError).toBeNull();
  });
});
