import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';

const router = Router();
router.use(authMiddleware);

const rowToP = (r: any) => ({
  id: r.id,
  name: r.name,
  protocol: r.protocol,
  api_url: r.api_url,
  api_key_enc: r.api_key_enc,
  headers_json: r.headers_json,
  status: r.status,
  last_health_at: r.last_health_at,
  created_at: r.created_at,
});

const rowToM = (r: any) => ({
  id: r.id,
  platform_id: r.platform_id,
  model_id: r.model_id,
  alias: r.alias,
  type: r.type,
  context_window: r.context_window,
  capabilities_json: r.capabilities_json,
  pricing_json: r.pricing_json,
  enabled: r.enabled,
  is_default: r.is_default,
  created_at: r.created_at,
});

const userId = (req: Request) => req.user!.userId;

// === Platforms ===

router.get('/', (req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM platform WHERE user_id = ? ORDER BY created_at DESC').all(userId(req));
  res.json({ data: rows.map(rowToP) });
});

router.post('/', (req: Request, res: Response) => {
  const { name, protocol, apiUrl, apiKeyEnc, headers } = req.body || {};
  if (!name) { res.status(400).json({ error: '名称为必填项' }); return; }
  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO platform (id, user_id, name, protocol, api_url, api_key_enc, headers_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, userId(req), name, protocol || 'openai', apiUrl || null, apiKeyEnc || null, JSON.stringify(headers || {}), 1, now);
  const row = db.prepare('SELECT * FROM platform WHERE id = ?').get(id);
  res.json({ data: rowToP(row) });
});

router.delete('/:id', (req: Request, res: Response) => {
  const pid = req.params.id;
  const existing = db.prepare('SELECT * FROM platform WHERE id = ? AND user_id = ?').get(pid, userId(req));
  if (!existing) { res.status(404).json({ error: '平台不存在' }); return; }
  db.prepare('DELETE FROM model WHERE platform_id = ?').run(pid);
  db.prepare('DELETE FROM platform WHERE id = ?').run(pid);
  res.json({ ok: true });
});

router.patch('/:id', (req: Request, res: Response) => {
  const pid = req.params.id;
  const existing = db.prepare('SELECT * FROM platform WHERE id = ? AND user_id = ?').get(pid, userId(req));
  if (!existing) { res.status(404).json({ error: '平台不存在' }); return; }
  const { name, protocol, apiUrl, apiKeyEnc, headers } = req.body || {};
  const sets: string[] = [];
  const vals: any[] = [];
  if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
  if (protocol !== undefined) { sets.push('protocol = ?'); vals.push(protocol); }
  if (apiUrl !== undefined) { sets.push('api_url = ?'); vals.push(apiUrl); }
  if (apiKeyEnc !== undefined) { sets.push('api_key_enc = ?'); vals.push(apiKeyEnc); }
  if (headers !== undefined) { sets.push('headers_json = ?'); vals.push(JSON.stringify(headers)); }
  if (sets.length === 0) { res.json({ data: rowToP(existing) }); return; }
  vals.push(pid);
  db.prepare(`UPDATE platform SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const updated = db.prepare('SELECT * FROM platform WHERE id = ?').get(pid);
  res.json({ data: rowToP(updated) });
});

// === Models (platform-scoped + global) ===

router.get('/all-models', (req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM model WHERE user_id = ? ORDER BY platform_id, is_default DESC').all(userId(req));
  res.json({ data: rows.map(rowToM) });
});

router.get('/:pid/models', (req: Request, res: Response) => {
  const pid = req.params.pid;
  const platform = db.prepare('SELECT id FROM platform WHERE id = ? AND user_id = ?').get(pid, userId(req));
  if (!platform) { res.status(404).json({ error: '平台不存在' }); return; }
  const rows = db.prepare('SELECT * FROM model WHERE platform_id = ? AND user_id = ? ORDER BY is_default DESC').all(pid, userId(req));
  res.json({ data: rows.map(rowToM) });
});

router.post('/:pid/models', (req: Request, res: Response) => {
  const pid = req.params.pid;
  const platform = db.prepare('SELECT id FROM platform WHERE id = ? AND user_id = ?').get(pid, userId(req));
  if (!platform) { res.status(404).json({ error: '平台不存在' }); return; }
  const { modelId, alias, type, contextWindow, capabilities, pricing, enabled, isDefault } = req.body || {};
  if (!modelId) { res.status(400).json({ error: 'modelId 为必填项' }); return; }
  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO model (id, platform_id, user_id, model_id, alias, type, context_window, capabilities_json, pricing_json, enabled, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, pid, userId(req), modelId, alias || null, type || 'llm', contextWindow || 8000,
    JSON.stringify(capabilities || []), JSON.stringify(pricing || {}),
    enabled !== undefined ? (enabled ? 1 : 0) : 1, isDefault ? 1 : 0, now);
  res.json({ data: rowToM(db.prepare('SELECT * FROM model WHERE id = ?').get(id)) });
});

router.patch('/models/:mid', (req: Request, res: Response) => {
  const mid = req.params.mid;
  const row = db.prepare('SELECT * FROM model WHERE id = ? AND user_id = ?').get(mid, userId(req)) as any;
  if (!row) { res.status(404).json({ error: '模型不存在' }); return; }
  const sets: string[] = [];
  const vals: any[] = [];
  if (req.body.alias !== undefined) { sets.push('alias = ?'); vals.push(req.body.alias); }
  if (req.body.isDefault !== undefined) { sets.push('is_default = ?'); vals.push(req.body.isDefault ? 1 : 0); }
  if (req.body.enabled !== undefined) { sets.push('enabled = ?'); vals.push(req.body.enabled ? 1 : 0); }
  if (req.body.contextWindow !== undefined) { sets.push('context_window = ?'); vals.push(req.body.contextWindow); }
  if (req.body.capabilities !== undefined) { sets.push('capabilities_json = ?'); vals.push(JSON.stringify(req.body.capabilities)); }
  if (req.body.pricing !== undefined) { sets.push('pricing_json = ?'); vals.push(JSON.stringify(req.body.pricing)); }
  if (sets.length === 0) { res.json({ data: rowToM(row) }); return; }
  vals.push(mid);
  db.prepare(`UPDATE model SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ data: rowToM(db.prepare('SELECT * FROM model WHERE id = ?').get(mid)) });
});

router.delete('/models/:mid', (req: Request, res: Response) => {
  const mid = req.params.mid;
  if (!db.prepare('SELECT id FROM model WHERE id = ? AND user_id = ?').get(mid, userId(req))) {
    res.status(404).json({ error: '模型不存在' }); return;
  }
  db.prepare('DELETE FROM model WHERE id = ?').run(mid);
  res.json({ ok: true });
});

router.post('/models/batch', (req: Request, res: Response) => {
  const { platformId, models } = req.body || {};
  if (!platformId || !Array.isArray(models)) { res.status(400).json({ error: 'platformId 和 models 为必填项' }); return; }
  const platform = db.prepare('SELECT id FROM platform WHERE id = ? AND user_id = ?').get(platformId, userId(req));
  if (!platform) { res.status(404).json({ error: '平台不存在' }); return; }
  const uid = userId(req);
  const now = Date.now();

  const existingRows = db.prepare('SELECT model_id FROM model WHERE platform_id = ? AND user_id = ?').all(platformId, uid) as any[];
  const existingIds = new Set(existingRows.map((r: any) => r.model_id));
  const remoteIds = new Set(models.map((m: any) => m.modelId));

  const insertStmt = db.prepare(
    'INSERT OR IGNORE INTO model (id, platform_id, user_id, model_id, alias, type, context_window, capabilities_json, pricing_json, enabled, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const updateStmt = db.prepare(
    'UPDATE model SET type = ?, enabled = 1 WHERE platform_id = ? AND user_id = ? AND model_id = ?',
  );

  db.transaction(() => {
    for (const m of models) {
      if (existingIds.has(m.modelId)) {
        updateStmt.run(m.type || 'llm', platformId, uid, m.modelId);
      } else {
        insertStmt.run(uuid(), platformId, uid, m.modelId, m.alias || null, m.type || 'llm', m.contextWindow || 8000,
          JSON.stringify(m.capabilities || []), JSON.stringify(m.pricing || {}),
          m.enabled !== undefined ? (m.enabled ? 1 : 0) : 1, m.isDefault ? 1 : 0, now);
      }
    }
    for (const existingId of existingIds) {
      if (!remoteIds.has(existingId)) {
        db.prepare('UPDATE model SET enabled = 0 WHERE platform_id = ? AND user_id = ? AND model_id = ?').run(platformId, uid, existingId);
      }
    }
  })();

  const rows = db.prepare('SELECT * FROM model WHERE platform_id = ? AND user_id = ?').all(platformId, uid);
  res.json({ data: rows.map(rowToM) });
});

export default router;
