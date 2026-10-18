// 主机基线纯逻辑测试（2026-10-18）。
// judge 规则（哪些配置算不通过、skip 如何计分）不依赖本机环境，是这一块最该钉住的部分：
// 口径错了，体检分数与修复清单就全是错的。
import { describe, it, expect } from 'vitest';
import {
  parseSshdConfig,
  parseNetAccounts,
  assessHostBaseline,
  type HostRaw,
} from '../src/plugins/sec-lab-tools/hostbaseline.js';

describe('parseSshdConfig', () => {
  it('跳过注释与空行，键大小写不敏感', () => {
    const cfg = parseSshdConfig([
      '#PermitRootLogin yes',
      '',
      'PermitRootLogin no',
      'PasswordAuthentication Off',
      'Port 2222',
    ].join('\n'));
    expect(cfg.permitRootLogin).toBe('no');
    expect(cfg.passwordAuthentication).toBe('off');
    expect(cfg.port).toBe('2222');
  });

  it('首次出现生效（与 sshd 行为一致，后写的重复项不算）', () => {
    const cfg = parseSshdConfig('PermitRootLogin no\nPermitRootLogin yes\n');
    expect(cfg.permitRootLogin).toBe('no');
  });
});

describe('parseNetAccounts', () => {
  it('英文标签', () => {
    const r = parseNetAccounts('Minimum password length                 14\nLockout threshold                           Never\n');
    expect(r.minLength).toBe(14);
    expect(r.lockoutThreshold).toBe('Never');
  });

  it('中文标签', () => {
    const r = parseNetAccounts('密码长度最小值:                            8\n锁定阈值:                                  5\n');
    expect(r.minLength).toBe(8);
    expect(r.lockoutThreshold).toBe('5');
  });

  it('认不出时留 undefined（对应 skip，不假装通过）', () => {
    const r = parseNetAccounts('some localized text');
    expect(r.minLength).toBeUndefined();
    expect(r.lockoutThreshold).toBeUndefined();
  });
});

describe('assessHostBaseline · Windows', () => {
  const good: HostRaw = {
    platform: 'win32',
    netAccounts: 'Minimum password length 12\nLockout threshold 5',
    smb1: 'False',
    rdp: '1',
    uac: '1',
    defender: 'True',
    firewallProfiles: 'Domain=True\nPrivate=True\nPublic=True',
  };

  it('全合格时满分且无 findings', () => {
    const r = assessHostBaseline(good);
    expect(r.score).toBe(100);
    expect(r.findings).toHaveLength(0);
  });

  it('SMBv1 / 弱密码策略 / Defender 关闭都会失败并出现对应 finding', () => {
    const r = assessHostBaseline({
      ...good,
      netAccounts: 'Minimum password length 4\nLockout threshold Never',
      smb1: 'True',
      defender: 'False',
    });
    const ids = r.checks.filter((c) => c.status === 'fail').map((c) => c.id);
    expect(ids).toContain('win_pwd_len');
    expect(ids).toContain('win_lockout');
    expect(ids).toContain('win_smb1');
    expect(ids).toContain('win_defender');
    expect(r.findings.some((f) => f.title.includes('SMBv1'))).toBe(true);
  });

  it('防火墙任一 profile 未启用即失败', () => {
    const r = assessHostBaseline({ ...good, firewallProfiles: 'Domain=True\nPrivate=False\nPublic=True' });
    expect(r.checks.find((c) => c.id === 'win_firewall')!.status).toBe('fail');
  });

  it('采集不到的项是 skip，且不计入分母（不会稀释分数）', () => {
    const r = assessHostBaseline({ platform: 'win32' }); // 全空
    expect(r.checks.every((c) => c.status === 'skip')).toBe(true);
    expect(r.score).toBe(100);
    expect(r.findings).toHaveLength(0);
  });
});

describe('assessHostBaseline · Linux', () => {
  const good: HostRaw = {
    platform: 'linux',
    sshd: 'PermitRootLogin prohibit-password\nPasswordAuthentication no\n',
    shadowMode: '640',
    firewallActive: 'active',
    auditdActive: 'active',
    ipForward: '0',
  };

  it('全合格时满分', () => {
    const r = assessHostBaseline(good);
    expect(r.score).toBe(100);
    expect(r.findings).toHaveLength(0);
  });

  it('root 直登 + 口令认证 + shadow 过宽 + 防火墙关闭均失败', () => {
    const r = assessHostBaseline({
      ...good,
      sshd: 'PermitRootLogin yes\nPasswordAuthentication yes\n',
      shadowMode: '644',
      firewallActive: 'inactive',
    });
    const ids = r.checks.filter((c) => c.status === 'fail').map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['linux_sshd_root', 'linux_sshd_pwd', 'linux_shadow', 'linux_firewall']));
    expect(r.score).toBeLessThan(100);
  });

  it('未配置 PermitRootLogin 视为 skip（发行版默认不一，不猜）', () => {
    const r = assessHostBaseline({ platform: 'linux', sshd: 'PasswordAuthentication no\n' });
    expect(r.checks.find((c) => c.id === 'linux_sshd_root')!.status).toBe('skip');
  });
});
