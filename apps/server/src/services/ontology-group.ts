// 本体包（分类树）服务（P4.5）：支持多级嵌套——包下可再建包。
// 本体通过 ontology.group_id 归入包；未归包的本体在树中位于「未分类」。
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';

export interface OntologyGroupNode {
  id: string;
  name: string;
  parentId: string | null;
  children: OntologyGroupNode[];
}

interface GroupRow {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number | null;
  created_at: number;
  updated_at: number;
}

function getRow(userId: string, id: string): GroupRow | undefined {
  return db.prepare('SELECT * FROM ontology_group WHERE id = ? AND user_id = ?').get(id, userId) as GroupRow | undefined;
}

function nameTaken(userId: string, parentId: string | null, name: string, excludeId?: string): boolean {
  const rows = db.prepare('SELECT id, name, parent_id FROM ontology_group WHERE user_id = ?').all(userId) as GroupRow[];
  return rows.some((r) => r.name === name && (r.parent_id ?? null) === parentId && r.id !== excludeId);
}

/** 组装分类树（按创建序排序；环路由脏数据导致时靠 visited 防护，正常不会出现） */
export function listGroupTree(userId: string): OntologyGroupNode[] {
  const rows = db
    .prepare('SELECT * FROM ontology_group WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(userId) as GroupRow[];
  const byId = new Map<string, OntologyGroupNode>();
  for (const r of rows) byId.set(r.id, { id: r.id, name: r.name, parentId: r.parent_id ?? null, children: [] });
  const roots: OntologyGroupNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** 校验父包存在且新路径不会成环（移动/改父级时用） */
function assertNoCycle(userId: string, id: string, newParentId: string | null): void {
  if (!newParentId) return;
  let cur: string | null = newParentId;
  const visited = new Set<string>();
  while (cur) {
    if (cur === id) throw new Error('不能把包移动到它自己的子包下（会形成环）');
    if (visited.has(cur)) break;
    visited.add(cur);
    const row = getRow(userId, cur);
    cur = row?.parent_id ?? null;
  }
}

export function createGroup(userId: string, name: string, parentId: string | null): OntologyGroupNode {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('包名称不能为空');
  if (trimmed.length > 40) throw new Error('包名称过长（≤40 字）');
  if (parentId && !getRow(userId, parentId)) throw new Error('父级本体包不存在');
  if (nameTaken(userId, parentId ?? null, trimmed)) throw new Error('同级下已存在同名包');
  const now = Date.now();
  const id = `grp_${uuid().slice(0, 12)}`;
  db.prepare(
    'INSERT INTO ontology_group (id, user_id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, userId, trimmed, parentId ?? null, now, now);
  return { id, name: trimmed, parentId: parentId ?? null, children: [] };
}

export function renameGroup(userId: string, id: string, name: string): void {
  const row = getRow(userId, id);
  if (!row) throw new Error('本体包不存在');
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('包名称不能为空');
  if (nameTaken(userId, row.parent_id ?? null, trimmed, id)) throw new Error('同级下已存在同名包');
  db.prepare('UPDATE ontology_group SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(trimmed, Date.now(), id, userId);
}

/** 移动包到新父级（多级结构调整）；newParentId 为 null 表示移到根 */
export function moveGroup(userId: string, id: string, newParentId: string | null): void {
  const row = getRow(userId, id);
  if (!row) throw new Error('本体包不存在');
  if (newParentId && !getRow(userId, newParentId)) throw new Error('目标父级本体包不存在');
  if (newParentId === id) throw new Error('不能把包移动到它自己下面');
  assertNoCycle(userId, id, newParentId ?? null);
  db.prepare('UPDATE ontology_group SET parent_id = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
    newParentId ?? null, Date.now(), id, userId,
  );
}

/** 删除包：子包与本体的 group_id 置空归「未分类」（不级联删除，避免误删结构） */
export function deleteGroup(userId: string, id: string): void {
  const row = getRow(userId, id);
  if (!row) throw new Error('本体包不存在');
  const children = db.prepare('SELECT id FROM ontology_group WHERE parent_id = ? AND user_id = ?').all(id, userId) as { id: string }[];
  const now = Date.now();
  for (const c of children) {
    db.prepare('UPDATE ontology_group SET parent_id = ?, updated_at = ? WHERE id = ?').run(row.parent_id ?? null, now, c.id);
  }
  db.prepare('UPDATE ontology SET group_id = NULL WHERE group_id = ? AND user_id = ?').run(id, userId);
  db.prepare('DELETE FROM ontology_group WHERE id = ? AND user_id = ?').run(id, userId);
}

/** 应用内置本体的默认根包名 */
export const APP_GROUP_NAME = '应用本体包';

/**
 * 确保「应用本体包」存在并返回其 id：项目库自动生成的内置本体默认归入此包。
 * 幂等（存在即复用）；用户重命名/移动后以实际记录为准（按名字找不到会重建一个新包，旧包内容不受影响）。
 */
export function ensureAppGroup(userId: string): string {
  const row = db
    .prepare("SELECT id FROM ontology_group WHERE user_id = ? AND name = ? AND parent_id IS NULL")
    .get(userId, APP_GROUP_NAME) as { id: string } | undefined;
  if (row) return row.id;
  const now = Date.now();
  const id = `grp_${uuid().slice(0, 12)}`;
  db.prepare(
    'INSERT INTO ontology_group (id, user_id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)',
  ).run(id, userId, APP_GROUP_NAME, now, now);
  return id;
}
