import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth.js';
import {
  getGoalGovernance,
  setDefaultGoalCostLimit,
  setUserGoalConcurrencyLimit,
} from '../services/goal-governance.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (req: Request, res: Response) => {
  res.json({ data: getGoalGovernance(req.user!.userId) });
});

router.patch('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  if (req.body?.maxRunningPerUser !== undefined) {
    const limit = Number(req.body.maxRunningPerUser);
    if (!Number.isFinite(limit) || limit < 1 || limit > 20) {
      res.status(400).json({ error: 'maxRunningPerUser 必须在 1 到 20 之间' });
      return;
    }
    setUserGoalConcurrencyLimit(userId, limit);
  }
  if (req.body?.defaultCostLimitCny !== undefined) {
    const costLimit = Number(req.body.defaultCostLimitCny);
    if (!Number.isFinite(costLimit) || costLimit < 0 || costLimit > 100_000) {
      res.status(400).json({ error: 'defaultCostLimitCny 必须在 0 到 100000 之间' });
      return;
    }
    setDefaultGoalCostLimit(costLimit);
  }
  res.json({ data: getGoalGovernance(userId) });
});

export default router;
