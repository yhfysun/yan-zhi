import { describe, it, expect } from 'vitest';
import {
  speedAt, speedSlices, speedCurveDuration, speedCurveOutToSrc, speedCurveIsFlat,
  SPEED_SLICES,
} from './clip-effects';

describe('曲线变速 · 纯函数', () => {
  it('speedAt：线性插值 + 首尾 clamp', () => {
    const pts = [{ t: 0, speed: 1 }, { t: 0.5, speed: 3 }, { t: 1, speed: 1 }];
    expect(speedAt(pts, 0)).toBe(1);
    expect(speedAt(pts, 0.25)).toBeCloseTo(2, 6);
    expect(speedAt(pts, 0.75)).toBeCloseTo(2, 6);
    expect(speedAt(pts, -1)).toBe(1);
    expect(speedAt(pts, 2)).toBe(1);
  });

  it('speedSlices：固定片数、每片取中点倍速、t 连续覆盖 0~1', () => {
    const slices = speedSlices([{ t: 0, speed: 1 }, { t: 1, speed: 2 }], 8);
    expect(slices).toHaveLength(8);
    expect(slices[0].t0).toBe(0);
    expect(slices[7].t1).toBe(1);
    // 第一片中点 0.0625 → 1.0625
    expect(slices[0].speed).toBeCloseTo(1.0625, 3);
    // 相邻片首尾相接
    for (let i = 1; i < slices.length; i++) expect(slices[i].t0).toBeCloseTo(slices[i - 1].t1, 9);
  });

  it('恒定 2 倍速：10 秒源 → 5 秒输出', () => {
    expect(speedCurveDuration([{ t: 0, speed: 2 }, { t: 1, speed: 2 }], 10)).toBeCloseTo(5, 6);
  });

  it('慢动作爆点（两端 1、中间 0.4）：输出比源更长', () => {
    const d = speedCurveDuration([{ t: 0, speed: 1 }, { t: 0.5, speed: 0.4 }, { t: 1, speed: 1 }], 10);
    expect(d).toBeGreaterThan(10);
  });

  it('输出偏移 → 源偏移：单调递增，且两端对齐', () => {
    const pts = [{ t: 0, speed: 1 }, { t: 0.5, speed: 0.4 }, { t: 1, speed: 1 }];
    const src = 10;
    const total = speedCurveDuration(pts, src);
    expect(speedCurveOutToSrc(pts, 0, src)).toBeCloseTo(0, 6);
    expect(speedCurveOutToSrc(pts, total, src)).toBeGreaterThan(src * 0.95);
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const v = speedCurveOutToSrc(pts, (total * i) / 20, src);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    // 慢动作区间内：输出走得比源慢（同样的输出跨度只推进更少的源时间）
    const a = speedCurveOutToSrc(pts, total * 0.45, src);
    const b = speedCurveOutToSrc(pts, total * 0.5, src);
    expect(b - a).toBeLessThan(src * 0.05 * 1.2);
  });

  it('speedCurveIsFlat：差异 < 2% 视为平直', () => {
    expect(speedCurveIsFlat([{ t: 0, speed: 1 }, { t: 1, speed: 1.01 }])).toBe(true);
    expect(speedCurveIsFlat([{ t: 0, speed: 1 }, { t: 1, speed: 2 }])).toBe(false);
    expect(speedCurveIsFlat([{ t: 0, speed: 1 }])).toBe(true);
  });

  it('默认切片数 = 8', () => {
    expect(SPEED_SLICES).toBe(8);
  });
});
