// 扫描编排层：把「一个扫描请求」变成可持久化、可对比、可抑制的作业。
//
// ★ 不做的事：不决定怎么扫（Scanner 决定）、不决定能扫谁（guard 决定）。
// ★ 做的事：作业生命周期、阶段进度、超时、指纹去重、基线抑制、结果落库。
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_LIMITS, SEVERITY_ORDER, fingerprintOf,
  type ScanContext, type ScanFinding, type ScanJob, type ScanKind, type ScanLimits,
  type Scanner,
} from './types.js';
import { normalizeProfile } from './profiles.js';
import { maskSecrets } from './redact.js';

export interface ScanBaseline {
  id: string;
  kind: ScanKind;
  target: string;
  fingerprints: string[];
  createdAt: number;
}

/** 插件存储适配器：编排层不直接碰 plugin_storage，便于单测 */
export interface ScanStore {
  loadJobs(): Promise<ScanJob[]>;
  saveJobs(jobs: ScanJob[]): Promise<void>;
  loadBaselines(): Promise<ScanBaseline[]>;
  saveBaselines(list: ScanBaseline[]): Promise<void>;
}

export const JOB_KEEP = 50;
export const BASELINE_KEEP = 30;

export interface RunScanOptions {
  kind: ScanKind;
  target: string;
  profile?: string;
  scanners: Scanner[];
  store?: ScanStore;
  limits?: Partial<ScanLimits>;
  createdBy?: 'human' | 'agent';
  /** 引擎专属参数（凭证等）：只在内存里传给 scanner，不写作业 */
  extra?: Record<string, unknown>;
}

function pickScanner(scanners: Scanner[], kind: ScanKind): Scanner | undefined {
  return scanners.find((s) => s.kinds.includes(kind));
}

/** 去重：同一 fingerprint 只留证据更完整的一条 */
function dedupe(findings: ScanFinding[]): ScanFinding[] {
  const map = new Map<string, ScanFinding>();
  for (const f of findings) {
    const prev = map.get(f.fingerprint);
    if (!prev) { map.set(f.fingerprint, f); continue; }
    if ((f.evidence?.length || 0) > (prev.evidence?.length || 0)) map.set(f.fingerprint, f);
  }
  return [...map.values()];
}

function sortBySeverity(findings: ScanFinding[]): ScanFinding[] {
  return [...findings].sort((a, b) => {
    const d = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    return d !== 0 ? d : a.location.localeCompare(b.location);
  });
}

function summarize(kind: ScanKind, profile: string, findings: ScanFinding[], suppressed: number): string {
  const active = findings.filter((f) => !f.suppressed);
  const by: Record<string, number> = {};
  for (const f of active) by[f.severity] = (by[f.severity] || 0) + 1;
  const parts = Object.entries(by)
    .sort((a, b) => SEVERITY_ORDER[b[0] as keyof typeof SEVERITY_ORDER] - SEVERITY_ORDER[a[0] as keyof typeof SEVERITY_ORDER])
    .map(([k, v]) => `${k} ${v}`);
  return `${kind} / ${profile}：${active.length} 条发现${parts.length ? `（${parts.join('，')}）` : ''}` +
    (suppressed ? `，基线抑制 ${suppressed} 条` : '');
}

/** 取该目标最近一次基线 */
export async function activeBaseline(
  store: ScanStore | undefined, kind: ScanKind, target: string,
): Promise<ScanBaseline | undefined> {
  if (!store) return undefined;
  const list = await store.loadBaselines();
  return list
    .filter((b) => b.kind === kind && b.target === target)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

/** 把一个已完成作业的指纹存成基线 */
export async function acceptBaseline(
  store: ScanStore, job: ScanJob,
): Promise<ScanBaseline> {
  const list = await store.loadBaselines();
  const baseline: ScanBaseline = {
    id: `bl_${randomUUID().slice(0, 8)}`,
    kind: job.kind,
    target: job.target,
    fingerprints: [...new Set(job.findings.map((f) => f.fingerprint))],
    createdAt: Date.now(),
  };
  await store.saveBaselines([...list, baseline].slice(-BASELINE_KEEP));
  return baseline;
}

/**
 * 滚动基线：同 kind+target 只保留最新一条。
 * ★ 定时巡检每一轮都要把「本轮全部指纹」写回，否则同一发现会在之后每一轮重复告警；
 *   而 `acceptBaseline` 是"再建一条"，用在人工 /scan-baseline 上，二者语义不同。
 */
export async function upsertBaseline(
  store: ScanStore, kind: ScanKind, target: string, fingerprints: string[],
): Promise<ScanBaseline> {
  const list = (await store.loadBaselines()).filter(
    (b) => !(b.kind === kind && b.target === target),
  );
  const baseline: ScanBaseline = {
    id: `bl_${randomUUID().slice(0, 8)}`,
    kind,
    target,
    fingerprints: [...new Set(fingerprints)],
    createdAt: Date.now(),
  };
  await store.saveBaselines([...list, baseline].slice(-BASELINE_KEEP));
  return baseline;
}

export async function runScan(o: RunScanOptions): Promise<ScanJob> {
  const scanner = pickScanner(o.scanners, o.kind);
  if (!scanner) throw new Error(`没有能处理 ${o.kind} 扫描的引擎`);

  const profile = normalizeProfile(o.kind, o.profile);
  const limits: ScanLimits = { ...DEFAULT_LIMITS };
  for (const [k, v] of Object.entries(o.limits || {})) {
    if (typeof v === 'number' && Number.isFinite(v)) (limits as unknown as Record<string, number>)[k] = v;
  }
  const stages = scanner.stages.map((name) => ({ name, status: 'pending' as const }));

  const job: ScanJob = {
    id: `sj_${randomUUID().slice(0, 8)}`,
    kind: o.kind,
    target: o.target,
    profile,
    status: 'running',
    stages,
    findings: [],
    artifacts: [],
    createdAt: Date.now(),
    createdBy: o.createdBy || 'agent',
  };

  const startedAt = Date.now();
  const ctx: ScanContext = {
    jobId: job.id,
    kind: o.kind,
    target: o.target,
    profile,
    limits,
    startedAt,
    extra: o.extra,
    beginStage(name) {
      const s = job.stages.find((x) => x.name === name);
      if (!s) return;
      s.status = 'running';
      s.startedAt = Date.now();
    },
    endStage(name, note) {
      const s = job.stages.find((x) => x.name === name);
      if (!s) return;
      s.status = 'done';
      s.durationMs = s.startedAt ? Date.now() - s.startedAt : undefined;
      if (note) s.note = note;
    },
    aborted() {
      return Date.now() - startedAt > limits.maxDurationMs;
    },
  };

  try {
    const result = await withTimeout(scanner.run(ctx), limits.maxDurationMs);
    // ★ 落库前先脱敏：作业会持久化到 plugin_storage，原始密钥不该留在盘上
    const masked = result.findings.map((f) => ({
      ...f,
      detail: maskSecrets(f.detail),
      evidence: f.evidence ? maskSecrets(f.evidence) : f.evidence,
    }));
    let findings = dedupe(masked).slice(0, limits.maxFindings);
    const baseline = await activeBaseline(o.store, o.kind, o.target);
    if (baseline) {
      const known = new Set(baseline.fingerprints);
      findings = findings.map((f) => (known.has(f.fingerprint) ? { ...f, suppressed: true } : f));
      job.baselineId = baseline.id;
    }
    job.findings = sortBySeverity(findings);
    job.artifacts = result.artifacts || [];
    job.summary = result.summary || summarize(o.kind, profile, job.findings, job.findings.filter((f) => f.suppressed).length);
    job.status = job.stages.some((s) => s.status === 'failed') ? 'failed' : 'done';
    job.finishedAt = Date.now();
    // 收尾：没跑到的阶段标记完成，避免前端一直转圈
    for (const s of job.stages) if (s.status === 'pending') s.status = 'done';
  } catch (e) {
    job.status = 'failed';
    job.error = e instanceof Error ? e.message : String(e);
    job.finishedAt = Date.now();
    const running = job.stages.find((s) => s.status === 'running');
    if (running) running.status = 'failed';
  }

  if (o.store) {
    const jobs = await o.store.loadJobs();
    await o.store.saveJobs([...jobs, job].slice(-JOB_KEEP));
  }
  return job;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`扫描超时（${Math.round(ms / 1000)}s）`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); });
  });
}

export { fingerprintOf };
