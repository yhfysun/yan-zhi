/**
 * python_exec 的 cwd 语义（2026-10-19）。
 *
 * 钉死：省略 cwd → 会话工作目录；显式相对 cwd → 基于工作目录解析；
 * 无工作目录 → 不传 cwd（保持旧行为）。
 *
 * ★ mock `./python-runtime`：不探测真实解释器、不起子进程，只截获选项。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  runPythonCode: vi.fn(
    async (_code: string, _args: Record<string, unknown>, _opts?: { cwd?: string }) => ({
      content: [],
      isError: false,
    }),
  ),
  runPythonCodeBackground: vi.fn(
    async (
      _code: string,
      _args: Record<string, unknown>,
      opts?: { cwd?: string; workspaceDir?: string },
    ) => ({
      ok: true as const,
      job: {
        jobId: 'job_test_deadbeef',
        jobDir: `${String(opts?.workspaceDir || '/tmp')}/.yan-zhi/jobs/job_test_deadbeef`,
        logPath: '/tmp/log',
        statusPath: '/tmp/status.json',
      },
    }),
  ),
}));

vi.mock('./python-runtime', () => ({
  findPython: vi.fn(async () => '/usr/bin/python'),
  runPythonCode: mocks.runPythonCode,
  runPythonCodeBackground: mocks.runPythonCodeBackground,
}));

import { PythonExecTool } from './python-exec';

const WS = process.platform === 'win32' ? 'C:\\proj\\demo' : '/proj/demo';

function lastOptions(): { cwd?: string } | undefined {
  const calls = mocks.runPythonCode.mock.calls;
  return calls.length ? (calls[calls.length - 1][2] as { cwd?: string } | undefined) : undefined;
}

beforeEach(() => {
  mocks.runPythonCode.mockClear();
  mocks.runPythonCodeBackground.mockClear();
});

describe('PythonExecTool cwd', () => {
  it('省略 cwd → 工作目录', async () => {
    await new PythonExecTool().execute({ code: 'print(1)' }, { workspaceDir: WS });
    expect(lastOptions()?.cwd).toBe(WS);
  });

  it('显式相对 cwd → 基于工作目录解析', async () => {
    await new PythonExecTool().execute({ code: 'print(1)', cwd: 'sub' }, { workspaceDir: WS });
    expect(path.normalize(lastOptions()?.cwd || '')).toBe(path.normalize(path.join(WS, 'sub')));
  });

  it('无工作目录且未给 cwd → 不传 cwd（保持旧行为）', async () => {
    await new PythonExecTool().execute({ code: 'print(1)' });
    expect(lastOptions()?.cwd).toBeUndefined();
  });
});

describe('PythonExecTool background（2026-10-24：长任务不再被 30s 超时连坐）', () => {
  it('background=true → 走后台启动，不占用前台执行', async () => {
    const r = await new PythonExecTool().execute(
      { code: 'print(1)', background: true },
      { workspaceDir: WS },
    );
    expect(mocks.runPythonCode).not.toHaveBeenCalled();
    expect(mocks.runPythonCodeBackground).toHaveBeenCalledTimes(1);
    const text = (r as { content: Array<{ text: string }> }).content[0].text;
    expect(text).toContain('job_test_deadbeef');
    // 必须告诉模型怎么轮询，否则它会用前台重跑 → 再次被超时杀掉
    expect(text).toContain('job_status');
  });

  it('background 模式把 cwd / workspaceDir 透传给后台启动器', async () => {
    await new PythonExecTool().execute(
      { code: 'print(1)', background: true, cwd: 'sub' },
      { workspaceDir: WS },
    );
    const opts = mocks.runPythonCodeBackground.mock.calls[0][2] as
      | { cwd?: string; workspaceDir?: string }
      | undefined;
    expect(path.normalize(opts?.cwd || '')).toBe(path.normalize(path.join(WS, 'sub')));
    expect(opts?.workspaceDir).toBe(WS);
  });
});
