import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import {
  createGatewayClientKey,
  deleteGatewayClientKey,
  gatewayUsageToday,
  listGatewayClientKeys,
  updateGatewayClientKey,
} from '../services/gateway-client-keys.js';

const router = Router();
router.use(authMiddleware);

function userId(req: Request): string {
  return req.user!.userId;
}

function gatewayEndpoint(req: Request): string {
  const host = req.get('host') || '127.0.0.1:3001';
  return `${req.protocol}://${host}/gateway/v1`;
}

router.get('/', (req: Request, res: Response) => {
  const uid = userId(req);
  const data = listGatewayClientKeys(db, uid).map((key) => ({
    ...key,
    usageToday: gatewayUsageToday(db, key.id),
  }));
  res.json({ data, meta: { endpoint: gatewayEndpoint(req) } });
});

router.post('/', (req: Request, res: Response) => {
  const created = createGatewayClientKey(db, userId(req), req.body || {});
  res.status(201).json({
    data: {
      ...created.view,
      key: created.key,
      usageToday: gatewayUsageToday(db, created.view.id),
    },
  });
});

router.patch('/:id', (req: Request, res: Response) => {
  const updated = updateGatewayClientKey(db, userId(req), req.params.id, req.body || {});
  if (!updated) {
    res.status(404).json({ error: '网关密钥不存在' });
    return;
  }
  res.json({ data: { ...updated, usageToday: gatewayUsageToday(db, updated.id) } });
});

router.delete('/:id', (req: Request, res: Response) => {
  if (!deleteGatewayClientKey(db, userId(req), req.params.id)) {
    res.status(404).json({ error: '网关密钥不存在' });
    return;
  }
  res.json({ ok: true });
});

export default router;
