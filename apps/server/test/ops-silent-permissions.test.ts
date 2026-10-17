/**
 * 静默权限三档（P0-2）正式测试类。
 *
 * 口径（用户拍板）：
 *   ① 按连接存，默认全关；三档彼此独立（read / write / exec）；
 *   ② 危险命令黑名单**始终优先** —— 开了「静默执行命令」也不能放行 rm -rf 之类；
 *   ③ 静默放行的审计必须带 via=silent，事后能和人批的区分开。
 *
 * 这里分三层守：
 *   A. resolveSilent 纯函数矩阵（三档 × 黑名单）；
 *   B. 连接 REST：默认无 silent、PUT 持久化、非法入参 400、编辑连接不丢静默三档、审计留痕；
 *   C. ops-shell.ts 接线契约：审批闸门先看静默、写工具传 write、命令执行传 exec、审计标 via。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 导入 ops-shell 会经 crypto 连带加载 better-sqlite3（取主密钥），单测里换成可逆假加解密
vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (s: string) => `ENC:${s}`,
  decrypt: (s: string) => String(s).replace(/^ENC:/, ''),
}));

import { resolveSilent } from '../src/plugins/ops-shell-guard.js';
import { opsShellModule } from '../src/plugins/ops-shell.js';

// ---------- A. 纯函数矩阵 ----------

describe('resolveSilent · 三档矩阵', () => {
  it('缺省全关：没有 silent 字段 / 空对象都走原审批', () => {
    expect(resolveSilent({}, 'read')).toBe('approve');
    expect(resolveSilent({ silent: {} }, 'write')).toBe('approve');
    expect(resolveSilent({ silent: {} }, 'exec', 'uptime')).toBe('approve');
  });

  it('三档彼此独立，互不连带', () => {
    const execOnly = { silent: { exec: true } };
    expect(resolveSilent(execOnly, 'exec', 'uptime')).toBe('silent');
    expect(resolveSilent(execOnly, 'write')).toBe('approve');
    expect(resolveSilent(execOnly, 'read')).toBe('approve');

    const writeOnly = { silent: { write: true } };
    expect(resolveSilent(writeOnly, 'write')).toBe('silent');
    expect(resolveSilent(writeOnly, 'exec', 'uptime')).toBe('approve');
    expect(resolveSilent(writeOnly, 'read')).toBe('approve');

    const readOnly = { silent: { read: true } };
    expect(resolveSilent(readOnly, 'read')).toBe('silent');
    expect(resolveSilent(readOnly, 'write')).toBe('approve');
    expect(resolveSilent(readOnly, 'exec', 'uptime')).toBe('approve');
  });

  it('显式 false 不等于开启', () => {
    expect(resolveSilent({ silent: { exec: false, write: false, read: false } }, 'exec', 'uptime')).toBe('approve');
    expect(resolveSilent({ silent: { write: false } }, 'write')).toBe('approve');
  });

  it('★ 黑名单始终优先：开了静默执行也不能放行危险命令', () => {
    const allOn = { silent: { exec: true, write: true, read: true } };
    expect(resolveSilent(allOn, 'exec', 'rm -rf /')).toBe('approve');
    expect(resolveSilent(allOn, 'exec', 'sudo rm -fr /data')).toBe('approve');
    expect(resolveSilent(allOn, 'exec', 'mkfs.ext4 /dev/sda1')).toBe('approve');
    expect(resolveSilent(allOn, 'exec', 'shutdown -h now')).toBe('approve');
    expect(resolveSilent(allOn, 'exec', ':(){ :|:& };:')).toBe('approve');
  });

  it('黑名单只约束 exec 档：写档不因操作文本像命令而回退', () => {
    // 上传/删除的“命令”形参只是展示文案，不是要执行的 shell
    expect(resolveSilent({ silent: { write: true } }, 'write', 'rm -rf /tmp/x')).toBe('silent');
  });

  it('exec 未传命令文本时按档位判定（调用方另有 guard 兜底）', () => {
    expect(resolveSilent({ silent: { exec: true } }, 'exec')).toBe('silent');
  });
});

// ---------- B. 连接 REST ----------

type Handler = (req: unknown, res: unknown) => Promise<void> | void;

function makeStorage() {
  const store = new Map<string, unknown>();
  return {
    get: async (k: string) => store.get(k),
    // 深拷贝，避免测试里改对象“穿透”到已存记录（与真实插件存储一致）
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

const CONN_BODY = {
  type: 'ssh', name: '测试机', host: '127.0.0.1', port: 22,
  username: 'root', authType: 'password', secret: 'pw',
};

describe('连接静默权限 REST', () => {
  beforeEach(async () => { await activate(); });

  async function createConn(name = '测试机') {
    const res = await call('POST', '/connections', { ...CONN_BODY, name });
    expect(res.statusCode).toBe(200);
    return String(dataOf(res).id);
  }

  it('新建连接默认没有 silent（老/新记录都等价于全关）', async () => {
    const id = await createConn();
    const list = dataOf(await call('GET', '/connections'));
    const conn = list.find((c: { id: string }) => c.id === id);
    expect(conn.silent).toBeUndefined();
    expect(resolveSilent(conn, 'exec', 'uptime')).toBe('approve');
  });

  it('PUT /connections/:id/silent 持久化三档', async () => {
    const id = await createConn();
    const res = await call('PUT', `/connections/${id}/silent`, { silent: { exec: true, write: false, read: true } });
    expect(res.statusCode).toBe(200);
    expect(dataOf(res).silent).toEqual({ exec: true, write: false, read: true });

    const conn = dataOf(await call('GET', '/connections')).find((c: { id: string }) => c.id === id);
    expect(conn.silent).toEqual({ exec: true, write: false, read: true });
    expect(resolveSilent(conn, 'exec', 'uptime')).toBe('silent');
    expect(resolveSilent(conn, 'write')).toBe('approve');
    expect(resolveSilent(conn, 'read')).toBe('silent');
  });

  it('非法 silent（非对象 / 非布尔值）→ 400，不落库', async () => {
    const id = await createConn();
    expect((await call('PUT', `/connections/${id}/silent`, { silent: 'all' })).statusCode).toBe(400);
    expect((await call('PUT', `/connections/${id}/silent`, {})).statusCode).toBe(400);
    expect((await call('PUT', `/connections/${id}/silent`, { silent: { exec: 'yes' } })).statusCode).toBe(400);
    const conn = dataOf(await call('GET', '/connections')).find((c: { id: string }) => c.id === id);
    expect(conn.silent).toBeUndefined();
  });

  it('连接不存在 → 404', async () => {
    expect((await call('PUT', '/connections/nope/silent', { silent: { exec: true } })).statusCode).toBe(404);
  });

  it('★ 编辑连接（先存密钥）不带 silent 时保留原三档', async () => {
    const id = await createConn();
    await call('PUT', `/connections/${id}/silent`, { silent: { exec: true, write: true, read: false } });
    // 模拟「连接设置」弹窗只改端口：不带 silent 字段
    const res = await call('PUT', `/connections/${id}`, { ...CONN_BODY, port: 2222 });
    expect(res.statusCode).toBe(200);
    expect(dataOf(res).silent).toEqual({ exec: true, write: true, read: false });
  });

  it('审计记录 connection.silent（可检索）', async () => {
    const id = await createConn();
    await call('PUT', `/connections/${id}/silent`, { silent: { exec: true } });
    const audit = dataOf(await call('GET', '/audit')) as Array<{ action: string; detail?: string }>;
    const hit = audit.find((a) => a.action === 'connection.silent');
    expect(hit).toBeTruthy();
    expect(hit!.detail).toContain('exec=true');
  });
});

// ---------- C. 接线契约 ----------

describe('ops-shell 静默放行接线契约', () => {
  const SRC = readFileSync(resolve(__dirname, '../src/plugins/ops-shell.ts'), 'utf8');

  it('审批闸门先看静默，再走原人工批准逻辑', () => {
    expect(SRC).toMatch(/resolveSilent\(conn, action/);
    // 审计 detail 必须带动作档位，便于日志检索
    expect(SRC).toContain('[静默放行:${action}]');
    expect(SRC).toMatch(/via: 'silent'/);
  });

  it('写类工具传 write 档、命令执行传 exec 档', () => {
    expect((SRC.match(/, 'write'\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect((SRC.match(/, 'exec'\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('静默权限只按连接存（silent 随连接记录读写，不另起全局开关）', () => {
    expect(SRC).toMatch(/silent: input\.silentProvided \? input\.silent : base\?\.silent/);
    expect(SRC).toMatch(/r\.put\('\/connections\/:id\/silent'/);
  });
});
