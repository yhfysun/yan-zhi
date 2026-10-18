import { describe, it, expect } from 'vitest';
import {
  normalizeOpenAiUsage,
  normalizeAnthropicUsage,
  normalizeResponsesUsage,
  isMissingUsage,
  addUsageDetail,
  emptyUsageDetail,
} from './token-usage.js';

/**
 * 这套用例钉的是**「两家缓存语义相反」**这件事（2026-10-17）。
 *
 * ★ 变异验证要求：把 `normalizeAnthropicUsage` 错误地改成「复用 OpenAI 的减法口径」
 *   （`inputTokens = input_tokens - cache_read`）⇒ 下面第 2 组用例**必须**打红。
 *   不打红就说明用例没钉住这条最容易写错的规则。
 */
describe('用量归一化：OpenAI cached 是 prompt 子集', () => {
  it('prompt=1000 且 cached=400 ⇒ 全价输入 600、命中 400（不能拿 1000 去乘全价）', () => {
    const d = normalizeOpenAiUsage({
      prompt_tokens: 1000,
      completion_tokens: 200,
      prompt_tokens_details: { cached_tokens: 400 },
    });
    expect(d.inputTokens).toBe(600);
    expect(d.cacheReadTokens).toBe(400);
    expect(d.cacheWriteTokens).toBe(0);
    expect(d.outputTokens).toBe(200);
  });

  it('无 cached 字段 ⇒ 全额按输入计', () => {
    const d = normalizeOpenAiUsage({ prompt_tokens: 1000, completion_tokens: 10 });
    expect(d.inputTokens).toBe(1000);
    expect(d.cacheReadTokens).toBe(0);
  });
});

describe('用量归一化：Anthropic cache_read 不在 input 里（语义相反）', () => {
  it('input=600 / read=400 / write=200 ⇒ 全价输入仍是 600（**不做减法**）', () => {
    const d = normalizeAnthropicUsage(
      { input_tokens: 600, cache_read_input_tokens: 400, cache_creation_input_tokens: 200 },
      { output_tokens: 200 },
    );
    expect(d.inputTokens).toBe(600);
    expect(d.cacheReadTokens).toBe(400);
    // ★ 这是本次新增采集项：改之前根本没读 ⇒ 缓存写入费必然漏计
    expect(d.cacheWriteTokens).toBe(200);
    expect(d.outputTokens).toBe(200);
  });

  it('★ 合并两个来源：只传 start 会丢 output，只传 delta 会丢 input', () => {
    const startOnly = normalizeAnthropicUsage({ input_tokens: 600 }, undefined);
    expect(startOnly.inputTokens).toBe(600);
    expect(startOnly.outputTokens).toBe(0);

    const deltaOnly = normalizeAnthropicUsage(undefined, { output_tokens: 200 });
    expect(deltaOnly.inputTokens).toBe(0);
    expect(deltaOnly.outputTokens).toBe(200);
  });
});

describe('用量归一化：OpenAI Responses', () => {
  it('input=1000 且 cached=400 ⇒ 600 / 400 / 0', () => {
    const d = normalizeResponsesUsage({
      input_tokens: 1000,
      output_tokens: 200,
      input_tokens_details: { cached_tokens: 400 },
    });
    expect(d.inputTokens).toBe(600);
    expect(d.cacheReadTokens).toBe(400);
    expect(d.cacheWriteTokens).toBe(0);
    expect(d.outputTokens).toBe(200);
  });

  it('★ 不能复用 Chat Completions 的归一化（字段名不同，复用会静默全 0）', () => {
    const responses = {
      input_tokens: 1000,
      output_tokens: 200,
      input_tokens_details: { cached_tokens: 400 },
    };
    // 用错函数 ⇒ 什么都读不到
    const wrong = normalizeOpenAiUsage(responses);
    expect(wrong.inputTokens).toBe(0);
    expect(wrong.outputTokens).toBe(0);
    // 用对函数 ⇒ 正常
    expect(normalizeResponsesUsage(responses).inputTokens).toBe(600);
  });
});

describe('防御：脏数据不能击穿账本', () => {
  it('★ 中转站把 cached 报得比 prompt 还大 ⇒ 钳制，绝不产生负数', () => {
    const d = normalizeOpenAiUsage({
      prompt_tokens: 100,
      completion_tokens: 10,
      prompt_tokens_details: { cached_tokens: 999 },
    });
    expect(d.inputTokens).toBe(0);
    expect(d.cacheReadTokens).toBe(100);
    expect(d.inputTokens).toBeGreaterThanOrEqual(0);
  });

  it('字段缺失 / 类型异常 ⇒ 归 0 且不炸', () => {
    const d = normalizeOpenAiUsage({ prompt_tokens: undefined, completion_tokens: 'abc' });
    expect(d.inputTokens).toBe(0);
    expect(d.outputTokens).toBe(0);
    expect(normalizeAnthropicUsage(null, null).inputTokens).toBe(0);
  });
});

describe('isMissingUsage：区分「没给」与「真的是 0」', () => {
  it('全 0 usage ⇒ 视为缺失（中转站常这么报，直接当 0 会让费用恒 ¥0、阈值永不触发）', () => {
    expect(isMissingUsage(normalizeOpenAiUsage({ prompt_tokens: 0, completion_tokens: 0 }))).toBe(true);
    expect(isMissingUsage(undefined)).toBe(true);
  });

  it('有量 ⇒ 不缺失', () => {
    expect(isMissingUsage(normalizeOpenAiUsage({ prompt_tokens: 10, completion_tokens: 1 }))).toBe(false);
  });
});

describe('★ 本模块不得再导出 estimateTokens（避免静默覆盖既有实现）', () => {
  it('token-usage 的导出里没有 estimateTokens', async () => {
    // ★ 回归守卫：`export *` 的同名覆盖是**静默**的（tsc 不报错），
    //   而既有 estimateTokens 是上下文压缩判据的依赖项，被覆盖会让压缩永不触发。
    const mod: any = await import('./token-usage.js');
    expect(Object.keys(mod)).not.toContain('estimateTokens');
  });

  it('既有的 estimateTokens 仍可从 shared 顶层拿到，且对无空格文本不低估', async () => {
    const shared: any = await import('./index.js');
    expect(typeof shared.estimateTokens).toBe('function');
    // 20000 字符无空格 ASCII：真实约 5000 token，简陋的"长度/2"会给出 10000，更差的"按词算"给 1
    expect(shared.estimateTokens('x'.repeat(20_000))).toBeGreaterThan(1000);
    // CJK 1 字 ≈ 1.5 token
    expect(shared.estimateTokens('中'.repeat(100))).toBe(150);
  });
});

describe('addUsageDetail', () => {
  it('逐字段累加，estimated 取「都为估算」', () => {
    const a = { inputTokens: 1, cacheReadTokens: 2, cacheWriteTokens: 3, outputTokens: 4, estimated: true };
    const b = { inputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 30, outputTokens: 40, estimated: false };
    const s = addUsageDetail(a, b);
    expect(s.inputTokens).toBe(11);
    expect(s.cacheReadTokens).toBe(22);
    expect(s.cacheWriteTokens).toBe(33);
    expect(s.outputTokens).toBe(44);
    expect(s.estimated).toBe(false);
  });

  it('空明细累加不产生 NaN', () => {
    const s = addUsageDetail(emptyUsageDetail(), emptyUsageDetail(true));
    expect(s.inputTokens).toBe(0);
    expect(Number.isNaN(s.outputTokens)).toBe(false);
  });
});
