/**
 * OIDC / 企业 SSO（Task 6）：标准授权码 + PKCE 登录，内置账号登录保持不变。
 *
 * ★ 安全约束（对应 plan.md 验收标准，逐条有测试用例）：
 *   1. state 只存 sha256、一次性 + TTL + redirect_uri 绑定；回调额外校验 iss（RFC 9207）。
 *   2. PKCE S256：code_verifier 加密存，token 交换带 verifier；服务端不接受回调传入的 token endpoint。
 *   3. ID Token：只接受 RS256；JWKS kid 匹配 + RSA 验签；iss/aud/exp/iat/sub/nonce 全部校验
 *      （时钟偏移 60s）；算法混淆（none/HS256）与签名篡改一律拒绝。
 *   4. 账号映射唯一出口 findOrCreateOidcUser：(issuer, sub) 主键，首次建号、再次不重复创建。
 *   5. 配置缺失 / 上游故障一律抛带稳定 code 的 OidcError，绝不吞错或降级成"登录成功"。
 */
import { Router, Request, Response } from 'express';
import { createHash, createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { issueAuthToken } from '../auth.js';

const router = Router();
const SESSION_TTL_MS = 10 * 60 * 1000;
const CLOCK_SKEW_SEC = 60;
const CALLBACK_PATH = '/api/auth/oidc/callback';

export class OidcError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'OidcError';
    this.code = code;
    this.status = status;
  }
}

interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  redirectUri?: string;
  scopes: string;
}

/** 每次读环境变量（不缓存），配置变更即时生效，也便于测试注入。缺项明确抛错。 */
export function readOidcConfig(): OidcConfig | null {
  const issuer = String(process.env.YZ_OIDC_ISSUER || '').trim().replace(/\/+$/, '');
  const clientId = String(process.env.YZ_OIDC_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.YZ_OIDC_CLIENT_SECRET || '').trim();
  if (!issuer || !clientId || !clientSecret) return null;
  const authorizationUrl = String(process.env.YZ_OIDC_AUTHORIZATION_URL || `${issuer}/authorize`).trim();
  const tokenUrl = String(process.env.YZ_OIDC_TOKEN_URL || `${issuer}/token`).trim();
  const jwksUrl = String(process.env.YZ_OIDC_JWKS_URL || `${issuer}/.well-known/jwks.json`).trim();
  for (const [name, url] of [['authorizationUrl', authorizationUrl], ['tokenUrl', tokenUrl], ['jwksUrl', jwksUrl]]) {
    if (!/^https?:\/\//i.test(url)) throw new OidcError('OIDC_BAD_CONFIG', `OIDC ${name} 必须是合法的 http(s) 地址`);
  }
  return {
    issuer, clientId, clientSecret, authorizationUrl, tokenUrl, jwksUrl,
    redirectUri: String(process.env.YZ_OIDC_REDIRECT_URI || '').trim() || undefined,
    scopes: String(process.env.YZ_OIDC_SCOPES || 'openid profile email').trim(),
  };
}

function requireConfig(): OidcConfig {
  try {
    const cfg = readOidcConfig();
    if (!cfg) throw new OidcError('OIDC_NOT_CONFIGURED', '企业单点登录未配置（缺少 issuer / clientId / clientSecret）');
    return cfg;
  } catch (e) {
    if (e instanceof OidcError) throw e;
    throw new OidcError('OIDC_BAD_CONFIG', (e as Error).message);
  }
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const sha256url = (v: string) => createHash('sha256').update(v).digest('base64url');

// ===== JWKS（带缓存；kid 未命中时强制刷新一次，之后明确报「未知签名密钥」） =====
let jwksCache: { keys: Map<string, any>; fetchedAt: number } | null = null;

/** 测试用：清空 JWKS 缓存。 */
export function clearOidcJwksCache(): void {
  jwksCache = null;
}

async function fetchJwks(cfg: OidcConfig): Promise<Map<string, any>> {
  let res: globalThis.Response;
  try {
    res = await fetch(cfg.jwksUrl, { signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    throw new OidcError('JWKS_UNREACHABLE', `JWKS 获取失败（无法连接上游）: ${(e as Error).message}`);
  }
  if (!res.ok) throw new OidcError('JWKS_UNREACHABLE', `JWKS 获取失败（上游 HTTP ${res.status}）`);
  let json: any;
  try { json = await res.json(); } catch {
    throw new OidcError('JWKS_UNREACHABLE', 'JWKS 响应不是合法 JSON');
  }
  const keys = new Map<string, any>();
  for (const k of Array.isArray(json?.keys) ? json.keys : []) {
    if (k?.kid && k?.kty === 'RSA') keys.set(String(k.kid), k);
  }
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

async function signingKeyFor(cfg: OidcConfig, kid: string): Promise<any> {
  let keys = jwksCache?.keys;
  if (!keys) keys = await fetchJwks(cfg);
  let jwk = keys.get(kid);
  if (!jwk) {
    // 可能是 IdP 轮转了密钥：强制刷新一次，仍找不到就明确报错（不用旧密钥硬验）。
    keys = await fetchJwks(cfg);
    jwk = keys.get(kid);
  }
  if (!jwk) throw new OidcError('UNKNOWN_SIGNING_KEY', `JWKS 中找不到 kid=${kid || '(空)'} 的签名密钥`);
  return jwk;
}

interface IdTokenClaims {
  iss: string; sub: string; aud: string | string[]; exp: number; iat: number; nonce?: string;
  preferred_username?: string; email?: string; name?: string;
}

/** ★ ID Token 验签 + claim 校验唯一出口。全部失败都抛 OidcError，绝不吞错。 */
export async function verifyOidcIdToken(cfg: OidcConfig, idToken: string, session: { nonce_hash: string }): Promise<IdTokenClaims> {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new OidcError('MALFORMED_ID_TOKEN', 'ID Token 格式无效');
  let header: any;
  let claims: any;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new OidcError('MALFORMED_ID_TOKEN', 'ID Token 头部或载荷不是合法 JSON');
  }
  if (header?.alg !== 'RS256') {
    throw new OidcError('UNSUPPORTED_ID_TOKEN_ALG', `不支持的 ID Token 签名算法: ${String(header?.alg)}`);
  }
  const jwk = await signingKeyFor(cfg, String(header?.kid || ''));
  let key;
  try {
    key = createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' });
  } catch (e) {
    throw new OidcError('INVALID_JWK', `JWKS 密钥不可用: ${(e as Error).message}`);
  }
  let signatureOk = false;
  try {
    signatureOk = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  } catch { /* 落下方统一报错 */ }
  if (!signatureOk) throw new OidcError('INVALID_ID_TOKEN_SIGNATURE', 'ID Token 签名校验失败');

  const now = Date.now() / 1000;
  if (claims.iss !== cfg.issuer) throw new OidcError('INVALID_ISSUER', 'ID Token issuer 与配置不一致');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(cfg.clientId)) throw new OidcError('INVALID_AUDIENCE', 'ID Token audience 与 clientId 不一致');
  if (!(Number(claims.exp) > now - CLOCK_SKEW_SEC)) throw new OidcError('ID_TOKEN_EXPIRED', 'ID Token 已过期');
  if (Number(claims.iat) > now + CLOCK_SKEW_SEC) throw new OidcError('INVALID_ISSUED_AT', 'ID Token 签发时间晚于当前时间');
  if (!claims.sub) throw new OidcError('MISSING_SUBJECT', 'ID Token 缺少 sub');
  if (!claims.nonce || sha256(String(claims.nonce)) !== session.nonce_hash) {
    throw new OidcError('INVALID_NONCE', 'ID Token nonce 与授权会话不一致');
  }
  return claims as IdTokenClaims;
}

/** ★ 账号映射唯一出口：(issuer, sub) 命中即复用，否则事务内建号 + 登记身份。 */
export function findOrCreateOidcUser(issuer: string, claims: IdTokenClaims): any {
  const existing = db.prepare('SELECT user_id FROM user_oidc_identity WHERE issuer = ? AND sub = ?')
    .get(issuer, claims.sub) as any;
  if (existing) {
    const user = db.prepare('SELECT * FROM user WHERE id = ?').get(existing.user_id) as any;
    if (user) return user;
    // 身份表残留但用户被删：下面按新用户重建（不复用旧 id）。
  }
  const now = Date.now();
  const base = String(claims.preferred_username || claims.email?.split('@')[0] || claims.sub || 'oidc-user')
    .replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 40) || 'oidc-user';
  let username = base;
  let suffix = 1;
  while (db.prepare('SELECT 1 FROM user WHERE username = ?').get(username)) {
    username = `${base}-${suffix++}`;
  }
  const id = `oidc-${randomUUID()}`;
  // 外部身份用户没有本地密码：随机 bcrypt 哈希（不可能被任何密码命中），保留 NOT NULL 约束。
  const passwordHash = bcrypt.hashSync(randomBytes(24).toString('hex'), 10);
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO user (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, username, claims.email || null, passwordHash, now);
    db.prepare('INSERT OR REPLACE INTO user_oidc_identity (issuer, sub, user_id, created_at) VALUES (?, ?, ?, ?)')
      .run(issuer, claims.sub, id, now);
  });
  tx();
  return db.prepare('SELECT * FROM user WHERE id = ?').get(id);
}

function requestOrigin(req: Request): string {
  const forwarded = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  return `${forwarded || req.protocol}://${req.get('host')}`;
}

/** 发起登录：state/nonce 只以哈希落库，verifier 加密存，返回 IdP 授权 URL。 */
export function startOidcLogin(origin: string): { authorizationUrl: string; expiresAt: number } {
  const cfg = requireConfig();
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = sha256url(verifier);
  const redirectUri = cfg.redirectUri || `${origin}${CALLBACK_PATH}`;
  const now = Date.now();
  db.prepare(
    `INSERT INTO oidc_login_session
      (id, state_hash, nonce_hash, code_verifier_enc, redirect_uri, status, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
  ).run(randomUUID(), sha256(state), sha256(nonce), encrypt(verifier), redirectUri, now + SESSION_TTL_MS, now);
  const url = new URL(cfg.authorizationUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', cfg.scopes);
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return { authorizationUrl: url.toString(), expiresAt: now + SESSION_TTL_MS };
}

async function postTokenEndpoint(cfg: OidcConfig, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams({ ...params, client_id: cfg.clientId, client_secret: cfg.clientSecret });
  let res: globalThis.Response;
  try {
    res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new OidcError('TOKEN_EXCHANGE_FAILED', `OIDC token 端点不可达: ${(e as Error).message}`);
  }
  if (!res.ok) throw new OidcError('TOKEN_EXCHANGE_FAILED', `OIDC token 交换失败（上游 HTTP ${res.status}）`);
  try { return await res.json(); } catch {
    throw new OidcError('TOKEN_EXCHANGE_FAILED', 'OIDC token 端点返回非 JSON 响应');
  }
}

/** 回调：state/iss/redirect_uri → 原子消费 → PKCE 换 token → 验 ID Token → 映射用户 → 本地 JWT。 */
export async function completeOidcLogin(input: {
  state?: string; code?: string; error?: string; iss?: string; currentRedirectUri: string;
}): Promise<{ token: string; user: any; status: 'success' | 'denied' }> {
  const cfg = requireConfig();
  const state = String(input.state || '');
  const session = db.prepare("SELECT * FROM oidc_login_session WHERE state_hash = ? AND status = 'pending'")
    .get(sha256(state)) as any;
  if (!session) throw new OidcError('INVALID_STATE', 'state 无效或已被使用');
  if (Number(session.expires_at) <= Date.now()) {
    db.prepare("UPDATE oidc_login_session SET status = 'expired' WHERE id = ?").run(session.id);
    throw new OidcError('EXPIRED_STATE', '授权会话已过期，请重新登录');
  }
  if (input.iss && input.iss !== cfg.issuer) throw new OidcError('INVALID_ISSUER', '授权来源校验失败');
  if (input.currentRedirectUri !== session.redirect_uri) {
    throw new OidcError('INVALID_REDIRECT_URI', '回调地址与授权会话不匹配');
  }
  const claimed = db.prepare(
    "UPDATE oidc_login_session SET status = 'exchanging', consumed_at = ? WHERE id = ? AND status = 'pending'",
  ).run(Date.now(), session.id);
  if (claimed.changes !== 1) throw new OidcError('INVALID_STATE', 'state 无效或已被使用');
  if (input.error) {
    db.prepare("UPDATE oidc_login_session SET status = 'denied' WHERE id = ?").run(session.id);
    throw new OidcError('OIDC_DENIED', `企业登录被取消或拒绝: ${String(input.error).slice(0, 60)}`);
  }
  if (!input.code) throw new OidcError('MISSING_AUTH_CODE', '回调缺少授权码');

  let verifier: string;
  try { verifier = decrypt(session.code_verifier_enc); } catch {
    throw new OidcError('INVALID_PKCE_VERIFIER', 'PKCE verifier 解密失败');
  }
  let tokenJson: any;
  try {
    tokenJson = await postTokenEndpoint(cfg, {
      grant_type: 'authorization_code',
      code: String(input.code),
      redirect_uri: session.redirect_uri,
      code_verifier: verifier,
    });
  } catch (e) {
    db.prepare("UPDATE oidc_login_session SET status = 'failed' WHERE id = ?").run(session.id);
    throw e instanceof OidcError ? e : new OidcError('TOKEN_EXCHANGE_FAILED', (e as Error).message);
  }
  if (!tokenJson?.id_token) {
    throw new OidcError('MISSING_ID_TOKEN', 'OIDC token 端点未返回 id_token');
  }
  let claims: IdTokenClaims;
  try {
    claims = await verifyOidcIdToken(cfg, String(tokenJson.id_token), session);
  } catch (e) {
    db.prepare("UPDATE oidc_login_session SET status = 'failed' WHERE id = ?").run(session.id);
    throw e;
  }
  const user = findOrCreateOidcUser(cfg.issuer, claims);
  db.prepare("UPDATE oidc_login_session SET status = 'authorized' WHERE id = ?").run(session.id);
  return { token: issueAuthToken(user.id, user.username), user, status: 'success' };
}

function fail(res: Response, e: unknown): void {
  if (e instanceof OidcError) {
    res.status(e.status).json({ error: e.message, code: e.code });
    return;
  }
  res.status(400).json({ error: (e as Error)?.message || String(e), code: 'OIDC_INTERNAL_ERROR' });
}

router.get('/config', (_req, res) => {
  try {
    const cfg = readOidcConfig();
    res.json({ enabled: !!cfg, issuer: cfg?.issuer || null, clientId: cfg?.clientId || null });
  } catch (e) { fail(res, e); }
});

router.get('/login', (req, res) => {
  try {
    const started = startOidcLogin(requestOrigin(req));
    res.redirect(302, started.authorizationUrl);
  } catch (e) { fail(res, e); }
});

router.get('/callback', async (req, res) => {
  const q = req.query;
  try {
    const result = await completeOidcLogin({
      state: typeof q.state === 'string' ? q.state : undefined,
      code: typeof q.code === 'string' ? q.code : undefined,
      error: typeof q.error === 'string' ? q.error : undefined,
      iss: typeof q.iss === 'string' ? q.iss : undefined,
      currentRedirectUri: `${requestOrigin(req)}${CALLBACK_PATH}`,
    });
    const params = new URLSearchParams({ oidc_token: result.token });
    res.redirect(302, `/login?${params.toString()}`);
  } catch (e) { fail(res, e); }
});

export default router;
