/**
 * api 剖面：枚举 / 鉴权矩阵 / IDOR 的确定性测试（2026-10-30）。
 *
 * 纯函数部分直接喂 fixture；网络部分用本机临时服务，验证"到底发了什么请求、
 * 三列鉴权怎么判、凭证有没有泄进结果"。
 */
import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  parseOpenApi, parseHar, fromProxyCaptures, dedupeEndpoints, maskUrl,
} from '../src/plugins/sec-lab-tools/scan/api/sources';
import {
  normalizeCredential, groupKey, siblingUrls, planIdor,
  type MatrixRow,
} from '../src/plugins/sec-lab-tools/scan/api/matrix';
import { runApiProfile } from '../src/plugins/sec-lab-tools/scan/api/engine';
import { maskSensitiveArgs } from '../src/plugins/sec-lab-tools/scan/redact';
import { DEFAULT_LIMITS, type ScanContext } from '../src/plugins/sec-lab-tools/scan/types';

const servers: http.Server[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise<void>((r) => s.close(() => r()));
});

function ctxStub(target: string): ScanContext {
  return {
    jobId: 'sj_test', kind: 'url', target, profile: 'api',
    limits: { ...DEFAULT_LIMITS, maxDurationMs: 30_000 },
    startedAt: Date.now(),
    beginStage() { /* noop */ },
    endStage() { /* noop */ },
    aborted() { return false; },
  };
}

describe('端点枚举 · OpenAPI', () => {
  it('展开 paths、填模板参数、写操作标记不探测', () => {
    const r = parseOpenApi({
      servers: [{ url: '/' }],
      paths: {
        '/api/user/{id}': { get: { summary: 'detail' }, delete: {} },
        '/api/users': { get: {}, post: {} },
      },
    }, 'https://api.example.com');
    expect(r.endpoints).toHaveLength(4);
    const get = r.endpoints.find((e) => e.method === 'GET' && e.url.includes('/api/user/1'));
    expect(get?.probe).toBe(true);
    expect(get?.url).toBe('https://api.example.com/api/user/1');
    for (const m of ['POST', 'DELETE']) {
      const ep = r.endpoints.find((e) => e.method === m);
      expect(ep?.probe, m).toBe(false);
      expect(ep?.reason).toContain('写操作');
    }
  });

  it('servers 指向绝对地址时按它拼', () => {
    const r = parseOpenApi({ servers: [{ url: 'https://gw.example.com/v1' }], paths: { '/ping': { get: {} } } }, 'https://api.example.com');
    expect(r.endpoints[0].url).toBe('https://gw.example.com/v1/ping');
  });
});

describe('端点枚举 · HAR / 代理', () => {
  it('HAR 只收目标 host，跨域条目记跳过', () => {
    const r = parseHar({
      log: {
        entries: [
          { request: { method: 'GET', url: 'https://api.example.com/a' } },
          { request: { method: 'POST', url: 'https://api.example.com/b' } },
          { request: { method: 'GET', url: 'https://cdn.third-party.test/x.js' } },
        ],
      },
    }, 'api.example.com');
    expect(r.endpoints.map((e) => `${e.method} ${e.url}`)).toEqual([
      'GET https://api.example.com/a',
      'POST https://api.example.com/b',
    ]);
    expect(r.skipped.join(' ')).toContain('跨域');
  });

  it('代理记录里 CONNECT 隧道没有可重放 URL，跳过并说明', () => {
    const r = fromProxyCaptures([
      { method: 'CONNECT', url: 'api.example.com:443', host: 'api.example.com' },
      { method: 'GET', url: 'https://api.example.com/health', host: 'api.example.com' },
    ], 'api.example.com');
    expect(r.endpoints).toHaveLength(1);
    expect(r.skipped.join(' ')).toContain('CONNECT');
  });

  it('去重只保留一条，只读排在前面', () => {
    const list = dedupeEndpoints([
      { method: 'POST', url: 'https://a.test/x', source: 'har', probe: false },
      { method: 'GET', url: 'https://a.test/x', source: 'har', probe: true },
      { method: 'GET', url: 'https://a.test/x', source: 'har', probe: true },
    ]);
    expect(list).toHaveLength(2);
    expect(list[0].method).toBe('GET');
  });

  it('展示 URL 对令牌类查询参数打码', () => {
    const masked = maskUrl('https://a.test/cb?access_token=abcd1234&page=2');
    expect(masked).toContain('access_token=***');
    expect(masked).toContain('page=2');
  });
});

describe('鉴权矩阵 · 凭证归一化', () => {
  it('Bearer / Cookie / Name: value 三种抄法都能识别', () => {
    expect(normalizeCredential('Bearer abc.def')).toEqual({ Authorization: 'Bearer abc.def' });
    expect(normalizeCredential('sid=1; uid=2')).toEqual({ Cookie: 'sid=1; uid=2' });
    expect(normalizeCredential('X-API-Key: k-123')).toEqual({ 'X-API-Key': 'k-123' });
    expect(normalizeCredential('')).toBeNull();
  });

  it('凭证参数在审计摘要里按键打码（含嵌套）', () => {
    const masked = maskSensitiveArgs({
      auth: 'Bearer secret-token',
      adminAuth: 'sid=1',
      nested: { cookie: 'a=b', target: 'https://x' },
      target: 'https://x',
      limit: 10,
    });
    const text = JSON.stringify(masked);
    expect(text).not.toContain('secret-token');
    expect(text).not.toContain('sid=1');
    expect(text).not.toContain('a=b');
    expect(masked.target).toBe('https://x');
    expect(masked.limit).toBe(10);
  });
});

describe('IDOR 分组', () => {
  it('数字 / UUID 段替换为 {id}，静态路径不成族', () => {
    expect(groupKey('GET', 'https://a.test/api/user/42').hasId).toBe(true);
    expect(groupKey('GET', 'https://a.test/api/user/42').key)
      .toBe(groupKey('GET', 'https://a.test/api/user/43').key);
    expect(groupKey('GET', 'https://a.test/health').hasId).toBe(false);
  });

  it('没有现成同族时把 ID 换成另一个值', () => {
    expect(siblingUrls('https://a.test/api/user/1')).toEqual([
      'https://a.test/api/user/2', 'https://a.test/api/user/1',
    ]);
  });

  it('已有同族端点时优先横向对比，不再替换', () => {
    const row = (url: string): MatrixRow => ({
      method: 'GET', url, probe: true,
      cells: [{ level: 'anonymous', status: 200, bytes: 10, contentType: 'application/json', conclusion: 'open', tested: true }],
      conclusion: 'anon_open',
    });
    const plans = planIdor([
      row('https://a.test/api/user/1'),
      row('https://a.test/api/user/2'),
      row('https://a.test/api/order/9'),
    ]);
    expect(plans[0]).toMatchObject({ urlA: 'https://a.test/api/user/1', urlB: 'https://a.test/api/user/2' });
    expect(plans.some((p) => p.urlA.includes('/api/order/'))).toBe(true);
  });
});

describe('api 剖面端到端 · 凭证与只读', () => {
  async function authServer(): Promise<{ target: string; seen: Array<{ method: string; url: string }> }> {
    const seen: Array<{ method: string; url: string }> = [];
    const server = http.createServer((req, res) => {
      seen.push({ method: req.method || '', url: req.url || '' });
      const json = (body: unknown, status = 200) => {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(body));
      };
      if (req.url === '/openapi.json') {
        json({ servers: [{ url: '/' }], paths: { '/api/secure': { get: {} } } });
        return;
      }
      if (req.url === '/api/secure') {
        if (req.headers.authorization === 'Bearer good-token') json({ ok: true, data: [1, 2, 3] });
        else json({ error: 'unauthorized' }, 401);
        return;
      }
      json({ ok: true });
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as AddressInfo).port;
    return { target: `http://127.0.0.1:${port}`, seen };
  }

  it('匿名 401 + 普通凭证 200 → normal_readable；凭证不进结果', async () => {
    const { target, seen } = await authServer();
    const res = await runApiProfile(ctxStub(target), { auth: 'Bearer good-token', timeoutMs: 5000 });
    const matrix = (res.raw as { matrix: MatrixRow[] }).matrix;
    const row = matrix.find((r) => r.url.endsWith('/api/secure'));
    expect(row?.cells.find((c) => c.level === 'anonymous')?.status).toBe(401);
    expect(row?.cells.find((c) => c.level === 'normal')?.status).toBe(200);
    expect(row?.cells.find((c) => c.level === 'admin')?.tested).toBe(false);
    expect(row?.conclusion).toBe('normal_readable');
    expect(JSON.stringify(res)).not.toContain('good-token');
    expect(seen.every((s) => s.method === 'GET' || s.method === 'HEAD')).toBe(true);
  }, 30_000);

  it('未提供凭证时两列都是 not_tested', async () => {
    const { target } = await authServer();
    const res = await runApiProfile(ctxStub(target), { timeoutMs: 5000 });
    const matrix = (res.raw as { matrix: MatrixRow[] }).matrix;
    const row = matrix.find((r) => r.url.endsWith('/api/secure'))!;
    expect(row.cells.find((c) => c.level === 'normal')?.tested).toBe(false);
    expect(row.cells.find((c) => c.level === 'admin')?.tested).toBe(false);
    expect(res.summary).toContain('未提供 auth');
  }, 30_000);
});
