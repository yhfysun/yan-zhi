// 看板围栏块解析单测。
import { describe, it, expect } from 'vitest';
import { extractDashboardBlocks, stripDashboardBlocks } from './ydash-blocks';

const DASH = {
  title: '运营看板',
  widgets: [
    { id: 'w1', kind: 'metric', metrics: [{ label: '对话数', value: '1,284' }], pos: { x: 0, y: 0, w: 4, h: 3 } },
    {
      id: 'w2', kind: 'chart',
      contract: { table: 'conversation' },
      spec: { kind: 'line', dim: 'created_at', measure: 'id', agg: 'count' },
      pos: { x: 4, y: 0, w: 8, h: 3 },
    },
  ],
};

describe('ydash-blocks', () => {
  it('解析合法看板围栏', () => {
    const blocks = extractDashboardBlocks('```ydash\n' + JSON.stringify(DASH) + '\n```');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].ok).toBe(true);
    if (!blocks[0].ok) return;
    expect(blocks[0].dash.widgets).toHaveLength(2);
  });

  it('非法 JSON / 结构错误返回可读原因', () => {
    const bad = extractDashboardBlocks('```ydash\n{oops\n```');
    expect(bad[0].ok).toBe(false);
    const noTitle = extractDashboardBlocks('```ydash\n{"widgets":[]}\n```');
    expect(noTitle[0].ok).toBe(false);
  });

  it('剥掉围栏保留正文', () => {
    const md = '看板如下\n\n```ydash\n' + JSON.stringify(DASH) + '\n```\n\n以上';
    expect(stripDashboardBlocks(md)).toBe('看板如下\n\n以上');
  });

  it('未闭合围栏不抽', () => {
    expect(extractDashboardBlocks('```ydash\n{"title":"x"')).toEqual([]);
  });
});
