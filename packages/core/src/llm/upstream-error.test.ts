/**
 * 上游错误 → 可读提示 + 带 status 的错误对象（2026-10-14）。
 *
 * 背景：403 此前**无任何提示**，且抛的是纯 Error（无 status）⇒ 候选池故障转移判不出
 * 「额度耗尽 / 鉴权失效」这类**本该换平台/模型**的错误，直接打死长任务。
 */
import { describe, expect, it } from 'vitest';
import { upstreamErrorMessage, upstreamErrorCode, makeUpstreamError, LlmUpstreamError } from './client';

describe('upstreamErrorMessage · 403 提示', () => {
  it('配额耗尽（insufficient_user_quota）→ 提到额度用尽', () => {
    const text =
      '{"error":{"message":"Insufficient user quota, remaining: 0","type":"AgnesAI_error","code":"insufficient_user_quota"}}';
    const msg = upstreamErrorMessage(403, 'Forbidden', 'https://x/v1/chat/completions', text);
    expect(msg).toContain('403');
    expect(msg).toContain('额度已用尽');
    expect(msg).toContain('insufficient_user_quota');
  });

  it('401 文案保持原样（前端按 /^LLM 请求失败: (\\d{3})/ 解析）', () => {
    expect(upstreamErrorMessage(401, 'Unauthorized', 'u', '')).toBe(
      'LLM 请求失败: 401 Unauthorized（API Key 无效或未配置）',
    );
  });

  it('403 非 JSON 文本 → 落到通用 403 提示', () => {
    const msg = upstreamErrorMessage(403, 'Forbidden', 'u', 'forbidden');
    expect(msg).toContain('403');
    expect(msg).toContain('拒绝访问');
  });
});

describe('upstreamErrorCode', () => {
  it('从 JSON 取 code', () => {
    expect(upstreamErrorCode('{"error":{"code":"invalid_api_key"}}')).toBe('invalid_api_key');
  });
  it('非 JSON 用正则兜底', () => {
    expect(upstreamErrorCode('x "code": "insufficient_user_quota" y')).toBe('insufficient_user_quota');
  });
  it('拿不到返回空串', () => {
    expect(upstreamErrorCode('plain text')).toBe('');
    expect(upstreamErrorCode('')).toBe('');
  });
});

describe('makeUpstreamError · 带 status 供故障转移判定', () => {
  it('是 LlmUpstreamError，status/code 正确', () => {
    const e = makeUpstreamError(403, 'Forbidden', 'u', '{"error":{"code":"insufficient_user_quota"}}');
    expect(e).toBeInstanceOf(LlmUpstreamError);
    expect(e.status).toBe(403);
    expect(e.code).toBe('insufficient_user_quota');
    expect(e.message).toContain('403');
  });
});