// 已验证问答沉淀（P4.7）：成功的「问题 → DSL」作为后续 few-shot。
//
// ★ 只沉淀"跑通过"的问答（调用方在拿到结果后保存）；检索用字面相似度（中文 bigram + 英文词），
//   不依赖 embedding，离线可用。命中后注入本体摘要，让模型少走弯路。
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';

export interface OntologyExample {
  id: string;
  user_id: string;
  ontology_id: string | null;
  question: string;
  intent_json: string | null;
  sql: string | null;
  row_count: number;
  used_count: number;
  created_at: number;
}

export interface SaveExampleInput {
  ontologyId?: string | null;
  question: string;
  /** 已执行的 DSL（intent 对象） */
  intent?: unknown;
  sql?: string;
  rowCount?: number;
}

export function normalizeQuestion(q: string): string {
  return String(q || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

/** 中文 bigram + 英文/数字词 */
export function tokensOf(q: string): Set<string> {
  const s = normalizeQuestion(q);
  const out = new Set<string>();
  for (const w of s.match(/[a-z0-9_]+/g) || []) out.add(w);
  const cjk = s.replace(/[a-z0-9_]+/g, '');
  for (let i = 0; i < cjk.length - 1; i += 1) out.add(cjk.slice(i, i + 2));
  if (cjk.length === 1) out.add(cjk);
  return out;
}

/** 相似度：token 交集 / 较小集合大小；完全相同 → 1 */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (normalizeQuestion(a) === normalizeQuestion(b)) return 1;
  const ta = tokensOf(a);
  const tb = tokensOf(b);
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit += 1;
  return hit / Math.min(ta.size, tb.size);
}

/** 保存（同用户 + 同本体 + 同问题视为同一条：更新 DSL/SQL，不新增） */
export function saveExample(userId: string, input: SaveExampleInput): OntologyExample {
  const question = String(input.question || '').trim();
  if (!question) throw new Error('question 不能为空');
  const norm = normalizeQuestion(question);
  const existing = (db.prepare(
    "SELECT * FROM ontology_example WHERE user_id = ? AND COALESCE(ontology_id, '') = COALESCE(?, '')",
  ).all(userId, input.ontologyId || null) as OntologyExample[])
    .find((r) => normalizeQuestion(r.question) === norm);
  const now = Date.now();
  if (existing) {
    db.prepare('UPDATE ontology_example SET question = ?, intent_json = ?, sql = ?, row_count = ?, created_at = ? WHERE id = ?')
      .run(question, input.intent !== undefined ? JSON.stringify(input.intent) : existing.intent_json,
        input.sql || existing.sql, input.rowCount ?? existing.row_count, now, existing.id);
    return db.prepare('SELECT * FROM ontology_example WHERE id = ?').get(existing.id) as OntologyExample;
  }
  const id = `oe_${uuid().slice(0, 12)}`;
  db.prepare(
    'INSERT INTO ontology_example (id, user_id, ontology_id, question, intent_json, sql, row_count, used_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)',
  ).run(id, userId, input.ontologyId || null, question,
    input.intent !== undefined ? JSON.stringify(input.intent) : null,
    input.sql || null, input.rowCount ?? 0, now);
  return db.prepare('SELECT * FROM ontology_example WHERE id = ?').get(id) as OntologyExample;
}

/** 召回：按字面相似度排序，只返回 score ≥ minScore 的条目 */
export function searchExamples(
  userId: string,
  question: string,
  opts: { ontologyId?: string | null; limit?: number; minScore?: number } = {},
): OntologyExample[] {
  const limit = Math.max(1, Math.min(Number(opts.limit) || 3, 10));
  const minScore = opts.minScore ?? 0.2;
  const rows = db.prepare(
    "SELECT * FROM ontology_example WHERE user_id = ? AND (? IS NULL OR ontology_id IS NULL OR ontology_id = ?) ORDER BY created_at DESC LIMIT 300",
  ).all(userId, opts.ontologyId || null, opts.ontologyId || null) as OntologyExample[];
  return rows
    .map((r) => ({ r, score: similarity(question, r.question) }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score || b.r.used_count - a.r.used_count || b.r.created_at - a.r.created_at)
    .slice(0, limit)
    .map((x) => x.r);
}

export function markExamplesUsed(ids: string[]): void {
  const stmt = db.prepare('UPDATE ontology_example SET used_count = used_count + 1 WHERE id = ?');
  const tx = db.transaction(() => { for (const id of ids) stmt.run(id); });
  tx();
}

/** 给模型的 few-shot 文本（只给问题 + DSL；SQL 是编译产物，不喂模型物理实现） */
export function formatExamplesForPrompt(examples: OntologyExample[]): string {
  if (!examples.length) return '';
  const lines = ['## 已验证问答（同样口径优先复用）'];
  for (const e of examples) {
    let dsl = '';
    try { dsl = e.intent_json ? JSON.stringify(JSON.parse(e.intent_json)) : ''; } catch { dsl = ''; }
    lines.push(`- 问：${e.question}\n  答（DSL）：${dsl || '（未记录）'}${e.row_count ? `（已验证，返回 ${e.row_count} 行）` : ''}`);
  }
  return lines.join('\n');
}
