import type { ToolContext } from '../types';

export interface BackgroundJobProgressView {
  percent?: number | null;
  bytesDone?: number;
  bytesTotal?: number | null;
  speedBps?: number | null;
  etaMs?: number | null;
  etaAt?: number | null;
}

export interface BackgroundJobView {
  jobId: string;
  kind: 'browser_download' | 'python_process' | 'command_process' | 'package_build';
  status: string;
  wakePolicy: 'resume' | 'notify' | 'silent';
  title: string;
  conversationId?: string;
  taskId?: string | null;
  toolCallId?: string | null;
  progress?: number | null;
  bytesDone?: number;
  bytesTotal?: number | null;
  speedBps?: number | null;
  etaMs?: number | null;
  etaAt?: number | null;
  artifactPaths?: string[];
  result?: unknown;
  error?: string | null;
  checkpoint?: unknown;
  controlCapabilities?: { pause?: boolean; resume?: boolean; cancel?: boolean };
  createdAt?: number;
  startedAt?: number | null;
  updatedAt?: number;
  terminalAt?: number | null;
  terminalVersion?: number;
}

export interface RegisterBackgroundJobInput extends BackgroundJobProgressView {
  kind: BackgroundJobView['kind'];
  conversationId: string;
  taskId?: string;
  toolCallId?: string;
  parentGoalId?: string;
  wakePolicy?: BackgroundJobView['wakePolicy'];
  title: string;
  status?: string;
  idempotencyKey?: string;
  adapterRef?: string;
  artifactPaths?: string[];
  result?: unknown;
  error?: string;
  checkpoint?: unknown;
  spec?: Record<string, unknown>;
  controlCapabilities?: BackgroundJobView['controlCapabilities'];
}

export interface BackgroundJobControlView {
  ok: boolean;
  status?: string;
  error?: string;
  code?: string;
  job?: BackgroundJobView;
}

const UNIFIED_JOB_ID_RE = /^job_bg_[a-z0-9]+_[a-f0-9]+$/i;

export function isUnifiedBackgroundJobId(raw: unknown): boolean {
  return UNIFIED_JOB_ID_RE.test(String(raw || '').trim());
}

function apiBase(): string {
  const port = Number(process.env.PORT || process.env.YANZHI_API_PORT || 3001);
  return `http://127.0.0.1:${Number.isFinite(port) && port > 0 ? port : 3001}`;
}

function headers(ctx?: ToolContext): Record<string, string> {
  const out: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = String(process.env.YZ_INTERNAL_TOKEN || '').trim();
  if (token) out['x-yz-internal-token'] = token;
  if (ctx?.userId) out['x-yz-user-id'] = String(ctx.userId);
  return out;
}

async function request<T>(
  path: string,
  init: RequestInit,
  ctx?: ToolContext,
  timeoutMs = 5_000,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));
  try {
    const response = await fetch(`${apiBase()}/api/background-jobs${path}`, {
      ...init,
      headers: { ...headers(ctx), ...(init.headers as Record<string, string> | undefined || {}) },
      signal: controller.signal,
    });
    const json = await response.json().catch(() => null) as any;
    if (!response.ok) return null;
    return (json?.data ?? json) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function registerBackgroundJob(
  input: RegisterBackgroundJobInput,
  ctx?: ToolContext,
): Promise<BackgroundJobView | null> {
  if (!input.conversationId) return null;
  return request<BackgroundJobView>('/internal/upsert', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      userId: ctx?.userId,
      taskId: input.taskId || ctx?.taskId,
      toolCallId: input.toolCallId || ctx?.toolCallId,
      wakePolicy: input.wakePolicy || ctx?.wakePolicy || 'resume',
      spec: {
        ...(input.spec || {}),
        workspaceDir: input.spec?.workspaceDir || ctx?.workspaceDir,
      },
    }),
  }, ctx);
}

export async function fetchBackgroundJob(
  jobId: string,
  ctx?: ToolContext,
): Promise<BackgroundJobView | null> {
  const id = String(jobId || '').trim();
  if (!isUnifiedBackgroundJobId(id)) return null;
  return request<BackgroundJobView>(`/internal/${encodeURIComponent(id)}`, { method: 'GET' }, ctx);
}

export async function controlBackgroundJob(
  jobId: string,
  operation: 'pause' | 'resume' | 'cancel',
  ctx?: ToolContext,
): Promise<BackgroundJobControlView> {
  const id = String(jobId || '').trim();
  if (!isUnifiedBackgroundJobId(id)) {
    return { ok: false, code: 'INVALID_JOB_ID', error: 'jobId 格式不对' };
  }
  const result = await request<BackgroundJobControlView>(
    `/internal/${encodeURIComponent(id)}/control`,
    { method: 'POST', body: JSON.stringify({ operation }) },
    ctx,
    30_000,
  );
  return result || { ok: false, code: 'JOB_CONTROL_UNAVAILABLE', error: '后台任务控制接口不可用' };
}
