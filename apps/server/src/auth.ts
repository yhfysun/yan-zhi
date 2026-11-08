import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from './db.js';
import {
  getAuthMode, seedRbac, hasRealUsers, invalidatePermissionCache,
  ROOT_ORG_ID, ADMIN_ROLE_ID, userIsAdmin, getUserPermissions, PERMISSION_TREE, ensureDefaultAdmin,
  DEFAULT_ADMIN_ID,
} from './rbac.js';
import { ensureAgensPlatform } from './agens-platform/service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'yan-zhi-secret-change-in-production';
const JWT_EXPIRES = '30d';

/** 本地 JWT 签发的唯一出口（内置账号与 OIDC 登录共用，避免两份签发口径）。 */
export function issueAuthToken(userId: string, username: string): string {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

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

/** 判断请求是否来自本机回环（127.0.0.1 / ::1 / ::ffff:127.x）。
 *  multi 模式下回环请求恒为 guest：本机桌面端零改动、历史数据（user_id='guest'）不漂移。 */
function isLoopback(req: Request): boolean {
  const addr = req.socket?.remoteAddress || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1' || addr.startsWith('::ffff:127.');
}

/** 校验 JWT 字符串，合法返回身份，否则 null。 */
function verifyJwt(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (!payload?.userId) return null;
    return { userId: payload.userId, username: payload.username };
  } catch {
    return null;
  }
}

/** 校验 Bearer token，合法返回身份，否则 null。 */
export function verifyBearer(req: Request): JwtPayload | null {
  const header = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? verifyJwt(m[1]) : null;
}

/**
 * 只读请求的 `?token=` query 令牌（原始串；无则空串）。
 *
 * ★★★ 为什么 REST 也要支持 query 令牌（2026-11-02 用户报「视频 0MB 流式读取失败」）：
 *   浏览器媒体元素（`<video>` / `<audio>` / `<img>` / iframe）**发不了 Authorization 头** ——
 *   请求由元素自己发起，前端没有任何挂钩。multi 模式下这些请求不带 token 就被判
 *   游客（回环）或 401（远程），于是成片预览一律"读不出来"。
 *   WS 早已有同一兜底（wsUpgradeAuthorized）；REST 这边一直缺，本函数补齐。
 * ★ 只对 GET/HEAD 开放：写操作仍必须走请求头，避免 token 出现在可被记录的写请求
 *   链接里，也把「GET 才能带 query」这条边界钉死。
 */
function queryToken(req: Request): string {
  if (req.method !== 'GET' && req.method !== 'HEAD') return '';
  const t = (req.query as Record<string, unknown> | undefined)?.token;
  return typeof t === 'string' ? t.trim() : '';
}

/** 统一鉴权收口（全仓路由均经此处，见各 routes 的 router.use(authMiddleware)）。
 *  - guest 模式（默认/本机桌面打包版）：恒 guest，与历史行为完全一致。
 *  - multi 模式（YZ_AUTH_MODE=multi，后端作为共享服务）：
 *      ① 带合法 JWT → 用其身份（含回环：主机本机也要能登录管理员账号管理用户）；
 *      ② 无 token 的回环请求 → guest（本机桌面零改动、历史数据 user_id='guest' 不漂移）；
 *      ③ 无 token 的远程请求 → 401。
 *  历史教训（2026-09-13）：全库数据按 user_id 过滤，身份漂移 = 数据"凭空消失"。
 *  guest 分支恒定落 LOCAL_USER（userId 'guest'），与存量数据一致；multi 模式是显式
 *  opt-in（env），其下 token 身份优先属预期语义。★ multi 部署务必设独立 JWT_SECRET
 *  （默认值是硬编码的，公网上可被伪造 token）。
 *  ★ 回环/远程的判定只影响「无 token 时是否放行为 guest」，不允许 guest 分支
 *    吞掉带 token 的请求（否则主机本机永远进不了管理页 —— 2026-11-01 冒烟实锤）。 */
/** 管理员视图切换（2026-11-01 用户拍板「管理员查看所有信息，用户账号记录除外」）：
 *  请求带 `X-YZ-View-As: <userId>` 且当前 token 身份拥有 admin 权限点 → 视角切到目标用户，
 *  全部业务路由的 user_id 过滤零改动即按目标用户执行（唯一收口，防逐路由漏改）。
 *  约束：仅 multi 模式；先验 token 身份再验 admin 权限；目标用户必须存在；guest 模式不启用。 */
function applyViewAs(req: Request, identity: JwtPayload): JwtPayload {
  let viewAs = req.headers['x-yz-view-as'];
  // 媒体元素带不了请求头 → 只读请求允许 `?viewAs=`（权限校验与请求头完全同一条）
  if ((typeof viewAs !== 'string' || !viewAs) && (req.method === 'GET' || req.method === 'HEAD')) {
    const q = (req.query as Record<string, unknown> | undefined)?.viewAs;
    viewAs = typeof q === 'string' ? q : '';
  }
  if (typeof viewAs !== 'string' || !viewAs || viewAs === identity.userId) return identity;
  if (getAuthMode() !== 'multi') return identity;
  try {
    if (!userIsAdmin(identity.userId)) return identity;
    const target = db.prepare('SELECT id, username FROM user WHERE id = ?').get(viewAs) as any;
    if (!target) return identity;
    // ★ 真实身份保留在 req.realUser：管理接口（requirePerm / me 的权限）永远按真实
    //   管理员鉴权 —— 否则管理员一切视角就"变成"目标用户，管理菜单/接口全 403（首启实锤）。
    (req as any).realUser = identity;
    return { ...identity, userId: target.id, username: target.username };
  } catch { return identity; }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (getAuthMode() === 'guest') {
    req.user = LOCAL_USER;
    next();
    return;
  }
  const qt = queryToken(req);
  const identity = verifyBearer(req) || (qt ? verifyJwt(qt) : null);
  if (identity) {
    req.user = applyViewAs(req, identity);
    next();
    return;
  }
  // 带了 query 令牌却解析失败：明确 401，让前端知道要重新登录（不静默回落游客）
  if (qt) {
    res.status(401).json({ error: '登录令牌无效或已过期', code: 'UNAUTHENTICATED' });
    return;
  }
  if (isLoopback(req)) {
    req.user = LOCAL_USER;
    next();
    return;
  }
  res.status(401).json({ error: '未登录或登录已过期', code: 'UNAUTHENTICATED' });
}

/** 可选登录：带合法 token 用其身份，否则回落 guest（回环）；远程无 token 也回落 guest。 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  if (getAuthMode() === 'guest') {
    req.user = LOCAL_USER;
    next();
    return;
  }
  const qt = queryToken(req);
  const identity = verifyBearer(req) || (qt ? verifyJwt(qt) : null);
  req.user = identity ? applyViewAs(req, identity) : LOCAL_USER;
  next();
}

/** 访客/登录双模：与 optionalAuth 同语义。 */
export function guestOrAuth(req: Request, _res: Response, next: NextFunction) {
  optionalAuth(req, _res, next);
}

/** WS upgrade 鉴权（唯一收口：index.ts 的 httpServer.on('upgrade')）。
 *  ★ upgrade 请求不经过 Express 中间件链 —— authMiddleware / license-guard 对它都无效，
 *    不在这里挡住就等于 multi 模式下给远程客户端开了无鉴权的 WS 后门（聊天流/运维终端）。
 *  token 携带方式：Authorization 头 或 `?token=` query（浏览器 WebSocket 带不了自定义头，
 *  与 license 走 `?license=` 同一限制、同一兜底；前端统一在 api/client.ts#wsUrl 注入）。
 *  判定顺序与 authMiddleware 同口径：guest 模式全放行；带 token 必须**合法**（无效即拒，
 *  不回落 guest）；无 token 回环放行（guest）；无 token 远程拒绝。 */
export function wsUpgradeAuthorized(req: { url?: string; headers: Record<string, unknown>; socket?: { remoteAddress?: string } }): boolean {
  if (getAuthMode() === 'guest') return true;
  // 远控会话 WS 自带配对鉴权（hostKey / pair-token / confirmId，在 remote-control 插件
  // onConnection 内逐连接校验）——pair-token 不是 JWT，jwt.verify 会把跨机远控误杀，
  // 故这里放行、鉴权责任归插件自身闸门。
  if ((req.url || '').includes('/plugin/remote-control/session/ws')) return true;
  let token = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''))?.[1] || '';
  if (!token) {
    try { token = new URL(req.url || '', 'http://localhost').searchParams.get('token') || ''; } catch { /* URL 异常按无 token */ }
  }
  if (token) {
    try { jwt.verify(token, JWT_SECRET); return true; } catch { return false; }
  }
  const addr = req.socket?.remoteAddress || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1' || addr.startsWith('::ffff:127.');
}

/** 从 WS upgrade 请求解析用户身份（chat-ws 建任务/注入消息的归属用）。
 *  guest 模式、无 token、token 无效 → 恒 guest（与全库 user_id 兼容）。 */
export function resolveWsUserId(req: { url?: string; headers: Record<string, unknown> }): string {
  const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
  let queryToken = '';
  try { queryToken = new URL(req.url || '', 'http://localhost').searchParams.get('token') || ''; } catch { /* 忽略 */ }
  const token = m?.[1] || queryToken;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
      if (payload?.userId) return payload.userId;
    } catch { /* 回落 guest */ }
  }
  return LOCAL_USER.userId;
}

/** 从 Authorization Bearer token 中解析用户，供非 Express 中间件上下文使用。
 *  guest 模式恒定返回 guest 身份（与全库数据 user_id 一致）。 */
export function resolveJwtUser(header?: string): JwtPayload {
  if (getAuthMode() === 'multi' && header) {
    try {
      const payload = jwt.verify(header.replace(/^Bearer\s+/i, ''), JWT_SECRET) as JwtPayload;
      if (payload?.userId) return { userId: payload.userId, username: payload.username };
    } catch { /* 落回 guest */ }
  }
  return LOCAL_USER;
}

// ===== 服务状态：前端据此决定是否弹登录/首次安装向导 =====
// GET /api/auth/status
router.get('/status', (_req: Request, res: Response) => {
  const mode = getAuthMode();
  res.json({
    mode,
    authRequired: mode === 'multi',
    setupRequired: mode === 'multi' && !hasRealUsers(),
    guest: LOCAL_USER,
  });
});

// POST /api/auth/setup —— 首次安装：创建管理员账号（自动建根组织 + 管理员角色 + 权限）。
// 仅在 multi 模式且尚无真实用户时可用，幂等守卫防止被重复调用覆盖。
router.post('/setup', (req: Request, res: Response) => {
  if (getAuthMode() !== 'multi') {
    res.status(400).json({ error: '当前服务为本地单用户模式，无需初始化' });
    return;
  }
  if (hasRealUsers()) {
    res.status(409).json({ error: '系统已初始化，请直接登录' });
    return;
  }
  const { username, password } = req.body || {};
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
    res.status(409).json({ error: '该用户名已存在' });
    return;
  }
  const now = Date.now();
  // ★ 首启占位管理员就地接管（2026-11-02）：预置的 yanZhiPower 是空密码占位行，
  //   若另建新账号，这条占位行会继续存在且**空密码即可登录**（管理后门）。
  //   这里改为改名 + 设密码 + 清 must_change_password，账号仍是同一条。
  const placeholder = db.prepare(
    "SELECT id FROM user WHERE id = ? AND (password_hash IS NULL OR password_hash = '')",
  ).get(DEFAULT_ADMIN_ID) as { id: string } | undefined;
  const id = placeholder?.id ?? uuid();
  if (placeholder) {
    db.prepare('UPDATE user SET username = ?, password_hash = ?, must_change_password = 0 WHERE id = ?')
      .run(username, bcrypt.hashSync(password, 10), id);
  } else {
    db.prepare('INSERT INTO user (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, username, null, bcrypt.hashSync(password, 10), now);
  }
  // 授权：根组织 + 管理员角色（rbac.seedRbac 已保证根组织/管理员角色存在）
  db.prepare('INSERT OR IGNORE INTO user_org (user_id, org_id, created_at) VALUES (?, ?, ?)')
    .run(id, ROOT_ORG_ID, now);
  db.prepare('INSERT OR IGNORE INTO user_role (user_id, role_id, created_at) VALUES (?, ?, ?)')
    .run(id, ADMIN_ROLE_ID, now);
  // 新用户平台 seeding（agens 预置 12 模型），失败不阻断初始化
  try { ensureAgensPlatform(id); } catch (err) {
    console.error('[auth] 新用户平台 seeding 失败:', err instanceof Error ? err.message : err);
  }
  const token = jwt.sign({ userId: id, username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  res.json({ token, user: { id, username, email: null } });
});

// POST /api/auth/register
router.post('/register', (req: Request, res: Response) => {
  // multi 多用户模式关闭自助注册：账号由管理员在 /api/admin/users 统一创建，
  // 否则任何能连到服务的人都能给自己开号（共享部署下的敞口）。
  if (getAuthMode() === 'multi') {
    res.status(403).json({ error: '当前服务为多用户模式，请联系管理员开通账号' });
    return;
  }
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
// ★ 首次登录强制改密闸（2026-11-01）：must_change_password=1 的账号除改密/查自身外
//   一律 403（PASSWORD_CHANGE_REQUIRED）——防止空密码管理员一直裸奔。
router.use((req: Request, res: Response, next: () => void) => {
  const u = (req as any).user;
  if (!u || u.userId === LOCAL_USER.userId || u.userId === 'guest') {
    next();
    return;
  }
  try {
    const row = db.prepare('SELECT must_change_password FROM user WHERE id = ?').get(u.userId) as any;
    if (row?.must_change_password && !req.path.startsWith('/change-password') && req.path !== '/me') {
      res.status(403).json({ error: '首次登录请先修改密码', code: 'PASSWORD_CHANGE_REQUIRED' });
      return;
    }
  } catch { /* 查询失败不拦截 */ }
  next();
});
router.post('/login', (req: Request, res: Response) => {
  // guest 本地单机：登录无意义（身份恒 guest），给出明确指路而不是"密码错误"迷惑报错
  if (getAuthMode() === 'guest') {
    res.status(400).json({ error: '当前为本地单机模式，无需登录。如需多用户协作，请以 YZ_AUTH_MODE=multi 启动服务', code: 'GUEST_MODE' });
    return;
  }
  const { username, password } = req.body || {};
  if (!username) {
    res.status(400).json({ error: '用户名为必填项' });
    return;
  }

  const row = db.prepare('SELECT id, username, email, password_hash, must_change_password FROM user WHERE username = ?').get(username) as any;
  if (!row) {
    res.status(401).json({ error: '用户名或密码错误' });
    return;
  }
  // ★ 空密码账号（默认管理员 yanZhiPower 首次登录）：密码必须留空；登录后强制设置新密码
  if (!row.password_hash) {
    if (password) {
      res.status(401).json({ error: '该账号尚未设置密码：请把密码留空直接登录，再按提示设置新密码' });
      return;
    }
    const token0 = jwt.sign({ userId: row.id, username: row.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token: token0, user: { id: row.id, username: row.username, email: row.email }, mustChangePassword: true });
    return;
  }
  if (!password || !bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ error: '用户名或密码错误' });
    return;
  }

  const token = jwt.sign({ userId: row.id, username: row.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  const base: Record<string, unknown> = { token, user: { id: row.id, username: row.username, email: row.email } };
  if (row.must_change_password) base.mustChangePassword = true;
  res.json(base);
});

// POST /api/auth/change-password —— 设置/修改当前登录用户密码（首次强制改密走这里）。
// 空密码账号（尚未设置密码）无需旧密码；已设密码账号必须校验 oldPassword。
router.post('/change-password', authMiddleware, (req: Request, res: Response) => {
  const uid = req.user!.userId;
  const { oldPassword, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    res.status(400).json({ error: '新密码至少 6 位' });
    return;
  }
  const row = db.prepare('SELECT password_hash FROM user WHERE id = ?').get(uid) as any;
  if (!row) {
    res.status(404).json({ error: '用户不存在' });
    return;
  }
  if (row.password_hash) {
    if (typeof oldPassword !== 'string' || !bcrypt.compareSync(oldPassword, row.password_hash)) {
      res.status(401).json({ error: '旧密码错误' });
      return;
    }
  }
  db.prepare('UPDATE user SET password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(bcrypt.hashSync(newPassword, 10), uid);
  res.json({ ok: true });
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
  // ★ guest 本地单机模式：本机用户即管理员（2026-11-01）——返回全树权限，前端据此显示
  //   管理后台入口与全部共享开关；admin 路由在 guest 模式同步放行（requirePerm）。
  //   multi 模式不受影响：guest 身份照旧无权限（引导登录真实账号）。
  if (getAuthMode() === 'guest') {
    res.json({
      user: row,
      isAdmin: true,
      permissions: PERMISSION_TREE.map((p) => p.id),
      authMode: 'guest',
    });
    return;
  }
  // ★ 管理员视角切换：权限/管理能力永远按真实登录身份（realUser）计算，
  //   user 字段返回视角目标（数据面身份），viewAsUsername 供前端横幅提示。
  const real = (req as any).realUser as JwtPayload | undefined;
  const permUid = real?.userId || row.id;
  res.json({
    user: row,
    isAdmin: userIsAdmin(permUid),
    permissions: getUserPermissions(permUid),
    mustChangePassword: !!(row as any).must_change_password,
    viewAsUsername: real && real.userId !== row.id ? row.username : undefined,
    authMode: getAuthMode(),
  });
});

export { seedRbac, invalidatePermissionCache, PERMISSION_TREE, ensureDefaultAdmin, getAuthMode };
export default router;
