/** 节点控制面真实 HTTP 接线：管理员创建/更新/删除，节点注册/心跳，用户列表。 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { db } from '../src/db.js';
import { ensureEnterpriseSchema } from '../src/enterprise/schema.js';
import { seedRbac } from '../src/rbac.js';
import { resetEnterpriseRepositoryForTest } from '../src/enterprise/repository.js';
import {
  enterpriseAdminRouter, enterpriseRuntimeRouter, enterpriseUserRouter,
} from '../src/routes/enterprise.js';

const UID = 'guest';
let appServer: Server;
let appBase = '';

async function listen(app: express.Express): Promise<[Server, number]> {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  return [server, (server.address() as any).port];
}

async function data(res: Response): Promise<any> {
  const body = await res.json();
  return body?.data ?? body;
}

beforeAll(async () => {
  ensureEnterpriseSchema();
  seedRbac();
  db.prepare('DELETE FROM runtime_task WHERE owner_user_id = ?').run(UID);
  db.prepare('DELETE FROM runtime_workspace WHERE owner_user_id = ?').run(UID);
  db.prepare('DELETE FROM runtime_node WHERE owner_user_id = ?').run(UID);
  db.prepare('INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(UID, 'guest', '!test', Date.now());

  const app = express();
  app.use(express.json());
  app.use('/api/admin/enterprise', enterpriseAdminRouter);
  app.use('/api/enterprise', enterpriseUserRouter);
  app.use('/api/runtime/v1', enterpriseRuntimeRouter);
  const [server, port] = await listen(app);
  appServer = server;
  appBase = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => appServer.close(() => resolve()));
  await resetEnterpriseRepositoryForTest();
});

describe('节点控制面 HTTP', () => {
  it('管理员创建节点 → 节点注册/心跳 → 用户列表 → 管理员更新/删除', async () => {
    const createdRes = await fetch(`${appBase}/api/admin/enterprise/runtime/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'HTTP 节点', platform: 'win32', arch: 'x64', capabilities: ['command'],
      }),
    });
    expect(createdRes.status).toBe(201);
    const created = await data(createdRes);
    expect(created.token).toMatch(/^yzn\./);

    const registerRes = await fetch(`${appBase}/api/runtime/v1/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${created.token}` },
      body: JSON.stringify({
        platform: 'linux', capabilities: ['workspace_container'], previewHost: '127.0.0.1',
      }),
    });
    expect(registerRes.status).toBe(200);
    expect((await data(registerRes)).status).toBe('online');

    const heartbeatRes = await fetch(`${appBase}/api/runtime/v1/heartbeat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${created.token}` },
    });
    expect(heartbeatRes.status).toBe(200);
    expect((await data(heartbeatRes)).status).toBe('online');

    const listRes = await fetch(`${appBase}/api/enterprise/runtime/nodes`);
    expect(listRes.status).toBe(200);
    expect((await data(listRes)).some((n: any) => n.id === created.node.id)).toBe(true);

    const updateRes = await fetch(`${appBase}/api/admin/enterprise/runtime/nodes/${created.node.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'HTTP 节点改名', enabled: false }),
    });
    expect(updateRes.status).toBe(200);
    expect(await data(updateRes)).toMatchObject({ name: 'HTTP 节点改名', status: 'disabled' });

    const deleteRes = await fetch(`${appBase}/api/admin/enterprise/runtime/nodes/${created.node.id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);
    expect(db.prepare('SELECT id FROM runtime_node WHERE id = ?').get(created.node.id)).toBeUndefined();
  });

  it('无效节点 token 的注册与心跳均明确 401', async () => {
    for (const path of ['/api/runtime/v1/register', '/api/runtime/v1/heartbeat']) {
      const res = await fetch(`${appBase}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer yzn.invalid.invalid' },
        body: '{}',
      });
      expect(res.status).toBe(401);
    }
  });

  it('任务创建 → 节点领取 → 事件回传 → 完成/产物，以及工作区创建与状态回传', async () => {
    const created = await data(await fetch(`${appBase}/api/admin/enterprise/runtime/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'HTTP 任务节点' }),
    }));
    await fetch(`${appBase}/api/runtime/v1/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${created.token}` },
      body: JSON.stringify({ capabilities: ['command', 'workspace_container'] }),
    });

    const task = await data(await fetch(`${appBase}/api/enterprise/runtime/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeId: created.node.id, kind: 'command', payload: { command: 'echo http' },
      }),
    }));
    const claimed = await data(await fetch(`${appBase}/api/runtime/v1/tasks/next`, {
      headers: { Authorization: `Bearer ${created.token}` },
    }));
    expect(claimed.id).toBe(task.id);
    expect(claimed.state).toBe('running');

    const ack = await data(await fetch(`${appBase}/api/runtime/v1/tasks/${task.id}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${created.token}` },
      body: JSON.stringify({ events: [{ seq: 1, kind: 'stdout', payload: { text: 'ok' } }] }),
    }));
    expect(ack.inserted).toBe(1);
    const completed = await data(await fetch(`${appBase}/api/runtime/v1/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${created.token}` },
      body: JSON.stringify({
        state: 'completed', result: { ok: true }, exitCode: 0,
        artifacts: [{ name: 'http.txt', sizeBytes: 3 }],
      }),
    }));
    expect(completed.state).toBe('completed');
    expect((await data(await fetch(`${appBase}/api/enterprise/runtime/tasks/${task.id}/artifacts`)))[0].name)
      .toBe('http.txt');

    const ws = await data(await fetch(`${appBase}/api/enterprise/runtime/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: created.node.id, name: 'HTTP 工作区', image: 'alpine' }),
    }));
    const updated = await data(await fetch(`${appBase}/api/runtime/v1/workspaces/${ws.id}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${created.token}` },
      body: JSON.stringify({ status: 'running', path: '/tmp/http-ws', ports: [3000] }),
    }));
    expect(updated).toMatchObject({ status: 'running', path: '/tmp/http-ws', ports: [3000] });
  });
});
