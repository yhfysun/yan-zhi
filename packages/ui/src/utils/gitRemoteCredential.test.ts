// 远程地址内嵌明文凭据的识别 —— 守门测试（2026-10-16）。
//
// 背景：远程地址弹窗（GitRemoteDialog）会把 origin 的完整地址显示出来并可一键复制。
//   本机实际配置里就存在 `https://ghp_…@github.com/owner/repo.git` 这种内嵌 PAT 的形态
//   ⇒ 界面需要一个"这地址里带明文凭据"的提醒。
//
// ★ 两条都不能错的口径：
//   ① 带 scheme 的 userinfo（`scheme://user@host`、`scheme://user:pass@host`）必须识别出来；
//   ② scp 形式 `git@github.com:owner/repo.git` **不能**误报 —— 那个 `git@` 是用户名不是凭据，
//      误报会把所有 SSH 远程整片标红，提醒随之失效。
import { describe, it, expect } from 'vitest';
import { hasInlineCredential } from './gitRemoteCredential';

describe('hasInlineCredential：识别地址内嵌的明文凭据', () => {
  it('★ https 里带令牌 → true（本机 origin 的真实形态）', () => {
    expect(hasInlineCredential('https://ghp_AbCdEf0123456789@github.com/owner/repo.git')).toBe(true);
  });

  it('★ user:password@ 形式 → true', () => {
    expect(hasInlineCredential('https://alice:s3cr3t@gitlab.internal/app.git')).toBe(true);
  });

  it('★ scp 形式与纯用户名 SSH 地址**不**算凭据（那是用户名，误报会让 SSH 远程整片标红）', () => {
    expect(hasInlineCredential('git@github.com:owner/repo.git')).toBe(false);
    expect(hasInlineCredential('ssh://git@gitlab.internal:2222/app.git')).toBe(false);
    expect(hasInlineCredential('git+ssh://git@gitlab.internal/app.git')).toBe(false);
  });

  it('★ 非 http(s) 协议里出现 user:password@ → 仍算凭据', () => {
    expect(hasInlineCredential('ssh://alice:s3cr3t@gitlab.internal/app.git')).toBe(true);
  });

  it('不带凭据的普通地址 → false', () => {
    expect(hasInlineCredential('https://github.com/owner/repo.git')).toBe(false);
    expect(hasInlineCredential('file:///D:/repos/mirror.git')).toBe(false);
    expect(hasInlineCredential('D:/repos/mirror.git')).toBe(false);
  });

  it('空 / 非字符串 → 不误判', () => {
    expect(hasInlineCredential('')).toBe(false);
    expect(hasInlineCredential('   ')).toBe(false);
    expect(hasInlineCredential(undefined as unknown as string)).toBe(false);
  });
});
