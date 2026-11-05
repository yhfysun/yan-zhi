import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { aclExistsSql } from '../services/resource-acl.js';
import { db, resetBuiltinSkill } from '../db.js';
import { isSafeSkillFilePath } from '../services/skill-files.js';
import { canPublishShared } from '../services/platform-share.js';

const router = Router();
router.use(authMiddleware);

// GET /api/skills —— 可见 = 自己的 ∪ guest 预置 ∪ 共享（is_public=1）
router.get('/', (req: Request, res: Response) => {
  const uid = req.user!.userId;
  // 占位符共 5 个：user_id=? 、user_id=?(guest 预置) 、aclExistsSql 里 3 个（直接用户/角色/组织）。
  // ★ 多传一个 uid 会让 better-sqlite3 抛 RangeError → 整个 /api/skills 500（同 /api/plugins 的老坑）。
  const rows = db.prepare(`SELECT * FROM skill WHERE user_id = ? OR user_id = ? OR is_public = 1 OR ${aclExistsSql('skill', 'skill.id')}
    ORDER BY created_at DESC`).all(uid, 'guest', uid, uid, uid);
  res.json({ data: rows });
});

// POST /api/skills
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { name, description, triggers, body, category, files, pageAssets, capabilities } = req.body || {};
  if (!name || !body) { res.status(400).json({ error: '名称和 body 为必填项' }); return; }
  // 子目录文件（2026-10-06）：[{path, content}]，path 相对 skill 根（禁绝对路径/..）
  const safeFiles = Array.isArray(files)
    ? files.filter((f: any) => f && typeof f.path === 'string' && isSafeSkillFilePath(f.path) && typeof f.content === 'string')
        .map((f: any) => ({ path: String(f.path).replace(/\\/g, '/').trim(), content: String(f.content) }))
    : [];

  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO skill (id, user_id, name, description, triggers_json, body, category, files_json, page_asset_refs_json, asset_capabilities_json, enabled, installs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id, userId, name, description || null, JSON.stringify(triggers || []), body, category || null,
    safeFiles.length ? JSON.stringify(safeFiles) : null,
    JSON.stringify(Array.isArray(pageAssets) ? pageAssets : []),
    JSON.stringify(Array.isArray(capabilities) ? capabilities : []),
    1, 0, now,
  );
  const row = db.prepare('SELECT * FROM skill WHERE id = ?').get(id);
  res.json({ data: row });
});

// PATCH /api/skills/:id
router.patch('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const sid = req.params.id;
  const existing = db.prepare('SELECT * FROM skill WHERE id = ? AND user_id = ?').get(sid, userId) as any;
  if (!existing) { res.status(404).json({ error: 'Skill 不存在' }); return; }

  const sets: string[] = [];
  const vals: any[] = [];
  if (req.body.name !== undefined) { sets.push('name = ?'); vals.push(req.body.name); }
  if (req.body.description !== undefined) { sets.push('description = ?'); vals.push(req.body.description); }
  if (req.body.body !== undefined) { sets.push('body = ?'); vals.push(req.body.body); }
  if (req.body.enabled !== undefined) { sets.push('enabled = ?'); vals.push(req.body.enabled ? 1 : 0); }
  if (req.body.category !== undefined) { sets.push('category = ?'); vals.push(req.body.category); }
  if (req.body.triggers !== undefined) { sets.push('triggers_json = ?'); vals.push(JSON.stringify(req.body.triggers)); }
  if (req.body.pageAssets !== undefined) { sets.push('page_asset_refs_json = ?'); vals.push(JSON.stringify(Array.isArray(req.body.pageAssets) ? req.body.pageAssets : [])); }
  if (req.body.capabilities !== undefined) { sets.push('asset_capabilities_json = ?'); vals.push(JSON.stringify(Array.isArray(req.body.capabilities) ? req.body.capabilities : [])); }
  // 子目录文件整体替换（2026-10-06）：传数组=设置，传 null=清空；不传=不动
  if (req.body.files !== undefined) {
    if (req.body.files === null) { sets.push('files_json = ?'); vals.push(null); }
    else if (Array.isArray(req.body.files)) {
      const safe = req.body.files.filter((f: any) => f && typeof f.path === 'string' && isSafeSkillFilePath(f.path) && typeof f.content === 'string')
        .map((f: any) => ({ path: String(f.path).replace(/\\/g, '/').trim(), content: String(f.content) }));
      sets.push('files_json = ?'); vals.push(safe.length ? JSON.stringify(safe) : null);
    }
  }
  // 共享授权收口：multi 模式下把 skill 设为公共需 share.skill.publish 权限
  if (req.body.isPublic !== undefined) {
    if (req.body.isPublic && !canPublishShared('skill', userId)) {
      res.status(403).json({ error: '共享 Skill 需要管理员授权（share.skill.publish）', code: 'FORBIDDEN' });
      return;
    }
    sets.push('is_public = ?'); vals.push(req.body.isPublic ? 1 : 0);
  }
  if (sets.length === 0) { res.json({ data: existing }); return; }
  vals.push(sid);
  db.prepare(`UPDATE skill SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM skill WHERE id = ?').get(sid);
  res.json({ data: row });
});

// DELETE /api/skills/:id
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const sid = req.params.id;
  const existing = db.prepare('SELECT * FROM skill WHERE id = ? AND user_id = ?').get(sid, userId);
  if (!existing) { res.status(404).json({ error: 'Skill 不存在' }); return; }
  db.prepare('DELETE FROM skill WHERE id = ?').run(sid);
  res.json({ ok: true });
});

// POST /api/skills/:id/reset —— 恢复内置 skill 默认值（name/description/triggers/body/category）
router.post('/:id/reset', (req: Request, res: Response) => {
  const ok = resetBuiltinSkill(req.params.id);
  if (!ok) { res.status(404).json({ error: '该 Skill 不是内置 skill 或不存在，无法恢复默认' }); return; }
  const row = db.prepare('SELECT * FROM skill WHERE id = ?').get(req.params.id);
  res.json({ data: row });
});

export default router;
