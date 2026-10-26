// 数据查询契约路由（Q1）：POST /api/query-contract/run
// chat 内嵌「动态看板/明细浏览」卡的后端入口：
//   收一次性的 base(table/只读SQL) + 本次过滤/排序/分页参数 → 参数化执行返回一页。
// 明细浏览此后不再走大模型。
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { runContractQuery, runContractExport, runAggregate, type QueryContractReq, type AggregateReq } from '../services/query-contract.js';
import { findOntologyByRef, queryOntologyByRef, sanitizeOntologyIntent } from '../services/ontology.js';

const router = Router();

// POST /api/query-contract/run
router.post('/run', authMiddleware, async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as QueryContractReq;
    if (!body || typeof body !== 'object') throw new Error('请求体必须是 JSON 对象');
    const data = await runContractQuery(req.user!.userId, body);
    res.json({ data });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/query-contract/export —— 导出用全量明细（不分页，上限见 MAX_EXPORT_ROWS）
router.post('/export', authMiddleware, async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as QueryContractReq;
    if (!body || typeof body !== 'object') throw new Error('请求体必须是 JSON 对象');
    const data = await runContractExport(req.user!.userId, body);
    res.json({ data });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/query-contract/ontology/:ref —— 工作台字段菜单（业务名，用于维度/度量/过滤器选择）
router.get('/ontology/:ref', authMiddleware, (req: Request, res: Response) => {
  try {
    const info = findOntologyByRef(req.user!.userId, req.params.ref);
    res.json({
      data: {
        id: info.id,
        code: info.code,
        name: info.name,
        description: info.description,
        datasourceId: info.datasourceId,
        timeDimensions: info.timeDimensions.map((t) => ({ name: t.name, description: t.description })),
        dimensions: info.dimensions.map((d) => ({ name: d.name, description: d.description })),
        measures: info.measures.map((m) => ({ name: m.name, agg: m.agg, description: m.description })),
        filters: info.filters.map((f) => ({ name: f.name, description: f.description, isDefault: !!f.isDefault })),
        selections: info.selections.map((s) => ({ name: s.name })),
      },
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/query-contract/ontology/run —— 按本体字段名取数（不接受自由 SQL）
router.post('/ontology/run', authMiddleware, async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as { ontology?: unknown; intent?: unknown };
    const ref = String(body.ontology || '').trim();
    if (!ref) throw new Error('缺少 ontology');
    const intent = sanitizeOntologyIntent(body.intent);

    const data = await queryOntologyByRef(req.user!.userId, ref, intent, intent.limit ?? 200);
    res.json({
      data: {
        columns: data.columns,
        rows: data.rows,
        rowCount: data.rows.length,
        total: data.rows.length,
        truncated: data.truncated,
        sql: data.sql,
        warnings: data.warnings,
        mode: 'ontology',
        ontology: data.ontology,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/query-contract/aggregate —— Q2 视图(折线/柱/饼)的分组聚合系列
router.post('/aggregate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as AggregateReq;
    if (!body || typeof body !== 'object') throw new Error('请求体必须是 JSON 对象');
    const data = await runAggregate(req.user!.userId, body);
    res.json({ data });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
