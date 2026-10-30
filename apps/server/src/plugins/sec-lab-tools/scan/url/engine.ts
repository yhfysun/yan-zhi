// URL 扫描引擎（P2）：只做编排，不重新实现探测。
//
// ★ 为什么复用：recon / headers / tls / baseline / poc / crawl / dirsearch 已经各自
//   处理了超时、去噪、证据格式；再写一遍必然两边算法漂移。
// ★ 侵入级步骤（SQLi/SSRF/爆破）不在这里自动跑：它们必须走 guard 的交战模式与
//   逐条审批，编排层没有权限替用户点头。
import type { Finding } from '../../../sec-lab-types.js';
import type { ScanContext, ScanFinding, ScanResult, Scanner } from '../types.js';
import { fingerprintOf } from '../types.js';
import { runRecon } from '../../recon.js';
import { runHeadersAudit, runTlsAudit, runBaseline } from '../../baseline.js';
import { runPocScan } from '../../templates.js';
import { runCrawl } from '../../crawler.js';
import { runDirsearch } from '../../websurface.js';

function toScanFindings(items: Finding[], ruleId: string, target: string): ScanFinding[] {
  return items.map((f) => {
    const location = target;
    return {
      ruleId,
      title: f.title,
      severity: f.severity,
      detail: f.detail,
      remediation: f.remediation,
      evidence: f.evidence || f.detail.slice(0, 200),
      location,
      fingerprint: fingerprintOf(ruleId, location, f.title + '|' + (f.evidence || '')),
    };
  });
}

async function step(
  ctx: ScanContext,
  name: string,
  ruleId: string,
  target: string,
  fn: () => Promise<{ findings: Finding[]; summary?: string }>,
  findings: ScanFinding[],
  notes: string[],
): Promise<void> {
  if (ctx.aborted()) return;
  ctx.beginStage(name);
  try {
    const r = await fn();
    findings.push(...toScanFindings(r.findings, ruleId, target));
    notes.push(`${name}：${r.findings.length} 条`);
  } catch (e) {
    notes.push(`${name}：失败（${e instanceof Error ? e.message : String(e)}）`);
  }
  ctx.endStage(name, notes[notes.length - 1]);
}

export function createUrlScanner(): Scanner {
  return {
    id: 'url',
    kinds: ['url'],
    stages: ['目标画像', '基线核查', '内容面探测', '模板 POC', '汇总'],

    async run(ctx: ScanContext): Promise<ScanResult> {
      const target = ctx.target;
      const findings: ScanFinding[] = [];
      const notes: string[] = [];
      const profile = ctx.profile;
      const timeout = Math.min(ctx.limits.maxDurationMs, 15_000);

      await step(ctx, '目标画像', 'recon', target,
        () => runRecon({ target, timeoutMs: timeout, actions: profile === 'quick' ? ['dns', 'tls', 'http'] : ['dns', 'tls', 'http', 'subdomain'] }),
        findings, notes);

      ctx.beginStage('基线核查');
      await step(ctx, '基线核查', 'headers_audit', target, () => runHeadersAudit(target, timeout), findings, notes);
      if (!ctx.aborted()) {
        const host = target.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
        const port = /:\d+$/.test(target.replace(/^https?:\/\//i, '').split('/')[0])
          ? Number(target.replace(/^https?:\/\//i, '').split('/')[0].split(':')[1])
          : (target.startsWith('https://') ? 443 : 80);
        await step(ctx, '基线核查', 'tls_audit', target, () => runTlsAudit(host, port, Math.min(timeout, 8000)), findings, notes);
      }
      await step(ctx, '基线核查', 'baseline', target, () => runBaseline(target, 'owasp', timeout), findings, notes);

      if (profile === 'standard' || profile === 'deep') {
        await step(ctx, '内容面探测', 'crawl', target,
          () => runCrawl({ target, depth: 2, maxPages: profile === 'deep' ? 40 : 20, timeoutMs: timeout }), findings, notes);
        await step(ctx, '内容面探测', 'dirsearch', target,
          () => runDirsearch({ target, concurrency: 6, timeoutMs: timeout }), findings, notes);
      }

      await step(ctx, '模板 POC', 'poc_scan', target,
        () => runPocScan({ target, severities: ['medium', 'high', 'critical'], timeoutMs: timeout }), findings, notes);

      ctx.beginStage('汇总');
      const summary = `URL 扫描（${profile}）：${notes.join('　')}\n` +
        (profile === 'deep'
          ? '★ 注入类验证（SQLi/SSRF）与爆破未自动执行：需交战模式 + 人工逐条批准，请用 /sqli /ssrf 单独发起。'
          : '★ quick/standard 不含侵入级动作；需要更深的验证请切 deep 或单独执行对应命令。');
      ctx.endStage('汇总');

      return { findings, summary, raw: { target, profile, notes } };
    },
  };
}
