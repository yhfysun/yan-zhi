// 本机控制台路由（任务侧栏「控制台」）：spawn 本机 cmd/powershell（Windows）/ bash（其他平台）。
// 协议与 ops-shell 终端一致：POST /open 拿 sessionId → GET /:id/stream（SSE，base64 帧）→ POST /:id/input 写 stdin。
// 无 PTY（不引入 node-pty 原生依赖），不支持 resize；交互式命令（top/vim 类）不可用，常规命令行足够。
import { Router, Request, Response } from 'express';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { authMiddleware } from '../auth.js';
import { buildSpawnEnv, loadDevEnv } from '../services/dev-env.js';
import { serverState } from '../state.js';

const router = Router();

interface LocalConsoleSession {
  child: ReturnType<typeof spawn>;
  shell: string;
  cwd: string;
  lastActive: number;
}

const sessions = new Map<string, LocalConsoleSession>();
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

// 空闲回收：超时未活动的会话直接 kill，防止僵尸进程堆积
const idleTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastActive > IDLE_TIMEOUT_MS) {
      try { s.child.kill(); } catch { /* 已退出忽略 */ }
      sessions.delete(id);
    }
  }
}, 60000);
if (typeof idleTimer.unref === 'function') idleTimer.unref();

function resolveShell(shell: string): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    if (shell === 'bash') return { file: 'bash.exe', args: ['--login', '-i'] };
    if (shell === 'cmd') return { file: 'cmd.exe', args: ['/q'] };
    return { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass'] };
  }
  if (shell === 'cmd') return { file: 'sh', args: [] };
  return { file: process.env.SHELL || 'bash', args: [] };
}

// POST /api/local-console/open  { shell?: 'powershell'|'cmd', cwd?: string, cols?, rows? }
router.post('/open', authMiddleware, (req: Request, res: Response) => {
  const body = (req.body || {}) as { shell?: string; cwd?: string };
  // 未指定 shell 时取「开发环境」里配置的默认 shell
  const devEnv = loadDevEnv();
  const shell = body.shell === 'cmd' ? 'cmd' : body.shell === 'bash' ? 'bash' : body.shell === 'powershell' ? 'powershell' : devEnv.defaultShell;

  // cwd 优先级：请求参数 → 当前工作目录（workspaceDir）→ server 进程目录
  let cwd = body.cwd || serverState.workspaceDir || process.cwd();
  try {
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) cwd = process.cwd();
  } catch {
    cwd = process.cwd();
  }

  const { file, args } = resolveShell(shell);
  const sessionId = `lc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  let child;
  try {
    // 注入开发环境（JAVA_HOME / Maven / Python / Node / Git 全部前置到 PATH）
    child = spawn(file, args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: buildSpawnEnv(devEnv) });
  } catch (err) {
    res.status(500).json({ error: `无法启动本机 shell：${err instanceof Error ? err.message : String(err)}` });
    return;
  }

  child.once('error', () => {
    // spawn 失败（如文件不存在）也走 error 事件，清理会话即可；stream 端会因进程退出而结束
    sessions.delete(sessionId);
  });

  sessions.set(sessionId, { child, shell, cwd, lastActive: Date.now() });
  res.json({ data: { sessionId, shell, cwd } });
});

// POST /api/local-console/:id/input  { data: string }
router.post('/:id/input', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const s = sessions.get(id);
  if (!s) { res.status(404).json({ error: '会话已关闭' }); return; }
  s.lastActive = Date.now();
  const data = String((req.body as { data?: string })?.data || '');
  if (data) s.child.stdin?.write(data);
  res.json({ data: { ok: true } });
});

// GET /api/local-console/:id/stream （SSE，stdout/stderr 合并，base64 帧输出）
router.get('/:id/stream', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const s = sessions.get(id);
  if (!s) { res.status(404).json({ error: '会话已关闭' }); return; }
  s.lastActive = Date.now();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(':connected\n\n');

  let closed = false;
  const writeFrame = (d: Buffer) => {
    if (closed) return;
    try { res.write(`data:${d.toString('base64')}\n\n`); } catch { cleanup(); }
  };
  const cleanup = () => {
    if (closed) return;
    closed = true;
    s.child.stdout?.removeListener('data', onStdout);
    s.child.stderr?.removeListener('data', onStderr);
    s.child.removeListener('close', onClose);
  };
  const onStdout = (d: Buffer) => writeFrame(d);
  const onStderr = (d: Buffer) => writeFrame(d);
  const onClose = () => { cleanup(); try { res.end(); } catch { /* 忽略 */ } };

  s.child.stdout?.on('data', onStdout);
  s.child.stderr?.on('data', onStderr);
  s.child.once('close', onClose);
  req.on('close', cleanup);
});

// POST /api/local-console/:id/close
router.post('/:id/close', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const s = sessions.get(id);
  if (s) {
    try { s.child.kill(); } catch { /* 已退出忽略 */ }
    sessions.delete(id);
  }
  res.json({ data: { ok: true } });
});

export default router;
