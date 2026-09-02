// LLM 交互日志 —— 查看每次与大模型交互的信息，并按 用户/会话/模型 聚合统计
// 交互口径：一条 assistant 消息 = 一次 LLM 调用（tokens 已在该消息上累计）。
// 支持跨用户查看（管理视角）；本地桌面单用户（guest）即为本人全部数据。
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';

const router = Router();
router.use(authMiddleware);

const PAGE_SIZE = 50;

interface Row {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  content: string | null;
  tool_calls_json: string | null;
  tool_call_id: string | null;
  reasoning_content: string | null;
  system_prompt_snapshot: string | null;
  tokens: number | null;
  parent_tool_call_id: string | null;
  sub_agent_id: string | null;
  sub_agent_name: string | null;
  sub_agent_depth: number | null;
  created_at: number;
  conv_title?: string;
  conv_model_id?: string;
  conv_platform_id?: string;
  username?: string;
  model_alias?: string;
  model_name?: string;
  platform_name?: string;
}

// 构建 where 条件（跨用户管理视角，可选 userId）
function buildWhere(userId?: string, conversationId?: string, modelId?: string,
  keyword?: string, from?: number, to?: number, subAgent?: string): { where: string; args: any[] } {
  const conds: string[] = ["m.role = 'assistant'"];
  const args: any[] = [];
  if (userId) { conds.push('m.user_id = ?'); args.push(userId); }
  if (conversationId) { conds.push('m.conversation_id = ?'); args.push(conversationId); }
  if (modelId) { conds.push('c.model_id = ?'); args.push(modelId); }
  if (from) { conds.push('m.created_at >= ?'); args.push(from); }
  if (to) { conds.push('m.created_at <= ?'); args.push(to); }
  if (subAgent === '1') { conds.push('m.sub_agent_id IS NOT NULL'); }
  if (subAgent === '0') { conds.push('m.sub_agent_id IS NULL'); }
  if (keyword) {
    conds.push('(m.content LIKE ? OR c.title LIKE ?)');
    args.push(`%${keyword}%`, `%${keyword}%`);
  }
  return { where: conds.join(' AND '), args };
}

const SELECT = `
  SELECT m.*,
    c.title AS conv_title,
    c.model_id AS conv_model_id,
    c.platform_id AS conv_platform_id,
    u.username AS username,
    mo.alias AS model_alias,
    mo.model_id AS model_name,
    p.name AS platform_name
  FROM message m
  LEFT JOIN conversation c ON c.id = m.conversation_id
  LEFT JOIN user u ON u.id = m.user_id
  LEFT JOIN model mo ON mo.id = c.model_id
  LEFT JOIN platform p ON p.id = c.platform_id
`;

// 从 system_prompt_snapshot 提取模型名兜底（会话 model_id 为空/模型被删时）
function modelNameFromSnapshot(snapshot: string | null): { alias?: string; name?: string; platform?: string } {
  if (!snapshot) return {};
  try {
    const p = JSON.parse(snapshot);
    const m = p && typeof p === 'object' ? p.model : null;
    if (!m) return {};
    return {
      alias: typeof m.alias === 'string' ? m.alias : undefined,
      name: typeof m.id === 'string' ? m.id : (typeof m.modelId === 'string' ? m.modelId : undefined),
      platform: typeof m.platform === 'string' ? m.platform : undefined,
    };
  } catch { return {}; }
}

// 统一补全模型名：会话模型缺失时从快照提取
function enrichRow(r: Row): Row {
  if (!r.model_alias && !r.model_name) {
    const sn = modelNameFromSnapshot(r.system_prompt_snapshot);
    if (sn.alias) r.model_alias = sn.alias;
    if (sn.name) r.model_name = sn.name;
    if (sn.platform && !r.platform_name) r.platform_name = sn.platform;
  }
  return r;
}

// GET /api/llm/logs  交互明细分页
router.get('/logs', (req: Request, res: Response) => {
  const { userId, conversationId, modelId, keyword, from, to, subAgent } = (req.query || {}) as any;
  const limit = Math.min(parseInt(req.query.limit as string) || PAGE_SIZE, 200);
  const offset = parseInt(req.query.offset as string) || 0;

  const { where, args } = buildWhere(userId, conversationId, modelId, keyword, from && Number(from), to && Number(to), subAgent);
  const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM message m LEFT JOIN conversation c ON c.id = m.conversation_id WHERE ${where}`).get(...args) as { c: number };
  const rows = (db.prepare(`${SELECT} WHERE ${where} ORDER BY m.created_at DESC, m.rowid DESC LIMIT ? OFFSET ?`).all(...args, limit, offset) as unknown as Row[]).map(enrichRow);
  res.json({ data: { items: rows, total: totalRow.c, limit, offset } });
});

// GET /api/llm/logs/options  筛选选项（用户/会话/模型）
router.get('/logs/options', (_req: Request, res: Response) => {
  const users = db.prepare(`
    SELECT u.id, u.username, COUNT(m.id) AS cnt
    FROM user u LEFT JOIN message m ON m.user_id = u.id AND m.role = 'assistant'
    WHERE m.id IS NOT NULL
    GROUP BY u.id ORDER BY cnt DESC
  `).all() as Array<{ id: string; username: string; cnt: number }>;
  const conversations = db.prepare(`
    SELECT c.id, c.title, u.username, COUNT(m.id) AS cnt
    FROM conversation c
    LEFT JOIN message m ON m.conversation_id = c.id AND m.role = 'assistant'
    LEFT JOIN user u ON u.id = c.user_id
    WHERE m.id IS NOT NULL
    GROUP BY c.id ORDER BY cnt DESC
  `).all() as Array<{ id: string; title: string; username: string; cnt: number }>;
  const models = db.prepare(`
    SELECT c.model_id AS id, MAX(mo.alias) AS alias, MAX(mo.model_id) AS name, MAX(p.name) AS platform_name, COUNT(m.id) AS cnt
    FROM conversation c
    LEFT JOIN message m ON m.conversation_id = c.id AND m.role = 'assistant'
    LEFT JOIN model mo ON mo.id = c.model_id
    LEFT JOIN platform p ON p.id = c.platform_id
    WHERE m.id IS NOT NULL
    GROUP BY c.model_id ORDER BY cnt DESC
  `).all() as Array<{ id: string; alias: string; name: string; platform_name: string; cnt: number }>;
  res.json({ data: { users, conversations, models } });
});

// GET /api/llm/logs/stats  聚合统计（by=user|conversation|model）
router.get('/logs/stats', (req: Request, res: Response) => {
  const by = (req.query.by as string) || 'user';
  const { userId, conversationId, modelId, from, to } = (req.query || {}) as any;
  const { where, args } = buildWhere(userId, conversationId, modelId, undefined, from && Number(from), to && Number(to), undefined);

  let groupBy: string;
  let select: string;
  if (by === 'conversation') {
    groupBy = 'c.id';
    select = `c.id AS key, c.title AS name, u.username, c.model_id AS modelId`;
  } else if (by === 'model') {
    groupBy = 'COALESCE(c.model_id, \'\')';
    select = `COALESCE(c.model_id, '') AS key, COALESCE(MAX(mo.alias), MAX(mo.model_id), '未知模型') AS name, MAX(p.name) AS platform_name`;
  } else {
    groupBy = 'm.user_id';
    select = `m.user_id AS key, u.username AS name`;
  }

  const rows = db.prepare(`
    SELECT ${select},
      COUNT(*) AS calls,
      COALESCE(SUM(m.tokens), 0) AS tokens,
      COALESCE(SUM(CASE WHEN m.sub_agent_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS subAgentCalls,
      MAX(m.created_at) AS lastAt
    FROM message m
    LEFT JOIN conversation c ON c.id = m.conversation_id
    LEFT JOIN user u ON u.id = m.user_id
    LEFT JOIN model mo ON mo.id = c.model_id
    LEFT JOIN platform p ON p.id = c.platform_id
    WHERE ${where}
    GROUP BY ${groupBy}
    ORDER BY calls DESC
  `).all(...args) as unknown as Array<any>;
  res.json({ data: rows });
});

// GET /api/llm/logs/overview  顶部汇总
router.get('/logs/overview', (req: Request, res: Response) => {
  const { userId, conversationId, modelId, from, to } = (req.query || {}) as any;
  const { where, args } = buildWhere(userId, conversationId, modelId, undefined, from && Number(from), to && Number(to), undefined);
  const row = db.prepare(`
    SELECT COUNT(*) AS calls, COALESCE(SUM(m.tokens), 0) AS tokens,
      COUNT(DISTINCT m.conversation_id) AS conversations,
      COUNT(DISTINCT m.user_id) AS users
    FROM message m LEFT JOIN conversation c ON c.id = m.conversation_id
    WHERE ${where}
  `).get(...args) as { calls: number; tokens: number; conversations: number; users: number };
  res.json({ data: row });
});

// GET /api/llm/logs/:id/detail  单条完整详情
router.get('/logs/:id/detail', (req: Request, res: Response) => {
  const id = req.params.id;
  const row = db.prepare(`${SELECT} WHERE m.id = ?`).get(id) as unknown as Row | undefined;
  if (!row) { res.status(404).json({ error: '记录不存在' }); return; }
  const enriched = enrichRow(row);
  let toolCalls: any[] = [];
  try { toolCalls = JSON.parse(row.tool_calls_json || '[]'); } catch {}
  res.json({
    data: {
      id: row.id,
      conversationId: row.conversation_id,
      conversationTitle: row.conv_title,
      userId: row.user_id,
      username: row.username,
      modelId: row.conv_model_id,
      modelAlias: enriched.model_alias,
      modelName: enriched.model_name,
      platformName: enriched.platform_name,
      subAgentId: row.sub_agent_id,
      subAgentName: row.sub_agent_name,
      subAgentDepth: row.sub_agent_depth,
      tokens: row.tokens || 0,
      createdAt: row.created_at,
      content: row.content,
      reasoningContent: row.reasoning_content,
      toolCalls,
      systemPromptSnapshot: row.system_prompt_snapshot,
    },
  });
});

export default router;
