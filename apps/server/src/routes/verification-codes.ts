// 短信验证码中继路由。
// ------------------------------------------------------------------
// 两类调用方，认证方式不同：
//   · 桌面端 UI / Agent（同源、可带自定义头）→ authMiddleware，走 guest 身份；
//   · 移动端上报（跨设备、可能无登录态、要方便）→ 配对令牌（x-pair-token 或 body.pairToken），
//     同时给 60s/IP 的简单速率限制，防止同网误灌。
//
// 公开暴露的只有「写入一条验证码」，读取都要求本节点身份 —— 验证码属敏感信息，
// 不能让局域网里任意设备直接读走（那等于把第二步验证交给整个内网）。
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import {
  recordVerificationCode,
  getLatestVerificationCode,
  listVerificationCodes,
  clearVerificationCodes,
  getOrCreatePairToken,
  resetPairToken,
  verifyPairToken,
} from '../services/verification-codes.js';

const router = Router();

/** 移动端上报的简单速率限制：同 IP 每分钟最多 30 次（正常短信远达不到，防误灌/滥用）。 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 500) {
    // 防 Map 无限增长：整体清理一轮已空窗口的 IP
    for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  }
  return arr.length > RATE_MAX;
}

/**
 * POST /api/verification-codes —— 上报一条验证码（移动端）。
 * body: { code?: string, body?: string, sender?: string, deviceName?: string, pairToken?: string }
 * 认证：x-pair-token 头 或 body.pairToken，二者其一匹配本节点配对令牌即可。
 */
router.post('/', (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, unknown>;
  const token = (req.headers['x-pair-token'] as string) || (b.pairToken as string) || '';
  if (!verifyPairToken(token)) {
    res.status(401).json({ error: '配对令牌无效或缺失，请在桌面端「短信验证码」中查看配对令牌并填入移动端' });
    return;
  }
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (rateLimited(ip)) {
    res.status(429).json({ error: '上报过于频繁，请稍后再试' });
    return;
  }
  try {
    const rec = recordVerificationCode({
      userId: 'guest', // 本地单用户模式恒定 guest，与全库数据 user_id 一致
      code: b.code as string | undefined,
      body: b.body as string | undefined,
      sender: b.sender as string | undefined,
      deviceName: b.deviceName as string | undefined,
      source: 'sms',
    });
    res.json({ ok: true, data: { id: rec.id, code: rec.code, expiresAt: rec.expiresAt } });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || '记录失败' });
  }
});

/**
 * GET /api/verification-codes —— 列出最近未过期验证码（桌面端 UI 轮询）。
 * query: ?limit=10
 */
router.get('/', authMiddleware, (_req: Request, res: Response) => {
  const limit = Number((_req.query as any)?.limit) || 10;
  res.json({ data: listVerificationCodes('guest', limit) });
});

/** GET /api/verification-codes/latest —— 最新一条（没有则 data:null）。 */
router.get('/latest', authMiddleware, (_req: Request, res: Response) => {
  res.json({ data: getLatestVerificationCode('guest') });
});

/**
 * GET /api/verification-codes/pair —— 桌面端查看配对信息（令牌 + 上报地址）。
 * 地址优先用本机局域网 IP，供用户直接在移动端填写。
 */
router.get('/pair', authMiddleware, (req: Request, res: Response) => {
  res.json({ data: { token: getOrCreatePairToken(), upstreamPath: '/api/verification-codes' } });
});

/** POST /api/verification-codes/pair/reset —— 重新生成配对令牌（旧令牌立即失效）。 */
router.post('/pair/reset', authMiddleware, (_req: Request, res: Response) => {
  res.json({ ok: true, data: { token: resetPairToken() } });
});

/** DELETE /api/verification-codes —— 清空当前用户全部验证码记录。 */
router.delete('/', authMiddleware, (_req: Request, res: Response) => {
  res.json({ ok: true, removed: clearVerificationCodes('guest') });
});

export default router;