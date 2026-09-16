/**
 * 媒体字节下载（media-fetch service）单测。
 *
 * 背景：agnes 产物 CDN（platform-outputs.agnes-ai.space）在部分网络下直连超时，
 * 而 Node 的 fetch 不走系统代理 —— 结果是「图能显示（渲染层走代理）但落不到本地盘」，
 * 交付目录永远空着。本模块按「直连 → 失败转本机代理隧道」的顺序拿字节。
 *
 * 这里钉死四条行为：
 *   1. 直连成功时**完全不碰代理**（不探测端口、不建隧道）—— 可直连的网络零开销
 *   2. 直连失败 → 解析代理候选链 → 经隧道取回，并把可用代理提到候选首位（下次直接用）
 *   3. 无可用代理时给出可操作的错误（提示配 HTTPS_PROXY），而不是抛底层 fetch 异常
 *   4. 非法/空地址立即报错，不做无谓的网络尝试
 * 另覆盖代理 URL 解析口径。
 *
 * 网络交互全部 mock（fetch / https.request / net.connect），不发真实请求。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import https from 'node:https';

const MEDIA_BYTES = Buffer.from('fake-media-payload');

vi.mock('node:net', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:net')>();
  return { ...actual, default: { ...actual, connect: vi.fn() }, connect: vi.fn() };
});
vi.mock('node:https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:https')>();
  return { ...actual, default: { ...actual, request: vi.fn() }, request: vi.fn() };
});

const realFetch = globalThis.fetch;

/** net.connect：所有端口立即失败（未监听），模拟「没有本机代理」 */
function netNoPortsOpen() {
  (net.connect as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
    const h: Record<string, any> = {};
    const sock: any = {
      once: (ev: string, fn: any) => { h[ev] = fn; return sock; },
      on: (ev: string, fn: any) => { h[ev] = fn; return sock; },
      setTimeout: (_ms: number, fn: any) => { queueMicrotask(() => fn()); return sock; },
      destroy: () => {},
      write: () => {},
      removeListener: () => {},
    };
    queueMicrotask(() => h.error?.(new Error('ECONNREFUSED')));
    return sock;
  });
}

/** https.request：直接回 200 + MEDIA_BYTES（隧道细节不参与，只验证决策链） */
function httpsReturnsBytes(bytes = MEDIA_BYTES) {
  (https.request as unknown as ReturnType<typeof vi.fn>).mockImplementation((_opts: any, cb: any) => {
    const listeners: Record<string, any[]> = {};
    const res: any = {
      statusCode: 200,
      resume: () => {},
      on: (ev: string, fn: any) => { (listeners[ev] ||= []).push(fn); return res; },
    };
    setImmediate(() => {
      cb(res);
      setImmediate(() => {
        (listeners.data || []).forEach((fn) => fn(bytes));
        (listeners.end || []).forEach((fn) => fn());
      });
    });
    const req: any = { on: () => req, setTimeout: () => req, end: () => req, destroy: () => {} };
    return req;
  });
}

function clearProxyEnv() {
  for (const k of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) {
    delete process.env[k];
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  clearProxyEnv();
  netNoPortsOpen();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  clearProxyEnv();
  vi.restoreAllMocks();
});

describe('media-fetch · 代理 URL 解析', () => {
  it('带 scheme 的写法解析出 host/port', async () => {
    const { parseProxyUrl } = await import('../src/services/media-fetch.js');
    expect(parseProxyUrl('http://127.0.0.1:7890')).toEqual({ host: '127.0.0.1', port: 7890 });
  });

  it('不带 scheme 的 host:port 也能解析（用户手写配置常见）', async () => {
    const { parseProxyUrl } = await import('../src/services/media-fetch.js');
    expect(parseProxyUrl('127.0.0.1:7890')).toEqual({ host: '127.0.0.1', port: 7890 });
  });

  it('缺省端口按协议补齐（https → 443，http → 80）', async () => {
    const { parseProxyUrl } = await import('../src/services/media-fetch.js');
    expect(parseProxyUrl('http://proxy.local')?.port).toBe(80);
    expect(parseProxyUrl('https://proxy.local')?.port).toBe(443);
  });

  it('空值与非法值返回 null，不抛错', async () => {
    const { parseProxyUrl } = await import('../src/services/media-fetch.js');
    expect(parseProxyUrl(undefined)).toBeNull();
    expect(parseProxyUrl('')).toBeNull();
    expect(parseProxyUrl('   ')).toBeNull();
  });
});

describe('media-fetch · 下载决策链', () => {
  it('直连成功：不探测代理端口、不建隧道', async () => {
    const { downloadMediaBinary } = await import('../src/services/media-fetch.js');
    globalThis.fetch = vi.fn(async () => new Response(MEDIA_BYTES, { status: 200 })) as any;

    const buf = await downloadMediaBinary('https://cdn.example.com/a.png', 5000);
    expect(buf.toString()).toBe(MEDIA_BYTES.toString());
    expect(net.connect).not.toHaveBeenCalled();
    expect(https.request).not.toHaveBeenCalled();
  });

  it('直连 HTTP 非 2xx 视为失败 → 转代理', async () => {
    process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
    httpsReturnsBytes();
    const { downloadMediaBinary } = await import('../src/services/media-fetch.js');
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 502 })) as any;

    const buf = await downloadMediaBinary('https://cdn.example.com/a.png', 5000);
    expect(buf.toString()).toBe(MEDIA_BYTES.toString());
    expect(https.request).toHaveBeenCalledTimes(1);
  });

  it('直连抛错 → 经代理隧道取回', async () => {
    process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
    httpsReturnsBytes();
    const { downloadMediaBinary } = await import('../src/services/media-fetch.js');
    globalThis.fetch = vi.fn(async () => { throw new Error('The operation was aborted due to timeout'); }) as any;

    const buf = await downloadMediaBinary('https://platform-outputs.agnes-ai.space/x.png', 5000);
    expect(buf.toString()).toBe(MEDIA_BYTES.toString());
  });

  it('同一 host 直连失败一次后，第二次跳过直连（不再白等超时）', async () => {
    process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
    httpsReturnsBytes();
    const { downloadMediaBinary } = await import('../src/services/media-fetch.js');
    const fetchMock = vi.fn(async () => { throw new Error('timeout'); });
    globalThis.fetch = fetchMock as any;
    const url = 'https://platform-outputs.agnes-ai.space/x.png';

    await downloadMediaBinary(url, 5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await downloadMediaBinary(url, 5000);
    // 第二次调用不再尝试直连
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('直连冷却带 TTL：过期后重新尝试直连（网络恢复能自动回到最快路径）', async () => {
    process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
    httpsReturnsBytes();
    // 冻结/推进时间，模拟 10 分钟 TTL 到期
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { downloadMediaBinary } = await import('../src/services/media-fetch.js');
      let fail = true;
      const fetchMock = vi.fn(async () => {
        if (fail) throw new Error('timeout');
        return new Response(MEDIA_BYTES, { status: 200 });
      });
      globalThis.fetch = fetchMock as any;
      const url = 'https://platform-outputs.agnes-ai.space/x.png';

      await downloadMediaBinary(url, 5000);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // 冷却期内：不试直连
      await downloadMediaBinary(url, 5000);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // 网络恢复 + TTL 到期 → 应重新尝试直连并成功
      fail = false;
      vi.advanceTimersByTime(11 * 60 * 1000);
      const buf = await downloadMediaBinary(url, 5000);
      expect(buf.toString()).toBe(MEDIA_BYTES.toString());
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('无可用代理：报错提示配 HTTPS_PROXY（而非抛底层 fetch 异常）', async () => {
    const { downloadMediaBinary } = await import('../src/services/media-fetch.js');
    globalThis.fetch = vi.fn(async () => { throw new Error('timeout'); }) as any;

    await expect(downloadMediaBinary('https://cdn.example.com/a.png', 3000))
      .rejects.toThrow(/HTTPS_PROXY/);
  });

  it('代理候选链：环境变量代理排在本机探测到的端口之前', async () => {
    process.env.HTTPS_PROXY = 'http://10.0.0.9:8888';
    // 让本机 7890 探测为「在听」
    (net.connect as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const h: Record<string, any> = {};
      const sock: any = {
        once: (ev: string, fn: any) => { h[ev] = fn; return sock; },
        on: (ev: string, fn: any) => { h[ev] = fn; return sock; },
        setTimeout: () => sock,
        destroy: () => {},
        write: () => {},
        removeListener: () => {},
      };
      queueMicrotask(() => h.connect?.());
      return sock;
    });

    const { resolveMediaProxyCandidates } = await import('../src/services/media-fetch.js');
    const cands = await resolveMediaProxyCandidates();
    expect(cands[0]).toEqual({ host: '10.0.0.9', port: 8888 });
    expect(cands.some((c) => c.port === 7890)).toBe(true);
  });

  it('空地址 / 空白地址立即报错，不发网络请求', async () => {
    const { downloadMediaBinary } = await import('../src/services/media-fetch.js');
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;

    await expect(downloadMediaBinary('', 1000)).rejects.toThrow('媒体地址为空');
    await expect(downloadMediaBinary('   ', 1000)).rejects.toThrow('媒体地址为空');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});