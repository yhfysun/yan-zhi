/**
 * 会话生命周期（归档 / 回收站）的**唯一出口**（2026-10-16）
 *
 * 为什么必须抽这一个文件：删除/归档此前散落在 4 处各自手写 SQL
 * （routes/conversations.ts:203/225、routes/clip.ts:134、mcp/api-tool-executor.ts:2934），
 * 且每处清理的派生表都不完全一样 —— 已经有两次「新增了带 conversation_id 的状态，
 * 却没在删除路径上一起收」的孤儿数据事故（message_summary、task_plan_item）。
 * 本项目最贵的判据是「同一语义只能有一处实现」：再往各处补，必然补漏。
 *
 * 语义（对齐业界口径）：
 * - archived_at != NULL：归档。**移出主列表但数据全留**，且会话变为只读
 *   （ChatGPT 明确只读、Anthropic Agent SDK archive 后拒绝新事件）。
 * - deleted_at != NULL：在回收站。列表不可见，可 restore。
 * - 两者都为 NULL：正常会话。
 * - 只有 hardDeleteRow 会真正抹数据，且必须走这里。
 */
import { db, clearMessageSummaries } from '../db.js';
import { clearAuthorization } from './path-guard.js';

/** 列表 scope 取值。非法值一律按 'active' 处理 —— 宁可少显示，不能把已删/已归档漏进主列表 */
export type LifecycleScope = 'active' | 'archived' | 'trashed' | 'all';

export function parseScope(q: unknown): LifecycleScope {
  return q === 'archived' || q === 'trashed' || q === 'all' ? q : 'active';
}

/**
 * 列表 WHERE 片段（必须与 Concrete SQL 拼在同一个 AND 链上）。
 * ★ 'all' 给「管理/统计/归档区」用，**不给主列表用**。
 */
export function lifecycleClause(scope: LifecycleScope): string {
  switch (scope) {
    case 'archived': return 'deleted_at IS NULL AND archived_at IS NOT NULL';
    case 'trashed': return 'deleted_at IS NOT NULL';
    case 'all': return '1=1';
    default: return 'deleted_at IS NULL AND archived_at IS NULL';
  }
}

export function lifecycleOf(row: { archived_at?: number | null; deleted_at?: number | null } | null | undefined): LifecycleScope {
  if (!row) return 'active';
  if (row.deleted_at) return 'trashed';
  if (row.archived_at) return 'archived';
  return 'active';
}

/** ★★★ 唯一的真删出口。任何地方要抹会话都必须调它，不许再手写 DELETE FROM conversation */
export function hardDeleteRow(cid: string): void {
  db.prepare('DELETE FROM message WHERE conversation_id = ?').run(cid);
  // 下面每一项都是「会话的派生物 / 会话级状态」，漏一个就是孤儿数据或脏内存。
  // ★ 新增任何带 conversation_id 的表/内存状态，都要补到这里
  //   （历史上 message_summary、task_plan_item、path-guard 授权都是事后才补的）。
  clearMessageSummaries(cid);
  clearAuthorization(cid);
  db.prepare('DELETE FROM task_plan_item WHERE conversation_id = ?').run(cid);
  // conversation_file 有 FK ON DELETE CASCADE，随之清除
  db.prepare('DELETE FROM conversation WHERE id = ?').run(cid);
}

/** 软删进回收站。返回 false = 会话不存在 / 不在自己的名下 */
export function softDeleteRow(cid: string, userId: string): boolean {
  const r = db.prepare(
    'UPDATE conversation SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
  ).run(Date.now(), cid, userId);
  return r.changes > 0;
}

/** 清空回收站：对每一行走同一个 hardDeleteRow，保证清理口径不会与现实路径漂移 */
export function emptyTrash(userId: string): number {
  const ids = db.prepare('SELECT id FROM conversation WHERE user_id = ? AND deleted_at IS NOT NULL').all(userId) as any[];
  if (!ids.length) return 0;
  const run = () => { for (const c of ids) hardDeleteRow(c.id); };
  db.transaction(run)();
  return ids.length;
}

/**
 * 从回收站恢复。
 * ★ 同时清掉 archived_at（2026-10-16 缺陷 H2 修正）：「恢复」的直觉是回到**可用状态**。
 *   此前只清 deleted_at、保留 archived_at，导致「归档 → 删除 → 恢复」的会话落回归档区，
 *   而前端提示却写「已恢复到主列表」—— 提示与去向不一致，用户会以为会话丢了。
 *   副作用：原本归档的会话恢复后回到主列表。这是接受的取舍（要归档随时可再归档一次）。
 */
export function restoreRow(cid: string, userId: string): boolean {
  const r = db.prepare(
    'UPDATE conversation SET deleted_at = NULL, archived_at = NULL WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL',
  ).run(cid, userId);
  return r.changes > 0;
}

/**
 * 「归档 = 只读」的写守卫（唯一实现，别在各路由散写 archived_at/deleted_at 判断 —— 必然漂移）。
 * 返回 'ok' 才允许继续写；trashed 一律视为不存在（回收站里的东西对外不可见）。
 * 边界（用户拍板 2026-10-16）：归档会话**允许改名**（无害），其余写操作拦掉。
 * 改名是否放行由调用方决定 —— 本守卫只回答「这个会话还活不活着」。
 */
export function writableGuard(cid: string, userId: string): 'ok' | 'not_found' | 'trashed' | 'archived' {
  const row = db.prepare('SELECT archived_at, deleted_at FROM conversation WHERE id = ? AND user_id = ?')
    .get(cid, userId) as { archived_at?: number | null; deleted_at?: number | null } | undefined;
  if (!row) return 'not_found';
  // 不复用 lifecycleOf（它的返回含 'all'，语义也不对：这里问的是「能不能写」）
  if (row.deleted_at) return 'trashed';
  if (row.archived_at) return 'archived';
  return 'ok';
}

/** 把某空间下的全部 active 会话一键归档。返回归档条数（已归档/回收站的不动） */
export function archiveAllInSpace(userId: string, spaceId: string): number {
  const r = db.prepare(
    `UPDATE conversation SET archived_at = ?
     WHERE user_id = ? AND space_id = ? AND deleted_at IS NULL AND archived_at IS NULL`,
  ).run(Date.now(), userId, spaceId);
  return r.changes;
}

/**
 * 归档 / 取消归档。
 * ★ 已删除（回收站内）的会话不允许改归档态：它在回收站里排队等待处理，
 *   改了会让「回收站里到底要不要恢复成主列表还是归档区」出现无法解释的组合。
 */
export function setArchivedRow(cid: string, userId: string, archived: boolean): boolean {
  const r = db.prepare(
    `UPDATE conversation SET archived_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
  ).run(archived ? Date.now() : null, cid, userId);
  return r.changes > 0;
}
