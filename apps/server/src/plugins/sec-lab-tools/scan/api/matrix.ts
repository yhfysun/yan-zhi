// 鉴权矩阵（api 剖面第二段）与 IDOR 横向对比（第三段）。
//
// ★ 只读探测：矩阵只对 `probe:true`（GET/HEAD）的端点发请求；写端点保留在矩阵里，
//   结论固定 `not_tested_write`，不因为"上游说它存在"就去试。
// ★ 凭证只用于构造请求头：本文件任何返回值都不含凭证原文（矩阵单元格只有状态码/字节数）。
// ★ IDOR 是**疑似**判定：同族端点在同等凭证下都返回 2xx 且内容不同；
//   这只是线索，措辞必须写成"疑似，需人工确认"。
import { httpRequest, type HttpResponse } from '../http.js';
import type { Endpoint } from './sources.js';

export type AuthLevel = 'anonymous' | 'normal' | 'admin';
export const AUTH_LEVELS: AuthLevel[] = ['anonymous', 'normal', 'admin'];

export type CellConclusion = 'open' | 'denied' | 'redirect' | 'other' | 'error';

export interface MatrixCell {
  level: AuthLevel;
  status: number;
  bytes: number;
  contentType: string;
  conclusion: CellConclusion;
  /** 是否测了：未提供凭证的列是 false */
  tested: boolean;
  error?: string;
}

export type RowConclusion =
  | 'anon_open' | 'normal_readable' | 'admin_only' | 'auth_required'
  | 'denied' | 'error' | 'not_tested_write';

export interface MatrixRow {
  method: string;
  url: string;
  /** 实际请求 URL（可能是打码前的原样）；IDOR 复测用它 */
  probeUrl?: string;
  probe: boolean;
  reason?: string;
  cells: MatrixCell[];
  conclusion: RowConclusion;
}

/**
 * 凭证归一化：接受三种常见抄法，统一变成请求头。
 *   `Bearer xxx`  → Authorization: Bearer xxx
 *   `a=b; c=d`    → Cookie: a=b; c=d
 *   `Name: value` → Name: value
 */
export function normalizeCredential(raw: unknown): Record<string, string> | null {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  const headerMatch = /^([A-Za-z][A-Za-z0-9-]{1,40})\s*:\s*(.+)$/.exec(v);
  if (headerMatch) return { [headerMatch[1]]: headerMatch[2].trim() };
  if (/[=;]/.test(v) && !/\s(Bearer|Basic|Token)\s/i.test(v) && !/^Bearer\s/i.test(v)) {
    return { Cookie: v };
  }
  return { Authorization: v };
}

export function classify(status: number): CellConclusion {
  if (!status) return 'error';
  if (status >= 200 && status < 300) return 'open';
  if (status === 401 || status === 403) return 'denied';
  if (status >= 300 && status < 400) return 'redirect';
  return 'other';
}

function cellOf(level: AuthLevel): MatrixCell {
  return { level, status: 0, bytes: 0, contentType: '', conclusion: 'error', tested: false };
}

export interface ProbeOptions {
  timeoutMs: number;
  maxBytes?: number;
  /** level → 请求头；缺哪一档就跳过哪一列 */
  credentials: Partial<Record<Exclude<AuthLevel, 'anonymous'>, Record<string, string>>>;
}

export async function probeRow(ep: Endpoint, opts: ProbeOptions): Promise<MatrixRow> {
  const requestUrl = ep.probeUrl || ep.url;
  if (!ep.probe) {
    return {
      method: ep.method, url: ep.url, probeUrl: requestUrl, probe: false, reason: ep.reason,
      cells: AUTH_LEVELS.map((l) => ({ ...cellOf(l), tested: false })),
      conclusion: 'not_tested_write',
    };
  }
  const rows: MatrixCell[] = [];
  for (const level of AUTH_LEVELS) {
    const headers = level === 'anonymous' ? {} : opts.credentials[level];
    if (level !== 'anonymous' && !headers) {
      rows.push(cellOf(level));
      continue;
    }
    const res: HttpResponse = await httpRequest(requestUrl, {
      method: ep.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      timeoutMs: opts.timeoutMs,
      maxBytes: opts.maxBytes,
    });
    rows.push({
      level,
      status: res.status,
      bytes: res.bytes,
      contentType: res.contentType,
      conclusion: classify(res.status),
      tested: true,
      error: res.error,
    });
  }
  return {
    method: ep.method, url: ep.url, probeUrl: requestUrl, probe: true,
    cells: rows,
    conclusion: rowConclusion(rows),
  };
}

function rowConclusion(cells: MatrixCell[]): RowConclusion {
  const get = (l: AuthLevel) => cells.find((c) => c.level === l);
  const anon = get('anonymous');
  const normal = get('normal');
  const admin = get('admin');
  if (!anon?.tested) return 'error';
  if (anon.conclusion === 'open') return 'anon_open';
  if (anon.conclusion === 'error') return 'error';
  const normalOpen = normal?.tested && normal.conclusion === 'open';
  const adminOpen = admin?.tested && admin.conclusion === 'open';
  if (normalOpen) return 'normal_readable';
  if (adminOpen) return 'admin_only';
  if (anon.conclusion === 'denied') return 'auth_required';
  return 'denied';
}

// ---------- IDOR ----------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 同族判定：把数字/UUID 段替换成 {id}；没有 ID 段的路径不成族 */
export function groupKey(method: string, rawUrl: string): { key: string; hasId: boolean } {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return { key: `${method} ${rawUrl}`, hasId: false }; }
  let hasId = false;
  const segs = u.pathname.split('/').map((s) => {
    if (/^\d{1,12}$/.test(s) || UUID_RE.test(s)) { hasId = true; return '{id}'; }
    return s;
  });
  return { key: `${method} ${u.origin}${segs.join('/')}`, hasId };
}

/** 没有现成同族端点时，把 ID 段换一个值去对比 */
export function siblingUrls(rawUrl: string): string[] {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return []; }
  const segs = u.pathname.split('/');
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (/^\d{1,12}$/.test(s)) {
      const next = s === '1' ? '2' : '1';
      const copy = [...segs];
      copy[i] = next;
      const out = new URL(u.toString());
      out.pathname = copy.join('/');
      return [out.toString(), u.toString()];
    }
    if (UUID_RE.test(s)) {
      const flipped = s.slice(0, -1) + (s.endsWith('0') ? '1' : '0');
      const copy = [...segs];
      copy[i] = flipped;
      const out = new URL(u.toString());
      out.pathname = copy.join('/');
      return [u.toString(), out.toString()];
    }
  }
  return [];
}

export interface IdorCheck {
  level: AuthLevel;
  urlA: string;
  urlB: string;
  statusA: number;
  statusB: number;
  bytesA: number;
  bytesB: number;
  suspect: boolean;
  note: string;
}

function looksLikeData(res: HttpResponse): boolean {
  if (res.status < 200 || res.status >= 300) return false;
  if (res.bytes <= 0) return false;
  if (/html/i.test(res.contentType)) return false;
  const t = res.body.trim();
  if (t.length < 8) return false;
  return t.startsWith('{') || t.startsWith('[');
}

function bodyHash(res: HttpResponse): string {
  // 只用于"内容是否不同"的比较，不进输出
  let h = 0x811c9dc5;
  const s = res.body;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

export interface IdorPlan {
  level: AuthLevel;
  urlA: string;
  urlB: string;
}

/** 先挑现成同族端点，再对单端点做 ID 替换；每对只留一条 */
export function planIdor(rows: MatrixRow[], max = 10): IdorPlan[] {
  const plans: IdorPlan[] = [];
  const seen = new Set<string>();
  const levelOf = (row: MatrixRow): AuthLevel => {
    if (row.conclusion === 'anon_open') return 'anonymous';
    if (row.conclusion === 'normal_readable') return 'normal';
    if (row.conclusion === 'admin_only') return 'admin';
    return 'anonymous';
  };
  const probeRows = rows.filter((r) => r.probe);

  // ① 已有同族端点：同一模板下取前两条
  const groups = new Map<string, MatrixRow[]>();
  for (const r of probeRows) {
    const { key, hasId } = groupKey(r.method, r.url);
    if (!hasId) continue;
    const arr = groups.get(key) || [];
    if (!arr.some((x) => x.url === r.url)) arr.push(r);
    groups.set(key, arr);
  }
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    const [a, b] = arr;
    if (new URL(a.url).pathname === new URL(b.url).pathname) continue;
    const urlA = a.probeUrl || a.url;
    const urlB = b.probeUrl || b.url;
    const key = `${a.method} ${urlA}|${urlB}`;
    if (seen.has(key)) continue;
    seen.add(key);
    plans.push({ level: levelOf(a), urlA, urlB });
  }

  // ② 单端点：替换 ID 段
  for (const r of probeRows) {
    if (plans.length >= max) break;
    const { hasId } = groupKey(r.method, r.url);
    if (!hasId) continue;
    const pair = siblingUrls(r.probeUrl || r.url);
    if (pair.length !== 2) continue;
    const key = `${r.method} ${pair[0]}|${pair[1]}`;
    if (seen.has(key)) continue;
    // 已经有现成同族的模板不再替换（避免同一模板刷出多条）
    const gk = groupKey(r.method, r.url).key;
    if ([...groups.entries()].some(([k, v]) => k === gk && v.length >= 2)) continue;
    seen.add(key);
    plans.push({ level: levelOf(r), urlA: pair[0], urlB: pair[1] });
  }
  return plans.slice(0, max);
}

export async function runIdorChecks(
  plans: IdorPlan[], opts: ProbeOptions,
): Promise<IdorCheck[]> {
  const out: IdorCheck[] = [];
  for (const p of plans) {
    const headers = p.level === 'anonymous' ? {} : opts.credentials[p.level as Exclude<AuthLevel, 'anonymous'>];
    if (p.level !== 'anonymous' && !headers) continue;
    const [a, b] = await Promise.all([
      httpRequest(p.urlA, { headers, timeoutMs: opts.timeoutMs, maxBytes: 60_000 }),
      httpRequest(p.urlB, { headers, timeoutMs: opts.timeoutMs, maxBytes: 60_000 }),
    ]);
    const bothData = looksLikeData(a) && looksLikeData(b);
    const suspect = bothData && bodyHash(a) !== bodyHash(b);
    out.push({
      level: p.level,
      urlA: p.urlA, urlB: p.urlB,
      statusA: a.status, statusB: b.status,
      bytesA: a.bytes, bytesB: b.bytes,
      suspect,
      note: suspect
        ? '同一凭证下两个同族 ID 都返回数据且内容不同'
        : bothData ? '两个 ID 返回相同内容（可能是不区分租户的公共数据）' : '未同时拿到数据响应',
    });
  }
  return out;
}
