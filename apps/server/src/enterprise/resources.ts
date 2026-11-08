import { createHash, randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { aclExistsSql } from '../services/resource-acl.js';
import './schema.js';

export type RuleScope = 'system' | 'expert' | 'user';

export interface TeamRuleInput {
  name: string;
  description?: string | null;
  content: string;
  scope?: RuleScope;
  priority?: number;
  required?: boolean;
  enabled?: boolean;
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function rowToRule(row: any) {
  return {
    ...row,
    required: !!row.required,
    enabled: !!row.enabled,
  };
}

export function listTeamRules(userId: string, opts: { all?: boolean } = {}): any[] {
  if (opts.all) {
    return db.prepare('SELECT * FROM team_rule ORDER BY required DESC, priority ASC, name ASC')
      .all().map(rowToRule);
  }
  const rows = db.prepare(
    `SELECT * FROM team_rule
      WHERE enabled = 1
        AND (scope = 'system' OR owner_user_id = ? OR ${aclExistsSql('rule', 'team_rule.id')})
      ORDER BY required DESC, priority ASC, name ASC`,
  ).all(userId, userId, userId, userId) as any[];
  return rows.map(rowToRule);
}

export function createTeamRule(userId: string, input: TeamRuleInput): any {
  const name = String(input.name || '').trim();
  const content = String(input.content || '').trim();
  if (!name) throw new Error('规则名称不能为空');
  if (!content) throw new Error('规则内容不能为空');
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO team_rule
      (id, owner_user_id, name, description, content, scope, priority, required, enabled, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    id,
    userId,
    name,
    input.description || null,
    content,
    input.scope === 'system' || input.scope === 'expert' ? input.scope : 'user',
    Number.isFinite(Number(input.priority)) ? Number(input.priority) : 100,
    input.required ? 1 : 0,
    input.enabled === false ? 0 : 1,
    now,
    now,
  );
  const row = db.prepare('SELECT * FROM team_rule WHERE id = ?').get(id) as any;
  snapshotResourceVersion('rule', id, rowToRule(row), userId);
  return rowToRule(row);
}

export function updateTeamRule(userId: string, id: string, input: Partial<TeamRuleInput>): any {
  const row = db.prepare('SELECT * FROM team_rule WHERE id = ?').get(id) as any;
  if (!row) throw new Error('规则不存在');
  if (row.owner_user_id && row.owner_user_id !== userId) throw new Error('无权修改该规则');
  const sets: string[] = [];
  const vals: unknown[] = [];
  const put = (col: string, value: unknown) => { sets.push(`${col} = ?`); vals.push(value); };
  if (input.name !== undefined) put('name', String(input.name).trim());
  if (input.description !== undefined) put('description', input.description || null);
  if (input.content !== undefined) put('content', String(input.content).trim());
  if (input.scope !== undefined) put('scope', input.scope);
  if (input.priority !== undefined) put('priority', Number(input.priority) || 100);
  if (input.required !== undefined) put('required', input.required ? 1 : 0);
  if (input.enabled !== undefined) put('enabled', input.enabled ? 1 : 0);
  if (!sets.length) return rowToRule(row);
  put('version', Number(row.version || 1) + 1);
  put('updated_at', Date.now());
  vals.push(id);
  db.prepare(`UPDATE team_rule SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const next = db.prepare('SELECT * FROM team_rule WHERE id = ?').get(id) as any;
  snapshotResourceVersion('rule', id, rowToRule(next), userId);
  return rowToRule(next);
}

export function deleteTeamRule(userId: string, id: string): void {
  const row = db.prepare('SELECT owner_user_id FROM team_rule WHERE id = ?').get(id) as any;
  if (!row) throw new Error('规则不存在');
  if (row.owner_user_id && row.owner_user_id !== userId) throw new Error('无权删除该规则');
  db.prepare('DELETE FROM resource_acl WHERE resource_type = ? AND resource_id = ?').run('rule', id);
  db.prepare('DELETE FROM team_rule WHERE id = ?').run(id);
}

export function snapshotResourceVersion(
  resourceType: string,
  resourceId: string,
  manifest: unknown,
  createdBy?: string,
): any {
  const last = db.prepare(
    'SELECT version_no FROM resource_version WHERE resource_type = ? AND resource_id = ? ORDER BY version_no DESC LIMIT 1',
  ).get(resourceType, resourceId) as any;
  const versionNo = Number(last?.version_no || 0) + 1;
  const manifestJson = JSON.stringify(manifest ?? {});
  const sha256 = createHash('sha256').update(manifestJson).digest('hex');
  const id = randomUUID();
  db.prepare(
    `INSERT INTO resource_version
      (id, resource_type, resource_id, version_no, sha256, manifest_json, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, resourceType, resourceId, versionNo, sha256, manifestJson, createdBy || null, Date.now());
  return { id, resourceType, resourceId, versionNo, sha256, manifest: parseJson(manifestJson, {}) };
}

export function listResourceVersions(resourceType: string, resourceId: string, limit = 50): any[] {
  return db.prepare(
    `SELECT * FROM resource_version WHERE resource_type = ? AND resource_id = ?
      ORDER BY version_no DESC LIMIT ?`,
  ).all(resourceType, resourceId, Math.max(1, Math.min(limit, 200))).map((r: any) => ({
    ...r,
    manifest: parseJson(r.manifest_json, {}),
  }));
}

export function listRulePromptForAgent(agentId: string | null, userId: string): Array<{ id: string; name: string; source: string; content: string }> {
  if (!agentId) return [];
  const agent = db.prepare('SELECT rule_ids_json FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)')
    .get(agentId, userId) as any;
  const ruleIds = parseJson<string[]>(agent?.rule_ids_json, []);
  const rows: any[] = [];
  const seen = new Set<string>();
  const push = (row: any) => {
    if (!row?.id || seen.has(row.id) || !row.enabled) return;
    seen.add(row.id);
    rows.push(row);
  };
  for (const id of ruleIds) {
    const row = db.prepare(
      `SELECT * FROM team_rule WHERE id = ? AND enabled = 1
        AND (scope = 'system' OR owner_user_id = ? OR ${aclExistsSql('rule', 'team_rule.id')})`,
    ).get(id, userId, userId, userId, userId) as any;
    push(row);
  }
  for (const row of db.prepare(
    "SELECT * FROM team_rule WHERE scope = 'system' AND required = 1 AND enabled = 1 ORDER BY priority ASC, name ASC",
  ).all() as any[]) push(row);
  rows.sort((a, b) => (Number(b.required) - Number(a.required))
    || (Number(a.priority) - Number(b.priority))
    || String(a.name).localeCompare(String(b.name), 'zh-CN'));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    source: `team-rule/${r.scope}/${r.name}`,
    content: String(r.content || ''),
  }));
}

export function createExpertManifest(
  userId: string,
  agentId: string,
  input: { ruleIds?: string[] } = {},
): any {
  const agent = db.prepare('SELECT * FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)')
    .get(agentId, userId) as any;
  if (!agent) throw new Error('智能体不存在或无权访问');
  const ruleIds = [...new Set((input.ruleIds || []).map(String).filter(Boolean))];
  for (const id of ruleIds) {
    const ok = db.prepare('SELECT 1 FROM team_rule WHERE id = ? AND enabled = 1').get(id);
    if (!ok) throw new Error(`规则不存在或已停用: ${id}`);
  }
  db.prepare('UPDATE agent SET rule_ids_json = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(ruleIds), Date.now(), agentId);
  const manifest = {
    schemaVersion: 1,
    agentId,
    name: agent.name,
    description: agent.description || '',
    prompt: agent.system_prompt || '',
    model: { platformId: agent.platform_id || null, modelId: agent.model_id || null },
    tools: {
      builtin: parseJson(agent.builtin_tool_ids, []),
      custom: parseJson(agent.custom_tool_ids, []),
      mcp: parseJson(agent.mcp_tool_mounts, []),
    },
    skills: parseJson(agent.skill_ids, []),
    rules: ruleIds,
    subAgents: parseJson(agent.sub_agent_ids, []),
    createdAt: Date.now(),
  };
  const manifestHash = stableHash(manifest);
  const id = randomUUID();
  db.prepare(
    'INSERT INTO expert_manifest (id, agent_id, manifest_json, manifest_hash, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, agentId, JSON.stringify(manifest), manifestHash, userId, Date.now());
  snapshotResourceVersion('agent', agentId, manifest, userId);
  return { id, agentId, manifest, manifestHash };
}

export function listExpertManifests(agentId: string, limit = 20): any[] {
  return db.prepare(
    'SELECT * FROM expert_manifest WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?',
  ).all(agentId, Math.max(1, Math.min(limit, 100))).map((r: any) => ({
    ...r,
    manifest: parseJson(r.manifest_json, {}),
  }));
}

export function listTeamResourceCatalog(userId: string): any {
  const safe = (sql: string, ...args: unknown[]) => {
    try { return db.prepare(sql).all(...args); } catch { return []; }
  };
  return {
    models: safe(
      `SELECT m.id, COALESCE(NULLIF(m.alias, ''), m.model_id) AS name, p.name AS source
         FROM model m LEFT JOIN platform p ON p.id = m.platform_id
        WHERE m.user_id = ? OR m.is_public = 1 OR ${aclExistsSql('model', 'm.id')}
        ORDER BY source, name`,
      userId, userId, userId, userId,
    ),
    skills: safe(
      `SELECT id, name, category AS source FROM skill
        WHERE (user_id = ? OR user_id IS NULL OR is_public = 1 OR ${aclExistsSql('skill', 'skill.id')})
        ORDER BY source, name`,
      userId, userId, userId, userId,
    ),
    agents: safe(
      `SELECT id, name, COALESCE(NULLIF(category, ''), '未分类') AS source FROM agent
        WHERE user_id = ? OR is_public = 1 OR ${aclExistsSql('agent', 'agent.id')}
        ORDER BY source, name`,
      userId, userId, userId, userId,
    ),
    tools: safe(
      `SELECT id, name, COALESCE(runtime, 'node') AS source FROM custom_tool
        WHERE user_id = ? OR is_public = 1 OR ${aclExistsSql('tool', 'custom_tool.id')}
        ORDER BY source, name`,
      userId, userId, userId, userId,
    ),
    plugins: safe(
      `SELECT id, json_extract(manifest, '$.name') AS name, json_extract(manifest, '$.category') AS source
         FROM plugin WHERE state = 'enabled'
        ORDER BY source, name`,
    ),
    rules: listTeamRules(userId),
    mcp: safe(
      `SELECT id, name, credential_mode AS source FROM mcp_connector
        WHERE enabled = 1 AND (owner_user_id = ? OR is_public = 1 OR ${aclExistsSql('mcp', 'mcp_connector.id')})
        ORDER BY source, name`,
      userId, userId, userId, userId,
    ),
  };
}

export function enterpriseOverview(): any {
  const count = (table: string, where = '') => {
    try { return Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`).get() as any)?.n || 0); }
    catch { return 0; }
  };
  const sum = (sql: string, ...args: unknown[]) => {
    try { return Number((db.prepare(sql).get(...args) as any)?.v || 0); }
    catch { return 0; }
  };
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const usageByDay = (() => {
    try {
      return db.prepare(
        `SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS day,
                ROUND(SUM(COALESCE(cost_cny, 0)), 6) AS cost_cny,
                COUNT(*) AS calls
           FROM usage_event WHERE created_at >= ?
          GROUP BY day ORDER BY day ASC`,
      ).all(since);
    } catch { return []; }
  })();
  const topModels = (() => {
    try {
      return db.prepare(
        `SELECT COALESCE(model_id, '(unknown)') AS model_id,
                ROUND(SUM(COALESCE(cost_cny, 0)), 6) AS cost_cny,
                COUNT(*) AS calls
           FROM usage_event WHERE created_at >= ?
          GROUP BY model_id ORDER BY cost_cny DESC LIMIT 8`,
      ).all(since);
    } catch { return []; }
  })();
  return {
    counts: {
      users: count('user', "WHERE id <> 'guest'"),
      orgs: count('org'),
      roles: count('role'),
      rules: count('team_rule'),
      mcpConnectors: count('mcp_connector'),
      runtimeNodes: count('runtime_node'),
      runtimeOnline: count('runtime_node', "WHERE status = 'online'"),
      workspaces: count('runtime_workspace', "WHERE status <> 'stopped'"),
    },
    usage: {
      totalCny30d: sum('SELECT SUM(COALESCE(cost_cny, 0)) AS v FROM usage_event WHERE created_at >= ?', since),
      totalCalls30d: sum('SELECT COUNT(*) AS v FROM usage_event WHERE created_at >= ?', since),
      usageByDay,
      topModels,
    },
  };
}
