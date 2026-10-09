/**
 * 数据库完整性自检 + 自愈（2026-10-09，P3）。
 *
 * ★★★ 为什么必须有（实据诊断）：
 *   生产库出现 `database disk image is malformed` —— 任务/查询到这个错误时被直接打死
 *   （库内实测 6 条消息命中该错误、`llm_task` 里也有 `status=failed error=...malformed`），
 *   且同一库还出现过「（已恢复）129 条消息的会话」这类恢复痕迹。
 *   症状对用户就是「某条会话莫名其妙打不开 / 任务一跑就断」，而**没有任何前置信号**。
 *
 * 处理策略（保守，绝不误伤好库）：
 *   ① 启动时对该库跑 `PRAGMA quick_check`（比 integrity_check 快，能覆盖页结构损坏）；
 *   ② 通过 → 什么都不做（零副作用）；
 *   ③ 不通过 → 把损坏库**改名保底备份**（`data.db.corrupt-<ts>`），让上层以「新库」重启，
 *      避免"带着坏库静默运行、每个请求随机爆 malformed"；
 *   ④ 备份失败（磁盘满/权限）→ 不删不盖，返回 corrupt 且不带 backupPath（调用方决定）。
 *
 * ★ 语义边界：本模块**只做判断与备份**，不做"从备份恢复/重建"这类危险动作 ——
 *   那是运维决策；我们只保证「坏库不被当好好库用」+「原始文件不被覆盖」。
 * ★ 可显式跳过：`YZ_SKIP_DB_CHECK=1`（迁移/诊断场景）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createLogger } from './logger.js';

const logger = createLogger('db-integrity');
const require = createRequire(import.meta.url);

export type DbCheckResult =
  | { status: 'ok' }
  | { status: 'skipped' }
  | { status: 'corrupt'; reason: string; backupPath?: string }
  | { status: 'no-db' };

/** 建库/首次启动尚无 data.db → 无需检查（no-db），不产生噪音 */
export function shouldCheck(dbPath: string): boolean {
  try {
    return fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0;
  } catch {
    return false;
  }
}

/**
 * 检查并（在损坏时）备份隔离。**永不抛错**——启动路径不该因为诊断失败而起不来。
 *
 * @param dbPath     data.db 路径
 * @param opts.probe 注入的探针（测试用）：返回 quick_check 首行文本；抛错视为损坏
 * @param opts.now   时间戳注入（测试用）
 * @param opts.skip  跳过自检（测试/特殊场景；等价于 YZ_SKIP_DB_CHECK=1）
 */
export function checkAndQuarantine(
  dbPath: string,
  opts?: { probe?: (p: string) => string; now?: () => number; skip?: boolean },
): DbCheckResult {
  if (opts?.skip || process.env.YZ_SKIP_DB_CHECK === '1') {
    logger.info('[db-integrity] 自检已跳过（YZ_SKIP_DB_CHECK=1）');
    return { status: 'skipped' };
  }
  if (!shouldCheck(dbPath)) return { status: 'no-db' };

  let verdict = 'ok';
  try {
    verdict = (opts?.probe ? opts.probe(dbPath) : probeQuickCheck(dbPath)).trim().toLowerCase();
  } catch (e: any) {
    // 打不开/探针抛错 —— 同样按损坏处理（能打开却报错的库，带着跑只会更糟）
    verdict = `probe-error: ${e?.message || e}`;
  }
  if (verdict === 'ok') {
    logger.info('[db-integrity] 数据库完整性自检通过');
    return { status: 'ok' };
  }

  // 损坏 → 备份隔离（改名而非删除：原始数据永远保留，便于事后人工抢救）
  const ts = new Date(opts?.now ? opts.now() : Date.now()).toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.corrupt-${ts}`;
  try {
    fs.renameSync(dbPath, backupPath);
    // WAL/SHM 是主库的附属，跟着一起隔离，否则新库会读到旧 WAL 里的坏页
    for (const suffix of ['-wal', '-shm']) {
      const side = `${dbPath}${suffix}`;
      if (fs.existsSync(side)) {
        try { fs.renameSync(side, `${backupPath}${suffix}`); } catch { /* 尽力而为 */ }
      }
    }
    logger.error(`[db-integrity] 数据库完整性自检失败（${verdict}）→ 已隔离为 ${path.basename(backupPath)}，将以空库重启。请人工检查该备份文件。`);
    return { status: 'corrupt', reason: verdict, backupPath };
  } catch (e: any) {
    logger.error(`[db-integrity] 数据库损坏（${verdict}）但隔离失败：${e?.message || e}。为避免覆盖数据，已保留原文件。`);
    return { status: 'corrupt', reason: verdict };
  }
}

/** 真实探针：PRAGMA quick_check，返回首行（ok / 错误串）。用**独立只读连接**，不碰主连接。 */
function probeQuickCheck(dbPath: string): string {
  // better-sqlite3 是同步 API，正好满足顶层同步调用。移动端 WASM 场景下不可用 →
  // 由 catch 兜底为 corrupt（但移动端由 YZ_SKIP_DB_CHECK=1 关闭，不走此路）。
  const mod = require('better-sqlite3');
  const Database = mod?.default ?? mod;
  const conn = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = conn.prepare('PRAGMA quick_check').get() as Record<string, unknown> | undefined;
    const val = row ? Object.values(row)[0] : undefined;
    return String(val ?? 'ok');
  } finally {
    try { conn.close(); } catch { /* 关闭失败不影响结论 */ }
  }
}