import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db.js';
import {
  acquireGoalResource,
  getGoalResourceLock,
  releaseGoalResourceLocks,
} from '../src/services/goal-resource-lock.js';
import { createGoal, getGoal } from '../src/services/goal-store.js';
import { runGoalOnce, type GoalRunnerDeps } from '../src/services/goal-runner.js';

const USER = 'u_goal_lock';
const SPACE = 'space_goal_lock';
const CONV_A = 'conv_goal_lock_a';
const CONV_B = 'conv_goal_lock_b';
let workspace = '';

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), 'yz-goal-lock-'));
  db.prepare(
    'INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run(USER, 'u_goal_lock', '!test-no-login', 0);
  db.prepare(
    'INSERT OR REPLACE INTO space (id, user_id, name, dir_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(SPACE, USER, '目标锁测试空间', workspace, 0, 0);
  for (const conv of [CONV_A, CONV_B]) {
    db.prepare(
      'INSERT OR REPLACE INTO conversation (id, user_id, title, space_id, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(conv, USER, conv, SPACE, 'default', 0, 0);
  }
});

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function goal(conversationId: string, objective: string) {
  return createGoal({
    userId: USER,
    conversationId,
    objective,
    criteria: [{ id: 'c', title: '通过', kind: 'text' }],
    maxBatches: 4,
    maxStallBatches: 2,
  });
}

function deps(over: Partial<GoalRunnerDeps> = {}): GoalRunnerDeps {
  return {
    launchBatch: vi.fn(async () => ({ taskId: 'task_goal_lock', status: 'completed' as const, summary: '完成' })),
    verify: vi.fn(async () => ({ passed: true, summary: '通过', unmet: [] })),
    notify: vi.fn(),
    ...over,
  };
}

describe('goal resource locks', () => {
  it('同一工作目录只允许一个目标持有，同目标重入成功', () => {
    const a = acquireGoalResource('goal_lock_a', 'workspace', workspace, workspace);
    expect(a.acquired).toBe(true);
    expect(a.resourceKey).toBeTruthy();

    const same = acquireGoalResource('goal_lock_a', 'workspace', workspace, workspace);
    expect(same.acquired).toBe(true);
    expect(same.resourceKey).toBe(a.resourceKey);

    const conflict = acquireGoalResource('goal_lock_b', 'workspace', workspace, workspace);
    expect(conflict.acquired).toBe(false);
    expect(conflict.holder?.goalId).toBe('goal_lock_a');

    expect(releaseGoalResourceLocks('goal_lock_a')).toBe(1);
    expect(getGoalResourceLock('goal_lock_a')).toBeNull();
  });

  it('两个目标争用同一空间时，后一个进入 retry_wait 且不启动批次', async () => {
    const goalA = goal(CONV_A, '目标 A');
    const goalB = goal(CONV_B, '目标 B');
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });

    const launchA = vi.fn(async () => {
      started();
      await gate;
      return { taskId: 'task_a', status: 'completed' as const, summary: 'A 完成' };
    });
    const runningA = runGoalOnce(goalA.id, deps({ launchBatch: launchA }));
    await entered;

    const launchB = vi.fn(deps().launchBatch);
    const resultB = await runGoalOnce(goalB.id, deps({ launchBatch: launchB }));
    expect(resultB.status).toBe('retry_wait');
    expect(resultB.lastError).toContain('工作目录');
    expect(launchB).not.toHaveBeenCalled();

    release();
    expect((await runningA).status).toBe('completed');
    expect(getGoalResourceLock(goalA.id)).toBeNull();

    const retryB = await runGoalOnce(goalB.id, deps({ launchBatch: launchB }));
    expect(retryB.status).toBe('completed');
    expect(launchB).toHaveBeenCalledTimes(1);
    expect(getGoal(goalB.id)?.status).toBe('completed');
  });
});
