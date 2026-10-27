import { describe, it, expect } from 'vitest';
import { layoutMetrics, metricsToPng } from './metrics-image';

describe('layoutMetrics', () => {
  it('每行最多 3 个，6 个指标排两行', () => {
    const l = layoutMetrics(6, 624);
    expect(l.cards).toHaveLength(6);
    expect(l.cards[0].y).toBe(l.cards[2].y);
    expect(l.cards[3].y).toBeGreaterThan(l.cards[0].y);
    expect(l.height).toBe(20 * 2 + 84 * 2 + 12);
  });

  it('2 个指标同一行等宽', () => {
    const l = layoutMetrics(2, 624);
    expect(l.cards[0].y).toBe(l.cards[1].y);
    expect(l.cards[0].w).toBeCloseTo(l.cards[1].w);
    expect(l.cards[0].x + l.cards[0].w).toBeLessThan(l.cards[1].x);
  });

  it('0 个指标高度为 0', () => {
    expect(layoutMetrics(0, 624)).toEqual({ width: 624, height: 0, cards: [] });
  });

  it('超过 12 个截断', () => {
    expect(layoutMetrics(20, 624).cards).toHaveLength(12);
  });
});

describe('metricsToPng', () => {
  it('无 DOM 环境返回空串（不抛错）', () => {
    expect(metricsToPng([{ label: '调用次数', value: '6,369' }])).toBe('');
  });

  it('没有指标返回空串', () => {
    expect(metricsToPng([])).toBe('');
  });
});
