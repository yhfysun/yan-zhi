// 看板组装：12 列网格自动排版。
import { describe, it, expect } from 'vitest';
import { autoLayout } from './build-dashboard-dsl';

const w = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'chart' as const,
  contract: { mode: 'file' as const, path: '/tmp/x.json' },
  spec: { kind: 'bar', dim: 'a', measure: 'b', measures: ['b'] },
  ...extra,
});

describe('autoLayout', () => {
  it('填满 12 列后换行，y 按上一行最高者累加', () => {
    const out = autoLayout([w('a'), w('b'), w('c')]);
    expect(out.map((x) => x.pos)).toEqual([
      { x: 0, y: 0, w: 6, h: 5 },
      { x: 6, y: 0, w: 6, h: 5 },
      { x: 0, y: 5, w: 6, h: 5 },
    ]);
  });

  it('宽度/高度收敛到网格边界，排版用后即丢弃 w/h 字段', () => {
    const out = autoLayout([w('a', { w: 99, h: 1 }) as never]);
    expect(out[0].pos).toEqual({ x: 0, y: 0, w: 12, h: 2 });
    expect('w' in out[0]).toBe(false);
    expect('h' in out[0]).toBe(false);
  });

  it('整行宽度 12 的组件独占一行', () => {
    const out = autoLayout([w('a', { w: 12 }) as never, w('b', { w: 12 }) as never]);
    expect(out[1].pos).toEqual({ x: 0, y: 5, w: 12, h: 5 });
  });
});
