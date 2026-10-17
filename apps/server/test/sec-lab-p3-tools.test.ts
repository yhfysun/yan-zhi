// sec-lab P3 的纯逻辑验证（2026-10-17）。
//
// 基线的"判定规则"（缺哪些头、扣多少分）与巡检的"差异算法"不依赖网络，
// 是这一期最该被钉住的部分：口径错了，报告分数与"新增暴露面"告警就全是错的。

import { describe, it, expect } from 'vitest';
import { auditHeaders } from '../src/plugins/sec-lab-tools/baseline.js';
import { diffWatch, runWatch } from '../src/plugins/sec-lab-tools/watch.js';
import { DEFAULT_CREDS } from '../src/plugins/sec-lab-tools/brute.js';

describe('安全响应头审计', () => {
  it('全缺时分最低，且每个缺失项都出一条 finding', () => {
    const r = auditHeaders({}, true);
    expect(r.score).toBe(0);
    expect(r.missing).toContain('content-security-policy');
    expect(r.findings.some((f) => f.title.includes('content-security-policy'))).toBe(true);
  });

  it('全部具备时满分、无 finding', () => {
    const r = auditHeaders({
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'content-security-policy': "default-src 'self'",
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'geolocation=()',
    }, true);
    expect(r.score).toBe(100);
    expect(r.findings).toHaveLength(0);
  });

  it('★ 纯 HTTP 目标不检查 HSTS（否则是误报）', () => {
    const r = auditHeaders({}, false);
    expect(r.missing).not.toContain('strict-transport-security');
  });

  it('弱配置能识别：HSTS max-age=0、CSP unsafe-inline、版本号泄露', () => {
    const r = auditHeaders({
      'strict-transport-security': 'max-age=0',
      'content-security-policy': "default-src 'self' 'unsafe-inline'",
      server: 'nginx/1.18.0',
    }, true);
    expect(r.findings.some((f) => f.title.includes('max-age=0'))).toBe(true);
    expect(r.findings.some((f) => f.title.includes('unsafe-inline'))).toBe(true);
    expect(r.findings.some((f) => f.title.includes('版本号'))).toBe(true);
  });
});

describe('巡检差异算法', () => {
  it('只报新增，不报消失的（消失可能是防火墙拦截，不等于资产下线）', () => {
    const d = diffWatch(
      { ports: [80, 443], subs: ['www.example.com'] },
      { ports: [80, 443, 3306], subs: ['www.example.com', 'dev.example.com'] },
    );
    expect(d.newPorts).toEqual([3306]);
    expect(d.newSubs).toEqual(['dev.example.com']);
  });

  it('没有变化时两个数组都为空', () => {
    const d = diffWatch({ ports: [22], subs: ['a'] }, { ports: [22], subs: ['a'] });
    expect(d).toEqual({ newPorts: [], newSubs: [] });
  });

  it('list 在没有巡检时给出明确指引', async () => {
    const r = await runWatch({ action: 'list' }, async () => { /* noop */ });
    expect(r.summary).toContain('没有运行中的巡检');
  });
});

describe('默认口令清单', () => {
  it('8 组、两两不重复（重复只会浪费尝试次数还触发锁定）', () => {
    expect(DEFAULT_CREDS).toHaveLength(8);
    const key = DEFAULT_CREDS.map(([u, p]) => `${u}:${p}`);
    expect(new Set(key).size).toBe(key.length);
  });
});
