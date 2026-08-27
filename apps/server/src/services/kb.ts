import { v4 as uuid } from 'uuid';
import { readFile } from 'node:fs/promises';
import { db } from '../db.js';

function now() {
  return Date.now();
}

function rowToBase(r: any) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
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
  const rows = db.prepare(
    'SELECT * FROM knowledge_base WHERE user_id = ? ORDER BY updated_at DESC',
  ).all(userId);
  return (rows as any[]).map(rowToBase);
}

export function createKnowledgeBase(userId: string, input: { name: string; description?: string }) {
  if (!input.name) throw new Error('知识库名称为必填项');
  const id = uuid();
  const ts = now();
  db.prepare(
    'INSERT INTO knowledge_base (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, userId, input.name, input.description || null, ts, ts);
  return rowToBase(db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(id));
}

export function getKnowledgeBase(userId: string, baseId: string) {
  const row = db.prepare('SELECT * FROM knowledge_base WHERE id = ? AND user_id = ?').get(baseId, userId) as any;
  if (!row) throw new Error('知识库不存在');
  return rowToBase(row);
}

export function updateKnowledgeBase(userId: string, baseId: string, input: { name?: string; description?: string }) {
  const existing = db.prepare('SELECT * FROM knowledge_base WHERE id = ? AND user_id = ?').get(baseId, userId) as any;
  if (!existing) throw new Error('知识库不存在');
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
  if (sets.length === 0) return rowToBase(existing);
  sets.push('updated_at = ?');
  vals.push(now(), baseId);
  db.prepare(`UPDATE knowledge_base SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return rowToBase(db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(baseId));
}

export function deleteKnowledgeBase(userId: string, baseId: string) {
  const existing = db.prepare('SELECT id FROM knowledge_base WHERE id = ? AND user_id = ?').get(baseId, userId);
  if (!existing) throw new Error('知识库不存在');
  db.prepare('DELETE FROM knowledge_chunk WHERE base_id = ?').run(baseId);
  db.prepare('DELETE FROM knowledge_doc WHERE base_id = ?').run(baseId);
  db.prepare('DELETE FROM knowledge_base WHERE id = ?').run(baseId);
  return true;
}

export function listKnowledgeDocs(userId: string, baseId: string) {
  const base = getKnowledgeBase(userId, baseId);
  const rows = db.prepare(
    'SELECT * FROM knowledge_doc WHERE base_id = ? AND user_id = ? ORDER BY created_at DESC',
  ).all(base.id, userId);
  return (rows as any[]).map(rowToDoc);
}

export async function addKnowledgeDoc(
  userId: string,
  baseId: string,
  input: { name: string; content?: string; sourcePath?: string; metadata?: Record<string, unknown> },
) {
  const base = getKnowledgeBase(userId, baseId);
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
    userId,
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
  for (const [index, text] of chunks.entries()) {
    insertChunk.run(uuid(), id, base.id, userId, index, text, '{}', ts);
  }
  db.prepare('UPDATE knowledge_base SET updated_at = ? WHERE id = ?').run(ts, base.id);
  return {
    doc: rowToDoc(db.prepare('SELECT * FROM knowledge_doc WHERE id = ?').get(id)),
    chunkCount: chunks.length,
  };
}

export function deleteKnowledgeDoc(userId: string, docId: string) {
  const existing = db.prepare('SELECT * FROM knowledge_doc WHERE id = ? AND user_id = ?').get(docId, userId) as any;
  if (!existing) throw new Error('文档不存在');
  db.prepare('DELETE FROM knowledge_chunk WHERE doc_id = ?').run(docId);
  db.prepare('DELETE FROM knowledge_doc WHERE id = ?').run(docId);
  db.prepare('UPDATE knowledge_base SET updated_at = ? WHERE id = ?').run(now(), existing.base_id);
  return true;
}

export function searchKnowledgeBase(userId: string, baseId: string, query: string, topK = 5) {
  const base = getKnowledgeBase(userId, baseId);
  if (!query) throw new Error('query 为必填项');
  const limit = Math.min(Math.max(Number(topK) || 5, 1), 50);
  const q = `%${query}%`;
  const rows = db.prepare(
    `SELECT * FROM knowledge_chunk
     WHERE base_id = ? AND user_id = ? AND content LIKE ?
     ORDER BY
       CASE WHEN content LIKE ? THEN 0 ELSE 1 END,
       length(content) ASC
     LIMIT ?`,
  ).all(base.id, userId, q, q, limit);
  return (rows as any[]).map(rowToChunk);
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
