// P0-1 / P0-2 测试：toolChoice 双协议映射 + Anthropic prompt caching 断点
// 2026-10-07 —— 配套 client.ts 的 toolChoice 透传与 cache_control 实现。
import { describe, it, expect } from 'vitest';
import {
  toOpenAIToolChoice,
  toAnthropicToolChoice,
  anthropicSystemField,
  markAnthropicToolsCached,
} from './client';

describe('toOpenAIToolChoice（P0-1）', () => {
  it('auto/required/none 原样透传（协议同形）', () => {
    expect(toOpenAIToolChoice('auto')).toBe('auto');
    expect(toOpenAIToolChoice('required')).toBe('required');
    expect(toOpenAIToolChoice('none')).toBe('none');
  });

  it('指定工具透传 function 形态', () => {
    expect(toOpenAIToolChoice({ type: 'function', name: 'extract_order' })).toEqual({
      type: 'function',
      name: 'extract_order',
    });
  });
});

describe('toAnthropicToolChoice（P0-1）', () => {
  it('auto → {type:auto}；required → {type:any}；none → {type:none}', () => {
    expect(toAnthropicToolChoice('auto')).toEqual({ type: 'auto' });
    expect(toAnthropicToolChoice('required')).toEqual({ type: 'any' });
    expect(toAnthropicToolChoice('none')).toEqual({ type: 'none' });
  });

  it('指定工具 → {type:tool, name}', () => {
    expect(toAnthropicToolChoice({ type: 'function', name: 'extract_order' })).toEqual({
      type: 'tool',
      name: 'extract_order',
    });
  });
});

describe('anthropicSystemField（P0-2 prompt caching）', () => {
  it('短 system（<4096 字符）直接发字符串——不断点开销', () => {
    const s = 'short system prompt';
    expect(anthropicSystemField(s)).toBe(s);
  });

  it('长 system（≥4096 字符）包装为 cache_control 断点块', () => {
    const s = 'x'.repeat(4096);
    const field = anthropicSystemField(s) as any[];
    expect(Array.isArray(field)).toBe(true);
    expect(field[0].type).toBe('text');
    expect(field[0].text).toBe(s);
    expect(field[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('恰好 4095 字符不打断点（边界）', () => {
    expect(anthropicSystemField('y'.repeat(4095))).toBe('y'.repeat(4095));
  });
});

describe('markAnthropicToolsCached（P0-2）', () => {
  it('在最后一个 tool 上打 cache_control 断点（前缀累积语义）', () => {
    const tools = [{ name: 'a' }, { name: 'b' }, { name: 'c' }] as unknown[];
    markAnthropicToolsCached(tools);
    expect((tools[0] as any).cache_control).toBeUndefined();
    expect((tools[1] as any).cache_control).toBeUndefined();
    expect((tools[2] as any).cache_control).toEqual({ type: 'ephemeral' });
  });

  it('空 tools 数组不抛错', () => {
    expect(() => markAnthropicToolsCached([])).not.toThrow();
  });
});
