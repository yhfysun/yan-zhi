// AI 富化（P3.5）：知识库检索（L2）→ LLM 严格 JSON（L3）→ 草稿 → 人工采纳。
//
// ★ 三道闸决定「AI 不会覆盖人工成果」：
//   ① 只把**描述为空**的字段列为目标（有描述 = 人工已确认，locked）；
//   ② 结果只落草稿表，不直接写本体；采纳是显式动作；
//   ③ 标准属性（业务术语表）优先于 AI：命中 refAttr 时用术语表的描述/同义词。
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { llmJson } from '../host-bridge.js';
import { searchAllKnowledgeBases } from './kb.js';

export type EnrichKind = 'ontology' | 'dimension' | 'measure' | 'time';
export type DraftStatus = 'pending' | 'accepted' | 'discarded';

export interface EnrichTarget {
  kind: EnrichKind;
  name: string;
  refAttr?: string;
  sampleValues?: string[];
}

export interface GlossaryEntry {
  key: string;
  name: string;
  description?: string;
  synonyms: string[];
  enums: string[];
}

export interface EnrichSuggestion {
  kind: EnrichKind;
  field: string;
  description?: string;
  synonyms?: string[];
  confidence: number;
  source: 'ai' | 'glossary';
}

export interface EnrichEvidence {
  baseName: string;
  docName: string;
  text: string;
}

export interface EnrichJobRow {
  id: string;
  user_id: string;
  ontology_id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  model: string | null;
  total: number;
  done: number;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export interface EnrichDraftRow {
  id: string;
  job_id: string;
  user_id: string;
  ontology_id: string;
  kind: EnrichKind;
  field_name: string;
  payload_json: string;
  confidence: number | null;
  evidence_json: string | null;
  status: DraftStatus;
  created_at: number;
  updated_at: number;
}

interface OntologyRowLite {
  id: string;
  user_id: string;
  code: string;
  name: string;
  description: string | null;
  dimensions_json: string | null;
  time_dimensions_json: string | null;
  measures_json: string | null;
}

function parseList<T>(raw: unknown): T[] {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function nonEmpty(s: unknown): string {
  return String(s ?? '').trim();
}

/** 描述非空 = 人工已确认（locked），富化永不覆盖 */
export function isLocked(field: { description?: string }): boolean {
  return nonEmpty(field.description).length > 0;
}

/** 待富化目标：本体描述 + 未填描述的维度/时间维度/度量 */
export function collectTargets(row: Pick<OntologyRowLite, 'name' | 'description' | 'dimensions_json' | 'time_dimensions_json' | 'measures_json'>): EnrichTarget[] {
  const out: EnrichTarget[] = [];
  if (!nonEmpty(row.description)) out.push({ kind: 'ontology', name: row.name });
  for (const d of parseList<{ name: string; description?: string; refAttr?: string; sampleValues?: string[] }>(row.dimensions_json)) {
    if (d?.name && !isLocked(d)) out.push({ kind: 'dimension', name: d.name, refAttr: d.refAttr, sampleValues: d.sampleValues });
  }
  for (const t of parseList<{ name: string; description?: string }>(row.time_dimensions_json)) {
    if (t?.name && !isLocked(t)) out.push({ kind: 'time', name: t.name });
  }
  for (const m of parseList<{ name: string; description?: string; refAttr?: string }>(row.measures_json)) {
    if (m?.name && !isLocked(m)) out.push({ kind: 'measure', name: m.name, refAttr: m.refAttr });
  }
  return out;
}

/** 用户业务术语表（std_attribute kind=attr）：优先级最高的事实来源 */
export function loadGlossary(userId: string): Map<string, GlossaryEntry> {
  const rows = db.prepare("SELECT key, name, description, synonyms_json, enum_json FROM std_attribute WHERE user_id = ? AND kind = 'attr'")
    .all(userId) as any[];
  const out = new Map<string, GlossaryEntry>();
  for (const r of rows) {
    if (!r.key) continue;
    out.set(r.key, {
      key: r.key,
      name: r.name,
      description: r.description || undefined,
      synonyms: parseList<string>(r.synonyms_json).map(String).filter(Boolean),
      enums: parseList<string>(r.enum_json).map(String).filter(Boolean),
    });
  }
  return out;
}

/** few-shot：同本体已有的人写描述（最多 5 条），让模型对齐口径与长度 */
export function collectExemplars(row: Pick<OntologyRowLite, 'description' | 'dimensions_json' | 'time_dimensions_json' | 'measures_json'>): string[] {
  const out: string[] = [];
  if (nonEmpty(row.description)) out.push(`本体：${nonEmpty(row.description)}`);
  const push = (kind: string, items: Array<{ name: string; description?: string }>) => {
    for (const it of items) {
      if (out.length >= 5) return;
      if (it?.name && nonEmpty(it.description)) out.push(`${kind} ${it.name}：${nonEmpty(it.description)}`);
    }
  };
  push('维度', parseList(row.dimensions_json));
  push('时间维度', parseList(row.time_dimensions_json));
  push('度量', parseList(row.measures_json));
  return out.slice(0, 5);
}

export function buildPrompt(
  row: Pick<OntologyRowLite, 'name' | 'code'>,
  targets: EnrichTarget[],
  glossary: Map<string, GlossaryEntry>,
  exemplars: string[],
  evidence: EnrichEvidence[],
): { system: string; user: string } {
  const system = [
    '你是数据本体的语义助手。只输出 JSON，不要解释。',
    '输出格式：{"suggestions":[{"kind":"ontology|dimension|measure|time","field":"字段名或本体名","description":"一句话业务说明","synonyms":["同义词"],"confidence":0.0-1.0}]}',
    '规则：只处理给定字段；description 简洁（不超过 60 字），说清业务口径而不是重复字段名；synonyms 最多 5 个；不确定就给低 confidence（≤0.5）。',
    '若字段带有术语表条目，以术语表为准，不要自创不同口径。',
  ].join('\n');

  const lines: string[] = [];
  lines.push(`本体：${row.name}（${row.code}）`);
  lines.push(`待补全字段：`);
  for (const t of targets) {
    const g = t.refAttr ? glossary.get(t.refAttr) : undefined;
    const extra = [
      t.refAttr ? `refAttr=${t.refAttr}` : '',
      g ? `术语表=${g.name}${g.description ? `（${g.description}）` : ''}` : '',
      t.sampleValues?.length ? `样本值=${t.sampleValues.slice(0, 5).join('/')}` : '',
    ].filter(Boolean).join('；');
    lines.push(`- [${t.kind}] ${t.name}${extra ? `（${extra}）` : ''}`);
  }
  if (exemplars.length) lines.push(`\n已有描述（对齐口径）：\n${exemplars.map((e) => `- ${e}`).join('\n')}`);
  if (evidence.length) {
    lines.push('\n资料依据（仅作参考，不要编造未出现的事实）：');
    for (const e of evidence.slice(0, 5)) lines.push(`- [${e.baseName}/${e.docName || '文档'}] ${e.text.slice(0, 300)}`);
  }
  return { system, user: lines.join('\n') };
}

/** 结果整形：只接受目标内字段、值域收敛、术语表覆盖 AI */
export function normalizeSuggestions(
  raw: unknown,
  targets: EnrichTarget[],
  glossary: Map<string, GlossaryEntry>,
): EnrichSuggestion[] {
  const data = raw as { suggestions?: unknown } | null;
  const rows = Array.isArray(data?.suggestions) ? data!.suggestions as any[] : [];
  const allowed = new Map(targets.map((t) => [`${t.kind}:${t.name}`, t]));
  const out: EnrichSuggestion[] = [];
  const seen = new Set<string>();

  for (const r of rows) {
    const kind = String(r?.kind || '') as EnrichKind;
    const field = nonEmpty(r?.field);
    const key = `${kind}:${field}`;
    const target = allowed.get(key);
    if (!target || seen.has(key)) continue;
    const description = nonEmpty(r?.description).slice(0, 500) || undefined;
    let synonyms: string[] = Array.isArray(r?.synonyms)
      ? [...new Set<string>(r.synonyms.map((s: unknown) => nonEmpty(s)).filter(Boolean))].slice(0, 8)
      : [];
    let source: 'ai' | 'glossary' = 'ai';
    let confidence = Math.max(0, Math.min(1, Number(r?.confidence ?? 0.6) || 0.6));

    // 术语表优先：命中 refAttr 时，描述/同义词/置信度都由用户口径决定
    const g = target.refAttr ? glossary.get(target.refAttr) : undefined;
    if (g) {
      const gDesc = nonEmpty(g.description);
      if (gDesc) { source = 'glossary'; confidence = 1; }
      if (g.synonyms.length) synonyms = [...new Set(g.synonyms)].slice(0, 8);
      if (gDesc || g.synonyms.length) {
        out.push({ kind, field, description: gDesc || description, synonyms: synonyms.length ? synonyms : undefined, confidence, source });
        seen.add(key);
        continue;
      }
    }
    if (!description && !synonyms.length) continue;
    out.push({ kind, field, description, synonyms: synonyms.length ? synonyms : undefined, confidence, source });
    seen.add(key);
  }
  return out;
}

export interface EnrichDeps {
  /** 生成 JSON（默认走用户默认模型）；返回解析后的对象或 null */
  generate?: (prompt: { system: string; user: string }) => Promise<unknown>;
  /** 知识库检索（默认跨库 LIKE 检索），失败应返回空数组 */
  searchKb?: (query: string) => Promise<EnrichEvidence[]>;
}

/** 编排（纯逻辑，可注入假生成器）：返回建议，不写库 */
export async function runEnrichment(
  userId: string,
  row: Pick<OntologyRowLite, 'name' | 'code' | 'description' | 'dimensions_json' | 'time_dimensions_json' | 'measures_json'>,
  deps: EnrichDeps = {},
): Promise<EnrichSuggestion[]> {
  const targets = collectTargets(row);
  if (!targets.length) return [];
  const glossary = loadGlossary(userId);
  const exemplars = collectExemplars(row);
  const query = [row.name, row.code, ...targets.map((t) => t.name)].join(' ');
  const evidence = deps.searchKb
    ? await deps.searchKb(query)
    : (() => {
        try {
          return searchAllKnowledgeBases(userId, query.split(' ').slice(0, 3).join(' '), 5)
            .map((r: any) => ({ baseName: r.baseName || '', docName: r.docName || '', text: String(r.content || '') }));
        } catch {
          return [];
        }
      })();
  const { system, user } = buildPrompt(row, targets, glossary, exemplars, evidence);

  const raw = deps.generate
    ? await deps.generate({ system, user })
    : await (async () => {
        const r = await llmJson({ userId, system, user, maxTokens: 2000, timeoutMs: 45000 });
        if (!r.ok) throw new Error(`LLM 富化失败：${r.code}${r.error ? ` ${r.error}` : ''}`);
        return r.data ?? null;
      })();

  return normalizeSuggestions(raw, targets, glossary);
}

function getOntologyRow(userId: string, ontologyId: string): OntologyRowLite {
  const row = db.prepare('SELECT id, user_id, code, name, description, dimensions_json, time_dimensions_json, measures_json FROM ontology WHERE id = ? AND user_id = ?')
    .get(ontologyId, userId) as OntologyRowLite | undefined;
  if (!row) throw new Error('本体不存在');
  return row;
}

function updateJob(id: string, patch: Partial<Pick<EnrichJobRow, 'status' | 'model' | 'total' | 'done' | 'error'>>): void {
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    sets.push(`${k} = ?`);
    args.push(v ?? null);
  }
  sets.push('updated_at = ?');
  args.push(Date.now(), id);
  db.prepare(`UPDATE ontology_enrich_job SET ${sets.join(', ')} WHERE id = ?`).run(...args);
}

function defaultModelLabel(userId: string): string | null {
  const row = db.prepare(
    `SELECT COALESCE(NULLIF(m.alias,''), m.model_id) AS name FROM model m
     WHERE m.user_id = ? AND m.enabled = 1 AND m.type = 'llm'
     ORDER BY m.is_default DESC, m.created_at ASC LIMIT 1`,
  ).get(userId) as any;
  return row?.name || null;
}

/** 启动富化任务（后台跑，立即返回 job） */
export function startEnrichJob(userId: string, ontologyId: string): EnrichJobRow {
  const row = getOntologyRow(userId, ontologyId);
  const targets = collectTargets(row);
  const id = uuid();
  const now = Date.now();
  db.prepare(
    `INSERT INTO ontology_enrich_job (id, user_id, ontology_id, status, model, total, done, created_at, updated_at)
     VALUES (?, ?, ?, 'queued', ?, ?, 0, ?, ?)`,
  ).run(id, userId, ontologyId, defaultModelLabel(userId), targets.length, now, now);

  void (async () => {
    try {
      updateJob(id, { status: 'running' });
      const suggestions = await runEnrichment(userId, row);
      const ins = db.prepare(
        `INSERT INTO ontology_enrich_draft (id, job_id, user_id, ontology_id, kind, field_name, payload_json, confidence, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      );
      const at = Date.now();
      const tx = db.transaction(() => {
        for (const s of suggestions) {
          ins.run(uuid(), id, userId, ontologyId, s.kind, s.field, JSON.stringify({ description: s.description, synonyms: s.synonyms, source: s.source }), s.confidence, at, at);
        }
      });
      tx();
      updateJob(id, { status: 'done', done: suggestions.length });
    } catch (e) {
      updateJob(id, { status: 'error', error: (e as Error).message });
    }
  })();

  return db.prepare('SELECT * FROM ontology_enrich_job WHERE id = ?').get(id) as EnrichJobRow;
}

export function listJobs(userId: string, ontologyId: string): EnrichJobRow[] {
  return db.prepare('SELECT * FROM ontology_enrich_job WHERE user_id = ? AND ontology_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(userId, ontologyId) as EnrichJobRow[];
}

export function getJob(userId: string, ontologyId: string, jobId: string): { job: EnrichJobRow; drafts: EnrichDraftRow[] } {
  const job = db.prepare('SELECT * FROM ontology_enrich_job WHERE id = ? AND user_id = ? AND ontology_id = ?')
    .get(jobId, userId, ontologyId) as EnrichJobRow | undefined;
  if (!job) throw new Error('富化任务不存在');
  const drafts = db.prepare('SELECT * FROM ontology_enrich_draft WHERE job_id = ? ORDER BY confidence DESC, created_at ASC')
    .all(jobId) as EnrichDraftRow[];
  return { job, drafts };
}

/** 采纳草稿：locked（已有描述）字段跳过，不覆盖人工成果 */
export function acceptDrafts(userId: string, ontologyId: string, ids: string[]): { accepted: number; skipped: number } {
  const row = getOntologyRow(userId, ontologyId);
  const dims = parseList<any>(row.dimensions_json);
  const times = parseList<any>(row.time_dimensions_json);
  const measures = parseList<any>(row.measures_json);
  let ontologyDescription = nonEmpty(row.description);

  const findList = (kind: EnrichKind) => (kind === 'dimension' ? dims : kind === 'time' ? times : kind === 'measure' ? measures : null);
  const query = db.prepare(
    "SELECT * FROM ontology_enrich_draft WHERE id = ? AND user_id = ? AND ontology_id = ? AND status = 'pending'",
  );
  const mark = db.prepare("UPDATE ontology_enrich_draft SET status = 'accepted', updated_at = ? WHERE id = ?");

  let accepted = 0;
  let skipped = 0;
  const tx = db.transaction(() => {
    for (const id of [...new Set(ids || [])]) {
      const d = query.get(id, userId, ontologyId) as EnrichDraftRow | undefined;
      if (!d) { skipped += 1; continue; }
      const payload = parseList<{ description?: string; synonyms?: string[] }>(`[${d.payload_json}]`)[0] || {};
      const description = nonEmpty((payload as any).description);
      const synonyms = Array.isArray((payload as any).synonyms) ? (payload as any).synonyms.map(String).filter(Boolean) : [];

      if (d.kind === 'ontology') {
        if (ontologyDescription || (!description && !synonyms.length)) { skipped += 1; continue; }
        ontologyDescription = description;
        mark.run(Date.now(), id);
        accepted += 1;
        continue;
      }
      const list = findList(d.kind);
      const field = list?.find((x: any) => x?.name === d.field_name);
      if (!field || isLocked(field) || (!description && !synonyms.length)) { skipped += 1; continue; }
      if (description) field.description = description;
      if (synonyms.length) field.synonyms = [...new Set([...(Array.isArray(field.synonyms) ? field.synonyms : []), ...synonyms])].slice(0, 12);
      mark.run(Date.now(), id);
      accepted += 1;
    }
    if (accepted) {
      db.prepare('UPDATE ontology SET description = ?, dimensions_json = ?, time_dimensions_json = ?, measures_json = ?, updated_at = ? WHERE id = ? AND user_id = ?')
        .run(ontologyDescription || null, JSON.stringify(dims), JSON.stringify(times), JSON.stringify(measures), Date.now(), ontologyId, userId);
    }
  });
  tx();
  return { accepted, skipped };
}

export function discardDrafts(userId: string, ontologyId: string, ids: string[]): number {
  const stmt = db.prepare(
    "UPDATE ontology_enrich_draft SET status = 'discarded', updated_at = ? WHERE id = ? AND user_id = ? AND ontology_id = ? AND status = 'pending'",
  );
  let n = 0;
  const tx = db.transaction(() => {
    for (const id of [...new Set(ids || [])]) n += stmt.run(Date.now(), id, userId, ontologyId).changes;
  });
  tx();
  return n;
}
