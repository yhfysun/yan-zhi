import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import { readSpaceMemory, writeSpaceMemory } from '../services/space-memory.js';

const router = Router();
router.use(authMiddleware);

function rowToSpace(r: any) {
  return {
    id: r.id,
    name: r.name,
    dirPath: r.dir_path,
    description: r.description,
    sortOrder: r.sort_order ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// GET /api/spaces —— 列出当前用户的所有空间（按 sort_order 升序、updated_at 降序）
router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const rows = db.prepare(
    'SELECT * FROM space WHERE user_id = ? ORDER BY sort_order ASC, updated_at DESC',
  ).all(userId);
  res.json({ data: rows.map(rowToSpace) });
});

// POST /api/spaces —— 创建空间
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { name, dirPath, description, sortOrder } = req.body || {};
  if (!name) { res.status(400).json({ error: '名称为必填项' }); return; }
  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO space (id, user_id, name, dir_path, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, userId, name, dirPath || null, description || null, sortOrder ?? 0, now, now);
  const row = db.prepare('SELECT * FROM space WHERE id = ?').get(id);
  res.json({ data: rowToSpace(row) });
});

// PATCH /api/spaces/:id —— 更新空间
router.patch('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const sid = req.params.id;
  const existing = db.prepare('SELECT * FROM space WHERE id = ? AND user_id = ?').get(sid, userId) as any;
  if (!existing) { res.status(404).json({ error: '空间不存在' }); return; }

  const sets: string[] = [];
  const vals: any[] = [];
  if (req.body.name !== undefined) { sets.push('name = ?'); vals.push(req.body.name); }
  if (req.body.dirPath !== undefined) { sets.push('dir_path = ?'); vals.push(req.body.dirPath || null); }
  if (req.body.description !== undefined) { sets.push('description = ?'); vals.push(req.body.description || null); }
  if (req.body.sortOrder !== undefined) { sets.push('sort_order = ?'); vals.push(req.body.sortOrder); }
  if (sets.length === 0) { res.json({ data: rowToSpace(existing) }); return; }
  sets.push('updated_at = ?'); vals.push(Date.now());
  vals.push(sid);
  db.prepare(`UPDATE space SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM space WHERE id = ?').get(sid);
  res.json({ data: rowToSpace(row) });
});

// GET /api/spaces/:id/memory —— 读取空间记忆文件（MEMORY.md，跨会话、所有智能体共享）
router.get('/:id/memory', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = await readSpaceMemory(userId, req.params.id);
    res.json({ data });
  } catch (e: unknown) {
    res.status(e instanceof Error && e.message.includes('不存在') ? 404 : 500).json({
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

// PUT /api/spaces/:id/memory —— 整体保存空间记忆文件（前端编辑器保存）
router.put('/:id/memory', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const content = String(req.body?.content ?? '');
    if (content.length > 512 * 1024) { res.status(400).json({ error: '空间记忆文件过大（上限 512KB）' }); return; }
    const r = await writeSpaceMemory(userId, req.params.id, content);
    res.json({ data: r });
  } catch (e: unknown) {
    res.status(e instanceof Error && e.message.includes('不存在') ? 404 : 500).json({
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

// DELETE /api/spaces/:id —— 删除空间（其下会话 space_id 置空归"未归类"，目录文件不动）
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const sid = req.params.id;
  const existing = db.prepare('SELECT * FROM space WHERE id = ? AND user_id = ?').get(sid, userId);
  if (!existing) { res.status(404).json({ error: '空间不存在' }); return; }
  // 置空其下会话的 space_id
  db.prepare('UPDATE conversation SET space_id = NULL WHERE space_id = ? AND user_id = ?').run(sid, userId);
  db.prepare('DELETE FROM space WHERE id = ?').run(sid);
  res.json({ ok: true });
});

export default router;
