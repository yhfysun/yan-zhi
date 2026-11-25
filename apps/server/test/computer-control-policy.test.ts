import { describe, expect, it } from 'vitest';
import { ComputerControlAppPolicy } from '../src/plugins/computer-control-policy.js';

describe('computer control app policy', () => {
  it('defaults closed and remembers approval per device', () => {
    const policy = new ComputerControlAppPolicy();
    expect(policy.isAllowed('pc-a', 'notepad.exe')).toBe(false);
    policy.approve('pc-a', 'Notepad.EXE', '记事本', 100);
    expect(policy.isAllowed('pc-a', 'notepad.exe')).toBe(true);
    expect(policy.isAllowed('pc-b', 'notepad.exe')).toBe(false);
    expect(policy.list('pc-a')).toEqual([
      { appId: 'notepad.exe', displayName: '记事本', allowed: true, updatedAt: 100 },
    ]);
  });

  it('serializes and revokes grants without losing other devices', () => {
    const policy = new ComputerControlAppPolicy({
      'pc-a': {
        wechat: { appId: 'wechat', displayName: '微信', allowed: true, updatedAt: 1 },
      },
    });
    policy.approve('pc-b', 'notepad.exe', '记事本', 2);
    expect(policy.revoke('pc-a', 'wechat')).toBe(true);
    expect(policy.isAllowed('pc-a', 'wechat')).toBe(false);
    expect(policy.isAllowed('pc-b', 'notepad.exe')).toBe(true);
    const restored = new ComputerControlAppPolicy(policy.toJSON());
    expect(restored.isAllowed('pc-b', 'notepad.exe')).toBe(true);
  });

  it('drops malformed persisted entries at the boundary', () => {
    const policy = new ComputerControlAppPolicy({
      'pc-a': {
        bad: { appId: 'bad', displayName: 'bad', allowed: false, updatedAt: 1 },
      },
    } as never);
    expect(policy.isAllowed('pc-a', 'bad')).toBe(false);
  });
});
