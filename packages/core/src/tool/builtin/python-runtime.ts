// Python 运行时桥 —— 统一的 Python 执行底座。
// 设计：prod 优先用打包的 python-build-standalone（resources/python/），dev/缺失时回退系统 python。
// 依赖在构建期已预烤进 site-packages（离线可用），运行期不再 pip，避免网络依赖。
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';
import { capToolOutput } from './output-cap';
import { toolError } from '../result';
import { classifyPythonFailure, getPythonRepairer, type PythonRepairResult } from './python-repair';

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

/** 目录是否真的非空（裁剪后的空壳目录 vs 真实资源）。 */
function hasEntries(dir: string): boolean {
  try {
    return fs.readdirSync(dir).length > 0;
  } catch {
    return false;
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
      // ★ 空目录 = 本次包按插件选择集裁掉了 python 运行时（resources 里留空壳让
      //   extraResources 有源可拷），按"缺失"处理：回退开发目录或系统 python，
      //   而不是把一个空目录当成可用脚本目录（后续 readFile 会报难懂的 ENOENT）。
      if (fs.existsSync(prod) && hasEntries(prod)) return prod;
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

/**
 * PATH 探测成功的解释器（进程内缓存）。
 * ★ 只缓存**成功**结果；失败不缓存 —— "用户刚把 Python 装上" 这类情况下次仍会重新探测。
 */
let cachedShellPython: string | null = null;
/** 探针超时：探测本身是**起进程**（不是跑脚本），机器忙时启动开销就够吃掉 5s */
const PY_PROBE_TIMEOUT_MS = 15000;

/**
 * 从可执行文件 / 工作目录推导随包解释器。
 * ★ 只有 `process.resourcesPath` 取不到时才走到这里（见 findPython 的补漏注释）：
 *   ① 正式版：<安装目录>/<主程序>.exe → <安装目录>/resources/python/python.exe
 *   ② dev：从 cwd 向上找仓库内 apps/desktop/resources/python
 */
function deriveBundledPython(): string | null {
  try {
    const rel = process.platform === 'win32'
      ? path.join('python', 'python.exe')
      : path.join('python', 'bin', 'python3');
    const nearExe = path.join(path.dirname(process.execPath), 'resources', rel);
    if (fs.existsSync(nearExe)) return nearExe;
    let dir = process.cwd();
    for (let i = 0; i < 6; i++) {
      const inRepo = path.join(dir, 'apps', 'desktop', 'resources', rel);
      if (fs.existsSync(inRepo)) return inRepo;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* 推导失败按未命中处理 */
  }
  return null;
}

/**
 * 定位 Python 解释器：打包优先，系统回退
 *
 * ★★★ 2026-10-14 实报（medium）：`python_exec` **间歇**回报「未找到 Python」，而同一会话里
 *   同一工具几分钟前还正常（conv 96125908：16:41 / 16:51 报"未找到"，16:26 / 16:31 / 16:46 / 16:49
 *   正常）。根因是此处**每次调用都现场重探**：三个候选逐个起子进程、`timeout: 5000`，而任务
 *   运行期机器正被浏览器渲染占满 —— `--version` 的**启动**开销就能超 5s ⇒ 三个候选全判失败
 *   ⇒ 报"未找到 Python"，把**机器忙**误报成**没装 Python**。更糟的是模型据此转向
 *   `js_exec`（沙箱无 setTimeout）/ `cmd_exec` 绕路，白烧步数并推高循环拦截计数。
 *   ⇒ ① 探针超时 5s → 15s；② 探成功后缓存，正常路径每个进程只探一次。
 */
export async function findPython(): Promise<string> {
  // ★ YZ_PYTHON 显式指定解释器（2026-10-17）：PATH 探测命中的 python 未必带依赖
  //   （如 pyenv 3.8 无 Pillow 而 venv 里有）。设置 YZ_PYTHON=<解释器路径> 一键指对。
  const explicit = (typeof process !== 'undefined' && process.env?.YZ_PYTHON || '').trim();
  if (explicit) {
    try {
      if (fs.existsSync(explicit) || !explicit.includes('\\')) return explicit;
    } catch { /* 探测失败按未指定 */ }
  }
  const bundled = getBundledPythonPath();
  if (bundled) return bundled;
  // ★★★ 随包解释器的**补漏**（2026-10-27）：`getBundledPythonPath()` 只看
  //   `process.resourcesPath`，而正式版的 server 是 `ELECTRON_RUN_AS_NODE` 子进程，
  //   这个字段是 undefined ⇒ 一律落到 PATH 探测，命中**用户系统 Python**（预烤依赖全没有：
  //   实测 PDF 预览报"缺少 PyMuPDF"、OCR 只能降级 tesseract）。这里补两条推导路径。
  const derived = deriveBundledPython();
  if (derived) return derived;
  if (cachedShellPython) return cachedShellPython;
  const shell = getPlatformAdapter().shell;
  if (!shell) throw new Error('python 执行需要桌面端或服务端环境（shell）。Web 浏览器端不支持。');
  for (const cmd of ['python', 'python3', 'py']) {
    try {
      const r = await shell.exec(cmd, ['--version'], { timeout: PY_PROBE_TIMEOUT_MS });
      if (r.exitCode === 0) {
        cachedShellPython = cmd;
        return cmd;
      }
    } catch {
      /* try next */
    }
  }
  throw new Error('未找到 Python。打包环境应自带；开发/服务端环境请先安装 Python 3。');
}

/** 执行一段内嵌 Python 代码（用户自定义工具用）。
 *  约定：代码从环境变量 YZ_PY_ARGS（base64 JSON）读取入参，结果打印到 stdout。
 *  opts.pythonPath：额外 PYTHONPATH 目录（自定义工具按需安装的隔离站点包）—— 见 server 的 tool-deps.ts。
 *  opts.cwd：子进程工作目录（python_exec 传会话工作目录，2026-10-19）。 */
export async function runPythonCode(
  code: string,
  args: Record<string, unknown> = {},
  opts: { timeout?: number; pythonPath?: string; cwd?: string; signal?: AbortSignal } = {},
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
    const r = await shell.exec(py, [tmp], {
      timeout: Math.min(opts.timeout || 30000, 300000),
      env,
      signal: opts.signal,
      // 脚本走绝对临时路径，cwd 只影响代码里的相对路径（产物落点）
      ...(opts.cwd ? { cwd: opts.cwd } : {}),
    });
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

// ════════════════════════════════════════════════════════════════════════════
// 后台作业（2026-10-24）：长任务（ffmpeg 渲染 / 大文件下载 / 批量处理）落到脚本 +
// detached 进程，工具调用只负责「启动」，由 job_status 轮询状态。
//
// ★ 为什么必须（用户实报）：python_exec 默认超时 30s，到点 node-adapter 会
//   `taskkill /T /F` 杀**整棵进程树** —— 正在出片的 ffmpeg 被连坐，产出缺 moov 的坏 mp4。
//   把进程 detach 出去后，工具调用的超时再也碰不到它。
// ════════════════════════════════════════════════════════════════════════════

/** 作业根目录：<工作目录>/.yan-zhi/jobs（无工作目录时退到系统临时目录，避免污染任意 cwd） */
export function jobsRootFor(workspaceDir?: string): string {
  const base = (workspaceDir || '').trim();
  if (base) return path.join(base, '.yan-zhi', 'jobs');
  return path.join(os.tmpdir(), 'yan-zhi', 'jobs');
}

/** 作业 id 格式（同时用于校验入参，防路径穿越） */
export const JOB_ID_RE = /^job_[a-z0-9]+_[a-f0-9]{8}$/;

export interface PythonBgJob {
  jobId: string;
  jobDir: string;
  logPath: string;
  statusPath: string;
  /** 启动器 pid（真正干活的 pid 由后台段写入 status.json） */
  launcherPid?: number;
}

/**
 * 后台跑一段 Python 代码：落盘 script.py → 用随包 run_job.py detach 启动 → 立即返回。
 *
 * ★ 不接收 AbortSignal：用户中止任务时**不该**杀掉已经出片的渲染进程 ——
 *   那正是后台模式要避开的失败形态；要停请用 job_status 查到 pid 后自行处理。
 */
export async function runPythonCodeBackground(
  code: string,
  args: Record<string, unknown> = {},
  opts: { cwd?: string; workspaceDir?: string; env?: Record<string, string> } = {},
): Promise<{ ok: true; job: PythonBgJob } | { ok: false; error: string }> {
  if (!code.trim()) return { ok: false, error: 'code 不能为空' };
  let runner: string | null;
  try {
    runner = getPythonScript('_bg/run_job.py');
  } catch {
    runner = null;
  }
  if (!runner) return { ok: false, error: '未找到后台启动器 _bg/run_job.py（随包脚本缺失）' };

  let py: string;
  try {
    py = await findPython();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const shell = getPlatformAdapter().shell;
  if (!shell) return { ok: false, error: '后台作业需要桌面端或服务端环境（shell）。Web 浏览器端不支持。' };

  const jobId = `job_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  const jobDir = path.join(jobsRootFor(opts.workspaceDir), jobId);
  const scriptPath = path.join(jobDir, 'script.py');
  const logPath = path.join(jobDir, 'stdout.log');
  const statusPath = path.join(jobDir, 'status.json');
  try {
    fs.mkdirSync(jobDir, { recursive: true });
    fs.writeFileSync(scriptPath, code, 'utf-8');
  } catch (e) {
    return { ok: false, error: `作业目录写入失败: ${(e as Error).message}` };
  }

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (typeof v === 'string') env[k] = v;
  if (opts.env) Object.assign(env, opts.env);
  env.YZ_PY_ARGS = Buffer.from(JSON.stringify(args)).toString('base64');
  withUtf8Output(env);

  let r: { stdout: string; stderr: string; exitCode: number };
  try {
    // 前台段只负责 detach + 立刻退出（实测 <1s），因此超时给 30s 足够；
    // 目标脚本可能跑几十分钟，但已经不在这棵进程树里。
    r = await shell.exec(py, [
      runner, '--job-dir', jobDir, '--cwd', opts.cwd || '', '--',
      py, scriptPath,
    ], { timeout: 30000, cwd: jobDir, env });
  } catch (e) {
    return { ok: false, error: `后台启动失败: ${(e as Error).message}` };
  }
  if (r.exitCode !== 0) {
    return { ok: false, error: `后台启动失败（exit ${r.exitCode}）：${(r.stderr || r.stdout || '').trim().slice(0, 500)}` };
  }
  let launcherPid: number | undefined;
  try {
    const j = JSON.parse((r.stdout || '').trim().split('\n').pop() || '{}');
    if (typeof j?.launcherPid === 'number') launcherPid = j.launcherPid;
  } catch { /* 启动器输出异常不影响作业本身 */ }
  return { ok: true, job: { jobId, jobDir, logPath, statusPath, launcherPid } };
}

export interface JobSnapshot {
  jobId: string;
  jobDir: string;
  /** status.json 原始内容（缺失时为 null） */
  status: Record<string, unknown> | null;
  /** 归一化状态：starting / running / completed / failed / stale（running 但进程已不在）/ missing */
  state: 'starting' | 'running' | 'completed' | 'failed' | 'stale' | 'missing';
  elapsedSec: number;
  logTail: string;
}

/** 进程是否还活着（signal 0 只探活，不投递信号） */
function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM = 进程存在但无权限；其余（ESRCH）视为已退出
    return (e as NodeJS.ErrnoException)?.code === 'EPERM';
  }
}

/** 读一个后台作业的快照：状态 + 耗时 + 日志尾部。 */
export function readJobSnapshot(
  workspaceDir: string | undefined,
  jobId: string,
  opts: { tailLines?: number } = {},
): JobSnapshot {
  const jobDir = path.join(jobsRootFor(workspaceDir), jobId);
  const statusPath = path.join(jobDir, 'status.json');
  const logPath = path.join(jobDir, 'stdout.log');
  let status: Record<string, unknown> | null = null;
  try {
    status = JSON.parse(fs.readFileSync(statusPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    status = null;
  }

  let state: JobSnapshot['state'] = 'missing';
  let elapsedSec = 0;
  if (status) {
    const raw = String(status.state || '');
    const startedAt = Number(status.startedAt || status.launchedAt || 0);
    const finishedAt = Number(status.finishedAt || 0);
    const end = finishedAt || Date.now() / 1000;
    elapsedSec = startedAt ? Math.max(0, Math.round((end - startedAt) * 10) / 10) : 0;
    if (raw === 'completed' || raw === 'failed') {
      state = raw;
    } else if (raw === 'running' || raw === 'starting') {
      // ★ 看护进程没了但没写结束状态 = 被外部杀死（关机/强杀）：
      //   如实报 stale，别让模型以为还在跑而无限轮询。
      const pid = Number(status.pid || status.watchdogPid || 0);
      const staleStarting = raw === 'starting' && startedAt > 0 && (Date.now() / 1000 - startedAt) > 60;
      state = (pid && !isPidAlive(pid)) || staleStarting ? 'stale' : (raw as JobSnapshot['state']);
    } else {
      state = 'missing';
    }
  }

  let logTail = '';
  try {
    const lines = Number(opts.tailLines ?? 40);
    const buf = fs.readFileSync(logPath, 'utf-8').split(/\r?\n/);
    logTail = buf.slice(Math.max(0, buf.length - Math.max(1, lines))).join('\n').trimEnd();
  } catch {
    logTail = '';
  }
  return { jobId, jobDir, status, state, elapsedSec, logTail };
}

/** 列出工作目录下最近的作业（新的在前），供 job_status 不带 jobId 时概览。 */
export function listRecentJobs(workspaceDir: string | undefined, limit = 20): JobSnapshot[] {
  const root = jobsRootFor(workspaceDir);
  let names: string[] = [];
  try {
    names = fs.readdirSync(root).filter((n) => JOB_ID_RE.test(n));
  } catch {
    return [];
  }
  return names
    .sort((a, b) => (a < b ? 1 : -1)) // id 内含时间戳（base36），字符串倒序即时间倒序
    .slice(0, Math.max(1, limit))
    .map((id) => readJobSnapshot(workspaceDir, id, { tailLines: 0 }));
}

/** 执行一个随包分发的 Python 脚本文件（doyz / security / pdf_preview 等用）。
 *  返回原始 stdout/stderr/exitCode，由调用方决定如何包装成 McpCallResult。 */
export async function runPythonScript(
  scriptPath: string,
  scriptArgs: string[] = [],
  opts: {
    timeout?: number;
    cwd?: string;
    env?: Record<string, string>;
    signal?: AbortSignal;
    /** 指定解释器，跳过 findPython() 探测。
     *  ★ 为什么需要（2026-10-27）：OCR 要用**随包** python（里面有 rapidocr），而 findPython()
     *    在 server 子进程里拿不到 resourcesPath、只会探到用户系统 Python —— 不指定就永远跑错解释器。 */
    pythonPath?: string;
  } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const shell = getPlatformAdapter().shell;
  if (!shell) throw new Error('python 执行需要桌面端或服务端环境（shell）。Web 浏览器端不支持。');
  const py = opts.pythonPath || (await findPython());
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
    signal: opts.signal,
  });
}

/**
 * 跑 python 脚本，失败且**可自愈**时自动修复并重跑一次（2026-10-14）。
 *
 * 自愈由 server 注入（python-self-heal.ts）：装缺失模块 / 升级 edge-tts / 补系统代理，
 * 成功后再跑一遍脚本 —— 让应用「出问题换法子修」，而不是把原始 stderr 丢回用户。
 *
 * 返回原始 exec 结果 + `repairLog`（本次自动做了哪些修复，供工具输出展示；无修复则空数组）。
 */
export async function runPythonScriptHealing(
  scriptPath: string,
  scriptArgs: string[] = [],
  opts: { timeout?: number; cwd?: string; env?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number; repairLog: string[] }> {
  const first = await runPythonScript(scriptPath, scriptArgs, opts);
  const repairLog: string[] = [];
  if (first.exitCode === 0) return { ...first, repairLog };

  const failure = classifyPythonFailure(first.stderr);
  const repairer = getPythonRepairer();
  if (!failure || !repairer) return { ...first, repairLog };

  let result: PythonRepairResult;
  try {
    result = await repairer({ failure, scriptPath, cwd: opts.cwd, stderr: first.stderr });
  } catch (e) {
    repairLog.push(`自愈尝试失败：${(e as Error)?.message || e}`);
    return { ...first, repairLog };
  }
  if (!result.repaired) {
    repairLog.push(`自愈未成功（${failure.kind}）${result.detail ? `：${result.detail}` : ''}`);
    return { ...first, repairLog };
  }
  repairLog.push(`已自动修复（${failure.kind}）${result.detail ? `：${result.detail}` : ''}，正在重跑…`);
  const second = await runPythonScript(scriptPath, scriptArgs, opts);
  return { ...second, repairLog };
}
