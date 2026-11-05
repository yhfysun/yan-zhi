// 数据源路由（P1.3）：CRUD + 测试连接 + 拉取结构。
// 密码只写不回显（列表/详情返回 hasPassword 布尔）。
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import {
  createDataSource,
  deleteDataSource,
  listDataSources,
  suggestRelations,
  syncDataSourceSchema,
  testDataSource,
  updateDataSource,
} from '../services/datasource.js';
import { profileTable } from '../services/ontology-profile.js';
import { queryDocuments } from '../services/doc-query.js';
import {
  applyDataEdit,
  listDataEditAudits,
  preflightDataEdit,
} from '../services/data-edit.js';

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

// POST /api/datasources/:id/docs/query —— 文档型数据源查询（projection/filter，只读）
router.post('/:id/docs/query', authMiddleware, async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    res.json({
      data: await queryDocuments(req.user!.userId, req.params.id, {
        collection: b.collection ? String(b.collection) : undefined,
        projection: Array.isArray(b.projection) ? b.projection.map(String) : undefined,
        filter: b.filter,
        limit: Number(b.limit) || undefined,
      }),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/datasources/:id/profile —— 确定性画像（行数/空值率/基数/极值/高频样本）
router.post('/:id/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const table = String(req.body?.table || '').trim();
    if (!table) { res.status(400).json({ error: '缺少 table' }); return; }
    res.json({ data: await profileTable(req.user!.userId, req.params.id, table) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/datasources/:id/relation-suggestions —— 按命名+主键给出 N:1 关联候选（只建议，不落库）
router.get('/:id/relation-suggestions', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json({ data: await suggestRelations(req.user!.userId, req.params.id) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/datasources/:id/data-edit/preflight —— 事务内执行后回滚，返回一次性确认令牌
router.post('/:id/data-edit/preflight', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json({
      data: await preflightDataEdit(req.user!.userId, req.params.id, {
        sql: req.body?.sql,
        params: req.body?.params,
      }),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/datasources/:id/data-edit/apply —— 二次确认后真实提交，令牌一次有效
router.post('/:id/data-edit/apply', authMiddleware, async (req: Request, res: Response) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) {
      res.status(400).json({ error: '缺少确认令牌 token' });
      return;
    }
    res.json({ data: await applyDataEdit(req.user!.userId, req.params.id, token) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/datasources/:id/data-edit/audits —— 最近数据编辑审计
router.get('/:id/data-edit/audits', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({
      data: listDataEditAudits(
        req.user!.userId,
        req.params.id,
        Number(req.query.limit) || 50,
      ),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
