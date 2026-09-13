// A 轨工具：portscan —— TCP 端口扫描 + banner 抓取 + 服务推断 + 暴露面风险判定。
// 零依赖：Node net 标准库。风险级 active（会主动建立 TCP 连接，需目标已授权）。
import net from 'node:net';
import dns from 'node:dns';
import { parsePorts } from '../sec-lab-guard.js';
import type { Finding, ToolOutput } from '../sec-lab-types.js';

export interface PortScanParams {
  target: string;
  ports: string;
  concurrency: number;
  timeoutMs: number;
  /** 是否抓取 banner，默认 true */
  banner?: boolean;
}

/** 端口 → 常见服务 */
const SERVICE_MAP: Record<number, string> = {
  21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'dns', 80: 'http', 110: 'pop3',
  111: 'rpcbind', 135: 'msrpc', 139: 'netbios-ssn', 143: 'imap', 443: 'https', 445: 'smb',
  465: 'smtps', 587: 'smtp-submission', 993: 'imaps', 995: 'pop3s', 1433: 'mssql',
  1521: 'oracle', 2049: 'nfs', 2181: 'zookeeper', 2375: 'docker-api', 2376: 'docker-api-tls',
  3306: 'mysql', 3389: 'rdp', 5432: 'postgresql', 5672: 'rabbitmq', 5900: 'vnc',
  6379: 'redis', 7001: 'weblogic', 8080: 'http-alt', 8161: 'activemq', 8443: 'https-alt',
  8888: 'http-alt', 9000: 'php-fpm/minio', 9090: 'prometheus', 9200: 'elasticsearch',
  9300: 'elasticsearch-transport', 11211: 'memcached', 27017: 'mongodb',
};

/** 暴露即高危的端口（默认应仅内网可达） */
const DANGEROUS_PORTS: Record<number, { title: string; remediation: string }> = {
  2375: { title: 'Docker Remote API 未加密暴露', remediation: '关闭 2375 明文端口，改用 2376 TLS 并限制来源 IP' },
  6379: { title: 'Redis 端口暴露', remediation: '配置 requirepass、绑定内网地址、rename CONFIG 等高危命令' },
  27017: { title: 'MongoDB 端口暴露', remediation: '启用鉴权并限制监听地址（历史上大量勒索事件源于此）' },
  9200: { title: 'Elasticsearch 端口暴露', remediation: '启用安全模块（xpack.security）并限制来源' },
  11211: { title: 'Memcached 端口暴露', remediation: '绑定内网地址，避免被用于 UDP 反射放大' },
  3306: { title: 'MySQL 端口暴露', remediation: '限制监听地址与来源 IP，禁用 root 远程登录' },
  5432: { title: 'PostgreSQL 端口暴露', remediation: '配置 pg_hba.conf 限制来源，禁用弱口令' },
  1433: { title: 'SQL Server 端口暴露', remediation: '限制来源 IP，禁用 sa 空口令' },
  1521: { title: 'Oracle 端口暴露', remediation: '限制来源 IP 并加固监听配置' },
  2181: { title: 'ZooKeeper 端口暴露', remediation: '启用 ACL 并限制来源' },
};

/** 明文协议端口 */
const CLEARTEXT_PORTS: Record<number, string> = {
  21: 'FTP 明文传输凭据与数据',
  23: 'Telnet 明文传输，极易被窃听',
  110: 'POP3 明文',
  143: 'IMAP 明文',
  25: 'SMTP 明文（建议启用 STARTTLS）',
};

interface PortResult { port: number; state: 'open' | 'closed' | 'filtered'; service?: string; banner?: string }

function tcpProbe(host: string, port: number, timeoutMs: number, withBanner: boolean): Promise<PortResult> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (r: PortResult) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* ignore */ }
      resolve(r);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      const base: PortResult = { port, state: 'open', service: SERVICE_MAP[port] };
      if (!withBanner) return done(base);
      // 抓首包：多数服务（SSH/SMTP/FTP/Redis 错误响应）连接后即主动发送；
      // HTTP 类不主动发请求，读不到就算了（保持在 active 级，不做交互探测）
      let buf = '';
      const timer = setTimeout(() => done(buf ? { ...base, banner: buf.slice(0, 200) } : base), Math.min(1500, timeoutMs));
      socket.on('data', (d: Buffer) => {
        buf += d.toString('utf8').replace(/[^\x20-\x7e]/g, '.').trim();
        if (buf.length >= 200) { clearTimeout(timer); done({ ...base, banner: buf.slice(0, 200) }); }
      });
      socket.on('error', () => { clearTimeout(timer); done(buf ? { ...base, banner: buf.slice(0, 200) } : base); });
    });
    socket.on('timeout', () => done({ port, state: 'filtered' }));
    socket.on('error', () => done({ port, state: 'closed' }));
    try {
      socket.connect(port, host);
    } catch {
      done({ port, state: 'closed' });
    }
  });
}

async function resolveHost(target: string): Promise<string> {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(target);
  if (m) return target;
  try {
    const r = await dns.promises.resolve4(target);
    if (r?.length) return r[0];
  } catch { /* fallthrough */ }
  return target;
}

export async function runPortScan(p: PortScanParams): Promise<ToolOutput> {
  const ports = parsePorts(p.ports);
  const host = await resolveHost(p.target);
  const perPortTimeout = Math.max(300, Math.min(p.timeoutMs, 8000));
  const withBanner = p.banner !== false;

  const results: PortResult[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(p.concurrency, ports.length || 1)) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= ports.length) return;
      results.push(await tcpProbe(host, ports[i], perPortTimeout, withBanner));
    }
  });
  await Promise.all(workers);
  results.sort((a, b) => a.port - b.port);

  const open = results.filter((r) => r.state === 'open');
  const findings: Finding[] = [];

  for (const r of open) {
    const danger = DANGEROUS_PORTS[r.port];
    if (danger) {
      findings.push({
        title: `高危端口开放：${r.port}/${r.service || 'unknown'}`,
        severity: 'high',
        detail: `${danger.title}${r.banner ? `；banner: ${r.banner}` : ''}`,
        evidence: r.banner,
        remediation: danger.remediation,
      });
      continue;
    }
    const clear = CLEARTEXT_PORTS[r.port];
    if (clear) {
      findings.push({
        title: `明文协议端口开放：${r.port}/${r.service || 'unknown'}`,
        severity: 'medium',
        detail: clear + (r.banner ? `；banner: ${r.banner}` : ''),
        evidence: r.banner,
        remediation: '改用加密替代协议（SFTP/SSH/IMAPS/POP3S）或限制到内网',
      });
      continue;
    }
    if (r.port === 3389) {
      findings.push({ title: 'RDP 端口开放：3389', severity: 'medium', detail: '远程桌面暴露，易成为暴力破解与勒索入口。', remediation: '限制来源 IP、启用网络级别身份验证（NLA）、改非标端口仅作辅助手段' });
      continue;
    }
    if (r.port === 445 || r.port === 139) {
      findings.push({ title: `SMB 端口开放：${r.port}`, severity: 'medium', detail: '文件共享暴露，需确认是否为必要共享。', remediation: '关闭不必要的共享，限制来源并打全补丁' });
      continue;
    }
  }

  if (open.length) {
    findings.push({
      title: `开放端口清单（${open.length} 个）`,
      severity: 'info',
      detail: open.map((r) => `${r.port}/${r.service || '?'}`).join(', '),
    });
  }

  return {
    tool: 'portscan',
    target: p.target,
    risk: 'active',
    summary: `扫描 ${ports.length} 个端口（目标 ${host}），开放 ${open.length} 个，过滤 ${results.filter((r) => r.state === 'filtered').length} 个。`,
    findings: findings.length ? findings : [{ title: '未发现开放端口', severity: 'info', detail: `已扫描 ${ports.length} 个端口均无响应` }],
    raw: { resolvedHost: host, scanned: ports.length, results },
  };
}
