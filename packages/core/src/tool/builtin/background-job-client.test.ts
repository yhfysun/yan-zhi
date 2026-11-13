import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  controlBackgroundJob,
  fetchBackgroundJob,
  registerBackgroundJob,
} from './background-job-client';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PORT;
  delete process.env.YANZHI_API_PORT;
  delete process.env.YZ_INTERNAL_TOKEN;
});

describe('background-job-client', () => {
  it('读取通用任务时走回环内部接口并带用户身份', async () => {
    process.env.PORT = '3456';
    process.env.YZ_INTERNAL_TOKEN = 'test-token';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: {
        jobId: 'job_bg_1_deadbeef',
        kind: 'browser_download',
        status: 'running',
        title: '下载',
        progress: 30,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const job = await fetchBackgroundJob('job_bg_1_deadbeef', { userId: 'u1' });

    expect(job?.status).toBe('running');
    const [url, init] = fetchMock.mock.calls[0] as any[];
    expect(String(url)).toBe('http://127.0.0.1:3456/api/background-jobs/internal/job_bg_1_deadbeef');
    expect((init.headers as Record<string, string>)['x-yz-internal-token']).toBe('test-token');
    expect((init.headers as Record<string, string>)['x-yz-user-id']).toBe('u1');
  });

  it('注册 Python/命令后台任务失败时返回 null，不影响原工具成功回执', async () => {
    process.env.PORT = '3456';
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));

    const job = await registerBackgroundJob({
      kind: 'python_process',
      conversationId: 'conv1',
      title: '转码',
      adapterRef: 'python:job_1',
      idempotencyKey: 'python:job_1',
    }, { userId: 'u1', workspaceDir: 'D:/ws' });

    expect(job).toBeNull();
  });

  it('控制任务发送 pause/resume/cancel 操作', async () => {
    process.env.PORT = '3456';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: { ok: true, status: 'ok' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await controlBackgroundJob('job_bg_1_deadbeef', 'pause', { userId: 'u1' });

    expect(result.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as any[];
    expect(JSON.parse(String(init.body))).toEqual({ operation: 'pause' });
  });
});
