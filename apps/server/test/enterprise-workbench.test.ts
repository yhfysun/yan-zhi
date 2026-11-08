import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from '../src/db.js';
import { ensureEnterpriseSchema } from '../src/enterprise/schema.js';
import { seedRbac } from '../src/rbac.js';
import {
  createExpertManifest, createTeamRule, listRulePromptForAgent, listTeamResourceCatalog,
} from '../src/enterprise/resources.js';
import {
  getQuotaStatus, recordQuotaUsage, resolveEffectiveQuotaPolicy, upsertQuotaPolicy,
} from '../src/enterprise/quota.js';
import { recordAdminAudit, listAdminAudit } from '../src/enterprise/audit.js';
import {
  createMcpConnector, createMcpProvider, listMcpConnectors,
} from '../src/enterprise/mcp-hub.js';
import {
  appendRuntimeEvents, claimRuntimeTask, completeRuntimeTask, createRuntimeNode,
  createRuntimeTask, createWorkspace, getRuntimeTask, listRuntimeArtifacts,
  listRuntimeEvents, listWorkspaces, registerRuntimeNode,
} from '../src/enterprise/runtime.js';
import { createDesignResource, listDesignResources } from '../src/enterprise/design-resources.js';

const UID = 'u_enterprise_test';
const OID = 'org_enterprise_test';
const AID = 'a_enterprise_test';

function seedBase() {
  db.prepare('DELETE FROM runtime_event WHERE runtime_task_id IN (SELECT id FROM runtime_task WHERE owner_user_id = ?)').run(UID);
  db.prepare('DELETE FROM runtime_artifact WHERE runtime_task_id IN (SELECT id FROM runtime_task WHERE owner_user_id = ?)').run(UID);
  db.prepare('DELETE FROM runtime_task WHERE owner_user_id = ?').run(UID);
  db.prepare('DELETE FROM runtime_workspace WHERE owner_user_id = ?').run(UID);
  db.prepare('DELETE FROM runtime_node WHERE owner_user_id = ?').run(UID);
  db.prepare('DELETE FROM credit_entry WHERE account_id IN (SELECT id FROM quota_account WHERE subject_id IN (?, ?))').run(UID, OID);
  db.prepare('DELETE FROM quota_account WHERE subject_id IN (?, ?)').run(UID, OID);
  db.prepare('DELETE FROM quota_policy WHERE subject_id IN (?, ?)').run(UID, OID);
  db.prepare('DELETE FROM expert_manifest WHERE agent_id = ?').run(AID);
  db.prepare('DELETE FROM design_resource WHERE owner_user_id = ?').run(UID);
  db.prepare('DELETE FROM resource_version WHERE resource_id IN (?, ?)').run(AID, 'rule_ent_test');
  db.prepare('DELETE FROM team_rule WHERE id = ?').run('rule_ent_test');
  db.prepare('DELETE FROM mcp_connector WHERE owner_user_id = ?').run(UID);
  db.prepare('DELETE FROM mcp_connector_provider WHERE owner_user_id = ?').run(UID);
  db.prepare('DELETE FROM admin_audit WHERE actor_user_id = ?').run(UID);
  db.prepare('DELETE FROM user_org WHERE user_id = ?').run(UID);
  db.prepare('DELETE FROM org WHERE id = ?').run(OID);
  db.prepare('DELETE FROM user WHERE id = ?').run(UID);
  db.prepare('DELETE FROM agent WHERE id = ?').run(AID);
}

function insertBase() {
  const now = Date.now();
  db.prepare('INSERT INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(UID, 'enterprise_test', '!test', now);
  db.prepare('INSERT INTO org (id, name, parent_id, sort_order, created_at) VALUES (?, ?, NULL, 0, ?)')
    .run(OID, '企业测试组', now);
  db.prepare('INSERT INTO user_org (user_id, org_id, created_at) VALUES (?, ?, ?)').run(UID, OID, now);
  db.prepare(
    `INSERT INTO agent
      (id, user_id, name, description, system_prompt, type, builtin_tool_ids,
       custom_tool_ids, mcp_tool_mounts, skill_ids, sub_agent_ids, category,
       is_public, version, rule_ids_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'harness', '[]', '[]', '[]', '[]', '[]', '办公', 1, 1, '[]', ?, ?)`,
  ).run(AID, UID, '测试专家', '企业测试专家', '你是测试专家。', now, now);
}

beforeAll(() => {
  ensureEnterpriseSchema();
  seedRbac();
  seedBase();
  insertBase();
});

describe('团队规则与专家清单', () => {
  it('规则可创建、可见、进入专家提示词并生成资源版本', () => {
    const rule = createTeamRule(UID, {
      id: 'rule_ent_test',
      name: '交付规则',
      content: '所有交付必须给出文件路径。',
      scope: 'expert',
      priority: 10,
      required: true,
      enabled: true,
    } as any);
    expect(rule.id).toBeTruthy();
    expect(rule.enabled).toBe(true);

    const manifest = createExpertManifest(UID, AID, { ruleIds: [rule.id] });
    expect(manifest.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.manifest.rules).toEqual([rule.id]);

    const prompts = listRulePromptForAgent(AID, UID);
    expect(prompts.some((r) => r.content.includes('文件路径'))).toBe(true);

    const versions = db.prepare(
      'SELECT COUNT(*) AS n FROM resource_version WHERE resource_type = ? AND resource_id = ?',
    ).get('rule', rule.id) as any;
    expect(versions.n).toBeGreaterThanOrEqual(1);
  });

  it('资源目录至少包含当前专家和规则', () => {
    const catalog = listTeamResourceCatalog(UID);
    expect(catalog.agents.some((a: any) => a.id === AID)).toBe(true);
    expect(catalog.rules.some((r: any) => r.name === '交付规则')).toBe(true);
  });
});

describe('周期额度与组织继承', () => {
  it('用户未配置时继承组织额度，消费后余额下降', () => {
    const policy = upsertQuotaPolicy({
      subjectType: 'org', subjectId: OID, period: 'month', limitCny: 10,
    });
    expect(resolveEffectiveQuotaPolicy(UID)?.id).toBe(policy.id);
    const before = getQuotaStatus(UID);
    expect(before.allowed).toBe(true);
    expect(before.limitCny).toBe(10);

    recordQuotaUsage(UID, 4, { type: 'test', id: 'call_1' });
    const after = getQuotaStatus(UID);
    expect(after.usedCny).toBeCloseTo(4, 6);
    expect(after.remainingCny).toBeCloseTo(6, 6);
  });

  it('用户额度覆盖组织额度，超限后阻止新调用', () => {
    upsertQuotaPolicy({
      subjectType: 'user', subjectId: UID, period: 'month', limitCny: 3,
    });
    recordQuotaUsage(UID, 4, { type: 'test', id: 'call_2' });
    const status = getQuotaStatus(UID);
    expect(status.limitCny).toBe(3);
    expect(status.allowed).toBe(false);
    const entries = db.prepare(
      'SELECT COUNT(*) AS n FROM credit_entry WHERE account_id = ?',
    ).get(status.account.id) as any;
    expect(entries.n).toBeGreaterThanOrEqual(1);
  });
});

describe('管理审计', () => {
  it('记录并可查询', () => {
    recordAdminAudit({
      actorUserId: UID,
      action: 'test.enterprise',
      resourceType: 'rule',
      resourceId: 'rule_ent_test',
      before: { enabled: false },
      after: { enabled: true },
    });
    const list = listAdminAudit({ actorUserId: UID, limit: 20 });
    expect(list.total).toBeGreaterThanOrEqual(1);
    expect(list.items[0].action).toBe('test.enterprise');
  });
});

describe('集中式 MCP 配置', () => {
  it('Provider 和 Connector 可创建且不泄露共享密钥', () => {
    const provider = createMcpProvider(UID, {
      name: '测试 MCP',
      url: 'http://127.0.0.1:4567/mcp',
      authMode: 'header',
    });
    const connector = createMcpConnector(UID, {
      providerId: provider.id,
      name: '测试连接',
      credentialMode: 'centralized',
      sharedSecret: 'secret-value',
      isPublic: true,
    });
    expect(connector.has_shared_secret).toBe(true);
    expect(JSON.stringify(connector)).not.toContain('secret-value');
    const visible = listMcpConnectors(UID);
    expect(visible.some((c) => c.id === connector.id)).toBe(true);
  });
});

describe('设计资源库', () => {
  it('创建后可被成员目录读取，内容保持结构化', () => {
    const row = createDesignResource(UID, {
      name: '科技发布会模板',
      kind: 'template',
      description: '深色科技风',
      content: { palette: ['#111827', '#2563eb'], layout: 'hero-left' },
      tags: ['科技', '极简'],
      isPublic: true,
    });
    expect(row.content.palette).toHaveLength(2);
    const list = listDesignResources({ userId: UID });
    expect(list.some((x) => x.id === row.id)).toBe(true);
  });
});

describe('工作节点、远程任务与云工作区', () => {
  it('节点注册 → 任务拉取 → 事件回传 → 完成 → 产物登记', () => {
    const created = createRuntimeNode(UID, {
      name: '测试节点',
      orgId: OID,
      capabilities: ['command'],
    });
    const registered = registerRuntimeNode(created.token, {
      platform: 'win32', arch: 'x64', version: 'v24', capabilities: ['command'],
    });
    expect(registered.status).toBe('online');

    const task = createRuntimeTask(UID, {
      nodeId: created.node.id,
      kind: 'command',
      payload: { command: 'echo hello' },
    });
    const claimed = claimRuntimeTask(created.token);
    expect(claimed.id).toBe(task.id);
    expect(claimed.state).toBe('running');

    const inserted = appendRuntimeEvents(created.token, task.id, [
      { seq: 1, kind: 'stdout', payload: { text: 'hello' } },
      { seq: 2, kind: 'stdout', payload: { text: 'world' } },
    ]);
    expect(inserted).toBe(2);
    expect(listRuntimeEvents(task.id).map((e) => e.seq)).toEqual([1, 2]);

    const completed = completeRuntimeTask(created.token, task.id, {
      state: 'completed',
      result: { ok: true },
      exitCode: 0,
      artifacts: [{ name: 'report.txt', path: 'report.txt', sizeBytes: 12 }],
    });
    expect(completed.state).toBe('completed');
    expect(getRuntimeTask(task.id, UID)?.exit_code).toBe(0);
    expect(listRuntimeArtifacts(task.id)[0].name).toBe('report.txt');
  });

  it('创建工作区会下发 workspace_create 任务', () => {
    const node = db.prepare('SELECT id FROM runtime_node WHERE owner_user_id = ? LIMIT 1').get(UID) as any;
    const ws = createWorkspace(UID, {
      nodeId: node.id,
      name: '测试工作区',
      ttlMinutes: 30,
    });
    expect(ws.status).toBe('requested');
    const task = db.prepare(
      "SELECT * FROM runtime_task WHERE workspace_id = ? AND kind = 'workspace_create'",
    ).get(ws.id) as any;
    expect(task).toBeTruthy();
    expect(listWorkspaces(UID).some((x) => x.id === ws.id)).toBe(true);
  });
});

describe('接线守卫', () => {
  it('服务端和前端都已挂企业工作台入口', () => {
    const server = readFileSync(resolve(__dirname, '..', 'src', 'index.ts'), 'utf8');
    const uiRouter = readFileSync(resolve(__dirname, '..', '..', '..', 'packages', 'ui', 'src', 'router', 'index.ts'), 'utf8');
    expect(server).toContain("app.use('/api/admin/enterprise'");
    expect(server).toContain("app.use('/api/runtime/v1'");
    expect(uiRouter).toContain("path: '/admin/enterprise'");
    expect(uiRouter).toContain("path: '/team'");
  });

  it('节点 Agent 必须保留显式 data:null，不能把空任务解包成对象', () => {
    const agent = readFileSync(resolve(__dirname, '..', 'scripts', 'enterprise-node-agent.mjs'), 'utf8');
    expect(agent).toContain('hasOwnProperty.call(json, \'data\')');
    expect(agent).not.toContain('json?.data ?? json');
  });
});
