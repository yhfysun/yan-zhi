// 商店代理下载器单测（P2）：代理规则解析、域名识别、缓存、重定向；不访问真实网络。
const { test, describe } = require('node:test');
const assert = require('node:assert');

const {
  isStoreUrl,
  parseProxyRule,
  normalizeProxy,
  createProxyResolver,
  storeFetch,
  withRetry,
} = require('../proxy-fetch.cjs');

describe('重试', () => {
  test('失败后重试并成功', async () => {
    let calls = 0;
    const value = await withRetry(async () => {
      calls += 1;
      if (calls < 3) throw new Error('reset');
      return 'ok';
    }, { baseDelayMs: 1 });
    assert.strictEqual(value, 'ok');
    assert.strictEqual(calls, 3);
  });

  test('用尽重试后抛最后一个错误', async () => {
    let calls = 0;
    await assert.rejects(
      () => withRetry(async () => { calls += 1; throw new Error('attempt-' + calls); }, { attempts: 2, baseDelayMs: 1 }),
      /attempt-2/,
    );
    assert.strictEqual(calls, 2);
  });
});

describe('代理规则解析', () => {
  test('PROXY / HTTPS 规则', () => {
    assert.deepStrictEqual(parseProxyRule('PROXY 127.0.0.1:7890'), {
      host: '127.0.0.1', port: 7890, auth: null,
    });
    assert.deepStrictEqual(parseProxyRule('HTTPS proxy.local:8080'), {
      host: 'proxy.local', port: 8080, auth: null,
    });
  });

  test('DIRECT / SOCKS / 空值不支持', () => {
    assert.strictEqual(parseProxyRule('DIRECT'), null);
    assert.strictEqual(parseProxyRule('SOCKS5 127.0.0.1:7891'), null);
    assert.strictEqual(parseProxyRule(''), null);
  });

  test('normalizeProxy 补 scheme 与认证', () => {
    assert.deepStrictEqual(normalizeProxy('127.0.0.1:7890'), {
      host: '127.0.0.1', port: 7890, auth: null,
    });
    assert.deepStrictEqual(normalizeProxy('http://u:p@host:8080'), {
      host: 'host', port: 8080, auth: 'u:p',
    });
    assert.strictEqual(normalizeProxy('DIRECT'), null);
  });
});

describe('商店域名识别', () => {
  test('命中商店与 googleusercontent', () => {
    assert.strictEqual(isStoreUrl('https://clients2.google.com/service/update2/crx'), true);
    assert.strictEqual(isStoreUrl('https://update.googleapis.com/service/update2/json'), true);
    assert.strictEqual(isStoreUrl('https://clients2.googleusercontent.com/crx/blobs/x'), true);
    assert.strictEqual(isStoreUrl('https://example.com/'), false);
    assert.strictEqual(isStoreUrl('file:///tmp/x'), false);
  });
});

describe('代理解析缓存', () => {
  test('按 origin 缓存', async () => {
    const prev = process.env.YZ_HTTP_PROXY;
    delete process.env.YZ_HTTP_PROXY;
    try {
      const calls = [];
      const resolve = createProxyResolver(async (url) => {
        calls.push(url);
        return 'PROXY 127.0.0.1:7890';
      });
      const first = await resolve('https://clients2.google.com/a');
      const second = await resolve('https://clients2.google.com/b');
      assert.deepStrictEqual(first, { host: '127.0.0.1', port: 7890, auth: null });
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(second.port, 7890);
    } finally {
      if (prev === undefined) delete process.env.YZ_HTTP_PROXY;
      else process.env.YZ_HTTP_PROXY = prev;
    }
  });
});

describe('重定向处理', () => {
  test('302 后继续请求并返回最终 Response', async () => {
    const calls = [];
    const fallbackFetch = async (url) => {
      calls.push(url);
      if (url.includes('/crx?')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://clients2.googleusercontent.com/final.crx' },
        });
      }
      return new Response(Buffer.from('Cr24-fake'), { status: 200 });
    };
    const res = await storeFetch(
      'https://clients2.google.com/service/update2/crx?x=1',
      {},
      { resolveProxy: async () => null, fallbackFetch },
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(Buffer.from(await res.arrayBuffer()).toString(), 'Cr24-fake');
  });
});
