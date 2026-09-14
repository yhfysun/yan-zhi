/**
 * 移动端 driver 引导：Capawesome Node 内嵌运行时，server 启动前注入 CapacitorSQLite plugin。
 *
 * 调用方（mobile/server-bundle 启动器）流程：
 *   1. import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
 *   2. const sqlite = new SQLiteConnection(CapacitorSQLite)
 *   3. setMobilePlugin(CapacitorSQLite, sqlite)   ← 本文件提供
 *   4. await import('./db.js')                    ← 触发 db.ts 顶层 await 检测 + 选 driver
 *
 * db.ts 在 detectMobileRuntime()===true 时，会 await import('./db-mobile-bootstrap.js')
 * 并调用 getMobileDriver() 拿到已就绪的 CapacitorDriver。
 *
 * ⚠️ CapacitorSQLite 在 Capawesome Node 18 内的兼容性：
 *   - Capacitor 插件设计为 webview 内运行
 *   - Node 端调用需要通过 Capacitor bridge 桥接到 webview
 *   - 若 require('@capacitor-community/sqlite') 拿到的是空 stub 或调用抛 "not implemented"，
 *     请改用 wa-sqlite（WASM SQLite，纯 JS，Capawesome Node 18 内可直接 require）
 */

import type { CapacitorSQLitePlugin, SQLiteConnection } from '@capacitor-community/sqlite';
import { makeCapacitorDriver, type CapacitorDriver } from './db/capacitor-driver.js';

let cachedDriver: CapacitorDriver | null = null;
let initPromise: Promise<CapacitorDriver> | null = null;

/**
 * 设置移动端 plugin 实例（由调用方在启动时注入）。
 * 必须在 getMobileDriver() 之前调用。
 */
export function setMobilePlugin(
  plugin: CapacitorSQLitePlugin,
  sqlite: SQLiteConnection,
): void {
  if (cachedDriver || initPromise) {
    throw new Error('[db-mobile-bootstrap] 移动端 driver 已初始化，不能重复注入 plugin');
  }
  initPromise = makeCapacitorDriver({
    dbName: process.env.YZ_DB_NAME || 'yan-zhi',
    sqlite,
    plugin,
  }).then((driver) => {
    cachedDriver = driver;
    return driver;
  });
}

/**
 * 获取移动端 driver 实例（db.ts 顶层 await 时调用）。
 * 必须先 setMobilePlugin()。否则抛错。
 */
export async function getMobileDriver(): Promise<CapacitorDriver> {
  if (cachedDriver) return cachedDriver;
  if (initPromise) {
    await initPromise;
    return cachedDriver!;
  }
  throw new Error(
    '[db-mobile-bootstrap] 未调用 setMobilePlugin()。\n' +
    '请在 server bundle 启动前调用：\n' +
    '  import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";\n' +
    '  import { setMobilePlugin } from "@yz-server-bundle/db-mobile-bootstrap";\n' +
    '  const sqlite = new SQLiteConnection(CapacitorSQLite);\n' +
    '  setMobilePlugin(CapacitorSQLite, sqlite);\n',
  );
}

/** 仅供测试/debug：清空缓存（不关闭已建连接） */
export function _resetForTests(): void {
  cachedDriver = null;
  initPromise = null;
}