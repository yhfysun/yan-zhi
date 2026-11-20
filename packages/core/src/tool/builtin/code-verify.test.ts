import { describe, expect, it } from 'vitest';
import { buildCodeVerifyPlan, detectPackageManager } from './code-verify';

describe('code_verify planning', () => {
  it('quick mode runs typecheck and only a targeted test pattern', () => {
    expect(buildCodeVerifyPlan({
      packageManager: 'pnpm',
      scripts: { typecheck: 'vue-tsc --noEmit', test: 'vitest run', build: 'vite build' },
      mode: 'quick',
      testPattern: 'execution.test.ts',
    })).toEqual([
      { label: 'typecheck', command: 'pnpm', args: ['run', 'typecheck'], required: true },
      { label: 'test', command: 'pnpm', args: ['run', 'test', '--', 'execution.test.ts'], required: true },
    ]);
  });

  it('full mode runs present scripts in stable order and includes build', () => {
    expect(buildCodeVerifyPlan({
      packageManager: 'npm',
      scripts: { test: 'vitest run', build: 'vite build', lint: 'eslint .', typecheck: 'tsc --noEmit' },
      mode: 'full',
    }).map((c) => c.label)).toEqual(['typecheck', 'lint', 'test', 'build']);
  });

  it('detects package manager from lockfiles', () => {
    expect(detectPackageManager(new Set(['pnpm-lock.yaml']))).toBe('pnpm');
    expect(detectPackageManager(new Set(['yarn.lock']))).toBe('yarn');
    expect(detectPackageManager(new Set(['package.json']))).toBe('npm');
  });
});
