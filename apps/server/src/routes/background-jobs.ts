import { Router, type Request, type Response, type NextFunction } from 'express';
import { authMiddleware } from '../auth.js';
import {
  BACKGROUND_JOB_STATUSES,
  controlBackgroundJob,
  createOrUpdateBackgroundJob,
  finishBackgroundJob,
  getBackgroundJob,
  listBackgroundJobEvents,
  listBackgroundJobs,
  requestBackgroundJobWake,
  updateBackgroundJobProgress,
  type BackgroundJob,
  type BackgroundJobKind,
  type BackgroundJobStatus,
  type BackgroundJobWakePolicy,
} from '../services/background-jobs.js';
import { ensureNativeBackgroundJobMonitor } from '../services/background-job-runtime.js';

const router = Router();

function isLoopback(req: Request): boolean {
  const raw = String(req.socket?.remoteAddress || '');
  return raw === '127.0.0.1' || raw === '::1' || raw === '::ffff:127.0.0.1' || raw.startsWith('::ffff:127.');
}

/**
 * 桌面主进程 -> 本机后端的内部回调。
 * 有 YZ_INTERNAL_TOKEN 时必须同时满足「回环地址 + token 完全一致」；独立服务端未配置 token
 * 时只接受回环请求。该路由不暴露给远程网卡来源。
 */
function internalOnly(req: Request, res: Response, next: NextFunction): void {
  if (!isLoopback(req)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const expected = String(process.env.YZ_INTERNAL_TOKEN || '').trim();
  if (expected) {
    const header = req.headers['x-yz-internal-token'];
    const provided = Array.isArray(header) ? String(header[0] || '') : String(header || '');
    if (provided !== expected) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
  }
  next();
}

function asKind(raw: unknown): BackgroundJobKind {
  return raw === 'python_process' || raw === 'command_process' || raw === 'package_build'
    ? raw
    : 'browser_download';
}

function asWakePolicy(raw: unknown): BackgroundJobWakePolicy {
  return raw === 'notify' || raw === 'silent' || raw === 'resume' ? raw : 'resume';
}

function asStatus(raw: unknown): BackgroundJobStatus | undefined {
  return BACKGROUND_JOB_STATUSES.includes(raw as BackgroundJobStatus)
    ? raw as BackgroundJobStatus
    : undefined;
}

function publicJob(job: BackgroundJob): Record<string, unknown> {
  return {
    jobId: job.id,
    kind: job.kind,
    status: job.status,
    wakePolicy: job.wakePolicy,
    title: job.title,
    conversationId: job.conversationId,
    taskId: job.taskId,
    toolCallId: job.toolCallId,
    progress: job.progress,
    bytesDone: job.bytesDone,
    bytesTotal: job.bytesTotal,
    speedBps: job.speedBps,
    etaMs: job.etaMs,
    etaAt: job.etaAt,
    artifactPaths: job.artifactPaths,
    result: job.result,
    error: job.error,
    checkpoint: job.checkpoint,
    controlCapabilities: job.controlCapabilities,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    terminalAt: job.terminalAt,
    terminalVersion: job.terminalVersion,
  };
}

function parseProgress(body: any): Record<string, unknown> {
  const progress = body?.progress && typeof body.progress === 'object' ? body.progress : {};
  const out: Record<string, unknown> = {};
  for (const key of ['percent', 'bytesDone', 'bytesTotal', 'speedBps', 'etaMs', 'etaAt']) {
    const value = body?.[key] ?? progress[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

router.post('/internal/upsert', internalOnly, (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    if (!body.conversationId) {
      res.status(400).json({ error: '缺少 conversationId' });
      return;
    }
    const status = asStatus(body.status);
    if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'stalled') {
      const existing = body.idempotencyKey
        ? listBackgroundJobs({ conversationId: String(body.conversationId), limit: 200 })
          .find(job => job.idempotencyKey === String(body.idempotencyKey))
        : null;
      const job = existing || createOrUpdateBackgroundJob({
        kind: asKind(body.kind),
        userId: typeof body.userId === 'string' ? body.userId : undefined,
        conversationId: String(body.conversationId),
        taskId: body.taskId ? String(body.taskId) : null,
        toolCallId: body.toolCallId ? String(body.toolCallId) : null,
        parentGoalId: body.parentGoalId ? String(body.parentGoalId) : null,
        wakePolicy: asWakePolicy(body.wakePolicy),
        title: String(body.title || '后台任务'),
        status: 'running',
        idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : null,
        adapterRef: body.adapterRef ? String(body.adapterRef) : null,
        progress: parseProgress(body),
        artifactPaths: Array.isArray(body.artifactPaths) ? body.artifactPaths.map(String) : [],
        spec: body.spec && typeof body.spec === 'object' ? body.spec : {},
        controlCapabilities: body.controlCapabilities && typeof body.controlCapabilities === 'object'
          ? body.controlCapabilities
          : {},
      });
      const result = finishBackgroundJob(job.id, {
        status,
        progress: parseProgress(body),
        artifactPaths: Array.isArray(body.artifactPaths) ? body.artifactPaths.map(String) : undefined,
        result: body.result,
        error: body.error ? String(body.error) : null,
        checkpoint: body.checkpoint,
      });
      res.json({ data: publicJob(result.job), eventCreated: result.created });
      return;
    }
    const job = createOrUpdateBackgroundJob({
      kind: asKind(body.kind),
      userId: typeof body.userId === 'string' ? body.userId : undefined,
      conversationId: String(body.conversationId),
      taskId: body.taskId ? String(body.taskId) : null,
      toolCallId: body.toolCallId ? String(body.toolCallId) : null,
      parentGoalId: body.parentGoalId ? String(body.parentGoalId) : null,
      wakePolicy: asWakePolicy(body.wakePolicy),
      title: String(body.title || '后台任务'),
      status: status === 'queued' || status === 'starting' || status === 'paused' ? status : 'running',
      idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : null,
      adapterRef: body.adapterRef ? String(body.adapterRef) : null,
      progress: parseProgress(body),
      artifactPaths: Array.isArray(body.artifactPaths) ? body.artifactPaths.map(String) : [],
      result: body.result,
      error: body.error ? String(body.error) : null,
      checkpoint: body.checkpoint,
      spec: body.spec && typeof body.spec === 'object' ? body.spec : {},
      controlCapabilities: body.controlCapabilities && typeof body.controlCapabilities === 'object'
        ? body.controlCapabilities
        : {},
    });
    ensureNativeBackgroundJobMonitor(job);
    res.json({ data: publicJob(job) });
  } catch (error: any) {
    res.status(400).json({ error: String(error?.message || error) });
  }
});

router.post('/internal/:id/progress', internalOnly, (req: Request, res: Response) => {
  try {
    const job = updateBackgroundJobProgress(req.params.id, {
      status: asStatus(req.body?.status),
      ...parseProgress(req.body || {}),
      artifactPaths: Array.isArray(req.body?.artifactPaths) ? req.body.artifactPaths.map(String) : undefined,
      result: req.body?.result,
      error: typeof req.body?.error === 'string' ? req.body.error : undefined,
      checkpoint: req.body?.checkpoint,
      controlCapabilities: req.body?.controlCapabilities && typeof req.body.controlCapabilities === 'object'
        ? req.body.controlCapabilities
        : undefined,
    });
    res.json({ data: publicJob(job) });
  } catch (error: any) {
    res.status(400).json({ error: String(error?.message || error) });
  }
});

router.post('/internal/:id/finish', internalOnly, (req: Request, res: Response) => {
  try {
    const requested = asStatus(req.body?.status);
    const status = requested === 'completed' || requested === 'failed' || requested === 'cancelled' || requested === 'stalled'
      ? requested
      : 'failed';
    const result = finishBackgroundJob(req.params.id, {
      status,
      progress: parseProgress(req.body || {}),
      artifactPaths: Array.isArray(req.body?.artifactPaths) ? req.body.artifactPaths.map(String) : undefined,
      result: req.body?.result,
      error: req.body?.error ? String(req.body.error) : null,
      checkpoint: req.body?.checkpoint,
    });
    res.json({ data: publicJob(result.job), eventCreated: result.created });
  } catch (error: any) {
    res.status(400).json({ error: String(error?.message || error) });
  }
});

router.get('/internal/:id', internalOnly, (req: Request, res: Response) => {
  const header = req.headers['x-yz-user-id'];
  const userId = (Array.isArray(header) ? header[0] : header || '').trim() || undefined;
  const job = getBackgroundJob(req.params.id, userId);
  if (!job) {
    res.status(404).json({ error: '后台任务不存在' });
    return;
  }
  res.json({ data: publicJob(job) });
});

router.post('/internal/:id/control', internalOnly, async (req: Request, res: Response) => {
  const operation = req.body?.operation;
  if (operation !== 'pause' && operation !== 'resume' && operation !== 'cancel') {
    res.status(400).json({ error: 'operation 必须是 pause / resume / cancel' });
    return;
  }
  const header = req.headers['x-yz-user-id'];
  const userId = (Array.isArray(header) ? header[0] : header || '').trim();
  if (!userId) {
    res.status(400).json({ error: '缺少 x-yz-user-id' });
    return;
  }
  const result = await controlBackgroundJob(req.params.id, userId, operation);
  if (!result.ok) {
    res.status(result.code === 'NOT_FOUND' ? 404 : 422).json({
      error: result.error || '后台任务控制失败',
      code: result.code || 'JOB_CONTROL_FAILED',
      data: result.job ? publicJob(result.job) : undefined,
    });
    return;
  }
  res.json({
    data: {
      ...result,
      job: result.job ? publicJob(result.job) : undefined,
    },
  });
});

router.use(authMiddleware);

router.get('/', (req: Request, res: Response) => {
  const status = typeof req.query.status === 'string' ? asStatus(req.query.status) : undefined;
  const jobs = listBackgroundJobs({
    userId: req.user!.userId,
    conversationId: typeof req.query.conversationId === 'string' ? req.query.conversationId : undefined,
    taskId: typeof req.query.taskId === 'string' ? req.query.taskId : undefined,
    kind: typeof req.query.kind === 'string' ? asKind(req.query.kind) : undefined,
    status,
    activeOnly: req.query.active === '1' || req.query.active === 'true',
    limit: Number(req.query.limit) || 50,
  });
  res.json({ data: jobs.map(publicJob) });
});

router.get('/:id', (req: Request, res: Response) => {
  const job = getBackgroundJob(req.params.id, req.user!.userId);
  if (!job) {
    res.status(404).json({ error: '后台任务不存在' });
    return;
  }
  res.json({
    data: publicJob(job),
    events: listBackgroundJobEvents(job.id).map(event => ({
      id: event.id,
      type: event.type,
      payload: event.payload,
      createdAt: event.createdAt,
      deliveredAt: event.deliveredAt,
    })),
  });
});

router.post('/:id/wake', (req: Request, res: Response) => {
  try {
    const result = requestBackgroundJobWake(req.params.id, req.user!.userId);
    res.json({
      data: {
        created: result.created,
        job: publicJob(result.job),
        eventId: result.event.id,
      },
    });
  } catch (error: any) {
    res.status(409).json({ error: String(error?.message || error) });
  }
});

router.post('/:id/control', async (req: Request, res: Response) => {
  const operation = req.body?.operation;
  if (operation !== 'pause' && operation !== 'resume' && operation !== 'cancel') {
    res.status(400).json({ error: 'operation 必须是 pause / resume / cancel' });
    return;
  }
  const result = await controlBackgroundJob(req.params.id, req.user!.userId, operation);
  if (!result.ok) {
    const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'JOB_TERMINAL' ? 409 : 422;
    res.status(status).json({
      error: result.error || '后台任务控制失败',
      code: result.code || 'JOB_CONTROL_FAILED',
      data: result.job ? publicJob(result.job) : undefined,
    });
    return;
  }
  res.json({
    data: {
      ...result,
      job: result.job ? publicJob(result.job) : undefined,
    },
  });
});

export default router;
