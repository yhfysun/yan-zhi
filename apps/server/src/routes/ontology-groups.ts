// 本体包（分类树）路由（P4.5）：树查询 + 新建/重命名/移动/删除。
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { listGroupTree, createGroup, renameGroup, moveGroup, deleteGroup } from '../services/ontology-group.js';

const router = Router();
router.use(authMiddleware);

// GET /api/ontology-groups —— 分类树
router.get('/', (req: Request, res: Response) => {
  res.json({ data: listGroupTree(req.user!.userId) });
});

// POST /api/ontology-groups —— 新建包（parentId 缺省 = 根；支持多级嵌套）
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, parentId } = req.body || {};
    res.json({ data: createGroup(req.user!.userId, String(name || ''), parentId ? String(parentId) : null) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/ontology-groups/:id —— 重命名
router.patch('/:id', (req: Request, res: Response) => {
  try {
    renameGroup(req.user!.userId, req.params.id, String(req.body?.name || ''));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/ontology-groups/:id/move —— 移动到新父级（parentId 空 = 根）
router.post('/:id/move', (req: Request, res: Response) => {
  try {
    const parentId = req.body?.parentId ? String(req.body.parentId) : null;
    moveGroup(req.user!.userId, req.params.id, parentId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/ontology-groups/:id —— 删除（子包上提一级，本体归「未分类」）
router.delete('/:id', (req: Request, res: Response) => {
  try {
    deleteGroup(req.user!.userId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
