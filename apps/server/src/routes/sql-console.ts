// SQL 控制台路由（P2.1）：POST /run 执行 SQL（选中段/多条逐条均由前端切好文本传入）。
// 护栏在 services/sql-guard.ts：DDL 一律拒，写语句引导走数据编辑通道（P2.3），只读按序执行出错即停。
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { runConsole } from '../services/datasource.js';

const router = Router();

// POST /api/sql-console/run
router.post('/run', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { dataSourceId, sql, maxRows, timeoutMs } = req.body || {};
    if (!dataSourceId) throw new Error('缺少 dataSourceId');
    if (!sql?.trim()) throw new Error('缺少 SQL 文本');
    const data = await runConsole(req.user!.userId, String(dataSourceId), String(sql), {
      maxRows: Number(maxRows) > 0 ? Math.min(Number(maxRows), 2000) : undefined,
      timeoutMs: Number(timeoutMs) > 0 ? Math.min(Number(timeoutMs), 120_000) : undefined,
    });
    res.json({ data });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
