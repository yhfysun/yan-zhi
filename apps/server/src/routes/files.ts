import { Router, Request, Response } from 'express';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import { resolveArtifactDirFor, ensureArtifactDirFor } from '../services/artifact-dir.js';
import type { FileCategory } from '@yan-zhi/shared';

const router = Router();
router.use(authMiddleware);

const FILE_CATEGORIES: FileCategory[] = ['upload', 'intermediate', 'deliverable'];

function parseCategory(v: unknown): FileCategory {
  const s = String(v || '');
  return (FILE_CATEGORIES as string[]).includes(s) ? (s as FileCategory) : 'intermediate';
}

/**
 * 修正历史记录里的相对路径。
 *
 * 早期版本 resolveArtifactRoot 在「无空间 + 无工作目录 + 未设 DATA_DIR」时返回空串，
 * 导致落盘目录与登记进 conversation_file 的 path 都是相对的（如 `.yan-zhi\tasks\...`）。
 * 渲染层按自己的 cwd 去读就必然 ENOENT（「图片落盘了但预览/另存为报不存在」）。
 * 根因已在 artifact-dir 修掉；这里兜读取侧：凡是「相对 + 看起来是产物目录」的路径，
 * 用该会话自己的产物根补成绝对路径再返回，历史记录无需搬运即可正常打开。
 *
 * 导出仅供单测（stored-path-normalize.test.ts）钉住行为。
 */
export function normalizeStoredPath(p: string, conversationId: string, category: FileCategory): string {
  const raw = String(p || '');
  if (!raw) return raw;
  // 已是绝对路径（Windows 盘符 / UNC / POSIX 根）：原样返回
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('\\\\') || raw.startsWith('/')) return raw;
  // 只修产物目录形态的相对路径，避免把用户自己的相对路径误解析
  const stripped = raw.replace(/^\.\//, '').replace(/^\.\\/, '');
  if (!/^\.yan-zhi[\\/]/.test(stripped)) return raw;
  // 用该会话自己的产物根（会考虑空间目录/工作目录），保证与会话归属一致
  const root = resolveArtifactDirFor({ conversationId, category }).root;
  return path.join(root, stripped);
}

/** 单测别名：直接暴露内部函数，避免测试去构造 Express 请求 */
export const normalizeStoredPathForTest = normalizeStoredPath;

function rowToFile(r: any) {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    spaceId: r.space_id,
    name: r.name,
    path: normalizeStoredPath(r.path, r.conversation_id, parseCategory(r.category)),
    category: r.category,
    mimeType: r.mime_type,
    size: r.size,
    source: r.source,
    messageId: r.message_id,
    createdAt: r.created_at,
  };
}

// GET /api/conversations/:id/artifact-dir?category=upload —— 解析产物目录（可选建目录）
// 前端落盘（上传附件等）先取此目录再写入，保证与服务端媒体落盘走同一套规范。
router.get('/:id/artifact-dir', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const conv = db.prepare('SELECT id FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId);
  if (!conv) { res.status(404).json({ error: '会话不存在' }); return; }
  const category = parseCategory(req.query.category);
  const ensure = req.query.ensure === '1' || req.query.ensure === 'true';
  const info = ensure
    ? ensureArtifactDirFor({ conversationId: cid, category })
    : resolveArtifactDirFor({ conversationId: cid, category });
  res.json({ data: { category, dir: info.dir, relDir: info.relDir, root: info.root, title: info.title } });
});

// GET /api/conversations/:id/files —— 列出会话的所有文件
router.get('/:id/files', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const conv = db.prepare('SELECT id, space_id FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId);
  if (!conv) { res.status(404).json({ error: '会话不存在' }); return; }
  const rows = db.prepare(
    'SELECT * FROM conversation_file WHERE conversation_id = ? ORDER BY category ASC, created_at ASC',
  ).all(cid);
  res.json({ data: rows.map(rowToFile) });
});

// POST /api/conversations/:id/files —— 注册一个文件记录（不处理上传字节流，仅记录元数据）
router.post('/:id/files', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const conv = db.prepare('SELECT id, space_id FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId) as any;
  if (!conv) { res.status(404).json({ error: '会话不存在' }); return; }
  const { name, path, category, mimeType, size, source, messageId } = req.body || {};
  if (!name || !path) { res.status(400).json({ error: 'name 和 path 为必填项' }); return; }
  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO conversation_file (id, conversation_id, user_id, space_id, name, path, category, mime_type, size, source, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, cid, userId, conv.space_id || null, name, path, parseCategory(category), mimeType || null, size || 0, source || 'agent', messageId || null, now);
  const row = db.prepare('SELECT * FROM conversation_file WHERE id = ?').get(id);
  res.json({ data: rowToFile(row) });
});

// PATCH /api/conversations/:id/files/:fileId —— 改分类 / 重命名
router.patch('/:id/files/:fileId', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const fileId = req.params.fileId;
  const existing = db.prepare('SELECT * FROM conversation_file WHERE id = ? AND conversation_id = ? AND user_id = ?').get(fileId, cid, userId) as any;
  if (!existing) { res.status(404).json({ error: '文件不存在' }); return; }
  const sets: string[] = [];
  const vals: any[] = [];
  if (req.body.category !== undefined) { sets.push('category = ?'); vals.push(req.body.category); }
  if (req.body.name !== undefined) { sets.push('name = ?'); vals.push(req.body.name); }
  if (req.body.path !== undefined) { sets.push('path = ?'); vals.push(req.body.path); }
  if (sets.length === 0) { res.json({ data: rowToFile(existing) }); return; }
  vals.push(fileId);
  db.prepare(`UPDATE conversation_file SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM conversation_file WHERE id = ?').get(fileId);
  res.json({ data: rowToFile(row) });
});

// DELETE /api/conversations/:id/files/:fileId —— 删除文件记录（物理文件由前端/调用方处理）
router.delete('/:id/files/:fileId', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const fileId = req.params.fileId;
  const existing = db.prepare('SELECT * FROM conversation_file WHERE id = ? AND conversation_id = ? AND user_id = ?').get(fileId, cid, userId);
  if (!existing) { res.status(404).json({ error: '文件不存在' }); return; }
  db.prepare('DELETE FROM conversation_file WHERE id = ?').run(fileId);
  res.json({ ok: true });
});

export default router;
