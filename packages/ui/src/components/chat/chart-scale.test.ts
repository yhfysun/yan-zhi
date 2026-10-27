import { describe, it, expect } from 'vitest';
import { splitByMagnitude } from './chart-scale';

describe('splitByMagnitude', () => {
  it('量级相近时只用一根轴', () => {
    expect(splitByMagnitude([100, 120, 90])).toEqual({ axisOf: [0, 0, 0], dual: false });
  });

  it('单个系列不拆轴', () => {
    expect(splitByMagnitude([999999])).toEqual({ axisOf: [0], dual: false });
  });

  it('按最大的倍数断层分左右轴（调用次数/Token/成本）', () => {
    // 44 vs 2238 差 51 倍，2238 vs 4567864 差 2042 倍 → 断层在后者
    const r = splitByMagnitude([2238, 4567864, 44]);
    expect(r.dual).toBe(true);
    expect(r.axisOf).toEqual([0, 1, 0]);
  });

  it('全零系列不触发拆轴', () => {
    expect(splitByMagnitude([0, 5000000])).toEqual({ axisOf: [0, 0], dual: false });
  });

  it('负数按绝对值算量级', () => {
    const r = splitByMagnitude([-30, -40000]);
    expect(r.axisOf).toEqual([0, 1]);
  });
});
