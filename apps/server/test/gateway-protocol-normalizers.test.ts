import { describe, expect, it } from 'vitest';
import {
  normalizeAnthropicRequest,
  normalizeResponsesRequest,
} from '../src/services/gateway-protocol-normalizers.js';

describe('gateway protocol normalizers', () => {
  it('Responses function_call_output 转为内部 tool 消息', () => {
    const normalized = normalizeResponsesRequest({
      input: [
        { role: 'user', content: [{ type: 'input_text', text: '查时间' }] },
        { type: 'function_call', call_id: 'call_1', name: 'get_time', arguments: '{"tz":"UTC"}' },
        { type: 'function_call_output', call_id: 'call_1', output: '12:00' },
      ],
    });
    expect(normalized.messages.some((m) => m.role === 'assistant' && m.toolCalls?.[0]?.toolName === 'get_time')).toBe(true);
    expect(normalized.messages.some((m) => m.role === 'tool' && m.toolCallId === 'call_1')).toBe(true);
  });

  it('Anthropic tool_use / tool_result 转为内部工具协议', () => {
    const normalized = normalizeAnthropicRequest({
      max_tokens: 100,
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_time', input: { tz: 'UTC' } }],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '12:00' }],
        },
      ],
    });
    expect(normalized.messages.some((m) => m.role === 'assistant' && m.toolCalls?.[0]?.toolName === 'get_time')).toBe(true);
    expect(normalized.messages.some((m) => m.role === 'tool' && m.toolCallId === 'toolu_1')).toBe(true);
  });

  it('图片输入在文本网关边界明确拒绝', () => {
    expect(() => normalizeResponsesRequest({
      input: [{
        role: 'user',
        content: [{ type: 'input_image', image_url: 'data:image/png;base64,AA==' }],
      }],
    })).toThrow(/不支持/);
  });
});
