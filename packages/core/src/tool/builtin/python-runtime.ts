// Python 运行时桥 —— 统一的 Python 执行底座。
// 设计：prod 优先用打包的 python-build-standalone（resources/python/），dev/缺失时回退系统 python。
// 依赖在构建期已预烤进 site-packages（离线可用），运行期不再 pip，避免网络依赖。
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';
import { capToolOutput } from './output-cap';
import { toolError } from '../result';

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

/**
 * 把内置 python 工具脚本**同步成工作目录副本**并返回副本路径（2026-10-07）。
 *
 * ★ 为什么要副本（用户拍板）：此前任务里改管线（如 novel_tuiwen TTS 重试）只能改包内源码
 *   —— dev 直接污染 packages/core，打包版 resources 只读改不动。副本模式：
 *   - 首次运行：整目录拷到 <工作目录>/.yan-zhi/tools/<工具名>/，从副本跑；
 *   - 版本戳（.builtin-version = 内置目录内容哈希）：内置脚本随产品升级变化 → 自动覆盖副本；
 *     哈希一致则不动副本 —— 任务/用户对副本的修改得以保留；
 *   - 无工作目录（ToolContext 缺失）时退回内置原地跑（旧行为兜底）。
 */
export function resolveWorkspacePythonScript(rel: string, workspaceDir?: string): string | null {
  const src = getPythonScript(rel);
  if (!src) return null;
  if (!workspaceDir || !workspaceDir.trim()) return src;
  try {
    const base = getPythonToolsDir();
    if (!base) return src;
    const srcDir = path.dirname(path.join(base, rel));
    const dstDir = path.join(workspaceDir, '.yan-zhi', 'tools', path.relative(base, srcDir));
    // 内容哈希做版本戳：目录下所有文件的相对路径 + 内容
    const hashOf = (dir: string): string => {
      const crypto = require('crypto') as typeof import('crypto');
      const h = crypto.createHash('sha256');
      const walk = (d: string, pre: string) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          const fp = path.join(d, e.name);
          if (e.isDirectory()) walk(fp, `${pre}${e.name}/`);
          else { h.update(`${pre}${e.name}\0`); h.update(fs.readFileSync(fp)); }
        }
      };
      walk(dir, '');
      return h.digest('hex').slice(0, 16);
    };
    const version = hashOf(srcDir);
    const versionFile = path.join(dstDir, '.builtin-version');
    const needSync = !fs.existsSync(versionFile) || fs.readFileSync(versionFile, 'utf8').trim() !== version;
    if (needSync) {
      fs.mkdirSync(dstDir, { recursive: true });
      fs.cpSync(srcDir, dstDir, { recursive: true, force: true });
      fs.writeFileSync(versionFile, version, 'utf8');
      console.log(`[python-runtime] 工具脚本已同步到工作目录副本: ${dstDir} (version=${version})`);
    }
    // dstDir 已镜像 rel 的目录层级 → 副本内脚本路径 = rel 相对 srcDir 的部分（即 basename）
    const p = path.join(dstDir, path.relative(srcDir, src));
    return fs.existsSync(p) ? p : src;
  } catch (e) {
    console.warn('[python-runtime] 工作目录副本同步失败，回退内置脚本:', e);
    return src;
  }
}

/**
 * 强制 Python 以 **UTF-8** 写 stdout/stderr（就地修改并返回 env）。
 *
 * ★★★ 为什么必须（2026-10-01 用户实报「安装包任务里工具输出乱码」）：
 *   Windows 上 Python 在**没有** `PYTHONIOENCODING` 时，`sys.stdout.encoding` 取的是
 *   OEM 代码页 → **`gbk`**（实测内置解释器：带变量时 `utf-8`、剔除后 `gbk`）。
 *   于是 `print("中文…")` 输出的是 GBK 字节；而下游按 UTF-8 解 → 乱码。
 *   dev 模式之所以正常，是因为终端/父进程往往已注入 `PYTHONIOENCODING=utf-8`
 *   （本机 WorkBuddy 环境即注入），**安装版双击启动没有** → 只有安装包复现。
 *   ⇒ 这里显式补上，让 Python 链路**从源头**就是 UTF-8。
 *
 * ⚠️ 这只覆盖 Python。`cmd.exe` 内置命令 / 外部 exe / 第三方 CLI **不吃这套**，
 *   它们的 GBK 输出必须靠采集端按字节解码（见 server `node-adapter.ts` 的 decodeChildOutput）。
 *   两条一起才完整 —— 只做本函数会漏掉用户看得见的 cmd/dir/type 那部分。
 *
 * ★ 调用方显式传入的 PYTHONIOENCODING 优先（不覆盖用户的显式选择）。
 */
export function withUtf8Output(env: Record<string, string>): Record<string, string> {
  env.PYTHONIOENCODING = env.PYTHONIOENCODING || 'utf-8';
  env.PYTHONUTF8 = env.PYTHONUTF8 || '1';
  return env;
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
 *  约定：代码从环境变量 YZ_PY_ARGS（base64 JSON）读取入参，结果打印到 stdout。
 *  opts.pythonPath：额外 PYTHONPATH 目录（自定义工具按需安装的隔离站点包）—— 见 server 的 tool-deps.ts。 */
export async function runPythonCode(
  code: string,
  args: Record<string, unknown> = {},
  opts: { timeout?: number; pythonPath?: string } = {},
): Promise<McpCallResult> {
  const shell = getPlatformAdapter().shell;
  if (!shell) {
    return toolError('Error: python 执行需要桌面端或服务端环境（shell）。Web 浏览器端不支持。');
  }
  let py: string;
  try {
    py = await findPython();
  } catch (e) {
    return toolError(`Error: ${(e as Error).message}`);
  }
  const tmp = path.join(os.tmpdir(), `yz_py_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
  try {
    fs.writeFileSync(tmp, code, 'utf-8');
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (typeof v === 'string') env[k] = v;
    env.YZ_PY_ARGS = Buffer.from(JSON.stringify(args)).toString('base64');
    // ★ 强制 Python 输出 UTF-8（Windows 默认 gbk → 下游按 utf-8 解会乱码，见 withUtf8Output）
    withUtf8Output(env);
    // 隔离站点包注入（自定义工具的 dependencies）：追加而非覆盖用户既有 PYTHONPATH
    if (opts.pythonPath) {
      const sep = process.platform === 'win32' ? ';' : ':';
      env.PYTHONPATH = env.PYTHONPATH ? `${opts.pythonPath}${sep}${env.PYTHONPATH}` : opts.pythonPath;
    }
    const r = await shell.exec(py, [tmp], { timeout: Math.min(opts.timeout || 30000, 300000), env });
    const lines: string[] = [];
    if (r.stdout) lines.push(capToolOutput(r.stdout));
    if (r.stderr) lines.push('[stderr]\n' + capToolOutput(r.stderr));
    if (lines.length === 0) lines.push('(无输出)');
    return { content: [{ type: 'text', text: lines.join('\n') }], isError: r.exitCode !== 0 };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return toolError(`Python 执行失败: ${msg}`);
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
  // ★ 强制 Python 输出 UTF-8（见 withUtf8Output；opts.env 若显式指定则不覆盖）
  withUtf8Output(env);
  return shell.exec(py, [scriptPath, ...scriptArgs], {
    // ★ 上限 30 分钟（2026-10-05）：novel_tuiwen 长章节实测 TTS+合成 12min+（51 段配音、
    //   19.5min 成片），10 分钟硬顶会在 ffmpeg 收尾时 kill 掉 → mp4 缺 moov 直接损坏。
    //   媒体管线类脚本天然长跑；30min 仍是护栏，防失控脚本挂死任务。
    timeout: Math.min(opts.timeout || 60000, 1800000),
    cwd: opts.cwd,
    env,
  });
}
