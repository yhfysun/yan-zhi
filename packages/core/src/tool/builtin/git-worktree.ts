import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { createExecutionReceipt } from '@yan-zhi/shared';
import { getPlatformAdapter } from '../../platform/types';
import { resolveToolPath } from './fs-walk';
import { capToolOutput } from './output-cap';
import { toolError } from '../result';

export type GitWorktreeAction = 'list' | 'create' | 'remove';

export interface GitWorktreePlanInput {
  action: GitWorktreeAction;
  repo: string;
  path?: string;
  branch?: string;
  base?: string;
  force?: boolean;
}

function safeRef(value: string): string {
  if (!/^[A-Za-z0-9._/-]+$/.test(value) || value.includes('..') || value.startsWith('-')) {
    throw new Error(`非法分支/基线名：${value}`);
  }
  return value;
}

export function buildGitWorktreeArgs(input: GitWorktreePlanInput): string[] {
  const base = ['-C', input.repo, 'worktree'];
  if (input.action === 'list') return [...base, 'list', '--porcelain'];
  if (!input.path) throw new Error('worktree 路径不能为空');
  if (input.action === 'create') {
    const out = [...base, 'add'];
    if (input.branch) out.push('-b', safeRef(input.branch));
    out.push(input.path);
    if (input.base) out.push(safeRef(input.base));
    return out;
  }
  return [...base, 'remove', ...(input.force ? ['--force'] : []), input.path];
}

export class GitWorktreeTool implements BuiltInTool {
  name = 'git_worktree';
  description =
    '管理 Git worktree，为长编码任务提供独立工作区。action=list 列出；create 可新建分支与目录；remove 默认拒绝未清理的 worktree，force=true 才强制。'
    + '适合并行任务隔离，避免多个智能体在同一工作目录互相覆盖。';
  inputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'create', 'remove'] },
      repo: { type: 'string', description: '仓库目录，默认当前工作目录。' },
      path: { type: 'string', description: 'worktree 目录；create/remove 必填。相对路径按 repo 解析。' },
      branch: { type: 'string', description: 'create 时可选：新分支名。' },
      base: { type: 'string', description: 'create 时可选基线，默认当前 HEAD。' },
      force: { type: 'boolean', description: 'remove 时是否强制。' },
    },
    required: ['action'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const shell = getPlatformAdapter().shell;
    if (!shell) return toolError('git_worktree 仅在本机后端可用');
    const repo = args.repo ? resolveToolPath(String(args.repo), ctx?.workspaceDir) : (ctx?.workspaceDir || '');
    if (!repo) return toolError('git_worktree 需要仓库目录');
    const action = args.action === 'create' || args.action === 'remove' ? args.action : 'list';
    const targetPath = args.path ? resolveToolPath(String(args.path), repo) : undefined;
    let plan: string[];
    try {
      plan = buildGitWorktreeArgs({
        action,
        repo,
        path: targetPath,
        branch: String(args.branch || '').trim() || undefined,
        base: String(args.base || '').trim() || undefined,
        force: args.force === true,
      });
    } catch (error: any) {
      return toolError(error?.message || String(error));
    }
    const startedAt = Date.now();
    const result = await shell.exec('git', plan, { cwd: repo, timeout: 120_000, signal: ctx?.signal });
    const ok = result.exitCode === 0;
    const receipt = createExecutionReceipt({
      target: 'code',
      action: `git_worktree_${action}`,
      ok,
      startedAt,
      evidence: [{
        kind: 'command',
        summary: `Git worktree ${action} ${ok ? '完成' : '失败'}（exit=${result.exitCode}）`,
        ref: targetPath || repo,
        data: { stdout: capToolOutput(result.stdout || '').slice(0, 8000), stderr: capToolOutput(result.stderr || '').slice(0, 8000) },
      }],
      error: ok ? undefined : `exit=${result.exitCode}`,
    });
    return {
      content: [{
        type: 'text',
        text: [
          `${ok ? '✅' : '❌'} git_worktree ${action}`,
          result.stdout ? `[stdout]\n${capToolOutput(result.stdout)}` : '',
          result.stderr ? `[stderr]\n${capToolOutput(result.stderr)}` : '',
        ].filter(Boolean).join('\n'),
      }],
      _meta: { executionReceipt: receipt },
      ...(ok ? {} : { isError: true }),
    } as McpCallResult;
  }
}
