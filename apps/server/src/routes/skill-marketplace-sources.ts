// Skill 同源商城源管理 — 只处理 type='skill' 的远程源
import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';

const router = Router();
router.use(authMiddleware);

// 归一化远程源地址：去掉结尾的 / 以及可能冗余的 /api/marketplace 后缀
function marketApiBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '').replace(/\/api\/marketplace$/, '');
}

function authHeaders(s: any): Record<string, string> {
  const h: Record<string, string> = {};
  if (!s.auth_config_enc) return h;
  const c = JSON.parse(s.auth_config_enc);
  if (s.auth_type === 'bearer' && c.token) h['Authorization'] = `Bearer ${c.token}`;
  else if (s.auth_type === 'api-key' && c.apiKey) h['X-API-Key'] = c.apiKey;
  return h;
}

router.get('/', (req: Request, res: Response) => {
  const rows = db.prepare("SELECT id, name, base_url, auth_type, enabled, created_at FROM remote_marketplace WHERE user_id = ? AND type='skill' ORDER BY created_at DESC").all(req.user!.userId);
  res.json({ data: rows });
});

router.post('/', (req: Request, res: Response) => {
  const { name, baseUrl, authType, authConfig } = req.body || {};
  if (!name || !baseUrl) { res.status(400).json({ error: 'name, baseUrl 为必填项' }); return; }
  const id = uuid(); const now = Date.now();
  db.prepare('INSERT INTO remote_marketplace (id, user_id, name, type, base_url, auth_type, auth_config_enc, enabled, created_at) VALUES (?,?,?,?,?,?,?,1,?)').run(id, req.user!.userId, name, 'skill', baseUrl, authType || 'none', authConfig ? JSON.stringify(authConfig) : null, now);
  res.json({ data: db.prepare('SELECT id, name, base_url, auth_type, enabled, created_at FROM remote_marketplace WHERE id = ?').get(id) });
});

router.patch('/:id', (req: Request, res: Response) => {
  const e = db.prepare("SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='skill'").get(req.params.id, req.user!.userId) as any;
  if (!e) { res.status(404).json({ error: '远程源不存在' }); return; }
  const sets: string[] = []; const vals: any[] = [];
  if (req.body.name !== undefined) { sets.push('name = ?'); vals.push(req.body.name); }
  if (req.body.baseUrl !== undefined) { sets.push('base_url = ?'); vals.push(req.body.baseUrl); }
  if (req.body.authType !== undefined) { sets.push('auth_type = ?'); vals.push(req.body.authType); }
  if (req.body.authConfig !== undefined) { sets.push('auth_config_enc = ?'); vals.push(JSON.stringify(req.body.authConfig)); }
  if (req.body.enabled !== undefined) { sets.push('enabled = ?'); vals.push(req.body.enabled ? 1 : 0); }
  if (sets.length === 0) { res.json({ data: e }); return; }
  vals.push(req.params.id);
  db.prepare(`UPDATE remote_marketplace SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ data: db.prepare('SELECT id, name, base_url, auth_type, enabled, created_at FROM remote_marketplace WHERE id = ?').get(req.params.id) });
});

router.delete('/:id', (req: Request, res: Response) => {
  if (!db.prepare("SELECT id FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='skill'").get(req.params.id, req.user!.userId)) { res.status(404).json({ error: '远程源不存在' }); return; }
  db.prepare('DELETE FROM marketplace_cache WHERE remote_id = ?').run(req.params.id);
  db.prepare('DELETE FROM remote_marketplace WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/test', async (req: Request, res: Response) => {
  const s = db.prepare("SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='skill'").get(req.params.id, req.user!.userId) as any;
  if (!s) { res.status(404).json({ error: '远程源不存在' }); return; }
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
    const resp = await fetch(`${marketApiBase(s.base_url)}/api/marketplace`, { headers: authHeaders(s), signal: ctrl.signal });
    clearTimeout(t);
    if (!resp.ok) { res.json({ ok: false, error: `连接失败，状态码: ${resp.status}` }); return; }
    res.json({ ok: true, info: await resp.json() });
  } catch (err: unknown) { res.json({ ok: false, error: err instanceof Error ? err.message : String(err) }); }
});

router.get('/:id/skills', async (req: Request, res: Response) => {
  const s = db.prepare("SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='skill'").get(req.params.id, req.user!.userId) as any;
  if (!s) { res.status(404).json({ error: '远程源不存在' }); return; }
  try {
    const page = req.query.page || 1; const pageSize = req.query.pageSize || 20;
    const resp = await fetch(`${marketApiBase(s.base_url)}/api/marketplace/skills?page=${page}&pageSize=${pageSize}`, { headers: authHeaders(s) });
    if (!resp.ok) { res.status(resp.status).json({ success: false, error: `远程源返回状态码: ${resp.status}` }); return; }
    res.json(await resp.json());
  } catch (err: unknown) { res.status(502).json({ success: false, error: err instanceof Error ? err.message : String(err) }); }
});

router.post('/:id/install', async (req: Request, res: Response) => {
  const s = db.prepare("SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='skill'").get(req.params.id, req.user!.userId) as any;
  if (!s) { res.status(404).json({ error: '远程源不存在' }); return; }
  const { skillId } = req.body || {};
  if (!skillId) { res.status(400).json({ error: 'skillId 为必填项' }); return; }
  try {
    const resp = await fetch(`${marketApiBase(s.base_url)}/api/marketplace/skills/${encodeURIComponent(skillId)}`, { headers: authHeaders(s) });
    const data = await resp.json();
    if (!data.success || !data.data) { res.status(404).json({ error: '远程 Skill 不存在' }); return; }
    const sk = data.data; const id = uuid(); const now = Date.now();
    db.prepare('INSERT INTO skill (id, user_id, name, description, triggers_json, body, category, author, enabled, installs, source, remote_source_id, is_public, created_at) VALUES (?,?,?,?,?,?,?,?,1,0,?,?,0,?)').run(id, req.user!.userId, sk.name, sk.description || null, JSON.stringify(sk.triggers || []), sk.body || '', sk.category || null, sk.author || null, 'remote', req.params.id, now);
    res.json({ data: db.prepare('SELECT * FROM skill WHERE id = ?').get(id) });
  } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

export default router;
