// 周易图块渲染纯函数回归（packages/shared/src/zhouyi/diagram.ts，周易课程方案 §4）。
// 「数据 → SVG 图元」是纯函数：宿主与测试共用真实现（music/score-render.ts 范式）。
import { describe, it, expect } from 'vitest';
import { zhouyiBlockToShapes } from '@yan-zhi/shared';
import type { ZhouyiBlock, ZhouyiShape } from '@yan-zhi/shared';

function finite(shapes: ZhouyiShape[]): void {
  for (const s of shapes) {
    for (const v of [s.x, s.y, s.w, s.h, s.x2, s.y2, s.r, s.cx, s.cy]) {
      if (v !== undefined) expect(Number.isFinite(v), `${s.kind} 坐标非法`).toBe(true);
    }
    if (s.kind === 'text') expect((s.text ?? '').length).toBeGreaterThan(0);
  }
}

describe('六爻卦画', () => {
  it('6 爻：阳爻 1 条线、阴爻 2 段；动爻有标记', () => {
    const hex: ZhouyiBlock = { kind: 'hexagram', lines: [1, 0, 1, 1, 0, 1], moving: 5, caption: '泽火革' };
    const shapes = zhouyiBlockToShapes(hex);
    const lines = shapes.filter((s) => s.kind === 'line');
    // 阳爻 1 条 + 阴爻 2 段：4 阳 + 2 阴 = 8 条线段
    expect(lines.length).toBe(8);
    // 动爻标记（圆点）存在
    expect(shapes.some((s) => s.kind === 'circle')).toBe(true);
    finite(shapes);
  });

  it('64 卦两两不同（乾 vs 坤 画出来不一样）', () => {
    const qian = zhouyiBlockToShapes({ kind: 'hexagram', lines: [1, 1, 1, 1, 1, 1] });
    const kun = zhouyiBlockToShapes({ kind: 'hexagram', lines: [0, 0, 0, 0, 0, 0] });
    expect(JSON.stringify(qian)).not.toBe(JSON.stringify(kun));
  });
});

describe('方位与数理图', () => {
  it('八卦方位：先天/后天都是 8 卦 + 8 方位标签', () => {
    for (const scheme of ['先天', '后天'] as const) {
      const shapes = zhouyiBlockToShapes({ kind: 'bagua', scheme });
      const texts = shapes.filter((s) => s.kind === 'text').map((s) => s.text ?? '');
      for (const g of ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤']) {
        expect(texts.some((t) => t.includes(g)), `${scheme} 缺 ${g}`).toBe(true);
      }
      finite(shapes);
    }
  });

  it('五行生克：5 行 + 连线（生 5 条 / 克 5 条）', () => {
    const shapes = zhouyiBlockToShapes({ kind: 'wuxing', mode: '生' });
    const texts = shapes.filter((s) => s.kind === 'text').map((s) => s.text ?? '');
    for (const w of ['金', '木', '水', '火', '土']) expect(texts.some((t) => t.includes(w)), `缺 ${w}`).toBe(true);
    expect(shapes.filter((s) => s.kind === 'line' || s.kind === 'path').length).toBeGreaterThanOrEqual(5);
    finite(shapes);
  });

  it('河图 / 洛书：点数与九宫数字齐全', () => {
    const hetu = zhouyiBlockToShapes({ kind: 'hetu' });
    expect(hetu.filter((s) => s.kind === 'circle').length).toBeGreaterThanOrEqual(10);
    finite(hetu);
    const luoshu = zhouyiBlockToShapes({ kind: 'luoshu' });
    const texts = luoshu.filter((s) => s.kind === 'text').map((s) => s.text ?? '');
    for (const n of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(texts.some((t) => t.includes(n)), `洛书缺 ${n}`).toBe(true);
    }
    const jiugong = zhouyiBlockToShapes({ kind: 'jiugong', numbers: [4, 9, 2, 3, 5, 7, 8, 1, 6] });
    expect(jiugong.filter((s) => s.kind === 'text').length).toBeGreaterThanOrEqual(9);
    finite(jiugong);
  });

  it('table：行列与表头齐全', () => {
    const shapes = zhouyiBlockToShapes({
      kind: 'table',
      head: ['卦', '五行'],
      rows: [['乾', '金'], ['坤', '土']],
    });
    const texts = shapes.filter((s) => s.kind === 'text').map((s) => s.text ?? '');
    for (const t of ['卦', '五行', '乾', '金', '坤', '土']) expect(texts).toContain(t);
    finite(shapes);
  });

  it('非法输入不炸：空 numbers 走兜底（健壮性）', () => {
    expect(() => zhouyiBlockToShapes({ kind: 'jiugong', numbers: [] })).not.toThrow();
    expect(() => zhouyiBlockToShapes({ kind: 'hexagram', lines: [] })).not.toThrow();
  });
});
