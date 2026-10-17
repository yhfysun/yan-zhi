import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { isParentTaskType } from '@yan-zhi/shared';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import { readSpaceMemory, writeSpaceMemory } from '../services/space-memory.js';
import { setSpaceTaskType, listResourceDir, summarizeResourceDirs, resolveResourceFilePath } from '../services/space-resources.js';
import { syncSpaceSubdirs, promoteChildSpaces, validateParent } from '../services/space-tree.js';

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
    parentId: r.parent_id ?? null,
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
  const { name, dirPath, description, sortOrder, parentId } = req.body || {};
  if (!name) { res.status(400).json({ error: '名称为必填项' }); return; }
  // parent_id（2026-10-17 父任务目录）：给了就必须合法（存在 / 不是自己 / 只允许两级）
  if (parentId) {
    const bad = validateParent(userId, null, String(parentId));
    if (bad) { res.status(400).json({ error: bad }); return; }
  }
  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO space (id, user_id, name, dir_path, description, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, userId, name, dirPath || null, description || null, parentId || null, sortOrder ?? 0, now, now);
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
  // parent_id（2026-10-17）：null = 上提为顶层；变更时校验父合法性
  if (req.body.parentId !== undefined) {
    const pid = req.body.parentId || null;
    if (pid) {
      const bad = validateParent(userId, sid, String(pid));
      if (bad) { res.status(400).json({ error: bad }); return; }
    }
    sets.push('parent_id = ?'); vals.push(pid);
  }
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
  if (sets.length > 0) {
    sets.push('updated_at = ?'); vals.push(Date.now());
    vals.push(sid);
    db.prepare(`UPDATE space SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  // ★ 自动收编子目录（2026-10-17 用户拍板「设置成父任务类型自动合并」）：
  //   空间设成**父任务类型**（有子线）后，把它 dir_path 下的子文件夹同步成子空间
  //   （已有的平铺空间直接收编，不重复建）。dirPath 变更且已是父类型时也重扫一次。
  //   失败不阻塞更新本身（收编是增强动作，报错会在显式同步端点里暴露）。
  const after = db.prepare('SELECT * FROM space WHERE id = ?').get(sid) as any;
  const isParentSpace = !!after?.task_type && after.parent_id == null && isParentTaskType(after.task_type);
  if (isParentSpace && (req.body.taskType !== undefined || req.body.dirPath !== undefined)) {
    try { await syncSpaceSubdirs(userId, sid); } catch { /* 显式同步端点里会给出可读错误 */ }
  }

  const row = db.prepare('SELECT * FROM space WHERE id = ?').get(sid);
  res.json({ data: rowToSpace(row) });
});

// POST /api/spaces/:id/sync-subdirs —— 把父任务目录下的磁盘子文件夹同步成子空间（幂等）
//
// ★ 自动收编的显式入口：侧栏父任务目录右键「同步子目录」；绑定父任务类型时 PATCH 里也会
//   自动触发一次，这里是重扫/补救入口（新放了文件夹进来、或自动同步失败时用）。
router.post('/:id/sync-subdirs', async (req: Request, res: Response) => {
  try {
    const data = await syncSpaceSubdirs(req.user!.userId, req.params.id);
    res.json({ data });
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
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
  // 子空间上提为顶层（删父不毁子，与 task-types 删父类型同语义）
  promoteChildSpaces(sid);
  db.prepare('DELETE FROM space WHERE id = ?').run(sid);
  res.json({ ok: true });
});

export default router;
