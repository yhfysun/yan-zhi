import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../auth.js';
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

// GET /api/marketplace/config — 读取商城服务端配置（含 token，需 JWT 用户鉴权）
router.get('/config', authMiddleware, (_req: Request, res: Response) => {
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

// PATCH /api/marketplace/config — 更新商城服务端配置（需 JWT 用户鉴权；enabled / auth / port 均可选）
router.patch('/config', authMiddleware, (req: Request, res: Response) => {
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

// POST /api/marketplace/agents/publish — 本地用户将智能体快照发布到商城（JWT 鉴权，不走 marketplaceGuard）。
// agent 由本地 adapter 管理、商城读服务端 DB，故发布 = 把本地定义 upsert 到服务端 agent 表并置 is_public=1。
router.post('/agents/publish', authMiddleware, (req: Request, res: Response) => {
  const a = req.body?.agent;
  if (!a || !a.id || !a.name) { res.status(400).json({ success: false, error: 'agent(id,name) 为必填项' }); return; }
  const now = Date.now();
  const exists = db.prepare('SELECT id FROM agent WHERE id = ?').get(a.id);
  const fields = [
    a.name, a.description || null, a.avatar || null, a.systemPrompt || null,
    a.temperature ?? 0.7, a.maxTokens ?? 2048, a.topP ?? 1.0, a.frequencyPenalty ?? 0, a.presencePenalty ?? 0,
    JSON.stringify(a.workflow || { nodes: [], edges: [] }),
    a.inputsSchema ? JSON.stringify(a.inputsSchema) : null,
    a.config ? JSON.stringify(a.config) : null,
    a.type || 'harness',
    JSON.stringify(a.builtinToolIds || []), JSON.stringify(a.customToolIds || []),
    JSON.stringify(a.mcpToolMounts || []), JSON.stringify(a.skillIds || []), JSON.stringify(a.subAgentIds || []),
  ];
  if (exists) {
    db.prepare(
      `UPDATE agent SET name=?, description=?, avatar=?, system_prompt=?, temperature=?, max_tokens=?, top_p=?, frequency_penalty=?, presence_penalty=?, workflow_json=?, inputs_schema_json=?, config_json=?, type=?, builtin_tool_ids=?, custom_tool_ids=?, mcp_tool_mounts=?, skill_ids=?, sub_agent_ids=?, is_public=1, updated_at=? WHERE id=?`,
    ).run(...fields, now, a.id);
  } else {
    db.prepare(
      `INSERT INTO agent (id, name, description, avatar, system_prompt, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, workflow_json, inputs_schema_json, config_json, type, builtin_tool_ids, custom_tool_ids, mcp_tool_mounts, skill_ids, sub_agent_ids, is_public, source, version, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,'marketplace',1,?,?)`,
    ).run(a.id, ...fields, now, now);
  }
  res.json({ success: true, data: { id: a.id, isPublic: true } });
});

// POST /api/marketplace/agents/:id/unpublish — 下架智能体（JWT 鉴权）
router.post('/agents/:id/unpublish', authMiddleware, (req: Request, res: Response) => {
  const r = db.prepare('UPDATE agent SET is_public = 0 WHERE id = ?').run(req.params.id);
  if (r.changes === 0) { res.status(404).json({ success: false, error: '智能体不存在' }); return; }
  res.json({ success: true, data: { id: req.params.id, isPublic: false } });
});

// 商城鉴权中间件：/config 之外的 /marketplace/* 接口供远程节点访问，
// 需 marketplace 已启用（enabled=1）且通过 auth_type 校验（none/bearer/api-key）。
function marketplaceGuard(req: Request, res: Response, next: NextFunction) {
  ensureConfig();
  const cfg = db.prepare('SELECT enabled, auth_type, auth_token FROM marketplace_config WHERE id = 1').get() as any;
  if (!cfg || !cfg.enabled) { res.status(403).json({ success: false, error: '商城服务未启用' }); return; }
  const authType = cfg.auth_type || 'none';
  if (authType === 'bearer') {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ') || auth.slice(7) !== (cfg.auth_token || '')) {
      res.status(401).json({ success: false, error: 'Bearer token 校验失败' }); return;
    }
  } else if (authType === 'api-key') {
    const key = req.headers['x-api-key'];
    if (!key || key !== (cfg.auth_token || '')) {
      res.status(401).json({ success: false, error: 'API Key 校验失败' }); return;
    }
  }
  // auth_type === 'none' → 不校验请求头
  next();
}
router.use(marketplaceGuard);

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

// GET /api/marketplace/skills/categories —— 必须在 /skills/:id 之前注册，否则会被 :id 吞掉
router.get('/skills/categories', (_req: Request, res: Response) => {
  const rows = db.prepare("SELECT DISTINCT category FROM skill WHERE is_public = 1 AND category IS NOT NULL AND category != ''").all() as any[];
  res.json({ success: true, data: rows.map((r: any) => r.category) });
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

// POST /api/marketplace/skills/:id/install — 安装计数 +1 并返回完整定义
router.post('/skills/:id/install', (req: Request, res: Response) => {
  const s = db.prepare('SELECT * FROM skill WHERE id = ? AND is_public = 1').get(req.params.id) as any;
  if (!s) { res.status(404).json({ success: false, error: 'Skill 不存在' }); return; }
  db.prepare('UPDATE skill SET installs = COALESCE(installs, 0) + 1 WHERE id = ?').run(s.id);
  res.json({ success: true, data: { id: s.id, name: s.name, description: s.description, category: s.category, author: s.author, triggers: s.triggers_json ? JSON.parse(s.triggers_json) : [], body: s.body, installs: (s.installs || 0) + 1, createdAt: s.created_at } });
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

// GET /api/marketplace/agents/categories —— 必须在 /agents/:id 之前注册（agent 暂无 category 列，返回空保持接口一致）
router.get('/agents/categories', (_req: Request, res: Response) => {
  res.json({ success: true, data: [] });
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

// POST /api/marketplace/agents/:id/install — 安装计数 +1 并返回完整定义
router.post('/agents/:id/install', (req: Request, res: Response) => {
  const a = db.prepare('SELECT * FROM agent WHERE id = ? AND is_public = 1').get(req.params.id) as any;
  if (!a) { res.status(404).json({ success: false, error: '智能体不存在' }); return; }
  db.prepare('UPDATE agent SET installs = COALESCE(installs, 0) + 1 WHERE id = ?').run(a.id);
  res.json({ success: true, data: { id: a.id, name: a.name, description: a.description, avatar: a.avatar, workflow: a.workflow_json ? JSON.parse(a.workflow_json) : null, inputsSchema: a.inputs_schema_json ? JSON.parse(a.inputs_schema_json) : null, config: a.config_json ? JSON.parse(a.config_json) : null, version: a.version, installs: (a.installs || 0) + 1, createdAt: a.created_at } });
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

// GET /api/marketplace/tools/categories —— 必须在 /tools/:id 之前注册（custom_tool 暂无 category 列，返回空保持接口一致）
router.get('/tools/categories', (_req: Request, res: Response) => {
  res.json({ success: true, data: [] });
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

// POST /api/marketplace/tools/:id/install — 安装计数 +1 并返回完整定义
router.post('/tools/:id/install', (req: Request, res: Response) => {
  const t = db.prepare('SELECT * FROM custom_tool WHERE id = ? AND is_public = 1').get(req.params.id) as any;
  if (!t) { res.status(404).json({ success: false, error: '工具不存在' }); return; }
  db.prepare('UPDATE custom_tool SET installs = COALESCE(installs, 0) + 1 WHERE id = ?').run(t.id);
  res.json({ success: true, data: { id: t.id, name: t.name, description: t.description, runtime: t.runtime, entry: t.entry, code: t.code, inputSchema: t.input_schema_json ? JSON.parse(t.input_schema_json) : null, outputSchema: t.output_schema_json ? JSON.parse(t.output_schema_json) : null, dependencies: t.dependencies_json ? JSON.parse(t.dependencies_json) : [], timeout: t.timeout, installs: (t.installs || 0) + 1, createdAt: t.created_at } });
});

export default router;
