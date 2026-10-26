// 文档类型：内置/自定义合并 + 变量填充（template 渲染与 Word 导出共用同一份逻辑）。
import { describe, it, expect } from 'vitest';
import {
  applyDocumentVariables,
  findDocumentType,
  mergeDocumentTypes,
  type DocumentInstance,
  type DocumentType,
} from './document-types';

const CUSTOM: DocumentType = {
  code: 'sales-weekly',
  name: '销售周报',
  description: '',
  category: '报告',
  output: 'docx',
  sections: [{ kind: 'paragraph', label: '概览' }],
};

describe('mergeDocumentTypes', () => {
  it('内置在前，自定义在后，同 code 以自定义覆盖', () => {
    const list = mergeDocumentTypes([{ ...CUSTOM, code: 'weekly-report' }]);
    const weekly = list.filter((t) => t.code === 'weekly-report');
    expect(weekly).toHaveLength(1);
    expect(weekly[0].name).toBe('销售周报');
    expect(weekly[0].builtin).toBe(false);
    expect(list.some((t) => t.builtin && t.code === 'data-report')).toBe(true);
  });

  it('findDocumentType 自定义优先、内置兜底', () => {
    expect(findDocumentType('sales-weekly', [CUSTOM])?.name).toBe('销售周报');
    expect(findDocumentType('weekly-report', [CUSTOM])?.builtin).toBe(true);
    expect(findDocumentType('nope', [CUSTOM])).toBeUndefined();
  });
});

describe('applyDocumentVariables', () => {
  const doc: DocumentInstance = {
    type: 'sales-weekly',
    title: '{{week}} 销售周报',
    subtitle: '区域：{{region}}',
    sections: [
      { kind: 'heading', level: 2, text: '{{week}} 概览' },
      { kind: 'paragraph', text: '本周销售额 {{amount}}，未提供时保留占位。' },
      { kind: 'metrics', items: [{ label: '{{region}} 销售额', value: '{{amount}}', hint: '环比 {{growth}}' }] },
      { kind: 'table', columns: ['{{region}}'], rows: [['华东']], caption: '{{week}} 明细' },
      { kind: 'chart', contract: { table: 'sales', filters: [{ col: 'note', value: '{{region}}' }] }, spec: { kind: 'line', dim: 'd', measure: 'm' } },
      { kind: 'infographic', syntax: 'infographic list\n data\n  title {{week}}' },
    ],
  };

  it('替换标题/段落/指标/表格/信息图里的占位符', () => {
    const out = applyDocumentVariables(doc, { week: '第 43 周', region: '华东', amount: '1280' });
    expect(out.title).toBe('第 43 周 销售周报');
    expect(out.subtitle).toBe('区域：华东');
    expect((out.sections[0] as any).text).toBe('第 43 周 概览');
    expect((out.sections[1] as any).text).toBe('本周销售额 1280，未提供时保留占位。');
    expect((out.sections[2] as any).items[0]).toEqual({ label: '华东 销售额', value: '1280', hint: '环比 {{growth}}' });
    expect((out.sections[3] as any).columns).toEqual(['华东']);
    expect((out.sections[3] as any).caption).toBe('第 43 周 明细');
    expect((out.sections[5] as any).syntax).toContain('第 43 周');
  });

  it('不改动 contract/spec 里的数据引用', () => {
    const out = applyDocumentVariables(doc, { region: '华东' });
    const chart = out.sections[4] as any;
    expect(chart.contract.filters[0].value).toBe('{{region}}');
    expect(chart.spec.dim).toBe('d');
  });

  it('不改原对象（纯函数）', () => {
    applyDocumentVariables(doc, { week: 'W' });
    expect(doc.title).toBe('{{week}} 销售周报');
  });

  it('没有变量值时原样返回', () => {
    expect(applyDocumentVariables(doc, {})).toBe(doc);
  });
});
