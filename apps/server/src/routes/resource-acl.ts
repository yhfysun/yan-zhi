/**
 * 资源定向授权路由（2026-11-01）：GET/PUT 名单 + 可选用户清单。
 * 鉴权：GET/PUT 名单 = 资源 owner，或有对应 share.<type>.publish 权限（管理员统一授权）。
 * 普通用户即使伪造头也只能查/改自己拥有资源的名单 —— 后端逐请求校验。
 */
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import {
  isAclType, getAclPrincipals, setAclUsers, resourceOwner, resourceExists,
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
