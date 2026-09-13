import { Router, Request, Response as ExpressResponse } from 'express';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import {
  pickToken,
  recordSuccess,
  recordFailure,
  pauseIfNeeded,
  MAX_RETRY,
  shouldRetryStatus,
} from '../services/token-pool.js';

const router = Router();
router.use(authMiddleware);

function loadPlatform(req: Request): any | null {
  const userId = req.user!.userId;
  const platformId = (req.body as any)?.platformId || req.query.platformId;
  if (!platformId) return null;
  const row = db.prepare('SELECT * FROM platform WHERE id = ? AND user_id = ?').get(platformId, userId) as any;
  return row || null;
}

function platformNotFound(res: ExpressResponse, req: Request): void {
  const platformId = (req.body as any)?.platformId || req.query.platformId || '(空)';
  res.status(404).json({ error: '平台不存在', platformId, userId: req.user?.userId });
}

function baseUrl(p: any): string {
  return (p.api_url || '').replace(/\/$/, '');
}

function upstreamHeaders(p: any, apiKey: string, anthropic: boolean): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
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

/**
 * 带 Token 池重试的代理请求：每次选最优 Token → 停顿 → fetch，
 * 成功则转发；失败（401/403/429/5xx/网络错误）则记录并换 Token 重试，最多 MAX_RETRY 次。
 * 业务错误（如 400 模型不支持）不换 Token，直接转发给前端。
 */
async function proxyWithRetry(
  p: any,
  anthropic: boolean,
  path: string,
  body: any,
  res: ExpressResponse,
  isStream: boolean,
): Promise<void> {
  const url = `${baseUrl(p)}/${path}`;
  const triedIds: string[] = [];
  const fallbackKey = p.api_key_enc || '';

  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const token = pickToken(p.id, triedIds);
    const apiKey = token?.apiKey || fallbackKey;
    if (token) triedIds.push(token.id);

    await pauseIfNeeded(p);

    let upstream: Response;
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers: upstreamHeaders(p, apiKey, anthropic),
        body: JSON.stringify(body ?? {}),
      });
    } catch (e: any) {
      if (token) recordFailure(token.id);
      if (attempt < MAX_RETRY - 1 && (token || fallbackKey)) continue;
      res.status(502).json({ error: `代理请求失败: ${e?.message || e}` });
      return;
    }

    if (upstream.ok) {
      if (token) recordSuccess(token.id);
      await forward(upstream, res);
      return;
    }

    if (shouldRetryStatus(upstream.status)) {
      if (token) recordFailure(token.id);
      if (attempt < MAX_RETRY - 1) {
        await upstream.text().catch(() => {});
        continue;
      }
    }

    await forward(upstream, res);
    return;
  }

  res.status(502).json({ error: '所有 Token 均不可用，已达到最大重试次数' });
}

router.post('/chat/completions', async (req: Request, res: ExpressResponse) => {
  const p = loadPlatform(req);
  if (!p) { platformNotFound(res, req); return; }
  try {
    await proxyWithRetry(p, false, 'v1/chat/completions', (req.body as any)?.payload, res, true);
  } catch (e: any) {
    res.status(502).json({ error: `代理请求失败: ${e?.message || e}` });
  }
});

router.post('/messages', async (req: Request, res: ExpressResponse) => {
  const p = loadPlatform(req);
  if (!p) { platformNotFound(res, req); return; }
  try {
    await proxyWithRetry(p, true, 'v1/messages', (req.body as any)?.payload, res, true);
  } catch (e: any) {
    res.status(502).json({ error: `代理请求失败: ${e?.message || e}` });
  }
});

router.post('/embeddings', async (req: Request, res: ExpressResponse) => {
  const p = loadPlatform(req);
  if (!p) { platformNotFound(res, req); return; }
  try {
    await proxyWithRetry(p, false, 'v1/embeddings', (req.body as any)?.payload, res, false);
  } catch (e: any) {
    res.status(502).json({ error: `代理请求失败: ${e?.message || e}` });
  }
});

router.get('/models', async (req: Request, res: ExpressResponse) => {
  const userId = req.user!.userId;
  const platformId = req.query.platformId as string;
  if (!platformId) { res.status(400).json({ error: 'platformId 必填' }); return; }
  const p = db.prepare('SELECT * FROM platform WHERE id = ? AND user_id = ?').get(platformId, userId) as any;
  if (!p) { res.status(404).json({ error: '平台不存在' }); return; }
  try {
    const triedIds: string[] = [];
    const fallbackKey = p.api_key_enc || '';
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      const token = pickToken(p.id, triedIds);
      const apiKey = token?.apiKey || fallbackKey;
      if (token) triedIds.push(token.id);
      await pauseIfNeeded(p);
      let upstream: Response;
      try {
        upstream = await fetch(`${baseUrl(p)}/v1/models`, { headers: upstreamHeaders(p, apiKey, false) });
      } catch (e: any) {
        if (token) recordFailure(token.id);
        if (attempt < MAX_RETRY - 1 && (token || fallbackKey)) continue;
        res.status(502).json({ error: `代理请求失败: ${e?.message || e}` });
        return;
      }
      if (upstream.ok) {
        if (token) recordSuccess(token.id);
        const text = await upstream.text().catch(() => '');
        res.status(upstream.status).setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
        res.send(text);
        return;
      }
      if (shouldRetryStatus(upstream.status)) {
        if (token) recordFailure(token.id);
        if (attempt < MAX_RETRY - 1) { await upstream.text().catch(() => {}); continue; }
      }
      const text = await upstream.text().catch(() => '');
      res.status(upstream.status).setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
      res.send(text);
      return;
    }
    res.status(502).json({ error: '所有 Token 均不可用' });
  } catch (e: any) {
    res.status(502).json({ error: `代理请求失败: ${e?.message || e}` });
  }
});

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
