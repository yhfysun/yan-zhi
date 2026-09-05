// python_exec 内置工具 — 执行 Python 代码（自动检测 Python + 自动安装依赖）
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';
import { capToolOutput } from './output-cap';

/** 兼容浏览器/Node.js 的 UTF-8 base64 编码 */
function toBase64(str: string): string {
  try { return btoa(unescape(encodeURIComponent(str))); } catch {
    try { return (globalThis as any).Buffer.from(str, 'utf-8').toString('base64'); } catch {
      return '';
    }
  }
}

export class PythonExecTool implements BuiltInTool {
  name = 'python_exec';
  description = 'Execute Python code directly. Auto-detects python/python3/py. Auto-installs dependencies via pip before execution if deps are specified. Use for data processing, document generation (PPT/Word/Excel/PDF), scientific computing, etc.';

  inputSchema = {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Python code to execute' },
      deps: {
        type: 'array',
        items: { type: 'string' },
        description: 'Python packages to auto-install (pip install) before execution, e.g. ["python-pptx", "Pillow"]',
      },
      timeout: { type: 'number', description: 'Timeout in ms (default 30000, max 300000)' },
    },
    required: ['code'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const shell = getPlatformAdapter().shell;
    if (!shell) {
      return {
        content: [{ type: 'text', text: 'Error: python_exec 需要桌面端或服务端环境（shell）。Web 浏览器端不支持。' }],
        isError: true,
      };
    }

    const code = args.code as string;
    const deps = (args.deps as string[]) || [];
    const timeout = Math.min((args.timeout as number) || 30000, 300000);

    if (!code) return { content: [{ type: 'text', text: 'Error: code is required' }], isError: true };

    // 检测 Python（python / python3 / py）
    let pyCmd = '';
    let pyVersion = '';
    for (const cmd of ['python', 'python3', 'py']) {
      try {
        const r = await shell.exec(cmd, ['--version'], { timeout: 5000 });
        if (r.exitCode === 0) { pyCmd = cmd; pyVersion = (r.stdout || r.stderr || '').trim(); break; }
      } catch {}
    }
    if (!pyCmd) {
      return {
        content: [{ type: 'text', text: 'Error: 未找到 Python。请先安装 Python 3: https://python.org/downloads/\n安装后重启应用即可使用 python_exec。' }],
        isError: true,
      };
    }

    // 自动安装依赖
    if (deps.length > 0) {
      try {
        const installResult = await shell.exec(pyCmd, ['-m', 'pip', 'install', ...deps, '--quiet'], { timeout: 120000 });
        if (installResult.exitCode !== 0) {
          return {
            content: [{ type: 'text', text: `依赖安装失败: ${deps.join(', ')}\n${installResult.stderr}\n请手动安装: ${pyCmd} -m pip install ${deps.join(' ')}` }],
            isError: true,
          };
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: `依赖安装错误: ${msg}` }], isError: true };
      }
    }

    // 用 base64 编码代码，通过 python -c 执行（避免临时文件和引号转义问题）
    const encoded = toBase64(code);
    if (!encoded) return { content: [{ type: 'text', text: 'Error: 代码编码失败' }], isError: true };
    const wrapper = `import base64;exec(base64.b64decode("${encoded}").decode())`;

    try {
      const result = await shell.exec(pyCmd, ['-c', wrapper], { timeout });
      const lines: string[] = [];
      if (result.stdout) lines.push(capToolOutput(result.stdout));
      if (result.stderr) lines.push('[stderr]\n' + capToolOutput(result.stderr));
      if (!result.stdout && !result.stderr) lines.push('(无输出)');
      return { content: [{ type: 'text', text: lines.join('\n') }], isError: result.exitCode !== 0 };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Python 执行失败: ${msg}` }], isError: true };
    }
  }
}