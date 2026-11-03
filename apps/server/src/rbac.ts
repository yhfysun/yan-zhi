/**
 * RBAC：组织（树）/ 角色（树）/ 权限（树）/ 用户-组织-角色授权。
 *
 * 设计要点（对应用户需求「组织/角色/用户/权限系统」）：
 * - 组织 = 公司真实组织架构，树形（parent_id）。
 * - 角色 = 菜单/功能权限的集合，树形（子角色继承父角色权限）。
 * - 授权两条路：直接给用户绑角色（user_role）；给组织绑角色（org_role），
 *   用户权限 = 直接角色 ∪ 所属组织的角色（含角色树继承）。
 * - 权限树种子化（PERMISSION_TREE），id 即权限 key（如 `admin.user.manage`）。
 * - 鉴权模式：YZ_AUTH_MODE=guest（默认，本地单用户，恒 guest 身份，数据全兼容）
 *   | multi（多用户：回环请求仍为 guest 保本机桌面体验；远程请求必须 JWT）。
 *
 * ★ 数据归属兼容：全库历史数据 user_id='guest'，本机回环请求保持 guest 身份
 *   （auth.ts 历史教训 2026-09-13：身份漂移会导致数据"凭空消失"）。
 */
import bcrypt from 'bcryptjs';
import { db } from './db.js';

// ===== 建表（与 db.ts 的 CREATE IF NOT EXISTS 风格一致，独立 exec 块避免动 5900 行主块） =====
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS org (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES org(id),
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS role (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES role(id),
      is_system INTEGER NOT NULL DEFAULT 0,
      remark TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS permission (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_org (
      user_id TEXT NOT NULL REFERENCES user(id),
      org_id TEXT NOT NULL REFERENCES org(id),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, org_id)
    );
    CREATE TABLE IF NOT EXISTS user_role (
      user_id TEXT NOT NULL REFERENCES user(id),
      role_id TEXT NOT NULL REFERENCES role(id),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, role_id)
    );
    CREATE TABLE IF NOT EXISTS org_role (
      org_id TEXT NOT NULL REFERENCES org(id),
      role_id TEXT NOT NULL REFERENCES role(id),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (org_id, role_id)
    );
    CREATE TABLE IF NOT EXISTS role_permission (
      role_id TEXT NOT NULL REFERENCES role(id),
      permission_id TEXT NOT NULL,
      PRIMARY KEY (role_id, permission_id)
    );
  `);
} catch (err) {
  console.error('[rbac] 建表失败（表已存在则忽略此错）:', err instanceof Error ? err.message : err);
}

// ===== 权限目录（种子树）。id 即 key，前端按前缀分组消费 =====
export interface PermissionDef { id: string; name: string; parent: string | null }
export const PERMISSION_TREE: PermissionDef[] = [
  { id: 'admin', name: '系统管理', parent: null },
  { id: 'admin.user.manage', name: '用户管理', parent: 'admin' },
  { id: 'admin.org.manage', name: '组织管理', parent: 'admin' },
  { id: 'admin.role.manage', name: '角色管理', parent: 'admin' },
  { id: 'admin.permission.manage', name: '权限管理', parent: 'admin' },
  { id: 'menu', name: '功能菜单', parent: null },
  // menu.* 后缀 = 模式 key（MODE_DEFS）：office/wf/dev/clip/ops/sec/shop，
  // 前端据此把权限映射为"模式放行清单"（stores/auth → setPermittedModes）。
  { id: 'menu.office', name: '办公对话', parent: 'menu' },
  { id: 'menu.wf', name: '工作流', parent: 'menu' },
  { id: 'menu.dev', name: '代码开发', parent: 'menu' },
  { id: 'menu.clip', name: '剪藏', parent: 'menu' },
  { id: 'menu.ops', name: '运维', parent: 'menu' },
  { id: 'menu.sec', name: '安全', parent: 'menu' },
  { id: 'menu.shop', name: '商城', parent: 'menu' },
  { id: 'menu.knowledge', name: '知识库', parent: 'menu' },
  { id: 'menu.agents', name: '智能体', parent: 'menu' },
  { id: 'menu.models', name: '模型平台', parent: 'menu' },
  { id: 'menu.plugins', name: '插件', parent: 'menu' },
  { id: 'menu.memory', name: '记忆', parent: 'menu' },
  { id: 'menu.settings', name: '设置', parent: 'menu' },
  { id: 'share', name: '共享授权', parent: null },
  { id: 'share.agent.publish', name: '发布智能体为公共', parent: 'share' },
  { id: 'share.platform.publish', name: '共享模型平台', parent: 'share' },
  { id: 'share.model.publish', name: '共享单个模型', parent: 'share' },
  { id: 'share.skill.publish', name: '共享 Skill', parent: 'share' },
  { id: 'share.tool.publish', name: '共享自定义工具', parent: 'share' },
];

export const ROOT_ORG_ID = 'org_root';
export const ADMIN_ROLE_ID = 'role_admin';
export const ADMIN_PERMISSION_ID = 'admin';
/** 首启占位管理员（空密码、未配置）：未设置密码前不算"已初始化"，前端据此展示设置密码向导。 */
export const DEFAULT_ADMIN_ID = 'user-yanzhipower-default';

/** 启动时种子化：权限树 + 根组织 + 系统管理员角色（幂等）。 */
/**
 * 默认管理员占位（2026-11-01 拍板；2026-11-02 改为「缺了就补种」+ 首启向导接管）：
 * multi 模式下只要**这条占位账号不存在**就补种 yanZhiPower（**空密码**、强制改密）。
 *
 * ★ 为什么不再要求"库里零用户"：开发库/老库里早就有 test1 / admin 这些历史账号，
 *   条件一卡就永远种不上，用户对着登录页只看到 401（2026-11-02 实报）。
 * ★ 空密码不是漏洞：登录必须**留空密码**，登录后立刻被 must_change_password 闸到改密页，
 *   改密前除 /change-password、/me 外所有接口 403。
 * ★ /setup 成功后是**就地接管**这条占位行（改名 + 设密码），接管后 id 仍在，这里不会重复种。
 */
export function ensureDefaultAdmin(): boolean {
  const now = Date.now();
  const uid = DEFAULT_ADMIN_ID;
  const exists = db.prepare('SELECT id FROM user WHERE id = ?').get(uid);
  if (exists) return false;
  // 用户名可能被历史数据占用：撞名时改用 id 兜底名，避免 UNIQUE 失败后占位行根本种不进去
  const taken = db.prepare('SELECT id FROM user WHERE username = ?').get('yanZhiPower') as { id: string } | undefined;
  const username = taken ? 'yanZhiPower-default' : 'yanZhiPower';
  db.prepare(
    "INSERT OR IGNORE INTO user (id, username, email, password_hash, must_change_password, created_at) VALUES (?, ?, NULL, '', 1, ?)",
  ).run(uid, username, now);
  db.prepare('INSERT OR IGNORE INTO user_role (user_id, role_id, created_at) VALUES (?, ?, ?)')
    .run(uid, ADMIN_ROLE_ID, now);
  return true;
}

export function seedRbac(): void {
  const now = Date.now();
  const insPerm = db.prepare(
    'INSERT OR IGNORE INTO permission (id, name, parent_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  PERMISSION_TREE.forEach((p, i) => insPerm.run(p.id, p.name, p.parent, i, now));
  db.prepare('INSERT OR IGNORE INTO org (id, name, parent_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(ROOT_ORG_ID, '根组织', null, 0, now);
  db.prepare('INSERT OR IGNORE INTO role (id, name, parent_id, is_system, remark, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(ADMIN_ROLE_ID, '系统管理员', null, 1, '内置角色：拥有全部权限，不可删除', now);
  // 管理员角色授予全部权限（幂等）
  const insRp = db.prepare('INSERT OR IGNORE INTO role_permission (role_id, permission_id) VALUES (?, ?)');
  for (const p of PERMISSION_TREE) insRp.run(ADMIN_ROLE_ID, p.id);
}

// ===== 鉴权模式 =====
export type AuthMode = 'guest' | 'multi';
export function getAuthMode(): AuthMode {
  const raw = (process.env.YZ_AUTH_MODE || '').trim().toLowerCase();
  return raw === 'multi' ? 'multi' : 'guest';
}

// ===== 权限解析 =====
export interface UserIdentity { userId: string; username: string }

/** 收集一个角色的全部权限（含沿角色树向上继承的父角色权限），防环。 */
function collectRolePermissions(roleId: string, out: Set<string>, visited: Set<string>): void {
  if (visited.has(roleId)) return;
  visited.add(roleId);
  for (const r of db.prepare('SELECT permission_id FROM role_permission WHERE role_id = ?').all(roleId) as { permission_id: string }[]) {
    out.add(r.permission_id);
  }
  const role = db.prepare('SELECT parent_id FROM role WHERE id = ?').get(roleId) as { parent_id: string | null } | undefined;
  if (role?.parent_id) collectRolePermissions(role.parent_id, out, visited);
}

/** 收集组织 id 沿 parent 链向上的全部祖先（含自身），防环。 */
function collectOrgAncestors(orgId: string, out: Set<string>): void {
  if (out.has(orgId)) return;
  out.add(orgId);
  const org = db.prepare('SELECT parent_id FROM org WHERE id = ?').get(orgId) as { parent_id: string | null } | undefined;
  if (org?.parent_id) collectOrgAncestors(org.parent_id, out);
}

const permCache = new Map<string, { perms: string[]; at: number }>();
const PERM_CACHE_TTL = 60_000;
export function invalidatePermissionCache(userId?: string): void {
  if (userId) permCache.delete(userId);
  else permCache.clear();
}

/** 用户全量权限：直接角色 ∪ 所属组织（含组织树祖先）绑定的角色（角色树继承）。
 *  ★ 组织树下传（2026-11-01）：给父组织绑的角色，对其子组织成员同样生效 ——
 *    「总部给全公司授权，新开的部门天然继承」是这个模型的基本预期。 */
export function getUserPermissions(userId: string): string[] {
  const hit = permCache.get(userId);
  if (hit && Date.now() - hit.at < PERM_CACHE_TTL) return hit.perms;
  const perms = new Set<string>();
  const roleIds = new Set<string>();
  for (const r of db.prepare('SELECT role_id FROM user_role WHERE user_id = ?').all(userId) as { role_id: string }[]) {
    roleIds.add(r.role_id);
  }
  const orgIds = new Set<string>();
  for (const r of db.prepare('SELECT org_id FROM user_org WHERE user_id = ?').all(userId) as { org_id: string }[]) {
    collectOrgAncestors(r.org_id, orgIds);
  }
  for (const orgId of orgIds) {
    for (const r of db.prepare('SELECT role_id FROM org_role WHERE org_id = ?').all(orgId) as { role_id: string }[]) {
      roleIds.add(r.role_id);
    }
  }
  const visited = new Set<string>();
  for (const rid of roleIds) collectRolePermissions(rid, perms, visited);
  const out = [...perms];
  permCache.set(userId, { perms: out, at: Date.now() });
  return out;
}

export function userHasPermission(userId: string, permissionId: string): boolean {
  const perms = getUserPermissions(userId);
  if (perms.includes(ADMIN_PERMISSION_ID)) return true;
  if (perms.includes(permissionId)) return true;
  // 树形前缀：拥有父节点权限 = 拥有子节点权限（如 admin → admin.user.manage）
  return perms.some((p) => permissionId.startsWith(p + '.'));
}

export function userIsAdmin(userId: string): boolean {
  return userHasPermission(userId, ADMIN_PERMISSION_ID);
}

/**
 * 系统里是否存在除 guest 外的**已配置**用户（决定是否需要首次安装向导）。
 * ★ 首启占位管理员（DEFAULT_ADMIN_ID 且密码为空）不算：否则用户永远看不到
 *   「自己设置密码」这一步，只能对着登录页猜默认密码（2026-11-02 用户实报）。
 */
export function hasRealUsers(): boolean {
  const row = db.prepare(
    "SELECT COUNT(*) AS n FROM user WHERE id <> 'guest' AND NOT (id = ? AND (password_hash IS NULL OR password_hash = ''))",
  ).get(DEFAULT_ADMIN_ID) as { n: number };
  return row.n > 0;
}

/** 用户详情（管理端用）。 */
export function getUserDetail(userId: string) {
  const user = db.prepare('SELECT id, username, email, created_at FROM user WHERE id = ?').get(userId) as any;
  if (!user) return null;
  return {
    ...user,
    orgs: db.prepare(
      'SELECT org.id, org.name, org.parent_id FROM user_org JOIN org ON org.id = user_org.org_id WHERE user_org.user_id = ?',
    ).all(userId),
    roles: db.prepare(
      'SELECT role.id, role.name, role.parent_id, role.is_system FROM user_role JOIN role ON role.id = user_role.role_id WHERE user_role.user_id = ?',
    ).all(userId),
    permissions: getUserPermissions(userId),
  };
}
