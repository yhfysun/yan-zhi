import { describe, it, expect } from 'vitest';
import { parseSSE } from './stream.js';
import { parseAnthropicSSE, anthropicResponseToChunk } from './anthropic.js';
import { parseResponsesSSE } from './responses.js';

/**
 * ★ 归一化的**核心验收**（2026-10-17）：同样的实际用量，三家报法不同，归一化后必须**殊途同归**。
 *
 * 场景：本次调用真实输入 1000 token，其中 400 命中缓存；输出 200。
 *
 * | 协议               | 上游怎么报                                                    | 全价输入 |
 * | ---------------- | -------------------------------------------------------- | ---- |
 * | OpenAI chat      | `prompt_tokens=1000`，`cached=400`（**cached 是 prompt 的子集**）  | 600  |
 * | Anthropic        | `input_tokens=600`，`cache_read=400`（**不在 input 里**）          | 600  |
 * | OpenAI Responses | `input_tokens=1000`，`cached=400`（同 Chat Completions）        | 600  |
 *
 * 直接拿 `promptTokens` 去乘单价：OpenAI 会把那 400 按全价**重复算一遍**，Anthropic 会**整个漏掉**
 * 缓存读取量 —— 两个错误都不报错，只表现为"金额和账单对不上"。
 *
 * ★ 变异验证：把任一协议的全价输入改成不减（OpenAI/Responses）或减了（Anthropic）
 *   ⇒ 下面「三家一致」用例**必须**打红。
 */

function streamOf(text: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) { c.enqueue(enc.encode(text)); c.close(); },
  });
}

async function drain(gen: AsyncIterable<any>): Promise<any[]> {
  const out: any[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

const EXPECTED = { inputTokens: 600, cacheReadTokens: 400, cacheWriteTokens: 0, outputTokens: 200 };

describe('三协议用量归一化：殊途同归', () => {
  it('OpenAI Chat Completions：cached 是 prompt 的子集 ⇒ 全价输入要减', async () => {
    const chunks = await drain(parseSSE(streamOf([
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1000,"completion_tokens":200,"prompt_tokens_details":{"cached_tokens":400}}}',
      '',
    ].join('\n'))));
    const d = chunks.find((c) => c.usage)?.usage?.detail;
    expect(d).toMatchObject(EXPECTED);
  });

  it('Anthropic：cache_read 不在 input 里 ⇒ 全价输入**不做减法**', async () => {
    const chunks = await drain(parseAnthropicSSE(streamOf([
      'event: message_start',
      'data: {"type":"message_start","message":{"usage":{"input_tokens":600,"cache_read_input_tokens":400}}}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":200}}',
      '',
    ].join('\n'))));
    const d = chunks.find((c) => c.usage)?.usage?.detail;
    expect(d).toMatchObject(EXPECTED);
  });

  it('OpenAI Responses：同 Chat Completions（cached 是 input 的子集）', async () => {
    const chunks = await drain(parseResponsesSSE(streamOf([
      'event: response.completed',
      'data: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":1000,"output_tokens":200,"input_tokens_details":{"cached_tokens":400}}}}',
      '',
    ].join('\n'))));
    const d = chunks.find((c) => c.usage)?.usage?.detail;
    expect(d).toMatchObject(EXPECTED);
  });

  it('★ 三家归一化结果完全一致（这是"计价只认 detail"的前提）', async () => {
    const openai = (await drain(parseSSE(streamOf([
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1000,"completion_tokens":200,"prompt_tokens_details":{"cached_tokens":400}}}',
      '',
    ].join('\n'))))).find((c) => c.usage)?.usage?.detail;

    const anthropic = (await drain(parseAnthropicSSE(streamOf([
      'event: message_start',
      'data: {"type":"message_start","message":{"usage":{"input_tokens":600,"cache_read_input_tokens":400}}}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":200}}',
      '',
    ].join('\n'))))).find((c) => c.usage)?.usage?.detail;

    const responses = (await drain(parseResponsesSSE(streamOf([
      'event: response.completed',
      'data: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":1000,"output_tokens":200,"input_tokens_details":{"cached_tokens":400}}}}',
      '',
    ].join('\n'))))).find((c) => c.usage)?.usage?.detail;

    expect(openai).toMatchObject(EXPECTED);
    expect(anthropic).toMatchObject(EXPECTED);
    expect(responses).toMatchObject(EXPECTED);
    // 三家两两相等
    expect(anthropic).toEqual(openai);
    expect(responses).toEqual(openai);
  });

  it('★ 旧字段语义冻结：仍按各自协议的原始报法（继续喂 token 预算，不喂计价）', async () => {
    const chunks = await drain(parseSSE(streamOf([
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1000,"completion_tokens":200,"prompt_tokens_details":{"cached_tokens":400}}}',
      '',
    ].join('\n'))));
    const u = chunks.find((c) => c.usage)?.usage;
    // 旧字段：prompt 仍是 1000（含缓存），**没有**被改成 600
    expect(u.promptTokens).toBe(1000);
    expect(u.cachedTokens).toBe(400);
    // 新字段：全价输入 600
    expect(u.detail.inputTokens).toBe(600);
  });

  it('Anthropic 非流式同样产出 detail', () => {
    const d = (anthropicResponseToChunk({
      content: [{ type: 'text', text: 'x' }],
      usage: { input_tokens: 600, output_tokens: 200, cache_read_input_tokens: 400 },
    }) as any).usage?.detail;
    expect(d).toMatchObject(EXPECTED);
  });
});
