import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { createExecutionReceipt } from '@yan-zhi/shared';
import { getPlatformAdapter } from '../../platform/types';
import { resolveToolPath } from './fs-walk';
import { capToolOutput } from './output-cap';
import { toolError } from '../result';

export interface CodexExecPlanInput {
  root: string;
  prompt: string;
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access';
  model?: string;
  ephemeral?: boolean;
  json?: boolean;
}

/** 构造 codex exec 参数；不拼 shell 字符串，避免 prompt 中的引号/换行被解释。 */
export function buildCodexExecArgs(input: CodexExecPlanInput): string[] {
  const args = ['exec', '-C', input.root, '-s', input.sandbox];
  if (input.ephemeral !== false) args.push('--ephemeral');
  if (input.json !== false) args.push('--json');
  if (input.model) args.push('-m', input.model);
  args.push(input.prompt);
  return args;
}

export class CodexExecTool implements BuiltInTool {
  name = 'codex_exec';
  description =
    '可选外部执行器：调用本机已安装的 `codex exec`，让 Codex 在指定工作目录执行一个自包含任务。'
    + '默认 ephemeral + workspace-write + JSONL，不绕过言智的路径与权限审计；仅在用户明确要求 Codex 或对比执行器时使用。';
  inputSchema = {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '交给 Codex 的完整自包含任务。' },
      cwd: { type: 'string', description: '工作目录，默认当前会话工作目录。' },
      model: { type: 'string', description: '可选 Codex 模型 ID。' },
      sandbox: { type: 'string', enum: ['read-only', 'workspace-write', 'danger-full-access'], description: '默认 workspace-write。' },
      timeoutMs: { type: 'number', description: '默认 600000，最大 1800000。' },
    },
    required: ['prompt'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const shell = getPlatformAdapter().shell;
    if (!shell) return toolError('codex_exec 仅在本机后端可用');
    const root = args.cwd ? resolveToolPath(String(args.cwd), ctx?.workspaceDir) : (ctx?.workspaceDir || '');
    const prompt = String(args.prompt || '').trim();
    if (!root) return toolError('codex_exec 需要工作目录');
    if (!prompt) return toolError('prompt 不能为空');
    const version = await shell.exec('codex', ['--version'], { cwd: root, timeout: 5000, signal: ctx?.signal });
    if (version.exitCode !== 0) {
      return toolError(`本机未找到可用的 Codex CLI：${(version.stderr || version.stdout || 'command not found').slice(0, 500)}`);
    }
    const startedAt = Date.now();
    const sandbox = args.sandbox === 'read-only' || args.sandbox === 'danger-full-access'
      ? args.sandbox
      : 'workspace-write';
    const plan = buildCodexExecArgs({
      root,
      prompt,
      sandbox,
      model: String(args.model || '').trim() || undefined,
    });
    const timeout = Math.max(30_000, Math.min(1_800_000, Number(args.timeoutMs) || 600_000));
    const result = await shell.exec('codex', plan, { cwd: root, timeout, signal: ctx?.signal });
    const ok = result.exitCode === 0;
    const receipt = createExecutionReceipt({
      target: 'code',
      action: 'codex_exec',
      ok,
      startedAt,
      evidence: [{
        kind: 'command',
        summary: `Codex CLI ${ok ? '完成' : '失败'}（exit=${result.exitCode}）`,
        ref: `codex ${plan[0]} ... ${sandbox}`,
        data: { stdout: capToolOutput(result.stdout || '').slice(0, 8000), stderr: capToolOutput(result.stderr || '').slice(0, 8000) },
      }],
      error: ok ? undefined : `exit=${result.exitCode}`,
    });
    const text = [
      `${ok ? '✅' : '❌'} codex_exec exit=${result.exitCode} ${Date.now() - startedAt}ms`,
      result.stdout ? `[stdout]\n${capToolOutput(result.stdout)}` : '',
      result.stderr ? `[stderr]\n${capToolOutput(result.stderr)}` : '',
    ].filter(Boolean).join('\n');
    return {
      content: [{ type: 'text', text }],
      _meta: { executionReceipt: receipt },
      ...(ok ? {} : { isError: true }),
    } as McpCallResult;
  }
}
