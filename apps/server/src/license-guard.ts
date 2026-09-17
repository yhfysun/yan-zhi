import { Request, Response, NextFunction } from 'express';
import { verifyLicenseCode, type VerifyResult } from './license.js';

/**
 * 授权门禁中间件。
 *
 * 为什么默认关闭（只在 YZ_LICENSE_GUARD=1 时生效）：本地模式恒 guest、历史行为是
 * 「打开即用」，默认就拦会让 dev 调试、冒烟脚本、scripts/seed-workflow-agent.mjs
 * 全线 403。生产与局域网多用户部署用环境变量显式开启，行为可预期。
 *
 * 与前端路由守卫的分工：前端守卫（packages/ui/src/router/index.ts）只挡界面跳转，
 * 改一行 localStorage 即可绕过；本中间件才是真正挡 API 的那一层。
 */

/** 取授权码：优先 x-license，兼容 Authorization: License <code>（Bearer 留给 JWT，不复用）。 */
export function extractLicenseCode(req: Request): string | null {
  const direct = req.headers['x-license'];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const auth = req.headers['authorization'];
  if (typeof auth === 'string') {
    const m = /^License\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * 豁免路径。判定依据只有一个：**这个请求能不能带上自定义请求头**。
 *
 * 浏览器对 <img>/<video>/<audio>/CSS url() 发出的请求无法附加自定义头；SSE 走 fetch
 * 可以带头所以不豁免。这些路径泄露的是「本机已生成的媒体文件」与「随包分发的皮肤
 * 资源」，不含业务数据，豁免风险可接受。
 */
const EXEMPT_PREFIXES: readonly string[] = [
  '/health',
  '/license',       // 授权页自身：验签 / 取本机标识，必须能访问
  '/auth',          // 登录接口：授权门禁不该叠在登录之前
  '/generated',     // <img>/<video>/<audio> src，交付卡片缩略图依赖
  '/media/proxy',   // 同上：媒体代理给 <img> 用
  '/plugin-assets', // 皮肤壁纸走 CSS url() 与 <img>
  '/network/ip',    // 局域网地址展示，无敏感信息
];

/**
 * 把请求路径归一化成「去掉 /api 前缀」的形式再比对豁免清单。
 *
 * 为什么显式剥前缀而不用 req.path：本中间件挂在 `app.use('/api', ...)` 上，
 * Express 会把 req.url 剥成挂载点之后的相对路径，req.path 随之变化 —— 一旦有人
 * 改成挂在 '/' 上，req.path 就带 /api 前缀，豁免清单会**静默全部失效**（表现是
 * 交付卡片图片全裂、皮肤全丢，但接口本身 200，极难查）。归一化后两种挂法都对。
 */
export function normalizeGuardPath(rawUrl: string): string {
  const withoutQuery = rawUrl.split('?')[0];
  const stripped = withoutQuery.replace(/^\/api(?=\/|$)/, '');
  return stripped.replace(/\/+$/, '') || '/';
}

/** 路径是否豁免。 */
export function isGuardExemptPath(rawUrl: string): boolean {
  const clean = normalizeGuardPath(rawUrl);
  return EXEMPT_PREFIXES.some((p) => clean === p || clean.startsWith(p + '/'));
}

/** 门禁是否启用。 */
export function isLicenseGuardEnabled(): boolean {
  const v = String(process.env.YZ_LICENSE_GUARD ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

interface CacheEntry {
  result: VerifyResult;
  expiresAt: number;
}

/**
 * 验签结果缓存。
 *
 * 为什么要缓存：RSA-2048 验签单次约 0.1~0.3ms，看着不贵，但会话列表 + 消息 + 文件 +
 * 轮询类接口会让单页面产生上百次请求，且每次都要跑一次验签。按授权码缓存后
 * 稳态只付一次成本。TTL 10 分钟：足够短，撤销授权后最多 10 分钟生效。
 */
const VERIFY_TTL_MS = 10 * 60 * 1000;
const VERIFY_CACHE_MAX = 50;
const verifyCache = new Map<string, CacheEntry>();

function cacheGet(code: string): VerifyResult | null {
  const hit = verifyCache.get(code);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    verifyCache.delete(code);
    return null;
  }
  // LRU：命中后移到队尾，淘汰时从队首出（Map 保序）
  verifyCache.delete(code);
  verifyCache.set(code, hit);
  return hit.result;
}

function cacheSet(code: string, result: VerifyResult): void {
  if (verifyCache.size >= VERIFY_CACHE_MAX) {
    const oldest = verifyCache.keys().next().value;
    if (oldest !== undefined) verifyCache.delete(oldest);
  }
  verifyCache.set(code, { result, expiresAt: Date.now() + VERIFY_TTL_MS });
}

/** 带缓存的校验。失败的码**不缓存**：失败往往来自「用户刚拿到新码还没替换」这类瞬时
 *  状态，缓存失败会让用户改完码仍被拦 10 分钟。 */
export function verifyLicenseCached(code: string): VerifyResult {
  const cached = cacheGet(code);
  if (cached) return cached;
  const result = verifyLicenseCode(code);
  if (result.valid) cacheSet(code, result);
  return result;
}

/** 清空验签缓存（仅供测试）。 */
export function resetLicenseGuardCache(): void {
  verifyCache.clear();
}

/** Express 中间件。未启用时全量放行，启用时校验并返回 403。 */
export function requireLicense(req: Request, res: Response, next: NextFunction): void {
  if (!isLicenseGuardEnabled()) {
    next();
    return;
  }
  // CORS 预检在 cors() 层已应答；这里兜一层，避免带自定义头的预检被 403 挡掉
  if (req.method === 'OPTIONS') {
    next();
    return;
  }
  if (isGuardExemptPath(req.originalUrl || req.url || req.path)) {
    next();
    return;
  }
  const code = extractLicenseCode(req);
  if (!code) {
    res.status(403).json({ error: '未提供授权码', reason: '请求缺少 x-license 头' });
    return;
  }
  const result = verifyLicenseCached(code);
  if (!result.valid) {
    res.status(403).json({ error: '授权无效', reason: result.reason || '授权码校验未通过' });
    return;
  }
  next();
}