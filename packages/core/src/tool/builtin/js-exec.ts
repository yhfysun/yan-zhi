// js_exec 内置工具 — 沙箱执行 JS 代码（node:vm，捕获 console 输出与返回值，支持 async/await）
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

const MAX_LOG_ENTRIES = 100;
const MAX_LOG_LINE = 500;

function fmtValue(v: unknown): string {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v) ?? String(v); } catch { return String(v); }
}

export class JsExecTool implements BuiltInTool {
  name = 'js_exec';
  description = 'Execute JavaScript code in a sandboxed VM (node:vm) and capture console.log output plus the return value. Supports async/await (wrap result with return). No require/process/fs/network access inside the sandbox — use cmd_exec / file tools / python_exec for that. Use for calculations, data transformation, JSON processing, algorithm prototyping.';

  inputSchema = {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JavaScript code to execute. Use return <value> or console.log(...) to produce output.' },
      timeout: { type: 'number', description: 'Timeout in ms (default 10000, max 60000).' },
    },
    required: ['code'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const code = args.code as string;
    if (!code) return { content: [{ type: 'text', text: 'Error: code is required' }], isError: true };
    const timeout = Math.min(Math.max(Number(args.timeout) || 10000, 100), 60000);

    // node:vm 仅服务端/桌面端运行时可用；浏览器端动态 import 失败时给出明确提示
    let vm: typeof import('node:vm');
    try {
      vm = await import('node:vm');
    } catch {
      return {
        content: [{ type: 'text', text: 'Error: js_exec 需要服务端或桌面端环境（Node VM）。浏览器端不支持。' }],
        isError: true,
      };
    }

    const logs: string[] = [];
    let logTruncated = false;
    const pushLog = (prefix: string) => (...args: unknown[]) => {
      if (logs.length >= MAX_LOG_ENTRIES) { logTruncated = true; return; }
      const line = args.map(fmtValue).join(' ');
      logs.push(prefix + (line.length > MAX_LOG_LINE ? `${line.slice(0, MAX_LOG_LINE)}...` : line));
    };
    const sandboxConsole = {
      log: pushLog(''),
      info: pushLog(''),
      warn: pushLog('[warn] '),
      error: pushLog('[error] '),
    };

    const context = vm.createContext({ console: sandboxConsole });
    const wrapped = `(async () => {\n${code}\n})()`;

    let result: unknown;
    try {
      const script = new vm.Script(wrapped, { filename: 'js_exec.js' });
      result = await Promise.race([
        Promise.resolve(script.runInContext(context, { timeout, displayErrors: true })),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`执行超时 (${timeout}ms)`)), timeout)),
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const out = logs.length > 0 ? `${logs.join('\n')}\n` : '';
      return { content: [{ type: 'text', text: `${out}执行错误: ${msg}` }], isError: true };
    }

    const parts: string[] = [];
    if (logs.length > 0) parts.push(logs.join('\n'));
    if (logTruncated) parts.push(`... (日志超过 ${MAX_LOG_ENTRIES} 条已截断)`);
    if (result !== undefined) parts.push(`=> ${fmtValue(result)}`);
    if (parts.length === 0) parts.push('(无输出)');
    return { content: [{ type: 'text', text: parts.join('\n') }] };
  }
}
