/**
 * 桌面能力桥：把远程 AI 后端发起的 browser / computer-use 工具调用送回壳所在机器。
 *
 * 连接由壳主动出站建立，因而远程后端不需要反向访问壳的端口。每个连接按认证用户归属，
 * 工具调用只选择该用户最近心跳的壳；没有连接就明确失败，绝不悄悄在后端机器执行。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PluginManifest, PluginModule, PluginWebSocket } from '@yan-zhi/core';
import { resolveWsUserId } from '../auth.js';

export const desktopCapabilityManifest: PluginManifest = {
  id: 'desktop-capability',
  name: '桌面能力桥',
  version: '0.1.0',
  category: '系统',
  description: '把浏览器自动化与电脑使用工具路由到用户当前连接的轻量壳/桌面端执行。',
  permissions: ['desktop-input'],
  contributes: {},
};

type Capability = 'browser' | 'computer';

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface HostConnection {
  id: string;
  ws: PluginWebSocket;
  userId: string;
  deviceId: string;
  deviceName: string;
  capabilities: Record<string, unknown>;
  connectedAt: number;
  lastSeenAt: number;
  pending: Map<string, PendingCall>;
}

const connections = new Map<string, HostConnection>();
let logLine: (...args: unknown[]) => void = (...args) => console.log(...args);

function safeName(raw: unknown): string {
  const base = path.basename(String(raw || 'desktop-file')).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim();
  return (base || 'desktop-file').slice(-120);
}

function send(conn: HostConnection, payload: Record<string, unknown>): void {
  conn.ws.send(JSON.stringify(payload));
}

function pickConnection(userId: string, capability?: Capability): HostConnection | null {
  let best: HostConnection | null = null;
  for (const conn of connections.values()) {
    if (conn.userId !== userId) continue;
    if (capability === 'browser' && conn.capabilities.browser !== true) continue;
    if (capability === 'computer' && !Array.isArray(conn.capabilities.computer)) continue;
    if (!best || conn.lastSeenAt > best.lastSeenAt) best = conn;
  }
  return best;
}

function rewrite(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === 'string') {
    let out = value;
    for (const [from, to] of replacements) {
      out = out.split(from).join(to);
      // 工具文本里的路径通常位于 JSON.stringify 产物中（Windows 反斜杠已转义）。
      const escapedFrom = JSON.stringify(from).slice(1, -1);
      const escapedTo = JSON.stringify(to).slice(1, -1);
      if (escapedFrom !== from) out = out.split(escapedFrom).join(escapedTo);
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((item) => rewrite(item, replacements));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = rewrite(item, replacements);
    return out;
  }
  return value;
}

async function materializeFiles(files: unknown): Promise<Map<string, string>> {
  const replacements = new Map<string, string>();
  if (!Array.isArray(files) || !files.length) return replacements;
  const root = path.join(os.tmpdir(), 'yanzhi-desktop-capability', crypto.randomUUID());
  await fs.promises.mkdir(root, { recursive: true });
  let total = 0;
  for (const raw of files) {
    const file = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const sourcePath = String(file.path || '');
    const data = Buffer.from(String(file.dataBase64 || ''), 'base64');
    if (!sourcePath || !data.length) continue;
    total += data.length;
    if (total > 64 * 1024 * 1024) throw new Error('本机回传文件超过 64MB 上限');
    const dest = path.join(root, safeName(file.name || path.basename(sourcePath)));
    await fs.promises.writeFile(dest, data);
    replacements.set(sourcePath, dest);
  }
  if (replacements.size) {
    const timer = setTimeout(() => {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
    }, 30 * 60_000);
    timer.unref?.();
  }
  return replacements;
}

function closeConnection(conn: HostConnection): void {
  if (connections.get(conn.id) === conn) connections.delete(conn.id);
  for (const pending of conn.pending.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error('本机执行端已断开'));
  }
  conn.pending.clear();
}

function onHostMessage(conn: HostConnection, raw: Buffer | string, isBinary: boolean): void {
  if (isBinary) return;
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(String(raw));
  } catch {
    return;
  }
  const type = String(msg.type || '');
  conn.lastSeenAt = Date.now();
  if (type === 'hello') {
    conn.deviceId = String(msg.deviceId || `shell-${conn.id.slice(0, 8)}`).slice(0, 120);
    conn.deviceName = String(msg.deviceName || '轻量壳').slice(0, 120);
    conn.capabilities = msg.capabilities && typeof msg.capabilities === 'object'
      ? msg.capabilities as Record<string, unknown>
      : {};
    send(conn, { type: 'hello.ack', protocol: 1, connectionId: conn.id });
    logLine(`[desktop-capability] 本机执行端上线: ${conn.deviceName} (${conn.deviceId}) user=${conn.userId}`);
    return;
  }
  if (type === 'ping') {
    send(conn, { type: 'pong', t: msg.t || Date.now() });
    return;
  }
  if (type !== 'result') return;
  const id = String(msg.id || '');
  const pending = conn.pending.get(id);
  if (!pending) return;
  conn.pending.delete(id);
  clearTimeout(pending.timer);
  if (msg.ok !== true) {
    pending.reject(new Error(String(msg.error || '本机执行失败')));
    return;
  }
  void (async () => {
    try {
      const replacements = await materializeFiles(msg.files);
      pending.resolve(replacements.size ? rewrite(msg.result, replacements) : msg.result);
    } catch (e) {
      pending.reject(e as Error);
    }
  })();
}

export function desktopCapabilityAvailable(userId = 'guest', capability?: Capability): boolean {
  return !!pickConnection(userId, capability);
}

export function listDesktopCapabilities(userId = 'guest'): Array<Record<string, unknown>> {
  return [...connections.values()]
    .filter((conn) => conn.userId === userId)
    .map((conn) => ({
      deviceId: conn.deviceId,
      deviceName: conn.deviceName,
      capabilities: conn.capabilities,
      connectedAt: conn.connectedAt,
      lastSeenAt: conn.lastSeenAt,
    }));
}

export async function callDesktopCapability(
  capability: Capability,
  method: string,
  args: unknown,
  options: {
    userId?: string;
    timeoutMs?: number;
    conversationId?: string;
    workspaceDir?: string;
  } = {},
): Promise<any> {
  const userId = String(options.userId || 'guest');
  const conn = pickConnection(userId, capability);
  if (!conn) throw new Error(`没有可用的本机执行端（${capability}）；请确认轻量壳已启动并连到当前后端`);
  const id = crypto.randomUUID();
  const timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs) || 60_000, 10 * 60_000));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      conn.pending.delete(id);
      reject(new Error(`本机执行超时（${Math.round(timeoutMs / 1000)}s，${conn.deviceName} / ${method}）`));
    }, timeoutMs);
    conn.pending.set(id, { resolve, reject, timer });
    try {
      send(conn, {
        type: 'call',
        id,
        capability,
        method,
        args: args && typeof args === 'object' ? args : {},
        context: {
          conversationId: String(options.conversationId || ''),
          workspaceDir: String(options.workspaceDir || ''),
        },
      });
    } catch (e) {
      clearTimeout(timer);
      conn.pending.delete(id);
      reject(e as Error);
    }
  });
}

let deactivateImpl: (() => void) | null = null;

export const desktopCapabilityModule: PluginModule = {
  activate(ctx) {
    logLine = (...args) => ctx.log(...args);
    ctx.registerWebSocket('/ws', (ws, req) => {
      const id = crypto.randomUUID();
      const conn: HostConnection = {
        id,
        ws,
        userId: resolveWsUserId({ url: req.url, headers: req.headers }),
        deviceId: '',
        deviceName: '',
        capabilities: {},
        connectedAt: Date.now(),
        lastSeenAt: Date.now(),
        pending: new Map(),
      };
      connections.set(id, conn);
      ws.on('message', (data, isBinary) => onHostMessage(conn, data, isBinary));
      ws.on('close', () => closeConnection(conn));
      ws.on('error', () => {
        try { ws.close(); } catch { /* ignore */ }
      });
    });
    deactivateImpl = () => {
      for (const conn of [...connections.values()]) {
        try { conn.ws.close(); } catch { /* ignore */ }
        closeConnection(conn);
      }
      deactivateImpl = null;
    };
  },
  async deactivate() {
    deactivateImpl?.();
  },
};
