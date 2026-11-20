import { describe, expect, it } from 'vitest';
import { buildCodexExecArgs } from './codex-exec';
import { buildDockerSandboxArgs } from './sandbox-exec';

describe('external and sandbox execution plans', () => {
  it('builds codex exec args without shell interpolation', () => {
    expect(buildCodexExecArgs({
      root: 'C:/repo', prompt: 'fix "quotes"\nand newline',
      sandbox: 'workspace-write', model: 'gpt-test',
    })).toEqual([
      'exec', '-C', 'C:/repo', '-s', 'workspace-write', '--ephemeral', '--json',
      '-m', 'gpt-test', 'fix "quotes"\nand newline',
    ]);
  });

  it('defaults a Docker sandbox to no network and least privilege', () => {
    const args = buildDockerSandboxArgs({
      workspaceDir: 'C:/repo', image: 'node:22', command: ['npm', 'test'],
      network: 'none', readonly: false, memoryMb: 1024, cpus: 1.5, pidsLimit: 128,
    });
    expect(args).toContain('--network');
    expect(args[args.indexOf('--network') + 1]).toBe('none');
    expect(args).toContain('no-new-privileges');
    expect(args).toContain('ALL');
    expect(args).toContain('C:/repo:/workspace');
  });
});
