// cmd_exec 内置工具 — 在系统 shell 中执行命令（支持 cmd/python/java 等）
import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';
import { capToolOutput } from './output-cap';
import { resolveToolPath } from './fs-walk';
import { toolError } from '../result';
import { registerBackgroundJob } from './background-job-client';

/** Windows shell 内置命令白名单（where 对这些返回非 0，需放行不预检） */
const WIN_BUILTIN_COMMANDS = new Set([
  'cd', 'chdir', 'md', 'mkdir', 'rd', 'rmdir', 'del', 'erase', 'copy', 'xcopy',
  'move', 'ren', 'rename', 'type', 'echo', 'dir', 'cls', 'ver', 'vol', 'prompt',
  'path', 'set', 'setlocal', 'endlocal', 'if', 'for', 'goto', 'call', 'start',
  'exit', 'rem', 'title', 'color', 'date', 'time', 'tree', 'where', 'which',
  'assoc', 'ftype', 'pushd', 'popd', 'setx', 'sort', 'find', 'findstr', 'more',
  'pause', 'break', 'mklink', 'powershell', 'pwsh', 'cmd',
]);

/** execSync 的最小类型签名（避免直接依赖 @types/node 的完整类型） */
type ExecSyncFn = (cmd: string, opts?: { stdio?: 'ignore'; timeout?: number }) => void;

/**
 * 动态加载 node:child_process 的 execSync。
 * 用变量拼接模块名 + @vite-ignore 避免浏览器构建静态分析该 node 内置模块；
 * 仅在 Node/Electron 主进程运行时可用，加载失败返回 null（调用方降级直接执行）。
 */
async function loadExecSync(): Promise<ExecSyncFn | null> {
  try {
    // 变量拼接模块名，使 vite/rollup 无法静态分析，保留运行时动态 import
    const mod = 'node:child' + '_process';
    const cp = (await import(/* @vite-ignore */ mod)) as { execSync?: unknown };
    if (cp && typeof cp.execSync === 'function') return cp.execSync as ExecSyncFn;
    return null;
  } catch {
    return null;
  }
}

/** 从命令字符串中提取主名（处理引号包裹、路径、空白分割） */
function extractCommandMain(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return '';
  // 引号包裹的命令：取引号内内容
  if (trimmed[0] === '"' || trimmed[0] === "'") {
    const quote = trimmed[0];
    const end = trimmed.indexOf(quote, 1);
    if (end > 0) return trimmed.slice(1, end);
  }
  // 取第一个空白前的部分作为命令主名
  const spaceIdx = trimmed.search(/\s/);
  return spaceIdx > 0 ? trimmed.slice(0, spaceIdx) : trimmed;
}

/** 对已知缺失命令给出替代建议 */
function getCommandHint(main: string): string {
  const base = main.toLowerCase();
  if (base === 'curl' || base === 'wget') {
    return '建议用 browser_navigate 或内置 fetch 替代网页抓取。';
  }
  if (base === 'python' || base === 'python3') {
    return '请确认 Python 已安装并加入 PATH。';
  }
  if (base === 'java') {
    return '请确认 JDK 已安装并加入 PATH。';
  }
  if (base === 'node' || base === 'npm' || base === 'npx' || base === 'pnpm') {
    return '请确认 Node.js 已安装并加入 PATH。';
  }
  return '请确认该命令已安装并在 PATH 中。';
}

/**
 * 预检命令是否可用。
 * - exists=true：命令存在，可执行
 * - degrade=true：预检本身不可靠（非 node 环境/超时/含路径），应降级直接执行不阻断
 */
async function checkCommandExists(main: string): Promise<{ exists: boolean; degrade: boolean }> {
  const isWin = process.platform === 'win32';
  // 提取基础名用于白名单匹配（去除路径前缀）
  const baseName = isWin
    ? (main.split(/[\\/]/).pop() || main).toLowerCase()
    : (main.split('/').pop() || main).toLowerCase();
  // Windows 内置命令白名单放行（where 对它们返回非 0）
  if (isWin && WIN_BUILTIN_COMMANDS.has(baseName)) return { exists: true, degrade: false };
  // 含路径分隔符的命令（用户指定完整路径），跳过预检交给 shell 处理
  if (main.includes('/') || main.includes('\\')) return { exists: false, degrade: true };

  const execSync = await loadExecSync();
  if (!execSync) return { exists: false, degrade: true }; // 非 node 环境，降级

  const checkCmd = isWin ? `where ${main}` : `which ${main}`;
  try {
    execSync(checkCmd, { stdio: 'ignore', timeout: 1000 });
    return { exists: true, degrade: false };
  } catch (e: unknown) {
    const err = e as { killed?: boolean; signal?: string };
    // 超时被杀 → 预检本身不可靠，降级直接执行
    if (err.killed || err.signal === 'SIGTERM') return { exists: false, degrade: true };
    // 非 0 退出码 → 命令不存在
    return { exists: false, degrade: false };
  }
}

export class CmdExecTool implements BuiltInTool {
  name = 'cmd_exec';
  description = '执行一条系统命令。支持 cmd / python / java / node / git 以及任何 CLI 工具，返回 stdout、stderr 与退出码。适用于跑脚本、编译代码或任何 shell 操作。★ 打包、构建、测试套件、安装等可能跑很久的命令传 background=true：立刻返回统一后台任务 jobId，完成会自动唤醒，不会占着一次工具调用或触发前台超时。执行前会预检命令是否存在于当前环境，避免子进程抛 ENOENT。';

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
        description: 'Working directory. Defaults to the session workspace. Relative paths are resolved against the workspace.',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds. Default: 30000 (30s). Max: 300000 (5min).',
      },
      background: {
        type: 'boolean',
        description: 'true=后台长任务：打包、构建、批量处理等立即返回 jobId，完成自动唤醒，不受前台 30s 超时约束',
      },
      wakePolicy: {
        type: 'string',
        enum: ['resume', 'notify', 'silent'],
        description: '后台任务结束后的唤醒策略：resume=自动续跑原会话（默认）、notify=只通知、silent=只更新任务卡',
      },
    },
    required: ['command'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const shell = getPlatformAdapter().shell;
    if (!shell) {
      return toolError('Error: cmd_exec is only available on desktop. Browser/web builds do not support shell commands.');
    }

    const command = args.command as string;
    const cmdArgs = (args.args as string[]) || [];
    const timeout = Math.min((args.timeout as number) || 30000, 300000);

    // ★ cwd 默认取工作目录（2026-10-19）：此前省略 cwd 时 execFile 继承的是**桌面主进程目录**
    //   （启动目录/安装目录，生产环境可能是 System32），相对路径与产物落点因此不可预期。
    //   显式相对 cwd 也按工作目录解析 —— 与 file_* 系列的路径语义保持一致。
    const workspaceDir = (ctx?.workspaceDir || '').trim();
    const rawCwd = typeof args.cwd === 'string' ? args.cwd.trim() : '';
    const cwd = rawCwd ? resolveToolPath(rawCwd, workspaceDir) : (workspaceDir || undefined);

    if (!command) {
      return toolError('Error: command is required');
    }

    // 环境预检：提取命令主名，检查是否可用，避免子进程抛 ENOENT
    const main = extractCommandMain(command);
    if (main) {
      const { exists, degrade } = await checkCommandExists(main);
      if (!degrade && !exists) {
        const hint = getCommandHint(main);
        return toolError(`命令 ${main} 在当前环境不可用。${hint}`);
      }
      // degrade=true → 预检不可靠，跳过预检直接执行（降级，不因预检误判阻断）
    }

    if (args.background === true) {
      const { runCommandBackground } = await import('./command-runtime');
      const bg = await runCommandBackground(command, cmdArgs.map(String), {
        cwd,
        workspaceDir,
        ...(ctx?.env ? { env: ctx.env } : {}),
      });
      if (!bg.ok) return toolError(`Error: ${bg.error}`);
      const job = bg.job;
      const commandText = [command, ...cmdArgs.map(String)].join(' ');
      const isBuild = /\b(build|package|compile|electron-builder|dist|bundle|install)\b/i.test(commandText);
      const kind = isBuild ? 'package_build' : 'command_process';
      const unified = ctx?.conversationId
        ? await registerBackgroundJob({
            kind,
            conversationId: ctx.conversationId,
            wakePolicy: (args.wakePolicy === 'notify' || args.wakePolicy === 'silent') ? args.wakePolicy : 'resume',
            title: `${isBuild ? '后台构建' : '后台命令'} ${commandText}`.slice(0, 240),
            status: 'running',
            idempotencyKey: `command:${job.jobId}`,
            adapterRef: `command:${job.jobId}`,
            spec: {
              nativeJobId: job.jobId,
              workspaceDir,
              jobDir: job.jobDir,
              statusPath: job.statusPath,
              logPath: job.logPath,
              cwd: cwd || '',
              command,
              args: cmdArgs.map(String),
            },
            controlCapabilities: { pause: false, resume: false, cancel: true },
          }, ctx)
        : null;
      const displayJobId = unified?.jobId || job.jobId;
      return {
        content: [{
          type: 'text',
          text: [
            `已在后台启动：${displayJobId}`,
            `类型：${kind}`,
            `作业目录：${job.jobDir}`,
            `日志：${job.logPath}`,
            '',
            unified
              ? `完成时自动唤醒原会话（wakePolicy=${unified.wakePolicy}）；不要持续轮询。`
              : `查询：job_status { "jobId": "${job.jobId}" }`,
            '后台任务不受前台超时约束，不要再用前台方式重跑；需要最新进度或控制时才查 job_status/job_control。',
          ].join('\n'),
        }],
      };
    }

    try {
      const result = await shell.exec(command, cmdArgs, { cwd, timeout, signal: ctx?.signal });
      const lines: string[] = [];
      // 截断防上下文爆炸（如 dir /s、cat 大日志），保留头尾
      if (result.stdout) lines.push('[stdout]\n' + capToolOutput(result.stdout));
      if (result.stderr) lines.push('[stderr]\n' + capToolOutput(result.stderr));
      if (!result.stdout && !result.stderr) lines.push('(no output)');
      lines.push(`\nExit code: ${result.exitCode}`);
      return { content: [{ type: 'text', text: lines.join('\n') }], isError: result.exitCode !== 0 };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return toolError(`Command execution error: ${msg}`);
    }
  }
}
