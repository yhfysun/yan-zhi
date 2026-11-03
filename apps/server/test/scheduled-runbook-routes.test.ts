import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (value: string) => `ENC:${value}`,
  decrypt: (value: string) => String(value).replace(/^ENC:/, ''),
}));
vi.mock('ssh2', async () => {
  const { EventEmitter } = await import('node:events');
  class FakeClient {
    handlers: Record<string, Array<(...args: any[]) => void>> = {};
    on(event: string, callback: (...args: any[]) => void) {
      (this.handlers[event] ||= []).push(callback);
      return this;
    }
    once(event: string, callback: (...args: any[]) => void) { return this.on(event, callback); }
    emit(event: string, ...args: any[]) {
      for (const callback of this.handlers[event] || []) callback(...args);
      return this;
    }
    connect() { queueMicrotask(() => this.emit('ready')); return this; }
    exec(_command: string, callback: (error: Error | null, channel: any) => void) {
      const channel: any = new EventEmitter();
      channel.stderr = new EventEmitter();
      channel.close = () => {};
      channel.setWindow = () => {};
      queueMicrotask(() => {
        channel.emit('data', Buffer.from('ok\n'));
        channel.emit('close', 0);
      });
      callback(null, channel);
    }
    end() { this.emit('close'); }
  }
  return { Client: FakeClient };
});

import scheduledTaskRoutes from '../src/routes/scheduled-tasks.js';
import {
  latestScheduledRunbookRun,
  opsShellModule,
  prepareScheduledRunbookBinding,
  startScheduledRunbookExecution,
} from '../src/plugins/ops-shell.js';
import { createOpsRunbookStore } from '../src/plugins/ops-runbook-store.js';
import { buildRunbook, normalizeRunbookInput } from '../src/plugins/ops-runbook.js';
import { refreshScheduledTaskScheduler } from '../src/services/scheduled-tasks.js';
import { db } from '../src/db.js';

function makeStorage(connections: any[]) {
  const data = new Map<string, unknown>([['connections', connections]]);
  return {
    get: async (key: string) => data.get(key),
    set: async (key: string, value: unknown) => {
      data.set(key, value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
    },
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { res.statusCode = code; return res; },
    json(body: unknown) { res.body = body; return res; },
  };
  return res;
}

function handler(method: 'post' | 'patch', path: string) {
  const route = (scheduledTaskRoutes as any).stack.find(
    (layer: any) => layer.route?.path === path && layer.route.methods[method],
  );
  if (!route) throw new Error(`缺少路由 ${method.toUpperCase()} ${path}`);
  return route.route.stack.at(-1).handle as (req: unknown, res: unknown) => Promise<void>;
}

async function call(method: 'post' | 'patch', path: string, body: Record<string, unknown>, params = {}) {
  const res = mockRes();
  await handler(method, path)({ body, params, query: {}, user: { userId: 'guest' } }, res);
  return res;
}

function runbook(connectionId: string, command: string) {
  const normalized = normalizeRunbookInput({
    name: connectionId === 'c2' ? '生产修复' : '日常巡检',
    connectionId,
    parameters: [{ key: 'service', label: '服务', required: true, defaultValue: 'api' }],
    steps: [{ type: 'exec', name: '执行', command }],
  });
  expect(normalized.error).toBeUndefined();
  return buildRunbook(normalized.value!);
}

let active = false;

beforeEach(async () => {
  const store = createOpsRunbookStore(db);
  store.ensureSchema();
  db.exec('DELETE FROM scheduled_task; DELETE FROM message; DELETE FROM conversation; DELETE FROM ops_runbook_version; DELETE FROM ops_runbook;');
  const user = db.prepare('SELECT id FROM user LIMIT 1').get() as any;
  if (!user?.id) {
    db.prepare('INSERT INTO user (id, username, email, password_hash, created_at) VALUES (?, ?, NULL, ?, ?)')
      .run('guest', 'guest', 'x', Date.now());
  }
  await opsShellModule.activate({
    id: 'ops-shell', log: () => {}, adapter: {}, config: {},
    storage: makeStorage([
      {
        id: 'c1', type: 'ssh', name: 'test-web', host: '10.0.0.8', port: 22,
        username: 'deploy', authType: 'key', secretEnc: 'ENC:secret', tag: '测试', createdAt: 1,
      },
      {
        id: 'c2', type: 'ssh', name: 'prod-web', host: '10.0.0.9', port: 22,
        username: 'deploy', authType: 'key', secretEnc: 'ENC:secret', tag: '生产', createdAt: 1,
      },
    ]),
    registerTool: () => ({ dispose: () => {} }),
    registerBackendRoute: () => ({ dispose: () => {} }),
    registerWebSocket: () => ({ dispose: () => {} }),
    emit: () => {},
    on: () => ({ dispose: () => {} }),
  } as never);
  active = true;
  store.save(runbook('c1', 'uptime'));
  store.save(runbook('c2', 'systemctl restart nginx'));
});

afterEach(async () => {
  if (active) await opsShellModule.deactivate();
  active = false;
  db.exec('DELETE FROM scheduled_task;');
  refreshScheduledTaskScheduler();
});

describe('Scheduled task Runbook routes', () => {
  it('创建时固定 Runbook 版本并保存默认参数', async () => {
    const list = db.prepare('SELECT id, version FROM ops_runbook ORDER BY connection_id').all() as any[];
    const rb = list.find((item) => item.id && item.version);
    expect(rb).toBeTruthy();
    const created = await call('post', '/', {
      name: '每日巡检',
      taskType: 'runbook',
      runbookId: rb.id,
      runbookVersion: rb.version,
      runbookInputs: {},
      schedule: { mode: 'cycle', type: 'daily', time: '09:00' },
    });
    expect(created.statusCode).toBe(200);
    expect((created.body as any).data).toMatchObject({
      taskType: 'runbook',
      runbookId: rb.id,
      runbookVersion: rb.version,
      runbookInputs: { service: 'api' },
    });
  });

  it('生产写入需显式长期授权，授权后固定指纹落库', async () => {
    const produced = db.prepare("SELECT id, version FROM ops_runbook WHERE connection_id = 'c2'").get() as any;
    const denied = await call('post', '/', {
      name: '生产重启',
      taskType: 'runbook',
      runbookId: produced.id,
      runbookVersion: produced.version,
      schedule: { mode: 'cycle', type: 'daily', time: '09:00' },
    });
    expect(denied.statusCode).toBe(428);
    expect(denied.body as any).toMatchObject({
      requiresStandingApproval: true,
      approvalFingerprint: expect.any(String),
    });

    const created = await call('post', '/', {
      name: '生产重启',
      taskType: 'runbook',
      runbookId: produced.id,
      runbookVersion: produced.version,
      approveProductionWrite: true,
      schedule: { mode: 'cycle', type: 'daily', time: '09:00' },
    });
    expect(created.statusCode).toBe(200);
    expect((created.body as any).data).toMatchObject({
      runbookApprovalRequired: true,
      runbookApproval: {
        approvedBy: 'guest',
        fingerprint: expect.any(String),
      },
    });
  });

  it('编辑已有对话任务可切换为 Runbook 调度', async () => {
    const user = db.prepare('SELECT id FROM user LIMIT 1').get() as any;
    const now = Date.now();
    db.prepare(`
      INSERT INTO scheduled_task
        (id, user_id, name, prompt, task_type, schedule_json, enabled, created_at, updated_at)
      VALUES ('st-chat', ?, '原对话任务', 'say hi', 'chat', ?, 1, ?, ?)
    `).run(user.id, JSON.stringify({ mode: 'cycle', type: 'daily', time: '09:00' }), now, now);
    const rb = db.prepare("SELECT id, version FROM ops_runbook WHERE connection_id = 'c1'").get() as any;

    const updated = await call('patch', '/:id', {
      taskType: 'runbook',
      runbookId: rb.id,
      runbookVersion: rb.version,
      runbookInputs: { service: 'worker' },
    }, { id: 'st-chat' });
    expect(updated.statusCode).toBe(200);
    expect((updated.body as any).data).toMatchObject({
      taskType: 'runbook',
      runbookId: rb.id,
      runbookVersion: rb.version,
      runbookInputs: { service: 'worker' },
    });
  });

  it('到点执行时记录 scheduledTaskId 并跑完固定版本', async () => {
    const rb = db.prepare("SELECT id, version FROM ops_runbook WHERE connection_id = 'c1'").get() as any;
    const started = await startScheduledRunbookExecution({
      userId: 'guest',
      scheduledTaskId: 'st-run',
      runbookId: rb.id,
      runbookVersion: rb.version,
      inputParams: { service: 'api' },
    });
    expect(started.runId).toContain('run-');
    const store = createOpsRunbookStore(db);
    let run = store.getRun(started.runId);
    for (let i = 0; i < 20 && run?.status === 'running'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      run = store.getRun(started.runId);
    }
    expect(run).toMatchObject({
      status: 'success',
      scheduledTaskId: 'st-run',
      runbookVersion: rb.version,
      inputParams: { service: 'api' },
    });
    expect(latestScheduledRunbookRun('st-run')).toMatchObject({
      runId: started.runId,
      status: 'success',
      runbookVersion: rb.version,
    });
  });

  it('生产写 Runbook 无长期授权时不执行，指纹匹配时才放行', async () => {
    const rb = db.prepare("SELECT id, version FROM ops_runbook WHERE connection_id = 'c2'").get() as any;
    const binding = await prepareScheduledRunbookBinding(
      'guest',
      rb.id,
      {},
      rb.version,
      { allowStandingApproval: true },
    );
    await expect(startScheduledRunbookExecution({
      userId: 'guest',
      scheduledTaskId: 'st-no-approval',
      runbookId: rb.id,
      runbookVersion: rb.version,
      inputParams: binding.inputParams,
      standingApproval: null,
    })).rejects.toThrow('长期授权');

    await expect(startScheduledRunbookExecution({
      userId: 'guest',
      scheduledTaskId: 'st-stale-approval',
      runbookId: rb.id,
      runbookVersion: rb.version,
      inputParams: binding.inputParams,
      standingApproval: {
        approvedBy: 'guest',
        approvedAt: Date.now(),
        fingerprint: 'stale-fingerprint',
        reason: binding.policyReason,
      },
    })).rejects.toThrow('长期授权');

    const started = await startScheduledRunbookExecution({
      userId: 'guest',
      scheduledTaskId: 'st-approved',
      runbookId: rb.id,
      runbookVersion: rb.version,
      inputParams: binding.inputParams,
      standingApproval: {
        approvedBy: 'guest',
        approvedAt: Date.now(),
        fingerprint: binding.approvalFingerprint,
        reason: binding.policyReason,
      },
    });
    expect(started.runId).toContain('run-');
  });
});
