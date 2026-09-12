// 代码模式「开发环境」路由：Java / Maven / Python / Node / Git 的配置、自动探测与校验，
// 以及 Python 断点依赖 debugpy 的一键安装。
// 配置落 dataDir/dev-env.json；终端与运行配置通过 services/dev-env.ts 的 buildSpawnEnv 消费。
import { Router } from 'express';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import {
  DEFAULT_DEV_ENV, loadDevEnv, saveDevEnv, detectDevEnv, probeTool,
  resolveToolExe, buildSpawnEnv, type DevEnvConfig, type ToolId,
} from '../services/dev-env.js';

const router = Router();

// GET /api/env —— 当前配置
router.get('/', (_req, res) => {
  res.json({ data: loadDevEnv() });
});

// PUT /api/env —— 保存配置（整体合并）
router.put('/', (req, res) => {
  const body = (req.body || {}) as Partial<DevEnvConfig>;
  const patch: Partial<DevEnvConfig> = {};
  for (const k of Object.keys(DEFAULT_DEV_ENV) as Array<keyof DevEnvConfig>) {
    if (body[k] !== undefined) (patch as Record<string, unknown>)[k] = body[k];
  }
  res.json({ data: saveDevEnv(patch) });
});

// POST /api/env/reset —— 恢复默认（清空所有手填路径）
router.post('/reset', (_req, res) => {
  res.json({ data: saveDevEnv({ ...DEFAULT_DEV_ENV }) });
});

// POST /api/env/detect —— 自动探测本机工具链，返回建议值（不落盘）
router.post('/detect', (_req, res) => {
  res.json({ data: detectDevEnv() });
});

// POST /api/env/verify —— 按当前配置逐项校验
router.post('/verify', (req, res) => {
  const cfg = { ...loadDevEnv(), ...((req.body || {}) as Partial<DevEnvConfig>) };
  const ids: ToolId[] = ['java', 'maven', 'python', 'node', 'git'];
  res.json({ data: ids.map((id) => probeTool(id, cfg)) });
});

/** 运行一条命令并收集合并输出（用于 pip install 这类需要回显日志的操作） */
function runCollect(exe: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<{ code: number; log: string }> {
  return new Promise((resolve) => {
    let log = '';
    let done = false;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(exe, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ code: -1, log: `启动失败：${err instanceof Error ? err.message : String(err)}` });
      return;
    }
    const push = (d: Buffer) => { log += d.toString('utf8'); if (log.length > 20000) log = log.slice(-20000); };
    child.stdout?.on('data', push);
    child.stderr?.on('data', push);
    const timer = setTimeout(() => {
      if (!done) { done = true; try { child.kill(); } catch { /* ignore */ } resolve({ code: -2, log: log + '\n[超时，已终止]' }); }
    }, timeoutMs);
    child.once('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code: code ?? 0, log });
    });
    child.once('error', (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code: -1, log: `启动失败：${err.message}` });
    });
  });
}

// GET /api/env/debugpy —— Python 断点依赖是否已就绪
router.get('/debugpy', (_req, res) => {
  const cfg = loadDevEnv();
  const py = resolveToolExe('python', cfg);
  if (!py) { res.json({ data: { installed: false, error: '未配置或找到 Python 解释器' } }); return; }
  const r = spawnSync(py, ['-c', 'import debugpy; print(debugpy.__version__)'], {
    encoding: 'utf8', windowsHide: true, timeout: 20000, env: buildSpawnEnv(cfg),
  });
  const version = (r.stdout || '').trim();
  res.json({ data: { installed: r.status === 0 && !!version, version, python: py, error: r.status === 0 ? '' : (r.stderr || '').trim() } });
});

// POST /api/env/debugpy/install —— 一键 pip install debugpy（Python 断点依赖）
router.post('/debugpy/install', async (_req, res) => {
  const cfg = loadDevEnv();
  const py = resolveToolExe('python', cfg);
  if (!py) { res.status(400).json({ error: '未配置或找到 Python 解释器，请先在「开发环境」里设置 Python 路径' }); return; }
  const args = ['-m', 'pip', 'install', '--upgrade', 'debugpy'];
  const indexUrl = (cfg.pipIndexUrl || '').trim();
  if (indexUrl) args.push('-i', indexUrl);
  const { code, log } = await runCollect(py, args, buildSpawnEnv(cfg), 5 * 60 * 1000);
  res.json({ data: { ok: code === 0, code, log, python: py } });
});

// POST /api/env/open —— 打开某个工具的安装目录（便于用户去确认路径）
router.post('/open', (req, res) => {
  const dir = String((req.body as { dir?: string })?.dir || '').trim();
  if (!dir) { res.status(400).json({ error: '缺少 dir 参数' }); return; }
  try {
    if (process.platform === 'win32') spawn('explorer.exe', [path.resolve(dir)], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [dir], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
