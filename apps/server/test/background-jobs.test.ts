import { beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db.js';
import {
  createOrUpdateBackgroundJob,
  finishBackgroundJob,
  getBackgroundJob,
  listBackgroundJobEvents,
  listBackgroundJobs,
  recoverInterruptedBackgroundJobs,
  requestBackgroundJobWake,
  setBackgroundJobTerminalHandler,
  updateBackgroundJobProgress,
} from '../src/services/background-jobs.js';

const USER = 'u_background_jobs';
const CONV = 'conv_background_jobs';

beforeAll(() => {
  db.prepare(
    'INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run(USER, 'u_background_jobs', '!test-no-login', 0);
  db.prepare(
    'INSERT OR IGNORE INTO conversation (id, user_id, title, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(CONV, USER, '后台任务测试会话', 'default', 0, 0);
});

describe('background-jobs', () => {
  it('创建任务时持久化会话、来源、唤醒策略与能力快照', () => {
    const job = createOrUpdateBackgroundJob({
      kind: 'browser_download',
      userId: USER,
      conversationId: CONV,
      taskId: 'task_bg_1',
      toolCallId: 'call_bg_1',
      wakePolicy: 'resume',
      title: '下载季度报表',
      status: 'running',
      idempotencyKey: 'test:browser:1',
      adapterRef: 'desktop-download:1',
      artifactPaths: ['D:/downloads/report.zip'],
      progress: {
        bytesDone: 1024,
        bytesTotal: 8192,
        speedBps: 512,
        etaMs: 14000,
      },
      controlCapabilities: { pause: true, resume: true, cancel: true },
      spec: { downloadId: 1 },
    });

    expect(job.id).toMatch(/^job_bg_/);
    expect(job.status).toBe('running');
    expect(job.wakePolicy).toBe('resume');
    expect(job.conversationId).toBe(CONV);
    expect(job.taskId).toBe('task_bg_1');
    expect(job.progress).toBe(12.5);
    expect(job.artifactPaths).toEqual(['D:/downloads/report.zip']);
    expect(job.controlCapabilities).toEqual({ pause: true, resume: true, cancel: true });
    expect(getBackgroundJob(job.id, USER)?.adapterRef).toBe('desktop-download:1');
  });

  it('同一幂等键重复启动只返回同一条任务', () => {
    const first = createOrUpdateBackgroundJob({
      kind: 'python_process',
      userId: USER,
      conversationId: CONV,
      title: '后台转码',
      status: 'running',
      idempotencyKey: 'test:python:same',
      adapterRef: 'python:job_same',
    });
    const second = createOrUpdateBackgroundJob({
      kind: 'python_process',
      userId: USER,
      conversationId: CONV,
      title: '重复回调',
      status: 'running',
      idempotencyKey: 'test:python:same',
      adapterRef: 'python:job_same',
    });

    expect(second.id).toBe(first.id);
    expect(listBackgroundJobs({ conversationId: CONV, kind: 'python_process' }))
      .toHaveLength(1);
  });

  it('进度高频回调按 2 秒或 5% 节流落库，状态变化立即落库', () => {
    const t0 = 1_800_000_000_000;
    const job = createOrUpdateBackgroundJob({
      kind: 'browser_download',
      userId: USER,
      conversationId: CONV,
      title: '大文件',
      status: 'running',
      idempotencyKey: 'test:progress',
      at: t0,
      progress: { bytesDone: 0, bytesTotal: 1000, speedBps: 10 },
    });

    const early = updateBackgroundJobProgress(job.id, {
      bytesDone: 20,
      bytesTotal: 1000,
      speedBps: 10,
      at: t0 + 500,
    });
    expect(early.progress).toBe(0);

    const bucket = updateBackgroundJobProgress(job.id, {
      bytesDone: 60,
      bytesTotal: 1000,
      speedBps: 10,
      at: t0 + 600,
    });
    expect(bucket.progress).toBe(6);

    const timeTick = updateBackgroundJobProgress(job.id, {
      bytesDone: 80,
      bytesTotal: 1000,
      speedBps: 10,
      at: t0 + 2600,
    });
    expect(timeTick.progress).toBe(8);

    const paused = updateBackgroundJobProgress(job.id, {
      status: 'paused',
      bytesDone: 80,
      bytesTotal: 1000,
      at: t0 + 2700,
    });
    expect(paused.status).toBe('paused');
  });

  it('终态事件按 terminalVersion 幂等，重复完成不会重复唤醒', () => {
    const onTerminal = vi.fn();
    setBackgroundJobTerminalHandler(onTerminal);
    const job = createOrUpdateBackgroundJob({
      kind: 'browser_download',
      userId: USER,
      conversationId: CONV,
      title: '幂等下载',
      status: 'running',
      idempotencyKey: 'test:terminal',
    });

    const first = finishBackgroundJob(job.id, {
      status: 'completed',
      artifactPaths: ['D:/downloads/done.zip'],
      result: { verified: true },
      at: 1_800_000_001_000,
    });
    const second = finishBackgroundJob(job.id, {
      status: 'completed',
      artifactPaths: ['D:/downloads/done.zip'],
      result: { verified: true },
      at: 1_800_000_002_000,
    });

    expect(first.created).toBe(true);
    expect(first.job.terminalVersion).toBe(1);
    expect(second.created).toBe(false);
    expect(second.job.terminalVersion).toBe(1);
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(listBackgroundJobEvents(job.id).filter(e => e.type === 'job.completed')).toHaveLength(1);
    setBackgroundJobTerminalHandler(null);
  });

  it('恢复扫描只把未终态任务收敛为 stalled，已完成任务保持不变', () => {
    const active = createOrUpdateBackgroundJob({
      kind: 'browser_download',
      userId: USER,
      conversationId: CONV,
      title: '重启前仍在下载',
      status: 'running',
      idempotencyKey: 'test:recover:active',
    });
    const completed = createOrUpdateBackgroundJob({
      kind: 'browser_download',
      userId: USER,
      conversationId: CONV,
      title: '重启前已完成',
      status: 'running',
      idempotencyKey: 'test:recover:completed',
    });
    finishBackgroundJob(completed.id, { status: 'completed' });

    recoverInterruptedBackgroundJobs(1_800_000_003_000);

    expect(getBackgroundJob(active.id, USER)?.status).toBe('stalled');
    expect(getBackgroundJob(completed.id, USER)?.status).toBe('completed');
  });

  it('终态任务可人工请求一次继续处理，重复点击不重复创建事件', () => {
    const onTerminal = vi.fn();
    setBackgroundJobTerminalHandler(onTerminal);
    const job = createOrUpdateBackgroundJob({
      kind: 'browser_download',
      userId: USER,
      conversationId: CONV,
      title: '完成后人工继续',
      status: 'running',
      idempotencyKey: 'test:manual-wake',
    });
    finishBackgroundJob(job.id, { status: 'completed' });
    onTerminal.mockClear();

    const first = requestBackgroundJobWake(job.id, USER);
    const second = requestBackgroundJobWake(job.id, USER);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(onTerminal.mock.calls[0][1].type).toBe('job.manual_wake');
    setBackgroundJobTerminalHandler(null);
  });
});
