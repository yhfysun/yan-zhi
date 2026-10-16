/**
 * 命令审批闸门（ops-approvals + 工具层接线）正式测试类。
 *
 * ★ 这套东西要防的正是旧实现最大的洞：**模型自己传 `confirmed: true` 就能执行生产写操作**。
 *   所以这里第一条断言就是「传了 confirmed 也不执行」—— 如果哪天有人把参数又接回去，
 *   这条会立刻变红。
 *
 * 用假 ssh2（exec 直接回 ok）跑真实的 tool.execute 路径，只验闸门本身，不涉及网络。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { sshClients } = vi.hoisted(() => ({ sshClients: [] as any[] }));

vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (s: string) => `ENC:${s}`,
  decrypt: (s: string) => String(s).replace(/^ENC:/, ''),
}));

vi.mock('ssh2', async () => {
  const { EventEmitter } = await import('node:events');
  class FakeClient {
    cfg: any = null;
    handlers: Record<string, Array<(...a: any[]) => void>> = {};
    execCalls: string[] = [];
    constructor() { sshClients.push(this); }
    on(ev: string, cb: any) { (this.handlers[ev] ||= []).push(cb); return this; }
    once(ev: string, cb: any) { return this.on(ev, cb); }
    emit(ev: string, ...a: any[]) { for (const f of this.handlers[ev] || []) f(...a); return this; }
    connect(cfg: any) { this.cfg = cfg; queueMicrotask(() => this.emit('ready')); return this; }
    exec(cmd: string, cb: any) {
      this.execCalls.push(cmd);
      const ch: any = new EventEmitter();
      ch.stderr = new EventEmitter();
      ch.close = () => { /* noop */ };
      ch.setWindow = () => { /* noop */ };
      queueMicrotask(() => { ch.emit('data', Buffer.from('RAN\n')); ch.emit('close', 0); });
      cb(null, ch);
    }
    end() { this.emit('close'); }
  }
  return { Client: FakeClient };
});

import { makeTools, opsShellModule } from '../src/plugins/ops-shell.js';
import type { McpCallResult } from '@yan-zhi/core';
import {
  APPROVAL_TTL_MS, approvalId, capApprovals, hasPending, pendingMessage,
  pruneApprovals, rejectedMessage, takeApproval,
} from '../src/plugins/ops-approvals.js';

// ---------- A. 纯函数 ----------

const base = (over: Record<string, unknown> = {}) => ({
  id: 'apr-1', connectionId: 'c1', connectionName: 'web-1', command: 'ls -al',
  reason: 'agent tool', status: 'pending' as const, requestedAt: 1000, ...over,
});

describe('approvals · 纯函数', () => {
  it('id 与「连接 + 命令」绑定且稳定（同一条命令重复请求不会刷出多条）', () => {
    expect(approvalId('c1', 'ls -al')).toBe(approvalId('c1', 'ls -al'));
    expect(approvalId('c1', 'ls -al')).not.toBe(approvalId('c2', 'ls -al'));
    expect(approvalId('c1', 'ls -al')).not.toBe(approvalId('c1', 'ls -a'));
    expect(approvalId('c1', ' ls -al ')).toBe(approvalId('c1', 'ls -al'));   // 仅两端空白差异视为同一条
  });

  it('★ 命令**原文一致**才认：批准 ls 不能用来给别的命令背书', () => {
    const list = [base({ status: 'approved' })];
    expect(takeApproval(list, 'c1', 'ls -al').hit).toBeTruthy();
    expect(takeApproval(list, 'c1', 'ls -al; rm -rf /tmp').hit).toBeNull();
    expect(takeApproval(list, 'c2', 'ls -al').hit).toBeNull();
  });

  it('待批准状态不算「已决」：不能被当批准消费掉', () => {
    expect(takeApproval([base()], 'c1', 'ls -al').hit).toBeNull();
  });

  it('消费即移除（批准只能用一次）', () => {
    const { hit, rest } = takeApproval([base({ status: 'approved' })], 'c1', 'ls -al');
    expect(hit?.status).toBe('approved');
    expect(rest).toHaveLength(0);
  });

  it('拒绝同样被消费（不留着反复回放）', () => {
    const { hit, rest } = takeApproval([base({ status: 'rejected' })], 'c1', 'ls -al');
    expect(hit?.status).toBe('rejected');
    expect(rest).toHaveLength(0);
  });

  it('超时记录被剪掉（陈旧批准不能被翻出来用）', () => {
    const now = 1_000_000;
    const fresh = base({ requestedAt: now - 1000 });
    const stale = base({ id: 'apr-2', requestedAt: now - APPROVAL_TTL_MS - 1 });
    expect(pruneApprovals([fresh, stale], now).map((a) => a.id)).toEqual(['apr-1']);
  });

  it('按上限裁剪保留最新的', () => {
    const many = Array.from({ length: 5 }, (_, i) => base({ id: `apr-${i}` }));
    expect(capApprovals(many)).toHaveLength(5);   // 未超限不动
  });

  it('hasPending 只认待批准的同一条命令', () => {
    const pending = [base()];
    expect(hasPending(pending, 'c1', 'ls -al')).toBe(true);
    expect(hasPending([base({ status: 'approved' })], 'c1', 'ls -al')).toBe(false);
    expect(hasPending(pending, 'c1', 'ls')).toBe(false);
  });

  it('★ 给模型的待批准文案必须要求「停下等」，并禁止绕行', () => {
    const msg = pendingMessage(base() as never);
    expect(msg).toContain('人工批准');
    expect(msg).toMatch(/不要改写命令/);
    expect(msg).toMatch(/不要换用其它工具绕过/);
    expect(msg).toContain('ls -al');
  });

  it('★ 被拒绝的文案必须禁止换写法达成同样效果', () => {
    const msg = rejectedMessage(base() as never);
    expect(msg).toMatch(/拒绝/);
    expect(msg).toMatch(/不要再重试/);
    expect(msg).toMatch(/其它写法/);
  });
});

// ---------- B. 工具层接线 ----------

function makeStorage() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => { store.set(k, v === undefined ? undefined : JSON.parse(JSON.stringify(v))); },
  };
}

let storage: ReturnType<typeof makeStorage>;

async function activate() {
  const ctx = {
    id: 'ops-shell', log: () => {}, adapter: {}, config: {},
    registerTool: () => ({ dispose: () => {} }),
    registerBackendRoute: () => ({ dispose: () => {} }),
    registerWebSocket: () => ({ dispose: () => {} }),
    storage, emit: () => {}, on: () => ({ dispose: () => {} }),
  };
  await opsShellModule.activate(ctx as never);
}

/** 直接调工具执行体；返回工具结果文本 */
async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = makeTools().find((t) => t.name === name);
  if (!tool?.execute) throw new Error(`找不到工具 ${name}`);
  const r = (await tool.execute(args)) as McpCallResult;
  return (r.content as Array<{ text?: string }>).map((c) => c.text ?? '').join('');
}

const prod = (id: string) => ({
  id, type: 'ssh', name: 'prod-1', host: '10.0.0.1', port: 22, username: 'root',
  authType: 'password', secretEnc: 'ENC:pw', tag: '生产', createdAt: 0,
});
const dev = (id: string) => ({ ...prod(id), name: 'dev-1', tag: '测试' });

/** 造一条连接并让它可被 resolveConn 找到（工具按连接名定位） */
async function seed(conn: unknown) {
  const list = ((await storage.get('connections')) as unknown[] | undefined) ?? [];
  await storage.set('connections', [...list, conn]);
}

/** 读当前 approvals 列表 */
const approvals = async () => ((await storage.get('approvals')) as any[] | undefined) ?? [];

/** 模拟人在界面上点了批准/拒绝 */
async function decide(connId: string, command: string, approve: boolean) {
  const id = approvalId(connId, command);
  const list = await approvals();
  await storage.set('approvals', list.map((a) => (a.id === id ? { ...a, status: approve ? 'approved' : 'rejected', decidedAt: Date.now() } : a)));
}

beforeEach(async () => {
  sshClients.length = 0;
  storage = makeStorage();
  await activate();
});

describe('ssh_exec · 生产连接的人工批准闸门', () => {
  it('★★★ 模型传 confirmed:true 也不执行 —— 这正是旧实现被绕过的那个洞', async () => {
    await seed(prod('c1'));
    const out = await runTool('ssh_exec', { connection: 'prod-1', command: 'systemctl restart nginx', confirmed: true });
    expect(out).toContain('需要人工批准');
    expect(out).not.toContain('RAN');                          // 真没执行
    expect(sshClients[0]?.execCalls ?? []).toHaveLength(0);    // 连 exec 都没发出去
  });

  it('首次请求会登记一条待批准，且重复请求不刷屏（幂等）', async () => {
    await seed(prod('c1'));
    await runTool('ssh_exec', { connection: 'prod-1', command: 'systemctl restart nginx' });
    await runTool('ssh_exec', { connection: 'prod-1', command: 'systemctl restart nginx' });
    const list = await approvals();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ connectionId: 'c1', command: 'systemctl restart nginx', status: 'pending' });
  });

  it('★ 人工批准后原样重试 → 真的执行', async () => {
    await seed(prod('c1'));
    await runTool('ssh_exec', { connection: 'prod-1', command: 'systemctl restart nginx' });
    await decide('c1', 'systemctl restart nginx', true);
    const out = await runTool('ssh_exec', { connection: 'prod-1', command: 'systemctl restart nginx' });
    expect(out).toContain('RAN');
    expect(sshClients[0].execCalls).toEqual(['systemctl restart nginx']);
  });

  it('★ 批准只能用一次：再跑一次回到待批准', async () => {
    await seed(prod('c1'));
    await runTool('ssh_exec', { connection: 'prod-1', command: 'systemctl restart nginx' });
    await decide('c1', 'systemctl restart nginx', true);
    await runTool('ssh_exec', { connection: 'prod-1', command: 'systemctl restart nginx' });
    const again = await runTool('ssh_exec', { connection: 'prod-1', command: 'systemctl restart nginx' });
    expect(again).toContain('需要人工批准');
    expect((await approvals())[0].status).toBe('pending');
  });

  it('★ 改了命令就不算批准过（批准 A 不能执行 B）', async () => {
    await seed(prod('c1'));
    await runTool('ssh_exec', { connection: 'prod-1', command: 'systemctl restart nginx' });
    await decide('c1', 'systemctl restart nginx', true);
    const out = await runTool('ssh_exec', { connection: 'prod-1', command: 'systemctl stop nginx' });
    expect(out).toContain('需要人工批准');
    expect(out).not.toContain('RAN');
  });

  it('被拒绝 → 明确禁止换写法绕，且不执行', async () => {
    await seed(prod('c1'));
    await runTool('ssh_exec', { connection: 'prod-1', command: 'systemctl restart nginx' });
    await decide('c1', 'systemctl restart nginx', false);
    const out = await runTool('ssh_exec', { connection: 'prod-1', command: 'systemctl restart nginx' });
    expect(out).toContain('已被运维人员');
    expect(out).not.toContain('RAN');
  });

  it('生产连接上的**只读**命令不需要批准（否则助手连 ls 都做不了）', async () => {
    await seed(prod('c1'));
    const out = await runTool('ssh_exec', { connection: 'prod-1', command: 'ls -al /var/log' });
    expect(out).toContain('RAN');
    expect(await approvals()).toHaveLength(0);
  });

  it('非生产连接不受影响（照旧直接执行）', async () => {
    await seed(dev('c2'));
    const out = await runTool('ssh_exec', { connection: 'dev-1', command: 'systemctl restart nginx' });
    expect(out).toContain('RAN');
    expect(await approvals()).toHaveLength(0);
  });

  it('危险命令直接拒绝，且**不给批准通道**（黑名单不该能被批准绕过）', async () => {
    await seed(prod('c1'));
    const out = await runTool('ssh_exec', { connection: 'prod-1', command: 'rm -rf /', confirmed: true });
    expect(out).toMatch(/危险黑名单/);
    expect(await approvals()).toHaveLength(0);
    expect(sshClients[0]?.execCalls ?? []).toHaveLength(0);
  });

  it('docker_restart 同口径：生产连接需人工批准', async () => {
    await seed(prod('c1'));
    const first = await runTool('docker_restart', { connection: 'prod-1', container: 'nginx', confirmed: true });
    expect(first).toContain('需要人工批准');
    const list = await approvals();
    expect(list[0].command).toBe('docker restart nginx');

    await decide('c1', 'docker restart nginx', true);
    const second = await runTool('docker_restart', { connection: 'prod-1', container: 'nginx' });
    expect(second).toContain('已重启');
  });
});
