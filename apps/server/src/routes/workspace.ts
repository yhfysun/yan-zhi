import { Router } from 'express';
import { serverState } from '../state.js';

const router = Router();

// UI 选定工作目录后推送到 server，作为 cmd_exec / 目录工具 的默认 cwd 兜底
router.post('/dir', (req, res) => {
  const dir = typeof req.body?.dir === 'string' ? req.body.dir.trim() : '';
  serverState.workspaceDir = dir;
  res.json({ ok: true, workspaceDir: dir });
});

router.get('/dir', (_req, res) => {
  res.json({ workspaceDir: serverState.workspaceDir });
});

export default router;
