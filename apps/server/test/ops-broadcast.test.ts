/**
 * 命令广播（7.14）测试类。
 *
 * 护栏口径：
 *   ① 只允许 ssh/docker；数据库连接拒绝；一次最多 20 台；
 *   ② 危险命令黑名单**整批拒绝**，确认也无效；
 *   ③ 只要包含生产连接（tag 含生产/prod）就必须显式 confirmed；
 *   ④ 路由：无目标/非法目标 400，生产未确认 409 并回传生产连接清单。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (s: string) => `ENC:${s}`,
  decrypt: (s: string) => String(s).replace(/^ENC:/, ''),
}));

import {
  opsShellModule,
  validateBroadcastTargets,
  broadcastProblem,
  MAX_BROADCAST_TARGETS,
} from '../src/plugins/ops-shell.js';

const CONNS = [
  { id: 'ssh1', name: '测试机', type: 'ssh', tag: '测试' },
  { id: 'ssh2', name: '生产机', type: 'ssh', tag: '生产' },
  { id: 'docker1', name: 'Docker 宿主', type: 'docker' },
  { id: 'db1', name: '数据库', type: 'database' },
];

describe('validateBroadcastTargets · 目标校验', () => {
  it('至少一台；去重后计数', () => {
    expect(validateBroadcastTargets(CONNS, []).error).toMatch(/至少/);
    expect(validateBroadcastTargets(CONNS, ['ssh1', 'ssh1']).targets).toHaveLength(1);
    expect(validateBroadcastTargets(CONNS, ['ssh1', 'docker1']).targets).toHaveLength(2);
  });

  it('连接不存在 / 数据库连接 → 拒绝', () => {
    expect(validateBroadcastTargets(CONNS, ['nope']).error).toMatch(/不存在/);
    expect(validateBroadcastTargets(CONNS, ['db1']).error).toMatch(/数据库连接/);
  });

  it('上限 20 台', () => {
    const many = Array.from({ length: MAX_BROADCAST_TARGETS + 1 }, (_, i) => ({ id: `c${i}`, name: `c${i}`, type: 'ssh' }));
    expect(validateBroadcastTargets(many, many.map((c) => c.id)).error).toMatch(/最多/);
  });
});

describe('broadcastProblem · 命令护栏', () => {
  it('空命令拒绝', () => {
    expect(broadcastProblem([CONNS[0]], '  ', false)).toMatch(/不能为空/);
  });

  it('★ 黑名单整批拒绝，确认也无效', () => {
    expect(broadcastProblem([CONNS[0]], 'rm -rf /', false)).toMatch(/黑名单/);
    expect(broadcastProblem([CONNS[0]], 'rm -rf /', true)).toMatch(/黑名单/);
    expect(broadcastProblem([CONNS[1]], 'reboot', true)).toMatch(/黑名单/);
  });

  it('★ 含生产连接必须确认', () => {
    expect(broadcastProblem([CONNS[0], CONNS[1]], 'uptime', false)).toMatch(/生产连接/);
    expect(broadcastProblem([CONNS[0], CONNS[1]], 'uptime', true)).toBeNull();
    expect(broadcastProblem([CONNS[0]], 'uptime', false)).toBeNull();
  });
});

// ---------- 路由校验 ----------

type Handler = (req: unknown, res: unknown) => Promise<void> | void;
function makeStorage() {
  const store = new Map<string, unknown>();
  return {
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => { store.set(k, v === undefined ? undefined : JSON.parse(JSON.stringify(v))); },
  };
}
function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) { res.statusCode = c; return res; },
    json(d: unknown) { res.body = d; return res; },
  };
  return res;
}
let routes: Array<{ method: string; pattern: string; handler: Handler }>;
async function activate() {
  routes = [];
  const ctx = {
    id: 'ops-shell', log: () => {}, adapter: {}, config: {},
    registerTool: () => ({ dispose: () => {} }),
    registerBackendRoute: (setup: (app: unknown) => void) => {
      const app = {
        get: (p: string, h: Handler) => routes.push({ method: 'GET', pattern: p, handler: h }),
        post: (p: string, h: Handler) => routes.push({ method: 'POST', pattern: p, handler: h }),
        put: (p: string, h: Handler) => routes.push({ method: 'PUT', pattern: p, handler: h }),
        delete: (p: string, h: Handler) => routes.push({ method: 'DELETE', pattern: p, handler: h }),
      };
      setup(app);
      return { dispose: () => {} };
    },
    registerWebSocket: () => ({ dispose: () => {} }),
    storage: makeStorage(), emit: () => {}, on: () => ({ dispose: () => {} }),
  };
  await opsShellModule.activate(ctx as never);
}
async function call(method: string, path: string, body: Record<string, unknown> = {}) {
  const parts = path.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.method !== method) continue;
    const rp = r.pattern.split('/').filter(Boolean);
    if (rp.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < rp.length; i++) {
      if (rp[i].startsWith(':')) params[rp[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (rp[i] !== parts[i]) { ok = false; break; }
    }
    if (!ok) continue;
    const res = mockRes();
    await r.handler({ body, params, query: {} }, res);
    return res;
  }
  throw new Error(`路由未注册: ${method} ${path}`);
}
const dataOf = (res: ReturnType<typeof mockRes>) => (res.body as { data: any }).data;
const errOf = (res: ReturnType<typeof mockRes>) => (res.body as { error?: string }).error;

describe('POST /broadcast · 路由校验', () => {
  let prodId: string;
  let dbId: string;
  beforeEach(async () => {
    await activate();
    const mk = async (body: Record<string, unknown>) => {
      const r = await call('POST', '/connections', body);
      expect(r.statusCode).toBe(200);
      return String(dataOf(r).id);
    };
    prodId = await mk({ type: 'ssh', name: '生产 A', host: '10.0.0.1', port: 22, username: 'root', authType: 'password', secret: 'x', tag: '生产' });
    dbId = await mk({ type: 'database', name: '库 A', host: '10.0.0.2', port: 3306, username: 'root', authType: 'password', secret: 'x', database: 'app' });
  });

  it('无目标 / 数据库连接 → 400', async () => {
    expect((await call('POST', '/broadcast', { connectionIds: [], command: 'uptime' })).statusCode).toBe(400);
    expect((await call('POST', '/broadcast', { connectionIds: [dbId], command: 'uptime' })).statusCode).toBe(400);
  });

  it('★ 危险命令 → 400（即使 confirmed）', async () => {
    expect((await call('POST', '/broadcast', { connectionIds: [prodId], command: 'rm -rf /', confirmed: true })).statusCode).toBe(400);
    expect(errOf(await call('POST', '/broadcast', { connectionIds: [prodId], command: 'rm -rf /', confirmed: true }))).toMatch(/黑名单/);
  });

  it('★ 生产连接未确认 → 409 + 生产连接清单', async () => {
    const res = await call('POST', '/broadcast', { connectionIds: [prodId], command: 'uptime', confirmed: false });
    expect(res.statusCode).toBe(409);
    expect(dataOf(res).productionConnections).toEqual(['生产 A']);
    expect(errOf(res)).toMatch(/生产连接/);
  });
});

describe('ops-shell · 广播接线契约', () => {
  it('并发执行 + 逐台审计 + 单台失败不影响其它机器', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const SRC = readFileSync(resolve(__dirname, '../src/plugins/ops-shell.ts'), 'utf8');
    expect(SRC).toMatch(/r\.post\('\/broadcast'/);
    expect(SRC).toMatch(/runWithConcurrency\(targets, BROADCAST_CONCURRENCY/);
    // worker 内部 catch：一台失败不中断整批
    expect(SRC).toMatch(/catch \(e\) \{\s*results\[i\] = \{ connectionId: conn\.id, name: conn\.name, ok: false/);
    expect(SRC).toMatch(/audit\('broadcast\.exec'/);
  });
});
