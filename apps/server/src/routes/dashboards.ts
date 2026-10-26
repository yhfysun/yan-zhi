// 看板路由（数据查询 P1）：CRUD + widget 增删改 + 拖拽重排。
// 全部按登录用户隔离；不暴露跨用户共享。
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import {
  createDashboard,
  deleteDashboard,
  deleteWidget,
  getDashboard,
  listDashboards,
  reorderWidgets,
  saveWidget,
  updateDashboard,
} from '../services/dashboard.js';

const router = Router();

function fail(res: Response, err: unknown): void {
  res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
}

router.get('/', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: listDashboards(req.user!.userId) });
  } catch (err) { fail(res, err); }
});

router.post('/', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: createDashboard(req.user!.userId, req.body || {}) });
  } catch (err) { fail(res, err); }
});

router.get('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: getDashboard(req.user!.userId, req.params.id) });
  } catch (err) { fail(res, err); }
});

router.patch('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: updateDashboard(req.user!.userId, req.params.id, req.body || {}) });
  } catch (err) { fail(res, err); }
});

router.delete('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    deleteDashboard(req.user!.userId, req.params.id);
    res.json({ data: { ok: true } });
  } catch (err) { fail(res, err); }
});

// 新增或更新一个 widget（按 widget.id 幂等）
router.post('/:id/widgets', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: saveWidget(req.user!.userId, req.params.id, req.body?.widget ?? req.body) });
  } catch (err) { fail(res, err); }
});

router.delete('/:id/widgets/:widgetId', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: deleteWidget(req.user!.userId, req.params.id, req.params.widgetId) });
  } catch (err) { fail(res, err); }
});

// 拖拽后整体重排：body.ids 为新的 widget id 顺序
router.post('/:id/widgets/reorder', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: reorderWidgets(req.user!.userId, req.params.id, req.body?.ids) });
  } catch (err) { fail(res, err); }
});

export default router;
