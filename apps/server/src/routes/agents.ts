// 智能体完整 CRUD 路由（本地智能体数据统一归后端）。
// 前端只负责展示/交互，智能体定义（含工作流/挂载/子智能体）存 server agent 表。
// 归属：guest 为默认身份（桌面内置 server / web 未登录）；放开登录后按 user_id 隔离。
// 内置智能体（默认 AI 助手、pageAgent）is_public=1 全局可见，user_id 归 guest 兜底。
import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db, resetBuiltinAgent } from '../db.js';

const router = Router();
router.use(authMiddleware);

/** agent 行 → 前端可消费对象（保留原始列，前端 rowToAgent 解析 JSON 字段） */
function rowToAgentDto(r: any) {
  return r;
}

// GET /api/agents —— 当前用户的智能体列表（含全局公共内置智能体）
router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const rows = db.prepare(
    'SELECT * FROM agent WHERE user_id = ? OR is_public = 1 ORDER BY is_default DESC, is_builtin DESC, created_at ASC',
  ).all(userId);
  res.json({ data: rows });
});

// GET /api/agents/:id
router.get('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const row = db.prepare('SELECT * FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(req.params.id, userId);
  if (!row) { res.status(404).json({ error: '智能体不存在' }); return; }
  res.json({ data: row });
});

/** 解析可空 JSON 字符串字段 */
function parseJsonCol(v: unknown, fallback: unknown = null): unknown {
  if (v == null) return fallback;
  try { return JSON.parse(String(v)); } catch { return fallback; }
}

// POST /api/agents —— 创建智能体（含工作流/挂载/子智能体）
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const b = req.body || {};
  if (!b.name || !String(b.name).trim()) { res.status(400).json({ error: '智能体名称为必填项' }); return; }
  const id = b.id || uuid();
  const now = Date.now();
  db.prepare(
    `INSERT INTO agent (id, user_id, name, description, avatar, system_prompt, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, platform_id, model_id, workflow_json, inputs_schema_json, config_json, parent_agent_id, allow_sub_agent, is_default, type, builtin_tool_ids, custom_tool_ids, mcp_tool_mounts, skill_ids, sub_agent_ids, ontology_ids, is_public, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    id, userId,
    String(b.name).trim(),
    b.description || null,
    b.avatar || null,
    b.systemPrompt || null,
    b.temperature ?? 0.7,
    b.maxTokens ?? 2048,
    b.topP ?? 1.0,
    b.frequencyPenalty ?? 0,
    b.presencePenalty ?? 0,
    b.platformId || null,
    b.modelId || null,
    JSON.stringify(b.workflow || { nodes: [], edges: [] }),
    b.inputsSchema ? JSON.stringify(b.inputsSchema) : null,
    b.config ? JSON.stringify(b.config) : null,
    b.parentAgentId || null,
    b.allowSubAgent ? 1 : 0,
    b.isDefault ? 1 : 0,
    b.type || 'harness',
    JSON.stringify(b.builtinToolIds || []),
    JSON.stringify(b.customToolIds || []),
    JSON.stringify(b.mcpToolMounts || []),
    JSON.stringify(b.skillIds || []),
    JSON.stringify(b.subAgentIds || []),
    JSON.stringify(b.ontologyIds || []),
    b.version ?? 1,
    now, now,
  );
  const row = db.prepare('SELECT * FROM agent WHERE id = ?').get(id);
  res.json({ data: rowToAgentDto(row) });
});

// PATCH /api/agents/:id —— 更新智能体
router.patch('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const existing = db.prepare('SELECT id FROM agent WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!existing) { res.status(404).json({ error: '智能体不存在或无权修改' }); return; }
  const b = req.body || {};
  const sets: string[] = [];
  const vals: any[] = [];
  const strMap: Record<string, string> = {
    name: 'name', description: 'description', avatar: 'avatar', systemPrompt: 'system_prompt',
    platformId: 'platform_id', modelId: 'model_id', type: 'type', parentAgentId: 'parent_agent_id',
  };
  for (const [k, col] of Object.entries(strMap)) {
    if (b[k] !== undefined) { sets.push(`${col} = ?`); vals.push(b[k]); }
  }
  for (const [k, col] of Object.entries({ temperature: 'temperature', maxTokens: 'max_tokens', topP: 'top_p', frequencyPenalty: 'frequency_penalty', presencePenalty: 'presence_penalty' })) {
    if (b[k] !== undefined) { sets.push(`${col} = ?`); vals.push(b[k]); }
  }
  const jsonMap: Record<string, string> = {
    workflow: 'workflow_json', inputsSchema: 'inputs_schema_json', config: 'config_json',
    builtinToolIds: 'builtin_tool_ids', customToolIds: 'custom_tool_ids', mcpToolMounts: 'mcp_tool_mounts',
    skillIds: 'skill_ids', subAgentIds: 'sub_agent_ids', ontologyIds: 'ontology_ids',
  };
  for (const [k, col] of Object.entries(jsonMap)) {
    if (b[k] !== undefined) { sets.push(`${col} = ?`); vals.push(JSON.stringify(b[k])); }
  }
  for (const [k, col] of Object.entries({ isDefault: 'is_default', allowSubAgent: 'allow_sub_agent', isPublic: 'is_public' })) {
    if (b[k] !== undefined) { sets.push(`${col} = ?`); vals.push(b[k] ? 1 : 0); }
  }
  if (b.version !== undefined) { sets.push('version = ?'); vals.push(b.version); }
  if (sets.length === 0) { const row = db.prepare('SELECT * FROM agent WHERE id = ?').get(req.params.id); res.json({ data: row }); return; }
  sets.push('updated_at = ?'); vals.push(Date.now());
  vals.push(req.params.id);
  db.prepare(`UPDATE agent SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM agent WHERE id = ?').get(req.params.id);
  res.json({ data: rowToAgentDto(row) });
});

// DELETE /api/agents/:id
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const existing = db.prepare('SELECT id FROM agent WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!existing) { res.status(404).json({ error: '智能体不存在或无权删除' }); return; }
  db.prepare('DELETE FROM agent WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/agents/:id/reset —— 恢复内置 agent 默认值（提示词/工具挂载/子智能体/skill/config）
router.post('/:id/reset', (req: Request, res: Response) => {
  const ok = resetBuiltinAgent(req.params.id);
  if (!ok) { res.status(404).json({ error: '该智能体不是内置智能体或不存在，无法恢复默认' }); return; }
  const row = db.prepare('SELECT * FROM agent WHERE id = ?').get(req.params.id);
  res.json({ data: rowToAgentDto(row) });
});

export default router;
