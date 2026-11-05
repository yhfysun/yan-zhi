/**
 * RBAC（组织/角色/权限/多用户鉴权）测试（2026-11-01）。
 *
 * 两层：
 *  ① 行为级（真 sqlite/sql.js）：seedRbac 幂等、权限解析（直接角色 ∪ 组织角色 ∪ 角色树继承）、
 *     admin 权限点拥有一切、树形前缀判定。
 *  ② 锚点：authMiddleware 必须「先判回环/模式、再解析 token」（2026-09-13 教训的守门）；
 *     agents PATCH 的 is_public 权限收口；admin 路由必须逐个 requirePerm。
 *
 * 环境坑继承 conversation-lifecycle.test.ts：YZ_TEST_FORCE_SQLJS=1 走 sql.js（better-sqlite3
 * ABI 懒加载），DATA_DIR 指向临时目录，避免污染真实 %APPDATA%/yan-zhi 库。
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';

process.env.YZ_TEST_FORCE_SQLJS = '1';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'yz-rbac-test-'));

import { db } from '../src/db.js';
import {
  seedRbac, getUserPermissions, userHasPermission, userIsAdmin, hasRealUsers,
  invalidatePermissionCache, ROOT_ORG_ID, ADMIN_ROLE_ID, PERMISSION_TREE,
} from '../src/rbac.js';
import { wsUpgradeAuthorized, resolveWsUserId } from '../src/auth.js';

const AUTH_SRC = readFileSync(new URL('../src/auth.ts', import.meta.url), 'utf8');
const AGENTS_SRC = readFileSync(new URL('../src/routes/agents.ts', import.meta.url), 'utf8');
const ADMIN_SRC = readFileSync(new URL('../src/routes/admin.ts', import.meta.url), 'utf8');

/** 建测试用户（绕过 bcrypt/auth 路由，直接落库）。 */
function createUser(username: string): string {
  const id = `u_${username}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare("INSERT OR IGNORE INTO user (id, username, email, password_hash, created_at) VALUES (?, ?, NULL, ?, ?)")
    .run(id, username, 'x', Date.now());
  return id;
}

beforeAll(() => {
  seedRbac();
});

describe('① seedRbac 幂等 + 种子完整性', () => {
  it('重复执行不报错、不重复插行', () => {
    const before = (db.prepare('SELECT COUNT(*) AS n FROM permission').get() as any).n;
    seedRbac();
    const after = (db.prepare('SELECT COUNT(*) AS n FROM permission').get() as any).n;
    expect(after).toBe(before);
  });
  it('权限树含 menu.*（与 MODE_DEFS 模式 key 对齐）与管理权限点', () => {
    const ids = PERMISSION_TREE.map((p) => p.id);
    for (const k of ['menu.office', 'menu.wf', 'menu.dev', 'menu.clip', 'menu.ops', 'menu.sec', 'menu.shop', 'admin.user.manage', 'share.agent.publish']) {
      expect(ids, k).toContain(k);
    }
  });
  it('根组织与系统管理员角色存在，管理员角色拥有全部权限', () => {
    expect(db.prepare('SELECT id FROM org WHERE id = ?').get(ROOT_ORG_ID)).toBeTruthy();
    const role = db.prepare('SELECT is_system FROM role WHERE id = ?').get(ADMIN_ROLE_ID) as any;
    expect(role?.is_system).toBe(1);
    const n = (db.prepare('SELECT COUNT(*) AS n FROM role_permission WHERE role_id = ?').get(ADMIN_ROLE_ID) as any).n;
    expect(n).toBe(PERMISSION_TREE.length);
  });
  it('guest 不算真实用户（决定 setupRequired）', () => {
    expect(hasRealUsers()).toBe(false);
    createUser('someone_setup_probe');
    expect(hasRealUsers()).toBe(true);
  });
});

describe('② 权限解析：直接角色 ∪ 组织角色 ∪ 角色树继承', () => {
  it('直接绑角色 → 拥有其权限', () => {
    const uid = createUser('perm_direct');
    db.prepare("INSERT INTO role (id, name, parent_id, is_system, remark, created_at) VALUES ('role_test_a', '测试A', NULL, 0, NULL, ?)").run(Date.now());
    db.prepare("INSERT INTO role_permission (role_id, permission_id) VALUES ('role_test_a', 'menu.office')").run();
    db.prepare('INSERT OR IGNORE INTO user_role (user_id, role_id, created_at) VALUES (?, ?, ?)').run(uid, 'role_test_a', Date.now());
    expect(userHasPermission(uid, 'menu.office')).toBe(true);
    expect(userHasPermission(uid, 'menu.dev')).toBe(false);
  });

  it('子角色继承父角色权限（角色树）', () => {
    const uid = createUser('perm_child');
    db.prepare("INSERT INTO role (id, name, parent_id, is_system, remark, created_at) VALUES ('role_test_child', '子角色', 'role_test_a', 0, NULL, ?)").run(Date.now());
    db.prepare('INSERT OR IGNORE INTO user_role (user_id, role_id, created_at) VALUES (?, ?, ?)').run(uid, 'role_test_child', Date.now());
    // 子角色没直接绑 menu.office，但父角色 role_test_a 有 → 继承
    expect(userHasPermission(uid, 'menu.office')).toBe(true);
  });

  it('组织绑定角色 → 组织成员继承（org_role 路径）', () => {
    const uid = createUser('perm_org');
    db.prepare("INSERT INTO org (id, name, parent_id, sort_order, created_at) VALUES ('org_test_1', '测试部', ?, 0, ?)").run(ROOT_ORG_ID, Date.now());
    db.prepare("INSERT INTO role (id, name, parent_id, is_system, remark, created_at) VALUES ('role_test_b', '测试B', NULL, 0, NULL, ?)").run(Date.now());
    db.prepare("INSERT INTO role_permission (role_id, permission_id) VALUES ('role_test_b', 'menu.knowledge')").run();
    db.prepare('INSERT OR IGNORE INTO user_org (user_id, org_id, created_at) VALUES (?, ?, ?)').run(uid, 'org_test_1', Date.now());
    db.prepare('INSERT OR IGNORE INTO org_role (org_id, role_id, created_at) VALUES (?, ?, ?)').run('org_test_1', 'role_test_b', Date.now());
    expect(userHasPermission(uid, 'menu.knowledge')).toBe(true);
  });

  it('组织树下传：父组织绑定的角色对子组织成员生效', () => {
    const uid = createUser('perm_orgtree');
    // org_test_2 挂在 org_test_1（上一用例已建）之下；角色绑在**父**组织 org_test_1 上
    db.prepare("INSERT INTO org (id, name, parent_id, sort_order, created_at) VALUES ('org_test_2', '子部门', 'org_test_1', 0, ?)").run(Date.now());
    db.prepare('INSERT OR IGNORE INTO user_org (user_id, org_id, created_at) VALUES (?, ?, ?)').run(uid, 'org_test_2', Date.now());
    // role_test_b 绑在父组织 org_test_1 → 子组织成员继承 menu.knowledge
    expect(userHasPermission(uid, 'menu.knowledge')).toBe(true);
    // 沿祖先链继续上溯到根：给根组织再绑一个角色也能被孙子成员继承
    db.prepare("INSERT INTO role (id, name, parent_id, is_system, remark, created_at) VALUES ('role_test_root', '测试根', NULL, 0, NULL, ?)").run(Date.now());
    db.prepare("INSERT INTO role_permission (role_id, permission_id) VALUES ('role_test_root', 'menu.memory')").run();
    db.prepare('INSERT OR IGNORE INTO org_role (org_id, role_id, created_at) VALUES (?, ?, ?)').run(ROOT_ORG_ID, 'role_test_root', Date.now());
    // ★ 授权变更必须失效缓存（管理路由写路径都会调 invalidatePermissionCache），这里模拟同一行为
    invalidatePermissionCache(uid);
    expect(userHasPermission(uid, 'menu.memory')).toBe(true);
    // 没授权的权限点依然没有
    expect(userHasPermission(uid, 'menu.dev')).toBe(false);
  });

  it('树形前缀：拥有 admin 父权限点 ⇒ 拥有 admin.* 子权限点', () => {
    const uid = createUser('perm_prefix');
    db.prepare("INSERT INTO role (id, name, parent_id, is_system, remark, created_at) VALUES ('role_test_c', '测试C', NULL, 0, NULL, ?)").run(Date.now());
    db.prepare("INSERT INTO role_permission (role_id, permission_id) VALUES ('role_test_c', 'admin')").run();
    db.prepare('INSERT OR IGNORE INTO user_role (user_id, role_id, created_at) VALUES (?, ?, ?)').run(uid, 'role_test_c', Date.now());
    expect(userHasPermission(uid, 'admin.user.manage')).toBe(true);
    expect(userIsAdmin(uid)).toBe(true);
    // ★ 设计语义：admin 权限点 = 超级管理员，拥有一切权限（含全部 menu.*）。
    //   「角色只给部分菜单」应勾选具体子权限点而非 admin 组（admin 组本身不可勾进普通角色）。
    expect(userHasPermission(uid, 'menu.dev')).toBe(true);
  });

  it('无任何授权的用户无权限', () => {
    const uid = createUser('perm_none');
    expect(getUserPermissions(uid)).toEqual([]);
    expect(userIsAdmin(uid)).toBe(false);
  });
});

describe('③ 锚点：鉴权收口顺序与权限门', () => {
  it('authMiddleware：guest 分支先于 token/回环判定；multi 下 token 优先于回环 guest', () => {
    const i = AUTH_SRC.indexOf('export function authMiddleware');
    const body = AUTH_SRC.slice(i, i + 1600);
    const guestIdx = body.indexOf("getAuthMode() === 'guest'");
    const bearerIdx = body.indexOf('verifyBearer(req)');
    const loopbackIdx = body.indexOf('isLoopback(req)');
    // 前面还有“带无效 query token”分支也会返回 UNAUTHENTICATED；
    // 这里要锚定的是**最后一个**远程未登录 401，不是那个早退分支。
    const unauthIdx = body.lastIndexOf("code: 'UNAUTHENTICATED'");
    expect(guestIdx, 'guest 模式分支必须最先（本机桌面行为不变）').toBeGreaterThan(-1);
    expect(bearerIdx, 'multi 下 token 解析先于回环（否则主机进不了管理页）').toBeGreaterThan(-1);
    expect(loopbackIdx, '无 token 回环落 guest').toBeGreaterThan(-1);
    expect(unauthIdx, '无 token 远程 401').toBeGreaterThan(-1);
    expect(guestIdx).toBeLessThan(bearerIdx);
    expect(bearerIdx).toBeLessThan(loopbackIdx);
    expect(loopbackIdx).toBeLessThan(unauthIdx);
  });

  it('multi 模式回环请求被 401 拒绝的分支存在（远程未登录）', () => {
    const i = AUTH_SRC.indexOf('export function authMiddleware');
    expect(AUTH_SRC.slice(i, i + 1200)).toContain("code: 'UNAUTHENTICATED'");
  });

  it('agents PATCH：isPublic 置真必须过 share.agent.publish 权限收口', () => {
    const i = AGENTS_SRC.indexOf('router.patch');
    const seg = AGENTS_SRC.slice(i, AGENTS_SRC.indexOf('router.delete'));
    expect(seg).toContain('share.agent.publish');
  });

  it('admin 路由：全部写操作都有 requirePerm 守门', () => {
    const writes = ADMIN_SRC.match(/router\.(post|patch|put|delete)\('/g) || [];
    const guarded = ADMIN_SRC.match(/requirePerm\(/g) || [];
    // 每个写路由至少要有一处 requirePerm（requirePerm 工厂定义另占 2 处）
    expect(guarded.length - 2).toBeGreaterThanOrEqual(writes.length);
  });

  it('multi 模式下 /auth/register 必须被关闭（账号由管理员创建）', () => {
    const i = AUTH_SRC.indexOf("router.post('/register'");
    expect(AUTH_SRC.slice(i, i + 500)).toContain("getAuthMode() === 'multi'");
  });

  it('guest 本地单机 = 本机管理员：me 返回全树权限、admin 路由放行（2026-11-01 用户拍板）', () => {
    // /auth/me 的 guest 分支：返回 isAdmin:true + PERMISSION_TREE 全树
    const i = AUTH_SRC.indexOf("router.get('/me'");
    const meSeg = AUTH_SRC.slice(i, i + 1200);
    expect(meSeg).toContain("getAuthMode() === 'guest'");
    expect(meSeg).toContain('PERMISSION_TREE.map');
    // admin.ts requirePerm：guest 模式直接放行（multi 维持权限收口）
    const j = ADMIN_SRC.indexOf('function requirePerm');
    expect(ADMIN_SRC.slice(j, j + 600)).toContain("getAuthMode() === 'guest'");
  });
});

describe('④ WS 升级鉴权（multi 模式远程连接必须持有效 JWT）', () => {
  const prevMode = process.env.YZ_AUTH_MODE;
  const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');

  function mkReq(opts: { url?: string; token?: string; remote?: string } = {}) {
    const headers: Record<string, unknown> = {};
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    return { url: opts.url || '/ws/chat', headers, socket: { remoteAddress: opts.remote || '127.0.0.1' } };
  }

  it('guest 模式全放行', () => {
    delete process.env.YZ_AUTH_MODE;
    expect(wsUpgradeAuthorized(mkReq({ remote: '203.0.113.9' }))).toBe(true);
  });

  it('multi 模式：guest 下带 ?token= 合法 JWT → 放行且身份解析正确', async () => {
    process.env.YZ_AUTH_MODE = 'multi';
    const bcrypt = (await import('bcryptjs')).default;
    const uid = createUser('ws_user');
    db.prepare('UPDATE user SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync('wspass123', 4), uid);
    const token = jwt.sign({ userId: uid, username: 'ws_user' }, process.env.JWT_SECRET || 'yan-zhi-secret-change-in-production', { expiresIn: '1h' });
    expect(wsUpgradeAuthorized(mkReq({ url: `/ws/chat?token=${token}`, remote: '203.0.113.9' }))).toBe(true);
    expect(resolveWsUserId(mkReq({ url: `/ws/chat?token=${token}` }))).toBe(uid);
  });

  it('multi 模式：远程无 token → 拒绝；回环无 token → 放行', () => {
    process.env.YZ_AUTH_MODE = 'multi';
    expect(wsUpgradeAuthorized(mkReq({ remote: '203.0.113.9' }))).toBe(false);
    expect(wsUpgradeAuthorized(mkReq({ remote: '127.0.0.1' }))).toBe(true);
    expect(wsUpgradeAuthorized(mkReq({ remote: '::ffff:192.168.1.5' }))).toBe(false);
  });

  it('multi 模式：带无效 token 一律拒绝（不回落 guest）', () => {
    process.env.YZ_AUTH_MODE = 'multi';
    expect(wsUpgradeAuthorized(mkReq({ url: '/ws/chat?token=garbage', remote: '203.0.113.9' }))).toBe(false);
    expect(resolveWsUserId(mkReq({ url: '/ws/chat?token=garbage' }))).toBe('guest');
    process.env.YZ_AUTH_MODE = prevMode;
  });

  it('远控会话 WS 豁免 JWT 闸（自带配对鉴权，pair-token 非 JWT）', () => {
    process.env.YZ_AUTH_MODE = 'multi';
    expect(wsUpgradeAuthorized(mkReq({ url: '/api/plugin/remote-control/session/ws?role=host&key=abc', remote: '203.0.113.9' }))).toBe(true);
    process.env.YZ_AUTH_MODE = prevMode;
  });
});
