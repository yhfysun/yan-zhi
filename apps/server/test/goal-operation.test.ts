import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import {
  beginGoalOperation,
  finishGoalOperation,
  getGoalOperation,
  listGoalOperations,
  markGoalOperationExecuting,
  markUncertainGoalOperations,
  operationKey,
  resolveGoalOperation,
} from '../src/services/goal-operation.js';

beforeAll(() => {
  db.prepare(
    'INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run('u_goal_op', 'u_goal_op', '!test-no-login', 0);
});

describe('goal operation ledger', () => {
  it('同一目标批次、工具与参数生成稳定幂等键，参数顺序不影响结果', () => {
    const a = operationKey('goal_1', 'batch_1', 'file_write', { path: 'a.txt', content: 'x' });
    const b = operationKey('goal_1', 'batch_1', 'file_write', { content: 'x', path: 'a.txt' });
    const c = operationKey('goal_1', 'batch_1', 'file_write', { path: 'b.txt', content: 'x' });
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it('记录 prepared → executing → executed，并保留结果供同批重试复用', () => {
    const key = operationKey('goal_2', 'batch_2', 'browser_click', { selector: '#submit' });
    const begun = beginGoalOperation({
      goalId: 'goal_2',
      batchId: 'batch_2',
      toolName: 'browser_click',
      args: { selector: '#submit' },
    });
    expect(begun.reused).toBe(false);
    expect(getGoalOperation(key)?.status).toBe('prepared');

    markGoalOperationExecuting(key);
    expect(getGoalOperation(key)?.status).toBe('executing');
    finishGoalOperation(key, 'executed', { ok: true, message: 'clicked' });
    expect(getGoalOperation(key)?.status).toBe('executed');
    expect(getGoalOperation(key)?.result).toMatchObject({ ok: true });

    const again = beginGoalOperation({
      goalId: 'goal_2',
      batchId: 'batch_2',
      toolName: 'browser_click',
      args: { selector: '#submit' },
    });
    expect(again.reused).toBe(true);
    expect(again.operation.result).toMatchObject({ ok: true });
  });

  it('重启恢复把执行中的操作标为 unknown，而不是假装成功', () => {
    const key = operationKey('goal_3', 'batch_3', 'browser_click', { selector: '#pay' });
    beginGoalOperation({
      goalId: 'goal_3',
      batchId: 'batch_3',
      toolName: 'browser_click',
      args: { selector: '#pay' },
    });
    markGoalOperationExecuting(key);

    expect(markUncertainGoalOperations('goal_3')).toBe(1);
    expect(getGoalOperation(key)?.status).toBe('unknown');
    expect(listGoalOperations('goal_3')[0].status).toBe('unknown');
  });

  it('工具执行与启动恢复都已接线，避免账本成为死代码', () => {
    const repo = resolve(__dirname, '..', '..', '..');
    const taskManager = readFileSync(resolve(repo, 'apps/server/src/llm-task-manager.ts'), 'utf8');
    const goalStore = readFileSync(resolve(repo, 'apps/server/src/services/goal-store.ts'), 'utf8');
    expect(taskManager).toContain('beginGoalOperation(');
    expect(taskManager).toContain('finishGoalOperation(');
    expect(goalStore).toContain('markUncertainGoalOperations(');
  });

  it('人工核实 unknown 操作后落定 verified 或 failed', () => {
    const doneKey = operationKey('goal_4', 'batch_4', 'browser_click', { selector: '#done' });
    beginGoalOperation({
      goalId: 'goal_4',
      batchId: 'batch_4',
      toolName: 'browser_click',
      args: { selector: '#done' },
    });
    markGoalOperationExecuting(doneKey);
    markUncertainGoalOperations('goal_4');
    const done = resolveGoalOperation(doneKey, 'done', '外部订单已存在', 'user_1');
    expect(done.status).toBe('verified');
    expect(done.resolution).toMatchObject({ outcome: 'done', note: '外部订单已存在', by: 'user_1' });

    const retryKey = operationKey('goal_4', 'batch_4', 'browser_click', { selector: '#retry' });
    beginGoalOperation({
      goalId: 'goal_4',
      batchId: 'batch_4',
      toolName: 'browser_click',
      args: { selector: '#retry' },
    });
    markGoalOperationExecuting(retryKey);
    markUncertainGoalOperations('goal_4');
    const retry = resolveGoalOperation(retryKey, 'not_done', '页面没有提交成功', 'user_1');
    expect(retry.status).toBe('failed');
    expect(retry.resolution).toMatchObject({ outcome: 'not_done' });
  });
});
