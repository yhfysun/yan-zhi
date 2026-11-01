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

// ===== 远程商品缓存（marketplace_cache）=====
//
// ★ 为什么要有：这张表从建库起就只有 CREATE 与 DELETE（删源时清缓存），**从来没有 INSERT**，
//   等于"设计完了没落地"—— 远程列表每次都实时 fetch，远程节点宕机/断网时商品页直接空白。
//   现在补上写入与读取，并让"远程失败"时**兜底返回缓存**（过期也用，标 stale），
//   这样断网状态下用户至少还能看到上次拉到的商品。
//
// 缓存粒度：只读端点（列表 / 分类 / 详情）。search 是 POST + 任意 body，不缓存。

/** 新鲜期：10 分钟内直接用缓存不回源；超过则回源，回源失败才用旧缓存。 */
const CACHE_TTL_MS = 10 * 60 * 1000;
/** 回源超时：远程卡住不能无限等，超时后走缓存兜底（与 /:id/test 的 10s 一致）。 */
const FETCH_TIMEOUT_MS = 10000;

function cacheKeyOf(...parts: (string | number)[]): string {
  return parts.join('|');
}

function readCache(remoteId: string, itemType: string, key: string): { data: any; cachedAt: number } | null {
  try {
    const row = db.prepare('SELECT data_json, cached_at FROM marketplace_cache WHERE remote_id = ? AND item_type = ? AND item_id = ?')
      .get(remoteId, itemType, key) as any;
    if (!row) return null;
    return { data: JSON.parse(row.data_json), cachedAt: Number(row.cached_at) || 0 };
  } catch {
    // 缓存坏了不能影响主流程：当成没缓存
    return null;
  }
}

function writeCache(remoteId: string, itemType: string, key: string, data: unknown): void {
  try {
    // INSERT OR REPLACE：命中 UNIQUE(remote_id, item_type, item_id) 时整行替换，兼容老 SQLite
    db.prepare('INSERT OR REPLACE INTO marketplace_cache (id, remote_id, item_type, item_id, data_json, cached_at) VALUES (?,?,?,?,?,?)')
      .run(uuid(), remoteId, itemType, key, JSON.stringify(data), Date.now());
  } catch {
    // 写缓存失败只降级，不阻断响应
  }
}

interface RemoteResult { ok: boolean; status: number; data: any; }

async function fetchRemote(url: string, init?: RequestInit): Promise<RemoteResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { ...(init || {}), signal: ctrl.signal });
    const data = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 带缓存的远程读取：新鲜缓存直接返回；否则回源，成功写缓存，失败兜底用旧缓存。
 * 返回 null 表示既没拉到也没有缓存可兜底，由调用方按原逻辑报错。
 */
async function readThroughCache(
  s: any, itemType: string, key: string, url: string, init?: RequestInit,
): Promise<{ data: any; fromCache: boolean; stale: boolean; status?: number } | null> {
  const hit = readCache(s.id, itemType, key);
  const fresh = hit && Date.now() - hit.cachedAt < CACHE_TTL_MS;
  if (fresh) return { data: hit!.data, fromCache: true, stale: false };

  let lastStatus: number | undefined;
  try {
    const r = await fetchRemote(url, init);
    lastStatus = r.status;
    if (r.ok && r.data != null) {
      writeCache(s.id, itemType, key, r.data);
      return { data: r.data, fromCache: false, stale: false };
    }
  } catch {
    // 落到下面缓存兜底
  }
  if (hit) return { data: hit.data, fromCache: true, stale: true, status: lastStatus };
  return null;
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
    const page = req.query.page || 1; const pageSize = req.query.pageSize || 20;
    const r = await readThroughCache(s, type, cacheKeyOf('list', String(page), String(pageSize)),
      `${marketApiBase(s.base_url)}/api/marketplace/${itemPath}?page=${page}&pageSize=${pageSize}`,
      { headers: authHeaders(s) });
    if (!r) { res.status(502).json({ success: false, error: '远程源不可用，且本地没有可用缓存' }); return; }
    res.json({ ...r.data, cached: r.fromCache, stale: r.stale });
  });

  // GET /:id/{item}/categories —— 必须在 /:id/{item}/:itemId 之前注册
  router.get(`/:id/${itemPath}/categories`, async (req: Request, res: Response) => {
    const s = db.prepare(`SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='${type}'`).get(req.params.id, req.user!.userId) as any;
    if (!s) { res.status(404).json({ error: '远程源不存在' }); return; }
    const r = await readThroughCache(s, type, 'categories',
      `${marketApiBase(s.base_url)}/api/marketplace/${itemPath}/categories`,
      { headers: authHeaders(s) });
    if (!r) { res.status(502).json({ success: false, error: '远程源不可用，且本地没有可用缓存' }); return; }
    res.json({ ...r.data, cached: r.fromCache, stale: r.stale });
  });

  router.get(`/:id/${itemPath}/:itemId`, async (req: Request, res: Response) => {
    const s = db.prepare(`SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='${type}'`).get(req.params.id, req.user!.userId) as any;
    if (!s) { res.status(404).json({ error: '远程源不存在' }); return; }
    const r = await readThroughCache(s, type, cacheKeyOf('item', req.params.itemId),
      `${marketApiBase(s.base_url)}/api/marketplace/${itemPath}/${encodeURIComponent(req.params.itemId)}`,
      { headers: authHeaders(s) });
    if (!r) { res.status(502).json({ success: false, error: '远程源不可用，且本地没有可用缓存' }); return; }
    res.json({ ...r.data, cached: r.fromCache, stale: r.stale });
  });

  // POST /:id/refresh-cache —— 手动丢弃该源的缓存，下次读取强制回源
  router.post('/:id/refresh-cache', (req: Request, res: Response) => {
    if (!db.prepare(`SELECT id FROM remote_marketplace WHERE id = ? AND user_id = ? AND type='${type}'`).get(req.params.id, req.user!.userId)) {
      res.status(404).json({ error: '远程源不存在' }); return;
    }
    db.prepare('DELETE FROM marketplace_cache WHERE remote_id = ?').run(req.params.id);
    res.json({ ok: true });
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
