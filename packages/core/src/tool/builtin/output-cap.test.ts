import { describe, it, expect } from 'vitest';
import { capToolOutput, MAX_TOOL_OUTPUT_CHARS } from './output-cap';

describe('capToolOutput', () => {
  it('未超限原样返回', () => {
    const s = 'hello world';
    expect(capToolOutput(s)).toBe(s);
  });

  it('空字符串/undefined 安全', () => {
    expect(capToolOutput('')).toBe('');
  });

  it('超限时截断到 max 附近并带标记', () => {
    const s = 'a'.repeat(MAX_TOOL_OUTPUT_CHARS + 5000);
    const out = capToolOutput(s);
    expect(out.length).toBeLessThanOrEqual(MAX_TOOL_OUTPUT_CHARS + 200);
    expect(out).toContain('[output truncated');
    expect(out).toContain('a'.repeat(500)); // 头部保留
  });

  it('尾部内容保留（错误信息常在末尾）', () => {
    const s = 'x'.repeat(MAX_TOOL_OUTPUT_CHARS) + 'THE_ERROR_AT_TAIL';
    const out = capToolOutput(s);
    expect(out).toContain('THE_ERROR_AT_TAIL');
  });

  it('自定义 max 生效', () => {
    const s = 'b'.repeat(2000);
    const out = capToolOutput(s, 100);
    expect(out).toContain('[output truncated');
    expect(out.length).toBeLessThanOrEqual(200);
  });
});
