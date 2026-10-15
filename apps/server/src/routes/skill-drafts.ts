// Skill 蒸馏草稿路由（2026-10-15，对标 WorkMateAI 融合方案 P0-1）
// 三屏工作台的蒸馏任务持久化：列表/详情/创建/更新/删除，字段见 db.ts 的 skill_draft 表注释。
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import { insertSkillDraft } from '../services/skill-draft-store.js';

const router = Router();
router.use(authMiddleware);

/** JSON 字段安全解析（单条坏数据只降级自己，不拖垮整个列表——同 skill.ts 的教训） */
function safeJsonParse<T>(v: unknown, fallback: T): T {
  if (v == null || v === '') return fallback;
  if (typeof v !== 'string') return fallback;
  try {
    const parsed = JSON.parse(v);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function rowToDraft(r: any) {
  return {
    id: r.id,
    title: r.title,
    status: r.status || 'overview',
    sourceConvId: r.source_conv_id ?? null,
    sourceMsgIds: safeJsonParse<string[]>(r.source_msg_ids_json, []),
    overview: safeJsonParse<any>(r.overview_json, null),
    resultMd: r.result_md ?? '',
    error: r.error ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// GET /api/skill-drafts
router.get('/', (req: Request, res: Response) => {
  const uid = req.user!.userId;
  const rows = db
    .prepare('SELECT * FROM skill_draft WHERE user_id = ? OR user_id = ? ORDER BY updated_at DESC')
    .all(uid, 'guest');
  res.json({ data: rows.map(rowToDraft) });
});

// GET /api/skill-drafts/:id
router.get('/:id', (req: Request, res: Response) => {
  const uid = req.user!.userId;
  const row = db.prepare('SELECT * FROM skill_draft WHERE id = ? AND (user_id = ? OR user_id = ?)').get(req.params.id, uid, 'guest') as any;
  if (!row) { res.status(404).json({ error: '草稿不存在' }); return; }
  res.json({ data: rowToDraft(row) });
});

// POST /api/skill-drafts
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { title, status, sourceConvId, sourceMsgIds, overview, resultMd, error } = req.body || {};
  if (!title || typeof title !== 'string') { res.status(400).json({ error: 'title 为必填项' }); return; }

  const row = insertSkillDraft({ userId, title, status, sourceConvId, sourceMsgIds, overview, resultMd, error });
  res.json({ data: rowToDraft(row) });
});

// PATCH /api/skill-drafts/:id
router.patch('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const sid = req.params.id;
  const existing = db.prepare('SELECT * FROM skill_draft WHERE id = ? AND (user_id = ? OR user_id = ?)').get(sid, userId, 'guest') as any;
  if (!existing) { res.status(404).json({ error: '草稿不存在' }); return; }

  const sets: string[] = [];
  const vals: any[] = [];
  if (req.body.title !== undefined) { sets.push('title = ?'); vals.push(String(req.body.title)); }
  if (req.body.status !== undefined) { sets.push('status = ?'); vals.push(String(req.body.status)); }
  if (req.body.sourceConvId !== undefined) { sets.push('source_conv_id = ?'); vals.push(req.body.sourceConvId ?? null); }
  if (req.body.sourceMsgIds !== undefined) {
    sets.push('source_msg_ids_json = ?');
    vals.push(Array.isArray(req.body.sourceMsgIds) ? JSON.stringify(req.body.sourceMsgIds) : null);
  }
  if (req.body.overview !== undefined) {
    sets.push('overview_json = ?');
    vals.push(req.body.overview != null ? JSON.stringify(req.body.overview) : null);
  }
  if (req.body.resultMd !== undefined) { sets.push('result_md = ?'); vals.push(String(req.body.resultMd ?? '')); }
  if (req.body.error !== undefined) { sets.push('error = ?'); vals.push(String(req.body.error ?? '')); }
  if (sets.length === 0) { res.json({ data: rowToDraft(existing) }); return; }
  sets.push('updated_at = ?');
  vals.push(Date.now());
  vals.push(sid);
  db.prepare(`UPDATE skill_draft SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM skill_draft WHERE id = ?').get(sid);
  res.json({ data: rowToDraft(row) });
});

// DELETE /api/skill-drafts/:id
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const existing = db.prepare('SELECT * FROM skill_draft WHERE id = ? AND (user_id = ? OR user_id = ?)').get(req.params.id, userId, 'guest');
  if (!existing) { res.status(404).json({ error: '草稿不存在' }); return; }
  db.prepare('DELETE FROM skill_draft WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
