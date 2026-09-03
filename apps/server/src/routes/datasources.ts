// 数据源路由（P1.3）：CRUD + 测试连接 + 拉取结构。
// 密码只写不回显（列表/详情返回 hasPassword 布尔）。
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import {
  createDataSource,
  deleteDataSource,
  listDataSources,
  syncDataSourceSchema,
  testDataSource,
  updateDataSource,
} from '../services/datasource.js';

const router = Router();

// GET /api/datasources —— 列表（首次调用自动补内置项目库）
router.get('/', authMiddleware, (req: Request, res: Response) => {
  res.json({ data: listDataSources(req.user!.userId) });
});

// POST /api/datasources —— 新建
router.post('/', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: createDataSource(req.user!.userId, req.body || {}) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PUT /api/datasources/:id —— 更新（内置项目库不可改；密码不传=保持原值，传空串=清除）
router.put('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: updateDataSource(req.user!.userId, req.params.id, req.body || {}) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/datasources/:id
router.delete('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    deleteDataSource(req.user!.userId, req.params.id);
    res.json({ data: { ok: true } });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/datasources/:id/test —— 测试连接，结果回写状态
router.post('/:id/test', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json({ data: await testDataSource(req.user!.userId, req.params.id) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/datasources/:id/schema —— 拉取库表结构（库→表→列，含注释，供本体生成/富化）
router.get('/:id/schema', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json({ data: await syncDataSourceSchema(req.user!.userId, req.params.id) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
