/**
 * 共享模型平台（is_public）—— 管理员统一创建、授权给所有用户使用的平台。
 *
 * 语义（用户拍板 2026-11-01）：平台/模型有些本来就是**管理员统一创建**给大家用的
 * （is_public=1），这些平台对全部用户**可见可用**（读 + 引擎调用），但**写仍归 owner**
 * （改配置/删平台/加模型只有 owner 能做）。把平台设为公共需要 `share.platform.publish`
 * 权限（guest 单机模式视为自己就是管理员，恒可）。
 *
 * ★ 唯一收口：所有"共享豁免"的 SQL 片段都引用本文件的常量，不要散写子查询 ——
 *   以后改共享语义（如按组织共享）只改这里。
 */
import { db } from '../db.js';
import { aclExistsSql } from './resource-acl.js';
import { getAuthMode, userHasPermission } from '../rbac.js';

/** 共享平台 id 子查询（SQL 片段，用于 `x ${SHARED_PLATFORM_IN_SQL}`）。 */
export const SHARED_PLATFORM_IN_SQL = 'IN (SELECT id FROM platform WHERE is_public = 1)';

/** 可共享实体 → 权限点（multi 模式逐类收口；seedRbac 幂等给 admin 角色补全部权限点）。 */
export type ShareableKind = 'agent' | 'platform' | 'model' | 'skill' | 'tool';
const SHARE_PERMS: Record<ShareableKind, string> = {
  agent: 'share.agent.publish',
  platform: 'share.platform.publish',
  model: 'share.model.publish',
  skill: 'share.skill.publish',
  tool: 'share.tool.publish',
};

/** 当前用户能否把某类实体设为公共（multi 模式查权限；guest 单机自己就是管理员，恒可）。 */
export function canPublishShared(kind: ShareableKind, userId: string): boolean {
  if (getAuthMode() === 'guest') return true;
  return userHasPermission(userId, SHARE_PERMS[kind]);
}

/** 平台可读条件：自己的或共享的或被定向授权的（userExpr/idExpr 带 alias 前缀，如 'p.user_id'）。 */
export function platformReadableCond(userExpr: string, idExpr: string): string {
  // ACL（2026-11-01）：被定向授权的平台（含智能体依赖级联授予的）同样可读 —— 4 个参数（userId×4）
  return `(${userExpr} = ? OR ${idExpr} IN (SELECT id FROM platform WHERE is_public = 1) OR ${aclExistsSql('platform', idExpr)})`;
}

/** 当前用户能否把平台设为/取消公共（multi 模式需 share.platform.publish 权限；guest 单机恒可）。 */
export function canPublishSharedPlatform(userId: string): boolean {
  if (getAuthMode() === 'guest') return true;
  return userHasPermission(userId, 'share.platform.publish');
}

/** 平台是否共享（幂等读取，is_public 列可能不存在于极老库 → 视为 0）。 */
export function isPlatformShared(platformId: string): boolean {
  try {
    const row = db.prepare('SELECT is_public FROM platform WHERE id = ?').get(platformId) as { is_public?: number } | undefined;
    return !!row?.is_public;
  } catch {
    return false;
  }
}
