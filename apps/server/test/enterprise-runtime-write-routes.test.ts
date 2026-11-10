/**
 * Task 7 写路径验收：真实 Express 路由 + SQLite repository。
 *
 * 这组测试不验证内部调用了哪个函数，而是从用户视角发 HTTP 请求，
 * 断言任务取消与工作区停止后的持久化状态、越权隔离和重复停止幂等。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { db } from '../src/db.js';
import { ensureEnterpriseSchema } from '../src/enterprise/schema.js';
import { seedRbac } from '../src/rbac.js';
import {
  createRuntimeNode, createRuntimeTask, createWorkspace,
} from '../src/enterprise/runtime.js';
import { resetEnterpriseRepositoryForTest } from '../src/enterprise/repository.js';
import { enterpriseUserRouter } from '../src/routes/enterprise.js';

const UID = 'guest';
const OTHER = 'u_runtime_write_other';
let appServer: Server;
let appBase = '';
let nodeId = '';
let workspaceId = '';
let taskId = '';

async function listen(app: express.Express): Promise<[Server, number]> {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  return [server, (server.address() as any).port];
}

async function json(res: Response): Promise<any> {
  const body = await res.json();
  return body?.data ?? body;
}

beforeAll(async () => {
  ensureEnterpriseSchema();
  seedRbac();
  db.prepare('DELETE FROM runtime_event WHERE runtime_task_id IN (SELECT id FROM runtime_task WHERE owner_user_id IN (?, ?))').run(UID, OTHER);
  db.prepare('DELETE FROM runtime_task WHERE owner_user_id IN (?, ?)').run(UID, OTHER);
  db.prepare('DELETE FROM runtime_workspace WHERE owner_user_id IN (?, ?)').run(UID, OTHER);
  db.prepare('DELETE FROM runtime_node WHERE owner_user_id IN (?, ?)').run(UID, OTHER);
  db.prepare('DELETE FROM user WHERE id = ?').run(OTHER);
  db.prepare('INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(UID, 'guest', '!test', Date.now());
  db.prepare('INSERT INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(OTHER, 'runtime-write-other', '!test', Date.now());
  nodeId = createRuntimeNode(UID, { name: '写路径测试节点' }).node.id;

  const app = express();
  app.use(express.json());
  app.use('/api/enterprise', enterpriseUserRouter);
  const [server, port] = await listen(app);
  appServer = server;
  appBase = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => appServer.close(() => resolve()));
  await resetEnterpriseRepositoryForTest();
});

beforeEach(() => {
  db.prepare('DELETE FROM runtime_event WHERE runtime_task_id IN (SELECT id FROM runtime_task WHERE owner_user_id IN (?, ?))').run(UID, OTHER);
  db.prepare('DELETE FROM runtime_task WHERE owner_user_id IN (?, ?)').run(UID, OTHER);
  db.prepare('DELETE FROM runtime_workspace WHERE owner_user_id IN (?, ?)').run(UID, OTHER);
  workspaceId = createWorkspace(UID, { nodeId, name: '写路径工作区' } as any).id;
  taskId = createRuntimeTask(UID, {
    nodeId, workspaceId, kind: 'command', payload: { command: 'sleep 10' },
  }).id;
});

describe('POST /runtime/tasks/:id/cancel', () => {
  it('取消自己的 queued 任务并返回 cancelled 状态', async () => {
    const res = await fetch(`${appBase}/api/enterprise/runtime/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);
    const task = await json(res);
    expect(task.state).toBe('cancelled');
    expect(task.ended_at).toEqual(expect.any(Number));
    expect((db.prepare('SELECT state FROM runtime_task WHERE id = ?').get(taskId) as any).state)
      .toBe('cancelled');
  });

  it('取消他人任务被拒绝且原任务保持 queued', async () => {
    const otherTaskId = createRuntimeTask(UID, {
      nodeId, workspaceId, kind: 'command', payload: {},
    }).id;
    db.prepare('UPDATE runtime_task SET owner_user_id = ? WHERE id = ?').run(OTHER, otherTaskId);

    const res = await fetch(`${appBase}/api/enterprise/runtime/tasks/${otherTaskId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(400);
    expect((db.prepare('SELECT state FROM runtime_task WHERE id = ?').get(otherTaskId) as any).state)
      .toBe('queued');
  });

  it('重复取消保持首次 ended_at，不存在的任务明确报错', async () => {
    const cancel = () => fetch(`${appBase}/api/enterprise/runtime/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const first = await json(await cancel());
    const second = await json(await cancel());
    expect(second.state).toBe('cancelled');
    expect(second.ended_at).toBe(first.ended_at);

    const missing = await fetch(`${appBase}/api/enterprise/runtime/tasks/not-exist/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(missing.status).toBe(400);
  });
});

describe('POST /runtime/workspaces/:id/stop', () => {
  it('停止工作区返回 stopping 并真实入队 workspace_stop', async () => {
    const res = await fetch(`${appBase}/api/enterprise/runtime/workspaces/${workspaceId}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);
    expect((await json(res)).status).toBe('stopping');
    const rows = db.prepare(
      "SELECT payload_json FROM runtime_task WHERE workspace_id = ? AND kind = 'workspace_stop'",
    ).all(workspaceId) as any[];
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].payload_json)).toMatchObject({
      workspaceId,
      mode: 'directory',
      keepDir: false,
    });
  });

  it('重复停止同一工作区不重复入队', async () => {
    for (let i = 0; i < 2; i += 1) {
      const res = await fetch(`${appBase}/api/enterprise/runtime/workspaces/${workspaceId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(res.status).toBe(200);
    }
    const row = db.prepare(
      "SELECT COUNT(*) AS n FROM runtime_task WHERE workspace_id = ? AND kind = 'workspace_stop'",
    ).get(workspaceId) as any;
    expect(row.n).toBe(1);
  });

  it('停止他人工作区被拒绝且不创建停止任务', async () => {
    db.prepare('UPDATE runtime_workspace SET owner_user_id = ? WHERE id = ?').run(OTHER, workspaceId);
    const res = await fetch(`${appBase}/api/enterprise/runtime/workspaces/${workspaceId}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(400);
    const row = db.prepare(
      "SELECT COUNT(*) AS n FROM runtime_task WHERE workspace_id = ? AND kind = 'workspace_stop'",
    ).get(workspaceId) as any;
    expect(row.n).toBe(0);
  });
});
