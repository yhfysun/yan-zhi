// 多层记忆接口（daily=每日聚合 / session=会话 / agent=智能体长期）。
// 抽取的 LLM 调用在 UI 侧完成（UI 持有平台配置与 API Key），这里只负责检索与入库。
// 检索支持向量相似度（embedding BLOB + JS 端余弦），embedding 不可用时降级关键词 LIKE。
import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { embedText } from '../services/ollama-embed.js';

const router = Router();
router.use(authMiddleware);

const VALID_TYPES = new Set(['daily', 'session', 'agent']);

function bytesToVec(b: Uint8Array | Buffer | null): number[] | null {
  if (!b) return null;
  try { return Array.from(new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)); } catch { return null; }
}
function vecToBytes(v: number[] | null): Buffer | null {
  if (!v || !v.length) return null;
  return Buffer.from(new Float32Array(v).buffer);
}
function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
function normType(t: unknown): string {
  const v = String(t || 'agent');
  return VALID_TYPES.has(v) ? v : 'agent';
}

// GET /api/memory/search?query=&type=&agentId=&topK= —— 向量检索（embedding 余弦相似度），降级关键词 LIKE
router.get('/search', async (_req, res) => {
  try {
    const userId = _req.user?.userId;
    if (!userId) { res.status(401).json({ error: '未登录' }); return; }
    const query = String(_req.query.query || '').trim();
    const type = normType(_req.query.type);
    const agentId = String(_req.query.agentId || '');
    const topK = Math.min(Number(_req.query.topK) || 5, 20);
    // 向量检索：生成 query embedding → 拉有 embedding 的记忆 → 余弦相似度排序
    const qVec = await embedText(query).catch(() => null);
    if (qVec) {
      const rows = db.prepare(
        `SELECT * FROM memory WHERE user_id = ? AND type = ?
         AND (? = '' OR agent_id = ?) AND embedding IS NOT NULL`,
      ).all(userId, type, agentId, agentId) as any[];
      const scored = rows
        .map((r) => {
          const v = bytesToVec(r.embedding);
          return v ? { r, score: cosine(qVec, v) } : null;
        })
        .filter((x): x is { r: any; score: number } => x !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
      if (scored.length) { res.json({ data: scored.map((x) => x.r) }); return; }
    }
    // 降级：关键词 LIKE + last_used_at 排序
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

// POST /api/memory/create —— 写入一条记忆（UI 抽取结果或手动），同步生成 embedding
router.post('/create', async (_req, res) => {
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
    const emb = vecToBytes(await embedText(content).catch(() => null));
    db.prepare(
      `INSERT INTO memory (id, user_id, agent_id, content, tags_json, metadata_json, embedding, created_at, last_used_at, type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, userId, agentId, content, tags, metadata, emb, ts, ts, type);
    res.json({ data: db.prepare('SELECT * FROM memory WHERE id = ?').get(id) });
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
      const emb = vecToBytes(await embedText(merged).catch(() => null));
      db.prepare(
        `UPDATE memory SET content = ?, embedding = ?, last_used_at = ? WHERE id = ?`,
      ).run(merged, emb, ts, existing.id);
      res.json({ data: db.prepare('SELECT * FROM memory WHERE id = ?').get(existing.id), merged: true });
      return;
    }
    const id = require('node:crypto').randomUUID();
    const emb = vecToBytes(await embedText(content).catch(() => null));
    db.prepare(
      `INSERT INTO memory (id, user_id, agent_id, content, tags_json, metadata_json, embedding, created_at, last_used_at, type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'daily')`,
    ).run(id, userId, agentId, content, '[]', JSON.stringify(metadata), emb, ts, ts);
    res.json({ data: db.prepare('SELECT * FROM memory WHERE id = ?').get(id), merged: false });
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
    res.json({ data: { id, deleted: true } });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
