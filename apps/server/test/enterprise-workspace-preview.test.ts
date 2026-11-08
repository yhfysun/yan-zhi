/**
 * Task 3 验收测试：云工作区端口预览（真实 HTTP 代理）。
 *
 * ★ 为什么必须真跑：「不允许任意内网代理」这类约束只有真的发一次请求才验得出来 ——
 *   静态断言看不出服务端有没有跟随 3xx、有没有把 Authorization/Cookie 透传给上游。
 *   这里起一个真实上游 HTTP server 作为「节点上已登记的端口」，再经真实 express 路由代理过去。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { db } from '../src/db.js';
import { ensureEnterpriseSchema } from '../src/enterprise/schema.js';
import { seedRbac } from '../src/rbac.js';
import {
  createRuntimeNode, createWorkspace, registerRuntimeNode,
  resolveWorkspacePreviewTarget, updateWorkspaceState,
} from '../src/enterprise/runtime.js';
import { enterpriseUserRouter } from '../src/routes/enterprise.js';

const UID = 'guest';                 // guest 模式下 authMiddleware 注入的 userId
const OTHER = 'u_preview_other';
let nodeId = '';
let nodeToken = '';
let wsId = '';
let otherWsId = '';
let upstreamPort = 0;
let appBase = '';
let appServer: Server;
let upstreamServer: Server;
let seenHeaders: Record<string, unknown> = {};
let hitCount = 0;

async function listen(app: express.Express): Promise<[Server, number]> {
  const server = await new Promise<Server>((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  return [server, (server.address() as any).port];
}

function previewUrl(ws: string, port: number, sub = '', query = '') {
  return `${appBase}/api/enterprise/runtime/workspaces/${ws}/preview/${port}/${sub}${query}`;
}

beforeAll(async () => {
  ensureEnterpriseSchema();
  seedRbac();
  db.prepare('DELETE FROM runtime_task WHERE owner_user_id IN (?, ?)').run(UID, OTHER);
  db.prepare('DELETE FROM runtime_workspace WHERE owner_user_id IN (?, ?)').run(UID, OTHER);
  db.prepare('DELETE FROM runtime_node WHERE owner_user_id IN (?, ?)').run(UID, OTHER);
  db.prepare('DELETE FROM user WHERE id = ?').run(OTHER);
  db.prepare('INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(UID, 'guest', '!test', Date.now());
  db.prepare('INSERT INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(OTHER, 'preview_other', '!test', Date.now());

  const created = createRuntimeNode(UID, { name: '预览测试节点' });
  nodeId = created.node.id;
  nodeToken = created.token;
  registerRuntimeNode(nodeToken, {
    platform: 'linux', arch: 'x64', version: 'v24', capabilities: ['workspace_container'],
    previewHost: '127.0.0.1',
  } as any);

  const upstream = express();
  upstream.get('*', (req, res) => {
    hitCount += 1;
    seenHeaders = req.headers as Record<string, unknown>;
    if (req.path.startsWith('/redirect')) {
      res.redirect(302, 'http://127.0.0.1:9/evil');
      return;
    }
    res.setHeader('X-Upstream', 'yes');
    res.setHeader('Set-Cookie', 'upstream_session=should-not-leak');
    res.end(`preview-ok:${req.originalUrl}`);
  });
  [upstreamServer, upstreamPort] = await listen(upstream);

  const app = express();
  app.use(express.json());
  app.use('/api/enterprise', enterpriseUserRouter);
  const [server, port] = await listen(app);
  appServer = server;
  appBase = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => appServer.close(() => r()));
  try { await new Promise<void>((r) => upstreamServer.close(() => r())); } catch { /* 端口关闭用例可能已关 */ }
});

beforeEach(() => {
  hitCount = 0;
  seenHeaders = {};
  db.prepare('DELETE FROM runtime_task WHERE owner_user_id IN (?, ?)').run(UID, OTHER);
  db.prepare('DELETE FROM runtime_workspace WHERE owner_user_id IN (?, ?)').run(UID, OTHER);
  const ws = createWorkspace(UID, { nodeId, name: '预览工作区', image: 'alpine' } as any);
  wsId = ws.id;
  const other = createWorkspace(UID, { nodeId, name: '别人的工作区' } as any);
  otherWsId = other.id;
  // 节点属于 UID，越权样例只把工作区归属改到别人名下。
  db.prepare('UPDATE runtime_workspace SET owner_user_id = ? WHERE id = ?').run(OTHER, otherWsId);
  updateWorkspaceState(nodeToken, wsId, { status: 'running', ports: [upstreamPort] } as any);
  updateWorkspaceState(nodeToken, otherWsId, { status: 'running', ports: [upstreamPort] } as any);
});

describe('预览目标判定（唯一出口）', () => {
  it('已登记端口 + running + 未过期 ⇒ 目标只能由节点 host 与该端口拼出', () => {
    const target = resolveWorkspacePreviewTarget(UID, wsId, upstreamPort);
    expect(target.host).toBe('127.0.0.1');
    expect(target.port).toBe(upstreamPort);
    expect(target.baseUrl).toBe(`http://127.0.0.1:${upstreamPort}`);
  });

  it('未登记端口拒绝', () => {
    expect(() => resolveWorkspacePreviewTarget(UID, wsId, upstreamPort + 1))
      .toThrow(/端口|PORT/);
  });

  it('端口越界 / 非整数拒绝', () => {
    expect(() => resolveWorkspacePreviewTarget(UID, wsId, 0)).toThrow();
    expect(() => resolveWorkspacePreviewTarget(UID, wsId, 70000)).toThrow();
    expect(() => resolveWorkspacePreviewTarget(UID, wsId, 1.5)).toThrow();
  });

  it('他人工作区越权拒绝', () => {
    expect(() => resolveWorkspacePreviewTarget(UID, otherWsId, upstreamPort))
      .toThrow(/无权|FORBIDDEN|不存在/);
  });

  it('★ 工作区停止 / TTL 到期后预览立即失效', () => {
    db.prepare("UPDATE runtime_workspace SET status = 'stopped' WHERE id = ?").run(wsId);
    expect(() => resolveWorkspacePreviewTarget(UID, wsId, upstreamPort)).toThrow(/运行|状态/);
    db.prepare("UPDATE runtime_workspace SET status = 'running', expires_at = ? WHERE id = ?")
      .run(Date.now() - 1000, wsId);
    expect(() => resolveWorkspacePreviewTarget(UID, wsId, upstreamPort)).toThrow(/过期|TTL|到期/);
  });

  it('★ 节点 host 含 scheme / 路径 / 云元数据地址一律拒绝（不允许任意内网代理）', () => {
    for (const bad of ['http://evil.example', '127.0.0.1/path', '169.254.169.254', 'metadata.google.internal', 'a@b']) {
      db.prepare('UPDATE runtime_node SET preview_host = ? WHERE id = ?').run(bad, nodeId);
      expect(() => resolveWorkspacePreviewTarget(UID, wsId, upstreamPort), `host=${bad}`).toThrow();
    }
    db.prepare('UPDATE runtime_node SET preview_host = ? WHERE id = ?').run('127.0.0.1', nodeId);
  });
});

describe('真实 HTTP 代理', () => {
  it('登记端口可预览，子路径与 query 都保留', async () => {
    const res = await fetch(previewUrl(wsId, upstreamPort, 'hello/world', '?x=1'));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('preview-ok:/hello/world?x=1');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(hitCount).toBe(1);
  });

  it('★ 不透传 Authorization / Cookie，且不把上游 Set-Cookie 回给用户', async () => {
    const res = await fetch(previewUrl(wsId, upstreamPort), {
      headers: { Authorization: 'Bearer secret-token', Cookie: 'auth=secret-cookie' },
    });
    expect(res.status).toBe(200);
    expect(seenHeaders.authorization).toBeUndefined();
    expect(seenHeaders.cookie).toBeUndefined();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('★ 不跟随上游 3xx，避免被导向任意内网地址', async () => {
    const res = await fetch(previewUrl(wsId, upstreamPort, 'redirect'), { redirect: 'manual' });
    expect(res.status).toBe(502);
    expect(hitCount).toBe(1);
  });

  it('未登记端口 / 越权 / 停止 / TTL 到期都拒绝且不打上游', async () => {
    const before = hitCount;
    expect((await fetch(previewUrl(wsId, upstreamPort + 1))).status).toBeGreaterThanOrEqual(400);
    expect((await fetch(previewUrl(otherWsId, upstreamPort))).status).toBeGreaterThanOrEqual(400);
    db.prepare("UPDATE runtime_workspace SET status = 'stopped' WHERE id = ?").run(wsId);
    expect((await fetch(previewUrl(wsId, upstreamPort))).status).toBeGreaterThanOrEqual(400);
    db.prepare("UPDATE runtime_workspace SET status = 'running', expires_at = ? WHERE id = ?")
      .run(Date.now() - 1000, wsId);
    expect((await fetch(previewUrl(wsId, upstreamPort))).status).toBeGreaterThanOrEqual(400);
    expect(hitCount).toBe(before);
  });

  it('端口关闭 ⇒ 502 且从登记列表移除，后续请求立即失效', async () => {
    await new Promise<void>((r) => upstreamServer.close(() => r()));
    const res = await fetch(previewUrl(wsId, upstreamPort));
    expect(res.status).toBe(502);
    expect(() => resolveWorkspacePreviewTarget(UID, wsId, upstreamPort)).toThrow(/端口|PORT/);
  });
});
