import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dbSource = readFileSync(
  fileURLToPath(new URL('../src/db.ts', import.meta.url)),
  'utf8',
);
const builtinSource = readFileSync(
  fileURLToPath(new URL('../../../packages/core/src/tool/builtin/index.ts', import.meta.url)),
  'utf8',
);

describe('代码智能体默认工具边界', () => {
  it('不把宿主 Docker 暴露成默认的内置沙箱', () => {
    expect(dbSource).not.toContain("'sandbox_exec'");
    expect(dbSource).not.toContain('sandbox_exec（Docker，默认无网络）');
  });

  it('保留真实可验收的代码能力', () => {
    expect(dbSource).toContain("'code_verify'");
    expect(dbSource).toContain("'git_worktree'");
  });

  it('不把外部 Codex CLI 当成应用自身编程能力', () => {
    expect(dbSource).not.toContain("'codex_exec'");
    expect(builtinSource).not.toContain('new CodexExecTool()');
    expect(builtinSource).not.toContain("from './codex-exec'");
  });
});
