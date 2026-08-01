import { Router, Request, Response } from 'express';
import { db } from '../db.js';

const router = Router();

// 确保单例配置行存在
function ensureConfig() {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS marketplace_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 0,
      auth_type TEXT NOT NULL DEFAULT 'none',
      auth_token TEXT,
      port INTEGER NOT NULL DEFAULT 3001,
      updated_at INTEGER NOT NULL
    )`,
  ).run();
  const exists = db.prepare('SELECT id FROM marketplace_config WHERE id = 1').get();
  if (!exists) {
    db.prepare(
      'INSERT INTO marketplace_config (id, enabled, auth_type, auth_token, port, updated_at) VALUES (1, 0, \'none\', NULL, 3001, ?)',
    ).run(Date.now());
  }
}

// GET /api/marketplace/config — 读取商城服务端配置
router.get('/config', (_req: Request, res: Response) => {
  ensureConfig();
  const row = db.prepare('SELECT enabled, auth_type, auth_token, port FROM marketplace_config WHERE id = 1').get() as any;
  res.json({
    success: true,
    data: {
      enabled: !!row.enabled,
      auth: { authType: row.auth_type || 'none', token: row.auth_token || '' },
      port: row.port || 3001,
    },
  });
});

// PATCH /api/marketplace/config — 更新商城服务端配置（enabled / auth / port 均可选）
router.patch('/config', (req: Request, res: Response) => {
  ensureConfig();
  const { enabled, auth, port } = req.body || {};
  const cur = db.prepare('SELECT * FROM marketplace_config WHERE id = 1').get() as any;
  const nextEnabled = enabled === undefined ? cur.enabled : enabled ? 1 : 0;
  const nextAuthType = auth?.authType !== undefined ? auth.authType : cur.auth_type;
  const nextToken = auth?.token !== undefined ? auth.token : cur.auth_token;
  const nextPort = port !== undefined ? port : cur.port;
  db.prepare(
    'UPDATE marketplace_config SET enabled = ?, auth_type = ?, auth_token = ?, port = ?, updated_at = ? WHERE id = 1',
  ).run(nextEnabled, nextAuthType, nextToken, nextPort, Date.now());
  res.json({
    success: true,
    data: {
      enabled: !!nextEnabled,
      auth: { authType: nextAuthType, token: nextToken || '' },
      port: nextPort,
    },
  });
});

// GET /api/marketplace — 节点握手
router.get('/', (_req: Request, res: Response) => {
  res.json({ name: '言智', version: '0.1.0', capabilities: ['skill', 'agent', 'tool'] });
});

// GET /api/marketplace/skills
router.get('/skills', (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page)) || 1);
  const pageSize = Math.min(Math.max(1, parseInt(String(req.query.pageSize)) || 20), 100);
  const category = req.query.category as string | undefined;
  let where = 'WHERE is_public = 1'; const params: any[] = [];
  if (category) { where += ' AND category = ?'; params.push(category); }
  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM skill ${where}`).get(...params) as any).cnt;
  const items = db.prepare(
    `SELECT id, name, description, category, author, body, triggers_json, created_at, installs
     FROM skill ${where} ORDER BY installs DESC LIMIT ? OFFSET ?`,
  ).all(...params, pageSize, (page - 1) * pageSize);
  res.json({ success: true, data: { items, total, page, pageSize } });
});

// GET /api/marketplace/skills/:id
router.get('/skills/:id', (req: Request, res: Response) => {
  const s = db.prepare('SELECT * FROM skill WHERE id = ? AND is_public = 1').get(req.params.id) as any;
  if (!s) { res.status(404).json({ success: false, error: 'Skill 不存在' }); return; }
  res.json({ success: true, data: { id: s.id, name: s.name, description: s.description, category: s.category, author: s.author, triggers: s.triggers_json ? JSON.parse(s.triggers_json) : [], body: s.body, installs: s.installs || 0, createdAt: s.created_at } });
});

// POST /api/marketplace/skills/search
router.post('/skills/search', (req: Request, res: Response) => {
  const { query } = req.body || {};
  const page = Math.max(1, parseInt(String(req.query.page)) || 1);
  const pageSize = Math.min(Math.max(1, parseInt(String(req.query.pageSize)) || 20), 100);
  if (!query) { res.json({ success: true, data: { items: [], total: 0, page, pageSize } }); return; }
  const q = `%${query}%`;
  const total = (db.prepare('SELECT COUNT(*) as cnt FROM skill WHERE is_public = 1 AND (name LIKE ? OR description LIKE ?)').get(q, q) as any).cnt;
  const items = db.prepare(
    `SELECT id, name, description, category, author, triggers_json, created_at, installs
     FROM skill WHERE is_public = 1 AND (name LIKE ? OR description LIKE ?) ORDER BY installs DESC LIMIT ? OFFSET ?`,
  ).all(q, q, pageSize, (page - 1) * pageSize);
  res.json({ success: true, data: { items, total, page, pageSize } });
});

// GET /api/marketplace/skills/categories
router.get('/skills/categories', (_req: Request, res: Response) => {
  const rows = db.prepare("SELECT DISTINCT category FROM skill WHERE is_public = 1 AND category IS NOT NULL AND category != ''").all() as any[];
  res.json({ success: true, data: rows.map((r: any) => r.category) });
});

// GET /api/marketplace/agents
router.get('/agents', (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page)) || 1);
  const pageSize = Math.min(Math.max(1, parseInt(String(req.query.pageSize)) || 20), 100);
  const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent'").get();
  if (!existing) { res.json({ success: true, data: { items: [], total: 0, page, pageSize } }); return; }
  try {
    const total = db.prepare("SELECT COUNT(*) as cnt FROM agent WHERE is_public = 1").get() as any;
    const items = db.prepare(
      "SELECT id, name, description, avatar, version, created_at FROM agent WHERE is_public = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?",
    ).all(pageSize, (page - 1) * pageSize);
    res.json({ success: true, data: { items, total: total?.cnt || 0, page, pageSize } });
  } catch { res.json({ success: true, data: { items: [], total: 0, page, pageSize } }); }
});

// GET /api/marketplace/agents/:id
router.get('/agents/:id', (req: Request, res: Response) => {
  const a = db.prepare('SELECT * FROM agent WHERE id = ? AND is_public = 1').get(req.params.id) as any;
  if (!a) { res.status(404).json({ success: false, error: '智能体不存在' }); return; }
  res.json({ success: true, data: { id: a.id, name: a.name, description: a.description, avatar: a.avatar, workflow: a.workflow_json ? JSON.parse(a.workflow_json) : null, inputsSchema: a.inputs_schema_json ? JSON.parse(a.inputs_schema_json) : null, config: a.config_json ? JSON.parse(a.config_json) : null, version: a.version, createdAt: a.created_at } });
});

// POST /api/marketplace/agents/search
router.post('/agents/search', (req: Request, res: Response) => {
  const { query } = req.body || {};
  const page = Math.max(1, parseInt(String(req.query.page)) || 1);
  const pageSize = Math.min(Math.max(1, parseInt(String(req.query.pageSize)) || 20), 100);
  if (!query) { res.json({ success: true, data: { items: [], total: 0, page, pageSize } }); return; }
  const q = `%${query}%`;
  try {
    const total = db.prepare("SELECT COUNT(*) as cnt FROM agent WHERE is_public = 1 AND (name LIKE ? OR description LIKE ?)").get(q, q) as any;
    const items = db.prepare(
      "SELECT id, name, description, avatar, version, created_at FROM agent WHERE is_public = 1 AND (name LIKE ? OR description LIKE ?) ORDER BY created_at DESC LIMIT ? OFFSET ?",
    ).all(q, q, pageSize, (page - 1) * pageSize);
    res.json({ success: true, data: { items, total: total?.cnt || 0, page, pageSize } });
  } catch { res.json({ success: true, data: { items: [], total: 0, page, pageSize } }); }
});

// GET /api/marketplace/tools
router.get('/tools', (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page)) || 1);
  const pageSize = Math.min(Math.max(1, parseInt(String(req.query.pageSize)) || 20), 100);
  const total = (db.prepare('SELECT COUNT(*) as cnt FROM custom_tool WHERE is_public = 1').get() as any).cnt;
  const items = db.prepare(
    'SELECT id, name, description, runtime, input_schema_json, created_at FROM custom_tool WHERE is_public = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?',
  ).all(pageSize, (page - 1) * pageSize);
  res.json({ success: true, data: { items, total, page, pageSize } });
});

// GET /api/marketplace/tools/:id
router.get('/tools/:id', (req: Request, res: Response) => {
  const t = db.prepare('SELECT * FROM custom_tool WHERE id = ? AND is_public = 1').get(req.params.id) as any;
  if (!t) { res.status(404).json({ success: false, error: '工具不存在' }); return; }
  res.json({ success: true, data: { id: t.id, name: t.name, description: t.description, runtime: t.runtime, entry: t.entry, code: t.code, inputSchema: t.input_schema_json ? JSON.parse(t.input_schema_json) : null, outputSchema: t.output_schema_json ? JSON.parse(t.output_schema_json) : null, dependencies: t.dependencies_json ? JSON.parse(t.dependencies_json) : [], timeout: t.timeout, createdAt: t.created_at } });
});

// POST /api/marketplace/tools/search
router.post('/tools/search', (req: Request, res: Response) => {
  const { query } = req.body || {};
  const page = Math.max(1, parseInt(String(req.query.page)) || 1);
  const pageSize = Math.min(Math.max(1, parseInt(String(req.query.pageSize)) || 20), 100);
  if (!query) { res.json({ success: true, data: { items: [], total: 0, page, pageSize } }); return; }
  const q = `%${query}%`;
  const total = (db.prepare('SELECT COUNT(*) as cnt FROM custom_tool WHERE is_public = 1 AND (name LIKE ? OR description LIKE ?)').get(q, q) as any).cnt;
  const items = db.prepare(
    'SELECT id, name, description, runtime, input_schema_json, created_at FROM custom_tool WHERE is_public = 1 AND (name LIKE ? OR description LIKE ?) ORDER BY created_at DESC LIMIT ? OFFSET ?',
  ).all(q, q, pageSize, (page - 1) * pageSize);
  res.json({ success: true, data: { items, total, page, pageSize } });
});

export default router;
