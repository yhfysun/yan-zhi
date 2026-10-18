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
  hasTokenPool,
  getAvailableTokenCount,
} from '../services/token-pool.js';
import { buildProtocolHeaders, resolveUpstreamUrl, type UpstreamKind } from '@yan-zhi/core';
import {
  isMissingUsage,
  normalizeOpenAiUsage,
  normalizeAnthropicUsage,
  normalizeResponsesUsage,
} from '@yan-zhi/shared';
import { recordStandaloneUsage } from '../services/usage-ledger.js';
import {
  isDashscopePlatform,
  dashscopeNativeRoot,
  toDashscopeSize,
  extractDashscopeImageUrl,
} from '../mcp/api-tool-executor.js';

const router = Router();
router.use(authMiddleware);

/**
 * ★ probe 记账（2026-10-18）：非流式转发成功后，从响应体里抠 usage 记进账本。
 *
 * 为什么在代理记：连通性测试（`LlmClient.chatTest`，UI 直发）走的就是本代理的
 * 非流式路径，**没有会话、没有任务**，llm-task-manager 那条记账链够不着它 ——
 * 此前 probe 完全不记账，账本对不上（方案 §8 记录在案的缺口）。
 *
 * ★ 判据与口径：
 *   · 只记 chat / messages / responses（embeddings/images 不按 token 计价，另议）；
 *   · usage 归一化**复用 shared 的协议边界函数**（normalize*Usage），不在这里另写一套；
 *   · conversationId = `''`（无会话）：明细进账本、会话账单不显示 —— 刻意的；
 *   · 上游没给 usage ⇒ 按请求/响应原文估算（坑 #13 同款兜底，实现收口在
 *     usage-ledger.recordStandaloneUsage）；
 *   · 任何失败都吞掉 —— 记账是旁路，绝不能影响测试请求本身的返回。
 */
function recordProxyProbeUsage(p: any, kind: UpstreamKind, reqBody: any, rawText: string): void {
  try {
    if (kind !== 'chat' && kind !== 'messages' && kind !== 'responses') return;
    let data: any;
    try { data = JSON.parse(rawText); } catch { return; }
    const usage = data?.usage;
    let detail = kind === 'messages'
      ? (usage ? normalizeAnthropicUsage(usage) : undefined)
      : kind === 'responses'
        ? (usage ? normalizeResponsesUsage(usage) : undefined)
        : (usage ? normalizeOpenAiUsage(usage) : undefined);
    if (detail && isMissingUsage(detail)) detail = undefined; // 全 0 = 没给 ⇒ 走估算
    const content = data?.choices?.[0]?.message?.content;
    recordStandaloneUsage({
      conversationId: '',
      userId: p.user_id,
      platformId: p.id,
      modelId: reqBody?.model || undefined,
      source: 'probe',
      detail,
      inputText: JSON.stringify(reqBody ?? {}),
      outputText: typeof content === 'string' ? content : JSON.stringify(data ?? {}).slice(0, 2000),
    });
  } catch { /* 记账是旁路，绝不影响转发 */ }
}

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

async function forward(
  upstream: Response,
  res: ExpressResponse,
  /** 非流式响应体的旁路钩子（probe 记账用）；抛错由调用方兜住，不影响转发 */
  onNonStreamBody?: (rawText: string) => void,
): Promise<void> {
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
  if (onNonStreamBody && text) {
    try { onNonStreamBody(text); } catch { /* 记账失败不影响转发 */ }
  }
  res.status(upstream.status).setHeader('Content-Type', ct || 'application/json');
  res.send(text);
}

/**
 * ★ 平台级禁用闸（2026-10-18）：llm_enabled=0 的平台不允许产生**任何**上游模型调用。
 *
 * 为什么收口在这里：本函数是 chat / messages / responses / embeddings / images / videos
 * 六个调用端点的**唯一转发出口** —— 在这里拦一次等于全拦（判据：枚举端点必然漏）。
 * 下拉隐藏与动态选型过滤（llm_enabled=1 的各查询）只解决"不再选它"，
 * 拦不住**存量会话/定时任务还钉在禁用平台的模型上**继续发 401 请求 —— 这里兜死。
 *
 * 允许的例外：GET /models（拉取模型列表）是数据层管理操作，不走本函数，保持可用。
 */
function rejectDisabledPlatform(p: any, res: ExpressResponse): boolean {
  if (Number(p?.llm_enabled ?? 1) !== 0) return false;
  res.status(403).json({
    error: '该模型平台已禁用，不能调用其模型。请到「模型平台」页对该平台点「启用」后再试。',
    platformId: p?.id,
  });
  return true;
}

/**
 * ★ Token 级全停用闸（2026-10-18）：平台**建过** Token 池且 enabled=1 的 Token 数为 0 ⇒ 403。
 *
 * 为什么必须有：代理的兜底链是「池里选一把 → 池空则退 api_key_enc」。池建过就说明用户在用
 * Token 管理（api_key_enc 只是建池时的初始快照），全停用后若仍退 api_key_enc，等于把已停用的
 * 过期 Key 从后门复活继续打 401。从未建池的平台（手工配置）才允许 api_key_enc 兜底。
 */
function rejectAllTokensDisabled(p: any, res: ExpressResponse): boolean {
  if (!hasTokenPool(p?.id)) return false;
  if (getAvailableTokenCount(p.id) > 0) return false;
  res.status(403).json({
    error: '该平台所有 Token 均已停用：请在「模型平台」→ 编辑平台 → 已配置 Token 里启用或更换 Token。',
    platformId: p?.id,
  });
  return true;
}

/** 兜底 Key：建过 Token 池的平台一律不用 api_key_enc（防停用 Key 复活）；无池老平台保留原兜底 */
function fallbackKeyOf(p: any): string {
  return hasTokenPool(p.id) ? '' : (p.api_key_enc || '');
}

/**
 * 带 Token 池重试的代理请求：每次选最优 Token → 停顿 → fetch，
 * 成功则转发；失败（401/403/429/5xx/网络错误）则记录并换 Token 重试，最多 MAX_RETRY 次。
 * 业务错误（如 400 模型不支持）不换 Token，直接转发给前端。
 */
async function proxyWithRetry(
  p: any,
  anthropic: boolean,
  kind: UpstreamKind,
  body: any,
  res: ExpressResponse,
  isStream: boolean,
): Promise<void> {
  if (rejectDisabledPlatform(p, res)) return;
  if (rejectAllTokensDisabled(p, res)) return;
  // ★ 与 LlmClient 共用同一个拼接函数：版本段由 base 决定（火山 /api/v3、智谱 /api/paas/v4、
  //   百炼 /compatible-mode/v1 的 base 自带版本段，再拼一个 v1/ 上去必然 404）。
  const url = resolveUpstreamUrl(baseUrl(p), kind);
  const triedIds: string[] = [];
  const fallbackKey = fallbackKeyOf(p);

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
      // ★ probe 记账（2026-10-18）：非流式响应体里带 usage，此前这笔（UI 的连通性
      //   测试等）完全没进账本 ⇒ 账本对不上。路由传的 isStream 恒为 true 不可信，
      //   实际按响应 Content-Type 分流（SSE = 流式，代理是字节转发不解析，真实会话
      //   调用由 llm-task-manager 侧记账，别在这里重复记）。
      await forward(upstream, res, (raw) => recordProxyProbeUsage(p, kind, body, raw));
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
    await proxyWithRetry(p, false, 'chat', (req.body as any)?.payload, res, true);
  } catch (e: any) {
    res.status(502).json({ error: `代理请求失败: ${e?.message || e}` });
  }
});

router.post('/messages', async (req: Request, res: ExpressResponse) => {
  const p = loadPlatform(req);
  if (!p) { platformNotFound(res, req); return; }
  try {
    await proxyWithRetry(p, true, 'messages', (req.body as any)?.payload, res, true);
  } catch (e: any) {
    res.status(502).json({ error: `代理请求失败: ${e?.message || e}` });
  }
});

// ★ Responses API（2026-10-17）：请求体与 Chat Completions 不同（instructions + input[]），
//   但**鉴权头仍是 Bearer**（与 openai 同源），所以这里 anthropic=false。
//   不要给它单独写一份 header 逻辑 —— 那是漂移的开始。
router.post('/responses', async (req: Request, res: ExpressResponse) => {
  const p = loadPlatform(req);
  if (!p) { platformNotFound(res, req); return; }
  try {
    await proxyWithRetry(p, false, 'responses', (req.body as any)?.payload, res, true);
  } catch (e: any) {
    res.status(502).json({ error: `代理请求失败: ${e?.message || e}` });
  }
});

router.post('/embeddings', async (req: Request, res: ExpressResponse) => {
  const p = loadPlatform(req);
  if (!p) { platformNotFound(res, req); return; }
  try {
    await proxyWithRetry(p, false, 'embeddings', (req.body as any)?.payload, res, false);
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
    // 原生通道不经过 proxyWithRetry，禁用闸要单独兜一道
    if (rejectDisabledPlatform(p, res)) return;
    if (rejectAllTokensDisabled(p, res)) return;
    const key = pickToken(p.id)?.apiKey || fallbackKeyOf(p) || '';
    const out = await dashscopeImageUrl(baseUrl(p), key, payload);
    if (!out.ok || !out.url) { res.status(out.status || 502).json({ error: out.error || '百炼生图失败' }); return; }
    // 回成 OpenAI 形状 —— 客户端（能力测试 / UI）无需任何改动
    res.json({ data: [{ url: out.url }] });
    return;
  }
  try {
    await proxyWithRetry(p, false, 'images', payload, res, false);
  } catch (e: any) {
    res.status(502).json({ error: `代理请求失败: ${e?.message || e}` });
  }
});

// 生视频代理（能力测试「视频生成」/ UI 侧调用）：/v1/videos（agnes 异步任务提交）
router.post('/videos', async (req: Request, res: ExpressResponse) => {
  const p = loadPlatform(req);
  if (!p) { platformNotFound(res, req); return; }
  try {
    await proxyWithRetry(p, false, 'videos', (req.body as any)?.payload, res, false);
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
    const fallbackKey = fallbackKeyOf(p);
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      const token = pickToken(p.id, triedIds);
      const apiKey = token?.apiKey || fallbackKey;
      if (token) triedIds.push(token.id);
      await pauseIfNeeded(p);
      let upstream: Response;
      try {
        // 按平台协议选鉴权头：Anthropic 用 x-api-key，Bearer 会被官方 API 直接 401
        upstream = await fetch(resolveUpstreamUrl(baseUrl(p), 'models'), { headers: upstreamHeaders(p, apiKey, p.protocol === 'anthropic') });
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
    const upstream = await fetch(resolveUpstreamUrl(String(apiUrl), 'models'), { headers: h });
    const text = await upstream.text().catch(() => '');
    res.status(upstream.status).setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (e: any) {
    res.status(502).json({ error: `代理请求失败: ${e?.message || e}` });
  }
});

export default router;
