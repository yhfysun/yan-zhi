import type { PlatformAdapter } from '@yan-zhi/core';

export interface WorkspaceFileEntry {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
}

/**
 * 读取会话输入框的工作区文件清单。
 *
 * 未授权工作区的 WebFs 没有根目录，启动阶段不能继续 mkdir；其他平台以及已授权的
 * Web 工作区仍按原流程执行，文件系统错误继续上抛给调用方记录，不能被静默吞掉。
 */
export async function listWorkspaceFiles(adapter: PlatformAdapter): Promise<WorkspaceFileEntry[]> {
  if (adapter.fs.hasWorkspaceRoot?.() === false) return [];

  const filesDir = 'workspace/files';
  const exists = await adapter.fs.exists(filesDir);
  if (!exists) {
    await adapter.fs.mkdir(filesDir);
    return [];
  }

  const entries = await adapter.fs.readDir(filesDir);
  const result: WorkspaceFileEntry[] = [];
  for (const entry of entries) {
    const path = `${filesDir}/${entry}`;
    if (!(await adapter.fs.exists(path))) continue;
    result.push({ name: entry, path, size: 0, isDir: false });
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
