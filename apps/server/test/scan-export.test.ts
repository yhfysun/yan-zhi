/**
 * 导出接口测试（2026-10-30）。
 *
 * 钉住三件事：① 指定 jobId 只导该作业；② 基线抑制项不进报告；③ 未知 jobId 报错（路由据此回 404）。
 * 选材逻辑抽成了纯函数，所以不用起 Express 也能测到真实行为。
 */
import { describe, it, expect } from 'vitest';
import { buildReportExport } from '../src/plugins/sec-lab';
import type { ScanJob, ScanFinding } from '../src/plugins/sec-lab-tools/scan/types';

function finding(id: string, overrides: Partial<ScanFinding> = {}): ScanFinding {
  return {
    ruleId: id,
    location: `/tmp/${id}.ts:1`,
    fingerprint: `${id}@/tmp/${id}.ts:1#deadbeef`,
    title: `问题 ${id}`,
    severity: 'medium',
    detail: `详细说明 ${id}`,
    remediation: '修复建议',
    ...overrides,
  };
}

function job(id: string, findings: ScanFinding[]): ScanJob {
  return {
    id,
    kind: 'source',
    target: '/repo',
    profile: 'quick',
    status: 'done',
    stages: [{ name: '规则扫描', status: 'done' }],
    findings,
    artifacts: [],
    createdAt: 1_700_000_000_000,
    finishedAt: 1_700_000_060_000,
    createdBy: 'human',
  };
}

describe('导出选材', () => {
  it('指定 jobId 只导该作业，且排除基线抑制项', () => {
    const j1 = job('sj_1', [
      finding('a'),
      finding('b', { suppressed: true }),
    ]);
    const j2 = job('sj_2', [finding('c')]);
    const out = buildReportExport({ jobId: 'sj_1', jobs: [j1, j2], findings: [] });
    expect(out.count).toBe(1);
    expect(out.job?.id).toBe('sj_1');
    expect(out.text).toContain('问题 a');
    expect(out.text).not.toContain('问题 b');
    expect(out.text).not.toContain('问题 c');
    expect(out.text).toContain('sj_1');
  });

  it('未知 jobId 抛错（路由把错误映射成 404）', () => {
    expect(() => buildReportExport({ jobId: 'sj_missing', jobs: [], findings: [] }))
      .toThrow(/未找到作业/);
  });

  it('不传 jobId 时导出全量发现项', () => {
    const out = buildReportExport({
      jobs: [],
      findings: [
        { ...finding('x'), target: 'https://a.test', tool: 'scan', at: 1 },
        { ...finding('y'), target: 'https://a.test', tool: 'scan', at: 2 },
      ],
    });
    expect(out.count).toBe(2);
    expect(out.job).toBeUndefined();
    expect(out.text).toContain('问题 x');
    expect(out.text).toContain('问题 y');
    expect(out.text).not.toContain('作业：');
  });

  it('报告里的凭据仍被脱敏（输出层兜底）', () => {
    const out = buildReportExport({
      jobId: 'sj_leak',
      jobs: [job('sj_leak', [finding('leak', {
        detail: '配置里写了 token=supersecretvalue123',
        evidence: 'password: hunter2hunter2',
      })])],
      findings: [],
    });
    expect(out.text).not.toContain('supersecretvalue123');
    expect(out.text).not.toContain('hunter2hunter2');
  });
});
