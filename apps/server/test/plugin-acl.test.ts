/**
 * 插件 ACL 判定测试（2026-11-02）。
 *
 * ★ 回归锚点：/api/plugins 曾因 ACL 查询「4 个占位符传 5 个参数」抛
 *   RangeError: Too many parameter values —— 整个接口 500，前端所有插件显示「未启用」。
 *   这里用真库跑通三种命中路径，参数个数或 SQL 结构改坏会直接红。
 *
 * 环境坑同 rbac.test.ts：YZ_TEST_FORCE_SQLJS=1 走 sql.js，DATA_DIR 指向临时目录。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.YZ_TEST_FORCE_SQLJS = '1';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'yz-plugin-acl-'));

import { db } from '../src/db.js';
import { seedRbac, ROOT_ORG_ID, invalidatePermissionCache } from '../src/rbac.js';
import { isPluginGranted, pluginAclBypassed } from '../src/plugin-acl.js';

beforeAll(() => {
  seedRbac();
});

function createUser(username: string): string {
  const id = `u_${username}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare("INSERT OR IGNORE INTO user (id, username, email, password_hash, created_at) VALUES (?, ?, NULL, ?, ?)")
    .run(id, username, 'x', Date.now());
  return id;
}

function createRole(name: string): string {
  const id = `role_${name}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare('INSERT INTO role (id, name, parent_id, is_system, remark, created_at) VALUES (?, ?, NULL, 0, NULL, ?)')
    .run(id, name, Date.now());
  return id;
}

function grantPlugin(pluginId: string, principalId: string, principalType: 'user' | 'role' = 'user'): void {
  db.prepare(
    "INSERT INTO resource_acl (resource_type, resource_id, user_id, principal_type, created_at) VALUES ('plugin', ?, ?, ?, ?)",
  ).run(pluginId, principalId, principalType, Date.now());
}

describe('插件 ACL：三种命中路径', () => {
  it('无任何授权 → false，且不因参数个数抛错', () => {
    const uid = createUser('acl_none');
    expect(() => isPluginGranted('plugin-x', uid)).not.toThrow();
    expect(isPluginGranted('plugin-x', uid)).toBe(false);
  });

  it('直接授权给用户 → true', () => {
    const uid = createUser('acl_direct');
    grantPlugin('plugin-direct', uid, 'user');
    expect(isPluginGranted('plugin-direct', uid)).toBe(true);
    expect(isPluginGranted('plugin-other', uid)).toBe(false);
  });

  it('授权给用户角色 → true', () => {
    const uid = createUser('acl_role');
    const roleId = createRole('acl_role');
    db.prepare('INSERT INTO user_role (user_id, role_id, created_at) VALUES (?, ?, ?)').run(uid, roleId, Date.now());
    grantPlugin('plugin-role', roleId, 'role');
    expect(isPluginGranted('plugin-role', uid)).toBe(true);
  });

  it('授权给用户所属组织的角色 → true', () => {
    const uid = createUser('acl_org');
    const orgId = `org_acl_${Math.random().toString(36).slice(2, 8)}`;
    const roleId = createRole('acl_org');
    db.prepare('INSERT INTO org (id, name, parent_id, sort_order, created_at) VALUES (?, ?, ?, 0, ?)')
      .run(orgId, 'ACL 测试组织', ROOT_ORG_ID, Date.now());
    db.prepare('INSERT INTO user_org (user_id, org_id, created_at) VALUES (?, ?, ?)').run(uid, orgId, Date.now());
    db.prepare('INSERT INTO org_role (org_id, role_id, created_at) VALUES (?, ?, ?)').run(orgId, roleId, Date.now());
    grantPlugin('plugin-org', roleId, 'role');
    expect(isPluginGranted('plugin-org', uid)).toBe(true);
  });
});

describe('插件 ACL：谁能绕过（模式菜单消失的根因）', () => {
  it('★ 本机 guest 身份必须绕过 ACL（multi 模式 + 回环无 token）', () => {
    const prev = process.env.YZ_AUTH_MODE;
    process.env.YZ_AUTH_MODE = 'multi';
    try {
      // 不绕过时 /api/plugins 会把所有已启用插件过滤掉 → 前端模式菜单全显示「未启用」
      expect(pluginAclBypassed('guest')).toBe(true);
      const plain = createUser('acl_plain');
      expect(pluginAclBypassed(plain)).toBe(false);
      db.prepare('INSERT OR IGNORE INTO user_role (user_id, role_id, created_at) VALUES (?, ?, ?)')
        .run(plain, 'role_admin', Date.now());
      invalidatePermissionCache(plain); // 权限有缓存，授权后必须失效再断言
      expect(pluginAclBypassed(plain)).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.YZ_AUTH_MODE;
      else process.env.YZ_AUTH_MODE = prev;
    }
  });
});
