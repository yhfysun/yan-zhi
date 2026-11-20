// 笔记业务唯一实现（docs/笔记功能方案-2026-11-14.md §1/§2）。
// 分类唯一索引幂等、删分类迁移、收藏/置顶分离、提醒 drain+ack 幂等 —— 全部规则收口在这一个文件，
// 路由（routes/notes.ts）与智能体工具（notes/tools.ts）都只做编排，禁止各自复算。
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import {
  NOTE_BUILTIN_DICTIONARIES,
  NOTE_BUILTIN_TEMPLATES,
  type NoteDictionaryDefinition,
  type NoteDictionaryItem,
  type NoteFieldType,
  type NoteTemplateData,
  type NoteTemplateDefinition,
  type NoteTemplateField,
  type NoteTemplateKind,
} from '@yan-zhi/shared';

export type NoteKind = 'note' | 'plan';

export interface NoteCategoryItem {
  id: string;
  name: string;
  parentId: string | null;
  path: string[];
  depth: number;
  sort: number;
  count: number;
}

export interface NoteItem {
  id: string;
  kind: NoteKind;
  categoryId: string | null;
  categoryName: string | null;
  templateId: string | null;
  templateSnapshot: NoteTemplateDefinition | null;
  title: string;
  content: string;
  data: NoteTemplateData;
  source: string | null;
  pinned: boolean;
  starred: boolean;
  occurredAt: number | null;
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
  template_id: string | null;
  title: string;
  content: string;
  data_json: string | null;
  template_snapshot_json: string | null;
  source: string | null;
  pinned: number;
  starred: number;
  plan_at: number | null;
  remind_at: number | null;
  remind_done: number;
  occurred_at: number | null;
  created_at: number;
  updated_at: number;
  category_name?: string | null;
}

function uid(prefix: string): string {
  return prefix + randomUUID().replace(/-/g, '');
}

function rowToItem(r: NoteRowRaw): NoteItem {
  const templateSnapshot = parseJson<NoteTemplateDefinition | null>(r.template_snapshot_json, null);
  return {
    id: r.id,
    kind: r.kind === 'plan' ? 'plan' : 'note',
    categoryId: r.category_id,
    categoryName: r.category_name ?? null,
    templateId: r.template_id ?? null,
    templateSnapshot,
    title: r.title,
    content: r.content,
    data: parseJson<NoteTemplateData>(r.data_json, {}),
    source: r.source,
    pinned: Number(r.pinned) === 1,
    starred: Number(r.starred) === 1,
    occurredAt: r.occurred_at ?? null,
    planAt: r.plan_at,
    remindAt: r.remind_at,
    remindDone: Number(r.remind_done) === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

// ── 分类 ─────────────────────────────────────────────────────────────────────

/** 幂等创建：UNIQUE(user_id, name) 兜底，INSERT OR IGNORE 后查回（并发下不炸） */
export function ensureCategory(userId: string, name: string, parentId: string | null = null): NoteCategoryItem {
  const trimmed = String(name || '').trim().slice(0, 40);
  if (!trimmed) throw new Error('分类名不能为空');
  if (parentId) assertCategoryParent(userId, parentId);
  db.prepare('INSERT OR IGNORE INTO note_category (id, user_id, name, parent_id, sort, created_at) VALUES (?, ?, ?, ?, 0, ?)')
    .run(uid('nc_'), userId, trimmed, parentId || null, Date.now());
  const row = db.prepare('SELECT id, name, parent_id, sort FROM note_category WHERE user_id = ? AND name = ?')
    .get(userId, trimmed) as { id: string; name: string; parent_id: string | null; sort: number };
  return categoryItemFromRow(userId, row);
}

function countNotesInCategory(userId: string, categoryId: string): number {
  const ids = categoryAndDescendants(userId, categoryId);
  if (!ids.length) return 0;
  const r = db.prepare(
    `SELECT COUNT(*) AS c FROM note WHERE user_id = ? AND category_id IN (${ids.map(() => '?').join(',')})`,
  ).get(userId, ...ids) as { c: number };
  return r.c;
}

export function listCategories(userId: string): NoteCategoryItem[] {
  const rows = db.prepare('SELECT id, name, parent_id, sort FROM note_category WHERE user_id = ? ORDER BY sort ASC, created_at ASC').all(userId) as Array<{ id: string; name: string; parent_id: string | null; sort: number }>;
  const uncategorized = (db.prepare('SELECT COUNT(*) AS c FROM note WHERE user_id = ? AND category_id IS NULL').get(userId) as { c: number }).c;
  return rows.map((r) => categoryItemFromRow(userId, r))
    // 「未分类」是虚拟分类（category_id IS NULL），不在表里 —— 统一追加在末尾，前端直接渲染
    .concat([{
      id: '__none__',
      name: '未分类',
      parentId: null,
      path: ['未分类'],
      depth: 0,
      sort: Number.MAX_SAFE_INTEGER,
      count: uncategorized,
    }]);
}

function categoryItemFromRow(
  userId: string,
  row: { id: string; name: string; parent_id: string | null; sort: number },
): NoteCategoryItem {
  const path = categoryPath(userId, row.id);
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    path,
    depth: Math.max(0, path.length - 1),
    sort: row.sort,
    count: countNotesInCategory(userId, row.id),
  };
}

function categoryPath(userId: string, categoryId: string): string[] {
  const path: string[] = [];
  let current: string | null = categoryId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const row = db.prepare('SELECT id, name, parent_id FROM note_category WHERE id = ? AND user_id = ?')
      .get(current, userId) as { id: string; name: string; parent_id: string | null } | undefined;
    if (!row) break;
    path.unshift(row.name);
    current = row.parent_id;
  }
  return path;
}

function assertCategoryParent(userId: string, parentId: string): void {
  const row = db.prepare('SELECT id FROM note_category WHERE id = ? AND user_id = ?').get(parentId, userId);
  if (!row) throw new Error('父目录不存在');
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
  const updatedRow = db.prepare('SELECT id, name, parent_id, sort FROM note_category WHERE id = ? AND user_id = ?')
    .get(id, userId) as { id: string; name: string; parent_id: string | null; sort: number };
  return categoryItemFromRow(userId, updatedRow);
}

/** 删除分类：该分类下的笔记自动迁到「未分类」（category_id=NULL），不丢数据 */
export function deleteCategory(userId: string, id: string): void {
  const row = db.prepare('SELECT id, parent_id FROM note_category WHERE id = ? AND user_id = ?')
    .get(id, userId) as { id: string; parent_id: string | null } | undefined;
  if (!row) throw new Error('分类不存在');
  const tx = db.transaction(() => {
    db.prepare('UPDATE note SET category_id = NULL, updated_at = ? WHERE user_id = ? AND category_id = ?').run(Date.now(), userId, id);
    db.prepare('UPDATE note_category SET parent_id = ? WHERE user_id = ? AND parent_id = ?').run(row.parent_id, userId, id);
    db.prepare('DELETE FROM note_category WHERE id = ? AND user_id = ?').run(id, userId);
  });
  tx();
}

/** 移动目录到新父级；拒绝把自己或后代设为父级。 */
export function moveCategory(userId: string, id: string, parentId: string | null): NoteCategoryItem {
  const row = db.prepare('SELECT id, name, parent_id, sort FROM note_category WHERE id = ? AND user_id = ?')
    .get(id, userId) as { id: string; name: string; parent_id: string | null; sort: number } | undefined;
  if (!row) throw new Error('分类不存在');
  if (parentId) {
    assertCategoryParent(userId, parentId);
    let current: string | null = parentId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      if (current === id) throw new Error('不能把目录移动到自身或子目录，会形成循环');
      seen.add(current);
      const parent = db.prepare('SELECT parent_id FROM note_category WHERE id = ? AND user_id = ?')
        .get(current, userId) as { parent_id: string | null } | undefined;
      current = parent?.parent_id || null;
    }
  }
  db.prepare('UPDATE note_category SET parent_id = ? WHERE id = ? AND user_id = ?')
    .run(parentId || null, id, userId);
  return categoryItemFromRow(userId, { ...row, parent_id: parentId || null });
}

function categoryAndDescendants(userId: string, categoryId: string): string[] {
  const rows = db.prepare(
    `WITH RECURSIVE tree(id) AS (
       SELECT id FROM note_category WHERE id = ? AND user_id = ?
       UNION ALL
       SELECT child.id FROM note_category child JOIN tree parent ON child.parent_id = parent.id
        WHERE child.user_id = ?
     ) SELECT id FROM tree`,
  ).all(categoryId, userId, userId) as Array<{ id: string }>;
  return rows.map((row) => row.id);
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
    else {
      const ids = categoryAndDescendants(userId, opts.categoryId);
      if (!ids.length) return [];
      where += ` AND n.category_id IN (${ids.map(() => '?').join(',')})`;
      args.push(...ids);
    }
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
  categoryId?: string;
  templateId?: string;
  data?: NoteTemplateData;
  occurredAt?: number | null;
  /** 直传分类名字符串：不存在自动创建（用户拍板的交互语义，§2） */
  categoryName?: string;
  planAt?: number | null;
  remindAt?: number | null;
  source?: string;
}

export function createNote(userId: string, input: NoteCreateInput): NoteItem {
  const template = input.templateId
    ? listNoteTemplates(userId).find((item) => item.id === input.templateId)
    : undefined;
  if (input.templateId && !template) throw new Error('记录模板不存在');
  const data = normalizeTemplateData(input.data);
  const title = String(
    input.title
      || data[template?.titleField || 'title']
      || template?.name
      || '',
  ).trim();
  if (!title) throw new Error('标题不能为空');
  const kind: NoteKind = input.kind === 'plan' || template?.kind === 'task' ? 'plan' : 'note';
  const content = String(
    input.content
      ?? (template?.contentField ? data[template.contentField] : '')
      ?? '',
  );
  let categoryId: string | null = null;
  if (input.categoryId) {
    const category = db.prepare('SELECT id FROM note_category WHERE id = ? AND user_id = ?')
      .get(input.categoryId, userId);
    if (!category) throw new Error('目录不存在');
    categoryId = input.categoryId;
  } else if (input.categoryName && String(input.categoryName).trim()) {
    categoryId = ensureCategory(userId, String(input.categoryName)).id;
  }
  const nowMs = Date.now();
  const id = uid('nt_');
  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO note (
         id, user_id, kind, category_id, template_id, title, content, data_json,
         template_snapshot_json, source, pinned, starred, occurred_at, plan_at,
         remind_at, remind_done, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 0, ?, ?)`,
    ).run(
      id, userId, kind, categoryId, template?.id ?? null, title, content, json(data),
      template ? json(template) : null, input.source || 'manual',
      input.occurredAt ?? dataTime(data.occurredAt), kind === 'plan' ? (input.planAt ?? dataTime(data.planAt)) : null,
      input.remindAt ?? null, nowMs, nowMs,
    );
    syncNoteDomainProjections(userId, id);
  });
  insert();
  return getNote(userId, id)!;
}

function normalizeTemplateData(input: NoteTemplateData | undefined): NoteTemplateData {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => (
      value === null
      || typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
      || (Array.isArray(value) && value.every((item) => typeof item === 'string'))
    )),
  ) as NoteTemplateData;
}

function dataTime(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

export interface NotePatch {
  title?: string;
  content?: string;
  templateId?: string | null;
  data?: NoteTemplateData;
  occurredAt?: number | null;
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
  if (patch.templateId !== undefined) {
    if (patch.templateId === null || patch.templateId === '') {
      sets.push('template_id = NULL');
      sets.push('template_snapshot_json = NULL');
    } else {
      const template = listNoteTemplates(userId).find((item) => item.id === patch.templateId);
      if (!template) throw new Error('记录模板不存在');
      sets.push('template_id = ?'); args.push(template.id);
      sets.push('template_snapshot_json = ?'); args.push(json(template));
    }
  }
  if (patch.data !== undefined) { sets.push('data_json = ?'); args.push(json(normalizeTemplateData(patch.data))); }
  if (patch.occurredAt !== undefined) {
    sets.push('occurred_at = ?');
    args.push(patch.occurredAt === null ? null : Number(patch.occurredAt) || null);
  }
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
  const update = db.transaction(() => {
    db.prepare(`UPDATE note SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...args);
    syncNoteDomainProjections(userId, id);
  });
  update();
  return getNote(userId, id)!;
}

function clearNoteDomainProjections(noteId: string): void {
  db.prepare('DELETE FROM note_ledger_entry WHERE note_id = ?').run(noteId);
  db.prepare('DELETE FROM note_inventory_movement WHERE note_id = ?').run(noteId);
  db.prepare('DELETE FROM note_time_log WHERE note_id = ?').run(noteId);
  db.prepare('DELETE FROM note_task_plan WHERE note_id = ?').run(noteId);
}

function cents(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function textValue(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function templateOfItem(
  note: NoteItem,
  templates: readonly NoteTemplateDefinition[],
): NoteTemplateDefinition | undefined {
  return note.templateSnapshot || templates.find((item) => item.id === note.templateId);
}

function syncNoteDomainProjections(userId: string, noteId: string): void {
  const note = getNote(userId, noteId);
  if (!note) return;
  clearNoteDomainProjections(noteId);
  const template = templateOfItem(note, listNoteTemplates(userId));
  if (!template) return;
  const nowMs = Date.now();
  const occurredAt = note.occurredAt || note.createdAt;
  const data = note.data;
  const categoryField = template.fields.find((field) => field.key === 'category');
  const categoryDictionaryId = categoryField?.dictionaryId || null;

  if (template.kind === 'expense' || template.kind === 'income') {
    db.prepare(
      `INSERT INTO note_ledger_entry (
         id, note_id, user_id, entry_type, amount_cents, category_key,
         category_dictionary_id,
         account_key, occurred_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      uid('nled_'), note.id, userId, template.kind, cents(data.amount),
      textValue(data.category) || null, categoryDictionaryId, textValue(data.account) || null,
      occurredAt, nowMs,
    );
  } else if (template.kind === 'purchase' || template.kind === 'sale') {
    const quantity = numberValue(data.quantity);
    const unitPrice = numberValue(data.unitPrice);
    const total = numberValue(data.total) || Math.round(quantity * unitPrice * 100) / 100;
    db.prepare(
      `INSERT INTO note_ledger_entry (
         id, note_id, user_id, entry_type, amount_cents, category_key,
         category_dictionary_id,
         account_key, occurred_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      uid('nled_'), note.id, userId, template.kind, cents(total),
      textValue(data.category) || null, categoryDictionaryId, textValue(data.account) || null,
      occurredAt, nowMs,
    );
    db.prepare(
      `INSERT INTO note_inventory_movement (
         id, note_id, user_id, movement_type, product_name, category_key,
         category_dictionary_id,
         quantity, unit_price_cents, amount_cents, cost_cents, counterparty,
         payment_status, occurred_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      uid('ninv_'), note.id, userId, template.kind,
      textValue(data.item) || note.title, textValue(data.category) || null, categoryDictionaryId,
      quantity, cents(unitPrice), cents(total), cents(data.cost),
      textValue(template.kind === 'purchase' ? data.supplier : data.channel) || null,
      textValue(data.paymentStatus) || null, occurredAt, nowMs,
    );
  } else if (template.kind === 'time') {
    db.prepare(
      `INSERT INTO note_time_log (
         id, note_id, user_id, activity, category_key, category_dictionary_id,
         minutes, occurred_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      uid('ntime_'), note.id, userId,
      textValue(data.activity) || note.title,
      textValue(data.category) || null, categoryDictionaryId,
      Math.max(0, Math.round(numberValue(data.durationMinutes))),
      occurredAt, nowMs,
    );
  } else if (template.kind === 'task') {
    const done = data.done === true;
    db.prepare(
      `INSERT INTO note_task_plan (
         id, note_id, user_id, title, priority, due_at, remind_at, done,
         completed_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      uid('ntask_'), note.id, userId, note.title,
      textValue(data.priority) || null, note.planAt,
      note.remindAt, done ? 1 : 0,
      done ? note.updatedAt : null, note.createdAt, note.updatedAt,
    );
  }
}

const projectedUsers = new Set<string>();

function ensureDomainProjections(userId: string): void {
  if (projectedUsers.has(userId)) return;
  const rows = db.prepare('SELECT id FROM note WHERE user_id = ?').all(userId) as Array<{ id: string }>;
  const rebuild = db.transaction(() => {
    for (const row of rows) syncNoteDomainProjections(userId, row.id);
  });
  rebuild();
  projectedUsers.add(userId);
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
  const remove = db.transaction(() => {
    const r = db.prepare('DELETE FROM note WHERE id = ? AND user_id = ?').run(id, userId);
    if (r.changes === 0) throw new Error('笔记不存在');
    clearNoteDomainProjections(id);
  });
  remove();
}

export function getNote(userId: string, id: string): NoteItem | null {
  const row = db.prepare(
    'SELECT n.*, c.name AS category_name FROM note n LEFT JOIN note_category c ON c.id = n.category_id WHERE n.id = ? AND n.user_id = ?',
  ).get(id, userId) as NoteRowRaw | undefined;
  return row ? rowToItem(row) : null;
}

export function toggleTaskDone(userId: string, id: string): NoteItem {
  const note = getNote(userId, id);
  if (!note) throw new Error('笔记不存在');
  const template = templateOfItem(note, listNoteTemplates(userId));
  if (template?.kind !== 'task') throw new Error('这条记录不是任务计划');
  return updateNote(userId, id, {
    data: { ...note.data, done: note.data.done !== true },
    remindAt: note.data.done !== true ? null : note.remindAt,
  });
}

export interface NoteAnalyticsTotals {
  expense: number;
  income: number;
  purchase: number;
  sale: number;
  net: number;
  minutes: number;
  tasksDone: number;
  tasksOpen: number;
  tasksOverdue: number;
}

export interface NoteAnalyticsDay {
  day: string;
  expense: number;
  income: number;
  purchase: number;
  sale: number;
  minutes: number;
}

export interface NoteCategoryMetric {
  key: string;
  dictionaryId: string | null;
  amount: number;
}

export interface NoteTimeCategoryMetric {
  key: string;
  dictionaryId: string | null;
  minutes: number;
}

export interface NoteInventoryMetric {
  product: string;
  category: string | null;
  categoryDictionaryId: string | null;
  quantityOnHand: number;
  purchaseAmount: number;
  saleAmount: number;
}

export interface NoteAnalytics {
  from: number;
  to: number;
  totals: NoteAnalyticsTotals;
  daily: NoteAnalyticsDay[];
  expenseByCategory: NoteCategoryMetric[];
  timeByCategory: NoteTimeCategoryMetric[];
  inventory: NoteInventoryMetric[];
}

function localDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getNoteAnalytics(userId: string, from: number, to: number, nowMs = Date.now()): NoteAnalytics {
  ensureDomainProjections(userId);
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const ledgerRows = db.prepare(
    `SELECT entry_type, amount_cents, category_key, category_dictionary_id, occurred_at
       FROM note_ledger_entry
      WHERE user_id = ? AND occurred_at >= ? AND occurred_at <= ?`,
  ).all(userId, start, end) as Array<{
    entry_type: string;
    amount_cents: number;
    category_key: string | null;
    category_dictionary_id: string | null;
    occurred_at: number;
  }>;
  const timeRows = db.prepare(
    `SELECT category_key, category_dictionary_id, minutes, occurred_at
       FROM note_time_log
      WHERE user_id = ? AND occurred_at >= ? AND occurred_at <= ?`,
  ).all(userId, start, end) as Array<{
    category_key: string | null;
    category_dictionary_id: string | null;
    minutes: number;
    occurred_at: number;
  }>;
  const tasks = db.prepare(
    `SELECT done, due_at, completed_at FROM note_task_plan WHERE user_id = ?`,
  ).all(userId) as Array<{ done: number; due_at: number | null; completed_at: number | null }>;
  const inventoryRows = db.prepare(
    `SELECT movement_type, product_name, category_key, category_dictionary_id, quantity, amount_cents
       FROM note_inventory_movement
      WHERE user_id = ?`,
  ).all(userId) as Array<{
    movement_type: string;
    product_name: string;
    category_key: string | null;
    category_dictionary_id: string | null;
    quantity: number;
    amount_cents: number;
  }>;

  const totals: NoteAnalyticsTotals = {
    expense: 0,
    income: 0,
    purchase: 0,
    sale: 0,
    net: 0,
    minutes: 0,
    tasksDone: tasks.filter((task) => (
      Number(task.done) === 1
      && task.completed_at != null
      && task.completed_at >= start
      && task.completed_at <= end
    )).length,
    tasksOpen: tasks.filter((task) => Number(task.done) !== 1).length,
    tasksOverdue: tasks.filter((task) => (
      Number(task.done) !== 1 && task.due_at != null && task.due_at < nowMs
    )).length,
  };
  const daily = new Map<string, NoteAnalyticsDay>();
  const categoryMap = new Map<string, NoteCategoryMetric>();
  const ensureDay = (day: string): NoteAnalyticsDay => {
    const existing = daily.get(day);
    if (existing) return existing;
    const created = { day, expense: 0, income: 0, purchase: 0, sale: 0, minutes: 0 };
    daily.set(day, created);
    return created;
  };

  for (const row of ledgerRows) {
    const amount = Number(row.amount_cents || 0) / 100;
    const day = ensureDay(localDayKey(row.occurred_at));
    if (row.entry_type === 'expense') {
      totals.expense += amount;
      day.expense += amount;
      if (row.category_key) {
        const current = categoryMap.get(row.category_key) || {
          key: row.category_key,
          dictionaryId: row.category_dictionary_id,
          amount: 0,
        };
        current.amount += amount;
        if (!current.dictionaryId && row.category_dictionary_id) current.dictionaryId = row.category_dictionary_id;
        categoryMap.set(row.category_key, current);
      }
    } else if (row.entry_type === 'income') {
      totals.income += amount;
      day.income += amount;
    } else if (row.entry_type === 'purchase') {
      totals.purchase += amount;
      day.purchase += amount;
    } else if (row.entry_type === 'sale') {
      totals.sale += amount;
      day.sale += amount;
    }
  }
  const timeCategoryMap = new Map<string, NoteTimeCategoryMetric>();
  for (const row of timeRows) {
    const minutes = Number(row.minutes || 0);
    totals.minutes += minutes;
    ensureDay(localDayKey(row.occurred_at)).minutes += minutes;
    if (row.category_key) {
      const current = timeCategoryMap.get(row.category_key) || {
        key: row.category_key,
        dictionaryId: row.category_dictionary_id,
        minutes: 0,
      };
      current.minutes += minutes;
      if (!current.dictionaryId && row.category_dictionary_id) current.dictionaryId = row.category_dictionary_id;
      timeCategoryMap.set(row.category_key, current);
    }
  }
  totals.net = totals.income + totals.sale - totals.expense - totals.purchase;

  const inventoryMap = new Map<string, NoteInventoryMetric>();
  for (const row of inventoryRows) {
    const key = row.product_name;
    const current = inventoryMap.get(key) || {
      product: row.product_name,
      category: row.category_key,
      categoryDictionaryId: row.category_dictionary_id,
      quantityOnHand: 0,
      purchaseAmount: 0,
      saleAmount: 0,
    };
    if (!current.category && row.category_key) current.category = row.category_key;
    if (!current.categoryDictionaryId && row.category_dictionary_id) {
      current.categoryDictionaryId = row.category_dictionary_id;
    }
    const amount = Number(row.amount_cents || 0) / 100;
    if (row.movement_type === 'purchase') {
      current.quantityOnHand += Number(row.quantity || 0);
      current.purchaseAmount += amount;
    } else if (row.movement_type === 'sale') {
      current.quantityOnHand -= Number(row.quantity || 0);
      current.saleAmount += amount;
    }
    inventoryMap.set(key, current);
  }

  return {
    from: start,
    to: end,
    totals,
    daily: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)),
    expenseByCategory: [...categoryMap.values()].sort((a, b) => b.amount - a.amount),
    timeByCategory: [...timeCategoryMap.values()].sort((a, b) => b.minutes - a.minutes),
    inventory: [...inventoryMap.values()]
      .sort((a, b) => Math.abs(b.quantityOnHand) - Math.abs(a.quantityOnHand)),
  };
}

// ── 模板与字典 ───────────────────────────────────────────────────────────────

interface NoteTemplateRow {
  id: string;
  name: string;
  description: string;
  icon: string;
  tone: string;
  kind: string;
  fields_json: string;
  title_field: string;
  content_field: string | null;
  created_at: number;
  updated_at: number;
}

interface NoteDictionaryRow {
  id: string;
  name: string;
  description: string;
  items_json: string;
  created_at: number;
  updated_at: number;
}

const TEMPLATE_KINDS = new Set<NoteTemplateKind>([
  'note', 'journal', 'expense', 'income', 'purchase', 'sale', 'time', 'task', 'custom',
]);
const FIELD_TYPES = new Set<NoteFieldType>([
  'text', 'textarea', 'number', 'amount', 'date', 'datetime',
  'select', 'multiselect', 'checkbox', 'tags', 'product',
]);

function rowToTemplate(row: NoteTemplateRow): NoteTemplateDefinition {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    tone: row.tone,
    kind: TEMPLATE_KINDS.has(row.kind as NoteTemplateKind)
      ? row.kind as NoteTemplateKind
      : 'custom',
    fields: parseJson<NoteTemplateField[]>(row.fields_json, []),
    titleField: row.title_field || 'title',
    contentField: row.content_field || undefined,
    builtin: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToDictionary(row: NoteDictionaryRow): NoteDictionaryDefinition {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    items: parseJson<NoteDictionaryItem[]>(row.items_json, []),
    builtin: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface NoteTemplateInput {
  name: string;
  description?: string;
  icon?: string;
  tone?: string;
  kind?: NoteTemplateKind;
  fields: NoteTemplateField[];
  titleField?: string;
  contentField?: string;
}

function normalizeTemplateInput(input: NoteTemplateInput): Required<Omit<NoteTemplateInput, 'contentField'>> & { contentField: string | null } {
  const name = String(input.name || '').trim().slice(0, 40);
  if (!name) throw new Error('模板名称不能为空');
  const kind = input.kind && TEMPLATE_KINDS.has(input.kind) ? input.kind : 'custom';
  const fields = Array.isArray(input.fields) ? input.fields : [];
  if (!fields.length) throw new Error('模板至少需要一个字段');
  const seen = new Set<string>();
  const normalizedFields = fields.map((field, index) => {
    const key = String(field.key || '').trim();
    if (!key || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)) {
      throw new Error(`第 ${index + 1} 个字段 key 不合法`);
    }
    if (seen.has(key)) throw new Error(`字段 key「${key}」重复`);
    seen.add(key);
    const type = FIELD_TYPES.has(field.type) ? field.type : 'text';
    const label = String(field.label || '').trim().slice(0, 40);
    if (!label) throw new Error(`字段 key「${key}」缺少名称`);
    return {
      ...field,
      key,
      label,
      type,
      placeholder: field.placeholder ? String(field.placeholder).slice(0, 120) : undefined,
      unit: field.unit ? String(field.unit).slice(0, 12) : undefined,
      dictionaryId: field.dictionaryId ? String(field.dictionaryId) : undefined,
      visibleWhen: field.visibleWhen ? {
        field: String(field.visibleWhen.field),
        equals: String(field.visibleWhen.equals),
      } : undefined,
    };
  });
  for (const field of normalizedFields) {
    if (!field.visibleWhen) continue;
    const trigger = normalizedFields.find((candidate) => candidate.key === field.visibleWhen?.field);
    if (!trigger || (trigger.type !== 'select' && trigger.type !== 'multiselect') || !trigger.dictionaryId) {
      throw new Error(`字段「${field.label}」的显示条件必须绑定一个单选或多选字典字段`);
    }
  }
  const titleField = String(input.titleField || normalizedFields[0].key);
  if (!seen.has(titleField)) throw new Error('标题字段必须来自模板字段');
  const contentField = input.contentField ? String(input.contentField) : null;
  if (contentField && !seen.has(contentField)) throw new Error('正文字段必须来自模板字段');
  return {
    name,
    description: String(input.description || '').trim().slice(0, 160),
    icon: String(input.icon || 'NotebookPen').slice(0, 40),
    tone: String(input.tone || 'slate').slice(0, 40),
    kind,
    fields: normalizedFields,
    titleField,
    contentField,
  };
}

export function listNoteTemplates(userId: string): NoteTemplateDefinition[] {
  const rows = db.prepare(
    `SELECT id, name, description, icon, tone, kind, fields_json, title_field,
            content_field, created_at, updated_at
       FROM note_template WHERE user_id = ? ORDER BY updated_at DESC`,
  ).all(userId) as NoteTemplateRow[];
  return [...NOTE_BUILTIN_TEMPLATES, ...rows.map(rowToTemplate)];
}

export function createNoteTemplate(userId: string, input: NoteTemplateInput): NoteTemplateDefinition {
  const normalized = normalizeTemplateInput(input);
  validateTemplateDictionaryBindings(userId, normalized.fields);
  assertUniqueRecordName(userId, 'note_template', normalized.name);
  const id = uid('ntpl_');
  const nowMs = Date.now();
  db.prepare(
    `INSERT INTO note_template (
       id, user_id, name, description, icon, tone, kind, fields_json,
       title_field, content_field, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, userId, normalized.name, normalized.description, normalized.icon, normalized.tone,
    normalized.kind, json(normalized.fields), normalized.titleField,
    normalized.contentField, nowMs, nowMs,
  );
  return listNoteTemplates(userId).find((item) => item.id === id)!;
}

export function updateNoteTemplate(userId: string, id: string, input: NoteTemplateInput): NoteTemplateDefinition {
  assertCustomTemplate(userId, id);
  const normalized = normalizeTemplateInput(input);
  validateTemplateDictionaryBindings(userId, normalized.fields);
  assertUniqueRecordName(userId, 'note_template', normalized.name, id);
  db.prepare(
    `UPDATE note_template
        SET name = ?, description = ?, icon = ?, tone = ?, kind = ?, fields_json = ?,
            title_field = ?, content_field = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(
    normalized.name, normalized.description, normalized.icon, normalized.tone,
    normalized.kind, json(normalized.fields), normalized.titleField,
    normalized.contentField, Date.now(), id, userId,
  );
  return listNoteTemplates(userId).find((item) => item.id === id)!;
}

function assertCustomTemplate(userId: string, id: string): void {
  if (NOTE_BUILTIN_TEMPLATES.some((item) => item.id === id)) throw new Error('内置模板不能修改或删除');
  const row = db.prepare('SELECT id FROM note_template WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) throw new Error('模板不存在');
}

function validateTemplateDictionaryBindings(userId: string, fields: readonly NoteTemplateField[]): void {
  const dictionaries = listNoteDictionaries(userId);
  for (const field of fields) {
    if (!field.dictionaryId) continue;
    const dictionary = dictionaries.find((item) => item.id === field.dictionaryId);
    if (!dictionary) throw new Error(`字段「${field.label}」绑定的字典不存在`);
  }
  for (const field of fields) {
    if (!field.visibleWhen) continue;
    const trigger = fields.find((item) => item.key === field.visibleWhen?.field);
    const triggerDictionary = dictionaries.find((item) => item.id === trigger?.dictionaryId);
    if (!triggerDictionary?.items.some((item) => item.id === field.visibleWhen?.equals)) {
      throw new Error(`字段「${field.label}」的显示条件选项不存在`);
    }
  }
}

export function deleteNoteTemplate(userId: string, id: string): void {
  assertCustomTemplate(userId, id);
  db.prepare('DELETE FROM note_template WHERE id = ? AND user_id = ?').run(id, userId);
}

export interface NoteDictionaryInput {
  name: string;
  description?: string;
  items?: NoteDictionaryItem[];
}

function normalizeDictionaryInput(input: NoteDictionaryInput): {
  name: string;
  description: string;
  items: NoteDictionaryItem[];
} {
  const name = String(input.name || '').trim().slice(0, 40);
  if (!name) throw new Error('字典名称不能为空');
  const seen = new Set<string>();
  const items = (Array.isArray(input.items) ? input.items : []).map((item, index) => {
    const id = String(item.id || `item_${index + 1}`).trim();
    if (!id || seen.has(id)) throw new Error(`字典项 id「${id}」重复或不合法`);
    seen.add(id);
    const label = String(item.label || '').trim().slice(0, 40);
    if (!label) throw new Error(`字典项「${id}」缺少名称`);
    return { ...item, id, label, archived: item.archived === true };
  });
  return {
    name,
    description: String(input.description || '').trim().slice(0, 160),
    items,
  };
}

export function listNoteDictionaries(userId: string): NoteDictionaryDefinition[] {
  const rows = db.prepare(
    `SELECT id, name, description, items_json, created_at, updated_at
       FROM note_dictionary WHERE user_id = ? ORDER BY updated_at DESC`,
  ).all(userId) as NoteDictionaryRow[];
  return [...NOTE_BUILTIN_DICTIONARIES, ...rows.map(rowToDictionary)];
}

export function createNoteDictionary(userId: string, input: NoteDictionaryInput): NoteDictionaryDefinition {
  const normalized = normalizeDictionaryInput(input);
  assertUniqueRecordName(userId, 'note_dictionary', normalized.name);
  const id = uid('ndict_');
  const nowMs = Date.now();
  db.prepare(
    `INSERT INTO note_dictionary (id, user_id, name, description, items_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, normalized.name, normalized.description, json(normalized.items), nowMs, nowMs);
  return listNoteDictionaries(userId).find((item) => item.id === id)!;
}

export function updateNoteDictionary(
  userId: string,
  id: string,
  input: Partial<NoteDictionaryInput>,
): NoteDictionaryDefinition {
  assertCustomDictionary(userId, id);
  const existing = listNoteDictionaries(userId).find((item) => item.id === id);
  if (!existing) throw new Error('字典不存在');
  const normalized = normalizeDictionaryInput({
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    items: input.items ?? existing.items,
  });
  assertUniqueRecordName(userId, 'note_dictionary', normalized.name, id);
  db.prepare(
    `UPDATE note_dictionary
        SET name = ?, description = ?, items_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(normalized.name, normalized.description, json(normalized.items), Date.now(), id, userId);
  return listNoteDictionaries(userId).find((item) => item.id === id)!;
}

function assertCustomDictionary(userId: string, id: string): void {
  if (NOTE_BUILTIN_DICTIONARIES.some((item) => item.id === id)) throw new Error('内置字典不能修改或删除');
  const row = db.prepare('SELECT id FROM note_dictionary WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) throw new Error('字典不存在');
}

export function deleteNoteDictionary(userId: string, id: string): void {
  assertCustomDictionary(userId, id);
  db.prepare('DELETE FROM note_dictionary WHERE id = ? AND user_id = ?').run(id, userId);
}

function assertUniqueRecordName(
  userId: string,
  table: 'note_template' | 'note_dictionary',
  name: string,
  excludeId?: string,
): void {
  const builtinNames = table === 'note_template'
    ? NOTE_BUILTIN_TEMPLATES.map((item) => item.name)
    : NOTE_BUILTIN_DICTIONARIES.map((item) => item.name);
  if (builtinNames.includes(name)) throw new Error(`「${name}」与内置名称重复`);
  const row = db.prepare(
    `SELECT id FROM ${table} WHERE user_id = ? AND name = ?${excludeId ? ' AND id != ?' : ''}`,
  ).get(...(excludeId ? [userId, name, excludeId] : [userId, name])) as { id: string } | undefined;
  if (row) throw new Error(`「${name}」已存在`);
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
