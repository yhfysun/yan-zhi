import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { parseSSE } from './stream.js';
import { parseAnthropicSSE, anthropicResponseToChunk } from './anthropic.js';
import { parseResponsesSSE, responsesResultToChunk } from './responses.js';
import { normalizeOpenAiUsage } from '@yan-zhi/shared';

// tools/ 是仓库根的 CJS 脚本（也可独立 `node tools/mock-llm-server.cjs` 跑）。
// 测试里用 createRequire 加载，避免 vitest 对 CJS 具名导出的 interop 差异。
const require = createRequire(import.meta.url);
const { createMockLlmServer, MOCK_MODEL_ID, MOCK_TOOL, MOCK_USAGE, MOCK_TEXT_PREFIX } = require('../../../../tools/mock-llm-server.cjs') as {
  createMockLlmServer: () => Server & { mockStats: { total: number; byPath: Record<string, number> } };
  MOCK_MODEL_ID: string;
  MOCK_TOOL: { name: string; arguments: string; callId: string };
  MOCK_USAGE: { normalized: Record<string, number>; openai: any; responses: any; anthropic: any };
  MOCK_TEXT_PREFIX: string;
};

/**
 * 真跑验证（验收标准 3 的第二半）：**真起 HTTP server + 真 fetch + 真解析器**。
 *
 * 单测（responses.test.ts 等）证明的是「给定这段 SSE 文本，解析器产出对」；
 * 本文件证明的是「server 发出的字节流，解析器逐字节吃掉后仍然对」——
 * 中间隔着真实的 TCP / chunk 分片 / Content-Type，差的正是这一层。
 *
 * ★ 核心断言「殊途同归」：同一个逻辑用量，三家线上表示不同
 *   （OpenAI 把 cached 放进 prompt；Anthropic 把 cache_read 放在 input 之外），
 *   归一化后 detail 必须**完全一致**。这条同时钉住坑 #1（语义相反）。
 */

let server: Server & { mockStats: { total: number; byPath: Record<string, number> } };
let base = '';

beforeAll(async () => {
  server = createMockLlmServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

/** 发一次请求，返回 { status, json?, stream? } */
async function call(path: string, body: any, opts: { stream?: boolean; headers?: Record<string, string> } = {}) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: JSON.stringify(body),
  });
  if (opts.stream) return { status: res.status, stream: res.body ?? undefined };
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** 取流式 body（mock server 必然返回；没有就是 mock 或 fetch 层出了问题） */
function body(r: { stream?: ReadableStream<Uint8Array> }): ReadableStream<Uint8Array> {
  if (!r.stream) throw new Error('mock server 未返回流式 body');
  return r.stream;
}

/** 汇总流式产出（与任务主循环同构：content 拼接 + 末帧 usage + 终态）。
 *
 * ★ toolCalls 的拼接**镜像**生产实现 `accumulateToolCallDeltas`（唯一实现在
 *   apps/server/src/llm-task-manager.ts，core 测试不跨包 import）：
 *   重发完整 arguments（以既有内容为前缀，**含等长**）→ 替换；正常增量 → 追加。
 *   2026-10-18：Responses 的 output_item.done 带等长完整串，漏判会拼成非法 JSON。
 */
async function drain(iter: AsyncIterable<any>) {
  let content = '';
  let reasoning = '';
  const toolMap = new Map<number, { id?: string; name?: string; args: string }>();
  let finishReason: string | undefined;
  let usage: any;
  let terminated: boolean | undefined;
  for await (const c of iter) {
    if (c.delta?.content) content += c.delta.content;
    if (c.delta?.reasoningContent) reasoning += c.delta.reasoningContent;
    for (const tc of c.delta?.toolCalls || []) {
      const slot = toolMap.get(tc.index) || { args: '' };
      if (tc.id) slot.id = tc.id;
      if (tc.function?.name) slot.name = tc.function.name;
      const inc = tc.function?.arguments || '';
      const isResend = inc.length >= slot.args.length && inc.startsWith(slot.args);
      slot.args = isResend ? inc : slot.args + inc;
      toolMap.set(tc.index, slot);
    }
    if (c.finishReason) finishReason = c.finishReason;
    if (c.usage) usage = c.usage;
    if (c.terminated !== undefined) terminated = c.terminated;
  }
  return {
    content,
    reasoning,
    tools: [...toolMap.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v),
    finishReason,
    usage,
    terminated,
  };
}

const OPENAI_BODY = { model: MOCK_MODEL_ID, stream: true, messages: [{ role: 'user', content: '你好' }] };
const ANTHROPIC_BODY = { model: MOCK_MODEL_ID, stream: true, max_tokens: 64, messages: [{ role: 'user', content: '你好' }] };
const RESPONSES_BODY = { model: MOCK_MODEL_ID, stream: true, input: [{ role: 'user', content: [{ type: 'input_text', text: '你好' }] }] };

describe('真跑：OpenAI Chat Completions（fetch → parseSSE）', () => {
  it('文本流：content 拼接正确、finishReason=stop、detail 命中归一化期望值', async () => {
    const stream = body(await call('/v1/chat/completions', OPENAI_BODY, { stream: true }));
    const r = await drain(parseSSE(stream));
    expect(r.content).toBe(`${MOCK_TEXT_PREFIX}: 你好`);
    expect(r.finishReason).toBe('stop');
    expect(r.terminated).toBe(true);
    // 旧字段（喂 token 预算的混合语义）保持线上原值
    expect(r.usage?.promptTokens).toBe(MOCK_USAGE.openai.prompt_tokens);
    expect(r.usage?.completionTokens).toBe(MOCK_USAGE.openai.completion_tokens);
    // 新字段（计价唯一输入）：cached 是 prompt 子集 ⇒ 全价输入要减掉
    expect(r.usage?.detail).toEqual(MOCK_USAGE.normalized);
  });

  it('工具调用流：toolCalls 的 index/id/name/arguments 完整（与 OpenAI 路径同形）', async () => {
    const stream = body(await call('/v1/chat/completions', {
      ...OPENAI_BODY,
      tools: [{ type: 'function', function: { name: 'get_time', parameters: { type: 'object' } } }],
    }, { stream: true }));
    const r = await drain(parseSSE(stream));
    expect(r.finishReason).toBe('tool_calls');
    expect(r.tools).toEqual([{ id: MOCK_TOOL.callId, name: MOCK_TOOL.name, args: MOCK_TOOL.arguments }]);
    expect(r.usage?.detail).toEqual(MOCK_USAGE.normalized);
  });

  it('非流式（连通性测试走的路径）：JSON 形态 + 归一化后 detail 一致', async () => {
    const { json } = await call('/v1/chat/completions', { ...OPENAI_BODY, stream: false });
    expect(json.choices[0].message.content).toBe(`${MOCK_TEXT_PREFIX}: 你好`);
    expect(json.usage).toEqual(MOCK_USAGE.openai);
    expect(normalizeOpenAiUsage(json.usage)).toEqual(MOCK_USAGE.normalized);
  });
});

describe('真跑：Anthropic Messages（fetch → parseAnthropicSSE）', () => {
  it('文本流：两个来源的 usage 合并出完整 detail（message_start + message_delta）', async () => {
    const stream = body(await call('/v1/messages', ANTHROPIC_BODY, { stream: true }));
    const r = await drain(parseAnthropicSSE(stream));
    expect(r.content).toBe(`${MOCK_TEXT_PREFIX}: 你好`);
    expect(r.finishReason).toBe('end_turn');
    expect(r.terminated).toBe(true);
    // ★ 坑 #1：Anthropic 的 cache_read 不在 input_tokens 里 ⇒ 不做减法
    expect(r.usage?.detail).toEqual(MOCK_USAGE.normalized);
  });

  it('工具调用流：tool_use 块 → toolCalls 同形', async () => {
    const stream = body(await call('/v1/messages', {
      ...ANTHROPIC_BODY,
      tools: [{ name: 'get_time', input_schema: { type: 'object' } }],
    }, { stream: true }));
    const r = await drain(parseAnthropicSSE(stream));
    expect(r.finishReason).toBe('tool_use');
    expect(r.tools).toEqual([{ id: 'toolu_mock_1', name: MOCK_TOOL.name, args: MOCK_TOOL.arguments }]);
  });

  it('★ 坑 #2：x-mock-cache-write 注入 cache_creation ⇒ detail.cacheWriteTokens 真拿到（不是恒 0）', async () => {
    const stream = body(await call('/v1/messages', ANTHROPIC_BODY, { stream: true, headers: { 'x-mock-cache-write': '250' } }));
    const r = await drain(parseAnthropicSSE(stream));
    expect(r.usage?.detail.cacheWriteTokens).toBe(250);
  });

  it('非流式：anthropicResponseToChunk 直接吃 JSON', async () => {
    const { json } = await call('/v1/messages', { ...ANTHROPIC_BODY, stream: false });
    const chunk = anthropicResponseToChunk(json);
    expect(chunk.delta?.content).toBe(`${MOCK_TEXT_PREFIX}: 你好`);
    expect(chunk.finishReason).toBe('end_turn');
    expect(chunk.usage?.detail).toEqual(MOCK_USAGE.normalized);
  });
});

describe('真跑：OpenAI Responses（fetch → parseResponsesSSE）', () => {
  it('文本流：output_text.delta 拼接 + response.completed 收尾带 usage', async () => {
    const stream = body(await call('/v1/responses', RESPONSES_BODY, { stream: true }));
    const r = await drain(parseResponsesSSE(stream));
    expect(r.content).toBe(`${MOCK_TEXT_PREFIX}: 你好`);
    expect(r.finishReason).toBe('stop');
    expect(r.terminated).toBe(true);
    // 字段挂在 input_tokens_details，与 Chat Completions 不同名 ⇒ 不能用错归一化函数
    expect(r.usage?.detail).toEqual(MOCK_USAGE.normalized);
  });

  it('工具调用流：output_item.added/done + arguments.delta 三段合流', async () => {
    const stream = body(await call('/v1/responses', {
      ...RESPONSES_BODY,
      tools: [{ type: 'function', name: 'get_time', parameters: { type: 'object' } }],
    }, { stream: true }));
    const r = await drain(parseResponsesSSE(stream));
    expect(r.finishReason).toBe('tool_calls');
    expect(r.tools).toEqual([{ id: MOCK_TOOL.callId, name: MOCK_TOOL.name, args: MOCK_TOOL.arguments }]);
  });

  it('非流式：responsesResultToChunk 直接吃 JSON', async () => {
    const { json } = await call('/v1/responses', { ...RESPONSES_BODY, stream: false });
    const chunk = responsesResultToChunk(json);
    expect(chunk.delta?.content).toBe(`${MOCK_TEXT_PREFIX}: 你好`);
    expect(chunk.usage?.detail).toEqual(MOCK_USAGE.normalized);
  });
});

describe('★ 殊途同归：三协议归一化后 detail 完全一致（坑 #1 的端到端钉桩）', () => {
  it('同一个逻辑用量（输入 1000/命中 400/输出 200）⇒ 三家 detail 两两相等', async () => {
    const [oa, an, rp] = await Promise.all([
      drain(parseSSE(body(await call('/v1/chat/completions', OPENAI_BODY, { stream: true })))),
      drain(parseAnthropicSSE(body(await call('/v1/messages', ANTHROPIC_BODY, { stream: true })))),
      drain(parseResponsesSSE(body(await call('/v1/responses', RESPONSES_BODY, { stream: true })))),
    ]);
    expect(oa.usage?.detail).toEqual(MOCK_USAGE.normalized);
    expect(oa.usage?.detail).toEqual(an.usage?.detail);
    expect(oa.usage?.detail).toEqual(rp.usage?.detail);
  });
});

describe('★ 坑 #13：中转站乱报 usage 全 0 ⇒ 上层看到的是"缺失"而不是"免费"', () => {
  it('x-mock-usage-missing：三家 usage 都全 0（isMissingUsage 判据的场景）', async () => {
    const h = { 'x-mock-usage-missing': '1' };
    const oa = await drain(parseSSE(body(await call('/v1/chat/completions', OPENAI_BODY, { stream: true, headers: h }))));
    const an = await drain(parseAnthropicSSE(body(await call('/v1/messages', ANTHROPIC_BODY, { stream: true, headers: h }))));
    const rp = await drain(parseResponsesSSE(body(await call('/v1/responses', RESPONSES_BODY, { stream: true, headers: h }))));
    const sum = (d: any) => (d ? d.inputTokens + d.cacheReadTokens + d.cacheWriteTokens + d.outputTokens : -1);
    expect(sum(oa.usage?.detail)).toBe(0);
    expect(sum(an.usage?.detail)).toBe(0);
    expect(sum(rp.usage?.detail)).toBe(0);
  });
});

describe('mock server 基础设施', () => {
  it('GET /v1/models 返回 mock 模型（拉模型列表是国内厂商最先 404 的地方）', async () => {
    const res = await fetch(`${base}/v1/models`);
    const json = await res.json();
    expect(json.data.map((m: any) => m.id)).toContain(MOCK_MODEL_ID);
  });

  it('POST /v1/embeddings 可用（能力探测走这条路）', async () => {
    const { json } = await call('/v1/embeddings', { model: 'mock-embed-v1', input: 'hi' });
    expect(json.data[0].embedding.length).toBe(4);
  });

  it('未知路径 404 且带 mock 标识（排障时能认出打到的是 mock）', async () => {
    const res = await fetch(`${base}/v1/nope`, { method: 'POST' });
    expect(res.status).toBe(404);
    expect((await res.json()).error.message).toContain('mock-llm');
  });

  it('★ 请求计数（验收 5b「任务继续跑 ⇒ 请求数继续增长」的地基）', async () => {
    await fetch(`${base}/__reset`, { method: 'POST' });
    await call('/v1/chat/completions', { ...OPENAI_BODY, stream: false });
    await call('/v1/chat/completions', { ...OPENAI_BODY, stream: false });
    const stats = await (await fetch(`${base}/__stats`)).json();
    expect(stats.total).toBeGreaterThanOrEqual(2);
    expect(stats.byPath['/v1/chat/completions']).toBeGreaterThanOrEqual(2);
  });
});
