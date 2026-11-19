import { describe, expect, it } from 'vitest';
import {
  listAlgorithmCodeRuntimes,
  runAlgorithmCode,
} from '../src/services/algorithm-code-runner';

describe('algorithm practice code runner', () => {
  it('always exposes the bundled/current Node runtime', async () => {
    const runtimes = await listAlgorithmCodeRuntimes();
    const javascript = runtimes.find((runtime) => runtime.id === 'javascript');
    expect(javascript).toMatchObject({
      available: true,
      label: 'JavaScript / Node.js',
    });
    expect(javascript?.version.length).toBeGreaterThan(0);
  });

  it('runs JavaScript with stdin and returns captured output', async () => {
    const result = await runAlgorithmCode({
      language: 'javascript',
      source: [
        "const fs = require('node:fs');",
        "const value = Number(fs.readFileSync(0, 'utf8').trim());",
        'console.log(value * 2);',
      ].join('\n'),
      stdin: '21',
    });
    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe('42');
    expect(result.exitCode).toBe(0);
    expect(result.runtime).toContain('Node.js');
  });

  it('returns runtime errors without crashing the server', async () => {
    const result = await runAlgorithmCode({
      language: 'javascript',
      source: "throw new Error('practice failure');",
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('practice failure');
  });

  it('uses the bundled or detected Python runtime when available', async () => {
    const runtimes = await listAlgorithmCodeRuntimes();
    const python = runtimes.find((runtime) => runtime.id === 'python');
    if (!python?.available) return;
    const result = await runAlgorithmCode({
      language: 'python',
      source: 'value = int(input())\nprint(value + 1)',
      stdin: '41',
    });
    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe('42');
  });

  it('compiles and runs a detected Java/C/C++ toolchain when present', async () => {
    const runtimes = await listAlgorithmCodeRuntimes();
    const compiled = runtimes.find((runtime) =>
      runtime.available && ['java', 'c', 'cpp'].includes(runtime.id),
    );
    if (!compiled) return;
    const source = compiled.id === 'java'
      ? 'public class Main { public static void main(String[] args) { System.out.println(42); } }'
      : compiled.id === 'c'
        ? '#include <stdio.h>\nint main(void) { printf("42\\n"); return 0; }'
        : '#include <iostream>\nint main() { std::cout << 42 << std::endl; return 0; }';
    const result = await runAlgorithmCode({
      language: compiled.id as 'java' | 'c' | 'cpp',
      source,
    });
    expect(result.ok, `${compiled.id}: ${result.stderr}`).toBe(true);
    expect(result.stdout.trim()).toBe('42');
  });

  it('rejects empty source before spawning a process', async () => {
    await expect(runAlgorithmCode({
      language: 'javascript',
      source: '   ',
    })).rejects.toThrow('代码不能为空');
  });
});
