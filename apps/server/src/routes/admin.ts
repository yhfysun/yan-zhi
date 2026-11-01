/**
 * 管理后台路由：用户 / 组织 / 角色 / 权限管理。
 * 全部要求对应管理权限（admin.*）；系统管理员（拥有 admin 权限点）拥有一切。
 * 本文件只做管理面 CRUD；数据面隔离（user_id 过滤）仍由各业务路由自己负责。
 */
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import {
  userHasPermission, invalidatePermissionCache, PERMISSION_TREE,
  ROOT_ORG_ID, getUserDetail, getUserPermissions, getAuthMode,
} from '../rbac.js';
import { ensureAgensPlatform } from '../agens-platform/service.js';

const router = Router();
router.use(authMiddleware);

function requirePerm(permissionId: string) {
  return (req: Request, res: Response, next: () => void) => {
    // ★ guest 本地单机模式：本机用户就是管理员（2026-11-01 用户拍板「dev 里也要能看到管理菜单」）——
    //   组织/角色/权限在本地预配好，切到 multi 部署后直接生效。multi 模式维持权限收口不变。
    if (getAuthMode() === 'guest') {
      next();
      return;
    }
    // ★ 管理接口永远按真实登录身份鉴权（req.realUser）：管理员切到某用户视角查看数据时，
    //   管理能力不能跟着丢（否则管理页全 403，2026-11-01 实锤）。
    const actor = (req as any).realUser || req.user;
    if (!actor || !userHasPermission(actor.userId, permissionId)) {
      res.status(403).json({ error: '无权限执行该操作', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
}

function bad(res: Response, msg: string, status = 400) {
  res.status(status).json({ error: msg });
}

// ==================== 用户管理 ====================

router.get('/users', requirePerm('admin.user.manage'), (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT id, username, email, created_at, quota_cost_cny FROM user ORDER BY created_at ASC').all() as any[];
  const usedMap = new Map<string, number>(
    (db.prepare('SELECT user_id, COALESCE(SUM(cost_cny), 0) AS c FROM usage_event GROUP BY user_id').all() as any[])
      .map((r) => [r.user_id, r.c]),
  );
  const list = rows
    .filter((u) => u.id !== 'guest')
    .map((u) => ({
      ...u,
      usedCost: usedMap.get(u.id) || 0,
      orgs: db.prepare(
        'SELECT org.id, org.name FROM user_org JOIN org ON org.id = user_org.org_id WHERE user_org.user_id = ?',
      ).all(u.id),
      roles: db.prepare(
        'SELECT role.id, role.name FROM user_role JOIN role ON role.id = user_role.role_id WHERE user_role.user_id = ?',
      ).all(u.id),
      permissions: getUserPermissions(u.id),
    }));
  res.json({ users: list });
});

router.post('/users', requirePerm('admin.user.manage'), (req: Request, res: Response) => {
  const { username, password, email, orgIds = [], roleIds = [] } = req.body || {};
  if (!username || !password) return bad(res, '用户名和密码为必填项');
  if (String(username).length < 2 || String(username).length > 32) return bad(res, '用户名长度 2-32 字符');
  if (String(password).length < 6) return bad(res, '密码至少 6 位');
  if (db.prepare('SELECT id FROM user WHERE username = ?').get(username)) return bad(res, '该用户名已存在', 409);
  const id = uuid();
  const now = Date.now();
  db.prepare('INSERT INTO user (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, username, email || null, bcrypt.hashSync(password, 10), now);
  const insOrg = db.prepare('INSERT OR IGNORE INTO user_org (user_id, org_id, created_at) VALUES (?, ?, ?)');
  for (const orgId of orgIds) insOrg.run(id, orgId, now);
  const insRole = db.prepare('INSERT OR IGNORE INTO user_role (user_id, role_id, created_at) VALUES (?, ?, ?)');
  for (const roleId of roleIds) insRole.run(id, roleId, now);
  try { ensureAgensPlatform(id); } catch { /* seeding 失败不阻断创建 */ }
  invalidatePermissionCache(id);
  res.json({ user: getUserDetail(id) });
});

router.patch('/users/:id', requirePerm('admin.user.manage'), (req: Request, res: Response) => {
  const target = req.params.id;
  const row = db.prepare('SELECT id FROM user WHERE id = ?').get(target) as { id: string } | undefined;
  if (!row) return bad(res, '用户不存在', 404);
  if (target === 'guest') return bad(res, 'guest 是内置数据归属身份，不可修改', 403);
  const { email, password, orgIds, roleIds, quotaCostCny } = req.body || {};
  if (quotaCostCny !== undefined) {
    // 额度（元）：null = 不限；非负数字生效
    const v = quotaCostCny === null ? null : Number(quotaCostCny);
    if (v !== null && (!Number.isFinite(v) || v < 0)) return bad(res, '额度需为非负数字或 null（不限）');
    db.prepare('UPDATE user SET quota_cost_cny = ? WHERE id = ?').run(v, target);
  }
  if (email !== undefined) db.prepare('UPDATE user SET email = ? WHERE id = ?').run(email || null, target);
  if (password) {
    if (String(password).length < 6) return bad(res, '密码至少 6 位');
    db.prepare('UPDATE user SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), target);
  }
  if (Array.isArray(orgIds)) {
    db.prepare('DELETE FROM user_org WHERE user_id = ?').run(target);
    const ins = db.prepare('INSERT OR IGNORE INTO user_org (user_id, org_id, created_at) VALUES (?, ?, ?)');
    for (const orgId of orgIds) ins.run(target, orgId, Date.now());
  }
  if (Array.isArray(roleIds)) {
    db.prepare('DELETE FROM user_role WHERE user_id = ?').run(target);
    const ins = db.prepare('INSERT OR IGNORE INTO user_role (user_id, role_id, created_at) VALUES (?, ?, ?)');
    for (const roleId of roleIds) ins.run(target, roleId, Date.now());
  }
  invalidatePermissionCache(target);
  res.json({ user: getUserDetail(target) });
});

router.delete('/users/:id', requirePerm('admin.user.manage'), (req: Request, res: Response) => {
  const target = req.params.id;
  if (target === 'guest') return bad(res, 'guest 是内置数据归属身份，不可删除', 403);
  const actor = (req as any).realUser || req.user;
  if (actor && actor.userId === target) return bad(res, '不能删除当前登录的账号', 403);
  const row = db.prepare('SELECT id FROM user WHERE id = ?').get(target) as { id: string } | undefined;
  if (!row) return bad(res, '用户不存在', 404);
  // ★ 级联清理（递归）：user 被十余张业务表外键引用，而这些表的行又被第三层引用
  //   （实锤链条：user → platform → platform_api_key）——只删一层 FOREIGN KEY 仍失败。
  //   通用递归：对外键图做深度删除，按外键**实际列名**（fk.from）删，以后新增表无需登记。
  const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
  const seen = new Set<string>();
  const walk = (table: string, col: string, val: unknown) => {
    const key = `${table}:${String(val)}`;
    if (seen.has(key)) return;
    seen.add(key);
    for (const { name } of allTables) {
      if (name.startsWith('sqlite_')) continue;
      let fks: any[] = [];
      try { fks = db.prepare(`PRAGMA foreign_key_list("${name}")`).all() as any[]; } catch { continue; }
      for (const fk of fks) {
        if (fk.table !== table || (fk.to && fk.to !== col)) continue;
        // 先收集子行 id（供下一层递归），再递归删它们的依赖，最后删自身
        let childIds: any[] = [];
        try {
          const hasId = (db.prepare(`PRAGMA table_info("${name}")`).all() as any[]).some((c) => c.name === 'id');
          if (hasId) childIds = (db.prepare(`SELECT id FROM "${name}" WHERE "${fk.from}" = ?`).all(val) as any[]).map((r) => r.id);
          for (const cid of childIds) walk(name, 'id', cid);
        } catch { /* 无 id 列的关联表无法深递归，直接删行 */ }
        try { db.prepare(`DELETE FROM "${name}" WHERE "${fk.from}" = ?`).run(val); } catch { /* 尽力而为 */ }
      }
    }
  };
  const cascade = db.transaction(() => {
    walk('user', 'id', target);
    db.prepare('DELETE FROM user WHERE id = ?').run(target);
  });
  cascade();
  invalidatePermissionCache(target);
  res.json({ ok: true });
});

// ==================== 组织管理（树形） ====================

router.get('/orgs', requirePerm('admin.org.manage'), (_req: Request, res: Response) => {
  const rows = db.prepare(
    `SELECT o.id, o.name, o.parent_id, o.sort_order, o.created_at,
            (SELECT COUNT(*) FROM user_org WHERE org_id = o.id) AS user_count
       FROM org o ORDER BY o.sort_order ASC, o.created_at ASC`,
  ).all() as any[];
  // 附带每个组织的角色授权（org_role），前端展示/编辑用
  const roleRows = db.prepare('SELECT org_id, role_id FROM org_role').all() as { org_id: string; role_id: string }[];
  const roleMap = new Map<string, string[]>();
  for (const r of roleRows) {
    const list = roleMap.get(r.org_id) || [];
    list.push(r.role_id);
    roleMap.set(r.org_id, list);
  }
  res.json({ orgs: rows.map((o) => ({ ...o, role_ids: roleMap.get(o.id) || [] })) });
});

router.post('/orgs', requirePerm('admin.org.manage'), (req: Request, res: Response) => {
  const { name, parentId = null, sortOrder = 0 } = req.body || {};
  if (!name || !String(name).trim()) return bad(res, '组织名称为必填项');
  if (parentId) {
    const parent = db.prepare('SELECT id FROM org WHERE id = ?').get(parentId);
    if (!parent) return bad(res, '父组织不存在', 404);
  }
  const id = uuid();
  db.prepare('INSERT INTO org (id, name, parent_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, String(name).trim(), parentId, Number(sortOrder) || 0, Date.now());
  res.json({ org: db.prepare('SELECT * FROM org WHERE id = ?').get(id) });
});

router.patch('/orgs/:id', requirePerm('admin.org.manage'), (req: Request, res: Response) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM org WHERE id = ?').get(id) as any;
  if (!row) return bad(res, '组织不存在', 404);
  if (id === ROOT_ORG_ID && req.body?.parentId) return bad(res, '根组织不可挂到其它组织下', 403);
  const { name, parentId, sortOrder } = req.body || {};
  if (parentId) {
    if (parentId === id) return bad(res, '父组织不能是自己');
    // 防环：新父不能在自己子树里
    let cursor: string | null = parentId as string;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === id) return bad(res, '不能把组织挂到自己的子组织下');
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const p = db.prepare('SELECT parent_id FROM org WHERE id = ?').get(cursor) as { parent_id: string | null } | undefined;
      cursor = p?.parent_id ?? null;
    }
  }
  db.prepare('UPDATE org SET name = ?, parent_id = ?, sort_order = ? WHERE id = ?').run(
    name !== undefined ? String(name).trim() : row.name,
    parentId !== undefined ? parentId : row.parent_id,
    sortOrder !== undefined ? Number(sortOrder) || 0 : row.sort_order,
    id,
  );
  invalidatePermissionCache();
  res.json({ org: db.prepare('SELECT * FROM org WHERE id = ?').get(id) });
});

router.delete('/orgs/:id', requirePerm('admin.org.manage'), (req: Request, res: Response) => {
  const id = req.params.id;
  if (id === ROOT_ORG_ID) return bad(res, '根组织不可删除', 403);
  const child = db.prepare('SELECT id FROM org WHERE parent_id = ? LIMIT 1').get(id);
  if (child) return bad(res, '请先删除或移走子组织');
  db.prepare('DELETE FROM org_role WHERE org_id = ?').run(id);
  db.prepare('DELETE FROM user_org WHERE org_id = ?').run(id);
  db.prepare('DELETE FROM org WHERE id = ?').run(id);
  invalidatePermissionCache();
  res.json({ ok: true });
});

// 组织 ↔ 角色授权
router.put('/orgs/:id/roles', requirePerm('admin.org.manage'), (req: Request, res: Response) => {
  const id = req.params.id;
  const row = db.prepare('SELECT id FROM org WHERE id = ?').get(id);
  if (!row) return bad(res, '组织不存在', 404);
  const { roleIds = [] } = req.body || {};
  db.prepare('DELETE FROM org_role WHERE org_id = ?').run(id);
  const ins = db.prepare('INSERT OR IGNORE INTO org_role (org_id, role_id, created_at) VALUES (?, ?, ?)');
  for (const roleId of roleIds) ins.run(id, roleId, Date.now());
  invalidatePermissionCache();
  res.json({ ok: true, roleIds });
});

// ==================== 角色管理（树形） ====================

router.get('/roles', requirePerm('admin.role.manage'), (_req: Request, res: Response) => {
  const roles = db.prepare(
    `SELECT r.*, (SELECT COUNT(*) FROM role_permission WHERE role_id = r.id) AS permission_count
       FROM role r ORDER BY r.created_at ASC`,
  ).all();
  const bindings = db.prepare('SELECT role_id, permission_id FROM role_permission').all();
  res.json({ roles, bindings });
});

router.post('/roles', requirePerm('admin.role.manage'), (req: Request, res: Response) => {
  const { name, parentId = null, remark = null, permissionIds = [] } = req.body || {};
  if (!name || !String(name).trim()) return bad(res, '角色名称为必填项');
  if (parentId) {
    const parent = db.prepare('SELECT id FROM role WHERE id = ?').get(parentId);
    if (!parent) return bad(res, '父角色不存在', 404);
  }
  const id = uuid();
  const now = Date.now();
  db.prepare('INSERT INTO role (id, name, parent_id, is_system, remark, created_at) VALUES (?, ?, ?, 0, ?, ?)')
    .run(id, String(name).trim(), parentId, remark, now);
  const ins = db.prepare('INSERT OR IGNORE INTO role_permission (role_id, permission_id) VALUES (?, ?)');
  for (const pid of permissionIds) ins.run(id, pid);
  invalidatePermissionCache();
  res.json({ role: db.prepare('SELECT * FROM role WHERE id = ?').get(id) });
});

router.patch('/roles/:id', requirePerm('admin.role.manage'), (req: Request, res: Response) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM role WHERE id = ?').get(id) as any;
  if (!row) return bad(res, '角色不存在', 404);
  if (row.is_system && (req.body?.name || req.body?.parentId !== undefined || req.body?.delete)) {
    return bad(res, '内置系统角色不可修改名称/层级，仅可调整权限', 403);
  }
  const { name, parentId, remark, permissionIds } = req.body || {};
  if (parentId) {
    if (parentId === id) return bad(res, '父角色不能是自己');
    let cursor: string | null = parentId as string;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === id) return bad(res, '不能把角色挂到自己的子角色下');
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const p = db.prepare('SELECT parent_id FROM role WHERE id = ?').get(cursor) as { parent_id: string | null } | undefined;
      cursor = p?.parent_id ?? null;
    }
  }
  db.prepare('UPDATE role SET name = ?, parent_id = ?, remark = ? WHERE id = ?').run(
    name !== undefined ? String(name).trim() : row.name,
    parentId !== undefined ? parentId : row.parent_id,
    remark !== undefined ? remark : row.remark,
    id,
  );
  if (Array.isArray(permissionIds)) {
    db.prepare('DELETE FROM role_permission WHERE role_id = ?').run(id);
    const ins = db.prepare('INSERT OR IGNORE INTO role_permission (role_id, permission_id) VALUES (?, ?)');
    for (const pid of permissionIds) ins.run(id, pid);
  }
  invalidatePermissionCache();
  res.json({ role: db.prepare('SELECT * FROM role WHERE id = ?').get(id) });
});

router.delete('/roles/:id', requirePerm('admin.role.manage'), (req: Request, res: Response) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM role WHERE id = ?').get(id) as any;
  if (!row) return bad(res, '角色不存在', 404);
  if (row.is_system) return bad(res, '内置系统角色不可删除', 403);
  const child = db.prepare('SELECT id FROM role WHERE parent_id = ? LIMIT 1').get(id);
  if (child) return bad(res, '请先删除或移走子角色');
  db.prepare('DELETE FROM role_permission WHERE role_id = ?').run(id);
  db.prepare('DELETE FROM user_role WHERE role_id = ?').run(id);
  db.prepare('DELETE FROM org_role WHERE role_id = ?').run(id);
  db.prepare('DELETE FROM role WHERE id = ?').run(id);
  invalidatePermissionCache();
  res.json({ ok: true });
});

// ==================== 权限目录（只读，供角色授权勾选） ====================

router.get('/permissions', requirePerm('admin.role.manage'), (_req: Request, res: Response) => {
  res.json({ permissions: PERMISSION_TREE });
});

export default router;
