import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';

const router = Router();
router.use(authMiddleware);

// GET /api/tools
router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const rows = db.prepare('SELECT * FROM custom_tool WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  res.json({ data: rows });
});

// POST /api/tools
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { name, description, inputSchema, outputSchema, runtime, entry, code, dependencies, timeout, env } = req.body || {};
  if (!name || !inputSchema || !code || !entry) {
    res.status(400).json({ error: 'name, inputSchema, code, entry 为必填项' }); return;
  }
  const existing = db.prepare('SELECT id FROM custom_tool WHERE name = ? AND user_id = ?').get(name, userId);
  if (existing) { res.status(409).json({ error: `工具 "${name}" 已存在` }); return; }

  const id = uuid();
  const now = Date.now();
  db.prepare(
    `INSERT INTO custom_tool (id, user_id, name, description, input_schema_json, output_schema_json,
     runtime, entry, code, dependencies_json, timeout, env_json, enabled, source, is_public, updated_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,'local',?,?,?)`,
  ).run(id, userId, name, description || null, JSON.stringify(inputSchema),
    outputSchema ? JSON.stringify(outputSchema) : null, runtime || 'node', entry, code,
    dependencies ? JSON.stringify(dependencies) : null, timeout || 30000,
    env ? JSON.stringify(env) : null, req.body.isPublic ? 1 : 0, now, now);
  const row = db.prepare('SELECT * FROM custom_tool WHERE id = ?').get(id);
  res.json({ data: row });
});

// PATCH /api/tools/:id
router.patch('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tid = req.params.id;
  const existing = db.prepare('SELECT * FROM custom_tool WHERE id = ? AND user_id = ?').get(tid, userId) as any;
  if (!existing) { res.status(404).json({ error: '工具不存在' }); return; }
  const sets: string[] = []; const vals: any[] = [];
  if (req.body.name !== undefined) { sets.push('name = ?'); vals.push(req.body.name); }
  if (req.body.description !== undefined) { sets.push('description = ?'); vals.push(req.body.description); }
  if (req.body.code !== undefined) { sets.push('code = ?'); vals.push(req.body.code); }
  if (req.body.entry !== undefined) { sets.push('entry = ?'); vals.push(req.body.entry); }
  if (req.body.inputSchema !== undefined) { sets.push('input_schema_json = ?'); vals.push(JSON.stringify(req.body.inputSchema)); }
  if (req.body.enabled !== undefined) { sets.push('enabled = ?'); vals.push(req.body.enabled ? 1 : 0); }
  if (req.body.timeout !== undefined) { sets.push('timeout = ?'); vals.push(req.body.timeout); }
  if (req.body.dependencies !== undefined) { sets.push('dependencies_json = ?'); vals.push(JSON.stringify(req.body.dependencies)); }
  if (req.body.isPublic !== undefined) { sets.push('is_public = ?'); vals.push(req.body.isPublic ? 1 : 0); }
  sets.push('updated_at = ?'); vals.push(Date.now());
  if (sets.length === 0) { res.json({ data: existing }); return; }
  vals.push(tid);
  db.prepare(`UPDATE custom_tool SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ data: db.prepare('SELECT * FROM custom_tool WHERE id = ?').get(tid) });
});

// DELETE /api/tools/:id
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tid = req.params.id;
  if (!db.prepare('SELECT id FROM custom_tool WHERE id = ? AND user_id = ?').get(tid, userId)) {
    res.status(404).json({ error: '工具不存在' }); return;
  }
  db.prepare('DELETE FROM custom_tool WHERE id = ?').run(tid);
  res.json({ ok: true });
});

// GET /api/tools/builtin — 列出内置工具
router.get('/builtin', (_req: Request, res: Response) => {
  res.json({
    data: [
      { name: 'file_read', description: '读取文件内容，支持指定路径和行数范围', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
      { name: 'file_write', description: '写入内容到指定文件路径', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
      { name: 'web_search', description: '联网搜索，获取实时信息', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
    ],
  });
});

// POST /api/tools/install — 从远程商城安装工具
router.post('/install', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { remoteSourceId, toolId } = req.body || {};
  if (!remoteSourceId || !toolId) { res.status(400).json({ error: 'remoteSourceId 和 toolId 为必填项' }); return; }
  const source = db.prepare('SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ?').get(remoteSourceId, userId) as any;
  if (!source) { res.status(404).json({ error: '远程源不存在' }); return; }
  const baseUrl = source.base_url.replace(/\/$/, '');
  fetch(`${baseUrl}/api/marketplace/tools/${encodeURIComponent(toolId)}`)
    .then(r => r.json())
    .then(data => {
      if (!data.success || !data.data) throw new Error('远程工具不存在');
      const t = data.data;
      const id = uuid();
      const now = Date.now();
      db.prepare(
        `INSERT INTO custom_tool (id, user_id, name, description, input_schema_json, output_schema_json,
         runtime, entry, code, dependencies_json, timeout, env_json, enabled, source, remote_source_id, is_public, updated_at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,'remote',?,0,?,?)`,
      ).run(id, userId, t.name, t.description || null, JSON.stringify(t.inputSchema || {}),
        t.outputSchema ? JSON.stringify(t.outputSchema) : null, t.runtime || 'node', t.entry, t.code,
        t.dependencies ? JSON.stringify(t.dependencies) : null, t.timeout || 30000, null, remoteSourceId, now, now);
      res.json({ data: db.prepare('SELECT * FROM custom_tool WHERE id = ?').get(id) });
    })
    .catch((err: Error) => res.status(500).json({ error: err.message }));
});

export default router;
