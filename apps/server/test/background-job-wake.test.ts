import { describe, expect, it, vi } from 'vitest';
import type { BackgroundJob, BackgroundJobEvent } from '../src/services/background-jobs.js';
import {
  buildBackgroundJobWakeText,
  wakeConversationForBackgroundJob,
  type BackgroundJobWakeDeps,
} from '../src/services/background-job-wake.js';

function job(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
  return {
    id: 'job_bg_wake_1',
    idempotencyKey: 'wake:test',
    userId: 'u_wake',
    conversationId: 'conv_wake',
    taskId: 'task_original',
    toolCallId: 'call_original',
    parentGoalId: null,
    kind: 'browser_download',
    status: 'completed',
    wakePolicy: 'resume',
    title: '下载安装包',
    progress: 100,
    bytesDone: 2_400,
    bytesTotal: 2_400,
    speedBps: 0,
    etaMs: 0,
    etaAt: null,
    artifactPaths: ['D:/downloads/setup.zip'],
    result: { verified: true },
    error: null,
    checkpoint: null,
    spec: {},
    adapterRef: 'desktop-download:1',
    controlCapabilities: {},
    heartbeatAt: 1,
    lastProgressAt: 1,
    createdAt: 1,
    startedAt: 1,
    updatedAt: 2,
    terminalAt: 2,
    terminalVersion: 1,
    ...overrides,
  };
}

function event(overrides: Partial<BackgroundJobEvent> = {}): BackgroundJobEvent {
  return {
    id: 'jobevt_wake_1',
    jobId: 'job_bg_wake_1',
    type: 'job.completed',
    dedupeKey: 'terminal:job_bg_wake_1:1',
    payload: {},
    deliveryAttempts: 0,
    lastDeliveryError: null,
    createdAt: 2,
    deliveredAt: null,
    ...overrides,
  };
}

function deps(activeTaskId: string | null = null): BackgroundJobWakeDeps & Record<string, any> {
  return {
    findRunningTaskId: vi.fn(() => activeTaskId),
    injectUserMessage: vi.fn(() => ({ status: 'injected' as const, msgId: 'msg_injected' })),
    insertMessage: vi.fn(() => 'msg_note'),
    emitConversationEvent: vi.fn(),
    getTaskRow: vi.fn(() => ({
      params_json: JSON.stringify({
        platformId: 'p1',
        modelId: 'm1',
        agentId: 'a1',
        workspaceDir: 'D:/workspace',
        permissionMode: 'default',
        pathGuard: 'ask',
        maxSteps: 120,
        modeFlags: { plan: true },
        toolEnv: {},
        ontologyIds: [],
      }),
    })),
    createTask: vi.fn(() => 'task_resume'),
  };
}

describe('background-job-wake', () => {
  it('唤醒摘要只带终态、产物、大小和继续指令，不回灌日志', () => {
    const text = buildBackgroundJobWakeText(job(), event());

    expect(text).toContain('[后台任务完成]');
    expect(text).toContain('job_bg_wake_1');
    expect(text).toContain('D:/downloads/setup.zip');
    expect(text).toContain('2.3 KB');
    expect(text).toContain('从原任务断点继续');
    expect(text).not.toContain('stdout.log');
  });

  it('silent 不插入消息也不创建任务', () => {
    const d = deps();
    wakeConversationForBackgroundJob(job({ wakePolicy: 'silent' }), event(), d);

    expect(d.insertMessage).not.toHaveBeenCalled();
    expect(d.injectUserMessage).not.toHaveBeenCalled();
    expect(d.createTask).not.toHaveBeenCalled();
    expect(emitCalled(d)).toBe(true);
  });

  it('notify 只写一条会话通知，不额外调用模型', () => {
    const d = deps();
    wakeConversationForBackgroundJob(job({ wakePolicy: 'notify' }), event(), d);

    expect(d.insertMessage).toHaveBeenCalledTimes(1);
    expect(d.injectUserMessage).not.toHaveBeenCalled();
    expect(d.createTask).not.toHaveBeenCalled();
  });

  it('resume 在原任务仍运行时就地注入，并使用终态版本幂等键', () => {
    const d = deps('task_live');
    wakeConversationForBackgroundJob(job(), event(), d);

    expect(d.injectUserMessage).toHaveBeenCalledWith(
      'conv_wake',
      expect.stringContaining('后台任务完成'),
      'u_wake',
      'wake:job_bg_wake_1:1',
    );
    expect(d.createTask).not.toHaveBeenCalled();
  });

  it('resume 在原任务已结束时继承上次任务模型并创建一次续跑', () => {
    const d = deps(null);
    wakeConversationForBackgroundJob(job(), event(), d);

    expect(d.createTask).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv_wake',
      userId: 'u_wake',
      platformId: 'p1',
      modelId: 'm1',
      agentId: 'a1',
      workspaceDir: 'D:/workspace',
      origin: 'background_job',
      maxSteps: 120,
    }));
    expect(d.insertMessage).not.toHaveBeenCalled();
  });
});

function emitCalled(d: ReturnType<typeof deps>): boolean {
  return (d.emitConversationEvent as any).mock.calls.length > 0;
}
