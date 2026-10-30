// 扫描引擎的最小 HTTP 助手（api 剖面 / 运行时体检共用）。
//
// ★ 为什么不用 webprobe 里的 httpGet：那个只发 GET、不带头、也不暴露字节数；
//   鉴权矩阵必须能逐列换请求头，还要区分 2xx/401/403 与响应体差异。
// ★ 方法白名单在这里兜底：调用方只该传 GET/HEAD/OPTIONS（写操作不探测），
//   传错直接报错，避免哪天有人顺手加个 POST。
import http from 'node:http';
import https from 'node:https';

export type SafeMethod = 'GET' | 'HEAD' | 'OPTIONS';

const SAFE_METHODS = new Set<SafeMethod>(['GET', 'HEAD', 'OPTIONS']);

export interface HttpResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  bytes: number;
  contentType: string;
  error?: string;
}

export interface HttpRequestOptions {
  method?: SafeMethod;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  /** 本机自签证书场景才会用到；外部目标保持默认校验 */
  rejectUnauthorized?: boolean;
}

export function headerValue(res: HttpResponse, name: string): string {
  return res.headers[name.toLowerCase()] || '';
}

export function httpRequest(url: string, opts: HttpRequestOptions = {}): Promise<HttpResponse> {
  const method = (opts.method || 'GET') as SafeMethod;
  if (!SAFE_METHODS.has(method)) {
    return Promise.resolve({
      url, status: 0, headers: {}, body: '', bytes: 0, contentType: '',
      error: `只允许 GET/HEAD/OPTIONS，收到 ${method}`,
    });
  }
  const timeoutMs = Math.max(500, Math.min(opts.timeoutMs ?? 8000, 30_000));
  const maxBytes = Math.max(1024, opts.maxBytes ?? 200_000);

  return new Promise<HttpResponse>((resolve) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      resolve({ url, status: 0, headers: {}, body: '', bytes: 0, contentType: '', error: 'URL 解析失败' });
      return;
    }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      host: u.hostname,
      port: u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80,
      path: u.pathname + u.search,
      method,
      timeout: timeoutMs,
      rejectUnauthorized: opts.rejectUnauthorized ?? true,
      headers: { 'User-Agent': 'yan-zhi-sec-lab/0.1', Accept: '*/*', ...(opts.headers || {}) },
    }, (res) => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) {
        if (typeof v === 'string') headers[k.toLowerCase()] = v;
        else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join('; ');
      }
      const chunks: Buffer[] = [];
      let total = 0;
      res.on('data', (c: Buffer) => {
        total += c.length;
        // HEAD 也可能有 body；超限只记字节数，不再攒内容
        if (total <= maxBytes) chunks.push(c);
      });
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({
          url: u.toString(),
          status: res.statusCode || 0,
          headers,
          body: buf.toString('utf8'),
          bytes: total,
          contentType: headers['content-type'] || '',
        });
      });
    });
    req.on('error', (e: Error) => {
      resolve({ url, status: 0, headers: {}, body: '', bytes: 0, contentType: '', error: e.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ url, status: 0, headers: {}, body: '', bytes: 0, contentType: '', error: '请求超时' });
    });
    req.end();
  });
}
