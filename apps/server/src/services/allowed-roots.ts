// 「本用户允许读写的本地根目录」统一口径（2026-11-02 从 workspace-files.ts 抽出）。
//
// 允许根 = 全局工作目录 ∪ 用户的空间目录 ∪ 用户各会话的产物根/目录（排除回收站会话）。
// 越界一律拒绝 —— 供 workspace/file-stream（只读）与 office（读写）共用，
// 防止两处各写一套后漂移（漏一处就等于开了读任意盘的缺口）。
import { db } from '../db.js';
import { serverState } from '../state.js';
import { isWithinRoot, normalizeForCompare } from './path-guard.js';
import { resolveArtifactDirFor } from './artifact-dir.js';
import { resolveSpaceResourceRoot } from './space-resources.js';

export function allowedRootsForUser(userId: string): string[] {
  const roots: string[] = [];
  const gw = (serverState.workspaceDir || '').trim();
  if (gw) roots.push(gw);
  // 用户的空间目录（绑定的真实目录 + 未绑定的服务端内部空间目录都算）
  try {
    const spaces = db.prepare('SELECT id, dir_path FROM space WHERE user_id = ?').all(userId) as Array<{ id: string; dir_path: string | null }>;
    for (const s of spaces) {
      try { roots.push(resolveSpaceResourceRoot(s)); } catch { /* 忽略单个空间解析失败 */ }
    }
  } catch { /* 表不存在等极端情况 */ }
  // 用户各会话的产物根/目录（会话工作目录派生产物落在这里）
  // ★ 排除回收站：已删会话的产物目录不再作为工作区根暴露。
  //   归档的保留 —— 归档是「收起来」不是「销毁」，产物仍应可在工作区里找到。
  try {
    const convs = db.prepare('SELECT id FROM conversation WHERE user_id = ? AND deleted_at IS NULL').all(userId) as Array<{ id: string }>;
    for (const c of convs) {
      for (const category of ['deliverable', 'intermediate', 'upload'] as const) {
        try {
          const r = resolveArtifactDirFor({ conversationId: c.id, category });
          if (r.root) roots.push(r.root);
          if (r.dir) roots.push(r.dir);
        } catch { /* 单个会话解析失败不阻断 */ }
      }
    }
  } catch { /* 忽略 */ }
  const deduped = new Set(
    roots
      .map((r) => normalizeForCompare(r.replace(/[\\/]+$/, '')))
      .filter(Boolean),
  );
  return [...deduped];
}

/** 路径是否落在本用户允许的根内 */
export function isAllowedPathForUser(userId: string, p: string): boolean {
  return allowedRootsForUser(userId).some((root) => !!root && isWithinRoot(p, root));
}
