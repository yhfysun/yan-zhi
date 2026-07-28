// 同源商城工具源管理 — 各司其职，只处理 type='tool' 的远程源
import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (req: Request, res: Response) => {
  const rows = db.prepare(
    "SELECT id, name, base_url, auth_type, enabled, created_at FROM remote_marketplace WHERE user_id = ? AND type='tool' ORDER BY created_at DESC",
  ).all(req.user!.userId);
  res.json({ data: rows });
});

router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { name, baseUrl, authType, authConfig } = req.body || {};
  if (!name || !baseUrl) { res.status(400).json({ error: 'name, baseUrl 为必填项' }); return; }
  const id = uuid(); const now = Date.now();
  db.prepare(
    'INSERT INTO remote_marketplace (id, user_id, name, type, base_url, auth_type, auth_config_enc, enabled, created_at) VALUES (?,?,?,?,?,?,?,1,?)',
  ).run(id, userId, name, 'tool', baseUrl, authType || 'none', authConfig ? JSON.stringify(authConfig) : null, now);
  res.json({ data: db.prepare('SELECT id, name, base_url, auth_type, enabled, created_at FROM remote_marketplace WHERE id = ?').get(id) });
});

router.patch('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId; const sid = req.params.id;
  const e = db.prepare("SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='tool'").get(sid, userId) as any;
  if (!e) { res.status(404).json({ error: '远程源不存在' }); return; }
  const sets: string[] = []; const vals: any[] = [];
  if (req.body.name !== undefined) { sets.push('name = ?'); vals.push(req.body.name); }
  if (req.body.baseUrl !== undefined) { sets.push('base_url = ?'); vals.push(req.body.baseUrl); }
  if (req.body.authType !== undefined) { sets.push('auth_type = ?'); vals.push(req.body.authType); }
  if (req.body.authConfig !== undefined) { sets.push('auth_config_enc = ?'); vals.push(JSON.stringify(req.body.authConfig)); }
  if (req.body.enabled !== undefined) { sets.push('enabled = ?'); vals.push(req.body.enabled ? 1 : 0); }
  if (sets.length === 0) { res.json({ data: e }); return; }
  vals.push(sid);
  db.prepare(`UPDATE remote_marketplace SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ data: db.prepare('SELECT id, name, base_url, auth_type, enabled, created_at FROM remote_marketplace WHERE id = ?').get(sid) });
});

router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId; const sid = req.params.id;
  if (!db.prepare("SELECT id FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='tool'").get(sid, userId)) {
    res.status(404).json({ error: '远程源不存在' }); return;
  }
  db.prepare('DELETE FROM marketplace_cache WHERE remote_id = ?').run(sid);
  db.prepare('DELETE FROM remote_marketplace WHERE id = ?').run(sid);
  res.json({ ok: true });
});

router.post('/:id/test', async (req: Request, res: Response) => {
  const s = db.prepare("SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='tool'").get(req.params.id, req.user!.userId) as any;
  if (!s) { res.status(404).json({ error: '远程源不存在' }); return; }
  try {
    const headers: Record<string, string> = {};
    if (s.auth_config_enc) {
      const c = JSON.parse(s.auth_config_enc);
      if (s.auth_type === 'bearer' && c.token) headers['Authorization'] = `Bearer ${c.token}`;
      else if (s.auth_type === 'api-key' && c.apiKey) headers['X-API-Key'] = c.apiKey;
    }
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
    const resp = await fetch(`${s.base_url.replace(/\/$/, '')}/api/marketplace`, { headers, signal: ctrl.signal });
    clearTimeout(t);
    if (!resp.ok) { res.json({ ok: false, error: `连接失败，状态码: ${resp.status}` }); return; }
    res.json({ ok: true, info: await resp.json() });
  } catch (err: unknown) { res.json({ ok: false, error: err instanceof Error ? err.message : String(err) }); }
});

router.get('/:id/tools', async (req: Request, res: Response) => {
  const s = db.prepare("SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='tool'").get(req.params.id, req.user!.userId) as any;
  if (!s) { res.status(404).json({ error: '远程源不存在' }); return; }
  try {
    const page = req.query.page || 1; const pageSize = req.query.pageSize || 20;
    const headers: Record<string, string> = {};
    if (s.auth_config_enc) {
      const c = JSON.parse(s.auth_config_enc);
      if (s.auth_type === 'bearer' && c.token) headers['Authorization'] = `Bearer ${c.token}`;
      else if (s.auth_type === 'api-key' && c.apiKey) headers['X-API-Key'] = c.apiKey;
    }
    const resp = await fetch(`${s.base_url.replace(/\/$/, '')}/api/marketplace/tools?page=${page}&pageSize=${pageSize}`, { headers });
    res.json(await resp.json());
  } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

router.post('/:id/install', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const s = db.prepare("SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='tool'").get(req.params.id, req.user!.userId) as any;
  if (!s) { res.status(404).json({ error: '远程源不存在' }); return; }
  const { toolId } = req.body || {};
  if (!toolId) { res.status(400).json({ error: 'toolId 为必填项' }); return; }
  try {
    const headers: Record<string, string> = {};
    if (s.auth_config_enc) {
      const c = JSON.parse(s.auth_config_enc);
      if (s.auth_type === 'bearer' && c.token) headers['Authorization'] = `Bearer ${c.token}`;
      else if (s.auth_type === 'api-key' && c.apiKey) headers['X-API-Key'] = c.apiKey;
    }
    const resp = await fetch(`${s.base_url.replace(/\/$/, '')}/api/marketplace/tools/${encodeURIComponent(toolId)}`, { headers });
    const data = await resp.json();
    if (!data.success || !data.data) { res.status(404).json({ error: '远程工具不存在' }); return; }
    const t = data.data;
    let name = t.name;
    if (db.prepare('SELECT id FROM custom_tool WHERE name = ? AND user_id = ?').get(name, userId)) name = `${t.name}_remote`;
    const id = uuid(); const now = Date.now();
    db.prepare(
      `INSERT INTO custom_tool (id, user_id, name, description, input_schema_json, output_schema_json,
       runtime, entry, code, dependencies_json, timeout, env_json, enabled, source, remote_source_id, is_public, updated_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,'remote',?,0,?,?)`,
    ).run(id, userId, name, t.description || null, JSON.stringify(t.inputSchema || {}),
      t.outputSchema ? JSON.stringify(t.outputSchema) : null, t.runtime || 'node', t.entry, t.code,
      t.dependencies ? JSON.stringify(t.dependencies) : null, t.timeout || 30000, null, req.params.id, now, now);
    res.json({ data: db.prepare('SELECT * FROM custom_tool WHERE id = ?').get(id) });
  } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

export default router;
