// 有效上下文策略 —— 正式测试类（2026-10-02）。
//
// ★ 用户原话：「好像最优的上下文就是 258K 啊，如果超出了是不是应该有优化策略？
//   现在虽然很多大模型号称支持 1M 但是上下文过多后效果就不好了」。
//
// ★ 本测试钉住的三件事（每条都对应一个真实误区，防止回归）：
//   ① **不能按标称窗口算预算** —— 标称 1M / 2M 的模型在 ~256K 之后就明显退化
//      （Chroma Context Rot：18 个前沿模型**全部**随长度退化，单靠长度掉 7.9%、
//       中段位置掉 30+ 点；RULER：多步推理下有效窗口只有标称的 50–65%；
//       社区甜点区 GPT-4.1 / Llama 4 long 均 ≈ 256K）。
//   ② **比例要能自动适配小窗口**，且小窗口别被压得太狠（32K × 25% = 8K 太紧 → 有 16K 下限）。
//   ③ **前端展示口径必须与后端压缩口径同源** —— 否则"前端说没事、后端在压缩"自相矛盾。
import { describe, expect, it } from 'vitest';
import {
  EFFECTIVE_CONTEXT_RATIO,
  EFFECTIVE_CONTEXT_FLOOR,
  MAX_SESSION_MESSAGES,
  effectiveContextLimit,
  contextUsageLevel,
  contextUsagePercent,
} from '@yan-zhi/shared';

describe('① 有效上下文：标称窗口 ≠ 可用窗口', () => {
  it('1M 标称窗口 → 有效区落在 ~256K（用户说的 258K 那一档）', () => {
    const limit = effectiveContextLimit(1048576);
    expect(limit).toBe(262144); // 1048576 × 0.25
    // 与社区甜点区一致：256K 上下
    expect(limit).toBeGreaterThanOrEqual(200_000);
    expect(limit).toBeLessThanOrEqual(300_000);
    // ★ 绝不能等于标称窗口（那正是被证伪的假设）
    expect(limit).toBeLessThan(1048576);
  });

  it('2M 标称窗口 → 有效区 500K 以内（不是"能用 2M"）', () => {
    expect(effectiveContextLimit(2 * 1048576)).toBe(524288);
  });

  it('小窗口不被比例压得太狠（16K 下限兜底）', () => {
    // 32K × 25% = 8K → 太紧，抬到 16K
    expect(effectiveContextLimit(32768)).toBe(EFFECTIVE_CONTEXT_FLOOR);
    // 64K × 25% = 16K → 正好在下限
    expect(effectiveContextLimit(65536)).toBe(16384);
    // 128K × 25% = 32K → 高于下限，按比例
    expect(effectiveContextLimit(131072)).toBe(32768);
  });

  it('非法/缺失窗口 → 返回下限而不是崩溃或 Infinity', () => {
    for (const bad of [0, -1, NaN, Infinity, undefined as any, null as any, 'x' as any]) {
      const v = effectiveContextLimit(bad);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  it('有效值永不超过标称窗口（不会算出"比模型能力还大"）', () => {
    for (const w of [8192, 32768, 131072, 1048576, 2 * 1048576]) {
      expect(effectiveContextLimit(w)).toBeLessThanOrEqual(w);
    }
  });
});

describe('② 用量档位：按有效预算判定，不按标称窗口', () => {
  it('1M 模型用到 300K → 已越界（按标称算只有 29%，会误以为"还很空"）', () => {
    expect(contextUsageLevel(300_000, 1048576)).toBe('over');
    expect(contextUsagePercent(300_000, 1048576)).toBe(100); // 封顶
    // ★ 对照：按标称窗口算只有 29% —— 这就是"误导性展示"的具体数字
    expect(Math.round((300_000 / 1048576) * 100)).toBe(29);
  });

  it('1M 模型用到 200K → 仍 ok（76%，未到警戒）', () => {
    // 有效区 262144 → 200000/262144 ≈ 76% → 未达 80% 警戒线
    expect(contextUsageLevel(200_000, 1048576)).toBe('ok');
  });

  it('1M 模型用到 210K → watch（越过 80% 有效区）', () => {
    expect(contextUsageLevel(210_000, 1048576)).toBe('watch');
  });

  it('档位边界：<80% ok / 80–99% watch / >=100% over', () => {
    // 有效区 262144
    expect(contextUsageLevel(100_000, 1048576)).toBe('ok');     // 38%
    expect(contextUsageLevel(220_000, 1048576)).toBe('watch');  // 84%
    expect(contextUsageLevel(262_144, 1048576)).toBe('over');   // 100%
  });

  it('百分比恒在 0–100（不出现负数或 >100）', () => {
    expect(contextUsagePercent(0, 1048576)).toBe(0);
    expect(contextUsagePercent(-5, 1048576)).toBe(0);
    expect(contextUsagePercent(10_000_000, 1048576)).toBe(100);
  });
});

describe('③ 常量的语义护栏', () => {
  it('比例落在品牌研究给出的 25–30% 区间内（Chroma 生产建议）', () => {
    expect(EFFECTIVE_CONTEXT_RATIO).toBeGreaterThanOrEqual(0.2);
    expect(EFFECTIVE_CONTEXT_RATIO).toBeLessThanOrEqual(0.3);
  });

  it('条数闸门存在且量级合理（治"很多条短消息"这一种退化）', () => {
    // Manus 生产数据：复杂任务平均 50 次工具调用；条数一多中段就落在 U 形谷底
    expect(MAX_SESSION_MESSAGES).toBeGreaterThanOrEqual(100);
    expect(MAX_SESSION_MESSAGES).toBeLessThanOrEqual(1000);
  });
});