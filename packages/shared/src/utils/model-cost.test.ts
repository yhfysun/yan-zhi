import { describe, it, expect } from 'vitest';
import { computeCost, normalizePricing, formatCny, DEFAULT_USD_TO_CNY } from './model-cost.js';

/**
 * 金额是**等式**，不是"`> 0`"（2026-10-17）。
 *
 * ★ 变异验证要求：
 *   · 把 `computeCost` 里的 `/ 1e6` 改成 `/ 1e3` ⇒ 等式用例**必须**打红（差 1000 倍，正是单位迁移要防的事）；
 *   · 把 cacheRead 的缺省改成 `0` ⇒ 「缺省按 input 全价」用例**必须**打红；
 *   · 把 `!pricing.configured` 的短路删掉 ⇒ 「未配价」用例**必须**打红。
 */
describe('computeCost：等式断言', () => {
  // 归一化后的明细：全价输入 400、缓存命中 600、输出 200（原始 input_tokens=1000，其中命中 600）
  const detail = { inputTokens: 400, cacheReadTokens: 600, cacheWriteTokens: 0, outputTokens: 200 };
  const pricing = normalizePricing({
    unit: 'per_1m', currency: 'CNY', input: 2, output: 8, cacheRead: 0.5, configured: true,
  })!;

  it('精确等式：400×2 + 600×0.5 + 200×8 后除以 1e6', () => {
    const { cny, unpriced } = computeCost(detail, pricing);
    expect(unpriced).toBe(false);
    // ★ 等式，不是 > 0
    expect(cny).toBe((400 * 2 + 600 * 0.5 + 200 * 8) / 1e6);
    expect(cny).toBeCloseTo(0.0027, 10);
  });

  it('★ 顺序无关：把命中与全价互换，金额应随之变化（证明分项真的被分别计价）', () => {
    const swapped = { inputTokens: 600, cacheReadTokens: 400, cacheWriteTokens: 0, outputTokens: 200 };
    expect(computeCost(swapped, pricing).cny).toBeCloseTo((600 * 2 + 400 * 0.5 + 200 * 8) / 1e6, 10);
    // 命中便宜 ⇒ 命中越多总额越低
    expect(computeCost(swapped, pricing).cny).toBeGreaterThan(computeCost(detail, pricing).cny);
  });

  it('缓存写入按 cacheWrite 单价计（Anthropic 专有，OpenAI 恒为 0）', () => {
    const withWrite = { inputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 1000, outputTokens: 0 };
    const p = normalizePricing({ unit: 'per_1m', input: 2, output: 8, cacheWrite: 5, configured: true })!;
    expect(computeCost(withWrite, p).cny).toBeCloseTo((100 * 2 + 1000 * 5) / 1e6, 10);
  });
});

describe('★ 缺省价的保守原则：不当作免费', () => {
  it('cacheRead / cacheWrite 缺省 ⇒ 按 input 全价（宁可高估）', () => {
    const p = normalizePricing({ unit: 'per_1m', input: 2, output: 8, configured: true })!;
    const d = { inputTokens: 0, cacheReadTokens: 1000, cacheWriteTokens: 1000, outputTokens: 0 };
    // 若缺省按 0 ⇒ cny 会是 0；按 input 则是 1000*2 + 1000*2
    expect(computeCost(d, p).cny).toBeCloseTo((1000 * 2 + 1000 * 2) / 1e6, 10);
  });
});

describe('configured 三态：免费 ≠ 没配价', () => {
  it('★ 未配价 ⇒ unpriced:true 且 cny=0（绝不冒充"免费"）', () => {
    const d = { inputTokens: 100000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 100000 };
    expect(computeCost(d, undefined).unpriced).toBe(true);
    expect(computeCost(d, undefined).cny).toBe(0);
    expect(computeCost(d, normalizePricing({ unit: 'per_1m', input: 0, output: 0, configured: false })!).unpriced).toBe(true);
  });

  it('免费模型（configured:true 且价全 0）⇒ 正常计 0，但 unpriced=false', () => {
    const p = normalizePricing({ unit: 'per_1m', input: 0, output: 0, configured: true })!;
    const r = computeCost({ inputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1000 }, p);
    expect(r.cny).toBe(0);
    expect(r.unpriced).toBe(false);
  });
});

describe('★ 单位迁移：元/千 → 元/百万（×1000）', () => {
  it('旧格式 {input:0.002, output:0.008}（无 unit）⇒ 读时兜底成 2 / 8', () => {
    const p = normalizePricing({ input: 0.002, output: 0.008 })!;
    expect(p.unit).toBe('per_1m');
    expect(p.input).toBeCloseTo(2, 6);
    expect(p.output).toBeCloseTo(8, 6);
  });

  it('新格式 per_1m 不再放大', () => {
    expect(normalizePricing({ unit: 'per_1m', input: 2, output: 8 })!.input).toBe(2);
    expect(normalizePricing({ unit: 'per_1k', input: 2, output: 8 })!.input).toBe(2000);
  });

  it('★ 旧数据「全是 0」无法区分免费/未填 ⇒ 按未配价（宁可标未知）', () => {
    expect(normalizePricing({ input: 0, output: 0 })!.configured).toBe(false);
    expect(normalizePricing({ input: 0.002, output: 0 })!.configured).toBe(true);
  });

  it('脏输入不炸', () => {
    expect(normalizePricing(null)).toBeUndefined();
    expect(normalizePricing('x')).toBeUndefined();
    expect(normalizePricing({ input: 'abc', output: undefined })!.input).toBe(0);
  });
});

describe('美元平台与汇率', () => {
  it('USD 单价 × 汇率折算成 CNY', () => {
    const p = normalizePricing({ unit: 'per_1m', currency: 'USD', input: 2, output: 8, configured: true })!;
    const d = { inputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
    expect(computeCost(d, p).cny).toBeCloseTo(2 * DEFAULT_USD_TO_CNY, 6);
    expect(computeCost(d, p, { usdToCny: 7 }).cny).toBeCloseTo(14, 6);
  });

  it('汇率非法 ⇒ 回落默认值，不产生 NaN', () => {
    const p = normalizePricing({ unit: 'per_1m', currency: 'USD', input: 2, output: 8, configured: true })!;
    const d = { inputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
    expect(computeCost(d, p, { usdToCny: 0 }).cny).toBeCloseTo(2 * DEFAULT_USD_TO_CNY, 6);
  });
});

describe('formatCny：小额必须看得见', () => {
  it('<1 元 4 位小数；≥1 元 2 位', () => {
    expect(formatCny(0.0032)).toBe('¥0.0032');
    expect(formatCny(5.0333)).toBe('¥5.03');
    expect(formatCny(0)).toBe('¥0.0000');
  });

  it('★ 小额若只给 2 位会全显示成 ¥0.00（等于告诉用户没花钱）', () => {
    expect(formatCny(0.0032)).not.toBe('¥0.00');
  });

  it('NaN 不显示成 "¥NaN"', () => {
    expect(formatCny(Number.NaN)).toBe('¥0.00');
  });
});
