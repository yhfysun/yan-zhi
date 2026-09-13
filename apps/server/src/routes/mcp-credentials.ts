import { Router, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import { encrypt, decrypt } from '../utils/crypto.js';

const router = Router();
router.use(authMiddleware);

// ===== MCP 凭证/令牌保险库 =====
// 设计：secret 用 utils/crypto.ts 的 AES-256-GCM 加密（secret_enc），明文永不落库。
// 列表/详情一律不回显明文，仅暴露 hasSecret；明文只在「查看」接口（本人）一次性返回。

function rowToList(r: any) {
  return {
    id: r.id,
    name: r.name,
    scheme: r.scheme,
    target: r.target,
    key: r.key || null,
    hasSecret: !!r.secret_enc,
    createdAt: r.created_at,
  };
}

// GET /api/mcp-credentials —— 列出当前用户全部凭证（不含明文）
router.get('/', (req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM mcp_credential WHERE user_id = ? ORDER BY created_at DESC').all(req.user!.userId) as any[];
  res.json({ data: rows.map(rowToList) });
});

// POST /api/mcp-credentials/generate —— 生成一个随机令牌（不落库，前端复制后随 create 一起保存）
router.post('/generate', (req: Request, res: Response) => {
  const len = Math.min(Math.max(Number(req.body?.bytes) || 24, 8), 64);
  const token = 'yzc_' + randomBytes(len).toString('hex');
  res.json({ data: { token } });
});

// POST /api/mcp-credentials —— 新建凭证（secret 加密存储）
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { name, scheme, target, key, secret } = req.body || {};
  if (!name || !secret) { res.status(400).json({ error: '名称和密钥为必填项' }); return; }
  if (scheme && !['bearer', 'raw'].includes(scheme)) { res.status(400).json({ error: 'scheme 仅支持 bearer / raw' }); return; }
  if (target && !['header', 'env'].includes(target)) { res.status(400).json({ error: 'target 仅支持 header / env' }); return; }
  if (scheme === 'raw' && !key) { res.status(400).json({ error: 'raw 模式需要 key（头名或环境变量名）' }); return; }

  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO mcp_credential (id, user_id, name, scheme, target, key, secret_enc, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, userId, name, scheme || 'bearer', target || 'header', key || null, encrypt(String(secret)), now);
  const row = db.prepare('SELECT * FROM mcp_credential WHERE id = ?').get(id) as any;
  res.json({ data: rowToList(row) });
});

// GET /api/mcp-credentials/:id/secret —— 查看明文（仅本人，一次性）
router.get('/:id/secret', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const row = db.prepare('SELECT * FROM mcp_credential WHERE id = ? AND user_id = ?').get(req.params.id, userId) as any;
  if (!row) { res.status(404).json({ error: '凭证不存在' }); return; }
  try {
    res.json({ data: { secret: decrypt(row.secret_enc) } });
  } catch {
    res.status(500).json({ error: '解密失败' });
  }
});

// DELETE /api/mcp-credentials/:id
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const row = db.prepare('SELECT * FROM mcp_credential WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!row) { res.status(404).json({ error: '凭证不存在' }); return; }
  // 解绑引用了该凭证的 MCP 服务
  db.prepare('UPDATE mcp_server SET auth_credential_id = NULL WHERE auth_credential_id = ? AND user_id = ?').run(req.params.id, userId);
  db.prepare('DELETE FROM mcp_credential WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
