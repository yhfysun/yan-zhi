// api 剖面编排：枚举 → 鉴权矩阵 → IDOR 横向对比。
//
// ★ 输入优先级：`--input`（OpenAPI/HAR 文件）> 代理内存抓包 + 目标上的 OpenAPI 文档。
// ★ 只打目标 host：HAR/抓包里混着第三方域名，越界探测等于超出授权范围。
// ★ 凭证只用于发请求；结果里的 URL 一律经 maskUrl 打码，矩阵只留状态码与字节数。
import { promises as fs } from 'node:fs';
import type { ScanContext, ScanFinding, ScanResult } from '../types.js';
import { fingerprintOf } from '../types.js';
import {
  capEndpoints, dedupeEndpoints, discoverSpecs, fromProxyCaptures, hostnameOf,
  maskUrl, parseHar, parseOpenApi, type Endpoint,
} from './sources.js';
import {
  normalizeCredential, planIdor, probeRow, runIdorChecks,
  type AuthLevel, type IdorCheck, type MatrixRow,
} from './matrix.js';
import { listProxyCaptures } from '../../proxy.js';

export interface ApiScanOptions {
  auth?: string;
  adminAuth?: string;
  /** OpenAPI / HAR 文件路径 */
  input?: string;
  timeoutMs: number;
  maxEndpoints?: number;
}

const CONCLUSION_LABEL: Record<string, string> = {
  anon_open: '匿名可读',
  normal_readable: '需鉴权（普通可读）',
  admin_only: '仅管理员可读',
  auth_required: '需鉴权',
  denied: '拒绝',
  error: '请求失败',
  not_tested_write: '写操作未探测',
};

const LEVEL_LABEL: Record<AuthLevel, string> = { anonymous: '匿名', normal: '普通', admin: '管理员' };

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function enumerate(ctx: ScanContext, opts: ApiScanOptions): Promise<{
  endpoints: Endpoint[]; notes: string[]; skipped: string[]; truncated: number;
}> {
  const origin = new URL(ctx.target).origin;
  const hostname = new URL(ctx.target).hostname.toLowerCase();
  const notes: string[] = [];
  const skipped: string[] = [];
  const collected: Endpoint[] = [];

  if (opts.input) {
    const raw = await fs.readFile(opts.input, 'utf8').catch((e: Error) => {
      throw new Error(`读取输入文档失败（${opts.input}）：${e.message}`);
    });
    let doc: unknown;
    try { doc = JSON.parse(raw); } catch { throw new Error(`输入文档不是 JSON：${opts.input}`); }
    const isHar = Array.isArray((doc as { log?: { entries?: unknown } })?.log?.entries);
    const r = isHar ? parseHar(doc, new URL(ctx.target).host) : parseOpenApi(doc, origin);
    collected.push(...r.endpoints);
    skipped.push(...r.skipped);
    notes.push(`输入文档：${isHar ? 'HAR' : 'OpenAPI'}（${opts.input}）`);
  } else {
    const caps = fromProxyCaptures(listProxyCaptures(), new URL(ctx.target).host);
    if (caps.endpoints.length) {
      collected.push(...caps.endpoints);
      notes.push(`代理抓包：${caps.endpoints.length} 个端点`);
    }
    const specs = await discoverSpecs(origin, opts.timeoutMs);
    collected.push(...specs.endpoints);
    if (specs.found.length) notes.push(`OpenAPI 文档：${specs.found.join('、')}`);
    else notes.push('未发现可读的 OpenAPI 文档；可用 --input 指定 HAR / OpenAPI 文件');
  }

  // 越界过滤 + 展示打码
  const own = collected.filter((e) => hostnameOf(e.probeUrl || e.url) === hostname);
  const dropped = collected.length - own.length;
  if (dropped) skipped.push(`跨 host 端点已跳过：${dropped} 个`);

  const deduped = dedupeEndpoints(own).map((e) => ({ ...e, probeUrl: e.probeUrl || e.url, url: maskUrl(e.url) }));
  const capped = capEndpoints(deduped, opts.maxEndpoints);
  if (capped.truncated) notes.push(`端点超过上限，已截断 ${capped.truncated} 个`);
  return { endpoints: capped.endpoints, notes, skipped: [...new Set(skipped)], truncated: capped.truncated };
}

export async function runApiProfile(ctx: ScanContext, opts: ApiScanOptions): Promise<ScanResult> {
  const timeout = Math.max(1000, Math.min(opts.timeoutMs, 10_000));
  const findings: ScanFinding[] = [];
  const notes: string[] = [];
  const skipped: string[] = [];

  ctx.beginStage('接口枚举');
  const enumed = await enumerate(ctx, opts);
  notes.push(...enumed.notes);
  skipped.push(...enumed.skipped);
  ctx.endStage('接口枚举', enumed.endpoints.length ? `${enumed.endpoints.length} 个端点` : '没有可用端点');

  const credentials: Partial<Record<Exclude<AuthLevel, 'anonymous'>, Record<string, string>>> = {};
  const normalAuth = normalizeCredential(opts.auth);
  const adminAuth = normalizeCredential(opts.adminAuth);
  if (normalAuth) credentials.normal = normalAuth;
  if (adminAuth) credentials.admin = adminAuth;

  let rows: MatrixRow[] = [];
  if (enumed.endpoints.length) {
    ctx.beginStage('鉴权矩阵');
    rows = await mapPool(enumed.endpoints, 4, (ep) => probeRow(ep, { timeoutMs: timeout, credentials }));
    const anon = rows.filter((r) => r.conclusion === 'anon_open').length;
    ctx.endStage('鉴权矩阵', `匿名可读 ${anon} / ${rows.length}`);
  } else {
    ctx.beginStage('鉴权矩阵');
    ctx.endStage('鉴权矩阵', '没有端点可测');
  }

  // 匿名可读：只把「返回 JSON 数据」的算发现；200 + HTML 多半是登录页
  for (const r of rows) {
    const cell = r.cells.find((c) => c.level === 'anonymous');
    if (!cell?.tested || cell.conclusion !== 'open') continue;
    if (/html/i.test(cell.contentType) || cell.bytes <= 0) continue;
    findings.push({
      ruleId: 'api-anon-readable',
      title: '接口未鉴权即可读取',
      severity: 'high',
      detail: `匿名请求 ${r.method} ${r.url} 返回 ${cell.status}（${cell.bytes}B，${cell.contentType || '未知类型'}）。\n` +
        '未携带任何凭证就拿到了数据：确认该端点本应公开，否则补齐鉴权。',
      remediation: '为接口补鉴权中间件；确实公开的端点加白名单并在文档里注明。',
      evidence: `${r.method} ${r.url} → ${cell.status} ${cell.contentType}`,
      location: r.url,
      fingerprint: fingerprintOf('api-anon-readable', r.url, `${r.method}|${cell.status}`),
    });
  }

  let idor: IdorCheck[] = [];
  if (rows.length) {
    ctx.beginStage('IDOR 横向对比');
    const plans = planIdor(rows, 10);
    idor = await runIdorChecks(plans, { timeoutMs: timeout, credentials });
    ctx.endStage('IDOR 横向对比', plans.length ? `对比 ${plans.length} 组，疑似 ${idor.filter((x) => x.suspect).length} 组` : '没有可对比的同族端点');
  } else {
    ctx.beginStage('IDOR 横向对比');
    ctx.endStage('IDOR 横向对比', '没有端点可对比');
  }

  for (const x of idor) {
    if (!x.suspect) continue;
    findings.push({
      ruleId: 'api-idor-suspect',
      title: '疑似 IDOR：同族对象可跨 ID 读取',
      severity: 'medium',
      detail: `以${LEVEL_LABEL[x.level]}凭证请求 ${x.urlA}（${x.statusA}，${x.bytesA}B）与 ${x.urlB}（${x.statusB}，${x.bytesB}B），` +
        '两者都返回数据且内容不同。\n这是**疑似**判定：可能是公开数据或同一租户的正常差异，需人工确认对象归属校验。',
      remediation: '在服务端逐个对象校验归属（当前用户/租户），不要只依赖 ID 不可枚举。',
      evidence: `${x.urlA} vs ${x.urlB}：${x.note}`,
      location: x.urlA,
      fingerprint: fingerprintOf('api-idor-suspect', x.urlA, x.urlB),
    });
  }

  const writes = rows.filter((r) => !r.probe);
  if (writes.length) {
    findings.push({
      ruleId: 'api-write-endpoints',
      title: '写操作端点未探测',
      severity: 'info',
      detail: `枚举到 ${writes.length} 个写操作端点（POST/PUT/PATCH/DELETE），按只读原则未发送任何写请求。\n` +
        writes.slice(0, 12).map((r) => `- ${r.method} ${r.url}`).join('\n') +
        (writes.length > 12 ? `\n- …其余 ${writes.length - 12} 个` : ''),
      remediation: '写操作鉴权需在授权窗口内人工逐条确认后再测（或由业务方提供测试租户）。',
      evidence: `${writes.length} 个写端点未探测`,
      location: ctx.target,
      fingerprint: fingerprintOf('api-write-endpoints', ctx.target, String(writes.length)),
    });
  }

  ctx.beginStage('汇总');
  const table = rows.slice(0, 40).map((r) => {
    const cellText = (l: AuthLevel) => {
      const c = r.cells.find((x) => x.level === l);
      if (!c?.tested) return '—';
      return c.status ? String(c.status) : 'ERR';
    };
    return `${r.method.padEnd(6)} ${r.url}  匿名=${cellText('anonymous')} 普通=${cellText('normal')} 管理员=${cellText('admin')}  ${CONCLUSION_LABEL[r.conclusion] || r.conclusion}`;
  });
  const credNote = !normalAuth && !adminAuth
    ? '未提供 auth / adminAuth：矩阵只有匿名列，普通与管理员列记为「—」。'
    : `凭证列：普通=${normalAuth ? '已提供' : '未提供'}，管理员=${adminAuth ? '已提供' : '未提供'}（凭证不落盘、不回显）。`;
  const summary = [
    `api 剖面：${rows.length} 个端点；匿名可读 ${rows.filter((r) => r.conclusion === 'anon_open').length}，` +
      `需鉴权 ${rows.filter((r) => r.conclusion === 'auth_required' || r.conclusion === 'normal_readable' || r.conclusion === 'admin_only').length}，` +
      `写操作未探测 ${writes.length}。`,
    credNote,
    notes.length ? `来源：${notes.join('；')}` : '',
    skipped.length ? `跳过：${skipped.join('；')}` : '',
    '',
    '方法   端点  鉴权矩阵  结论',
    ...table,
    table.length < rows.length ? `…其余 ${rows.length - table.length} 个端点见结构化数据` : '',
  ].filter(Boolean).join('\n');
  ctx.endStage('汇总');

  return {
    findings,
    summary,
    raw: {
      origin: new URL(ctx.target).origin,
      notes,
      skipped,
      credentials: { normal: !!normalAuth, admin: !!adminAuth },
      endpoints: rows.map((r) => ({ method: r.method, url: r.url, probe: r.probe, conclusion: r.conclusion })),
      matrix: rows,
      idor,
    },
  };
}
