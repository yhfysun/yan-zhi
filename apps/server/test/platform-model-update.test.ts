/**
 * PATCH /api/platforms/models/:mid 必须真正保存表单里的模型类型和模型 ID。
 * 回归：前端编辑类型为 embedding 后，后端漏处理 type 字段，接口表面成功但数据未变。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { db } from '../src/db.js';
import platformRoutes from '../src/routes/platforms.js';

const USER = 'guest';
const PID = 'p_model_update_test';
const MID = 'm_model_update_test';
let server: Server;
let base = '';

async function listen(app: express.Express): Promise<[Server, number]> {
  const s = await new Promise<Server>((resolve) => {
    const created = app.listen(0, '127.0.0.1', () => resolve(created));
  });
  return [s, (s.address() as any).port];
}

beforeAll(async () => {
  db.prepare('DELETE FROM model WHERE id = ?').run(MID);
  db.prepare('DELETE FROM platform WHERE id = ?').run(PID);
  db.prepare('INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(USER, 'guest', '!test', Date.now());
  db.prepare(
    `INSERT INTO platform (id, user_id, name, protocol, api_url, status, created_at)
     VALUES (?, ?, '模型更新测试平台', 'openai', 'https://example.test/v1', 1, ?)`,
  ).run(PID, USER, Date.now());
  db.prepare(
    `INSERT INTO model
      (id, platform_id, user_id, model_id, alias, type, context_window, capabilities_json,
       pricing_json, enabled, is_default, is_builtin, created_at)
     VALUES (?, ?, ?, 'old-model', '旧模型', 'llm', 8192, '["reasoning"]', '{}', 1, 0, 0, ?)`,
  ).run(MID, PID, USER, Date.now());

  const app = express();
  app.use(express.json());
  app.use('/api/platforms', platformRoutes);
  const [s, port] = await listen(app);
  server = s;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.prepare('DELETE FROM model WHERE id = ?').run(MID);
  db.prepare('DELETE FROM platform WHERE id = ?').run(PID);
});

describe('模型编辑保存', () => {
  it('切换类型为 embedding 后接口响应与数据库都更新', async () => {
    const res = await fetch(`${base}/api/platforms/models/${MID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'embedding' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.type).toBe('embedding');
    expect((db.prepare('SELECT type FROM model WHERE id = ?').get(MID) as any).type).toBe('embedding');
  });

  it('编辑模型 ID 也被持久化（同一表单字段不能静默丢失）', async () => {
    const res = await fetch(`${base}/api/platforms/models/${MID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: 'text-embedding-v4' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.model_id).toBe('text-embedding-v4');
    expect((db.prepare('SELECT model_id FROM model WHERE id = ?').get(MID) as any).model_id)
      .toBe('text-embedding-v4');
  });
});
