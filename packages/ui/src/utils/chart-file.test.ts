// build_chart_dsl 产物标记的解析（前端识别图表卡片）。
import { describe, it, expect } from 'vitest';
import { parseChartDslMarker, collectChartDsls } from './chart-file';

const DSL = {
  version: 1, title: '各智能体会话量', kind: 'bar',
  dataPath: 'C:/ws/demo_1a2b3c4d.json', columns: ['name', 'row_count'],
  dim: 'name', measures: ['row_count'], total: 38, createdAt: 1,
};

describe('parseChartDslMarker', () => {
  it('解析 [ychart] 定义', () => {
    const text = `已生成图表\n[ychart]${JSON.stringify(DSL)}[/ychart]`;
    expect(parseChartDslMarker(text)).toMatchObject({ title: '各智能体会话量', kind: 'bar', dataPath: DSL.dataPath });
  });

  it('没有标记 / JSON 坏 / kind 非法 → null', () => {
    expect(parseChartDslMarker('普通文本')).toBeNull();
    expect(parseChartDslMarker('[ychart]{oops}[/ychart]')).toBeNull();
    expect(parseChartDslMarker('[ychart]{"kind":"radar","dataPath":"x"}[/ychart]')).toBeNull();
    expect(parseChartDslMarker('[ychart]{"kind":"bar"}[/ychart]')).toBeNull();
  });

  it('measures/topN/percent 归一', () => {
    const dsl = parseChartDslMarker(`[ychart]${JSON.stringify({ ...DSL, measures: 'row_count', topN: '5', percent: true })}[/ychart]`);
    expect(dsl?.measures).toEqual([]);
    expect(dsl?.topN).toBe(5);
    expect(dsl?.percent).toBe(true);
  });
});

describe('collectChartDsls', () => {
  it('多个工具结果去重同一图（dataPath+title）', () => {
    const a = `[ychart]${JSON.stringify(DSL)}[/ychart]`;
    const b = `[ychart]${JSON.stringify({ ...DSL, title: '另一张' })}[/ychart]`;
    const out = collectChartDsls([a, a, b, undefined, 'x']);
    expect(out.map((d) => d.title)).toEqual(['各智能体会话量', '另一张']);
  });
});
