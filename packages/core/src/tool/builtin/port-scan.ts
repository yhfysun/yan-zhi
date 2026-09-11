// port_scan 内置工具 — TCP 连接扫描（仅限授权目标：自有网络/获授权渗透测试）
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

const COMMON_PORTS: Record<number, string> = {
  21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'dns', 80: 'http',
  110: 'pop3', 111: 'rpcbind', 135: 'msrpc', 139: 'netbios', 143: 'imap',
  443: 'https', 445: 'smb', 993: 'imaps', 995: 'pop3s', 1433: 'mssql',
  1521: 'oracle', 1723: 'pptp', 2375: 'docker', 2379: 'etcd', 3306: 'mysql',
  3389: 'rdp', 5432: 'postgres', 5900: 'vnc', 6379: 'redis', 8080: 'http-alt',
  8443: 'https-alt', 9090: 'webhook', 9200: 'elasticsearch', 27017: 'mongodb',
};

const MAX_PORTS = 65535;

/** 解析端口规格："common" 预设 / 单端口 / 逗号列表 / "1-1024" 范围（导出供 lan_scan 复用） */
export function parsePorts(spec: string): number[] {
  const s = (spec || 'common').trim().toLowerCase();
  if (s === 'common') return Object.keys(COMMON_PORTS).map(Number);
  const out = new Set<number>();
  for (const part of s.split(',')) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^(\d+)-(\d+)$/);
    if (m) {
      const lo = Math.max(1, parseInt(m[1], 10));
      const hi = Math.min(MAX_PORTS, parseInt(m[2], 10));
      for (let i = lo; i <= hi; i++) out.add(i);
    } else {
      const n = parseInt(p, 10);
      if (n >= 1 && n <= MAX_PORTS) out.add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
}

export class PortScanTool implements BuiltInTool {
  name = 'port_scan';
  description = 'TCP 连接端口扫描（仅限自有网络或已授权的目标）。扫描一台主机的端口开放情况。ports 参数支持 "common" 预设、单个端口 "443"、端口列表 "80,443,8080" 或范围 "1-1024"。返回开放的端口、推断的服务名以及扫描耗时。';

  inputSchema = {
    type: 'object',
    properties: {
      host: { type: 'string', description: 'Target host (IP or hostname). Must be an authorized target.' },
      ports: { type: 'string', description: '"common" (default, ~30 well-known ports), "1-1024", "80,443,8080" or any mix.' },
      timeout: { type: 'number', description: 'Per-port connect timeout in ms (default 1500, max 10000).' },
      concurrency: { type: 'number', description: 'Parallel connections (default 200, max 500).' },
    },
    required: ['host'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const host = args.host as string;
    if (!host) return { content: [{ type: 'text', text: 'Error: host is required' }], isError: true };
    const ports = parsePorts(args.ports as string);
    if (ports.length === 0) {
      return { content: [{ type: 'text', text: 'Error: 无有效端口规格，示例: "common" / "80" / "80,443" / "1-1024"' }], isError: true };
    }
    const timeout = Math.min(Math.max(Number(args.timeout) || 1500, 100), 10000);
    const concurrency = Math.min(Math.max(Number(args.concurrency) || 200, 1), 500);

    let net: typeof import('node:net');
    try { net = await import('node:net'); } catch {
      return { content: [{ type: 'text', text: 'Error: port_scan 需要服务端或桌面端环境（Node net）。浏览器端不支持。' }], isError: true };
    }

    const start = Date.now();
    const open: number[] = [];
    let closed = 0;
    let unreachable = 0;
    let scanned = 0;

    const scanPort = (port: number): Promise<void> => new Promise((resolve) => {
      const socket = new net.Socket();
      let done = false;
      const finish = (result: 'open' | 'closed' | 'unreachable') => {
        if (done) return;
        done = true;
        socket.destroy();
        scanned++;
        if (result === 'open') open.push(port);
        else if (result === 'unreachable') unreachable++;
        else closed++;
        resolve();
      };
      socket.setTimeout(timeout);
      socket.once('connect', () => finish('open'));
      socket.once('timeout', () => finish('closed'));
      socket.once('error', (err: NodeJS.ErrnoException) => {
        const code = err.code || '';
        finish(code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'EINVAL' ? 'unreachable' : 'closed');
      });
      try { socket.connect(port, host); } catch { finish('closed'); }
    });

    // 简单并发池
    let idx = 0;
    const workers = Array.from({ length: Math.min(concurrency, ports.length) }, async () => {
      while (idx < ports.length) {
        const port = ports[idx++];
        await scanPort(port);
      }
    });
    await Promise.all(workers);
    const duration = Date.now() - start;

    if (scanned === 0) {
      return { content: [{ type: 'text', text: `Error: 无法连接目标 ${host}（主机不可达或全部超时）` }], isError: true };
    }

    const lines = [
      `Scan ${host} — ${ports.length} ports, ${duration}ms (timeout=${timeout}ms, concurrency=${concurrency})`,
      `Open: ${open.length}  Closed: ${closed}  Unreachable: ${unreachable}`,
    ];
    if (open.length > 0) {
      lines.push('', 'OPEN PORTS:');
      for (const p of open) {
        lines.push(`  ${p}/tcp${COMMON_PORTS[p] ? `  (${COMMON_PORTS[p]})` : ''}`);
      }
    } else if (unreachable === 0) {
      lines.push('', '(未发现开放端口)');
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
}
