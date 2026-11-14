// 笔记业务唯一实现（docs/笔记功能方案-2026-11-14.md §1/§2）。
// 分类唯一索引幂等、删分类迁移、收藏/置顶分离、提醒 drain+ack 幂等 —— 全部规则收口在这一个文件，
// 路由（routes/notes.ts）与智能体工具（notes/tools.ts）都只做编排，禁止各自复算。
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';

export type NoteKind = 'note' | 'plan';

export interface NoteCategoryItem {
  id: string;
  name: string;
  sort: number;
  count: number;
}

export interface NoteItem {
  id: string;
  kind: NoteKind;
  categoryId: string | null;
  categoryName: string | null;
  title: string;
  content: string;
  source: string | null;
  pinned: boolean;
  starred: boolean;
  planAt: number | null;
  remindAt: number | null;
  remindDone: boolean;
  createdAt: number;
  updatedAt: number;
}

interface NoteRowRaw {
  id: string;
  user_id: string;
  kind: string;
  category_id: string | null;
  title: string;
  content: string;
  source: string | null;
  pinned: number;
  starred: number;
  plan_at: number | null;
  remind_at: number | null;
  remind_done: number;
  created_at: number;
  updated_at: number;
  category_name?: string | null;
}

function uid(prefix: string): string {
  return prefix + randomUUID().replace(/-/g, '');
}

function rowToItem(r: NoteRowRaw): NoteItem {
  return {
    id: r.id,
    kind: r.kind === 'plan' ? 'plan' : 'note',
    categoryId: r.category_id,
    categoryName: r.category_name ?? null,
    title: r.title,
    content: r.content,
    source: r.source,
    pinned: Number(r.pinned) === 1,
    starred: Number(r.starred) === 1,
    planAt: r.plan_at,
    remindAt: r.remind_at,
    remindDone: Number(r.remind_done) === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── 分类 ─────────────────────────────────────────────────────────────────────

/** 幂等创建：UNIQUE(user_id, name) 兜底，INSERT OR IGNORE 后查回（并发下不炸） */
export function ensureCategory(userId: string, name: string): NoteCategoryItem {
  const trimmed = String(name || '').trim().slice(0, 40);
  if (!trimmed) throw new Error('分类名不能为空');
  db.prepare('INSERT OR IGNORE INTO note_category (id, user_id, name, sort, created_at) VALUES (?, ?, ?, 0, ?)')
    .run(uid('nc_'), userId, trimmed, Date.now());
  const row = db.prepare('SELECT id, name, sort FROM note_category WHERE user_id = ? AND name = ?').get(userId, trimmed) as { id: string; name: string; sort: number };
  return { id: row.id, name: row.name, sort: row.sort, count: countNotesInCategory(userId, row.id) };
}

function countNotesInCategory(userId: string, categoryId: string): number {
  const r = db.prepare('SELECT COUNT(*) AS c FROM note WHERE user_id = ? AND category_id = ?').get(userId, categoryId) as { c: number };
  return r.c;
}

export function listCategories(userId: string): NoteCategoryItem[] {
  const rows = db.prepare('SELECT id, name, sort FROM note_category WHERE user_id = ? ORDER BY sort ASC, created_at ASC').all(userId) as Array<{ id: string; name: string; sort: number }>;
  const uncategorized = (db.prepare('SELECT COUNT(*) AS c FROM note WHERE user_id = ? AND category_id IS NULL').get(userId) as { c: number }).c;
  return rows.map((r) => ({ ...r, count: countNotesInCategory(userId, r.id) }))
    // 「未分类」是虚拟分类（category_id IS NULL），不在表里 —— 统一追加在末尾，前端直接渲染
    .concat([{ id: '__none__', name: '未分类', sort: Number.MAX_SAFE_INTEGER, count: uncategorized }]);
}

/** 重命名：撞唯一索引（同名分类已存在）时给明确错误，不静默合并 */
export function renameCategory(userId: string, id: string, name: string): NoteCategoryItem {
  const trimmed = String(name || '').trim().slice(0, 40);
  if (!trimmed) throw new Error('分类名不能为空');
  const row = db.prepare('SELECT id FROM note_category WHERE id = ? AND user_id = ?').get(id, userId) as { id: string } | undefined;
  if (!row) throw new Error('分类不存在');
  const dup = db.prepare('SELECT id FROM note_category WHERE user_id = ? AND name = ? AND id != ?').get(userId, trimmed, id) as { id: string } | undefined;
  if (dup) throw new Error(`分类「${trimmed}」已存在`);
  db.prepare('UPDATE note_category SET name = ? WHERE id = ? AND user_id = ?').run(trimmed, id, userId);
  return { id, name: trimmed, sort: 0, count: countNotesInCategory(userId, id) };
}

/** 删除分类：该分类下的笔记自动迁到「未分类」（category_id=NULL），不丢数据 */
export function deleteCategory(userId: string, id: string): void {
  const row = db.prepare('SELECT id FROM note_category WHERE id = ? AND user_id = ?').get(id, userId) as { id: string } | undefined;
  if (!row) throw new Error('分类不存在');
  const tx = db.transaction(() => {
    db.prepare('UPDATE note SET category_id = NULL, updated_at = ? WHERE user_id = ? AND category_id = ?').run(Date.now(), userId, id);
    db.prepare('DELETE FROM note_category WHERE id = ? AND user_id = ?').run(id, userId);
  });
  tx();
}

// ── 笔记 ─────────────────────────────────────────────────────────────────────

export interface NoteListOpts {
  kind?: NoteKind;
  /** 分类过滤：分类 id；'none' = 未分类；'starred' 等价 starred=true（收藏视图） */
  categoryId?: string;
  starred?: boolean;
  q?: string;
  sort?: 'updated' | 'created' | 'plan';
}

const LIST_LIMIT = 500;

export function listNotes(userId: string, opts: NoteListOpts = {}): NoteItem[] {
  const args: unknown[] = [userId];
  let where = 'n.user_id = ?';
  if (opts.kind) { where += ' AND n.kind = ?'; args.push(opts.kind === 'plan' ? 'plan' : 'note'); }
  if (opts.starred || opts.categoryId === 'starred') { where += ' AND n.starred = 1'; }
  if (opts.categoryId && opts.categoryId !== 'starred') {
    if (opts.categoryId === 'none') { where += ' AND n.category_id IS NULL'; }
    else { where += ' AND n.category_id = ?'; args.push(opts.categoryId); }
  }
  if (opts.q && String(opts.q).trim()) {
    where += ' AND (n.title LIKE ? OR n.content LIKE ?)';
    const like = `%${String(opts.q).trim().replace(/[%_]/g, (m) => '\\' + m)}%`;
    args.push(like, like);
  }
  const order = opts.sort === 'created'
    ? 'n.pinned DESC, n.created_at DESC'
    : opts.sort === 'plan'
      ? 'n.pinned DESC, CASE WHEN n.plan_at IS NULL THEN 1 ELSE 0 END ASC, n.plan_at ASC'
      : 'n.pinned DESC, n.updated_at DESC';
  const rows = db.prepare(
    `SELECT n.*, c.name AS category_name FROM note n LEFT JOIN note_category c ON c.id = n.category_id
     WHERE ${where} ORDER BY ${order} LIMIT ${LIST_LIMIT}`,
  ).all(...args) as NoteRowRaw[];
  return rows.map(rowToItem);
}

export interface NoteCreateInput {
  title: string;
  content?: string;
  kind?: NoteKind;
  /** 直传分类名字符串：不存在自动创建（用户拍板的交互语义，§2） */
  categoryName?: string;
  planAt?: number | null;
  remindAt?: number | null;
  source?: string;
}

export function createNote(userId: string, input: NoteCreateInput): NoteItem {
  const title = String(input.title || '').trim();
  if (!title) throw new Error('标题不能为空');
  const kind: NoteKind = input.kind === 'plan' ? 'plan' : 'note';
  let categoryId: string | null = null;
  if (input.categoryName && String(input.categoryName).trim()) {
    categoryId = ensureCategory(userId, String(input.categoryName)).id;
  }
  const nowMs = Date.now();
  const id = uid('nt_');
  db.prepare(
    `INSERT INTO note (id, user_id, kind, category_id, title, content, source, pinned, starred, plan_at, remind_at, remind_done, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, ?, ?)`,
  ).run(id, userId, kind, categoryId, title, String(input.content || ''), input.source || 'manual',
    kind === 'plan' ? (input.planAt ?? null) : null, input.remindAt ?? null, nowMs, nowMs);
  return getNote(userId, id)!;
}

export interface NotePatch {
  title?: string;
  content?: string;
  /** 直接换分类 id（右栏下拉既有分类） */
  categoryId?: string | null;
  /** 直传分类名（工具链路）：不存在自动创建；传空串 = 移到未分类 */
  categoryName?: string;
  starred?: boolean;
  pinned?: boolean;
  planAt?: number | null;
  remindAt?: number | null;
}

export function updateNote(userId: string, id: string, patch: NotePatch): NoteItem {
  const row = db.prepare('SELECT id FROM note WHERE id = ? AND user_id = ?').get(id, userId) as { id: string } | undefined;
  if (!row) throw new Error('笔记不存在');
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.title !== undefined) {
    const t = String(patch.title).trim();
    if (!t) throw new Error('标题不能为空');
    sets.push('title = ?'); args.push(t);
  }
  if (patch.content !== undefined) { sets.push('content = ?'); args.push(String(patch.content)); }
  if (patch.categoryId !== undefined) {
    if (patch.categoryId === null || patch.categoryId === '' || patch.categoryId === '__none__') {
      sets.push('category_id = NULL');
    } else {
      const cat = db.prepare('SELECT id FROM note_category WHERE id = ? AND user_id = ?').get(patch.categoryId, userId) as { id: string } | undefined;
      if (!cat) throw new Error('分类不存在');
      sets.push('category_id = ?'); args.push(cat.id);
    }
  }
  if (patch.categoryName !== undefined) {
    if (String(patch.categoryName).trim()) { sets.push('category_id = ?'); args.push(ensureCategory(userId, String(patch.categoryName)).id); }
    else { sets.push('category_id = NULL'); }
  }
  if (patch.starred !== undefined) { sets.push('starred = ?'); args.push(patch.starred ? 1 : 0); }
  if (patch.pinned !== undefined) { sets.push('pinned = ?'); args.push(patch.pinned ? 1 : 0); }
  if (patch.planAt !== undefined) { sets.push('plan_at = ?'); args.push(patch.planAt === null ? null : Number(patch.planAt) || null); }
  if (patch.remindAt !== undefined) { sets.push('remind_at = ?'); args.push(patch.remindAt === null ? null : Number(patch.remindAt) || null); }
  if (sets.length === 0) return getNote(userId, id)!;
  sets.push('updated_at = ?'); args.push(Date.now());
  args.push(id, userId);
  db.prepare(`UPDATE note SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...args);
  return getNote(userId, id)!;
}

/** 收藏切换（重要维度）：返回切换后的状态 */
export function toggleStar(userId: string, id: string): boolean {
  const row = db.prepare('SELECT starred FROM note WHERE id = ? AND user_id = ?').get(id, userId) as { starred: number } | undefined;
  if (!row) throw new Error('笔记不存在');
  const next = Number(row.starred) === 1 ? 0 : 1;
  db.prepare('UPDATE note SET starred = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(next, Date.now(), id, userId);
  return next === 1;
}

/** 置顶切换（常用维度） */
export function togglePin(userId: string, id: string): boolean {
  const row = db.prepare('SELECT pinned FROM note WHERE id = ? AND user_id = ?').get(id, userId) as { pinned: number } | undefined;
  if (!row) throw new Error('笔记不存在');
  const next = Number(row.pinned) === 1 ? 0 : 1;
  db.prepare('UPDATE note SET pinned = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(next, Date.now(), id, userId);
  return next === 1;
}

export function deleteNote(userId: string, id: string): void {
  const r = db.prepare('DELETE FROM note WHERE id = ? AND user_id = ?').run(id, userId);
  if (r.changes === 0) throw new Error('笔记不存在');
}

export function getNote(userId: string, id: string): NoteItem | null {
  const row = db.prepare(
    'SELECT n.*, c.name AS category_name FROM note n LEFT JOIN note_category c ON c.id = n.category_id WHERE n.id = ? AND n.user_id = ?',
  ).get(id, userId) as NoteRowRaw | undefined;
  return row ? rowToItem(row) : null;
}

// ── 到期提醒（drain 范式，照 plugin reminders 先例）─────────────────────────────

export interface ReminderItem {
  id: string;
  userId: string;
  title: string;
  /** 提醒正文（给宠物气泡/系统通知的单行文本） */
  text: string;
  remindAt: number;
  planAt: number | null;
}

function toReminderText(n: NoteItem): string {
  const time = n.remindAt ? new Date(n.remindAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const cat = n.categoryName ? `【${n.categoryName}】` : '';
  return `${cat}${n.title}${time ? `（${time}）` : ''}`;
}

/** 取回到期提醒（只读，不标记 —— Web 端红点用） */
export function dueReminders(nowMs = Date.now()): ReminderItem[] {
  const rows = db.prepare(
    `SELECT n.*, c.name AS category_name FROM note n LEFT JOIN note_category c ON c.id = n.category_id
     WHERE n.remind_at IS NOT NULL AND n.remind_at <= ? AND n.remind_done = 0
     ORDER BY n.remind_at ASC LIMIT 20`,
  ).all(nowMs) as NoteRowRaw[];
  return rows.map(rowToReminder);
}

/**
 * drain：取走即标记（单事务），天然幂等 —— 桌面 15s 轮询消费，绝不重复提醒。
 * ★ 与 dueReminders 的分工：drain 是「消费」，due 是「查询」；两次 drain 第二次必为空。
 */
export function drainReminders(nowMs = Date.now()): ReminderItem[] {
  const take = db.transaction((): ReminderItem[] => {
    const rows = db.prepare(
      `SELECT n.*, c.name AS category_name FROM note n LEFT JOIN note_category c ON c.id = n.category_id
       WHERE n.remind_at IS NOT NULL AND n.remind_at <= ? AND n.remind_done = 0
       ORDER BY n.remind_at ASC LIMIT 20`,
    ).all(nowMs) as NoteRowRaw[];
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    db.prepare(`UPDATE note SET remind_done = 1, updated_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`).run(Date.now(), ...ids);
    return rows.map(rowToReminder);
  });
  return take();
}

function rowToReminder(r: NoteRowRaw): ReminderItem {
  const item = rowToItem(r);
  return {
    id: item.id,
    userId: r.user_id,
    title: item.title,
    text: toReminderText(item),
    remindAt: item.remindAt!,
    planAt: item.planAt,
  };
}

/** ack：Web 端先查 due、处理后显式确认（与 drain 二选一使用，两端并存互不干扰） */
export function ackReminders(ids: string[]): number {
  if (!ids.length) return 0;
  const r = db.prepare(`UPDATE note SET remind_done = 1, updated_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`).run(Date.now(), ...ids);
  return r.changes;
}
