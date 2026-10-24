import { v4 as uuid } from 'uuid';
import { basename } from 'node:path';
import { db } from '../db.js';
import { createTask, subscribe } from '../llm-task-manager.js';
import { createLogger } from './logger.js';
import { imProviders } from './im/index.js';
import {
  IM_PLATFORMS,
  type ImChatSummary,
  type ImConnectorStatus,
  type ImContactSearchResult,
  type ImFeishuUserToken,
  type ImPlatform,
  type ImRecipientKind,
  type ImSendInput,
  type ImSearchStrategy,
} from './im/types.js';
import {
  FEISHU_USER_SCOPES,
  FEISHU_USER_TOKEN_KEY,
  buildFeishuAuthorizeUrl,
  completeFeishuOAuth,
  readFeishuUserToken,
  writeFeishuUserToken,
} from './im/providers/feishu-client.js';
import {
  ImMessagingError,
  extractMessageId,
  parseRecipientKind,
  resolveContent,
  validateRecipient,
} from './im/validate.js';

// 各平台出站实现已拆到 ./im/providers/，这里保留原导出名供现有调用方与测试使用
export { sendWechatPersonal } from './im/providers/wechat-personal.js';

const logger = createLogger('im');

/** 钉钉 Stream 回调订阅 topic（机器人收消息） */
export const DINGTALK_ROBOT_TOPIC = '/v1.0/im/bot/messages/get';

function now() {
  return Date.now();
}

function rowToConnector(r: any) {
  const config = parseConnectorConfig(r.config_json);
  // 用户态凭据只留在服务端：对外只回授权状态，不回 token
  const userToken = readFeishuUserToken(config);
  delete config[FEISHU_USER_TOKEN_KEY];
  return {
    id: r.id,
    provider: r.provider,
    name: r.name,
    config,
    enabled: !!r.enabled,
    ...(r.provider === 'feishu'
      ? { feishuUserAuth: { linked: !!userToken, name: userToken?.name } }
      : {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listImConnectors(userId: string) {
  const rows = db.prepare(
    'SELECT * FROM im_connector WHERE user_id = ? ORDER BY created_at DESC',
  ).all(userId);
  return (rows as any[]).map(rowToConnector);
}

export function createImConnector(
  userId: string,
  input: { provider: string; name: string; config?: Record<string, unknown>; enabled?: boolean },
) {
  if (!input.provider || !IM_PLATFORMS.includes(input.provider as ImPlatform)) {
    throw new Error('provider 必须为 wechat / feishu / wechat-personal / dingtalk');
  }
  if (!input.name) throw new Error('连接器名称为必填项');
  const id = uuid();
  const ts = now();
  // 个人微信（OpenClaw 桥接）：生成桥接令牌，插件侧配置与回调路由共用同一凭据
  const config: Record<string, unknown> = { ...(input.config || {}) };
  if (input.provider === 'wechat-personal' && !config.bridgeToken) {
    config.bridgeToken = uuid();
  }
  db.prepare(
    `INSERT INTO im_connector (id, user_id, provider, name, config_json, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    input.provider,
    input.name,
    JSON.stringify(config),
    input.enabled === false ? 0 : 1,
    ts,
    ts,
  );
  return rowToConnector(db.prepare('SELECT * FROM im_connector WHERE id = ?').get(id));
}

export function updateImConnector(
  userId: string,
  connectorId: string,
  input: { name?: string; config?: Record<string, unknown>; enabled?: boolean },
) {
  const existing = db.prepare('SELECT * FROM im_connector WHERE id = ? AND user_id = ?').get(connectorId, userId) as any;
  if (!existing) throw new Error('连接器不存在');
  const sets: string[] = [];
  const vals: any[] = [];
  if (input.name !== undefined) {
    sets.push('name = ?');
    vals.push(input.name);
  }
  if (input.config !== undefined) {
    // 个人微信：编辑时表单只回传 botName 等字段，绝不能把桥接令牌整体冲掉
    // （否则桥接插件持有的 token 与路由校验脱钩，收消息静默 401）
    const cfgOut: Record<string, unknown> = { ...(input.config as Record<string, unknown>) };
    if (existing.provider === 'wechat-personal') {
      const existingToken = (() => {
        try {
          return JSON.parse(existing.config_json || '{}')?.bridgeToken;
        } catch {
          return undefined;
        }
      })();
      if (!cfgOut.bridgeToken && existingToken) cfgOut.bridgeToken = existingToken;
      else if (!cfgOut.bridgeToken) cfgOut.bridgeToken = uuid();
    }
    // 飞书：用户态 token 是服务端专属字段 —— 客户端传什么都不认，只保留库里已有值
    if (existing.provider === 'feishu') {
      delete cfgOut[FEISHU_USER_TOKEN_KEY];
      const existingCfg = parseConnectorConfig(existing.config_json);
      if (existingCfg[FEISHU_USER_TOKEN_KEY]) {
        cfgOut[FEISHU_USER_TOKEN_KEY] = existingCfg[FEISHU_USER_TOKEN_KEY];
      }
    }
    sets.push('config_json = ?');
    vals.push(JSON.stringify(cfgOut));
  }
  if (input.enabled !== undefined) {
    sets.push('enabled = ?');
    vals.push(input.enabled ? 1 : 0);
  }
  if (sets.length === 0) return rowToConnector(existing);
  sets.push('updated_at = ?');
  vals.push(now(), connectorId);
  db.prepare(`UPDATE im_connector SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return rowToConnector(db.prepare('SELECT * FROM im_connector WHERE id = ?').get(connectorId));
}

export function deleteImConnector(userId: string, connectorId: string) {
  const existing = db.prepare('SELECT id FROM im_connector WHERE id = ? AND user_id = ?').get(connectorId, userId);
  if (!existing) throw new Error('连接器不存在');
  db.prepare('DELETE FROM im_connector WHERE id = ?').run(connectorId);
  return true;
}

export interface ImSendMeta {
  recipientKind?: ImRecipientKind;
}

interface ImOutboundAuditEntry {
  userId: string;
  connectorId: string;
  provider: string;
  recipientKind: ImRecipientKind | null;
  recipient: string;
  contentKind: 'text' | 'file';
  fileName: string | null;
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
  messageId?: string | null;
}

/** 审计写入失败只告警，不影响发送结果。 */
function recordImOutbound(entry: ImOutboundAuditEntry) {
  try {
    db.prepare(
      `INSERT INTO im_outbound_audit
         (id, user_id, connector_id, provider, recipient_kind, recipient, content_kind, file_name,
          ok, error_code, error_message, message_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      uuid(),
      entry.userId,
      entry.connectorId,
      entry.provider,
      entry.recipientKind,
      entry.recipient,
      entry.contentKind,
      entry.fileName,
      entry.ok ? 1 : 0,
      entry.errorCode || null,
      entry.errorMessage || null,
      entry.messageId || null,
      now(),
    );
  } catch (error) {
    logger.warn(`IM 出站审计写入失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function sendImMessage(
  userId: string,
  connectorId: string,
  input: ImSendInput,
  meta: ImSendMeta = {},
) {
  const connector = db.prepare('SELECT * FROM im_connector WHERE id = ? AND user_id = ?').get(connectorId, userId) as any;
  if (!connector) throw new Error('连接器不存在');
  if (!connector.enabled) throw new Error('连接器已禁用');
  if (!input.to) throw new Error('to 为必填项');
  if (!input.content && !input.file) throw new Error('content 或 file 至少提供一个');

  const config = connector.config_json ? JSON.parse(connector.config_json) : {};
  const provider = imProviders.require(connector.provider);
  const audit: ImOutboundAuditEntry = {
    userId,
    connectorId: connector.id,
    provider: connector.provider,
    recipientKind: meta.recipientKind || null,
    recipient: input.to,
    contentKind: input.file ? 'file' : 'text',
    fileName: input.file?.name || (input.file?.path ? basename(input.file.path) : null),
    ok: false,
  };
  try {
    const result = await provider.send(config, input);
    recordImOutbound({ ...audit, ok: true, messageId: extractMessageId(result) });
    return result;
  } catch (error) {
    recordImOutbound({
      ...audit,
      errorCode: error instanceof ImMessagingError ? error.code : 'send_failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function testImConnector(userId: string, connectorId: string) {
  const connector = db.prepare('SELECT * FROM im_connector WHERE id = ? AND user_id = ?').get(connectorId, userId) as any;
  if (!connector) throw new Error('连接器不存在');
  const config = connector.config_json ? JSON.parse(connector.config_json) : {};
  return imProviders.require(connector.provider).test(config);
}

function parseConnectorConfig(raw: any): Record<string, any> {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** 各连接器当前是否可用。探测失败返回 ready=false，不抛异常。 */
export async function getImStatus(userId: string, platform?: string): Promise<ImConnectorStatus[]> {
  const target = (platform || '').trim();
  if (target && !IM_PLATFORMS.includes(target as ImPlatform)) {
    throw new ImMessagingError('platform_unavailable', `不支持的 IM 平台: ${target}`);
  }
  const rows = (target
    ? db.prepare('SELECT * FROM im_connector WHERE user_id = ? AND provider = ? ORDER BY created_at ASC').all(userId, target)
    : db.prepare('SELECT * FROM im_connector WHERE user_id = ? ORDER BY created_at ASC').all(userId)) as any[];

  return Promise.all(
    rows.map(async (row) => {
      const provider = imProviders.require(row.provider);
      const userToken =
        row.provider === 'feishu' ? readFeishuUserToken(parseConnectorConfig(row.config_json)) : null;
      const base = {
        connectorId: row.id,
        name: row.name,
        platform: row.provider as ImPlatform,
        enabled: !!row.enabled,
        sendingMode: provider.capabilities.sendingMode,
        ...(row.provider === 'feishu'
          ? { userAuth: { linked: !!userToken, name: userToken?.name } }
          : {}),
      };
      if (!row.enabled) return { ...base, ready: false, error: '连接器已禁用' };
      try {
        const tested = await provider.test(parseConnectorConfig(row.config_json));
        return { ...base, ready: true, ...(tested.note ? { note: tested.note } : {}) };
      } catch (error) {
        return {
          ...base,
          ready: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}

const IM_PLATFORM_LABEL: Record<ImPlatform, string> = {
  feishu: '飞书',
  wechat: '企业微信',
  'wechat-personal': '个人微信',
  dingtalk: '钉钉',
};

function requireImConnector(userId: string, platform?: string, connectorId?: string) {
  const targetId = (connectorId || '').trim();
  const targetPlatform = (platform || '').trim();
  if (targetId) {
    const row = db.prepare('SELECT * FROM im_connector WHERE id = ? AND user_id = ?').get(targetId, userId) as any;
    if (!row) throw new ImMessagingError('validation_failed', '连接器不存在');
    if (!row.enabled) {
      throw new ImMessagingError('not_linked', `连接器「${row.name}」已禁用，请先在连接页启用`);
    }
    if (targetPlatform && row.provider !== targetPlatform) {
      throw new ImMessagingError(
        'validation_failed',
        `连接器「${row.name}」属于 ${row.provider}，与 platform=${targetPlatform} 不一致`,
      );
    }
    return row;
  }
  if (!targetPlatform) {
    throw new ImMessagingError('validation_failed', '需要指定 platform 或 connectorId');
  }
  if (!IM_PLATFORMS.includes(targetPlatform as ImPlatform)) {
    throw new ImMessagingError('platform_unavailable', `不支持的 IM 平台: ${targetPlatform}`);
  }
  const rows = db
    .prepare(
      'SELECT * FROM im_connector WHERE user_id = ? AND provider = ? AND enabled = 1 ORDER BY created_at ASC',
    )
    .all(userId, targetPlatform) as any[];
  if (rows.length === 0) {
    const label = IM_PLATFORM_LABEL[targetPlatform as ImPlatform] || targetPlatform;
    throw new ImMessagingError(
      'platform_unavailable',
      `没有可用的${label}连接器，请先在连接页添加并启用`,
    );
  }
  if (rows.length > 1) {
    const candidates = rows.map((r) => `${r.name}(${r.id})`).join('、');
    throw new ImMessagingError(
      'ambiguous_connector',
      `存在多个 ${targetPlatform} 连接器：${candidates}，请用 connectorId 指定`,
    );
  }
  return rows[0];
}

export interface ImUnifiedSendInput {
  platform?: string;
  connectorId?: string;
  recipientKind?: string;
  recipientId: string;
  text?: string;
  filePath?: string;
}

/** 平台无关发送：按 platform 自动选连接器，收件人与内容按该平台能力校验。 */
export async function sendImMessageUnified(userId: string, input: ImUnifiedSendInput) {
  const connector = requireImConnector(userId, input.platform, input.connectorId);
  const provider = imProviders.require(connector.provider);
  const kind = parseRecipientKind(input.recipientKind);
  const recipientId = validateRecipient(provider.capabilities, kind, input.recipientId);
  const content = resolveContent(provider.capabilities, input);
  const result = await sendImMessage(
    userId,
    connector.id,
    {
      to: recipientId,
      content: content.kind === 'text' ? content.text : undefined,
      file:
        content.kind === 'file' && content.filePath
          ? { path: content.filePath, name: basename(content.filePath) }
          : undefined,
      receiveIdType:
        connector.provider === 'feishu' ? (kind === 'group' ? 'chat_id' : 'open_id') : undefined,
    },
    { recipientKind: kind },
  );
  return {
    ok: true,
    platform: connector.provider as ImPlatform,
    connectorId: connector.id,
    connectorName: connector.name,
    recipientKind: kind,
    recipientId,
    contentKind: content.kind,
    messageId: extractMessageId(result),
    result,
  };
}

function persistFeishuUserToken(connectorId: string, token: ImFeishuUserToken | null) {
  const row = db.prepare('SELECT config_json FROM im_connector WHERE id = ?').get(connectorId) as
    | { config_json: string | null }
    | undefined;
  if (!row) return;
  const next = writeFeishuUserToken(parseConnectorConfig(row.config_json), token);
  db.prepare('UPDATE im_connector SET config_json = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(next),
    now(),
    connectorId,
  );
}

function userTokenPersister(connectorId: string, provider: string) {
  return provider === 'feishu'
    ? (token: ImFeishuUserToken) => persistFeishuUserToken(connectorId, token)
    : undefined;
}

function parseSearchStrategy(raw?: string): 'auto' | ImSearchStrategy {
  const value = (raw || '').trim().toLowerCase();
  if (!value || value === 'auto') return 'auto';
  if (value === 'oauth' || value === 'contacts') return value;
  throw new ImMessagingError('validation_failed', 'strategy 只能是 auto / oauth / contacts');
}

export interface ImContactSearchInput {
  platform?: string;
  connectorId?: string;
  query: string;
  strategy?: string;
  maxResults?: number;
}

/** 按姓名找联系人：feishu 支持 OAuth 搜索与通讯录遍历，auto 优先用户态。 */
export async function searchImContacts(userId: string, input: ImContactSearchInput) {
  const connector = requireImConnector(userId, input.platform, input.connectorId);
  const provider = imProviders.require(connector.provider);
  if (!provider.capabilities.supportsContactSearch || !provider.searchUsers) {
    const label = IM_PLATFORM_LABEL[connector.provider as ImPlatform] || connector.provider;
    throw new ImMessagingError('unsupported_content', `${label} 暂不支持联系人搜索`);
  }
  const result = await provider.searchUsers(parseConnectorConfig(connector.config_json), input.query, {
    strategy: parseSearchStrategy(input.strategy),
    maxResults: input.maxResults,
    onUserToken: userTokenPersister(connector.id, connector.provider),
  });
  return {
    ...result,
    connectorId: connector.id,
    connectorName: connector.name,
    platform: connector.provider as ImPlatform,
  };
}

export interface ImChatListInput {
  platform?: string;
  connectorId?: string;
  types?: string;
}

export async function listImChats(
  userId: string,
  input: ImChatListInput = {},
): Promise<ImChatSummary[]> {
  const connector = requireImConnector(userId, input.platform, input.connectorId);
  const provider = imProviders.require(connector.provider);
  if (!provider.capabilities.supportsChatList || !provider.listChats) {
    const label = IM_PLATFORM_LABEL[connector.provider as ImPlatform] || connector.provider;
    throw new ImMessagingError('unsupported_content', `${label} 暂不支持列出会话`);
  }
  return provider.listChats(parseConnectorConfig(connector.config_json), input.types, {
    onUserToken: userTokenPersister(connector.id, connector.provider),
  });
}

// ───────────────────────── 飞书用户态 OAuth ─────────────────────────

const OAUTH_PENDING_TTL_MS = 10 * 60_000;
const pendingFeishuOAuth = new Map<
  string,
  { userId: string; connectorId: string; redirectUri: string; expiresAt: number }
>();

function requireOwnedConnector(userId: string, connectorId: string) {
  const row = db
    .prepare('SELECT * FROM im_connector WHERE id = ? AND user_id = ?')
    .get(connectorId, userId) as any;
  if (!row) throw new ImMessagingError('validation_failed', '连接器不存在');
  if (row.provider !== 'feishu') {
    throw new ImMessagingError('validation_failed', '只有飞书连接器支持用户授权');
  }
  return row;
}

/** 发起授权：返回浏览器可打开的 URL，用户在飞书完成授权后回调换 token。 */
export function startFeishuOAuth(userId: string, connectorId: string, redirectUri: string) {
  const row = requireOwnedConnector(userId, connectorId);
  const config = parseConnectorConfig(row.config_json);
  if (!config.appId || !config.appSecret) {
    throw new ImMessagingError('not_linked', '飞书连接器缺少 appId/appSecret');
  }
  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    throw new ImMessagingError('validation_failed', 'redirectUri 必须是合法 URL');
  }
  if (!/^https?:$/.test(redirect.protocol) || redirect.pathname !== '/api/im/feishu/oauth/callback') {
    throw new ImMessagingError(
      'validation_failed',
      'redirectUri 必须指向本服务的 /api/im/feishu/oauth/callback',
    );
  }
  const nowTs = Date.now();
  for (const [key, value] of pendingFeishuOAuth) {
    if (value.expiresAt < nowTs) pendingFeishuOAuth.delete(key);
  }
  const state = uuid();
  pendingFeishuOAuth.set(state, {
    userId,
    connectorId,
    redirectUri,
    expiresAt: nowTs + OAUTH_PENDING_TTL_MS,
  });
  return {
    url: buildFeishuAuthorizeUrl({ appId: String(config.appId), redirectUri, state }),
    state,
    scope: FEISHU_USER_SCOPES,
    redirectUri,
  };
}

/** OAuth 回调：校验 state 归属与有效期，换取并加密保存用户态凭据。 */
export async function completeFeishuOAuthCallback(state: string, code: string) {
  const pending = pendingFeishuOAuth.get(state);
  if (!pending || pending.expiresAt < Date.now()) {
    pendingFeishuOAuth.delete(state);
    throw new ImMessagingError('oauth_failed', '授权已过期或 state 无效，请重新发起授权');
  }
  pendingFeishuOAuth.delete(state);
  const row = db
    .prepare('SELECT * FROM im_connector WHERE id = ? AND user_id = ?')
    .get(pending.connectorId, pending.userId) as any;
  if (!row) throw new ImMessagingError('validation_failed', '连接器不存在');
  const token = await completeFeishuOAuth(
    parseConnectorConfig(row.config_json),
    code,
    pending.redirectUri,
  );
  persistFeishuUserToken(row.id, token);
  return {
    connectorId: row.id,
    name: token.name,
    openId: token.openId,
    scope: token.scope,
    expiresAt: token.expiresAt,
  };
}

export function getFeishuOAuthStatus(userId: string, connectorId: string) {
  const row = requireOwnedConnector(userId, connectorId);
  const token = readFeishuUserToken(parseConnectorConfig(row.config_json));
  return {
    linked: !!token,
    name: token?.name,
    openId: token?.openId,
    scope: token?.scope,
    expiresAt: token?.expiresAt,
    refreshable: !!token?.refreshToken,
  };
}

export function disconnectFeishuOAuth(userId: string, connectorId: string) {
  const row = requireOwnedConnector(userId, connectorId);
  persistFeishuUserToken(row.id, null);
  return { linked: false };
}

export function listImEvents(
  userId: string,
  opts: { connectorId?: string; since?: number; limit?: number } = {},
) {
  const limit = Math.min(opts.limit || 200, 500);
  const since = opts.since || 0;
  let sql: string;
  let params: any[];
  if (opts.connectorId) {
    sql = `SELECT e.* FROM im_inbound_event e
           JOIN im_connector c ON c.id = e.connector_id
           WHERE c.user_id = ? AND e.connector_id = ? AND e.created_at >= ?
           ORDER BY e.created_at ASC LIMIT ?`;
    params = [userId, opts.connectorId, since, limit];
  } else {
    sql = `SELECT e.* FROM im_inbound_event e
           JOIN im_connector c ON c.id = e.connector_id
           WHERE c.user_id = ? AND e.created_at >= ?
           ORDER BY e.created_at ASC LIMIT ?`;
    params = [userId, since, limit];
  }
  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map((r) => ({
    id: r.id,
    connectorId: r.connector_id,
    provider: r.provider,
    externalId: r.external_id,
    fromUser: r.from_user,
    toUser: r.to_user,
    content: r.content,
    createdAt: r.created_at,
  }));
}

// ============================================================
// 飞书入站闭环：收消息 → 建/复会话 → 跑任务 → 回结果
// ============================================================

interface ParsedFeishuInbound {
  messageId: string;
  text: string;
  openId: string;
  chatId: string;
  chatType: string;
}

/** 解析飞书 v2 事件体，提取消息 ID / 文本 / 发送者 open_id / 会话 chat_id */
export function parseFeishuInbound(body: any): ParsedFeishuInbound {
  const ev = body?.event || {};
  const sender = ev?.sender?.sender_id || {};
  const message = ev?.message || {};
  const content = message?.content;

  let text = '';
  if (content !== undefined && content !== null) {
    if (typeof content === 'string') {
      try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.text === 'string') text = parsed.text;
          else if (Array.isArray(parsed.content)) text = parsed.content.map((c: any) => c?.text || '').join('\n');
          else if (typeof parsed.title === 'string') text = parsed.title;
        } else {
          text = content;
        }
      } catch {
        text = content;
      }
    } else if (typeof content === 'object') {
      if (typeof content.text === 'string') text = content.text;
    }
  }

  return {
    messageId: String(body?.header?.event_id || message?.message_id || body?.event_id || ''),
    text: text.trim(),
    openId: String(sender?.open_id || body?.sender?.sender_id?.open_id || ''),
    chatId: String(message?.chat_id || ''),
    chatType: String(message?.chat_type || 'p2p'),
  };
}

/** 取用户默认模型（is_default=1 优先，否则最早启用的模型），返回 platformId + modelId */
function getDefaultModel(userId: string): { platformId: string; modelId: string } | null {
  let row = db.prepare(
    'SELECT id, platform_id FROM model WHERE user_id = ? AND enabled = 1 AND is_default = 1 ORDER BY created_at ASC LIMIT 1',
  ).get(userId) as any;
  if (!row) {
    row = db.prepare(
      'SELECT id, platform_id FROM model WHERE user_id = ? AND enabled = 1 ORDER BY created_at ASC LIMIT 1',
    ).get(userId) as any;
  }
  if (!row) return null;
  return { platformId: row.platform_id, modelId: row.id };
}

/** 查询/创建 IM 联系人 → 会话映射：同一 connector + 同一外部用户复用同一 conversation */
function getOrCreateImConversation(connectorId: string, externalUser: string, userId: string, title: string): string {
  const existing = db.prepare(
    'SELECT conversation_id FROM im_conversation_map WHERE connector_id = ? AND external_user = ?',
  ).get(connectorId, externalUser) as any;
  if (existing) return existing.conversation_id;

  const convId = uuid();
  const ts = now();
  db.prepare(
    `INSERT INTO conversation (id, user_id, title, agent_id, platform_id, model_id, space_id, mcp_servers_json, skill_ids_json, system_prompt, pinned, created_at, updated_at)
     VALUES (?, ?, ?, 'a_default_assistant', NULL, NULL, NULL, '[]', '[]', NULL, 0, ?, ?)`,
  ).run(convId, userId, title, ts, ts);
  db.prepare(
    'INSERT INTO im_conversation_map (connector_id, external_user, conversation_id, created_at) VALUES (?, ?, ?, ?)',
  ).run(connectorId, externalUser, convId, ts);
  return convId;
}

/** 读取会话最后一条非空助手回复（排除占位/超长循环兜底文案） */
function readLastAssistantReply(conversationId: string): string {
  const row = db.prepare(
    `SELECT content FROM message
     WHERE conversation_id = ? AND role = 'assistant'
       AND content IS NOT NULL AND content != ''
       AND content NOT LIKE '已达到最大循环数%'
     ORDER BY created_at DESC LIMIT 1`,
  ).get(conversationId) as any;
  return row?.content ? String(row.content) : '';
}

interface ImClosedLoopPayload {
  connectorId: string | undefined;
  userId: string;
  provider: ImPlatform;
  externalId: string;
  text: string;
  fromUser: string;
  toUser: string;
  replyTo: string;
  receiveIdType?: string;
  rawJson: string;
}

/**
 * 闭环与桥接同步通道共用的前置段：去重 → 落库 → 建/复会话 → 建任务。
 * 单一实现收口（判据：同一语义只能有一处实现）——dedupe/落库逻辑在此，
 * runImClosedLoop 与 runWechatPersonalBridge 都从这里起步。
 */
function startImTask(
  p: ImClosedLoopPayload,
): { ok: true; conversationId: string; taskId: string } | { ok: false; reason: string } {
  // 去重：同一消息事件只处理一次（平台可能重投）
  const dup = db.prepare(
    'SELECT id FROM im_inbound_event WHERE connector_id = ? AND provider = ? AND external_id = ?',
  ).get(p.connectorId || null, p.provider, p.externalId);
  if (dup) return { ok: false, reason: 'duplicate' };

  db.prepare(
    `INSERT INTO im_inbound_event
      (id, connector_id, provider, external_id, from_user, to_user, content, file_json, raw_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    uuid(),
    p.connectorId || null,
    p.provider,
    p.externalId,
    p.fromUser,
    p.toUser,
    p.text,
    null,
    p.rawJson,
    now(),
  );

  const model = getDefaultModel(p.userId);
  if (!model) return { ok: false, reason: 'no_default_model' };

  const title = p.text.length > 24 ? p.text.slice(0, 24) + '…' : p.text;
  const conversationId = getOrCreateImConversation(p.connectorId || p.provider, p.fromUser, p.userId, title);

  try {
    const taskId = createTask({
      conversationId,
      userId: p.userId,
      platformId: model.platformId,
      modelId: model.modelId,
      userContent: p.text,
      agentId: 'a_default_assistant',
      origin: 'im',
      offlinePolicy: 'skip',
    });
    return { ok: true, conversationId, taskId };
  } catch (e: any) {
    // 会话被归档/删除（用户手动收起来的 IM 会话）时不应再触发任务，也不该 500 掉整条 IM 链路
    const msg = String(e?.message || '');
    logger.warn(`[im] 跳过任务创建（会话不可用）conv=${conversationId}: ${msg}`);
    return { ok: false, reason: msg.startsWith('CONVERSATION_') ? 'conversation_unavailable' : 'create_task_failed' };
  }
}

/** 桥接同步通道等待 AI 回复的上限（OpenClaw 桥接插件侧同口径超时） */
export const IM_BRIDGE_REPLY_TIMEOUT_MS = 110_000;

/**
 * 个人微信桥接同步通道：OpenClaw 桥接插件把微信消息 POST 进来，
 * 本函数同步等待 AI 任务完成并返回回复文本（由插件经宿主回发到微信）。
 * 复用与 webhook 入站完全相同的去重/落库/会话逻辑。
 */
export async function runWechatPersonalBridge(
  connectorId: string,
  userId: string,
  body: unknown,
): Promise<{ ok: true; reply: string } | { ok: false; error: string; reason?: string }> {
  const parsed = parseWechatPersonalInbound(body);
  if (!parsed.messageId || !parsed.text || !parsed.fromUser) {
    return { ok: false, error: 'empty_or_non_text', reason: 'empty_or_non_text' };
  }
  const payload: ImClosedLoopPayload = {
    connectorId,
    userId,
    provider: 'wechat-personal',
    externalId: parsed.messageId,
    text: parsed.text,
    fromUser: parsed.fromUser,
    toUser: parsed.fromUser,
    replyTo: parsed.fromUser,
    rawJson: JSON.stringify(body || {}),
  };
  const started = startImTask(payload);
  if (!started.ok) {
    return { ok: false, error: started.reason, reason: started.reason };
  }

  // 等 AI 任务结束（completed/error），超时给明确错误而不是挂死插件的 hook
  const reply = await new Promise<{ reply: string } | null>((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, IM_BRIDGE_REPLY_TIMEOUT_MS);
    const unsubscribe = subscribe(started.taskId, 0, (event) => {
      if (event.type === 'task:completed') {
        clearTimeout(timer);
        unsubscribe();
        resolve({ reply: readLastAssistantReply(started.conversationId) || '（助手未返回有效内容）' });
      } else if (event.type === 'task:error') {
        clearTimeout(timer);
        unsubscribe();
        resolve({ reply: `处理失败：${(event as any).error || '未知错误'}` });
      }
    });
  });
  if (!reply) {
    return { ok: false, error: 'reply_timeout', reason: 'reply_timeout' };
  }
  return { ok: true, reply: reply.reply };
}

/** 通用 IM 闭环：去重 → 落库 → 建/复会话 → 跑任务 → 回结果。飞书 / 企业微信共用。 */
function runImClosedLoop(p: ImClosedLoopPayload): { handled: boolean; reason?: string } {
  if (!p.externalId || !p.text || !p.fromUser) {
    return { handled: false, reason: 'empty_or_non_text' };
  }

  const started = startImTask(p);
  if (!started.ok) return { handled: false, reason: started.reason };
  const { conversationId, taskId } = started;

  subscribe(taskId, 0, (event) => {
    if (event.type === 'task:completed') {
      const reply = readLastAssistantReply(conversationId) || '（助手未返回有效内容）';
      void sendImMessage(p.userId, p.connectorId || '', {
        to: p.replyTo,
        content: reply,
        receiveIdType: p.receiveIdType,
      }).catch(() => {});
    } else if (event.type === 'task:error') {
      void sendImMessage(p.userId, p.connectorId || '', {
        to: p.replyTo,
        content: `处理失败：${event.error || '未知错误'}`,
        receiveIdType: p.receiveIdType,
      }).catch(() => {});
    }
  });

  return { handled: true };
}

/**
 * 处理飞书入站消息，驱动「收消息 → 跑任务 → 回结果」闭环。
 * 返回 handled 标记；重复事件 / 空文本 / 无默认模型时跳过。
 */
export function handleImInbound(
  connectorId: string | undefined,
  userId: string,
  provider: string,
  body: unknown,
): { handled: boolean; reason?: string } {
  if (provider !== 'feishu') return { handled: false, reason: 'unsupported_provider' };

  const parsed = parseFeishuInbound(body);
  if (!parsed.messageId || !parsed.text || !parsed.openId) {
    return { handled: false, reason: 'empty_or_non_text' };
  }

  // 回发目标：单聊回 open_id，群聊回 chat_id
  const replyTo = parsed.chatType === 'group' && parsed.chatId ? parsed.chatId : parsed.openId;
  const receiveIdType = parsed.chatType === 'group' && parsed.chatId ? 'chat_id' : 'open_id';

  return runImClosedLoop({
    connectorId,
    userId,
    provider: 'feishu',
    externalId: parsed.messageId,
    text: parsed.text,
    fromUser: parsed.openId,
    toUser: parsed.chatId,
    replyTo,
    receiveIdType,
    rawJson: JSON.stringify(body || {}),
  });
}

/** 企业微信解密后的内层 XML 结构 */
export interface ParsedWechatInbound {
  messageId: string;
  msgType: string;
  text: string;
  fromUser: string;
  toUser: string;
  agentId: string;
}

/** 解析企业微信解密后的消息 XML，提取文本 / 发送者 / 消息 ID */
export function parseWechatInbound(xml: string): ParsedWechatInbound {
  const msgType = xmlTag(xml, 'MsgType');
  const content = msgType === 'text' ? xmlTag(xml, 'Content') : '';
  return {
    messageId: xmlTag(xml, 'MsgId') || xmlTag(xml, 'Event') || '',
    msgType,
    text: content.trim(),
    fromUser: xmlTag(xml, 'FromUserName'),
    toUser: xmlTag(xml, 'ToUserName'),
    agentId: xmlTag(xml, 'AgentID'),
  };
}

/** 处理企业微信入站（解密 + 解析后调用），仅文本消息进入 AI 闭环 */
export function handleWechatInbound(
  connectorId: string | undefined,
  userId: string,
  parsed: ParsedWechatInbound,
): { handled: boolean; reason?: string } {
  if (parsed.msgType !== 'text' || !parsed.text || !parsed.fromUser) {
    return { handled: false, reason: 'non_text_or_empty' };
  }
  return runImClosedLoop({
    connectorId,
    userId,
    provider: 'wechat',
    externalId: parsed.messageId,
    text: parsed.text,
    fromUser: parsed.fromUser,
    toUser: parsed.toUser,
    replyTo: parsed.fromUser,
    rawJson: JSON.stringify(parsed),
  });
}

/** 简易 XML 取值：兼容 CDATA，不引入外部解析依赖 */
function xmlTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`);
  const m = xml.match(re);
  return m ? m[1] : '';
}

// ============================================================
// 个人微信（ClawBot）入站：JSON webhook → 同一闭环
// ============================================================

/**
 * 解析个人微信 ClawBot webhook（JSON）。
 * 契约（适配层需按此字段推送）：{ messageId, text, fromUser }，兼容常见别名。
 */
export function parseWechatPersonalInbound(body: any): { messageId: string; text: string; fromUser: string } {
  const text =
    typeof body?.text === 'string'
      ? body.text
      : typeof body?.content === 'string'
        ? body.content
        : '';
  return {
    messageId: String(body?.messageId || body?.msgId || body?.id || ''),
    text: text.trim(),
    fromUser: String(body?.fromUser || body?.from || body?.sender || body?.openId || ''),
  };
}

/** 处理个人微信 ClawBot 入站，仅文本消息进入 AI 闭环 */
export function handleWechatPersonalInbound(
  connectorId: string | undefined,
  userId: string,
  body: unknown,
): { handled: boolean; reason?: string } {
  const parsed = parseWechatPersonalInbound(body);
  if (!parsed.messageId || !parsed.text || !parsed.fromUser) {
    return { handled: false, reason: 'empty_or_non_text' };
  }
  return runImClosedLoop({
    connectorId,
    userId,
    provider: 'wechat-personal',
    externalId: parsed.messageId,
    text: parsed.text,
    fromUser: parsed.fromUser,
    toUser: parsed.fromUser,
    replyTo: parsed.fromUser,
    rawJson: JSON.stringify(body || {}),
  });
}

// ============================================================
// 钉钉入站（Stream 模式回调数据）：同一闭环
// ============================================================

/** 钉钉机器人回调消息体（Stream data 反序列化后，仅列出用到的字段） */
export interface ParsedDingtalkInbound {
  messageId: string;
  msgtype: string;
  text: string;
  conversationType: string;
  senderStaffId: string;
  senderId: string;
  openConversationId: string;
  conversationId: string;
  conversationTitle: string;
}

/** 解析钉钉机器人消息，提取消息 ID / 文本 / 会话信息 */
export function parseDingtalkInbound(data: any): ParsedDingtalkInbound {
  const text =
    typeof data?.text?.content === 'string' ? data.text.content : '';
  return {
    messageId: String(data?.msgId || ''),
    msgtype: String(data?.msgtype || 'text'),
    text,
    conversationType: String(data?.conversationType || '1'),
    senderStaffId: String(data?.senderStaffId || ''),
    senderId: String(data?.senderId || ''),
    openConversationId: String(data?.openConversationId || ''),
    conversationId: String(data?.conversationId || ''),
    conversationTitle: String(data?.conversationTitle || ''),
  };
}

/**
 * 处理钉钉入站（Stream 模式推送），仅文本消息进入 AI 闭环。
 * 单聊按发送人建会话（fromUser=userid），群聊按群建会话（fromUser=openConversationId）。
 */
export function handleDingtalkInbound(
  connectorId: string | undefined,
  userId: string,
  data: unknown,
): { handled: boolean; reason?: string } {
  const parsed = parseDingtalkInbound(data);
  if (parsed.msgtype !== 'text' || !parsed.messageId || !parsed.text.trim()) {
    return { handled: false, reason: 'non_text_or_empty' };
  }
  const isGroup = parsed.conversationType === '2';
  const sender = parsed.senderStaffId || parsed.senderId;
  if (!sender) return { handled: false, reason: 'empty_or_non_text' };

  // 群聊文本常带 @机器人 前缀，剥掉首个 @提及
  let text = parsed.text.trim();
  if (isGroup) text = text.replace(/^@\S+\s+/, '').trim() || parsed.text.trim();

  // 回发目标：群聊回 openConversationId（sendDingtalk 按 cid 前缀识别走群聊接口），单聊回 userid
  const fromUser = isGroup
    ? (parsed.openConversationId || parsed.conversationId)
    : sender;
  if (!fromUser) return { handled: false, reason: 'empty_or_non_text' };

  return runImClosedLoop({
    connectorId,
    userId,
    provider: 'dingtalk',
    externalId: parsed.messageId,
    text,
    fromUser,
    toUser: isGroup ? fromUser : sender,
    replyTo: fromUser,
    rawJson: JSON.stringify(data || {}),
  });
}
