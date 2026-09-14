# 移动端 SQLite 替换方案：从 better-sqlite3 切到 @capacitor-community/sqlite

> 状态：**driver 抽象已完成，待接通全链路**
> 创建：2026-09-14
> 影响范围：apps/server/**（55 个调用方）+ apps/mobile 启动流程

## 背景

`apps/server/src/db.ts` 当前直接依赖 `better-sqlite3` 同步 API（`db.prepare(sql).run(...)` 等）。

Capawesome capacitor-nodejs 在 Android/iOS 内嵌 **Node.js 18.20.4（ABI 108）**，宿主编译的
better-sqlite3 是 **Node 22 ABI 127**，require 时 NODE_MODULE_VERSION 不匹配直接崩。

**Capawesome iOS 还完全禁止 native addon**（文档原话："only supported on Android if provided
as prebuilds"），即便 ABI 解决，iOS 也跑不了。

sqlite-vec 扩展同样依赖 native loader，移动端无法加载 → 向量检索降级为关键词。

## 方案

把 server 内部 DB 调用从"同步 better-sqlite3 直接调用"重构为"异步 driver 抽象层"。

### 三层架构

```
apps/server/src/
  db.ts                 ← 桌面/web 入口（同步 better-sqlite3，调用方 import 此）
  db-mobile.ts          ← 移动端入口（异步 Capacitor SQLite，server bundle 启动时选此）
  db/
    driver.ts           ← DbDriver 抽象接口（run/all/get/exec/pragma/transaction/loadExtension）
    sqlite-driver.ts    ← better-sqlite3 实现（同步内部，async 包装）
    capacitor-driver.ts ← @capacitor-community/sqlite 实现（全异步）
    seed.ts             ← 【待建】把 db.ts 的建表/迁移/seed 抽成函数，让两个入口都调
```

server/index.ts 启动时检测：

```ts
import { detectMobileRuntime } from './db/driver.js';

const isMobile = detectMobileRuntime();
const dbModule = isMobile
  ? await import('./db-mobile.js')
  : await import('./db.js');
const { db } = dbModule;
```

### driver 抽象 API

```ts
interface DbDriver {
  run(sql, params?): Promise<void>;       // INSERT/UPDATE/DELETE
  all<T>(sql, params?): Promise<T[]>;     // SELECT 多行
  get<T>(sql, params?): Promise<T>;       // SELECT 单行
  exec(sql): Promise<void>;               // CREATE/ALTER/DDL（可多条；用 ; 分隔）
  pragma(name, value?): Promise<unknown>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  loadExtension(path): Promise<boolean>;  // 移动端返回 false（不支持）
  close(): Promise<void>;
}
```

### 调用方改造量

**55 个文件**需要把同步调用改成 await：

| 旧 | 新 |
|---|---|
| `db.prepare(sql).run(a, b)` | `await db.run(sql, [a, b])` |
| `db.prepare(sql).all(a)` | `await db.all(sql, [a])` |
| `db.prepare(sql).get(a)` | `await db.get(sql, [a])` |
| `db.exec(sql)` | `await db.exec(sql)` |
| `db.pragma('journal_mode', 'WAL')` | `await db.pragma('journal_mode', 'WAL')` |

实际工作量：**~275 处机械编辑**，约 3-4 小时。

**分阶段策略**（避免一次性大爆炸）：

#### 阶段 A：基础设施 ✅ 已完成
1. `driver.ts` — 抽象层
2. `sqlite-driver.ts` — better-sqlite3 异步包装
3. `capacitor-driver.ts` — Capacitor SQLite 异步包装
4. `db-mobile.ts` — 移动端入口（initMobileDb + db facade）

#### 阶段 B：seed 抽取 + db.ts 改造（待办，约 1-2 小时）
5. 把 db.ts 的建表/迁移/seed 部分（约 L115-2585）抽成 `db/seed.ts` 的函数
   `runSchemaMigrationsAndSeed(driver: DbDriver)`
6. db.ts 顶层改为异步初始化：
   ```ts
   const driver = await makeSqliteDriver({ path: DB_PATH, loadSqliteVec: true });
   await runSchemaMigrationsAndSeed(driver);
   export const db = wrapDriver(driver);
   export const hasSqliteVec = (driver as SqliteDriver).hasSqliteVec();
   ```

#### 阶段 C：调用方迁移（待办，约 3-4 小时）
7. 改 55 个 import { db } 的文件：所有 db.xxx 改成 await
8. 优先改路由层（routes/*）+ 服务层（services/*）+ 顶层（llm-task-manager/auth/node-adapter）

#### 阶段 D：移动端入口注入（待办，约 1 小时）
9. apps/mobile/src/main.ts 启动 server bundle 前：
   ```ts
   import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
   import { initMobileDb } from '@yz-server-bundle/db-mobile';
   const sqlite = new SQLiteConnection(CapacitorSQLite);
   await initMobileDb(sqlite, CapacitorSQLite);
   // 然后启动 server bundle（已包含 server/index.ts 的逻辑）
   ```

   ⚠️ **风险**：Capawesome Node 18 内调用 CapacitorSQLite plugin 走桥接到 webview 内 JS
   再调原生 SQLite，单次往返 ~1-3ms，比 better-sqlite3 慢 10-50 倍。
   **聊天主链路可能增加 ~50ms/条延迟**。

   优化手段：
   - 批量写入（合并 message 插入）
   - 减少 query 次数（一次性查 N 条而非循环查）
   - 后续若性能不够，可换 wa-sqlite（WASM SQLite，纯 JS，Capawesome Node 18 内可直接跑）

#### 阶段 E：APK 验证（待办，约 1 小时）
10. pnpm build → 触发 server tsc → cap sync → gradlew assembleDebug
11. 验证：
    - APK 内不含 `better-sqlite3.node`
    - APK 启动后 Node 进程能 require('./db-mobile.js') 不崩
    - 真机/模拟器启动 → 看 `/data/data/com.yanzhi.mobile/files/nodejs/.../data.db` 创建
    - seed 成功、用户能登录

## 兼容性矩阵

| 平台 | better-sqlite3 | Capacitor SQLite | sqlite-vec |
|---|---|---|---|
| 桌面 (Electron) | ✅ | — | ✅ |
| Web (浏览器) | — | — | ❌ |
| Android (Capawesome) | ❌ ABI 108 vs 127 | ✅ 桥接 | ❌ |
| iOS (Capawesome) | ❌ native 禁 | ✅ 桥接 | ❌ |

## 风险与备选

### 风险 1：CapacitorSQLite 在 Capawesome Node 内调不通
- 症状：require('@capacitor-community/sqlite') 返回的对象不工作
- 备选：wa-sqlite（WASM SQLite，Node 18 直接 require，纯 JS）
- 切换成本：加一个 wa-sqlite-driver.ts，几小时内可完成

### 风险 2：性能
- 桥接 SQLite 比本地慢 10-50 倍
- 实测：Android 真机启动 + seed 预计 5-10 秒（vs 桌面 <1 秒）
- 优化：批量写、合并 query、缓存

### 风险 3：server bundle 启动顺序
- server 启动前必须 initMobileDb 完成
- CapacitorSQLite plugin 实例必须先注入到 bundle
- 跨包 import（@yz-server-bundle/db-mobile）需要 monorepo 配置

## 不在本次范围

- iOS Capacitor SQLite 静态链接（仅 Android 走动态扩展时考虑）
- 移动端 sqlite-vec（WASM 版单独打包，约 +3MB）
- iOS 上 Capacitor SQLite 是否需要 SQLCipher（暂用 no-encryption）
- mobile 端阉割 child_process 工具（ops-shell/playwright/tesseract 等）
  → 暂未实现，工具调用会报错但不影响聊天主链路

## 关键文件路径

- `apps/server/src/db.ts` — 旧入口（待改造）
- `apps/server/src/db-mobile.ts` — 移动端入口（✅ 新建）
- `apps/server/src/db/driver.ts` — 抽象接口（✅ 新建）
- `apps/server/src/db/sqlite-driver.ts` — desktop/web driver（✅ 新建）
- `apps/server/src/db/capacitor-driver.ts` — mobile driver（✅ 新建）
- `apps/server/src/db/seed.ts` — 共享 seed 函数（⬜ 待建）
- `apps/mobile/src/main.ts` — 启动 server bundle（⬜ 待注入 initMobileDb）