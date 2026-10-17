/**
 * 执行指令 P1（直接写终端，不过模型）正式测试类。
 *
 * 口径：
 *   ① 危险命令黑名单始终拒绝 —— 确认也不能放行；
 *   ② 生产连接的非只读命令必须由人当场确认（confirmed=true 才写入）；
 *   ③ 只读命令 / 非生产连接直接放行；
 *   ④ WS 控制帧 `{type:'exec'}` 与 SSE 回退路由 `/term/:id/exec` 必须同口径，
 *      且都留审计（term.exec / term.exec.rejected）。
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 导入 ops-shell 会经 crypto 连带加载 better-sqlite3（取主密钥），单测里换成可逆假加解密
vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (s: string) => `ENC:${s}`,
  decrypt: (s: string) => String(s).replace(/^ENC:/, ''),
}));

import { terminalExecProblem } from '../src/plugins/ops-shell.js';

describe('terminalExecProblem · 直接执行护栏矩阵', () => {
  it('空命令 → 拒绝', () => {
    expect(terminalExecProblem({}, '   ', false)).toMatch(/不能为空/);
  });

  it('★ 危险命令黑名单始终拒绝，确认也没用', () => {
    expect(terminalExecProblem({}, 'rm -rf /', true)).toMatch(/黑名单/);
    expect(terminalExecProblem({ tag: '生产' }, 'reboot', true)).toMatch(/黑名单/);
    expect(terminalExecProblem({}, ':(){ :|:& };:', true)).toMatch(/黑名单/);
  });

  it('生产连接的非只读命令：未确认 → 要求确认', () => {
    expect(terminalExecProblem({ tag: '生产' }, 'docker restart web', false)).toMatch(/生产环境/);
    expect(terminalExecProblem({ tag: 'prod' }, 'systemctl restart nginx', false)).toMatch(/生产环境/);
    // 确认后放行
    expect(terminalExecProblem({ tag: '生产' }, 'docker restart web', true)).toBeNull();
  });

  it('生产连接的只读命令 → 无需确认', () => {
    expect(terminalExecProblem({ tag: '生产' }, 'ls -la', false)).toBeNull();
    expect(terminalExecProblem({ tag: 'prod' }, 'docker ps', false)).toBeNull();
    expect(terminalExecProblem({ tag: '生产' }, 'tail -100 /var/log/app.log', false)).toBeNull();
  });

  it('非生产连接 → 写命令直接放行', () => {
    expect(terminalExecProblem({}, 'docker restart web', false)).toBeNull();
    expect(terminalExecProblem({ tag: '测试' }, 'systemctl restart nginx', false)).toBeNull();
  });
});

describe('ops-shell · 直接执行接线契约', () => {
  const SRC = readFileSync(resolve(__dirname, '../src/plugins/ops-shell.ts'), 'utf8');

  it('WS 控制帧 exec：先判护栏，再写 PTY，并回执 token', () => {
    expect(SRC).toMatch(/msg\.type === 'exec'/);
    expect(SRC).toMatch(/terminalExecProblem\(conn, command, msg\.confirmed === true\)/);
    expect(SRC).toContain('recorder?.input(`${command}\\r`)');
    expect(SRC).toContain('stream.write(`${command}\\r`)');
    expect(SRC).toMatch(/type: 'exec-accepted', token/);
    expect(SRC).toMatch(/type: 'exec-rejected', token/);
    expect(SRC).toMatch(/audit\('term\.exec',/);
    expect(SRC).toMatch(/audit\('term\.exec\.rejected'/);
  });

  it('SSE 回退通道有同口径路由（黑名单 400 / 待确认 409）', () => {
    expect(SRC).toMatch(/r\.post\('\/term\/:id\/exec'/);
    expect(SRC).toMatch(/const status = isDangerous\(command\) \? 400 : 409/);
    expect(SRC).toMatch(/terminalExecProblem\(\{ tag: s\.tag \}, command, body\.confirmed === true\)/);
  });
});
