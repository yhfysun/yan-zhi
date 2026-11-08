import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { aclExistsSql } from '../services/resource-acl.js';
import { decrypt, encrypt } from '../utils/crypto.js';
import {
  encodeOAuthConfigInput, resolveMcpOAuthAccessToken, scrubBearerTokens,
} from './mcp-oauth.js';
import { recordQuotaUsage } from './quota.js';
import './schema.js';

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function toHeaders(raw: unknown): Record<string, string> {
  const parsed = typeof raw === 'string' ? parseJson<Record<string, unknown>>(raw, {}) : (raw || {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed || {})) {
    if (typeof value === 'string' && value) out[key] = value;
  }
  return out;
}

export interface McpProviderInput {
  name: string;
  description?: string | null;
  url: string;
  transport?: string;
  authMode?: 'none' | 'header' | 'oauth';
  headerNames?: string[];
  oauthConfig?: Record<string, unknown>;
  enabled?: boolean;
}

export interface McpConnectorInput {
  providerId: string;
  name: string;
  description?: string | null;
  url?: string;
  credentialMode?: 'none' | 'centralized' | 'independent';
  sharedHeaders?: Record<string, string>;
  sharedSecret?: string;
  oauthToken?: Record<string, unknown>;
  toolPolicy?: Record<string, unknown>;
  isPublic?: boolean;
  enabled?: boolean;
}

/** Provider 对外的 OAuth 配置：clientSecret 单独加密存，密文列与明文残留都不回显。 */
function publicOAuthConfig(r: any): Record<string, unknown> {
  const cfg = parseJson<Record<string, unknown>>(r.oauth_config_json, {});
  delete cfg.clientSecret;
  delete cfg.client_secret;
  return cfg;
}

export function listMcpProviders(): any[] {
  return db.prepare('SELECT * FROM mcp_connector_provider ORDER BY created_at DESC').all().map((r: any) => ({
    ...r,
    header_names: parseJson(r.header_names_json, []),
    oauth_config: publicOAuthConfig(r),
    has_oauth_client_secret: !!r.oauth_client_secret_enc,
    enabled: !!r.enabled,
    oauth_config_json: undefined,
    oauth_client_secret_enc: undefined,
  }));
}

export function createMcpProvider(userId: string, input: McpProviderInput): any {
  const name = String(input.name || '').trim();
  const url = String(input.url || '').trim();
  if (!name) throw new Error('连接器名称不能为空');
  if (!/^https?:\/\//i.test(url)) throw new Error('MCP 地址必须以 http:// 或 https:// 开头');
  const id = randomUUID();
  const now = Date.now();
  const { config, clientSecretEnc } = encodeOAuthConfigInput(input.oauthConfig);
  db.prepare(
    `INSERT INTO mcp_connector_provider
      (id, owner_user_id, name, description, transport, url, auth_mode,
       header_names_json, oauth_config_json, oauth_client_secret_enc, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, userId, name, input.description || null,
    input.transport || 'streamable_http', url,
    input.authMode === 'none' || input.authMode === 'oauth' ? input.authMode : 'header',
    JSON.stringify(input.headerNames || []),
    JSON.stringify(config), clientSecretEnc,
    input.enabled === false ? 0 : 1, now, now,
  );
  return listMcpProviders().find((x) => x.id === id);
}

export function updateMcpProvider(id: string, input: Partial<McpProviderInput>): any {
  const row = db.prepare('SELECT * FROM mcp_connector_provider WHERE id = ?').get(id) as any;
  if (!row) throw new Error('MCP Provider 不存在');
  const sets: string[] = [];
  const vals: unknown[] = [];
  const put = (col: string, value: unknown) => { sets.push(`${col} = ?`); vals.push(value); };
  if (input.name !== undefined) put('name', String(input.name).trim());
  if (input.description !== undefined) put('description', input.description || null);
  if (input.url !== undefined) {
    if (!/^https?:\/\//i.test(String(input.url))) throw new Error('MCP 地址必须以 http:// 或 https:// 开头');
    put('url', String(input.url).trim());
  }
  if (input.transport !== undefined) put('transport', input.transport);
  if (input.authMode !== undefined) put('auth_mode', input.authMode);
  if (input.headerNames !== undefined) put('header_names_json', JSON.stringify(input.headerNames));
  if (input.oauthConfig !== undefined) {
    const { config, clientSecretEnc } = encodeOAuthConfigInput(input.oauthConfig, row.oauth_client_secret_enc);
    put('oauth_config_json', JSON.stringify(config));
    // 只有明确提交 clientSecret 才改密钥；否则保留已有加密值，避免"改了 scope 把密钥清空"。
    if (Object.prototype.hasOwnProperty.call(input.oauthConfig, 'clientSecret')) {
      put('oauth_client_secret_enc', clientSecretEnc);
    }
  }
  if (input.enabled !== undefined) put('enabled', input.enabled ? 1 : 0);
  if (!sets.length) return listMcpProviders().find((x) => x.id === id);
  put('updated_at', Date.now());
  vals.push(id);
  db.prepare(`UPDATE mcp_connector_provider SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return listMcpProviders().find((x) => x.id === id);
}

export function deleteMcpProvider(id: string): void {
  const used = db.prepare('SELECT 1 FROM mcp_connector WHERE provider_id = ? LIMIT 1').get(id);
  if (used) throw new Error('该 Provider 仍被 MCP 连接引用，不能删除');
  db.prepare('DELETE FROM mcp_connector_provider WHERE id = ?').run(id);
}

function mapConnector(r: any) {
  return {
    ...r,
    shared_headers: parseJson(r.shared_headers_json, {}),
    tool_policy: parseJson(r.tool_policy_json, {}),
    has_shared_secret: !!r.shared_secret_enc,
    has_oauth_token: !!r.oauth_token_enc,
    oauth_status: r.oauth_status || 'not_authorized',
    oauth_expires_at: r.oauth_expires_at ?? null,
    oauth_scopes: parseJson(r.oauth_scopes, []),
    oauth_error: r.oauth_error ?? null,
    is_public: !!r.is_public,
    enabled: !!r.enabled,
    shared_secret_enc: undefined,
    shared_headers_json: undefined,
    oauth_token_enc: undefined,
    tool_policy_json: undefined,
  };
}

export function listMcpConnectors(userId: string, opts: { all?: boolean } = {}): any[] {
  if (opts.all) {
    return db.prepare(
      `SELECT c.*, p.name AS provider_name
         FROM mcp_connector c LEFT JOIN mcp_connector_provider p ON p.id = c.provider_id
        ORDER BY c.created_at DESC`,
    ).all().map(mapConnector);
  }
  return db.prepare(
    `SELECT c.*, p.name AS provider_name
       FROM mcp_connector c LEFT JOIN mcp_connector_provider p ON p.id = c.provider_id
      WHERE c.enabled = 1
        AND (c.owner_user_id = ? OR c.is_public = 1 OR ${aclExistsSql('mcp', 'c.id')})
      ORDER BY c.created_at DESC`,
  ).all(userId, userId, userId, userId).map(mapConnector);
}

export function createMcpConnector(userId: string, input: McpConnectorInput): any {
  const provider = db.prepare('SELECT * FROM mcp_connector_provider WHERE id = ?').get(input.providerId) as any;
  if (!provider) throw new Error('MCP Provider 不存在');
  const name = String(input.name || '').trim();
  if (!name) throw new Error('连接名称不能为空');
  const url = String(input.url || provider.url || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('MCP 地址必须以 http:// 或 https:// 开头');
  const mode = input.credentialMode === 'none' || input.credentialMode === 'centralized'
    ? input.credentialMode : 'independent';
  const shared = input.sharedHeaders || (input.sharedSecret ? { Authorization: `Bearer ${input.sharedSecret}` } : {});
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO mcp_connector
      (id, provider_id, owner_user_id, name, description, url, credential_mode,
       shared_secret_enc, shared_headers_json, oauth_token_enc, tool_policy_json,
       is_public, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, input.providerId, userId, name, input.description || null, url, mode,
    Object.keys(shared).length ? encrypt(JSON.stringify(shared)) : null,
    JSON.stringify({}),
    input.oauthToken ? encrypt(JSON.stringify(input.oauthToken)) : null,
    JSON.stringify(input.toolPolicy || {}),
    input.isPublic ? 1 : 0,
    input.enabled === false ? 0 : 1,
    now, now,
  );
  return listMcpConnectors(userId, { all: true }).find((x) => x.id === id);
}

export function updateMcpConnector(id: string, input: Partial<McpConnectorInput>): any {
  const row = db.prepare('SELECT * FROM mcp_connector WHERE id = ?').get(id) as any;
  if (!row) throw new Error('MCP 连接不存在');
  const sets: string[] = [];
  const vals: unknown[] = [];
  const put = (col: string, value: unknown) => { sets.push(`${col} = ?`); vals.push(value); };
  if (input.name !== undefined) put('name', String(input.name).trim());
  if (input.description !== undefined) put('description', input.description || null);
  if (input.url !== undefined) {
    if (!/^https?:\/\//i.test(String(input.url))) throw new Error('MCP 地址必须以 http:// 或 https:// 开头');
    put('url', String(input.url).trim());
  }
  if (input.credentialMode !== undefined) put('credential_mode', input.credentialMode);
  if (input.sharedHeaders !== undefined || input.sharedSecret !== undefined) {
    const shared = input.sharedHeaders || (input.sharedSecret ? { Authorization: `Bearer ${input.sharedSecret}` } : {});
    put('shared_secret_enc', Object.keys(shared).length ? encrypt(JSON.stringify(shared)) : null);
  }
  if (input.oauthToken !== undefined) put('oauth_token_enc', input.oauthToken ? encrypt(JSON.stringify(input.oauthToken)) : null);
  if (input.toolPolicy !== undefined) put('tool_policy_json', JSON.stringify(input.toolPolicy));
  if (input.isPublic !== undefined) put('is_public', input.isPublic ? 1 : 0);
  if (input.enabled !== undefined) put('enabled', input.enabled ? 1 : 0);
  if (!sets.length) return mapConnector(row);
  put('updated_at', Date.now());
  vals.push(id);
  db.prepare(`UPDATE mcp_connector SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return listMcpConnectors(row.owner_user_id || '', { all: true }).find((x) => x.id === id);
}

export function deleteMcpConnector(id: string): void {
  db.prepare('DELETE FROM mcp_connector_tool WHERE connector_id = ?').run(id);
  db.prepare('DELETE FROM resource_acl WHERE resource_type = ? AND resource_id = ?').run('mcp', id);
  db.prepare('DELETE FROM mcp_connector WHERE id = ?').run(id);
}

async function authHeaders(connector: any): Promise<Record<string, string>> {
  const provider = db.prepare('SELECT * FROM mcp_connector_provider WHERE id = ?').get(connector.provider_id) as any;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  // ★ 唯一出口：OAuth 模式（或已有 OAuth 令牌）一律经 resolveMcpOAuthAccessToken，
  //   由它负责过期刷新、撤销判定与可行动错误。旧实现"解密失败就按无认证继续"会让
  //   过期/撤销的连接继续用匿名身份打上游，排障时只看到 401，属于典型的静默失效。
  if (provider?.auth_mode === 'oauth' || connector.oauth_token_enc) {
    headers.Authorization = `Bearer ${await resolveMcpOAuthAccessToken(connector)}`;
  }
  if (connector.credential_mode === 'centralized' && connector.shared_secret_enc) {
    try {
      Object.assign(headers, toHeaders(decrypt(connector.shared_secret_enc)));
    } catch { /* 同上 */ }
  }
  for (const [k, v] of Object.entries(toHeaders(connector.shared_headers_json))) {
    if (!headers[k]) headers[k] = v;
  }
  if (!headers.Authorization && provider?.auth_mode === 'none') delete headers.Authorization;
  return headers;
}

async function parseMcpResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${text.slice(0, 300)}`);
  if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const raw = trimmed.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.jsonrpc === '2.0' && ('result' in parsed || 'error' in parsed)) return parsed;
      } catch { /* 继续下一条 */ }
    }
    throw new Error('MCP SSE 响应中没有 JSON-RPC 结果');
  }
  const json = JSON.parse(text);
  if (json?.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json;
}

async function mcpRpc(
  url: string,
  headers: Record<string, string>,
  method: string,
  params: Record<string, unknown>,
  id: string | number = randomUUID(),
  sessionId?: string,
): Promise<any> {
  const h = { ...headers, ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}) };
  const res = await fetch(url, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const parsed = await parseMcpResponse(res);
  return { parsed, sessionId: res.headers.get('mcp-session-id') || sessionId };
}

async function initializeConnector(connector: any): Promise<{ headers: Record<string, string>; sessionId?: string }> {
  const headers = await authHeaders(connector);
  const init = await mcpRpc(connector.url, headers, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'yan-zhi-enterprise', version: '0.1.0' },
  }, randomUUID());
  const sessionId = init.sessionId;
  await mcpRpc(connector.url, headers, 'notifications/initialized', {}, randomUUID(), sessionId).catch(() => null);
  return { headers, sessionId };
}

export async function discoverMcpConnectorTools(connectorId: string): Promise<any[]> {
  const connector = db.prepare('SELECT * FROM mcp_connector WHERE id = ?').get(connectorId) as any;
  if (!connector) throw new Error('MCP 连接不存在');
  const { headers, sessionId } = await initializeConnector(connector);
  const { parsed } = await mcpRpc(connector.url, headers, 'tools/list', {}, randomUUID(), sessionId);
  const tools = Array.isArray(parsed?.result?.tools) ? parsed.result.tools : [];
  const now = Date.now();
  const existing = db.prepare('SELECT * FROM mcp_connector_tool WHERE connector_id = ?').all(connectorId) as any[];
  const existingByName = new Map(existing.map((x) => [x.name, x]));
  const keep = new Set<string>();
  const tx = db.transaction(() => {
    for (const tool of tools) {
      const name = String(tool?.name || '').trim();
      if (!name) continue;
      keep.add(name);
      const old = existingByName.get(name);
      if (old) {
        db.prepare(
          'UPDATE mcp_connector_tool SET description = ?, input_schema_json = ?, discovered_at = ? WHERE id = ?',
        ).run(tool.description || null, JSON.stringify(tool.inputSchema || {}), now, old.id);
      } else {
        db.prepare(
          `INSERT INTO mcp_connector_tool
            (id, connector_id, name, description, input_schema_json, enabled, cost_cny, discovered_at)
           VALUES (?, ?, ?, ?, ?, 1, 0, ?)`,
        ).run(randomUUID(), connectorId, name, tool.description || null, JSON.stringify(tool.inputSchema || {}), now);
      }
    }
    for (const old of existing) {
      if (!keep.has(old.name)) db.prepare('UPDATE mcp_connector_tool SET enabled = 0 WHERE id = ?').run(old.id);
    }
  });
  tx();
  return listMcpTools(connectorId);
}

export function listMcpTools(connectorId: string): any[] {
  return db.prepare(
    'SELECT * FROM mcp_connector_tool WHERE connector_id = ? ORDER BY enabled DESC, name ASC',
  ).all(connectorId).map((r: any) => ({
    ...r,
    input_schema: parseJson(r.input_schema_json, {}),
    enabled: !!r.enabled,
    cost_cny: Number(r.cost_cny || 0),
  }));
}

export function updateMcpTool(connectorId: string, toolName: string, input: { enabled?: boolean; costCny?: number }): any {
  const row = db.prepare('SELECT * FROM mcp_connector_tool WHERE connector_id = ? AND name = ?').get(connectorId, toolName) as any;
  if (!row) throw new Error('MCP 工具不存在');
  if (input.enabled !== undefined) db.prepare('UPDATE mcp_connector_tool SET enabled = ? WHERE id = ?').run(input.enabled ? 1 : 0, row.id);
  if (input.costCny !== undefined) {
    const cost = Number(input.costCny);
    if (!Number.isFinite(cost) || cost < 0) throw new Error('工具费用必须为非负数字');
    db.prepare('UPDATE mcp_connector_tool SET cost_cny = ? WHERE id = ?').run(cost, row.id);
  }
  return listMcpTools(connectorId).find((x) => x.name === toolName);
}

export function canUseMcpConnector(connectorId: string, userId: string): boolean {
  return !!db.prepare(
    `SELECT 1 FROM mcp_connector WHERE id = ? AND enabled = 1
      AND (owner_user_id = ? OR is_public = 1 OR ${aclExistsSql('mcp', 'mcp_connector.id')})`,
  ).get(connectorId, userId, userId, userId, userId);
}

export async function callMcpToolDirect(input: {
  connectorId: string;
  toolName: string;
  args: Record<string, unknown>;
  userId: string;
  taskId?: string;
}): Promise<any> {
  const connector = db.prepare('SELECT * FROM mcp_connector WHERE id = ?').get(input.connectorId) as any;
  if (!connector) throw new Error('MCP 连接不存在');
  if (!canUseMcpConnector(input.connectorId, input.userId)) throw new Error('无权使用该 MCP 连接');
  const tool = db.prepare(
    'SELECT * FROM mcp_connector_tool WHERE connector_id = ? AND name = ? AND enabled = 1',
  ).get(input.connectorId, input.toolName) as any;
  if (!tool) throw new Error('MCP 工具不存在或已停用');
  const started = Date.now();
  try {
    const { headers, sessionId } = await initializeConnector(connector);
    const { parsed } = await mcpRpc(
      connector.url,
      headers,
      'tools/call',
      { name: input.toolName, arguments: input.args || {} },
      randomUUID(),
      sessionId,
    );
    const duration = Date.now() - started;
    const cost = Number(tool.cost_cny || 0);
    db.prepare(
      `INSERT INTO mcp_call_log
        (id, connector_id, tool_name, user_id, task_id, success, error_code, cost_cny, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, 1, NULL, ?, ?, ?)`,
    ).run(randomUUID(), input.connectorId, input.toolName, input.userId, input.taskId || null, cost, duration, Date.now());
    try {
      recordQuotaUsage(input.userId, cost, { type: 'mcp_tool', id: tool.id, note: input.toolName });
    } catch { /* 旁路 */ }
    return { result: parsed?.result ?? parsed, costCny: cost, durationMs: duration };
  } catch (e: any) {
    db.prepare(
      `INSERT INTO mcp_call_log
        (id, connector_id, tool_name, user_id, task_id, success, error_code, cost_cny, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?)`,
    ).run(
      randomUUID(), input.connectorId, input.toolName, input.userId, input.taskId || null,
      scrubBearerTokens(String(e?.message || e)).slice(0, 160), Date.now() - started, Date.now(),
    );
    throw e;
  }
}

export function listMcpCallLogs(opts: { connectorId?: string; userId?: string; limit?: number } = {}): any[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.connectorId) { where.push('connector_id = ?'); args.push(opts.connectorId); }
  if (opts.userId) { where.push('user_id = ?'); args.push(opts.userId); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db.prepare(
    `SELECT * FROM mcp_call_log ${clause} ORDER BY created_at DESC LIMIT ?`,
  ).all(...args, Math.max(1, Math.min(Number(opts.limit) || 100, 500)));
}
