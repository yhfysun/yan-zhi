import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import { readSpaceMemory, writeSpaceMemory } from '../services/space-memory.js';
import { setSpaceTaskType, listResourceDir, summarizeResourceDirs, resolveResourceFilePath } from '../services/space-resources.js';

const router = Router();
router.use(authMiddleware);

function rowToSpace(r: any) {
  return {
    id: r.id,
    name: r.name,
    dirPath: r.dir_path,
    description: r.description,
    taskType: r.task_type ?? null,
    taskConfigJson: r.task_config_json ?? null,
    sortOrder: r.sort_order ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// GET /api/spaces —— 列出当前用户的所有空间（按 sort_order 升序、updated_at 降序）
//
// ★ 不在这里建资源目录：资源目录**只在设了任务类型时才有意义**（用户 2026-09-27 明确）。
//   没绑类型的空间是"零散任务"的容器，不该被塞进 00-source 等空目录。
router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const rows = db.prepare(
    'SELECT * FROM space WHERE user_id = ? ORDER BY sort_order ASC, updated_at DESC',
  ).all(userId);
  res.json({ data: rows.map(rowToSpace) });
});

// POST /api/spaces —— 创建空间
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { name, dirPath, description, sortOrder } = req.body || {};
  if (!name) { res.status(400).json({ error: '名称为必填项' }); return; }
  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO space (id, user_id, name, dir_path, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, userId, name, dirPath || null, description || null, sortOrder ?? 0, now, now);
  // ★ 建空间时**不建资源目录**：目录骨架只在设任务类型时建（见 setSpaceTaskType）。
  //   用户明确："没有任务类型默认目录不需要建立" —— 没绑类型的空间是零散任务容器。
  const row = db.prepare('SELECT * FROM space WHERE id = ?').get(id);
  res.json({ data: rowToSpace(row) });
});

// PATCH /api/spaces/:id —— 更新空间
router.patch('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const sid = req.params.id;
  const existing = db.prepare('SELECT * FROM space WHERE id = ? AND user_id = ?').get(sid, userId) as any;
  if (!existing) { res.status(404).json({ error: '空间不存在' }); return; }

  const sets: string[] = [];
  const vals: any[] = [];
  if (req.body.name !== undefined) { sets.push('name = ?'); vals.push(req.body.name); }
  if (req.body.dirPath !== undefined) { sets.push('dir_path = ?'); vals.push(req.body.dirPath || null); }
  if (req.body.description !== undefined) { sets.push('description = ?'); vals.push(req.body.description || null); }
  if (req.body.sortOrder !== undefined) { sets.push('sort_order = ?'); vals.push(req.body.sortOrder); }
  // taskType：走专用服务（建资源目录骨架 + 写 task.json，幂等），不在这里裸改列
  if (req.body.taskType !== undefined && req.body.taskType !== existing.task_type) {
    try {
      await setSpaceTaskType(userId, sid, req.body.taskType || null);
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
      return;
    }
  }
  if (req.body.taskConfigJson !== undefined) {
    sets.push('task_config_json = ?'); vals.push(req.body.taskConfigJson || null);
  }
  if (sets.length === 0) { res.json({ data: rowToSpace(db.prepare('SELECT * FROM space WHERE id = ?').get(sid)) }); return; }
  sets.push('updated_at = ?'); vals.push(Date.now());
  vals.push(sid);
  db.prepare(`UPDATE space SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM space WHERE id = ?').get(sid);
  res.json({ data: rowToSpace(row) });
});

// GET /api/spaces/:id/resources —— 资源目录概览（各段文件数，供「项目资源」段渲染）
router.get('/:id/resources', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const space = db.prepare('SELECT * FROM space WHERE id = ? AND user_id = ?').get(req.params.id, userId);
    if (!space) { res.status(404).json({ error: '空间不存在' }); return; }
    const data = await summarizeResourceDirs(req.params.id);
    res.json({ data });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// GET /api/spaces/:id/resources/:dir/raw?name=xxx —— 直读资源目录下的某个文件
//
// ★ 为什么必须有这个接口（2026-09-27 修的真实缺陷）：
//   「项目资源」段列出的条目，路径是**服务端绝对路径**（如 <空间目录>/00-source/剧本.txt）。
//   桌面端能直接读本地盘；但 Web 端 fs 适配器走 File System Access API，
//   只认用户授权过的根句柄，拿到服务端绝对路径必然解析失败。
//   而既有的 /conversations/:id/file-path 兜底又依赖 conversationId（资源文件
//   根本没登记进 conversation_file）→ 点开就是"找不到文件"。
//   这里给「按空间 + 资源目录 + 文件名」的直读通道，两端一致可用。
router.get('/:id/resources/:dir/raw', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const space = db.prepare('SELECT * FROM space WHERE id = ? AND user_id = ?').get(req.params.id, userId);
    if (!space) { res.status(404).json({ error: '空间不存在' }); return; }
    const dir = String(req.params.dir || '');
    const name = String(req.query.name || '').trim();
    if (!name) { res.status(400).json({ error: 'name 为必填项' }); return; }
    const hit = resolveResourceFilePath(req.params.id, dir, name);
    if (!hit) { res.status(404).json({ error: '文件不存在' }); return; }
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.sendFile(hit);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// GET /api/spaces/:id/resources/:dir —— 列举某段资源目录下的文件（一层）
router.get('/:id/resources/:dir', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const space = db.prepare('SELECT * FROM space WHERE id = ? AND user_id = ?').get(req.params.id, userId);
    if (!space) { res.status(404).json({ error: '空间不存在' }); return; }
    const data = await listResourceDir(req.params.id, req.params.dir);
    res.json({ data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(msg.includes('未知的资源目录') ? 400 : 500).json({ error: msg });
  }
});

// GET /api/spaces/:id/memory —— 读取空间记忆文件（MEMORY.md，跨会话、所有智能体共享）
router.get('/:id/memory', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = await readSpaceMemory(userId, req.params.id);
    res.json({ data });
  } catch (e: unknown) {
    res.status(e instanceof Error && e.message.includes('不存在') ? 404 : 500).json({
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

// PUT /api/spaces/:id/memory —— 整体保存空间记忆文件（前端编辑器保存）
router.put('/:id/memory', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const content = String(req.body?.content ?? '');
    if (content.length > 512 * 1024) { res.status(400).json({ error: '空间记忆文件过大（上限 512KB）' }); return; }
    const r = await writeSpaceMemory(userId, req.params.id, content);
    res.json({ data: r });
  } catch (e: unknown) {
    res.status(e instanceof Error && e.message.includes('不存在') ? 404 : 500).json({
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

// DELETE /api/spaces/:id —— 删除空间（其下会话 space_id 置空归"未归类"，目录文件不动）
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const sid = req.params.id;
  const existing = db.prepare('SELECT * FROM space WHERE id = ? AND user_id = ?').get(sid, userId);
  if (!existing) { res.status(404).json({ error: '空间不存在' }); return; }
  // 置空其下会话的 space_id
  db.prepare('UPDATE conversation SET space_id = NULL WHERE space_id = ? AND user_id = ?').run(sid, userId);
  db.prepare('DELETE FROM space WHERE id = ?').run(sid);
  res.json({ ok: true });
});

export default router;
