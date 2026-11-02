// 标准属性库路由（P4.7 树结构版）：
// GET /       → 分类树（分组可多级嵌套，属性叶子 key/value/def）
// POST /      → 新建节点（kind=group|attr，parentId 指定父级）
// PATCH /:id  → 更新节点（分组改名 / 属性 key·value·def / 移动 parentId）
// DELETE /:id → 删除节点（子节点上提一级，不级联删除）
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { listStdAttrTree, createStdAttrNode, updateStdAttrNode, deleteStdAttrNode, previewEnum, refreshEnum, type StdAttrInput } from '../services/std-attribute.js';

const router = Router();
router.use(authMiddleware);

// GET /api/std-attributes
router.get('/', (req: Request, res: Response) => {
  res.json({ data: listStdAttrTree(req.user!.userId) });
});

// POST /api/std-attributes
router.post('/', (req: Request, res: Response) => {
  try {
    res.json({ data: createStdAttrNode(req.user!.userId, (req.body || {}) as StdAttrInput) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/std-attributes/preview-enum —— 枚举预览（只读 SELECT → 去重值，不落库）
router.post('/preview-enum', async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    res.json({
      data: await previewEnum(req.user!.userId, {
        id: b.id ? String(b.id) : undefined,
        datasourceId: b.datasourceId ? String(b.datasourceId) : undefined,
        sql: b.sql ? String(b.sql) : undefined,
        source: b.source === 'distinct' || b.source === 'manual' ? b.source : 'sql',
      }),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/std-attributes/:id/refresh-enum —— 跑一次枚举来源并写回
router.post('/:id/refresh-enum', async (req: Request, res: Response) => {
  try {
    res.json({ data: await refreshEnum(req.user!.userId, req.params.id) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/std-attributes/:id
router.patch('/:id', (req: Request, res: Response) => {
  try {
    res.json({ data: updateStdAttrNode(req.user!.userId, req.params.id, (req.body || {}) as StdAttrInput) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/std-attributes/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    deleteStdAttrNode(req.user!.userId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
