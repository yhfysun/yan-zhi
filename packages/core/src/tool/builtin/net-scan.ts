// lan_scan 内置工具 — 网段主机发现 + 可选端口扫描（仅限授权目标：自有网络/获授权渗透测试）
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { parsePorts } from './port-scan';

const DEFAULT_PROBE_PORTS = '135,445,80,22,443,3389';
const MAX_HOSTS = 65536;

function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/**
 * 展开目标地址列表，支持：
 * - CIDR：192.168.1.0/24
 * - 范围：192.168.1.1-254 或 192.168.1.1-192.168.1.254
 * - 通配符：192.168.1.*
 * - 单 IP：192.168.1.10
 * 超过 MAX_HOSTS 时返回空列表（视为无效规格）。
 */
function expandTargets(spec: string): string[] {
  const s = (spec || '').trim();
  if (!s) return [];

  const cidr = s.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/);
  if (cidr) {
    const base = ipToInt(cidr[1]);
    const mask = Number(cidr[2]);
    if (base === null || mask > 32) return [];
    const size = 2 ** (32 - mask);
    if (size > MAX_HOSTS) return [];
    const start = size === 1 ? base : (base & (0xffffffff << (32 - mask))) >>> 0;
    return Array.from({ length: size }, (_, i) => intToIp((start + i) >>> 0));
  }

  const range = s.match(/^(\d+\.\d+\.\d+)\.(\d+)-(?:\d+\.\d+\.\d+\.(\d+)|(\d+))$/);
  if (range) {
    const prefix = range[1];
    const lo = Number(range[2]);
    const hi = Number(range[3] ?? range[4]);
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo || hi > 255) return [];
    return Array.from({ length: hi - lo + 1 }, (_, i) => `${prefix}.${lo + i}`);
  }

  if (s.includes('*')) {
    const parts = s.split('.');
    if (parts.length !== 4) return [];
    const ranges: number[][] = parts.map((p) =>
      p === '*' ? Array.from({ length: 256 }, (_, i) => i) : (/^\d+$/.test(p) && Number(p) <= 255 ? [Number(p)] : []),
    );
    if (ranges.some((r) => r.length === 0)) return [];
    const out: string[] = [];
    for (const a of ranges[0]) for (const b of ranges[1]) for (const c of ranges[2]) for (const d of ranges[3]) {
      out.push(`${a}.${b}.${c}.${d}`);
    }
    return out.length > MAX_HOSTS ? [] : out;
  }

  return ipToInt(s) !== null ? [s] : [];
}

type ProbeResult = 'open' | 'refused' | 'timeout' | 'unreachable';

/** TCP 探测：区分 open（连接成功）/ refused（RST，主机存活但端口关闭）/ timeout / unreachable */
function probeHost(net: typeof import('node:net'), host: string, port: number, timeout: number): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (r: ProbeResult) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(r);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish('open'));
    socket.once('timeout', () => finish('timeout'));
    socket.once('error', (err: NodeJS.ErrnoException) => {
      const code = err.code || '';
      if (code === 'ECONNREFUSED' || code === 'ECONNRESET') finish('refused');
      else if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'EINVAL') finish('unreachable');
      else finish('timeout');
    });
    try { socket.connect(port, host); } catch { finish('timeout'); }
  });
}

interface AliveHost {
  ip: string;
  /** 探测阶段开放的端口 */
  probeOpen: number[];
  /** 可选端口扫描结果 */
  ports?: number[];
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);
}

/** 自动检测本机所在局域网：取第一个非内部 IPv4 地址，返回其 /24 网段规格 */
async function detectLocalLan(): Promise<string | null> {
  try {
    const os = await import('node:os');
    for (const list of Object.values(os.networkInterfaces())) {
      for (const ni of list || []) {
        if (ni.family === 'IPv4' && !ni.internal && /^\d+\.\d+\.\d+\.\d+$/.test(ni.address)) {
          return `${ni.address}/24`;
        }
      }
    }
  } catch { /* 忽略，回退为要求显式传 target */ }
  return null;
}

export class LanScanTool implements BuiltInTool {
  name = 'lan_scan';
  description = '局域网/网段主机发现（仅限自有网络或已授权的目标）。target 不传时自动检测本机 IP 并扫描其所在的 /24 局域网；也支持显式指定 CIDR "192.168.1.0/24"、范围 "192.168.1.1-254"、通配符 "192.168.1.*" 或单 IP。用 TCP 探测端口（任一端口开放或被拒绝即视为存活）找出网段内的主机，可反解主机名；传 ports 可对存活主机再做端口扫描（规格同 port_scan）。大网段扫描较慢，建议先用小范围验证。';

  inputSchema = {
    type: 'object',
    properties: {
      target: { type: 'string', description: '可选。不传则自动扫描本机所在的 /24 局域网。也可指定 CIDR "192.168.1.0/24"、范围 "192.168.1.1-254"、通配符 "192.168.1.*" 或单 IP。' },
      probePorts: { type: 'string', description: '存活探测 TCP 端口列表，默认 "135,445,80,22,443,3389"。任一端口开放或收到 RST 即判为存活。' },
      ports: { type: 'string', description: '可选。对存活主机做端口扫描："common"（约 30 常用端口）、"80,443,8080"、"1-1024"。不传则只做主机发现。' },
      timeout: { type: 'number', description: '单次探测超时 ms（默认 1000，范围 100-5000）。' },
      concurrency: { type: 'number', description: '并发连接数（默认 256，范围 1-1000）。' },
    },
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    let target = (args.target as string || '').trim();
    let autoDetected = false;
    if (!target) {
      // 默认扫描本机 IP 所在的 /24 局域网
      const lan = await detectLocalLan();
      if (!lan) {
        return { content: [{ type: 'text', text: 'Error: 未能自动检测到本机局域网 IPv4（可能只有回环接口），请显式传入 target，如 "192.168.1.0/24"' }], isError: true };
      }
      target = lan;
      autoDetected = true;
    }

    let net: typeof import('node:net');
    let dns: typeof import('node:dns');
    try {
      net = await import('node:net');
      dns = await import('node:dns');
    } catch {
      return { content: [{ type: 'text', text: 'Error: lan_scan 需要服务端或桌面端环境（Node net/dns）。浏览器端不支持。' }], isError: true };
    }

    const targets = expandTargets(target);
    if (targets.length === 0) {
      return { content: [{ type: 'text', text: `Error: 无有效目标规格（支持 CIDR "192.168.1.0/24"、范围 "192.168.1.1-254"、通配符 "192.168.1.*"、单 IP），且不超过 ${MAX_HOSTS} 个地址` }], isError: true };
    }
    const probePorts = parsePorts((args.probePorts as string) || DEFAULT_PROBE_PORTS);
    if (probePorts.length === 0) {
      return { content: [{ type: 'text', text: 'Error: 无有效探测端口规格，示例: "135,445,80"' }], isError: true };
    }
    const scanPorts = args.ports ? parsePorts(args.ports as string) : null;
    if (args.ports && (!scanPorts || scanPorts.length === 0)) {
      return { content: [{ type: 'text', text: 'Error: 无有效端口扫描规格，示例: "common" / "80,443" / "1-1024"' }], isError: true };
    }
    const timeout = Math.min(Math.max(Number(args.timeout) || 1000, 100), 5000);
    const concurrency = Math.min(Math.max(Number(args.concurrency) || 256, 1), 1000);

    const start = Date.now();
    const alive: AliveHost[] = [];
    let unreachable = 0;

    // 阶段一：主机发现（逐主机串行探测探测端口组，主机间并发）
    let idx = 0;
    const probeOne = async (ip: string): Promise<void> => {
      const probeOpen: number[] = [];
      let refused = false;
      let unreach = 0;
      for (const p of probePorts) {
        const r = await probeHost(net, ip, p, timeout);
        if (r === 'open') probeOpen.push(p);
        else if (r === 'refused') refused = true;
        else if (r === 'unreachable') unreach++;
      }
      if (probeOpen.length > 0 || refused) alive.push({ ip, probeOpen });
      else if (unreach === probePorts.length) unreachable++;
    };
    const workers = Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
      while (idx < targets.length) {
        await probeOne(targets[idx++]);
      }
    });
    await Promise.all(workers);
    const discoverMs = Date.now() - start;

    // 阶段二：对存活主机做端口扫描（可选）
    if (scanPorts && scanPorts.length > 0 && alive.length > 0) {
      const results = new Map<string, number[]>();
      let si = 0;
      const scanOne = async (ip: string): Promise<void> => {
        const open: number[] = [];
        for (const p of scanPorts) {
          if ((await probeHost(net, ip, p, timeout)) === 'open') open.push(p);
        }
        results.set(ip, open);
      };
      const scanWorkers = Array.from({ length: Math.min(concurrency, alive.length) }, async () => {
        while (si < alive.length) {
          await scanOne(alive[si++].ip);
        }
      });
      await Promise.all(scanWorkers);
      for (const a of alive) a.ports = results.get(a.ip) || [];
    }

    // 反解主机名（失败忽略，不阻塞整体结果）
    const names = new Map<string, string>();
    await Promise.all(alive.map(async (a) => {
      try {
        const recs = await withTimeout(dns.promises.reverse(a.ip), 3000);
        if (recs && recs.length > 0) names.set(a.ip, recs[0]);
      } catch { /* 无 PTR 记录或解析失败 */ }
    }));

    const duration = Date.now() - start;
    const lines = [
      `LAN scan ${target}${autoDetected ? '  (auto-detected local LAN)' : ''} — ${targets.length} addresses (discover ${discoverMs}ms, total ${duration}ms, probe=${probePorts.join(',')}, timeout=${timeout}ms)`,
      `Alive: ${alive.length}  Unreachable: ${unreachable}`,
    ];
    if (alive.length > 0) {
      lines.push('', 'ALIVE HOSTS:');
      for (const a of alive) {
        const name = names.get(a.ip) ? `  (${names.get(a.ip)})` : '';
        let portInfo = '';
        if (a.ports) portInfo = `  open: ${a.ports.length > 0 ? a.ports.join(',') : '(none)'}`;
        else if (a.probeOpen.length > 0) portInfo = `  probe-open: ${a.probeOpen.join(',')}`;
        lines.push(`  ${a.ip}${name}${portInfo}`);
      }
    } else {
      lines.push('', '(未发现存活主机，可尝试加大 timeout 或补充 probePorts，如 445/139 对 Windows、22 对 Linux)');
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
}
