// 本地知识库服务 —— 供不登录（guest）模式使用：数据落在本地 adapter DB。
// 检索支持：Ollama embedding（走同机 11434 的 /api/embed）向量相似度，
// 无 embedding 时降级为关键词 LIKE。与登录态的服务端 kb（apps/server/src/services/kb.ts）互补。
import { getPlatformAdapter, type DatabaseAdapter } from '../platform/types';

// Ollama embedding 端点：同机 Ollama 服务，固定地址。
const OLLAMA_BASE = () => process.env.OLLAMA_BASE || 'http://127.0.0.1:11434';
const EMBEDDING_PREF = ['nomic-embed-text', 'bge-m3', 'bge-large-zh-v1.5', 'bge-small-zh-v1.5', 'mxbai-embed-large'];

interface KbBaseRow { id: string; name: string; description: string | null; created_at: number; updated_at: number; }
interface KbDocRow { id: string; base_id: string; name: string; content: string | null; source_path: string | null; metadata_json: string; created_at: number; updated_at: number; }
interface KbChunkRow { id: string; doc_id: string; base_id: string; chunk_index: number; content: string; embedding: Uint8Array | null; metadata_json: string; created_at: number; }

function uid(): string {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) return (crypto as any).randomUUID();
  return `kb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
function now(): number { return Date.now(); }
function toJson(v: unknown): string { try { return JSON.stringify(v ?? {}); } catch { return '{}'; } }
function fromJson<T>(v: string | null, fallback: T): T { if (!v) return fallback; try { return JSON.parse(v) as T; } catch { return fallback; } }

/** Ollama embedding（同机 Ollama，guest/登录都可用）。不可用返回 null。 */
let embeddingDown = false;
let cachedEmbedModel: string | null | undefined;
async function pickEmbedModel(): Promise<string | null> {
  if (cachedEmbedModel !== undefined) return cachedEmbedModel;
  try {
    const resp = await fetch(`${OLLAMA_BASE()}/api/tags`);
    if (!resp.ok) { cachedEmbedModel = null; return null; }
    const data = await resp.json() as { models?: Array<{ name: string }> };
    const names = (data.models || []).map((m) => m.name.toLowerCase());
    for (const pref of EMBEDDING_PREF) {
      const hit = (data.models || []).find((m) => m.name.toLowerCase() === pref || m.name.toLowerCase().startsWith(pref));
      if (hit) { cachedEmbedModel = hit.name; return hit.name; }
    }
    const embedLike = (data.models || []).find((m) => /embed|bge|e5/i.test(m.name));
    cachedEmbedModel = embedLike ? embedLike.name : null;
    return cachedEmbedModel;
  } catch { cachedEmbedModel = null; return null; }
}
export async function localEmbed(text: string): Promise<number[] | null> {
  if (embeddingDown) return null;
  try {
    const model = await pickEmbedModel();
    if (!model) { embeddingDown = true; return null; }
    const res = await fetch(`${OLLAMA_BASE()}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: String(text).slice(0, 8000) }),
    });
    if (!res.ok) {
      if (res.status === 404) embeddingDown = true;
      return null;
    }
    const json = await res.json() as { embeddings?: number[][]; embedding?: number[] };
    return json.embeddings?.[0] ?? json.embedding ?? null;
  } catch {
    embeddingDown = true;
    return null;
  }
}

function db(): DatabaseAdapter {
  return getPlatformAdapter().db;
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
function bytesToVec(b: Uint8Array | null): number[] | null {
  if (!b) return null;
  try { return Array.from(new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)); } catch { return null; }
}
function vecToBytes(v: number[] | null): Uint8Array | null {
  if (!v) return null;
  return new Uint8Array(new Float32Array(v).buffer);
}

// ── 切块（与服务端 kb.ts 一致：按段落 1200 字符 + 120 overlap）──
function chunkText(text: string, maxLength = 1200, overlap = 120): string[] {
  if (!text.trim()) return [];
  const normalized = text.replace(/\r\n/g, '\n');
  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buffer = '';
  for (const paragraph of paragraphs) {
    if ((buffer + '\n' + paragraph).length > maxLength && buffer) {
      chunks.push(buffer.trim());
      buffer = buffer.slice(-overlap) + '\n' + paragraph;
    } else {
      buffer = buffer ? `${buffer}\n${paragraph}` : paragraph;
    }
    while (buffer.length > maxLength) {
      const cut = buffer.slice(0, maxLength);
      chunks.push(cut.trim());
      buffer = buffer.slice(Math.max(0, maxLength - overlap));
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks;
}

// ── CRUD ──
export async function localListBases(): Promise<KbBaseRow[]> {
  return (await db().query<KbBaseRow>('SELECT * FROM knowledge_base ORDER BY updated_at DESC'));
}
export async function localCreateBase(input: { name: string; description?: string }) {
  const id = uid(); const ts = now();
  await db().exec('INSERT INTO knowledge_base (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [id, input.name, input.description || null, ts, ts]);
  return (await db().query<any>('SELECT * FROM knowledge_base WHERE id = ?', [id]))[0];
}
export async function localUpdateBase(id: string, input: { name?: string; description?: string }) {
  await db().exec('UPDATE knowledge_base SET name = COALESCE(?, name), description = COALESCE(?, description), updated_at = ? WHERE id = ?', [input.name ?? null, input.description ?? null, now(), id]);
  return (await db().query<any>('SELECT * FROM knowledge_base WHERE id = ?', [id]))[0];
}
export async function localDeleteBase(id: string) {
  await db().exec('DELETE FROM knowledge_chunk WHERE base_id = ?', [id]);
  await db().exec('DELETE FROM knowledge_doc WHERE base_id = ?', [id]);
  await db().exec('DELETE FROM knowledge_base WHERE id = ?', [id]);
}
export async function localListDocs(baseId: string): Promise<KbDocRow[]> {
  return (await db().query<KbDocRow>('SELECT * FROM knowledge_doc WHERE base_id = ? ORDER BY created_at DESC', [baseId])).map((r) => ({ ...r, metadata: fromJson(r.metadata_json, {}) }));
}
export async function localAddDoc(baseId: string, input: { name: string; content?: string; sourcePath?: string; metadata?: Record<string, unknown> }) {
  if (!input.name) throw new Error('文档名称为必填项');
  if (!input.content && !input.sourcePath) throw new Error('content 或 sourcePath 至少提供一个');
  const content = input.content || (input.sourcePath ? await getPlatformAdapter().fs.readFile(input.sourcePath) : '');
  const id = uid(); const ts = now();
  await db().exec(
    'INSERT INTO knowledge_doc (id, base_id, name, content, source_path, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, baseId, input.name, content || null, input.sourcePath || null, toJson(input.metadata), ts, ts],
  );
  const chunks = chunkText(content);
  // 向量化（尽力而为；embedding 不可用则存 null，检索降级关键词）
  const embeddings = await Promise.all(chunks.map((c) => localEmbed(c)));
  const ins = 'INSERT INTO knowledge_chunk (id, doc_id, base_id, chunk_index, content, embedding, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
  for (let i = 0; i < chunks.length; i++) {
    await db().exec(ins, [uid(), id, baseId, i, chunks[i], vecToBytes(embeddings[i] ?? null), '{}', ts]);
  }
  await db().exec('UPDATE knowledge_base SET updated_at = ? WHERE id = ?', [ts, baseId]);
  return { doc: (await db().query<any>('SELECT * FROM knowledge_doc WHERE id = ?', [id]))[0], chunkCount: chunks.length };
}
export async function localDeleteDoc(docId: string) {
  await db().exec('DELETE FROM knowledge_chunk WHERE doc_id = ?', [docId]);
  await db().exec('DELETE FROM knowledge_doc WHERE id = ?', [docId]);
}

// ── 检索 ──
export async function localSearch(baseId: string, query: string, topK = 5) {
  if (!query) throw new Error('query 为必填项');
  const limit = Math.min(Math.max(Number(topK) || 5, 1), 50);
  const qVec = await localEmbed(query);
  const rows = await db().query<KbChunkRow>('SELECT * FROM knowledge_chunk WHERE base_id = ? AND content != \'\'', [baseId]);
  if (!rows.length) return [];
  // 有 query 向量且存在 chunk 向量 → 余弦相似度排序
  if (qVec) {
    const pool = Math.min(limit * 3, 50);
    // 向量路：余弦相似度
    const vecList = rows
      .map((r) => {
        const cv = bytesToVec(r.embedding);
        return cv ? { row: r, score: cosine(qVec, cv) } : null;
      })
      .filter((x): x is { row: KbChunkRow; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, pool);
    // 关键词路：全串命中优先，分词命中补充（长 query 分词后更稳）
    const qLower = query.toLowerCase();
    const terms = qLower.split(/\s+/).filter((t) => t.length >= 2);
    const kwList = rows
      .map((r) => {
        const c = (r.content || '').toLowerCase();
        if (!c) return null;
        const exact = c.includes(qLower);
        const byTerm = terms.length > 1 && terms.some((t) => c.includes(t));
        if (!exact && !byTerm) return null;
        return { row: r, score: exact ? 1 : 0.5 };
      })
      .filter((x): x is { row: KbChunkRow; score: number } => x !== null)
      .sort((a, b) => b.score - a.score || a.row.content.length - b.row.content.length)
      .slice(0, pool);
    if (vecList.length === 0 && kwList.length === 0) return [];
    // RRF 融合（k=60）：两路排名倒数求和，专有名词与语义改写两类 query 都稳健
    const K = 60;
    const scores = new Map<string, { row: KbChunkRow; score: number }>();
    const addList = (list: Array<{ row: KbChunkRow; score: number }>) => {
      list.forEach((x, i) => {
        if (!x.row?.id) return;
        const s = 1 / (K + i + 1);
        const cur = scores.get(x.row.id);
        if (cur) cur.score += s;
        else scores.set(x.row.id, { row: x.row, score: s });
      });
    };
    addList(kwList);
    addList(vecList);
    return [...scores.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => ({ ...x.row, rrfScore: Number(x.score.toFixed(4)) }));
  }
  // 无向量 → 关键词 LIKE 降级
  const q = `%${query}%`;
  return db().query<KbChunkRow>(
    'SELECT * FROM knowledge_chunk WHERE base_id = ? AND content LIKE ? ORDER BY length(content) ASC LIMIT ?',
    [baseId, q, limit],
  );
}

/** 跨所有知识库检索（prompt 命中注入用）。返回带 baseName 的片段。 */
export async function localSearchAll(query: string, topK = 5): Promise<KbChunkRow[] & Array<{ baseName?: string }>> {
  const bases = await localListBases();
  const out: any[] = [];
  for (const b of bases) {
    const hits = await localSearch(b.id, query, Math.ceil(topK));
    for (const h of hits) out.push({ ...h, baseName: b.name });
    if (out.length >= topK) break;
  }
  return out.slice(0, topK);
}
