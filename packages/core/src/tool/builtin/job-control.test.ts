import { afterEach, describe, expect, it, vi } from 'vitest';
import { JobControlTool } from './job-control';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PORT;
  delete process.env.YANZHI_API_PORT;
});

describe('job_control', () => {
  it('暂停统一后台任务并返回最新状态', async () => {
    process.env.PORT = '3456';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        ok: true,
        status: 'ok',
        job: {
          jobId: 'job_bg_1_deadbeef',
          kind: 'browser_download',
          status: 'paused',
          wakePolicy: 'resume',
          title: '下载大文件',
          progress: 40,
        },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const r = await new JobControlTool().execute({
      jobId: 'job_bg_1_deadbeef',
      operation: 'pause',
    }, { userId: 'u1' });
    const text = (r as any).content[0].text;

    expect(text).toContain('已暂停');
    expect(text).toContain('40%');
  });

  it('不支持的控制返回明确错误，不假装成功', async () => {
    process.env.PORT = '3456';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'Playwright 下载不支持暂停',
      code: 'JOB_CONTROL_UNSUPPORTED',
    }), { status: 422, headers: { 'Content-Type': 'application/json' } })));

    const r = await new JobControlTool().execute({
      jobId: 'job_bg_1_deadbeef',
      operation: 'pause',
    }, { userId: 'u1' });

    expect((r as any).isError).toBe(true);
    expect((r as any).content[0].text).toContain('控制接口不可用');
  });
});
