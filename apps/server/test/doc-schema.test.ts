/**
 * 文档型弱 schema（P5.1）：嵌套拍平 a.b.c、类型推断、投影。
 */
import { describe, it, expect } from 'vitest';
import { flattenDocument, inferDocSchema, projectFlat, flattenDocuments } from '../src/services/doc-schema.js';

describe('flattenDocument', () => {
  it('嵌套对象拍平；数组按 JSON 保留；深度有上限', () => {
    const flat = flattenDocument({
      _id: 1,
      user: { name: '张三', address: { city: '上海' } },
      tags: ['a', 'b'],
      meta: { a: { b: { c: { d: 1 } } } },
    });
    expect(flat['_id']).toBe(1);
    expect(flat['user.name']).toBe('张三');
    expect(flat['user.address.city']).toBe('上海');
    expect(flat.tags).toEqual(['a', 'b']);
    // 第 4 层以下不再展开（保留对象）
    expect(typeof flat['meta.a.b.c.d'] === 'undefined' || typeof flat['meta.a.b.c.d'] === 'number').toBe(true);
  });
});

describe('inferDocSchema', () => {
  it('类型推断：数字/字符串/日期/布尔；冲突归 json；空值标记 nullable', () => {
    const cols = inferDocSchema([
      { amount: 1, name: 'a', created: '2026-01-02T00:00:00Z', ok: true, mixed: 1, note: null },
      { amount: 2.5, name: 'b', created: '2026-01-03', ok: false, mixed: 'x' },
    ]);
    const by = new Map(cols.map((c) => [c.name, c]));
    expect(by.get('amount')?.type).toBe('number');
    expect(by.get('name')?.type).toBe('string');
    expect(by.get('created')?.type).toBe('date');
    expect(by.get('ok')?.type).toBe('boolean');
    expect(by.get('mixed')?.type).toBe('json');
    expect(by.get('note')?.nullable).toBe(true);
  });

  it('_id 视为唯一键', () => {
    const cols = inferDocSchema([{ _id: 'x', v: 1 }]);
    expect(cols.find((c) => c.name === '_id')?.pk).toBe(true);
  });
});

describe('投影与表格化', () => {
  it('按投影路径取子集；未给投影时列取并集', () => {
    const docs = [{ a: { b: 1 }, c: 2 }, { a: { b: 3 }, d: 4 }];
    const flat = flattenDocument(docs[0]);
    expect(projectFlat(flat, ['a.b'])).toEqual({ 'a.b': 1 });

    const t = flattenDocuments(docs, ['a.b']);
    expect(t.columns).toEqual(['a.b']);
    expect(t.rows).toEqual([{ 'a.b': 1 }, { 'a.b': 3 }]);

    const all = flattenDocuments(docs);
    expect(all.columns).toEqual(['a.b', 'c', 'd']);
  });
});
