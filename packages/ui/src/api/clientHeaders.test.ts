/**
 * 请求头构造单测。
 *
 * 为什么值得测：`buildRequestHeaders` 是授权门禁上线后所有直连请求（SSE 流、终端流、
 * 工具结果回传）的公共入口。这里漏一个头，表现是「界面正常但某条流 403 / 静默断流」——
 * 不是报错，而是功能悄悄失效，最难排查。所以把合并与覆盖规则钉死。
 *
 * 为什么用 jsdom：这两个函数读 localStorage，而包级 vitest 配的是 node 环境。
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildRequestHeaders, getLicenseCode } from '../api/client';

const AUTH_KEY = 'auth_token';
const LICENSE_KEY = 'license_code';

describe('buildRequestHeaders · 请求头合并', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('无 token 无授权码时返回传入的额外头（不凭空造头）', () => {
    expect(buildRequestHeaders({ 'Content-Type': 'application/json' }))
      .toEqual({ 'Content-Type': 'application/json' });
  });

  it('无参数时返回空对象（调用方可以只需 x-license）', () => {
    expect(buildRequestHeaders()).toEqual({});
  });

  it('有 token 时补 Authorization: Bearer', () => {
    localStorage.setItem(AUTH_KEY, 'jwt-abc');
    expect(buildRequestHeaders()['Authorization']).toBe('Bearer jwt-abc');
  });

  it('有授权码时补 x-license', () => {
    localStorage.setItem(LICENSE_KEY, 'PAYLOAD.SIG');
    expect(buildRequestHeaders()['x-license']).toBe('PAYLOAD.SIG');
  });

  it('两个都有时同时补上（缺任一个都会在门禁开启后失败）', () => {
    localStorage.setItem(AUTH_KEY, 'jwt-abc');
    localStorage.setItem(LICENSE_KEY, 'PAYLOAD.SIG');
    const h = buildRequestHeaders({ 'Content-Type': 'application/json' });
    expect(h['Authorization']).toBe('Bearer jwt-abc');
    expect(h['x-license']).toBe('PAYLOAD.SIG');
    expect(h['Content-Type']).toBe('application/json');
  });

  it('调用方显式传入的 Authorization 不被覆盖（SSE 场景各自拼 token）', () => {
    localStorage.setItem(AUTH_KEY, 'from-storage');
    const h = buildRequestHeaders({ Authorization: 'Bearer explicit' });
    expect(h['Authorization']).toBe('Bearer explicit');
  });

  it('调用方显式传入的 x-license 不被覆盖（便于临时用别的码调试）', () => {
    localStorage.setItem(LICENSE_KEY, 'from-storage');
    const h = buildRequestHeaders({ 'x-license': 'explicit-code' });
    expect(h['x-license']).toBe('explicit-code');
  });

  it('不改动传入的对象（避免调用方复用的 headers 被悄悄污染）', () => {
    localStorage.setItem(AUTH_KEY, 'jwt-abc');
    const input: Record<string, string> = { 'Content-Type': 'application/json' };
    buildRequestHeaders(input);
    expect(input).toEqual({ 'Content-Type': 'application/json' });
  });

  it('空白授权码视为无码（不发出 x-license: ""）', () => {
    localStorage.setItem(LICENSE_KEY, '');
    expect(buildRequestHeaders()['x-license']).toBeUndefined();
  });
});

describe('getLicenseCode · 读取授权码', () => {
  afterEach(() => localStorage.clear());

  it('读 localStorage.license_code', () => {
    localStorage.setItem(LICENSE_KEY, 'CODE-1');
    expect(getLicenseCode()).toBe('CODE-1');
  });

  it('未设置时返回 null', () => {
    expect(getLicenseCode()).toBeNull();
  });
});