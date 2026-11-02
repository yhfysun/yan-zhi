/**
 * 巡检 API 路由守门：配置落库、概览回读、告警确认都走真实 ops-shell 路由。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (value: string) => `ENC:${value}`,
  decrypt: (value: string) => String(value).replace(/^ENC:/, ''),
}));

import { opsShellModule } from '../src/plugins/ops-shell.js';
import { db } from '../src/db.js';
import { createOpsMonitorStore } from '../src/plugins/ops-monitor-store.js';

type Handler = (req: unknown, res: unknown) => Promise<void> | void;
interface Route { method: string; pattern: string; handler: Handler }

function makeStorage() {
  const store = new Map<string, unknown>();
  return {
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

let storage: ReturnType<typeof makeStorage>;
let routes: Route[];

async function activate() {
  routes = [];
  await opsShellModule.activate({
    id: 'ops-shell',
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
  storage = makeStorage();
  await storage.set('connections', [{
    id: 'c1', type: 'ssh', name: 'prod-web', host: '10.0.0.8', port: 22,
    username: 'deploy', authType: 'key', secretEnc: 'ENC:secret', tag: '生产', createdAt: 1,
  }]);
  await activate();
  const store = createOpsMonitorStore(db);
  store.ensureSchema();
  db.exec('DELETE FROM ops_monitor_config; DELETE FROM ops_metric_sample; DELETE FROM ops_alert_event;');
});

describe('ops-shell monitor routes', () => {
  it('保存巡检配置并在 overview 回读', async () => {
    const saved = await call('PUT', '/monitor/config/c1', {
      enabled: false,
      intervalSec: 30,
      loadPct: 70,
      memPct: 80,
      diskPct: 75,
    });
    expect(saved.statusCode).toBe(200);
    expect((saved.body as any).data).toMatchObject({ connectionId: 'c1', loadPct: 70, memPct: 80 });

    const overview = await call('GET', '/monitor/overview');
    expect(overview.statusCode).toBe(200);
    expect((overview.body as any).data.connections[0].config).toMatchObject({
      enabled: false, intervalSec: 30, diskPct: 75,
    });
  });

  it('活动事件可确认，确认后仍留在 open 列表', async () => {
    const store = createOpsMonitorStore(db);
    store.reconcileAlerts('c1', 'prod-web', [{
      fingerprint: 'c1:disk', connectionId: 'c1', metric: 'disk', severity: 'critical',
      value: 96, threshold: 85, title: '磁盘使用率偏高', detail: '当前 96%，阈值 85%',
    }], Date.now());
    const alert = store.listAlerts('open')[0];
    const ack = await call('POST', `/monitor/alerts/${alert.id}/ack`);
    expect(ack.statusCode).toBe(200);
    expect(store.listAlerts('open')[0].status).toBe('acknowledged');
  });
});
