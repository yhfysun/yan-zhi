/**
 * Task 1 验收测试：集中式 MCP OAuth 授权闭环。
 *
 * ★ 为什么全部真跑：state/PKCE/来源校验属于「写错不报错、表现为别人拿到授权码也能换 token」
 *   的缺陷形态，静态断言抓不住。这里用真 express + 真 fetch + 真临时 SQLite，
 *   连 mock 的 OAuth Provider 与 MCP 上游也走真实 HTTP，确保「授权 → 工具发现 → 工具调用」
 *   整条链路真的打通，而不是只测到几个辅助函数。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import { db } from '../src/db.js';
import { ensureEnterpriseSchema } from '../src/enterprise/schema.js';
import { seedRbac } from '../src/rbac.js';
import { decrypt, encrypt } from '../src/utils/crypto.js';
import {
  callMcpToolDirect, createMcpConnector, createMcpProvider,
  discoverMcpConnectorTools, listMcpConnectors,
} from '../src/enterprise/mcp-hub.js';
import {
  getMcpOAuthStatus, redactSecrets, revokeMcpOAuth, startMcpOAuth,
} from '../src/enterprise/mcp-oauth.js';
import {
  enterpriseAdminRouter, enterpriseOAuthRouter, enterpriseUserRouter,
} from '../src/routes/enterprise.js';

const UID = 'u_mcp_oauth_test';
const ACCESS_TOKEN = 'access-DO-NOT-LEAK-9527';
const REFRESH_TOKEN = 'refresh-DO-NOT-LEAK-9527';
const CLIENT_SECRET = 'client-DO-NOT-LEAK-9527';
const ISSUER = 'https://issuer.example.test';

let upstream: Server;
let appServer: Server;
let upstreamBase = '';
let appBase = '';
let providerId = '';
let connectorId = '';
let connectorUrl = '';

let tokenRequests: Record<string, string>[] = [];
let lastCodeChallenge = '';
let currentAccessToken = ACCESS_TOKEN;
let issuedCount = 0;
let refreshShouldFail = false;
let mcpAuthSeen: string[] = [];

function resetMocks() {
  tokenRequests = [];
  lastCodeChallenge = '';
  currentAccessToken = ACCESS_TOKEN;
  issuedCount = 0;
  refreshShouldFail = false;
  mcpAuthSeen = [];
}

/** 模拟 OAuth 授权服务器 + MCP 上游：两者都真监听端口，不做 vi.mock。 */
function createUpstreamApp() {
  const app = express();
  app.get('/authorize', (req, res) => {
    // 真实授权页会把 challenge 跟授权码绑定；这里记下来供 /token 校验。
    lastCodeChallenge = String(req.query.code_challenge || '');
    res.json({ ok: true, client_id: req.query.client_id });
  });
  app.post('/token', express.urlencoded({ extended: false }), (req, res) => {
    const b = req.body as Record<string, string>;
    tokenRequests.push({ ...b });
    if (b.client_secret !== CLIENT_SECRET) {
      res.status(401).json({ error: 'invalid_client' });
      return;
    }
    if (b.grant_type === 'authorization_code') {
      // ★ PKCE：服务端必须带上与发起时 challenge 匹配的 verifier，否则换不到 token。
      const verifier = String(b.code_verifier || '');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      if (!verifier || !lastCodeChallenge || challenge !== lastCodeChallenge) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      if (!b.code) { res.status(400).json({ error: 'invalid_grant' }); return; }
    } else if (b.grant_type === 'refresh_token') {
      if (refreshShouldFail || b.refresh_token !== REFRESH_TOKEN) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
    } else {
      res.status(400).json({ error: 'unsupported_grant_type' });
      return;
    }
    issuedCount += 1;
    currentAccessToken = `${ACCESS_TOKEN}-v${issuedCount}`;
    res.json({
      access_token: currentAccessToken,
      refresh_token: REFRESH_TOKEN,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'mcp:tools',
    });
  });
  app.post('/mcp', express.json(), (req, res) => {
    mcpAuthSeen.push(String(req.headers.authorization || ''));
    if (String(req.headers.authorization || '') !== `Bearer ${currentAccessToken}`) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const b = req.body || {};
    const result = b.method === 'initialize'
      ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'mock-mcp', version: '1.0' } }
      : b.method === 'tools/list'
        ? { tools: [{ name: 'echo', description: '回声工具', inputSchema: { type: 'object', properties: {} } }] }
        : b.method === 'tools/call'
          ? { content: [{ type: 'text', text: 'pong' }] }
          : {};
    res.setHeader('Mcp-Session-Id', 'mock-session');
    res.json({ jsonrpc: '2.0', id: b.id, result });
  });
  return app;
}

function createAppUnderTest() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/enterprise', enterpriseAdminRouter);
  // ★ 公开回调必须先于 /api/enterprise 注册，否则会被 userRouter 的 authMiddleware 拦截。
  app.use('/api/enterprise/mcp/oauth', enterpriseOAuthRouter);
  app.use('/api/enterprise', enterpriseUserRouter);
  return app;
}

async function listen(app: express.Express): Promise<[Server, string]> {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;
  return [server, `http://127.0.0.1:${port}`];
}

function cleanDb() {
  db.prepare('DELETE FROM mcp_oauth_session WHERE connector_id = ?').run(connectorId);
  db.prepare('DELETE FROM mcp_call_log WHERE connector_id = ?').run(connectorId);
  db.prepare('DELETE FROM mcp_connector_tool WHERE connector_id = ?').run(connectorId);
  db.prepare('DELETE FROM mcp_connector WHERE owner_user_id = ?').run(UID);
  db.prepare('DELETE FROM mcp_connector_provider WHERE owner_user_id = ?').run(UID);
  db.prepare('DELETE FROM admin_audit WHERE actor_user_id = ?').run(UID);
  db.prepare('DELETE FROM user WHERE id = ?').run(UID);
}

beforeAll(async () => {
  [upstream, upstreamBase] = await listen(createUpstreamApp());
  [appServer, appBase] = await listen(createAppUnderTest());
  ensureEnterpriseSchema();
  seedRbac();
  cleanDb();
  db.prepare('INSERT INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(UID, 'mcp_oauth_test', '!test', Date.now());
  connectorUrl = `${upstreamBase}/mcp`;
  const provider = createMcpProvider(UID, {
    name: '测试 OAuth MCP',
    url: connectorUrl,
    authMode: 'oauth',
    oauthConfig: {
      authorizationUrl: `${upstreamBase}/authorize`,
      tokenUrl: `${upstreamBase}/token`,
      clientId: 'client-test',
      clientSecret: CLIENT_SECRET,
      issuer: ISSUER,
      scopes: ['mcp:tools'],
    },
  });
  providerId = provider.id;
  const connector = createMcpConnector(UID, {
    providerId,
    name: '测试 OAuth 连接',
    credentialMode: 'centralized',
    isPublic: true,
  });
  connectorId = connector.id;
  // 发起授权用的 redirect_uri 必须指向本测试 app。
  db.prepare('UPDATE mcp_connector_provider SET oauth_config_json = ? WHERE id = ?')
    .run(JSON.stringify({
      authorizationUrl: `${upstreamBase}/authorize`,
      tokenUrl: `${upstreamBase}/token`,
      clientId: 'client-test',
      issuer: ISSUER,
      scopes: ['mcp:tools'],
      redirectUri: `${appBase}/api/enterprise/mcp/oauth/callback`,
    }), providerId);
});

afterAll(async () => {
  await new Promise<void>((r) => upstream.close(() => r()));
  await new Promise<void>((r) => appServer.close(() => r()));
});

beforeEach(() => {
  resetMocks();
  db.prepare('DELETE FROM mcp_oauth_session WHERE connector_id = ?').run(connectorId);
  db.prepare('DELETE FROM mcp_call_log WHERE connector_id = ?').run(connectorId);
  db.prepare('DELETE FROM mcp_connector_tool WHERE connector_id = ?').run(connectorId);
  db.prepare(`UPDATE mcp_connector SET oauth_token_enc = NULL, oauth_status = 'not_authorized',
    oauth_expires_at = NULL, oauth_scopes = NULL, oauth_error = NULL WHERE id = ?`).run(connectorId);
});

/** 发起一次授权：真访问 authorize URL（让 mock 记录 challenge），返回 state 与参数。 */
async function beginAuthorization(options: { publicOrigin?: string } = {}) {
  const started = startMcpOAuth(connectorId, UID, { publicOrigin: options.publicOrigin || appBase });
  const url = new URL(started.authorizationUrl);
  await fetch(url.toString()); // 授权页访问：mock 记录 code_challenge
  return { started, url, state: url.searchParams.get('state') || '' };
}

function callbackUrl(params: Record<string, string>) {
  const u = new URL('/api/enterprise/mcp/oauth/callback', appBase);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

async function hitCallback(params: Record<string, string>) {
  const res = await fetch(callbackUrl(params), { redirect: 'manual' });
  return { status: res.status, location: res.headers.get('location') || '', body: await res.text() };
}

describe('授权发起：state / PKCE / 配置脱敏', () => {
  it('发起授权返回规范 URL，state 不落明文、verifier 加密且绑定连接', () => {
    const started = startMcpOAuth(connectorId, UID, { publicOrigin: appBase });
    expect(started.status).toBe('pending');
    const u = new URL(started.authorizationUrl);
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('client_id')).toBe('client-test');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(u.searchParams.get('redirect_uri')).toBe(`${appBase}/api/enterprise/mcp/oauth/callback`);
    expect(u.searchParams.get('scope')).toBe('mcp:tools');
    expect(u.searchParams.get('resource')).toBe(connectorUrl);
    expect(u.searchParams.get('state')).toBeTruthy();

    const state = u.searchParams.get('state')!;
    const sessions = db.prepare('SELECT * FROM mcp_oauth_session WHERE connector_id = ?').all(connectorId) as any[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].state_hash).not.toBe(state);
    expect(sessions[0].state_hash).toHaveLength(64);
    expect(sessions[0].code_verifier_enc).not.toContain(sessions[0].code_challenge);
    expect(sessions[0].status).toBe('pending');
    expect(sessions[0].user_id).toBe(UID);
    expect(sessions[0].expires_at).toBeGreaterThan(Date.now());
    expect(getMcpOAuthStatus(connectorId).status).toBe('pending');
  });

  it('管理员可从连接配置端点发起授权（HTTP 200 且不带凭证）', async () => {
    const res = await fetch(`${appBase}/api/admin/enterprise/mcp/connectors/${connectorId}/oauth/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    const json = await res.json() as any;
    expect(res.status).toBe(200);
    expect(json.data.authorizationUrl).toContain('/authorize');
    expect(JSON.stringify(json)).not.toContain(CLIENT_SECRET);
    expect(JSON.stringify(json)).not.toContain(ACCESS_TOKEN);
  });

  it('Provider 列表与审计不回显 clientSecret / token', () => {
    const providers = db.prepare('SELECT * FROM mcp_connector_provider WHERE id = ?').get(providerId) as any;
    expect(JSON.stringify(providers)).not.toContain(CLIENT_SECRET);
    // 审计脱敏是唯一出口：嵌套、数组、任意大小写都要盖住。
    const redacted = JSON.stringify(redactSecrets({
      clientSecret: CLIENT_SECRET, oauthToken: { accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN },
      nested: [{ code: 'secret-code', Access_Token: ACCESS_TOKEN, safe: 'ok' }],
    }));
    expect(redacted).not.toContain(CLIENT_SECRET);
    expect(redacted).not.toContain(ACCESS_TOKEN);
    expect(redacted).not.toContain('secret-code');
    expect(redacted).toContain('"safe":"ok"');
  });
});

describe('回调：state / PKCE / 来源 / 一次性', () => {
  it('未知 state 直接拒绝，且不向 token 端点发起交换', async () => {
    const r = await hitCallback({ code: 'code-1', state: 'forged-state', iss: ISSUER });
    expect(r.status).toBe(400);
    expect(tokenRequests).toHaveLength(0);
    expect(getMcpOAuthStatus(connectorId).status).not.toBe('authorized');
  });

  it('issuer 不匹配（来源伪造）拒绝', async () => {
    const { state } = await beginAuthorization();
    const r = await hitCallback({ code: 'code-1', state, iss: 'https://evil.example' });
    expect(r.status).toBe(400);
    expect(tokenRequests).toHaveLength(0);
  });

  it('回调实际地址与授权会话登记的 redirect_uri 不一致时拒绝', async () => {
    const { state } = await beginAuthorization();
    // 模拟发起时登记在另一 origin（或反代前缀被改），回调却打到这里 —— 必须拒绝换 token。
    db.prepare('UPDATE mcp_oauth_session SET redirect_uri = ? WHERE connector_id = ?')
      .run('http://elsewhere.example/api/enterprise/mcp/oauth/callback', connectorId);
    const r = await hitCallback({ code: 'code-1', state, iss: ISSUER });
    expect(r.status).toBe(400);
    expect(tokenRequests).toHaveLength(0);
  });

  it('过期 session 拒绝', async () => {
    const { state } = await beginAuthorization();
    db.prepare('UPDATE mcp_oauth_session SET expires_at = ? WHERE connector_id = ?')
      .run(Date.now() - 1000, connectorId);
    const r = await hitCallback({ code: 'code-1', state, iss: ISSUER });
    expect(r.status).toBe(400);
    expect(tokenRequests).toHaveLength(0);
  });

  it('正常回调换取 token 并落加密值；state 重放第二次被拒', async () => {
    const { state } = await beginAuthorization();
    const r = await hitCallback({ code: 'code-ok', state, iss: ISSUER });
    expect(r.status).toBe(302);
    expect(r.location).toContain('mcp_oauth=success');
    expect(tokenRequests).toHaveLength(1);
    expect(tokenRequests[0].grant_type).toBe('authorization_code');
    expect(tokenRequests[0].code_verifier).toBeTruthy();

    const row = db.prepare('SELECT * FROM mcp_connector WHERE id = ?').get(connectorId) as any;
    expect(row.oauth_status).toBe('authorized');
    expect(row.oauth_token_enc).toBeTruthy();
    expect(row.oauth_token_enc).not.toContain(currentAccessToken);
    const stored = JSON.parse(decrypt(row.oauth_token_enc));
    expect(stored.accessToken).toBe(currentAccessToken);
    expect(stored.refreshToken).toBe(REFRESH_TOKEN);
    expect(row.oauth_expires_at).toBeGreaterThan(Date.now());

    const replay = await hitCallback({ code: 'code-ok', state, iss: ISSUER });
    expect(replay.status).toBe(400);
    expect(tokenRequests).toHaveLength(1);
  });

  it('用户取消授权会标记失败且不保存 token', async () => {
    const { state } = await beginAuthorization();
    const r = await hitCallback({ state, error: 'access_denied', iss: ISSUER });
    expect(r.location).toContain('mcp_oauth=denied');
    expect(tokenRequests).toHaveLength(0);
    const row = db.prepare('SELECT * FROM mcp_connector WHERE id = ?').get(connectorId) as any;
    expect(row.oauth_token_enc).toBeNull();
  });

  it('PKCE 不成立时上游拒绝换 token，连接进入重新授权状态', async () => {
    const { state } = await beginAuthorization();
    // 伪造一个对不上的 challenge：/token 会用 sha256(verifier) 比对失败
    lastCodeChallenge = 'challenge-that-does-not-match';
    const r = await hitCallback({ code: 'code-ok', state, iss: ISSUER });
    expect(r.status).toBe(400);
    expect(getMcpOAuthStatus(connectorId).status).toBe('reauthorization_required');
  });
});

describe('Token 不回显：API / 审计 / 日志', () => {
  it('授权后所有对外视图都不含明文 token', async () => {
    const { state } = await beginAuthorization();
    await hitCallback({ code: 'code-ok', state, iss: ISSUER });
    const status = getMcpOAuthStatus(connectorId);
    expect(JSON.stringify(status)).not.toContain(currentAccessToken);
    expect(JSON.stringify(listMcpConnectors(UID, { all: true }))).not.toContain(currentAccessToken);

    const httpStatus = await (await fetch(`${appBase}/api/admin/enterprise/mcp/connectors/${connectorId}/oauth/status`)).json();
    expect(JSON.stringify(httpStatus)).not.toContain(currentAccessToken);

    const audits = db.prepare('SELECT after_json FROM admin_audit').all() as any[];
    expect(JSON.stringify(audits)).not.toContain(currentAccessToken);
    expect(JSON.stringify(audits)).not.toContain(CLIENT_SECRET);
  });
});

describe('工具发现 / 调用 / 刷新 / 撤销', () => {
  async function authorize() {
    const { state } = await beginAuthorization();
    await hitCallback({ code: 'code-ok', state, iss: ISSUER });
  }

  it('授权后完成工具发现与工具调用，上游只看到服务端持有的 Bearer', async () => {
    await authorize();
    const tools = await discoverMcpConnectorTools(connectorId);
    expect(tools.some((t: any) => t.name === 'echo')).toBe(true);
    const result = await callMcpToolDirect({ connectorId, toolName: 'echo', args: {}, userId: UID });
    expect(JSON.stringify(result.result)).toContain('pong');
    expect(mcpAuthSeen.length).toBeGreaterThan(0);
    expect(mcpAuthSeen.every((h) => h === `Bearer ${currentAccessToken}`)).toBe(true);
    // 调用日志与前端可见字段都不能回显 token
    expect(JSON.stringify(db.prepare('SELECT * FROM mcp_call_log WHERE connector_id = ?').all(connectorId)))
      .not.toContain(currentAccessToken);
  });

  it('access token 过期后用 refresh_token 自动刷新，调用继续成功', async () => {
    await authorize();
    const row = db.prepare('SELECT oauth_token_enc FROM mcp_connector WHERE id = ?').get(connectorId) as any;
    const stored = JSON.parse(decrypt(row.oauth_token_enc));
    stored.expiresAt = Date.now() - 1000;
    db.prepare('UPDATE mcp_connector SET oauth_token_enc = ?, oauth_expires_at = ? WHERE id = ?')
      .run(encrypt(JSON.stringify(stored)), stored.expiresAt, connectorId);
    const tools = await discoverMcpConnectorTools(connectorId);
    expect(tools.length).toBeGreaterThan(0);
    expect(tokenRequests.some((r) => r.grant_type === 'refresh_token')).toBe(true);
    expect(getMcpOAuthStatus(connectorId).status).toBe('authorized');
  });

  it('刷新失败 ⇒ 可行动错误 + 重新授权状态', async () => {
    await authorize();
    refreshShouldFail = true;
    const row = db.prepare('SELECT oauth_token_enc FROM mcp_connector WHERE id = ?').get(connectorId) as any;
    const stored = JSON.parse(decrypt(row.oauth_token_enc));
    stored.expiresAt = Date.now() - 1000;
    db.prepare('UPDATE mcp_connector SET oauth_token_enc = ?, oauth_expires_at = ? WHERE id = ?')
      .run(encrypt(JSON.stringify(stored)), stored.expiresAt, connectorId);
    await expect(discoverMcpConnectorTools(connectorId)).rejects.toMatchObject({
      code: 'MCP_OAUTH_REAUTHORIZATION_REQUIRED',
    });
    const status = getMcpOAuthStatus(connectorId);
    expect(status.status).toBe('reauthorization_required');
    expect(status.message).toContain('重新授权');
    expect(status.authorizationPath).toContain('/oauth/start');
    expect(JSON.stringify(status)).not.toContain(ACCESS_TOKEN);
  });

  it('撤销后下一次调用返回可行动错误，且不再发起上游请求', async () => {
    await authorize();
    await discoverMcpConnectorTools(connectorId);
    revokeMcpOAuth(connectorId);
    const before = mcpAuthSeen.length;
    await expect(callMcpToolDirect({ connectorId, toolName: 'echo', args: {}, userId: UID }))
      .rejects.toMatchObject({ code: 'MCP_OAUTH_REAUTHORIZATION_REQUIRED' });
    expect(mcpAuthSeen.length).toBe(before);
    const status = getMcpOAuthStatus(connectorId);
    expect(status.status).toBe('revoked');
    expect(status.hasToken).toBe(false);
  });

  it('未授权连接调用工具直接给出可行动错误，不带上凭证退化成匿名请求', async () => {
    const before = mcpAuthSeen.length;
    await expect(discoverMcpConnectorTools(connectorId)).rejects.toMatchObject({
      code: 'MCP_OAUTH_REAUTHORIZATION_REQUIRED',
    });
    expect(mcpAuthSeen.length).toBe(before);
  });
});
