// http_request 内置工具 — 通用 HTTP 客户端（API 测试 / 端点探测 / 授权安全评估）
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class HttpRequestTool implements BuiltInTool {
  name = 'http_request';
  description = 'Send a raw HTTP/HTTPS request (like curl): any method, custom headers, request body. Returns status, timing, response headers and body (truncated). Use for API testing, endpoint probing and authorized security assessment. Redirects are followed by default.';

  inputSchema = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Full URL, e.g. "http://192.168.1.10:8080/api/health".' },
      method: { type: 'string', description: 'HTTP method (default GET). GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS.' },
      headers: { type: 'object', description: 'Request headers, e.g. {"Content-Type": "application/json"}.' },
      body: { type: 'string', description: 'Request body (string). For JSON, also set Content-Type header.' },
      timeout: { type: 'number', description: 'Timeout in ms (default 30000, max 120000).' },
      followRedirects: { type: 'boolean', description: 'Follow 3xx redirects (default true).' },
      maxBodyKB: { type: 'number', description: 'Max response body KB to return (default 64, max 1024).' },
    },
    required: ['url'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const url = args.url as string;
    if (!url) return { content: [{ type: 'text', text: 'Error: url is required' }], isError: true };
    if (!/^https?:\/\//i.test(url)) {
      return { content: [{ type: 'text', text: 'Error: url 必须以 http:// 或 https:// 开头（其他协议请用 tcp_send/udp_send）' }], isError: true };
    }
    const method = String(args.method || 'GET').toUpperCase();
    const timeout = Math.min(Math.max(Number(args.timeout) || 30000, 500), 120000);
    const maxBodyKB = Math.min(Math.max(Number(args.maxBodyKB) || 64, 1), 1024);
    const headers = (args.headers && typeof args.headers === 'object' && !Array.isArray(args.headers))
      ? args.headers as Record<string, string> : undefined;
    const body = typeof args.body === 'string' && args.body.length > 0 ? args.body : undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const start = Date.now();
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined && method !== 'GET' && method !== 'HEAD' ? body : undefined,
        signal: controller.signal,
        redirect: args.followRedirects === false ? 'manual' : 'follow',
      });
      const elapsed = Date.now() - start;
      const resHeaders: string[] = [];
      res.headers.forEach((v, k) => resHeaders.push(`  ${k}: ${v}`));

      const text = await res.text();
      const maxChars = maxBodyKB * 1024;
      const truncated = text.length > maxChars;
      const bodyOut = truncated ? `${text.slice(0, maxChars)}\n... [已截断，共 ${text.length} 字符]` : text;

      const parts = [
        `HTTP/1.1 ${res.status} ${res.statusText}`,
        `URL: ${res.url || url}`,
        `耗时: ${elapsed}ms`,
        '',
        'Response Headers:',
        ...(resHeaders.length > 0 ? resHeaders : ['  (无)']),
        '',
        'Body:',
        bodyOut || '(空)',
      ];
      return { content: [{ type: 'text', text: parts.join('\n') }], isError: false };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const hint = msg.includes('abort') || msg.includes('timeout') ? `（超时 ${timeout}ms）` : '';
      return { content: [{ type: 'text', text: `请求失败${hint}: ${msg}` }], isError: true };
    } finally {
      clearTimeout(timer);
    }
  }
}
