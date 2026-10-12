// 场景（模式）配置 CRUD 路由。
//
// 背景：场景/模式原先写死在前端 packages/ui/src/config/scenes.ts（= 固定 智能体+skill 组合），
//   新增一个模式必须改前端代码。2026-10-12 起搬进 scene_config 表（db.ts 建表 + 内置种子），
//   本路由提供动态增删改 —— 用户/应用可为「自己的智能体」配一个模式行
//   （绑 agentId + 场景提示词 + skill 关键词 + 欢迎卡示例），不必发版。
//
// 边界（与 agents.ts 的内置保护同语义）：
//   - 内置行（is_builtin=1，id=scene_<key>）：PATCH/DELETE 一律拒绝，只能 reset 恢复代码默认；
//   - 内置场景 key 是保留键，POST 撞键直接 400（种子按 key 收敛，用户行抢键会让内置行失效）；
//   - 归属：guest 为默认身份（桌面内置 server / web 未登录），与 agent/skill 路由一致。
import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db, resetBuiltinScene } from '../db.js';
// 内置场景 key 保留表（不 import db 的纯数据模块，路由层只读 key 集合）
import { builtinSceneDefs } from '../builtin-scene-defs.js';

const router = Router();
router.use(authMiddleware);

const BUILTIN_SCENE_KEYS = new Set(builtinSceneDefs.map((s) => s.key));

// GET /api/scene-configs —— 全部场景配置（按 sort_order 排序；前端按 is_mode 过滤欢迎卡）
router.get('/', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM scene_config ORDER BY sort_order ASC, id ASC').all();
  res.json({ data: rows });
});

// POST /api/scene-configs —— 动态创建「模式」
// 一行配置 = 一个模式：绑定的智能体 + 场景提示词 + skill 关键词 + 欢迎卡示例。
router.post('/', (req: Request, res: Response) => {
  const b = req.body || {};
  const key = String(b.key || '').trim();
  const name = String(b.name || '').trim();
  if (!key || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(key)) {
    res.status(400).json({ error: '场景 key 必填，且只能包含字母/数字/-/_（1~64 字符）' });
    return;
  }
  if (!name) { res.status(400).json({ error: '场景名称为必填项' }); return; }
  if (BUILTIN_SCENE_KEYS.has(key)) {
    res.status(400).json({ error: `「${key}」是内置场景保留键，请换一个 key` });
    return;
  }
  const dup = db.prepare('SELECT id FROM scene_config WHERE key = ?').get(key);
  if (dup) { res.status(409).json({ error: '场景 key 已存在' }); return; }
  // agentId 不强制存在性校验（智能体可后建/可删），与 agents 路由一致：选场景时前端有 agents.some() 守卫
  const id = uuid();
  const now = Date.now();
  db.prepare(
    `INSERT INTO scene_config (id, key, name, icon, color, description, agent_id, prompt, skill_keywords_json, examples_json,
       is_mode, sort_order, enabled, is_builtin, force_sync, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 'guest', ?, ?)`,
  ).run(
    id, key, name,
    b.icon ? String(b.icon) : null,
    b.color ? String(b.color) : '#3b82f6',
    b.description ? String(b.description) : '',
    b.agentId ? String(b.agentId) : null,
    b.prompt ? String(b.prompt) : '',
    JSON.stringify(Array.isArray(b.skillKeywords) ? b.skillKeywords.map(String) : []),
    JSON.stringify(Array.isArray(b.examples) ? b.examples.map(String) : []),
    b.isMode ? 1 : 0,
    Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 100,
    now, now,
  );
  const row = db.prepare('SELECT * FROM scene_config WHERE id = ?').get(id);
  res.json({ data: row });
});

// PATCH /api/scene-configs/:id —— 更新场景配置（仅非内置）
router.patch('/:id', (req: Request, res: Response) => {
  const existing = db.prepare('SELECT * FROM scene_config WHERE id = ?').get(req.params.id) as any;
  if (!existing) { res.status(404).json({ error: '场景配置不存在' }); return; }
  if (existing.is_builtin) {
    res.status(400).json({ error: '内置场景不可修改（由代码收敛），可调 reset 恢复默认' });
    return;
  }
  const b = req.body || {};
  const sets: string[] = [];
  const vals: any[] = [];
  const strMap: Record<string, string> = {
    name: 'name', icon: 'icon', color: 'color', description: 'description',
    agentId: 'agent_id', prompt: 'prompt',
  };
  for (const [k, col] of Object.entries(strMap)) {
    if (b[k] !== undefined) { sets.push(`${col} = ?`); vals.push(b[k] == null ? null : String(b[k])); }
  }
  const jsonMap: Record<string, string> = { skillKeywords: 'skill_keywords_json', examples: 'examples_json' };
  for (const [k, col] of Object.entries(jsonMap)) {
    if (b[k] !== undefined) { sets.push(`${col} = ?`); vals.push(JSON.stringify(Array.isArray(b[k]) ? b[k].map(String) : [])); }
  }
  if (b.isMode !== undefined) { sets.push('is_mode = ?'); vals.push(b.isMode ? 1 : 0); }
  if (b.enabled !== undefined) { sets.push('enabled = ?'); vals.push(b.enabled ? 1 : 0); }
  if (b.sortOrder !== undefined && Number.isFinite(Number(b.sortOrder))) { sets.push('sort_order = ?'); vals.push(Number(b.sortOrder)); }
  if (sets.length === 0) { res.json({ data: existing }); return; }
  sets.push('updated_at = ?'); vals.push(Date.now());
  vals.push(req.params.id);
  db.prepare(`UPDATE scene_config SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM scene_config WHERE id = ?').get(req.params.id);
  res.json({ data: row });
});

// DELETE /api/scene-configs/:id —— 删除场景配置（仅非内置）
router.delete('/:id', (req: Request, res: Response) => {
  const existing = db.prepare('SELECT id, is_builtin FROM scene_config WHERE id = ?').get(req.params.id) as any;
  if (!existing) { res.status(404).json({ error: '场景配置不存在' }); return; }
  if (existing.is_builtin) {
    res.status(400).json({ error: '内置场景不可删除（由代码收敛），可调 reset 恢复默认' });
    return;
  }
  db.prepare('DELETE FROM scene_config WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/scene-configs/:id/reset —— 恢复内置场景默认值
router.post('/:id/reset', (req: Request, res: Response) => {
  const ok = resetBuiltinScene(req.params.id);
  if (!ok) { res.status(404).json({ error: '该场景不是内置场景或不存在，无法恢复默认' }); return; }
  const row = db.prepare('SELECT * FROM scene_config WHERE id = ?').get(req.params.id);
  res.json({ data: row });
});

export default router;
