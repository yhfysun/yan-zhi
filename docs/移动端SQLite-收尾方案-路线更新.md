# 移动端 SQLite：收尾方案（路线更新）

> 状态：方案（拍板 2026-10-03：收尾。**路线更新**——不再走"55 调用方异步化"，改走已合并的 sql.js WASM 回退，零调用方改动）
> 关联：`openspec/changes/mobile-sqlite-replacement/`（旧方案 + handoff）、`apps/server/src/services/sqlite-driver.ts`（2026-10 已合并的统一驱动入口）、`apps/server/wip-mobile-sqlite/`（旧 WIP 转存）

## 1. 为什么路线要换

| | 旧方案（driver 抽象 + 55 调用方异步化） | 新方案（sql.js WASM 回退） |
|---|---|---|
| 调用方改动 | 55 文件 ~800 处 await 化，**全在桌面/web 代码路径上**（09-14 因此被叫停，违反"不能影响 web/桌面"约束） | **0 处**——`openSqlite()` 已在 db.ts 顶层生效，better-sqlite3 加载失败自动回退 |
| 移动端 ABI 问题 | capacitor-driver（@capacitor-community/sqlite）解决 | sql.js 是纯 WASM，**任何 ABI 都能跑**（内嵌 Node 18 / iOS 禁 native addon 均无碍） |
| 代价 | 巨量重构 + 长期双入口维护 | sql.js 比 native 慢（约 2~5 倍）+ 全量导出落盘（防抖已实现，`flushIfDirty`） |
| sqlite-vec | 同样加载不了（原生扩展） | 同样降级关键词检索（已有既定口径） |

旧方案已完成的部分（driver 抽象、db-mobile.ts、capacitor-driver.ts）**不删**，保留在 `wip-mobile-sqlite/`——将来若 sql.js 性能不达标（大库、高频写），可按旧方案局部启用 capacitor-driver 作为性能通道。

## 2. 收尾清单（全部是"接通"不是"重写"）

| # | 事项 | 文件/动作 | 验收 |
|---|---|---|---|
| 1 | 移动端 DATA_DIR 指向应用沙箱可写目录 | `apps/mobile/src/platform.ts` / `db-mobile-bootstrap`（若需要）：确认 `resolveDataDir()` 在 Android/iOS 返回可写路径，`db.ts` 的 `DB_PATH` 随之正确 | 真机冷启动后 `data.db` 存在于沙箱，重启数据仍在 |
| 2 | sql.js 在内嵌 Node 18 的兼容验证 | 真机冒烟：启动日志打印 `[db] SQLite 驱动: sql.js`，跑一轮聊天 + 会话列表 + 记忆写入 | 全链路无 `NODE_MODULE_VERSION` 报错、无 WASM 缺指令报错（Node 18 支持 wasm 即可，无需 SIMD 特性确认） |
| 3 | 落盘防抖参数化 | `sqlite-driver.ts`：flush 防抖间隔目前固定，移动端暴露为可配（Android 杀进程不给 SIGTERM 的兜底周期 5s 保持不变），Android 上建议 2s | 杀进程后丢失写入 ≤ 防抖窗口 |
| 4 | 首库体积与性能预算 | 写一个真机基准：1000 条消息库的列表查询 / 写入 / flush 耗时；超过预算（列表 > 300ms）则记录为已知限制并回到旧方案的 capacitor-driver 局部启用 | 基准数据进 handoff 文档 |
| 5 | 移动端被屏蔽页面的渐进放开（可选） | `/code` 工作台暂不放开；先放开与 DB 无关的页面（已有）| — |
| 6 | openspec 清账 | `mobile-sqlite-replacement/plan.md` 顶部加"2026-10-03 路线更新：主路线 = sql.js 回退（已合并），异步化方案转存备选"，避免后人捡起 55 调用方方案重走 | 提案状态行与实际一致 |
| 7 | 测试 | code-index.integration 等已在 sql.js 驱动下跑过（本机就是回退环境）；补一条"驱动回退路径"专项测试（模拟 better-sqlite3 加载失败 → 全套 db 断言） | CI 覆盖回退分支 |

## 3. 已知限制（随交付说明，不装作没有）

- sql.js 全量导出落盘：库大（>50MB）时 flush 耗时上升——预算测试（#4）给出实测数字，超限再启用 capacitor-driver。
- sqlite-vec 不可用 → 移动端知识库/记忆为关键词检索（与 Web 端 WASM 环境同口径）。
- 事务语义：sql.js 包装器已实现 `transaction()` 同语义包装，但**嵌套事务**与 native 有差异——db.ts 现有代码无嵌套用法，保持并断言。

## 4. 与另外三个已拍板项的依赖关系

无相互依赖。本项动工最小（估 2~3 天真机联调），唯一外部依赖是**真机**（Android 优先，iOS 禁 native addon 恰好是本方案的主场景）。
