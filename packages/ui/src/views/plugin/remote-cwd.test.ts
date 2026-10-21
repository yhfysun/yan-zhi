/**
 * 远端当前目录解析（2026-10-21 用户实报「服务器当前路径没有显示啊，也没有切换的地方」）。
 *
 * ★ 为什么必须解析提示符：`client.shell()` 是交互式 PTY，用户 `cd` 之后服务端无从得知；
 *   SFTP 路径 / 连接配置里的目录都**不是** shell 的 cwd。唯一可靠来源是 shell 打出来的 PS1。
 *
 * ★ 为什么不用「发一条 pwd 取结果」：会在终端里留下用户没敲过的命令和输出，
 *   还会打断用户正在编辑的命令行。
 */
import { describe, expect, it } from 'vitest';
import { parsePromptCwd, parsePromptLine, applyPromptCwd, cwdFromCdCommand, stripAnsi, stripCommandEcho } from './remote-cwd';

describe('parsePromptLine —— 各发行版默认 PS1', () => {
  it('Ubuntu/Debian：app@web-01:/opt/app$', () => {
    expect(parsePromptLine('app@web-01:/opt/app$')).toEqual({ raw: '/opt/app', absolute: true });
  });

  it('root 家目录：root@host:~#', () => {
    expect(parsePromptLine('root@host:~#')).toEqual({ raw: '~', absolute: true });
  });

  it('CentOS/RHEL：[app@web-01 opt]$ （相对家目录）', () => {
    expect(parsePromptLine('[app@web-01 opt]$')).toEqual({ raw: 'opt', absolute: false });
  });

  it('CentOS 家目录：[root@web-01 ~]#', () => {
    expect(parsePromptLine('[root@web-01 ~]#')).toEqual({ raw: '~', absolute: true });
  });

  it('提示符后已敲了一半命令：解析出的仍是目录', () => {
    expect(parsePromptLine('app@web-01:/opt/app$ docker ps -a')).toEqual({ raw: '/opt/app', absolute: true });
  });

  it('路径带空格（引号形式）也能拿到完整路径', () => {
    expect(parsePromptLine('app@web-01:/opt/my app$')).toEqual({ raw: '/opt/my app', absolute: true });
  });

  it('无路径信息的 PS1（bash-5.1$）→ null（保持上一次的值，不瞎猜）', () => {
    expect(parsePromptLine('bash-5.1$')).toBeNull();
  });

  it('纯输出行不是提示符 → null', () => {
    expect(parsePromptLine('total 12')).toBeNull();
    expect(parsePromptLine('drwxr-xr-x 2 root root 4096 Jan 1 a.txt')).toBeNull();
    expect(parsePromptLine('')).toBeNull();
  });
});

describe('parsePromptCwd —— 只看最后一行', () => {
  it('历史输出里的提示符不代表当前状态', () => {
    const block = 'app@web-01:/old/path$ ls\nfile1\napp@web-01:/new/path$';
    expect(parsePromptCwd(block)).toEqual({ raw: '/new/path', absolute: true });
  });

  it('带 ANSI 颜色码的提示符能剥掉再解析', () => {
    const colored = '\u001b[32mapp@web-01\u001b[0m:\u001b[34m/opt/app\u001b[0m$ ';
    expect(parsePromptCwd(colored)).toEqual({ raw: '/opt/app', absolute: true });
  });

  it('CRLF 分行的输出也能取到最后一行', () => {
    expect(parsePromptCwd('a\r\napp@h:/var/log$\r\n')).toEqual({ raw: '/var/log', absolute: true });
  });

  it('空输入 → null', () => {
    expect(parsePromptCwd('')).toBeNull();
    expect(parsePromptCwd('\n\n')).toBeNull();
  });
});

describe('applyPromptCwd —— 落值规则', () => {
  it('绝对路径直接采用', () => {
    expect(applyPromptCwd('/old', { raw: '/new', absolute: true })).toBe('/new');
  });

  it('相对路径拼到上一次已知路径（CentOS 的 opt）', () => {
    expect(applyPromptCwd('/home/app', { raw: 'opt', absolute: false })).toBe('/home/app/opt');
  });

  it('没有基准时原样显示相对目录（不编造 /home/xxx）', () => {
    expect(applyPromptCwd('', { raw: 'opt', absolute: false })).toBe('opt');
  });

  it('解析不到（null）→ undefined 表示「不变」', () => {
    expect(applyPromptCwd('/opt', null)).toBeUndefined();
  });

  it('去掉多余尾部斜杠，但根目录保留', () => {
    expect(applyPromptCwd('/x', { raw: '/opt/', absolute: true })).toBe('/opt');
    expect(applyPromptCwd('/x', { raw: '/', absolute: true })).toBe('/');
  });
});

describe('cwdFromCdCommand —— 执行 cd 后即时更新', () => {
  it('绝对路径', () => {
    expect(cwdFromCdCommand('cd /var/log', '/opt')).toBe('/var/log');
  });

  it('cd ~ 与裸 cd → 家目录', () => {
    expect(cwdFromCdCommand('cd ~', '/opt')).toBe('~');
    expect(cwdFromCdCommand('cd', '/opt')).toBe('~');
  });

  it('cd .. 从末级目录回退（不产生 /a/b/.. 这种别扭路径）', () => {
    expect(cwdFromCdCommand('cd ..', '/opt/app/sub')).toBe('/opt/app');
    expect(cwdFromCdCommand('cd ..', '/opt')).toBe('/');
  });

  it('相对路径拼接', () => {
    expect(cwdFromCdCommand('cd app', '/opt')).toBe('/opt/app');
  });

  it('带引号/空格的路径去掉引号', () => {
    expect(cwdFromCdCommand("cd '/opt/my app'", '/')).toBe('/opt/my app');
  });

  it('cd 之后接 && 链，只取 cd 那一段', () => {
    expect(cwdFromCdCommand('cd /var/log && tail -f syslog', '/opt')).toBe('/var/log');
  });

  it('非 cd 命令 → null（交给提示符解析，不瞎猜）', () => {
    expect(cwdFromCdCommand('ls -la', '/opt')).toBeNull();
    expect(cwdFromCdCommand('docker ps', '/opt')).toBeNull();
    expect(cwdFromCdCommand('echo cd /x', '/opt')).toBeNull();
    expect(cwdFromCdCommand('', '/opt')).toBeNull();
  });
});

describe('stripAnsi', () => {
  it('去掉 CSI（颜色）与 OSC（标题）', () => {
    expect(stripAnsi('\u001b[1;32mok\u001b[0m')).toBe('ok');
    expect(stripAnsi('\u001b]0;title\u0007text')).toBe('text');
  });
});

describe('stripCommandEcho —— 去掉 PTY 回显（用户实报「两个 ll 干嘛？」）', () => {
  it('截图实况：界面已有 $ ll，输出里不该再出现一行 ll', () => {
    // PTY 实际吐回的内容：命令回显 + 结果 + 新提示符
    const raw = [
      'll',
      'll',
      '总用量 156',
      '-rw-rw-r--.  1 app app 144630 8月 15 2025 arthas-boot.jar',
      'drwxrwxr-x.  7 app app   917 21 22:41 insight',
      '(base) [app@localhost insight-gpt-ai]$',
    ].join('\n');
    const out = stripCommandEcho(raw, 'll');
    expect(out.split('\n')[0], '★ 开头仍是回显行').toBe('总用量 156');
    expect(out, '★ 输出里不该再有单独一行 ll').not.toMatch(/^ll$/m);
    expect(out, '★ 末尾的新提示符要去掉').not.toContain('[app@localhost');
  });

  it('回显行前面挂着提示符残片也能去掉', () => {
    const raw = ']$ ls -l\n-rw-r--r-- 1 a b 0 x';
    expect(stripCommandEcho(raw, 'ls -l')).toBe('-rw-r--r-- 1 a b 0 x');
  });

  it('正常输出不得被误删（首行恰好以命令结尾但其实是结果）', () => {
    // 输出第一行是 "running: ll" 这种，不是回显（整行 != 命令，也不是"提示符+命令"）
    const raw = 'running: ll';
    expect(stripCommandEcho(raw, 'll')).toBe('running: ll');
  });

  it('没有任何回显时原样返回', () => {
    expect(stripCommandEcho('总用量 4\ndrwxr-xr-x', 'll')).toBe('总用量 4\ndrwxr-xr-x');
  });

  it('空命令 / 空输出不炸', () => {
    expect(stripCommandEcho('abc', '')).toBe('abc');
    expect(stripCommandEcho('', 'll')).toBe('');
  });

  it('输出里的 @ 行不被当成提示符误删（普通日志含 @ 且以 $ 结尾）', () => {
    const out = stripCommandEcho('user@host is ok$', 'll');
    expect(out, '★ 非提示符形态（没有"提示符符号紧跟行尾的 @ 用户名"结构）应保留').toBe('user@host is ok$');
  });
});
