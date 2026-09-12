// 代码模式「运行 / 调试」路由。
// 运行：POST /run 启动 → GET /run/:id/stream（SSE 输出）→ POST /run/:id/input → POST /run/:id/stop
// 调试：POST /start 启动 → GET /:id/stream（SSE 事件）→ /continue /step /breakpoints /frames → POST /:id/stop
// Java 只支持运行（不支持断点）：/capability 会告诉前端每种语言的调试能力。
import { Router, Request, Response } from 'express';
import {
  startRun, getRun, listRuns, stopRun, buildCommandLine,
  startDebug, getDebug, listDebug, debugSnapshot, setBreakpoints,
  debugContinue, debugStep, debugSelectFrame, stopDebug,
  type RunConfig, type RunKind,
} from '../services/debug-manager.js';

const router = Router();

/** 各语言的调试能力：Java 断点需要 java-debug + jdt.ls（60~120MB），本期不内置 */
router.get('/capability', (_req, res) => {
  res.json({
    data: [
      { kind: 'python', label: 'Python', debug: true, note: '需要 pip install debugpy' },
      { kind: 'node', label: 'Node.js', debug: true, note: '使用 Node 内置 inspector，无需额外依赖' },
      { kind: 'java', label: 'Java', debug: false, note: '本期支持运行，断点需接入 java-debug + jdt.ls（另行下载）' },
      { kind: 'maven', label: 'Maven', debug: false, note: '仅运行' },
      { kind: 'custom', label: '自定义命令', debug: false, note: '仅运行' },
    ],
  });
});

// 预览运行配置最终会被翻译成什么命令（不执行）——方便排查路径/参数问题
router.post('/resolve', (req, res) => {
  const cfg = (req.body || {}) as RunConfig;
  res.json({ data: buildCommandLine(cfg) });
});

// ======================== 运行 ========================

const RUN_KINDS: RunKind[] = ['java', 'maven', 'python', 'node', 'custom'];

router.post('/run', (req, res) => {
  const cfg = (req.body || {}) as RunConfig;
  if (!cfg.kind || !RUN_KINDS.includes(cfg.kind)) {
    return res.status(400).json({ error: `kind 必须是 ${RUN_KINDS.join(' / ')}` });
  }
  const s = startRun({ ...cfg, name: cfg.name || cfg.kind });
  res.json({ data: { id: s.id, cmdline: s.cmdline, alive: s.alive } });
});

router.get('/runs', (_req, res) => {
  res.json({ data: listRuns() });
});

router.get('/run/:id', (req, res) => {
  const s = getRun(req.params.id);
  if (!s) return res.status(404).json({ error: '会话不存在' });
  res.json({
    data: {
      id: s.id, name: s.name, kind: s.kind, cmdline: s.cmdline, cwd: s.cwd,
      alive: s.alive, exitCode: s.exitCode, startedAt: s.startedAt, output: s.output.join(''),
    },
  });
});

// SSE：先补发历史输出，再推增量
router.get('/run/:id/stream', (req: Request, res: Response) => {
  const s = getRun(req.params.id);
  if (!s) return res.status(404).json({ error: '会话不存在' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(':connected\n\n');
  if (s.output.length) res.write(`data:${JSON.stringify({ type: 'output', text: s.output.join('') })}\n\n`);

  const onData = (text: string) => {
    try { res.write(`data:${JSON.stringify({ type: 'output', text })}\n\n`); } catch { /* ignore */ }
  };
  const onExit = (code: number | null) => {
    try { res.write(`data:${JSON.stringify({ type: 'exited', code })}\n\n`); res.end(); } catch { /* ignore */ }
  };
  s.listeners.add(onData);
  s.onExitHandlers.add(onExit);
  req.on('close', () => {
    s.listeners.delete(onData);
    s.onExitHandlers.delete(onExit);
  });
});

router.post('/run/:id/input', (req, res) => {
  const s = getRun(req.params.id);
  if (!s) return res.status(404).json({ error: '会话不存在' });
  const data = String((req.body as { data?: string })?.data || '');
  try { (s as any).child?.stdin?.write(data); } catch { /* ignore */ }
  res.json({ data: { ok: true } });
});

router.post('/run/:id/stop', (req, res) => {
  res.json({ data: { ok: stopRun(req.params.id) } });
});

// ======================== 调试 ========================

router.post('/start', async (req, res) => {
  const body = (req.body || {}) as {
    lang?: string; program?: string; cwd?: string; args?: string[];
    breakpoints?: Record<string, number[]>; env?: Record<string, string>;
  };
  const lang = body.lang === 'python' || body.lang === 'node' ? body.lang : null;
  if (!lang) return res.status(400).json({ error: 'lang 必须是 python 或 node（Java 本期仅支持运行）' });
  try {
    const s = await startDebug({
      lang,
      program: body.program || '',
      cwd: body.cwd || process.cwd(),
      args: body.args || [],
      breakpoints: body.breakpoints || {},
      env: body.env || {},
    });
    res.json({ data: debugSnapshot(s) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/sessions', (_req, res) => {
  res.json({ data: listDebug() });
});

router.get('/:id', (req, res) => {
  const s = getDebug(req.params.id);
  if (!s) return res.status(404).json({ error: '调试会话不存在' });
  res.json({ data: debugSnapshot(s) });
});

/** SSE：首帧补发历史输出 + 当前快照，之后推增量事件 */
router.get('/:id/stream', (req: Request, res: Response) => {
  const s = getDebug(req.params.id);
  if (!s) return res.status(404).json({ error: '调试会话不存在' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(':connected\n\n');
  if (s.output.length) res.write(`data:${JSON.stringify({ type: 'output', text: s.output.join('') })}\n\n`);
  res.write(`data:${JSON.stringify({ type: 'snapshot', snapshot: debugSnapshot(s) })}\n\n`);

  const onEvt = (evt: unknown) => {
    try { res.write(`data:${JSON.stringify(evt)}\n\n`); } catch { /* ignore */ }
  };
  s.listeners.add(onEvt);
  req.on('close', () => { s.listeners.delete(onEvt); });
});

router.post('/:id/breakpoints', async (req, res) => {
  const body = (req.body || {}) as { file?: string; lines?: number[] };
  if (!body.file) return res.status(400).json({ error: '缺少 file' });
  const ok = await setBreakpoints(req.params.id, body.file, body.lines || []);
  if (!ok) return res.status(404).json({ error: '调试会话不存在' });
  res.json({ data: { ok: true } });
});

router.post('/:id/continue', async (req, res) => {
  if (!(await debugContinue(req.params.id))) return res.status(404).json({ error: '调试会话不存在' });
  res.json({ data: { ok: true } });
});

router.post('/:id/step', async (req, res) => {
  const kind = String((req.body as { kind?: string })?.kind || 'over');
  if (!['over', 'into', 'out'].includes(kind)) return res.status(400).json({ error: 'kind 必须是 over / into / out' });
  if (!(await debugStep(req.params.id, kind as 'over' | 'into' | 'out'))) {
    return res.status(404).json({ error: '调试会话不存在' });
  }
  res.json({ data: { ok: true } });
});

router.post('/:id/frame', async (req, res) => {
  const frameId = Number((req.body as { frameId?: number })?.frameId ?? 0);
  if (!(await debugSelectFrame(req.params.id, frameId))) return res.status(404).json({ error: '调试会话不存在' });
  const s = getDebug(req.params.id)!;
  res.json({ data: { ok: true, scopes: s.scopes, variables: s.variables } });
});

router.post('/:id/stop', (req, res) => {
  res.json({ data: { ok: stopDebug(req.params.id) } });
});

export default router;
