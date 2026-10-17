// sec-lab P2 的可确定性验证（2026-10-17）。
//
// 覆盖不需要打网络的纯逻辑：模板库解析、CVE 本地库、发现项状态机、以及
// "前置条件不满足时必须明确报错"（SSRF 没开回调、URL 没参数）——这类报错如果
// 变成静默 false，用户会以为"验证过了没问题"。

import { describe, it, expect } from 'vitest';
import { BUILTIN_TEMPLATES, runTemplates } from '../src/plugins/sec-lab-tools/templates.js';
import { lookupCve, searchExploit } from '../src/plugins/sec-lab-tools/intel.js';
import { updateFindingStatus, FINDING_STATUSES, verifySqli, verifySsrf, verifyXss } from '../src/plugins/sec-lab-tools/verify.js';
import { oastStatus } from '../src/plugins/sec-lab-tools/oast.js';

describe('POC 模板库', () => {
  it('7 个内置模板都能从 YAML 解析出来，id 唯一且每个都有匹配器', () => {
    expect(BUILTIN_TEMPLATES.length).toBe(7);
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.id)).size).toBe(7);
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.requests.length, `${t.id} 没有请求`).toBeGreaterThan(0);
      for (const r of t.requests) expect(r.matchers.length, `${t.id} 没有匹配器`).toBeGreaterThan(0);
    }
  });

  it('list 能列出、show 未知 id 明确报错', async () => {
    const r = await runTemplates('list');
    expect(r.summary).toContain('git-config-exposure');
    await expect(runTemplates('show', { id: 'nope' })).rejects.toThrow(/没有模板/);
  });
});

describe('CVE 情报（离线快照，不编）', () => {
  it('精确 CVE 能查到，并给出 CVSS / KEV', () => {
    const r = lookupCve('CVE-2021-44228');
    expect(r.findings[0].severity).toBe('critical');
    expect(r.summary).toContain('KEV');
  });

  it('产品关键词能命中多条', () => {
    const r = lookupCve('log4j');
    expect(r.findings.length).toBeGreaterThan(0);
  });

  it('★ 查不到时明说"本地库没有"，不返回"无漏洞"', () => {
    const r = lookupCve('CVE-1999-99999');
    expect(r.summary).toContain('没有匹配');
    expect(r.findings[0].severity).toBe('info');
  });

  it('exploit_search 不提供利用代码，只给 KEV 线索', () => {
    const r = searchExploit('log4j');
    expect(r.summary).toContain('不提供利用代码');
  });
});

describe('发现项状态机', () => {
  const mkDeps = () => {
    let list = [
      { id: 'f1', title: '测试发现', status: 'open', target: 'example.com' },
      { id: 'f2', title: '另一条', status: 'open', target: 'example.com' },
    ] as Array<Record<string, unknown>>;
    return {
      loadFindings: async () => list,
      saveFindings: async (v: Array<Record<string, unknown>>) => { list = v; },
      read: () => list,
    };
  };

  it('open → verified，并写入 statusAt', async () => {
    const d = mkDeps();
    const r = await updateFindingStatus('f1', 'verified', d);
    expect(r.summary).toContain('open → verified');
    expect(d.read()[0].status).toBe('verified');
    expect(typeof d.read()[0].statusAt).toBe('number');
  });

  it('非法状态 / 不存在的 id 都明确报错', async () => {
    const d = mkDeps();
    await expect(updateFindingStatus('f1', 'bogus', d)).rejects.toThrow(/status 必须是/);
    await expect(updateFindingStatus('nope', 'fixed', d)).rejects.toThrow(/没找到/);
    expect(FINDING_STATUSES).toEqual(['open', 'verified', 'fixed', 'accepted', 'fp']);
  });
});

describe('验证工具的前置条件必须明确报错', () => {
  it('URL 没有查询参数时直接说明，而不是空跑一遍', async () => {
    await expect(verifySqli('http://example.com/a')).rejects.toThrow(/没有查询参数/);
    await expect(verifyXss('http://example.com/a')).rejects.toThrow(/没有查询参数/);
  });

  it('★ SSRF 未启动回调服务时明确要求先 /oob start', async () => {
    expect(oastStatus().running).toBe(false);
    await expect(verifySsrf('http://example.com/a?url=x')).rejects.toThrow(/先 \/oob start/);
  });
});
