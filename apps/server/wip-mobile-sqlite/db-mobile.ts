/**
 * 移动端 server 数据库入口。
 *
 * 与 db.ts 并存：db.ts 保留桌面/web 路径（同步 better-sqlite3，不动），
 * 本文件专为 Capawesome 内嵌 Node 设计，强制走 Capacitor SQLite 异步路径。
 *
 * server/index.ts 顶层根据 detectMobileRuntime() 动态选：
 *   const dbMod = isMobile ? await import('./db-mobile.js') : await import('./db.js');
 *
 * 调用方使用方式（与 db.ts 一致，但所有方法都需 await）：
 *   import { db, hasSqliteVec, dataDir } from '../db-mobile.js';
 *   await db.run(sql, [p1, p2]);
 *   const rows = await db.all(sql, [p1]);
 *   await db.exec(sql);
 *   await db.transaction(async () => { ... });
 *
 * 一次性事务：调用 init() 后所有调用方才能用 db。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectMobileRuntime, type DbFacade } from './db/driver.js';
import { makeCapacitorDriver } from './db/capacitor-driver.js';

// dataDir：与 db.ts 一致的"单一真相源"原则——db.ts 所在目录为基准。
// 在 mobile 内嵌 Node 跑时，db-mobile.js 被 require 到 nodejs/ 目录的 server bundle 里，
// __dirname 会指向 mobile bundle 内的相对路径。Capawesome 启动时会切到工作目录。
export const dataDir = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.mkdirSync(dataDir, { recursive: true });

if (!detectMobileRuntime()) {
  console.warn(
    '[db-mobile] 当前不在移动端运行时（Capawesome Node / Capacitor 全局对象缺失），\n' +
    '若非调试目的请检查 server 入口是否走对 db 模块（桌面/web 应走 db.js，移动端才走 db-mobile.js）。',
  );
}

/**
 * CapacitorSQLite 插件实例。
 *
 * 在 Capawesome Node 进程内，@capacitor-community/sqlite 通过 Capacitor 桥接发消息到 webview
 * 内的 CapacitorSQLite plugin（webview 内 JS 收到消息后调原生层 SQLite）。
 *
 * 此处的 plugin 实例由调用方在创建 driver 前从 @capacitor/core 的 registerPlugin
 * （或 import { CapacitorSQLite } from '@capacitor-community/sqlite'）拿到。
 * 在 mobile 入口（apps/mobile/src/main.ts 的 server bundle 启动前）会注入。
 *
 * ⚠️ 当前 server bundle 在 mobile/node_modules 里独立 require @capacitor-community/sqlite，
 *    该 require 在 Capawesome Node 18 内返回的对象是否正常工作，需要在真机启动后验证：
 *    - 若 CapacitorSQLite 不存在：fallback 到 wa-sqlite（WASM，无 ABI 问题）
 *    - 若 plugin 调用失败：捕获错误并 fallback 到 wa-sqlite
 */

let dbFacade: DbFacade | null = null;
let initPromise: Promise<DbFacade> | null = null;

/**
 * 初始化移动端 db（建表 + 迁移 + seed）。
 * 重复调用返回同一 Promise。
 *
 * @param sqlite @capacitor-community/sqlite 的 SQLiteConnection 实例
 * @param plugin @capacitor-community/sqlite 的 CapacitorSQLitePlugin 实例
 */
export async function initMobileDb(
  sqlite: import('@capacitor-community/sqlite').SQLiteConnection,
  plugin: import('@capacitor-community/sqlite').CapacitorSQLitePlugin,
): Promise<DbFacade> {
  if (dbFacade) return dbFacade;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const driver = await makeCapacitorDriver({
      dbName: process.env.YZ_DB_NAME || 'yan-zhi',
      sqlite,
      plugin,
    });

    // 建表 + 迁移 + seed
    // 注意：mobile 端 hasSqliteVec 永远 false（capacitor-driver.loadExtension 是 no-op），
    // 涉及 vec 的逻辑会走关键词兜底分支（services/kb.ts 已经处理）。
    const { runSchemaMigrationsAndSeed } = await import('./db/seed.js');
    await runSchemaMigrationsAndSeed(driver);

    dbFacade = wrapDriver(driver);
    return dbFacade;
  })();

  return initPromise;
}

/**
 * 把 driver 包装成 dbFacade 对象字面量，便于业务代码 import { db } 使用。
 * 运行时类型为 'capacitor'，方便日志排障。
 */
function wrapDriver(driver: import('./db/driver.js').DbDriver): DbFacade {
  return {
    driverType: 'capacitor',
    run: (sql, params) => driver.run(sql, params),
    all: <T>(sql, params) => driver.all<T>(sql, params),
    get: <T>(sql, params) => driver.get<T>(sql, params),
    exec: (sql) => driver.exec(sql),
    pragma: (name, value) => driver.pragma(name, value),
    transaction: <T>(fn) => driver.transaction<T>(fn),
    loadExtension: (path) => driver.loadExtension(path),
    close: () => driver.close(),
  };
}

/** 移动端 hasSqliteVec 永远 false（Capacitor SQLite 不支持扩展加载） */
export const hasSqliteVec = false;

/**
 * 占位 db 对象，仅在 initMobileDb 完成前调用会抛错。
 * 业务代码应该 await initMobileDb() 后再用。
 */
export const db: DbFacade = new Proxy({} as DbFacade, {
  get(_target, prop) {
    if (!dbFacade) {
      throw new Error(
        '[db-mobile] 数据库未初始化：请先调用 await initMobileDb(sqlite, plugin)。\n' +
        '这通常意味着 server 启动顺序错乱——server 应在 initMobileDb resolve 之后再注册路由。',
      );
    }
    return (dbFacade as unknown as Record<string | symbol, unknown>)[prop];
  },
});