// web_search 服务端代理 —— 前端直接 fetch 搜索引擎会被 CORS 拦截，
// 故由服务端代理：前端调 /api/search，服务端用统一解析的 SearchBackend 抓取后返回。
//
// 后端选型：使用带降级链的 getSearchBackendWithFallback()，自动按
// 「用户配置 → Playwright（项目已有）→ DuckDuckGo（零依赖）→ 外部 endpoint」
// 顺序探测首个可用后端。chromium 未安装时不再硬抛，自动切到 DuckDuckGo。
import { Router, Request, Response } from 'express';
import { optionalAuth } from '../auth.js';
import { getSearchBackendWithFallback } from '../mcp/search-backend.js';

const router = Router();
router.use(optionalAuth);

// GET /api/search?q=...&maxResults=...&timeRange=...
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q || '');
    const maxResults = parseInt(String(req.query.maxResults || '5'), 10) || 5;
    // timeRange 透传给后端（day/week/month/year/recent）；类型在 core 内部为联合字面量，这里用 any 透传避免改 core barrel
    const timeRange = (String(req.query.timeRange || '') as any) || undefined;
    if (!query) { res.status(400).json({ error: 'q 为必填项' }); return; }
    const backend = await getSearchBackendWithFallback();
    const results = await backend.search(query, maxResults, timeRange);
    res.json({ data: results });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '搜索失败' });
  }
});

export default router;