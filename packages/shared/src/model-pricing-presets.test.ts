import { describe, it, expect } from 'vitest';
import {
  PRICING_PRESETS,
  PRESET_UPDATED_AT,
  resolvePresetPricing,
} from './model-pricing-presets.js';

/**
 * 这张表存在的意义是**让阈值真的会触发**（没有价格 ⇒ 费用恒 ¥0 ⇒ 提醒永不出现）。
 *
 * ★ 变异验证要求：把 `PRICING_PRESETS` 的顺序**反转**（通配项排到具体项前面）
 *   ⇒ 「具体型号优先」那组用例**必须**打红 —— 否则说明匹配顺序没被钉住，
 *   将来有人往表头插一条宽泛规则就会静默改变所有已收录型号的价。
 */
describe('主流模型必须查得到价（否则功能空转）', () => {
  const cases: Array<[string, number, number]> = [
    ['deepseek-v4-pro', 9, 27],
    ['deepseek-v4-flash', 3, 9],
    ['glm-5.3', 8, 28],
    ['qwen3.7-max', 12, 36],
    ['doubao-seed-2.0-pro', 3.2, 16],
    ['kimi-k3', 20, 100],
    ['hunyuan-hy3', 1, 4],
    ['MiniMax-M3', 2.01, 8.04],
  ];

  for (const [modelId, input, output] of cases) {
    it(`${modelId} → 输入 ${input} / 输出 ${output}`, () => {
      const hit = resolvePresetPricing(modelId);
      expect(hit, `${modelId} 未命中任何内置价`).toBeDefined();
      expect(hit!.pricing.input).toBeCloseTo(input, 6);
      expect(hit!.pricing.output).toBeCloseTo(output, 6);
    });
  }
});

describe('★ 匹配顺序：具体型号优先于通配兜底', () => {
  it('deepseek-v4-flash 不能被 pro 或兜底项截胡', () => {
    const hit = resolvePresetPricing('deepseek-v4-flash');
    expect(hit!.pricing.input).toBe(3);
    expect(hit!.pricing.input).not.toBe(9);
  });

  it('doubao-seed-2.0-lite 走 Lite 档，不是 Pro 档', () => {
    expect(resolvePresetPricing('doubao-seed-2.0-lite')!.pricing.input).toBe(1.2);
  });

  it('未收录型号（含 OpenAI/Anthropic）⇒ undefined，由调用方按「未配价」处理', () => {
    // ★ 国际厂商 2026 年调过价，没有可核对的现价就**不写**，宁可标未知也不冒充精确
    expect(resolvePresetPricing('gpt-5.6')).toBeUndefined();
    expect(resolvePresetPricing('claude-opus-4.5')).toBeUndefined();
    expect(resolvePresetPricing('')).toBeUndefined();
    expect(resolvePresetPricing(undefined as unknown as string)).toBeUndefined();
  });
});

describe('不变量：表里每一条都必须可直接用于计价', () => {
  it('全部 configured:true（否则会被当成「未配价」而永远算 0 元）', () => {
    for (const p of PRICING_PRESETS) {
      expect(p.pricing.configured, `${p.label} 未标 configured`).toBe(true);
    }
  });

  it('全部 unit=per_1m 且币种合法（单位错了会差 1000 倍）', () => {
    for (const p of PRICING_PRESETS) {
      expect(p.pricing.unit, `${p.label} 单位错`).toBe('per_1m');
      expect(['CNY', 'USD']).toContain(p.pricing.currency);
    }
  });

  it('★ 输出单价不低于输入单价（反常条目多半是录入时把两列写反了）', () => {
    for (const p of PRICING_PRESETS) {
      // Yi-Lightning 是同价（0.99/0.99），故用 >= 而不是 >
      expect(p.pricing.output, `${p.label} 输出 < 输入，疑似录反`).toBeGreaterThanOrEqual(p.pricing.input);
    }
  });

  it('modelId 大小写不敏感（厂商大小写很随意）', () => {
    expect(resolvePresetPricing('DeepSeek-V4-Pro')!.pricing.input).toBe(9);
    expect(resolvePresetPricing('KIMI-K3')!.pricing.output).toBe(100);
  });

  it('核定日期有值（UI 要显示「更新于 …」）', () => {
    expect(PRESET_UPDATED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
