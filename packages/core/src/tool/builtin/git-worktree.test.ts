import { describe, expect, it } from 'vitest';
import { buildGitWorktreeArgs } from './git-worktree';

describe('git worktree planning', () => {
  it('creates an isolated branch and path', () => {
    expect(buildGitWorktreeArgs({
      action: 'create',
      repo: 'C:/repo',
      path: 'C:/repo-task',
      branch: 'codex/task-a',
      base: 'main',
    })).toEqual([
      '-C', 'C:/repo', 'worktree', 'add', '-b', 'codex/task-a', 'C:/repo-task', 'main',
    ]);
  });

  it('rejects option-like branch names', () => {
    expect(() => buildGitWorktreeArgs({
      action: 'create', repo: '/repo', path: '/tmp/wt', branch: '--force',
    })).toThrow();
  });

  it('lists porcelain and removes only the requested path', () => {
    expect(buildGitWorktreeArgs({ action: 'list', repo: '/repo' })).toEqual([
      '-C', '/repo', 'worktree', 'list', '--porcelain',
    ]);
    expect(buildGitWorktreeArgs({
      action: 'remove', repo: '/repo', path: '/tmp/wt', force: true,
    })).toEqual(['-C', '/repo', 'worktree', 'remove', '--force', '/tmp/wt']);
  });
});
