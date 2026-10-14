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
import { buildProtocolHeaders } from '@yan-zhi/core';
import {
  isDashscopePlatform,
  dashscopeNativeRoot,
  toDashscopeSize,
  extractDashscopeImageUrl,
} from '../mcp/api-tool-executor.js';

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
  // 鉴权头唯一实现（core buildProtocolHeaders，与 LlmClient 同源——P2 收敛）
  const h = buildProtocolHeaders(anthropic ? 'anthropic' : 'openai', apiKey);
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

// 生图代理（能力测试「图片生成」/ UI 侧调用）：OpenAI 标准 /v1/images/generations
/**
 * 百炼（DashScope）原生文生图 —— **只取图片 URL，不落盘**。
 *
 * ★★★ 2026-10-14：为什么必须走这条 —— 百炼的 **OpenAI 兼容模式不提供生图接口**
 *   （实测 compatible-mode/v1/images/generations 直接 404、响应体为空），
 *   于是设置页「测试」在百炼上**永远 404**，用户以为"百炼不能生图"
 *   （生图其实一直是好的，见 api_image_generate 的原生通道）。
 *
 * 复用边界：端点判定 / 原生根 / 尺寸换算 / 取 URL 这四个**纯 helper 从
 * mcp/api-tool-executor.ts 导入**（同一知识只有一处实现）；请求与轮询这段薄脚手架
 * 按代理的形态就地写 —— driver 那条会**下载并落盘**（工具语义），形状不同，
 * 让它来服务代理只会两边都变形。将来若要合并，应把 driver 拆成
 * 「取 URL」+「下载落盘」两层，而不是让代理去调工具。
 *
 * 同步模型（qwen-image-* / z-image-turbo）直接返回；万相（wan*）是异步任务，需轮询。
 */
async function dashscopeImageUrl(
  baseUrlStr: string,
  apiKey: string,
  payload: any,
): Promise<{ ok: boolean; url?: string; error?: string; status?: number }> {
  const model = String(payload?.model || '');
  const prompt = String(payload?.prompt || '');
  if (!model || !prompt) return { ok: false, status: 400, error: 'model 与 prompt 必填' };
  const root = dashscopeNativeRoot(baseUrlStr);
  let size = toDashscopeSize(String(payload?.size || ''));
  // ★ 尺寸下限兜底（2026-10-14 实测）：百炼 t2i 要求面积 ≥ 512×512，而「能力测试」
  //   固定发 256x256 ⇒ 即使走对了原生通道也会被 400 拒（实测原文：
  //   `Image area must be between 262144 (512x512) and 6553600 (2560x2560) pixels`）。
  //   这里按平台下限抬到 512*512，客户端不必知道各家尺寸约束。
  const mArea = /^(\d+)\*(\d+)$/.exec(size);
  if (!size || (mArea && Number(mArea[1]) * Number(mArea[2]) < 512 * 512)) size = '512*512';
  const useAsync = /^wan/i.test(model);
  const endpoint = useAsync
    ? `${root}/api/v1/services/aigc/image-generation/generation`
    : `${root}/api/v1/services/aigc/multimodal-generation/generation`;
  const body: Record<string, unknown> = {
    model,
    input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
    parameters: { ...(size ? { size } : {}), n: Number(payload?.n) > 0 ? Number(payload.n) : 1 },
  };
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(useAsync ? { 'X-DashScope-Async': 'enable' } : {}),
  };
  let res: Response;
  try {
    res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e: any) {
    return { ok: false, status: 502, error: `百炼生图请求失败: ${e?.message || e}` };
  }
  const text = await res.text().catch(() => '');
  if (!res.ok) return { ok: false, status: res.status, error: `百炼生图 HTTP ${res.status}: ${text.slice(0, 300)}` };
  let j: any;
  try { j = JSON.parse(text); } catch { return { ok: false, status: 502, error: '百炼生图响应不是合法 JSON' }; }
  if (!useAsync) {
    const url = extractDashscopeImageUrl(j);
    return url ? { ok: true, url } : { ok: false, status: 502, error: `百炼生图响应里没有图片地址: ${text.slice(0, 300)}` };
  }
  const taskId = String(j?.output?.task_id || '');
  if (!taskId) return { ok: false, status: 502, error: `百炼生图任务未返回 task_id: ${text.slice(0, 300)}` };
  const DONE = ['succeeded', 'success', 'finished', 'completed', 'done'];
  const FAILED = ['failed', 'error', 'cancelled', 'canceled'];
  // 能力测试不该像出片那样等 8 分钟：这里 3 分钟封顶，超了如实说明并给同步模型建议
  const deadline = Date.now() + 3 * 60 * 1000;
  let last: any = j;
  let st = String(j?.output?.task_status || 'PENDING');
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const pr = await fetch(`${root}/api/v1/tasks/${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
      const pt = await pr.text();
      if (pr.ok) { last = JSON.parse(pt); st = String(last?.output?.task_status || st); }
    } catch { /* 网络抖动下轮再试 */ }
    const s = st.toLowerCase();
    if (DONE.includes(s)) break;
    if (FAILED.includes(s)) return { ok: false, status: 502, error: `百炼生图任务失败（taskId=${taskId}）: ${JSON.stringify(last).slice(0, 300)}` };
  }
  if (!DONE.includes(st.toLowerCase())) {
    return {
      ok: false, status: 504,
      error: `百炼生图任务仍在处理（taskId=${taskId}，status=${st}）。万相系列为异步任务，可稍后重试；要立即出图可改用同步模型 qwen-image-3.0-pro / z-image-turbo。`,
    };
  }
  const url = extractDashscopeImageUrl(last);
  return url ? { ok: true, url } : { ok: false, status: 502, error: `百炼生图任务完成但没拿到图片地址: ${JSON.stringify(last).slice(0, 300)}` };
}

router.post('/images/generations', async (req: Request, res: ExpressResponse) => {
  const p = loadPlatform(req);
  if (!p) { platformNotFound(res, req); return; }
  const payload = (req.body as any)?.payload ?? {};
  // ★ 百炼走原生通道：兼容模式不支持生图，原样转发只会拿到上游的空体 404（见上方注释）
  if (isDashscopePlatform(baseUrl(p))) {
    const key = pickToken(p.id)?.apiKey || p.api_key_enc || '';
    const out = await dashscopeImageUrl(baseUrl(p), key, payload);
    if (!out.ok || !out.url) { res.status(out.status || 502).json({ error: out.error || '百炼生图失败' }); return; }
    // 回成 OpenAI 形状 —— 客户端（能力测试 / UI）无需任何改动
    res.json({ data: [{ url: out.url }] });
    return;
  }
  try {
    await proxyWithRetry(p, false, 'v1/images/generations', payload, res, false);
  } catch (e: any) {
    res.status(502).json({ error: `代理请求失败: ${e?.message || e}` });
  }
});

// 生视频代理（能力测试「视频生成」/ UI 侧调用）：/v1/videos（agnes 异步任务提交）
router.post('/videos', async (req: Request, res: ExpressResponse) => {
  const p = loadPlatform(req);
  if (!p) { platformNotFound(res, req); return; }
  try {
    await proxyWithRetry(p, false, 'v1/videos', (req.body as any)?.payload, res, false);
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
        // 按平台协议选鉴权头：Anthropic 用 x-api-key，Bearer 会被官方 API 直接 401
        upstream = await fetch(`${baseUrl(p)}/v1/models`, { headers: upstreamHeaders(p, apiKey, p.protocol === 'anthropic') });
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
  // 鉴权头走唯一实现（P2 收敛；此前又手写了一份 anthropic-version）
  const h = { ...buildProtocolHeaders(anthropic ? 'anthropic' : 'openai', apiKey || ''), ...(headers || {}) };
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
