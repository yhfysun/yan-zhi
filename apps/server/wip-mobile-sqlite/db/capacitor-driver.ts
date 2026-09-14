/**
 * 移动端 SQLite 驱动：包装 @capacitor-community/sqlite（Capacitor 插件）。
 *
 * 适用环境：Capawesome capacitor-nodejs 内嵌 Node（18.20.4）跑 server 时。
 * 走原生 SQLite（不依赖 better-sqlite3 / sqlite-vec 等 native addon）。
 *
 * ⚠️ Capacitor 桥接性能：
 *   - plugin 调用通过 Capacitor bridge 发消息到 webview → 原生 SQLite → 回传结果。
 *   - 单次往返 1~3ms。比 better-sqlite3 本地慢约 10~50 倍。
 *   - 聊天主链路（llm-task-manager）每条消息会触发 ~10 次 DB 调用，估算增加 ~50ms/条。
 *   - 解决方案：批量写入 / 减少 query 次数（如一次性查 N 条而非循环）。
 *
 * ⚠️ sqlite-vec 在移动端不可用：
 *   - Capacitor SQLite 插件不支持 loadExtension（API 没暴露）。
 *   - 向量检索走 hasSqliteVec=false 分支，自动降级为关键词检索。
 *   - 后续若需移动端向量能力，可考虑 wa-sqlite（WASM 版 sqlite-vec）单独打包。
 *
 * ⚠️ 已知差异 vs better-sqlite3：
 *   - execute() 单次调用最好只跑一条 SQL（多条用 ; 分隔行为未保证）。
 *     业务方应改写多条 exec 为多次 execute。
 *   - PRAGMA 查询：原生端可用 query() 跑（CapacitorSQLite 文档说返回 values），
 *     但为兼容 Web 平台 fallback，最好把启动期的 PRAGMA 配置放在 init 时一次性执行。
 *   - 事务 beginTransaction / commitTransaction / rollbackTransaction 显式三段式。
 */

import type { CapacitorSQLitePlugin, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { DbDriver } from './driver.js';

export interface CapacitorDriverOptions {
  /** 数据库名（CapacitorSQLite 用名而非路径） */
  dbName: string;
  /** SQLiteConnection 实例（调用方从 capacitor core 注入 plugin） */
  sqlite: SQLiteConnection;
  /** Capacitor plugin 实例（用于 closeConnection 等） */
  plugin: CapacitorSQLitePlugin;
}

export class CapacitorDriver implements DbDriver {
  private db: SQLiteDBConnection | null = null;
  private inTransaction = false;
  private openPromise: Promise<void> | null = null;

  constructor(private opts: CapacitorDriverOptions) {}

  /**
   * 打开数据库连接 + 配置基础 PRAGMA。
   * 必须在使用其他方法前 await init()。
   */
  async init(): Promise<void> {
    if (this.openPromise) return this.openPromise;
    this.openPromise = (async () => {
      this.db = await this.opts.sqlite.createConnection(
        this.opts.dbName,
        false,           // encrypted
        'no-encryption', // mode
        1,               // version
        false,           // readonly
      );
      await this.db.open();
      // 基础 PRAGMA：journal_mode 与 foreign_keys 在 execute() 里完成。
      // journal_mode 会返回值，需用 query 而非 execute。
      try {
        const r = await this.db.query('PRAGMA journal_mode = WAL', []);
        void r;
      } catch (err) {
        console.warn('[capacitor-driver] PRAGMA journal_mode=WAL 失败（部分实现不支持）：', err);
      }
      try {
        await this.db.execute('PRAGMA foreign_keys = ON;', false);
      } catch (err) {
        console.warn('[capacitor-driver] PRAGMA foreign_keys=ON 失败：', err);
      }
    })();
    return this.openPromise;
  }

  private async ensureOpen(): Promise<SQLiteDBConnection> {
    if (!this.openPromise) await this.init();
    await this.openPromise;
    if (!this.db) throw new Error('[capacitor-driver] 数据库未初始化');
    return this.db;
  }

  async run(sql: string, params?: unknown[]): Promise<void> {
    const db = await this.ensureOpen();
    // execute() 第二个参数是必须 mutate 的 boolean（useSqliteRows），
    // 第三个是返回类型；这里不需要返回值，传 false 即可。
    await db.run(sql, (params || []) as never[]);
  }

  async all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const db = await this.ensureOpen();
    const result = await db.query(sql, (params || []) as never[]);
    return (result.values || []) as T[];
  }

  async get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const rows = await this.all<T>(sql, params);
    return rows[0];
  }

  async exec(sql: string): Promise<void> {
    const db = await this.ensureOpen();
    // Capacitor SQLite 的 execute() 支持多语句（按 ; 分隔），
    // 但保险起见，分号切分后逐条 execute（避免单条语句失败连累整段）。
    const statements = sql
      .split(/;\s*(?=$|\n)/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        await db.execute(stmt + ';', false);
      } catch (err) {
        // 兼容"已存在"类错误：IF NOT EXISTS 已处理大部分，但部分 ALTER 重复执行需 swallow。
        const msg = err instanceof Error ? err.message : String(err);
        if (/already exists|duplicate column/i.test(msg)) {
          continue;
        }
        console.warn('[capacitor-driver] exec 片段失败：', stmt.slice(0, 60), '→', msg);
      }
    }
  }

  async pragma(name: string, value?: string): Promise<unknown> {
    const db = await this.ensureOpen();
    const sql = value === undefined
      ? `PRAGMA ${name}`
      : `PRAGMA ${name} = ${value}`;
    const result = await db.query(sql, []);
    // PRAGMA 查询返回的 values 结构不稳定：可能 [{journal_mode:'wal'}] 或 [{name,value}]
    return result.values?.[0];
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const db = await this.ensureOpen();
    if (this.inTransaction) {
      // 嵌套事务：SQLite 不支持真嵌套，回退到内层不显式 BEGIN（依赖外层）。
      return await fn();
    }
    this.inTransaction = true;
    await db.beginTransaction();
    try {
      const result = await fn();
      await db.commitTransaction();
      return result;
    } catch (err) {
      try {
        await db.rollbackTransaction();
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }

  async loadExtension(_path: string): Promise<boolean> {
    // Capacitor SQLite 不支持加载外部扩展。返回 false 触发 hasSqliteVec=false 分支。
    console.warn('[capacitor-driver] loadExtension 在移动端不支持（sqlite-vec 不可用）');
    return false;
  }

  async close(): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.close();
    } catch (err) {
      console.warn('[capacitor-driver] 关闭连接失败：', err);
    }
    try {
      await this.opts.sqlite.closeConnection(this.opts.dbName);
    } catch (err) {
      console.warn('[capacitor-driver] closeConnection 失败：', err);
    }
    this.db = null;
    this.openPromise = null;
  }
}

/**
 * 工厂函数：创建 CapacitorDriver 实例。
 * 调用方需要先在 Capacitor webview 侧注入 CapacitorSQLite（@capacitor-community/sqlite），
 * 通过 @capacitor/core 的 registerPlugin 暴露给 Capawesome Node 进程。
 */
export async function makeCapacitorDriver(opts: CapacitorDriverOptions): Promise<CapacitorDriver> {
  const driver = new CapacitorDriver(opts);
  await driver.init();
  return driver;
}