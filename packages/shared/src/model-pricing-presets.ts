/**
 * 内置模型价格参考表（2026-10-17）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ 为什么这个表必须在 P0（不是"锦上添花"）
 *
 * 计价引擎对**未配价**模型的处置是 `unpriced:true, cny=0`（区分「免费」与「未知」，见 `model-cost.ts`）。
 * 如果 P0 只有引擎没有价格数据 ⇒ 所有模型都是"未知" ⇒ **费用恒 ¥0 ⇒ 阈值永远不会触发** ⇒
 * 需求二交付的东西在真实使用中完全不可见。
 *
 * ---
 * ## ★★ 数据来源与可信度（重要）
 *
 * 本表条目来自 **2026-08 ~ 2026-09 的公开报价**（厂商官网 / 公开价目对比文章）。
 *
 * ⚠️ **只收录查得到依据的条目**。国际厂商（OpenAI / Anthropic / Google）在 2026 年有过
 * 大幅调价（OpenAI GPT-5.6 系列降价 80%、DeepSeek 上调），**手头没有可核对的现价 ⇒ 一律不写**。
 * 写一条自己不确定的价格，比不写更糟 —— 用户会拿着它做决策，而错误是静默的。
 * 国际厂商价格待核实后补（见 `TODO(international)`）。
 *
 * ---
 * ## ★ 已知的系统性偏差（UI 必须提示，不能假装精确）
 *
 * 1. **峰谷定价**：DeepSeek 已实行分时计价（高峰 9:00–12:00 / 14:00–18:00，其余半价；
 *    周末全天按低谷）。本表统一取**高峰价**（保守上界，与"宁可高估"原则一致），
 *    ⇒ 夜间/周末实际花费**约为本表的一半**。
 * 2. **阶梯计价**：豆包、阿里按输入长度分档，输入越长单价越高。
 *    本表取**最低档**（0–32K）⇒ 长上下文实际花费可能**是 2~4 倍**。
 * 3. **缓存写入**：国内厂商多为自动缓存、不单独收写入费 ⇒ 本表不给 `cacheWrite`，
 *    由 `computeCost` 回落到 `input` 全价（保守）。
 *
 * ⇒ 结论：本表用于**量级判断与阈值提醒**，不用于与账单对账。
 */

import type { ModelPricing } from './utils/model-cost.js';

/** 本表数据的核定日期（UI 显示「参考价 · 更新于 …」） */
export const PRESET_UPDATED_AT = '2026-10-17';

export interface PricingPreset {
  /** 展示名 */
  label: string;
  /** modelId 匹配模式（**从上到下取第一个命中**，所以具体型号要排在通配前面） */
  patterns: string[];
  pricing: ModelPricing;
  /** 给用户看的注意事项（峰谷 / 阶梯 / 限时优惠等） */
  note?: string;
}

function cny(input: number, output: number, cacheRead?: number, note?: string): PricingPreset['pricing'] {
  return {
    unit: 'per_1m',
    currency: 'CNY',
    input,
    output,
    cacheRead,
    configured: true,
    source: 'builtin',
  } as ModelPricing & { note?: string };
}

/**
 * 参考价表（单位：元 / 百万 tokens；`input` 为**缓存未命中**价）。
 *
 * 排列规则：**越具体越靠前**。
 */
export const PRICING_PRESETS: PricingPreset[] = [
  // ── DeepSeek（★ 峰谷定价，本表取高峰价 = 保守上界） ────────────────────────
  {
    label: 'DeepSeek V4-Pro',
    patterns: ['deepseek-v4-pro', 'deepseek-pro'],
    // 高峰：输入(未命中) 9 / 输出 27 / 命中 0.3；空闲半价 4.5 / 13.5 / 0.15
    pricing: cny(9, 27, 0.3),
    note: '按高峰价估算；空闲时段（含周末全天）约为本表的 1/2',
  },
  {
    label: 'DeepSeek V4-Flash',
    patterns: ['deepseek-v4-flash', 'deepseek-flash'],
    pricing: cny(3, 9, 0.1),
    note: '按高峰价估算；空闲时段 1.5 / 4.5 / 0.05',
  },
  {
    label: 'DeepSeek 兜底',
    patterns: ['^deepseek'],
    pricing: cny(9, 27, 0.3),
    note: '未识别的 DeepSeek 型号，按旗舰档保守估算',
  },

  // ── 智谱 GLM ──────────────────────────────────────────────────────
  {
    label: 'GLM-5.3-Flash',
    patterns: ['glm-5.3-flash', 'glm-4.6-flash', 'glm-4-flash'],
    pricing: cny(0.8, 2.8, 0.23),
  },
  {
    label: 'GLM-5.3 / 5.2',
    patterns: ['^glm-5', '^glm-4'],
    pricing: cny(8, 28, 2),
    note: '旗舰档；限时优惠期间约为本表的 1/2',
  },

  // ── 阿里云百炼 Qwen ────────────────────────────────────────────────
  {
    label: 'Qwen3.6-Flash',
    patterns: ['qwen3.6-flash', 'qwen-flash', 'qwen-turbo'],
    pricing: cny(0.37, 2.94),
  },
  {
    label: 'Qwen-Plus',
    patterns: ['qwen-plus'],
    pricing: cny(0.8, 2),
  },
  {
    label: 'Qwen3.7-Max / 3.8-Max',
    patterns: ['qwen.*-max', '^qwen-max'],
    pricing: cny(12, 36, 1.2),
    note: '阶梯计价：长上下文档单价更高',
  },
  {
    label: 'Qwen 兜底',
    patterns: ['^qwen'],
    pricing: cny(12, 36, 1.2),
  },

  // ── 火山方舟 豆包 ──────────────────────────────────────────────────
  {
    label: '豆包 Seed-2.0-Lite',
    patterns: ['seed-2.0-lite', 'doubao-seed-2.0-lite', 'doubao-lite'],
    pricing: cny(1.2, 3.6),
    note: '0–32K 档；更长上下文单价上浮',
  },
  {
    label: '豆包 Seed-2.0-Pro',
    patterns: ['seed-2.0-pro', 'doubao-seed-2.0-pro', 'doubao-pro'],
    pricing: cny(3.2, 16, 0.64),
    note: '阶梯计价，长上下文档更贵',
  },
  {
    label: '豆包 兜底',
    patterns: ['^doubao', '^seed-'],
    pricing: cny(6, 30, 1.2),
  },

  // ── 月之暗面 Kimi ──────────────────────────────────────────────────
  {
    label: 'Kimi-K2.7-Code',
    patterns: ['kimi-k2.7-code', 'k2.7-code'],
    pricing: cny(6.5, 27, 1.3),
  },
  {
    label: 'Kimi-K3',
    patterns: ['kimi-k3', '^kimi'],
    pricing: cny(20, 100, 2),
    note: '旗舰档，输出单价很高；长文档场景注意预算',
  },
  {
    label: 'Moonshot 兜底',
    patterns: ['^moonshot'],
    pricing: cny(20, 100, 2),
  },

  // ── 腾讯云混元 ─────────────────────────────────────────────────────
  {
    label: '混元 Hy3',
    patterns: ['hy3', 'hunyuan'],
    pricing: cny(1, 4, 0.25),
  },

  // ── 小米 MiMo ──────────────────────────────────────────────────────
  {
    label: 'MiMo-V2.5',
    patterns: ['mimo-v2.5$', 'mimo-v2.5-', '^mimo.*v2\\.5(?!.*pro)'],
    pricing: cny(1, 2, 0.02),
  },
  {
    label: 'MiMo-V2.5-Pro',
    patterns: ['mimo.*pro', '^mimo'],
    pricing: cny(3, 6, 0.025),
  },

  // ── MiniMax ────────────────────────────────────────────────────────
  {
    label: 'MiniMax-M3',
    patterns: ['minimax-m3', '^minimax'],
    pricing: cny(2.01, 8.04, 0.4),
    note: '官方为美元计价（0.30 / 1.20 / 0.06），已按 6.70 折算',
  },

  // ── 百度千帆 ───────────────────────────────────────────────────────
  {
    label: 'ERNIE-5.1',
    patterns: ['ernie-5', 'ernie'],
    pricing: cny(4, 18),
  },

  // ── 零一万物 ───────────────────────────────────────────────────────
  {
    label: 'Yi-Lightning',
    patterns: ['yi-lightning', '^yi-'],
    pricing: cny(0.99, 0.99),
    note: '输入输出同价',
  },
];

/** 把 pattern 编译成正则（**不区分大小写**；modelId 里厂商大小写很随意） */
function toRe(p: string): RegExp {
  try {
    return new RegExp(p, 'i');
  } catch {
    // 非法正则不能让整个表失效 —— 退化成字面包含匹配
    return new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
}

/**
 * 按 modelId 查内置参考价（**第一个命中生效**）。
 *
 * @returns 命中则返回 `{ pricing, label, note }`；未命中返回 `undefined`（调用方应按"未配价"处理）
 */
export function resolvePresetPricing(
  modelId: string,
): { pricing: ModelPricing; label: string; note?: string } | undefined {
  const id = String(modelId ?? '').trim();
  if (!id) return undefined;
  for (const preset of PRICING_PRESETS) {
    for (const p of preset.patterns) {
      if (toRe(p).test(id)) {
        return { pricing: preset.pricing, label: preset.label, note: preset.note };
      }
    }
  }
  return undefined;
}
