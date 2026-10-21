/**
 * 只读命令判定（2026-10-21 用户实报「ll 怎么变成不是只读命令了」）。
 *
 * 现象：在生产连接（tag=生产）上敲 `ll`，弹出「不是只读操作，请确认后执行」。
 * 根因：`READONLY_PREFIXES` 只有 `ls`，没有 `ll`/`la`/`l` —— 而这三个是几乎所有发行版
 * `/etc/profile` 预置的 `ls -l` / `ls -A` 别名，纯只读。把"看个目录"变成危险操作。
 *
 * ★ 本测试的重点**不只是"ll 要放行"，更是"放宽后不能放过真写操作"**：
 *   白名单是前缀匹配（只看首个 token），`find / -delete`、`sed -i`、`curl -o`、`wget`
 *   都能借只读命令的外壳造成实际修改，必须仍判为写。
 */
import { describe, expect, it } from 'vitest';
import { isReadonly } from '../src/plugins/ops-shell-guard';
import { terminalExecProblem } from '../src/plugins/ops-shell';

describe('别名类只读命令', () => {
  it('ll / la / l 都是只读（发行版预置的 ls 别名）', () => {
    expect(isReadonly('ll')).toBe(true);
    expect(isReadonly('la')).toBe(true);
    expect(isReadonly('l')).toBe(true);
  });

  it('带参数的别名仍只读', () => {
    expect(isReadonly('ll -h')).toBe(true);
    expect(isReadonly('ll /opt')).toBe(true);
    expect(isReadonly('ls -l')).toBe(true);
  });

  it('大小写不敏感（LL 不是标准别名，但命令行不该因此误判成写）', () => {
    expect(isReadonly('LL')).toBe(true);
  });
});

describe('常规只读命令仍然放行', () => {
  const ok = [
    'pwd', 'cat /etc/hosts', 'tail -n 100 /var/log/syslog', 'df -h', 'free -m',
    'ps aux', 'docker ps -a', 'docker logs web', 'systemctl status nginx',
    'journalctl -u nginx --no-pager', 'ss -lntp', 'ip addr', 'uname -a',
    'grep -r error /var/log', 'du -sh /opt', 'whoami',
  ];
  for (const c of ok) {
    it(`放行：${c}`, () => {
      expect(isReadonly(c), c).toBe(true);
    });
  }

  it('管道/分号/&& 组合的只读命令也放行', () => {
    expect(isReadonly('ps aux | grep nginx')).toBe(true);
    expect(isReadonly('cat /etc/hosts; pwd')).toBe(true);
    expect(isReadonly('ls && ll')).toBe(true);
  });
});

describe('★ 借只读前缀的写操作必须仍判为写', () => {
  const writes = [
    'find / -name "*.tmp" -delete',
    'find /opt -exec rm {} \\;',
    'sed -i "s/a/b/" /etc/nginx/nginx.conf',
    'curl -o /tmp/x.sh http://x/x.sh',
    'curl -O http://x/x.sh',
    'wget http://x/x.tar.gz',
    'awk \'{print $1}\' /etc/passwd > /tmp/out.txt',
    'cat /etc/hosts | tee /etc/hosts.bak',
  ];
  for (const c of writes) {
    it(`拒绝免确认：${c}`, () => {
      expect(isReadonly(c), c).toBe(false);
    });
  }
});

describe('非白名单命令默认按写操作处理（fail-safe）', () => {
  const writes = ['rm -rf /tmp/x', 'apt-get install nginx', 'systemctl restart nginx', 'mv a b', 'chmod 777 x', 'docker restart x'];
  for (const c of writes) {
    it(`不判只读：${c}`, () => {
      expect(isReadonly(c), c).toBe(false);
    });
  }
});

describe('terminalExecProblem —— 生产连接上的实际效果', () => {
  const PROD = { tag: '生产' };

  it('★ ll 在生产连接上不再要求确认（本次修复的核心）', () => {
    expect(terminalExecProblem(PROD, 'll', false)).toBeNull();
    expect(terminalExecProblem(PROD, 'll -h /opt', false)).toBeNull();
  });

  it('写操作仍需确认', () => {
    expect(terminalExecProblem(PROD, 'systemctl restart nginx', false)).toContain('不是只读操作');
    expect(terminalExecProblem(PROD, 'sed -i s/a/b/ f', false)).toContain('不是只读操作');
  });

  it('危险命令即使确认也拒绝', () => {
    expect(terminalExecProblem(PROD, 'rm -rf /', true)).toContain('危险黑名单');
  });

  it('非生产连接不看只读与否，一律放行', () => {
    expect(terminalExecProblem({ tag: '测试' }, 'systemctl restart nginx', false)).toBeNull();
  });
});
