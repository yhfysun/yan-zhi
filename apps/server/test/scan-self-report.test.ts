/**
 * 言智安全体检报告模板测试（P4 收尾，方案 6.4）。
 *
 * 钉住五件事：① 分类器把 self 作业的发现项按 ruleId 分到 源码/Electron 配置/运行时；
 * ② 报告结构与结论分支（高危→优先处理 / 仅中危→排期 / 空→健康）；③ 基线抑制项不进报告；
 * ④ 出口脱敏（detail/evidence 里的凭据必须打码）；⑤ buildReportExport 对 self 作业自动切模板。
 */
import { describe, it, expect } from 'vitest';
import { buildReportExport } from '../src/plugins/sec-lab';
import { buildSelfHealthReport, classifyFinding } from '../src/plugins/sec-lab-tools/scan/self/report';
import type { ScanJob, ScanFinding } from '../src/plugins/sec-lab-tools/scan/types';

function finding(ruleId: string, overrides: Partial<ScanFinding> = {}): ScanFinding {
  return {
    ruleId,
    location: `apps/demo/${ruleId}.ts:1`,
    fingerprint: `${ruleId}@loc#deadbeef`,
    title: `问题 ${ruleId}`,
    severity: 'medium',
    detail: `详细说明 ${ruleId}`,
    remediation: '修复建议',
    ...overrides,
  };
}

function selfJob(findings: ScanFinding[], overrides: Partial<ScanJob> = {}): ScanJob {
  return {
    id: 'sj_self',
    kind: 'self',
    target: '/repo',
    profile: 'standard',
    status: 'done',
    stages: [
      { name: '资产识别', status: 'done', note: '源码资产 + 2 个在听服务' },
      { name: 'Electron 配置', status: 'done', note: '1 个入口，2 条' },
    ],
    findings,
    artifacts: [],
    createdAt: 1_700_000_000_000,
    finishedAt: 1_700_000_060_000,
    createdBy: 'human',
    ...overrides,
  };
}

describe('分类器', () => {
  it('self 作业按 ruleId 前缀分三桶', () => {
    expect(classifyFinding('self', 'hardcoded-secret')).toBe('source');
    expect(classifyFinding('self', 'vulnerable-dependency')).toBe('source');
    expect(classifyFinding('self', 'env-not-ignored')).toBe('source');
    expect(classifyFinding('self', 'self-electron-csp-missing')).toBe('electron');
    expect(classifyFinding('self', 'self-runtime-cors-credentials')).toBe('runtime');
  });

  it('其他 kind 整体落单桶：package→制品，url→运行时，source→源码', () => {
    expect(classifyFinding('package', 'apk-unsigned')).toBe('package');
    expect(classifyFinding('url', 'api-anon-readable')).toBe('runtime');
    expect(classifyFinding('source', 'sql-concat')).toBe('source');
  });
});

describe('体检报告模板', () => {
  it('结构完整：执行摘要 → 按资产分类（只列非空桶）→ 修复清单 → 复测项', () => {
    const job = selfJob([
      finding('hardcoded-secret', { severity: 'high' }),
      finding('self-electron-csp-missing', { severity: 'medium' }),
      finding('self-runtime-cors-wildcard', { severity: 'low' }),
    ]);
    const out = buildSelfHealthReport(job);
    const pos = (s: string) => out.text.indexOf(s);
    expect(pos('# 言智安全体检报告')).toBeGreaterThanOrEqual(0);
    expect(pos('## 执行摘要')).toBeGreaterThan(pos('# 言智安全体检报告'));
    expect(pos('### 源码（规则 + 依赖）（1）')).toBeGreaterThan(pos('## 执行摘要'));
    expect(pos('### Electron 配置（1）')).toBeGreaterThan(pos('### 源码（规则 + 依赖）（1）'));
    expect(pos('### 运行时（1）')).toBeGreaterThan(pos('### Electron 配置（1）'));
    expect(pos('## 修复清单')).toBeGreaterThan(pos('### 运行时（1）'));
    expect(pos('## 复测项')).toBeGreaterThan(pos('## 修复清单'));
    expect(out.text).not.toContain('### 制品');
    expect(out.count).toBe(3);
    expect(out.text).toContain('- [ ] 1. **[高危] 问题 hardcoded-secret**');
  });

  it('结论分支：高危→优先处理；仅中危→排期；空→健康', () => {
    const hi = buildSelfHealthReport(selfJob([finding('a', { severity: 'critical' })]));
    expect(hi.text).toContain('需要优先处理：高危及以上 1 条');
    const mid = buildSelfHealthReport(selfJob([finding('b', { severity: 'medium' })]));
    expect(mid.text).toContain('建议尽快排期：中危 1 条');
    const empty = buildSelfHealthReport(selfJob([]));
    expect(empty.text).toContain('健康：没有需要处理的发现');
    expect(empty.count).toBe(0);
  });

  it('基线抑制项不进正文与计数，但在复测项里说明', () => {
    const job = selfJob([
      finding('kept'),
      finding('sup', { suppressed: true }),
    ]);
    const out = buildSelfHealthReport(job);
    expect(out.count).toBe(1);
    expect(out.text).toContain('问题 kept');
    expect(out.text).not.toContain('问题 sup');
    expect(out.text).toContain('基线抑制：1 条');
  });

  it('复测项列出每类命中的规则 id，并指向基线', () => {
    const job = selfJob([
      finding('self-electron-csp-missing'),
      finding('self-electron-csp-unsafe-eval'),
      finding('vulnerable-dependency'),
    ]);
    const out = buildSelfHealthReport(job);
    expect(out.text).toContain('源码（规则 + 依赖）：vulnerable-dependency');
    expect(out.text).toContain('Electron 配置：self-electron-csp-missing、self-electron-csp-unsafe-eval');
    expect(out.text).toContain('/scan-baseline');
  });

  it('出口脱敏：detail/evidence 里的凭据打码', () => {
    const job = selfJob([finding('leak', {
      detail: '配置里写了 token=supersecretvalue123',
      evidence: 'password: hunter2hunter2',
    })]);
    const out = buildSelfHealthReport(job);
    expect(out.text).not.toContain('supersecretvalue123');
    expect(out.text).not.toContain('hunter2hunter2');
  });
});

describe('导出接入', () => {
  it('buildReportExport 对 self 作业自动切体检模板', () => {
    const job = selfJob([finding('self-runtime-local-api-anonymous', { severity: 'low' })]);
    const out = buildReportExport({ jobId: 'sj_self', jobs: [job], findings: [] });
    expect(out.text).toContain('# 言智安全体检报告');
    expect(out.job?.id).toBe('sj_self');
    expect(out.count).toBe(1);
  });

  it('source 作业仍走通用模板（不含体检标题）', () => {
    const job: ScanJob = {
      ...selfJob([finding('sql-concat')]),
      kind: 'source',
      id: 'sj_src',
    };
    const out = buildReportExport({ jobId: 'sj_src', jobs: [job], findings: [] });
    expect(out.text).not.toContain('言智安全体检报告');
    expect(out.text).toContain('# 安全扫描报告');
  });
});
