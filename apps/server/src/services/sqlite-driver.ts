// SQLite 驱动自适配：better-sqlite3（原生）优先，加载失败回退 sql.js（WASM）。
// ------------------------------------------------------------------
// 这是「移动端数据库改造」的核心（issues/README 台账与 apps/mobile/README 记录的
// ABI 遗留问题）：内嵌后端跑在 nodejs-mobile（Node 18，ABI 108）上，装不到按
// Node 22（ABI 127）编译的 better-sqlite3 二进制，原实现 `new Database()` 在模块
// 顶层直接抛错 → 后端起不来。
//
// 取舍：
//  1) 桌面/常规服务端走原生路径，行为与历史完全一致（WAL、sqlite-vec 扩展）。
//  2) 回退驱动用 sql.js（官方 SQLite 编译的 WASM，零原生依赖，API 同步），
//     对上层暴露 better-sqlite3 同款接口面（prepare/exec/pragma/transaction），
//     全仓 2000+ 行 db 代码无需任何改动。
//  3) sql.js 是内存库：写入后**防抖落盘**（tmp+rename 原子替换），进程退出
//     再兜底刷一次；再加 5s 周期兜底（Android 杀进程不一定给 SIGTERM）。
//     代价是掉电可能丢最后 ≤5s 的写入 —— 对移动端本地缓存库可接受，换来的是
//     不需要 NDK 交叉编译链。
//  4) sqlite-vec 是原生扩展，WASM 驱动下无法加载 —— 上层已按 hasSqliteVec=false
//     降级为关键词检索（db.ts 原有逻辑）。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createLogger } from './logger.js';
const logger = createLogger('sqlite-driver');

/** better-sqlite3 同款语句句柄（全仓只用 run/get/all，参数全为 ? 位置式） */
export interface YzStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | string | undefined };
  get(...params: unknown[]): any;
  all(...params: unknown[]): any[];
  /** 列名（可选能力：better-sqlite3 的 stmt.columns()；sql.js 用 getColumnNames()）。
   *  connector 层取列名时优先调用，缺失则由调用方从首行 keys 兜底。 */
  columns?(): string[];
}

export type SqliteDriverName = 'better-sqlite3' | 'sql.js';

export interface OpenSqliteOptions {
  /** 测试用：强制走 sql.js 路径（生产恒为自动探测） */
  forceDriver?: 'sql.js';
  /** 只读打开：原生路径透传给 better-sqlite3（驱动层禁写）；
   *  sql.js 路径标记只读（任何写语句 markDirty 时抛错，杜绝内存库改动被落盘）。
   *  连接器层的项目库/sqlite 数据源只读连接依赖此语义。 */
  readonly?: boolean;
}

/** better-sqlite3 同款连接面（db.ts 及全部路由/服务的实际用量） */
export interface YzSqliteDb {
  prepare(sql: string): YzStatement;
  exec(sql: string): void;
  /** PRAGMA；返回首行首列值。WASM 下不适用的 PRAGMA（如 WAL）静默忽略 */
  pragma(source: string): unknown;
  /** ★ 与 better-sqlite3 同语义：**不立即执行**，返回包了 BEGIN/COMMIT 的同名函数，
   *  调用它才真正跑事务。调用方既有 IIFE（db.transaction(fn)()）也有先创建后调用。 */
  transaction<F extends (...args: any[]) => any>(fn: F): (...args: Parameters<F>) => ReturnType<F>;
  close(): void;
  /** 仅原生驱动提供；sql.js（WASM）无法加载原生扩展 */
  loadExtension?(path: string): void;
}

export async function openSqlite(
  dbPath: string,
  opts?: OpenSqliteOptions,
): Promise<{ db: YzSqliteDb; driver: SqliteDriverName }> {
  // 测试开关：better-sqlite3 的 .node 二进制按编译期 ABI 加载（本仓 130），vitest
  // 若跑在 ABI 127 的 node 上则 `new Database()` 才抛错（require 的 try/catch 拦不住
  // 懒加载）。测试需要真 SQL 语义时直接置此开关走 sql.js —— 与 CI 回退路径同源。
  if (process.env.YZ_TEST_FORCE_SQLJS === '1') {
    return { db: await openSqlJs(dbPath, !!opts?.readonly), driver: 'sql.js' };
  }
  if (!opts?.forceDriver) {
    try {
      const mod = await import('better-sqlite3');
      const BetterDatabase = mod.default;
      // readonly 透传：连接器层的项目库/只读数据源依赖驱动层禁写。
      // ★ fileMustExist 只随 readonly 收紧 —— 主库首次启动要靠默认行为建空库，不能全局开。
      const db = new BetterDatabase(
        dbPath,
        opts?.readonly ? { readonly: true, fileMustExist: true } : undefined,
      ) as unknown as YzSqliteDb;
      return { db, driver: 'better-sqlite3' };
    } catch (err) {
      // 典型两种：包没装进内嵌包（ERR_MODULE_NOT_FOUND）/ ABI 不匹配
      //（NODE_MODULE_VERSION 不一致）。都属「原生驱动不可用」，回退 WASM。
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('[sqlite-driver] better-sqlite3 不可用，回退 sql.js（WASM）:', msg.split('\n')[0]);
    }
  }
  return { db: await openSqlJs(dbPath, !!opts?.readonly), driver: 'sql.js' };
}

/**
 * sql.js 驱动。类型用 any 收窄面：sql.js 无官方类型，这里只依赖
 * export/bind/step/getAsObject/getRowsModified/run 这几个稳定 API。
 */
async function openSqlJs(dbPath: string, readonlyMode = false): Promise<YzSqliteDb> {
  const initSqlJs = (await import('sql.js')).default;
  // locateFile：sql.js 主入口在 dist/sql-wasm.js，wasm 与它同目录。
  // 用 createRequire 解析而不是 import.meta.url 拼相对路径 —— 内嵌包里本文件位于
  // nodejs/dist/apps/server/src/services/，而依赖在 nodejs/node_modules/，靠
  // require 的向上解析才能找准。
  const require = createRequire(import.meta.url);
  const wasmDir = path.dirname(require.resolve('sql.js'));
  const SQL = await initSqlJs({ locateFile: (file: string) => path.join(wasmDir, file) });

  const existing = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;
  const sqlDb = existing ? new SQL.Database(new Uint8Array(existing)) : new SQL.Database();
  return new SqlJsDatabase(sqlDb, dbPath, readonlyMode);
}

class SqlJsDatabase implements YzSqliteDb {
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private static exitHooksInstalled = false;

  constructor(
    private sqlDb: any,
    private dbPath: string,
    private readonlyMode = false,
  ) {
    if (!SqlJsDatabase.exitHooksInstalled) {
      SqlJsDatabase.exitHooksInstalled = true;
      // exit 事件回调必须同步 —— export + writeFileSync 都是同步的，正好符合
      process.on('exit', () => { try { flushAllInstances(); } catch { /* 尽力而为 */ } });
      for (const sig of ['SIGINT', 'SIGTERM'] as const) {
        process.on(sig, () => { try { flushAllInstances(); } catch { /* ignore */ } });
      }
      // 周期兜底：Android 杀后台进程不一定给 SIGTERM，把丢失窗口压到间隔内（默认 5s）。
      // ★ 移动端可经 YZ_SQLITE_FLUSH_INTERVAL_MS 收紧（收尾方案 #3：Android 建议 2000）。
      const interval = Math.max(500, Number(process.env.YZ_SQLITE_FLUSH_INTERVAL_MS) || 5000);
      const t = setInterval(() => { try { flushAllInstances(); } catch { /* ignore */ } }, interval);
      t.unref?.();
    }
    instances.add(this);
  }

  /** 只读连接（连接器层项目库/只读数据源）：**写发生前**拦下，语义对齐
   *  better-sqlite3 readonly（在写发生时报错）。SELECT 不受影响。 */
  private assertWritable(): void {
    if (this.readonlyMode) throw new Error('SQLite 连接为只读（readonly），禁止写入');
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    const debounce = Math.max(50, Number(process.env.YZ_SQLITE_FLUSH_DEBOUNCE_MS) || 250);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushIfDirty();
    }, debounce);
    this.flushTimer.unref?.();
  }

  /** 全量导出 + tmp 原子替换。sql.js 无 WAL，全量写是唯一持久化方式 */
  flushIfDirty(): void {
    if (!this.dirty) return;
    this.dirty = false;
    // ★ ':memory:'（测试用内存库）无落盘语义 —— 不处理会去写名为 ":memory:.tmp" 的文件直接 ENOENT
    //   （2026-10-03 conversation-mode 测试迁移到统一驱动入口时暴露）。
    if (this.dbPath === ':memory:') return;
    const buf = Buffer.from(this.sqlDb.export());
    const tmp = this.dbPath + '.tmp';
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, this.dbPath);
  }

  prepare(sql: string): YzStatement {
    const sqlDb = this.sqlDb;
    const markDirty = () => this.markDirty();
    const assertWritable = () => this.assertWritable();
    return {
      run(...params: unknown[]) {
        assertWritable();
        // 位置参数（全仓口径）；getRowsModified 是 sql.js 提供的全局计数
        sqlDb.run(sql, params as unknown[]);
        markDirty();
        return { changes: sqlDb.getRowsModified(), lastInsertRowid: undefined };
      },
      get(...params: unknown[]) {
        const stmt = sqlDb.prepare(sql);
        try {
          stmt.bind(params as unknown[]);
          return stmt.step() ? stmt.getAsObject() : undefined;
        } finally {
          stmt.free();
        }
      },
      all(...params: unknown[]) {
        const stmt = sqlDb.prepare(sql);
        const rows: unknown[] = [];
        try {
          stmt.bind(params as unknown[]);
          while (stmt.step()) rows.push(stmt.getAsObject());
        } finally {
          stmt.free();
        }
        return rows;
      },
      columns() {
        // sql.js Statement API：getColumnNames()（新版）/ columns()（元素含 name）双兜底
        const s = sqlDb.prepare(sql);
        try {
          if (typeof s.getColumnNames === 'function') return s.getColumnNames() as string[];
          return ((s.columns?.() || []) as Array<{ name?: string }>).map((c) => c.name || '');
        } finally {
          try { s.free(); } catch { /* ignore */ }
        }
      },
    };
  }

  exec(sql: string): void {
    this.assertWritable();
    this.sqlDb.exec(sql);
    this.markDirty();
  }

  pragma(source: string): unknown {
    try {
      const res = this.sqlDb.exec(source);
      return res?.[0]?.values?.[0]?.[0];
    } catch {
      // WASM/内存库下不适用的 PRAGMA（如 journal_mode=WAL）：静默忽略
      return undefined;
    }
  }

  transaction<F extends (...args: any[]) => any>(fn: F): (...args: Parameters<F>) => ReturnType<F> {
    return (...args: Parameters<F>): ReturnType<F> => {
      this.assertWritable();
      this.sqlDb.run('BEGIN');
      try {
        const out = fn(...args);
        this.sqlDb.run('COMMIT');
        this.markDirty();
        return out;
      } catch (e) {
        try { this.sqlDb.run('ROLLBACK'); } catch { /* 事务已自动回滚 */ }
        throw e;
      }
    };
  }

  close(): void {
    this.flushIfDirty();
    instances.delete(this);
    this.sqlDb.close();
  }
}

const instances = new Set<SqlJsDatabase>();
function flushAllInstances(): void {
  for (const inst of instances) inst.flushIfDirty();
}
