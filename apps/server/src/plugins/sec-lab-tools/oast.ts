// 带外检测（OAST）回调服务（sec-lab P2，2026-10-17）。
//
// ★ 解决什么：盲注、SSRF、XXE 这类漏洞**没有回显**，只能靠"目标替你访问了一个
//   只有我们知道地址"来确认。这里起一个本机 HTTP 回调服务，每个 token 唯一。
// ★ 只做 HTTP 回调，**不做 DNS 回调**：DNS 要占 53 端口（多数环境需要 root），
//   而"起不来"比"少一种协议"更糟。需要 DNS 的场景请用外部平台。
// ★ 回包固定 200 + 空响应：不向目标回显任何信息，避免把回调服务本身变成探测面。
import http from 'node:http';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import type { ToolOutput } from '../sec-lab-types.js';

interface OastHit { at: number; ip: string; method: string; path: string; ua: string }

const MAX_HITS = 200;
let server: http.Server | null = null;
let listenPort = 0;
let token = '';
let hits: OastHit[] = [];

export function oastStatus(): { running: boolean; port: number; token: string; hits: number } {
  return { running: !!server, port: listenPort, token, hits: hits.length };
}

/** 本机可用地址（提示用户"外网可达时该换成哪个地址"）。 */
function localAddresses(port: number): string[] {
  const out: string[] = [`http://127.0.0.1:${port}/${token}`];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni && ni.family === 'IPv4' && !ni.internal) out.push(`http://${ni.address}:${port}/${token}`);
    }
  }
  return out;
}

async function start(port: number): Promise<void> {
  if (server) throw new Error(`回调服务已在 0.0.0.0:${listenPort} 运行（token=${token}），先 /oob stop`);
  token = randomBytes(8).toString('hex');
  hits = [];
  const s = http.createServer((req, res) => {
    const path = req.url || '/';
    if (path.startsWith(`/${token}`)) {
      hits.push({
        at: Date.now(),
        ip: String((req.socket.remoteAddress || '').replace(/^::ffff:/, '')),
        method: req.method || 'GET',
        path,
        ua: String(req.headers['user-agent'] || ''),
      });
      if (hits.length > MAX_HITS) hits = hits.slice(-MAX_HITS);
    }
    // ★ 无论命中与否都回同一个响应：不暴露"这个 token 存在"
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('');
  });
  await new Promise<void>((resolve, reject) => {
    s.once('error', reject);
    // 绑 0.0.0.0：带外回调通常来自目标主机，绑 127.0.0.1 就收不到
    s.listen(port, '0.0.0.0', () => resolve());
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

export interface OastParams {
  action: 'start' | 'stop' | 'hits' | 'clear' | 'status';
  port?: number;
}

export async function runOast(p: OastParams): Promise<ToolOutput> {
  const action = p.action || 'status';
  const st = oastStatus();

  if (action === 'start') {
    const port = Math.min(Math.max(Number(p.port) || 8898, 1024), 65535);
    await start(port);
    return {
      tool: 'oast', target: '', risk: 'active',
      summary: `回调服务已启动（0.0.0.0:${port}，token=${token}）\n` +
        `可用回调地址（按目标能否访问来选；跨公网需端口映射或隧道）：\n${localAddresses(port).join('\n')}\n` +
        '把上面的地址作为参数值投给目标；有回包即会出现在 /oob hits。',
      findings: [{
        title: '回调服务监听 0.0.0.0', severity: 'info',
        detail: '为接收目标主机回调而绑定所有网卡；只在评估期间开启，用完 /oob stop。',
      }],
    };
  }
  if (action === 'stop') {
    await stop();
    return { tool: 'oast', target: '', risk: 'active', summary: '回调服务已停止。', findings: [] };
  }
  if (action === 'clear') {
    hits = [];
    return { tool: 'oast', target: '', risk: 'passive', summary: '已清空回调记录。', findings: [] };
  }

  // hits / status
  if (!st.running) {
    return {
      tool: 'oast', target: '', risk: 'passive',
      summary: hits.length ? `回调服务未运行；历史命中 ${hits.length} 条（用 /oob clear 清空）。` : '回调服务未运行。用 /oob start 启动。',
      findings: [],
      raw: { running: false, hits },
    };
  }
  return {
    tool: 'oast', target: '', risk: 'passive',
    summary: `回调服务运行中（端口 ${st.port}，token=${st.token}），命中 ${hits.length} 条` +
      (hits.length ? '：\n' + hits.map((h) => `${new Date(h.at).toLocaleTimeString('zh-CN')}  ${h.ip}  ${h.method} ${h.path}`).join('\n') : '。'),
    findings: hits.length
      ? [{ title: `收到 ${hits.length} 次带外回调`, severity: 'high', detail: '目标主动访问了我们的回调地址 —— 说明注入点/请求伪造真实生效。' }]
      : [],
    raw: { running: true, port: st.port, token: st.token, hits },
  };
}
