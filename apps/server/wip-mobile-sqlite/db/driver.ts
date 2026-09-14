/**
 * 数据库驱动抽象层。
 *
 * server 内部原直接依赖 better-sqlite3 同步 API（db.prepare(sql).run(...) 等）。
 * 在移动端内嵌 Node（Capawesome capacitor-nodejs 18.20.4，ABI 108）中无法加载
 * 宿主编译的 better-sqlite3.node（ABI 127），更无法加载 native 扩展（sqlite-vec）。
 *
 * 该抽象提供统一的 async API（run/all/get/exec/pragma/transaction/loadExtension），
 * 让 server 业务逻辑与具体驱动解耦。两种实现：
 *
 *  - sqlite-driver.ts     桌面/web：better-sqlite3（同步内部，async 包装）
 *  - capacitor-driver.ts  移动端：@capacitor-community/sqlite（全异步，原生 SQLite）
 *
 * 选用规则（db-mobile.ts 顶层）：
 *   process.versions.modules === '108'              → Capawesome Node 18
 *   或 globalThis.Capacitor 非空                     → Capacitor 运行时存在
 *   或 process.env.YAN_ZHI_PLATFORM === 'mobile'    → 显式环境变量
 *
 * 设计要点：
 *   1. 全异步：driver 内部无论同步/异步，对外统一 Promise。
 *   2. SQLite 方言一致：两个 driver 都接受相同的 SQL 语法（Capacitor SQLite 也是 SQLite）。
 *   3. 复杂迁移（PRAGMA / ATTACH / 多语句 exec）在两个 driver 上语义一致。
 *   4. 移动端 hasSqliteVec 永远 false（Capacitor SQLite 不支持扩展加载，除非显式配置）。
 */

export interface DbDriver {
  /** 执行单条带参 SQL（INSERT/UPDATE/DELETE），params 是绑定参数数组 */
  run(sql: string, params?: unknown[]): Promise<void>;

  /** 查询多行（SELECT），返回数组 */
  all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;

  /** 查询单行（SELECT LIMIT 1），返回首个或 undefined */
  get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;

  /** 执行多语句 SQL（CREATE TABLE / ALTER / DDL），无返回值 */
  exec(sql: string): Promise<void>;

  /** PRAGMA 查询，返回首个值或对象（驱动决定） */
  pragma(name: string, value?: string): Promise<unknown>;

  /** 事务包裹：fn 抛错则 ROLLBACK，否则 COMMIT */
  transaction<T>(fn: () => Promise<T>): Promise<T>;

  /** 加载 SQLite 原生扩展（sqlite-vec 等）。移动端驱动实现为 no-op + warn */
  loadExtension(path: string): Promise<boolean>;

  /** 关闭数据库连接（进程退出前调用） */
  close(): Promise<void>;
}

/**
 * 统一对外的 db 接口：把 driver 的方法暴露成对象字面量，
 * 业务代码 import { db } from './db-mobile.js' 拿到。
 */
export interface DbFacade extends DbDriver {
  /** 当前驱动类型（用于日志/排障） */
  readonly driverType: 'sqlite' | 'capacitor';
}

/**
 * 检测是否运行在移动端内嵌 Node（Capawesome capacitor-nodejs）。
 * 检测失败 fallback 到桌面/web。
 */
export function detectMobileRuntime(): boolean {
  // 1. 显式环境变量（debug 用，例如 Windows 模拟 mobile 启动）
  if (process.env.YAN_ZHI_PLATFORM === 'mobile') return true;
  if (process.env.YAN_ZHI_PLATFORM === 'desktop' || process.env.YAN_ZHI_PLATFORM === 'web') return false;

  // 2. Capawesome Node 18 ABI 版本号
  //    process.versions.modules 是 NODE_MODULE_VERSION（Node 18 = 108）
  if (process.versions && process.versions.modules === '108') return true;

  // 3. Capacitor 全局对象（@capacitor/core 注入）
  const cap = (globalThis as { Capacitor?: unknown }).Capacitor;
  if (cap && typeof cap === 'object') return true;

  return false;
}