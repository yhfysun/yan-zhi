/**
 * URL 扫描引擎测试（P2 + api 剖面，2026-10-30）。
 *
 * ★ 用本机临时 HTTP 服务而不是 mock fetch：
 *   要验证的正是「真的发出了什么请求、方法是什么、响应怎么分类」，
 *   mock 掉网络只会测到夹具。端口用 0 让系统分配，避免与开发环境冲突。
 */
import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createUrlScanner } from '../src/plugins/sec-lab-tools/scan/url/engine';
import { runScan } from '../src/plugins/sec-lab-tools/scan/orchestrator';

const servers: http.Server[] = [];

afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise<void>((r) => s.close(() => r()));
});

interface Recorded { method: string; url: string; origin?: string; auth?: string }

async function startServer(opts: { spec?: boolean; requireAuth?: boolean } = {}): Promise<{ target: string; seen: Recorded[] }> {
  const seen: Recorded[] = [];
  const server = http.createServer((req, res) => {
    seen.push({
      method: req.method || '',
      url: req.url || '',
      origin: req.headers.origin as string | undefined,
      auth: req.headers.authorization as string | undefined,
    });
    const json = (body: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    if (opts.requireAuth && !req.headers.authorization) {
      json({ error: 'unauthorized' }, 401);
      return;
    }
    if (opts.spec && req.url === '/openapi.json') {
      json({
        openapi: '3.0.0',
        servers: [{ url: '/' }],
        paths: {
          '/api/users/{id}': { get: { summary: 'user detail' } },
          '/api/users': { get: {}, post: {} },
        },
      });
      return;
    }
    if (req.url?.startsWith('/api/users')) {
      const id = req.url.split('/').pop();
      json({ id, name: `user-${id}`, role: 'member' });
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<html><body>ok</body></html>');
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  return { target: `http://127.0.0.1:${port}`, seen };
}

describe('URL 扫描 · quick 剖面', () => {
  it('作业完成、阶段收尾、安全头缺失进发现项', async () => {
    const { target } = await startServer();
    const job = await runScan({
      kind: 'url', target, profile: 'quick',
      scanners: [createUrlScanner()],
      limits: { maxDurationMs: 40_000 },
    });
    expect(job.status).toBe('done');
    expect(job.stages.every((s) => s.status === 'done')).toBe(true);
    expect(job.findings.some((f) => f.ruleId === 'headers_audit')).toBe(true);
  }, 60_000);
});

describe('URL 扫描 · api 剖面', () => {
  it('枚举 OpenAPI、出鉴权矩阵、写操作只枚举不探测', async () => {
    const { target, seen } = await startServer({ spec: true });
    const job = await runScan({
      kind: 'url', target, profile: 'api',
      scanners: [createUrlScanner()],
      limits: { maxDurationMs: 40_000 },
    });

    expect(job.status).toBe('done');

    // 写操作一次都不能发
    const methods = new Set(seen.map((s) => s.method));
    expect(methods.has('GET') || methods.has('HEAD')).toBe(true);
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(methods.has(m), m).toBe(false);

    // 匿名可读：/api/users 返回 JSON 且无鉴权
    expect(job.findings.some((f) => f.ruleId === 'api-anon-readable')).toBe(true);
    // 写端点被记录成「未探测」
    expect(job.findings.some((f) => f.ruleId === 'api-write-endpoints')).toBe(true);
  }, 60_000);

  it('同族 ID 可跨值读取时给出疑似 IDOR', async () => {
    const { target } = await startServer({ spec: true });
    const job = await runScan({
      kind: 'url', target, profile: 'api',
      scanners: [createUrlScanner()],
      limits: { maxDurationMs: 40_000 },
    });
    expect(job.findings.some((f) => f.ruleId === 'api-idor-suspect')).toBe(true);
    expect(job.summary).toContain('api 剖面');
  }, 60_000);
});
