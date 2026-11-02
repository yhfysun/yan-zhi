/**
 * 远端主机基线（ops-shell SSH 联动）：固定只读命令采集 + 复用本地判定。
 */
import { describe, it, expect } from 'vitest';
import { runHostBaselineOverSsh } from '../src/plugins/sec-lab-tools/hostbaseline.js';

function execMap(map: Record<string, string>) {
  return async (cmd: string): Promise<string> => {
    for (const [needle, out] of Object.entries(map)) if (cmd.includes(needle)) return out;
    throw new Error('command failed');
  };
}

describe('runHostBaselineOverSsh', () => {
  it('按 Linux 判定：root 直登/口令认证/过宽 shadow/防火墙/auditd/IP 转发都报失败', async () => {
    const out = await runHostBaselineOverSsh(execMap({
      'sshd_config': 'PermitRootLogin yes\nPasswordAuthentication yes\n',
      'stat -c': '666\n',
      'firewalld': 'inactive\n',
      'ufw': 'Status: inactive\n',
      'auditd': 'inactive\n',
      'ip_forward': '1\n',
    }), 'web-01(10.0.0.5)');

    expect(out.risk).toBe('active');
    expect(out.target).toBe('web-01(10.0.0.5)');
    expect(out.summary).toContain('web-01(10.0.0.5)');
    const titles = out.findings.map((f) => f.title).join(' | ');
    for (const k of ['禁止 root 直登', 'SSH 口令认证', '/etc/shadow 权限', '主机防火墙', '审计服务', 'IP 转发']) {
      expect(titles).toContain(k);
    }
    expect((out.raw as any).platform).toBe('linux');
  });

  it('命令全部失败：全部标 skip，不假装通过', async () => {
    const out = await runHostBaselineOverSsh(async () => { throw new Error('no route'); }, 'dead-host');
    expect(out.findings).toEqual([]);
    expect(out.summary).toContain('无法核查');
  });

  it('合规远端：root 禁登 + 关口令 + 防火墙/审计开启 + 不转发', async () => {
    const out = await runHostBaselineOverSsh(execMap({
      'sshd_config': 'PermitRootLogin prohibit-password\nPasswordAuthentication no\n',
      'stat -c': '640\n',
      'firewalld': 'active\n',
      'auditd': 'active\n',
      'ip_forward': '0\n',
    }), 'good-host');
    expect(out.findings).toEqual([]);
    expect(out.summary).toContain('得分 100');
  });
});
