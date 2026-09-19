// Anthropic 适配层单测：消息/工具转换、SSE 流解析、非流式响应映射。
// 重点守两处历史 bug：
//   1) toAnthropicMessages 曾把数组 content 整体塞进 text block（多模态消息必 400）；
//   2) llm-proxy /models 曾对 Anthropic 平台固定用 Bearer（官方 API 401，拉模型永远为空）。
//      该处为 server 侧一行改动，这里守它的语义前置：image block 转换正确性。
import { describe, expect, it } from 'vitest';
import type { Message } from '@yan-zhi/shared';
import {
  anthropicResponseToChunk,
  parseAnthropicSSE,
  toAnthropicMessages,
  toAnthropicTools,
} from './anthropic';

const msg = (m: Partial<Message>): Message => ({
  id: 'm1',
  conversationId: 'c1',
  role: 'user',
  createdAt: 0,
  ...m,
} as Message);

describe('toAnthropicMessages', () => {
  it('system 角色提取为顶层 system 字段，多条合并', () => {
    const r = toAnthropicMessages([
      msg({ role: 'system', content: '第一段' }),
      msg({ role: 'system', content: '第二段' }),
      msg({ role: 'user', content: '你好' }),
    ]);
    expect(r.system).toBe('第一段\n\n第二段');
    expect(r.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: '你好' }] },
    ]);
  });

  it('tool 消息聚合为紧跟 user 消息里的 tool_result', () => {
    const r = toAnthropicMessages([
      msg({ role: 'user', content: '北京天气?' }),
      msg({
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'tu1', messageId: 'm', toolName: 'get_weather', arguments: { city: '北京' } }] as any,
      }),
      msg({ role: 'tool', toolCallId: 'tu1', content: '晴' }),
      msg({ role: 'user', content: '谢谢' }),
    ]);
    expect(r.messages).toHaveLength(4);
    expect(r.messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 'tu1', name: 'get_weather', input: { city: '北京' } },
      ],
    });
    expect(r.messages[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu1', content: '晴' }],
    });
    // tool_result 之后的新 user 输入不能并进 tool_result 消息
    expect(r.messages[3]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: '谢谢' }],
    });
  });

  it('数组 content：OpenAI 风格 image_url（data URL）转为 base64 image block', () => {
    const r = toAnthropicMessages([
      msg({
        role: 'user',
        content: [
          { type: 'text', text: '什么颜色' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
        ] as any,
      }),
    ]);
    expect(r.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: '什么颜色' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
        ],
      },
    ]);
  });

  it('数组 content：http(s) 图片 URL 转 url source，Anthropic 原生 image block 透传', () => {
    const r = toAnthropicMessages([
      msg({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'BBBB' } },
        ] as any,
      }),
    ]);
    expect(r.messages[0].content).toEqual([
      { type: 'image', source: { type: 'url', url: 'https://example.com/a.png' } },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'BBBB' } },
    ]);
  });

  it('assistant 数组 content 也按块展开，不再整块塞进 text', () => {
    const r = toAnthropicMessages([
      msg({
        role: 'assistant',
        content: [{ type: 'text', text: '看图' }] as any,
      }),
    ]);
    expect(r.messages[0].content).toEqual([{ type: 'text', text: '看图' }]);
  });

  it('字符串 content 保持单 text block；空 content 兜底为空 text block', () => {
    const r = toAnthropicMessages([
      msg({ role: 'user', content: '' }),
      msg({ role: 'user', content: '正文' }),
    ]);
    expect(r.messages[0].content).toEqual([{ type: 'text', text: '' }]);
    expect(r.messages[1].content).toEqual([{ type: 'text', text: '正文' }]);
  });
});

describe('toAnthropicTools', () => {
  it('OpenAI function 工具转 Anthropic input_schema', () => {
    const tools = toAnthropicTools([
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: '查天气',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
      },
    ]);
    expect(tools).toEqual([
      {
        name: 'get_weather',
        description: '查天气',
        input_schema: { type: 'object', properties: { city: { type: 'string' } } },
      },
    ]);
  });

  it('空/undefined 返回空数组（不携带 tools 字段）', () => {
    expect(toAnthropicTools(undefined)).toEqual([]);
    expect(toAnthropicTools([])).toEqual([]);
  });
});

function sseStream(frames: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(frames));
      controller.close();
    },
  });
}

describe('parseAnthropicSSE', () => {
  it('文本 / 思考 / 工具调用 / 用量 事件统一映射为 ChatChunk', async () => {
    const stream = sseStream(
      [
        'event: message_start',
        'data: {"type":"message_start","message":{"usage":{"input_tokens":10}}}',
        '',
        'event: content_block_start',
        'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tu1","name":"get_weather"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":2,"delta":{"type":"thinking_delta","thinking":"思考"}}',
        '',
        'event: message_delta',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":5}}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
        '',
      ].join('\n'),
    );
    const chunks = [];
    for await (const c of parseAnthropicSSE(stream)) chunks.push(c);

    expect(chunks).toContainEqual({ delta: { toolCalls: [{ index: 0, id: 'tu1', type: 'function', function: { name: 'get_weather', arguments: '' } }] } });
    expect(chunks).toContainEqual({ delta: { toolCalls: [{ index: 0, function: { arguments: '{"city":' } }] } });
    expect(chunks).toContainEqual({ delta: { content: '你好' } });
    expect(chunks).toContainEqual({ delta: { reasoningContent: '思考' } });
    expect(chunks.at(-1)).toEqual({ finishReason: 'tool_use', usage: { promptTokens: 10, completionTokens: 5 } });
  });

  it('末帧无尾随空行也能解析', async () => {
    const stream = sseStream(
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"结尾"}}',
    );
    const chunks = [];
    for await (const c of parseAnthropicSSE(stream)) chunks.push(c);
    expect(chunks).toEqual([{ delta: { content: '结尾' } }]);
  });
});

describe('anthropicResponseToChunk', () => {
  it('非流式响应：text 聚合 + tool_use 映射 + usage', () => {
    const chunk = anthropicResponseToChunk({
      content: [
        { type: 'text', text: '答案' },
        { type: 'tool_use', id: 'tu1', name: 'fn', input: { a: 1 } },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 3, output_tokens: 7 },
    });
    expect(chunk.delta?.content).toBe('答案');
    expect(chunk.delta?.toolCalls).toEqual([
      { index: 0, id: 'tu1', type: 'function', function: { name: 'fn', arguments: '{"a":1}' } },
    ]);
    expect(chunk.finishReason).toBe('tool_use');
    expect(chunk.usage).toEqual({ promptTokens: 3, completionTokens: 7 });
  });
});
