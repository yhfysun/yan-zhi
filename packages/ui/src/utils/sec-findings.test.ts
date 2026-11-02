import { describe, it, expect } from 'vitest';
import { parseSecFindings } from './sec-findings';

describe('parseSecFindings', () => {
  it('JSON 字符串里的 findings 正常解析', () => {
    const r = parseSecFindings(JSON.stringify({
      tool: 'toolchain:nmap',
      findings: [{ title: '开放端口', severity: 'info', detail: '22/tcp', target: '10.0.0.5' }],
    }));
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe('开放端口');
  });

  it('对象入参、缺 findings、非 JSON 文本、无 title 条目都被安全忽略', () => {
    expect(parseSecFindings({ findings: [{ title: 'x' }] })).toHaveLength(1);
    expect(parseSecFindings({ summary: 'no findings' })).toEqual([]);
    expect(parseSecFindings('not json')).toEqual([]);
    expect(parseSecFindings(JSON.stringify({ findings: [{ detail: 'no title' }, { title: 'ok' }] }))).toHaveLength(1);
    expect(parseSecFindings(null)).toEqual([]);
  });

  it('上限 20 条', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ title: `f${i}` }));
    expect(parseSecFindings({ findings: many })).toHaveLength(20);
  });
});
