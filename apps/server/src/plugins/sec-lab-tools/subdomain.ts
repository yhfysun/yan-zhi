// 子域枚举（sec-lab P1，2026-10-17）—— active 级：对目标域做 DNS 暴力枚举。
//
// ★ 为什么不做成 recon 的一个 action：recon 是 passive（只读 DNS 全记录），
//   而这里会主动发出**几十到上百次** DNS 查询，属于扫的行为，风险级与审计口径不同。
import { promises as dns } from 'node:dns';
import type { Finding, ToolOutput } from '../sec-lab-types.js';

const COMMON = [
  'www', 'mail', 'api', 'admin', 'test', 'dev', 'staging', 'prod', 'vpn', 'git',
  'gitlab', 'jenkins', 'ci', 'cdn', 'static', 'img', 'm', 'wap', 'oa', 'erp',
  'crm', 'sso', 'auth', 'login', 'portal', 'docs', 'wiki', 'blog', 'shop', 'pay',
  'order', 'db', 'mysql', 'redis', 'mongo', 'es', 'kibana', 'grafana', 'prometheus', 'monitor',
  'log', 'backup', 'ftp', 'sftp', 'ssh', 'remote', 'vps', 'ns1', 'ns2', 'mx',
  'smtp', 'pop', 'imap', 'webmail', 'devops', 'k8s', 'docker', 'registry', 'harbor', 'nexus',
  'jira', 'confluence', 'test1', 'test2', 'uat', 'demo', 'beta', 'alpha', 'internal', 'intranet',
  'office', 'app', 'web', 'gw', 'gateway',
];

export const SUBDOMAIN_WORDLISTS: Record<'fast' | 'full', string[]> = {
  fast: COMMON.slice(0, 40),
  full: COMMON,
};

/** 高风险名字：出现在公网子域里通常意味着"测试/管理面暴露在互联网上" */
const SENSITIVE = /^(admin|test|test1|test2|dev|staging|uat|jenkins|git|gitlab|vpn|internal|intranet|erp|oa|sso|harbor|kibana|grafana|prometheus|mongodb?|redis|mysql|sftp|ftp)$/;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function resolveOne(host: string, timeoutMs: number): Promise<string[] | null> {
  const probe = async () => {
    const out: string[] = [];
    try { out.push(...await dns.resolve4(host)); } catch { /* 无 A */ }
    try { out.push(...await dns.resolve6(host)); } catch { /* 无 AAAA */ }
    try { out.push(...(await dns.resolveCname(host)).map((c) => `CNAME ${c}`)); } catch { /* 无 CNAME */ }
    return out;
  };
  try {
    const r = await withTimeout(probe(), timeoutMs);
    return r.length ? r : null;
  } catch {
    return null;
  }
}

export interface SubdomainOpts {
  domain: string;
  wordlist?: 'fast' | 'full';
  concurrency?: number;
  timeoutMs?: number;
}

export async function runSubdomain(o: SubdomainOpts): Promise<ToolOutput> {
  const words = SUBDOMAIN_WORDLISTS[o.wordlist || 'fast'] || SUBDOMAIN_WORDLISTS.fast;
  const concurrency = Math.min(Math.max(o.concurrency || 20, 1), 50);
  const timeoutMs = Math.min(Math.max(o.timeoutMs || 3000, 500), 15000);

  const found: Array<{ name: string; addrs: string[] }> = [];
  let idx = 0;
  const worker = async () => {
    while (idx < words.length) {
      const w = words[idx++];
      const host = `${w}.${o.domain}`;
      const addrs = await resolveOne(host, timeoutMs);
      if (addrs) found.push({ name: host, addrs });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, words.length) }, worker));

  found.sort((a, b) => a.name.localeCompare(b.name));
  const sensitive = found.filter((f) => SENSITIVE.test(f.name.slice(0, f.name.length - o.domain.length - 1)));
  const findings: Finding[] = [];
  if (sensitive.length) {
    findings.push({
      title: `发现 ${sensitive.length} 个敏感子域（测试/管理/数据库）`,
      severity: 'medium',
      detail: sensitive.map((s) => s.name).join(', '),
      remediation: '公网不应暴露测试环境与管理面：加访问控制、内网化，或至少加认证与 IP 白名单。',
    });
  }
  findings.push({
    title: `子域枚举完成：${found.length}/${words.length} 命中`,
    severity: 'info',
    detail: found.length
      ? found.map((f) => `${f.name} → ${f.addrs.join(', ')}`).join('\n')
      : '未发现可解析的子域（也可能是通配 DNS 导致全部命中/全部不命中，需人工复核）。',
  });

  return {
    tool: 'subdomain', target: o.domain, risk: 'active',
    summary: `字典 ${o.wordlist || 'fast'}（${words.length} 词），命中 ${found.length} 个：\n` +
      (found.length ? found.map((f) => `${f.name}  ${f.addrs.join(', ')}`).join('\n') : '（无）'),
    findings,
    raw: { wordlist: o.wordlist || 'fast', words: words.length, found },
  };
}
