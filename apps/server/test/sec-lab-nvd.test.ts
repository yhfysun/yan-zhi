/**
 * NVD 在线查询（sec-lab P2）：按 CVE 精确查 / 关键词检索；失败给出离线回退提示。
 * 用注入的 fetch，测试不打网络。
 */
import { describe, it, expect } from 'vitest';
import { lookupNvd } from '../src/plugins/sec-lab-tools/intel.js';

function fakeFetch(body: unknown, ok = true, status = 200) {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(String(url));
    return { ok, status, json: async () => body } as any;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const SAMPLE = {
  vulnerabilities: [{
    cve: {
      id: 'CVE-2021-44228',
      descriptions: [{ lang: 'en', value: 'Apache Log4j2 JNDI features do not protect against attacker controlled LDAP.' }],
      metrics: { cvssMetricV31: [{ cvssData: { baseScore: 10, baseSeverity: 'CRITICAL' } }] },
      weaknesses: [{ description: [{ value: 'CWE-502' }] }],
      references: [{ url: 'https://nvd.nist.gov/vuln/detail/CVE-2021-44228' }],
    },
  }],
};

describe('lookupNvd', () => {
  it('按 CVE 编号精确查：分数/严重度/描述/CWE/参考', async () => {
    const { fn, calls } = fakeFetch(SAMPLE);
    const r = await lookupNvd('cve-2021-44228', { fetch: fn });
    expect(calls[0]).toContain('cveId=CVE-2021-44228');
    expect(r.summary).toContain('CVSS 10');
    expect(r.findings[0]).toMatchObject({ title: expect.stringContaining('CVE-2021-44228'), severity: 'critical' });
    expect(r.findings[0].evidence).toContain('CWE-502');
    expect(r.findings[0].remediation).toContain('nvd.nist.gov');
  });

  it('关键词检索走 keywordSearch', async () => {
    const { fn, calls } = fakeFetch(SAMPLE);
    await lookupNvd('log4j', { fetch: fn });
    expect(calls[0]).toContain('keywordSearch=log4j');
  });

  it('无结果：明确说明而不是报错', async () => {
    const { fn } = fakeFetch({ vulnerabilities: [] });
    const r = await lookupNvd('CVE-1999-0001', { fetch: fn });
    expect(r.summary).toContain('未返回匹配');
    expect(r.findings[0].severity).toBe('info');
  });

  it('HTTP 失败：抛出并提示离线回退', async () => {
    const { fn } = fakeFetch({}, false, 503);
    await expect(lookupNvd('log4j', { fetch: fn })).rejects.toThrow(/NVD 查询失败.*离线/);
  });
});
