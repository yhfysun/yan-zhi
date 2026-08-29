import { v4 as uuid } from 'uuid';
import { readFile } from 'node:fs/promises';
import { db, hasSqliteVec } from '../db.js';
import { embedText, ollamaChat } from './ollama-embed.js';

function now() {
  return Date.now();
}

// ── 向量检索辅助：与 packages/core/src/kb/local-knowledge.ts 一致的 Float32 编码 + 余弦相似度 ──
function vecToBytes(v: number[] | null): Uint8Array | null {
  if (!v) return null;
  return new Uint8Array(new Float32Array(v).buffer);
}
function bytesToVec(b: Uint8Array | Buffer | null): number[] | null {
  if (!b) return null;
  try {
    const u = b instanceof Uint8Array ? b : new Uint8Array(b as any);
    return Array.from(new Float32Array(u.buffer, u.byteOffset, u.byteLength / 4));
  } catch {
    return null;
  }
}
function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function rowToBase(r: any) {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    description: r.description,
    visibility: r.visibility || 'private',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** guest 用户只能建 public 库（共享）；普通用户默认 private，可自行指定 */
function resolveVisibility(userId: string, input: { visibility?: string }): string {
  if (userId === 'guest') return 'public';
  return input.visibility === 'public' ? 'public' : 'private';
}

/** 读权限：库主 或 public 可读（guest 身份也遵循 public 才可见/可写自己建的） */
function canReadBase(userId: string, base: any): boolean {
  const owner = base.user_id || base.userId;
  if (owner === userId) return true;
  return (base.visibility || 'private') === 'public';
}

/** 写权限：仅库主可改文档/增删；普通用户对他人 public 库只读 */
function canWriteBase(userId: string, base: any): boolean {
  const owner = base.user_id || base.userId;
  return owner === userId;
}

function rowToDoc(r: any) {
  return {
    id: r.id,
    baseId: r.base_id,
    name: r.name,
    content: r.content,
    sourcePath: r.source_path,
    metadata: r.metadata_json ? JSON.parse(r.metadata_json) : {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToChunk(r: any) {
  return {
    id: r.id,
    docId: r.doc_id,
    baseId: r.base_id,
    chunkIndex: r.chunk_index,
    content: r.content,
    metadata: r.metadata_json ? JSON.parse(r.metadata_json) : {},
    createdAt: r.created_at,
  };
}

export function listKnowledgeBases(userId: string) {
  // guest：仅见所有 public 库；登录用户：自己的全部 + 他人 public
  const rows = userId === 'guest'
    ? db.prepare("SELECT * FROM knowledge_base WHERE visibility = 'public' ORDER BY updated_at DESC").all()
    : db.prepare("SELECT * FROM knowledge_base WHERE user_id = ? OR visibility = 'public' ORDER BY updated_at DESC").all(userId);
  return (rows as any[]).map(rowToBase);
}

/** 挂载的知识库列表（供 AI 查询/选择 baseId 用）：所有可见库 + 内置「应用使用说明」（默认挂载，始终在列）。 */
export function listMountedKnowledgeBases(userId: string) {
  const list = listKnowledgeBases(userId).map((b) => ({ ...b, mounted: true, builtin: false, defaultMounted: false }));
  // 内置「应用使用说明」保证在列（默认挂载）
  let builtin = list.find((b) => b.id === BUILTIN_GUIDE_BASE_ID);
  if (!builtin) {
    const row = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(BUILTIN_GUIDE_BASE_ID) as any;
    if (row) builtin = { ...rowToBase(row), mounted: true, builtin: true, defaultMounted: true };
  }
  if (builtin) {
    builtin.mounted = true;
    builtin.builtin = true;
    builtin.defaultMounted = true;
    const others = list.filter((b) => b.id !== BUILTIN_GUIDE_BASE_ID);
    return [builtin, ...others];
  }
  return list;
}

export function createKnowledgeBase(userId: string, input: { name: string; description?: string; visibility?: string }) {
  if (!input.name) throw new Error('知识库名称为必填项');
  const id = uuid();
  const ts = now();
  const visibility = resolveVisibility(userId, input);
  db.prepare(
    'INSERT INTO knowledge_base (id, user_id, name, description, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, userId, input.name, input.description || null, visibility, ts, ts);
  return rowToBase(db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(id));
}

export function getKnowledgeBase(userId: string, baseId: string) {
  const row = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(baseId) as any;
  if (!row) throw new Error('知识库不存在');
  if (!canReadBase(userId, row)) throw new Error('无权访问该知识库');
  return rowToBase(row);
}

export function updateKnowledgeBase(userId: string, baseId: string, input: { name?: string; description?: string; visibility?: string }) {
  const existing = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(baseId) as any;
  if (!existing) throw new Error('知识库不存在');
  if (!canWriteBase(userId, existing)) throw new Error('无权修改该知识库');
  // guest 建的库固定 public，不允许改为 private（访客数据默认共享）
  const sets: string[] = [];
  const vals: any[] = [];
  if (input.name !== undefined) {
    sets.push('name = ?');
    vals.push(input.name);
  }
  if (input.description !== undefined) {
    sets.push('description = ?');
    vals.push(input.description);
  }
  if (input.visibility !== undefined && existing.user_id !== 'guest') {
    sets.push('visibility = ?');
    vals.push(input.visibility === 'public' ? 'public' : 'private');
  }
  if (sets.length === 0) return rowToBase(existing);
  sets.push('updated_at = ?');
  vals.push(now(), baseId);
  db.prepare(`UPDATE knowledge_base SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return rowToBase(db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(baseId));
}

export function deleteKnowledgeBase(userId: string, baseId: string) {
  const existing = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(baseId) as any;
  if (!existing) throw new Error('知识库不存在');
  if (!canWriteBase(userId, existing)) throw new Error('无权删除该知识库');
  db.prepare('DELETE FROM knowledge_chunk WHERE base_id = ?').run(baseId);
  db.prepare('DELETE FROM knowledge_doc WHERE base_id = ?').run(baseId);
  db.prepare('DELETE FROM knowledge_base WHERE id = ?').run(baseId);
  return true;
}

export function listKnowledgeDocs(userId: string, baseId: string) {
  const base = getKnowledgeBase(userId, baseId);
  const rows = db.prepare(
    'SELECT * FROM knowledge_doc WHERE base_id = ? ORDER BY created_at DESC',
  ).all(base.id);
  return (rows as any[]).map(rowToDoc);
}

export async function addKnowledgeDoc(
  userId: string,
  baseId: string,
  input: { name: string; content?: string; sourcePath?: string; metadata?: Record<string, unknown> },
) {
  const base = getKnowledgeBase(userId, baseId);
  if (!canWriteBase(userId, base)) throw new Error('无权向该知识库添加文档');
  if (!input.name) throw new Error('文档名称为必填项');
  if (!input.content && !input.sourcePath) throw new Error('content 或 sourcePath 至少提供一个');
  const content = input.content || (input.sourcePath ? await readFile(input.sourcePath, 'utf8') : '');
  const id = uuid();
  const ts = now();
  db.prepare(
    `INSERT INTO knowledge_doc
      (id, base_id, user_id, name, content, source_path, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    base.id,
    base.userId,
    input.name,
    content || null,
    input.sourcePath || null,
    JSON.stringify(input.metadata || {}),
    ts,
    ts,
  );

  const chunks = chunkText(content);
  const insertChunk = db.prepare(
    `INSERT INTO knowledge_chunk
      (id, doc_id, base_id, user_id, chunk_index, content, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const chunkIds: string[] = [];
  for (const [index, text] of chunks.entries()) {
    const cid = uuid();
    chunkIds.push(cid);
    insertChunk.run(cid, id, base.id, base.userId, index, text, '{}', ts);
  }
  db.prepare('UPDATE knowledge_base SET updated_at = ? WHERE id = ?').run(ts, base.id);

  // fire-and-forget 生成 embedding（不阻塞返回；模型不可用则跳过，检索降级为 LIKE）
  if (chunkIds.length > 0) {
    embedChunksInBackground(chunkIds, chunks).catch(() => undefined);
  }

  return {
    doc: rowToDoc(db.prepare('SELECT * FROM knowledge_doc WHERE id = ?').get(id)),
    chunkCount: chunks.length,
  };
}

/** 后台批量生成 chunk embedding 并写库。失败静默跳过（检索自动降级为 LIKE）。 */
async function embedChunksInBackground(chunkIds: string[], texts: string[]) {
  for (let i = 0; i < chunkIds.length; i++) {
    try {
      const vec = await embedText(texts[i]);
      if (!vec) continue;
      const bytes = vecToBytes(vec);
      if (bytes) db.prepare('UPDATE knowledge_chunk SET embedding = ? WHERE id = ?').run(Buffer.from(bytes), chunkIds[i]);
    } catch {
      // 单条失败不影响其他 chunk
    }
  }
}

// ── 重新向量化：切换 embedding 模型后，用新模型重新生成所有 chunk 的向量 ──
let revectorizeStatus: { running: boolean; total: number; done: number; error: string } = {
  running: false, total: 0, done: 0, error: '',
};

export function getRevectorizeStatus() {
  return { ...revectorizeStatus };
}

/** 重新向量化所有知识库 chunk（全局）。清除旧 embedding → 用当前 embedding 模型重新生成。 */
export async function revectorizeAllKnowledgeBases(): Promise<{ total: number; done: number }> {
  if (revectorizeStatus.running) {
    throw new Error('重新向量化正在进行中，请等待完成');
  }
  const chunks = db.prepare('SELECT id, content FROM knowledge_chunk').all() as any[];
  // 清除所有旧 embedding
  db.prepare('UPDATE knowledge_chunk SET embedding = NULL').run();
  revectorizeStatus = { running: true, total: chunks.length, done: 0, error: '' };
  try {
    for (const chunk of chunks) {
      try {
        const vec = await embedText(chunk.content || '');
        if (vec) {
          const bytes = vecToBytes(vec);
          if (bytes) {
            db.prepare('UPDATE knowledge_chunk SET embedding = ? WHERE id = ?').run(Buffer.from(bytes), chunk.id);
          }
        }
      } catch {
        // 单条失败跳过
      }
      revectorizeStatus.done++;
    }
    return { total: revectorizeStatus.total, done: revectorizeStatus.done };
  } catch (error) {
    revectorizeStatus.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    revectorizeStatus.running = false;
  }
}

const BUILTIN_GUIDE_BASE_ID = 'builtin-app-guide';
const BUILTIN_GUIDE_BASE_NAME = '应用使用说明';

/** 确保内置「应用使用说明」作为普通知识库存在（固定 id，public，owner=guest）。
 *  该库由系统维护：无文档时用 content 创建一份（走正常切分 → 出现在分片/图谱）。
 *  不额外校验当前用户（系统级库，所有人可读，访问走 visibility=public）。 */
export async function ensureBuiltinAppGuide(userId: string, docs: Array<{ name?: string; content?: string }>) {
  const owner = 'guest';
  const existing = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(BUILTIN_GUIDE_BASE_ID) as any;
  if (!existing) {
    const ts = now();
    db.prepare(
      'INSERT INTO knowledge_base (id, user_id, name, description, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(BUILTIN_GUIDE_BASE_ID, owner, BUILTIN_GUIDE_BASE_NAME, '内置的应用使用说明（系统库，公开共享，无需发布）', 'public', ts, ts);
  }
  const base = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(BUILTIN_GUIDE_BASE_ID) as any;
  if (!base) throw new Error('内置库创建失败');
  const expect = Array.isArray(docs) && docs.length ? docs.length : 1;
  const docCount = (db.prepare('SELECT COUNT(*) AS c FROM knowledge_doc WHERE base_id = ?').get(BUILTIN_GUIDE_BASE_ID) as any).c;
  // 结构一致则复用；不一致（如旧版单文档）则按新的 docs 重建
  if (docCount === expect) return { baseId: BUILTIN_GUIDE_BASE_ID, seeded: false, docCount };
  const old = db.prepare('SELECT id FROM knowledge_doc WHERE base_id = ?').all(BUILTIN_GUIDE_BASE_ID) as any[];
  for (const d of old) {
    db.prepare('DELETE FROM knowledge_chunk WHERE doc_id = ?').run(d.id);
    db.prepare('DELETE FROM knowledge_doc WHERE id = ?').run(d.id);
  }
  const seeded = seedGuideDocs(owner, BUILTIN_GUIDE_BASE_ID, docs);
  return { baseId: BUILTIN_GUIDE_BASE_ID, seeded: true, docCount: seeded };
}

/** 按「一个功能一个文档」写入分片化的说明文档。返回写入文档数。 */
function seedGuideDocs(owner: string, baseId: string, docs: Array<{ name?: string; content?: string }>) {
  const list = Array.isArray(docs) && docs.length ? docs : [{ name: BUILTIN_GUIDE_BASE_NAME, content: '' }];
  const ts = now();
  const insertChunk = db.prepare(
    'INSERT INTO knowledge_chunk (id, doc_id, base_id, user_id, chunk_index, content, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const d of list) {
    const name = String(d?.name || '').trim() || '应用使用说明';
    const content = String(d?.content || '');
    const id = uuid();
    db.prepare(
      'INSERT INTO knowledge_doc (id, base_id, user_id, name, content, source_path, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, baseId, owner, name, content || null, null, '{}', ts, ts);
    const chunks = chunkText(content || '');
    for (const [index, text] of chunks.entries()) insertChunk.run(uuid(), id, baseId, owner, index, text, '{}', ts);
    db.prepare('UPDATE knowledge_base SET updated_at = ? WHERE id = ?').run(ts, baseId);
  }
  return list.length;
}

/** 重置内置「应用使用说明」：清空旧文档+分片，按 docs（一个功能一个文档）重新写入。 */
export function resetBuiltinAppGuide(userId: string, docs: Array<{ name?: string; content?: string }>) {
  const base = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(BUILTIN_GUIDE_BASE_ID) as any;
  if (!base) throw new Error('内置库不存在');
  const old = db.prepare('SELECT id FROM knowledge_doc WHERE base_id = ?').all(BUILTIN_GUIDE_BASE_ID) as any[];
  for (const d of old) {
    db.prepare('DELETE FROM knowledge_chunk WHERE doc_id = ?').run(d.id);
    db.prepare('DELETE FROM knowledge_doc WHERE id = ?').run(d.id);
  }
  // 清掉旧实体/关系/切片关联 + 已处理标记，让重置后重新抽取
  db.prepare('DELETE FROM kb_entity_chunk WHERE base_id = ?').run(BUILTIN_GUIDE_BASE_ID);
  db.prepare('DELETE FROM kb_relation WHERE base_id = ?').run(BUILTIN_GUIDE_BASE_ID);
  db.prepare('DELETE FROM kb_entity WHERE base_id = ?').run(BUILTIN_GUIDE_BASE_ID);
  db.prepare('DELETE FROM kb_processed_doc WHERE base_id = ?').run(BUILTIN_GUIDE_BASE_ID);
  const count = seedGuideDocs('guest', BUILTIN_GUIDE_BASE_ID, docs);
  return { seeded: true, docCount: count };
}

export function deleteKnowledgeDoc(userId: string, docId: string) {
  const existing = db.prepare('SELECT * FROM knowledge_doc WHERE id = ?').get(docId) as any;
  if (!existing) throw new Error('文档不存在');
  const base = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(existing.base_id) as any;
  if (!base || !canWriteBase(userId, base)) throw new Error('无权删除该文档');
  db.prepare('DELETE FROM knowledge_chunk WHERE doc_id = ?').run(docId);
  db.prepare('DELETE FROM knowledge_doc WHERE id = ?').run(docId);
  db.prepare('UPDATE knowledge_base SET updated_at = ? WHERE id = ?').run(now(), existing.base_id);
  return true;
}

/** 列出某知识库的分片节点（可按文档过滤），用于「分片关系/节点」可视化。 */
export function listKnowledgeChunks(userId: string, baseId: string, docId?: string) {
  const base = getKnowledgeBase(userId, baseId); // 已校验读权限
  const rows = docId
    ? db.prepare(
        'SELECT c.*, d.name AS doc_name FROM knowledge_chunk c LEFT JOIN knowledge_doc d ON d.id = c.doc_id WHERE c.base_id = ? AND c.doc_id = ? ORDER BY c.chunk_index ASC',
      ).all(base.id, docId)
    : db.prepare(
        'SELECT c.*, d.name AS doc_name FROM knowledge_chunk c LEFT JOIN knowledge_doc d ON d.id = c.doc_id WHERE c.base_id = ? ORDER BY d.name ASC, c.chunk_index ASC',
      ).all(base.id);
  return (rows as any[]).map((r) => ({ ...rowToChunk(r), docName: r.doc_name || '' }));
}

export function searchKnowledgeBase(userId: string, baseId: string, query: string, topK = 5) {
  const base = getKnowledgeBase(userId, baseId); // 已校验读权限
  if (!query) throw new Error('query 为必填项');
  const limit = Math.min(Math.max(Number(topK) || 5, 1), 50);
  const q = `%${query}%`;
  const rows = db.prepare(
    `SELECT * FROM knowledge_chunk
     WHERE base_id = ? AND content LIKE ?
     ORDER BY
       CASE WHEN content LIKE ? THEN 0 ELSE 1 END,
       length(content) ASC
     LIMIT ?`,
  ).all(base.id, q, q, limit);
  return (rows as any[]).map(rowToChunk);
}

/**
 * 跨该用户可见的所有知识库检索（prompt 命中注入 + 知识查询工具共用）：
 * 登录用户=自己的+public；guest=仅 public。返回携带 库/文档 归属，便于多跳与图谱。
 */
export function searchAllKnowledgeBases(userId: string, query: string, topK = 5) {
  if (!query) throw new Error('query 为必填项');
  const limit = Math.min(Math.max(Number(topK) || 5, 1), 30);
  const q = `%${query}%`;
  const sql = `SELECT c.*, b.name AS base_name, b.user_id AS owner_id, d.name AS doc_name
     FROM knowledge_chunk c
     JOIN knowledge_base b ON b.id = c.base_id
     LEFT JOIN knowledge_doc d ON d.id = c.doc_id
     WHERE ${userId === 'guest' ? "b.visibility = 'public'" : "(b.user_id = ? OR b.visibility = 'public')"}
     AND c.content LIKE ?
     ORDER BY CASE WHEN c.content LIKE ? THEN 0 ELSE 1 END, length(c.content) ASC
     LIMIT ?`;
  const args: unknown[] = userId === 'guest' ? [q, q, limit] : [userId, q, q, limit];
  const rows = db.prepare(sql).all(...args);
  return (rows as any[]).map((r) => ({
    ...rowToChunk(r), baseName: r.base_name, docName: r.doc_name || '', docId: r.doc_id, baseId: r.base_id,
  }));
}

// ── 向量检索：生成 query embedding → 拉取有 embedding 的 chunk → JS 端余弦相似度排序 ──
// 与 packages/core/src/kb/local-knowledge.ts 一致；embedding 缺失/模型不可用返回 null（调用方降级 LIKE）

/** 单库向量检索。返回 null 表示无法向量检索（应降级）。 */
export async function vectorSearchChunks(userId: string, baseId: string, query: string, topK = 5): Promise<any[] | null> {
  if (!hasSqliteVec) return null;
  if (!query) return null;
  const base = getKnowledgeBase(userId, baseId); // 校验读权限
  const qVec = await embedText(query);
  if (!qVec) return null;
  const limit = Math.min(Math.max(Number(topK) || 5, 1), 50);
  const rows = db.prepare(
    'SELECT * FROM knowledge_chunk WHERE base_id = ? AND embedding IS NOT NULL',
  ).all(base.id) as any[];
  const scored = rows
    .map((r) => {
      const v = bytesToVec(r.embedding);
      if (!v) return null;
      return { r, score: cosine(qVec, v) };
    })
    .filter((x): x is { r: any; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((x) => ({ ...rowToChunk(x.r), score: x.score }));
}

/** 跨所有可见库向量检索。返回 null 表示无法向量检索（应降级）。 */
export async function vectorSearchAll(userId: string, query: string, topK = 5): Promise<any[] | null> {
  if (!hasSqliteVec) return null;
  if (!query) return null;
  const qVec = await embedText(query);
  if (!qVec) return null;
  const limit = Math.min(Math.max(Number(topK) || 5, 1), 30);
  const sql = `SELECT c.*, b.name AS base_name, b.user_id AS owner_id, d.name AS doc_name
     FROM knowledge_chunk c
     JOIN knowledge_base b ON b.id = c.base_id
     LEFT JOIN knowledge_doc d ON d.id = c.doc_id
     WHERE ${userId === 'guest' ? "b.visibility = 'public'" : "(b.user_id = ? OR b.visibility = 'public')"}
     AND c.embedding IS NOT NULL`;
  const args: unknown[] = userId === 'guest' ? [] : [userId];
  const rows = db.prepare(sql).all(...args) as any[];
  const scored = rows
    .map((r) => {
      const v = bytesToVec(r.embedding);
      if (!v) return null;
      return { r, score: cosine(qVec, v) };
    })
    .filter((x): x is { r: any; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((x) => ({
    ...rowToChunk(x.r), score: x.score, baseName: x.r.base_name, docName: x.r.doc_name || '', docId: x.r.doc_id, baseId: x.r.base_id,
  }));
}

/**
 * 多跳检索（知识查询工具用）：命中 → 一跳=同文档相邻片段+同库相关片段 → 二跳=一跳邻接库/文档的相似片段。
 * 返回带 hop 标记的关联链路，前端可选高亮。
 */
export function multiHopSearchKnowledge(userId: string, query: string, topK = 3, hops = 2) {
  const first = searchAllKnowledgeBases(userId, query, topK);
  if (first.length === 0) return [];
  const out: any[] = first.map((c) => ({ ...c, hop: 1, reason: '关键词命中' }));
  const seen = new Set(first.map((c) => c.id));
  const qw = query.trim().split(/\s+/).filter(Boolean).slice(0, 4); // 前几个词做关联
  let frontier = first;
  for (let h = 2; h <= hops; h += 1) {
    const next: any[] = [];
    for (const hit of frontier) {
      // 一跳 a) 同文档相邻片段（chunk_index 附近的邻居）
      if (hit.docId) {
        const neighbors = db.prepare(
          `SELECT c.*, b.name AS base_name, b.user_id AS owner_id, d.name AS doc_name
           FROM knowledge_chunk c
           JOIN knowledge_base b ON b.id = c.base_id
           LEFT JOIN knowledge_doc d ON d.id = c.doc_id
           WHERE c.doc_id = ? AND c.id != ? AND ABS(c.chunk_index - ?) <= 2
           LIMIT 3`,
        ).all(hit.docId, hit.id, hit.chunkIndex || 0) as any[];
        for (const n of neighbors) {
          if (seen.has(n.id)) continue;
          seen.add(n.id);
          next.push({ ...rowToChunk(n), baseName: n.base_name, docName: n.doc_name || '', docId: n.doc_id, baseId: n.base_id, hop: h, reason: '同文档相邻片段' });
        }
      }
      // 一跳 b) 同库内其它文档，用原词/关联词再命中
      const related = db.prepare(
        `SELECT c.*, b.name AS base_name, b.user_id AS owner_id, d.name AS doc_name
         FROM knowledge_chunk c
         JOIN knowledge_base b ON b.id = c.base_id
         LEFT JOIN knowledge_doc d ON d.id = c.doc_id
         WHERE c.base_id = ? AND c.id != ? AND (${qw.map(() => 'c.content LIKE ?').join(' OR ')})
         LIMIT 2`,
      ).all(hit.baseId, hit.id, ...qw.map((w) => `%${w}%`)) as any[];
      for (const n of related) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        next.push({ ...rowToChunk(n), baseName: n.base_name, docName: n.doc_name || '', docId: n.doc_id, baseId: n.base_id, hop: h, reason: '同库相关片段' });
      }
    }
    if (next.length === 0) break;
    out.push(...next);
    frontier = next;
  }
  return out;
}

/** 可见库 id 列表（guest=全部 public；登录=自己的+public） */
function visibleBaseIds(userId: string): string[] {
  const rows = userId === 'guest'
    ? db.prepare("SELECT id FROM knowledge_base WHERE visibility = 'public'").all()
    : db.prepare("SELECT id FROM knowledge_base WHERE user_id = ? OR visibility = 'public'").all(userId);
  return (rows as any[]).map((r) => r.id);
}

/**
 * 实体导向多跳查询：
 * 1) Query 匹配实体（命中实体名/描述，或实体关联切片命中 query）；
 * 2) 返回每个命中实体的关联切片；
 * 3) 沿 kb_relation 做 BFS 扩展，最多 maxHops（可配，上限 3）级——每级关联实体的切片都取回。
 * 返回带 hop / entity / reason 的分片列表。
 */
export function entityGraphSearch(userId: string, query: string, maxHops = 3, topPerEntity = 3, onlyBaseIds?: string[]) {
  if (!query) throw new Error('query 为必填项');
  const hops = Math.min(Math.max(Number(maxHops) || 3, 1), 3); // 最多 3 级关联
  const per = Math.min(Math.max(Number(topPerEntity) || 3, 1), 10);
  const allVisible = visibleBaseIds(userId);
  const baseIds = onlyBaseIds && onlyBaseIds.length
    ? onlyBaseIds.filter((id) => allVisible.includes(id))
    : allVisible;
  if (baseIds.length === 0) return [];
  const q = query.trim();
  const placeholders = baseIds.map(() => '?').join(',');
  const out: any[] = [];
  const seen = new Set<string>();
  // 每库：实体 → 实体id / 关系邻接
  const entityIdByName: Map<string, Map<string, string>> = new Map();
  const adjacency: Map<string, Map<string, Array<{ id: string; relation: string }>>> = new Map(); // baseId -> entityId -> [{id,relation}]
  const chunkMap: Map<string, Map<string, Array<{ id: string; content: string; chunkIndex: number; docId: string; baseId: string; baseName: string; docName: string }>>> = new Map(); // baseId -> entityId -> chunks
  const baseNameById = new Map(baseIds.map((id) => [id, (db.prepare('SELECT name FROM knowledge_base WHERE id = ?').get(id) as any)?.name || '']));

  for (const baseId of baseIds) {
    const ents = db.prepare('SELECT id, name, description FROM kb_entity WHERE base_id = ?').all(baseId) as any[];
    const idx = new Map<string, string>();
    entityIdByName.set(baseId, idx);
    const adj = new Map<string, Array<{ id: string; relation: string }>>();
    adjacency.set(baseId, adj);
    const cmap = new Map<string, Array<any>>();
    chunkMap.set(baseId, cmap);
    for (const e of ents) idx.set(e.name, e.id);

    // 邻接
    const rels = db.prepare('SELECT source, target, relation FROM kb_relation WHERE base_id = ?').all(baseId) as any[];
    for (const r of rels) {
      const s = idx.get(r.source), t = idx.get(r.target);
      if (s && t) {
        if (!adj.has(s)) adj.set(s, []);
        adj.get(s)!.push({ id: t, relation: r.relation });
      }
    }
    // 实体 → 切片
    const links = db.prepare(
      `SELECT ec.entity_id, ec.chunk_id, c.content, c.chunk_index, c.doc_id
       FROM kb_entity_chunk ec
       JOIN knowledge_chunk c ON c.id = ec.chunk_id
       WHERE ec.base_id = ?`,
    ).all(baseId) as any[];
    for (const l of links) {
      const arr = cmap.get(l.entity_id) || [];
      arr.push({ id: l.chunk_id, content: l.content || '', chunkIndex: l.chunk_index, docId: l.doc_id, baseId, baseName: baseNameById.get(baseId) || '' });
      cmap.set(l.entity_id, arr);
    }
  }

  // ----- 1) 匹配种子实体 -----
  const seedEntities: Array<{ baseId: string; entityId: string; entityName: string; reason: string }> = [];
  for (const baseId of baseIds) {
    const idx = entityIdByName.get(baseId)!;
    const ents = db.prepare('SELECT id, name, description FROM kb_entity WHERE base_id = ?').all(baseId) as any[];
    for (const e of ents) {
      // 实体名被 query 完整/子串命中（实体名即唯一标识，优先）
      if (q.includes(e.name) || e.name.includes(q) || q === e.name) {
        seedEntities.push({ baseId, entityId: e.id, entityName: e.name, reason: '实体名命中' });
        continue;
      }
      // 描述命中 query 词
      if (e.description && e.description.split(/[\s,，。]+/).some((w: string) => w && q.includes(w))) {
        seedEntities.push({ baseId, entityId: e.id, entityName: e.name, reason: '实体描述命中' });
        continue;
      }
      // 实体关联切片里命中 query（宽松）
      const cmap = chunkMap.get(baseId)!.get(e.id) || [];
      if (cmap.some((c) => c.content && c.content.includes(q))) {
        seedEntities.push({ baseId, entityId: e.id, entityName: e.name, reason: '关联切片命中' });
      }
    }
  }

  // ----- 2) BFS 扩展 1..hops 级，取每级关联实体的切片 -----
  const outEntities: Array<{ baseId: string; entityId: string; entityName: string; hop: number; via?: string }> = [];
  const queue = seedEntities.map((s) => ({ ...s, hop: 1 }));
  const visitedEnt = new Set<string>(seedEntities.map((s) => `${s.baseId}:${s.entityId}`));
  while (queue.length) {
    const cur = queue.shift()!;
    outEntities.push({ baseId: cur.baseId, entityId: cur.entityId, entityName: cur.entityName, hop: cur.hop, via: cur.reason });
    if (cur.hop >= hops) continue;
    const adj = adjacency.get(cur.baseId)?.get(cur.entityId) || [];
    for (const n of adj) {
      const key = `${cur.baseId}:${n.id}`;
      if (visitedEnt.has(key)) continue;
      visitedEnt.add(key);
      const name = [...(entityIdByName.get(cur.baseId)?.keys() || [])].find((k) => entityIdByName.get(cur.baseId)!.get(k) === n.id) || '';
      queue.push({ baseId: cur.baseId, entityId: n.id, entityName: name, hop: cur.hop + 1, reason: `经「${cur.entityName} ─${n.relation}→ 」关联` });
    }
  }

  // 收集切片
  for (const e of outEntities) {
    const chunks = (chunkMap.get(e.baseId)?.get(e.entityId) || []).slice(0, per);
    for (const c of chunks) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const docName = (c.docId ? (db.prepare('SELECT name FROM knowledge_doc WHERE id = ?').get(c.docId) as any)?.name : '') || '';
      out.push({ ...c, docName, entity: e.entityName, hop: e.hop, via: e.via || '', reason: e.via || '实体关联' });
    }
  }
  return out;
}

/** 按知识库分组的多跳查询：baseIds 为空/只传 ['*'] 时查所有可见（含内置挂载）库；否则只查指定库。返回 { [baseId]: chunks[] }。 */
export function entityGraphSearchGrouped(userId: string, query: string, baseIds?: string[], maxHops = 3, topPerEntity = 3) {
  const visible = visibleBaseIds(userId);
  const targets = baseIds && baseIds.length && !baseIds.includes('*')
    ? baseIds.filter((b) => visible.includes(b))
    : visible;
  const grouped: Record<string, any[]> = {};
  for (const baseId of targets) {
    const rows = entityGraphSearch(userId, query, maxHops, topPerEntity, [baseId]);
    if (rows.length) grouped[baseId] = rows;
  }
  return grouped;
}
export function getKnowledgeGraph(userId: string, baseId: string) {
  const base = getKnowledgeBase(userId, baseId);
  const docs = listKnowledgeDocs(userId, base.id);
  const chunks = listKnowledgeChunks(userId, base.id);
  const nodes: any[] = [{ id: `b:${base.id}`, type: 'base', label: base.name, sub: base.visibility === 'public' ? '公开' : '私有' }];
  const edges: any[] = [];
  const docToChunks = new Map<string, any[]>();
  for (const c of chunks) {
    const k = c.docId || 'none';
    if (!docToChunks.has(k)) docToChunks.set(k, []);
    docToChunks.get(k)!.push(c);
  }
  for (const d of docs) {
    nodes.push({ id: `d:${d.id}`, type: 'doc', label: d.name, sub: '' });
    edges.push({ source: `b:${base.id}`, target: `d:${d.id}` });
  }
  for (const [docId, items] of docToChunks) {
    const doc = docs.find((x) => x.id === docId);
    const docNodeId = doc ? `d:${doc.id}` : `d:(无)`;
    if (!doc && !nodes.some((n) => n.id === docNodeId)) nodes.push({ id: docNodeId, type: 'doc', label: '(无归属文档)', sub: '' });
    if (!doc && !edges.some((e) => e.source === `b:${base.id}` && e.target === docNodeId)) edges.push({ source: `b:${base.id}`, target: docNodeId });
    for (const c of items) {
      const cid = `c:${c.id}`;
      nodes.push({ id: cid, type: 'chunk', label: `片 ${c.chunkIndex}`, sub: (c.content || '').slice(0, 30), content: c.content || '', docName: doc?.name || '' });
      edges.push({ source: docNodeId, target: cid });
    }
  }
  return { base, nodes, edges };
}

// ================= 实体关系图谱（抽取 + 融合 + 展示） =================

const EXTRACT_SYSTEM = `你是「知识库实体抽取与关系融合」引擎。
你要从给定的知识分片中抽取「实体（名称/描述）和实体间关系」，并与「已有实体图谱」融合。

输出必须是严格 JSON，不要输出任何其它文字或 markdown：
{"entities":[{"name":"实体名","description":"一句话描述"}],"relations":[{"source":"实体A","target":"实体B","relation":"关系短语"}],"chunks":[{"chunkId":"cid","entityNames":["本分片提到的实体名"]}]}

规则：
- 实体 name 是唯一标识。若与「已有实体」同名，必须复用该 name，并取两者中更完整准确的描述融合。
- relation 的 source/target 必须用实体 name。
- 只抽取文档里确实描述、对回答案有帮助的事实与关系；不要捏造。
- 若某实体/关系在已有图谱中已被更完整覆盖，可保留即可；新信息则补充或修正。
- chunks 里每个 chunkId 列出该分片贡献/关联到的实体名（用于点击实体回溯原文切片）。`;

/** 获得当前主体图谱快照（供增量融合时作为 LLM 输入） */
function graphSnapshot(baseId: string): { entities: Array<{ name: string; description: string }>; relations: Array<{ source: string; target: string; relation: string }> } {
  const entities = (db.prepare('SELECT name, description FROM kb_entity WHERE base_id = ?').all(baseId) as any[]).map((r) => ({ name: r.name, description: r.description || '' }));
  const relations = (db.prepare('SELECT source, target, relation FROM kb_relation WHERE base_id = ?').all(baseId) as any[]).map((r) => ({ source: r.source, target: r.target, relation: r.relation }));
  return { entities, relations };
}

function parseJsonOf(text: string): any {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}

/** 增量提取实体图谱：对未处理文档的分片，用本地大模型抽取 + 与已有图谱融合。返回是否有可用本地模型。 */
export async function extractEntityGraph(userId: string, baseId: string): Promise<{ ok: boolean; processed: number; error?: string }> {
  const base = getKnowledgeBase(userId, baseId);
  const unprocessed = db.prepare(
    'SELECT id FROM knowledge_doc WHERE base_id = ? AND id NOT IN (SELECT doc_id FROM kb_processed_doc WHERE base_id = ?)',
  ).all(base.id, baseId) as any[];
  if (unprocessed.length === 0) return { ok: true, processed: 0 };
  const ts = now();
  let fused = graphSnapshot(baseId);
  let processed = 0;
  for (const doc of unprocessed) {
    const docId = doc.id;
    const chunks = db.prepare('SELECT id, chunk_index, content FROM knowledge_chunk WHERE doc_id = ? ORDER BY chunk_index ASC').all(docId) as any[];
    for (const c of chunks) {
      const prompt =
        `现有实体图谱（JSON）：\n${JSON.stringify(fused)}\n\n---\n\n新的知识分片（chunkId=${c.id}）：\n${c.content}`;
      const res = await ollamaChat(
        [{ role: 'system', content: EXTRACT_SYSTEM }, { role: 'user', content: prompt }],
        { temperature: 0.2, maxTokens: 1200 },
      );
      if (!res?.content) {
        // Ollama 不可用时中止增量，返回提示（已处理的正常落库）
        return { ok: false, processed, error: 'Ollama 不可用或无 chat 模型，无法抽取实体图谱' };
      }
      const parsed = parseJsonOf(res.content);
      if (parsed && Array.isArray(parsed.entities)) {
        // 融合：以解析结果为新的 fused（模型已按规则与 old 融合）
        fused = {
          entities: parsed.entities.map((e: any) => ({ name: String(e?.name || '').trim(), description: String(e?.description || '').trim() })).filter((e: any) => e.name),
          relations: (Array.isArray(parsed.relations) ? parsed.relations : []).map((r: any) => ({ source: String(r?.source || '').trim(), target: String(r?.target || '').trim(), relation: String(r?.relation || '').trim() })).filter((r: any) => r.source && r.target),
        };
        // 记录本分片关联实体
        const chunkEntities = (Array.isArray(parsed.chunks) ? parsed.chunks : [])
          .filter((x: any) => x?.chunkId === c.id && Array.isArray(x.entityNames))
          .flatMap((x: any) => x.entityNames as string[]);
        applyFusedGraphToDb(baseId, fused, c.id, chunkEntities);
      }
    }
    db.prepare('INSERT OR REPLACE INTO kb_processed_doc (doc_id, base_id, extracted_at) VALUES (?, ?, ?)').run(docId, baseId, ts);
    processed++;
  }
  return { ok: true, processed };
}

/** 把融合后的图谱写入 DB（本库先清空实体/关系/切片关联再落库，保证一致性）。 */
function applyFusedGraphToDb(baseId: string, fused: { entities: any[]; relations: any[] }, chunkId?: string, chunkEntities?: string[]) {
  const ts = now();
  const names = new Set<string>();
  db.prepare('DELETE FROM kb_relation WHERE base_id = ?').run(baseId);
  db.prepare('DELETE FROM kb_entity_chunk WHERE base_id = ?').run(baseId);
  db.prepare('DELETE FROM kb_entity WHERE base_id = ?').run(baseId);
  const insEnt = db.prepare('INSERT OR REPLACE INTO kb_entity (id, base_id, name, description, updated_at) VALUES (?, ?, ?, ?, ?)');
  const idByName = new Map<string, string>();
  for (const e of fused.entities) {
    const id = uuid();
    idByName.set(e.name, id);
    names.add(e.name);
    insEnt.run(id, baseId, e.name, e.description || null, ts);
  }
  const insRel = db.prepare('INSERT INTO kb_relation (id, base_id, source, target, relation, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (const r of fused.relations) {
    if (!names.has(r.source) || !names.has(r.target)) continue;
    insRel.run(uuid(), baseId, r.source, r.target, r.relation, ts);
  }
  // 切片关联：本 chunk → 这些实体
  if (chunkId && chunkEntities) {
    const self = db.prepare('SELECT id FROM kb_entity WHERE base_id = ?').all(baseId) as any[];
    const byName = new Map(self.map((e) => [e.name, e.id]));
    const insLink = db.prepare('INSERT OR IGNORE INTO kb_entity_chunk (entity_id, chunk_id, base_id) VALUES (?, ?, ?)');
    for (const name of chunkEntities) {
      const eid = byName.get(name);
      if (eid) insLink.run(eid, chunkId, baseId);
    }
  } else {
    // 全量重建：按实体清单把本库所有分片里「提到该实体名」的切片关联上（简单文本包含匹配兜底）
    const ents = db.prepare('SELECT id, name FROM kb_entity WHERE base_id = ?').all(baseId) as any[];
    const chunks = db.prepare('SELECT id, content FROM knowledge_chunk WHERE base_id = ?').all(baseId) as any[];
    const insLink = db.prepare('INSERT OR IGNORE INTO kb_entity_chunk (entity_id, chunk_id, base_id) VALUES (?, ?, ?)');
    for (const ent of ents) {
      for (const c of chunks) {
        if ((c.content || '').includes(ent.name)) insLink.run(ent.id, c.id, baseId);
      }
    }
  }
}

/** 读取实体关系图谱（用于前端展示）：nodes=实体，edges=关系，每个实体携带其来源切片。 */
export function getEntityGraph(userId: string, baseId: string): { entities: any[]; relations: any[]; chunks: any[] } {
  const base = getKnowledgeBase(userId, baseId);
  const entities = (db.prepare('SELECT id, name, description FROM kb_entity WHERE base_id = ? ORDER BY name').all(base.id) as any[]).map((r: any) => ({ id: r.id, name: r.name, description: r.description || '' }));
  // 每个实体关联的来源切片 id
  const links = db.prepare(
    'SELECT ec.entity_id, ec.chunk_id FROM kb_entity_chunk ec WHERE ec.base_id = ?',
  ).all(base.id) as any[];
  const id2chunks = new Map<string, string[]>();
  for (const l of links) {
    const arr = id2chunks.get(l.entity_id) || [];
    arr.push(l.chunk_id);
    id2chunks.set(l.entity_id, arr);
  }
  for (const e of entities) (e as any).chunkIds = id2chunks.get(e.id) || [];
  const relations = (db.prepare('SELECT source, target, relation FROM kb_relation WHERE base_id = ? ORDER BY source').all(base.id) as any[]).map((r) => ({ source: r.source, target: r.target, relation: r.relation }));
  const chunks = (db.prepare('SELECT id, chunk_index, content, doc_id FROM knowledge_chunk WHERE base_id = ? ORDER BY chunk_index ASC').all(base.id) as any[]).map((r) => ({ id: r.id, chunkIndex: r.chunk_index, content: r.content || '', docId: r.doc_id }));
  return { entities, relations, chunks };
}

function chunkText(text: string, maxLength = 1200, overlap = 120): string[] {
  if (!text.trim()) return [];
  const normalized = text.replace(/\r\n/g, '\n');
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let buffer = '';
  for (const paragraph of paragraphs) {
    if ((buffer + '\n' + paragraph).length > maxLength && buffer) {
      chunks.push(buffer.trim());
      const tail = buffer.slice(-overlap);
      buffer = tail + '\n' + paragraph;
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
