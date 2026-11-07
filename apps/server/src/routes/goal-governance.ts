import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth.js';
import {
  getGoalGovernance,
  setUserGoalConcurrencyLimit,
} from '../services/goal-governance.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (req: Request, res: Response) => {
  res.json({ data: getGoalGovernance(req.user!.userId) });
});

router.patch('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const limit = Number(req.body?.maxRunningPerUser);
  if (!Number.isFinite(limit) || limit < 1 || limit > 20) {
    res.status(400).json({ error: 'maxRunningPerUser 必须在 1 到 20 之间' });
    return;
  }
  setUserGoalConcurrencyLimit(userId, limit);
  res.json({ data: getGoalGovernance(userId) });
});

export default router;
