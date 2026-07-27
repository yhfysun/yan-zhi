// 桌面平台适配器（Tauri）
import type {
  PlatformAdapter,
  DatabaseAdapter,
  FsAdapter,
  KeyringAdapter,
  McpProcessAdapter,
} from '@yan-zhi/core';
import { invoke } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';
import {
  readTextFile,
  writeTextFile,
  exists,
  mkdir,
  remove,
  readDir,
} from '@tauri-apps/plugin-fs';

/** 桌面端 SQLite 数据库（Tauri SQL 插件） */
class DesktopDatabase implements DatabaseAdapter {
  private db: Database | null = null;
  private initPromise: Promise<Database>;

  constructor() {
    this.initPromise = Database.load('sqlite:yan-zhi.db');
  }

  private async getDb(): Promise<Database> {
    if (!this.db) {
      this.db = await this.initPromise;
    }
    return this.db;
  }

  async exec(sql: string, params?: unknown[]): Promise<void> {
    const db = await this.getDb();
    await db.execute(sql, params ?? []);
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const db = await this.getDb();
    return db.select<T[]>(sql, params ?? []);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const db = await this.getDb();
    await db.execute('BEGIN');
    try {
      const result = await fn();
      await db.execute('COMMIT');
      return result;
    } catch (e) {
      await db.execute('ROLLBACK');
      throw e;
    }
  }
}

/** 桌面端文件系统（Tauri FS 插件） */
class DesktopFs implements FsAdapter {
  async readFile(path: string): Promise<string> { return readTextFile(path); }
  async writeFile(path: string, content: string): Promise<void> { await writeTextFile(path, content); }
  async exists(path: string): Promise<boolean> { return exists(path); }
  async mkdir(path: string): Promise<void> { await mkdir(path, { recursive: true }); }
  async remove(path: string): Promise<void> { await remove(path); }
  async readDir(path: string): Promise<string[]> {
    const entries = await readDir(path);
    return entries.map((e) => e.name);
  }
}

/** 桌面端钥匙串（通过 Tauri Rust 命令调用系统 keyring） */
class DesktopKeyring implements KeyringAdapter {
  async set(key: string, value: string): Promise<void> {
    await invoke('keyring_set', { key, value });
  }
  async get(key: string): Promise<string | null> {
    return invoke<string | null>('keyring_get', { key });
  }
  async delete(key: string): Promise<void> {
    await invoke('keyring_delete', { key });
  }
}

/** MCP 子进程适配器（通过 Tauri Rust 命令） */
class DesktopMcpProcess implements McpProcessAdapter {
  async start(command: string, args: string[], env: Record<string, string>): Promise<string> {
    return invoke<string>('mcp_start', { command, args, env });
  }
  async call(childId: string, method: string, params: unknown): Promise<unknown> {
    return invoke('mcp_call', { childId, method, params });
  }
  async kill(childId: string): Promise<void> {
    await invoke('mcp_kill', { childId });
  }
}

export const desktopAdapter: PlatformAdapter = {
  platform: 'desktop',
  db: new DesktopDatabase(),
  fs: new DesktopFs(),
  keyring: new DesktopKeyring(),
  mcp: new DesktopMcpProcess(),
};
