import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'yan-zhi-secret-change-in-production';
const JWT_EXPIRES = '30d';

const router = Router();

export interface JwtPayload {
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

/** 本地单用户模式固定身份（数据都在本地，登录已屏蔽）。 */
const LOCAL_USER: JwtPayload = { userId: 'guest', username: 'guest' };

/** 本地单用户模式恒定 guest 身份：忽略 Authorization token。
 *  历史教训（2026-09-13）：此前"有合法 token 就用其身份"的分支，会因前端 localStorage
 *  残留旧 JWT（JWT_SECRET 为硬编码默认值，旧 token 永久验签通过）导致请求身份 ≠ 'guest'，
 *  而全库数据 user_id 均为 'guest'，按身份过滤后表现为：平台下拉为空、模型 0 个、
 *  平台/模型查询 404「平台不存在」、聊天消息发出去不显示。
 *  恢复多用户鉴权时：改回「有合法 token 用其身份，否则 401」即可（见 git 历史）。 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.user = LOCAL_USER;
  next();
}

/** 可选登录：本地模式下同样恒定 guest 身份（调用方依赖 req.user 存在）。 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = LOCAL_USER;
  next();
}

/** 访客/登录双模：本地模式下恒定 guest 身份。 */
export function guestOrAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = LOCAL_USER;
  next();
}

/** 从 Authorization Bearer token 中解析用户，供非 Express 中间件上下文使用。
 *  本地模式下恒定返回 guest 身份（与全库数据 user_id 一致）。 */
export function resolveJwtUser(_header?: string): JwtPayload {
  return LOCAL_USER;
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

// POST /api/auth/guest —— 获取访客身份 token（未登录时访问共享知识库等）。预置 guest 用户不可登录，仅用于标注数据归属。
router.post('/guest', (_req: Request, res: Response) => {
  const row = db.prepare("SELECT id, username FROM user WHERE username = 'guest'").get() as any;
  if (!row) {
    res.status(500).json({ error: '未初始化 guest 用户' });
    return;
  }
  const token = jwt.sign({ userId: row.id, username: row.username }, JWT_SECRET, { expiresIn: '365d' });
  res.json({ token, user: { id: row.id, username: row.username, email: null } });
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
