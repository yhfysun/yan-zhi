import {
  createTask,
  emitConversationEvent,
  findRunningTaskId,
  getLatestTaskRowForConversation,
  getTaskRow,
  injectUserMessage,
  insertMessage,
} from '../llm-task-manager.js';
import type { BackgroundJob, BackgroundJobEvent } from './background-jobs.js';

export interface BackgroundJobWakeDeps {
  findRunningTaskId: (conversationId: string, userId: string) => string | null;
  injectUserMessage: (conversationId: string, content: string, userId: string, clientMsgId?: string) => {
    status: 'injected' | 'no-task';
    msgId?: string;
    duplicate?: boolean;
  };
  insertMessage: (conversationId: string, userId: string, role: string, content: string) => string;
  emitConversationEvent: (conversationId: string, event: Record<string, unknown>) => void;
  getTaskRow: (taskId: string) => any;
  getLatestTaskRowForConversation?: (conversationId: string, userId?: string) => any;
  createTask: (params: Record<string, unknown>) => string;
}

const defaultDeps: BackgroundJobWakeDeps = {
  findRunningTaskId,
  injectUserMessage,
  insertMessage: (conversationId, userId, role, content) =>
    insertMessage(conversationId, userId, role, content),
  emitConversationEvent: (conversationId, event) =>
    emitConversationEvent(conversationId, event as any),
  getTaskRow,
  getLatestTaskRowForConversation,
  createTask: (params) => createTask(params as any),
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function statusTitle(job: BackgroundJob): string {
  if (job.status === 'completed') return '后台任务完成';
  if (job.status === 'cancelled') return '后台任务已取消';
  if (job.status === 'stalled') return '后台任务已中断';
  return '后台任务失败';
}

export function buildBackgroundJobWakeText(job: BackgroundJob, event?: BackgroundJobEvent): string {
  const lines = [
    `[${statusTitle(job)}]`,
    `jobId: ${job.id}`,
    `类型: ${job.kind}`,
    `任务: ${job.title}`,
    `状态: ${job.status}`,
  ];
  if (job.artifactPaths.length) {
    lines.push('产物:');
    for (const artifact of job.artifactPaths.slice(0, 10)) lines.push(`- ${artifact}`);
  }
  if (job.bytesDone > 0 || job.bytesTotal) {
    lines.push(`大小: ${formatBytes(job.bytesDone)}${job.bytesTotal ? ` / ${formatBytes(job.bytesTotal)}` : ''}`);
  }
  if (job.error) lines.push(`错误: ${job.error}`);
  if (event?.type) lines.push(`事件: ${event.type}`);
  lines.push(
    '',
    job.status === 'completed'
      ? '请从原任务断点继续：先读取 artifactPaths，再完成后续处理。不要重新启动同一个后台任务。'
      : '请从原任务断点继续：先核实失败阶段和现有产物，再决定修复、重试或向用户说明阻塞。',
  );
  return lines.join('\n');
}

function parseTaskParams(row: any): Record<string, any> {
  try {
    const parsed = row?.params_json ? JSON.parse(String(row.params_json)) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function emitTerminal(job: BackgroundJob, event: BackgroundJobEvent, deps: BackgroundJobWakeDeps): void {
  try {
    deps.emitConversationEvent(job.conversationId, {
      type: 'background_job:terminal',
      job: {
        jobId: job.id,
        kind: job.kind,
        status: job.status,
        wakePolicy: job.wakePolicy,
        title: job.title,
        progress: job.progress,
        bytesDone: job.bytesDone,
        bytesTotal: job.bytesTotal,
        artifactPaths: job.artifactPaths,
        error: job.error,
        terminalAt: job.terminalAt,
        terminalVersion: job.terminalVersion,
      },
      eventId: event.id,
    });
  } catch {
    // UI notification is best-effort; the durable job row and event remain the source of truth.
  }
}

function notify(job: BackgroundJob, event: BackgroundJobEvent, deps: BackgroundJobWakeDeps, prefix = ''): void {
  const text = `${prefix}${buildBackgroundJobWakeText(job, event)}`;
  const msgId = deps.insertMessage(job.conversationId, job.userId, 'assistant', text);
  deps.emitConversationEvent(job.conversationId, {
    type: 'message:added',
    message: { id: msgId, role: 'assistant', content: text },
  });
}

function resumeInNewTask(
  job: BackgroundJob,
  event: BackgroundJobEvent,
  deps: BackgroundJobWakeDeps,
): void {
  const row = (job.taskId ? deps.getTaskRow(job.taskId) : null)
    || deps.getLatestTaskRowForConversation?.(job.conversationId, job.userId)
    || null;
  const params = parseTaskParams(row);
  const platformId = typeof params.platformId === 'string' ? params.platformId : '';
  const modelId = typeof params.modelId === 'string' ? params.modelId : '';
  if (!platformId || !modelId) {
    notify(job, event, deps, '后台任务已结束，但原任务没有可继承的模型配置，未自动续跑。\n\n');
    return;
  }
  deps.createTask({
    conversationId: job.conversationId,
    userId: job.userId,
    platformId,
    modelId,
    userContent: buildBackgroundJobWakeText(job, event),
    agentId: params.agentId || null,
    origin: 'background_job',
    includeUiTools: true,
    workspaceDir: params.workspaceDir || undefined,
    pathGuard: params.pathGuard === 'strict' || params.pathGuard === 'off' ? params.pathGuard : undefined,
    modeFlags: params.modeFlags && typeof params.modeFlags === 'object' ? params.modeFlags : undefined,
    maxSteps: Number(params.maxSteps) > 0 ? Number(params.maxSteps) : undefined,
    ontologyIds: Array.isArray(params.ontologyIds) ? params.ontologyIds.map(String) : undefined,
    toolEnv: params.toolEnv && typeof params.toolEnv === 'object' ? params.toolEnv : undefined,
  });
}

export function wakeConversationForBackgroundJob(
  job: BackgroundJob,
  event: BackgroundJobEvent,
  deps: BackgroundJobWakeDeps = defaultDeps,
): void {
  emitTerminal(job, event, deps);
  const manual = event.type === 'job.manual_wake';
  if (!manual && job.wakePolicy === 'silent') return;
  if (!manual && job.wakePolicy === 'notify') {
    notify(job, event, deps);
    return;
  }

  const activeTaskId = deps.findRunningTaskId(job.conversationId, job.userId);
  if (activeTaskId) {
    const injected = deps.injectUserMessage(
      job.conversationId,
      buildBackgroundJobWakeText(job, event),
      job.userId,
      `wake:${job.id}:${job.terminalVersion}`,
    );
    if (injected.status === 'injected') return;
  }
  resumeInNewTask(job, event, deps);
}
