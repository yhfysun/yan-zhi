// A 轨工具：recon —— 目标被动画像（DNS / TLS / HTTP 指纹与安全头 / 子域发现）。
// 零依赖：全部用 Node 标准库（dns / tls / https），不需要用户安装任何东西。
// 风险级 passive：只做观测，不发送任何探测载荷。
import dns from 'node:dns';
import tls from 'node:tls';
import https from 'node:https';
import http from 'node:http';
import type { Finding, ToolOutput } from '../sec-lab-types.js';

export interface ReconParams {
  target: string;
  timeoutMs: number;
  /** 指定子模块，默认全跑：dns / tls / http / subdomain */
  actions?: string[];
}

const DEFAULT_SUBDOMAIN_DICT = [
  'www', 'api', 'admin', 'test', 'dev', 'mail', 'ftp', 'cdn', 'static', 'img',
  'git', 'gitlab', 'jenkins', 'monitor', 'grafana', 'kibana', 'vpn', 'db', 'mysql',
  'redis', 'es', 'k8s', 'devops', 'staging', 'prod', 'beta', 'app', 'm', 'mobile',
  'oa', 'crm', 'erp', 'sso', 'auth', 'gw', 'gateway', 'ws', 'docs', 'wiki',
];

/** 安全响应头审计基线（缺失即记为发现项） */
const SECURITY_HEADERS: Array<{ name: string; severity: Finding['severity']; advice: string }> = [
  { name: 'strict-transport-security', severity: 'medium', advice: '启用 HSTS 并配置足够长的 max-age（建议 ≥ 15552000 秒）' },
  { name: 'content-security-policy', severity: 'medium', advice: '配置 CSP 降低 XSS 与数据注入风险' },
  { name: 'x-frame-options', severity: 'low', advice: '配置 X-Frame-Options 或 CSP frame-ancestors 防点击劫持' },
  { name: 'x-content-type-options', severity: 'low', advice: '设置 X-Content-Type-Options: nosniff' },
  { name: 'referrer-policy', severity: 'info', advice: '设置 Referrer-Policy 控制来源信息泄露' },
];

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e as Error); },
    );
  });
}

// ---------- DNS ----------

interface DnsResult {
  A: string[]; AAAA: string[]; CNAME: string[]; MX: Array<{ exchange: string; priority: number }>;
  NS: string[]; TXT: string[][]; errors: string[];
}

async function dnsLookup(host: string, timeoutMs: number): Promise<DnsResult> {
  const out: DnsResult = { A: [], AAAA: [], CNAME: [], MX: [], NS: [], TXT: [], errors: [] };
  const resolver = new dns.promises.Resolver({ timeout: Math.min(timeoutMs, 10000) });
  const tasks: Array<[string, Promise<unknown>]> = [
    ['A', resolver.resolve4(host)],
    ['AAAA', resolver.resolve6(host)],
    ['CNAME', resolver.resolveCname(host)],
    ['MX', resolver.resolveMx(host)],
    ['NS', resolver.resolveNs(host)],
    ['TXT', resolver.resolveTxt(host)],
  ];
  for (const [kind, task] of tasks) {
    try {
      const v = await withTimeout(task as Promise<unknown>, timeoutMs, `DNS ${kind}`);
      if (kind === 'A') out.A = v as string[];
      else if (kind === 'AAAA') out.AAAA = v as string[];
      else if (kind === 'CNAME') out.CNAME = v as string[];
      else if (kind === 'MX') out.MX = v as DnsResult['MX'];
      else if (kind === 'NS') out.NS = v as string[];
      else if (kind === 'TXT') out.TXT = v as string[][];
    } catch (e) {
      const msg = (e as NodeJS.ErrnoException).code || (e as Error).message;
      // ENODATA/ENOTFOUND 属正常"没有该记录"，不列为错误
      if (msg !== 'ENODATA' && msg !== 'ENOTFOUND') out.errors.push(`${kind}: ${msg}`);
    }
  }
  return out;
}

// ---------- TLS ----------

interface TlsResult {
  subject?: string; issuer?: string; validFrom?: string; validTo?: string;
  daysRemaining?: number; selfSigned?: boolean; sans?: string[]; protocol?: string; error?: string;
}

function tlsInspect(host: string, port: number, timeoutMs: number): Promise<TlsResult> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host, port, servername: host, rejectUnauthorized: false, timeout: timeoutMs },
      () => {
        try {
          const cert = socket.getPeerCertificate(false) as tls.PeerCertificate & { valid_from?: string; valid_to?: string };
          const validTo = cert.valid_to || '';
          const validFrom = cert.valid_from || '';
          const days = validTo ? Math.floor((new Date(validTo).getTime() - Date.now()) / 86400000) : undefined;
          const subject = cert.subject ? Object.entries(cert.subject).map(([k, v]) => `${k}=${v}`).join(', ') : undefined;
          const issuer = cert.issuer ? Object.entries(cert.issuer).map(([k, v]) => `${k}=${v}`).join(', ') : undefined;
          const sans = cert.subjectaltname
            ? cert.subjectaltname.split(',').map((s) => s.trim().replace(/^DNS:/, ''))
            : undefined;
          const protocol = socket.getProtocol() || undefined;
          socket.destroy();
          resolve({
            subject, issuer, validFrom, validTo, daysRemaining: days,
            selfSigned: !!(subject && issuer && subject === issuer), sans, protocol,
          });
        } catch (e) {
          socket.destroy();
          resolve({ error: (e as Error).message });
        }
      },
    );
    socket.on('error', (e: Error) => resolve({ error: e.message }));
    socket.on('timeout', () => { socket.destroy(); resolve({ error: `TLS 连接超时（${timeoutMs}ms）` }); });
  });
}

// ---------- HTTP ----------

interface HttpResult {
  finalUrl?: string; status?: number; headers?: Record<string, string>; error?: string;
  redirectChain?: string[];
}

function httpProbe(host: string, timeoutMs: number): Promise<HttpResult> {
  const attempt = (scheme: 'https' | 'http'): Promise<HttpResult> =>
    new Promise((resolve) => {
      const mod = scheme === 'https' ? https : http;
      const req = mod.request(
        {
          host, port: scheme === 'https' ? 443 : 80, path: '/', method: 'GET',
          timeout: timeoutMs, rejectUnauthorized: false,
          headers: { 'User-Agent': 'yan-zhi-sec-lab/0.1', Accept: '*/*' },
        },
        (res) => {
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') headers[k.toLowerCase()] = v;
            else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join('; ');
          }
          const chain: string[] = [];
          const loc = headers['location'];
          if (loc) chain.push(loc);
          res.destroy();
          resolve({ finalUrl: `${scheme}://${host}/`, status: res.statusCode, headers, redirectChain: chain });
        },
      );
      req.on('error', (e: Error) => resolve({ error: `${scheme}: ${e.message}` }));
      req.on('timeout', () => { req.destroy(); resolve({ error: `${scheme}: 请求超时` }); });
      req.end();
    });

  return (async () => {
    const r = await attempt('https');
    if (!r.error) return r;
    return attempt('http');
  })();
}

// ---------- 子域 ----------

async function subdomainScan(domain: string, timeoutMs: number, dict: string[]) {
  const found: Array<{ host: string; ips: string[] }> = [];
  const resolver = new dns.promises.Resolver({ timeout: Math.min(timeoutMs, 5000) });
  const CONC = 12;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONC, dict.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= dict.length) return;
      const host = `${dict[i]}.${domain}`;
      try {
        const ips = await resolver.resolve4(host);
        if (ips?.length) found.push({ host, ips });
      } catch {
        /* 不存在即跳过 */
      }
    }
  });
  await Promise.all(workers);
  return found.sort((a, b) => a.host.localeCompare(b.host));
}

// ---------- 主入口 ----------

export async function runRecon(p: ReconParams): Promise<ToolOutput> {
  const target = p.target;
  const actions = p.actions?.length ? p.actions : ['dns', 'tls', 'http', 'subdomain'];
  const findings: Finding[] = [];
  const raw: Record<string, unknown> = {};

  if (actions.includes('dns')) {
    const d = await dnsLookup(target, p.timeoutMs);
    raw.dns = d;
    findings.push({
      title: `DNS 解析：A ${d.A.length} 条 / AAAA ${d.AAAA.length} 条 / NS ${d.NS.length} 条`,
      severity: 'info',
      detail: [d.A.length ? `A: ${d.A.join(', ')}` : '', d.AAAA.length ? `AAAA: ${d.AAAA.join(', ')}` : '',
        d.NS.length ? `NS: ${d.NS.join(', ')}` : '', d.MX.length ? `MX: ${d.MX.map((m) => `${m.exchange}(${m.priority})`).join(', ')}` : '']
        .filter(Boolean).join(' | ') || '无可用记录',
    });
    const spf = d.TXT.flat().find((t) => t.toLowerCase().startsWith('v=spf1'));
    if (!spf && d.MX.length) {
      findings.push({
        title: '未配置 SPF 记录',
        severity: 'low',
        detail: '域名存在邮件交换记录但缺少 SPF，易被伪造发信人钓鱼。',
        remediation: '添加 TXT 记录 v=spf1 ... -all',
      });
    }
  }

  if (actions.includes('tls')) {
    const t = await tlsInspect(target, 443, p.timeoutMs);
    raw.tls = t;
    if (t.error) {
      findings.push({ title: 'TLS 探测失败', severity: 'info', detail: t.error });
    } else {
      if (t.selfSigned) {
        findings.push({ title: 'TLS 证书为自签名', severity: 'medium', detail: `subject=${t.subject}`, remediation: '改用受信任 CA 签发证书' });
      }
      if (t.daysRemaining !== undefined) {
        if (t.daysRemaining < 0) {
          findings.push({ title: 'TLS 证书已过期', severity: 'high', detail: `validTo=${t.validTo}（已过期 ${-t.daysRemaining} 天）`, remediation: '立即续期证书' });
        } else if (t.daysRemaining < 30) {
          findings.push({ title: 'TLS 证书即将过期', severity: 'medium', detail: `validTo=${t.validTo}（剩余 ${t.daysRemaining} 天）`, remediation: '尽快续期并配置自动续期' });
        } else {
          findings.push({ title: `TLS 证书有效（剩余 ${t.daysRemaining} 天）`, severity: 'info', detail: `issuer=${t.issuer}` });
        }
      }
      if (t.protocol && /TLSv1\.0|TLSv1\.1|SSLv/.test(t.protocol)) {
        findings.push({ title: `TLS 协议版本过旧：${t.protocol}`, severity: 'high', detail: '低版本 TLS/SSL 存在已知弱点。', remediation: '禁用 TLS 1.0/1.1 与 SSLv3，仅保留 TLS 1.2+' });
      }
    }
  }

  if (actions.includes('http')) {
    const h = await httpProbe(target, p.timeoutMs);
    raw.http = h;
    if (h.error || !h.headers) {
      findings.push({ title: 'HTTP 探测失败', severity: 'info', detail: h.error || '无响应头' });
    } else {
      const headers = h.headers;
      for (const s of SECURITY_HEADERS) {
        if (!headers[s.name]) {
          findings.push({ title: `缺少安全响应头 ${s.name}`, severity: s.severity, detail: `${target} 的响应中未返回该头。`, remediation: s.advice });
        }
      }
      if (headers['server']) {
        findings.push({ title: `Server 头泄露组件信息：${headers['server']}`, severity: 'info', detail: '暴露服务端类型与版本会便利攻击者定向。', remediation: '隐藏或改写 Server 头' });
      }
      if (headers['x-powered-by']) {
        findings.push({ title: `X-Powered-By 泄露技术栈：${headers['x-powered-by']}`, severity: 'low', detail: '暴露后端语言/框架版本。', remediation: '移除 X-Powered-By 响应头' });
      }
      if (headers['set-cookie']) {
        const c = headers['set-cookie'];
        const miss: string[] = [];
        if (!/;\s*HttpOnly/i.test(c)) miss.push('HttpOnly');
        if (!/;\s*Secure/i.test(c)) miss.push('Secure');
        if (!/;\s*SameSite=/i.test(c)) miss.push('SameSite');
        if (miss.length) {
          findings.push({ title: `Cookie 缺少安全标志：${miss.join(', ')}`, severity: 'medium', detail: `Set-Cookie: ${c.slice(0, 160)}`, remediation: '为会话 Cookie 补齐 HttpOnly / Secure / SameSite' });
        }
      }
      if (h.status && h.status >= 300 && h.status < 400) {
        findings.push({ title: `根路径返回重定向 ${h.status}`, severity: 'info', detail: `Location: ${h.redirectChain?.join(' → ') || '(未知)'}` });
      }
    }
  }

  if (actions.includes('subdomain')) {
    const subs = await subdomainScan(target, p.timeoutMs, DEFAULT_SUBDOMAIN_DICT);
    raw.subdomains = subs;
    if (subs.length) {
      findings.push({
        title: `发现 ${subs.length} 个存活子域`,
        severity: 'info',
        detail: subs.map((s) => `${s.host} → ${s.ips.join(',')}`).join('; ').slice(0, 800),
        remediation: '逐个确认是否为预期暴露面，非必要子域建议下线或加访问控制',
      });
    } else {
      findings.push({ title: '未发现字典内子域', severity: 'info', detail: `已尝试 ${DEFAULT_SUBDOMAIN_DICT.length} 个常见子域前缀` });
    }
  }

  const criticalCount = findings.filter((f) => f.severity === 'critical' || f.severity === 'high').length;
  return {
    tool: 'recon',
    target,
    risk: 'passive',
    summary: `完成 ${actions.join('/')} 被动侦察，共 ${findings.length} 项结果，其中高危及以上 ${criticalCount} 项。`,
    findings,
    raw,
  };
}
