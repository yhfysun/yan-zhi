# mobile-sqlite-replacement 接手指南

> **⚠️ 2026-09-14 状态更新：重构已暂停转存，桌面/网页端恢复原状（构建绿灯）**
>
> 用户明确约束：**不能影响 web 端和桌面端**。而阶段 C（55 个调用方 ~800 处 await 化）全在桌面/web 代码路径上，与该约束冲突 → 整体重构暂停转存，`src/db.ts` 恢复为 HEAD 的同步版本。
>
> 已执行（全部可逆、零删除）：
> 1. WIP 整体转存到 `apps/server/wip-mobile-sqlite/`：`db/`（driver/sqlite-driver/capacitor-driver/seed.ts）、`db-mobile.ts`、`db-mobile-bootstrap.ts`、`db.ts.async-rewrite.bak`（异步版 db.ts 完整备份）。
> 2. seed.ts 的 12 处抽取语法损伤**已修好**（7 处 `db.prepare(...))` 多右括号 + 5 处 `,,` 双逗号 = handoff 原记录的 5+7 bug），保留在转存副本内。
> 3. server `tsc --noEmit` 0 错误；`tsc + fix-esm-extensions.cjs`（原打包失败步骤）已验证通过。
>
> **恢复步骤**：把 wip-mobile-sqlite/ 下的 `db/`、`db-mobile*.ts` 移回 `src/`，用 `db.ts.async-rewrite.bak` 覆盖 `src/db.ts`，然后继续下面「接手后第一步」。第一步剩余清单（语法层已清，剩语义层）：
> - seed.ts：`export const seedAgents`(L1378) 与 `export const builtinSkillDefaults`(L1951) 被包在 `runSchemaMigrationsAndSeed` 函数体内（TS1184），需移到模块顶层；函数体引用它们的代码保持在函数内。
> - seed.ts：9 处残留 `db.prepare(...)`（L348/349/2178/2181/2199/2200/2506/2510 及其 run/get/all 调用点）→ 改 `await driver.run/all/get(SQL, [args])`。
> - seed.ts：4 处 `overwriteEnabled`（L1600/1841/1865/1941）→ 给 `runSchemaMigrationsAndSeed(driver, overwriteEnabled)` 加参数，db.ts / db-mobile.ts 调用处传入。
> - sqlite-driver.ts：`betterDb.pragma(name, value)` 两处类型错 → 改 `pragma(value===undefined ? name : `${name} = ${value}`)`。
> - db.ts / db-mobile.ts：对象字面量里泛型箭头 `<T>(sql, params) =>` 参数隐式 any（TS7006）→ 显式标注 `(sql: string, params?: unknown[])`。
> - `@capacitor-community/sqlite` 未安装（TS2307）→ 装依赖或加 `declare module` 垫片。
> - 然后才是阶段 C（55 文件迁移）——**动工前先跟用户确认影响范围**。

> 创建：2026-09-13（Agent mode 第一轮）
> 状态：**driver 抽象 + db.ts 异步入口已落地**，seed.ts 抽出来了但有 5 处跨行 args 状态机 bug 未修（→ 2026-09-14 已修，见顶部）
> 用途：你下次开会话时，可以直接基于本文件继续推进；不必从头摸索

## 项目位置

- 工作目录：`C:\Users\Administrator\Desktop\github\yan-zhi-master`
- 分支：`dev0.1`
- 不要 `git push`（用户自己做）

## 已完成文件清单

```
apps/server/src/
├── db.ts                          ← 已重写：顶层 await 异步入口（不要改回）
├── db-mobile.ts                   ← 移动端入口（initMobileDb + Proxy db facade）
├── db-mobile-bootstrap.ts         ← Capawesome plugin 注入点（setMobilePlugin）
└── db/
    ├── driver.ts                  ← DbDriver 抽象 + detectMobileRuntime
    ├── sqlite-driver.ts           ← better-sqlite3 异步包装（同步内部，async 暴露）
    ├── capacitor-driver.ts        ← @capacitor-community/sqlite 全异步实现
    └── seed.ts                    ← ⚠️ 从 db.ts 抽出来的建表/迁移/seed，**有 5 处状态机 bug**

tools/extract-seed.cjs             ← 一次性脚本（可重跑）：db.ts → db/seed.ts
openspec/changes/mobile-sqlite-replacement/
└── plan.md                        ← 完整方案文档（背景/方案/阶段/风险）
```

## 关键设计决策（接手必读）

### driver 抽象
```ts
interface DbDriver {
  run(sql, params?): Promise<void>;
  all<T>(sql, params?): Promise<T[]>;
  get<T>(sql, params?): Promise<T | undefined>;
  exec(sql): Promise<void>;
  pragma(name, value?): Promise<unknown>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  loadExtension(path): Promise<boolean>;
  close(): Promise<void>;
}
```

### 检测逻辑（db/driver.ts:detectMobileRuntime）
- `process.env.YAN_ZHI_PLATFORM === 'mobile'`
- `process.versions.modules === '108'`（Capawesome Node 18 ABI）
- `globalThis.Capacitor` 存在

### db.ts 顶层 await 流程
1. `detectMobileRuntime()` 选 driver
2. mobile：`await import('./db-mobile-bootstrap.js')` + `getMobileDriver()`
3. desktop：`makeSqliteDriver({ path: DB_PATH, loadSqliteVec: true })`
4. `await runSchemaMigrationsAndSeed(driver)`
5. export `db: DbFacade` + `hasSqliteVec` + async `resetBuiltinAgent/resetBuiltinSkill`

### CapacitorSQLite 风险（重要！）
- Capawesome Node 18 内调用 @capacitor-community/sqlite 通过 Capacitor bridge → webview → 原生 SQLite
- 单次往返 1~3ms，比 better-sqlite3 慢 10~50 倍
- **首次真机启动可能抛 "not implemented"** → 备选：wa-sqlite（WASM SQLite，纯 JS）
- iOS 完全禁 native addon → 走 Capacitor SQLite 是**唯一**路径

## 接手后第一步：修 seed.ts 5 处状态机 bug

### 状态机 bug 描述
我的工具脚本 `tools/extract-seed.cjs` 用状态机把 `db.prepare(SQL).run(args)` 转为 `await driver.run(SQL, args)`。
对**单行**和**SQL 后立即 args** 的情况 100% 正确（33 处）。
对**跨行**情况（`db.prepare(\n  SQL,\n).run(args)` 或 SQL 后换行才 args）有 bug：
- argsBuf 把 SQL 字符串内容也吞进去（5 处）
- 或 sqlBuf 没 trim（导致 `,` 多余）

### TS 报错位置（typecheck 后会看到）
```
src/db/seed.ts(1606,294): error TS1135: Argument expression expected.
src/db/seed.ts(1822,71):  error TS1135: Argument expression expected.
src/db/seed.ts(1833,197): error TS1135: Argument expression expected.
src/db/seed.ts(1857,197): error TS1135: Argument expression expected.
src/db/seed.ts(1934,197): error TS1135: Argument expression expected.
```

### 修复方法（二选一）

**方法 A：手工修 5 处 seed.ts**（快，10 分钟）
每处把 `'SQL',, [args])` 改成 `'SQL', [args])` 即可。

**方法 B：优化状态机脚本再重跑**（更彻底，30 分钟）
- `argsBuf` 起始位置应该在 `(` 之后第一个非空白字符（不是 `(` 后立即第一个字符）
- sqlBuf 应该 trim 掉前后空白（已加，但还需要 argsBuf 也跳过 args 区段内的字符串）
- 重跑 `node tools/extract-seed.cjs` 后**记得手工 Edit 修过的 7 处**（hasKey + insertStmt + getBody + upd）

### 跑 typecheck
```bash
cd apps/server
node ../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc --noEmit
```

## 接手后第二步：改 55 个调用方为 await

调用 `db.prepare(sql).run(...)` 的文件（`grep "from '../db.js'" apps/server/src -r`）：
- routes/*.ts（~30 个）
- services/*.ts（~15 个）
- mcp/*.ts（~5 个）
- llm-task-manager.ts、auth.ts、workflow-runner.ts

转换规则：
```ts
// 旧
db.prepare(sql).run(a, b)
db.prepare(sql).all(arg)
db.prepare(sql).get(arg)
db.exec(sql)
db.pragma(name, value)

// 新
await db.run(sql, [a, b])
await db.all(sql, [arg])
await db.get(sql, [arg])
await db.exec(sql)
await db.pragma(name, value)
```

⚠️ 注意：很多调用在 `for` 循环或非 async 函数里，需要先把外层函数改成 async。

## 接手后第三步：server/index.ts 顶层 await

`apps/server/src/index.ts` 顶层已经 await db（实际上之前就 import 了），需要确认：
- import 顺序：先 `await import('./db.js')`（触发顶层 await 初始化）
- 然后再启动 express

实际上由于 ESM 顶层 await，import './db.js' 就会阻塞到初始化完成。**但** 调用方也要 await db.run 才能拿到结果。

## 接手后第四步：APK 验证

```bash
cd C:\yz\apps\mobile\android  # ⚠️ 用 junction 短路径（避免 CMake 路径超 250 字符）
.\gradlew.bat assembleDebug
```

预期 APK：`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- 大小 ~166MB（已有 Node 运行时 + 后端）
- 内部不含 better-sqlite3.node

启动验证（需要 Android 模拟器或真机）：
- Node 进程能 require('./db.js') 不崩
- SQLite db 在 `/data/data/com.yanzhi.mobile/files/nodejs/.../data.db` 创建
- seed 成功 + 用户能登录

## 接手后第五步（可选）：iOS 文档 + CI workflow

如果还要继续做：
- `openspec/changes/mobile-sqlite-replacement/docs/mobile-ios-setup.md`（macOS + Xcode 26 + SPM 步骤）
- `.github/workflows/mobile-ios-build.yml`（macos-14 runner + xcodebuild）

这两个相对独立，不需要 sqlite 跑通。

## 接手后第六步（可选）：mobile UI 布局优化

第一批：Chat.vue mobile 单栏（侧栏抽屉化）+ SideNav tab 扩到 8-10 个
第二批：Home.vue / Knowledge.vue / AgentCanvas.vue mobile 适配

UI 改造不动 server，风险低，可以独立推进。

## 不要做的事

- ❌ 不要把 db.ts 改回同步 better-sqlite3 模式（会回到起点）
- ❌ 不要把 ONTOLOGY_QUERY_BODY 等大常量从 seed.ts 移到 db.ts（同步两处文件很危险）
- ❌ 不要在 driver 抽象层加 Capawesome 不支持的方法（sqlite-vec loadExtension 永远 no-op）
- ❌ 不要 git push（用户自己做）

## 工作日志

今天的日志在 `C:\Users\Administrator\Desktop\github\yan-zhi-master\.workbuddy\memory\2026-09-13.md`
（如不存在则今天还没创建，建议接手时创建 2026-09-14.md）