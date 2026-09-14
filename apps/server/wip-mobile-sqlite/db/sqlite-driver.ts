/**
 * 桌面/web 端 SQLite 驱动：包装 better-sqlite3 同步 API 为 async。
 *
 * better-sqlite3 是同步 API（ABI 127，仅在宿主 Node 22.x 编译/运行）。
 * 移动端内嵌 Node（Capawesome 18.20.4，ABI 108）无法加载该 native 模块，
 * 故桌面/web 路径继续用此 driver；移动端走 capacitor-driver。
 *
 * 内部所有方法都是同步操作，async 关键字仅为对外接口统一。
 * 事务：better-sqlite3 同步事务直接 BEGIN/COMMIT 包裹，fn 是 async 时仍能正确回滚。
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { DbDriver } from './driver.js';

export interface SqliteDriverOptions {
  /** 数据库文件路径。空字符串或 ':memory:' 表示内存库 */
  path: string;
  /** 是否加载 sqlite-vec 扩展（向量记忆检索）。默认 true（失败时降级） */
  loadSqliteVec?: boolean;
  /** WAL/Synchronous 等 PRAGMA 设置 */
  pragmas?: Array<[name: string, value?: string]>;
}

export class SqliteDriver implements DbDriver {
  private betterDb: Database.Database;
  private sqliteVecLoaded = false;

  constructor(opts: SqliteDriverOptions) {
    // better-sqlite3 同步打开
    if (opts.path && opts.path !== ':memory:') {
      fs.mkdirSync(path.dirname(opts.path), { recursive: true });
    }
    this.betterDb = new Database(opts.path || ':memory:');

    // 常用 PRAGMA（默认就开）
    const defaultPragmas: Array<[string, string?]> = [
      ['journal_mode', 'WAL'],
      ['foreign_keys', 'ON'],
      ...(opts.pragmas || []),
    ];
    for (const [name, value] of defaultPragmas) {
      try {
        this.betterDb.pragma(name, value);
      } catch (err) {
        console.warn(`[sqlite-driver] PRAGMA ${name} 失败：`, err);
      }
    }

    // sqlite-vec 扩展（向量检索）：原生 .so/.dll，非 Node addon，
    // 用 db.loadExtension 加载。失败不致命，降级为关键词检索。
    if (opts.loadSqliteVec !== false) {
      try {
        const require = createRequire(import.meta.url);
        // sqlite-vec 是 CJS，需要 createRequire 兼容 ESM
        const sqliteVec = require('sqlite-vec') as { getLoadablePath(): string };
        const vecPath = sqliteVec.getLoadablePath();
        this.betterDb.loadExtension(vecPath);
        this.sqliteVecLoaded = true;
        console.log('[sqlite-driver] sqlite-vec 已加载:', vecPath);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[sqlite-driver] sqlite-vec 加载失败，向量检索降级为关键词：', msg);
      }
    }
  }

  hasSqliteVec(): boolean {
    return this.sqliteVecLoaded;
  }

  async run(sql: string, params?: unknown[]): Promise<void> {
    const stmt = this.betterDb.prepare(sql);
    if (params && params.length) {
      stmt.run(...(params as never[]));
    } else {
      stmt.run();
    }
  }

  async all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const stmt = this.betterDb.prepare(sql);
    if (params && params.length) {
      return stmt.all(...(params as never[])) as T[];
    }
    return stmt.all() as T[];
  }

  async get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const stmt = this.betterDb.prepare(sql);
    if (params && params.length) {
      return stmt.get(...(params as never[])) as T | undefined;
    }
    return stmt.get() as T | undefined;
  }

  async exec(sql: string): Promise<void> {
    this.betterDb.exec(sql);
  }

  async pragma(name: string, value?: string): Promise<unknown> {
    if (value === undefined) {
      return this.betterDb.pragma(name);
    }
    return this.betterDb.pragma(name, value);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // 同步 BEGIN/COMMIT 包裹异步 fn：better-sqlite3 的 db.transaction(fn)
    // 假设 fn 是同步的，对异步 fn 直接调也会等待 Promise 解析后才 COMMIT，
    // 但若 fn 内有 await，COMMIT 可能在 fn 完成前发生（破坏原子性）。
    // 故改用显式 BEGIN/COMMIT 同步包围，让 COMMIT 在 fn 解析后执行。
    this.betterDb.exec('BEGIN');
    try {
      const result = await fn();
      this.betterDb.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        this.betterDb.exec('ROLLBACK');
      } catch {
        /* ignore rollback error */
      }
      throw err;
    }
  }

  async loadExtension(path: string): Promise<boolean> {
    try {
      this.betterDb.loadExtension(path);
      return true;
    } catch (err) {
      console.warn('[sqlite-driver] loadExtension 失败：', err);
      return false;
    }
  }

  async close(): Promise<void> {
    this.betterDb.close();
  }
}

/** 工厂函数：创建 SqliteDriver 实例 */
export async function makeSqliteDriver(opts: SqliteDriverOptions): Promise<SqliteDriver> {
  return new SqliteDriver(opts);
}