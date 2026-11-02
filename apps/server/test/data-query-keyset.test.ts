/**
 * 翻页（P5.3）：keyset 字典序条件 / 方言占位符 / offset 兜底提示 / 错误中文化。
 */
import { describe, it, expect } from 'vitest';
import { buildPageSql, localizeQueryError } from '../src/services/data-query.js';

describe('buildPageSql · keyset', () => {
  it('单键升序：WHERE key > ?，按 keys 排序', () => {
    const r = buildPageSql('sqlite', 'SELECT * FROM t', { limit: 5, offset: 0, keys: ['id'], cursor: [10] });
    expect(r.mode).toBe('keyset');
    expect(r.sql).toContain('WHERE ("id" > ?)');
    expect(r.sql).toContain('ORDER BY "id" ASC');
    expect(r.sql).toContain('LIMIT 5');
    expect(r.params).toEqual([10]);
  });

  it('复合键：展开为 OR 链（字典序比较），参数只有一个游标数组', () => {
    const r = buildPageSql('sqlite', 'SELECT * FROM t', { limit: 10, offset: 0, keys: ['a', 'b'], cursor: [1, 2] });
    expect(r.sql).toContain('("a" > ?) OR ("a" = ? AND "b" > ?)');
    expect(r.params).toEqual([1, 2]);
  });

  it('postgres 用 $n 占位符；desc 用 < 并降序排序', () => {
    const r = buildPageSql('postgres', 'SELECT 1', { limit: 3, offset: 0, keys: ['id'], cursor: [9], desc: true });
    expect(r.sql).toContain('("id" < $1)');
    expect(r.sql).toContain('ORDER BY "id" DESC');
  });

  it('非法键直接拒绝', () => {
    expect(() => buildPageSql('sqlite', 'SELECT 1', { limit: 1, offset: 0, keys: ['id;drop'], cursor: [1] }))
      .toThrow(/唯一键.*非法/);
  });
});

describe('buildPageSql · offset 兜底', () => {
  it('未给 keys：退回 offset 并提示可能重复/漏行', () => {
    const r = buildPageSql('sqlite', 'SELECT 1', { limit: 20, offset: 40 });
    expect(r.mode).toBe('offset');
    expect(r.params).toEqual([]);
    expect(r.warnings.join('')).toContain('offset');
    expect(r.sql).toContain('LIMIT');
  });

  it('游标与 keys 数量不一致：退回 offset 并提示', () => {
    const r = buildPageSql('sqlite', 'SELECT 1', { limit: 10, offset: 0, keys: ['a', 'b'], cursor: [1] });
    expect(r.mode).toBe('offset');
    expect(r.warnings.join('')).toContain('数量不一致');
  });
});

describe('localizeQueryError', () => {
  it('超时 / 连接 / 权限 / 其它统一中文化', () => {
    expect(localizeQueryError(new Error('Query timeout exceeded')).message).toContain('查询超时');
    expect(localizeQueryError(new Error('connect ECONNREFUSED 127.0.0.1')).message).toContain('数据库连接失败');
    expect(localizeQueryError(new Error('Access denied for user')).message).toContain('权限不足');
    expect(localizeQueryError(new Error('syntax error')).message).toContain('查询失败');
  });
});
