import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRunbook, normalizeRunbookInput } from '../src/plugins/ops-runbook.js';
import { prepareUnattendedRunbook } from '../src/plugins/ops-runbook-schedule.js';

const startScheduledRunbookExecution = vi.hoisted(() => vi.fn());
vi.mock('../src/plugins/ops-shell.js', () => ({ startScheduledRunbookExecution }));

import { db } from '../src/db.js';
import { runScheduledTask } from '../src/services/scheduled-tasks.js';

let testUserId = '';

function runbook(productionCommand: string, rollbackCommand = '') {
  const normalized = normalizeRunbookInput({
    name: '巡检服务',
    connectionId: 'c1',
    parameters: [{ key: 'service', label: '服务', required: true, defaultValue: 'api' }],
    steps: [{ type: 'exec', name: '检查', command: productionCommand }],
    rollbackSteps: rollbackCommand
      ? [{ type: 'exec', name: '回滚', command: rollbackCommand }]
      : [],
  });
  expect(normalized.error).toBeUndefined();
  return buildRunbook(normalized.value!);
}

function insertScheduledTask(id = 'st-runbook') {
  const now = Date.now();
  db.prepare(`
    INSERT INTO scheduled_task
      (id, user_id, name, prompt, task_type, schedule_json, enabled, created_at, updated_at)
    VALUES (?, ?, ?, NULL, 'runbook', ?, 1, ?, ?)
  `).run(id, testUserId, '每日巡检', JSON.stringify({ mode: 'cycle', type: 'daily', time: '09:00' }), now, now);
  return {
    id,
    user_id: testUserId,
    name: '每日巡检',
    prompt: null,
    task_type: 'runbook',
    runbook_id: 'rb1',
    runbook_name: '巡检服务',
    runbook_version: 2,
    runbook_inputs_json: JSON.stringify({ service: 'api' }),
    schedule_json: JSON.stringify({ mode: 'cycle', type: 'daily', time: '09:00' }),
    enabled: 1,
    conversation_id: null,
  };
}

beforeEach(() => {
  startScheduledRunbookExecution.mockReset();
  db.exec('DELETE FROM message; DELETE FROM conversation; DELETE FROM scheduled_task;');
  const existing = db.prepare('SELECT id FROM user LIMIT 1').get() as any;
  if (existing?.id) {
    testUserId = existing.id;
  } else {
    testUserId = 'u_scheduled';
    db.prepare(
      'INSERT INTO user (id, username, email, password_hash, created_at) VALUES (?, ?, NULL, ?, ?)',
    ).run(testUserId, 'scheduled-test', 'x', Date.now());
  }
});

describe('Runbook 无人值守安全策略', () => {
  it('生产连接允许只读且无回滚的 Runbook，拒绝写命令和回滚步骤', () => {
    expect(prepareUnattendedRunbook(runbook('uptime'), true).error).toBeUndefined();
    expect(prepareUnattendedRunbook(runbook('systemctl restart nginx'), true).error).toContain('只读');
    expect(prepareUnattendedRunbook(runbook('uptime', 'systemctl restart nginx'), true).error).toContain('回滚');
  });

  it('非生产连接允许需要修复动作的 Runbook', () => {
    expect(prepareUnattendedRunbook(runbook('systemctl restart nginx'), false).error).toBeUndefined();
  });
});

describe('Runbook 调度接线', () => {
  it('服务端库、客户端 schema、模型工具和路由都声明 Runbook 调度字段', () => {
    const serverDb = readFileSync(resolve(__dirname, '../src/db.ts'), 'utf8');
    const coreSchema = readFileSync(resolve(__dirname, '../../../packages/core/src/db/schema.ts'), 'utf8');
    const tool = readFileSync(resolve(__dirname, '../src/mcp/api-tool-executor.ts'), 'utf8');
    const toolSchema = readFileSync(resolve(__dirname, '../../../packages/core/src/tool/builtin/api-tools/scheduled-task.ts'), 'utf8');
    const routes = readFileSync(resolve(__dirname, '../src/routes/scheduled-tasks.ts'), 'utf8');
    for (const source of [serverDb, coreSchema]) {
      expect(source).toContain('runbook_inputs_json');
      expect(source).toContain('runbook_version');
    }
    expect(tool).toContain("taskType === 'runbook'");
    expect(tool).toContain('prepareScheduledRunbookBinding');
    expect(tool).toContain('lastRunbookRun');
    expect(toolSchema).toContain("enum: ['chat', 'runbook']");
    expect(toolSchema).toContain('runbookInputs');
    expect(routes).toContain("isRunbookTask");
    expect(routes).toContain('prepareScheduledRunbookBinding');
    expect(routes).toContain('lastRunbookRun');
  });
});

describe('Runbook 定时执行', () => {
  it('启动固定版本的 Runbook，并把运行号写入会话', async () => {
    const task = insertScheduledTask();
    startScheduledRunbookExecution.mockResolvedValue({
      runId: 'run-scheduled-1',
      runbookName: '巡检服务',
      runbookVersion: 2,
    });

    const result = await runScheduledTask(task);

    expect(result.ok).toBe(true);
    expect(startScheduledRunbookExecution).toHaveBeenCalledWith({
      userId: testUserId,
      scheduledTaskId: 'st-runbook',
      runbookId: 'rb1',
      runbookVersion: 2,
      inputParams: { service: 'api' },
    });
    const message = db.prepare('SELECT content FROM message WHERE conversation_id = ?').get(result.conversationId) as any;
    expect(message.content).toContain('run-scheduled-1');
    expect(message.content).toContain('v2');
  });

  it('启动失败时落失败消息，不假装执行成功', async () => {
    const task = insertScheduledTask('st-runbook-fail');
    startScheduledRunbookExecution.mockRejectedValue(new Error('该 Runbook 已停用'));

    const result = await runScheduledTask(task);

    expect(result).toMatchObject({ ok: false, error: '该 Runbook 已停用' });
    const message = db.prepare('SELECT content FROM message WHERE conversation_id = ?').get(result.conversationId) as any;
    expect(message.content).toContain('定时任务执行失败');
    expect(message.content).toContain('已停用');
  });
});
