/**
 * Task 6 验收测试：OIDC / 企业 SSO（授权码 + PKCE）。
 *
 * ★ 安全优先，测试要到位：mock IdP 用**真 RSA-2048 密钥**签 RS256 ID Token、真 JWKS、
 *   真 token 端点；服务端经真 express 路由跑完整授权流程。每一条校验（state/nonce/
 *   签名/iss/aud/exp/iat/kid/PKCE/重定向）都有"改成错的就红"的用例。
 *   —— 静态断言抓不住「验签被跳过」「nonce 没比对」这类缺陷。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createSign, createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import { db } from '../src/db.js';
import { seedRbac } from '../src/rbac.js';
import authRoutes from '../src/auth.js';
import oidcRoutes, { clearOidcJwksCache } from '../src/routes/oidc.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK: any = { ...publicKey.export({ format: 'jwk' }), kid: 'test-kid-1', alg: 'RS256', use: 'sig' };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT_SECRET = process.env.JWT_SECRET || 'yan-zhi-secret-change-in-production';

const ISSUER = 'https://idp.example.test';
const CLIENT_ID = 'yan-zhi-test';
const CLIENT_SECRET = 'oidc-client-secret';
let idpBase = '';
let appBase = '';
let callbackUri = '';

let lastAuthorization: Record<string, string> = {};
let lastTokenRequest: Record<string, string> = {};
let tokenCallCount = 0;
let jwksCallCount = 0;
let jwksStatus = 200;
let tokenStatus = 200;
let idTokenOverride: string | null = null;
let nonceOverride: string | null = null;
let omitIdToken = false;
let claimOverrides: Record<string, unknown> = {};
let kidOverride: string | null = null;
let algOverride: string | null = null;
let jwksKeys: any[] = [JWK];

function signIdToken(claims: Record<string, unknown>, alg = 'RS256', kid = 'test-kid-1'): string {
  const input = `${b64({ alg, kid, typ: 'JWT' })}.${b64(claims)}`;
  const sign = createSign('RSA-SHA256');
  sign.update(input);
  sign.end();
  return `${input}.${sign.sign(privateKey).toString('base64url')}`;
}

function validClaims(nonce: string, sub = 'user-sub-1', extra: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: ISSUER, sub, aud: CLIENT_ID, azp: CLIENT_ID,
    exp: now + 600, iat: now - 5, auth_time: now - 10, nonce,
    preferred_username: 'alice', email: 'alice@example.test', name: 'Alice',
    ...extra,
  };
}

function makeIdp() {
  const app = express();
  app.get('/.well-known/openid-configuration', (_req, res) => {
    res.json({
      issuer: ISSUER,
      authorization_endpoint: `${idpBase}/authorize`,
      token_endpoint: `${idpBase}/token`,
      jwks_uri: `${idpBase}/jwks`,
    });
  });
  app.get('/jwks', (_req, res) => {
    jwksCallCount += 1;
    if (jwksStatus !== 200) { res.status(jwksStatus).json({ error: 'jwks upstream down' }); return; }
    res.json({ keys: jwksKeys });
  });
  app.get('/authorize', (req, res) => {
    lastAuthorization = Object.fromEntries(
      Object.entries(req.query).map(([k, v]) => [k, String(v)]),
    );
    res.json({ ok: true });
  });
  app.post('/token', express.urlencoded({ extended: false }), (req, res) => {
    tokenCallCount += 1;
    lastTokenRequest = req.body as Record<string, string>;
    if (tokenStatus !== 200) { res.status(tokenStatus).json({ error: 'token upstream down' }); return; }
    const verifier = String(req.body.code_verifier || '');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    if (!verifier || challenge !== lastAuthorization.code_challenge) {
      res.status(400).json({ error: 'invalid_grant (PKCE)' });
      return;
    }
    if (req.body.client_secret !== CLIENT_SECRET) { res.status(401).json({ error: 'invalid_client' }); return; }
    const nonce = nonceOverride ?? lastAuthorization.nonce ?? '';
    if (omitIdToken) { res.json({ access_token: 'at-1', token_type: 'Bearer', expires_in: 3600 }); return; }
    const token = idTokenOverride ?? signIdToken(
      validClaims(nonce, 'user-sub-1', claimOverrides),
      algOverride || 'RS256',
      kidOverride || 'test-kid-1',
    );
    res.json({ id_token: token, access_token: 'at-1', token_type: 'Bearer', expires_in: 3600 });
  });
  return app;
}

function listen(app: express.Express): Promise<[Server, number]> {
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve([s, (s.address() as any).port]));
  });
}

function configureOidc(overrides: Record<string, string> = {}) {
  const cfg: Record<string, string> = {
    YZ_OIDC_ISSUER: ISSUER,
    YZ_OIDC_CLIENT_ID: CLIENT_ID,
    YZ_OIDC_CLIENT_SECRET: CLIENT_SECRET,
    YZ_OIDC_AUTHORIZATION_URL: `${idpBase}/authorize`,
    YZ_OIDC_TOKEN_URL: `${idpBase}/token`,
    YZ_OIDC_JWKS_URL: `${idpBase}/jwks`,
    YZ_OIDC_REDIRECT_URI: callbackUri,
    ...overrides,
  };
  for (const k of Object.keys(cfg)) process.env[k] = cfg[k];
}
function clearOidcConfig() {
  for (const k of Object.keys(process.env).filter((k) => k.startsWith('YZ_OIDC_'))) delete process.env[k];
}

function callbackUrl(params: Record<string, string>) {
  const u = new URL('/api/auth/oidc/callback', appBase);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/** 发起登录并返回 state；同时让 mock IdP 记下 challenge/nonce。 */
async function beginLogin() {
  const res = await fetch(`${appBase}/api/auth/oidc/login`, { redirect: 'manual' });
  expect(res.status).toBe(302);
  const authorizeUrl = res.headers.get('location') || '';
  await fetch(authorizeUrl);
  return new URL(authorizeUrl).searchParams.get('state') || '';
}

async function hitCallback(params: Record<string, string>) {
  return fetch(callbackUrl(params), { redirect: 'manual' });
}

let appServer: Server;
let idpServer: Server;

beforeAll(async () => {
  const [idp, idpPort] = await listen(makeIdp());
  idpServer = idp;
  idpBase = `http://127.0.0.1:${idpPort}`;
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/auth/oidc', oidcRoutes);
  const [srv, appPort] = await listen(app);
  appServer = srv;
  appBase = `http://127.0.0.1:${appPort}`;
  callbackUri = `${appBase}/api/auth/oidc/callback`;
  seedRbac();
  db.prepare('INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run('guest', 'guest', '!test', Date.now());
});

afterAll(async () => {
  clearOidcConfig();
  await new Promise<void>((r) => appServer.close(() => r()));
  await new Promise<void>((r) => idpServer.close(() => r()));
});

beforeEach(() => {
  db.prepare('DELETE FROM oidc_login_session').run();
  db.prepare('DELETE FROM user_oidc_identity').run();
  db.prepare("DELETE FROM user WHERE id LIKE 'oidc-%' OR username LIKE 'alice%'").run();
  clearOidcJwksCache();
  lastAuthorization = {};
  lastTokenRequest = {};
  tokenCallCount = 0;
  jwksCallCount = 0;
  jwksStatus = 200;
  tokenStatus = 200;
  idTokenOverride = null;
  nonceOverride = null;
  omitIdToken = false;
  claimOverrides = {};
  kidOverride = null;
  algOverride = null;
  jwksKeys = [JWK];
  configureOidc();
});

describe('正常登录与账号映射', () => {
  it('授权码 + PKCE 全流程：签发本地 JWT，PKCE verifier 与 challenge 匹配', async () => {
    const state = await beginLogin();
    expect(lastAuthorization.code_challenge_method).toBe('S256');
    expect(lastAuthorization.redirect_uri).toBe(callbackUri);
    expect(lastAuthorization.scope).toContain('openid');
    expect(lastAuthorization.nonce).toBeTruthy();
    const res = await hitCallback({ code: 'code-ok', state, iss: ISSUER });
    expect(res.status).toBe(302);
    const location = res.headers.get('location') || '';
    const token = new URL(location, appBase).searchParams.get('oidc_token') || '';
    expect(token).toBeTruthy();
    const payload = jwt.verify(token, JWT_SECRET) as any;
    expect(payload.userId).toMatch(/^oidc-/);
    expect(payload.username).toContain('alice');
    // IdP 校验过 verifier；这里再核对服务端确实用了发起时的 challenge
    const challenge = createHash('sha256').update(lastTokenRequest.code_verifier).digest('base64url');
    expect(challenge).toBe(lastAuthorization.code_challenge);
    expect(lastTokenRequest.grant_type).toBe('authorization_code');
  });

  it('★ 首次登录创建账号，再次登录不重复创建（issuer + sub 唯一映射）', async () => {
    const s1 = await beginLogin();
    await hitCallback({ code: 'c1', state: s1, iss: ISSUER });
    const after1 = db.prepare('SELECT COUNT(*) AS n FROM user WHERE username LIKE ?').get('alice%') as any;
    const identities1 = db.prepare('SELECT COUNT(*) AS n FROM user_oidc_identity').get() as any;
    const s2 = await beginLogin();
    await hitCallback({ code: 'c2', state: s2, iss: ISSUER });
    const after2 = db.prepare('SELECT COUNT(*) AS n FROM user WHERE username LIKE ?').get('alice%') as any;
    const identities2 = db.prepare('SELECT COUNT(*) AS n FROM user_oidc_identity').get() as any;
    expect(after2.n).toBe(after1.n);
    expect(identities2.n).toBe(identities1.n);
    expect(after1.n).toBe(1);
    expect(identities1.n).toBe(1);
  });

  it('★ 同 sub 不同 issuer 不串号', async () => {
    // 用另一个 issuer 配置（同一 IdP 签发的 iss 仍是 ISSUER，这里改 aud 场景不适用）——
    // 直接验证 identity 表的主键是 (issuer, sub)，两条不同 issuer 映射不同 user。
    db.prepare('INSERT INTO user_oidc_identity (issuer, sub, user_id, created_at) VALUES (?, ?, ?, ?)')
      .run('https://other-idp.example', 'user-sub-1', 'oidc-other', Date.now());
    const s1 = await beginLogin();
    await hitCallback({ code: 'c1', state: s1, iss: ISSUER });
    const rows = db.prepare('SELECT * FROM user_oidc_identity WHERE sub = ?').all('user-sub-1') as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].user_id).not.toBe(rows[1].user_id);
  });

  it('内置账号登录未回归（/api/auth/guest 仍可用）', async () => {
    const res = await fetch(`${appBase}/api/auth/guest`, { method: 'POST' });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.token).toBeTruthy();
  });
});

describe('state / 来源 / 重放', () => {
  it('未知 state 拒绝且不换 token', async () => {
    const r = await hitCallback({ code: 'c', state: 'forged', iss: ISSUER });
    expect(r.status).toBe(400);
    expect(tokenCallCount).toBe(0);
  });
  it('★ state 重放第二次被拒', async () => {
    const s = await beginLogin();
    const r1 = await hitCallback({ code: 'c', state: s, iss: ISSUER });
    expect(r1.status).toBe(302);
    const r2 = await hitCallback({ code: 'c', state: s, iss: ISSUER });
    expect(r2.status).toBe(400);
    expect(tokenCallCount).toBe(1);
  });
  it('★ state 过期拒绝', async () => {
    const s = await beginLogin();
    db.prepare('UPDATE oidc_login_session SET expires_at = ?').run(Date.now() - 1000);
    const r = await hitCallback({ code: 'c', state: s, iss: ISSUER });
    expect(r.status).toBe(400);
    expect(tokenCallCount).toBe(0);
  });
  it('★ iss 不匹配（来源伪造）拒绝', async () => {
    const s = await beginLogin();
    const r = await hitCallback({ code: 'c', state: s, iss: 'https://evil.example' });
    expect(r.status).toBe(400);
    expect(tokenCallCount).toBe(0);
  });
  it('★ redirect_uri 与会话登记的不一致拒绝', async () => {
    const s = await beginLogin();
    db.prepare('UPDATE oidc_login_session SET redirect_uri = ?').run('http://elsewhere.example/cb');
    const r = await hitCallback({ code: 'c', state: s, iss: ISSUER });
    expect(r.status).toBe(400);
    expect(tokenCallCount).toBe(0);
  });
  it('用户取消授权 ⇒ 明确失败，不换 token', async () => {
    const s = await beginLogin();
    const r = await hitCallback({ state: s, error: 'access_denied', iss: ISSUER });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(tokenCallCount).toBe(0);
  });
});

describe('ID Token 校验（签名 / nonce / claims）', () => {
  async function rejectedLogin(): Promise<any> {
    const s = await beginLogin();
    const r = await hitCallback({ code: 'c', state: s, iss: ISSUER });
    expect(r.status).toBe(400);
    const body = await r.json().catch(() => ({})) as any;
    expect(body.error, '错误信息必须明确回给调用方，不允许吞错').toBeTruthy();
    return body;
  }

  it('★ 签名被篡改拒绝', async () => {
    const good = signIdToken(validClaims('x'), 'RS256');
    const parts = good.split('.');
    parts[2] = randomBytes(64).toString('base64url');
    idTokenOverride = parts.join('.');
    expect((await rejectedLogin()).code).toBe('INVALID_ID_TOKEN_SIGNATURE');
  });

  it('★ alg=none 拒绝（算法混淆）', async () => {
    algOverride = 'none';
    expect((await rejectedLogin()).code).toBe('UNSUPPORTED_ID_TOKEN_ALG');
  });

  it('★ HS256 拒绝（算法混淆）', async () => {
    algOverride = 'HS256';
    expect((await rejectedLogin()).code).toBe('UNSUPPORTED_ID_TOKEN_ALG');
  });

  it('★ nonce 不匹配拒绝', async () => {
    nonceOverride = 'wrong-nonce';
    expect((await rejectedLogin()).code).toBe('INVALID_NONCE');
  });

  const nowSec = () => Math.floor(Date.now() / 1000);
  const claimCases: Array<[string, Record<string, unknown>, string]> = [
    ['iss 不匹配', { iss: 'https://evil.example' }, 'INVALID_ISSUER'],
    ['aud 不匹配', { aud: 'some-other-client' }, 'INVALID_AUDIENCE'],
    ['exp 过期', { exp: nowSec() - 3600 }, 'ID_TOKEN_EXPIRED'],
    ['iat 未来（超时钟偏移）', { iat: nowSec() + 3600 }, 'INVALID_ISSUED_AT'],
    ['sub 缺失', { sub: '' }, 'MISSING_SUBJECT'],
  ];
  for (const [name, overrides, code] of claimCases) {
    it(`★ ${name} 拒绝`, async () => {
      claimOverrides = overrides;
      expect((await rejectedLogin()).code).toBe(code);
    });
  }

  it('★ kid 未知 ⇒ 明确报错，且 JWKS 最多刷新一次', async () => {
    kidOverride = 'unknown-kid';
    expect((await rejectedLogin()).code).toBe('UNKNOWN_SIGNING_KEY');
    expect(jwksCallCount).toBeLessThanOrEqual(2);
  });

  it('★ ID Token 缺失 ⇒ 明确报错', async () => {
    omitIdToken = true;
    expect((await rejectedLogin()).code).toBe('MISSING_ID_TOKEN');
  });
});

describe('上游故障与配置错误（不吞错）', () => {
  it('★ JWKS 上游 500 ⇒ 400 且错误明确', async () => {
    jwksStatus = 500;
    const s = await beginLogin();
    const r = await hitCallback({ code: 'c', state: s, iss: ISSUER });
    expect(r.status).toBe(400);
    const body = await r.json() as any;
    expect(body.code).toBe('JWKS_UNREACHABLE');
    expect(body.error).toContain('JWKS');
  });

  it('★ token 端点 500 ⇒ 400 且错误明确', async () => {
    tokenStatus = 500;
    const s = await beginLogin();
    const r = await hitCallback({ code: 'c', state: s, iss: ISSUER });
    expect(r.status).toBe(400);
    const body = await r.json() as any;
    expect(body.code).toBe('TOKEN_EXCHANGE_FAILED');
  });

  it('★ 配置缺失 ⇒ config.enabled=false，login 明确报错', async () => {
    clearOidcConfig();
    const cfg = await (await fetch(`${appBase}/api/auth/oidc/config`)).json() as any;
    expect(cfg.enabled).toBe(false);
    const r = await fetch(`${appBase}/api/auth/oidc/login`, { redirect: 'manual' });
    expect(r.status).toBe(400);
    const body = await r.json() as any;
    expect(body.code).toBe('OIDC_NOT_CONFIGURED');
  });

  it('★ 配置端点不回显 client_secret', async () => {
    const cfg = await (await fetch(`${appBase}/api/auth/oidc/config`)).json() as any;
    expect(cfg.enabled).toBe(true);
    expect(JSON.stringify(cfg)).not.toContain(CLIENT_SECRET);
  });
});
