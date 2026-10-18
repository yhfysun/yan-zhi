import { describe, it, expect } from 'vitest';
import {
  toResponsesInput,
  toResponsesTools,
  toResponsesToolChoice,
  parseResponsesSSE,
  responsesResultToChunk,
} from './responses.js';

/**
 * Responses 协议的验收核心：**下游一行都不用改**。
 *
 * 所以这里的断言全部盯"形状"——产出的 ChatChunk 必须与 OpenAI Chat 路径同形
 * （`delta.content` / `delta.reasoningContent` / `delta.toolCalls[index].function.arguments`），
 * 因为 `accumulateToolCallDeltas`、任务主循环、UI 渲染都只认这一套。
 *
 * ★ 变异验证要求：
 *   · 把 `instructions` 的合并改成"只取第一条 system" ⇒ 多条 system 用例**必须**打红；
 *   · 把 tool index 的递增改成固定 0 ⇒ 「多个工具」用例**必须**打红（参数会串台）；
 *   · 把 `usageToChunkUsage` 的 cached 映射删掉 ⇒ usage 用例**必须**打红。
 */

/** 把 SSE 文本包成 ReadableStream（parseResponsesSSE 的真实入参形态） */
function sse(text: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(text));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<any[]> {
  const out: any[] = [];
  for await (const c of parseResponsesSSE(stream)) out.push(c);
  return out;
}

describe('toResponsesInput：消息 → instructions + input[]', () => {
  it('system 进 instructions，user/assistant 进 input', () => {
    const r = toResponsesInput([
      { role: 'system', content: '你是助手' } as any,
      { role: 'user', content: '你好' } as any,
      { role: 'assistant', content: '嗨' } as any,
    ]);
    expect(r.instructions).toBe('你是助手');
    expect(r.input).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: '你好' }] },
      { role: 'assistant', content: [{ type: 'output_text', text: '嗨' }] },
    ]);
  });

  it('★ 多条 system 必须合并（各网关只给一个 instructions 字段，丢了就是静默丢约束）', () => {
    const r = toResponsesInput([
      { role: 'system', content: 'A' } as any,
      { role: 'system', content: 'B' } as any,
    ]);
    expect(r.instructions).toBe('A\n\nB');
    expect(r.input).toEqual([]);
  });

  it('图片 → input_image；文本与图片在同一条消息里共存', () => {
    const r = toResponsesInput([
      { role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image_url', image_url: { url: 'https://x/y.png' } }] } as any,
    ]);
    expect(r.input[0]).toEqual({
      role: 'user',
      content: [
        { type: 'input_text', text: '看图' },
        { type: 'input_image', image_url: 'https://x/y.png' },
      ],
    });
  });

  it('assistant 的 tool_calls → function_call item（arguments 是字符串）', () => {
    const r = toResponsesInput([
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"北京"}' } }],
      } as any,
    ]);
    expect(r.input[0]).toEqual({
      type: 'function_call',
      call_id: 'c1',
      name: 'get_weather',
      arguments: '{"city":"北京"}',
    });
  });

  it('role:tool → function_call_output（挂回 call_id）', () => {
    const r = toResponsesInput([
      { role: 'tool', tool_call_id: 'c1', content: '晴 25℃' } as any,
    ]);
    expect(r.input[0]).toEqual({ type: 'function_call_output', call_id: 'c1', output: '晴 25℃' });
  });

  it('★ 没有 call_id 的孤儿 tool 结果直接丢弃（造假 id 会挂到错误的调用上）', () => {
    expect(toResponsesInput([{ role: 'tool', content: 'x' } as any]).input).toEqual([]);
  });

  it('★ reasoning_content 不回传（与 OpenAI 路径同口径，避免污染历史）', () => {
    const r = toResponsesInput([
      { role: 'assistant', content: '答案', reasoning_content: '让我想想…' } as any,
    ]);
    expect(JSON.stringify(r.input)).not.toContain('让我想想');
  });
});

describe('toResponsesTools / toResponsesToolChoice', () => {
  it('去掉 OpenAI 的 function. 包装，字段平铺', () => {
    const r = toResponsesTools([
      { type: 'function', function: { name: 'f', description: 'd', parameters: { type: 'object' } } },
    ] as any);
    expect(r[0]).toEqual({ type: 'function', name: 'f', description: 'd', parameters: { type: 'object' } });
  });

  it('空 tools 返回空数组（不是 undefined）', () => {
    expect(toResponsesTools(undefined)).toEqual([]);
    expect(toResponsesTools([])).toEqual([]);
  });

  it('tool_choice 映射：auto / required / none / 指定函数', () => {
    expect(toResponsesToolChoice('auto')).toBe('auto');
    expect(toResponsesToolChoice('required')).toBe('required');
    expect(toResponsesToolChoice('none')).toBe('none');
    expect(toResponsesToolChoice({ type: 'function', name: 'f' })).toEqual({ type: 'function', name: 'f' });
    expect(toResponsesToolChoice(undefined)).toBe('auto');
  });
});

describe('parseResponsesSSE：事件 → ChatChunk（形状与 OpenAI 路径一致）', () => {
  it('文本流', async () => {
    const chunks = await collect(sse(
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"你好"}\n\n'
      + 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"世界"}\n\n'
      + 'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":100,"output_tokens":10,"input_tokens_details":{"cached_tokens":40}}}}\n\n',
    ));
    expect(chunks[0].delta.content).toBe('你好');
    expect(chunks[1].delta.content).toBe('世界');
    const last = chunks[chunks.length - 1];
    expect(last.terminated).toBe(true);
    expect(last.finishReason).toBe('stop');
    // ★ usage 形状与 OpenAI 路径一致（cached 是 prompt 的子集，不额外加）
    expect(last.usage).toEqual({
      promptTokens: 100,
      completionTokens: 10,
      cachedTokens: 40,
      // ★ 归一化：cached 是 input 的子集 ⇒ 全价输入 = 100 - 40 = 60
      detail: { inputTokens: 60, cacheReadTokens: 40, cacheWriteTokens: 0, outputTokens: 10 },
    });
  });

  it('reasoning 流 → delta.reasoningContent（两种事件名都要认）', async () => {
    const chunks = await collect(sse(
      'event: response.reasoning_summary_text.delta\ndata: {"type":"response.reasoning_summary_text.delta","delta":"思考A"}\n\n'
      + 'event: response.reasoning_text.delta\ndata: {"type":"response.reasoning_text.delta","delta":"思考B"}\n\n',
    ));
    expect(chunks[0].delta.reasoningContent).toBe('思考A');
    expect(chunks[1].delta.reasoningContent).toBe('思考B');
  });

  it('★ function_call 流：index 连续、id/name/arguments 与 OpenAI 路径同形', async () => {
    const chunks = await collect(sse(
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"type":"function_call","id":"i1","call_id":"c1","name":"get_weather"}}\n\n'
      + 'event: response.function_call_arguments.delta\ndata: {"type":"response.function_call_arguments.delta","item_id":"i1","delta":"{\\"city\\""}\n\n'
      + 'event: response.function_call_arguments.delta\ndata: {"type":"response.function_call_arguments.delta","item_id":"i1","delta":":\\"北京\\"}"}\n\n'
      + 'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","id":"i1","call_id":"c1","name":"get_weather","arguments":"{\\"city\\":\\"北京\\"}"}}\n\n'
      + 'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":5,"output_tokens":2}}}\n\n',
    ));
    const first = chunks[0].delta.toolCalls[0];
    expect(first.index).toBe(0);
    expect(first.id).toBe('c1');
    expect(first.function.name).toBe('get_weather');

    // 分片参数按 index 聚合（下游 accumulateToolCallDeltas 就是这么拼的）
    const args = chunks
      .map((c) => c.delta?.toolCalls?.[0]?.function?.arguments)
      .filter((x) => typeof x === 'string');
    expect(args.join('')).toContain('"city":"北京"');

    // 有工具调用 ⇒ finishReason 与 OpenAI 路径一致是 tool_calls
    const last = chunks[chunks.length - 1];
    expect(last.finishReason).toBe('tool_calls');
  });

  it('★ 多个工具：index 必须递增（固定 0 会让参数串到另一个工具上）', async () => {
    const chunks = await collect(sse(
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"type":"function_call","id":"i1","call_id":"c1","name":"A"}}\n\n'
      + 'event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"type":"function_call","id":"i2","call_id":"c2","name":"B"}}\n\n'
      + 'event: response.function_call_arguments.delta\ndata: {"type":"response.function_call_arguments.delta","item_id":"i2","delta":"{}"}\n\n',
    ));
    const idxs = chunks.flatMap((c) => (c.delta?.toolCalls || []).map((t: any) => t.index));
    expect(idxs).toContain(0);
    expect(idxs).toContain(1);
    // 第二个工具的分片必须落在 index 1 上
    const deltaIdx = chunks.find((c) => c.delta?.toolCalls?.[0]?.function?.arguments !== undefined && !c.delta?.toolCalls?.[0]?.function?.name)
      ?.delta.toolCalls[0].index;
    expect(deltaIdx).toBe(1);
  });

  it('★ response.incomplete ⇒ finishReason=length（与 OpenAI 的截断同义）', async () => {
    const chunks = await collect(sse(
      'event: response.incomplete\ndata: {"type":"response.incomplete","response":{"status":"incomplete","usage":{"input_tokens":3,"output_tokens":900}}}\n\n',
    ));
    const last = chunks[chunks.length - 1];
    expect(last.finishReason).toBe('length');
    expect(last.terminated).toBe(true);
  });

  it('★ 未见终态事件 ⇒ terminated:false（被掐断的流不能被当成正常完成）', async () => {
    const chunks = await collect(sse(
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"半截"}\n\n',
    ));
    expect(chunks[chunks.length - 1].terminated).toBe(false);
  });

  it('末帧不带尾随空行也不丢事件（真实网关常见）', async () => {
    const chunks = await collect(sse(
      'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":1,"output_tokens":1}}}',
    ));
    expect(chunks[chunks.length - 1].terminated).toBe(true);
  });

  it('脏帧 / 非 JSON 不炸', async () => {
    const chunks = await collect(sse('data: [DONE]\n\nevent: x\ndata: not-json\n\n'));
    expect(Array.isArray(chunks)).toBe(true);
  });
});

describe('responsesResultToChunk：非流式响应', () => {
  it('message + function_call + usage', () => {
    const c = responsesResultToChunk({
      status: 'completed',
      output: [
        { type: 'message', content: [{ type: 'output_text', text: '答案是 42' }] },
        { type: 'function_call', call_id: 'c1', name: 'calc', arguments: '{"a":1}' },
      ],
      usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 30 } },
    });
    expect(c.delta?.content).toBe('答案是 42');
    expect(c.delta?.toolCalls?.[0]).toEqual({ index: 0, id: 'c1', type: 'function', function: { name: 'calc', arguments: '{"a":1}' } });
    expect(c.finishReason).toBe('tool_calls');
    expect(c.usage).toEqual({
      promptTokens: 100,
      completionTokens: 20,
      cachedTokens: 30,
      detail: { inputTokens: 70, cacheReadTokens: 30, cacheWriteTokens: 0, outputTokens: 20 },
    });
    expect(c.terminated).toBe(true);
  });

  it('reasoning + 纯文本', () => {
    const c = responsesResultToChunk({
      status: 'completed',
      output: [
        { type: 'message', content: [{ type: 'reasoning_text', text: '想一下' }, { type: 'output_text', text: '好了' }] },
      ],
    });
    expect(c.delta?.reasoningContent).toBe('想一下');
    expect(c.delta?.content).toBe('好了');
    expect(c.finishReason).toBe('stop');
  });

  it('incomplete ⇒ length；空响应不炸', () => {
    expect(responsesResultToChunk({ status: 'incomplete', output: [] }).finishReason).toBe('length');
    expect(responsesResultToChunk(null).terminated).toBe(true);
    expect(responsesResultToChunk({}).delta).toBeUndefined();
  });
});
