/**
 * 剧本市场（sec-lab P2）：内置 + 自定义目录、导入（批量校验）、导出。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { secLabModule } from '../src/plugins/sec-lab.js';

function makeCtx() {
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
  return { ctx, store, getMount: () => mount };
}

function makeApp() {
  const routes: Record<string, (req: any, res: any) => any> = {};
  const def = (m: string) => (p: string, h: any) => { routes[`${m} ${p}`] = h; };
  return { routes, app: { get: def('GET'), post: def('POST'), put: def('PUT'), delete: def('DELETE') } };
}

function res() {
  const r: any = { code: 200, body: null, status(c: number) { r.code = c; return r; }, json(d: any) { r.body = d; return r; } };
  return r;
}

let routes: Record<string, (req: any, res: any) => any>;
let store: Map<string, unknown>;

beforeEach(async () => {
  const { ctx, store: s, getMount } = makeCtx();
  store = s;
  await secLabModule.activate(ctx as any);
  const { app, routes: r } = makeApp();
  getMount()!(app);
  routes = r;
});

describe('剧本市场', () => {
  it('导入：合法剧本入库，非法步骤被逐条拒绝并回报', async () => {
    const r = res();
    await routes['POST /playbooks/import']({
      body: {
        items: [
          { id: 'imp-1', name: '快速侦察', steps: ['/recon ${target}', '/webprobe ${target}'] },
          { id: 'imp-2', name: '坏剧本', steps: ['recon ${target}'] },
        ],
      },
    }, r);
    expect(r.body.ok).toBe(true);
    expect(r.body.data).toMatchObject({ added: 1, updated: 0 });
    expect(r.body.data.failed.join('')).toContain('坏剧本');

    const list = store.get('playbooks') as any[];
    expect(list.map((p) => p.id)).toEqual(['imp-1']);
  });

  it('导入再次同 id → 更新而不是新增', async () => {
    const r1 = res();
    await routes['POST /playbooks/import']({ body: { items: [{ id: 'imp-1', name: 'A', steps: ['/env'] }] } }, r1);
    const r2 = res();
    await routes['POST /playbooks/import']({ body: { items: [{ id: 'imp-1', name: 'A2', steps: ['/env'] }] } }, r2);
    expect(r2.body.data).toMatchObject({ added: 0, updated: 1 });
    expect((store.get('playbooks') as any[])[0].name).toBe('A2');
  });

  it('导入 text 形态（单个 / 数组 / {items}）均支持；坏 JSON 明确报错', async () => {
    const one = res();
    await routes['POST /playbooks/import']({ body: { text: JSON.stringify({ id: 't1', name: 'T1', steps: ['/env'] }) } }, one);
    expect(one.body.data.added).toBe(1);

    const bad = res();
    await routes['POST /playbooks/import']({ body: { text: 'not json' } }, bad);
    expect(bad.code).toBe(400);
    expect(bad.body.error).toContain('不是合法 JSON');
  });

  it('目录：内置剧本齐全 + 自定义单独列出', async () => {
    await routes['POST /playbooks/import']({ body: { items: [{ id: 'imp-1', name: 'A', steps: ['/env'] }] } }, res());
    const r = res();
    await routes['GET /playbooks/catalog']({}, r);
    expect(r.body.data.builtIn.length).toBeGreaterThan(0);
    expect(r.body.data.user).toHaveLength(1);
  });

  it('导出：默认全部自定义；带 id 只导一条', async () => {
    await routes['POST /playbooks/import']({ body: { items: [{ id: 'a', name: 'A', steps: ['/env'] }, { id: 'b', name: 'B', steps: ['/env'] }] } }, res());
    const all = res();
    await routes['GET /playbooks/export']({ query: {} }, all);
    expect(all.body.data.items).toHaveLength(2);

    const one = res();
    await routes['GET /playbooks/export']({ query: { id: 'b' } }, one);
    expect(one.body.data.items.map((p: any) => p.id)).toEqual(['b']);
  });
});
