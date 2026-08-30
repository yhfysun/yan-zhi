// Ollama 模型管理路由：拉取 / 删除 / 测试 / 列表，替代原内置 local-model-market。
// 具体逻辑抽到 services/ollama.ts，与 MCP api 工具共用同一份目录与拉取状态。
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import {
  listOllamaMarket,
  pullOllamaModel,
  deleteOllamaModel,
  testOllamaModel,
} from '../services/ollama.js';

const router = Router();
router.use(authMiddleware);

// GET /api/ollama-market
router.get('/', async (_req: Request, res: Response) => {
  res.json({ data: await listOllamaMarket() });
});

// POST /api/ollama-market/:model/pull
router.post('/:model/pull', async (req: Request, res: Response) => {
  res.json(pullOllamaModel(req.params.model));
});

// DELETE /api/ollama-market/:model
router.delete('/:model', async (req: Request, res: Response) => {
  try {
    await deleteOllamaModel(req.params.model);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || '删除失败' });
  }
});

// POST /api/ollama-market/:model/test
router.post('/:model/test', async (req: Request, res: Response) => {
  try {
    res.json({ ok: true, reply: await testOllamaModel(req.params.model) });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || '测试失败' });
  }
});

export default router;
