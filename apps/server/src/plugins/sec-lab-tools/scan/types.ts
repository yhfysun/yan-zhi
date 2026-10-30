// 扫描作业的公共类型（P1，2026-10-30）。
//
// ★ 为什么单独一层：源码 / URL / 安装包三类输入的**结果形态必须一致**，
//   否则前端要写三套渲染、报告要写三套汇总、基线抑制也要各做一遍。
//   这里只定义契约，不 import 插件运行时（storage/guard 由调用方注入）。
import type { Finding, Severity, ToolOutput } from '../../sec-lab-types.js';
import { maskSecrets } from './redact.js';

export type ScanKind = 'source' | 'url' | 'package' | 'self';
export type ScanStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled';
export type StageStatus = 'pending' | 'running' | 'done' | 'failed';

export interface ScanStage {
  name: string;
  status: StageStatus;
  startedAt?: number;
  durationMs?: number;
  note?: string;
}

/** 扫描发现项：在 Finding 上补可定位、可去重的字段 */
export interface ScanFinding extends Finding {
  /** 规则 id（源码）或步骤 id（URL/制品），用于统计与基线 */
  ruleId: string;
  /** 定位：相对路径:行号 / URL / 清单属性 */
  location: string;
  /** 去重与基线抑制的稳定指纹 */
  fingerprint: string;
  /** 被基线抑制（仍保留在作业里，报告默认不列） */
  suppressed?: boolean;
}

export interface ScanArtifact {
  kind: 'report' | 'unpack' | 'raw';
  path: string;
  note?: string;
}

export interface ScanJob {
  id: string;
  kind: ScanKind;
  target: string;
  profile: string;
  status: ScanStatus;
  stages: ScanStage[];
  findings: ScanFinding[];
  artifacts: ScanArtifact[];
  /** 生效的基线 id */
  baselineId?: string;
  summary?: string;
  error?: string;
  createdAt: number;
  finishedAt?: number;
  createdBy: 'human' | 'agent';
}

export interface ScanLimits {
  maxFiles: number;
  maxBytes: number;
  maxDurationMs: number;
  maxFindings: number;
}

export const DEFAULT_LIMITS: ScanLimits = {
  maxFiles: 2000,
  maxBytes: 512 * 1024,
  maxDurationMs: 120_000,
  maxFindings: 500,
};

/** 扫描引擎拿到的上下文：报告进度、写产物、随时检查是否超限 */
export interface ScanContext {
  jobId: string;
  kind: ScanKind;
  target: string;
  profile: string;
  limits: ScanLimits;
  startedAt: number;
  /** 标记某阶段开始（阶段名必须在 Scanner.stages 里） */
  beginStage(name: string): void;
  /** 标记某阶段结束 */
  endStage(name: string, note?: string): void;
  /** 中止：超时或用户取消时由编排层设置 */
  aborted(): boolean;
}

export interface ScanResult {
  findings: ScanFinding[];
  summary: string;
  artifacts?: ScanArtifact[];
  /** 引擎自报的部分统计，进作业 raw */
  raw?: unknown;
}

export interface Scanner {
  id: string;
  kinds: ScanKind[];
  /** 阶段清单：编排层据此预填进度 */
  stages: string[];
  run(ctx: ScanContext): Promise<ScanResult>;
}

/** 稳定的发现项指纹：同一处问题重复扫描必须得到同一个值 */
export function fingerprintOf(ruleId: string, location: string, evidence?: string): string {
  const norm = (evidence || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  return `${ruleId}@${location}#${hash32(`${ruleId}|${location}|${norm}`)}`;
}

/** 32 位 FNV-1a：够用且无需依赖，避免为了一个指纹引入 crypto 的异步形态 */
function hash32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 把作业转成既有 ToolOutput，复用 renderOutput / sec_report 的渲染链路 */
export function jobToOutput(job: ScanJob): ToolOutput {
  const active = job.findings.filter((f) => !f.suppressed);
  const bySeverity = active.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});
  return {
    tool: 'scan',
    target: job.target,
    risk: job.kind === 'url' || job.kind === 'self' ? 'active' : 'passive',
    summary: job.summary || `扫描 ${job.kind} / ${job.profile}：${active.length} 条发现`,
    findings: active.map(({ ruleId, location, fingerprint, suppressed, ...f }) => ({
      ...f,
      // ★ 输出层统一脱敏：密钥/令牌只留少量字符（运行卡、审计、对话都走这里）
      detail: maskSecrets(`${f.detail}\n定位：${location}`),
      evidence: f.evidence ? maskSecrets(f.evidence) : f.evidence,
    })),
    raw: {
      jobId: job.id,
      kind: job.kind,
      profile: job.profile,
      status: job.status,
      stages: job.stages,
      bySeverity,
      suppressed: job.findings.length - active.length,
    },
  };
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4, high: 3, medium: 2, low: 1, info: 0,
};
