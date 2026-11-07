import { beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db.js';
import { createGoal, getGoal, listGoalBatches, listGoalEvents } from '../src/services/goal-store.js';
import { runGoalOnce, type GoalRunnerDeps } from '../src/services/goal-runner.js';
import {
  beginGoalOperation,
  markGoalOperationExecuting,
  markUncertainGoalOperations,
  operationKey,
} from '../src/services/goal-operation.js';

const USER = 'u_goal_runner';

beforeAll(() => {
  db.prepare(
    'INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run(USER, 'u_goal_runner', '!test-no-login', 0);
  for (const conv of ['conv_goal_pass', 'conv_goal_approval', 'conv_goal_retry', 'conv_goal_block']) {
    db.prepare(
      'INSERT OR IGNORE INTO conversation (id, user_id, title, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(conv, USER, conv, 'default', 0, 0);
  }
});

function goalFor(conversationId: string, over: Record<string, unknown> = {}) {
  return createGoal({
    userId: USER,
    conversationId,
    objective: '按验收标准完成目标',
    criteria: [{ id: 'c1', title: '验收通过', kind: 'text' }],
    maxBatches: 6,
    maxStallBatches: 2,
    ...over,
  });
}

function deps(over: Partial<GoalRunnerDeps>): GoalRunnerDeps {
  return {
    launchBatch: vi.fn(async () => ({
      taskId: 'task_fake_goal',
      status: 'completed' as const,
      summary: '批次完成',
    })),
    verify: vi.fn(async () => ({ passed: true, summary: '验收通过', unmet: [] })),
    notify: vi.fn(),
    ...over,
  };
}

describe('goal-runner', () => {
  it('验收通过后目标完成，批次和事件都有记录', async () => {
    const goal = goalFor('conv_goal_pass');
    const result = await runGoalOnce(goal.id, deps({}));

    expect(result.status).toBe('completed');
    expect(result.result).toMatchObject({ summary: '验收通过' });
    const batches = listGoalBatches(goal.id);
    expect(batches).toHaveLength(1);
    expect(batches[0].status).toBe('completed');
    expect(batches[0].llmTaskId).toBe('task_fake_goal');
    expect(listGoalEvents(goal.id).some(e => e.type === 'verification.passed')).toBe(true);
  });

  it('没有可自动验收的结论时进入人工审批态', async () => {
    const goal = goalFor('conv_goal_approval');
    const result = await runGoalOnce(goal.id, deps({
      verify: async () => ({
        passed: false,
        needsApproval: true,
        summary: '需要人工确认',
        unmet: ['人工确认'],
      }),
    }));

    expect(result.status).toBe('needing_approval');
    expect(result.result).toMatchObject({ summary: '需要人工确认' });
    expect(listGoalEvents(goal.id).some(e => e.type === 'approval.requested')).toBe(true);
  });

  it('验收失败会累计停滞并进入持久化重试，不直接标记完成', async () => {
    const goal = goalFor('conv_goal_retry');
    const result = await runGoalOnce(goal.id, deps({
      verify: async () => ({
        passed: false,
        summary: '构建未通过',
        unmet: ['pnpm build 失败'],
      }),
    }));

    expect(result.status).toBe('retry_wait');
    expect(result.stallCount).toBe(1);
    expect(result.nextRunAt).toBeGreaterThan(Date.now());
    expect(result.lastError).toContain('pnpm build');
  });

  it('连续停滞达到上限后阻塞，不再无限消耗', async () => {
    const goal = goalFor('conv_goal_block', { maxStallBatches: 1 });
    const result = await runGoalOnce(goal.id, deps({
      verify: async () => ({
        passed: false,
        summary: '仍然没有进展',
        unmet: ['同一检查连续失败'],
      }),
    }));

    expect(result.status).toBe('blocked');
    expect(getGoal(goal.id)?.status).toBe('blocked');
    expect(listGoalEvents(goal.id).some(e => e.type === 'goal.blocked')).toBe(true);
  });

  it('存在结果不明的副作用时先停批等人工核实，不继续执行', async () => {
    const conv = 'conv_goal_unknown_op';
    db.prepare(
      'INSERT OR IGNORE INTO conversation (id, user_id, title, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(conv, USER, conv, 'default', 0, 0);
    const goal = goalFor(conv);
    const key = operationKey(goal.id, 'batch_unknown', 'browser_click', { selector: '#pay' });
    beginGoalOperation({
      goalId: goal.id,
      batchId: 'batch_unknown',
      toolName: 'browser_click',
      args: { selector: '#pay' },
    });
    markGoalOperationExecuting(key);
    markUncertainGoalOperations(goal.id);

    const launch = vi.fn(deps().launchBatch);
    const result = await runGoalOnce(goal.id, deps({ launchBatch: launch }));
    expect(result.status).toBe('needing_approval');
    expect((result.result as any)?.kind).toBe('operation_reconcile');
    expect(launch).not.toHaveBeenCalled();
  });
});
