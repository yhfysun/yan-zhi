/**
 * toolchain 输出解析守门（2026-11-02）：B 轨外部工具的解析必须容错。
 * 钉 nikto / ffuf 两类真实输出格式（此前只有 nmap/nuclei 有解析），
 * 以及"解析不出结构化结果时不抛异常、由调用方回落原始输出"的契约。
 */
import { describe, it, expect } from 'vitest';
import { TOOLCHAIN, validateArgs } from '../src/plugins/sec-lab-tools/toolchain.js';

describe('nikto 输出解析', () => {
  const sample = [
    '- Nikto v2.5.0',
    '+ Target IP:          10.0.0.5',
    '+ Target Hostname:    10.0.0.5',
    '+ Target Port:        80',
    '+ Start Time:         2026-11-02 10:00:00 (GMT0)',
    '+ Server: Apache/2.4.49',
    '+ /admin/: Admin login page/section found.',
    '+ OSVDB-3233: /icons/README: Apache default file found.',
    '+ CVE-2021-41773: /cgi-bin/.%2e/: Path traversal in Apache 2.4.49.',
    '+ 8163 requests: 0 error(s) and 3 item(s) reported on remote host',
    '+ End Time:           2026-11-02 10:01:00 (GMT0)',
  ].join('\r\n');

  it('只收发现项：跳过 Target/Server/StartTime 等元信息', () => {
    const r = TOOLCHAIN.nikto.parse!(sample);
    expect(r.findings.length).toBe(3);
    const titles = r.findings.map((f) => f.title).join(' | ');
    expect(titles).toContain('Admin login page');
    expect(titles).toContain('Apache default file');
    expect(titles).toContain('Path traversal');
    expect(titles).not.toContain('Target IP');
    expect(titles).not.toContain('Start Time');
  });

  it('带 CVE 的行标 medium，其余 info', () => {
    const r = TOOLCHAIN.nikto.parse!(sample);
    const cve = r.findings.find((f) => f.title.includes('Path traversal'));
    const info = r.findings.find((f) => f.title.includes('Admin login'));
    expect(cve?.severity).toBe('medium');
    expect(info?.severity).toBe('info');
  });

  it('空输出/无关输出不抛异常、返回空数组', () => {
    expect(TOOLCHAIN.nikto.parse!('').findings).toEqual([]);
    expect(TOOLCHAIN.nikto.parse!('garbage line\nanother').findings).toEqual([]);
  });
});

describe('ffuf 输出解析', () => {
  const sample = [
    '{"input":{"FUZZ":"admin"},"url":"http://t/admin","status":200,"length":1234,"words":42,"lines":10}',
    '{"input":{"FUZZ":"login"},"url":"http://t/login","status":302,"length":0,"words":0,"lines":0}',
    '{"input":{"FUZZ":"secret"},"url":"http://t/secret","status":403,"length":99,"words":5,"lines":2}',
    'not json',
  ].join('\n');

  it('逐行 JSON 解析成发现项，2xx/3xx 标 low、4xx 标 info', () => {
    const r = TOOLCHAIN.ffuf.parse!(sample);
    expect(r.findings).toHaveLength(3);
    expect(r.findings[0].title).toBe('200 · admin');
    expect(r.findings[0].severity).toBe('low');
    expect(r.findings[1].severity).toBe('low');
    expect(r.findings[2].severity).toBe('info');
  });

  it('detail 带 status/len/words，原始行截断进 evidence', () => {
    const r = TOOLCHAIN.ffuf.parse!(sample);
    expect(r.findings[0].detail).toContain('status 200');
    expect(r.findings[0].detail).toContain('len 1234');
    expect(r.findings[0].detail).toContain('words 42');
    expect(r.findings[0].evidence!.length).toBeLessThanOrEqual(500);
  });

  it('无字典时 buildArgs 不带 -w；有 YZ_SEC_WORDLIST 时带上', () => {
    const prev = process.env.YZ_SEC_WORDLIST;
    try {
      delete process.env.YZ_SEC_WORDLIST;
      const a = TOOLCHAIN.ffuf.buildArgs!({ tool: 'ffuf', target: 'http://t/FUZZ', timeoutMs: 1000 });
      expect(a).toEqual(['-u', 'http://t/FUZZ', '-json', '-s']);

      process.env.YZ_SEC_WORDLIST = 'C:/words.txt';
      const b = TOOLCHAIN.ffuf.buildArgs!({ tool: 'ffuf', target: 'http://t/FUZZ', timeoutMs: 1000 });
      expect(b).toContain('-w');
      expect(b).toContain('C:/words.txt');
    } finally {
      if (prev === undefined) delete process.env.YZ_SEC_WORDLIST;
      else process.env.YZ_SEC_WORDLIST = prev;
    }
  });
});

describe('既有解析回归', () => {
  it('nmap 开放端口聚合', () => {
    const out = '22/tcp open ssh OpenSSH 9.0\n443/tcp open https nginx 1.24\n';
    const r = TOOLCHAIN.nmap.parse!(out);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].title).toContain('2 个开放端口');
  });

  it('nuclei 逐行 JSON 命中', () => {
    const out = '{"info":{"name":"Git config","severity":"high"},"matched":"http://t/.git/config","template":"git-config"}\n';
    const r = TOOLCHAIN.nuclei.parse!(out);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].severity).toBe('high');
  });

  it('参数含 shell 元字符被拒', () => {
    expect(validateArgs(['http://t; rm -rf /'])).toMatch(/不安全/);
    expect(validateArgs(['http://t/FUZZ'])).toBeNull();
  });
});
