import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';

const router = Router();
router.use(authMiddleware);

// GET /api/skills
router.get('/', (req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM skill WHERE user_id = ? ORDER BY created_at DESC').all(req.user!.userId);
  res.json({ data: rows });
});

// POST /api/skills
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { name, description, triggers, body, category } = req.body || {};
  if (!name || !body) { res.status(400).json({ error: '名称和 body 为必填项' }); return; }

  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO skill (id, user_id, name, description, triggers_json, body, category, enabled, installs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, userId, name, description || null, JSON.stringify(triggers || []), body, category || null, 1, 0, now);
  const row = db.prepare('SELECT * FROM skill WHERE id = ?').get(id);
  res.json({ data: row });
});

// PATCH /api/skills/:id
router.patch('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const sid = req.params.id;
  const existing = db.prepare('SELECT * FROM skill WHERE id = ? AND user_id = ?').get(sid, userId) as any;
  if (!existing) { res.status(404).json({ error: 'Skill 不存在' }); return; }

  const sets: string[] = [];
  const vals: any[] = [];
  if (req.body.name !== undefined) { sets.push('name = ?'); vals.push(req.body.name); }
  if (req.body.description !== undefined) { sets.push('description = ?'); vals.push(req.body.description); }
  if (req.body.body !== undefined) { sets.push('body = ?'); vals.push(req.body.body); }
  if (req.body.enabled !== undefined) { sets.push('enabled = ?'); vals.push(req.body.enabled ? 1 : 0); }
  if (req.body.category !== undefined) { sets.push('category = ?'); vals.push(req.body.category); }
  if (req.body.triggers !== undefined) { sets.push('triggers_json = ?'); vals.push(JSON.stringify(req.body.triggers)); }
  if (sets.length === 0) { res.json({ data: existing }); return; }
  vals.push(sid);
  db.prepare(`UPDATE skill SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM skill WHERE id = ?').get(sid);
  res.json({ data: row });
});

// DELETE /api/skills/:id
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const sid = req.params.id;
  const existing = db.prepare('SELECT * FROM skill WHERE id = ? AND user_id = ?').get(sid, userId);
  if (!existing) { res.status(404).json({ error: 'Skill 不存在' }); return; }
  db.prepare('DELETE FROM skill WHERE id = ?').run(sid);
  res.json({ ok: true });
});

export default router;
