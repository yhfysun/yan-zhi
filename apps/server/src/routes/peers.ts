import { Router, Request, Response } from 'express';
import { optionalAuth } from '../auth.js';
import {
  upsertPeer,
  listPeers,
  pingPeer,
  sendPeerMessage,
  pollPeerMessages,
} from '../services/peers.js';

const router = Router();
router.use(optionalAuth);

// GET /api/peers
router.get('/', (_req: Request, res: Response) => {
  res.json({ data: listPeers() });
});

// POST /api/peers/register
router.post('/register', (req: Request, res: Response) => {
  try {
    const peer = upsertPeer(req.body || {}, req.user?.userId);
    res.json({ data: peer });
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// POST /api/peers/:nodeId/ping
router.post('/:nodeId/ping', (req: Request, res: Response) => {
  try {
    res.json({ data: pingPeer(req.params.nodeId) });
  } catch (e: unknown) {
    res.status(404).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// POST /api/peers/chat/send
router.post('/chat/send', (req: Request, res: Response) => {
  try {
    const message = sendPeerMessage(req.body || {});
    res.json({ data: message });
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// GET /api/peers/chat/poll?peerId=...&since=...
router.get('/chat/poll', (req: Request, res: Response) => {
  const peerId = String(req.query.peerId || '');
  if (!peerId) {
    res.status(400).json({ error: 'peerId 为必填项' });
    return;
  }
  res.json({
    data: pollPeerMessages(
      peerId,
      Number(req.query.since) || 0,
      Number(req.query.limit) || 100,
    ),
  });
});

export default router;
