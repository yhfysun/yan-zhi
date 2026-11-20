import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { createExecutionReceipt } from '@yan-zhi/shared';
import { getPlatformAdapter } from '../../platform/types';
import { resolveToolPath } from './fs-walk';
import { capToolOutput } from './output-cap';
import { toolError } from '../result';

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun';
export type CodeVerifyMode = 'quick' | 'full';

export interface CodeVerifyCommand {
  label: string;
  command: string;
  args: string[];
  required: boolean;
}

export interface BuildCodeVerifyPlanInput {
  packageManager: PackageManager;
  scripts: Record<string, string>;
  mode: CodeVerifyMode;
  testPattern?: string;
  includeBuild?: boolean;
}

function scriptArgs(pm: PackageManager, name: string, extra: string[] = []): string[] {
  if (pm === 'yarn') return [name, ...extra];
  if (pm === 'bun') return ['run', name, ...extra];
  return ['run', name, ...extra];
}

/** 生成可解释、可测试的验证计划；不做隐式“全都跑”。 */
export function buildCodeVerifyPlan(input: BuildCodeVerifyPlanInput): CodeVerifyCommand[] {
  const scripts = input.scripts && typeof input.scripts === 'object' ? input.scripts : {};
  const names = input.mode === 'full'
    ? ['typecheck', 'lint', 'test']
    : ['typecheck'];
  const plan: CodeVerifyCommand[] = [];
  for (const name of names) {
    if (!scripts[name]) continue;
    const extra = name === 'test' && input.testPattern ? ['--', input.testPattern] : [];
    plan.push({
      label: name,
      command: input.packageManager,
      args: scriptArgs(input.packageManager, name, extra),
      required: name !== 'lint',
    });
  }
  if (input.mode === 'quick' && scripts.test && input.testPattern) {
    plan.push({
      label: 'test',
      command: input.packageManager,
      args: scriptArgs(input.packageManager, 'test', ['--', input.testPattern]),
      required: true,
    });
  }
  if ((input.mode === 'full' || input.includeBuild === true) && scripts.build) {
    plan.push({
      label: 'build',
      command: input.packageManager,
      args: scriptArgs(input.packageManager, 'build'),
      required: true,
    });
  }
  return plan;
}

export function detectPackageManager(files: Set<string>): PackageManager {
  if (files.has('pnpm-lock.yaml')) return 'pnpm';
  if (files.has('yarn.lock')) return 'yarn';
  if (files.has('bun.lockb') || files.has('bun.lock')) return 'bun';
  return 'npm';
}

type FsMod = {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
};

async function loadFs(): Promise<FsMod | null> {
  try {
    return await import(/* @vite-ignore */ 'node:' + 'fs') as FsMod;
  } catch {
    return null;
  }
}

function workspaceFiles(fs: FsMod, root: string): Set<string> {
  return new Set(
    ['package.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']
      .filter((name) => fs.existsSync(resolveToolPath(name, root))),
  );
}

export class CodeVerifyTool implements BuiltInTool {
  name = 'code_verify';
  description =
    '运行代码变更的项目级验证。自动识别 pnpm/npm/yarn/bun 和 package.json scripts，按 quick（typecheck，可选指定测试）或 full（typecheck/lint/test/build）执行，并返回每条命令的退出码、stdout/stderr、耗时和统一执行回执。'
    + '改完代码后优先用它；不要声称“应该没问题”而不运行验证。';
  inputSchema = {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: '项目目录，默认当前工作目录。' },
      mode: { type: 'string', enum: ['quick', 'full'], description: 'quick=类型检查+可选测试；full=类型检查/lint/测试/构建。默认 quick。' },
      testPattern: { type: 'string', description: '可选：传给 test script 的测试文件/名称 pattern（放在 -- 之后）。' },
      includeBuild: { type: 'boolean', description: 'quick 模式下也运行 build。' },
      timeoutMs: { type: 'number', description: '单条命令超时，默认 180000，最大 900000。' },
    },
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const shell = getPlatformAdapter().shell;
    if (!shell) return toolError('code_verify 仅在桌面/本机后端可用');
    const fs = await loadFs();
    if (!fs) return toolError('code_verify 无法读取项目文件');
    const root = args.cwd ? resolveToolPath(String(args.cwd), ctx?.workspaceDir) : (ctx?.workspaceDir || '');
    if (!root) return toolError('code_verify 需要工作目录');
    const packageJsonPath = resolveToolPath('package.json', root);
    if (!fs.existsSync(packageJsonPath)) return toolError(`未找到 package.json：${packageJsonPath}`);
    let scripts: Record<string, string> = {};
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
    } catch (error: any) {
      return toolError(`package.json 解析失败：${error?.message || error}`);
    }
    const packageManager = detectPackageManager(workspaceFiles(fs, root));
    const mode = args.mode === 'full' ? 'full' : 'quick';
    const plan = buildCodeVerifyPlan({
      packageManager,
      scripts,
      mode,
      testPattern: String(args.testPattern || '').trim() || undefined,
      includeBuild: args.includeBuild === true,
    });
    if (!plan.length) {
      return toolError('没有找到可运行的验证脚本。请在 package.json 配置 typecheck/test/build，或显式使用 cmd_exec 运行项目命令。');
    }

    const startedAt = Date.now();
    const timeoutMs = Math.max(10_000, Math.min(900_000, Number(args.timeoutMs) || 180_000));
    const runs: Array<Record<string, unknown>> = [];
    let failed = false;
    for (const step of plan) {
      const commandStartedAt = Date.now();
      const result = await shell.exec(step.command, step.args, {
        cwd: root,
        timeout: timeoutMs,
        signal: ctx?.signal,
      });
      const ok = result.exitCode === 0;
      runs.push({
        label: step.label,
        command: [step.command, ...step.args].join(' '),
        ok,
        exitCode: result.exitCode,
        durationMs: Date.now() - commandStartedAt,
        stdout: capToolOutput(result.stdout || ''),
        stderr: capToolOutput(result.stderr || ''),
      });
      if (!ok && step.required) {
        failed = true;
        break;
      }
    }
    const receipt = createExecutionReceipt({
      target: 'code',
      action: 'code_verify',
      ok: !failed,
      startedAt,
      evidence: runs.map((run) => ({
        kind: run.label === 'test' ? 'test' : 'command',
        summary: `${run.label} ${run.ok ? '通过' : '失败'}（exit=${run.exitCode}）`,
        ref: String(run.command || ''),
        data: {
          exitCode: run.exitCode,
          durationMs: run.durationMs,
          stdout: String(run.stdout || '').slice(0, 4000),
          stderr: String(run.stderr || '').slice(0, 4000),
        },
      })),
      error: failed ? '项目验证未通过' : undefined,
    });
    const lines = [
      `${failed ? '❌' : '✅'} code_verify ${failed ? '未通过' : '通过'}（${mode}，${packageManager}，${runs.length}/${plan.length} 条命令）`,
      ...runs.map((run) => `- ${run.label}: ${run.ok ? 'ok' : 'failed'} exit=${run.exitCode} ${run.durationMs}ms`),
    ];
    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      _meta: { executionReceipt: receipt },
      ...(failed ? { isError: true } : {}),
    } as McpCallResult;
  }
}
