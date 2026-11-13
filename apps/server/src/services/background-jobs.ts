import crypto from 'node:crypto';
import { db } from '../db.js';
import { createLogger } from './logger.js';

const logger = createLogger('background-jobs');

export const BACKGROUND_JOB_STATUSES = [
  'queued',
  'starting',
  'running',
  'paused',
  'finalizing',
  'verifying',
  'completed',
  'failed',
  'cancelled',
  'stalled',
] as const;

export type BackgroundJobStatus = typeof BACKGROUND_JOB_STATUSES[number];
export type BackgroundJobKind = 'browser_download' | 'python_process' | 'command_process' | 'package_build';
export type BackgroundJobWakePolicy = 'resume' | 'notify' | 'silent';
export type BackgroundJobControlOperation = 'pause' | 'resume' | 'cancel';

export interface BackgroundJobProgressInput {
  percent?: number | null;
  bytesDone?: number;
  bytesTotal?: number | null;
  speedBps?: number | null;
  etaMs?: number | null;
  etaAt?: number | null;
}

export interface BackgroundJobControlCapabilities {
  pause?: boolean;
  resume?: boolean;
  cancel?: boolean;
}

export interface BackgroundJob {
  id: string;
  idempotencyKey: string | null;
  userId: string;
  conversationId: string;
  taskId: string | null;
  toolCallId: string | null;
  parentGoalId: string | null;
  kind: BackgroundJobKind;
  status: BackgroundJobStatus;
  wakePolicy: BackgroundJobWakePolicy;
  title: string;
  progress: number | null;
  bytesDone: number;
  bytesTotal: number | null;
  speedBps: number | null;
  etaMs: number | null;
  etaAt: number | null;
  artifactPaths: string[];
  result: unknown;
  error: string | null;
  checkpoint: unknown;
  spec: Record<string, unknown>;
  adapterRef: string | null;
  controlCapabilities: BackgroundJobControlCapabilities;
  heartbeatAt: number | null;
  lastProgressAt: number | null;
  createdAt: number;
  startedAt: number | null;
  updatedAt: number;
  terminalAt: number | null;
  terminalVersion: number;
}

export interface BackgroundJobEvent {
  id: string;
  jobId: string;
  type: string;
  dedupeKey: string | null;
  payload: unknown;
  deliveryAttempts: number;
  lastDeliveryError: string | null;
  createdAt: number;
  deliveredAt: number | null;
}

export interface CreateBackgroundJobInput {
  kind: BackgroundJobKind;
  userId?: string;
  conversationId: string;
  taskId?: string | null;
  toolCallId?: string | null;
  parentGoalId?: string | null;
  wakePolicy?: BackgroundJobWakePolicy;
  title: string;
  status?: Exclude<BackgroundJobStatus, 'completed' | 'failed' | 'cancelled' | 'stalled'>;
  idempotencyKey?: string | null;
  adapterRef?: string | null;
  progress?: BackgroundJobProgressInput;
  artifactPaths?: string[];
  result?: unknown;
  error?: string | null;
  checkpoint?: unknown;
  spec?: Record<string, unknown>;
  controlCapabilities?: BackgroundJobControlCapabilities;
  at?: number;
}

export interface UpdateBackgroundJobProgressInput extends BackgroundJobProgressInput {
  status?: BackgroundJobStatus;
  artifactPaths?: string[];
  result?: unknown;
  error?: string | null;
  checkpoint?: unknown;
  controlCapabilities?: BackgroundJobControlCapabilities;
  at?: number;
}

export interface FinishBackgroundJobInput {
  status: 'completed' | 'failed' | 'cancelled' | 'stalled';
  progress?: BackgroundJobProgressInput;
  artifactPaths?: string[];
  result?: unknown;
  error?: string | null;
  checkpoint?: unknown;
  at?: number;
}

export interface ListBackgroundJobsInput {
  userId?: string;
  conversationId?: string;
  taskId?: string;
  kind?: BackgroundJobKind;
  status?: BackgroundJobStatus | BackgroundJobStatus[];
  activeOnly?: boolean;
  limit?: number;
}

export interface BackgroundJobControlResult {
  ok: boolean;
  status?: string;
  error?: string;
  code?: string;
  job?: BackgroundJob;
}

type TerminalJobHandler = (job: BackgroundJob, event: BackgroundJobEvent) => void;
type JobPublisher = (job: BackgroundJob, reason: 'created' | 'updated' | 'terminal') => void;
type JobControlHandler = (
  job: BackgroundJob,
  operation: BackgroundJobControlOperation,
) => BackgroundJobControlResult | Promise<BackgroundJobControlResult>;

const ACTIVE_STATUSES: BackgroundJobStatus[] = ['queued', 'starting', 'running', 'paused', 'finalizing', 'verifying'];
const TERMINAL_STATUSES: BackgroundJobStatus[] = ['completed', 'failed', 'cancelled', 'stalled'];
const PROGRESS_MIN_INTERVAL_MS = 2_000;
const PROGRESS_PERCENT_BUCKET = 5;

let terminalHandler: TerminalJobHandler | null = null;
let jobPublisher: JobPublisher | null = null;
let jobControlHandler: JobControlHandler | null = null;

const parseJson = <T>(raw: unknown, fallback: T): T => {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const finiteNumber = (raw: unknown): number | null => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

function normalizeWakePolicy(raw: unknown): BackgroundJobWakePolicy {
  return raw === 'notify' || raw === 'silent' || raw === 'resume' ? raw : 'resume';
}

function normalizeKind(raw: unknown): BackgroundJobKind {
  return raw === 'python_process' || raw === 'command_process' || raw === 'package_build'
    ? raw
    : 'browser_download';
}

function normalizeStatus(raw: unknown, fallback: BackgroundJobStatus): BackgroundJobStatus {
  return BACKGROUND_JOB_STATUSES.includes(raw as BackgroundJobStatus)
    ? raw as BackgroundJobStatus
    : fallback;
}

function calculateProgress(input: BackgroundJobProgressInput | undefined, fallback: number | null): number | null {
  if (!input) return fallback;
  const explicit = finiteNumber(input.percent);
  if (explicit != null) return Math.max(0, Math.min(100, Math.round(explicit * 10) / 10));
  const done = finiteNumber(input.bytesDone);
  const total = finiteNumber(input.bytesTotal);
  if (done != null && total != null && total > 0) {
    return Math.max(0, Math.min(100, Math.round((done / total) * 1000) / 10));
  }
  return fallback;
}

function rowToJob(row: any): BackgroundJob {
  return {
    id: String(row.id),
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
    userId: String(row.user_id),
    conversationId: String(row.conversation_id),
    taskId: row.task_id ? String(row.task_id) : null,
    toolCallId: row.tool_call_id ? String(row.tool_call_id) : null,
    parentGoalId: row.parent_goal_id ? String(row.parent_goal_id) : null,
    kind: normalizeKind(row.kind),
    status: normalizeStatus(row.status, 'failed'),
    wakePolicy: normalizeWakePolicy(row.wake_policy),
    title: String(row.title || row.kind || '后台任务'),
    progress: row.progress == null ? null : Number(row.progress),
    bytesDone: Math.max(0, Number(row.bytes_done) || 0),
    bytesTotal: row.bytes_total == null ? null : Math.max(0, Number(row.bytes_total) || 0),
    speedBps: row.speed_bps == null ? null : Number(row.speed_bps),
    etaMs: row.eta_ms == null ? null : Number(row.eta_ms),
    etaAt: row.eta_at == null ? null : Number(row.eta_at),
    artifactPaths: parseJson<string[]>(row.artifact_json, []).filter(v => typeof v === 'string'),
    result: parseJson<unknown>(row.result_json, null),
    error: row.error ? String(row.error) : null,
    checkpoint: parseJson<unknown>(row.checkpoint_json, null),
    spec: parseJson<Record<string, unknown>>(row.spec_json, {}),
    adapterRef: row.adapter_ref ? String(row.adapter_ref) : null,
    controlCapabilities: parseJson<BackgroundJobControlCapabilities>(row.control_capabilities_json, {}),
    heartbeatAt: row.heartbeat_at == null ? null : Number(row.heartbeat_at),
    lastProgressAt: row.last_progress_at == null ? null : Number(row.last_progress_at),
    createdAt: Number(row.created_at) || 0,
    startedAt: row.started_at == null ? null : Number(row.started_at),
    updatedAt: Number(row.updated_at) || 0,
    terminalAt: row.terminal_at == null ? null : Number(row.terminal_at),
    terminalVersion: Number(row.terminal_version) || 0,
  };
}

function rowToEvent(row: any): BackgroundJobEvent {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    type: String(row.type),
    dedupeKey: row.dedupe_key ? String(row.dedupe_key) : null,
    payload: parseJson<unknown>(row.payload_json, null),
    deliveryAttempts: Number(row.delivery_attempts) || 0,
    lastDeliveryError: row.last_delivery_error ? String(row.last_delivery_error) : null,
    createdAt: Number(row.created_at) || 0,
    deliveredAt: row.delivered_at == null ? null : Number(row.delivered_at),
  };
}

function jobRow(id: string): any {
  return db.prepare('SELECT * FROM background_job WHERE id = ?').get(id);
}

function eventRow(id: string): any {
  return db.prepare('SELECT * FROM background_job_event WHERE id = ?').get(id);
}

function resolveOwner(input: { userId?: string; conversationId: string }): string {
  const explicit = String(input.userId || '').trim();
  if (explicit) return explicit;
  const row = db.prepare('SELECT user_id FROM conversation WHERE id = ?').get(input.conversationId) as any;
  if (!row?.user_id) throw new Error('后台任务缺少 userId，且无法从会话解析归属');
  return String(row.user_id);
}

function publish(job: BackgroundJob, reason: 'created' | 'updated' | 'terminal'): void {
  try {
    jobPublisher?.(job, reason);
  } catch (error: any) {
    logger.warn(`[background-job] 推送任务 ${job.id} 失败:`, error?.message || error);
  }
}

function transitionAllowed(from: BackgroundJobStatus, to: BackgroundJobStatus): boolean {
  if (from === to) return true;
  if (TERMINAL_STATUSES.includes(from)) return false;
  if (TERMINAL_STATUSES.includes(to)) return true;
  const allowed: Record<BackgroundJobStatus, BackgroundJobStatus[]> = {
    queued: ['starting', 'running', 'paused'],
    starting: ['running', 'paused', 'finalizing'],
    running: ['paused', 'finalizing', 'verifying'],
    paused: ['running', 'finalizing', 'verifying'],
    finalizing: ['verifying', 'running'],
    verifying: ['running', 'finalizing'],
    completed: [],
    failed: [],
    cancelled: [],
    stalled: [],
  };
  return allowed[from]?.includes(to) ?? false;
}

export function setBackgroundJobTerminalHandler(handler: TerminalJobHandler | null): void {
  terminalHandler = handler;
}

export function setBackgroundJobPublisher(publisher: JobPublisher | null): void {
  jobPublisher = publisher;
}

export function setBackgroundJobControlHandler(handler: JobControlHandler | null): void {
  jobControlHandler = handler;
}

export function getBackgroundJob(id: string, userId?: string): BackgroundJob | null {
  const row = jobRow(String(id || '').trim());
  if (!row) return null;
  if (userId && String(row.user_id) !== String(userId)) return null;
  return rowToJob(row);
}

export function listBackgroundJobs(input: ListBackgroundJobsInput = {}): BackgroundJob[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (input.userId) {
    where.push('user_id = ?');
    params.push(input.userId);
  }
  if (input.conversationId) {
    where.push('conversation_id = ?');
    params.push(input.conversationId);
  }
  if (input.taskId) {
    where.push('task_id = ?');
    params.push(input.taskId);
  }
  if (input.kind) {
    where.push('kind = ?');
    params.push(input.kind);
  }
  if (input.activeOnly) {
    where.push(`status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`);
    params.push(...ACTIVE_STATUSES);
  } else if (Array.isArray(input.status)) {
    if (input.status.length) {
      where.push(`status IN (${input.status.map(() => '?').join(',')})`);
      params.push(...input.status);
    }
  } else if (input.status) {
    where.push('status = ?');
    params.push(input.status);
  }
  const limit = Math.max(1, Math.min(200, Math.floor(Number(input.limit) || 50)));
  params.push(limit);
  const rows = db.prepare(
    `SELECT * FROM background_job
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY updated_at DESC, created_at DESC
     LIMIT ?`,
  ).all(...params) as any[];
  return rows.map(rowToJob);
}

function insertJob(input: {
  id: string;
  userId: string;
  title: string;
  kind: BackgroundJobKind;
  status: BackgroundJobStatus;
  wakePolicy: BackgroundJobWakePolicy;
  conversationId: string;
  taskId: string | null;
  toolCallId: string | null;
  parentGoalId: string | null;
  idempotencyKey: string | null;
  adapterRef: string | null;
  progress: number | null;
  bytesDone: number;
  bytesTotal: number | null;
  speedBps: number | null;
  etaMs: number | null;
  etaAt: number | null;
  artifactPaths: string[];
  result: unknown;
  error: string | null;
  checkpoint: unknown;
  spec: Record<string, unknown>;
  controlCapabilities: BackgroundJobControlCapabilities;
  now: number;
}): BackgroundJob {
  db.prepare(`
    INSERT INTO background_job (
      id, idempotency_key, user_id, conversation_id, task_id, tool_call_id, parent_goal_id,
      kind, status, wake_policy, title, progress, bytes_done, bytes_total, speed_bps, eta_ms, eta_at,
      artifact_json, result_json, error, checkpoint_json, spec_json, adapter_ref,
      control_capabilities_json, heartbeat_at, last_progress_at, created_at, started_at, updated_at,
      terminal_at, terminal_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)
  `).run(
    input.id,
    input.idempotencyKey,
    input.userId,
    input.conversationId,
    input.taskId,
    input.toolCallId,
    input.parentGoalId,
    input.kind,
    input.status,
    input.wakePolicy,
    input.title,
    input.progress,
    input.bytesDone,
    input.bytesTotal,
    input.speedBps,
    input.etaMs,
    input.etaAt,
    JSON.stringify(input.artifactPaths),
    input.result === undefined ? null : JSON.stringify(input.result),
    input.error,
    input.checkpoint === undefined ? null : JSON.stringify(input.checkpoint),
    JSON.stringify(input.spec),
    input.adapterRef,
    JSON.stringify(input.controlCapabilities),
    input.now,
    input.now,
    input.now,
    input.now,
    input.now,
  );
  return rowToJob(jobRow(input.id));
}

export function createOrUpdateBackgroundJob(input: CreateBackgroundJobInput): BackgroundJob {
  const conversationId = String(input.conversationId || '').trim();
  if (!conversationId) throw new Error('conversationId 不能为空');
  const userId = resolveOwner({ userId: input.userId, conversationId });
  const idempotencyKey = String(input.idempotencyKey || '').trim() || null;
  if (idempotencyKey) {
    const existingRow = db.prepare('SELECT * FROM background_job WHERE idempotency_key = ?').get(idempotencyKey) as any;
    if (existingRow) {
      const existing = rowToJob(existingRow);
      if (TERMINAL_STATUSES.includes(existing.status)) return existing;
      return updateBackgroundJobProgress(existing.id, {
        ...(input.progress || {}),
        status: existing.status,
        artifactPaths: input.artifactPaths,
        result: input.result,
        error: input.error,
        checkpoint: input.checkpoint,
        controlCapabilities: input.controlCapabilities,
        at: input.at,
      });
    }
  }

  const now = Number(input.at) || Date.now();
  const status = normalizeStatus(input.status, 'running');
  if (TERMINAL_STATUSES.includes(status)) {
    throw new Error('创建任务不能直接使用终态，请调用 finishBackgroundJob');
  }
  const progress = input.progress || {};
  const bytesDone = Math.max(0, Number(progress.bytesDone) || 0);
  const bytesTotal = progress.bytesTotal == null ? null : Math.max(0, Number(progress.bytesTotal) || 0);
  const percent = calculateProgress(progress, null);
  const job = insertJob({
    id: `job_bg_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`,
    userId,
    title: String(input.title || '').trim().slice(0, 300) || '后台任务',
    kind: normalizeKind(input.kind),
    status,
    wakePolicy: normalizeWakePolicy(input.wakePolicy),
    conversationId,
    taskId: input.taskId ? String(input.taskId) : null,
    toolCallId: input.toolCallId ? String(input.toolCallId) : null,
    parentGoalId: input.parentGoalId ? String(input.parentGoalId) : null,
    idempotencyKey,
    adapterRef: input.adapterRef ? String(input.adapterRef) : null,
    progress: percent,
    bytesDone,
    bytesTotal,
    speedBps: progress.speedBps == null ? null : Number(progress.speedBps),
    etaMs: progress.etaMs == null ? null : Number(progress.etaMs),
    etaAt: progress.etaAt == null ? null : Number(progress.etaAt),
    artifactPaths: (input.artifactPaths || []).map(String).filter(Boolean).slice(0, 100),
    result: input.result ?? null,
    error: input.error ? String(input.error).slice(0, 4_000) : null,
    checkpoint: input.checkpoint ?? null,
    spec: input.spec || {},
    controlCapabilities: input.controlCapabilities || {},
    now,
  });
  publish(job, 'created');
  return job;
}

function shouldPersistProgress(
  existing: BackgroundJob,
  nextStatus: BackgroundJobStatus,
  nextPercent: number | null,
  now: number,
): boolean {
  if (existing.status !== nextStatus) return true;
  if (existing.lastProgressAt == null) return true;
  if (now - existing.lastProgressAt >= PROGRESS_MIN_INTERVAL_MS) return true;
  if (nextPercent == null && existing.progress == null) return false;
  if (nextPercent == null || existing.progress == null) return true;
  return Math.floor(nextPercent / PROGRESS_PERCENT_BUCKET)
    !== Math.floor(existing.progress / PROGRESS_PERCENT_BUCKET);
}

export function updateBackgroundJobProgress(
  id: string,
  patch: UpdateBackgroundJobProgressInput,
): BackgroundJob {
  const existing = getBackgroundJob(id);
  if (!existing) throw new Error('后台任务不存在');
  if (TERMINAL_STATUSES.includes(existing.status)) return existing;

  const now = Number(patch.at) || Date.now();
  const nextStatus = patch.status ? normalizeStatus(patch.status, existing.status) : existing.status;
  if (!transitionAllowed(existing.status, nextStatus)) {
    logger.warn(`[background-job] 忽略非法状态迁移 ${existing.status} -> ${nextStatus}: ${id}`);
    return existing;
  }
  const progressInput: BackgroundJobProgressInput = {
    percent: Object.prototype.hasOwnProperty.call(patch, 'percent') ? patch.percent : undefined,
    bytesDone: Object.prototype.hasOwnProperty.call(patch, 'bytesDone') ? patch.bytesDone : existing.bytesDone,
    bytesTotal: Object.prototype.hasOwnProperty.call(patch, 'bytesTotal') ? patch.bytesTotal : existing.bytesTotal,
    speedBps: Object.prototype.hasOwnProperty.call(patch, 'speedBps') ? patch.speedBps : existing.speedBps,
    etaMs: Object.prototype.hasOwnProperty.call(patch, 'etaMs') ? patch.etaMs : existing.etaMs,
    etaAt: Object.prototype.hasOwnProperty.call(patch, 'etaAt') ? patch.etaAt : existing.etaAt,
  };
  const nextPercent = calculateProgress(progressInput, existing.progress);
  if (!shouldPersistProgress(existing, nextStatus, nextPercent, now)) return existing;

  const bytesDone = Math.max(0, Number(progressInput.bytesDone ?? existing.bytesDone) || 0);
  const bytesTotal = progressInput.bytesTotal == null
    ? null
    : Math.max(0, Number(progressInput.bytesTotal) || 0);
  const artifactPaths = patch.artifactPaths
    ? patch.artifactPaths.map(String).filter(Boolean).slice(0, 100)
    : existing.artifactPaths;
  const controls = patch.controlCapabilities
    ? { ...existing.controlCapabilities, ...patch.controlCapabilities }
    : existing.controlCapabilities;
  const etaMs = progressInput.etaMs == null ? null : Number(progressInput.etaMs);
  const etaAt = progressInput.etaAt == null
    ? (etaMs != null && etaMs > 0 ? now + etaMs : null)
    : Number(progressInput.etaAt);

  db.prepare(`
    UPDATE background_job SET
      status = ?, progress = ?, bytes_done = ?, bytes_total = ?, speed_bps = ?, eta_ms = ?, eta_at = ?,
      artifact_json = ?, result_json = COALESCE(?, result_json), error = COALESCE(?, error),
      checkpoint_json = COALESCE(?, checkpoint_json), control_capabilities_json = ?,
      heartbeat_at = ?, last_progress_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    nextStatus,
    nextPercent,
    bytesDone,
    bytesTotal,
    progressInput.speedBps == null ? null : Number(progressInput.speedBps),
    etaMs,
    etaAt,
    JSON.stringify(artifactPaths),
    patch.result === undefined ? null : JSON.stringify(patch.result),
    patch.error === undefined ? null : (patch.error ? String(patch.error).slice(0, 4_000) : null),
    patch.checkpoint === undefined ? null : JSON.stringify(patch.checkpoint),
    JSON.stringify(controls),
    now,
    now,
    now,
    id,
  );
  const updated = getBackgroundJob(id)!;
  publish(updated, 'updated');
  return updated;
}

function dispatchEvent(eventId: string): boolean {
  const row = eventRow(eventId);
  if (!row) return false;
  const event = rowToEvent(row);
  if (event.deliveredAt) return false;
  const job = getBackgroundJob(event.jobId);
  if (!job) return false;
  if (!terminalHandler) return false;
  try {
    terminalHandler(job, event);
    db.prepare(
      'UPDATE background_job_event SET delivered_at = ?, delivery_attempts = delivery_attempts + 1, last_delivery_error = NULL WHERE id = ?',
    ).run(Date.now(), event.id);
    return true;
  } catch (error: any) {
    db.prepare(
      'UPDATE background_job_event SET delivery_attempts = delivery_attempts + 1, last_delivery_error = ? WHERE id = ?',
    ).run(String(error?.message || error).slice(0, 2_000), event.id);
    logger.warn(`[background-job] 终态交付失败 ${event.id}:`, error?.message || error);
    return false;
  }
}

export function finishBackgroundJob(
  id: string,
  input: FinishBackgroundJobInput,
): { job: BackgroundJob; event: BackgroundJobEvent | null; created: boolean } {
  const existing = getBackgroundJob(id);
  if (!existing) throw new Error('后台任务不存在');
  if (TERMINAL_STATUSES.includes(existing.status)) {
    return { job: existing, event: null, created: false };
  }
  const status = normalizeStatus(input.status, 'failed') as 'completed' | 'failed' | 'cancelled' | 'stalled';
  if (!TERMINAL_STATUSES.includes(status)) throw new Error(`非法终态: ${status}`);
  const now = Number(input.at) || Date.now();
  const progressInput = input.progress || {};
  const nextPercent = status === 'completed'
    ? 100
    : calculateProgress(progressInput, existing.progress);
  const bytesDone = Math.max(0, Number(progressInput.bytesDone ?? existing.bytesDone) || 0);
  const bytesTotal = progressInput.bytesTotal == null ? existing.bytesTotal : Number(progressInput.bytesTotal);
  const artifactPaths = input.artifactPaths
    ? input.artifactPaths.map(String).filter(Boolean).slice(0, 100)
    : existing.artifactPaths;
  const version = existing.terminalVersion + 1;
  const eventId = `jobevt_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
  const eventType = `job.${status}`;
  const dedupeKey = `terminal:${id}:${version}`;
  const eventPayload = {
    jobId: id,
    kind: existing.kind,
    status,
    title: existing.title,
    progress: nextPercent,
    bytesDone,
    bytesTotal,
    artifactPaths,
    result: input.result ?? existing.result,
    error: input.error !== undefined ? input.error : existing.error,
    terminalVersion: version,
    at: now,
  };
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE background_job SET
        status = ?, progress = ?, bytes_done = ?, bytes_total = ?,
        artifact_json = ?, result_json = COALESCE(?, result_json),
        error = ?, checkpoint_json = COALESCE(?, checkpoint_json),
        heartbeat_at = ?, last_progress_at = ?, updated_at = ?,
        terminal_at = ?, terminal_version = ?
      WHERE id = ? AND terminal_version = 0
    `).run(
      status,
      nextPercent,
      bytesDone,
      bytesTotal,
      JSON.stringify(artifactPaths),
      input.result === undefined ? null : JSON.stringify(input.result),
      input.error ? String(input.error).slice(0, 4_000) : existing.error,
      input.checkpoint === undefined ? null : JSON.stringify(input.checkpoint),
      now,
      now,
      now,
      now,
      version,
      id,
    );
    const current = getBackgroundJob(id)!;
    if (current.terminalVersion !== version || current.status !== status) {
      return { job: current, event: null, created: false };
    }
    db.prepare(`
      INSERT OR IGNORE INTO background_job_event
        (id, job_id, type, dedupe_key, payload_json, delivery_attempts, created_at, delivered_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, NULL)
    `).run(eventId, id, eventType, dedupeKey, JSON.stringify(eventPayload), now);
    const inserted = db.prepare('SELECT * FROM background_job_event WHERE dedupe_key = ?').get(dedupeKey) as any;
    return {
      job: getBackgroundJob(id)!,
      event: inserted ? rowToEvent(inserted) : null,
      created: !!inserted && String(inserted.id) === eventId,
    };
  });
  const result = tx() as { job: BackgroundJob; event: BackgroundJobEvent | null; created: boolean };
  if (result.created && result.event) {
    publish(result.job, 'terminal');
    dispatchEvent(result.event.id);
  }
  return result;
}

export function listBackgroundJobEvents(jobId: string): BackgroundJobEvent[] {
  const rows = db.prepare(
    'SELECT * FROM background_job_event WHERE job_id = ? ORDER BY created_at ASC, id ASC',
  ).all(jobId) as any[];
  return rows.map(rowToEvent);
}

export function requestBackgroundJobWake(
  id: string,
  userId?: string,
): { job: BackgroundJob; event: BackgroundJobEvent; created: boolean } {
  const job = getBackgroundJob(id, userId);
  if (!job) throw new Error('后台任务不存在');
  if (!TERMINAL_STATUSES.includes(job.status)) throw new Error('后台任务尚未结束，不能人工续跑');
  const dedupeKey = `manual-wake:${job.id}:${job.terminalVersion}`;
  const eventId = `jobevt_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
  const payload = {
    jobId: job.id,
    kind: job.kind,
    status: job.status,
    title: job.title,
    artifactPaths: job.artifactPaths,
    terminalVersion: job.terminalVersion,
    manual: true,
    at: Date.now(),
  };
  db.prepare(`
    INSERT OR IGNORE INTO background_job_event
      (id, job_id, type, dedupe_key, payload_json, delivery_attempts, created_at, delivered_at)
    VALUES (?, ?, 'job.manual_wake', ?, ?, 0, ?, NULL)
  `).run(eventId, job.id, dedupeKey, JSON.stringify(payload), Date.now());
  const row = db.prepare('SELECT * FROM background_job_event WHERE dedupe_key = ?').get(dedupeKey) as any;
  const event = rowToEvent(row);
  const created = String(row.id) === eventId;
  if (!event.deliveredAt) dispatchEvent(event.id);
  return { job: getBackgroundJob(job.id, userId) || job, event, created };
}

export function deliverPendingBackgroundJobEvents(): number {
  const rows = db.prepare(
    'SELECT id FROM background_job_event WHERE delivered_at IS NULL ORDER BY created_at ASC LIMIT 100',
  ).all() as any[];
  let delivered = 0;
  for (const row of rows) {
    if (dispatchEvent(String(row.id))) delivered++;
  }
  return delivered;
}

export function recoverInterruptedBackgroundJobs(now = Date.now()): number {
  const active = listBackgroundJobs({ activeOnly: true, limit: 200 });
  let recovered = 0;
  for (const job of active) {
    const result = finishBackgroundJob(job.id, {
      status: 'stalled',
      error: '服务或应用重启，后台任务连接已中断',
      checkpoint: {
        ...(job.checkpoint && typeof job.checkpoint === 'object' ? job.checkpoint as Record<string, unknown> : {}),
        recoverable: false,
        previousStatus: job.status,
      },
      at: now,
    });
    if (result.created) recovered++;
  }
  return recovered;
}

export function isBackgroundJobTerminal(status: BackgroundJobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isBackgroundJobActive(status: BackgroundJobStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export async function controlBackgroundJob(
  id: string,
  userId: string,
  operation: BackgroundJobControlOperation,
): Promise<BackgroundJobControlResult> {
  const job = getBackgroundJob(id, userId);
  if (!job) return { ok: false, code: 'NOT_FOUND', error: '后台任务不存在' };
  if (TERMINAL_STATUSES.includes(job.status)) {
    return { ok: false, code: 'JOB_TERMINAL', error: '后台任务已结束，不能再控制', job };
  }
  if (!jobControlHandler) {
    return { ok: false, code: 'JOB_CONTROL_UNSUPPORTED', error: '该后台任务未注册控制适配器', job };
  }
  try {
    const result = await jobControlHandler(job, operation);
    return { ...result, job: result.job || getBackgroundJob(id, userId) || job };
  } catch (error: any) {
    return {
      ok: false,
      code: 'JOB_CONTROL_FAILED',
      error: String(error?.message || error),
      job,
    };
  }
}
