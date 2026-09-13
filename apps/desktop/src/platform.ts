// 桌面平台适配器（Electron）
import type {
  PlatformAdapter,
  DatabaseAdapter,
  FsAdapter,
  DirEntryInfo,
  KeyringAdapter,
  McpProcessAdapter,
  ShellAdapter,
} from '@yan-zhi/core';

// 渲染进程通过 contextBridge 注入的全局 API
const api = (window as any).electronAPI;
const isTauri =
  typeof (window as any).__TAURI_INTERNALS__ !== 'undefined' ||
  typeof (window as any).__TAURI__ !== 'undefined';

/** 桌面端 SQLite 数据库（通过 Electron IPC 调用主进程的 better-sqlite3） */
class DesktopDatabase implements DatabaseAdapter {
  async exec(sql: string, params?: unknown[]): Promise<void> {
    await api.db.exec(sql, params ?? []);
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return api.db.query(sql, params ?? []);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // 简化：用 BEGIN/COMMIT/ROLLBACK 手动控制
    // 注意：better-sqlite3 不支持嵌套事务（savepoint 除外），此处假设无嵌套
    await api.db.exec('BEGIN');
    try {
      const result = await fn();
      await api.db.exec('COMMIT');
      return result;
    } catch (e) {
      try { await api.db.exec('ROLLBACK'); } catch { /* ignore rollback error */ }
      throw e;
    }
  }
}

/** 桌面端文件系统（通过 Electron IPC 调用主进程 Node.js fs） */
class DesktopFs implements FsAdapter {
  async readFile(path: string): Promise<string> {
    return api.fs.readFile(path);
  }
  async readFileBase64(path: string): Promise<string> {
    return api.fs.readFileBase64(path);
  }
  async writeFile(path: string, content: string): Promise<void> {
    await api.fs.writeFile(path, content);
  }
  async writeFileBase64(path: string, b64: string): Promise<void> {
    await api.fs.writeFileBase64(path, b64);
  }
  async exists(path: string): Promise<boolean> {
    return api.fs.exists(path);
  }
  async mkdir(path: string): Promise<void> {
    await api.fs.mkdir(path);
  }
  async remove(path: string): Promise<void> {
    await api.fs.remove(path);
  }
  async readDir(path: string): Promise<string[]> {
    return api.fs.readDir(path);
  }
  async listDirEntries(path: string): Promise<DirEntryInfo[]> {
    return api.fs.listDirEntries(path);
  }
}

/** 桌面端钥匙串（通过 Electron IPC 调用主进程 JSON 文件存储） */
class DesktopKeyring implements KeyringAdapter {
  async set(key: string, value: string): Promise<void> {
    await api.keyring.set(key, value);
  }
  async get(key: string): Promise<string | null> {
    return api.keyring.get(key);
  }
  async delete(key: string): Promise<void> {
    await api.keyring.delete(key);
  }
}

/** MCP 子进程适配器（通过 Electron IPC 调用主进程 child_process） */
class DesktopMcpProcess implements McpProcessAdapter {
  get supportsStdio() {
    return !isTauri;
  }

  async start(command: string, args: string[], env: Record<string, string>): Promise<string> {
    return api.mcp.start(command, args, env);
  }
  async call(childId: string, method: string, params: unknown): Promise<unknown> {
    return api.mcp.call(childId, method, params);
  }
  async kill(childId: string): Promise<void> {
    await api.mcp.kill(childId);
  }
}

/** 桌面端 Shell 适配器（通过 Electron IPC 调用主进程 child_process.execFile） */
class DesktopShell implements ShellAdapter {
  async exec(
    command: string,
    args: string[],
    options?: { cwd?: string; timeout?: number; env?: Record<string, string> },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return api.shell.exec(command, args, options);
  }
}

export const desktopAdapter: PlatformAdapter = {
  platform: 'desktop',
  db: new DesktopDatabase(),
  fs: new DesktopFs(),
  keyring: new DesktopKeyring(),
  mcp: new DesktopMcpProcess(),
  shell: new DesktopShell(),
  // LLM 走后端代理（/api/llm/*）：API Key 不暴露给前端，后端从库读配置转发。
  // Electron file:// 下用绝对地址（与 packages/ui api/client.ts 的 API_BASE 一致）。
  llmProxyBase: 'http://127.0.0.1:3001/api/llm',
};
