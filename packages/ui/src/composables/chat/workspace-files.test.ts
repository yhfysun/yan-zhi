import { describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from '@yan-zhi/core';
import { listWorkspaceFiles } from './workspace-files';

function adapterWithFs(platform: PlatformAdapter['platform'], fs: Partial<PlatformAdapter['fs']>): PlatformAdapter {
  return { platform, fs } as PlatformAdapter;
}

describe('listWorkspaceFiles', () => {
  it('WebFs 未授权工作区根目录时直接跳过，不触发 exists/mkdir', async () => {
    const exists = vi.fn(async () => false);
    const mkdir = vi.fn(async () => undefined);
    const fs = { hasWorkspaceRoot: () => false, exists, mkdir };

    await expect(listWorkspaceFiles(adapterWithFs('web', fs))).resolves.toEqual([]);
    expect(exists).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
  });

  it('桌面文件系统错误继续上抛，不被启动初始化吞掉', async () => {
    const error = new Error('desktop fs unavailable');
    const fs = { exists: vi.fn(async () => { throw error; }) };

    await expect(listWorkspaceFiles(adapterWithFs('desktop', fs))).rejects.toBe(error);
  });

  it('WebFs 已授权后仍按原流程读取工作区文件', async () => {
    const fs = {
      hasWorkspaceRoot: () => true,
      exists: vi.fn(async (path: string) => path === 'workspace/files' || path === 'workspace/files/notes.txt'),
      mkdir: vi.fn(async () => undefined),
      readDir: vi.fn(async () => ['notes.txt']),
    };

    await expect(listWorkspaceFiles(adapterWithFs('web', fs))).resolves.toEqual([
      { name: 'notes.txt', path: 'workspace/files/notes.txt', size: 0, isDir: false },
    ]);
    expect(fs.mkdir).not.toHaveBeenCalled();
  });
});
