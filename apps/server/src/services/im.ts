import { v4 as uuid } from 'uuid';
import { readFile } from 'node:fs/promises';
import { db } from '../db.js';

type ImProvider = 'wechat' | 'feishu';

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
  if (!input.provider || !['wechat', 'feishu'].includes(input.provider)) {
    throw new Error('provider 必须为 wechat 或 feishu');
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
