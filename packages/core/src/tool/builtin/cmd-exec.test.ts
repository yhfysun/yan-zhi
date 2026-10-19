/**
 * cmd_exec 的 cwd 语义（2026-10-19）。
 *
 * 钉死：省略 cwd → 会话工作目录；显式相对 cwd → 基于工作目录解析；
 * 无工作目录 → 不传 cwd（保持旧行为，由 execFile 继承主进程目录）。
 *
 * ★ 用假 PlatformAdapter 截获传给 shell 的 options，不真的起进程。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { setPlatformAdapter } from '../../platform/types';
import { CmdExecTool } from './cmd-exec';

const WS = process.platform === 'win32' ? 'C:\\proj\\demo' : '/proj/demo';
const OUTSIDE = process.platform === 'win32' ? 'C:\\other' : '/other';
const join = (...p: string[]) => p.join(path.sep);

let lastOptions: { cwd?: string; timeout?: number } | undefined;

beforeEach(() => {
  lastOptions = undefined;
  setPlatformAdapter({
    platform: 'desktop',
    shell: {
      exec: async (_command: string, _args: string[], options?: { cwd?: string; timeout?: number }) => {
        lastOptions = options;
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    },
  } as unknown as Parameters<typeof setPlatformAdapter>[0]);
});

// 含路径分隔符 → 跳过 `where/which` 预检，测试不依赖本机命令
const CMD = './script';

describe('CmdExecTool cwd', () => {
  it('省略 cwd → 工作目录', async () => {
    await new CmdExecTool().execute({ command: CMD }, { workspaceDir: WS });
    expect(lastOptions?.cwd).toBe(WS);
  });

  it('显式相对 cwd → 基于工作目录解析', async () => {
    await new CmdExecTool().execute({ command: CMD, cwd: 'sub' }, { workspaceDir: WS });
    // core 的路径拼接统一用 "/"（Windows 下混合分隔符 execFile 也接受），这里按归一化比较
    expect(path.normalize(lastOptions?.cwd || '')).toBe(path.normalize(join(WS, 'sub')));
  });

  it('显式绝对 cwd → 原样传给 shell', async () => {
    await new CmdExecTool().execute({ command: CMD, cwd: OUTSIDE }, { workspaceDir: WS });
    expect(lastOptions?.cwd).toBe(OUTSIDE);
  });

  it('无工作目录且未给 cwd → 不传 cwd（保持旧行为）', async () => {
    await new CmdExecTool().execute({ command: CMD });
    expect(lastOptions?.cwd).toBeUndefined();
  });

  it('无工作目录但给了相对 cwd → 原样传（由 execFile 按主进程目录解析）', async () => {
    await new CmdExecTool().execute({ command: CMD, cwd: 'sub' });
    expect(lastOptions?.cwd).toBe('sub');
  });
});
