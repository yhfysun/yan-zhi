// 多层记忆接口（daily=每日聚合 / session=会话 / agent=智能体长期）。
// 检索与写入统一走 memory-service（加权检索/去重/冲突处理），LLM 抽取在任务侧完成后调用写入。
import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import {
  retrieveRelevantMemories, formatMemoryContext, bumpMemoryUsage,
  writeMemoryItems, bumpMemoryCache, type MemoryWriteItem,
} from '../services/memory-service.js';
import { runDreamingForUser, getDreamingConfig, setDreamingConfig } from '../services/memory-dreaming.js';

const router = Router();
router.use(authMiddleware);

const VALID_TYPES = new Set(['daily', 'session', 'agent']);

function normType(t: unknown): string {
  const v = String(t || 'agent');
  return VALID_TYPES.has(v) ? v : 'agent';
}

// GET /api/memory/search?query=&type=&agentId=&topK=&budget= —— 加权检索（recency×relevancy×type），命中刷新使用计数
router.get('/search', async (_req, res) => {
  try {
    const userId = _req.user?.userId;
    if (!userId) { res.status(401).json({ error: '未登录' }); return; }
    const query = String(_req.query.query || '').trim();
    const type = normType(_req.query.type);
    const agentId = String(_req.query.agentId || '');
    const topK = Math.min(Number(_req.query.topK) || 5, 20);
    const budget = Number(_req.query.budget) || undefined;
    const items = await retrieveRelevantMemories(userId, agentId || null, query, { topK, tokenBudget: budget });
    const filtered = type ? items.filter((m) => m.type === type || (type === 'agent' && m.type === 'profile')) : items;
    if (filtered.length) bumpMemoryUsage(filtered.map((m) => m.id));
    const rows = filtered.map((m) => db.prepare('SELECT * FROM memory WHERE id = ?').get(m.id));
    res.json({ data: rows.filter(Boolean) });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// GET /api/memory/inject?query=&agentId=&conversationId= —— 调试端点：预览记忆注入效果（分项得分 + 格式化文本）
router.get('/inject', async (_req, res) => {
  try {
    const userId = _req.user?.userId;
    if (!userId) { res.status(401).json({ error: '未登录' }); return; }
    const query = String(_req.query.query || '').trim();
    if (!query) { res.status(400).json({ error: 'query 为必填项' }); return; }
    const agentId = String(_req.query.agentId || '') || null;
    const conversationId = String(_req.query.conversationId || '') || undefined;
    const items = await retrieveRelevantMemories(userId, agentId, query, { conversationId, withScores: true });
    res.json({
      data: items,
      formatted: formatMemoryContext(items),
      count: items.length,
    });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// GET /api/memory/recent?type=&agentId=&limit= —— 拉取近期记忆（对话前注入用，可多 type 逗号分隔）
router.get('/recent', (_req, res) => {
  try {
    const userId = _req.user?.userId;
    if (!userId) { res.status(401).json({ error: '未登录' }); return; }
    const typeRaw = String(_req.query.type || 'agent,daily,session');
    const types = typeRaw.split(',').map(normType).filter((t) => VALID_TYPES.has(t));
    const agentId = String(_req.query.agentId || '');
    const conversationId = String(_req.query.conversationId || '');
    const limit = Math.min(Number(_req.query.limit) || 10, 50);
    const placeholders = types.map(() => '?').join(',');
    const args: unknown[] = [userId, ...types];
    if (agentId) args.push(agentId);
    const whereAgent = agentId ? ' AND agent_id = ?' : '';
    // session 记忆按当前会话过滤（metadata.conversationId 匹配）；其余类型不受会话限制
    const whereSession = conversationId
      ? ` AND (type != 'session' OR metadata_json LIKE ?)`
      : '';
    if (conversationId) args.push(`%"conversationId":"${conversationId}"%`);
    const rows = db.prepare(
      `SELECT * FROM memory WHERE user_id = ? AND type IN (${placeholders})${whereAgent}${whereSession}
       ORDER BY last_used_at DESC LIMIT ?`,
    ).all(...args, limit);
    res.json({ data: rows });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// POST /api/memory/create —— 写入一条记忆（UI 抽取结果或手动），统一走 writeMemoryItems（含语义去重）
router.post('/create', async (_req, res) => {
  try {
    const userId = _req.user?.userId;
    if (!userId) { res.status(401).json({ error: '未登录' }); return; }
    const content = String(_req.body?.content || '').trim();
    if (!content) { res.status(400).json({ error: 'content 为必填项' }); return; }
    const type = normType(_req.body?.type);
    const agentId = _req.body?.agentId ? String(_req.body.agentId) : null;
    const tags = Array.isArray(_req.body?.tags) ? _req.body.tags : [];
    const metadata = _req.body?.metadata || {};
    const r = await writeMemoryItems(userId, agentId, [{ type: type as MemoryWriteItem['type'], content, tags, metadata }]);
    // 去重更新时没有新行；返回最新一条该内容的记忆
    const row = db.prepare(
      `SELECT * FROM memory WHERE user_id = ? AND content = ? ORDER BY last_used_at DESC LIMIT 1`,
    ).get(userId, content);
    res.json({ data: row, ...r });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// POST /api/memory/upsert-daily —— 每日记忆：按自然天聚合（当天已存在 daily 则合并追加，否则新建）
router.post('/upsert-daily', async (_req, res) => {
  try {
    const userId = _req.user?.userId;
    if (!userId) { res.status(401).json({ error: '未登录' }); return; }
    const content = String(_req.body?.content || '').trim();
    if (!content) { res.status(400).json({ error: 'content 为必填项' }); return; }
    const agentId = _req.body?.agentId ? String(_req.body.agentId) : null;
    const date = String(_req.body?.date || new Date().toISOString().slice(0, 10));
    const metadata = { ...(_req.body?.metadata || {}), date };
    // writeMemoryItems 内部对 daily 按自然天+agent 归属合并；指定历史日期时直接按 metadata 落库
    const r = await writeMemoryItems(userId, agentId, [{ type: 'daily', content, metadata }]);
    const row = db.prepare(
      `SELECT * FROM memory WHERE user_id = ? AND type = 'daily' AND metadata_json LIKE ? ORDER BY last_used_at DESC LIMIT 1`,
    ).get(userId, `%"date":"${date}"%`);
    res.json({ data: row, merged: r.merged > 0 });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// 维度映射（方案A）：前端 dimension → SQL 条件
//   daily    → type = 'daily'
//   session  → type = 'session'
//   agent    → type = 'agent' AND agent_id IS NOT NULL（智能体记忆）
//   profile  → type = 'agent' AND agent_id IS NULL（用户个人画像）
const VALID_DIMENSIONS = new Set(['profile', 'agent', 'session', 'daily']);

// GET /api/memory/list?dimension=&agentId=&keyword=&page=&pageSize= —— 分页查询记忆（按维度/关键词过滤）
router.get('/list', (_req, res) => {
  try {
    const userId = _req.user?.userId;
    if (!userId) { res.status(401).json({ error: '未登录' }); return; }
    const dimension = String(_req.query.dimension || '').trim();
    if (!VALID_DIMENSIONS.has(dimension)) {
      res.status(400).json({ error: 'dimension 取值必须为 profile|agent|session|daily' });
      return;
    }
    const agentId = String(_req.query.agentId || '').trim();
    const keyword = String(_req.query.keyword || '').trim();
    const page = Math.max(Number(_req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(_req.query.pageSize) || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    // 组装 WHERE 条件（user_id 必带，防越权）
    let whereClause = 'user_id = ?';
    const args: unknown[] = [userId];
    if (dimension === 'daily') {
      whereClause += ` AND type = 'daily'`;
    } else if (dimension === 'session') {
      whereClause += ` AND type = 'session'`;
    } else if (dimension === 'agent') {
      whereClause += ` AND type = 'agent' AND agent_id IS NOT NULL`;
    } else {
      whereClause += ` AND type = 'agent' AND agent_id IS NULL`;
    }
    if (agentId) {
      whereClause += ` AND agent_id = ?`;
      args.push(agentId);
    }
    if (keyword) {
      whereClause += ` AND content LIKE ?`;
      args.push(`%${keyword}%`);
    }

    const total = (db.prepare(`SELECT COUNT(*) AS c FROM memory WHERE ${whereClause}`).get(...args) as { c: number }).c;
    const rows = db.prepare(
      `SELECT * FROM memory WHERE ${whereClause} ORDER BY last_used_at DESC LIMIT ? OFFSET ?`,
    ).all(...args, pageSize, offset);
    res.json({ data: rows, total, page, pageSize });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// PATCH /api/memory/:id —— 更新单条记忆（content/tags/metadata 任选），同步刷新 last_used_at
router.patch('/:id', (_req, res) => {
  try {
    const userId = _req.user?.userId;
    if (!userId) { res.status(401).json({ error: '未登录' }); return; }
    const id = String(_req.params.id || '');
    // WHERE 带 user_id 防越权改别人记忆
    const existing = db.prepare('SELECT * FROM memory WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) { res.status(404).json({ error: '记忆不存在或不属于当前用户' }); return; }

    const sets: string[] = [];
    const args: unknown[] = [];
    if (_req.body?.content !== undefined) {
      const content = String(_req.body.content).trim();
      if (!content) { res.status(400).json({ error: 'content 不能为空' }); return; }
      sets.push('content = ?');
      args.push(content);
    }
    if (_req.body?.tags !== undefined) {
      sets.push('tags_json = ?');
      args.push(JSON.stringify(Array.isArray(_req.body.tags) ? _req.body.tags : []));
    }
    if (_req.body?.metadata !== undefined) {
      sets.push('metadata_json = ?');
      args.push(JSON.stringify(_req.body.metadata || {}));
    }
    if (sets.length === 0) {
      res.status(400).json({ error: '未提供要更新的字段（content/tags/metadata）' });
      return;
    }
    sets.push('last_used_at = ?');
    args.push(Date.now());
    args.push(id, userId);
    db.prepare(`UPDATE memory SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...args);
    res.json({ data: db.prepare('SELECT * FROM memory WHERE id = ?').get(id) });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// DELETE /api/memory/:id —— 删除单条记忆（WHERE 带 user_id 防越权）
router.delete('/:id', (_req, res) => {
  try {
    const userId = _req.user?.userId;
    if (!userId) { res.status(401).json({ error: '未登录' }); return; }
    const id = String(_req.params.id || '');
    const existing = db.prepare('SELECT id FROM memory WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) { res.status(404).json({ error: '记忆不存在或不属于当前用户' }); return; }
    db.prepare('DELETE FROM memory WHERE id = ? AND user_id = ?').run(id, userId);
    bumpMemoryCache(userId);
    res.json({ data: { id, deleted: true } });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ===== 记忆整理（Dreaming） =====

// POST /api/memory/dream-run —— 手动触发当前用户的记忆整理
router.post('/dream-run', async (_req, res) => {
  try {
    const userId = _req.user?.userId;
    if (!userId) { res.status(401).json({ error: '未登录' }); return; }
    const r = await runDreamingForUser(userId, 'manual');
    res.json({ data: r });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// GET /api/memory/dream-log?page=&pageSize= —— 整理历史（时间线展示）
router.get('/dream-log', (_req, res) => {
  try {
    const userId = _req.user?.userId;
    if (!userId) { res.status(401).json({ error: '未登录' }); return; }
    const page = Math.max(Number(_req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(_req.query.pageSize) || 10, 1), 50);
    const offset = (page - 1) * pageSize;
    const total = (db.prepare('SELECT COUNT(*) AS c FROM memory_dream_log WHERE user_id = ?').get(userId) as { c: number }).c;
    const rows = db.prepare(
      `SELECT * FROM memory_dream_log WHERE user_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
    ).all(userId, pageSize, offset);
    res.json({ data: rows, total, page, pageSize });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// GET /api/memory/dream-config —— 整理配置
router.get('/dream-config', (_req, res) => {
  const cfg = getDreamingConfig();
  res.json({ data: { enabled: cfg.enabled, hour: cfg.hour } });
});

// PATCH /api/memory/dream-config —— 更新整理配置（enabled/hour）
router.patch('/dream-config', (_req, res) => {
  try {
    const patch: { enabled?: boolean; hour?: number } = {};
    if (_req.body?.enabled !== undefined) patch.enabled = !!_req.body.enabled;
    if (_req.body?.hour !== undefined) {
      const h = Number(_req.body.hour);
      if (Number.isNaN(h) || h < 0 || h > 23) { res.status(400).json({ error: 'hour 取值 0-23' }); return; }
      patch.hour = h;
    }
    const cfg = setDreamingConfig(patch);
    res.json({ data: { enabled: cfg.enabled, hour: cfg.hour } });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
