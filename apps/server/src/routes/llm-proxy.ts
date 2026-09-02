// LLM 代理转发路由 —— 前端统一走后端，后端从库读 platform 配置（api_url / api_key_enc / protocol / headers），
// 转发到上游并透传 SSE。解决浏览器直连第三方 API 的 CORS 问题，且 API Key 不暴露给前端。
// 前端只需传 platformId + payload（payload.model 即 modelId）。
import { Router, Request, Response as ExpressResponse } from 'express';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';

const router = Router();
router.use(authMiddleware);

function loadPlatform(req: Request): any | null {
  const userId = req.user!.userId;
  const platformId = (req.body as any)?.platformId || req.query.platformId;
  if (!platformId) return null;
  const row = db.prepare('SELECT * FROM platform WHERE id = ? AND user_id = ?').get(platformId, userId) as any;
  return row || null;
}

/** loadPlatform 失败时的诊断响应：附 platformId/userId，便于前端 Network 排查 */
function platformNotFound(res: ExpressResponse, req: Request): void {
  const platformId = (req.body as any)?.platformId || req.query.platformId || '(空)';
  res.status(404).json({ error: '平台不存在', platformId, userId: req.user?.userId });
}

function baseUrl(p: any): string {
  return (p.api_url || '').replace(/\/$/, '');
}

function upstreamHeaders(p: any, anthropic: boolean): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = p.api_key_enc || '';
  if (anthropic) {
    h['x-api-key'] = apiKey;
    h['anthropic-version'] = '2023-06-01';
  } else {
    h['Authorization'] = `Bearer ${apiKey}`;
  }
  try {
    const extra = JSON.parse(p.headers_json || '{}');
    Object.assign(h, extra);
  } catch {}
  return h;
}

/** 透传上游响应：SSE 流式则 pipe，否则透传 status + body */
async function forward(upstream: Response, res: ExpressResponse): Promise<void> {
  const ct = upstream.headers.get('content-type') || '';
  if (ct.includes('text/event-stream') && upstream.body) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } catch {
      // 客户端断开
    }
    res.end();
    return;
  }
  const text = await upstream.text().catch(() => '');
  res.status(upstream.status).setHeader('Content-Type', ct || 'application/json');
  res.send(text);
}

// POST /api/llm/chat/completions  body: { platformId, payload }
router.post('/chat/completions', async (req: Request, res: ExpressResponse) => {
  const p = loadPlatform(req);
  if (!p) { platformNotFound(res, req); return; }
  try {
    const upstream = await fetch(`${baseUrl(p)}/v1/chat/completions`, {
      method: 'POST',
      headers: upstreamHeaders(p, false),
      body: JSON.stringify((req.body as any)?.payload ?? {}),
    });
    await forward(upstream, res);
  } catch (e: any) {
    res.status(502).json({ error: `代理请求失败: ${e?.message || e}` });
  }
});

// POST /api/llm/messages  body: { platformId, payload }  (Anthropic 协议)
router.post('/messages', async (req: Request, res: ExpressResponse) => {
  const p = loadPlatform(req);
  if (!p) { platformNotFound(res, req); return; }
  try {
    const upstream = await fetch(`${baseUrl(p)}/v1/messages`, {
      method: 'POST',
      headers: upstreamHeaders(p, true),
      body: JSON.stringify((req.body as any)?.payload ?? {}),
    });
    await forward(upstream, res);
  } catch (e: any) {
    res.status(502).json({ error: `代理请求失败: ${e?.message || e}` });
  }
});

// POST /api/llm/embeddings  body: { platformId, payload }
router.post('/embeddings', async (req: Request, res: ExpressResponse) => {
  const p = loadPlatform(req);
  if (!p) { platformNotFound(res, req); return; }
  try {
    const upstream = await fetch(`${baseUrl(p)}/v1/embeddings`, {
      method: 'POST',
      headers: upstreamHeaders(p, false),
      body: JSON.stringify((req.body as any)?.payload ?? {}),
    });
    await forward(upstream, res);
  } catch (e: any) {
    res.status(502).json({ error: `代理请求失败: ${e?.message || e}` });
  }
});

// GET /api/llm/models?platformId=
router.get('/models', async (req: Request, res: ExpressResponse) => {
  const userId = req.user!.userId;
  const platformId = req.query.platformId as string;
  if (!platformId) { res.status(400).json({ error: 'platformId 必填' }); return; }
  const p = db.prepare('SELECT * FROM platform WHERE id = ? AND user_id = ?').get(platformId, userId) as any;
  if (!p) { res.status(404).json({ error: '平台不存在' }); return; }
  try {
    const upstream = await fetch(`${baseUrl(p)}/v1/models`, { headers: upstreamHeaders(p, false) });
    const text = await upstream.text().catch(() => '');
    res.status(upstream.status).setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (e: any) {
    res.status(502).json({ error: `代理请求失败: ${e?.message || e}` });
  }
});

// POST /api/llm/preview-models  body: { apiUrl, apiKey, headers, anthropic? }
// 平台未保存时测试连通性 / 预览模型（绕过浏览器 CORS）。apiKey 仅临时转发，不入库。
router.post('/preview-models', async (req: Request, res: ExpressResponse) => {
  const { apiUrl, apiKey, headers, anthropic } = (req.body as any) || {};
  if (!apiUrl) { res.status(400).json({ error: 'apiUrl 必填' }); return; }
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (anthropic) { h['x-api-key'] = apiKey || ''; h['anthropic-version'] = '2023-06-01'; }
  else { h['Authorization'] = `Bearer ${apiKey || ''}`; }
  Object.assign(h, headers || {});
  try {
    const upstream = await fetch(`${String(apiUrl).replace(/\/$/, '')}/v1/models`, { headers: h });
    const text = await upstream.text().catch(() => '');
    res.status(upstream.status).setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (e: any) {
    res.status(502).json({ error: `代理请求失败: ${e?.message || e}` });
  }
});

export default router;