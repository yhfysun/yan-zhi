// JS 代码沙箱执行器
import type { McpCallResult } from '../mcp/client';

export async function runInSandbox(
  code: string,
  fnName: string,
  args: Record<string, unknown>,
  options: { timeout: number } = { timeout: 30000 },
): Promise<McpCallResult> {
  const startTime = Date.now();
  try {
    const vm = await import('node:vm');
    const contextObj: Record<string, unknown> = {};
    const context = vm.createContext(contextObj);
    const sandboxCode = `
      (function() {
        const JSON = globalThis.JSON;
        const Math = globalThis.Math;
        const Date = globalThis.Date;
        const String = globalThis.String;
        const Number = globalThis.Number;
        const Boolean = globalThis.Boolean;
        const Array = globalThis.Array;
        const Object = globalThis.Object;
        const parseInt = globalThis.parseInt;
        const parseFloat = globalThis.parseFloat;
        const isNaN = globalThis.isNaN;
        const RegExp = globalThis.RegExp;
        const Map = globalThis.Map;
        const Set = globalThis.Set;
        const require = undefined;
        const process = undefined;
        const global = undefined;
        const globalThis = undefined;
        const setTimeout = undefined;
        const setInterval = undefined;
        const Promise = undefined;
        ${code}
        return (input) => ${fnName}(input);
      })()
    `;
    const wrappedFn = vm.runInContext(sandboxCode, context, {
      timeout: options.timeout,
      displayErrors: true,
    });
    if (typeof wrappedFn !== 'function') {
      return { content: [{ type: 'text', text: `"${fnName}" 不是一个函数` }], isError: true };
    }
    const result = await Promise.resolve(wrappedFn(args));
    return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }], isError: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes('timed out') || msg.includes('Script execution timed out');
    return { content: [{ type: 'text', text: isTimeout ? '工具执行超时' : `沙箱执行错误: ${msg}` }], isError: true };
  }
}
