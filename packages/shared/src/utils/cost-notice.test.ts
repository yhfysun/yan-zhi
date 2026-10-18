import { describe, it, expect } from 'vitest';
import {
  maybeNoticeCost,
  formatCostNotice,
  DEFAULT_COST_BUDGET,
  type CostNoticeState,
} from './cost-notice.js';

/**
 * D4 的核心判据：**只提醒，程序不停**。
 *
 * ★ 变异验证要求：
 *   · 删掉 hardStop 分支（让它永远返回 exceeded）⇒ 「硬停」用例**必须**打红；
 *   · 去掉整倍数去重（每次都返回 exceeded）⇒ 「同档位不重复提醒」用例**必须**打红；
 *   · 把 `!cfg.enabled` 的短路删掉 ⇒ 「关闭后不提醒」用例**必须**打红。
 */

const cfg = { ...DEFAULT_COST_BUDGET }; // enabled:true, limit:5, warnRatio:0.8, hardStop:0
const fresh = (): CostNoticeState => ({ noticedUnits: 0, warned: false });

describe('默认配置：只提醒，绝不停', () => {
  it('¥1 → 不提醒（离阈值还远）', () => {
    expect(maybeNoticeCost(1, cfg, fresh()).kind).toBeNull();
  });

  it('★ ¥4（80%）→ 预警一次', () => {
    const r = maybeNoticeCost(4, cfg, fresh());
    expect(r.kind).toBe('warn');
    expect(r.next.warned).toBe(true);
  });

  it('★ ¥4.5 且已预警过 → 不再提醒（否则每轮都弹）', () => {
    const r = maybeNoticeCost(4.5, cfg, { noticedUnits: 0, warned: true });
    expect(r.kind).toBeNull();
  });

  it('★ ¥5 → 跨第 1 个档位，提醒 exceeded', () => {
    const r = maybeNoticeCost(5, cfg, fresh());
    expect(r.kind).toBe('exceeded');
    expect(r.units).toBe(1);
    expect(r.next.noticedUnits).toBe(1);
  });

  it('★ ¥9 且已提醒过档位 1 → 不重复提醒（整倍数去重）', () => {
    const r = maybeNoticeCost(9, cfg, { noticedUnits: 1, warned: true });
    expect(r.kind).toBeNull();
  });

  it('★ ¥10 → 跨第 2 个档位，再提醒一次', () => {
    const r = maybeNoticeCost(10, cfg, { noticedUnits: 1, warned: true });
    expect(r.kind).toBe('exceeded');
    expect(r.units).toBe(2);
  });

  it('★★ 出厂配置下永远不返回 hard_stop（D4 的保证）', () => {
    for (const used of [5, 50, 500, 5000]) {
      expect(maybeNoticeCost(used, cfg, fresh()).kind).not.toBe('hard_stop');
    }
  });
});

describe('hardStopCny：D4 的唯一例外（默认 0 = 永不启用）', () => {
  const hard = { ...cfg, hardStopCny: 8 };

  it('未达硬停线 → 正常走提醒，不停', () => {
    expect(maybeNoticeCost(7, hard, fresh()).kind).toBe('exceeded');
  });

  it('★ 达到硬停线 → hard_stop', () => {
    const r = maybeNoticeCost(8, hard, fresh());
    expect(r.kind).toBe('hard_stop');
  });

  it('硬停线为 0（默认）⇒ 花到天上去也不停', () => {
    expect(maybeNoticeCost(9_999_999, cfg, fresh()).kind).toBe('exceeded');
  });
});

describe('开关与边界', () => {
  it('★ enabled:false ⇒ 不提醒（但调用方仍要记账）', () => {
    expect(maybeNoticeCost(100, { ...cfg, enabled: false }, fresh()).kind).toBeNull();
  });

  it('limitCny=0 ⇒ 关闭提醒', () => {
    expect(maybeNoticeCost(100, { ...cfg, limitCny: 0 }, fresh()).kind).toBeNull();
  });

  it('负数 / NaN / 脏输入不炸，且不当成已超阈值', () => {
    expect(maybeNoticeCost(-5, cfg, fresh()).kind).toBeNull();
    expect(maybeNoticeCost(Number.NaN, cfg, fresh()).kind).toBeNull();
    expect(maybeNoticeCost(5, undefined, fresh()).kind).toBeNull();
  });

  it('档位状态异常（负数）被钳到 0，不会导致漏提醒', () => {
    expect(maybeNoticeCost(5, cfg, { noticedUnits: -3, warned: false }).kind).toBe('exceeded');
  });
});

describe('文案：模板生成，零模型调用', () => {
  it('含金额与「不会自动停止」', () => {
    const t = formatCostNotice(5.03, 5);
    expect(t).toContain('¥5.03'); // ≥1 元显示 2 位（方案 §3.5 的金额格式）
    expect(t).toContain('不会自动停止');
  });

  it('★ 有未计价调用时必须提示（否则用户以为没花钱）', () => {
    expect(formatCostNotice(5, 5, { unpricedCalls: 2 })).toContain('另有 2 次调用未配置价格');
  });

  it('★ 未真写进度时不能谎称"进度已写入"', () => {
    const t = formatCostNotice(5, 5, { didWriteProgress: false });
    expect(t).toContain('进度尚未写入');
    // 写了就不该出现这句
    expect(formatCostNotice(5, 5, { didWriteProgress: true })).not.toContain('进度尚未写入');
  });

  it('按模型给出花费构成与占比', () => {
    const t = formatCostNotice(1.87, 5, {
      byModel: [{ label: 'deepseek-v4-pro', cny: 1.62 }, { label: 'doubao-flash', cny: 0.25 }],
    });
    expect(t).toContain('deepseek-v4-pro');
    expect(t).toContain('87%');
  });

  it('小额 4 位、≥1 元 2 位（否则 ¥0.0032 显示成 ¥0.00）', () => {
    expect(formatCostNotice(0.0032, 5)).toContain('¥0.0032');
    expect(formatCostNotice(12.345, 5)).toContain('¥12.35');
  });
});
