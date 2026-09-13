import { Router, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import { hashAccessKey } from '../mcp/inbound-auth.js';

const router = Router();
router.use(authMiddleware);

// 列表（不回显明文/哈希，仅展示前缀与时间）
router.get('/', (req: Request, res: Response) => {
  const rows = db
    .prepare('SELECT id, name, key_prefix, created_at, expires_at, last_used_at FROM mcp_access_key WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user!.userId) as any[];
  res.json({ data: rows });
});

// 创建：生成明文 key 仅本次返回一次，库内只存 SHA-256 哈希
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const name = (req.body?.name || '').trim();
  if (!name) { res.status(400).json({ error: '名称为必填项' }); return; }

  const plain = 'yzk_' + randomBytes(24).toString('hex');
  const expiresAt = Number(req.body?.expiresInDays) > 0
    ? Date.now() + Number(req.body.expiresInDays) * 86400000
    : null;

  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO mcp_access_key (id, user_id, name, key_hash, key_prefix, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)',
  ).run(id, userId, name, hashAccessKey(plain), plain.slice(0, 12), now, expiresAt);

  res.json({
    data: {
      id,
      name,
      key: plain, // 仅本次返回
      keyPrefix: plain.slice(0, 12),
      createdAt: now,
      expiresAt,
    },
  });
});

// 撤销
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const row = db.prepare('SELECT id FROM mcp_access_key WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!row) { res.status(404).json({ error: '凭证不存在' }); return; }
  db.prepare('DELETE FROM mcp_access_key WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  res.json({ ok: true });
});

export default router;
