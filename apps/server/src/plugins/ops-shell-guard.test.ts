// ops-shell 护栏单测：危险命令黑名单 / 只读判定 / 生产确认策略 / 输出截断 / 标签判定
import { describe, it, expect } from 'vitest';
import { isDangerous, isReadonly, guard, capOutput, isProductionTag } from './ops-shell-guard';

describe('isDangerous 危险命令黑名单', () => {
  it('拦截 rm -rf 及常见变体', () => {
    expect(isDangerous('rm -rf /')).toBe(true);
    expect(isDangerous('rm -fr /data')).toBe(true);
    expect(isDangerous('sudo rm -rf --no-preserve-root /')).toBe(true);
    expect(isDangerous('rm -r -f /home')).toBe(true);
  });

  it('拦截文件系统级破坏命令', () => {
    expect(isDangerous('mkfs.ext4 /dev/sda1')).toBe(true);
    expect(isDangerous('mkfs /dev/sdb')).toBe(true);
    expect(isDangerous('dd if=/dev/zero of=/dev/sda')).toBe(true);
    expect(isDangerous('wipefs /dev/sda1')).toBe(true);
    expect(isDangerous('chmod -R 777 /')).toBe(true);
    expect(isDangerous('chown -R root /')).toBe(true);
  });

  it('拦截停机/关网络/杀进程类', () => {
    expect(isDangerous('shutdown -h now')).toBe(true);
    expect(isDangerous('reboot')).toBe(true);
    expect(isDangerous('init 6')).toBe(true);
    expect(isDangerous('iptables -F')).toBe(true);
    expect(isDangerous('ufw disable')).toBe(true);
    expect(isDangerous('systemctl stop sshd')).toBe(true);
    expect(isDangerous('killall nginx')).toBe(true);
  });

  it('拦截 fork bomb', () => {
    expect(isDangerous(':(){ :|:& };:')).toBe(true);
  });

  it('放行常规运维命令', () => {
    expect(isDangerous('docker ps -a')).toBe(false);
    expect(isDangerous('df -h')).toBe(false);
    expect(isDangerous('tail -100 /var/log/nginx/error.log')).toBe(false);
    expect(isDangerous('systemctl status nginx')).toBe(false);
    expect(isDangerous('journalctl -u app --since today')).toBe(false);
  });
});

describe('isReadonly 只读判定', () => {
  it('白名单前缀命中', () => {
    expect(isReadonly('ls -la')).toBe(true);
    expect(isReadonly('cat /etc/hostname')).toBe(true);
    expect(isReadonly('docker ps')).toBe(true);
    expect(isReadonly('docker logs --tail 100 web')).toBe(true);
    expect(isReadonly('systemctl status nginx')).toBe(true);
    expect(isReadonly('df -h | grep /data')).toBe(true);
  });

  it('写操作不判为只读', () => {
    expect(isReadonly('rm /tmp/a')).toBe(false);
    expect(isReadonly('docker restart web')).toBe(false);
    expect(isReadonly('systemctl restart nginx')).toBe(false);
    expect(isReadonly('apt-get install -y htop')).toBe(false);
    expect(isReadonly('')).toBe(false);
  });
});

describe('guard 护栏总检查', () => {
  it('危险命令无论环境一律拒绝', () => {
    expect(guard('rm -rf /', { isProduction: false, confirmed: true })).toMatch(/黑名单/);
    expect(guard('rm -rf /', { isProduction: true, confirmed: true })).toMatch(/黑名单/);
  });

  it('生产连接写操作需 confirmed，只读放行', () => {
    expect(guard('docker restart web', { isProduction: true, confirmed: false })).toMatch(/confirmed=true/);
    expect(guard('docker restart web', { isProduction: true, confirmed: true })).toBeNull();
    expect(guard('docker ps', { isProduction: true, confirmed: false })).toBeNull();
    expect(guard('reboot', { isProduction: false, confirmed: true })).toMatch(/黑名单/);
  });

  it('非生产连接写操作直接放行', () => {
    expect(guard('docker restart web', { isProduction: false, confirmed: false })).toBeNull();
  });

  it('空命令拒绝', () => {
    expect(guard('', { isProduction: false, confirmed: true })).toMatch(/不能为空/);
    expect(guard('   ', { isProduction: false, confirmed: true })).toMatch(/不能为空/);
  });
});

describe('capOutput 输出截断', () => {
  it('短输出原样返回', () => {
    const r = capOutput('hello', 100);
    expect(r.text).toBe('hello');
    expect(r.truncated).toBe(false);
  });

  it('超长输出掐头留尾并标注', () => {
    // 标记放尾部：掐头留尾策略必须保留尾部
    const long = 'a'.repeat(3000) + 'b'.repeat(3000) + 'KEY_MARKER';
    const r = capOutput(long, 2048);
    expect(r.truncated).toBe(true);
    expect(r.text).toContain('截断');
    expect(r.text).toContain('KEY_MARKER'); // 尾部保留
    expect(r.text.length).toBeLessThan(long.length);
  });
});

describe('isProductionTag 标签判定', () => {
  it('生产/prod 命中，测试/空/undefined 不命中', () => {
    expect(isProductionTag('生产')).toBe(true);
    expect(isProductionTag('production')).toBe(true);
    expect(isProductionTag('web-prod-1')).toBe(true);
    expect(isProductionTag('测试')).toBe(false);
    expect(isProductionTag('dev')).toBe(false);
    expect(isProductionTag('')).toBe(false);
    expect(isProductionTag(undefined)).toBe(false);
  });
});
