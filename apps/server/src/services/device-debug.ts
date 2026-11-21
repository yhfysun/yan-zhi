// 真机调试桥（device_* 工具家族的服务端基建，2026-11-21）
//
// 补齐「言智里开发移动端应用 + 真机调试」闭环的最关键一环：WebView 内部报错可见。
// 此前 agent 能构建（cmd_exec 跑 gradle）、能装包（adb install）、能看画面（android-mirror
// 的 scrcpy 镜像），但看不到真机 WebView 里的 console/网络/DOM —— 对标 Trae/Codex 的
// chrome://inspect CDP 链路，本模块补上：
//
//   adb 自动发现设备上的 DevTools socket（webview_devtools_remote_<pid> 等）
//     → adb forward 到本机回环端口
//     → 直连 CDP WebSocket（Runtime/Log 域）
//     → console 环形缓冲 + Runtime.evaluate
//
// 设计要点：
//  · forward 端口与会话按 targetKey 缓存复用，list 时惰性回收（stale forward / 空闲会话）；
//  · console 缓冲只在**挂接期间**累积（CDP 不提供历史）——工具描述里明确引导模型先挂后读；
//  · adb 解析顺序与 android-mirror.ts 的 resolveAdb 同源（SDK → 本地 SDK → 内置 scrcpy 兜底 → PATH）；
//  · 移动端（MOBILE_MODE）没有 adb：resolveAdbBinary 找不到时给出明确错误，不崩溃。
import { execFile } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import WebSocket from 'ws';
import { createLogger } from './logger.js';

const logger = createLogger('device-debug');

// ═══════════════════════ adb 定位 ═══════════════════════

/** 从 cwd 逐级上溯找仓库根（含 tools/scrcpy 的那一层，与 android-mirror 同判据） */
function findRepoRoot(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'tools', 'scrcpy', 'adb.exe'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * 解析可用的 adb 可执行文件。找不到返回 null（调用方给出明确错误）。
 * 顺序与 android-mirror.ts 的 resolveAdb 一致：环境变量 SDK → 本机默认 SDK 路径 → 内置兜底 → PATH('adb')。
 */
export function resolveAdbBinary(): string | null {
  const candidates = [
    process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb.exe') : '',
    process.env.ANDROID_SDK_ROOT ? path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb.exe') : '',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe') : '',
    findRepoRoot() ? path.join(findRepoRoot()!, 'tools', 'scrcpy', 'adb.exe') : '',
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  // 最后试 PATH 里有没有（Linux/macOS 或用户自装 adb）
  try {
    const pathEnv = process.env.PATH || '';
    for (const dir of pathEnv.split(path.delimiter)) {
      if (!dir) continue;
      const exe = path.join(dir, process.platform === 'win32' ? 'adb.exe' : 'adb');
      try { if (fs.existsSync(exe)) return exe; } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return null;
}

// ═══════════════════════ 纯解析函数（供单测） ═══════════════════════

export interface AdbDevice { serial: string; state: string }

/** adb 已知设备状态词（分界判据，与 android-mirror.ts 的 parseDevices 同源） */
const ADB_STATES = ['device', 'offline', 'unauthorized', 'recovery', 'sideload', 'bootloader'];

/**
 * 解析 `adb devices` 输出（跳过表头与 * 行）。
 * ★ 无线调试的序列号里可能带空格（`adb-xxx (2)._adb-tls-connect._tcp device ...`），
 *   不能按「第一列=序列号」切 —— 按已知状态词定位分界（android-mirror 同判据）。
 */
export function parseAdbDevices(stdout: string): AdbDevice[] {
  const out: AdbDevice[] = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('List of devices') || t.startsWith('*')) continue;
    const toks = t.split(/\s+/);
    const stateIdx = toks.findIndex((tok) => ADB_STATES.includes(tok));
    if (stateIdx < 1) continue;
    out.push({ serial: toks.slice(0, stateIdx).join(' '), state: toks[stateIdx] });
  }
  return out;
}

/**
 * 从 /proc/net/unix 提取 DevTools 调试 socket 名。
 * 常见形态：webview_devtools_remote_<pid> / chrome_devtools_remote / <pkg>_devtools_remote。
 * 只收包含 devtools_remote 的行（Num 列之后最后一个字段是 socket 名）。
 */
export function extractDevtoolsSockets(procNetUnix: string): string[] {
  const out = new Set<string>();
  for (const line of String(procNetUnix || '').split(/\r?\n/)) {
    if (!line.includes('devtools_remote')) continue;
    const fields = line.trim().split(/\s+/);
    // /proc/net/unix 的抽象 socket 名带 @ 前缀（如 @webview_devtools_remote_12345）
    const name = (fields[fields.length - 1] || '').replace(/^@/, '');
    if (name && name.includes('devtools_remote')) out.add(name);
  }
  return [...out];
}

/** CDP RemoteObject 参数序列化：string 取值，其余取 description/value 兜底 */
export function formatCdpArgs(args: Array<Record<string, unknown>>): string {
  return (args || []).map((a) => {
    if (!a || typeof a !== 'object') return String(a);
    if (a.type === 'string' && typeof a.value === 'string') return a.value;
    if (a.value !== undefined) {
      try { return typeof a.value === 'string' ? a.value : JSON.stringify(a.value); } catch { return String(a.value); }
    }
    return String(a.description ?? a.type ?? '');
  }).join(' ');
}

// ═══════════════════════ 通用进程/HTTP 助手 ═══════════════════════

function execAdb(args: string[], timeoutMs = 10000): Promise<string> {
  const adb = resolveAdbBinary();
  if (!adb) {
    return Promise.reject(new Error('未找到 adb（真机调试需要 Android SDK platform-tools 或内置 scrcpy 自带的 adb，仅桌面端支持）'));
  }
  return new Promise((resolve, reject) => {
    execFile(adb, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const msg = String((err as Error).message || '') + (stderr ? ` | ${String(stderr).trim()}` : '');
        reject(new Error(msg.slice(0, 500)));
        return;
      }
      resolve(String(stdout || ''));
    });
  });
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      const port = addr?.port;
      srv.close(() => resolve(port));
    });
  });
}

function httpGetJson(port: number, pathname: string, timeoutMs = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error(`CDP 端点响应解析失败（${pathname}）`)); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error(`CDP 端点响应超时（${pathname}）`)); });
    req.on('error', reject);
  });
}

// ═══════════════════════ forward 管理 ═══════════════════════

/** `${serial}|${socket}` → 本机回环端口 */
const forwardCache = new Map<string, number>();
const FORWARD_IDLE_MS = 10 * 60 * 1000;
const forwardLastUsed = new Map<string, number>();

async function ensureForward(serial: string, socket: string): Promise<number> {
  const key = `${serial}|${socket}`;
  const cached = forwardCache.get(key);
  if (cached) {
    // 存活校验：/json/version 1 秒内可达就算活着
    try {
      await httpGetJson(cached, '/json/version', 1500);
      forwardLastUsed.set(key, Date.now());
      return cached;
    } catch { /* 端口死了（WebView 关闭/设备掉线）→ 重 forward */ }
  }
  const port = await findFreePort();
  await execAdb(['-s', serial, 'forward', `tcp:${port}`, `localabstract:${socket}`], 8000);
  // forward 后 WebView 端点可能要几百毫秒才就绪，轻探一次
  for (let i = 0; i < 5; i++) {
    try { await httpGetJson(port, '/json/version', 1500); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  forwardCache.set(key, port);
  forwardLastUsed.set(key, Date.now());
  logger.info(`[device-debug] forward ${serial} ${socket} → tcp:${port}`);
  return port;
}

/** 惰性回收：过期的 forward（超过 FORWARD_IDLE_MS 未用）与对应缓存 */
function sweepStaleForwards(): void {
  const now = Date.now();
  for (const [key, ts] of forwardLastUsed) {
    if (now - ts <= FORWARD_IDLE_MS) continue;
    const [serial, socket] = key.split('|');
    const port = forwardCache.get(key);
    forwardCache.delete(key);
    forwardLastUsed.delete(key);
    if (port) {
      execAdb(['-s', serial, 'forward', '--remove', `tcp:${port}`], 5000).catch(() => { /* 设备可能已掉线，忽略 */ });
    }
    logger.info(`[device-debug] 回收过期 forward ${key}`);
    void socket;
  }
}

// ═══════════════════════ CDP 会话（console 缓冲 + eval） ═══════════════════════

export interface ConsoleEntry { ts: string; level: string; text: string; url?: string }

interface DeviceSession {
  targetKey: string;
  port: number;
  ws: WebSocket;
  buffer: ConsoleEntry[];
  seq: number;
  pending: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>;
  lastUsed: number;
}

const sessions = new Map<string, DeviceSession>();
const SESSION_IDLE_MS = 10 * 60 * 1000;
const CONSOLE_BUFFER_CAP = 800;
const SESSION_EVAL_TIMEOUT_MS = 15000;

export function parseTargetKey(targetKey: string): { serial: string; socket: string; targetId: string } {
  const parts = String(targetKey || '').split('|');
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts.slice(2).join('|')) {
    throw new Error(`targetKey 格式非法（应为 <设备序列号>|<socket>|<targetId>，先调 device_webview_list 获取）: ${targetKey}`);
  }
  return { serial: parts[0], socket: parts[1], targetId: parts.slice(2).join('|') };
}

function pushConsole(session: DeviceSession, level: string, text: string, url?: string): void {
  const entry: ConsoleEntry = { ts: new Date().toISOString(), level, text: String(text).slice(0, 2000), ...(url ? { url: String(url).slice(0, 500) } : {}) };
  session.buffer.push(entry);
  if (session.buffer.length > CONSOLE_BUFFER_CAP) session.buffer.splice(0, session.buffer.length - CONSOLE_BUFFER_CAP);
}

function wireSessionEvents(session: DeviceSession): void {
  session.ws.on('message', (raw) => {
    let msg: any;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    // 响应帧交给 cdpSend 的 pending
    if (msg.id !== undefined) {
      const p = session.pending.get(msg.id);
      if (p) {
        session.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(`CDP ${msg.error.message || msg.error.code || 'error'}`));
        else p.resolve(msg.result);
      }
      return;
    }
    // 事件帧 → console 缓冲
    const { method, params } = msg;
    if (method === 'Runtime.consoleAPICalled') {
      const level = params?.type === 'warning' ? 'warn' : (params?.type || 'log');
      pushConsole(session, level, formatCdpArgs(params?.args), params?.stackTrace?.callFrames?.[0]?.url);
    } else if (method === 'Runtime.exceptionThrown') {
      const d = params?.exceptionDetails;
      const text = d?.exception?.description || d?.exception?.value || d?.text || '(unknown exception)';
      pushConsole(session, 'exception', text, d?.url);
    } else if (method === 'Log.entryAdded') {
      const e = params?.entry || {};
      pushConsole(session, e.level || 'info', e.text || '', e.url);
    }
  });
  session.ws.on('close', () => {
    logger.info(`[device-debug] CDP 会话断开: ${session.targetKey}`);
    if (sessions.get(session.targetKey) === session) sessions.delete(session.targetKey);
  });
  session.ws.on('error', (err) => {
    logger.warn(`[device-debug] CDP 会话错误: ${session.targetKey}: ${err.message}`);
    try { session.ws.close(); } catch { /* ignore */ }
  });
}

function cdpSend<T = any>(session: DeviceSession, method: string, params?: Record<string, unknown>, timeoutMs = SESSION_EVAL_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (session.ws.readyState !== WebSocket.OPEN) {
      reject(new Error('CDP 会话未连接（设备可能已断开，重新 device_webview_list 刷新）'));
      return;
    }
    const id = ++session.seq;
    const timer = setTimeout(() => {
      session.pending.delete(id);
      reject(new Error(`CDP ${method} 超时（${timeoutMs}ms）`));
    }, timeoutMs);
    session.pending.set(id, { resolve, reject, timer });
    try {
      session.ws.send(JSON.stringify({ id, method, params }));
    } catch (e) {
      clearTimeout(timer);
      session.pending.delete(id);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

async function ensureSession(targetKey: string): Promise<DeviceSession> {
  const existing = sessions.get(targetKey);
  if (existing && existing.ws.readyState === WebSocket.OPEN) {
    existing.lastUsed = Date.now();
    return existing;
  }
  const { serial, socket, targetId } = parseTargetKey(targetKey);
  const port = await ensureForward(serial, socket);
  // 拿该 target 的 webSocketDebuggerUrl（/json/list 每次返回最新端口与路径）
  const targets: any[] = await httpGetJson(port, '/json/list', 5000);
  const list = Array.isArray(targets) ? targets : [];
  const target = list.find((t) => t && t.id === targetId);
  if (!target) {
    throw new Error(`目标 ${targetId} 已不存在（页面可能已关闭/刷新）。重新调 device_webview_list 获取最新 targetKey`);
  }
  const wsUrl: string = target.webSocketDebuggerUrl;
  if (!wsUrl) throw new Error(`目标 ${targetId} 无 webSocketDebuggerUrl（可能是扩展/后台页，不可调试）`);
  const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 16 * 1024 * 1024 });
  const session: DeviceSession = {
    targetKey, port, ws, buffer: [], seq: 0,
    pending: new Map(), lastUsed: Date.now(),
  };
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('CDP WebSocket 连接超时')), 8000);
    ws.once('open', () => { clearTimeout(t); resolve(); });
    ws.once('error', (e) => { clearTimeout(t); reject(e); });
  });
  sessions.set(targetKey, session);
  wireSessionEvents(session);
  // 开域：console 事件（Runtime）+ 浏览器日志（Log：网络错误/安全警告等）
  await cdpSend(session, 'Runtime.enable').catch(() => { /* 部分 target 不支持，不阻断 */ });
  await cdpSend(session, 'Log.enable').catch(() => { /* ignore */ });
  logger.info(`[device-debug] CDP 会话建立: ${targetKey}`);
  return session;
}

/** 惰性回收：空闲超时（或已断开）的 CDP 会话 */
function sweepIdleSessions(): void {
  const now = Date.now();
  for (const [key, s] of sessions) {
    const dead = s.ws.readyState !== WebSocket.OPEN;
    if (!dead && now - s.lastUsed <= SESSION_IDLE_MS) continue;
    try { s.ws.close(); } catch { /* ignore */ }
    sessions.delete(key);
  }
}

// ═══════════════════════ 三个主能力 ═══════════════════════

export interface DeviceSocketInfo { socket: string; port: number; targets: Array<{ targetKey: string; targetId: string; title: string; url: string; type: string; attached: boolean }> }
export interface DeviceWebviewInfo { serial: string; state: string; model: string; sockets: DeviceSocketInfo[] }

/**
 * 枚举真机上的可调试 WebView。
 * adb devices → 逐台 /proc/net/unix 找 devtools socket → forward → /json/list。
 */
export async function listDeviceWebviews(): Promise<{ devices: DeviceWebviewInfo[]; adb: string }> {
  sweepIdleSessions();
  sweepStaleForwards();
  const adb = resolveAdbBinary();
  if (!adb) {
    throw new Error('未找到 adb：真机调试需要 Android SDK platform-tools（或内置 scrcpy 自带的 adb），仅桌面端支持');
  }
  const raw = await execAdb(['devices'], 10000);
  const devices = parseAdbDevices(raw).filter((d) => d.state === 'device');
  const result: DeviceWebviewInfo[] = [];
  for (const dev of devices) {
    let model = '';
    try {
      model = (await execAdb(['-s', dev.serial, 'shell', 'getprop', 'ro.product.model'], 6000)).trim();
    } catch { /* ignore */ }
    const info: DeviceWebviewInfo = { serial: dev.serial, state: dev.state, model, sockets: [] };
    try {
      const procNet = await execAdb(['-s', dev.serial, 'shell', 'cat', '/proc/net/unix'], 10000);
      const sockets = extractDevtoolsSockets(procNet);
      for (const socket of sockets) {
        try {
          const port = await ensureForward(dev.serial, socket);
          const targets = await httpGetJson(port, '/json/list', 5000);
          const list = Array.isArray(targets) ? targets : [];
          info.sockets.push({
            socket,
            port,
            targets: list
              .filter((t) => t && t.type === 'page')
              .map((t) => ({
                targetKey: `${dev.serial}|${socket}|${t.id}`,
                targetId: String(t.id || ''),
                title: String(t.title || '(untitled)').slice(0, 120),
                url: String(t.url || '').slice(0, 300),
                type: String(t.type || 'page'),
                attached: sessions.has(`${dev.serial}|${socket}|${t.id}`),
              })),
          });
        } catch (e) {
          logger.warn(`[device-debug] forward/list ${dev.serial} ${socket} 失败: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      logger.warn(`[device-debug] 读 /proc/net/unix 失败（${dev.serial}）: ${(e as Error).message}`);
    }
    result.push(info);
  }
  return { devices: result, adb };
}

/**
 * 读某 WebView 目标的 console 缓冲。
 * ★ CDP 只有挂接后才有事件：waitMs 让刚挂的会话收集一小段；clear=true 读后清空。
 */
export async function readDeviceConsole(
  targetKey: string,
  opts?: { lines?: number; clear?: boolean; waitMs?: number },
): Promise<{ entries: ConsoleEntry[]; total: number; attached: boolean; waitMs: number }> {
  const session = await ensureSession(targetKey);
  const waitMs = Math.min(Math.max(Number(opts?.waitMs) || 0, 0), 10000);
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  const lines = Math.min(Math.max(Number(opts?.lines) || 100, 1), CONSOLE_BUFFER_CAP);
  const entries = session.buffer.slice(-lines);
  if (opts?.clear === true) session.buffer.length = 0;
  session.lastUsed = Date.now();
  return { entries, total: session.buffer.length, attached: session.ws.readyState === WebSocket.OPEN, waitMs };
}

/**
 * 在真机 WebView 页面里执行 JS（Runtime.evaluate，awaitPromise + returnByValue）。
 * 页面状态会被改变 —— 权限矩阵按写操作管控（tool-permission WRITE_TOOLS）。
 */
export async function evalInDeviceWebview(
  targetKey: string,
  expression: string,
  timeoutMs?: number,
): Promise<{ value?: unknown; exception?: string; wasThrown?: boolean }> {
  if (!String(expression || '').trim()) throw new Error('expression 不能为空');
  const session = await ensureSession(targetKey);
  session.lastUsed = Date.now();
  const t = Math.min(Math.max(Number(timeoutMs) || 10000, 1000), 60000);
  const result = await cdpSend(session, 'Runtime.evaluate', {
    expression: String(expression),
    returnByValue: true,
    awaitPromise: true,
  }, t);
  const details = (result as any)?.exceptionDetails;
  if (details) {
    return { exception: details.exception?.description || details.exception?.value || details.text || '(unknown)', wasThrown: true };
  }
  return { value: (result as any)?.result?.value };
}
