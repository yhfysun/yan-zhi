// 取数前自检（P0.5 校验闭环）单测。
//
// 守住的语义：
//   1) COUNT 不能被编译器自己追加的 LIMIT 截断（否则「行数量级自检」永远看到 200）；
//   2) Oracle/DM 的 FETCH FIRST / OFFSET..FETCH NEXT 也要能剥掉；
//   3) 只剥**尾部**限制，子查询内部的 LIMIT 不能被误伤；
//   4) 告警要能直接驱动模型自纠：0 行、分组列空值、超大结果集各有明确提示。
//
// ★ 只测纯函数；执行链依赖 sqlite 连接器（测试环境 ABI 限制），不在此覆盖。
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fsSync from 'node:fs';

process.env.DATA_DIR = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yz-data-preview-'));

let stripTrailingLimit: typeof import('../src/services/data-query.js').stripTrailingLimit;
let inferColumnTypes: typeof import('../src/services/data-query.js').inferColumnTypes;
let summarizePreview: typeof import('../src/services/data-query.js').summarizePreview;

beforeAll(async () => {
  ({ stripTrailingLimit, inferColumnTypes, summarizePreview } = await import('../src/services/data-query.js'));
});

describe('stripTrailingLimit', () => {
  it('剥掉编译器追加的 LIMIT / LIMIT OFFSET', () => {
    expect(stripTrailingLimit('SELECT * FROM t LIMIT 200')).toBe('SELECT * FROM t');
    expect(stripTrailingLimit('SELECT * FROM t ORDER BY a DESC LIMIT 200 OFFSET 20'))
      .toBe('SELECT * FROM t ORDER BY a DESC');
  });

  it('剥掉 Oracle/DM 的 FETCH 形式', () => {
    expect(stripTrailingLimit('SELECT * FROM t FETCH FIRST 200 ROWS ONLY')).toBe('SELECT * FROM t');
    expect(stripTrailingLimit('SELECT * FROM t OFFSET 20 ROWS FETCH NEXT 200 ROWS ONLY')).toBe('SELECT * FROM t');
  });

  it('只剥尾部：子查询内部的 LIMIT 原样保留', () => {
    const sql = 'SELECT * FROM (SELECT * FROM t LIMIT 5) x';
    expect(stripTrailingLimit(sql)).toBe(sql);
  });

  it('没有尾部限制时原样返回', () => {
    expect(stripTrailingLimit('SELECT a, COUNT(*) AS c FROM t GROUP BY a'))
      .toBe('SELECT a, COUNT(*) AS c FROM t GROUP BY a');
  });
});

describe('inferColumnTypes', () => {
  it('按抽样值粗判数值/日期/布尔/空', () => {
    expect(inferColumnTypes(
      ['n', 'd', 'b', 'nil'],
      [{ n: 1, d: '2026-01-02', b: true, nil: null }],
    )).toEqual({ n: 'number', d: 'date', b: 'boolean', nil: 'null' });
  });

  it('同一列类型不一致时标 mixed', () => {
    expect(inferColumnTypes(['x'], [{ x: 1 }, { x: 'abc' }]).x).toBe('mixed');
  });

  it('空字符串按文本处理，不当作数值', () => {
    expect(inferColumnTypes(['x'], [{ x: '' }]).x).toBe('text');
  });
});

describe('summarizePreview', () => {
  it('0 行：给出「不要直接回答」的下一步', () => {
    const s = summarizePreview({ total: 0, nullCounts: {}, warnings: ['编译告警'] });
    expect(s.warnings).toContain('编译告警');
    expect(s.warnings.join('\n')).toMatch(/0 行/);
    expect(s.hint).toMatch(/不要直接回答/);
  });

  it('分组列有非预期空值：指出列名、行数与占比', () => {
    const s = summarizePreview({ total: 100, nullCounts: { region: 5 }, warnings: [] });
    expect(s.warnings.join('\n')).toMatch(/region.*5 行为空.*5%/);
    expect(s.hint).toMatch(/api_data_query/);
  });

  it('超大结果集：提示先聚合或加过滤', () => {
    const s = summarizePreview({ total: 60_000, nullCounts: {}, warnings: [] });
    expect(s.warnings.join('\n')).toMatch(/截断/);
  });

  it('正常结果：不产生额外告警', () => {
    const s = summarizePreview({ total: 30, nullCounts: { day: 0 }, warnings: [] });
    expect(s.warnings).toEqual([]);
  });
});
