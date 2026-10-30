// 本机运行时探测（P4，只读）。
//
// ★ 只打 127.0.0.1 上已发现的自有服务（由 scan_self 的资产判定保证），只发 GET/OPTIONS。
// ★ 为什么重点看 CORS：本机服务默认「本地打开即用」不校验身份，这是产品设计；
//   真正会出事的是**任意网页**能否跨源读到它 —— 也就是 ACAO 回显 + credentials 的组合。
// ★ 不做 CSP 响应头判定：Electron 的 CSP 是主进程 onHeadersReceived 注入的，
//   HTTP 服务本身没有这个头，在这里查只会得到稳定的假阳性（静态审计在 electron.ts）。
import { headerValue, httpRequest } from '../http.js';
import type { ScanFinding } from '../types.js';
import { fingerprintOf } from '../types.js';

export interface RuntimeAuditResult {
  findings: ScanFinding[];
  notes: string[];
  reachable: boolean;
}

const PROBE_ORIGIN = 'https://evil.example';

function finding(
  ruleId: string, title: string, severity: ScanFinding['severity'],
  origin: string, detail: string, remediation: string, evidence: string,
): ScanFinding {
  return {
    ruleId, title, severity,
    detail,
    remediation,
    evidence,
    location: origin,
    fingerprint: fingerprintOf(ruleId, origin, evidence),
  };
}

export async function auditRuntime(origin: string, timeoutMs = 5000): Promise<RuntimeAuditResult> {
  const base = origin.replace(/\/$/, '');
  const findings: ScanFinding[] = [];
  const notes: string[] = [];
  const timeout = Math.max(1000, Math.min(timeoutMs, 8000));

  const health = await httpRequest(`${base}/api/health`, { timeoutMs: timeout, maxBytes: 8_000 });
  if (health.error || !health.status) {
    notes.push(`${base}：/api/health 不可达（${health.error || `HTTP ${health.status}`}），跳过运行时探测`);
    return { findings, notes, reachable: false };
  }
  notes.push(`${base}：/api/health → ${health.status}`);

  // ① 跨源读取：带任意 Origin 请求，看是否回显 + 是否允许带凭证
  const cors = await httpRequest(`${base}/api/health`, {
    timeoutMs: timeout, maxBytes: 8_000, headers: { Origin: PROBE_ORIGIN },
  });
  const acao = headerValue(cors, 'access-control-allow-origin');
  const acac = headerValue(cors, 'access-control-allow-credentials');
  const reflect = acao === PROBE_ORIGIN || acao === '*';
  const withCredentials = reflect && acac.toLowerCase() === 'true';

  // ② 预检：某些服务只在 OPTIONS 上放行
  const preflight = await httpRequest(`${base}/api/health`, {
    method: 'OPTIONS', timeoutMs: timeout, maxBytes: 8_000,
    headers: { Origin: PROBE_ORIGIN, 'Access-Control-Request-Method': 'GET' },
  });
  const preAcao = headerValue(preflight, 'access-control-allow-origin');
  const preAcac = headerValue(preflight, 'access-control-allow-credentials');
  const preReflect = preAcao === PROBE_ORIGIN || preAcao === '*';
  const preWithCredentials = preReflect && preAcac.toLowerCase() === 'true';

  if (withCredentials || preWithCredentials) {
    findings.push(finding(
      'self-runtime-cors-credentials', '本机接口允许任意源跨域读取（含凭证）', 'high', base,
      `带 Origin: ${PROBE_ORIGIN} 请求 ${base}/api/health，响应回显了该源` +
        `${withCredentials ? '（GET）' : ''}${preWithCredentials ? '（OPTIONS 预检）' : ''}且允许 credentials。\n` +
        '任何网页都能在用户浏览器里跨源读取本机服务的数据，配合本地接口无身份校验即可拿到完整 API。',
      'CORS 白名单化：只允许应用自身来源（dev 的 localhost:1420 / 打包后的 file:// / yz://），' +
        '不要回显任意 Origin；跨域 + credentials 同时放开风险最高。',
      `ACAO=${acao || preAcao}; ACAC=${acac || preAcac}`,
    ));
  } else if (reflect || preReflect) {
    findings.push(finding(
      'self-runtime-cors-wildcard', '本机接口 CORS 对任意源放行', 'medium', base,
      `带 Origin: ${PROBE_ORIGIN} 请求 ${base}/api/health，响应回显了该源（未允许 credentials）。\n` +
        '任意网页可跨源发起并读取不带凭证的响应，放大本地服务的暴露面。',
      '改为固定来源白名单；本地服务只给应用自身使用。',
      `ACAO=${acao || preAcao}`,
    ));
  }

  // ③ 本地接口鉴权：拿一个真实数据端点验证匿名可读（本地模式的设计如此，按低危记录）
  const data = await httpRequest(`${base}/api/plugins`, { timeoutMs: timeout, maxBytes: 64_000 });
  if (!data.error && data.status >= 200 && data.status < 300 && /json/i.test(data.contentType)) {
    findings.push(finding(
      'self-runtime-local-api-anonymous', '本地接口匿名可读（本地模式默认）', 'low', base,
      `匿名 GET ${base}/api/plugins 返回 ${data.status}（${data.bytes}B JSON）。\n` +
        '本地单用户模式下这是有意为之；风险在于同一台机器上的其他进程/网页也能读到，' +
        '或部署到局域网/多用户环境时忘记开启授权门禁。',
      '局域网或多用户部署时开启 YZ_LICENSE_GUARD=1；本机使用也应保持 CORS 来源白名单。',
      `GET /api/plugins → ${data.status}`,
    ));
  }

  return { findings, notes, reachable: true };
}
