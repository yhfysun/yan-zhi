// 用户代码执行器（JS 沙箱 + Python 桥）
import type { McpCallResult } from '../mcp/client';
import { runPythonCode } from './builtin/python-runtime';
import { toolError, toolOk } from './result';

/** 自定义工具执行选项 */
export interface RunUserCodeOptions {
  timeout?: number;
  /** 执行运行时：node（默认，node:vm 沙箱）或 python（打包/系统 Python 子进程） */
  runtime?: string;
  /**
   * 依赖注入（由调用方按需安装后传入，core 不依赖存储层/安装器）。
   *
   * 为什么用「注入」而不是让沙箱自己去装：
   *   core 是纯逻辑包（浏览器端也会被打包），不能 import node:child_process / fs 去跑 npm/pip。
   *   安装发生在 server 侧（services/tool-deps.ts），装完把**解析好的模块**或**路径**交给这里：
   *   - node：`modules` 为 `{ 包名: 模块对象 }`，沙箱内以受限 `require(name)` 暴露；
   *   - python：`pythonPath` 为隔离站点包目录，作为 PYTHONPATH 传给子进程。
   */
  deps?: {
    /** node：包名 → 已 require 的模块（沙箱内 require('包名') 可取到） */
    modules?: Record<string, unknown>;
    /** python：额外 PYTHONPATH 目录（隔离站点包） */
    pythonPath?: string;
  };
}

/** 统一入口：按 runtime 分流。
 *  - node  → runInSandbox（node:vm 沙箱；deps 以受限 require 注入）
 *  - python → 把 code 落到临时文件，用 Python 解释器子进程执行，入参经 YZ_PY_ARGS 注入 */
export async function runUserCode(
  code: string,
  entry: string,
  args: Record<string, unknown>,
  opts: RunUserCodeOptions = {},
): Promise<McpCallResult> {
  if (opts.runtime === 'python') {
    return runPythonCode(code, args, { timeout: opts.timeout, pythonPath: opts.deps?.pythonPath });
  }
  return runInSandbox(code, entry, args, { timeout: opts.timeout || 30000, modules: opts.deps?.modules });
}

/**
 * 自定义工具依赖的「准备器」钩子（由 server 端注入，见 `apps/server/src/services/tool-deps.ts`）。
 *
 * ★ 为什么要这个钩子而不是让 core 直接装包：
 *   core 是**纯逻辑包**（浏览器端也会被打包），不能 import `node:child_process` / `node:fs`
 *   去跑 npm/pip。安装必须发生在 server 侧，而 core 里还有几处自定义工具执行入口
 *   （`ToolRegistry.loadCustomTools`、`workflow/nodes.ts` 的 custom 分支）需要它。
 *   → 用「注入钩子」把 server 能力送进来：注入前调用退化为**无依赖安装**（行为与改造前一致），
 *     注入后才具备「按需装依赖」能力。这样 core 保持零 node 依赖，且不会静默改变旧行为。
 */
export interface CustomToolDepPreparer {
  /** 装好依赖并返回注入配置（失败时返回 undefined，由调用方继续按无依赖执行） */
  prepare(tool: { runtime?: string; dependencies_json?: string | null }): Promise<RunUserCodeOptions['deps'] | undefined>;
}
let customToolDepPreparer: CustomToolDepPreparer | null = null;

/** 注入依赖准备器（server 启动时调用；传 null 撤销） */
export function setCustomToolDepPreparer(p: CustomToolDepPreparer | null): void {
  customToolDepPreparer = p;
}

/**
 * 执行一个「自定义工具行」（含依赖按需安装）—— core 内各入口的统一执行函数。
 *
 * `tool` 形状对应 `custom_tool` 表行（至少含 code / entry / timeout / runtime / dependencies_json）。
 * 与 server 的 `runCustomTool` 同语义；差异只是依赖准备走**注入的钩子**（core 不能自己装包）。
 */
export async function runCustomToolRow(
  tool: { code: string; entry: string; timeout?: number; runtime?: string; dependencies_json?: string | null },
  args: Record<string, unknown> = {},
): Promise<McpCallResult> {
  let deps: RunUserCodeOptions['deps'];
  if (customToolDepPreparer) {
    try { deps = await customToolDepPreparer.prepare(tool); } catch { /* 准备失败按无依赖执行 */ }
  }
  return runUserCode(tool.code, tool.entry, args, {
    timeout: tool.timeout || 30000,
    runtime: tool.runtime || 'node',
    deps,
  });
}

export async function runInSandbox(
  code: string,
  fnName: string,
  args: Record<string, unknown>,
  options: { timeout: number; modules?: Record<string, unknown> } = { timeout: 30000 },
): Promise<McpCallResult> {
  const startTime = Date.now();
  try {
    const vm = await import('node:vm');
    const contextObj: Record<string, unknown> = {};
    // ★ 依赖注入：把调用方装好的模块放进 context，沙箱内 `require(name)` 只能取到这些。
    //   注意**仍然不暴露真实的 require/process** —— 只暴露"白名单模块查找函数"，
    //   否则沙箱等于没有（模型可以 require('node:child_process') 执行任意命令）。
    //   白名单外的名字一律抛错，让模型知道"这个包没声明依赖，需在 dependencies 里声明后重建"。
    const allowedModules = options.modules && typeof options.modules === 'object' ? options.modules : {};
    const context = vm.createContext(contextObj);
    context.__yz_host_modules__ = allowedModules;
    // 两层 IIFE：
    // 外层在 context 全局作用域抓取标准内建（vm 裸 context 自带 JSON/Math/Date 等 ES 内建）
    // 与**宿主注入的依赖模块**（必须在 `globalThis = undefined` 之前抓，否则拿不到）；
    // 内层再屏蔽宿主能力（process/globalThis/timer/Promise），只留一个受限 require。
    // 不能在同一层又引用又 const globalThis —— 同作用域 const 存在 TDZ，会抛
    // "Cannot access 'globalThis' before initialization"（历史上沙箱因此全挂）。
    const sandboxCode = `
      (function() {
        const __yz_modules__ = globalThis.__yz_host_modules__ || {};
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
          // 受限 require：只认调用方装好并注入的包；其余一律拒绝并给出可行动提示。
          // ★ 绝不回退到真实 require —— 否则模型可 require('node:child_process') 执行任意命令。
          const require = (name) => {
            if (Object.prototype.hasOwnProperty.call(__yz_modules__, name)) return __yz_modules__[name];
            throw new Error('模块 "' + name + '" 未注入：自定义工具需在 dependencies 中声明该依赖（重建工具后生效）；'
              + '且 node 沙箱不支持 node: 内置模块 —— 需要文件/网络/第三方库请改用 runtime: "python"');
          };
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
      return toolError(`"${fnName}" 不是一个函数`);
    }
    // 关键：函数调用必须经 runInContext 执行，timeout 才罩得住函数体。
    // 直接 wrappedFn(args) 会绕过 vm timeout —— 工具里写 while(true) 会永久挂死调用方。
    context.__yz_fn__ = wrappedFn;
    context.__yz_args__ = args;
    const result = await Promise.resolve(
      vm.runInContext('__yz_fn__(__yz_args__)', context, { timeout: options.timeout, displayErrors: true }),
    );
    return toolOk(typeof result === 'string' ? result : JSON.stringify(result));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes('timed out') || msg.includes('Script execution timed out');
    return toolError(isTimeout ? '工具执行超时' : `沙箱执行错误: ${msg}`);
  }
}
