// Python 运行时桥 —— 统一的 Python 执行底座。
// 设计：prod 优先用打包的 python-build-standalone（resources/python/），dev/缺失时回退系统 python。
// 依赖在构建期已预烤进 site-packages（离线可用），运行期不再 pip，避免网络依赖。
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';
import { capToolOutput } from './output-cap';

/** file:// URL → 本地路径（手工转换，避免 import 'url' 被 Vite 浏览器外部化后炸掉渲染进程 bundle） */
function fileUrlToLocalPath(u: string): string {
  const p = decodeURIComponent(u.replace(/^file:\/\//, ''));
  // Windows 形如 /C:/x/y → C:/x/y
  return /^\/[A-Za-z]:/.test(p) ? p.slice(1) : p;
}

/** 取打包的 Python 解释器路径（仅打包环境有效） */
export function getBundledPythonPath(): string | null {
  try {
    const res = (process as unknown as { resourcesPath?: string }).resourcesPath;
    if (!res) return null;
    const p = process.platform === 'win32'
      ? path.join(res, 'python', 'python.exe')
      : path.join(res, 'python', 'bin', 'python3');
    return fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

/** 取随包分发的 python 脚本目录（doyz / security / pdf_preview / excel_preview 等）。
 *  prod: process.resourcesPath/python-tools（electron-builder 拷入）
 *  dev: 编译产物同级（dist/tool/builtin/python-scripts），仓库源码未拷贝时回退 src 同级目录 */
export function getPythonToolsDir(): string | null {
  try {
    const res = (process as unknown as { resourcesPath?: string }).resourcesPath;
    if (res) {
      const prod = path.join(res, 'python-tools');
      if (fs.existsSync(prod)) return prod;
    }
    // ESM 下无 __dirname，用 import.meta.url 定位；CJS 产物回退 __dirname。
    // 注意：此处不得静态 import 'node:url'，否则渲染进程 bundle 被 Vite 外部化直接抛错黑屏。
    let here: string | null = null;
    try {
      here = path.dirname(fileUrlToLocalPath(import.meta.url));
    } catch { /* import.meta 不可用（CJS） */ }
    if (!here && typeof __dirname === 'string') here = __dirname;
    if (here) {
      const dev = path.join(here, 'python-scripts');
      if (fs.existsSync(dev)) return dev;
      // dist 运行（python-scripts 未拷入 dist）时回退仓库源码目录
      const src = path.resolve(here, '../../src/tool/builtin/python-scripts');
      if (fs.existsSync(src)) return src;
    }
    return null;
  } catch {
    return null;
  }
}

/** 在脚本目录内解析一个脚本的绝对路径（不存在返回 null） */
export function getPythonScript(rel: string): string | null {
  const base = getPythonToolsDir();
  if (!base) return null;
  const p = path.join(base, rel);
  return fs.existsSync(p) ? p : null;
}

/** 定位 Python 解释器：打包优先，系统回退 */
export async function findPython(): Promise<string> {
  const bundled = getBundledPythonPath();
  if (bundled) return bundled;
  const shell = getPlatformAdapter().shell;
  if (!shell) throw new Error('python 执行需要桌面端或服务端环境（shell）。Web 浏览器端不支持。');
  for (const cmd of ['python', 'python3', 'py']) {
    try {
      const r = await shell.exec(cmd, ['--version'], { timeout: 5000 });
      if (r.exitCode === 0) return cmd;
    } catch {
      /* try next */
    }
  }
  throw new Error('未找到 Python。打包环境应自带；开发/服务端环境请先安装 Python 3。');
}

/** 执行一段内嵌 Python 代码（用户自定义工具用）。
 *  约定：代码从环境变量 YZ_PY_ARGS（base64 JSON）读取入参，结果打印到 stdout。 */
export async function runPythonCode(
  code: string,
  args: Record<string, unknown> = {},
  opts: { timeout?: number } = {},
): Promise<McpCallResult> {
  const shell = getPlatformAdapter().shell;
  if (!shell) {
    return { content: [{ type: 'text', text: 'Error: python 执行需要桌面端或服务端环境（shell）。Web 浏览器端不支持。' }], isError: true };
  }
  let py: string;
  try {
    py = await findPython();
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
  }
  const tmp = path.join(os.tmpdir(), `yz_py_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
  try {
    fs.writeFileSync(tmp, code, 'utf-8');
    const env = { ...process.env, YZ_PY_ARGS: Buffer.from(JSON.stringify(args)).toString('base64') };
    const r = await shell.exec(py, [tmp], { timeout: Math.min(opts.timeout || 30000, 300000), env });
    const lines: string[] = [];
    if (r.stdout) lines.push(capToolOutput(r.stdout));
    if (r.stderr) lines.push('[stderr]\n' + capToolOutput(r.stderr));
    if (lines.length === 0) lines.push('(无输出)');
    return { content: [{ type: 'text', text: lines.join('\n') }], isError: r.exitCode !== 0 };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { content: [{ type: 'text', text: `Python 执行失败: ${msg}` }], isError: true };
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

/** 执行一个随包分发的 Python 脚本文件（doyz / security / pdf_preview 等用）。
 *  返回原始 stdout/stderr/exitCode，由调用方决定如何包装成 McpCallResult。 */
export async function runPythonScript(
  scriptPath: string,
  scriptArgs: string[] = [],
  opts: { timeout?: number; cwd?: string; env?: Record<string, string> } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const shell = getPlatformAdapter().shell;
  if (!shell) throw new Error('python 执行需要桌面端或服务端环境（shell）。Web 浏览器端不支持。');
  const py = await findPython();
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') env[k] = v;
  }
  if (opts.env) Object.assign(env, opts.env);
  return shell.exec(py, [scriptPath, ...scriptArgs], {
    timeout: Math.min(opts.timeout || 60000, 600000),
    cwd: opts.cwd,
    env,
  });
}
