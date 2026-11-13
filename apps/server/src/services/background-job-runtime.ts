import { readJobSnapshot } from '@yan-zhi/core';
import { spawnSync } from 'node:child_process';
import {
  finishBackgroundJob,
  getBackgroundJob,
  listBackgroundJobs,
  setBackgroundJobControlHandler,
  updateBackgroundJobProgress,
  type BackgroundJob,
  type BackgroundJobControlOperation,
  type BackgroundJobControlResult,
} from './background-jobs.js';
import { callBrowserBridgeRaw } from '../browser-bridge.js';
import { createLogger } from './logger.js';

const logger = createLogger('background-job-runtime');
const NATIVE_MONITOR_MS = 2_000;
const BROWSER_JOB_SWEEP_MS = 30_000;
const BROWSER_JOB_STALE_MS = 120_000;
const monitors = new Map<string, ReturnType<typeof setInterval>>();
let browserSweepTimer: ReturnType<typeof setInterval> | null = null;

function nativeJobId(job: BackgroundJob): string {
  const specId = String(job.spec.nativeJobId || '').trim();
  if (specId) return specId;
  const ref = String(job.adapterRef || '');
  return ref.includes(':') ? ref.slice(ref.indexOf(':') + 1) : '';
}

function nativeWorkspace(job: BackgroundJob): string | undefined {
  const value = String(job.spec.workspaceDir || '').trim();
  return value || undefined;
}

function artifactPathsFromStatus(status: Record<string, unknown> | null): string[] {
  const raw = status?.artifactPaths ?? status?.artifacts ?? status?.outputs;
  return Array.isArray(raw) ? raw.map(String).filter(Boolean).slice(0, 100) : [];
}

function progressFromStatus(status: Record<string, unknown> | null): Record<string, unknown> {
  if (!status) return {};
  const out: Record<string, unknown> = {};
  for (const key of ['percent', 'bytesDone', 'bytesTotal', 'speedBps', 'etaMs']) {
    if (status[key] !== undefined && status[key] !== null) out[key] = status[key];
  }
  if (status.progress !== undefined) {
    const value = status.progress;
    if (typeof value === 'number') out.percent = value;
    else if (value && typeof value === 'object') Object.assign(out, value);
  }
  return out;
}

function stopMonitor(jobId: string): void {
  const timer = monitors.get(jobId);
  if (timer) clearInterval(timer);
  monitors.delete(jobId);
}

function tickNativeJob(jobId: string): void {
  const job = getBackgroundJob(jobId);
  if (!job) {
    stopMonitor(jobId);
    return;
  }
  if (['completed', 'failed', 'cancelled', 'stalled'].includes(job.status)) {
    stopMonitor(jobId);
    return;
  }
  const id = nativeJobId(job);
  if (!id) {
    finishBackgroundJob(job.id, {
      status: 'failed',
      error: '后台任务缺少 nativeJobId，无法继续跟踪',
    });
    stopMonitor(jobId);
    return;
  }
  const snapshot = readJobSnapshot(nativeWorkspace(job), id, { tailLines: 20 });
  if (snapshot.state === 'running' || snapshot.state === 'starting') {
    const status = snapshot.status || null;
    updateBackgroundJobProgress(job.id, {
      status: snapshot.state === 'starting' ? 'starting' : 'running',
      ...progressFromStatus(status),
    });
    return;
  }
  if (snapshot.state === 'completed') {
    finishBackgroundJob(job.id, {
      status: 'completed',
      artifactPaths: artifactPathsFromStatus(snapshot.status),
      result: {
        exitCode: snapshot.status?.exitCode,
        elapsedSec: snapshot.elapsedSec,
      },
      checkpoint: snapshot.status,
    });
    stopMonitor(jobId);
    return;
  }
  if (snapshot.state === 'failed') {
    finishBackgroundJob(job.id, {
      status: 'failed',
      error: String(snapshot.status?.error || `进程退出码 ${snapshot.status?.exitCode ?? 'unknown'}`),
      artifactPaths: artifactPathsFromStatus(snapshot.status),
      checkpoint: snapshot.status,
    });
    stopMonitor(jobId);
    return;
  }
  if (snapshot.state === 'stale' || snapshot.state === 'missing') {
    if (snapshot.state === 'missing' && Date.now() - job.createdAt < 30_000) {
      return;
    }
    finishBackgroundJob(job.id, {
      status: 'stalled',
      error: snapshot.state === 'missing'
        ? '后台进程状态文件不存在'
        : '后台进程已退出，但没有写入终态',
      checkpoint: snapshot.status,
    });
    stopMonitor(jobId);
  }
}

export function ensureNativeBackgroundJobMonitor(job: BackgroundJob): void {
  if (!['python_process', 'command_process', 'package_build'].includes(job.kind)) return;
  if (['completed', 'failed', 'cancelled', 'stalled'].includes(job.status)) {
    stopMonitor(job.id);
    return;
  }
  if (monitors.has(job.id)) return;
  const timer = setInterval(() => tickNativeJob(job.id), NATIVE_MONITOR_MS);
  timer.unref?.();
  monitors.set(job.id, timer);
  tickNativeJob(job.id);
}

function numericDownloadId(job: BackgroundJob): number {
  const fromSpec = Number(job.spec.downloadId);
  if (Number.isFinite(fromSpec) && fromSpec > 0) return Math.floor(fromSpec);
  const ref = String(job.adapterRef || '');
  const raw = ref.slice(ref.lastIndexOf(':') + 1);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

async function controlDesktopDownload(
  job: BackgroundJob,
  operation: BackgroundJobControlOperation,
): Promise<BackgroundJobControlResult> {
  try {
    const result = await callBrowserBridgeRaw(
      job.conversationId,
      'browser_download_control',
      { operation, downloadId: numericDownloadId(job) },
      20_000,
      undefined,
      job.userId,
    );
    if (result?.error) {
      return { ok: false, code: 'JOB_CONTROL_FAILED', error: String(result.error) };
    }
    return {
      ok: true,
      status: String(result?.status || 'ok'),
      job: getBackgroundJob(job.id, job.userId) || job,
    };
  } catch (error: any) {
    return {
      ok: false,
      code: 'JOB_CONTROL_UNAVAILABLE',
      error: String(error?.message || error),
    };
  }
}

function controlNativeProcess(
  job: BackgroundJob,
  operation: BackgroundJobControlOperation,
): BackgroundJobControlResult {
  if (operation !== 'cancel') {
    return {
      ok: false,
      code: 'JOB_CONTROL_UNSUPPORTED',
      error: '当前进程类后台任务只支持取消，不支持暂停/恢复',
    };
  }
  const id = nativeJobId(job);
  const snapshot = id ? readJobSnapshot(nativeWorkspace(job), id, { tailLines: 0 }) : null;
  const pid = Number(snapshot?.status?.pid || snapshot?.status?.watchdogPid || 0);
  if (!Number.isInteger(pid) || pid <= 0) {
    return { ok: false, code: 'JOB_CONTROL_FAILED', error: '后台进程已不在或没有可取消的 pid' };
  }
  try {
    if (process.platform === 'win32') {
      const killed = spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
        encoding: 'utf8',
      });
      if (killed.status !== 0) {
        throw new Error((killed.stderr || killed.stdout || `taskkill exit ${killed.status}`).trim());
      }
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch (error: any) {
    return {
      ok: false,
      code: 'JOB_CONTROL_FAILED',
      error: `终止后台进程失败: ${error?.message || error}`,
    };
  }
  const finished = finishBackgroundJob(job.id, {
    status: 'cancelled',
    error: '用户或智能体取消了后台任务',
    checkpoint: snapshot?.status || null,
  });
  stopMonitor(job.id);
  return { ok: true, status: 'cancelled', job: finished.job };
}

export async function controlBackgroundJobAdapter(
  job: BackgroundJob,
  operation: BackgroundJobControlOperation,
): Promise<BackgroundJobControlResult> {
  const ref = String(job.adapterRef || '');
  if (job.kind === 'browser_download' && ref.startsWith('desktop-download:')) {
    return controlDesktopDownload(job, operation);
  }
  if (job.kind === 'python_process' || job.kind === 'command_process' || job.kind === 'package_build') {
    return controlNativeProcess(job, operation);
  }
  return {
    ok: false,
    code: 'JOB_CONTROL_UNSUPPORTED',
    error: job.kind === 'browser_download'
      ? '当前浏览器下载执行面不支持暂停/恢复/取消'
      : '该后台任务类型不支持控制',
  };
}

/**
 * 启动恢复：
 * - Python/命令/打包任务先重挂状态文件监视器；仍在运行就继续跟踪，已结束则补终态。
 * - 浏览器下载依赖 Electron/Playwright 进程内对象，服务重启后无法接管，统一收敛为 stalled。
 */
export function startBackgroundJobRuntime(): { resumed: number; stalled: number } {
  setBackgroundJobControlHandler(controlBackgroundJobAdapter);
  const active = listBackgroundJobs({ activeOnly: true, limit: 200 });
  let resumed = 0;
  let stalled = 0;
  for (const job of active) {
    if (job.kind === 'browser_download') {
      const result = finishBackgroundJob(job.id, {
        status: 'stalled',
        error: '服务或应用重启，浏览器下载连接已中断',
        checkpoint: {
          ...(job.checkpoint && typeof job.checkpoint === 'object' ? job.checkpoint as Record<string, unknown> : {}),
          recoverable: false,
          previousStatus: job.status,
          artifactPaths: job.artifactPaths,
        },
      });
      if (result.created) stalled++;
      continue;
    }
    ensureNativeBackgroundJobMonitor(job);
    resumed++;
  }
  if (resumed || stalled) {
    logger.info(`[background-job] 启动恢复：重挂 ${resumed}，浏览器下载收敛 ${stalled}`);
  }
  if (!browserSweepTimer) {
    browserSweepTimer = setInterval(() => {
      const now = Date.now();
      for (const job of listBackgroundJobs({ kind: 'browser_download', activeOnly: true, limit: 200 })) {
        if (now - job.updatedAt < BROWSER_JOB_STALE_MS) continue;
        finishBackgroundJob(job.id, {
          status: 'stalled',
          error: '浏览器下载长时间没有进度或心跳，执行进程可能已退出',
          checkpoint: {
            ...(job.checkpoint && typeof job.checkpoint === 'object' ? job.checkpoint as Record<string, unknown> : {}),
            previousStatus: job.status,
            artifactPaths: job.artifactPaths,
          },
        });
      }
    }, BROWSER_JOB_SWEEP_MS);
    browserSweepTimer.unref?.();
  }
  return { resumed, stalled };
}
