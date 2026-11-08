/**
 * Task 4 验收测试：团队资源进入常规选择器 —— 服务端来源标记。
 *
 * ★ 判定必须收口在服务端：可见性由「自己 ∪ 公开 ∪ ACL」在 SQL 里算出来，
 *   只有服务端知道 ACL 名单；前端只读 `shared` 字段展示，不允许自行比对 user_id
 *   （否则未来服务端改判定时前端标签必然漂移）。与 platform 列表已有的
 *   `shared: is_public && user_id !== me` 同一语义。
 * 真跑真实 express 路由 + 真临时库；guest 模式下当前用户恒为 'guest'，
 * 用 'u_alice' 造"别人的资源"即可覆盖公开/ACL 两条可见路径。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { db } from '../src/db.js';
import { seedRbac } from '../src/rbac.js';
import platformRoutes from '../src/routes/platforms.js';
import skillRoutes from '../src/routes/skills.js';
import agentRoutes from '../src/routes/agents.js';

const ME = 'guest';
const ALICE = 'u_alice';
const NOW = Date.now();

let server: Server;
let base = '';

async function getData(path: string): Promise<any[]> {
  const r = await fetch(`${base}${path}`);
  expect(r.status, path).toBe(200);
  const j = await r.json() as any;
  return j.data || [];
}

function seedUsers() {
  for (const [id, name] of [[ME, 'guest'], [ALICE, 'alice']] as const) {
    db.prepare('INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(id, name, '!test', NOW);
  }
}

function insertPlatform(id: string, owner: string, isPublic: number) {
  db.prepare('INSERT OR REPLACE INTO platform (id, user_id, name, protocol, status, is_public, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
    .run(id, owner, `平台-${id}`, 'openai', isPublic, NOW);
}

function insertModel(id: string, platformId: string, owner: string, isPublic: number) {
  db.prepare(`INSERT OR REPLACE INTO model
    (id, platform_id, user_id, model_id, alias, type, enabled, visible, is_public, created_at)
    VALUES (?, ?, ?, ?, ?, 'llm', 1, 1, ?, ?)`)
    .run(id, platformId, owner, `model-${id}`, `模型-${id}`, isPublic, NOW);
}

function insertSkill(id: string, owner: string, isPublic: number) {
  db.prepare(`INSERT OR REPLACE INTO skill
    (id, user_id, name, description, body, category, enabled, is_public, created_at)
    VALUES (?, ?, ?, ?, '正文', '测试', 1, ?, ?)`)
    .run(id, owner, `技能-${id}`, '', isPublic, NOW);
}

function insertAgent(id: string, owner: string, isPublic: number) {
  db.prepare(`INSERT OR REPLACE INTO agent
    (id, user_id, name, description, system_prompt, type, builtin_tool_ids, custom_tool_ids,
     mcp_tool_mounts, skill_ids, sub_agent_ids, category, is_public, version, created_at, updated_at)
    VALUES (?, ?, ?, '', '你是测试。', 'harness', '[]', '[]', '[]', '[]', '[]', '测试', ?, 1, ?, ?)`)
    .run(id, owner, `智能体-${id}`, isPublic, NOW, NOW);
}

function grantAcl(type: string, resourceId: string) {
  db.prepare('INSERT OR REPLACE INTO resource_acl (resource_type, resource_id, user_id, created_at) VALUES (?, ?, ?, ?)')
    .run(type, resourceId, ME, NOW);
}

function cleanAll() {
  db.prepare('DELETE FROM resource_acl WHERE resource_id LIKE ?').run('sh-%');
  db.prepare('DELETE FROM model WHERE id LIKE ?').run('sh-%');
  db.prepare('DELETE FROM platform WHERE id LIKE ?').run('sh-%');
  db.prepare('DELETE FROM skill WHERE id LIKE ?').run('sh-%');
  db.prepare('DELETE FROM agent WHERE id LIKE ?').run('sh-%');
}

beforeAll(async () => {
  seedRbac();
  seedUsers();
  const app = express();
  app.use(express.json());
  app.use('/api/platforms', platformRoutes);
  app.use('/api/skills', skillRoutes);
  app.use('/api/agents', agentRoutes);
  server = await new Promise<Server>((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  cleanAll();
});

describe('GET /api/platforms/all-models：模型来源标记', () => {
  it('自己的模型 shared=false，公开共享与 ACL 授权的模型 shared=true', async () => {
    insertPlatform('sh-p-me', ME, 0);
    insertPlatform('sh-p-alice', ALICE, 1);
    insertModel('sh-m-mine', 'sh-p-me', ME, 0);        // 自己的
    insertModel('sh-m-mine-shared', 'sh-p-me', ME, 1); // 我共享给别人（对我仍是个人资源）
    insertModel('sh-m-platform', 'sh-p-alice', ALICE, 0); // 别人共享平台里的模型
    insertModel('sh-m-public', 'sh-p-me', ALICE, 1);   // 别人的单模型公开
    insertModel('sh-m-acl', 'sh-p-me', ALICE, 0);      // 别人私有 + ACL 给我
    grantAcl('model', 'sh-m-acl');

    const rows = await getData('/api/platforms/all-models');
    const by = new Map(rows.map((r: any) => [r.id, r]));
    expect(by.get('sh-m-mine')?.shared).toBe(false);
    expect(by.get('sh-m-mine-shared')?.shared).toBe(false);
    expect(by.get('sh-m-platform')?.shared).toBe(true);
    expect(by.get('sh-m-public')?.shared).toBe(true);
    expect(by.get('sh-m-acl')?.shared).toBe(true);
    expect(rows.every((r: any) => typeof r.shared === 'boolean')).toBe(true);
  });

  it('单平台模型列表（/:pid/models）同样带 shared', async () => {
    insertPlatform('sh-p-alice', ALICE, 1);
    insertModel('sh-m-in-shared', 'sh-p-alice', ALICE, 0);
    const rows = await getData('/api/platforms/sh-p-alice/models');
    expect(rows.some((r: any) => r.id === 'sh-m-in-shared' && r.shared === true)).toBe(true);
  });
});

describe('GET /api/skills：Skill 来源标记', () => {
  it('自己的/预置的 shared=false，公开与 ACL 授权的 shared=true', async () => {
    insertSkill('sh-s-mine', ME, 0);
    insertSkill('sh-s-public', ALICE, 1);
    insertSkill('sh-s-acl', ALICE, 0);
    grantAcl('skill', 'sh-s-acl');
    const rows = await getData('/api/skills');
    const by = new Map(rows.map((r: any) => [r.id, r]));
    expect(by.get('sh-s-mine')?.shared).toBe(false);
    expect(by.get('sh-s-public')?.shared).toBe(true);
    expect(by.get('sh-s-acl')?.shared).toBe(true);
    expect(rows.every((r: any) => typeof r.shared === 'boolean')).toBe(true);
  });
});

describe('GET /api/agents：智能体来源标记', () => {
  it('自己的 shared=false，公开与 ACL 授权的 shared=true', async () => {
    insertAgent('sh-a-mine', ME, 0);
    insertAgent('sh-a-public', ALICE, 1);
    insertAgent('sh-a-acl', ALICE, 0);
    grantAcl('agent', 'sh-a-acl');
    const rows = await getData('/api/agents');
    const by = new Map(rows.map((r: any) => [r.id, r]));
    expect(by.get('sh-a-mine')?.shared).toBe(false);
    expect(by.get('sh-a-public')?.shared).toBe(true);
    expect(by.get('sh-a-acl')?.shared).toBe(true);
    expect(rows.every((r: any) => typeof r.shared === 'boolean')).toBe(true);
  });
});
