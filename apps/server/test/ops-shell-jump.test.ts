/**
 * ops-shell 跳板机（ProxyJump）正式测试类。
 *
 * 背景：连接原先只有「一跳直连」模型 —— ConnectConfig 里没有 sock 字段，
 * 内网机器 / 只开放堡垒机的环境根本连不上。现在连接可指定另一条 ssh/docker
 * 连接作跳板，经 ssh2 的 forwardOut 隧道穿透，且支持多级（跳板自己也能挂跳板）。
 *
 * 本文件覆盖三层：
 *  A. 纯函数：链路解析顺序、成环 / 自引用 / 超深 / 类型非法、保存前校验
 *  B. 路由层：新建 / 编辑连接时的跳板校验、删除连接回报下游依赖
 *  C. 建连行为：真的在跳板连接上对目标 host:port 开隧道，目标连接经 sock 接入
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { sshClients } = vi.hoisted(() => ({ sshClients: [] as any[] }));

// crypto 依赖 data.db（app_config 取主密钥），单测里替换为可逆的假加解密
vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (s: string) => `ENC:${s}`,
  decrypt: (s: string) => String(s).replace(/^ENC:/, ''),
}));

// 假 ssh2：只保留建连 / 开隧道需要的表面，用来观察「隧道开给了谁」
// channel 用真 Duplex（PassThrough）—— 端口转发里会 pipe 它，普通对象会抛
vi.mock('ssh2', async () => {
  const { PassThrough } = await import('node:stream');
  class FakeClient {
    cfg: any = null;
    handlers: Record<string, Array<(...a: any[]) => void>> = {};
    tunnels: Array<{ host: string; port: number }> = [];
    ended = false;
    constructor() { sshClients.push(this); }
    on(ev: string, cb: any) { (this.handlers[ev] ||= []).push(cb); return this; }
    once(ev: string, cb: any) { return this.on(ev, cb); }
    emit(ev: string, ...a: any[]) { for (const f of this.handlers[ev] || []) f(...a); return this; }
    connect(cfg: any) { this.cfg = cfg; queueMicrotask(() => this.emit('ready')); return this; }
    forwardOut(_srcIP: string, _srcPort: number, dstIP: string, dstPort: number, cb: any) {
      this.tunnels.push({ host: dstIP, port: dstPort });
      const channel: any = new PassThrough();
      channel.close = () => { try { channel.destroy(); } catch { /* ignore */ } };
      channel.setWindow = () => {};
      cb(null, channel);
    }
    end() { this.ended = true; this.emit('close'); }
  }
  return { Client: FakeClient };
});

import { opsShellModule, getSsh, buildJumpChain, validateJumpRef, openEphemeralTunnel, MAX_JUMP_DEPTH } from '../src/plugins/ops-shell.js';
import type { StoredConnection } from '../src/plugins/ops-shell.js';
import { Client } from 'ssh2';
import { connect } from 'node:net';

// ---------- A. 纯函数 ----------

/** 造一条最小可用的连接（只填链路解析关心的字段） */
function conn(id: string, jumpConnectionId?: string, type = 'ssh'): StoredConnection {
  return {
    id, type: type as StoredConnection['type'], name: id, host: '10.0.0.1', port: 22,
    username: 'root', authType: 'password', secretEnc: 'ENC:pw', jumpConnectionId,
    createdAt: 0,
  };
}

/** 造一条恰好 hops 跳的链路（n0 是最外层直连，返回最末的目标连接） */
function chainOf(hops: number): { all: StoredConnection[]; target: StoredConnection } {
  const all: StoredConnection[] = [];
  for (let i = 0; i <= hops; i++) all.push(conn(`n${i}`, i === 0 ? undefined : `n${i - 1}`));
  return { all, target: all[all.length - 1] };
}

describe('buildJumpChain · 跳板链路解析', () => {
  it('没有跳板 → 空链路', () => {
    expect(buildJumpChain(conn('a'), [conn('a')])).toEqual([]);
  });

  it('单级跳板 → 只有那一跳', () => {
    const all = [conn('a'), conn('b', 'a')];
    expect(buildJumpChain(all[1], all).map((c) => c.id)).toEqual(['a']);
  });

  it('多级跳板 → 按「由外到内」返回，最外层排最前', () => {
    // c 经 b，b 经 a：建连顺序必须是 a → b → c
    const all = [conn('a'), conn('b', 'a'), conn('c', 'b')];
    expect(buildJumpChain(all[2], all).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('跳板指向不存在的连接 → 抛错', () => {
    const all = [conn('a', 'ghost')];
    expect(() => buildJumpChain(all[0], all)).toThrow(/跳板机连接不存在/);
  });

  it('跳板是数据库连接 → 抛错（数据库连接没有 shell 可用于中转）', () => {
    const all = [conn('db', undefined, 'database'), conn('a', 'db')];
    expect(() => buildJumpChain(all[1], all)).toThrow(/数据库连接，不能作为跳板机/);
  });

  it('自引用 → 抛错', () => {
    const all = [conn('a', 'a')];
    expect(() => buildJumpChain(all[0], all)).toThrow(/成环/);
  });

  it('两级成环（a→b→a）→ 抛错而不是死循环', () => {
    const all = [conn('a', 'b'), conn('b', 'a')];
    expect(() => buildJumpChain(all[0], all)).toThrow(/成环/);
  });

  it('超过最大跳数 → 抛错', () => {
    const { all, target } = chainOf(MAX_JUMP_DEPTH + 1);
    expect(() => buildJumpChain(target, all)).toThrow(/跳板链路超过/);
  });

  it('恰好等于最大跳数 → 放行', () => {
    const { all, target } = chainOf(MAX_JUMP_DEPTH);
    expect(buildJumpChain(target, all)).toHaveLength(MAX_JUMP_DEPTH);
  });
});

describe('validateJumpRef · 保存前校验', () => {
  const all = [conn('jump'), conn('db', undefined, 'database'), conn('target')];

  it('未指定跳板 → 通过', () => {
    expect(validateJumpRef(all[0], undefined, all)).toBeNull();
  });

  it('指向自身 → 拒绝', () => {
    expect(validateJumpRef(all[2], 'target', all)).toMatch(/不能是连接自身/);
  });

  it('跳板不存在 → 拒绝', () => {
    expect(validateJumpRef(all[2], 'ghost', all)).toMatch(/不存在/);
  });

  it('跳板是数据库连接 → 拒绝', () => {
    expect(validateJumpRef(all[2], 'db', all)).toMatch(/数据库连接/);
  });

  it('合法跳板 → 通过', () => {
    expect(validateJumpRef(all[2], 'jump', all)).toBeNull();
  });

  it('会形成环 → 拒绝（编辑成 a→b→a）', () => {
    const cyc = [conn('x'), conn('y', 'x')];
    expect(validateJumpRef(cyc[0], 'y', cyc)).toMatch(/成环/);
  });

  it('新建场景（目标尚不存在）→ 只校验跳板本身', () => {
    expect(validateJumpRef(undefined, 'jump', all)).toBeNull();
    expect(validateJumpRef(undefined, 'ghost', all)).toMatch(/不存在/);
  });
});

// ---------- B/C. 路由层与建连行为 ----------

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
    json(d: unknown) { res.body = d; return res; },
  };
  return res;
}

async function makeHarness() {
  const storage = makeStorage();
  const routes: Route[] = [];
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
    storage, emit: () => {}, on: () => ({ dispose: () => {} }),
    // 假 ctx 必须实现完整的 PluginContext：activate 里会调 registerWebSocket 注册终端端点
    registerWebSocket: () => ({ dispose: () => {} }),
  };
  await opsShellModule.activate(ctx as never);

  async function call(method: string, path: string, opts: { body?: Record<string, unknown> } = {}) {
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
      await r.handler({ body: opts.body ?? {}, params, query: {} }, res);
      return res;
    }
    throw new Error(`路由未注册: ${method} ${path}`);
  }
  return { storage, call };
}

const data = (res: ReturnType<typeof mockRes>) => (res.body as { data: any }).data;
const error = (res: ReturnType<typeof mockRes>) => (res.body as { error: string }).error;

function payload(over: Record<string, unknown> = {}) {
  return {
    type: 'ssh', name: 'web-1', host: '10.0.0.1', port: 22,
    username: 'root', authType: 'password', secret: 'pw',
    ...over,
  };
}

let h: Awaited<ReturnType<typeof makeHarness>>;
beforeEach(async () => {
  sshClients.length = 0;
  h = await makeHarness();
});

describe('路由层 · 跳板机校验', () => {
  it('新建带跳板的连接 → 落库并可从列表读到 jumpConnectionId', async () => {
    const jump = await h.call('POST', '/connections', { body: payload({ name: 'bastion' }) });
    const jumpId = data(jump).id;
    const target = await h.call('POST', '/connections', {
      body: payload({ name: 'inner-db-host', host: '10.1.0.9', jumpConnectionId: jumpId }),
    });
    expect(target.statusCode).toBe(200);
    expect(data(target).jumpConnectionId).toBe(jumpId);

    const list = await h.call('GET', '/connections');
    const names = (data(list) as any[]).map((c) => c.name);
    expect(names).toContain('inner-db-host');
    // 密钥永不下发
    expect(JSON.stringify(data(list))).not.toContain('secretEnc');
  });

  it('跳板指向不存在的连接 → 400 且不落库', async () => {
    const r = await h.call('POST', '/connections', { body: payload({ jumpConnectionId: 'ghost' }) });
    expect(r.statusCode).toBe(400);
    expect(error(r)).toMatch(/跳板机连接不存在/);
    const list = await h.call('GET', '/connections');
    expect(data(list)).toHaveLength(0);
  });

  it('跳板是数据库连接 → 400', async () => {
    const db = await h.call('POST', '/connections', {
      body: payload({ name: 'pg', type: 'database', dbType: 'postgres', database: 'app' }),
    });
    const r = await h.call('POST', '/connections', { body: payload({ jumpConnectionId: data(db).id }) });
    expect(r.statusCode).toBe(400);
    expect(error(r)).toMatch(/数据库连接/);
  });

  it('编辑成环（a 指向 b，再把 b 指向 a）→ 400 且原值不变', async () => {
    const a = await h.call('POST', '/connections', { body: payload({ name: 'a' }) });
    const aId = data(a).id;
    const b = await h.call('POST', '/connections', { body: payload({ name: 'b', jumpConnectionId: aId }) });
    const bId = data(b).id;
    // 让 a 经 b 中转 → a→b→a
    const r = await h.call('PUT', `/connections/${aId}`, { body: payload({ name: 'a', jumpConnectionId: bId }) });
    expect(r.statusCode).toBe(400);
    expect(error(r)).toMatch(/成环|跳板/);
    const list = await h.call('GET', '/connections');
    const aRow = (data(list) as any[]).find((c) => c.id === aId);
    expect(aRow.jumpConnectionId).toBeUndefined();
  });

  it('编辑时传空字符串 → 清空跳板', async () => {
    const jump = await h.call('POST', '/connections', { body: payload({ name: 'bastion' }) });
    const t = await h.call('POST', '/connections', {
      body: payload({ name: 'inner', jumpConnectionId: data(jump).id }),
    });
    const tId = data(t).id;
    const r = await h.call('PUT', `/connections/${tId}`, { body: payload({ name: 'inner', jumpConnectionId: '' }) });
    expect(r.statusCode).toBe(200);
    expect(data(r).jumpConnectionId).toBeUndefined();
  });

  it('编辑时不传 jumpConnectionId → 保留原跳板（只改端口不该丢跳板）', async () => {
    const jump = await h.call('POST', '/connections', { body: payload({ name: 'bastion' }) });
    const jumpId = data(jump).id;
    const t = await h.call('POST', '/connections', { body: payload({ name: 'inner', jumpConnectionId: jumpId }) });
    const tId = data(t).id;
    const body = payload({ name: 'inner', port: 2222 });
    delete (body as Record<string, unknown>).jumpConnectionId;
    const r = await h.call('PUT', `/connections/${tId}`, { body });
    expect(r.statusCode).toBe(200);
    expect(data(r).jumpConnectionId).toBe(jumpId);
  });

  it('删除被当作跳板的连接 → 响应回报下游依赖名', async () => {
    const jump = await h.call('POST', '/connections', { body: payload({ name: 'bastion' }) });
    const jumpId = data(jump).id;
    await h.call('POST', '/connections', { body: payload({ name: 'inner-a', jumpConnectionId: jumpId }) });
    const r = await h.call('DELETE', `/connections/${jumpId}`);
    expect(r.statusCode).toBe(200);
    expect(data(r).dependents).toEqual(['inner-a']);
  });
});

describe('建连行为 · 经跳板隧道接入', () => {
  it('目标连接经跳板：在跳板连接上对目标 host:port 开隧道，目标用该隧道作 sock', async () => {
    const jump = await h.call('POST', '/connections', { body: payload({ name: 'bastion', host: '203.0.113.7' }) });
    const jumpId = data(jump).id;
    await h.call('POST', '/connections', {
      body: payload({ name: 'inner', host: '10.1.0.9', port: 2202, jumpConnectionId: jumpId }),
    });

    const stored = h.storage.store.get('connections') as StoredConnection[];
    const target = stored.find((c) => c.name === 'inner')!;
    await getSsh(target);

    expect(sshClients).toHaveLength(2);
    const [jumpClient, targetClient] = sshClients;
    // 跳板直连，不带 sock
    expect(jumpClient.cfg.host).toBe('203.0.113.7');
    expect(jumpClient.cfg.sock).toBeUndefined();
    // 隧道开在跳板连接上，目标是内网地址
    expect(jumpClient.tunnels).toEqual([{ host: '10.1.0.9', port: 2202 }]);
    // 目标连接走隧道
    expect(targetClient.cfg.host).toBe('10.1.0.9');
    expect(targetClient.cfg.sock).toBeTruthy();
  });

  it('多级跳板：隧道按外层→外层→目标依次建立', async () => {
    const a = await h.call('POST', '/connections', { body: payload({ name: 'edge', host: '198.51.100.1' }) });
    const aId = data(a).id;
    const b = await h.call('POST', '/connections', {
      body: payload({ name: 'mid', host: '10.0.0.2', jumpConnectionId: aId }),
    });
    const bId = data(b).id;
    await h.call('POST', '/connections', {
      body: payload({ name: 'deep', host: '10.9.9.9', jumpConnectionId: bId }),
    });

    const stored = h.storage.store.get('connections') as StoredConnection[];
    const deep = stored.find((c) => c.name === 'deep')!;
    await getSsh(deep);

    expect(sshClients).toHaveLength(3);
    const [edge, mid, target] = sshClients;
    expect(edge.cfg.sock).toBeUndefined();
    expect(edge.tunnels).toEqual([{ host: '10.0.0.2', port: 22 }]);
    expect(mid.cfg.sock).toBeTruthy();
    expect(mid.tunnels).toEqual([{ host: '10.9.9.9', port: 22 }]);
    expect(target.cfg.sock).toBeTruthy();
  });

  it('跳板连接已被删除 → 建连时报清晰错误，而不是静默直连', async () => {
    const jump = await h.call('POST', '/connections', { body: payload({ name: 'bastion' }) });
    const jumpId = data(jump).id;
    await h.call('POST', '/connections', { body: payload({ name: 'inner', jumpConnectionId: jumpId }) });
    const stored = h.storage.store.get('connections') as StoredConnection[];
    const target = stored.find((c) => c.name === 'inner')!;
    // 直接删掉跳板（绕过依赖检查，模拟历史脏数据 / 手工改库）
    await h.storage.set('connections', stored.filter((c) => c.id !== jumpId));

    await expect(getSsh(target)).rejects.toThrow(/跳板机连接不存在/);
  });
});

describe('本地端口转发 · 数据库经跳板接入的底座', () => {
  it('监听 127.0.0.1 随机端口，进来的连接被引到目标 host:port', async () => {
    const client = new Client();
    const tunnel = await openEphemeralTunnel(client as never, '10.1.0.9', 3306);
    expect(tunnel.port).toBeGreaterThan(0);

    const sock = connect(tunnel.port, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      sock.once('connect', () => resolve());
      sock.once('error', reject);
    });
    // channel 是在 server 的连接回调里异步开的，等一拍
    await new Promise((r) => setTimeout(r, 20));

    expect((client as any).tunnels).toEqual([{ host: '10.1.0.9', port: 3306 }]);
    sock.destroy();
    tunnel.close();
  });

  it('close() 之后端口不再接受连接（不留悬挂监听）', async () => {
    const client = new Client();
    const tunnel = await openEphemeralTunnel(client as never, '10.1.0.9', 3306);
    tunnel.close();

    const err = await new Promise<Error | null>((resolve) => {
      const sock = connect(tunnel.port, '127.0.0.1');
      sock.once('error', (e) => resolve(e));
      sock.once('connect', () => { sock.destroy(); resolve(null); });
    });
    expect(err).toBeTruthy();
  });
});
