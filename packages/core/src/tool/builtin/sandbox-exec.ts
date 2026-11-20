import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { createExecutionReceipt } from '@yan-zhi/shared';
import { getPlatformAdapter } from '../../platform/types';
import { resolveToolPath } from './fs-walk';
import { capToolOutput } from './output-cap';
import { toolError } from '../result';

export interface SandboxDockerPlanInput {
  workspaceDir: string;
  image: string;
  command: string[];
  network: 'none' | 'bridge';
  readonly: boolean;
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
}

export function buildDockerSandboxArgs(input: SandboxDockerPlanInput): string[] {
  const mount = input.readonly
    ? `${input.workspaceDir}:/workspace:ro`
    : `${input.workspaceDir}:/workspace`;
  return [
    'run', '--rm', '-i',
    '--network', input.network,
    '--memory', `${Math.max(64, input.memoryMb)}m`,
    '--cpus', String(Math.max(0.1, input.cpus)),
    '--pids-limit', String(Math.max(16, input.pidsLimit)),
    '--security-opt', 'no-new-privileges',
    '--cap-drop', 'ALL',
    '-v', mount,
    '-w', '/workspace',
    input.image,
    ...input.command,
  ];
}

export class SandboxExecTool implements BuiltInTool {
  name = 'sandbox_exec';
  description =
    '调用宿主已安装的 Docker 执行命令（不是应用内置 Docker）：默认禁用容器网络、丢弃全部 capabilities、限制内存/CPU/PID，并只挂载当前工作目录。'
    + '这是可选外部运行时能力，不保证安装环境可用；Docker 不可用时明确失败，不退回宿主机直接执行。';
  inputSchema = {
    type: 'object',
    properties: {
      command: { type: 'array', items: { type: 'string' }, description: '命令与参数，例如 ["npm","test"]。' },
      cwd: { type: 'string', description: '要挂载的工作目录，默认当前会话工作目录。' },
      image: { type: 'string', description: '容器镜像，默认 node:22-bookworm-slim。' },
      allowPull: { type: 'boolean', description: '镜像不存在时是否允许联网拉取。默认 false，避免隐式访问镜像仓库。' },
      network: { type: 'string', enum: ['none', 'bridge'], description: '默认 none。' },
      readonly: { type: 'boolean', description: 'true 时工作目录只读挂载。' },
      memoryMb: { type: 'number', description: '内存限制，默认 2048。' },
      cpus: { type: 'number', description: 'CPU 限制，默认 2。' },
      pidsLimit: { type: 'number', description: '进程数限制，默认 256。' },
      timeoutMs: { type: 'number', description: '默认 300000，最大 1800000。' },
    },
    required: ['command'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const shell = getPlatformAdapter().shell;
    if (!shell) return toolError('sandbox_exec 仅在本机后端可用（需要宿主 Docker）');
    const command = Array.isArray(args.command) ? args.command.map(String).filter(Boolean) : [];
    if (!command.length) return toolError('command 不能为空');
    const root = args.cwd ? resolveToolPath(String(args.cwd), ctx?.workspaceDir) : (ctx?.workspaceDir || '');
    if (!root) return toolError('sandbox_exec 需要工作目录');
    const probe = await shell.exec('docker', ['version', '--format', '{{.Server.Version}}'], {
      cwd: root, timeout: 5000, signal: ctx?.signal,
    });
    if (probe.exitCode !== 0) {
      return toolError(`宿主 Docker 不可用，拒绝无隔离执行：${(probe.stderr || probe.stdout || 'docker unavailable').slice(0, 500)}`);
    }
    const image = String(args.image || 'node:22-bookworm-slim');
    const imageProbe = await shell.exec('docker', ['image', 'inspect', image], {
      cwd: root, timeout: 10000, signal: ctx?.signal,
    });
    if (imageProbe.exitCode !== 0) {
      if (args.allowPull !== true) {
        return toolError(`本地不存在镜像 ${image}。为避免隐式联网，默认不自动拉取；确认后可传 allowPull:true。`);
      }
      const pull = await shell.exec('docker', ['pull', image], {
        cwd: root, timeout: 1_800_000, signal: ctx?.signal,
      });
      if (pull.exitCode !== 0) {
        return toolError(`拉取镜像失败：${(pull.stderr || pull.stdout || image).slice(0, 1000)}`);
      }
    }
    const plan = buildDockerSandboxArgs({
      workspaceDir: root,
      image,
      command,
      network: args.network === 'bridge' ? 'bridge' : 'none',
      readonly: args.readonly === true,
      memoryMb: Number(args.memoryMb) || 2048,
      cpus: Number(args.cpus) || 2,
      pidsLimit: Number(args.pidsLimit) || 256,
    });
    const startedAt = Date.now();
    const result = await shell.exec('docker', plan, {
      cwd: root,
      timeout: Math.max(30_000, Math.min(1_800_000, Number(args.timeoutMs) || 300_000)),
      signal: ctx?.signal,
    });
    const ok = result.exitCode === 0;
    const receipt = createExecutionReceipt({
      target: 'system',
      action: 'sandbox_exec',
      ok,
      startedAt,
      evidence: [{
        kind: 'command',
        summary: `宿主 Docker 隔离执行 ${ok ? '通过' : '失败'}（exit=${result.exitCode}）`,
        ref: command.join(' '),
        data: {
          image,
          network: args.network === 'bridge' ? 'bridge' : 'none',
          stdout: capToolOutput(result.stdout || '').slice(0, 8000),
          stderr: capToolOutput(result.stderr || '').slice(0, 8000),
        },
      }],
      error: ok ? undefined : `exit=${result.exitCode}`,
    });
    return {
      content: [{
        type: 'text',
        text: [
          `${ok ? '✅' : '❌'} sandbox_exec exit=${result.exitCode} ${Date.now() - startedAt}ms`,
          result.stdout ? `[stdout]\n${capToolOutput(result.stdout)}` : '',
          result.stderr ? `[stderr]\n${capToolOutput(result.stderr)}` : '',
        ].filter(Boolean).join('\n'),
      }],
      _meta: { executionReceipt: receipt },
      ...(ok ? {} : { isError: true }),
    } as McpCallResult;
  }
}
