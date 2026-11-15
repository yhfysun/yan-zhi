// 典籍文库数据层（docs/传统文化与音乐学习模式方案 §4.2b）——
// canon_work/canon_gloss/canon_fts 的读写唯一出口；检索与计数走 SQL，不做前端全量过滤。
// ★ 精读层（TS 内容包）注解不入库；canon_gloss 只装文库层缓存，
//   origin='assisted' 永不覆盖 'verified'（硬约束，测试钉死）。

import { db, FTS5_ENABLED } from '../../db.js';
import { CANON_SEED_WORKS } from './canon-data.js';
import type { CanonWork } from './types.js';

export type CanonWorkRow = {
  id: string; title: string; author: string | null; dynasty: string | null; genre: string | null;
  collection: string; tags: string[]; popularity: string; difficulty: string;
  text: string; source: string; verified: boolean;
};

function rowToWork(r: Record<string, unknown>): CanonWorkRow {
  return {
    id: r.id as string,
    title: r.title as string,
    author: (r.author as string | null) ?? null,
    dynasty: (r.dynasty as string | null) ?? null,
    genre: (r.genre as string | null) ?? null,
    collection: (r.collection as string) || '',
    tags: safeTags(r.tags as string),
    popularity: (r.popularity as string) || 'normal',
    difficulty: (r.difficulty as string) || '入门',
    text: r.text as string,
    source: (r.source as string) || '',
    verified: Number(r.verified) === 1,
  };
}

function safeTags(raw: string | undefined | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

export type CanonQuery = {
  genre?: string; dynasty?: string; tag?: string; collection?: string;
  popularity?: string; difficulty?: string; q?: string;
  page?: number; pageSize?: number;
};

/** 万级检索：五维筛选 + FTS5 名句反查 + 分页（默认 50/页） */
export function searchCanonWorks(query: CanonQuery): { total: number; page: number; pageSize: number; items: CanonWorkRow[] } {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));
  const where: string[] = [];
  const params: unknown[] = [];
  if (query.genre) { where.push('genre = ?'); params.push(query.genre); }
  if (query.dynasty) { where.push('dynasty = ?'); params.push(query.dynasty); }
  if (query.collection) { where.push('collection = ?'); params.push(query.collection); }
  if (query.popularity) { where.push('popularity = ?'); params.push(query.popularity); }
  if (query.difficulty) { where.push('difficulty = ?'); params.push(query.difficulty); }
  if (query.tag) { where.push(`',' || tags || ',' LIKE ?`); params.push(`%,${query.tag},%`); }
  if (query.q && query.q.trim()) {
    // FTS5 unicode61：整段无标点中文是一个 token，短语查询即可做名句反查（等值命中）。
    // ★ 用 rowid 关联（canon_fts 的 content_rowid 对应 canon_work 的隐式 rowid），
    //   不能 id IN (SELECT rowid ...) —— TEXT id 对 INTEGER rowid 恒 false，检索静默空。
    // ★ 驱动无 FTS5（移动端 sql.js WASM）⇒ 降级 LIKE 子串：语义从「短语等值」放宽为
    //   「包含」，名句反查仍然可用；LIKE 通配符转义防用户输入当语法。
    if (FTS5_ENABLED) {
      where.push(`rowid IN (SELECT rowid FROM canon_fts WHERE canon_fts MATCH ?)`);
      params.push(ftsPhrase(query.q.trim()));
    } else {
      where.push(`(title LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\')`);
      const like = `%${query.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      params.push(like, like, like);
    }
  }
  const cond = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM canon_work ${cond}`).get(...params) as { c: number }).c;
  const rows = db.prepare(
    `SELECT * FROM canon_work ${cond} ORDER BY verified DESC, popularity = 'classic' DESC, popularity = 'notable' DESC, rowid LIMIT ? OFFSET ?`,
  ).all(...params, pageSize, (page - 1) * pageSize) as Array<Record<string, unknown>>;
  return { total, page, pageSize, items: rows.map(rowToWork) };
}

/** FTS5 查询串安全包装：整体作为短语，内部双引号翻倍，避免用户输入被当语法 */
function ftsPhrase(q: string): string {
  return `"${q.replace(/"/g, '""')}"`;
}

export function getCanonWork(id: string): CanonWorkRow | null {
  const r = db.prepare('SELECT * FROM canon_work WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? rowToWork(r) : null;
}

/** 五维计数（文库筛选器数据源，走 SQL 聚合不走前端） */
export function canonCollections(): {
  genres: Array<{ key: string; count: number }>;
  dynasties: Array<{ key: string; count: number }>;
  collections: Array<{ key: string; count: number }>;
  popularity: Array<{ key: string; count: number }>;
  difficulties: Array<{ key: string; count: number }>;
  total: number;
} {
  const countBy = (col: string) => {
    const rows = db.prepare(`SELECT ${col} AS k, COUNT(*) AS c FROM canon_work GROUP BY ${col} ORDER BY c DESC`).all() as Array<{ k: string | null; c: number }>;
    return rows.filter((r) => r.k).map((r) => ({ key: r.k as string, count: r.c }));
  };
  const total = (db.prepare('SELECT COUNT(*) AS c FROM canon_work').get() as { c: number }).c;
  return {
    genres: countBy('genre'),
    dynasties: countBy('dynasty'),
    collections: countBy('collection'),
    popularity: countBy('popularity'),
    difficulties: countBy('difficulty'),
    total,
  };
}

/** 每日一首：按日期 seed 轮换（同一天稳定命中同一篇） */
export function dailyCanonWork(now = Date.now()): CanonWorkRow | null {
  const total = (db.prepare('SELECT COUNT(*) AS c FROM canon_work').get() as { c: number }).c;
  if (!total) return null;
  const daySeed = Math.floor(now / 86_400_000);
  const offset = daySeed % total;
  const r = db.prepare('SELECT * FROM canon_work ORDER BY verified DESC, popularity = \'classic\' DESC, rowid LIMIT 1 OFFSET ?').get(offset) as Record<string, unknown>;
  return r ? rowToWork(r) : null;
}

/** 幂等导入（按 id upsert，可重跑）；verified=1 只能来自精读层内容包，LLM 不可写 */
export function upsertCanonWorks(list: CanonWork[]): { inserted: number; updated: number } {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO canon_work (id, title, author, dynasty, genre, collection, tags, popularity, difficulty, text, source, verified, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, author = excluded.author, dynasty = excluded.dynasty, genre = excluded.genre,
      collection = excluded.collection, tags = excluded.tags, popularity = excluded.popularity,
      difficulty = excluded.difficulty, text = excluded.text, source = excluded.source, verified = excluded.verified
  `);
  let inserted = 0;
  let updated = 0;
  const run = db.transaction(() => {
    for (const w of list) {
      const existed = db.prepare('SELECT 1 FROM canon_work WHERE id = ?').get(w.id);
      if (existed) updated++; else inserted++;
      stmt.run(
        w.id, w.title, w.author, w.dynasty, w.genre, w.collection || '',
        JSON.stringify(w.tags ?? []), w.popularity || 'normal', w.difficulty || '入门',
        w.text, w.source || '', 0, now,
      );
    }
  });
  run();
  return { inserted, updated };
}

/** 注解缓存读写：assisted 不覆盖 verified（PK work_id+term，用条件更新守卫） */
export function upsertCanonGloss(entry: {
  workId: string; term: string; plain?: string; context?: string; inOneLine?: string;
  pinyin?: string; origin: 'verified' | 'assisted';
}): void {
  const existing = db.prepare('SELECT origin FROM canon_gloss WHERE work_id = ? AND term = ?')
    .get(entry.workId, entry.term) as { origin: string } | undefined;
  if (existing?.origin === 'verified' && entry.origin === 'assisted') return;
  db.prepare(`
    INSERT INTO canon_gloss (work_id, term, plain, context, in_one_line, pinyin, origin, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(work_id, term) DO UPDATE SET
      plain = excluded.plain, context = excluded.context, in_one_line = excluded.in_one_line,
      pinyin = excluded.pinyin, origin = excluded.origin, updated_at = excluded.updated_at
  `).run(entry.workId, entry.term, entry.plain ?? null, entry.context ?? null, entry.inOneLine ?? null, entry.pinyin ?? null, entry.origin, Date.now());
}

export function listCanonGloss(workId: string): Array<{ term: string; plain: string | null; context: string | null; in_one_line: string | null; pinyin: string | null; origin: string }> {
  return db.prepare('SELECT term, plain, context, in_one_line, pinyin, origin FROM canon_gloss WHERE work_id = ?').all(workId) as Array<{ term: string; plain: string | null; context: string | null; in_one_line: string | null; pinyin: string | null; origin: string }>;
}

/**
 * 首启后台导精选集：canon_work 空则导入随包骨架（~45 篇，九朝代段全覆盖）。
 * 完整 ~2250 篇由 scripts/import-canon.mjs 分批导入（P1 断代大库在线下载后同入口 upsert）。
 */
export function ensureCanonSeedImported(): { imported: boolean; total: number } {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM canon_work').get() as { c: number }).c;
  if (count > 0) return { imported: false, total: count };
  upsertCanonWorks(CANON_SEED_WORKS);
  const total = (db.prepare('SELECT COUNT(*) AS c FROM canon_work').get() as { c: number }).c;
  return { imported: true, total };
}
