/**
 * 资源定向授权（ACL，2026-11-01 用户拍板「我给某个人只授权一两个智能体」）：
 *   资源可见性 = owner ∪ is_public（共享给所有人）∪ ACL 名单（定向授权给某几个人）；
 *   写操作永远归 owner（ACL 只授"可用"，不授"可改"）。
 * 统一收口：resource_acl 表 + 本服务的类型白名单/读写接口，各业务路由的可见性 SQL
 * 用 aclExistsSql() 拼 EXISTS 子查询。防逐路由自造名单存储。
 */
import { db } from '../db.js';

export const ACL_TYPES = ['agent', 'model', 'skill', 'tool', 'platform', 'plugin'] as const;
export type AclType = (typeof ACL_TYPES)[number];

const RESOURCE_TABLE: Record<AclType, string> = {
  agent: 'agent',
  model: 'model',
  skill: 'skill',
  tool: 'custom_tool',
  platform: 'platform',
  plugin: 'plugin',
};

export function isAclType(t: string): t is AclType {
  return (ACL_TYPES as readonly string[]).includes(t);
}

/** 资源存在性校验（防给不存在的 id 发授权） */
export function resourceExists(type: AclType, id: string): boolean {
  return !!db.prepare(`SELECT 1 FROM "${RESOURCE_TABLE[type]}" WHERE id = ?`).get(id);
}

/** 名单拆分：user 主体 / role 主体（角色授权即批量，角色下所有用户生效） */
export function getAclPrincipals(type: AclType, id: string): { userIds: string[]; roleIds: string[] } {
  const rows = db.prepare(
    'SELECT user_id, principal_type FROM resource_acl WHERE resource_type = ? AND resource_id = ? ORDER BY created_at',
  ).all(type, id) as any[];
  return {
    userIds: rows.filter((r) => (r.principal_type || 'user') === 'user').map((r) => r.user_id),
    roleIds: rows.filter((r) => r.principal_type === 'role').map((r) => r.user_id),
  };
}

/** 兼容旧调用：全部主体 id（用户 + 角色） */
export function getAclUserIds(type: AclType, id: string): string[] {
  return (db.prepare('SELECT user_id FROM resource_acl WHERE resource_type = ? AND resource_id = ? ORDER BY created_at')
    .all(type, id) as any[]).map((r) => r.user_id);
}

/** 覆盖式设置名单（owner 或管理员调用）；用户不存在/为 guest 的项自动剔除 */
export function setAclUsers(
  type: AclType, id: string,
  principals: { userIds?: string[]; roleIds?: string[] },
): number {
  const users = [...new Set(principals.userIds || [])].filter((u) => u && u !== 'guest'
    && db.prepare('SELECT 1 FROM user WHERE id = ?').get(u));
  const roles = [...new Set(principals.roleIds || [])].filter((r) => r
    && db.prepare('SELECT 1 FROM role WHERE id = ?').get(r));
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM resource_acl WHERE resource_type = ? AND resource_id = ?').run(type, id);
    const ins = db.prepare(
      'INSERT OR IGNORE INTO resource_acl (resource_type, resource_id, user_id, principal_type, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    const now = Date.now();
    for (const u of users) ins.run(type, id, u, 'user', now);
    for (const r of roles) ins.run(type, id, r, 'role', now);
    // ★ 智能体依赖自动跟随（2026-11-01）：授权智能体时，其模型/平台/工具/Skill/子智能体
    //   同步授给名单中的每个主体 —— 否则对方打开智能体是残缺的（引用资源不可见）。
    if (type === 'agent') {
      const deps = agentDependencyGrants(id);
      for (const d of deps) {
        for (const u of users) ins.run(d.type, d.id, u, 'user', now);
        for (const r of roles) ins.run(d.type, d.id, r, 'role', now);
      }
    }
  });
  tx();
  return users.length + roles.length;
}

/**
 * 智能体依赖展开（2026-11-01 用户要求「授权的智能体上面的默认工具/Skill/模型要自动带上」）：
 * 授予智能体 = 自动授予其引用的 模型（model_id + 候选池）/ 平台 / 自定义工具 / Skill /
 * 子智能体（递归，子智能体的依赖同样展开）。内置工具是代码内置全员可用，无需 ACL。
 * 幂等（INSERT OR IGNORE）；取消智能体授权时依赖行保留（多授无害，不影响安全）。
 */
export function agentDependencyGrants(agentId: string): Array<{ type: AclType; id: string }> {
  const out = new Map<string, { type: AclType; id: string }>();
  const seenAgent = new Set<string>();
  const parseArr = (raw: unknown): string[] => {
    try {
      const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch { return []; }
  };
  const walk = (aid: string): void => {
    if (seenAgent.has(aid)) return;
    seenAgent.add(aid);
    const a = db.prepare(
      'SELECT platform_id, model_id, custom_tool_ids, skill_ids, sub_agent_ids, model_pools_json FROM agent WHERE id = ?',
    ).get(aid) as any;
    if (!a) return;
    const add = (type: AclType, id: unknown): void => {
      if (!id || typeof id !== 'string') return;
      if (!resourceExists(type, id)) return;
      out.set(`${type}:${id}`, { type, id });
    };
    // ★ 授模型必须连带其所属平台（agent 只传 modelId 时 platform_id 列可能为空）——
    //   否则模型可见但平台不可见，loadPlatform 仍拒绝（首启实锤）。
    const add2 = (type: AclType, id: unknown): boolean => {
      if (!id || typeof id !== 'string') return false;
      if (!resourceExists(type, id)) return false;
      out.set(`${type}:${id}`, { type, id });
      return true;
    };
    if (a.platform_id) add('platform', a.platform_id);
    if (a.model_id) { if (add2('model', a.model_id)) { const m = db.prepare('SELECT platform_id FROM model WHERE id = ?').get(a.model_id) as any; if (m?.platform_id) add('platform', m.platform_id); } }
    try {
      const pools = typeof a.model_pools_json === 'string' ? JSON.parse(a.model_pools_json || '{}') : (a.model_pools_json || {});
      for (const list of Object.values(pools || {})) {
        if (!Array.isArray(list)) continue;
        for (const e of list) {
          if (e?.platformId) add('platform', e.platformId);
          if (e?.modelId) { if (add2('model', e.modelId)) { const m = db.prepare('SELECT platform_id FROM model WHERE id = ?').get(e.modelId) as any; if (m?.platform_id) add('platform', m.platform_id); } }
        }
      }
    } catch { /* 候选池损坏 → 忽略该部分 */ }
    for (const t of parseArr(a.custom_tool_ids)) add('tool', t);
    for (const sk of parseArr(a.skill_ids)) add('skill', sk);
    for (const sid of parseArr(a.sub_agent_ids)) { add('agent', sid); walk(sid); }
  };
  walk(agentId);
  return [...out.values()];
}

/**
 * 可见性判断的名单 SQL 片段：当前请求者命中名单的方式有三种 ——
 *   ① 主体就是该用户（user 名单）② 主体是用户直接绑定的角色 ③ 主体是用户所属组织被授权的角色。
 *   返回的片段带 3 个同值参数（调用方按顺序追加 userId ×3）。
 */
export function aclExistsSql(type: AclType, idExpr: string): string {
  return `EXISTS (SELECT 1 FROM resource_acl _acl WHERE _acl.resource_type = '${type}' AND _acl.resource_id = ${idExpr}
      AND (_acl.user_id = ?
        OR _acl.user_id IN (SELECT role_id FROM user_role WHERE user_id = ?)
        OR _acl.user_id IN (SELECT role_id FROM org_role WHERE org_id IN (SELECT org_id FROM user_org WHERE user_id = ?))))`;
}

export function aclUsersOf(type: AclType, id: string): Array<{ id: string; username: string }> {
  return db.prepare(
    `SELECT u.id, u.username FROM resource_acl a JOIN user u ON u.id = a.user_id
      WHERE a.resource_type = ? AND a.resource_id = ? ORDER BY a.created_at`,
  ).all(type, id) as any[];
}

/** 资源 owner（用于鉴权"只有 owner/管理员能改名单"） */
export function resourceOwner(type: AclType, id: string): string | null {
  const row = db.prepare(`SELECT user_id AS uid FROM "${RESOURCE_TABLE[type]}" WHERE id = ?`).get(id) as any;
  return row?.uid ?? null;
}
