/**
 * 插件 ACL 判定（2026-11-01 引入，2026-11-02 抽出来便于真库验证）。
 *
 * 命中规则：直接授权给该用户 / 授权给其任一角色 / 授权给其所属组织（任一）。
 * ★ 曾经这里内联在 /api/plugins 路由里，占位符 4 个却传了 5 个 uid —— better-sqlite3
 *   抛 RangeError，整个插件列表接口 500，前端表现为「所有插件都未启用」。
 *   抽成纯函数后由 plugin-acl.test.ts 用真库覆盖，参数个数错了测试直接红。
 */
import { db } from './db.js';
import { userHasPermission } from './rbac.js';
import { getAuthMode } from './auth.js';

/**
 * 是否**绕过插件 ACL**（看全部插件）。
 *
 * ★ 2026-11-02 补：authMiddleware 在回环地址无 token 时回落 `guest` —— 本机未登录的
 *   桌面实例就是这种情况。若把 guest 也当普通用户做 ACL，本机所有人的模式菜单都会变成
 *   「对应插件未启用」（用户实报「其它模式都没了」）。本机单用户从来不走 ACL；
 *   局域网访客无 token 会在 authMiddleware 就 401，走不到这里。
 */
export function pluginAclBypassed(userId: string): boolean {
  return getAuthMode() === 'guest' || userId === 'guest' || userHasPermission(userId, 'admin.permission.manage');
}

export function isPluginGranted(pluginId: string, userId: string): boolean {
  const hit = db.prepare(
    `SELECT 1 FROM resource_acl WHERE resource_type = 'plugin' AND resource_id = ?
      AND (user_id = ? OR user_id IN (SELECT role_id FROM user_role WHERE user_id = ?)
        OR user_id IN (SELECT role_id FROM org_role WHERE org_id IN (SELECT org_id FROM user_org WHERE user_id = ?)))`,
  ).get(pluginId, userId, userId, userId);
  return !!hit;
}
