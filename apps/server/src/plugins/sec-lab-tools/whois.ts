// WHOIS / 证书透明度（CT log）/ OSINT 聚合（sec-lab P1，2026-10-17）—— 全部 passive 级。
//
// ★ 三者放在一个模块：它们回答的是同一个问题——"这个域名对外暴露了什么身份信息"，
//   而且 osint 就是前两者的聚合，拆开只会让聚合逻辑到处找 import。
// ★ 只读公网情报，不向目标主机发探测包（passive 级）。
import net from 'node:net';
import https from 'node:https';
import { promises as dns } from 'node:dns';
import type { Finding, ToolOutput } from '../sec-lab-types.js';

const WHOIS_TIMEOUT_MS = 8000;
const HTTP_TIMEOUT_MS = 12000;
/** WHOIS 响应可能很长（.com 有几百行），只留前 300 行渲染，避免撑爆上下文 */
const WHOIS_MAX_LINES = 300;

/** 裸 TCP 43 查询（WHOIS 协议本身就是"连上去发一行、读到底"）。 */
function queryWhois(server: string, q: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let settled = false;
    const sock = net.createConnection({ host: server, port: 43 }, () => sock.write(q + '\r\n'));
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      if (err) reject(err);
      else resolve(Buffer.concat(chunks).toString('utf8'));
    };
    sock.setTimeout(WHOIS_TIMEOUT_MS);
    sock.on('data', (b) => { if (chunks.length < 2000) chunks.push(typeof b === 'string' ? Buffer.from(b) : b); });
    sock.on('end', () => finish());
    sock.on('timeout', () => finish());
    sock.on('error', (e) => finish(e));
  });
}

/** 先问 IANA 拿 refer 服务器，再问真正的注册局（.com/.cn 各自的服务器不同）。 */
async function whoisRaw(domain: string): Promise<{ server: string; text: string }> {
  let iana = '';
  try { iana = await queryWhois('whois.iana.org', domain); } catch { /* 回落直连注册局 */ }
  const refer = /^refer:\s*(\S+)/mi.exec(iana)?.[1];
  if (refer) {
    try {
      const text = await queryWhois(refer, domain);
      if (text.trim()) return { server: refer, text };
    } catch { /* 落到下面的 IANA 原文 */ }
  }
  return { server: refer || 'whois.iana.org', text: iana };
}

/** 从 WHOIS 文本里抽关键字段（各注册局格式差异大，只认最常见的几种写法）。 */
export function parseWhois(text: string): Record<string, string[]> {
  const want = [
    'Domain Name', 'Registrar', 'Registrar URL', 'Creation Date', 'Created Date', 'Registry Expiry Date',
    'Expiry Date', 'Updated Date', 'Name Server', 'Domain Status', 'Registrant Organization',
    'Registrant Country', 'Registry Domain ID',
  ];
  const out: Record<string, string[]> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z][A-Za-z0-9 /_-]{2,40}):\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    const key = want.find((w) => w.toLowerCase() === m[1].trim().toLowerCase());
    if (!key) continue;
    (out[key] ||= []).push(m[2].trim());
  }
  return out;
}

export async function runWhois(domain: string): Promise<ToolOutput> {
  const { server, text } = await whoisRaw(domain);
  if (!text.trim()) throw new Error(`WHOIS 无响应（${server}）——域名可能未注册，或本机出站 43 端口被拦`);
  const fields = parseWhois(text);
  const findings: Finding[] = [];

  const expiryRaw = (fields['Registry Expiry Date'] || fields['Expiry Date'] || [])[0];
  if (expiryRaw) {
    const t = Date.parse(expiryRaw);
    if (!Number.isNaN(t)) {
      const days = Math.floor((t - Date.now()) / 86400000);
      if (days < 0) findings.push({ title: '域名已过期', severity: 'high', detail: `到期时间 ${expiryRaw}` });
      else if (days <= 30) {
        findings.push({
          title: `域名将在 ${days} 天内到期`, severity: 'medium', detail: `到期时间 ${expiryRaw}`,
          remediation: '若为自有资产请及时续费：过期域名可被抢注，是钓鱼与接管的高风险窗口。',
        });
      }
    }
  }
  if ((fields['Domain Status'] || []).some((s) => /clientTransferProhibited/i.test(s))) {
    findings.push({ title: '已开启 clientTransferProhibited（禁止转移锁）', severity: 'info', detail: '这是防护项——正常。' });
  }
  if (!(fields['Name Server'] || []).length) {
    findings.push({ title: '未解析到 Name Server 字段', severity: 'info', detail: '注册局可能对非本人查询做了脱敏（GDPR 等）。' });
  }

  const shown = text.split(/\r?\n/).slice(0, WHOIS_MAX_LINES).join('\n');
  const summary = [
    `WHOIS 服务器：${server}`,
    Object.entries(fields).filter(([, v]) => v.length)
      .map(([k, v]) => `${k}: ${v.join(' | ')}`).join('\n') || '（未解析出常见字段）',
  ].join('\n');

  return {
    tool: 'whois', target: domain, risk: 'passive',
    summary, findings,
    raw: { server, fields, text: shown },
    truncated: text.split(/\r?\n/).length > WHOIS_MAX_LINES,
  };
}

/** 从 crt.sh 拉证书透明度日志里的域名（CT 是公开的、无需 key）。 */
function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: HTTP_TIMEOUT_MS, headers: { accept: 'application/json' } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (b) => { if (chunks.length < 2000) chunks.push(b); });
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (!res.statusCode || res.statusCode >= 400) { reject(new Error(`crt.sh HTTP ${res.statusCode}`)); return; }
        try { resolve(JSON.parse(body)); } catch { reject(new Error('crt.sh 返回的不是 JSON（可能被限流）')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('crt.sh 请求超时')));
    req.on('error', reject);
  });
}

export async function runCtlog(domain: string): Promise<ToolOutput> {
  const url = `https://crt.sh/?q=${encodeURIComponent('%25.' + domain)}&output=json`;
  const rows = await fetchJson(url);
  if (!Array.isArray(rows)) throw new Error('crt.sh 返回格式异常');
  const names = new Set<string>();
  for (const r of rows as Array<Record<string, unknown>>) {
    for (const n of String(r.name_value || '').split('\n')) {
      const v = n.trim().toLowerCase();
      if (!v) continue;
      if (v.startsWith('*.') && v.slice(2).endsWith(domain)) names.add(v);
      else if (v === domain || v.endsWith('.' + domain)) names.add(v);
    }
  }
  const list = [...names].sort();
  return {
    tool: 'ctlog', target: domain, risk: 'passive',
    summary: `crt.sh 共 ${rows.length} 张证书，覆盖 ${list.length} 个域名${list.length ? '：\n' + list.slice(0, 200).join('\n') : ''}` +
      (list.length > 200 ? `\n…（共 ${list.length} 个，已截断展示）` : ''),
    findings: list.length
      ? [{ title: `证书透明度日志暴露 ${list.length} 个域名`, severity: 'info', detail: 'CT 日志公开可查；这些名字任何人都能枚举。' }]
      : [],
    raw: { count: list.length, names: list },
    truncated: list.length > 200,
  };
}

/** OSINT 聚合：WHOIS + CT + DNS 三路并行，任何一路失败都不影响其它两路。 */
export async function runOsint(domain: string): Promise<ToolOutput> {
  const [w, c, d] = await Promise.allSettled([
    runWhois(domain), runCtlog(domain), dnsLookupAll(domain),
  ]);
  const parts: string[] = [];
  const findings: Finding[] = [];
  if (w.status === 'fulfilled') { parts.push(`【WHOIS】\n${w.value.summary}`); findings.push(...w.value.findings); }
  else parts.push(`【WHOIS】失败：${(w.reason as Error)?.message || w.reason}`);
  if (c.status === 'fulfilled') { parts.push(`【CT 日志】\n${c.value.summary}`); findings.push(...c.value.findings); }
  else parts.push(`【CT 日志】失败：${(c.reason as Error)?.message || c.reason}`);
  if (d.status === 'fulfilled') parts.push(`【DNS】\n${d.value}`);
  else parts.push(`【DNS】失败：${(d.reason as Error)?.message || d.reason}`);

  return { tool: 'osint', target: domain, risk: 'passive', summary: parts.join('\n\n'), findings };
}

async function dnsLookupAll(domain: string): Promise<string> {
  const types: Array<[string, (h: string) => Promise<unknown>]> = [
    ['A', dns.resolve4], ['AAAA', dns.resolve6], ['MX', dns.resolveMx],
    ['NS', dns.resolveNs], ['TXT', dns.resolveTxt], ['CNAME', dns.resolveCname],
  ];
  const lines: string[] = [];
  await Promise.all(types.map(async ([name, fn]) => {
    try {
      const r = await fn(domain);
      const text = Array.isArray(r)
        ? r.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ')
        : String(r);
      lines.push(`${name}: ${text}`);
    } catch { /* 该记录类型不存在是正常的 */ }
  }));
  return lines.length ? lines.sort().join('\n') : '（无解析记录）';
}
