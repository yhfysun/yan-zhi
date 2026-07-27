import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'yan-zhi-secret-change-in-production';
const JWT_EXPIRES = '30d';

const router = Router();

interface JwtPayload {
  userId: string;
  username: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/** 必须登录的中间件 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录' });
    return;
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token 无效或已过期，请重新登录' });
  }
}

/** 可选登录：有 token 就解析，没有不报错 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), JWT_SECRET) as JwtPayload;
    } catch {}
  }
  next();
}

// POST /api/auth/register
router.post('/register', (req: Request, res: Response) => {
  const { username, password, email } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: '用户名和密码为必填项' });
    return;
  }
  if (username.length < 2 || username.length > 32) {
    res.status(400).json({ error: '用户名长度 2-32 字符' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: '密码至少 6 位' });
    return;
  }

  const existing = db.prepare('SELECT id FROM user WHERE username = ?').get(username);
  if (existing) {
    res.status(409).json({ error: '该用户名已注册' });
    return;
  }

  const id = uuid();
  const passwordHash = bcrypt.hashSync(password, 10);
  const now = Date.now();
  db.prepare('INSERT INTO user (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(id, username, email || null, passwordHash, now);

  const token = jwt.sign({ userId: id, username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  res.json({ token, user: { id, username, email: email || null } });
});

// POST /api/auth/login
router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: '用户名和密码为必填项' });
    return;
  }

  const row = db.prepare('SELECT id, username, email, password_hash FROM user WHERE username = ?').get(username) as any;
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ error: '用户名或密码错误' });
    return;
  }

  const token = jwt.sign({ userId: row.id, username: row.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  res.json({ token, user: { id: row.id, username: row.username, email: row.email } });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  const row = db.prepare('SELECT id, username, email, created_at FROM user WHERE id = ?').get(req.user!.userId) as any;
  if (!row) {
    res.status(404).json({ error: '用户不存在' });
    return;
  }
  res.json({ user: row });
});

export default router;
