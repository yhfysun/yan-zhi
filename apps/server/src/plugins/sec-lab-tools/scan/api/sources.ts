// 接口枚举（api 剖面第一段）：OpenAPI / HAR / 代理抓包三路输入。
//
// ★ 输出统一成 Endpoint[]，后面鉴权矩阵与 IDOR 只认这一种形态。
// ★ 写操作永远 `probe:false`：枚举可以列出来给人看，但探测只发 GET/HEAD。
// ★ 只收目标 host 的端点：HAR / 抓包里天然混着第三方 CDN 与统计域名，
//   拿它们去探测等于越过授权范围。
import { httpRequest, type HttpResponse } from '../http.js';

export type EndpointSource = 'openapi' | 'har' | 'proxy';

export interface Endpoint {
  method: string;
  /** 展示用 URL（敏感查询参数已打码） */
  url: string;
  /** 实际请求 URL；缺省同 url。抓包/HAR 的原始 query 里常带令牌，展示面不能原样用它 */
  probeUrl?: string;
  source: EndpointSource;
  /** 是否允许主动探测（只有安全方法为 true） */
  probe: boolean;
  reason?: string;
}

/** 展示面打码：查询参数名命中令牌/口令类关键字时，值替换成 *** */
export function maskUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) {
      if (/token|key|secret|pass|sig|auth|session|cookie/i.test(k)) u.searchParams.set(k, '***');
    }
    u.hash = '';
    return u.toString();
  } catch {
    return raw;
  }
}

export const MAX_ENDPOINTS = 80;
export const SAFE_METHODS = new Set(['GET', 'HEAD']);
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** OpenAPI 常见文档路径：只吃 JSON（不引 YAML 依赖） */
export const SPEC_PATHS = [
  '/openapi.json',
  '/swagger.json',
  '/v3/api-docs',
  '/v2/api-docs',
  '/swagger/v1/swagger.json',
  '/api-docs',
];

function hostOf(url: string): string {
  try { return new URL(url).host.toLowerCase(); } catch { return ''; }
}

function methodOf(raw: unknown): string {
  return String(raw || '').toUpperCase();
}

function makeEndpoint(method: string, url: string, source: EndpointSource): Endpoint | null {
  if (!method || !url) return null;
  if (SAFE_METHODS.has(method)) return { method, url, source, probe: true };
  if (WRITE_METHODS.has(method)) {
    return { method, url, source, probe: false, reason: '写操作默认不探测' };
  }
  return { method, url, source, probe: false, reason: '非只读方法不探测' };
}

/** OpenAPI 的 `{id}` 模板替换成 1：鉴权矩阵需要一个能直接请求的具体 URL */
function fillPathTemplate(p: string): string {
  return p.replace(/\{[^}]{1,40}\}/g, '1');
}

function resolveBase(doc: Record<string, unknown>, origin: string): string {
  const servers = Array.isArray(doc.servers) ? doc.servers : [];
  const first = servers[0] as { url?: unknown } | undefined;
  const raw = typeof first?.url === 'string' ? first.url.trim() : '';
  if (!raw) return origin;
  try {
    return new URL(raw, origin).toString().replace(/\/$/, '');
  } catch {
    return origin;
  }
}

export interface EnumerationResult {
  endpoints: Endpoint[];
  /** 输入里被跳过的条目（跨 host / 解析失败），用于在结果里如实说明 */
  skipped: string[];
}

export function parseOpenApi(doc: unknown, origin: string): EnumerationResult {
  const skipped: string[] = [];
  const endpoints: Endpoint[] = [];
  if (!doc || typeof doc !== 'object') return { endpoints, skipped: ['OpenAPI 文档不是对象'] };
  const d = doc as Record<string, unknown>;
  const paths = d.paths;
  if (!paths || typeof paths !== 'object') return { endpoints, skipped: ['OpenAPI 文档缺少 paths'] };
  const base = resolveBase(d, origin);
  for (const [rawPath, item] of Object.entries(paths as Record<string, unknown>)) {
    if (!item || typeof item !== 'object') continue;
    const methods = Object.keys(item as Record<string, unknown>)
      .filter((k) => ['get', 'head', 'post', 'put', 'patch', 'delete', 'options'].includes(k.toLowerCase()));
    if (!methods.length) continue;
    let url: string;
    try {
      const b = new URL(base);
      // servers.url 可能带路径前缀（https://gw/v1）：OpenAPI 的 paths 是相对它的，
      // 直接 new URL('/ping', base) 会把 /v1 丢掉，必须手工拼接。
      const prefix = b.pathname.replace(/\/$/, '');
      url = new URL(prefix + fillPathTemplate(rawPath), b.origin).toString();
    } catch {
      skipped.push(`路径无法解析：${rawPath}`);
      continue;
    }
    for (const m of methods) {
      const ep = makeEndpoint(methodOf(m), url, 'openapi');
      if (ep) endpoints.push(ep);
    }
  }
  return { endpoints, skipped };
}

export function parseHar(doc: unknown, host: string): EnumerationResult {
  const skipped: string[] = [];
  const endpoints: Endpoint[] = [];
  const entries = (doc as { log?: { entries?: unknown } })?.log?.entries;
  if (!Array.isArray(entries)) return { endpoints, skipped: ['HAR 缺少 log.entries'] };
  const want = host.toLowerCase();
  for (const e of entries) {
    const req = (e as { request?: { method?: unknown; url?: unknown } })?.request;
    const url = typeof req?.url === 'string' ? req.url : '';
    if (!url) continue;
    if (hostOf(url) !== want) { skipped.push(`跨域条目已跳过：${hostOf(url) || url}`); continue; }
    const ep = makeEndpoint(methodOf(req?.method), url, 'har');
    if (ep) endpoints.push(ep);
  }
  return { endpoints, skipped: [...new Set(skipped)] };
}

export interface ProxyCaptureLike {
  method?: string;
  url?: string;
  host?: string;
}

export function fromProxyCaptures(captures: ProxyCaptureLike[], host: string): EnumerationResult {
  const endpoints: Endpoint[] = [];
  const skipped: string[] = [];
  const want = host.toLowerCase();
  for (const c of captures) {
    const url = String(c.url || '');
    if (!/^https?:\/\//i.test(url)) { skipped.push('CONNECT/隧道记录没有可重放的明文 URL'); continue; }
    if (hostOf(url) !== want) continue;
    const ep = makeEndpoint(methodOf(c.method), url, 'proxy');
    if (ep) endpoints.push(ep);
  }
  return { endpoints, skipped: [...new Set(skipped)] };
}

/** 去重（method+url），只读在前，保留输入顺序 */
export function dedupeEndpoints(list: Endpoint[]): Endpoint[] {
  const seen = new Set<string>();
  const out: Endpoint[] = [];
  for (const ep of list) {
    const key = `${ep.method} ${ep.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ep);
  }
  const rank = (e: Endpoint) => (e.probe ? 0 : 1);
  return out
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i)
    .map((x) => x.e);
}

export function capEndpoints(list: Endpoint[], max = MAX_ENDPOINTS): { endpoints: Endpoint[]; truncated: number } {
  if (list.length <= max) return { endpoints: list, truncated: 0 };
  return { endpoints: list.slice(0, max), truncated: list.length - max };
}

export interface SpecDiscovery {
  endpoints: Endpoint[];
  found: string[];
  notes: string[];
}

/** 在目标 origin 上找 OpenAPI 文档（只读 GET） */
export async function discoverSpecs(origin: string, timeoutMs: number): Promise<SpecDiscovery> {
  const endpoints: Endpoint[] = [];
  const found: string[] = [];
  const notes: string[] = [];
  const base = origin.replace(/\/$/, '');
  for (const p of SPEC_PATHS) {
    const res: HttpResponse = await httpRequest(`${base}${p}`, { timeoutMs: Math.min(timeoutMs, 5000), maxBytes: 3_000_000 });
    if (res.error || res.status !== 200) continue;
    let doc: unknown;
    try { doc = JSON.parse(res.body); } catch { continue; }
    const parsed = parseOpenApi(doc, base);
    if (!parsed.endpoints.length) continue;
    found.push(p);
    endpoints.push(...parsed.endpoints);
    notes.push(`${p}：${parsed.endpoints.length} 个端点`);
  }
  return { endpoints, found, notes };
}

export function hostnameOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}
