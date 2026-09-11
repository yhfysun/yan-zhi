/**
 * 运维控制台「资源目录（分组）」路由单测
 *
 * 覆盖 ops-shell 插件新增的分组能力（左侧资源列表的分类目录）：
 *  - 目录 CRUD：新建 / 列表 / 重命名 / 删除（同级重名、不存在等边界）
 *  - 连接归属：新建连接带 groupId 落库、移动到目录、移出目录、目标目录不存在
 *  - 删除目录的语义：目录下连接回落「未分组」，连接本身不删
 *  - 连接列表不回显密钥（secretEnc 不外泄）
 *
 * 实现方式：用假的 PluginContext 激活插件，捕获其注册的 Express 风格路由，
 * 用内存 storage（JSON 序列化往返，复刻 plugin_storage 的真实语义）驱动请求。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// crypto 依赖 data.db（app_config 取主密钥），单测里替换为可逆的假加解密
vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (s: string) => `ENC:${s}`,
  decrypt: (s: string) => String(s).replace(/^ENC:/, ''),
}));

import { opsShellModule } from '../src/plugins/ops-shell.js';

type Handler = (req: unknown, res: unknown) => Promise<void> | void;
interface Route { method: string; pattern: string; handler: Handler }

/** 内存 plugin_storage：写入做 JSON 往返，确保存进去的东西真能序列化 */
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
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res;
}

interface Harness {
  storage: ReturnType<typeof makeStorage>;
  call: (method: string, path: string, opts?: { body?: Record<string, unknown>; query?: Record<string, string> }) => Promise<ReturnType<typeof mockRes>>;
}

/** 激活插件并捕获路由，返回可直接发请求的 harness */
async function makeHarness(): Promise<Harness> {
  const storage = makeStorage();
  const routes: Route[] = [];
  const ctx = {
    id: 'ops-shell',
    log: () => {},
    adapter: {},
    config: {},
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
    storage,
    emit: () => {},
    on: () => ({ dispose: () => {} }),
  };
  await opsShellModule.activate(ctx as never);

  async function call(method: string, path: string, opts: { body?: Record<string, unknown>; query?: Record<string, string> } = {}) {
    const parts = path.split('/').filter(Boolean);
    for (const r of routes) {
      if (r.method !== method) continue;
      const rp = r.pattern.split('/').filter(Boolean);
      if (rp.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < rp.length; i++) {
        if (rp[i].startsWith(':')) params[rp[i].slice(1)] = decodeURIComponent(parts[i]);
        else if (rp[i] !== parts[i]) { matched = false; break; }
      }
      if (!matched) continue;
      const res = mockRes();
      await r.handler({ body: opts.body ?? {}, params, query: opts.query ?? {} }, res);
      return res;
    }
    throw new Error(`路由未注册: ${method} ${path}`);
  }

  return { storage, call };
}

function connPayload(over: Record<string, unknown> = {}) {
  return {
    type: 'ssh', name: 'web-1', host: '10.0.0.1', port: 22,
    username: 'root', authType: 'password', secret: 'pw',
    ...over,
  };
}

const data = (res: ReturnType<typeof mockRes>) => (res.body as { data: any }).data;
const error = (res: ReturnType<typeof mockRes>) => (res.body as { error: string }).error;

let h: Harness;
beforeEach(async () => {
  h = await makeHarness();
});

describe('目录 CRUD', () => {
  it('新建目录后可被列表读到', async () => {
    const created = await h.call('POST', '/groups', { body: { name: '生产环境' } });
    expect(created.statusCode).toBe(200);
    expect(data(created).name).toBe('生产环境');
    expect(String(data(created).id)).toMatch(/^grp-/);

    const list = await h.call('GET', '/groups');
    expect(data(list)).toHaveLength(1);
    expect(data(list)[0].name).toBe('生产环境');
  });

  it('空名 / 同级重名被拒', async () => {
    const empty = await h.call('POST', '/groups', { body: { name: '   ' } });
    expect(empty.statusCode).toBe(400);
    expect(error(empty)).toMatch(/必填/);

    await h.call('POST', '/groups', { body: { name: '测试机' } });
    const dup = await h.call('POST', '/groups', { body: { name: '测试机' } });
    expect(dup.statusCode).toBe(409);
    expect(error(dup)).toMatch(/已存在/);
  });

  it('重命名生效；重名 409；不存在 404', async () => {
    const g = data(await h.call('POST', '/groups', { body: { name: 'A' } }));
    const renamed = await h.call('PUT', `/groups/${g.id}`, { body: { name: 'A2' } });
    expect(renamed.statusCode).toBe(200);
    expect(data(renamed).name).toBe('A2');

    const g2 = data(await h.call('POST', '/groups', { body: { name: 'B' } }));
    const dup = await h.call('PUT', `/groups/${g2.id}`, { body: { name: 'A2' } });
    expect(dup.statusCode).toBe(409);

    const missing = await h.call('PUT', '/groups/grp-none', { body: { name: 'X' } });
    expect(missing.statusCode).toBe(404);
  });
});

describe('连接归属目录', () => {
  it('新建连接可带 groupId 落库，且列表不回显密钥', async () => {
    const g = data(await h.call('POST', '/groups', { body: { name: '生产环境' } }));
    const created = await h.call('POST', '/connections', { body: connPayload({ groupId: g.id }) });
    expect(created.statusCode).toBe(200);
    expect(data(created).groupId).toBe(g.id);
    expect(data(created).secretEnc).toBeUndefined();

    const list = await h.call('GET', '/connections');
    expect(data(list)).toHaveLength(1);
    expect(data(list)[0].groupId).toBe(g.id);
    expect(data(list)[0].secretEnc).toBeUndefined();
  });

  it('移动到目录 / 移出目录 / 目标目录不存在 404', async () => {
    const g = data(await h.call('POST', '/groups', { body: { name: '生产环境' } }));
    const conn = data(await h.call('POST', '/connections', { body: connPayload() }));
    expect(conn.groupId).toBeUndefined();

    const moved = await h.call('PUT', `/connections/${conn.id}/group`, { body: { groupId: g.id } });
    expect(moved.statusCode).toBe(200);
    expect(data(moved).groupId).toBe(g.id);

    const bad = await h.call('PUT', `/connections/${conn.id}/group`, { body: { groupId: 'grp-none' } });
    expect(bad.statusCode).toBe(404);

    const out = await h.call('PUT', `/connections/${conn.id}/group`, { body: { groupId: '' } });
    expect(out.statusCode).toBe(200);
    expect(data(out).groupId).toBeUndefined();
  });

  it('编辑连接未传 groupId 时保留原目录归属', async () => {
    const g = data(await h.call('POST', '/groups', { body: { name: '生产环境' } }));
    const conn = data(await h.call('POST', '/connections', { body: connPayload({ groupId: g.id }) }));

    // 只改端口，未带 groupId
    const updated = await h.call('PUT', `/connections/${conn.id}`, { body: connPayload({ port: 2222 }) });
    expect(updated.statusCode).toBe(200);
    expect(data(updated).port).toBe(2222);
    expect(data(updated).groupId).toBe(g.id);
  });
});

describe('删除目录：连接回落未分组且不被删除', () => {
  it('目录下连接保留，groupId 被清空', async () => {
    const g = data(await h.call('POST', '/groups', { body: { name: '临时机' } }));
    await h.call('POST', '/connections', { body: connPayload({ name: 'a', groupId: g.id }) });
    await h.call('POST', '/connections', { body: connPayload({ name: 'b', groupId: g.id }) });
    await h.call('POST', '/connections', { body: connPayload({ name: 'c' }) });

    const del = await h.call('DELETE', `/groups/${g.id}`);
    expect(del.statusCode).toBe(200);

    const groups = await h.call('GET', '/groups');
    expect(data(groups)).toHaveLength(0);

    const conns = data(await h.call('GET', '/connections'));
    expect(conns).toHaveLength(3);
    expect(conns.every((c: { groupId?: string }) => !c.groupId)).toBe(true);
  });

  it('删除不存在的目录 → 404', async () => {
    const res = await h.call('DELETE', '/groups/grp-none');
    expect(res.statusCode).toBe(404);
  });
});
