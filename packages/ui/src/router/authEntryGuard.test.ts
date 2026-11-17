import { describe, expect, it } from 'vitest';
import { guestAuthEntryRedirect } from './authEntryGuard';

describe('本机单机模式认证入口', () => {
  it('guest 模式访问登录或初始化页时回到任务页', () => {
    expect(guestAuthEntryRedirect('/login', false)).toBe('/chat');
    expect(guestAuthEntryRedirect('/setup', false)).toBe('/chat');
  });

  it('multi 模式保留登录与初始化流程', () => {
    expect(guestAuthEntryRedirect('/login', true)).toBeNull();
    expect(guestAuthEntryRedirect('/setup', true)).toBeNull();
  });

  it('普通业务页不受影响', () => {
    expect(guestAuthEntryRedirect('/chat', false)).toBeNull();
    expect(guestAuthEntryRedirect('/settings', false)).toBeNull();
  });
});
