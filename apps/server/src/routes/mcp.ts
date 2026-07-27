import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';

const router = Router();
router.use(authMiddleware);

// GET /api/mcp-servers
router.get('/', (req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM mcp_server WHERE user_id = ? ORDER BY created_at DESC').all(req.user!.userId);
  res.json({ data: rows });
});

// POST /api/mcp-servers
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { name, transport, command, args, env, url, headers, autoReconnect, reconnectInterval, autoConnect } = req.body || {};
  if (!name || !transport) { res.status(400).json({ error: '名称和传输协议为必填项' }); return; }

  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO mcp_server (id, user_id, name, transport, command, args_json, env_json, url, headers_json, auto_reconnect, reconnect_interval, auto_connect, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, userId, name, transport, command || null, JSON.stringify(args || []),
    JSON.stringify(env || {}), url || null, JSON.stringify(headers || {}),
    autoReconnect !== undefined ? (autoReconnect ? 1 : 0) : 1, reconnectInterval || 5000,
    autoConnect ? 1 : 0, now);
  const row = db.prepare('SELECT * FROM mcp_server WHERE id = ?').get(id);
  res.json({ data: row });
});

// PATCH /api/mcp-servers/:id
router.patch('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const sid = req.params.id;
  const existing = db.prepare('SELECT * FROM mcp_server WHERE id = ? AND user_id = ?').get(sid, userId) as any;
  if (!existing) { res.status(404).json({ error: 'MCP 服务不存在' }); return; }

  const sets: string[] = [];
  const vals: any[] = [];
  if (req.body.status !== undefined) { sets.push('status = ?'); vals.push(req.body.status ? 1 : 0); }
  if (sets.length === 0) { res.json({ data: existing }); return; }
  vals.push(sid);
  db.prepare(`UPDATE mcp_server SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM mcp_server WHERE id = ?').get(sid);
  res.json({ data: row });
});

// DELETE /api/mcp-servers/:id
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const sid = req.params.id;
  const existing = db.prepare('SELECT * FROM mcp_server WHERE id = ? AND user_id = ?').get(sid, userId);
  if (!existing) { res.status(404).json({ error: 'MCP 服务不存在' }); return; }
  db.prepare('DELETE FROM mcp_server WHERE id = ?').run(sid);
  res.json({ ok: true });
});

// GET /api/mcp-servers/:id/tools
router.get('/:id/tools', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const sid = req.params.id;
  const existing = db.prepare('SELECT * FROM mcp_server WHERE id = ? AND user_id = ?').get(sid, userId);
  if (!existing) { res.status(404).json({ error: 'MCP 服务不存在' }); return; }
  const rows = db.prepare('SELECT * FROM mcp_tool WHERE mcp_server_id = ?').all(sid);
  const tools = (rows as any[]).map((t: any) => ({
    ...t,
    inputSchema: t.input_schema_json ? JSON.parse(t.input_schema_json) : {},
  }));
  res.json({ data: tools });
});

// PUT /api/mcp-servers/:id/tools - 批量覆盖工具列表（连接成功后用）
router.put('/:id/tools', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const sid = req.params.id;
  const existing = db.prepare('SELECT * FROM mcp_server WHERE id = ? AND user_id = ?').get(sid, userId);
  if (!existing) { res.status(404).json({ error: 'MCP 服务不存在' }); return; }

  const tools = req.body?.tools || [];
  const delStmt = db.prepare('DELETE FROM mcp_tool WHERE mcp_server_id = ?');
  const insStmt = db.prepare(
    'INSERT OR REPLACE INTO mcp_tool (id, mcp_server_id, name, description, input_schema_json, alias, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );

  // 保留已有 alias/remark
  const oldRows = db.prepare('SELECT name, alias, remark FROM mcp_tool WHERE mcp_server_id = ?').all(sid) as any[];
  const oldMeta: Record<string, { alias?: string; remark?: string }> = {};
  for (const r of oldRows) {
    if (r.alias || r.remark) oldMeta[r.name] = { alias: r.alias, remark: r.remark };
  }

  const transaction = db.transaction(() => {
    delStmt.run(sid);
    for (const t of tools) {
      const meta = oldMeta[t.name as keyof typeof oldMeta] || {};
      insStmt.run(t.id, sid, t.name, t.description || null,
        JSON.stringify(t.inputSchema || {}),
        meta.alias || null, meta.remark || null);
    }
  });
  transaction();

  res.json({ ok: true });
});

// PATCH /api/mcp-servers/:id/tools/:name - 更新单个工具别名/备注
router.patch('/:id/tools/:name', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const sid = req.params.id;
  const tname = req.params.name;
  const existing = db.prepare('SELECT * FROM mcp_server WHERE id = ? AND user_id = ?').get(sid, userId);
  if (!existing) { res.status(404).json({ error: 'MCP 服务不存在' }); return; }

  const sets: string[] = [];
  const vals: any[] = [];
  if (req.body.alias !== undefined) { sets.push('alias = ?'); vals.push(req.body.alias || null); }
  if (req.body.remark !== undefined) { sets.push('remark = ?'); vals.push(req.body.remark || null); }
  if (sets.length === 0) { res.json({ ok: true }); return; }
  vals.push(sid, tname);
  db.prepare(`UPDATE mcp_tool SET ${sets.join(', ')} WHERE mcp_server_id = ? AND name = ?`).run(...vals);
  res.json({ ok: true });
});

export default router;
