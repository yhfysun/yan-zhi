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
import {
  buildArtifactRelDir,
  joinArtifactPath,
  type FileCategory,
} from '@yan-zhi/shared';
import { db } from '../db.js';
import { serverState } from '../state.js';

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
 */
export function resolveArtifactRoot(spaceDir?: string | null): string {
  const space = (spaceDir || '').trim();
  if (space) return space;
  const ws = (serverState.workspaceDir || '').trim();
  if (ws) return ws;
  return (process.env.DATA_DIR || '').trim();
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
