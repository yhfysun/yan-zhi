// 同源商城源管理路由的参数化工厂（P6 收敛，2026-10-04）。
//
// ★ 为什么要存在：agent / skill / tool 三个 marketplace-sources 路由文件是**逐行同构的
//   三胞胎**（共 7 个端点完全相同），只有三处差异：
//     ① remote_marketplace.type 过滤值；
//     ② 列表/详情/搜索路径段（agents / skills / tools）；
//     ③ install 的持久化逻辑（各自写不同的业务表）。
//   此前改任何一处（如鉴权头、错误文案、超时）都要人工同步三份 —— 必漏。
//
// 用法：三个文件各自 `export default createMarketplaceSourcesRouter({ type, itemPath,
// itemIdField, saveItem })`，saveItem 是各自唯一的业务差异点。

import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';

export interface MarketplaceSourcesOptions {
  /** remote_marketplace.type 过滤值 */
  type: 'agent' | 'skill' | 'tool';
  /** 列表/详情/搜索的路径段（agents / skills / tools） */
  itemPath: string;
  /** install 请求体里的 id 字段名（agentId / skillId / toolId） */
  itemIdField: string;
  /** 远程 install 拉到定义后的持久化（各类型唯一的业务差异点） */
  saveItem: (ctx: { item: any; sourceId: string; userId: string; res: Response }) => void | Promise<void>;
}

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

export function createMarketplaceSourcesRouter(opts: MarketplaceSourcesOptions): Router {
  const { type, itemPath, itemIdField } = opts;
  const router = Router();
  router.use(authMiddleware);

  router.get('/', (req: Request, res: Response) => {
    const rows = db.prepare(`SELECT id, name, base_url, auth_type, enabled, created_at FROM remote_marketplace WHERE user_id = ? AND type='${type}' ORDER BY created_at DESC`).all(req.user!.userId);
    res.json({ data: rows });
  });

  router.post('/', (req: Request, res: Response) => {
    const { name, baseUrl, authType, authConfig } = req.body || {};
    if (!name || !baseUrl) { res.status(400).json({ error: 'name, baseUrl 为必填项' }); return; }
    const id = uuid(); const now = Date.now();
    db.prepare('INSERT INTO remote_marketplace (id, user_id, name, type, base_url, auth_type, auth_config_enc, enabled, created_at) VALUES (?,?,?,?,?,?,?,1,?)').run(id, req.user!.userId, name, type, baseUrl, authType || 'none', authConfig ? JSON.stringify(authConfig) : null, now);
    res.json({ data: db.prepare('SELECT id, name, base_url, auth_type, enabled, created_at FROM remote_marketplace WHERE id = ?').get(id) });
  });

  router.patch('/:id', (req: Request, res: Response) => {
    const e = db.prepare(`SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='${type}'`).get(req.params.id, req.user!.userId) as any;
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
    if (!db.prepare(`SELECT id FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='${type}'`).get(req.params.id, req.user!.userId)) { res.status(404).json({ error: '远程源不存在' }); return; }
    db.prepare('DELETE FROM marketplace_cache WHERE remote_id = ?').run(req.params.id);
    db.prepare('DELETE FROM remote_marketplace WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/:id/test', async (req: Request, res: Response) => {
    const s = db.prepare(`SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='${type}'`).get(req.params.id, req.user!.userId) as any;
    if (!s) { res.status(404).json({ error: '远程源不存在' }); return; }
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
      const resp = await fetch(`${marketApiBase(s.base_url)}/api/marketplace`, { headers: authHeaders(s), signal: ctrl.signal });
      clearTimeout(t);
      if (!resp.ok) { res.json({ ok: false, error: `连接失败，状态码: ${resp.status}` }); return; }
      res.json({ ok: true, info: await resp.json() });
    } catch (err: unknown) { res.json({ ok: false, error: err instanceof Error ? err.message : String(err) }); }
  });

  router.get(`/:id/${itemPath}`, async (req: Request, res: Response) => {
    const s = db.prepare(`SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='${type}'`).get(req.params.id, req.user!.userId) as any;
    if (!s) { res.status(404).json({ error: '远程源不存在' }); return; }
    try {
      const page = req.query.page || 1; const pageSize = req.query.pageSize || 20;
      const resp = await fetch(`${marketApiBase(s.base_url)}/api/marketplace/${itemPath}?page=${page}&pageSize=${pageSize}`, { headers: authHeaders(s) });
      if (!resp.ok) { res.status(resp.status).json({ success: false, error: `远程源返回状态码: ${resp.status}` }); return; }
      res.json(await resp.json());
    } catch (err: unknown) { res.status(502).json({ success: false, error: err instanceof Error ? err.message : String(err) }); }
  });

  // GET /:id/{item}/categories —— 必须在 /:id/{item}/:itemId 之前注册
  router.get(`/:id/${itemPath}/categories`, async (req: Request, res: Response) => {
    const s = db.prepare(`SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='${type}'`).get(req.params.id, req.user!.userId) as any;
    if (!s) { res.status(404).json({ error: '远程源不存在' }); return; }
    try {
      const resp = await fetch(`${marketApiBase(s.base_url)}/api/marketplace/${itemPath}/categories`, { headers: authHeaders(s) });
      if (!resp.ok) { res.status(resp.status).json({ success: false, error: `远程源返回状态码: ${resp.status}` }); return; }
      res.json(await resp.json());
    } catch (err: unknown) { res.status(502).json({ success: false, error: err instanceof Error ? err.message : String(err) }); }
  });

  router.get(`/:id/${itemPath}/:itemId`, async (req: Request, res: Response) => {
    const s = db.prepare(`SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='${type}'`).get(req.params.id, req.user!.userId) as any;
    if (!s) { res.status(404).json({ error: '远程源不存在' }); return; }
    try {
      const resp = await fetch(`${marketApiBase(s.base_url)}/api/marketplace/${itemPath}/${encodeURIComponent(req.params.itemId)}`, { headers: authHeaders(s) });
      if (!resp.ok) { res.status(resp.status).json({ success: false, error: `远程源返回状态码: ${resp.status}` }); return; }
      res.json(await resp.json());
    } catch (err: unknown) { res.status(502).json({ success: false, error: err instanceof Error ? err.message : String(err) }); }
  });

  router.post(`/:id/${itemPath}/search`, async (req: Request, res: Response) => {
    const s = db.prepare(`SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='${type}'`).get(req.params.id, req.user!.userId) as any;
    if (!s) { res.status(404).json({ error: '远程源不存在' }); return; }
    try {
      const page = req.query.page || 1; const pageSize = req.query.pageSize || 20;
      const resp = await fetch(`${marketApiBase(s.base_url)}/api/marketplace/${itemPath}/search?page=${page}&pageSize=${pageSize}`, {
        method: 'POST', headers: { ...authHeaders(s), 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {}),
      });
      if (!resp.ok) { res.status(resp.status).json({ success: false, error: `远程源返回状态码: ${resp.status}` }); return; }
      res.json(await resp.json());
    } catch (err: unknown) { res.status(502).json({ success: false, error: err instanceof Error ? err.message : String(err) }); }
  });

  router.post('/:id/install', async (req: Request, res: Response) => {
    const s = db.prepare(`SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='${type}'`).get(req.params.id, req.user!.userId) as any;
    if (!s) { res.status(404).json({ error: '远程源不存在' }); return; }
    const itemId = (req.body || {})[itemIdField];
    if (!itemId) { res.status(400).json({ error: `${itemIdField} 为必填项` }); return; }
    try {
      // 调用远程 install 端点（POST），既获取完整定义又递增远程安装计数
      const resp = await fetch(`${marketApiBase(s.base_url)}/api/marketplace/${itemPath}/${encodeURIComponent(itemId)}/install`, {
        method: 'POST', headers: { ...authHeaders(s), 'Content-Type': 'application/json' },
      });
      const data = await resp.json();
      if (!data.success || !data.data) { res.status(404).json({ error: `远程${itemPath.slice(0, -1)}不存在` }); return; }
      await opts.saveItem({ item: data.data, sourceId: req.params.id, userId: req.user!.userId, res });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
  });

  return router;
}
