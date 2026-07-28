// cmd_exec 内置工具 — 在系统 shell 中执行命令（支持 cmd/python/java 等）
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';

export class CmdExecTool implements BuiltInTool {
  name = 'cmd_exec';
  description = 'Execute a system shell command. Supports cmd, python, java, node, git, and any other CLI. Returns stdout, stderr, and exit code. Use for running scripts, compiling code, or any shell operation.';

  inputSchema = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The command to execute (e.g., "python", "java", "node", "git", "dir", "ls")',
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Command arguments (e.g., ["--version"] or ["script.py"])',
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the command. Defaults to current directory.',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds. Default: 30000 (30s). Max: 300000 (5min).',
      },
    },
    required: ['command'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const shell = getPlatformAdapter().shell;
    if (!shell) {
      return {
        content: [{ type: 'text', text: 'Error: cmd_exec is only available on desktop. Browser/web builds do not support shell commands.' }],
        isError: true,
      };
    }

    const command = args.command as string;
    const cmdArgs = (args.args as string[]) || [];
    const cwd = args.cwd as string | undefined;
    const timeout = Math.min((args.timeout as number) || 30000, 300000);

    if (!command) {
      return { content: [{ type: 'text', text: 'Error: command is required' }], isError: true };
    }

    try {
      const result = await shell.exec(command, cmdArgs, { cwd, timeout });
      const lines: string[] = [];
      if (result.stdout) lines.push('[stdout]\n' + result.stdout);
      if (result.stderr) lines.push('[stderr]\n' + result.stderr);
      if (!result.stdout && !result.stderr) lines.push('(no output)');
      lines.push(`\nExit code: ${result.exitCode}`);
      return { content: [{ type: 'text', text: lines.join('\n') }], isError: result.exitCode !== 0 };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Command execution error: ${msg}` }], isError: true };
    }
  }
}
