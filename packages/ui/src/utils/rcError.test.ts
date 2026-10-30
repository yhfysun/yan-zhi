// 连接错误分类守门：同一句「配对失败」要拆成 连不上 / 超时 / 被控端返回异常。
import { describe, expect, it } from 'vitest';
import { describeConnectError } from './rcError';

const host = 'http://192.168.1.100:3001';
const opts = { host, timeoutMs: 10_000 };

describe('describeConnectError', () => {
  it('超时（AbortError/TimeoutError）→ 连接超时，并带上主机与秒数', () => {
    for (const name of ['AbortError', 'TimeoutError']) {
      const r = describeConnectError(Object.assign(new Error('x'), { name }), opts);
      expect(r.kind).toBe('timeout');
      expect(r.message).toContain('连接超时');
      expect(r.message).toContain(host);
      expect(r.message).toContain('10 秒');
    }
  });

  it('浏览器网络失败（TypeError: Failed to fetch）→ 连接不上被控端', () => {
    const r = describeConnectError(new TypeError('Failed to fetch'), opts);
    expect(r.kind).toBe('unreachable');
    expect(r.message).toContain('连接不上被控端');
    expect(r.message).toContain(host);
  });

  it('别的网络措辞（Load failed / NetworkError）也归到连不上', () => {
    expect(describeConnectError(new TypeError('Load failed'), opts).kind).toBe('unreachable');
    expect(describeConnectError(new Error('NetworkError when attempting to fetch'), opts).kind).toBe('unreachable');
  });

  it('响应不是 JSON（SyntaxError）→ 被控端返回异常', () => {
    const r = describeConnectError(new SyntaxError('Unexpected token < in JSON'), opts);
    expect(r.kind).toBe('bad-response');
    expect(r.message).toContain('返回异常');
  });

  it('服务端给的中文错误 → 配对失败 + 原文，不吞内容', () => {
    const r = describeConnectError(new Error('授权码不正确'), opts);
    expect(r.kind).toBe('server');
    expect(r.message).toBe('配对失败：授权码不正确');
  });

  it('空错误兜底也不出现英文 unknown stack', () => {
    expect(describeConnectError(null, opts).message).toBe('配对失败：未知错误');
  });
});
