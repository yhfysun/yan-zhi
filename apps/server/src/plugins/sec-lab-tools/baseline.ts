// 配置基线与协议审计（sec-lab P3，2026-10-17）—— active 级。
//
// ★ 三件事放一起：`/headers-audit` 与 `/tls-audit` 是 `/baseline` 的两个子集，
//   拆开会让同一套判定抄三遍（"响应头该有哪些"这种口径一旦漂移就很难解释）。
// ★ 只做**可远程核查**的项：等保 2.0 / CIS 里大量条目（审计日志、账号策略、物理安全）
//   远程看不到，这里明确只覆盖映射到 HTTP/TLS 的那部分，不假装"合规通过"。
import tls from 'node:tls';
import { fetchPage } from './crawler.js';
import type { Finding, ToolOutput } from '../sec-lab-types.js';

export type BaselineProfile = 'owasp' | 'cis' | 'djbh' | 'dengbao';

function originOf(target: string): string {
  return /^https?:\/\//i.test(target) ? target.replace(/\/+$/, '') : `http://${target.replace(/\/+$/, '')}`;
}

/** 安全响应头清单（name → 缺失时的说明、级别与修法）。 */
const SEC_HEADERS: Array<{ name: string; severity: Finding['severity']; why: string; fix: string }> = [
  { name: 'strict-transport-security', severity: 'medium', why: '未启用 HSTS，首次明文请求可被降级劫持。', fix: 'Strict-Transport-Security: max-age=31536000; includeSubDomains' },
  { name: 'content-security-policy', severity: 'medium', why: '无 CSP，XSS 一旦成立可直接执行任意脚本。', fix: "Content-Security-Policy: default-src 'self'; script-src 'self'" },
  { name: 'x-frame-options', severity: 'low', why: '未限制被 iframe 嵌入，存在点击劫持面。', fix: 'X-Frame-Options: DENY（或 CSP frame-ancestors）' },
  { name: 'x-content-type-options', severity: 'low', why: '未禁止 MIME 嗅探，上传类接口可能被当成脚本执行。', fix: 'X-Content-Type-Options: nosniff' },
  { name: 'referrer-policy', severity: 'info', why: '未限制 Referer 外泄，URL 中的敏感参数可能被带到第三方。', fix: 'Referrer-Policy: strict-origin-when-cross-origin' },
  { name: 'permissions-policy', severity: 'info', why: '未声明浏览器特性权限（摄像头/麦克风/定位）。', fix: 'Permissions-Policy: geolocation=(), camera=(), microphone=()' },
];

export interface HeaderAuditResult {
  findings: Finding[];
  present: string[];
  missing: string[];
  score: number;
}

/** 纯判定，不发请求 —— 便于被 baseline 复用与单测。 */
export function auditHeaders(headers: Record<string, string | string[] | undefined>, isHttps: boolean): HeaderAuditResult {
  const findings: Finding[] = [];
  const present: string[] = [];
  const missing: string[] = [];
  for (const h of SEC_HEADERS) {
    // HSTS 在纯 HTTP 目标上没有意义，跳过而不是误报
    if (h.name === 'strict-transport-security' && !isHttps) continue;
    const v = headers[h.name];
    if (v === undefined || v === '') {
      missing.push(h.name);
      findings.push({ title: `缺少 ${h.name}`, severity: h.severity, detail: h.why, remediation: h.fix });
    } else {
      present.push(h.name);
      if (h.name === 'strict-transport-security' && /max-age=0\b/i.test(String(v))) {
        findings.push({ title: 'HSTS max-age=0（等于关闭）', severity: 'medium', detail: String(v), remediation: h.fix });
      }
      if (h.name === 'content-security-policy' && /unsafe-inline|unsafe-eval/i.test(String(v))) {
        findings.push({ title: 'CSP 含 unsafe-inline / unsafe-eval', severity: 'low', detail: String(v), remediation: '移除 unsafe-*，改用 nonce 或 hash。' });
      }
    }
  }
  for (const leak of ['server', 'x-powered-by']) {
    const v = headers[leak];
    if (v && /\d+\.\d+/.test(String(v))) {
      findings.push({
        title: `${leak} 暴露版本号`, severity: 'info',
        detail: `${leak}: ${Array.isArray(v) ? v.join(', ') : v}`,
        remediation: '隐藏或改写版本信息（server_tokens off / 移除 X-Powered-By）。',
      });
    }
  }
  const total = present.length + missing.length;
  return { findings, present, missing, score: total ? Math.round((present.length / total) * 100) : 100 };
}

export async function runHeadersAudit(target: string, timeoutMs = 10000): Promise<ToolOutput> {
  const url = originOf(target);
  const res = await fetchPage(url, Math.min(Math.max(timeoutMs, 1000), 20000), 2);
  const r = auditHeaders(res.headers, url.startsWith('https://'));
  return {
    tool: 'headers_audit', target: url, risk: 'active',
    summary: `HTTP ${res.status}　安全头得分 ${r.score}/100\n已具备：${r.present.join(', ') || '（无）'}\n缺失：${r.missing.join(', ') || '（无）'}`,
    findings: r.findings,
    raw: { score: r.score, present: r.present, missing: r.missing, headers: res.headers },
  };
}

/** TLS 握手审计：协议版本 / 套件 / 证书有效期与主体。 */
export function runTlsAudit(host: string, port = 443, timeoutMs = 8000): Promise<ToolOutput> {
  return new Promise((resolve, reject) => {
    const findings: Finding[] = [];
    const socket = tls.connect({
      host, port, servername: host, rejectUnauthorized: false,
      timeout: Math.min(Math.max(timeoutMs, 2000), 15000),
    }, () => {
      const protocol = socket.getProtocol();
      const cipher = socket.getCipher();
      const cert = socket.getPeerCertificate();
      if (protocol !== 'TLSv1.3' && protocol !== 'TLSv1.2') {
        findings.push({
          title: `协议版本过旧：${protocol}`, severity: 'high',
          detail: 'TLS 1.0/1.1 已被主流规范废弃，存在已知协议层弱点。',
          remediation: '只启用 TLS 1.2 / 1.3。',
        });
      }
      if (cipher?.name && /RC4|3DES|DES|NULL|EXPORT|MD5/i.test(cipher.name)) {
        findings.push({
          title: `弱加密套件：${cipher.name}`, severity: 'high',
          detail: `协议 ${cipher.version || protocol}`,
          remediation: '禁用 RC4/3DES/NULL/EXPORT 类套件，优先 AEAD（GCM/CHACHA20）。',
        });
      }
      if (cert && Object.keys(cert).length) {
        const validTo = Date.parse(cert.valid_to);
        const days = Math.floor((validTo - Date.now()) / 86400000);
        if (days < 0) {
          findings.push({ title: '证书已过期', severity: 'critical', detail: cert.valid_to, remediation: '立即更换证书并配置到期告警。' });
        } else if (days <= 30) {
          findings.push({ title: `证书将在 ${days} 天内到期`, severity: 'medium', detail: cert.valid_to, remediation: '配置自动续期（ACME）与到期监控。' });
        }
        if (cert.issuer && cert.subject && cert.issuer.CN === cert.subject.CN) {
          findings.push({ title: '疑似自签名证书', severity: 'medium', detail: `subject=${cert.subject.CN} issuer=${cert.issuer.CN}`, remediation: '使用受信任 CA 签发的证书。' });
        }
      } else {
        findings.push({ title: '未取到对端证书', severity: 'medium', detail: '握手成功但没有证书信息。' });
      }
      socket.end();
      resolve({
        tool: 'tls_audit', target: `${host}:${port}`, risk: 'active',
        summary: `协议 ${protocol}，套件 ${cipher?.name || '?'}（${cipher?.version || '?'}）\n` +
          `证书：${cert?.subject?.CN || '(无)'}　颁发者：${cert?.issuer?.CN || '(无)'}　有效期至：${cert?.valid_to || '(无)'}`,
        findings,
        raw: {
          protocol, cipher, subject: cert?.subject, issuer: cert?.issuer,
          validFrom: cert?.valid_from, validTo: cert?.valid_to,
          san: cert?.subjectaltname,
        },
      });
    });
    socket.on('timeout', () => { socket.destroy(); reject(new Error(`TLS 握手超时（${host}:${port}）`)); });
    socket.on('error', (e) => reject(new Error(`TLS 连接失败：${e.message}`)));
  });
}

const PROFILE_LABEL: Record<string, string> = {
  owasp: 'OWASP（Web 安全基线）',
  cis: 'CIS（HTTP 服务基线）',
  djbh: '等保 2.0（可远程核查子集）',
  dengbao: '等保 2.0（可远程核查子集）',
};

/**
 * 基线核查：响应头 + TLS + Cookie 三组合成一个分数与问题清单。
 * ★ 只覆盖**可远程核查**的子集；账号策略、审计日志等不在其中，
 *   报告里会写明，避免"打了个分就以为合规了"。
 */
export async function runBaseline(target: string, profile = 'owasp', timeoutMs = 10000): Promise<ToolOutput> {
  const url = originOf(target);
  const p = String(profile || 'owasp').toLowerCase();
  const timeout = Math.min(Math.max(timeoutMs, 1000), 20000);
  const findings: Finding[] = [];
  const parts: string[] = [];

  const res = await fetchPage(url, timeout, 2);
  const isHttps = url.startsWith('https://');
  const h = auditHeaders(res.headers, isHttps);
  findings.push(...h.findings);
  parts.push(`安全响应头：${h.score}/100（缺 ${h.missing.length} 项）`);

  const cookieHeader = String(res.headers['set-cookie'] || '');
  const cookieIssues: string[] = [];
  if (cookieHeader) {
    if (!/;\s*secure/i.test(cookieHeader) && isHttps) cookieIssues.push('缺少 Secure');
    if (!/;\s*httponly/i.test(cookieHeader)) cookieIssues.push('缺少 HttpOnly');
    if (!/;\s*samesite/i.test(cookieHeader)) cookieIssues.push('缺少 SameSite');
  }
  if (cookieIssues.length) {
    findings.push({
      title: `Cookie 属性不完整：${cookieIssues.join(' / ')}`,
      severity: 'medium',
      detail: 'Set-Cookie 未设置安全属性，会话 Cookie 可被脚本读取或跨站携带。',
      remediation: '会话 Cookie 设 Secure; HttpOnly; SameSite=Lax（或 Strict）。',
    });
  }
  parts.push(`Cookie：${cookieHeader ? (cookieIssues.length ? cookieIssues.join(' / ') : '属性齐备') : '未下发 Cookie'}`);

  const host = new URL(url).hostname;
  const port = Number(new URL(url).port) || 443;
  try {
    const t = await runTlsAudit(host, port, Math.min(timeout, 8000));
    findings.push(...t.findings);
    parts.push(`TLS ${port}：${t.summary.split('\n')[0]}`);
  } catch (e) {
    parts.push(`TLS ${port}：未检测到（${(e as Error).message}）`);
  }

  const penalty = findings.reduce((acc, f) => acc + ({ critical: 25, high: 15, medium: 8, low: 3, info: 0 } as Record<string, number>)[f.severity], 0);
  const score = Math.max(0, 100 - penalty);

  return {
    tool: 'baseline', target: url, risk: 'active',
    summary: `基线：${PROFILE_LABEL[p] || p}\n得分 ${score}/100，问题 ${findings.length} 条\n${parts.join('\n')}\n` +
      '★ 仅覆盖可远程核查的子集（HTTP 头 / TLS / Cookie）；账号策略、审计日志等需在主机侧评估。',
    findings,
    raw: {
      profile: p, score,
      headerScore: h.score, missingHeaders: h.missing,
      cookieIssues, issues: findings.length,
    },
  };
}
