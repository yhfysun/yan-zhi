// 漏洞验证与发现项状态机（sec-lab P2，2026-10-17）。
//
// ★ 定位：把"启发式怀疑"变成"有证据的确认"，并把误报从链条里摘出去。
//   - SQLi：错误特征 + 布尔差分（只读探测，不跑 sqlmap、不写文件）
//   - XSS ：唯一标记的**反射**检测（不执行脚本、不构造利用链）
//   - SSRF：借助 /oob 的回调地址做带外确认（无回显才是常态）
// ★ 全部是 active/intrusive 动作：会留下访问日志，也可能触发目标告警。
//   护栏侧按 intrusive 门控（交战模式 + 每次 confirmed）。
import { fetchPage } from './crawler.js';
import { oastStatus } from './oast.js';
import type { Finding, ToolOutput } from '../sec-lab-types.js';

const SQL_ERROR_RE = /(you have an error in your sql syntax|warning:\s*mysql|unclosed quotation mark|syntax error at or near|quoted string not properly terminated|ORA-\d{5}|SQLSTATE\[|pg_query\(\)|SQLite3?::)/i;

function originOf(target: string): string {
  return /^https?:\/\//i.test(target) ? target : `http://${target}`;
}

function withParam(url: string, name: string, value: string): string {
  const u = new URL(url);
  u.searchParams.set(name, value);
  return u.toString();
}

/** SQL 注入验证：每个参数注入单引号，看错误特征与布尔差分。 */
export async function verifySqli(target: string, timeoutMs = 10000): Promise<ToolOutput> {
  const url = originOf(target);
  const timeout = Math.min(Math.max(timeoutMs, 1000), 30000);
  let base: URL;
  try { base = new URL(url); } catch { throw new Error('目标 URL 不合法（需要带参数的 URL）'); }
  const params = [...base.searchParams.keys()];
  if (!params.length) throw new Error('URL 里没有查询参数；SQLi 验证需要形如 /a?x=1');

  const baseline = await fetchPage(url, timeout);
  const findings: Finding[] = [];
  const details: string[] = [];

  for (const p of params) {
    const orig = base.searchParams.get(p) || '1';
    const errRes = await fetchPage(withParam(url, p, `${orig}'`), timeout).catch(() => null);
    const errHit = errRes ? SQL_ERROR_RE.test(errRes.body) : false;

    // 布尔差分：真/假条件响应长度明显不同
    const [tRes, fRes] = await Promise.all([
      fetchPage(withParam(url, p, `${orig}' AND '1'='1`), timeout).catch(() => null),
      fetchPage(withParam(url, p, `${orig}' AND '1'='2`), timeout).catch(() => null),
    ]);
    const diff = tRes && fRes ? Math.abs(tRes.body.length - fRes.body.length) : 0;
    const boolDiff = !!(tRes && fRes && diff > Math.max(64, baseline.body.length * 0.15));

    if (errHit || boolDiff) {
      findings.push({
        title: `参数 ${p} 疑似 SQL 注入${errHit ? '（错误回显）' : '（布尔差分）'}`,
        severity: 'high',
        detail: `注入点：${p}\n${errHit ? '单引号触发了数据库错误特征' : `真/假条件响应长度差 ${diff} 字节`}`,
        remediation: '参数化查询 / 预编译语句；不要拼接 SQL；统一错误页避免泄露数据库类型。',
        evidence: (errRes?.body || tRes?.body || '').slice(0, 300),
      });
    }
    details.push(`${p}: ${errHit ? '错误特征命中' : '无错误特征'}${boolDiff ? ' + 布尔差分' : ''}`);
  }

  return {
    tool: 'verify_sqli', target: url, risk: 'intrusive',
    summary: `验证 ${params.length} 个参数：\n${details.join('\n')}\n命中 ${findings.length} 个疑似注入点。`,
    findings,
    raw: { params, hits: findings.length },
  };
}

/** XSS 验证：注入唯一标记，看是否原样反射（不执行脚本）。 */
export async function verifyXss(target: string, timeoutMs = 10000): Promise<ToolOutput> {
  const url = originOf(target);
  const timeout = Math.min(Math.max(timeoutMs, 1000), 30000);
  let base: URL;
  try { base = new URL(url); } catch { throw new Error('目标 URL 不合法（需要带参数的 URL）'); }
  const params = [...base.searchParams.keys()];
  if (!params.length) throw new Error('URL 里没有查询参数；XSS 验证需要形如 /a?x=1');

  const marker = `yzx${Math.random().toString(36).slice(2, 10)}`;
  const payload = `${marker}<img src=x onerror=alert(1)>`;
  const findings: Finding[] = [];
  const details: string[] = [];

  for (const p of params) {
    const res = await fetchPage(withParam(url, p, payload), timeout).catch(() => null);
    if (!res) { details.push(`${p}: 请求失败`); continue; }
    const reflected = res.body.includes(marker);
    const rawTags = reflected && res.body.includes('<img src=x onerror=alert(1)>');
    details.push(`${p}: ${reflected ? (rawTags ? '原样反射（未编码）' : '反射但已编码') : '未反射'}`);
    if (rawTags) {
      findings.push({
        title: `参数 ${p} 存在反射型 XSS（未编码）`,
        severity: 'high',
        detail: '注入的 <img onerror> 被原样写回响应，浏览器会执行。',
        remediation: '输出编码（HTML entity）；配合 CSP；不要用 innerHTML 拼接用户输入。',
        evidence: res.body.slice(Math.max(0, res.body.indexOf(marker) - 100), res.body.indexOf(marker) + 200),
      });
    }
  }

  return {
    tool: 'verify_xss', target: url, risk: 'active',
    summary: `验证 ${params.length} 个参数（标记 ${marker}）：\n${details.join('\n')}\n命中 ${findings.length} 个反射点。\n` +
      '注：只验证"反射且未编码"，未执行脚本；存储型 XSS 需要人工构造。',
    findings,
    raw: { params, marker, hits: findings.length },
  };
}

/** SSRF 验证：把 /oob 的回调地址投进参数，看回调服务是否收到请求。 */
export async function verifySsrf(target: string, timeoutMs = 10000): Promise<ToolOutput> {
  const url = originOf(target);
  const timeout = Math.min(Math.max(timeoutMs, 1000), 30000);
  const st = oastStatus();
  if (!st.running) throw new Error('SSRF 验证需要带外回调：先 /oob start，再把回调地址投给目标');

  let base: URL;
  try { base = new URL(url); } catch { throw new Error('目标 URL 不合法（需要带参数的 URL）'); }
  const params = [...base.searchParams.keys()];
  if (!params.length) throw new Error('URL 里没有查询参数；SSRF 验证需要形如 /a?url=http://...');

  const cb = `http://127.0.0.1:${st.port}/${st.token}`;
  const before = st.hits;
  const details: string[] = [];
  for (const p of params) {
    await fetchPage(withParam(url, p, cb), timeout).catch(() => null);
    details.push(`${p}: 已投递回调地址`);
  }

  // 给目标一点时间发起回调
  await new Promise((r) => setTimeout(r, 1500));
  const after = oastStatus().hits;

  return {
    tool: 'verify_ssrf', target: url, risk: 'intrusive',
    summary: `向 ${params.length} 个参数投递了回调地址 ${cb}\n收到回调 ${after - before} 次。\n${details.join('\n')}` +
      (after === before ? '\n（没收到回调：可能是不可达、有出网限制，或该参数不构成 SSRF）' : ''),
    findings: after > before
      ? [{
          title: '确认 SSRF：目标主动访问了回调地址',
          severity: 'critical',
          detail: `回调次数 ${after - before}。参数：${params.join(', ')}`,
          remediation: '对 URL 参数做协议/域名白名单；禁止访问内网与元数据地址；出网走统一代理。',
        }]
      : [],
    raw: { params, callback: cb, hitsBefore: before, hitsAfter: after },
  };
}

export const FINDING_STATUSES = ['open', 'verified', 'fixed', 'accepted', 'fp'] as const;
export type FindingStatus = typeof FINDING_STATUSES[number];

/** 发现项状态机：open → verified → fixed / accepted / fp。 */
export async function updateFindingStatus(
  id: string,
  status: string,
  deps: {
    loadFindings: () => Promise<Array<Record<string, unknown>>>;
    saveFindings: (list: Array<Record<string, unknown>>) => Promise<void>;
  },
): Promise<ToolOutput> {
  const fid = String(id || '').trim();
  const s = String(status || 'verified').toLowerCase() as FindingStatus;
  if (!fid) throw new Error('要给发现项 id（/findings 可见）');
  if (!FINDING_STATUSES.includes(s)) throw new Error(`status 必须是：${FINDING_STATUSES.join(' / ')}`);

  const list = await deps.loadFindings();
  const idx = list.findIndex((f) => f.id === fid);
  if (idx < 0) throw new Error(`没找到发现项 ${fid}`);
  const before = String(list[idx].status || 'open');
  const next = list.map((f, i) => (i === idx ? { ...f, status: s, statusAt: Date.now() } : f));
  await deps.saveFindings(next);

  return {
    tool: 'finding_status', target: String(list[idx].target || ''), risk: 'passive',
    summary: `发现项 ${fid}：${before} → ${s}\n${String(list[idx].title || '')}`,
    findings: [{
      title: `状态已更新为 ${s}`, severity: 'info',
      detail: 'verified=人工确认真实；fixed=已修复；accepted=接受风险；fp=误报（不再计入报告）。',
    }],
    raw: { id: fid, from: before, to: s },
  };
}
