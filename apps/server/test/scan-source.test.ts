/**
 * 源码扫描引擎单测（P1）。
 *
 * 钉住四件事：
 *  1. 规则命中与占位符排除（避免报告被示例值淹没）；
 *  2. 引擎端到端能产出统一 ScanFinding；
 *  3. 同仓库两次扫描指纹一致（基线才有意义）；
 *  4. 接受基线后第二次只报新增（suppressed 不进报告）。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rulesForExt, type RuleFile } from '../src/plugins/sec-lab-tools/scan/source/rules';
import { createSourceScanner } from '../src/plugins/sec-lab-tools/scan/source/engine';
import { runScan, acceptBaseline, type ScanStore, type ScanBaseline } from '../src/plugins/sec-lab-tools/scan/orchestrator';
import { jobToOutput, type ScanJob } from '../src/plugins/sec-lab-tools/scan/types';
import { minVersion, compareVersion } from '../src/plugins/sec-lab-tools/scan/source/deps';
import { maskSecrets } from '../src/plugins/sec-lab-tools/scan/redact';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const d of tmpDirs.splice(0)) await fs.rm(d, { recursive: true, force: true });
});

function ruleFile(rel: string, text: string): RuleFile {
  return { rel, ext: path.extname(rel), text, lines: text.split(/\r?\n/) };
}

function runRule(id: string, file: RuleFile) {
  const rule = rulesForExt(file.ext).find((r) => r.id === id);
  if (!rule) throw new Error(`rule not found: ${id}`);
  return rule.scan(file);
}

async function tmpRepo(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yz-scan-'));
  tmpDirs.push(dir);
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, text, 'utf8');
  }
  return dir;
}

function memStore(): ScanStore & { jobs: ScanJob[]; baselines: ScanBaseline[] } {
  const s = {
    jobs: [] as ScanJob[],
    baselines: [] as ScanBaseline[],
    loadJobs: async () => s.jobs,
    saveJobs: async (jobs: ScanJob[]) => { s.jobs = jobs; },
    loadBaselines: async () => s.baselines,
    saveBaselines: async (list: ScanBaseline[]) => { s.baselines = list; },
  };
  return s;
}

describe('源码规则 · 命中与占位符', () => {
  it('识别硬编码凭据，但放过占位符', () => {
    const real = ruleFile('a.ts', `const apiKey = "Ab3xK9mP2qR7sT4vW8yZ1cN6";`);
    expect(runRule('hardcoded-secret', real).length).toBe(1);

    const placeholder = ruleFile('b.ts', `const apiKey = "your_api_key_here";`);
    expect(runRule('hardcoded-secret', placeholder).length).toBe(0);
  });

  it('识别 eval 与 Electron 关闭 webSecurity', () => {
    expect(runRule('eval', ruleFile('c.ts', `eval(userInput);`)).length).toBe(1);
    expect(runRule('electron-web-security-off', ruleFile('main.cjs', `webSecurity: false,`)).length).toBe(1);
  });

  it('高熵字符串命中，普通路径不命中', () => {
    expect(runRule('high-entropy-secret', ruleFile('d.ts', `const k = "aB3xK9mP2qR7sT4vW8yZ1cN6";`)).length).toBe(1);
    expect(runRule('high-entropy-secret', ruleFile('e.ts', `const p = "/usr/local/lib/node_modules/app";`)).length).toBe(0);
  });

  it('默认口令识别，占位符跳过', () => {
    expect(runRule('default-credential', ruleFile('f.ts', `const admin = "123456";`)).length).toBe(1);
    expect(runRule('default-credential', ruleFile('g.ts', `const admin = "<your password>";`)).length).toBe(0);
  });
});

describe('源码引擎 · 端到端与基线', () => {
  it('产出统一 ScanFinding，且两次扫描指纹一致', async () => {
    const dir = await tmpRepo({
      'src/app.ts': [
        `const apiKey = "Ab3xK9mP2qR7sT4vW8yZ1cN6";`,
        `eval(req.query.code);`,
      ].join('\n'),
      'desktop/main.cjs': `new BrowserWindow({ webSecurity: false });`,
    });
    const store = memStore();
    const scanner = createSourceScanner();

    const first = await runScan({ kind: 'source', target: dir, profile: 'quick', scanners: [scanner], store });
    expect(first.status).toBe('done');
    expect(first.findings.length).toBeGreaterThanOrEqual(3);
    expect(first.findings.map((f) => f.ruleId)).toEqual(
      expect.arrayContaining(['hardcoded-secret', 'eval', 'electron-web-security-off']),
    );
    expect(first.findings.every((f) => f.fingerprint.includes('@'))).toBe(true);

    const second = await runScan({ kind: 'source', target: dir, profile: 'quick', scanners: [scanner], store });
    const key = (j: ScanJob) => j.findings.map((f) => f.fingerprint).sort().join(',');
    expect(key(second)).toBe(key(first));
  });

  it('接受基线后再次扫描：发现项被抑制且不进报告', async () => {
    const dir = await tmpRepo({ 'src/a.ts': `eval(x);` });
    const store = memStore();
    const scanner = createSourceScanner();

    const first = await runScan({ kind: 'source', target: dir, profile: 'quick', scanners: [scanner], store });
    await acceptBaseline(store, first);
    const second = await runScan({ kind: 'source', target: dir, profile: 'quick', scanners: [scanner], store });

    expect(second.findings.length).toBe(first.findings.length);
    expect(second.findings.every((f) => f.suppressed)).toBe(true);
    expect(jobToOutput(second).findings.length).toBe(0);
  });

  it('standard 剖面核对依赖快照', async () => {
    const dir = await tmpRepo({
      'package.json': JSON.stringify({ dependencies: { lodash: '^4.17.15' } }),
      'src/a.ts': `export const x = 1;`,
    });
    const job = await runScan({
      kind: 'source', target: dir, profile: 'standard',
      scanners: [createSourceScanner()], store: memStore(),
    });
    expect(job.findings.some((f) => f.ruleId === 'vulnerable-dependency')).toBe(true);
  });

  it('目标不存在时作业失败并带错误信息', async () => {
    const job = await runScan({
      kind: 'source', target: path.join(os.tmpdir(), 'yz-no-such-dir-xyz'),
      scanners: [createSourceScanner()], store: memStore(),
    });
    expect(job.status).toBe('failed');
    expect(job.error).toContain('路径不存在');
  });
});

describe('依赖版本比较', () => {
  it('从 range 取最低版本并比较', () => {
    expect(minVersion('^4.17.15')).toBe('4.17.15');
    expect(minVersion('~1.2.6')).toBe('1.2.6');
    expect(compareVersion('4.17.15', '4.17.21')).toBe(-1);
    expect(compareVersion('4.17.21', '4.17.21')).toBe(0);
    expect(compareVersion('5.0.0', '4.17.21')).toBe(1);
  });
});

describe('输出脱敏 · 密钥不进运行卡/审计/落库', () => {
  it('云密钥前缀、引号长串、键值对都被打码', () => {
    const key = 'sk-abcdefghijklmnopqrstuvwxyz012345';
    const masked = maskSecrets(`const apiKey = "${key}";`);
    expect(masked).not.toContain(key);
    expect(masked).toContain('sk-abcd');

    const kv = maskSecrets('password=SuperSecret123');
    expect(kv).not.toContain('SuperSecret123');
    expect(kv).toContain('password=');
  });

  it('扫描结果落库前已完成脱敏（作业里的 evidence 不含完整凭据）', async () => {
    const secret = 'Ab3xK9mP2qR7sT4vW8yZ1cN6';
    const dir = await tmpRepo({ 'src/a.ts': `const apiKey = "${secret}";` });
    const job = await runScan({
      kind: 'source', target: dir, profile: 'quick',
      scanners: [createSourceScanner()], store: memStore(),
    });
    const f = job.findings.find((x) => x.ruleId === 'hardcoded-secret')!;
    expect(f).toBeTruthy();
    expect(f.evidence).not.toContain(secret);
    expect(f.detail).not.toContain(secret);
    expect(jobToOutput(job).findings[0].detail).not.toContain(secret);
  });
});
