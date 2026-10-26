// .ydoc 中间格式单测。
import { describe, it, expect } from 'vitest';
import { parseYdoc, toYdoc, YDOC_VERSION } from './ydoc';
import type { DocumentInstance } from './document-types';

const DOC: DocumentInstance = {
  type: 'weekly-report',
  title: '第 43 周数据周报',
  subtitle: '2026-10-20 ~ 2026-10-26',
  sections: [
    { kind: 'paragraph', text: '整体平稳。' },
    { kind: 'chart', contract: { table: 'conversation' }, spec: { kind: 'line', dim: 'created_at', measure: 'id', agg: 'count' } },
    { kind: 'infographic', syntax: 'infographic list-row-horizontal-icon-arrow\ndata\n  title 渠道' },
  ],
};

describe('ydoc', () => {
  it('序列化带版本号，且能回读', () => {
    const text = toYdoc(DOC);
    expect(JSON.parse(text).version).toBe(YDOC_VERSION);
    const r = parseYdoc(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.title).toBe(DOC.title);
    expect(r.doc.sections).toHaveLength(3);
  });

  it('拒绝非法 JSON / 缺字段', () => {
    expect(parseYdoc('{oops').ok).toBe(false);
    expect(parseYdoc('{"title":"x","sections":[{"kind":"paragraph","text":"a"}]}').ok).toBe(false);
    expect(parseYdoc('{"type":"t","title":"x","sections":[]}').ok).toBe(false);
  });

  it('chart 缺 spec.dim/measure、infographic 缺 syntax 被拒', () => {
    const badChart = parseYdoc(JSON.stringify({ type: 't', title: 'x', sections: [{ kind: 'chart', spec: { kind: 'line' } }] }));
    expect(badChart.ok).toBe(false);
    const badIg = parseYdoc(JSON.stringify({ type: 't', title: 'x', sections: [{ kind: 'infographic' }] }));
    expect(badIg.ok).toBe(false);
  });

  it('高版本文件拒绝读取', () => {
    const r = parseYdoc(JSON.stringify({ version: 99, ...DOC }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/版本/);
  });

  it('忽略未知字段，裁剪成规范实例', () => {
    const r = parseYdoc(JSON.stringify({ ...DOC, junk: 1 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect('junk' in r.doc).toBe(false);
  });
});
