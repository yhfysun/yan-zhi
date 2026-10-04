// 产物目录解析 —— 单一出口，媒体落盘 / 会话文件接口 / 提示词注入共用。
//
// 目录规范见 @yan-zhi/shared 的 artifact-paths：
//   <根>/.yan-zhi/tasks/<conversationId>/{uploads,intermediate,deliverables}   ← 主规则（2026-09-15 起）
//   <根>/.yan-zhi/tasks/<YYYY-MM-DD>-<任务名>/{...}                            ← 历史目录，仅读取回退
//
// 任务目录以会话 id 为键：id 唯一且不可变，会话改名 / 同日同标题不再影响产物定位。
// 根的优先级：会话所属空间的 dirPath > 全局工作目录 > DATA_DIR（数据根）。
// 用 .yan-zhi 隐藏目录，工作目录是 git 仓库时不会把产物混进版本控制。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildArtifactRelDir,
  joinArtifactPath,
  type FileCategory,
} from '@yan-zhi/shared';
import * as dbModule from '../db.js';
import { serverState } from '../state.js';
import { createLogger } from './logger.js';
const logger = createLogger('artifact-dir');

const { db } = dbModule;

/** 本模块所在目录（ESM 下 __dirname 不存在，与 db.ts 同一套写法） */
const hereDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * 数据根（绝对路径）。
 *
 * 惰性 + 兜底读取，而不是 `import { dataDir }` 静态解构：
 *  - db.ts 的 dataDir = DATA_DIR || <db.ts 所在目录>/..，恒为绝对路径，是本模块的最终兜底根；
 *  - 但不少单测 `vi.mock('../src/db.js')` 只提供 db/hasSqliteVec，静态解构会拿到 undefined，
 *    于是 path.join(undefined, ...) 抛错，连带把不相关测试（react-loop / memory-inject）弄挂 ——
 *    这种「mock 少给一个字段就崩」的脆弱性不该留在生产代码里。
 * 逐级兜底，任何情况下都返回绝对路径。
 */
function resolveDataDir(): string {
  // 注意：vitest 的 vi.mock('db.js') 会对**未声明**的导出直接抛错（不只是返回 undefined），
  // 「No "dataDir" export is defined on the mock」——所以动态读取也必须包 try/catch，
  // 否则单测里 mock 少给一个字段就会把不相关的链路（react-loop / memory-inject）连带弄挂。
  try {
    const fromDb = (dbModule as { dataDir?: string }).dataDir;
    if (typeof fromDb === 'string' && fromDb.trim()) return fromDb.trim();
  } catch { /* mock 未提供该导出：走下面的兜底 */ }
  const fromEnv = (process.env.DATA_DIR || '').trim();
  if (fromEnv) return fromEnv;
  // 最后的兜底：src/services → 上溯两级到 apps/server（与 db.ts 的 __dirname/.. 同口径）
  return path.resolve(hereDir, '..', '..');
}

export interface ArtifactDirResult {
  /** 可直接落盘的目录（绝对路径；根缺失时为相对数据根的相对路径） */
  dir: string;
  /** 相对数据根的同一目录，供只认相对路径的实现（浏览器 OPFS）使用 */
  relDir: string;
  /** 判定出的根 */
  root: string;
  /** 会话标题（供接口展示；自 2026-09-15 起不再参与目录命名） */
  title: string;
}

/** 会话产物归属信息：标题 + 创建时间 + 空间目录 */
function conversationArtifactMeta(conversationId: string): {
  title: string;
  createdAt: number;
  spaceDir: string;
} | null {
  if (!conversationId) return null;
  try {
    const row = db
      .prepare(
        `SELECT c.title AS title, c.created_at AS created_at, s.dir_path AS space_dir
         FROM conversation c
         LEFT JOIN space s ON s.id = c.space_id
         WHERE c.id = ?`,
      )
      .get(conversationId) as { title?: string; created_at?: number; space_dir?: string } | undefined;
    if (!row) return null;
    return {
      title: row.title || '',
      createdAt: Number(row.created_at) || Date.now(),
      spaceDir: row.space_dir || '',
    };
  } catch {
    return null;
  }
}

/**
 * 解析产物根目录。
 * 空间目录（用户显式绑定）> 全局工作目录 > 数据根。
 *
 * 数据根必须复用 db.ts 的 dataDir（绝对路径），不能退化成空串：
 * 三级都空时（dev 模式不设 DATA_DIR、会话未绑空间、未选工作目录）返回空串会让
 * joinArtifactPath 产出**相对路径**，落盘位置随服务端进程 cwd 漂移，且登记进
 * conversation_file 的 path 也是相对的 —— 渲染层按自己的 cwd 去读必 ENOENT
 * （曾表现为「图片落盘成功但预览窗/另存为报 readFileBase64 不存在」）。
 */
export function resolveArtifactRoot(spaceDir?: string | null): string {
  const space = (spaceDir || '').trim();
  if (space) return space;
  const ws = (serverState.workspaceDir || '').trim();
  if (ws) return ws;
  return resolveDataDir();
}

/** 基础解析：不做磁盘探测，直接按主规则给目录 */
function resolveArtifactDirBase(opts: {
  conversationId?: string;
  category: FileCategory;
}): ArtifactDirResult & { createdAt: number } {
  const meta = opts.conversationId ? conversationArtifactMeta(opts.conversationId) : null;
  const title = meta?.title || '';
  const createdAt = meta?.createdAt || Date.now();
  const root = resolveArtifactRoot(meta?.spaceDir);
  const rel = buildArtifactRelDir({ conversationId: opts.conversationId, title, createdAt, category: opts.category });
  return { dir: joinArtifactPath(root, rel), relDir: rel, root, title, createdAt };
}

/**
 * 解析某个会话某分类的产物目录（不创建目录）。
 *
 * 主规则：会话产物一律落在 .yan-zhi/tasks/<conversationId>/<category>/。
 * 历史兼容（只读）：若会话 id 目录尚未创建、而旧命名（<日期>-<标题>）目录真实存在，
 * 则返回旧目录，保证改名前落盘的历史文件继续可读；id 目录一旦有内容即以 id 目录为准。
 * conversationId 缺失或会话不存在时退回「按当天日期 + 未命名任务」的目录，
 * 保证任何情况下产物都有归档位置，不会散落在根上。
 */
export function resolveArtifactDirFor(opts: {
  conversationId?: string;
  category: FileCategory;
}): ArtifactDirResult {
  const base = resolveArtifactDirBase(opts);
  if (!opts.conversationId) return base;

  const legacyRel = buildArtifactRelDir({ title: base.title, createdAt: base.createdAt, category: opts.category });
  try {
    const idDirExists = fs.existsSync(base.dir);
    const legacyDirExists = fs.existsSync(joinArtifactPath(base.root, legacyRel));
    // 只读回退：id 目录还没建、旧目录真实有货时，先读旧目录
    if (!idDirExists && legacyDirExists) {
      base.dir = joinArtifactPath(base.root, legacyRel);
      base.relDir = legacyRel;
    }
  } catch {
    /* 探测失败按主规则走 */
  }
  return base;
}

/**
 * 确保目录存在（mkdir -p）。落盘前调用。
 * 写入口径：永远落会话 id 主规则目录，不做历史回退（回退只用于读取）。
 * 目录创建失败不抛错——调用方按需降级（例如仅有远端 URL 可用）。
 */
export function ensureArtifactDirFor(opts: {
  conversationId?: string;
  category: FileCategory;
}): ArtifactDirResult {
  const result = resolveArtifactDirBase(opts);
  try {
    fs.mkdirSync(result.dir, { recursive: true });
  } catch {
    /* 目录创建失败由调用方兜底 */
  }
  return result;
}

/**
 * 静态媒体路由专用：按候选顺序探测真实存在的文件，命中即返回绝对路径，全 miss 返回 null。
 * 候选由 shared 的 buildArtifactRelDirCandidates 生成（会话 id 目录优先，旧「日期-标题」目录回退）。
 */
export function findArtifactFileInDirs(
  relDirs: string[],
  root: string,
  fileName: string,
): string | null {
  for (const rel of relDirs) {
    const file = path.join(joinArtifactPath(root, rel), fileName);
    try {
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
    } catch {
      /* 试下一个候选 */
    }
  }
  return null;
}

/**
 * 方案 A（救回已有文件，见 issues/产物根目录漂移导致媒体404-20260919.md）：
 * 跨根探测 —— 在**其它候选根**下按同样的规范相对目录找同名文件。
 *
 * ★ 为什么必须要有：产物根是「读取时重新计算」的，而历史文件落盘时用的是**当时**的根。
 *   工作目录一变，按当前根解析就必然 miss（实测一份库里出现 3 个根）。
 *   本函数把「所有可能用过的根」都试一遍，历史产物零搬运即可恢复可读。
 *
 * ★ 为什么这几个候选：与 resolveArtifactRoot 的三级回落同源，外加
 *   `apps/server`（dev 模式不设 DATA_DIR 且服务端 cwd 在 apps/server 时的兜底根）。
 */
export function findArtifactFileAcrossRoots(relDirs: string[], fileName: string): string | null {
  const seen = new Set<string>();
  const candidates: string[] = [];
  const push = (r?: string | null) => {
    const v = (r || '').trim();
    if (!v) return;
    const key = path.resolve(v).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(v);
  };
  push(serverState.workspaceDir);
  push(resolveDataDir());
  // dev 模式常见的第二个根：服务端自身目录（<repo>/apps/server）
  push(path.resolve(hereDir, '..', '..'));
  // 仓库根（dev 模式 <repo>/apps/server/.yan-zhi 与 <repo>/.yan-zhi 都出现过）
  push(path.resolve(hereDir, '..', '..', '..'));

  for (const root of candidates) {
    const hit = findArtifactFileInDirs(relDirs, root, fileName);
    if (hit) return hit;
  }
  return null;
}

/**
 * 方案 B（治本，见同一 issue）：**信任登记路径**。
 *
 * conversation_file.path 是**落盘时写下的权威位置**；产物根漂移是"读取时重算"造成的，
 * 因此读取侧应优先按登记路径解析，而不是重算根。
 *
 * @param conversationId 会话 id
 * @param fileName        文件名（用于在会话内定位对应记录）
 * @returns 真实存在的绝对路径；登记的是相对路径时会按各候选根补齐后探测
 *
 * ★ 相对路径的历史记录：按 DATA_DIR / apps/server / 仓库根 / 当前 cwd 依次补齐再探测
 *   （历史数据里有 1 条相对路径，若不补齐永远读不到）。
 */
export function resolveRegisteredFilePath(
  conversationId: string,
  fileName: string,
): string | null {
  if (!conversationId || !fileName) return null;
  let row: { path?: string } | undefined;
  try {
    row = db
      .prepare('SELECT path FROM conversation_file WHERE conversation_id = ? AND name = ? ORDER BY created_at DESC LIMIT 1')
      .get(conversationId, fileName) as { path?: string } | undefined;
  } catch {
    return null;
  }
  const raw = (row?.path || '').trim();
  if (!raw) return null;

  const isAbs = path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw);
  const candidates: string[] = [];
  if (isAbs) {
    candidates.push(raw);
  } else {
    // 相对路径：按各候选根补齐（禁止按 cwd 直接拼 —— 那正是漂移的源头）
    const roots: string[] = [];
    const pushRoot = (r?: string | null) => { const v = (r || '').trim(); if (v) roots.push(v); };
    pushRoot(serverState.workspaceDir);
    pushRoot(resolveDataDir());
    pushRoot(path.resolve(hereDir, '..', '..'));
    pushRoot(path.resolve(hereDir, '..', '..', '..'));
    pushRoot(process.cwd());
    for (const r of roots) candidates.push(path.resolve(r, raw));
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch {
      /* 试下一个 */
    }
  }
  return null;
}

/**
 * 一次性回填：把 conversation_file 里的**相对路径**补成绝对路径。
 *
 * ★ 为什么需要：历史数据里存在相对路径登记（实测 1 条），
 *   它随进程 cwd 漂移，任何按根的解析都读不到。回填成绝对路径后即固化。
 *   幂等：已是绝对路径的记录跳过。
 *
 * @returns { scanned, fixed, unresolved } —— 扫描数 / 修正数 / 补齐后仍不存在文件数
 */
export function backfillRelativeArtifactPaths(): { scanned: number; fixed: number; unresolved: number } {
  let scanned = 0, fixed = 0, unresolved = 0;
  try {
    const rows = db
      .prepare("SELECT id, path FROM conversation_file WHERE path IS NOT NULL AND path != ''")
      .all() as Array<{ id: string; path: string }>;
    for (const r of rows) {
      const p = String(r.path || '').trim();
      if (!p) continue;
      scanned++;
      if (path.isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p)) continue;   // 已固化，跳过
      // 按候选根补齐到真实存在的那个
      const roots: string[] = [];
      const pushRoot = (x?: string | null) => { const v = (x || '').trim(); if (v) roots.push(v); };
      pushRoot(serverState.workspaceDir);
      pushRoot(resolveDataDir());
      pushRoot(path.resolve(hereDir, '..', '..'));
      pushRoot(path.resolve(hereDir, '..', '..', '..'));
      pushRoot(process.cwd());
      let hit: string | null = null;
      for (const root of roots) {
        const abs = path.resolve(root, p);
        try { if (fs.existsSync(abs)) { hit = abs; break; } } catch { /* next */ }
      }
      if (hit) {
        try {
          db.prepare('UPDATE conversation_file SET path = ? WHERE id = ?').run(hit, r.id);
          fixed++;
        } catch { /* 单条失败不影响其它 */ }
      } else {
        unresolved++;
      }
    }
  } catch (e: unknown) {
    logger.warn('[artifact-dir] 相对路径回填失败:', e instanceof Error ? e.message : e);
  }
  return { scanned, fixed, unresolved };
}
