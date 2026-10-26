// .ydash 看板中间格式单测。
import { describe, it, expect } from 'vitest';
import { parseYdash, toYdash, YDASH_VERSION } from './ydash';

const DASH = {
  title: '运营看板',
  description: '周度核心指标',
  widgets: [
    {
      id: 'w1', kind: 'chart' as const, title: '每日对话量',
      contract: { table: 'conversation' },
      spec: { kind: 'line' as const, dim: 'created_at', measure: 'id', agg: 'count' as const },
      pos: { x: 0, y: 0, w: 8, h: 4 },
    },
    {
      id: 'w2', kind: 'metric' as const, title: '总量',
      metrics: [{ label: '对话数', value: '1,284' }],
      pos: { x: 8, y: 0, w: 4, h: 4 },
    },
    {
      id: 'w3', kind: 'infographic' as const,
      syntax: 'infographic list-row-horizontal-icon-arrow\ndata\n  title 渠道',
      pos: { x: 0, y: 4, w: 12, h: 5 },
    },
  ],
};

describe('ydash', () => {
  it('序列化带版本号，且能回读', () => {
    const text = toYdash(DASH);
    expect(JSON.parse(text).version).toBe(YDASH_VERSION);
    const r = parseYdash(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dash.widgets).toHaveLength(3);
    expect(r.dash.widgets[2].kind).toBe('infographic');
  });

  it('widget id 重复被拒', () => {
    const r = parseYdash(JSON.stringify({
      title: 'x',
      widgets: [
        { id: 'a', kind: 'text', text: '1', pos: { x: 0, y: 0, w: 4, h: 2 } },
        { id: 'a', kind: 'text', text: '2', pos: { x: 4, y: 0, w: 4, h: 2 } },
      ],
    }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/重复/);
  });

  it('位置越界 / 非法 kind / chart 缺 spec 被拒', () => {
    expect(parseYdash(JSON.stringify({ title: 'x', widgets: [{ id: 'a', kind: 'text', text: '1', pos: { x: 0, y: 0, w: 13, h: 2 } }] })).ok).toBe(false);
    expect(parseYdash(JSON.stringify({ title: 'x', widgets: [{ id: 'a', kind: 'video', pos: { x: 0, y: 0, w: 4, h: 2 } }] })).ok).toBe(false);
    expect(parseYdash(JSON.stringify({ title: 'x', widgets: [{ id: 'a', kind: 'chart', spec: { kind: 'line' }, pos: { x: 0, y: 0, w: 4, h: 2 } }] })).ok).toBe(false);
  });

  it('infographic 缺 syntax 被拒', () => {
    const r = parseYdash(JSON.stringify({ title: 'x', widgets: [{ id: 'a', kind: 'infographic', pos: { x: 0, y: 0, w: 4, h: 2 } }] }));
    expect(r.ok).toBe(false);
  });

  it('高版本文件拒绝读取', () => {
    const r = parseYdash(JSON.stringify({ version: 99, ...DASH }));
    expect(r.ok).toBe(false);
  });
});
