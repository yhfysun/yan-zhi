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
}));

vi.mock('./python-runtime', () => ({
  findPython: vi.fn(async () => '/usr/bin/python'),
  runPythonCode: mocks.runPythonCode,
}));

import { PythonExecTool } from './python-exec';

const WS = process.platform === 'win32' ? 'C:\\proj\\demo' : '/proj/demo';

function lastOptions(): { cwd?: string } | undefined {
  const calls = mocks.runPythonCode.mock.calls;
  return calls.length ? (calls[calls.length - 1][2] as { cwd?: string } | undefined) : undefined;
}

beforeEach(() => {
  mocks.runPythonCode.mockClear();
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
