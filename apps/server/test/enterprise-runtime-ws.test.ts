/**
 * Task 5 验收测试：实时节点通道升级（WebSocket 控制通道 + HTTP 轮询降级）。
 *
 * ★ 真跑真升级：upgrade 分发、token 认证、任务原子下发、事件序号幂等、断线离线收敛、
 *   重连续传这些点，只有真的握手 + 真的断开重连才验得出来，静态断言抓不住。
 *   协议处理收口在 runtime-ws.ts 的 handleRuntimeFrame（纯帧处理，可直测），
 *   agent 侧协议层抽在 enterprise-node-ws.mjs（.mjs 可被 vitest import，真连真服务端）。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import http from 'node:http';
import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import { db } from '../src/db.js';
import { ensureEnterpriseSchema } from '../src/enterprise/schema.js';
import { seedRbac } from '../src/rbac.js';
import {
  createRuntimeNode, createRuntimeTask, getRuntimeTask, listRuntimeEvents,
  registerRuntimeNode, claimRuntimeTask,
} from '../src/enterprise/runtime.js';
import { handleRuntimeWsUpgrade } from '../src/enterprise/runtime-ws.js';

const require = createRequire(import.meta.url);
const { createRuntimeWsChannel } = require('../scripts/enterprise-node-ws.mjs') as {
  createRuntimeWsChannel: (opts: Record<string, unknown>) => {
    start: () => Promise<boolean>;
    stop: () => void;
    isActive: () => boolean;
    sendEvent: (taskId: string, ev: { seq: number; kind: string; payload?: unknown }) => void;
    markDelivered: (taskId: string) => void;
  };
};

const UID = 'guest';
let nodeId = '';
let nodeToken = '';
let httpServer: Server;
let base = '';
let wsBase = '';

/** 收集指定类型的帧（带超时保护）。 */
function connectNode(token = nodeToken): Promise<{ ws: WebSocket; nextFrame: (type: string, timeoutMs?: number) => Promise<any> }> {
  const ws = new WebSocket(`${wsBase}/api/runtime/v1/ws?token=${encodeURIComponent(token)}`);
  // ★ 监听器必须在 open 之前挂上：服务端 registered 首帧会在 open resolve 的同一间隙到达。
  const buffered: any[] = [];
  const waiters: Array<{ type: string; resolve: (f: any) => void; timer: ReturnType<typeof setTimeout> }> = [];
  ws.on('message', (raw) => {
    const frame = JSON.parse(String(raw));
    const idx = waiters.findIndex((w) => w.type === frame.type);
    if (idx >= 0) {
      const w = waiters.splice(idx, 1)[0];
      clearTimeout(w.timer);
      w.resolve(frame);
    } else {
      buffered.push(frame);
    }
  });
  const open = new Promise<WebSocket>((resolve, reject) => {
    ws.once('error', reject);
    ws.once('open', () => resolve(ws));
  });
  return open.then((socket) => ({
    ws: socket,
    nextFrame(type: string, timeoutMs = 3000) {
      const idx = buffered.findIndex((f) => f.type === type);
      if (idx >= 0) return Promise.resolve(buffered.splice(idx, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const wIdx = waiters.findIndex((w) => w.type === type);
          if (wIdx >= 0) waiters.splice(wIdx, 1);
          reject(new Error(`等待 ${type} 帧超时（已收到: ${buffered.map((f) => f.type).join(',')}）`));
        }, timeoutMs);
        waiters.push({ type, resolve, timer });
      });
    },
  }));
}

beforeAll(async () => {
  ensureEnterpriseSchema();
  seedRbac();
  db.prepare('DELETE FROM runtime_event WHERE runtime_task_id IN (SELECT id FROM runtime_task WHERE owner_user_id = ?)').run(UID);
  db.prepare('DELETE FROM runtime_artifact WHERE runtime_task_id IN (SELECT id FROM runtime_task WHERE owner_user_id = ?)').run(UID);
  db.prepare('DELETE FROM runtime_task WHERE owner_user_id = ?').run(UID);
  db.prepare('DELETE FROM runtime_workspace WHERE owner_user_id = ?').run(UID);
  db.prepare('DELETE FROM runtime_node WHERE owner_user_id = ?').run(UID);
  db.prepare('INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(UID, 'guest', '!test', Date.now());
  const created = createRuntimeNode(UID, { name: 'WS 测试节点' });
  nodeId = created.node.id;
  nodeToken = created.token;
  registerRuntimeNode(nodeToken, { platform: 'linux', arch: 'x64', version: 'v24', capabilities: ['command'] });

  httpServer = http.createServer((req, res) => { res.writeHead(404).end(); });
  httpServer.on('upgrade', async (req, socket, head) => {
    if (!(req.url || '').startsWith('/api/runtime/v1/ws')) { socket.destroy(); return; }
    if (!(await handleRuntimeWsUpgrade(req, socket, head))) {
      try { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); } catch { /* 对端已断 */ }
      socket.destroy();
    }
  });
  await new Promise<void>((r) => httpServer.listen(0, '127.0.0.1', () => r()));
  const port = (httpServer.address() as any).port;
  base = `http://127.0.0.1:${port}`;
  wsBase = `ws://127.0.0.1:${port}`;
});

afterAll(async () => {
  (httpServer as any).closeAllConnections?.();
  await new Promise<void>((r) => httpServer.close(() => r()));
});

beforeEach(() => {
  db.prepare('DELETE FROM runtime_event WHERE runtime_task_id IN (SELECT id FROM runtime_task WHERE owner_user_id = ?)').run(UID);
  db.prepare('DELETE FROM runtime_artifact WHERE runtime_task_id IN (SELECT id FROM runtime_task WHERE owner_user_id = ?)').run(UID);
  db.prepare('DELETE FROM runtime_task WHERE owner_user_id = ?').run(UID);
  db.prepare("UPDATE runtime_node SET status = 'online', last_seen_at = ? WHERE id = ?").run(Date.now(), nodeId);
});

function makeTask(): any {
  return createRuntimeTask(UID, { nodeId, kind: 'command', payload: { command: 'echo hi' } });
}

describe('升级与认证', () => {
  it('错误 token 的 upgrade 被拒绝', async () => {
    const bad = new WebSocket(`${wsBase}/api/runtime/v1/ws?token=yzn.${'0'.repeat(36)}.badbadbadbadbadbadbad`);
    const outcome = await new Promise<string>((resolve) => {
      bad.once('error', () => resolve('error'));
      bad.once('open', () => resolve('open'));
    });
    expect(outcome).not.toBe('open');
    try { bad.close(); } catch { /* ignore */ }
  });

  it('正确 token 连接后先注册，收到 registered 帧（含 nodeId）', async () => {
    const { ws, nextFrame } = await connectNode();
    const frame = await nextFrame('registered');
    expect(frame.nodeId).toBe(nodeId);
    ws.close();
  });
});

describe('任务下发与事件幂等', () => {
  it('ready 触发原子认领：任务以下发帧送达且 state=running', async () => {
    const { ws, nextFrame } = await connectNode();
    await nextFrame('registered');
    const task = makeTask();
    ws.send(JSON.stringify({ type: 'ready' }));
    const frame = await nextFrame('task');
    expect(frame.task.id).toBe(task.id);
    expect(getRuntimeTask(task.id, UID)?.state).toBe('running');
    ws.close();
  });

  it('★ 事件按 seq 幂等入库：重复发送同一 seq 不重复执行', async () => {
    const { ws, nextFrame } = await connectNode();
    await nextFrame('registered');
    const task = makeTask();
    ws.send(JSON.stringify({ type: 'ready' }));
    await nextFrame('task');
    ws.send(JSON.stringify({ type: 'events', taskId: task.id, events: [
      { seq: 1, kind: 'stdout', payload: { text: 'a' } },
      { seq: 2, kind: 'stdout', payload: { text: 'b' } },
    ] }));
    const ack1 = await nextFrame('events_acked');
    expect(ack1.inserted).toBe(2);
    // 重放整批（断线重连的典型形态）：全部被幂等忽略
    ws.send(JSON.stringify({ type: 'events', taskId: task.id, events: [
      { seq: 1, kind: 'stdout', payload: { text: 'a' } },
      { seq: 2, kind: 'stdout', payload: { text: 'b' } },
      { seq: 3, kind: 'stdout', payload: { text: 'c' } },
    ] }));
    const ack2 = await nextFrame('events_acked');
    expect(ack2.inserted).toBe(1);
    expect(listRuntimeEvents(task.id).map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(listRuntimeEvents(task.id).map((e) => e.payload.text)).toEqual(['a', 'b', 'c']);
    ws.close();
  });
});

describe('断线 / 离线收敛 / 降级', () => {
  it('★ 连接断开后节点立即离线（远快于 2 分钟阈值）', async () => {
    const { ws, nextFrame } = await connectNode();
    await nextFrame('registered');
    ws.close();
    await new Promise((r) => setTimeout(r, 300));
    const row = db.prepare('SELECT status FROM runtime_node WHERE id = ?').get(nodeId) as any;
    expect(row.status).toBe('offline');
  });

  it('★ 断线重连后按事件序号续传，任务完成走 complete', async () => {
    const c1 = await connectNode();
    await c1.nextFrame('registered');
    const task = makeTask();
    c1.ws.send(JSON.stringify({ type: 'ready' }));
    await c1.nextFrame('task');
    c1.ws.send(JSON.stringify({ type: 'events', taskId: task.id, events: [{ seq: 1, kind: 'stdout', payload: { text: 'pre' } }] }));
    await c1.nextFrame('events_acked');
    // 断网：连接掉线，事件 seq 2/3 在节点本地缓存
    c1.ws.close();
    await new Promise((r) => setTimeout(r, 200));
    // 重连：先续传缺失事件，再 ready
    const c2 = await connectNode();
    await c2.nextFrame('registered');
    c2.ws.send(JSON.stringify({ type: 'events', taskId: task.id, events: [
      { seq: 2, kind: 'stdout', payload: { text: 'post1' } },
      { seq: 3, kind: 'stdout', payload: { text: 'post2' } },
    ] }));
    const ack = await c2.nextFrame('events_acked');
    expect(ack.inserted).toBe(2);
    c2.ws.send(JSON.stringify({ type: 'complete', taskId: task.id, state: 'completed', exitCode: 0, result: { ok: true } }));
    await new Promise((r) => setTimeout(r, 200));
    expect(getRuntimeTask(task.id, UID)?.state).toBe('completed');
    expect(listRuntimeEvents(task.id).map((e) => e.payload.text)).toEqual(['pre', 'post1', 'post2']);
    c2.ws.close();
  });

  it('HTTP 轮询路径仍可用（降级方案共存）', async () => {
    const task = makeTask();
    const claimed = claimRuntimeTask(nodeToken);
    expect(claimed?.id).toBe(task.id);
    expect(claimed?.state).toBe('running');
  });
});

describe('agent 侧协议层（enterprise-node-ws.mjs）', () => {
  it('★ 通道启动注册成功；未 ack 的事件在重连后自动续传到服务端；isActive 状态正确', async () => {
    const task = makeTask();
    const channel = createRuntimeWsChannel({
      server: base,
      token: nodeToken,
      license: '',
      onTask: () => { /* 本用例不执行任务 */ },
      readyIntervalMs: 120,
      reconnectDelayMs: 120,
    });
    const ok = await channel.start();
    expect(ok).toBe(true);
    expect(channel.isActive()).toBe(true);

    // seq=1 正常送达并手动确认；seq=2 发出后立即断线（ack 未回 ⇒ 留在 pending）
    channel.sendEvent(task.id, { seq: 1, kind: 'stdout', payload: { text: 'pre' } });
    channel.markDelivered(task.id);
    channel.sendEvent(task.id, { seq: 2, kind: 'stdout', payload: { text: 'post' } });
    (channel as any).__simulateDrop?.();
    await new Promise((r) => setTimeout(r, 700));
    expect(channel.isActive()).toBe(true);
    // 断线期间未 ack 的 seq=2 由通道重发，服务端按 seq 幂等入库（events_acked 由通道内部消费）
    expect(listRuntimeEvents(task.id).map((e) => e.payload.text)).toEqual(['pre', 'post']);
    channel.stop();
    await new Promise((r) => setTimeout(r, 100));
    expect(channel.isActive()).toBe(false);
  });

  it('★ 目标无 WS 端点时 start 如实失败，降级信号 isActive=false（HTTP 轮询接管）', async () => {
    const plain = http.createServer((req, res) => { res.writeHead(404).end(); });
    await new Promise<void>((r) => plain.listen(0, '127.0.0.1', () => r()));
    const port = (plain.address() as any).port;
    const channel = createRuntimeWsChannel({
      server: `http://127.0.0.1:${port}`,
      token: nodeToken,
      license: '',
      onTask: () => {},
      reconnectAttempts: 1,
      reconnectDelayMs: 50,
    });
    const ok = await channel.start();
    expect(ok).toBe(false);
    expect(channel.isActive()).toBe(false);
    await new Promise<void>((r) => plain.close(() => r()));
  });
});
