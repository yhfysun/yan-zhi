/**
 * 内置厂商目录三端点的行为级测试（2026-10-18，方案 §2.3 / §2.6）。
 *
 * ★ 钉的是"加完 Key 没法用"这条验收（§2.6 明确要求写进测试，别只靠眼看）：
 *   · from-preset 建的内置平台（is_builtin=1）必须能**拉模型**（数据层开放）；
 *   · 连接配置仍然禁改（PATCH 403）；
 *   · custom-model 一步建**不会留下半成品**（事务回滚）；
 *   · from-preset 幂等（宫格重复点击不重复建）。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { db } from '../src/db.js';
import platformsRouter from '../src/routes/platforms.js';

const app = express();
app.use(express.json());
app.use('/api/platforms', platformsRouter);

let server: Server | null = null;
let base = '';

beforeAll(async () => {
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  base = `http://127.0.0.1:${(server!.address() as any).port}/api/platforms`;
});

afterAll(async () => {
  await new Promise<void>((r) => server!.close(() => r()));
});

beforeEach(() => {
  // 只清本测试域：平台按 preset_key/名称识别，避免误删其它测试的数据
  const rows = db.prepare("SELECT id FROM platform WHERE user_id = 'guest' AND (preset_key IS NOT NULL OR name LIKE '测试%')").all() as any[];
  for (const r of rows) {
    db.prepare('DELETE FROM model WHERE platform_id = ?').run(r.id);
    db.prepare('DELETE FROM platform WHERE id = ?').run(r.id);
  }
});

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
};

describe('GET /catalog：目录 + 已添加态', () => {
  it('返回 15 家目录项（Bedrock 不在列），初始都未添加', async () => {
    const res = await fetch(`${base}/catalog`);
    const { data } = await res.json();
    expect(data.length).toBeGreaterThanOrEqual(15);
    expect(data.some((p: any) => /bedrock/i.test(p.key))).toBe(false);
    expect(data.every((p: any) => p.added === false)).toBe(true);
  });

  it('from-preset 后已添加态翻转且带 platformId', async () => {
    await post('/from-preset', { presetKey: 'deepseek', apiKey: 'sk-test-ds' });
    const res = await fetch(`${base}/catalog`);
    const { data } = await res.json();
    const ds = data.find((p: any) => p.key === 'deepseek');
    expect(ds.added).toBe(true);
    expect(ds.platformId).toBeTruthy();
    expect(ds.platformName).toBe('DeepSeek');
  });
});

describe('POST /from-preset：建内置平台', () => {
  it('建出 is_builtin=1 + preset_key + 目录 baseUrl/协议', async () => {
    const { status, json } = await post('/from-preset', { presetKey: 'volces-ark', apiKey: 'sk-volces' });
    expect(status).toBe(200);
    expect(json.data.is_builtin).toBe(true);
    expect(json.data.preset_key).toBe('volces-ark');
    expect(json.data.protocol).toBe('openai');
    expect(json.data.api_url).toBe('https://ark.cn-beijing.volces.com/api/v3');
    expect(json.data.name).toBe('火山引擎（方舟）');
  });

  it('★ 幂等：同 preset_key 再点一次返回既有平台（existed=true），不重复建', async () => {
    const first = await post('/from-preset', { presetKey: 'deepseek', apiKey: 'sk-1' });
    const second = await post('/from-preset', { presetKey: 'deepseek', apiKey: 'sk-2' });
    expect(second.json.existed).toBe(true);
    expect(second.json.data.id).toBe(first.json.data.id);
    const count = db.prepare("SELECT COUNT(*) AS n FROM platform WHERE user_id = 'guest' AND preset_key = 'deepseek'").get() as any;
    expect(count.n).toBe(1);
  });

  it('未知 presetKey ⇒ 400', async () => {
    expect((await post('/from-preset', { presetKey: 'no-such-preset' })).status).toBe(400);
  });
});

describe('★ 目录来源内置平台：模型数据层开放，连接配置仍禁改（验收 §2.6）', () => {
  it('preset 平台可以拉模型（models/batch 不再 403）', async () => {
    const { json } = await post('/from-preset', { presetKey: 'deepseek', apiKey: 'sk-x' });
    const pid = json.data.id;
    const res = await fetch(`${base}/models/batch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platformId: pid, models: [{ modelId: 'deepseek-v4-pro' }] }),
    });
    expect(res.status).toBe(200);
    const models = db.prepare('SELECT model_id FROM model WHERE platform_id = ?').all(pid) as any[];
    expect(models.map((m) => m.model_id)).toContain('deepseek-v4-pro');
  });

  it('★ 连接配置仍然禁改（PATCH 403）—— 「可拉模型」没有放松成「可改连接」', async () => {
    const { json } = await post('/from-preset', { presetKey: 'deepseek' });
    const pid = json.data.id;
    const res = await fetch(`${base}/${pid}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiUrl: 'https://evil.example.com' }),
    });
    expect(res.status).toBe(403);
  });

  it('「可供大模型调用」开关对内置平台可用（使用偏好 ≠ 连接配置）', async () => {
    const { json } = await post('/from-preset', { presetKey: 'zhipu-bigmodel' });
    const pid = json.data.id;
    const res = await fetch(`${base}/${pid}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ llmEnabled: false }),
    });
    expect(res.status).toBe(200);
    expect((db.prepare('SELECT llm_enabled FROM platform WHERE id = ?').get(pid) as any).llm_enabled).toBe(0);
  });

  it('非目录内置平台（is_builtin=1 且无 preset_key，如历史受管平台）维持原守卫（不可加模型）', async () => {
    // ollama-local 实际是 is_builtin=0（按 ID 前缀特判），所以这里手工造一个真 builtin 行
    db.prepare(
      "INSERT INTO platform (id, user_id, name, protocol, api_url, api_key_enc, headers_json, status, is_builtin, preset_key, pause_min_ms, pause_max_ms, created_at) VALUES ('p-managed-builtin', 'guest', '测试受管内置', 'openai', 'https://x.example.com', '', '{}', 1, 1, NULL, 0, 0, ?)",
    ).run(Date.now());
    const res = await fetch(`${base}/models/batch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platformId: 'p-managed-builtin', models: [{ modelId: 'x' }] }),
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /custom-model：一步式（事务原子性）', () => {
  it('平台 + 模型 + Key 同批落地', async () => {
    const { status, json } = await post('/custom-model', {
      apiFormat: 'openai', modelId: 'my-model-v1', displayName: '我的中转模型',
      apiUrl: 'https://my-relay.example.com/v1', apiKey: 'sk-relay',
    });
    expect(status).toBe(200);
    const p = db.prepare('SELECT * FROM platform WHERE id = ?').get(json.data.platformId) as any;
    expect(p.name).toBe('我的中转模型');
    expect(p.protocol).toBe('openai');
    expect(p.is_builtin).toBe(0);
    expect(p.preset_key).toBeNull();
    const m = db.prepare('SELECT * FROM model WHERE platform_id = ?').get(json.data.platformId) as any;
    expect(m.model_id).toBe('my-model-v1');
    expect(m.alias).toBe('我的中转模型');
    const key = db.prepare('SELECT api_key FROM platform_api_key WHERE platform_id = ?').get(json.data.platformId) as any;
    expect(key?.api_key).toBe('sk-relay');
  });

  it('apiFormat 非法值回落 openai（normalizeProtocol 兜底）', async () => {
    const { json } = await post('/custom-model', { apiFormat: 'bogus', modelId: 'm1' });
    const p = db.prepare('SELECT protocol FROM platform WHERE id = ?').get(json.data.platformId) as any;
    expect(p.protocol).toBe('openai');
  });

  it('缺 modelId ⇒ 400 且不留半成品', async () => {
    const before = (db.prepare("SELECT COUNT(*) AS n FROM platform WHERE user_id = 'guest'").get() as any).n;
    expect((await post('/custom-model', { apiFormat: 'openai', modelId: '  ' })).status).toBe(400);
    const after = (db.prepare("SELECT COUNT(*) AS n FROM platform WHERE user_id = 'guest'").get() as any).n;
    expect(after).toBe(before);
  });

  it('Responses 协议合法（三格式下拉的第二个选项）', async () => {
    const { json } = await post('/custom-model', { apiFormat: 'openai-responses', modelId: 'r1' });
    const p = db.prepare('SELECT protocol FROM platform WHERE id = ?').get(json.data.platformId) as any;
    expect(p.protocol).toBe('openai-responses');
  });
});
