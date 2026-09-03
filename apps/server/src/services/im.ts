import { v4 as uuid } from 'uuid';
import { readFile } from 'node:fs/promises';
import { db } from '../db.js';
import { createTask, subscribe } from '../llm-task-manager.js';

type ImProvider = 'wechat' | 'feishu' | 'wechat-personal';

interface ImSendInput {
  to: string;
  content?: string;
  file?: {
    name?: string;
    path?: string;
    data?: string;
    mimeType?: string;
  };
  receiveIdType?: string;
}

function now() {
  return Date.now();
}

function rowToConnector(r: any) {
  return {
    id: r.id,
    provider: r.provider,
    name: r.name,
    config: r.config_json ? JSON.parse(r.config_json) : {},
    enabled: !!r.enabled,
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
  if (!input.provider || !['wechat', 'feishu', 'wechat-personal'].includes(input.provider)) {
    throw new Error('provider 必须为 wechat / feishu / wechat-personal');
  }
  if (!input.name) throw new Error('连接器名称为必填项');
  const id = uuid();
  const ts = now();
  db.prepare(
    `INSERT INTO im_connector (id, user_id, provider, name, config_json, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    input.provider,
    input.name,
    JSON.stringify(input.config || {}),
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
    sets.push('config_json = ?');
    vals.push(JSON.stringify(input.config));
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

export async function sendImMessage(userId: string, connectorId: string, input: ImSendInput) {
  const connector = db.prepare('SELECT * FROM im_connector WHERE id = ? AND user_id = ?').get(connectorId, userId) as any;
  if (!connector) throw new Error('连接器不存在');
  if (!connector.enabled) throw new Error('连接器已禁用');
  if (!input.to) throw new Error('to 为必填项');
  if (!input.content && !input.file) throw new Error('content 或 file 至少提供一个');

  const config = connector.config_json ? JSON.parse(connector.config_json) : {};
  if (connector.provider === 'feishu') {
    return sendFeishu(config, input);
  }
  if (connector.provider === 'wechat') {
    return sendWechat(config, input);
  }
  if (connector.provider === 'wechat-personal') {
    return sendWechatPersonal(config, input);
  }
  throw new Error('不支持的 provider');
}

async function sendFeishu(config: any, input: ImSendInput) {
  if (!config.appId || !config.appSecret) {
    throw new Error('飞书连接器缺少 appId/appSecret');
  }
  const token = await getFeishuToken(config.appId, config.appSecret);
  const receiveIdType = input.receiveIdType || 'open_id';
  let fileKey: string | null = null;
  if (input.file) {
    const { name, buffer } = await resolveFile(input.file);
    fileKey = await uploadFeishuFile(token, buffer, name);
  }

  const payload: Record<string, unknown> = {
    receive_id: input.to,
    msg_type: fileKey ? 'file' : 'text',
    content: fileKey
      ? JSON.stringify({ file_key: fileKey })
      : JSON.stringify({ text: input.content || '' }),
  };
  const res = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(receiveIdType)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    },
  );
  const data = await res.json();
  if (!res.ok || data.code !== 0) {
    throw new Error(`飞书发送失败: ${data.msg || data.message || res.status}`);
  }
  return data.data || data;
}

async function sendWechat(config: any, input: ImSendInput) {
  if (!config.corpId || !config.secret || !config.agentId) {
    throw new Error('企业微信连接器缺少 corpId/secret/agentId');
  }
  const token = await getWechatToken(config.corpId, config.secret);
  let mediaId: string | null = null;
  if (input.file) {
    const { name, buffer } = await resolveFile(input.file);
    mediaId = await uploadWechatMedia(token, buffer, name, 'file');
  }

  const payload: Record<string, unknown> = {
    touser: input.to,
    msgtype: mediaId ? 'file' : 'text',
    agentid: Number(config.agentId),
  };
  if (mediaId) {
    payload.file = { media_id: mediaId };
  } else {
    payload.text = { content: input.content || '' };
  }
  const res = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  const data = await res.json();
  if (!res.ok || data.errcode !== 0) {
    throw new Error(`企业微信发送失败: ${data.errmsg || data.message || res.status}`);
  }
  return data;
}

/**
 * 个人微信（ClawBot）发送：依赖外部 CLI（@tencent-weixin/openclaw-weixin-cli）。
 * CLI 具体命令/接口未确认前不臆造调用，明确报错；接入后在此落地。
 */
async function sendWechatPersonal(_config: any, _input: ImSendInput) {
  throw new Error('个人微信发送需接入 ClawBot CLI（@tencent-weixin/openclaw-weixin-cli），暂未启用');
}

async function getFeishuToken(appId: string, appSecret: string): Promise<string> {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await res.json();
  if (!res.ok || !data.tenant_access_token) {
    throw new Error(`获取飞书 access_token 失败: ${data.msg || data.message || res.status}`);
  }
  return data.tenant_access_token;
}

async function getWechatToken(corpId: string, secret: string): Promise<string> {
  const res = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`,
  );
  const data = await res.json();
  if (!res.ok || data.errcode !== 0) {
    throw new Error(`获取企业微信 access_token 失败: ${data.errmsg || data.message || res.status}`);
  }
  return data.access_token;
}

async function uploadFeishuFile(token: string, buffer: Buffer, name: string): Promise<string> {
  const form = new FormData();
  form.append('file_type', 'stream');
  form.append('file_name', name || 'file');
  form.append('file', new Blob([buffer as unknown as BlobPart]), name || 'file');
  const res = await fetch('https://open.feishu.cn/open-apis/im/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok || data.code !== 0 || !data.data?.file_key) {
    throw new Error(`飞书文件上传失败: ${data.msg || data.message || res.status}`);
  }
  return data.data.file_key;
}

async function uploadWechatMedia(token: string, buffer: Buffer, name: string, type: string): Promise<string> {
  const form = new FormData();
  form.append('media', new Blob([buffer as unknown as BlobPart]), name || 'file');
  const res = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${encodeURIComponent(token)}&type=${type}`,
    {
      method: 'POST',
      body: form,
    },
  );
  const data = await res.json();
  if (!res.ok || data.errcode !== 0 || !data.media_id) {
    throw new Error(`企业微信文件上传失败: ${data.errmsg || data.message || res.status}`);
  }
  return data.media_id;
}

async function resolveFile(file: NonNullable<ImSendInput['file']>): Promise<{ name: string; buffer: Buffer }> {
  const name = file.name || 'file';
  if (file.path) {
    const buffer = await readFile(file.path);
    return { name, buffer };
  }
  if (file.data) {
    const data = file.data.includes(',') ? file.data.slice(file.data.indexOf(',') + 1) : file.data;
    return { name, buffer: Buffer.from(data, 'base64') };
  }
  throw new Error('文件需要 path 或 base64 data');
}

export async function testImConnector(userId: string, connectorId: string) {
  const connector = db.prepare('SELECT * FROM im_connector WHERE id = ? AND user_id = ?').get(connectorId, userId) as any;
  if (!connector) throw new Error('连接器不存在');
  const config = connector.config_json ? JSON.parse(connector.config_json) : {};
  if (connector.provider === 'feishu') {
    if (!config.appId || !config.appSecret) throw new Error('飞书连接器缺少 appId/appSecret');
    await getFeishuToken(config.appId, config.appSecret);
    return { provider: 'feishu', ok: true };
  }
  if (connector.provider === 'wechat') {
    if (!config.corpId || !config.secret) throw new Error('企业微信连接器缺少 corpId/secret');
    await getWechatToken(config.corpId, config.secret);
    return { provider: 'wechat', ok: true };
  }
  if (connector.provider === 'wechat-personal') {
    // ClawBot 连通性依赖本机 CLI 运行状态，此处仅校验配置存在
    if (!config.botName) throw new Error('个人微信连接器缺少 botName');
    return { provider: 'wechat-personal', ok: true, note: 'ClawBot CLI 未接入，仅校验配置' };
  }
  throw new Error('不支持的 provider');
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
  provider: 'feishu' | 'wechat' | 'wechat-personal';
  externalId: string;
  text: string;
  fromUser: string;
  toUser: string;
  replyTo: string;
  receiveIdType?: string;
  rawJson: string;
}

/** 通用 IM 闭环：去重 → 落库 → 建/复会话 → 跑任务 → 回结果。飞书 / 企业微信共用。 */
function runImClosedLoop(p: ImClosedLoopPayload): { handled: boolean; reason?: string } {
  if (!p.externalId || !p.text || !p.fromUser) {
    return { handled: false, reason: 'empty_or_non_text' };
  }

  // 去重：同一消息事件只处理一次（平台可能重投）
  const dup = db.prepare(
    'SELECT id FROM im_inbound_event WHERE connector_id = ? AND provider = ? AND external_id = ?',
  ).get(p.connectorId || null, p.provider, p.externalId);
  if (dup) return { handled: false, reason: 'duplicate' };

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
  if (!model) return { handled: false, reason: 'no_default_model' };

  const title = p.text.length > 24 ? p.text.slice(0, 24) + '…' : p.text;
  const conversationId = getOrCreateImConversation(p.connectorId || p.provider, p.fromUser, p.userId, title);

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
