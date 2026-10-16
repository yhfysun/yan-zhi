/**
 * 主机密钥校验的**接线**验证：确认 hostVerifier 真的挂进了 ssh2 的 ConnectConfig。
 *
 * 为什么单独一篇：ops-known-hosts.test.ts 只证明「决策函数算得对」，
 * 但如果没人把它接进建连路径，再对的决策也等于零 —— 这正是安全功能最常见的失效方式
 * （功能写好了、没接上、测试全绿、漏洞照旧）。所以这里用一个会执行 hostVerifier 的
 * 假 ssh2，走真实的 getSsh 路径端到端验证：首连记录 → 复连放行 → 换密钥拒绝。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { sshClients, serverKey } = vi.hoisted(() => ({
  sshClients: [] as any[],
  // 假服务器的主机密钥；测试中途改它来模拟「服务器换过密钥 / 中间人」
  serverKey: { blob: Buffer.alloc(0) as Buffer },
}));

vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (s: string) => `ENC:${s}`,
  decrypt: (s: string) => String(s).replace(/^ENC:/, ''),
}));

// 假 ssh2：connect 时**真的调用 hostVerifier**，不通就发 error（模拟 ssh2 的行为）
vi.mock('ssh2', () => {
  class FakeClient {
    cfg: any = null;
    handlers: Record<string, Array<(...a: any[]) => void>> = {};
    constructor() { sshClients.push(this); }
    on(ev: string, cb: any) { (this.handlers[ev] ||= []).push(cb); return this; }
    once(ev: string, cb: any) { return this.on(ev, cb); }
    emit(ev: string, ...a: any[]) { for (const f of this.handlers[ev] || []) f(...a); return this; }
    connect(cfg: any) {
      this.cfg = cfg;
      queueMicrotask(() => {
        if (typeof cfg.hostVerifier === 'function') {
          let ok = false;
          cfg.hostVerifier(serverKey.blob, (v: boolean) => { ok = v; });
          if (!ok) { this.emit('error', new Error('Host verification failed')); return; }
        }
        this.emit('ready');
      });
      return this;
    }
    end() { this.emit('close'); }
  }
  return { Client: FakeClient };
});

import { getSsh, opsShellModule } from '../src/plugins/ops-shell.js';
import type { StoredConnection } from '../src/plugins/ops-shell.js';
import { fingerprintOf } from '../src/plugins/ops-known-hosts.js';

const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n, 0); return b; };
function keyBlob(seed: number): Buffer {
  const t = Buffer.from('ssh-ed25519', 'utf8');
  return Buffer.concat([u32(t.length), t, u32(32), Buffer.alloc(32, seed)]);
}

const KEY_A = keyBlob(1);
const KEY_B = keyBlob(2);

function makeStorage() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => { store.set(k, v === undefined ? undefined : JSON.parse(JSON.stringify(v))); },
  };
}

let storage: ReturnType<typeof makeStorage>;

async function activate(config: Record<string, unknown> = {}) {
  const ctx = {
    id: 'ops-shell', log: () => {}, adapter: {}, config,
    registerTool: () => ({ dispose: () => {} }),
    registerBackendRoute: () => ({ dispose: () => {} }),
    registerWebSocket: () => ({ dispose: () => {} }),
    storage, emit: () => {}, on: () => ({ dispose: () => {} }),
  };
  await opsShellModule.activate(ctx as never);
}

/** 造一条连接记录（id 不同 → 不复用连接池，保证每次都真走一遍建连） */
function conn(id: string, over: Record<string, unknown> = {}): StoredConnection {
  return {
    id, type: 'ssh', name: id, host: '10.0.0.1', port: 22,
    username: 'root', authType: 'password', secretEnc: 'ENC:pw', createdAt: 0, ...over,
  } as StoredConnection;
}

const settle = () => new Promise((r) => setTimeout(r, 20));

/**
 * 每条连接用唯一 id。
 * ★ SSH 连接池是**模块级**的：跨用例复用同一个 id 会让新用例直接拿到上一个用例的
 *   缓存 client（连 hostVerifier 都不会跑），表现为「校验明明没生效却全绿」。
 */
let seq = 0;
const fresh = (over: Record<string, unknown> = {}) => conn(`c-${++seq}`, over);

beforeEach(() => {
  sshClients.length = 0;
  // ★ 这里**不能**重置 seq：id 一旦跨用例重复，就会命中上面那个模块级连接池
  serverKey.blob = KEY_A;
  storage = makeStorage();
});

describe('主机密钥校验 · 接进建连路径', () => {
  it('★★ verifier 真的挂到了 ConnectConfig 上（没挂上 = 校验形同虚设）', async () => {
    await activate();
    serverKey.blob = KEY_A;
    await getSsh(fresh());
    expect(typeof sshClients[0].cfg.hostVerifier).toBe('function');
  });

  it('★ 首次连接（TOFU）→ 放行，并把主机密钥记进 known_hosts', async () => {
    await activate();
    serverKey.blob = KEY_A;
    await expect(getSsh(fresh())).resolves.toBeTruthy();
    await settle();

    const known = (await storage.get('known-hosts')) as any[];
    expect(known).toHaveLength(1);
    expect(known[0]).toMatchObject({ host: '10.0.0.1:22', keyType: 'ssh-ed25519', fingerprint: fingerprintOf(KEY_A) });
  });

  it('★ 第二次连接、密钥一致 → 放行，且不重复记录', async () => {
    await activate();
    serverKey.blob = KEY_A;
    await getSsh(fresh());
    await settle();
    await expect(getSsh(fresh())).resolves.toBeTruthy();
    await settle();
    expect((await storage.get('known-hosts')) as any[]).toHaveLength(1);
  });

  it('★★★ 密钥变了 → 拒绝连接，并报出两个指纹与恢复路径', async () => {
    await activate();
    serverKey.blob = KEY_A;
    await getSsh(fresh());
    await settle();

    serverKey.blob = KEY_B;                       // 服务器换了密钥 / 中间人顶替
    const err = await getSsh(fresh()).then(() => null).catch((e: Error) => e);
    expect(err, '密钥变更时必须拒绝').toBeTruthy();
    expect(err!.message).toContain('主机密钥校验失败');
    expect(err!.message).toContain(fingerprintOf(KEY_A));
    expect(err!.message).toContain(fingerprintOf(KEY_B));

    // 被拒绝的密钥不得被写进 known_hosts（否则下次就放行了）
    const known = (await storage.get('known-hosts')) as any[];
    expect(known).toHaveLength(1);
    expect(known[0].fingerprint).toBe(fingerprintOf(KEY_A));
  });

  it('★ 拒绝要能恢复：删掉记录后再连 → 重新 TOFU 并放行', async () => {
    await activate();
    serverKey.blob = KEY_A;
    await getSsh(fresh());
    await settle();
    // 模拟用户在「主机密钥」页点了「忘记」
    await storage.set('known-hosts', []);

    serverKey.blob = KEY_B;
    await expect(getSsh(fresh())).resolves.toBeTruthy();
    await settle();
    expect(((await storage.get('known-hosts')) as any[])[0].fingerprint).toBe(fingerprintOf(KEY_B));
  });

  it('mode=off → 完全不校验（不新增 verifier，走旧行为）', async () => {
    await activate({ knownHostMode: 'off' });
    serverKey.blob = KEY_A;
    await getSsh(fresh());
    await settle();
    expect(sshClients[0].cfg.hostVerifier).toBeUndefined();

    serverKey.blob = KEY_B;   // 换密钥也不影响
    await expect(getSsh(fresh())).resolves.toBeTruthy();
    expect((await storage.get('known-hosts')) ?? []).toEqual([]);
  });

  it('mode=strict 且主机未记录 → 拒绝并提示怎么处理', async () => {
    await activate({ knownHostMode: 'strict' });
    serverKey.blob = KEY_A;
    const err = await getSsh(fresh()).then(() => null).catch((e: Error) => e);
    expect(err?.message).toMatch(/strict/);
    expect(err?.message).toContain(fingerprintOf(KEY_A));
  });
});
