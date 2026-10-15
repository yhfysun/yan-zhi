// 任务类型配置 CRUD 路由。
//
// 背景：任务类型原先写死在 shared 的 TASK_TYPES，新增/改 SOP 必须改代码 + 发版 + 重新打包。
// 2026-10-14 起搬进 task_type 表（db.ts 建表 + 内置种子），本路由提供动态增删改 ——
// **用户 / 应用 / 大模型**都能自己创建任务类型（绑智能体 + skill 挂载 + SOP 步骤 + 父任务），
// 刷新即可见，不必发版。
//
// 边界（与 scene-configs.ts / agents.ts 的内置保护同语义）：
//   - 内置行（is_builtin=1，id=tt_<key>）：PATCH/DELETE 一律拒绝，只能 reset 恢复代码默认；
//   - 内置 key 是保留键，POST 撞键直接 400（否则用户行会把内置行顶掉，种子按 key 收敛失效）；
//   - 归属：guest 为默认身份（桌面内置 server / web 未登录），与 agent/skill 路由一致；
//   - 删一个父类型时，其子类型一律**上提为顶层**（不级联删除 —— 用户删父不等于毁掉子线）。
import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db, resetBuiltinTaskType } from '../db.js';
// 内置 key 保留表（不 import db 的纯数据模块，路由层只读 key 集合）
import { builtinTaskTypeDefs } from '../builtin-task-type-defs.js';

const router = Router();
router.use(authMiddleware);

const BUILTIN_TASK_TYPE_KEYS = new Set(builtinTaskTypeDefs.map((t) => t.id));
const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

// GET /api/task-types —— 全部任务类型（按 sort_order 排序）
router.get('/', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM task_type WHERE enabled = 1 ORDER BY sort_order ASC, id ASC').all();
  res.json({ data: rows });
});

// POST /api/task-types —— 动态创建任务类型
// 一行 = 一个任务类型：流程名 + SOP 步骤 + 绑定智能体 + skill 挂载 + 父类型。
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const b = req.body || {};
  const key = String(b.key || '').trim();
  const label = String(b.label || '').trim();
  if (!key || !KEY_RE.test(key)) {
    res.status(400).json({ error: '类型 key 必填，且只能包含字母/数字/-/_（1~64 字符）' });
    return;
  }
  if (!label) { res.status(400).json({ error: '类型名称为必填项' }); return; }
  if (BUILTIN_TASK_TYPE_KEYS.has(key)) {
    res.status(400).json({ error: `「${key}」是内置保留键，请换一个 key（内置类型不可覆盖，只能恢复默认）` });
    return;
  }
  const exist = db.prepare('SELECT id FROM task_type WHERE key = ?').get(key);
  if (exist) { res.status(400).json({ error: `类型 key「${key}」已存在` }); return; }
  // 父类型必须存在（防止挂到空气上：下拉分组会塌，选线引导也列不出子线）
  const parentKey = b.parentKey ? String(b.parentKey) : null;
  if (parentKey && !db.prepare('SELECT id FROM task_type WHERE key = ? AND enabled = 1').get(parentKey)) {
    res.status(400).json({ error: `父类型「${parentKey}」不存在` });
    return;
  }
  const steps = Array.isArray(b.steps) ? b.steps : [];
  const skills = Array.isArray(b.skillIds) ? b.skillIds : [];
  const now = Date.now();
  const id = `tt_${key}`;
  db.prepare(
    `INSERT INTO task_type (id, key, label, summary, guide, agent_id, skill_ids_json, steps_json, parent_key,
       sort_order, enabled, is_builtin, force_sync, source, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 'user', ?, ?, ?)`,
  ).run(
    id, key, label, String(b.summary || '').trim(), String(b.guide || '').trim(),
    b.agentId ? String(b.agentId) : null,
    JSON.stringify(skills), JSON.stringify(steps), parentKey,
    Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 999,
    userId, now, now,
  );
  const row = db.prepare('SELECT * FROM task_type WHERE id = ?').get(id);
  res.json({ data: row });
});

// PATCH /api/task-types/:id —— 修改（内置行拒绝）
router.patch('/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM task_type WHERE id = ?').get(id) as any;
  if (!row) { res.status(404).json({ error: '任务类型不存在' }); return; }
  if (row.is_builtin) {
    res.status(403).json({ error: '内置任务类型不可修改（如需改，请复制成自建类型；改坏了可用 reset 恢复默认）' });
    return;
  }
  const b = req.body || {};
  const sets: string[] = [];
  const vals: any[] = [];
  const put = (col: string, v: any) => { sets.push(`${col} = ?`); vals.push(v); };
  if (b.label !== undefined) put('label', String(b.label));
  if (b.summary !== undefined) put('summary', String(b.summary));
  if (b.guide !== undefined) put('guide', String(b.guide));
  if (b.agentId !== undefined) put('agent_id', b.agentId ? String(b.agentId) : null);
  if (b.skillIds !== undefined) put('skill_ids_json', JSON.stringify(Array.isArray(b.skillIds) ? b.skillIds : []));
  if (b.steps !== undefined) put('steps_json', JSON.stringify(Array.isArray(b.steps) ? b.steps : []));
  if (b.sortOrder !== undefined) put('sort_order', Number(b.sortOrder));
  if (b.parentKey !== undefined) {
    const parentKey = b.parentKey ? String(b.parentKey) : null;
    if (parentKey && !db.prepare('SELECT id FROM task_type WHERE key = ? AND enabled = 1').get(parentKey)) {
      res.status(400).json({ error: `父类型「${parentKey}」不存在` });
      return;
    }
    put('parent_key', parentKey);
  }
  if (sets.length === 0) { res.json({ data: row }); return; }
  put('updated_at', Date.now());
  vals.push(id);
  db.prepare(`UPDATE task_type SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ data: db.prepare('SELECT * FROM task_type WHERE id = ?').get(id) });
});

// DELETE /api/task-types/:id —— 删除（内置行拒绝）
// ★ 删父不删子：子类型上提为顶层（父没了，子线还得能用）。
router.delete('/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM task_type WHERE id = ?').get(id) as any;
  if (!row) { res.status(404).json({ error: '任务类型不存在' }); return; }
  if (row.is_builtin) {
    res.status(403).json({ error: '内置任务类型不可删除（可 PATCH 关掉，或用 reset 恢复默认）' });
    return;
  }
  db.prepare('UPDATE task_type SET parent_key = NULL, updated_at = ? WHERE parent_key = ?').run(Date.now(), row.key);
  db.prepare('DELETE FROM task_type WHERE id = ?').run(id);
  res.json({ data: { id } });
});

// POST /api/task-types/reset —— 恢复某条内置类型的代码默认值
router.post('/reset', (req: Request, res: Response) => {
  const id = String((req.body || {}).id || '');
  if (!id) { res.status(400).json({ error: 'id 为必填项' }); return; }
  res.json({ data: { restored: resetBuiltinTaskType(id) } });
});

export default router;
