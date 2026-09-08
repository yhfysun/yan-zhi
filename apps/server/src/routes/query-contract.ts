// 数据查询契约路由（Q1）：POST /api/query-contract/run
// chat 内嵌「动态看板/明细浏览」卡的后端入口：
//   收一次性的 base(table/只读SQL) + 本次过滤/排序/分页参数 → 参数化执行返回一页。
// 明细浏览此后不再走大模型。
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { runContractQuery, runAggregate, type QueryContractReq, type AggregateReq } from '../services/query-contract.js';

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
