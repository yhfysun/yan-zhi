// 内置抓包代理（sec-lab P1，2026-10-17）—— active 级（会在本机监听端口）。
//
// ★ 定位：让用户把浏览器/工具的 HTTP 代理指向 127.0.0.1:<port>，
//   就能看到**这次评估里到底发了哪些请求**，并能一键重放。
// ★ HTTPS：只做 CONNECT 隧道，**不解密**（解密要自签 CA 并让目标信任，
//   那属"中间人"能力，与"授权评估"的定位不符）。所以 HTTPS 只记录 CONNECT 元数据。
// ★ 授权范围：转发前按 host 过 `isAuthorized` —— 代理不能成为"绕过 scope 的旁路"。
// ★ 抓包只存内存（上限 500 条）：不落盘就避免了"把用户流量写进磁盘"的隐私面。
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { isAuthorized, type ScopeEntry } from '../sec-lab-guard.js';
import type { ToolOutput } from '../sec-lab-types.js';

interface Capture {
  id: string;
  at: number;
  method: string;
  url: string;
  host: string;
  status: number;
  bytes: number;
  preview: string;
}

const MAX_CAPTURES = 500;
const DEFAULT_PORT = 8899;

let server: http.Server | null = null;
let listenPort = 0;
let captures: Capture[] = [];
let activeScopes: ScopeEntry[] = [];

export function proxyStatus(): { running: boolean; port: number; captures: number } {
  return { running: !!server, port: listenPort, captures: captures.length };
}

function record(c: Omit<Capture, 'id' | 'at'>): void {
  captures.push({ ...c, id: randomUUID(), at: Date.now() });
  if (captures.length > MAX_CAPTURES) captures = captures.slice(-MAX_CAPTURES);
}

async function start(port: number, scopes: ScopeEntry[]): Promise<void> {
  if (server) throw new Error(`代理已在 127.0.0.1:${listenPort} 运行，先 /proxy stop`);
  activeScopes = scopes;
  const s = http.createServer((req, res) => {
    const raw = req.url || '';
    if (!/^https?:\/\//i.test(raw)) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('本端口是 HTTP 代理：请把浏览器/工具的代理设成它（只接受绝对 URI 请求）。');
      return;
    }
    let u: URL;
    try { u = new URL(raw); } catch { res.writeHead(400); res.end('URL 不合法'); return; }
    if (!isAuthorized(u.hostname, activeScopes)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`目标 ${u.hostname} 不在授权范围内，代理已拒绝。`);
      return;
    }
    const reqChunks: Buffer[] = [];
    req.on('data', (c: Buffer) => reqChunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(reqChunks);
      const mod = u.protocol === 'https:' ? https : http;
      const upstream = mod.request(u, {
        method: req.method,
        headers: { ...req.headers, host: u.host },
      }, (up) => {
        const resChunks: Buffer[] = [];
        up.on('data', (c: Buffer) => resChunks.push(c));
        up.on('end', () => {
          const rb = Buffer.concat(resChunks);
          record({
            method: req.method || 'GET', url: raw, host: u.host,
            status: up.statusCode || 0, bytes: rb.length,
            preview: rb.toString('utf8').slice(0, 500),
          });
          res.writeHead(up.statusCode || 502, up.headers);
          res.end(rb);
        });
      });
      upstream.on('error', (e: Error) => {
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`上游请求失败：${e.message}`);
      });
      if (body.length) upstream.write(body);
      upstream.end();
    });
  });

  s.on('connect', (req, clientSocket: net.Socket, head: Buffer) => {
    const [host, portStr] = String(req.url || '').split(':');
    if (!host || !isAuthorized(host, activeScopes)) {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    record({
      method: 'CONNECT', url: String(req.url || ''), host,
      status: 0, bytes: 0, preview: '（HTTPS 隧道：只记录元数据，不解密）',
    });
    const upstream = net.connect(Number(portStr) || 443, host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => { try { clientSocket.destroy(); } catch { /* noop */ } });
  });

  await new Promise<void>((resolve, reject) => {
    s.once('error', reject);
    s.listen(port, '127.0.0.1', () => resolve());
  });
  server = s;
  listenPort = port;
}

async function stop(): Promise<void> {
  if (!server) return;
  const s = server;
  server = null;
  listenPort = 0;
  await new Promise<void>((resolve) => s.close(() => resolve()));
}

function replay(id: string): Promise<{ status: number; bytes: number }> {
  return new Promise((resolve, reject) => {
    const c = captures.find((x) => x.id === id);
    if (!c) { reject(new Error(`没找到记录 ${id}（先 /proxy list）`)); return; }
    if (c.method === 'CONNECT') { reject(new Error('CONNECT（HTTPS 隧道）没有可重放的明文请求')); return; }
    let u: URL;
    try { u = new URL(c.url); } catch { reject(new Error('记录里的 URL 不合法')); return; }
    if (!isAuthorized(u.hostname, activeScopes)) { reject(new Error(`${u.hostname} 不在授权范围内`)); return; }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(u, { method: c.method, headers: { host: u.host } }, (res) => {
      let bytes = 0;
      res.on('data', (b: Buffer) => { bytes += b.length; });
      res.on('end', () => {
        record({ method: c.method, url: c.url, host: c.host, status: res.statusCode || 0, bytes, preview: '（重放）' });
        resolve({ status: res.statusCode || 0, bytes });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

export interface ProxyParams {
  action: 'start' | 'stop' | 'list' | 'clear' | 'replay';
  port?: number;
  id?: string;
}

export async function runProxy(p: ProxyParams, scopes: ScopeEntry[]): Promise<ToolOutput> {
  const action = p.action || 'list';
  const st = proxyStatus();

  if (action === 'start') {
    const port = Math.min(Math.max(Number(p.port) || DEFAULT_PORT, 1024), 65535);
    await start(port, scopes);
    return {
      tool: 'proxy', target: '', risk: 'active',
      summary: `抓包代理已启动：http://127.0.0.1:${port}\n把浏览器/工具的 HTTP 代理指向它即可；只转发已授权目标，HTTPS 只建隧道不解密。`,
      findings: [{
        title: '代理已监听本机端口', severity: 'info',
        detail: '仅绑定 127.0.0.1（不对局域网开放）。用完请 /proxy stop。',
      }],
    };
  }
  if (action === 'stop') {
    await stop();
    return { tool: 'proxy', target: '', risk: 'active', summary: '抓包代理已停止。', findings: [] };
  }
  if (action === 'clear') {
    captures = [];
    return { tool: 'proxy', target: '', risk: 'passive', summary: '已清空抓包记录。', findings: [] };
  }
  if (action === 'replay') {
    if (!p.id) throw new Error('要给记录 id（先 /proxy list）');
    const r = await replay(p.id);
    return {
      tool: 'proxy', target: '', risk: 'active',
      summary: `已重放 ${p.id}：HTTP ${r.status}，${r.bytes} 字节。`,
      findings: [],
    };
  }

  // list
  if (!captures.length) {
    return {
      tool: 'proxy', target: '', risk: 'passive',
      summary: st.running ? `代理运行中（127.0.0.1:${st.port}），还没有抓到请求。` : '代理未运行，也没有记录。用 /proxy start 启动。',
      findings: [],
    };
  }
  const rows = captures.slice(-100).map((c) => {
    const t = new Date(c.at).toLocaleTimeString('zh-CN');
    return `${t}  ${c.method} ${c.url}  → ${c.status}（${c.bytes}B）  id=${c.id}`;
  });
  return {
    tool: 'proxy', target: '', risk: 'passive',
    summary: `共 ${captures.length} 条记录（展示最近 ${rows.length} 条）${st.running ? `；代理运行中 127.0.0.1:${st.port}` : '；代理未运行'}\n${rows.join('\n')}`,
    findings: [],
    raw: { running: st.running, port: st.port, captures: captures.slice(-100) },
  };
}
