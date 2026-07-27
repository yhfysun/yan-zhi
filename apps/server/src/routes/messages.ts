import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';

const router = Router();
router.use(authMiddleware);

// PATCH /api/messages/:mid
router.patch('/:mid', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const mid = req.params.mid;
  const row = db.prepare('SELECT * FROM message WHERE id = ? AND user_id = ?').get(mid, userId) as any;
  if (!row) { res.status(404).json({ error: '消息不存在' }); return; }

  const sets: string[] = [];
  const vals: any[] = [];
  if (req.body.content !== undefined) { sets.push('content = ?'); vals.push(req.body.content); }
  if (req.body.reasoningContent !== undefined) { sets.push('reasoning_content = ?'); vals.push(req.body.reasoningContent); }
  if (req.body.tokens !== undefined) { sets.push('tokens = ?'); vals.push(req.body.tokens); }
  if (req.body.toolCalls !== undefined) { sets.push('tool_calls_json = ?'); vals.push(JSON.stringify(req.body.toolCalls)); }
  if (req.body.systemPromptSnapshot !== undefined) { sets.push('system_prompt_snapshot = ?'); vals.push(req.body.systemPromptSnapshot); }
  if (sets.length === 0) { res.json({ data: row }); return; }
  vals.push(mid);
  db.prepare(`UPDATE message SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const updated = db.prepare('SELECT * FROM message WHERE id = ?').get(mid);
  res.json({ data: updated });
});

// DELETE /api/messages/:mid
router.delete('/:mid', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const mid = req.params.mid;
  const row = db.prepare('SELECT * FROM message WHERE id = ? AND user_id = ?').get(mid, userId);
  if (!row) { res.status(404).json({ error: '消息不存在' }); return; }
  db.prepare('DELETE FROM message WHERE id = ?').run(mid);
  res.json({ ok: true });
});

export default router;
