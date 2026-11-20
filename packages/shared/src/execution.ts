/**
 * 跨浏览器、桌面与代码执行的统一回执协议。
 *
 * 工具仍保留各自的专用入参和输出字段；本协议只规定“执行后如何证明发生了什么”，
 * 供任务步骤、目标验收和审计共同消费。
 */

export type ExecutionTargetKind = 'browser' | 'desktop' | 'code' | 'system';

export type ExecutionEvidenceKind =
  | 'ui_tree'
  | 'dom'
  | 'screenshot'
  | 'console'
  | 'network'
  | 'text'
  | 'selector'
  | 'command'
  | 'test'
  | 'file'
  | 'artifact'
  | 'note';

export interface ExecutionEvidence {
  id?: string;
  kind: ExecutionEvidenceKind;
  summary: string;
  ref?: string;
  data?: unknown;
}

export interface ExecutionReceipt {
  schemaVersion: 1;
  target: ExecutionTargetKind;
  action: string;
  ok: boolean;
  startedAt: number;
  finishedAt: number;
  beforeRevision?: string;
  afterRevision?: string;
  changed?: boolean;
  evidence: ExecutionEvidence[];
  error?: string;
}

export interface CreateExecutionReceiptInput {
  target: ExecutionTargetKind;
  action: string;
  ok: boolean;
  startedAt?: number;
  finishedAt?: number;
  beforeRevision?: string;
  afterRevision?: string;
  changed?: boolean;
  evidence?: ExecutionEvidence[];
  error?: string;
}

export function createExecutionReceipt(input: CreateExecutionReceiptInput): ExecutionReceipt {
  const finishedAt = Number(input.finishedAt) || Date.now();
  return {
    schemaVersion: 1,
    target: input.target,
    action: String(input.action || 'unknown'),
    ok: input.ok === true,
    startedAt: Number(input.startedAt) || finishedAt,
    finishedAt,
    ...(input.beforeRevision ? { beforeRevision: input.beforeRevision } : {}),
    ...(input.afterRevision ? { afterRevision: input.afterRevision } : {}),
    ...(input.changed === undefined ? {} : { changed: input.changed }),
    evidence: Array.isArray(input.evidence)
      ? input.evidence
          .filter((item) => item && item.kind && item.summary)
          .slice(0, 50)
          .map((item) => ({
            ...item,
            kind: item.kind,
            summary: String(item.summary).slice(0, 1000),
            ...(item.ref ? { ref: String(item.ref).slice(0, 2000) } : {}),
          }))
      : [],
    ...(input.error ? { error: String(input.error).slice(0, 2000) } : {}),
  };
}

export function summarizeExecutionReceipt(receipt: ExecutionReceipt | null | undefined): string {
  if (!receipt) return '';
  const status = receipt.ok ? '成功' : '失败';
  const changed = receipt.changed === undefined
    ? ''
    : receipt.changed
      ? '，状态有变化'
      : '，状态未变化';
  return `${receipt.target}:${receipt.action} ${status}${changed}`;
}
