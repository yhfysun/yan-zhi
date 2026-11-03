/**
 * Runbook API 端到端：创建/版本递增、生产审批、异步执行与运行结果回读。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { opsShellModule } from '../src/plugins/ops-shell.js';
import { db } from '../src/db.js';
import { createOpsRunbookStore } from '../src/plugins/ops-runbook-store.js';

type Handler = (req: unknown, res: unknown) => Promise<void> | void;
interface Route { method: string; pattern: string; handler: Handler }

function makeStorage() {
  const data = new Map<string, unknown>();
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

let routes: Route[];

async function activate() {
  routes = [];
  const storage = makeStorage();
  await storage.set('connections', [{
    id: 'c1', type: 'ssh', name: 'prod-web', host: '10.0.0.8', port: 22,
    username: 'deploy', authType: 'key', secretEnc: 'ENC:secret', tag: '生产', createdAt: 1,
  }]);
  await opsShellModule.activate({
    id: 'ops-shell', log: () => {}, adapter: {}, config: {}, storage,
    registerTool: () => ({ dispose: () => {} }),
    registerBackendRoute: (setup: (app: unknown) => void) => {
      const app = {
        get: (pattern: string, handler: Handler) => routes.push({ method: 'GET', pattern, handler }),
        post: (pattern: string, handler: Handler) => routes.push({ method: 'POST', pattern, handler }),
        put: (pattern: string, handler: Handler) => routes.push({ method: 'PUT', pattern, handler }),
        delete: (pattern: string, handler: Handler) => routes.push({ method: 'DELETE', pattern, handler }),
      };
      setup(app);
      return { dispose: () => {} };
    },
    registerWebSocket: () => ({ dispose: () => {} }),
    emit: () => {},
    on: () => ({ dispose: () => {} }),
  } as never);
}

async function call(method: string, path: string, body: Record<string, unknown> = {}) {
  const actual = path.split('/').filter(Boolean);
  for (const route of routes) {
    if (route.method !== method) continue;
    const pattern = route.pattern.split('/').filter(Boolean);
    if (pattern.length !== actual.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i].startsWith(':')) params[pattern[i].slice(1)] = decodeURIComponent(actual[i]);
      else if (pattern[i] !== actual[i]) { matched = false; break; }
    }
    if (!matched) continue;
    const res = mockRes();
    await route.handler({ body, params, query: {} }, res);
    return res;
  }
  throw new Error(`路由未注册: ${method} ${path}`);
}

beforeEach(async () => {
  await activate();
  const store = createOpsRunbookStore(db);
  store.ensureSchema();
  db.exec('DELETE FROM ops_runbook; DELETE FROM ops_runbook_run; DELETE FROM plugin_storage;');
  await (opsShellModule as any).deactivate?.();
  await activate();
});

async function createRunbook() {
  const created = await call('POST', '/runbooks', {
    name: '检查服务',
    connectionId: 'c1',
    steps: [{ type: 'exec', name: '检查', command: 'uptime' }],
    rollbackSteps: [{ type: 'exec', name: '恢复', command: 'sh rollback.sh' }],
  });
  expect(created.statusCode).toBe(200);
  return (created.body as any).data;
}

describe('Runbook routes', () => {
  it('创建后编辑自动加版本', async () => {
    const rb = await createRunbook();
    const updated = await call('PUT', `/runbooks/${rb.id}`, { name: '检查服务 v2' });
    expect(updated.statusCode).toBe(200);
    expect((updated.body as any).data).toMatchObject({ id: rb.id, version: 2, name: '检查服务 v2' });
  });

  it('生产 Runbook 未审批时 428，审批后异步执行并成功', async () => {
    const rb = await createRunbook();
    const denied = await call('POST', `/runbooks/${rb.id}/run`);
    expect(denied.statusCode).toBe(428);
    expect((denied.body as any).error).toContain('需要人工批准');

    const prepared = await call('POST', `/runbooks/${rb.id}/approval`);
    const approval = (prepared.body as any).data.approval;
    await call('POST', `/approvals/${approval.id}`, { approve: true });
    const started = await call('POST', `/runbooks/${rb.id}/run`);
    expect(started.statusCode).toBe(202);
    const runId = (started.body as any).data.id;

    let run: any = null;
    for (let i = 0; i < 20; i++) {
      const poll = await call('GET', `/runbooks/runs/${runId}`);
      run = (poll.body as any).data;
      if (run.status !== 'running') break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    expect(run).toMatchObject({ status: 'success', runbookVersion: 1 });
    expect(run.stepResults[0]).toMatchObject({ name: '检查', status: 'success' });
  });

  it('运行参数进入审批计划、运行快照与历史输入', async () => {
    const created = await call('POST', '/runbooks', {
      name: '检查指定服务',
      connectionId: 'c1',
      parameters: [{ key: 'service', label: '服务名', required: true, defaultValue: 'nginx' }],
      steps: [{ type: 'exec', name: '检查', command: 'systemctl status ${service}' }],
    });
    const rb = (created.body as any).data;

    const prepared = await call('POST', `/runbooks/${rb.id}/approval`, {
      params: { service: 'api' },
    });
    const approval = (prepared.body as any).data.approval;
    expect(approval.command).toContain('systemctl status api');
    await call('POST', `/approvals/${approval.id}`, { approve: true });

    const started = await call('POST', `/runbooks/${rb.id}/run`, {
      params: { service: 'api' },
    });
    expect(started.statusCode).toBe(202);
    expect((started.body as any).data).toMatchObject({
      inputParams: { service: 'api' },
      snapshot: { steps: [{ command: 'systemctl status api' }] },
    });
  });

  it('运行参数不是对象时拒绝审批与启动', async () => {
    const rb = await createRunbook();
    const prepared = await call('POST', `/runbooks/${rb.id}/approval`, { params: 'service=api' });
    expect(prepared.statusCode).toBe(400);
    expect((prepared.body as any).error).toContain('参数必须是对象');

    const started = await call('POST', `/runbooks/${rb.id}/run`, { params: ['api'] });
    expect(started.statusCode).toBe(400);
    expect((started.body as any).error).toContain('参数必须是对象');
  });

  it('取消请求在步骤边界生效并落为 cancelled', async () => {
    const created = await call('POST', '/runbooks', {
      name: '慢任务',
      connectionId: 'c1',
      parameters: [],
      steps: [{ type: 'wait', name: '等待', seconds: 1 }],
    });
    const rb = (created.body as any).data;
    const prepared = await call('POST', `/runbooks/${rb.id}/approval`);
    const approval = (prepared.body as any).data.approval;
    await call('POST', `/approvals/${approval.id}`, { approve: true });
    const started = await call('POST', `/runbooks/${rb.id}/run`);
    const runId = (started.body as any).data.id;

    const cancelled = await call('POST', `/runbooks/runs/${runId}/cancel`);
    expect(cancelled.statusCode).toBe(202);

    let run: any = null;
    for (let i = 0; i < 30; i++) {
      const poll = await call('GET', `/runbooks/runs/${runId}`);
      run = (poll.body as any).data;
      if (run.status !== 'running') break;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    expect(run).toMatchObject({ status: 'cancelled', stepResults: [{ name: '等待', status: 'success' }] });
  });
});
