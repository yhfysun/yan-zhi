// web_search 服务端代理 —— 前端直接 fetch DuckDuckGo 会被 CORS 拦截，
// 故由服务端代理：前端调 /api/search，服务端用 DuckDuckGoSearchBackend 抓取后返回。
import { Router, Request, Response } from 'express';
import { optionalAuth } from '../auth.js';
import { DuckDuckGoSearchBackend } from '@yan-zhi/core';

const router = Router();
router.use(optionalAuth);

const backend = new DuckDuckGoSearchBackend();

// GET /api/search?q=...&maxResults=...
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q || '');
    const maxResults = parseInt(String(req.query.maxResults || '5'), 10) || 5;
    if (!query) { res.status(400).json({ error: 'q 为必填项' }); return; }
    const results = await backend.search(query, maxResults);
    res.json({ data: results });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '搜索失败' });
  }
});

export default router;