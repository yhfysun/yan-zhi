import { describe, it, expect } from 'vitest';
import { cubicBezierEase, easeValue, easePointList, EASE_SAMPLES } from './clip-effects';

describe('cubicBezierEase · 三次贝塞尔缓动', () => {
  it('端点固定在 0 与 1', () => {
    expect(cubicBezierEase(0, 0.42, 0, 0.58, 1)).toBe(0);
    expect(cubicBezierEase(1, 0.42, 0, 0.58, 1)).toBe(1);
  });

  it('inout 中点约等于 0.5（对称）', () => {
    expect(cubicBezierEase(0.5, 0.42, 0, 0.58, 1)).toBeCloseTo(0.5, 3);
  });

  it('in 起步慢（中点 < 0.5）、out 收尾慢（中点 > 0.5）', () => {
    expect(cubicBezierEase(0.5, 0.42, 0, 1, 1)).toBeLessThan(0.5);
    expect(cubicBezierEase(0.5, 0, 0, 0.58, 1)).toBeGreaterThan(0.5);
  });

  it('单调不减（100 个采样）', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const y = cubicBezierEase(i / 100, 0.42, 0, 0.58, 1);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
  });

  it('越界输入被钳制', () => {
    expect(cubicBezierEase(-1, 0.42, 0, 0.58, 1)).toBe(0);
    expect(cubicBezierEase(2, 0.42, 0, 0.58, 1)).toBe(1);
  });
});

describe('easeValue', () => {
  it('linear/缺省 = 原样返回', () => {
    expect(easeValue(0.37)).toBe(0.37);
    expect(easeValue(0.37, 'linear')).toBe(0.37);
  });
  it('bezier 用自定义控制点，缺省回落到 inout', () => {
    expect(easeValue(0.5, 'bezier', [0.42, 0, 0.58, 1])).toBeCloseTo(0.5, 3);
    expect(easeValue(0.5, 'bezier')).toBeCloseTo(0.5, 3);
  });
});

describe('easePointList · 采样成线性点列', () => {
  it('全线性输入原样返回（不插点，表达式长度不变）', () => {
    const pts = [{ t: 0, v: 1 }, { t: 0.5, v: 2 }, { t: 1, v: 1 }];
    expect(easePointList(pts)).toEqual(pts);
  });

  it('带缓动的段插入中间点，两端值严格保留', () => {
    const out = easePointList([{ t: 0, v: 1, ease: 'inout' as const }, { t: 1, v: 2 }]);
    expect(out.length).toBe(EASE_SAMPLES + 1);           // 16 个中间点 + 终点
    expect(out[0]).toEqual({ t: 0, v: 1 });
    expect(out[out.length - 1]).toEqual({ t: 1, v: 2 });
    // t 单调递增
    for (let i = 1; i < out.length; i++) expect(out[i].t).toBeGreaterThan(out[i - 1].t);
  });

  it('缓入缓出在段中点仍取中点值，但两端变化更平缓', () => {
    const out = easePointList([{ t: 0, v: 0, ease: 'inout' as const }, { t: 1, v: 10 }], 16);
    const mid = out[Math.floor(out.length / 2)];
    expect(mid.v).toBeCloseTo(5, 0);
    // 前 1/4 处应明显小于线性值 2.5
    const quarter = out.find((p) => p.t >= 0.25)!;
    expect(quarter.v).toBeLessThan(2.5);
  });

  it('无序输入按 t 排序；越界 t 钳到 0~1', () => {
    const out = easePointList([{ t: 1, v: 3 }, { t: -5, v: 1 }]);
    expect(out[0].t).toBe(0);
    expect(out[out.length - 1].t).toBe(1);
  });

  it('单点输入直接返回单点', () => {
    expect(easePointList([{ t: 0.4, v: 2 }])).toEqual([{ t: 0.4, v: 2 }]);
  });

  it('点数有上限（长列表不会被采样炸开）', () => {
    const pts = Array.from({ length: 12 }, (_, i) => ({ t: i / 11, v: i, ease: 'inout' as const }));
    const out = easePointList(pts);
    expect(out.length).toBeLessThanOrEqual(96);
  });
});
