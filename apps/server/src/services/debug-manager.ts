// 代码模式「运行 / 调试」会话管理。
// 两套能力：
//  1) 运行（Run）：把运行配置翻译成命令行 spawn，输出推给 SSE（控制台/输出面板），支持停止/重启。
//  2) 调试（Debug）：Python 走 debugpy 的 DAP（TCP），Node 走内置 inspector 的 CDP（WebSocket）。
//     Java 本期只提供运行（真断点需要 java-debug + jdt.ls，体积 60~120MB，另行接入）。
import net from 'node:net';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { DapClient } from './dap-client.js';
import { buildSpawnEnv, loadDevEnv, resolveToolExe } from './dev-env.js';

// ======================== 公共类型 ========================

export type RunKind = 'java' | 'maven' | 'python' | 'node' | 'custom';

export interface RunConfig {
  id: string;
  name: string;
  kind: RunKind;
  cwd: string;
  /** java：主类名（含包名） */
  mainClass?: string;
  /** java：额外的 -cp 条目（相对 cwd，多个用 ; 或 : 分隔） */
  classpath?: string;
  /** maven：goal，如 spring-boot:run / clean package */
  goal?: string;
  /** python / node：入口脚本（相对 cwd 或绝对） */
  program?: string;
  /** custom：完整命令行（第一个 token 为可执行文件） */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface DebugFrame { id: number; name: string; file: string; line: number; column: number }
export interface DebugScope { name: string; variablesReference: number }
export interface DebugVar { name: string; value: string; type: string; variablesReference: number }

export type DebugState = 'starting' | 'running' | 'paused' | 'exited';

// ======================== 运行会话 ========================

export interface RunSession {
  id: string;
  name: string;
  kind: RunKind;
  cmdline: string;
  cwd: string;
  alive: boolean;
  exitCode: number | null;
  startedAt: number;
  output: string[];
  listeners: Set<(chunk: string) => void>;
  onExitHandlers: Set<(code: number | null) => void>;
}

const runSessions = new Map<string, RunSession & { child: ChildProcess }>();
const MAX_OUTPUT_LINES = 2000;

let seq = 0;
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${(++seq).toString(36)}`;

function pushOutput(s: RunSession, text: string) {
  if (!text) return;
  s.output.push(text);
  if (s.output.length > MAX_OUTPUT_LINES) s.output.splice(0, s.output.length - MAX_OUTPUT_LINES);
  for (const l of s.listeners) { try { l(text); } catch { /* ignore */ } }
}

/**
 * 运行配置 → 命令行。
 * 所有分支都从「开发环境」解析工具路径，避免 PATH 里没配 java/mvn 时直接失败。
 */
export function buildCommandLine(cfg: RunConfig): { file: string; args: string[]; cmdline: string } {
  const env = loadDevEnv();
  const args = (cfg.args || []).filter((a) => a !== '');

  if (cfg.kind === 'java') {
    const java = resolveToolExe('java', env) || (process.platform === 'win32' ? 'java.exe' : 'java');
    const list: string[] = [];
    if ((env.javaOpts || '').trim()) list.push(...env.javaOpts.trim().split(/\s+/));
    if ((cfg.classpath || '').trim()) list.push('-cp', cfg.classpath!.trim());
    else list.push('-cp', '.');
    if (cfg.mainClass?.trim()) list.push(cfg.mainClass.trim());
    list.push(...args);
    return { file: java, args: list, cmdline: [java, ...list].join(' ') };
  }

  if (cfg.kind === 'maven') {
    const mvn = resolveToolExe('maven', env) || (process.platform === 'win32' ? 'mvn.cmd' : 'mvn');
    const list: string[] = [];
    const goal = (cfg.goal || '').trim();
    if (goal) list.push(...goal.split(/\s+/));
    if ((env.mavenOpts || '').trim()) list.push(...env.mavenOpts.trim().split(/\s+/));
    list.push(...args);
    return { file: mvn, args: list, cmdline: [mvn, ...list].join(' ') };
  }

  if (cfg.kind === 'python') {
    const py = resolveToolExe('python', env) || (process.platform === 'win32' ? 'python.exe' : 'python3');
    const list: string[] = [];
    if (cfg.program?.trim()) list.push(cfg.program.trim());
    list.push(...args);
    return { file: py, args: list, cmdline: [py, ...list].join(' ') };
  }

  if (cfg.kind === 'node') {
    const node = resolveToolExe('node', env) || (process.platform === 'win32' ? 'node.exe' : 'node');
    const list: string[] = [];
    if (cfg.program?.trim()) list.push(cfg.program.trim());
    list.push(...args);
    return { file: node, args: list, cmdline: [node, ...list].join(' ') };
  }

  // custom：整行命令，第一 token 为可执行文件，其余为参数
  const raw = (cfg.command || '').trim();
  if (!raw) return { file: '', args: [], cmdline: '' };
  const [file, ...rest] = raw.match(/"[^"]+"|\S+/g) || [];
  return { file: (file || '').replace(/^"|"$/g, ''), args: [...rest.map((a) => a.replace(/^"|"$/g, '')), ...args], cmdline: raw };
}

function spawnChild(file: string, args: string[], cwd: string, extraEnv?: Record<string, string>, shell = false): ChildProcess {
  const env = buildSpawnEnv();
  for (const [k, v] of Object.entries(extraEnv || {})) if (k && v) env[k] = v;
  return spawn(file, args, { cwd, env, shell, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
}

export function startRun(cfg: RunConfig): RunSession {
  const { file, args, cmdline } = buildCommandLine(cfg);
  const cwd = cfg.cwd || process.cwd();
  const id = nextId('run');
  const session: RunSession & { child: ChildProcess } = {
    id,
    name: cfg.name || cfg.kind,
    kind: cfg.kind,
    cmdline,
    cwd,
    alive: true,
    exitCode: null,
    startedAt: Date.now(),
    output: [],
    listeners: new Set(),
    onExitHandlers: new Set(),
    child: null as unknown as ChildProcess,
  };

  if (!file) {
    session.alive = false;
    pushOutput(session, '[错误] 运行配置为空：请填写入口/命令');
    runSessions.set(id, session);
    return session;
  }

  pushOutput(session, `$ ${cmdline}\r\n`);
  let child: ChildProcess;
  try {
    child = spawnChild(file, args, cwd, cfg.env, cfg.kind === 'custom');
  } catch (err) {
    session.alive = false;
    pushOutput(session, `[错误] 启动失败：${err instanceof Error ? err.message : String(err)}`);
    runSessions.set(id, session);
    return session;
  }
  session.child = child;
  child.stdout?.on('data', (d: Buffer) => pushOutput(session, d.toString('utf8')));
  child.stderr?.on('data', (d: Buffer) => pushOutput(session, d.toString('utf8')));
  child.once('error', (err: Error) => {
    session.alive = false;
    pushOutput(session, `[错误] ${err.message}`);
  });
  child.once('close', (code: number | null) => {
    session.alive = false;
    session.exitCode = code;
    pushOutput(session, `\r\n[进程已退出，退出码 ${code ?? '未知'}]`);
    for (const h of session.onExitHandlers) { try { h(code); } catch { /* ignore */ } }
  });
  runSessions.set(id, session);
  return session;
}

export function getRun(id: string) { return runSessions.get(id) || null; }
export function listRuns() {
  return [...runSessions.values()].map((s) => ({
    id: s.id, name: s.name, kind: s.kind, cmdline: s.cmdline, cwd: s.cwd,
    alive: s.alive, exitCode: s.exitCode, startedAt: s.startedAt,
  }));
}
export function stopRun(id: string): boolean {
  const s = runSessions.get(id);
  if (!s) return false;
  if (s.alive) { try { s.child.kill(); } catch { /* ignore */ } }
  return true;
}

// ======================== 调试会话 ========================

export interface DebugSession {
  id: string;
  lang: 'python' | 'node' | 'java';
  name: string;
  cwd: string;
  program: string;
  state: DebugState;
  frames: DebugFrame[];
  scopes: DebugScope[];
  variables: DebugVar[];
  output: string[];
  breakpoints: Record<string, number[]>;
  exitCode: number | null;
  startedAt: number;
  /** 当前选中栈帧（用于变量面板） */
  activeFrameId: number;
  threadId: number | null;
  listeners: Set<(evt: DebugEvent) => void>;
  /** 内部句柄 */
  _child?: ChildProcess | null;
  _dap?: DapClient | null;
  _cdp?: any;
  /** Node CDP：作用域 objectId 列表（选帧取变量用） */
  _scopeObjects?: Array<{ name: string; objectId: string }>;
}

export type DebugEvent =
  | { type: 'output'; text: string }
  | { type: 'state'; state: DebugState }
  | { type: 'stopped'; reason: string; file: string; line: number }
  | { type: 'exited'; code: number | null };

const debugSessions = new Map<string, DebugSession>();

function emit(s: DebugSession, evt: DebugEvent) {
  for (const l of s.listeners) { try { l(evt); } catch { /* ignore */ } }
}

function pushDebugOutput(s: DebugSession, text: string) {
  if (!text) return;
  s.output.push(text);
  if (s.output.length > MAX_OUTPUT_LINES) s.output.splice(0, s.output.length - MAX_OUTPUT_LINES);
  emit(s, { type: 'output', text });
}

function setState(s: DebugSession, state: DebugState) {
  s.state = state;
  emit(s, { type: 'state', state });
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** 轮询等待 TCP 端口可连（debugpy 监听起来需要几百毫秒） */
function waitForPort(port: number, timeoutMs = 15000): Promise<net.Socket> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const sock = net.connect(port, '127.0.0.1');
      const onOk = () => { sock.removeAllListeners(); resolve(sock); };
      const onErr = () => {
        sock.destroy();
        if (Date.now() > deadline) reject(new Error(`调试端口 ${port} 在 ${timeoutMs}ms 内未就绪（Python 断点依赖 debugpy，请先安装）`));
        else setTimeout(attempt, 150);
      };
      sock.once('connect', onOk);
      sock.once('error', onErr);
    };
    attempt();
  });
}

export interface StartDebugOptions {
  lang: 'python' | 'node';
  program: string;
  cwd: string;
  args?: string[];
  breakpoints?: Record<string, number[]>;
  env?: Record<string, string>;
}

/** 启动 Python 调试：python -m debugpy --listen <port> --wait-for-client <program> */
async function startPythonDebug(s: DebugSession, opts: StartDebugOptions) {
  const py = resolveToolExe('python');
  if (!py) throw new Error('未配置 Python 解释器，请到「设置 → 开发环境」配置后重试');
  const port = await getFreePort();
  const args = ['-m', 'debugpy', '--listen', `127.0.0.1:${port}`, '--wait-for-client'];
  if (opts.program) args.push(opts.program);
  args.push(...(opts.args || []));

  const child = spawnChild(py, args, opts.cwd, opts.env);
  s._child = child;
  child.stdout?.on('data', (d: Buffer) => pushDebugOutput(s, d.toString('utf8')));
  child.stderr?.on('data', (d: Buffer) => pushDebugOutput(s, d.toString('utf8')));
  child.once('close', (code) => {
    s.exitCode = code;
    setState(s, 'exited');
    emit(s, { type: 'exited', code });
    s._dap?.dispose();
  });
  child.once('error', (err: Error) => pushDebugOutput(s, `[错误] ${err.message}\r\n`));

  const sock = await waitForPort(port);
  const dap = new DapClient(sock, sock, () => { setState(s, 'exited'); });
  s._dap = dap;

  await dap.request('initialize', {
    adapterID: 'python',
    clientID: 'yan-zhi',
    clientName: 'YanZhi Code',
    linesStartAt1: true,
    columnsStartAt1: true,
    pathFormat: 'path',
    supportsVariableType: true,
    supportsRunInTerminalRequest: false,
  });

  dap.onEvent(async (msg) => {
    if (msg.event === 'output') {
      const text = String(msg.body?.output ?? '');
      pushDebugOutput(s, msg.body?.category === 'stderr' ? text : text);
      return;
    }
    if (msg.event === 'stopped') {
      setState(s, 'paused');
      await refreshPythonStack(s);
      const top = s.frames[0];
      emit(s, { type: 'stopped', reason: String(msg.body?.reason || 'breakpoint'), file: top?.file || '', line: top?.line || 0 });
      return;
    }
    if (msg.event === 'continued') setState(s, 'running');
    if (msg.event === 'exited' || msg.event === 'terminated') setState(s, 'exited');
  });

  await dap.request('attach', { cwd: opts.cwd, justMyCode: false });
  // attach 后补发已配置断点（debugpy 在 attach 前不接受 setBreakpoints）
  await applyPythonBreakpoints(s);
  setState(s, 'running');
}

async function refreshPythonStack(s: DebugSession) {
  const dap = s._dap;
  if (!dap || dap.isClosed) return;
  try {
    const threads = await dap.request<{ threads: Array<{ id: number; name: string }> }>('threads');
    const tid = threads?.threads?.[0]?.id;
    if (tid === undefined) return;
    s.threadId = tid;
    const st = await dap.request<{ stackFrames: Array<{ id: number; name: string; source?: { path?: string }; line: number; column: number }> }>(
      'stackTrace', { threadId: tid, startFrame: 0, levels: 40 },
    );
    s.frames = (st?.stackFrames || []).map((f) => ({
      id: f.id, name: f.name, file: f.source?.path || '', line: f.line, column: f.column,
    }));
    if (s.frames.length) {
      s.activeFrameId = s.frames[0].id;
      const sc = await dap.request<{ scopes: Array<{ name: string; variablesReference: number; expensive: boolean }> }>(
        'scopes', { frameId: s.frames[0].id },
      );
      s.scopes = (sc?.scopes || []).map((x) => ({ name: x.name, variablesReference: x.variablesReference }));
      await refreshPythonVariables(s, s.scopes[0]?.variablesReference || 0);
    }
  } catch { /* 栈刷新失败不致命 */ }
}

async function refreshPythonVariables(s: DebugSession, variablesReference: number) {
  const dap = s._dap;
  if (!dap || dap.isClosed) return;
  try {
    const r = await dap.request<{ variables: Array<{ name: string; value: string; type?: string; variablesReference: number }> }>(
      'variables', { variablesReference, count: 100 },
    );
    s.variables = (r?.variables || []).map((v) => ({
      name: v.name, value: v.value, type: v.type || '', variablesReference: v.variablesReference || 0,
    }));
  } catch { s.variables = []; }
}

async function applyPythonBreakpoints(s: DebugSession) {
  const dap = s._dap;
  if (!dap || dap.isClosed) return;
  for (const [file, lines] of Object.entries(s.breakpoints)) {
    try {
      await dap.request('setBreakpoints', {
        source: { path: file },
        breakpoints: lines.map((line) => ({ line })),
        sourceModified: false,
      });
    } catch { /* 单个文件失败不影响其余 */ }
  }
}

/** Node 断点：内置 inspector 的 CDP（WebSocket） */
async function startNodeDebug(s: DebugSession, opts: StartDebugOptions) {
  // 动态 import，避免 ws 在移动端/无 shell 环境被强依赖
  const { default: WebSocket } = await import('ws');
  const node = resolveToolExe('node') || (process.platform === 'win32' ? 'node.exe' : 'node');
  const port = await getFreePort();
  const args = [`--inspect-brk=${port}`];
  if (opts.program) args.push(opts.program);
  args.push(...(opts.args || []));

  const child = spawnChild(node, args, opts.cwd, opts.env);
  s._child = child;

  // Node 会在 stderr 打印 "Debugger listening on ws://127.0.0.1:<port>/<uuid>"
  let wsUrl = '';
  const waitUrl = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Node 未输出调试地址，请确认 Node 版本 >= 8')), 15000);
    const onData = (d: Buffer) => {
      const text = d.toString('utf8');
      pushDebugOutput(s, text);
      const m = /ws:\/\/127\.0\.0\.1:(\d+)\/[\w-]+/.exec(text);
      if (m) { clearTimeout(timer); resolve(m[0]); }
    };
    child.stderr?.on('data', onData);
    child.stdout?.on('data', (d: Buffer) => pushDebugOutput(s, d.toString('utf8')));
    child.once('close', (code) => { clearTimeout(timer); s.exitCode = code; setState(s, 'exited'); emit(s, { type: 'exited', code }); });
    child.once('error', (err: Error) => { clearTimeout(timer); reject(err); });
  });
  wsUrl = await waitUrl;

  const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  let msgId = 0;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  const scriptUrl = new Map<string, string>();

  const send = (method: string, params: any = {}): Promise<any> =>
    new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      try { ws.send(JSON.stringify({ id, method, params })); } catch (e) { reject(e as Error); }
      setTimeout(() => { if (pending.delete(id)) reject(new Error(`CDP ${method} 超时`)); }, 20000);
    });

  const cdp = { ws, send, scriptUrl, pending };
  s._cdp = cdp;

  ws.on('message', async (raw: Buffer) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)!;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || 'CDP 请求失败'));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'Debugger.scriptParsed') {
      const p = msg.params || {};
      if (p.scriptId) scriptUrl.set(p.scriptId, p.url || '');
      // 已设置的断点在新脚本解析后需要补发
      void applyNodeBreakpoints(s);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params?.args || []).map((a: any) => a.value ?? a.description ?? a.type).join(' ');
      pushDebugOutput(s, `${text}\r\n`);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params?.exceptionDetails || {};
      pushDebugOutput(s, `[异常] ${d.exception?.description || d.text || '未知异常'}\r\n`);
      return;
    }
    if (msg.method === 'Debugger.paused') {
      setState(s, 'paused');
      const frames = msg.params?.callFrames || [];
      s.frames = frames.map((f: any, i: number) => ({
        id: i,
        name: f.functionName || '(anonymous)',
        file: scriptUrl.get(f.location?.scriptId) || f.url || '',
        line: (f.location?.lineNumber ?? 0) + 1,
        column: (f.location?.columnNumber ?? 0) + 1,
      }));
      s.scopes = (frames[0]?.scopeChain || []).map((sc: any) => ({
        name: sc.type === 'local' ? '局部变量' : sc.type === 'closure' ? '闭包' : sc.type === 'global' ? '全局' : sc.type,
        variablesReference: sc.object?.objectId ? hashRef(sc.object.objectId) : 0,
      }));
      s._scopeObjects = (frames[0]?.scopeChain || []).map((sc: any) => ({ name: sc.type, objectId: sc.object?.objectId || '' }));
      s.activeFrameId = 0;
      if (s._scopeObjects?.[0]?.objectId) await refreshNodeVariables(s, s._scopeObjects[0].objectId);
      const top = s.frames[0];
      emit(s, { type: 'stopped', reason: String(msg.params?.reason || 'breakpoint'), file: top?.file || '', line: top?.line || 0 });
      return;
    }
    if (msg.method === 'Debugger.resumed') setState(s, 'running');
  });
  ws.on('error', (err: Error) => pushDebugOutput(s, `[错误] 调试通道异常：${err.message}\r\n`));
  ws.on('close', () => setState(s, 'exited'));

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('连接 Node 调试通道超时')), 15000);
    ws.once('open', () => { clearTimeout(t); resolve(); });
    ws.once('error', (e: Error) => { clearTimeout(t); reject(e); });
  });

  await send('Debugger.enable', {});
  await send('Runtime.enable', {});
  await applyNodeBreakpoints(s);
  setState(s, 'running');
  await send('Debugger.resume', {});
}

/** CDP 的 objectId 是字符串，统一映射成数字引用供前端复用 */
function hashRef(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h % 1000000) + 1;
}

async function applyNodeBreakpoints(s: DebugSession) {
  const cdp = s._cdp;
  if (!cdp || cdp.ws.readyState !== 1) return;
  for (const [file, lines] of Object.entries(s.breakpoints)) {
    for (const line of lines) {
      try {
        await cdp.send('Debugger.setBreakpointByUrl', { url: file, lineNumber: line - 1, columnNumber: 0 });
      } catch { /* 忽略单条失败 */ }
    }
  }
}

async function refreshNodeVariables(s: DebugSession, objectId: string) {
  const cdp = s._cdp;
  if (!cdp || !objectId) { s.variables = []; return; }
  try {
    const r = await cdp.send('Runtime.getProperties', { objectId, ownProperties: true });
    s.variables = (r?.result || []).map((p: any) => ({
      name: p.name,
      value: p.value?.value !== undefined ? String(p.value.value) : (p.value?.description || p.value?.type || ''),
      type: p.value?.type || '',
      variablesReference: p.value?.objectId ? hashRef(p.value.objectId) : 0,
    }));
  } catch { s.variables = []; }
}

export async function startDebug(opts: StartDebugOptions): Promise<DebugSession> {
  const s: DebugSession = {
    id: nextId('dbg'),
    lang: opts.lang,
    name: opts.program ? path.basename(opts.program) : opts.lang,
    cwd: opts.cwd,
    program: opts.program,
    state: 'starting',
    frames: [],
    scopes: [],
    variables: [],
    output: [],
    breakpoints: { ...(opts.breakpoints || {}) },
    exitCode: null,
    startedAt: Date.now(),
    activeFrameId: 0,
    threadId: null,
    listeners: new Set(),
  };
  debugSessions.set(s.id, s);
  try {
    if (opts.lang === 'python') await startPythonDebug(s, opts);
    else await startNodeDebug(s, opts);
  } catch (err) {
    s.state = 'exited';
    pushDebugOutput(s, `[错误] ${err instanceof Error ? err.message : String(err)}\r\n`);
    emit(s, { type: 'exited', code: null });
  }
  return s;
}

export function getDebug(id: string) { return debugSessions.get(id) || null; }
export function listDebug() {
  return [...debugSessions.values()].map((s) => ({
    id: s.id, lang: s.lang, name: s.name, cwd: s.cwd, program: s.program, state: s.state, startedAt: s.startedAt,
  }));
}

export async function setBreakpoints(id: string, file: string, lines: number[]) {
  const s = getDebug(id);
  if (!s) return false;
  if (lines.length) s.breakpoints[file] = lines;
  else delete s.breakpoints[file];
  if (s.lang === 'python') await applyPythonBreakpoints(s);
  else await applyNodeBreakpoints(s);
  return true;
}

export async function debugContinue(id: string) {
  const s = getDebug(id);
  if (!s) return false;
  if (s.lang === 'python' && s._dap) await s._dap.request('continue', { threadId: s.threadId ?? 1 });
  else if (s._cdp) await s._cdp.send('Debugger.resume', {});
  setState(s, 'running');
  return true;
}

export async function debugStep(id: string, kind: 'over' | 'into' | 'out') {
  const s = getDebug(id);
  if (!s) return false;
  const threadId = s.threadId ?? 1;
  if (s.lang === 'python' && s._dap) {
    const cmd = kind === 'over' ? 'next' : kind === 'into' ? 'stepIn' : 'stepOut';
    await s._dap.request(cmd, { threadId });
  } else if (s._cdp) {
    const cmd = kind === 'over' ? 'Debugger.stepOver' : kind === 'into' ? 'Debugger.stepInto' : 'Debugger.stepOut';
    await s._cdp.send(cmd, {});
  }
  setState(s, 'running');
  return true;
}

export async function debugSelectFrame(id: string, frameId: number) {
  const s = getDebug(id);
  if (!s) return false;
  s.activeFrameId = frameId;
  if (s.lang === 'python' && s._dap) {
    try {
      const sc = await s._dap.request<{ scopes: Array<{ name: string; variablesReference: number }> }>('scopes', { frameId });
      s.scopes = (sc?.scopes || []).map((x) => ({ name: x.name, variablesReference: x.variablesReference }));
      await refreshPythonVariables(s, s.scopes[0]?.variablesReference || 0);
    } catch { /* ignore */ }
  } else if (s._cdp) {
    const obj = (s as any)._scopeObjects?.[0]?.objectId;
    await refreshNodeVariables(s, obj || '');
  }
  return true;
}

export function stopDebug(id: string) {
  const s = getDebug(id);
  if (!s) return false;
  try { s._child?.kill(); } catch { /* ignore */ }
  s._dap?.dispose();
  try { s._cdp?.ws?.close(); } catch { /* ignore */ }
  setState(s, 'exited');
  emit(s, { type: 'exited', code: null });
  return true;
}

/** 调试状态快照（供前端轮询 / SSE 首帧） */
export function debugSnapshot(s: DebugSession) {
  return {
    id: s.id, lang: s.lang, name: s.name, cwd: s.cwd, program: s.program, state: s.state,
    frames: s.frames, scopes: s.scopes, variables: s.variables,
    breakpoints: s.breakpoints, exitCode: s.exitCode, activeFrameId: s.activeFrameId,
  };
}
