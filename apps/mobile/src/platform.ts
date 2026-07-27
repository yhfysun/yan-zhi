// 移动平台适配器（Capacitor）
import type { PlatformAdapter, DatabaseAdapter, FsAdapter, KeyringAdapter } from '@yan-zhi/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';

/** 移动端 SQLite 数据库（Capacitor SQLite 插件） */
class MobileDatabase implements DatabaseAdapter {
  private sqlite = new SQLiteConnection(CapacitorSQLite);
  private db!: SQLiteDBConnection;
  private ready: Promise<void>;

  constructor() {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    const dbConnection = await this.sqlite.createConnection(
      'yan-zhi',
      false,
      'no-encryption',
      1,
      false,
    );
    this.db = dbConnection;
    await this.db.open();
  }

  async exec(sql: string, params?: unknown[]): Promise<void> {
    await this.ready;
    await this.db.run(sql, (params || []) as any[]);
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    await this.ready;
    const result = await this.db.query(sql, (params || []) as any[]);
    return (result.values || []) as T[];
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.ready;
    await this.db.beginTransaction();
    try {
      const result = await fn();
      await this.db.commitTransaction();
      return result;
    } catch (e) {
      await this.db.rollbackTransaction();
      throw e;
    }
  }
}

/** 移动端文件系统（Capacitor Filesystem 插件） */
class MobileFs implements FsAdapter {
  async readFile(path: string): Promise<string> {
    const result = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });
    return result.data as string;
  }
  async writeFile(path: string, content: string): Promise<void> {
    await Filesystem.writeFile({ path, data: content, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
  }
  async exists(path: string): Promise<boolean> {
    try {
      await Filesystem.stat({ path, directory: Directory.Data });
      return true;
    } catch {
      return false;
    }
  }
  async mkdir(_path: string): Promise<void> {
    // Capacitor mkdir 递归创建在 writeFile 时已处理
  }
  async remove(path: string): Promise<void> {
    await Filesystem.deleteFile({ path, directory: Directory.Data });
  }
  async readDir(path: string): Promise<string[]> {
    const result = await Filesystem.readdir({ path, directory: Directory.Data });
    return result.files.map((f) => f.name);
  }
}

/** 移动端钥匙串（Capacitor Preferences） */
class MobileKeyring implements KeyringAdapter {
  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key: `keyring:${key}`, value });
  }
  async get(key: string): Promise<string | null> {
    const result = await Preferences.get({ key: `keyring:${key}` });
    return result.value;
  }
  async delete(key: string): Promise<void> {
    await Preferences.remove({ key: `keyring:${key}` });
  }
}

export const mobileAdapter: PlatformAdapter = {
  platform: 'mobile',
  db: new MobileDatabase(),
  fs: new MobileFs(),
  keyring: new MobileKeyring(),
  // 移动端不支持 MCP stdio（仅支持远程 sse/http）
};
