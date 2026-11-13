import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth.js';
import {
  createAutomationScript,
  deleteAutomationScript,
  getAutomationRun,
  getAutomationScript,
  listAutomationRunEvents,
  listAutomationRuns,
  listAutomationScripts,
  publishAutomationScript,
  updateAutomationScript,
} from '../services/automation.js';
import {
  cancelAutomationRun,
  startAutomationRun,
} from '../services/automation-runner.js';
import {
  cancelBrowserRecording,
  drainBrowserRecording,
  getBrowserRecording,
  startBrowserRecording,
  stopBrowserRecording,
} from '../services/automation-recording.js';

const router = Router();
router.use(authMiddleware);

function statusForError(message: string): number {
  if (/不存在/.test(message)) return 404;
  if (/校验失败|必须|不能为空|只支持|尚未发布/.test(message)) return 400;
  return 500;
}

function fail(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  res.status(statusForError(message)).json({ error: message });
}

router.get('/scripts', (req: Request, res: Response) => {
  res.json({ data: listAutomationScripts(req.user!.userId) });
});

router.post('/recordings', async (req: Request, res: Response) => {
  try {
    const recording = await startBrowserRecording(req.user!.userId, {
      url: String(req.body?.url || ''),
    });
    res.status(201).json({ data: recording });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/recordings/:id', (req: Request, res: Response) => {
  const recording = getBrowserRecording(req.user!.userId, req.params.id);
  if (!recording) {
    res.status(404).json({ error: '录制会话不存在' });
    return;
  }
  res.json({ data: recording });
});

router.post('/recordings/:id/drain', async (req: Request, res: Response) => {
  try {
    res.json({ data: await drainBrowserRecording(req.user!.userId, req.params.id) });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/recordings/:id/stop', async (req: Request, res: Response) => {
  try {
    res.json({ data: await stopBrowserRecording(req.user!.userId, req.params.id) });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/recordings/:id/cancel', (req: Request, res: Response) => {
  if (!cancelBrowserRecording(req.user!.userId, req.params.id)) {
    res.status(409).json({ error: '录制已结束或无法取消' });
    return;
  }
  res.json({ data: { cancelled: true } });
});

router.post('/scripts', (req: Request, res: Response) => {
  try {
    res.status(201).json({ data: createAutomationScript(req.user!.userId, req.body) });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/scripts/:id', (req: Request, res: Response) => {
  const version = req.query.version == null ? undefined : Number(req.query.version);
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
    res.status(400).json({ error: 'version 必须是正整数' });
    return;
  }
  const script = getAutomationScript(req.user!.userId, req.params.id, { version });
  if (!script) {
    res.status(404).json({ error: '自动化脚本不存在' });
    return;
  }
  res.json({ data: script });
});

router.patch('/scripts/:id', (req: Request, res: Response) => {
  try {
    res.json({ data: updateAutomationScript(req.user!.userId, req.params.id, req.body) });
  } catch (error) {
    fail(res, error);
  }
});

router.delete('/scripts/:id', (req: Request, res: Response) => {
  const deleted = deleteAutomationScript(req.user!.userId, req.params.id);
  if (!deleted) {
    res.status(404).json({ error: '自动化脚本不存在' });
    return;
  }
  res.json({ data: { deleted: true } });
});

router.post('/scripts/:id/publish', (req: Request, res: Response) => {
  try {
    res.json({ data: publishAutomationScript(req.user!.userId, req.params.id) });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/scripts/:id/runs', (req: Request, res: Response) => {
  const script = getAutomationScript(req.user!.userId, req.params.id);
  if (!script) {
    res.status(404).json({ error: '自动化脚本不存在' });
    return;
  }
  res.json({ data: listAutomationRuns(req.user!.userId, req.params.id, Number(req.query.limit) || 50) });
});

router.post('/scripts/:id/runs', (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const version = body.version == null ? undefined : Number(body.version);
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
      res.status(400).json({ error: 'version 必须是正整数' });
      return;
    }
    const run = startAutomationRun({
      userId: req.user!.userId,
      scriptId: req.params.id,
      conversationId: body.conversationId ? String(body.conversationId) : undefined,
      triggerType: body.test === true ? 'test' : String(body.triggerType || 'manual'),
      input: body.input && typeof body.input === 'object' && !Array.isArray(body.input) ? body.input : {},
      version,
      allowDraft: body.test === true || body.allowDraft === true,
    });
    res.status(202).json({ data: run });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/runs', (req: Request, res: Response) => {
  res.json({
    data: listAutomationRuns(
      req.user!.userId,
      req.query.scriptId ? String(req.query.scriptId) : undefined,
      Number(req.query.limit) || 50,
    ),
  });
});

router.get('/runs/:id', (req: Request, res: Response) => {
  const run = getAutomationRun(req.user!.userId, req.params.id);
  if (!run) {
    res.status(404).json({ error: '自动化运行不存在' });
    return;
  }
  res.json({ data: run });
});

router.get('/runs/:id/events', (req: Request, res: Response) => {
  const run = getAutomationRun(req.user!.userId, req.params.id);
  if (!run) {
    res.status(404).json({ error: '自动化运行不存在' });
    return;
  }
  const since = Math.max(0, Number(req.query.since) || 0);
  res.json({ data: listAutomationRunEvents(req.params.id, since) });
});

router.post('/runs/:id/cancel', (req: Request, res: Response) => {
  const ok = cancelAutomationRun(req.user!.userId, req.params.id);
  if (!ok) {
    res.status(409).json({ error: '运行已结束、不存在或当前无法取消' });
    return;
  }
  res.json({ data: { runId: req.params.id, status: 'cancelling' } });
});

export default router;
