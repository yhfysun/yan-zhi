// 本体管理路由（P3.5）
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import {
  compileOntology,
  compileOntologyJoin,
  createOntology,
  deleteOntology,
  digestOntologies,
  exportYaml,
  generateFromTable,
  importYaml,
  listOntologies,
  previewOntologyData,
  publishOntology,
  tryRunOntology,
  updateOntology,
} from '../services/ontology.js';

const router = Router();

// GET /api/ontologies —— 列表（首次访问自动为项目库每表生成内置本体）
router.get('/', authMiddleware, (req: Request, res: Response) => {
  res.json({
    data: listOntologies(req.user!.userId, {
      datasourceId: (req.query.datasourceId as string) || undefined,
      keyword: (req.query.keyword as string) || undefined,
    }),
  });
});

// POST /api/ontologies —— 新建草稿（保存走别名/expr 校验）
router.post('/', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: createOntology(req.user!.userId, req.body || {}) });
  } catch (err) {
    const errors = (err as { validationErrors?: unknown }).validationErrors;
    res.status(400).json({ error: err instanceof Error ? err.message : String(err), errors });
  }
});

// PUT /api/ontologies/:id —— 更新（发布后编辑自动回到 draft；内置本体不可改 code/数据源/物理 SQL）
router.put('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: updateOntology(req.user!.userId, req.params.id, req.body || {}) });
  } catch (err) {
    const errors = (err as { validationErrors?: unknown }).validationErrors;
    res.status(400).json({ error: err instanceof Error ? err.message : String(err), errors });
  }
});

// DELETE /api/ontologies/:id
router.delete('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    deleteOntology(req.user!.userId, req.params.id);
    res.json({ data: { ok: true } });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/ontologies/:id/publish —— 发布（version+1，对智能体可见）
router.post('/:id/publish', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: publishOntology(req.user!.userId, req.params.id) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/ontologies/:id/compile —— 预览定义（只编译不执行）
router.post('/:id/compile', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: compileOntology(req.user!.userId, req.params.id, req.body || {}) });
  } catch (err) {
    const errors = (err as { compileErrors?: unknown }).compileErrors;
    res.status(400).json({ error: err instanceof Error ? err.message : String(err), errors });
  }
});

// POST /api/ontologies/:id/compile-join —— 跨本体编译（v1 单跳；join 引用的对方本体须已发布）
router.post('/:id/compile-join', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: compileOntologyJoin(req.user!.userId, req.params.id, req.body || {}) });
  } catch (err) {
    const errors = (err as { compileErrors?: unknown }).compileErrors;
    res.status(400).json({ error: err instanceof Error ? err.message : String(err), errors });
  }
});

// POST /api/ontologies/digest —— 语义摘要组装（默认直拼 + 非默认按问题召回），喂大模型前调用
router.post('/digest', authMiddleware, (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    res.json({
      data: {
        yaml: digestOntologies(req.user!.userId, {
          datasourceId: body.datasourceId || undefined,
          question: body.question || '',
        }),
      },
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/ontologies/:id/preview-data —— 数据预览（裸跑 source_sql 前 N 行）
router.post('/:id/preview-data', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json({ data: await previewOntologyData(req.user!.userId, req.params.id, Number(req.body?.limit) || 50) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/ontologies/:id/try-run —— 试跑查询（编译 + 真实执行）
router.post('/:id/try-run', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json({ data: await tryRunOntology(req.user!.userId, req.params.id, req.body || {}) });
  } catch (err) {
    const errors = (err as { compileErrors?: unknown }).compileErrors;
    res.status(400).json({ error: err instanceof Error ? err.message : String(err), errors });
  }
});

// POST /api/ontologies/generate-table —— 从数据源的表直接生成本体（描述默认取表备注）
router.post('/generate-table', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { datasourceId, table } = req.body || {};
    if (!datasourceId || !table) throw new Error('缺少 datasourceId 或 table');
    res.json({ data: await generateFromTable(req.user!.userId, String(datasourceId), String(table)) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/ontologies/:id/yaml —— 导出 YAML（源文件态）
router.get('/:id/yaml', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: { yaml: exportYaml(req.user!.userId, req.params.id) } });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/ontologies/import-yaml —— 从 YAML 导入为新草稿
router.post('/import-yaml', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({ data: importYaml(req.user!.userId, String(req.body?.yaml || '')) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
