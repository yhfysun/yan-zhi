/**
 * 模型计价 —— **唯一实现处**（2026-10-17）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ 单位：为什么从「元/千 token」改成「元/百万 token」
 *
 * 现状字段是**元/千**，但**所有厂商的公开价目表都是元/百万**（DeepSeek / 智谱 / 阿里 / 火山一律如此）。
 * 差 1000 倍 ⇒ 用户照着官网抄数字填进来，算出来的钱**差三个数量级**，而且不报错 ——
 * 只会表现为"这软件算的费用跟我对不上"。
 *
 * ⇒ 新写入一律 `unit:'per_1m'`。旧数据靠 `normalizePricing()` **读时兜底**（×1000）。
 *
 * ---
 * ## ★★ `configured` 三态：免费 ≠ 没配价
 *
 * | 形态                                | 含义        | 处置                             |
 * | --------------------------------- | --------- | ------------------------------ |
 * | `configured:true, input:0`         | **免费模型**  | 正常计 0 元                        |
 * | `configured:false`                 | **没配价（未知）** | `unpriced:true`，元算 0 并**计数**，UI 提示 |
 * | 没有 pricing 字段                      | 同上，未知     | 同上                             |
 *
 * 为什么必须区分：把"未知"当 0 元，金额看起来会**很便宜**，而用户是拿这个数字做决策的
 * （"这个任务才花了 3 分钱，继续跑"）。实际上可能已经花了几块钱。
 * ⇒ 未知一律返回 `unpriced:true`，并在账本里累加 `unpriced_calls`，UI 恒定提示"另有 N 次未计价"。
 *
 * ---
 * ## 保守原则
 *
 * `cacheRead` / `cacheWrite` 缺省时**按 `input` 全价**计，不是按 0。
 * 宁可高估不要低估 —— 低估会让人敢于继续烧钱，高估最多是提醒早一点。
 */

import type { TokenUsageDetail } from './token-usage.js';

/** 单位（新写入一律 per_1m） */
export type PricingUnit = 'per_1m' | 'per_1k';
export type PricingCurrency = 'CNY' | 'USD';

export interface ModelPricing {
  unit: PricingUnit;
  currency: PricingCurrency;
  /** 未命中缓存的输入单价 */
  input: number;
  /** 输出单价 */
  output: number;
  /** 缓存命中读取单价；**缺省按 input**（保守上界） */
  cacheRead?: number;
  /** 缓存写入单价；**缺省按 input** */
  cacheWrite?: number;
  /** ★ false = 「没配价」（不是「免费」） */
  configured: boolean;
  source?: 'builtin' | 'manual';
  updatedAt?: number;
}

/** 默认汇率（可配置；**历史按调用时汇率固化**，改汇率不重算历史） */
export const DEFAULT_USD_TO_CNY = 7.1;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 把任意形态的 pricing（旧「元/千」/ 新「元/百万」/ null）归一化。
 *
 * ★ **读时兜底**存在的理由：单位迁移是**落库**做的，但万一旧版本的程序又被跑起来、
 *   或某个端漏跑了迁移，读到的一定还是旧格式。没有这层兜底就会静默差 1000 倍。
 *
 * ★ 旧数据的 `configured` 判定：旧 UI 的价格框默认就是 `0 / 0`，所以
 *   「全是 0」无法区分"免费"与"没填" ⇒ **一律按未配价**（宁可被标未知，也不冒充免费）。
 *   有任一非零值 ⇒ 认为用户明确填过 ⇒ `configured:true`。
 */
export function normalizePricing(raw: unknown): ModelPricing | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, any>;

  const isPer1m = p.unit === 'per_1m';
  // 旧格式（无 unit，或显式 per_1k）→ 元/千 ⇒ × 1000 换成元/百万
  const k = isPer1m ? 1 : 1000;

  const input = num(p.input) * k;
  const output = num(p.output) * k;
  const cacheRead = p.cacheRead === undefined && p.cache_read === undefined
    ? undefined
    : num(p.cacheRead ?? p.cache_read) * k;
  const cacheWrite = p.cacheWrite === undefined && p.cache_write === undefined
    ? undefined
    : num(p.cacheWrite ?? p.cache_write) * k;

  const hasExplicitConfigured = typeof p.configured === 'boolean';
  const configured = hasExplicitConfigured
    ? p.configured
    : (input > 0 || output > 0); // 旧数据：非 0 才算配过

  return {
    unit: 'per_1m',
    currency: p.currency === 'USD' ? 'USD' : 'CNY',
    input,
    output,
    cacheRead,
    cacheWrite,
    configured,
    source: p.source === 'builtin' ? 'builtin' : p.source === 'manual' ? 'manual' : undefined,
    updatedAt: num(p.updatedAt) || num(p.updated_at) || undefined,
  };
}

export interface CostResult {
  /** 人民币金额；`unpriced` 时为 0（**不是"免费"，是"未知"**） */
  cny: number;
  /** true = 这次调用没价可算，金额不可信 */
  unpriced: boolean;
}

/**
 * 计算一次调用的花费（**纯函数，等式可断言**）。
 *
 * ```
 * cny = (input × p.input + cacheRead × p.cacheRead + cacheWrite × p.cacheWrite + output × p.output) / 1e6
 * ```
 *
 * 缺省价：cacheRead / cacheWrite 取 `input`（保守上界）。
 * 美元平台：结果 × 汇率。
 */
export function computeCost(
  detail: TokenUsageDetail,
  pricing: ModelPricing | undefined,
  fx?: { usdToCny?: number },
): CostResult {
  if (!pricing || !pricing.configured) return { cny: 0, unpriced: true };
  if (!detail) return { cny: 0, unpriced: true };

  const inputPrice = num(pricing.input);
  const outputPrice = num(pricing.output);
  // ★ 缺省按 input 全价，不当作免费
  const readPrice = pricing.cacheRead === undefined ? inputPrice : num(pricing.cacheRead);
  const writePrice = pricing.cacheWrite === undefined ? inputPrice : num(pricing.cacheWrite);

  const usdToCny = Number(fx?.usdToCny) > 0 ? Number(fx?.usdToCny) : DEFAULT_USD_TO_CNY;
  const rate = pricing.currency === 'USD' ? usdToCny : 1;

  const cny = (
    num(detail.inputTokens) * inputPrice
    + num(detail.cacheReadTokens) * readPrice
    + num(detail.cacheWriteTokens) * writePrice
    + num(detail.outputTokens) * outputPrice
  ) / 1e6 * rate;

  return { cny, unpriced: false };
}

/**
 * 金额显示格式：`<1` 元显示 4 位小数，`≥1` 元显示 2 位。
 *
 * ★ 为什么小额要多给两位：国产模型一次普通调用常在**厘**级（¥0.0032），
 *   统一 2 位会全部显示成 `¥0.00` ⇒ 用户以为没花钱（这条与"未配价显示 ¥0"是同一类误导）。
 */
export function formatCny(cny: number): string {
  const n = Number(cny);
  if (!Number.isFinite(n)) return '¥0.00';
  const abs = Math.abs(n);
  return `¥${abs < 1 ? n.toFixed(4) : n.toFixed(2)}`;
}
