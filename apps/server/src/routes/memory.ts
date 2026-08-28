// 多层记忆接口（daily=每日聚合 / session=会话 / agent=智能体长期）。
// 抽取的 LLM 调用在 UI 侧完成（UI 持有平台配置与 API Key），这里只负责检索与入库。
import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

const VALID_TYPES = new Set(['daily', 'session', 'agent']);
function normType(t: unknown): string {
  const v = String(t || 'agent');
  return VALID_TYPES.has(v) ? v : 'agent';
}

// GET /api/memory/search?query=&type=&agentId=&topK= —— 关键词检索（SQL LIKE + last_used_at 排序）
router.get('/search', (_req, res) => {
  try {
    const userId = _req.user?.userId;
    if (!userId) { res.status(401).json({ error: '未登录' }); return; }
    const query = String(_req.query.query || '').trim();
    const type = normType(_req.query.type);
    const agentId = String(_req.query.agentId || '');
    const topK = Math.min(Number(_req.query.topK) || 5, 20);
    const rows = db.prepare(
      `SELECT * FROM memory WHERE user_id = ? AND type = ?
       AND (? = '' OR agent_id = ?) AND content LIKE ?
       ORDER BY last_used_at DESC LIMIT ?`,
    ).all(userId, type, agentId, agentId, `%${query}%`, topK);
    res.json({ data: rows });
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

// POST /api/memory/create —— 写入一条记忆（UI 抽取结果或手动）
router.post('/create', (_req, res) => {
  try {
    const userId = _req.user?.userId;
    if (!userId) { res.status(401).json({ error: '未登录' }); return; }
    const content = String(_req.body?.content || '').trim();
    if (!content) { res.status(400).json({ error: 'content 为必填项' }); return; }
    const type = normType(_req.body?.type);
    const agentId = _req.body?.agentId ? String(_req.body.agentId) : null;
    const tags = JSON.stringify(Array.isArray(_req.body?.tags) ? _req.body.tags : []);
    const metadata = JSON.stringify(_req.body?.metadata || {});
    const id = require('node:crypto').randomUUID();
    const ts = Date.now();
    db.prepare(
      `INSERT INTO memory (id, user_id, agent_id, content, tags_json, metadata_json, created_at, last_used_at, type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, userId, agentId, content, tags, metadata, ts, ts, type);
    res.json({ data: db.prepare('SELECT * FROM memory WHERE id = ?').get(id) });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// POST /api/memory/upsert-daily —— 每日记忆：按自然天聚合（当天已存在 daily 则合并追加，否则新建）
router.post('/upsert-daily', (_req, res) => {
  try {
    const userId = _req.user?.userId;
    if (!userId) { res.status(401).json({ error: '未登录' }); return; }
    const content = String(_req.body?.content || '').trim();
    if (!content) { res.status(400).json({ error: 'content 为必填项' }); return; }
    const agentId = _req.body?.agentId ? String(_req.body.agentId) : null;
    const date = String(_req.body?.date || new Date().toISOString().slice(0, 10));
    const metadata = { ...(_req.body?.metadata || {}), date };
    const ts = Date.now();
    // 找当天已存在的 daily 记忆（agent 归属相同）
    const existing = db.prepare(
      `SELECT * FROM memory WHERE user_id = ? AND type = 'daily'
       AND (? IS NULL OR agent_id = ?) AND metadata_json LIKE ?
       ORDER BY last_used_at DESC LIMIT 1`,
    ).all(userId, agentId, agentId, `%"date":"${date}"%`)[0] as any;
    if (existing) {
      const merged = existing.content.endsWith('\n')
        ? existing.content + content
        : existing.content + '\n' + content;
      db.prepare(
        `UPDATE memory SET content = ?, last_used_at = ? WHERE id = ?`,
      ).run(merged, ts, existing.id);
      res.json({ data: db.prepare('SELECT * FROM memory WHERE id = ?').get(existing.id), merged: true });
      return;
    }
    const id = require('node:crypto').randomUUID();
    db.prepare(
      `INSERT INTO memory (id, user_id, agent_id, content, tags_json, metadata_json, created_at, last_used_at, type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'daily')`,
    ).run(id, userId, agentId, content, '[]', JSON.stringify(metadata), ts, ts);
    res.json({ data: db.prepare('SELECT * FROM memory WHERE id = ?').get(id), merged: false });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
