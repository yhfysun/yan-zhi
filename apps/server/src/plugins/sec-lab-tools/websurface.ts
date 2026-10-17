// Web 纵深：目录爆破 / WAF 识别 / 服务版本 / UDP 探测（sec-lab P1，2026-10-17）。
//
// ★ 四件事放一个文件：都是"对已授权目标补一层深度的主动探测"，共用同一套
//   超时、并发与错误处理口径；拆成四个文件只会把 worker pool 抄四遍。
// ★ 全部 active 级（会留下访问日志），走同一个 guard（范围 / 风险级 / 规模上限）。
import net from 'node:net';
import dgram from 'node:dgram';
import { fetchPage } from './crawler.js';
import { parsePorts } from '../sec-lab-guard.js';
import type { Finding, ToolOutput } from '../sec-lab-types.js';

const DEFAULT_PATHS = [
  'admin', 'login', 'api', 'backup', '.git/HEAD', '.env', 'phpinfo.php', 'robots.txt',
  'sitemap.xml', 'swagger-ui.html', 'swagger.json', 'openapi.json', 'actuator', 'actuator/env',
  'actuator/health', 'console', 'manager', 'test', 'dev', 'uploads', 'files', 'download',
  'static', 'assets', 'config', 'backup.zip', 'www.zip', 'db.sql', 'server-status',
  '.DS_Store', '.svn/entries', 'web.config', 'crossdomain.xml', 'health', 'metrics',
  'debug', 'graphql', 'api/v1', 'api/docs', 'login.jsp', 'admin/login',
];

function originOf(target: string): string {
  return /^https?:\/\//i.test(target) ? target.replace(/\/+$/, '') : `http://${target.replace(/\/+$/, '')}`;
}

/** 目录/文件爆破：与"随机路径基线"对比，避免把自定义 404 页面全部误报成命中。 */
export async function runDirsearch(o: { target: string; concurrency?: number; timeoutMs?: number }): Promise<ToolOutput> {
  const base = originOf(o.target);
  const timeout = Math.min(Math.max(o.timeoutMs ?? 8000, 1000), 20000);
  const concurrency = Math.min(Math.max(o.concurrency ?? 8, 1), 32);

  const randPath = `__yz_baseline_${Math.random().toString(36).slice(2)}`;
  let baseline = { status: 0, len: 0 };
  try {
    const b = await fetchPage(`${base}/${randPath}`, timeout, 0);
    baseline = { status: b.status, len: b.body.length };
  } catch {
    throw new Error(`目标不可达：${base}`);
  }

  const hits: Array<{ path: string; status: number; len: number }> = [];
  let idx = 0;
  const worker = async () => {
    while (idx < DEFAULT_PATHS.length) {
      const p = DEFAULT_PATHS[idx++];
      try {
        const r = await fetchPage(`${base}/${p}`, timeout, 0);
        const len = r.body.length;
        const differ = r.status !== baseline.status || Math.abs(len - baseline.len) > Math.max(32, baseline.len * 0.1);
        if (differ && ![404, 410].includes(r.status)) hits.push({ path: p, status: r.status, len });
      } catch { /* 单个失败忽略 */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, DEFAULT_PATHS.length) }, worker));
  hits.sort((a, b) => a.path.localeCompare(b.path));

  const risky = hits.filter((h) => /\.(git|svn|env|sql|zip|bak)$|^\.env$|phpinfo|actuator|server-status|swagger|\.DS_Store/i.test(h.path));
  const findings: Finding[] = [];
  if (risky.length) {
    findings.push({
      title: `发现 ${risky.length} 个敏感路径/文件`,
      severity: 'high',
      detail: risky.map((h) => `/${h.path} → ${h.status}（${h.len}B）`).join('\n'),
      remediation: '这些路径不应在公网可达：删除备份文件、关闭 actuator/swagger 的匿名访问、禁止 .git/.env 被 Web 服务器直接返回。',
    });
  }
  findings.push({
    title: `目录爆破完成：${hits.length}/${DEFAULT_PATHS.length} 命中`,
    severity: 'info',
    detail: `基线（随机路径）：${baseline.status} / ${baseline.len}B`,
  });

  return {
    tool: 'dirsearch', target: o.target, risk: 'active',
    summary: `探测 ${DEFAULT_PATHS.length} 条路径，命中 ${hits.length} 条：\n` +
      (hits.length ? hits.map((h) => `/${h.path}  ${h.status}  ${h.len}B`).join('\n') : '（无）'),
    findings,
    raw: { baseline, hits, wordlistSize: DEFAULT_PATHS.length },
  };
}

/** WAF / CDN 识别：只看响应特征（不主动发攻击载荷，避免触发封禁）。 */
export async function runWafDetect(target: string, timeoutMs = 10000): Promise<ToolOutput> {
  const url = originOf(target);
  const r = await fetchPage(url, Math.min(Math.max(timeoutMs, 1000), 20000), 2);
  const h = r.headers;
  const cookie = String(h['set-cookie'] || '');
  const server = String(h.server || '');
  const body = r.body.slice(0, 20000);
  const signals: string[] = [];

  const rules: Array<[RegExp, string]> = [
    [/cloudflare|cf-ray/i, 'Cloudflare'],
    [/sucuri/i, 'Sucuri'],
    [/akamai|ak-bmsc/i, 'Akamai'],
    [/incapsula|visid_incap|incap_ses/i, 'Imperva Incapsula'],
    [/awselb|awselb\/|x-amz-cf/i, 'AWS (ELB/CloudFront)'],
    [/bigip|big-ip|f5/i, 'F5 BIG-IP'],
    [/mod_security|modsecurity/i, 'ModSecurity'],
    [/360wzws|360\.com/i, '360 网站卫士'],
    [/yunsuo|yundun|aliyun|waf/i, '阿里云/云盾类'],
    [/safedog/i, '安全狗'],
    [/nginx/i, 'nginx'],
  ];
  for (const [re, name] of rules) {
    if (re.test(server) || re.test(cookie) || re.test(body)) signals.push(name);
  }
  const blocked = /Attention Required|Access Denied|Request Blocked|访问被拒绝|拦截/i.test(body);

  const findings: Finding[] = [];
  if (signals.length) {
    findings.push({
      title: `识别到 ${signals.length} 个 WAF/CDN 特征`, severity: 'info',
      detail: signals.join(', ') + (blocked ? '（响应体含拦截页特征）' : ''),
      remediation: '存在 WAF 时先确认规则边界，再决定是否需要在授权范围内做绕过验证；不要对着 WAF 做高频探测。',
    });
  } else {
    findings.push({ title: '未识别到明显 WAF/CDN 特征', severity: 'info', detail: '可能是直连源站，也可能特征被隐藏。' });
  }
  return {
    tool: 'waf_detect', target, risk: 'active',
    summary: `HTTP ${r.status}，Server: ${server || '(无)'}，WAF 特征：${signals.length ? signals.join(', ') : '未识别'}`,
    findings,
    raw: { status: r.status, server, signals, blocked, headers: h },
  };
}

/** 抓单个端口的 banner（HTTP 端口发一个最小 HEAD，其余纯读）。 */
function grabBanner(host: string, port: number, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port }, () => {
      if ([80, 8080, 8000, 8888, 3000, 5000, 9000].includes(port)) {
        sock.write(`HEAD / HTTP/1.0\r\nHost: ${host}\r\n\r\n`);
      }
    });
    let buf = '';
    let settled = false;
    const finish = (v: string | null) => {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch { /* noop */ }
      resolve(v);
    };
    sock.setTimeout(timeoutMs);
    sock.on('data', (d) => { buf += d.toString('utf8'); if (buf.length > 2048) finish(buf.trim()); });
    sock.on('end', () => finish(buf.trim() || null));
    sock.on('timeout', () => finish(buf.trim() || null));
    sock.on('error', () => finish(null));
  });
}

/** 服务/版本深挖：对指定端口抓 banner（不发送任何漏洞载荷）。 */
export async function runServiceScan(o: { target: string; ports?: string; timeoutMs?: number }): Promise<ToolOutput> {
  const ports = parsePorts(o.ports || 'common', 2000);
  const timeout = Math.min(Math.max(o.timeoutMs ?? 3000, 500), 10000);
  const results: Array<{ port: number; banner: string }> = [];

  let idx = 0;
  const worker = async () => {
    while (idx < ports.length) {
      const p = ports[idx++];
      const banner = await grabBanner(o.target, p, timeout);
      if (banner) results.push({ port: p, banner: banner.split(/\r?\n/)[0].slice(0, 200) });
    }
  };
  await Promise.all(Array.from({ length: Math.min(16, ports.length) }, worker));
  results.sort((a, b) => a.port - b.port);

  return {
    tool: 'service_scan', target: o.target, risk: 'active',
    summary: `扫描 ${ports.length} 个端口，${results.length} 个有响应：\n` +
      (results.length ? results.map((r) => `${r.port}  ${r.banner}`).join('\n') : '（无响应）'),
    findings: results.length
      ? [{ title: `识别到 ${results.length} 个有 banner 的服务`, severity: 'info', detail: 'banner 会暴露软件与版本，配合 CVE 情报可判断已知漏洞面。' }]
      : [],
    raw: { ports: ports.length, results },
  };
}

/** UDP 探测：只发标准查询包（DNS / NTP / SSDP），有回包即说明端口开放。 */
export async function runUdpScan(o: { target: string; timeoutMs?: number }): Promise<ToolOutput> {
  const timeout = Math.min(Math.max(o.timeoutMs ?? 1500, 500), 5000);
  const probes: Array<{ port: number; label: string; payload: Buffer }> = [
    {
      port: 53, label: 'DNS',
      // 标准 DNS 查询：example.com A（ID 固定，仅用于探测）
      payload: Buffer.from('abcd01000001000000000000076578616d706c6503636f6d0000010001', 'hex'),
    },
    { port: 123, label: 'NTP', payload: Buffer.concat([Buffer.from([0x1b]), Buffer.alloc(47)]) },
    {
      port: 1900, label: 'SSDP',
      payload: Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 1\r\nST: ssdp:all\r\n\r\n'),
    },
  ];

  const probe = (port: number, payload: Buffer, label: string) => new Promise<{ port: number; label: string; reply: boolean }>((resolve) => {
    const sock = dgram.createSocket('udp4');
    let done = false;
    const finish = (reply: boolean) => {
      if (done) return;
      done = true;
      try { sock.close(); } catch { /* noop */ }
      resolve({ port, label, reply });
    };
    sock.on('message', () => finish(true));
    sock.on('error', () => finish(false));
    sock.send(payload, port, o.target, (err) => { if (err) finish(false); });
    setTimeout(() => finish(false), timeout);
  });

  const results = await Promise.all(probes.map((p) => probe(p.port, p.payload, p.label)));
  const open = results.filter((r) => r.reply);
  return {
    tool: 'udp_scan', target: o.target, risk: 'active',
    summary: `UDP 探测 ${probes.length} 个端口，${open.length} 个有回包：\n` +
      results.map((r) => `${r.port}/udp ${r.label}  ${r.reply ? '有响应' : '—'}`).join('\n') +
      '\n（UDP 无回包不等于端口关闭：可能是防火墙丢弃，需结合其它信息判断）',
    findings: open.length
      ? [{ title: `UDP ${open.map((r) => r.port).join('/')} 有响应`, severity: 'info', detail: 'DNS/NTP/SSDP 常被用于放大攻击与信息泄露，应限制来源。' }]
      : [],
    raw: results,
  };
}
