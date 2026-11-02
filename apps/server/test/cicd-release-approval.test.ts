/**
 * HTTP 发布入口不能绕过人工审批。
 * 这里激活真实的 ops-shell + cicd-pipeline 路由，只验证“未批准就 428”，不触达 SSH。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (value: string) => `ENC:${value}`,
  decrypt: (value: string) => String(value).replace(/^ENC:/, ''),
}));

import { opsShellModule } from '../src/plugins/ops-shell.js';
import { cicdModule } from '../src/plugins/cicd-pipeline.js';

type Handler = (req: unknown, res: unknown) => Promise<void> | void;
interface Route { method: string; pattern: string; handler: Handler }

function makeStorage() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => {
      store.set(key, value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
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

async function call(routes: Route[], method: string, path: string, body: Record<string, unknown> = {}) {
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

let opsStorage: ReturnType<typeof makeStorage>;
let cicdStorage: ReturnType<typeof makeStorage>;
let routes: Route[];

async function activateModules() {
  routes = [];
  const makeCtx = (id: string, storage: ReturnType<typeof makeStorage>) => ({
    id,
    log: () => {},
    adapter: {},
    config: {},
    storage,
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
  });
  await opsShellModule.activate(makeCtx('ops-shell', opsStorage) as never);
  await cicdModule.activate(makeCtx('cicd-pipeline', cicdStorage) as never);
}

beforeEach(async () => {
  opsStorage = makeStorage();
  cicdStorage = makeStorage();
  await activateModules();
  await opsStorage.set('connections', [{
    id: 'c-prod', type: 'ssh', name: 'prod-web', host: '10.0.0.8', port: 22,
    username: 'deploy', authType: 'key', secretEnc: 'ENC:secret', tag: '生产', createdAt: 1,
  }]);
  await cicdStorage.set('pipelines', [{
    id: 'p1', name: '订单服务', projectDir: process.cwd(), buildType: 'custom-command',
    steps: [], targets: [{
      id: 't1', name: '生产', connectionId: 'c-prod', remotePath: '/srv/app',
      restartScript: 'sh restart.sh', healthCheckCommand: 'curl -fsS http://127.0.0.1:8080/health',
      rollbackCommand: 'sh rollback.sh', autoRollback: true,
    }],
    trigger: 'manual', createdAt: 1, updatedAt: 1,
  }]);
});

describe('CICD HTTP 发布审批', () => {
  it('生产目标未配置健康检查时拒绝发起审批', async () => {
    const pipelines = await cicdStorage.get('pipelines') as any[];
    delete pipelines[0].targets[0].healthCheckCommand;
    await cicdStorage.set('pipelines', pipelines);

    const prepared = await call(routes, 'POST', '/pipelines/p1/approval', { targetId: 't1' });
    expect(prepared.statusCode).toBe(400);
    expect((prepared.body as { error: string }).error).toContain('必须配置健康检查');
  });

  it('★ 生产目标未审批时 /run 在启动 SSE/执行器前直接 428', async () => {
    const prepared = await call(routes, 'POST', '/pipelines/p1/approval', { targetId: 't1' });
    expect(prepared.statusCode).toBe(200);
    const approval = (prepared.body as { data: { approval: { id: string; status: string; kind: string } } }).data.approval;
    expect(approval).toMatchObject({ status: 'pending', kind: 'release' });

    const run = await call(routes, 'POST', '/pipelines/p1/run', { targetId: 't1' });
    expect(run.statusCode).toBe(428);
    expect(run.body).toMatchObject({ approvalId: approval.id });
    expect((run.body as { error: string }).error).toContain('该发布需要人工批准');
  });

  it('用户在确认框取消时撤回待审批项，不影响下次重新发起', async () => {
    const prepared = await call(routes, 'POST', '/pipelines/p1/approval', { targetId: 't1' });
    const approval = (prepared.body as { data: { approval: { id: string } } }).data.approval;
    const cancelled = await call(routes, 'DELETE', `/approvals/${approval.id}`);
    expect(cancelled.statusCode).toBe(200);
    expect(await opsStorage.get('approvals')).toEqual([]);
  });
});
