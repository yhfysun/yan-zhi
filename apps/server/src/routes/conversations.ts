import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';

const router = Router();
router.use(authMiddleware);

// GET /api/conversations
router.get('/', (_req: Request, res: Response) => {
  const userId = _req.user!.userId;
  const rows = db.prepare(
    'SELECT * FROM conversation WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC',
  ).all(userId);
  res.json({ data: rows });
});

// POST /api/conversations
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { title, platformId, modelId, agentId } = req.body || {};
  if (!title) { res.status(400).json({ error: '标题为必填项' }); return; }
  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO conversation (id, user_id, title, agent_id, platform_id, model_id, mcp_servers_json, skill_ids_json, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, userId, title, agentId || null, platformId || null, modelId || null, '[]', '[]', 0, now, now);
  const row = db.prepare('SELECT * FROM conversation WHERE id = ?').get(id);
  res.json({ data: row });
});

// PATCH /api/conversations/:id
router.patch('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const existing = db.prepare('SELECT * FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId) as any;
  if (!existing) { res.status(404).json({ error: '会话不存在' }); return; }

  const sets: string[] = [];
  const vals: any[] = [];
  const bodyFields: Record<string, string> = { title: 'title', platformId: 'platform_id', modelId: 'model_id', systemPrompt: 'system_prompt' };
  for (const [key, col] of Object.entries(bodyFields)) {
    if (req.body[key] !== undefined) { sets.push(`${col} = ?`); vals.push(req.body[key]); }
  }
  if (req.body.mcpServerIds !== undefined || req.body.mcpDisabledTools !== undefined) {
    const serverIds = req.body.mcpServerIds ?? (() => {
      try { const parsed = JSON.parse(existing.mcp_servers_json || '[]'); return Array.isArray(parsed) ? (typeof parsed[0] === 'string' ? parsed : parsed.map((x: any) => x.serverId || x.id || '').filter(Boolean)) : []; }
      catch { return []; } 
    })();
    const disabled = req.body.mcpDisabledTools || {};
    const serversJson = serverIds.map((sid: string) => ({
      serverId: sid,
      disabledTools: disabled[sid] || [],
    }));
    sets.push('mcp_servers_json = ?'); vals.push(JSON.stringify(serversJson));
  }
  if (req.body.skillIds !== undefined) { sets.push('skill_ids_json = ?'); vals.push(JSON.stringify(req.body.skillIds)); }
  if (req.body.pinned !== undefined) { sets.push('pinned = ?'); vals.push(req.body.pinned ? 1 : 0); }
  if (sets.length === 0) { res.json({ data: existing }); return; }

  sets.push('updated_at = ?'); vals.push(Date.now());
  vals.push(cid);
  db.prepare(`UPDATE conversation SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM conversation WHERE id = ?').get(cid);
  res.json({ data: row });
});

// DELETE /api/conversations/:id
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const existing = db.prepare('SELECT * FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId);
  if (!existing) { res.status(404).json({ error: '会话不存在' }); return; }
  db.prepare('DELETE FROM message WHERE conversation_id = ?').run(cid);
  db.prepare('DELETE FROM conversation WHERE id = ?').run(cid);
  res.json({ ok: true });
});

// GET /api/conversations/:id/messages
router.get('/:id/messages', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const conv = db.prepare('SELECT id FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId);
  if (!conv) { res.status(404).json({ error: '会话不存在' }); return; }
  const rows = db.prepare('SELECT * FROM message WHERE conversation_id = ? ORDER BY created_at ASC').all(cid);
  res.json({ data: rows });
});

// POST /api/conversations/:id/messages
router.post('/:id/messages', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const cid = req.params.id;
  const conv = db.prepare('SELECT id FROM conversation WHERE id = ? AND user_id = ?').get(cid, userId);
  if (!conv) { res.status(404).json({ error: '会话不存在' }); return; }
  const { role, content, toolCalls, toolCallId, reasoningContent, tokens, systemPromptSnapshot } = req.body || {};
  if (!role) { res.status(400).json({ error: 'role 为必填项' }); return; }

  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO message (id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, system_prompt_snapshot, tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, cid, userId, role, content || null, toolCalls ? JSON.stringify(toolCalls) : null,
    toolCallId || null, reasoningContent || null, systemPromptSnapshot || null, tokens || 0, now);
  db.prepare('UPDATE conversation SET updated_at = ? WHERE id = ?').run(now, cid);
  const row = db.prepare('SELECT * FROM message WHERE id = ?').get(id);
  res.json({ data: row });
});

export default router;
