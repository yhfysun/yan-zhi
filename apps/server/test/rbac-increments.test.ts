/**
 * RBAC 增量守门（2026-11-02）：额度闸 / 智能体依赖级联 / 角色侧批量授权。
 *
 * 这三块是 11-01 晚三笔提交新增的能力，此前 rbac.test.ts 只覆盖种子与权限解析。
 * 本测试钉：
 *  ① checkUserQuota：NULL/负数=不限、未超限放行、超限抛「额度」、guest 不受限；
 *  ② agentDependencyGrants：模型连带平台、候选池、工具/Skill/子智能体递归且去重；
 *  ③ setAclUsers 与 PUT /resource-acl/role/:roleId 两条授权路径都会级联依赖；
 *  ④ 角色批量保存是「覆盖式 diff」：只动 role 主体行，user 主体行不受影响；
 *  ⑤ 非管理员 403、角色不存在 404、未知类型/不存在资源被忽略；
 *  ⑥ 额度错误映射 402 QUOTA_EXCEEDED（源码锚点）。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.YZ_TEST_FORCE_SQLJS = '1';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'yz-rbac-inc-'));

import { db } from '../src/db.js';
import { seedRbac, ADMIN_ROLE_ID } from '../src/rbac.js';
import { agentDependencyGrants, setAclUsers } from '../src/services/resource-acl.js';
import { checkUserQuota } from '../src/llm-task-manager.js';
import aclRouter from '../src/routes/resource-acl.js';

const PLATFORM = 'plat_acl_test';
const MODEL = 'model_acl_test';
const TOOL = 'tool_acl_test';
const TOOL2 = 'tool_acl_child';
const SKILL = 'skill_acl_test';
const AGENT_PARENT = 'agent_acl_parent';
const AGENT_CHILD = 'agent_acl_child';
const PLUGIN = 'plugin_acl_test';

function createUser(username: string): string {
  const id = `u_${username}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare('INSERT INTO user (id, username, email, password_hash, created_at) VALUES (?, ?, NULL, ?, ?)')
    .run(id, username, 'x', Date.now());
  return id;
}

function createAdmin(username: string): string {
  const id = createUser(username);
  db.prepare('INSERT OR IGNORE INTO user_role (user_id, role_id, created_at) VALUES (?, ?, ?)')
    .run(id, ADMIN_ROLE_ID, Date.now());
  return id;
}

function fakeRes() {
  const r: any = {
    code: 200,
    body: null,
    status(c: number) { r.code = c; return r; },
    json(d: any) { r.body = d; return r; },
  };
  return r;
}

/** 从 express Router 里取某个路由的最后一个 handler（跳过 router.use 中间件） */
function routeHandler(method: 'get' | 'put', path: string) {
  const layer = (aclRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`找不到路由 ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function withIds(uid: string, created = Date.now()) {
  db.prepare('INSERT OR IGNORE INTO platform (id, user_id, name, created_at) VALUES (?, ?, ?, ?)')
    .run(PLATFORM, uid, '测试平台', created);
  db.prepare('INSERT OR IGNORE INTO model (id, platform_id, user_id, model_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(MODEL, PLATFORM, uid, 'test-model', created);
  db.prepare('INSERT OR IGNORE INTO skill (id, user_id, name, created_at) VALUES (?, ?, ?, ?)')
    .run(SKILL, uid, '测试技能', created);
  db.prepare('INSERT OR IGNORE INTO custom_tool (id, user_id, name, input_schema_json, entry, code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(TOOL, uid, 'tool_acl_test', '{}', 'index.js', 'module.exports=()=>1', created, created);
  db.prepare('INSERT OR IGNORE INTO custom_tool (id, user_id, name, input_schema_json, entry, code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(TOOL2, uid, 'tool_acl_child', '{}', 'index.js', 'module.exports=()=>1', created, created);
  db.prepare('INSERT OR IGNORE INTO plugin (id, manifest, state, version, source, installed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(PLUGIN, JSON.stringify({ name: '测试插件', category: 'ops' }), 'enabled', '1.0.0', 'test', created, created);
  // 子智能体：引用第二个工具 + 指向父智能体形成环（验证递归终止）
  db.prepare('INSERT OR IGNORE INTO agent (id, name, custom_tool_ids, sub_agent_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(AGENT_CHILD, '子智能体', JSON.stringify([TOOL2]), JSON.stringify([AGENT_PARENT]), created, created);
  // 父智能体：模型（所属平台应连带）+ 工具 + Skill + 子智能体 + 候选池 + 一个不存在的引用
  db.prepare('INSERT OR IGNORE INTO agent (id, name, model_id, custom_tool_ids, skill_ids, sub_agent_ids, model_pools_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      AGENT_PARENT, '父智能体', MODEL,
      JSON.stringify([TOOL]), JSON.stringify([SKILL, 'skill_missing']), JSON.stringify([AGENT_CHILD]),
      JSON.stringify({ default: [{ platformId: PLATFORM, modelId: MODEL }] }),
      created, created,
    );
}

function insertUsage(userId: string, cost: number) {
  db.prepare(
    `INSERT INTO usage_event (id, conversation_id, user_id, source, cost_cny, created_at)
     VALUES (?, 'c_quota_test', ?, 'test', ?, ?)`,
  ).run(randomUUID(), userId, cost, Date.now());
}

beforeAll(() => {
  seedRbac();
  withIds(createUser('acl_owner'));
});

describe('① 用户额度闸 checkUserQuota', () => {
  it('NULL / 负数 = 不限；未超限放行；超限抛「额度」', () => {
    const uid = createUser('quota_case');
    expect(() => checkUserQuota(uid)).not.toThrow();

    db.prepare('UPDATE user SET quota_cost_cny = 10 WHERE id = ?').run(uid);
    insertUsage(uid, 4.5);
    expect(() => checkUserQuota(uid)).not.toThrow();

    insertUsage(uid, 5.5); // 累计 10
    expect(() => checkUserQuota(uid)).toThrow(/额度已用完/);

    db.prepare('UPDATE user SET quota_cost_cny = -1 WHERE id = ?').run(uid);
    expect(() => checkUserQuota(uid), '负数应按不限处理').not.toThrow();
  });

  it('guest / 空用户不受限（本机单管理员不误伤）', () => {
    expect(() => checkUserQuota('guest')).not.toThrow();
    expect(() => checkUserQuota(undefined)).not.toThrow();
    expect(() => checkUserQuota('u_not_exists')).not.toThrow();
  });

  it('额度错误映射 402 QUOTA_EXCEEDED（源码锚点）', () => {
    const src = readFileSync(new URL('../src/routes/llm-tasks.ts', import.meta.url), 'utf8');
    expect(src).toContain("msg.includes('额度')");
    expect(src).toContain('QUOTA_EXCEEDED');
    expect(src).toContain('402');
  });
});

describe('② 智能体依赖级联 agentDependencyGrants', () => {
  it('模型连带所属平台；工具/Skill/子智能体递归展开；去重且忽略不存在引用', () => {
    const deps = agentDependencyGrants(AGENT_PARENT);
    const keys = new Set(deps.map((d) => `${d.type}:${d.id}`));
    expect(keys.has(`model:${MODEL}`)).toBe(true);
    expect(keys.has(`platform:${PLATFORM}`), '授模型必须连带其平台').toBe(true);
    expect(keys.has(`tool:${TOOL}`)).toBe(true);
    expect(keys.has(`skill:${SKILL}`)).toBe(true);
    expect(keys.has(`agent:${AGENT_CHILD}`)).toBe(true);
    expect(keys.has(`tool:${TOOL2}`), '子智能体的依赖也要递归展开').toBe(true);
    expect(keys.has('skill:skill_missing'), '不存在的资源应被忽略').toBe(false);
    expect(deps.length, '不应有重复条目').toBe(keys.size);
  });

  it('子智能体指回父智能体时递归可终止', () => {
    const deps = agentDependencyGrants(AGENT_CHILD);
    const keys = new Set(deps.map((d) => `${d.type}:${d.id}`));
    expect(keys.has(`agent:${AGENT_PARENT}`)).toBe(true);
    expect(keys.has(`model:${MODEL}`)).toBe(true);
  });

  it('setAclUsers 授用户时同步落依赖行', () => {
    const uid = createUser('cascade_user');
    setAclUsers('agent', AGENT_PARENT, { userIds: [uid] });
    const rows = db.prepare(
      "SELECT resource_type, resource_id FROM resource_acl WHERE principal_type = 'user' AND user_id = ?",
    ).all(uid) as any[];
    const keys = new Set(rows.map((r) => `${r.resource_type}:${r.resource_id}`));
    for (const k of [`agent:${AGENT_PARENT}`, `model:${MODEL}`, `platform:${PLATFORM}`, `tool:${TOOL}`, `skill:${SKILL}`, `agent:${AGENT_CHILD}`]) {
      expect(keys.has(k), `缺少级联授权 ${k}`).toBe(true);
    }
  });
});

describe('③ 角色侧批量授权 /resource-acl/role/:roleId', () => {
  const ROLE_ID = 'role_acl_batch';

  it('保存时级联智能体依赖；未知类型与不存在资源被忽略', () => {
    db.prepare("INSERT OR IGNORE INTO role (id, name, parent_id, is_system, remark, created_at) VALUES (?, ?, NULL, 0, NULL, ?)")
      .run(ROLE_ID, '批量授权角色', Date.now());
    const admin = createAdmin('acl_batch_admin');
    const put = routeHandler('put', '/role/:roleId');
    const res = fakeRes();
    put({
      user: { userId: admin },
      params: { roleId: ROLE_ID },
      body: { grants: { agent: [AGENT_PARENT], skill: [SKILL], plugin: [PLUGIN], bogus: [AGENT_PARENT] } },
    }, res);
    expect(res.code).toBe(200);
    expect(res.body.ok).toBe(true);

    const rows = db.prepare(
      "SELECT resource_type, resource_id FROM resource_acl WHERE principal_type = 'role' AND user_id = ?",
    ).all(ROLE_ID) as any[];
    const keys = new Set(rows.map((r) => `${r.resource_type}:${r.resource_id}`));
    for (const k of [`agent:${AGENT_PARENT}`, `skill:${SKILL}`, `plugin:${PLUGIN}`, `model:${MODEL}`, `platform:${PLATFORM}`, `tool:${TOOL}`, `tool:${TOOL2}`, `agent:${AGENT_CHILD}`]) {
      expect(keys.has(k), `角色授权缺少 ${k}`).toBe(true);
    }
    expect([...keys].some((k) => k.startsWith('bogus:')), '未知类型应被忽略').toBe(false);
  });

  it('GET 按类型分组回读', () => {
    const admin = db.prepare("SELECT id FROM user WHERE username LIKE 'acl_batch_admin%' LIMIT 1").get() as any;
    const get = routeHandler('get', '/role/:roleId');
    const res = fakeRes();
    get({ user: { userId: admin.id }, params: { roleId: ROLE_ID } }, res);
    expect(res.code).toBe(200);
    expect(res.body.grants.agent).toContain(AGENT_PARENT);
    expect(res.body.grants.agent).toContain(AGENT_CHILD);
    expect(res.body.grants.model).toContain(MODEL);
  });

  it('覆盖式 diff：未提交的角色行被删；user 主体行不受影响', () => {
    const admin = db.prepare("SELECT id FROM user WHERE username LIKE 'acl_batch_admin%' LIMIT 1").get() as any;
    db.prepare("INSERT INTO resource_acl (resource_type, resource_id, user_id, principal_type, created_at) VALUES ('agent', ?, ?, 'user', ?)")
      .run(AGENT_PARENT, admin.id, Date.now());
    const put = routeHandler('put', '/role/:roleId');
    const res = fakeRes();
    put({
      user: { userId: admin.id },
      params: { roleId: ROLE_ID },
      body: { grants: { skill: [SKILL] } },
    }, res);
    expect(res.code).toBe(200);

    const rows = db.prepare(
      "SELECT resource_type, resource_id FROM resource_acl WHERE principal_type = 'role' AND user_id = ?",
    ).all(ROLE_ID) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].resource_type).toBe('skill');
    expect(rows[0].resource_id).toBe(SKILL);

    const userRows = db.prepare(
      "SELECT COUNT(*) AS n FROM resource_acl WHERE principal_type = 'user' AND user_id = ? AND resource_type = 'agent' AND resource_id = ?",
    ).get(admin.id, AGENT_PARENT) as any;
    expect(userRows.n, 'user 主体行不应被角色保存误删').toBe(1);
  });

  it('非管理员 403；角色不存在 404', () => {
    const normal = createUser('acl_normal');
    const put = routeHandler('put', '/role/:roleId');
    const r403 = fakeRes();
    put({ user: { userId: normal }, params: { roleId: ROLE_ID }, body: { grants: {} } }, r403);
    expect(r403.code).toBe(403);

    const admin = db.prepare("SELECT id FROM user WHERE username LIKE 'acl_batch_admin%' LIMIT 1").get() as any;
    const r404 = fakeRes();
    put({ user: { userId: admin.id }, params: { roleId: 'role_not_exists' }, body: { grants: {} } }, r404);
    expect(r404.code).toBe(404);
  });
});
