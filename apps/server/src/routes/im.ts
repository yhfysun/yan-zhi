import express, { Router, Request, Response } from 'express';
import { createHmac, createHash, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import {
  listImConnectors,
  createImConnector,
  updateImConnector,
  deleteImConnector,
  sendImMessage,
  testImConnector,
  listImEvents,
  handleImInbound,
  parseWechatInbound,
  handleWechatInbound,
} from '../services/im.js';

const router = Router();

// GET /api/im/connectors
router.get('/connectors', authMiddleware, (req: Request, res: Response) => {
  res.json({ data: listImConnectors(req.user!.userId) });
});

// POST /api/im/connectors
router.post('/connectors', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: createImConnector(req.user!.userId, req.body || {}) });
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// PATCH /api/im/connectors/:id
router.patch('/connectors/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: updateImConnector(req.user!.userId, req.params.id, req.body || {}) });
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// DELETE /api/im/connectors/:id
router.delete('/connectors/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    deleteImConnector(req.user!.userId, req.params.id);
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// POST /api/im/connectors/:id/send
router.post('/connectors/:id/send', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await sendImMessage(req.user!.userId, req.params.id, req.body || {});
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// POST /api/im/connectors/:id/test  连通性测试
router.post('/connectors/:id/test', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await testImConnector(req.user!.userId, req.params.id);
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// GET /api/im/events  查询入站消息（会话页用）
router.get('/events', authMiddleware, (req: Request, res: Response) => {
  const connectorId = (req.query.connectorId as string) || undefined;
  const since = Number(req.query.since) || 0;
  const limit = Number(req.query.limit) || 200;
  res.json({ data: listImEvents(req.user!.userId, { connectorId, since, limit }) });
});

// POST /api/im/inbound/feishu
router.post('/inbound/feishu', async (req: Request, res: Response) => {
  const body = req.body || {};
  const timestamp = String(req.headers['x-lark-request-timestamp'] || '');
  const nonce = String(req.headers['x-lark-request-nonce'] || '');
  const signature = String(req.headers['x-lark-signature'] || '');
  const encrypt = body.encrypt ? String(body.encrypt) : '';

  if (body.type === 'url_verification') {
    res.json({ challenge: body.challenge });
    return;
  }

  if (timestamp && nonce && signature) {
    const connectors = db.prepare(
      "SELECT * FROM im_connector WHERE provider = 'feishu' AND enabled = 1",
    ).all() as any[];
    let verified = false;
    for (const connector of connectors) {
      const config = connector.config_json ? JSON.parse(connector.config_json) : {};
      const token = config.verificationToken || config.verification_token;
      if (!token) continue;
      const expected = feishuSignature(token, timestamp, nonce, encrypt, JSON.stringify(body));
      if (safeEqual(expected, signature)) {
        verified = true;
        void handleImInbound(connector.id, connector.user_id, 'feishu', body);
        break;
      }
    }
    if (!verified) {
      res.status(401).json({ error: '飞书签名校验失败' });
      return;
    }
  } else {
    // 无签名头（非加密事件模式）：用首个启用的飞书连接器兜底
    const first = db.prepare(
      "SELECT id, user_id FROM im_connector WHERE provider = 'feishu' AND enabled = 1 ORDER BY created_at ASC LIMIT 1",
    ).get() as any;
    void handleImInbound(first?.id, first?.user_id, 'feishu', body);
  }
  res.json({ code: 0, msg: 'success' });
});

// GET /api/im/inbound/wechat  企业微信 URL 验证（明文 / 加密两种模式）
router.get('/inbound/wechat', (req: Request, res: Response) => {
  const { msg_signature, timestamp, nonce, echostr } = req.query as Record<string, string>;
  const connector = findWechatConnector();
  const config = connector?.config || {};
  const token = config.token || '';
  const aesKey = config.encodingAesKey || config.encodingAESKey || '';

  if (!token) {
    res.type('text/plain').send(echostr || '');
    return;
  }

  if (aesKey) {
    // 加密模式：签名含 echostr，且 echostr 需 AES 解密
    if (!msg_signature || !timestamp || !nonce || !echostr) {
      res.status(400).send('missing params');
      return;
    }
    if (!safeEqual(wechatMsgSignature(token, timestamp, nonce, echostr), msg_signature)) {
      res.status(401).send('signature mismatch');
      return;
    }
    try {
      res.type('text/plain').send(wechatDecrypt(aesKey, echostr));
    } catch {
      res.status(400).send('decrypt failed');
    }
    return;
  }

  // 明文模式：签名不含 echostr，直接原样回显
  if (msg_signature && timestamp && nonce && echostr) {
    if (safeEqual(wechatSignature(token, timestamp, nonce), msg_signature)) {
      res.type('text/plain').send(echostr);
      return;
    }
    res.status(401).send('signature mismatch');
    return;
  }
  res.type('text/plain').send(echostr || '');
});

// POST /api/im/inbound/wechat  企业微信回调（XML，可能加密），原始 body 读取
router.post(
  '/inbound/wechat',
  express.raw({ type: () => true, limit: '2mb' }),
  (req: Request, res: Response) => {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
    const connector = findWechatConnector();
    const config = connector?.config || {};
    const token = config.token || '';
    const aesKey = config.encodingAesKey || config.encodingAESKey || '';

    // 加密模式：先校验签名（含 Encrypt），再 AES 解密得到内层 XML
    if (aesKey) {
      const encrypt = xmlTag(raw, 'Encrypt');
      if (!encrypt) {
        res.type('text/plain').send('success');
        return;
      }
      const q = req.query as Record<string, string>;
      const timestamp = q.timestamp || xmlTag(raw, 'TimeStamp');
      const nonce = q.nonce || xmlTag(raw, 'Nonce');
      const msgSignature = q.msg_signature || xmlTag(raw, 'MsgSignature');
      if (token && msgSignature && !safeEqual(wechatMsgSignature(token, timestamp, nonce, encrypt), msgSignature)) {
        res.status(401).send('signature mismatch');
        return;
      }
      try {
        const xml = wechatDecrypt(aesKey, encrypt);
        const parsed = parseWechatInbound(xml);
        if (connector?.id) {
          void handleWechatInbound(connector.id, connector.user_id, parsed);
        }
      } catch {
        // 解密失败不阻塞返回（企业微信会重试）
      }
      res.type('text/plain').send('success');
      return;
    }

    // 明文模式：body 即内层 XML
    if (raw && raw.includes('<xml>')) {
      const parsed = parseWechatInbound(raw);
      if (connector?.id) {
        void handleWechatInbound(connector.id, connector.user_id, parsed);
      }
    }
    saveInboundEvent(connector?.id, 'wechat', raw ? parseWechatInbound(raw) : {});
    res.type('text/plain').send('success');
  },
);

function findWechatConnector() {
  const row = db.prepare(
    "SELECT * FROM im_connector WHERE provider = 'wechat' AND enabled = 1 ORDER BY created_at ASC LIMIT 1",
  ).get() as any;
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    config: row.config_json ? JSON.parse(row.config_json) : {},
  };
}

function saveInboundEvent(connectorId: string | undefined, provider: string, body: unknown) {
  db.prepare(
    `INSERT INTO im_inbound_event
      (id, connector_id, provider, external_id, from_user, to_user, content, file_json, raw_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    uuid(),
    connectorId || null,
    provider,
    body && typeof body === 'object' ? String((body as any).event_id || (body as any).MsgId || '') : '',
    body && typeof body === 'object' ? String((body as any).sender?.sender_id?.open_id || (body as any).FromUserName || '') : '',
    body && typeof body === 'object' ? String((body as any).ToUserName || '') : '',
    body && typeof body === 'object' ? extractText(body) : null,
    null,
    JSON.stringify(body || {}),
    Date.now(),
  );
}

function extractText(body: any): string {
  try {
    if (body?.event?.message?.content) return JSON.stringify(body.event.message.content);
    if (body?.Content) return String(body.Content);
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function feishuSignature(token: string, timestamp: string, nonce: string, encrypt: string, body: string) {
  const raw = encrypt ? `${timestamp}\n${nonce}\n${encrypt}\n${body}` : `${timestamp}\n${nonce}\n${body}`;
  return createHmac('sha256', token).update(raw).digest('base64');
}

function wechatSignature(token: string, timestamp: string, nonce: string) {
  return createHash('sha1')
    .update([token, timestamp, nonce].sort().join(''))
    .digest('hex');
}

/** 企业微信加密模式签名：SHA1(sort([token, timestamp, nonce, encrypt])) */
function wechatMsgSignature(token: string, timestamp: string, nonce: string, encrypt: string) {
  return createHash('sha1')
    .update([token, timestamp, nonce, encrypt].sort().join(''))
    .digest('hex');
}

/**
 * 企业微信 AES-256-CBC 解密（官方算法）。
 * EncodingAESKey(43) base64 解码 → 32 字节密钥；IV 取密钥前 16 字节；PKCS7。
 * 明文结构：random(16) + msg_len(4, 大端) + msg + receiveid。
 */
function wechatDecrypt(encodingAesKey: string, encrypt: string): string {
  const key = Buffer.from(encodingAesKey + '=', 'base64');
  const iv = key.subarray(0, 16);
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encrypt, 'base64')), decipher.final()]);
  const msgLen = decrypted.readUInt32BE(16);
  return decrypted.toString('utf8', 20, 20 + msgLen);
}

/** 简易 XML 取值（兼容 CDATA） */
function xmlTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`);
  const m = xml.match(re);
  return m ? m[1] : '';
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export default router;

