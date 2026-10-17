// 弱口令自查（sec-lab P3，2026-10-17）—— intrusive 级，需交战模式。
//
// ★★ 范围刻意收得很窄：**只做 HTTP Basic 认证**。
//   - SSH / FTP / 表单登录的爆破牵涉协议实现、账户锁定与会话副作用，
//     自研一份既不可靠也容易误伤；这些请走 B 轨 `/toolchain`（装了 hydra 才有）。
//   - 内置凭据只有 8 组**公开的默认口令**（admin/admin 这类），目的是"确认默认口令没改"，
//     不是密码破解。真正的字典攻击不属于本工具的定位。
// ★ 速率：每次尝试之间 800ms，最多 8 次 —— 不制造并发压力，也不触发常见锁定阈值。
// ★ 命中即停：拿到一组有效凭据就收手，不做"验证更多组合"。
import http from 'node:http';
import https from 'node:https';
import type { Finding, ToolOutput } from '../sec-lab-types.js';

/** 公开的默认口令组合（不是字典）。 */
export const DEFAULT_CREDS: Array<[string, string]> = [
  ['admin', 'admin'], ['admin', 'password'], ['admin', '123456'], ['admin', 'admin123'],
  ['test', 'test'], ['guest', 'guest'], ['root', 'root'], ['user', 'user'],
];

const ATTEMPT_DELAY_MS = 800;

function tryBasic(url: string, user: string, pass: string, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    let u: URL;
    try { u = new URL(url); } catch { resolve(null); return; }
    const mod = u.protocol === 'https:' ? https : http;
    const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
    const req = mod.get(u, { timeout: timeoutMs, headers: { authorization: auth, 'user-agent': 'yan-zhi-sec-lab/1.0' } }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

export interface BruteParams {
  protocol: 'http' | 'ssh' | 'ftp';
  target: string;
  timeoutMs?: number;
}

export async function runBrute(p: BruteParams): Promise<ToolOutput> {
  const proto = String(p.protocol || 'http').toLowerCase();
  if (proto !== 'http') {
    throw new Error(
      '本工具只做 HTTP Basic 认证的默认口令自查（8 组公开组合）。\n' +
      `${proto} 的弱口令验证请走 B 轨：先 /toolchain detect 确认装了 hydra，` +
      '再用 /toolchain run（该类工具属侵入级，需交战模式）。',
    );
  }
  const target = String(p.target || '').trim();
  if (!target) throw new Error('要给目标 URL，例如 /brute http https://staging.example.com/admin');
  const url = /^https?:\/\//i.test(target) ? target : `http://${target}`;
  const timeoutMs = Math.min(Math.max(p.timeoutMs ?? 6000, 1000), 20000);

  const attempts: string[] = [];
  let hit: { user: string; pass: string; status: number } | null = null;

  for (const [user, pass] of DEFAULT_CREDS) {
    const status = await tryBasic(url, user, pass, timeoutMs);
    attempts.push(`${user}:${pass} → ${status === null ? '连接失败' : status}`);
    // 401 = 未通过；其余状态视为认证通过（403 说明账号有效但无权限，仍算命中）
    if (status !== null && status !== 401) {
      hit = { user, pass, status };
      break;
    }
    await new Promise((r) => setTimeout(r, ATTEMPT_DELAY_MS));
  }

  const findings: Finding[] = [];
  if (hit) {
    findings.push({
      title: `默认口令可用：${hit.user}:${hit.pass}`, severity: 'critical',
      detail: `HTTP ${hit.status}。该凭据来自公开默认口令清单（不是字典爆破）—— 说明默认密码没有改过。`,
      remediation: '立即修改默认口令；启用多因素；对管理面加 IP 白名单。',
    });
  } else {
    findings.push({
      title: '默认口令未命中', severity: 'info',
      detail: '8 组公开默认口令都不能登录。这不等于"没有弱口令"——真正的字典攻击不在本工具范围。',
    });
  }

  return {
    tool: 'brute', target: url, risk: 'intrusive',
    summary: `HTTP Basic 默认口令自查（${DEFAULT_CREDS.length} 组，间隔 ${ATTEMPT_DELAY_MS}ms）：\n${attempts.join('\n')}\n` +
      (hit ? `★ 命中：${hit.user}:${hit.pass}` : '未命中。'),
    findings,
    raw: { attempts, hit },
  };
}
