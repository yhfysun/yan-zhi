# 移动端 SQLite 替换（暂停）

## Why

移动端此前用 sql.js/WASM 全量载入与转存，存在性能与数据一致性风险，需要换成原生 SQLite。该变更自 2026-09-14 起暂停：阶段 C 要改 55 个桌面/web 调用方，与「不影响 web/桌面端」的要求冲突。

## What Changes

- 现状：WIP 在 `apps/server/wip-mobile-sqlite/`，恢复清单见 `handoff.md` 顶部。
- 恢复时从阶段 C 继续，先定兜底策略再拆分调用方。
