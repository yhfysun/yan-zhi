import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';

const router = Router();
router.use(authMiddleware);

function rowToFile(r: any) {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    spaceId: r.space_id,
    name: r.name,
    path: r.path,
    category: r.category,
    mimeType: r.mime_type,
    size: r.size,
    source: r.source,
    messageId: r.message_id,
    createdAt: r.created_at,
  };
}

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
  ).run(id, cid, userId, conv.space_id || null, name, path, category || 'intermediate', mimeType || null, size || 0, source || 'agent', messageId || null, now);
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
