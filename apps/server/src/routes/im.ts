import { Router, Request, Response } from 'express';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import {
  listImConnectors,
  createImConnector,
  updateImConnector,
  deleteImConnector,
  sendImMessage,
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
        saveInboundEvent(connector.id, 'feishu', body);
        break;
      }
    }
    if (!verified) {
      res.status(401).json({ error: '飞书签名校验失败' });
      return;
    }
  }

  const first = db.prepare(
    "SELECT id FROM im_connector WHERE provider = 'feishu' AND enabled = 1 ORDER BY created_at ASC LIMIT 1",
  ).get() as any;
  saveInboundEvent(first?.id, 'feishu', body);
  res.json({ code: 0, msg: 'success' });
});

// GET /api/im/inbound/wechat
router.get('/inbound/wechat', (req: Request, res: Response) => {
  const { msg_signature, timestamp, nonce, echostr } = req.query as Record<string, string>;
  const connector = findWechatConnector();
  const token = connector?.config?.token || '';
  if (msg_signature && timestamp && nonce && echostr && token) {
    if (safeEqual(wechatSignature(token, timestamp, nonce), msg_signature)) {
      res.type('text/plain').send(echostr);
      return;
    }
    res.status(401).send('signature mismatch');
    return;
  }
  res.type('text/plain').send(echostr || '');
});

// POST /api/im/inbound/wechat
router.post('/inbound/wechat', (req: Request, res: Response) => {
  const connector = findWechatConnector();
  saveInboundEvent(connector?.id, 'wechat', req.body || {});
  res.type('text/plain').send('success');
});

function findWechatConnector() {
  const row = db.prepare(
    "SELECT * FROM im_connector WHERE provider = 'wechat' AND enabled = 1 ORDER BY created_at ASC LIMIT 1",
  ).get() as any;
  if (!row) return null;
  return {
    id: row.id,
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

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export default router;

