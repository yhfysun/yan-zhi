// /watch 自有资产体检巡检（P4 收尾，2026-10-31）。
//
// 两类保证不能只靠"看起来对"：
//   ① 增量必须复用编排层指纹基线 —— 第二轮只报新增指纹，老问题被 suppressed；
//   ② watch 的 self 分支只把「未抑制」的发现交给 onFindings，且 list 能看出上次体检与下次时间。
// 这里用假 scanner / 假 selfCheck 纯逻辑验证，不碰网络与真实仓库。

import { describe, it, expect, afterEach } from 'vitest';
import {
  runScan, upsertBaseline,
  type ScanBaseline, type ScanStore,
} from '../src/plugins/sec-lab-tools/scan/orchestrator';
import {
  jobToOutput, fingerprintOf,
  type ScanFinding, type ScanJob, type Scanner,
} from '../src/plugins/sec-lab-tools/scan/types';
import {
  listWatchers, runWatch, stopAllWatchers,
  type SelfCheckResult,
} from '../src/plugins/sec-lab-tools/watch';

afterEach(() => stopAllWatchers());

function memStore(): ScanStore & { jobs: ScanJob[]; baselines: ScanBaseline[] } {
  const mem = {
    jobs: [] as ScanJob[],
    baselines: [] as ScanBaseline[],
    loadJobs: async () => mem.jobs,
    saveJobs: async (list: ScanJob[]) => { mem.jobs = list; },
    loadBaselines: async () => mem.baselines,
    saveBaselines: async (list: ScanBaseline[]) => { mem.baselines = list; },
  };
  return mem;
}

function mkFinding(name: string): ScanFinding {
  const location = `src/${name}.ts:1`;
  return {
    ruleId: 'test-rule',
    title: `问题 ${name}`,
    severity: 'medium',
    detail: `详情 ${name}`,
    location,
    fingerprint: fingerprintOf('test-rule', location, name),
  };
}

/** 每轮返回当前的发现集合，用来模拟"仓库代码在巡检间隔里变了" */
function fakeScanner(current: () => ScanFinding[]): Scanner {
  return {
    id: 'fake-self',
    kinds: ['self'],
    stages: ['资产识别', '汇总'],
    async run() {
      return { findings: current(), summary: '假体检' };
    },
  };
}

describe('★ 滚动基线：第二轮只报新增指纹（复用编排层 baseline）', () => {
  it('upsertBaseline 后旧指纹被 suppressed，新指纹照报；再滚一轮则 0 新增', async () => {
    const store = memStore();
    const scanner = fakeScanner(() => [mkFinding('a'), mkFinding('b')]);

    const first = await runScan({ kind: 'self', target: '/repo', scanners: [scanner], store });
    expect(jobToOutput(first).findings).toHaveLength(2);
    await upsertBaseline(store, 'self', '/repo', first.findings.map((f) => f.fingerprint));

    const scanner2 = fakeScanner(() => [mkFinding('a'), mkFinding('b'), mkFinding('c')]);
    const second = await runScan({ kind: 'self', target: '/repo', scanners: [scanner2], store });
    const active = jobToOutput(second).findings;
    expect(active).toHaveLength(1);
    expect(active[0].title).toContain('c');
    // 被抑制的仍在作业里（便于报告复测项），只是不进输出
    expect(second.findings.filter((f) => f.suppressed)).toHaveLength(2);

    // 巡检"滚动基线"：把本轮全部指纹（含被抑制的）写回
    await upsertBaseline(store, 'self', '/repo', second.findings.map((f) => f.fingerprint));
    const third = await runScan({ kind: 'self', target: '/repo', scanners: [scanner2], store });
    expect(jobToOutput(third).findings).toHaveLength(0);
  });

  it('同 kind+target 的基线只保留最新一条（不会每轮堆积）', async () => {
    const store = memStore();
    await upsertBaseline(store, 'self', '/repo', ['x']);
    await upsertBaseline(store, 'self', '/repo', ['x', 'y']);
    const mine = store.baselines.filter((b) => b.kind === 'self' && b.target === '/repo');
    expect(mine).toHaveLength(1);
    expect(mine[0].fingerprints).toEqual(['x', 'y']);
  });
});

function selfResult(names: string[]): SelfCheckResult {
  return {
    findings: names.map((n) => ({ title: `问题 ${n}`, severity: 'medium', detail: `详情 ${n}` })),
    summary: `言智源码仓库：新增 ${names.length} 条，共 ${names.length} 条`,
    newFindings: names.length,
    totalFindings: names.length,
    suppressed: 0,
    jobId: 'sj_test',
  };
}

describe('★ /watch 自有资产体检模式', () => {
  it('start 进 self 模式：摘要含间隔/下次/重启恢复，list 能看到体检摘要', async () => {
    const r = await runWatch(
      { action: 'start', target: 'C:/repo', intervalMin: 10 },
      async () => { /* noop */ },
      async () => selfResult(['a', 'b']),
    );
    expect(r.summary).toContain('自有资产体检');
    expect(r.summary).toContain('每 10 分钟');
    expect(r.summary).toContain('下次');
    expect(r.summary).toContain('重新 /watch start');

    const entry = listWatchers()[0];
    expect(entry.mode).toBe('self');
    expect(entry.lastNewFindings).toBe(2);
    expect(entry.lastTotalFindings).toBe(2);

    const l = await runWatch({ action: 'list' }, async () => { /* noop */ });
    expect(l.summary).toContain('体检');
    expect(l.summary).toContain('新增 2 / 共 2');
    expect(l.summary).toContain('下次');
    expect(l.summary).toContain('重启');
  });

  it('tick 只把新增发现交给 onFindings，第二轮无新增时 findings 为空', async () => {
    const seen: Array<{ count: number; summary: string }> = [];
    const onFindings = async (_t: string, f: Array<{ title: string }>, summary: string) => {
      seen.push({ count: f.length, summary });
    };

    let next = selfResult(['a']);
    const tick = async () => runWatch(
      { action: 'tick', target: 'C:/repo' },
      onFindings,
      async () => next,
    );

    await runWatch({ action: 'start', target: 'C:/repo', intervalMin: 30 }, onFindings, async () => next);
    expect(seen.at(-1)?.count).toBe(1);

    next = selfResult(['b']);
    const r1 = await tick();
    expect(seen.at(-1)?.count).toBe(1);
    expect(r1.summary).toContain('新增 1');

    next = selfResult([]);
    const r2 = await tick();
    expect(r2.findings).toHaveLength(0);
    expect(seen.at(-1)?.count).toBe(0);
    expect(r2.summary).toContain('新增 0');
  });

  it('重启语义：定时器清空后 list 明确提示重新 start 且基线保留', async () => {
    await runWatch(
      { action: 'start', target: 'C:/repo', intervalMin: 30 },
      async () => { /* noop */ },
      async () => selfResult(['a']),
    );
    stopAllWatchers();

    const l = await runWatch({ action: 'list' }, async () => { /* noop */ });
    expect(l.summary).toContain('没有运行中的巡检');
    expect(l.summary).toContain('重新 /watch start');
    expect(l.summary).toContain('基线');
  });
});
