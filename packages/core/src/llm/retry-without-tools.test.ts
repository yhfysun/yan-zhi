/**
 * 400 兜底降级判据 —— 守门测试（2026-10-12）。
 *
 * ★★★ 背景（用户实报「调用失败。LLM 请求失败: 400 Bad Request {"error":{"message":
 *   "messages 参数非法。请检查文档。","type":"upstream_error","param":"","code":"1214"}}」）：
 *   会话 f0a901e3 的 10:52:21 命中该 400。`chatStream` 本有「剥离 tool 协议降级重试」的兜底，
 *   但判据是**内联正则，只认 OpenAI 官方文案** —— new-api 网关返回笼统的「messages 参数非法」
 *   匹配不上 ⇒ 明明有路可走却直接抛给用户。
 *
 * ★ 本次把判据抽成纯函数 `shouldRetryWithoutTools` 并补**结构判据**。本测试钉住两类：
 *   · 网关同义文案（各厂商措辞不同，不能只认一家）
 *   · 结构：历史含 tool 痕迹 → 视为可疑 → 降级重试（降级安全：只改发送形态、不写库）
 */
import { describe, expect, it } from 'vitest';
import { shouldRetryWithoutTools } from './client';

const TOOL_ISH = [
  { role: 'user', content: '开始' },
  { role: 'assistant', content: '', tool_calls: [{ id: 'c1' }] },
  { role: 'tool', tool_call_id: 'c1', content: 'ok' },
];
const PLAIN = [
  { role: 'user', content: '你好' },
  { role: 'assistant', content: '嗨' },
];

describe('shouldRetryWithoutTools（2026-10-12）', () => {
  it('★★★ new-api 的「messages 参数非法」→ 应降级重试（本次实报的文案）', () => {
    const text = '{"error":{"message":"messages 参数非法。请检查文档。","type":"upstream_error","code":"1214"}}';
    expect(shouldRetryWithoutTools(text, TOOL_ISH, true)).toBe(true);
  });

  it('★ OpenAI 官方文案仍认（原有行为不回归）', () => {
    expect(shouldRetryWithoutTools('tool_calls must be followed by tool messages', TOOL_ISH, true)).toBe(true);
    expect(shouldRetryWithoutTools('model does not support tools', TOOL_ISH, true)).toBe(true);
    expect(shouldRetryWithoutTools('insufficient tool messages following tool_calls', TOOL_ISH, true)).toBe(true);
    expect(shouldRetryWithoutTools('unsupported tool_choice value', TOOL_ISH, true)).toBe(true);
  });

  it('★ 结构判据：历史含 tool 痕迹 → 即使文案不认识也降级重试', () => {
    expect(shouldRetryWithoutTools('some unknown gateway error', TOOL_ISH, true)).toBe(true);
  });

  it('★ 结构判据：仅 assistant.tool_calls 无 tool 消息 → 也算 tool 痕迹', () => {
    const msgs = [{ role: 'assistant', content: '', tool_calls: [{ id: 'x' }] }];
    expect(shouldRetryWithoutTools('whatever', msgs, true)).toBe(true);
  });

  it('★ 无 tools 时不降级（本就没带 tool 协议，降级无意义）', () => {
    expect(shouldRetryWithoutTools('messages 参数非法', TOOL_ISH, false)).toBe(false);
  });

  it('★ 干净历史 + 陌生文案 → 不降级（不误伤普通 400）', () => {
    expect(shouldRetryWithoutTools('some unknown gateway error', PLAIN, true)).toBe(false);
  });

  it('★ 空 text / 空 messages 不抛错', () => {
    expect(() => shouldRetryWithoutTools('', [], true)).not.toThrow();
    expect(shouldRetryWithoutTools('', [], true)).toBe(false);
  });
});
