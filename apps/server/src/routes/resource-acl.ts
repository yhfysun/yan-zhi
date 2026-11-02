/**
 * 资源定向授权路由（2026-11-01）：GET/PUT 名单 + 可选用户清单。
 * 鉴权：GET/PUT 名单 = 资源 owner，或有对应 share.<type>.publish 权限（管理员统一授权）。
 * 普通用户即使伪造头也只能查/改自己拥有资源的名单 —— 后端逐请求校验。
 */
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import {
  isAclType, getAclPrincipals, setAclUsers, resourceOwner, resourceExists, agentDependencyGrants,
} from '../services/resource-acl.js';
import { userHasPermission, invalidatePermissionCache } from '../rbac.js';

const router = Router();
router.use(authMiddleware);

const SHARE_PERM: Record<string, string> = {
  agent: 'share.agent.publish',
  model: 'share.model.publish',
  skill: 'share.skill.publish',
  tool: 'share.tool.publish',
  platform: 'share.platform.publish',
  plugin: 'admin.permission.manage',
};

function canManageAcl(req: Request, type: string, id: string): boolean {
  const owner = resourceOwner(type as any, id);
  const uid = req.user!.userId;
  if (owner && owner === uid) return true;
  const perm = SHARE_PERM[type];
  return !!perm && userHasPermission(uid, perm);
}

// ── 角色视角批量配置（2026-11-01 用户拍板「在角色里添加智能体/模型/工具/插件」）──
// 数据仍落在 resource_acl（principal_type='role'），与资源侧的"授权名单"完全同源互认。

/** 全部资源目录（管理员配置角色时勾选用）：不分用户，含所有私有资源 */
router.get('/catalog', (req: Request, res: Response) => {
  const uid = req.user!.userId;
  if (!userHasPermission(uid, 'admin.permission.manage') && !userHasPermission(uid, 'admin.user.manage')) {
    res.status(403).json({ error: '无权限', code: 'FORBIDDEN' }); return;
  }
  const pick = (sql: string) => (db.prepare(sql).all() as any[]);
  res.json({
    catalog: {
      agent: pick("SELECT id, name, COALESCE(NULLIF(category, ''), '未分类') AS category FROM agent WHERE is_builtin != 1 OR is_builtin IS NULL ORDER BY created_at DESC"),
      model: pick("SELECT m.id, COALESCE(NULLIF(m.alias, ''), m.model_id) AS name, COALESCE(p.name, '未知平台') AS platform FROM model m LEFT JOIN platform p ON p.id = m.platform_id WHERE m.id NOT LIKE 'local-model-%' ORDER BY p.name, m.id"),
      skill: pick('SELECT id, name FROM skill ORDER BY created_at DESC'),
      tool: pick('SELECT id, name FROM custom_tool ORDER BY created_at DESC'),
      plugin: pick("SELECT id, json_extract(manifest, '$.name') AS name, json_extract(manifest, '$.category') AS category FROM plugin WHERE state = 'enabled' ORDER BY id"),
    },
  });
});

/** 角色当前被授权的资源（按类型分组） */
router.get('/role/:roleId', (req: Request, res: Response) => {
  const uid = req.user!.userId;
  if (!userHasPermission(uid, 'admin.permission.manage') && !userHasPermission(uid, 'admin.user.manage')) {
    res.status(403).json({ error: '无权限', code: 'FORBIDDEN' }); return;
  }
  const roleId = req.params.roleId;
  const rows = db.prepare(
    "SELECT resource_type, resource_id FROM resource_acl WHERE principal_type = 'role' AND user_id = ?",
  ).all(roleId) as any[];
  const grants: Record<string, string[]> = { agent: [], model: [], skill: [], tool: [], plugin: [], platform: [] };
  for (const r of rows) (grants[r.resource_type] = grants[r.resource_type] || []).push(r.resource_id);
  res.json({ grants });
});

/** 覆盖式保存角色的资源授权（diff：只增删变化的行；不动 user 主体的 ACL 行） */
router.put('/role/:roleId', (req: Request, res: Response) => {
  const uid = req.user!.userId;
  if (!userHasPermission(uid, 'admin.permission.manage') && !userHasPermission(uid, 'admin.user.manage')) {
    res.status(403).json({ error: '无权限', code: 'FORBIDDEN' }); return;
  }
  const roleId = req.params.roleId;
  if (!db.prepare('SELECT 1 FROM role WHERE id = ?').get(roleId)) {
    res.status(404).json({ error: '角色不存在' }); return;
  }
  const grants = (req.body?.grants || {}) as Record<string, string[]>;
  const wanted = new Set<string>();
  for (const [type, ids] of Object.entries(grants)) {
    if (!isAclType(type)) continue;
    for (const id of ids || []) {
      if (typeof id === 'string' && id && resourceExists(type, id)) wanted.add(`${type}:${id}`);
    }
  }
  // ★ 智能体依赖级联（与资源侧名单同口径）：授角色 = 角色下所有人自动获得其模型/平台/
  //   工具/Skill/子智能体，否则角色视角配好的智能体打开仍是残缺的。
  for (const key of [...wanted]) {
    const [type, id] = key.split(':');
    if (type !== 'agent') continue;
    for (const d of agentDependencyGrants(id)) wanted.add(`${d.type}:${d.id}`);
  }
  const existingRows = db.prepare(
    "SELECT resource_type, resource_id FROM resource_acl WHERE principal_type = 'role' AND user_id = ?",
  ).all(roleId) as any[];
  const existing = new Set(existingRows.map((r) => `${r.resource_type}:${r.resource_id}`));
  const del = db.prepare("DELETE FROM resource_acl WHERE principal_type = 'role' AND user_id = ? AND resource_type = ? AND resource_id = ?");
  const ins = db.prepare("INSERT OR IGNORE INTO resource_acl (resource_type, resource_id, user_id, principal_type, created_at) VALUES (?, ?, ?, 'role', ?)");
  const tx = db.transaction(() => {
    for (const key of existing) {
      if (!wanted.has(key)) {
        const [t, i] = key.split(':');
        del.run(roleId, t, i);
      }
    }
    const now = Date.now();
    for (const key of wanted) {
      if (!existing.has(key)) {
        const [t, i] = key.split(':');
        ins.run(t, i, roleId, now);
      }
    }
  });
  tx();
  res.json({ ok: true, count: wanted.size });
});

router.get('/user-options', (req: Request, res: Response) => {
  const uid = req.user!.userId;
  // share.* 任一权限 或 admin.user.manage 才能枚举用户/角色（否则无意义也泄露名单）
  const allowed = Object.values(SHARE_PERM).some((p) => userHasPermission(uid, p))
    || userHasPermission(uid, 'admin.user.manage');
  if (!allowed) { res.status(403).json({ error: '无权限', code: 'FORBIDDEN' }); return; }
  const users = db.prepare("SELECT id, username FROM user WHERE id != 'guest' ORDER BY username").all();
  const roles = db.prepare('SELECT id, name FROM role ORDER BY name').all();
  res.json({ users, roles });
});

router.get('/:type/:id', (req: Request, res: Response) => {
  const { type, id } = req.params;
  if (!isAclType(type)) { res.status(400).json({ error: '未知资源类型' }); return; }
  if (!canManageAcl(req, type, id)) { res.status(403).json({ error: '无权限查看该资源的授权名单', code: 'FORBIDDEN' }); return; }
  res.json(getAclPrincipals(type, id));
});

router.put('/:type/:id', (req: Request, res: Response) => {
  const { type, id } = req.params;
  if (!isAclType(type)) { res.status(400).json({ error: '未知资源类型' }); return; }
  if (!resourceExists(type, id)) { res.status(404).json({ error: '资源不存在' }); return; }
  if (!canManageAcl(req, type, id)) { res.status(403).json({ error: '无权限修改该资源的授权名单', code: 'FORBIDDEN' }); return; }
  const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds.map(String) : [];
  const roleIds = Array.isArray(req.body?.roleIds) ? req.body.roleIds.map(String) : [];
  const n = setAclUsers(type, id, { userIds, roleIds });
  // 名单变更影响目标用户/角色的可见权限缓存，失效之
  for (const u of userIds) { try { invalidatePermissionCache(u); } catch { /* ignore */ } }
  for (const r of roleIds) { try { invalidatePermissionCache(r); } catch { /* ignore */ } }
  res.json({ ok: true, count: n });
});


export default router;
