import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { db } from '../src/db.js';
import backgroundJobRoutes from '../src/routes/background-jobs.js';

let server: Server;
let baseUrl = '';
const TOKEN = 'route-test-token';

beforeAll(async () => {
  process.env.YZ_INTERNAL_TOKEN = TOKEN;
  db.prepare(
    'INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run('guest', 'guest', '!test-no-login', 0);
  db.prepare(
    'INSERT OR IGNORE INTO conversation (id, user_id, title, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('conv_background_route', 'guest', '后台任务路由测试', 'default', 0, 0);

  const app = express();
  app.use(express.json());
  app.use('/api/background-jobs', backgroundJobRoutes);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  delete process.env.YZ_INTERNAL_TOKEN;
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
});

function headers(extra: Record<string, string> = {}) {
  return {
    'Content-Type': 'application/json',
    'x-yz-internal-token': TOKEN,
    'x-yz-user-id': 'guest',
    ...extra,
  };
}

describe('background-jobs route', () => {
  it('内部 upsert -> 查询 -> 进度 -> 终态', async () => {
    const upsert = await fetch(`${baseUrl}/api/background-jobs/internal/upsert`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        kind: 'browser_download',
        conversationId: 'conv_background_route',
        taskId: 'task_route',
        toolCallId: 'call_route',
        title: '路由测试下载',
        status: 'running',
        idempotencyKey: 'route:download:1',
        adapterRef: 'desktop-download:1',
        bytesDone: 10,
        bytesTotal: 100,
      }),
    });
    expect(upsert.status).toBe(200);
    const created = (await upsert.json() as any).data;
    expect(created.jobId).toMatch(/^job_bg_/);

    const progress = await fetch(`${baseUrl}/api/background-jobs/internal/${created.jobId}/progress`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ bytesDone: 60, bytesTotal: 100, speedBps: 50 }),
    });
    expect(progress.status).toBe(200);
    expect((await progress.json() as any).data.progress).toBe(60);

    const finish = await fetch(`${baseUrl}/api/background-jobs/internal/${created.jobId}/finish`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        status: 'completed',
        artifactPaths: ['D:/downloads/test.zip'],
        bytesDone: 100,
        bytesTotal: 100,
      }),
    });
    expect(finish.status).toBe(200);
    const completed = (await finish.json() as any).data;
    expect(completed.status).toBe('completed');
    expect(completed.artifactPaths).toEqual(['D:/downloads/test.zip']);
  });

  it('内部 token 不匹配返回 404，不把回调面暴露给错误调用方', async () => {
    const rejected = await fetch(`${baseUrl}/api/background-jobs/internal/upsert`, {
      method: 'POST',
      headers: headers({ 'x-yz-internal-token': 'wrong' }),
      body: JSON.stringify({
        kind: 'browser_download',
        conversationId: 'conv_background_route',
        title: '不应创建',
      }),
    });
    expect(rejected.status).toBe(404);
  });
});
