import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { db } from '../src/db.js';
import { nodeAdapter } from '../src/node-adapter.js';
import localGatewayRouter from '../src/routes/local-gateway.js';
import { createGatewayClientKey } from '../src/services/gateway-client-keys.js';
import { setPlatformAdapter } from '@yan-zhi/core';

const require = createRequire(import.meta.url);
const { createMockLlmServer, MOCK_MODEL_ID, MOCK_USAGE } = require('../../../tools/mock-llm-server.cjs') as {
  createMockLlmServer: () => Server;
  MOCK_MODEL_ID: string;
  MOCK_USAGE: { normalized: Record<string, number> };
};

let upstream: Server;
let gateway: Server;
let gatewayBase = '';
let upstreamBase = '';
let apiKey = '';
let keyId = '';
const PID = 'p_gateway_test';
const MID = 'm_gateway_test';

beforeAll(async () => {
  setPlatformAdapter(nodeAdapter);
  upstream = createMockLlmServer();
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  upstreamBase = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

  const app = express();
  app.use(express.json());
  app.use('/gateway', localGatewayRouter);
  await new Promise<void>((resolve) => {
    gateway = app.listen(0, '127.0.0.1', resolve);
  });
  gatewayBase = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}/gateway`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => gateway.close(() => resolve()));
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

beforeEach(() => {
  db.prepare('DELETE FROM gateway_usage').run();
  db.prepare('DELETE FROM gateway_client_key').run();
  db.prepare('DELETE FROM model WHERE id = ?').run(MID);
  db.prepare('DELETE FROM platform WHERE id = ?').run(PID);
  db.prepare("INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES ('guest', 'guest', 'x', ?)").run(Date.now());
  db.prepare(`
    INSERT INTO platform (id, user_id, name, protocol, api_url, api_key_enc, created_at, llm_enabled)
    VALUES (?, 'guest', 'gateway测试平台', 'openai', ?, '', ?, 1)
  `).run(PID, upstreamBase, Date.now());
  db.prepare(`
    INSERT INTO model (id, platform_id, user_id, model_id, alias, type, context_window, capabilities_json, enabled, visible, created_at)
    VALUES (?, ?, 'guest', ?, 'Gateway Mock', 'llm', 32768, '[]', 1, 1, ?)
  `).run(MID, PID, MOCK_MODEL_ID, Date.now());
  db.prepare(`
    INSERT INTO app_config (key, value, updated_at)
    VALUES ('model_pools', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(JSON.stringify({ llm: [MID], routing: 'health' }), Date.now());
  const created = createGatewayClientKey(db, 'guest', { name: 'test-gateway', rpmLimit: 100 });
  apiKey = created.key;
  keyId = created.view.id;
});

async function request(path: string, body?: unknown, auth = true): Promise<Response> {
  return fetch(`${gatewayBase}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('local-gateway', () => {
  it('缺失或错误密钥返回 OpenAI 兼容 401', async () => {
    const res = await request('/v1/models', undefined, false);
    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.error.code).toBe('invalid_api_key');
  });

  it('本地反向代理若标记了远端来源，默认拒绝访问', async () => {
    const res = await fetch(`${gatewayBase}/v1/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Forwarded-For': '203.0.113.10',
      },
    });
    expect(res.status).toBe(403);
    expect((await res.json() as any).error.code).toBe('gateway_local_only');
  });

  it('模型列表只返回账号可用模型，并包含 auto', async () => {
    const res = await request('/v1/models');
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    const body = await res.json() as any;
    expect(body.data.some((m: any) => m.id === 'auto')).toBe(true);
    expect(body.data.some((m: any) => m.id === MOCK_MODEL_ID)).toBe(true);
  });

  it('密钥模型白名单在请求边界生效', async () => {
    db.prepare('UPDATE gateway_client_key SET allowed_models_json = ? WHERE id = ?')
      .run(JSON.stringify(['other-model']), keyId);
    const res = await request('/v1/chat/completions', {
      model: MOCK_MODEL_ID,
      messages: [{ role: 'user', content: 'ping' }],
      stream: false,
    });
    expect(res.status).toBe(403);
    expect((await res.json() as any).error.code).toBe('model_not_allowed');
  });

  it('非流式 chat 经统一模型链路返回，并写入网关用量与主费用账本', async () => {
    const res = await request('/v1/chat/completions', {
      model: 'auto',
      messages: [{ role: 'user', content: 'ping' }],
      stream: false,
      max_tokens: 32,
    });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    const body = await res.json() as any;
    expect(body.choices?.[0]?.message?.content).toBeTruthy();
    const usage = db.prepare('SELECT * FROM gateway_usage WHERE key_id = ?').get(keyId) as any;
    expect(usage).toBeTruthy();
    expect(usage.input_tokens).toBe(MOCK_USAGE.normalized.inputTokens);
    expect(usage.output_tokens).toBe(MOCK_USAGE.normalized.outputTokens);
    expect(db.prepare("SELECT COUNT(*) AS n FROM usage_event WHERE source = 'gateway'").get()).toMatchObject({ n: 1 });
  });

  it('流式 chat 返回标准 SSE，最终包含 usage 与 [DONE]', async () => {
    const res = await request('/v1/chat/completions', {
      model: 'auto',
      messages: [{ role: 'user', content: 'ping' }],
      stream: true,
      max_tokens: 32,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('data: ');
    expect(text).toContain('"usage"');
    expect(text.trim().endsWith('data: [DONE]')).toBe(true);
  });

  it('每日 token 上限在请求上游前拦截', async () => {
    db.prepare(`
      INSERT INTO gateway_usage
        (id, key_id, user_id, request_id, protocol, status, input_tokens, output_tokens, cost_cny, created_at)
      VALUES ('u_used', ?, 'guest', 'r0', 'openai-chat', 'ok', 100, 1, 0, ?)
    `).run(keyId, Date.now());
    db.prepare('UPDATE gateway_client_key SET daily_token_limit = 100 WHERE id = ?').run(keyId);
    const res = await request('/v1/chat/completions', {
      model: 'auto',
      messages: [{ role: 'user', content: 'ping' }],
      stream: false,
    });
    expect(res.status).toBe(429);
    expect((await res.json() as any).error.code).toBe('daily_token_limit');
  });
});
