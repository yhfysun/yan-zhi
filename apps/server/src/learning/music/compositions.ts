// 编曲作品持久化（learning_composition 表）—— docs/音乐双方向重构方案-2026-11-15.md §3.4。
// ★ 表定义放本模块而不是 db.ts：`IF NOT EXISTS` 幂等，模块加载即建，避免碰并行会话在改的 db.ts。
//   读写编排收口在本文件（业务唯一实现），routes/learning-music.ts 只做 HTTP 编排（项目范式）。

import { db } from '../../db.js';
import type { Composition, CompositionOrigin, MusicTrack, Score } from './types';

db.exec(`
  CREATE TABLE IF NOT EXISTS learning_composition (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    track TEXT NOT NULL,               -- western | traditional
    title TEXT NOT NULL,
    spec_json TEXT NOT NULL DEFAULT '{}',   -- music-plan 的 MusicSpec（编曲决定）
    score_json TEXT NOT NULL,               -- 学习谱面 Score（唯一真相源）
    audio_url TEXT,                         -- compose/render 产物 URL（可空 = 还没渲染）
    origin TEXT NOT NULL DEFAULT 'manual',  -- manual | auto | ai
    seed INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_composition_user ON learning_composition(user_id, track, updated_at DESC);
`);

function uid(): string {
  return `comp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function rowToComposition(row: Record<string, unknown>): Composition {
  return {
    id: String(row.id),
    track: String(row.track) as MusicTrack,
    title: String(row.title),
    spec: JSON.parse(String(row.spec_json || '{}')) as Record<string, unknown>,
    score: JSON.parse(String(row.score_json)) as Score,
    ...(row.audio_url ? { audioUrl: String(row.audio_url) } : {}),
    origin: String(row.origin) as CompositionOrigin,
    seed: Number(row.seed) || 1,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function listCompositions(userId: string, track?: MusicTrack): Composition[] {
  const rows = (track
    ? db.prepare('SELECT * FROM learning_composition WHERE user_id = ? AND track = ? ORDER BY updated_at DESC').all(userId, track)
    : db.prepare('SELECT * FROM learning_composition WHERE user_id = ? ORDER BY updated_at DESC').all(userId)
  ) as Array<Record<string, unknown>>;
  return rows.map(rowToComposition);
}

export function getComposition(userId: string, id: string): Composition | undefined {
  const row = db.prepare('SELECT * FROM learning_composition WHERE id = ? AND user_id = ?').get(id, userId) as Record<string, unknown> | undefined;
  return row ? rowToComposition(row) : undefined;
}

export function createComposition(userId: string, input: {
  track: MusicTrack; title: string; spec?: Record<string, unknown>; score: Score;
  audioUrl?: string; origin?: CompositionOrigin; seed?: number;
}): Composition {
  const now = Date.now();
  const id = uid();
  db.prepare(
    `INSERT INTO learning_composition (id, user_id, track, title, spec_json, score_json, audio_url, origin, seed, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, input.track, input.title.slice(0, 60),
    JSON.stringify(input.spec ?? {}), JSON.stringify(input.score),
    input.audioUrl ?? null, input.origin ?? 'manual', Math.round(input.seed ?? 1), now, now);
  return getComposition(userId, id)!;
}

export function updateComposition(userId: string, id: string, patch: {
  title?: string; spec?: Record<string, unknown>; score?: Score; audioUrl?: string | null; origin?: CompositionOrigin; seed?: number;
}): Composition | undefined {
  const row = db.prepare('SELECT id FROM learning_composition WHERE id = ? AND user_id = ?').get(id, userId) as { id: string } | undefined;
  if (!row) return undefined;
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.title !== undefined) { sets.push('title = ?'); args.push(String(patch.title).slice(0, 60)); }
  if (patch.spec !== undefined) { sets.push('spec_json = ?'); args.push(JSON.stringify(patch.spec)); }
  if (patch.score !== undefined) { sets.push('score_json = ?'); args.push(JSON.stringify(patch.score)); }
  if (patch.audioUrl !== undefined) { sets.push('audio_url = ?'); args.push(patch.audioUrl); }
  if (patch.origin !== undefined) { sets.push('origin = ?'); args.push(patch.origin); }
  if (patch.seed !== undefined) { sets.push('seed = ?'); args.push(Math.round(patch.seed)); }
  if (!sets.length) return getComposition(userId, id);
  sets.push('updated_at = ?'); args.push(Date.now());
  db.prepare(`UPDATE learning_composition SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...args, id, userId);
  return getComposition(userId, id);
}

export function deleteComposition(userId: string, id: string): boolean {
  const r = db.prepare('DELETE FROM learning_composition WHERE id = ? AND user_id = ?').run(id, userId);
  return r.changes > 0;
}
