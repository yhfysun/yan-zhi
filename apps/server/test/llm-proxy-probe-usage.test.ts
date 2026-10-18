/**
 * probe 记账（2026-10-18，方案 §8 记录的缺口之一）—— 真 express + 真 temp DB + 真 mock 上游。
 *
 * ★ 为什么必须真跑：UI 的连通性测试（`LlmClient.chatTest`）走 llm-proxy 的**非流式**路径，
 *   此前这笔调用完全不进账本 ⇒ 账本对不上。本测试证明：
 *   ① 非流式转发成功后，usage 真的从响应体里被抠出来、真写进 `usage_event`
 *      （source='probe'，conversation_id=''）；
 *   ② 三协议归一化殊途同归（复用 shared 的 normalize*Usage，代理不另写解析）；
 *   ③ 上游没给 usage ⇒ 按原文估算（estimated=1）；
 *   ④ 流式/SSE 转发**不**重复记账（真实会话调用由 llm-task-manager 侧记）。
 *
 * ★ 变异验证：把 `recordProxyProbeUsage` 里的调用删掉 ⇒ ①② 打红；
 *   把 `isMissingUsage` 判定删掉 ⇒ ③ 打红。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { db } from '../src/db.js';
import llmProxyRouter from '../src/routes/llm-proxy.js';
import { recordStandaloneUsage } from '../src/services/usage-ledger.js';
import { estimateTokens } from '@yan-zhi/shared';

const require = createRequire(import.meta.url);
const { createMockLlmServer, MOCK_MODEL_ID, MOCK_USAGE } = require('../../../tools/mock-llm-server.cjs') as {
  createMockLlmServer: () => Server;
  MOCK_MODEL_ID: string;
  MOCK_USAGE: { normalized: Record<string, number> };
};

let upstream: Server;
let app: express.Express;
let server: Server | null = null;
let base = '';
let upstreamBase = '';

const PID = 'p_probe_test';

beforeAll(async () => {
  upstream = createMockLlmServer();
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  upstreamBase = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

  app = express();
  app.use(express.json());
  app.use('/api/llm', llmProxyRouter);
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  base = `http://127.0.0.1:${(server!.address() as any).port}/api/llm`;
});

afterAll(async () => {
  await new Promise<void>((r) => server!.close(() => r()));
  await new Promise<void>((r) => upstream.close(() => r()));
});

beforeEach(() => {
  db.prepare('DELETE FROM usage_event').run();
  db.prepare('DELETE FROM conversation_usage').run();
  db.prepare('DELETE FROM model WHERE platform_id = ?').run(PID);
  db.prepare('DELETE FROM platform WHERE id = ?').run(PID);
  db.prepare("INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES ('guest', 'guest', 'x', ?)").run(Date.now());
  db.prepare("INSERT INTO platform (id, user_id, name, protocol, api_url, api_key_enc, created_at) VALUES (?, 'guest', 'probe测试平台', 'openai', ?, '', ?)")
    .run(PID, upstreamBase, Date.now());
});

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

function probeEvents(): any[] {
  return db.prepare("SELECT * FROM usage_event WHERE source = 'probe'").all() as any[];
}

describe('llm-proxy probe 记账（非流式转发 → 真写账本）', () => {
  it('★ OpenAI 协议：非流式连通性测试真记 usage_event（conversation_id=""，tokens 与 mock 一致）', async () => {
    const r = await post('/chat/completions', {
      platformId: PID,
      payload: { model: MOCK_MODEL_ID, messages: [{ role: 'user', content: 'ping' }], stream: false, max_tokens: 5 },
    });
    expect(r.status).toBe(200);
    expect(r.json?.choices?.[0]?.message?.content).toBeTruthy(); // 转发本身没被记账破坏

    const ev = probeEvents();
    expect(ev.length).toBe(1);
    expect(ev[0].conversation_id).toBe('');
    expect(ev[0].platform_id).toBe(PID);
    expect(ev[0].model_id).toBe(MOCK_MODEL_ID);
    expect(ev[0].input_tokens).toBe(MOCK_USAGE.normalized.inputTokens);
    expect(ev[0].cache_read_tokens).toBe(MOCK_USAGE.normalized.cacheReadTokens);
    expect(ev[0].output_tokens).toBe(MOCK_USAGE.normalized.outputTokens);
    expect(ev[0].estimated).toBe(0); // 上游真给了 usage ⇒ 不是估算
    // 会话累计表同样落了（对账用）
    const cu = db.prepare("SELECT * FROM conversation_usage WHERE conversation_id = ''").get() as any;
    expect(cu).toBeTruthy();
    expect(cu.output_tokens).toBe(MOCK_USAGE.normalized.outputTokens);
  });

  it('★ Anthropic 协议（/messages）：归一化后与 OpenAI 殊途同归', async () => {
    const r = await post('/messages', {
      platformId: PID,
      payload: { model: MOCK_MODEL_ID, messages: [{ role: 'user', content: 'ping' }], stream: false, max_tokens: 5 },
    });
    expect(r.status).toBe(200);
    const ev = probeEvents();
    expect(ev.length).toBe(1);
    expect(ev[0].input_tokens).toBe(MOCK_USAGE.normalized.inputTokens);
    expect(ev[0].cache_read_tokens).toBe(MOCK_USAGE.normalized.cacheReadTokens);
    expect(ev[0].output_tokens).toBe(MOCK_USAGE.normalized.outputTokens);
  });

  it('★ Responses 协议：input_tokens_details 的 cached 归一化正确', async () => {
    const r = await post('/responses', {
      platformId: PID,
      payload: { model: MOCK_MODEL_ID, input: [{ role: 'user', content: [{ type: 'input_text', text: 'ping' }] }], stream: false, max_output_tokens: 5 },
    });
    expect(r.status).toBe(200);
    const ev = probeEvents();
    expect(ev.length).toBe(1);
    expect(ev[0].input_tokens).toBe(MOCK_USAGE.normalized.inputTokens);
    expect(ev[0].output_tokens).toBe(MOCK_USAGE.normalized.outputTokens);
  });

  it('★ 流式转发不记账（SSE 是字节转发；真实会话由 llm-task-manager 侧记，重复记=翻倍）', async () => {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platformId: PID, payload: { model: MOCK_MODEL_ID, messages: [{ role: 'user', content: 'ping' }], stream: true } }),
    });
    expect(res.status).toBe(200);
    await res.text(); // 消费完 SSE
    expect(probeEvents().length).toBe(0);
  });

  it('★ 上游 usage 全 0（中转站乱报）⇒ 按原文估算（estimated=1），不当免费', async () => {
    // mock 的 x-mock-usage-missing 只认请求头；代理不透传客户端头 ⇒ 直接单测估算分支（同一实现）
    const before = probeEvents().length;
    recordStandaloneUsage({
      conversationId: '', userId: 'guest', platformId: PID, modelId: MOCK_MODEL_ID,
      source: 'probe', detail: undefined,
      inputText: JSON.stringify({ model: MOCK_MODEL_ID, messages: [{ role: 'user', content: 'x'.repeat(400) }] }),
      outputText: 'ok',
    });
    const ev = probeEvents();
    expect(ev.length).toBe(before + 1);
    expect(ev[0].estimated).toBe(1);
    expect(ev[0].input_tokens).toBeGreaterThan(0);
    expect(ev[0].input_tokens).toBe(estimateTokens(JSON.stringify({ model: MOCK_MODEL_ID, messages: [{ role: 'user', content: 'x'.repeat(400) }] })));
  });
});
