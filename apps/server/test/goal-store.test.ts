import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import {
  appendGoalEvent,
  createGoal,
  finishGoalBatch,
  getActiveGoalForConversation,
  getGoal,
  listGoalEvents,
  recoverInterruptedGoals,
  startGoalBatch,
  transitionGoal,
} from '../src/services/goal-store.js';

const USER = 'u_goal_store';
const CONV = 'conv_goal_store';

function seed(input: { conversationId?: string; objective?: string } = {}) {
  return createGoal({
    userId: USER,
    conversationId: input.conversationId || CONV,
    agentId: 'a_default_assistant',
    platformId: 'p_fake',
    modelId: 'm_fake',
    objective: input.objective || '完成目标模式测试',
    criteria: [{ id: 'c1', title: '产物存在', kind: 'text' }],
    constraints: ['不越界'],
    approvalRequired: ['对外发送'],
    maxBatches: 8,
    maxStallBatches: 3,
  });
}

beforeAll(() => {
  db.prepare(
    'INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run(USER, 'u_goal_store', '!test-no-login', 0);
  db.prepare(
    'INSERT OR IGNORE INTO conversation (id, user_id, title, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(CONV, USER, '目标模式测试会话', 'default', 0, 0);
});

describe('goal-store', () => {
  it('创建目标时持久化目标、验收标准与运行策略', () => {
    const goal = seed();
    expect(goal.id).toMatch(/^goal_/);
    expect(goal.status).toBe('queued');
    expect(goal.objective).toBe('完成目标模式测试');
    expect(goal.criteria[0].title).toBe('产物存在');
    expect(goal.maxBatches).toBe(8);
    expect(goal.maxStallBatches).toBe(3);
    expect(getGoal(goal.id)?.id).toBe(goal.id);
  });

  it('拒绝空目标与重复活动目标', () => {
    expect(() => createGoal({
      userId: USER,
      conversationId: CONV,
      objective: '   ',
      criteria: [],
    })).toThrow(/目标/);

    seed({ conversationId: 'conv_goal_duplicate', objective: '第一个活动目标' });
    expect(() => createGoal({
      userId: USER,
      conversationId: 'conv_goal_duplicate',
      objective: '第二个活动目标',
      criteria: [],
    })).toThrow(/活动目标/);
  });

  it('状态变更与事件追加保持可追踪', () => {
    const goal = seed({ conversationId: 'conv_goal_events', objective: '事件测试' });
    transitionGoal(goal.id, 'running', { lastError: null });
    appendGoalEvent(goal.id, 'goal.started', { by: 'test' });
    appendGoalEvent(goal.id, 'batch.started', { batch: 1 });

    expect(getGoal(goal.id)?.status).toBe('running');
    const events = listGoalEvents(goal.id);
    expect(events.map(e => e.seq)).toEqual([1, 2, 3]);
    expect(events[0].type).toBe('goal.created');
    expect(events[2].type).toBe('batch.started');
    expect(events[2].payload).toEqual({ batch: 1 });
  });

  it('批次开始与完成持久化任务关联，活动目标可回查', () => {
    const goal = seed({ conversationId: 'conv_goal_batch', objective: '批次测试' });
    const batch = startGoalBatch(goal.id, {
      llmTaskId: 'task_goal_batch',
      prompt: { kind: 'initial' },
    });
    expect(batch.seq).toBe(1);
    expect(batch.status).toBe('running');
    finishGoalBatch(batch.id, 'completed', { summary: '第一批完成' });

    const active = getActiveGoalForConversation('conv_goal_batch');
    expect(active?.id).toBe(goal.id);
    const row = db.prepare('SELECT status, checkpoint_json FROM goal_batch WHERE id = ?').get(batch.id) as any;
    expect(row.status).toBe('completed');
    expect(JSON.parse(row.checkpoint_json).summary).toBe('第一批完成');
  });

  it('重启恢复会把执行中的目标重新排队，并把批次标成 unknown', () => {
    const goal = seed({ conversationId: 'conv_goal_recovery', objective: '恢复测试' });
    transitionGoal(goal.id, 'running');
    const batch = startGoalBatch(goal.id, {
      llmTaskId: 'task_goal_recovery',
      prompt: { kind: 'initial' },
    });

    const count = recoverInterruptedGoals(Date.now());
    expect(count).toBeGreaterThanOrEqual(1);
    expect(getGoal(goal.id)?.status).toBe('queued');
    const row = db.prepare('SELECT status FROM goal_batch WHERE id = ?').get(batch.id) as any;
    expect(row.status).toBe('unknown');
  });
});
