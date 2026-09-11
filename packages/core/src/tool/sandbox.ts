// 用户代码执行器（JS 沙箱 + Python 桥）
import type { McpCallResult } from '../mcp/client';
import { runPythonCode } from './builtin/python-runtime';

/** 自定义工具执行选项 */
export interface RunUserCodeOptions {
  timeout?: number;
  /** 执行运行时：node（默认，node:vm 沙箱）或 python（打包/系统 Python 子进程） */
  runtime?: string;
}

/** 统一入口：按 runtime 分流。
 *  - node  → runInSandbox（既有 node:vm 沙箱，零变动）
 *  - python → 把 code 落到临时文件，用 Python 解释器子进程执行，入参经 YZ_PY_ARGS 注入 */
export async function runUserCode(
  code: string,
  entry: string,
  args: Record<string, unknown>,
  opts: RunUserCodeOptions = {},
): Promise<McpCallResult> {
  if (opts.runtime === 'python') {
    return runPythonCode(code, args, { timeout: opts.timeout });
  }
  return runInSandbox(code, entry, args, { timeout: opts.timeout || 30000 });
}

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
    // 两层 IIFE：
    // 外层在 context 全局作用域抓取标准内建（vm 裸 context 自带 JSON/Math/Date 等 ES 内建）；
    // 内层再屏蔽宿主能力（require/process/globalThis/timer/Promise）。
    // 不能在同一层又引用又 const globalThis —— 同作用域 const 存在 TDZ，会抛
    // "Cannot access 'globalThis' before initialization"（历史上沙箱因此全挂）。
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
        return (function() {
          const require = undefined;
          const process = undefined;
          const global = undefined;
          const globalThis = undefined;
          const setTimeout = undefined;
          const setInterval = undefined;
          const Promise = undefined;
          ${code}
          return (input) => ${fnName}(input);
        })();
      })()
    `;
    const wrappedFn = vm.runInContext(sandboxCode, context, {
      timeout: options.timeout,
      displayErrors: true,
    });
    if (typeof wrappedFn !== 'function') {
      return { content: [{ type: 'text', text: `"${fnName}" 不是一个函数` }], isError: true };
    }
    // 关键：函数调用必须经 runInContext 执行，timeout 才罩得住函数体。
    // 直接 wrappedFn(args) 会绕过 vm timeout —— 工具里写 while(true) 会永久挂死调用方。
    context.__yz_fn__ = wrappedFn;
    context.__yz_args__ = args;
    const result = await Promise.resolve(
      vm.runInContext('__yz_fn__(__yz_args__)', context, { timeout: options.timeout, displayErrors: true }),
    );
    return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }], isError: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes('timed out') || msg.includes('Script execution timed out');
    return { content: [{ type: 'text', text: isTimeout ? '工具执行超时' : `沙箱执行错误: ${msg}` }], isError: true };
  }
}
