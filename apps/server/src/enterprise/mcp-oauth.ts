/**
 * 集中式 MCP OAuth 授权闭环（Task 1，2026-11-08）。
 *
 * ★ 收口原则：state / PKCE / 来源校验、token 加密存取、刷新与重新授权判定**只在这里实现**。
 *   mcp-hub.ts 的 authHeaders 只调用 resolveMcpOAuthAccessToken()，不要再自行 decrypt token，
 *   否则「过期/撤销后仍继续发旧 token」这类缺陷必然从第二处实现漏出去。
 *
 * ★ 安全约束（对应 plan.md 验收标准）：
 *   1. state 只存 sha256，PKCE verifier 加密存；一次性消费 + TTL + redirect_uri 绑定。
 *   2. 回调不依赖登录态（第三方重定向带不了 JWT），认证完全靠 state；额外校验 iss 与来源。
 *   3. token endpoint / client_secret 只从服务端 Provider 配置读取，绝不接受回调参数覆盖。
 *   4. Token 只以 AES-GCM 密文落库；API、审计、日志、错误信息一律不回显。
 */
import { createHash, randomBytes } from 'node:crypto';
import { db } from '../db.js';
import { decrypt, encrypt } from '../utils/crypto.js';
// ★ 不要在模块顶层调用 ensureEnterpriseSchema()：企业表统一由 index.ts 启动时建，
//   测试由各用例 beforeAll 显式建。顶层 db.exec 会在 mock db / 只读库 / 并行 import
//   场景下把整条 import 链打挂（实测全量测试 4 个文件因此失败）。与 mcp-hub.ts 保持一致。
import './schema.js';

export const OAUTH_CALLBACK_PATH = '/api/enterprise/mcp/oauth/callback';
const SESSION_TTL_MS = 10 * 60 * 1000;
const EXPIRY_SKEW_MS = 60 * 1000;
const REDACTED = '[REDACTED]';

/** 调用方只需读 code，不要去匹配文案。 */
export class McpOAuthError extends Error {
  readonly code: string;
  readonly status: number;
  readonly connectorId?: string;
  constructor(code: string, message: string, status = 400, connectorId?: string) {
    super(message);
    this.name = 'McpOAuthError';
    this.code = code;
    this.status = status;
    this.connectorId = connectorId;
  }
}

/**
 * 递归脱敏：审计中间件、错误日志、任何对外 JSON 都走这一个出口。
 * 键名归一化后按子串匹配，覆盖 clientSecret / access_token / Authorization / code_verifier 等写法。
 */
const SENSITIVE_KEYS = [
  'secret', 'token', 'password', 'passwd', 'credential', 'authorization',
  'apikey', 'privatekey', 'code', 'verifier', 'cookie', 'sessionid',
];

function isSensitiveKey(key: string): boolean {
  const k = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return SENSITIVE_KEYS.some((s) => k.includes(s));
}

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? REDACTED : redactSecrets(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * 兜底：上游把 Authorization 或 token 回显在错误正文里时，写调用日志/审计前先抹掉。
 * 不依赖数据库解密，纯文本处理，任何对外文本都可以走这里。
 */
export function scrubBearerTokens(text: string): string {
  return String(text || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(access_token|refresh_token|client_secret|code_verifier)\b(\s*[:=]\s*|["']?\s*=\s*["']?)[^\s&"',}]+/gi, '$1=[REDACTED]');
}

/** 把可能来自上游的错误压成「不含任何凭证」的短文本，避免写进调用日志。 */
export function safeOAuthErrorPreview(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  // 上游响应体可能回显 token，只保留状态码与固定分类，绝不透传正文。
  const status = /MCP HTTP (\d{3})|HTTP (\d{3})|(\b4\d{2}\b|\b5\d{2}\b)/.exec(raw);
  return `OAuth 上游请求失败${status ? `（HTTP ${status[1] || status[2] || status[3]}）` : ''}，请检查 Provider 配置或重新授权`.slice(0, 160);
}

interface StoredOAuthToken {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt: number;
  scopes: string[];
  obtainedAt: number;
}

interface OAuthProviderConfig {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  redirectUri?: string;
  issuer?: string;
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function requireHttpUrl(raw: unknown, label: string): string {
  const url = String(raw || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new McpOAuthError('MCP_OAUTH_CONFIG_INCOMPLETE', `${label} 必须是合法的 http(s) 地址`);
  return url;
}

/** 读取 Provider 的 OAuth 配置；clientSecret 优先从加密列取，兼容早期明文配置但不回显。 */
export function readOAuthConfig(providerRow: any): OAuthProviderConfig {
  const cfg = parseJson<Record<string, unknown>>(providerRow?.oauth_config_json, {});
  let clientSecret = '';
  if (providerRow?.oauth_client_secret_enc) {
    try { clientSecret = String(parseJson<Record<string, unknown>>(decrypt(providerRow.oauth_client_secret_enc), {}).clientSecret || ''); }
    catch { clientSecret = ''; }
  }
  if (!clientSecret) clientSecret = String(cfg.clientSecret || '');
  const scopesRaw = cfg.scopes;
  const scopes = Array.isArray(scopesRaw)
    ? scopesRaw.map(String)
    : String(scopesRaw || '').split(/\s+/).filter(Boolean);
  return {
    authorizationUrl: requireHttpUrl(cfg.authorizationUrl, 'authorizationUrl'),
    tokenUrl: requireHttpUrl(cfg.tokenUrl, 'tokenUrl'),
    clientId: String(cfg.clientId || '').trim(),
    clientSecret,
    scopes,
    redirectUri: cfg.redirectUri ? String(cfg.redirectUri) : undefined,
    issuer: cfg.issuer ? String(cfg.issuer) : undefined,
  };
}

/**
 * Provider 写入时的唯一实现：把 clientSecret 从明文字典里摘出来单独加密。
 * 不这么做的话 listMcpProviders() 的 `SELECT *` + oauth_config_json 会把密钥回显给管理端。
 */
export function encodeOAuthConfigInput(
  input: Record<string, unknown> | undefined,
  existingSecretEnc?: string | null,
): { config: Record<string, unknown>; clientSecretEnc: string | null } {
  const config: Record<string, unknown> = { ...(input || {}) };
  const raw = config.clientSecret;
  delete config.clientSecret;
  if (typeof raw === 'string' && raw.trim()) {
    return { config, clientSecretEnc: encrypt(JSON.stringify({ clientSecret: raw.trim() })) };
  }
  return { config, clientSecretEnc: existingSecretEnc || null };
}

function connectorRow(connectorId: string): any {
  const row = db.prepare('SELECT * FROM mcp_connector WHERE id = ?').get(connectorId) as any;
  if (!row) throw new McpOAuthError('MCP_CONNECTOR_NOT_FOUND', 'MCP 连接不存在', 404, connectorId);
  return row;
}

function providerRow(providerId: string): any {
  const row = db.prepare('SELECT * FROM mcp_connector_provider WHERE id = ?').get(providerId) as any;
  if (!row) throw new McpOAuthError('MCP_OAUTH_CONFIG_INCOMPLETE', 'MCP Provider 不存在', 404);
  return row;
}

function setConnectorState(
  connectorId: string,
  state: { status: string; expiresAt?: number | null; scopes?: string[] | null; error?: string | null },
): void {
  db.prepare(
    `UPDATE mcp_connector
        SET oauth_status = ?, oauth_expires_at = ?, oauth_scopes = ?, oauth_error = ?, oauth_updated_at = ?
      WHERE id = ?`,
  ).run(
    state.status,
    state.expiresAt ?? null,
    state.scopes ? JSON.stringify(state.scopes) : null,
    state.error ?? null,
    Date.now(),
    connectorId,
  );
}

function markReauthorization(connectorId: string, reason: string): void {
  setConnectorState(connectorId, {
    status: 'reauthorization_required',
    expiresAt: null,
    error: reason.slice(0, 160),
  });
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export interface StartMcpOAuthOptions {
  /** 外部访问 origin，例如 https://yz.example.com；不传则用环境变量或 localhost。 */
  publicOrigin?: string;
}

/**
 * 发起授权：生成 state / PKCE，落一次性会话，返回给浏览器跳转的授权 URL。
 * 返回的响应里不含 clientSecret、verifier 或任何 token。
 */
export function startMcpOAuth(
  connectorId: string,
  userId: string,
  options: StartMcpOAuthOptions = {},
): { authorizationUrl: string; expiresAt: number; status: 'pending' } {
  const connector = connectorRow(connectorId);
  const provider = providerRow(connector.provider_id);
  if (provider.auth_mode !== 'oauth') {
    throw new McpOAuthError('MCP_OAUTH_CONFIG_INCOMPLETE', '该 Provider 未启用 OAuth 认证模式', 400, connectorId);
  }
  const cfg = readOAuthConfig(provider);
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new McpOAuthError('MCP_OAUTH_CONFIG_INCOMPLETE', 'OAuth 配置缺少 clientId 或 clientSecret', 400, connectorId);
  }
  const origin = String(options.publicOrigin || process.env.YZ_PUBLIC_BASE_URL || 'http://localhost:3001')
    .trim().replace(/\/+$/, '');
  const redirectUri = cfg.redirectUri || `${origin}${OAUTH_CALLBACK_PATH}`;

  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = pkceChallenge(verifier);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  const tx = db.transaction(() => {
    // 同一连接只允许一个 pending 会话，避免管理员重复点击留下多个可用 state。
    db.prepare(
      "UPDATE mcp_oauth_session SET status = 'expired' WHERE connector_id = ? AND status = 'pending'",
    ).run(connectorId);
    db.prepare(
      `INSERT INTO mcp_oauth_session
        (id, connector_id, provider_id, user_id, state_hash, code_verifier_enc, code_challenge,
         redirect_uri, scopes_json, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    ).run(
      randomBytes(16).toString('hex'), connectorId, provider.id, userId,
      sha256Hex(state), encrypt(verifier), challenge, redirectUri,
      JSON.stringify(cfg.scopes), expiresAt, now,
    );
    setConnectorState(connectorId, { status: 'pending', error: null });
  });
  tx();

  const url = new URL(cfg.authorizationUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (cfg.scopes.length) url.searchParams.set('scope', cfg.scopes.join(' '));
  // RFC 8707：MCP 要求把目标 MCP Server 作为 resource 参数带上，防 token 被挪作他用。
  url.searchParams.set('resource', connector.url);
  return { authorizationUrl: url.toString(), expiresAt, status: 'pending' };
}

async function postTokenEndpoint(cfg: OAuthProviderConfig, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams({
    ...params,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as any;
  if (!json || typeof json.access_token !== 'string' || !json.access_token) {
    throw new Error('missing access_token');
  }
  return json;
}

function buildStoredToken(json: any, previous?: StoredOAuthToken): StoredOAuthToken {
  const expiresIn = Number(json.expires_in);
  return {
    accessToken: String(json.access_token),
    // 部分 Provider 刷新时不返回新 refresh_token，必须沿用旧值。
    refreshToken: json.refresh_token ? String(json.refresh_token) : previous?.refreshToken,
    tokenType: String(json.token_type || 'Bearer'),
    expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 3600 * 1000),
    scopes: String(json.scope || '').split(/\s+/).filter(Boolean),
    obtainedAt: Date.now(),
  };
}

function saveToken(connectorId: string, token: StoredOAuthToken): void {
  db.prepare('UPDATE mcp_connector SET oauth_token_enc = ? WHERE id = ?')
    .run(encrypt(JSON.stringify(token)), connectorId);
  setConnectorState(connectorId, {
    status: 'authorized',
    expiresAt: token.expiresAt,
    scopes: token.scopes,
    error: null,
  });
}

export interface CompleteMcpOAuthInput {
  state?: string;
  code?: string;
  error?: string;
  iss?: string;
  /** 由路由按当前请求重建的 redirect_uri，用于校验回调来源。 */
  currentRedirectUri: string;
}

/**
 * 处理回调。校验顺序：state → 过期 → iss → redirect_uri → 一次性消费 → PKCE 换 token。
 * 任何失败都抛 McpOAuthError，绝不把上游响应体写进日志或错误文案。
 */
export async function completeMcpOAuth(
  input: CompleteMcpOAuthInput,
): Promise<{ connectorId: string; status: 'authorized' | 'denied'; reason?: string }> {
  const state = String(input.state || '');
  if (!state) throw new McpOAuthError('INVALID_OAUTH_STATE', '缺少 state 参数');
  const session = db.prepare(
    "SELECT * FROM mcp_oauth_session WHERE state_hash = ? AND status = 'pending'",
  ).get(sha256Hex(state)) as any;
  if (!session) throw new McpOAuthError('INVALID_OAUTH_STATE', 'state 无效或已被使用');
  if (Number(session.expires_at) <= Date.now()) {
    db.prepare("UPDATE mcp_oauth_session SET status = 'expired' WHERE id = ?").run(session.id);
    throw new McpOAuthError('EXPIRED_OAUTH_STATE', '授权会话已过期，请重新发起授权', 400, session.connector_id);
  }

  const provider = providerRow(session.provider_id);
  const cfg = readOAuthConfig(provider);
  // RFC 9207：配置了 issuer 时，授权响应的 iss 必须严格匹配，防授权服务器混淆攻击。
  if (cfg.issuer && String(input.iss || '') !== cfg.issuer) {
    throw new McpOAuthError('INVALID_OAUTH_ISSUER', '授权来源校验失败', 400, session.connector_id);
  }
  // 回调必须打到发起时登记的 redirect_uri（含 origin），换 Host / 反代前缀都拒绝。
  if (input.currentRedirectUri !== session.redirect_uri) {
    throw new McpOAuthError('INVALID_OAUTH_REDIRECT', '回调地址与授权会话不匹配', 400, session.connector_id);
  }

  // ★ 原子消费：并发重放只有一个能进入 token 交换。
  const claimed = db.prepare(
    "UPDATE mcp_oauth_session SET status = 'exchanging', consumed_at = ? WHERE id = ? AND status = 'pending'",
  ).run(Date.now(), session.id);
  if (claimed.changes !== 1) {
    throw new McpOAuthError('INVALID_OAUTH_STATE', 'state 无效或已被使用', 400, session.connector_id);
  }

  if (input.error) {
    db.prepare("UPDATE mcp_oauth_session SET status = 'denied' WHERE id = ?").run(session.id);
    setConnectorState(session.connector_id, { status: 'not_authorized', error: `用户取消或授权被拒绝：${String(input.error).slice(0, 60)}` });
    return { connectorId: session.connector_id, status: 'denied', reason: String(input.error).slice(0, 60) };
  }
  if (!input.code) {
    db.prepare("UPDATE mcp_oauth_session SET status = 'failed' WHERE id = ?").run(session.id);
    markReauthorization(session.connector_id, '回调缺少授权码');
    throw new McpOAuthError('MISSING_OAUTH_CODE', '回调缺少授权码', 400, session.connector_id);
  }

  let verifier = '';
  try { verifier = decrypt(session.code_verifier_enc); } catch { /* 下方按缺 verifier 处理 */ }
  if (!verifier || pkceChallenge(verifier) !== session.code_challenge) {
    db.prepare("UPDATE mcp_oauth_session SET status = 'failed' WHERE id = ?").run(session.id);
    markReauthorization(session.connector_id, 'PKCE verifier 校验失败');
    throw new McpOAuthError('INVALID_PKCE_VERIFIER', 'PKCE 校验失败', 400, session.connector_id);
  }

  try {
    const json = await postTokenEndpoint(cfg, {
      grant_type: 'authorization_code',
      code: String(input.code),
      redirect_uri: session.redirect_uri,
      code_verifier: verifier,
      resource: connectorRow(session.connector_id).url,
    });
    saveToken(session.connector_id, buildStoredToken(json));
    db.prepare("UPDATE mcp_oauth_session SET status = 'authorized' WHERE id = ?").run(session.id);
    return { connectorId: session.connector_id, status: 'authorized' };
  } catch (e) {
    db.prepare("UPDATE mcp_oauth_session SET status = 'failed' WHERE id = ?").run(session.id);
    markReauthorization(session.connector_id, safeOAuthErrorPreview(e));
    throw new McpOAuthError('OAUTH_TOKEN_EXCHANGE_FAILED', '换取访问令牌失败，请检查 OAuth 配置后重新授权', 400, session.connector_id);
  }
}

export interface McpOAuthStatus {
  status: string;
  expiresAt: number | null;
  scopes: string[];
  hasToken: boolean;
  message: string;
  authorizationPath: string;
}

export function getMcpOAuthStatus(connectorId: string): McpOAuthStatus {
  const row = connectorRow(connectorId);
  const status = String(row.oauth_status || 'not_authorized');
  const expiresAt = row.oauth_expires_at ? Number(row.oauth_expires_at) : null;
  const expired = !!expiresAt && expiresAt <= Date.now();
  const effective = status === 'authorized' && expired ? 'expired' : status;
  const messages: Record<string, string> = {
    not_authorized: '尚未完成 OAuth 授权，请管理员重新授权',
    pending: '等待授权回调',
    authorized: '已授权',
    expired: '访问令牌已过期，请管理员重新授权或等待自动刷新',
    revoked: '授权已撤销，请管理员重新授权',
    reauthorization_required: '令牌不可用，请管理员重新授权',
  };
  return {
    status: effective,
    expiresAt,
    scopes: parseJson<string[]>(row.oauth_scopes, []),
    hasToken: !!row.oauth_token_enc,
    message: messages[effective] || '请管理员重新授权',
    authorizationPath: `/api/admin/enterprise/mcp/connectors/${connectorId}/oauth/start`,
  };
}

export function revokeMcpOAuth(connectorId: string): void {
  connectorRow(connectorId);
  db.prepare(
    `UPDATE mcp_connector SET oauth_token_enc = NULL, oauth_status = 'revoked',
      oauth_expires_at = NULL, oauth_scopes = NULL, oauth_error = '管理员已撤销授权', oauth_updated_at = ?
     WHERE id = ?`,
  ).run(Date.now(), connectorId);
  db.prepare("UPDATE mcp_oauth_session SET status = 'expired' WHERE connector_id = ? AND status = 'pending'").run(connectorId);
}

function reauthorizationError(connectorId: string): McpOAuthError {
  return new McpOAuthError(
    'MCP_OAUTH_REAUTHORIZATION_REQUIRED',
    '该 MCP 连接的 OAuth 授权已过期或被撤销，请管理员在「集中式 MCP」中重新授权后再调用',
    401,
    connectorId,
  );
}

function readStoredToken(row: any): StoredOAuthToken | null {
  if (!row.oauth_token_enc) return null;
  try {
    const parsed = parseJson<StoredOAuthToken>(decrypt(row.oauth_token_enc), {} as StoredOAuthToken);
    return parsed?.accessToken ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * ★ 唯一出口：所有需要 Bearer 的 MCP 请求都必须经这里取 token。
 * 过期先刷新；无 token / 已撤销 / 刷新失败一律抛可行动错误并置重新授权状态，
 * 绝不退化成「无认证继续请求」（那样上游 401 会被当成普通网络错误）。
 */
export async function resolveMcpOAuthAccessToken(connector: any): Promise<string> {
  const status = String(connector.oauth_status || 'not_authorized');
  if (status === 'revoked' || status === 'reauthorization_required') {
    throw reauthorizationError(connector.id);
  }
  const token = readStoredToken(connector);
  if (!token) {
    markReauthorization(connector.id, '缺少可用的 OAuth 令牌');
    throw reauthorizationError(connector.id);
  }
  if (Number(token.expiresAt) > Date.now() + EXPIRY_SKEW_MS) return token.accessToken;

  const provider = providerRow(connector.provider_id);
  if (!token.refreshToken) {
    markReauthorization(connector.id, '访问令牌已过期且无 refresh_token');
    throw reauthorizationError(connector.id);
  }
  try {
    const cfg = readOAuthConfig(provider);
    const json = await postTokenEndpoint(cfg, {
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
      resource: connector.url,
    });
    const refreshed = buildStoredToken(json, token);
    saveToken(connector.id, refreshed);
    return refreshed.accessToken;
  } catch {
    markReauthorization(connector.id, safeOAuthErrorPreview(new Error('refresh_token 交换失败')));
    throw reauthorizationError(connector.id);
  }
}
