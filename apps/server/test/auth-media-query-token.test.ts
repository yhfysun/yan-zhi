/**
 * 媒体端点 query 令牌（2026-11-02）。
 *
 * ★ 用户实报：成片预览显示「视频 0MB 流式读取失败且超过内嵌播放上限」。
 *   根因：multi 模式下 `<video src>` 带不了 Authorization 头 → 远程请求 401；
 *   回环请求被当游客 → 会话归属不符 404。两种都表现为「读不出字节」。
 *   修法：GET/HEAD 允许 `?token=`（与 WS 早已有的兜底同口径），写操作仍只认请求头。
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';

process.env.YZ_TEST_FORCE_SQLJS = '1';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'yz-auth-media-'));
process.env.YZ_AUTH_MODE = 'multi';

import { authMiddleware } from '../src/auth.js';

const SECRET = process.env.JWT_SECRET || 'yan-zhi-secret-change-in-production';

function mkReq(method: string, opt: { token?: string; remote?: string } = {}): any {
  const { token, remote = '192.168.10.50' } = opt;
  return {
    method,
    headers: {},
    query: token ? { token } : {},
    socket: { remoteAddress: remote },
    user: undefined,
  };
}

function mkRes(): any {
  const r: any = { statusCode: 200, body: null };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: unknown) => { r.body = b; return r; };
  return r;
}

function run(req: any) {
  const res = mkRes();
  let passed = false;
  authMiddleware(req, res, () => { passed = true; });
  return { req, res, passed };
}

describe('authMiddleware：媒体元素的 query 令牌', () => {
  it('GET + 合法 token → 认作该用户', () => {
    const token = jwt.sign({ userId: 'user-1', username: 'u1' }, SECRET);
    const { req, passed } = run(mkReq('GET', { token }));
    expect(passed).toBe(true);
    expect(req.user?.userId).toBe('user-1');
  });

  it('HEAD + 合法 token → 同样认（播放器探测大小用 HEAD）', () => {
    const token = jwt.sign({ userId: 'user-2', username: 'u2' }, SECRET);
    const { req, passed } = run(mkReq('HEAD', { token }));
    expect(passed).toBe(true);
    expect(req.user?.userId).toBe('user-2');
  });

  it('远程 GET 不带 token → 401（不能被当成游客读到别人的会话）', () => {
    const { res, passed } = run(mkReq('GET'));
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('回环 GET 不带 token → 仍回落 guest（桌面单机行为不变）', () => {
    const { req, passed } = run(mkReq('GET', { remote: '127.0.0.1' }));
    expect(passed).toBe(true);
    expect(req.user?.userId).toBe('guest');
  });

  it('带了非法 token → 401，而不是静默回落 guest', () => {
    const { res, passed } = run(mkReq('GET', { token: 'not-a-jwt' }));
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('POST 的 query 令牌不被接受（写操作仍只能走请求头）', () => {
    const token = jwt.sign({ userId: 'user-3', username: 'u3' }, SECRET);
    const { res, passed } = run(mkReq('POST', { token }));
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});
