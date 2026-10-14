// 配额 / 鉴权类上游错误也要触发候选池换模型（2026-10-14）。
// 背景：生产里抛的是纯 Error（无 status），而 isPoolFailoverable 的报文正则不含 401/403/配额字样
// ⇒ 额度耗尽 / Key 失效被当成不可恢复，长任务直接失败（实测会话 10-13 19:07 子智能体即如此）。
import { describe, expect, it } from 'vitest';
import { isPoolFailoverable } from '../src/llm-task-manager.js';

describe('isPoolFailoverable · 配额/鉴权类（2026-10-14）', () => {
  it('403 配额耗尽（纯 Error，无 status）→ 换', () => {
    expect(
      isPoolFailoverable(new Error('LLM 请求失败: 403 Forbidden {"error":{"code":"insufficient_user_quota"}}')),
    ).toBe(true);
  });

  it('401 Key 无效（纯 Error）→ 换', () => {
    expect(isPoolFailoverable(new Error('LLM 请求失败: 401 Unauthorized（API Key 无效或未配置）'))).toBe(true);
  });

  it('上游 403/Unauthorized 文案 → 换', () => {
    expect(isPoolFailoverable(new Error('403 Forbidden'))).toBe(true);
    expect(isPoolFailoverable(new Error('Unauthorized'))).toBe(true);
  });

  it('400 参数错仍不换（换了也一样错）', () => {
    expect(
      isPoolFailoverable(new Error('LLM 请求失败: 400 Bad Request {"error":{"message":"messages 参数非法"}}')),
    ).toBe(false);
  });
});