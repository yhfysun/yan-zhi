// 「深度思考」汇总的纯函数契约（2026-10-21）
//
// ★ 为什么单独钉：徽标上的字数、展开后的全文都来自这里。
//   两处最贵的错法都是"静默"的：
//     ① 字数走全量拼串 → agent 上百步的思考会让消息列表每次渲染卡一下（但功能看着正常）；
//     ② 有 finalAssistant.reasoningContent 时仍去聚合步骤 → 同一段思考被算重/展示两遍。
import { describe, it, expect } from 'vitest';
import { roundReasoningChars, roundReasoningText, REASONING_TEXT_MAX } from './reasoning-summary';
import type { MessageRound } from './message-rounds';

function round(partial: {
  own?: string;
  steps?: Array<string | undefined>;
}): MessageRound {
  return {
    user: null,
    steps: (partial.steps ?? []).map((reasoningContent) => ({
      reasoningContent,
      toolCalls: [],
      toolResults: [],
    })),
    allToolCalls: [],
    finalAssistant: partial.own === undefined
      ? null
      : ({ id: 'a1', role: 'assistant', content: '', reasoningContent: partial.own } as never),
  } as MessageRound;
}

describe('roundReasoningChars（徽标字数：轻量，不拼串）', () => {
  it('有最终回答的思考 → 只算它（不与步骤重复计）', () => {
    expect(roundReasoningChars(round({ own: 'abcde', steps: ['1234567890', '123'] }))).toBe(5);
  });

  it('没有最终思考 → 累加各步骤推理', () => {
    expect(roundReasoningChars(round({ steps: ['12345', undefined, '678'] }))).toBe(8);
  });

  it('空轮次 / null → 0（不渲染徽标）', () => {
    expect(roundReasoningChars(round({ steps: [] }))).toBe(0);
    expect(roundReasoningChars(null)).toBe(0);
    expect(roundReasoningChars(undefined)).toBe(0);
  });
});

describe('roundReasoningText（展开全文：只在用户点开时调用）', () => {
  it('有最终思考 → 直接用，不再拼步骤', () => {
    expect(roundReasoningText(round({ own: '收尾思考', steps: ['步骤一', '步骤二'] }))).toBe('收尾思考');
  });

  it('★ 无最终思考 → 按步骤拼接，编号沿用真实步骤序号（跳过空步骤也不串号）', () => {
    const text = roundReasoningText(round({ steps: ['甲', undefined, '乙'] }));
    expect(text).toContain('── 步骤 1 ──\n甲');
    expect(text).toContain('── 步骤 3 ──\n乙');
    expect(text).not.toContain('步骤 2');
  });

  it('★ 超长只保留尾部并明确告知（不静默截断）', () => {
    const long = 'a'.repeat(300) + '尾部标记';
    const text = roundReasoningText(round({ own: long }), 50);
    expect(text.length).toBeLessThan(long.length);
    expect(text).toContain('仅显示最后 50 字');
    expect(text.endsWith('尾部标记')).toBe(true);
  });

  it('未超长时原样返回（不引入任何前后缀噪声）', () => {
    const text = '一段正常的思考内容';
    expect(roundReasoningText(round({ own: text }))).toBe(text);
    expect(REASONING_TEXT_MAX).toBeGreaterThan(1000); // 上限别被误改成很小的值
  });

  it('空轮次 → 空串', () => {
    expect(roundReasoningText(round({ steps: [] }))).toBe('');
    expect(roundReasoningText(null)).toBe('');
  });
});
