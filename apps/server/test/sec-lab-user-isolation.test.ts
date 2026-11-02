/**
 * 多用户交战隔离（P3）：multi 模式下 sec-lab 存储按用户分 key；guest/单机沿用原 key。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { secLabModule } from '../src/plugins/sec-lab.js';

function setup() {
  const store = new Map<string, unknown>();
  let mount: ((app: any) => void) | null = null;
  const ctx = {
    storage: {
      get: async (k: string) => store.get(k),
      set: async (k: string, v: unknown) => { store.set(k, v); },
      delete: async (k: string) => { store.delete(k); },
    },
    registerTool: () => {},
    registerBackendRoute: (fn: any) => { mount = fn; },
    log: () => {},
  };
  const routes: Record<string, (req: any, res: any) => any> = {};
  const def = (m: string) => (p: string, h: any) => { routes[`${m} ${p}`] = h; };
  return { ctx, store, routes, app: { get: def('GET'), post: def('POST'), put: def('PUT'), delete: def('DELETE') }, mount: () => mount };
}

function res() {
  const r: any = { code: 200, body: null, status(c: number) { r.code = c; return r; }, json(d: any) { r.body = d; return r; } };
  return r;
}

let routes: Record<string, (req: any, res: any) => any>;
let store: Map<string, unknown>;

beforeEach(async () => {
  const s = setup();
  store = s.store;
  await secLabModule.activate(s.ctx as any);
  s.mount()!(s.app);
  routes = s.routes;
  process.env.YZ_AUTH_MODE = 'multi';
});

afterEach(() => {
  delete process.env.YZ_AUTH_MODE;
});

async function savePlaybook(uid: string, id: string): Promise<void> {
  const r = res();
  await routes['POST /playbooks']({
    user: { userId: uid },
    body: { id, name: `剧本-${uid}`, steps: ['/env'] },
  }, r);
  expect(r.body.ok).toBe(true);
}

async function listPlaybooks(uid: string): Promise<any[]> {
  const r = res();
  await routes['GET /playbooks']({ user: { userId: uid } }, r);
  return r.body.data as any[];
}

describe('多用户交战隔离', () => {
  it('用户各自只看到自己的剧本；底层 key 带用户后缀', async () => {
    await savePlaybook('alice', 'a1');
    await savePlaybook('bob', 'b1');

    expect((await listPlaybooks('alice')).map((p) => p.id)).toEqual(['a1']);
    expect((await listPlaybooks('bob')).map((p) => p.id)).toEqual(['b1']);
    expect(store.has('playbooks::u::alice')).toBe(true);
    expect(store.has('playbooks::u::bob')).toBe(true);
    expect(store.has('playbooks')).toBe(false);
  });

  it('guest / 单机模式仍用原始 key（存量数据不受影响）', async () => {
    process.env.YZ_AUTH_MODE = 'guest';
    await savePlaybook('guest', 'g1');
    expect(store.has('playbooks')).toBe(true);
    expect((await listPlaybooks('guest')).map((p) => p.id)).toEqual(['g1']);
  });

  it('没有用户上下文（启动/后台任务）不隔离，避免读不到配置', async () => {
    await savePlaybook('alice', 'a1');
    const r = res();
    await routes['GET /playbooks']({}, r); // 无 req.user
    expect(r.body.data).toEqual([]);       // raw key 下没有数据
  });
});
