// 自定义工具的「依赖按需安装」—— 让模型自造的工具真的跑得起来。
//
// ★★★ 为什么必须有（2026-09-29，用户诉求原话）：
//   「大模型做任务发现没有对应的工具，会不会自己用 Python 或者 node 搞个自定义工具然后挂载上去调用？」
//   代码层面 `api_custom_tool_create` 早就有了，但**依赖装不上** ——
//   `custom_tool.dependencies_json` 字段建了表、写了 INSERT，**执行前从不读取**；
//   `python-runtime.ts` 注释还写着「运行期不再 pip」。结果：模型造的工具只要用到
//   第三方包（requests / pandas / lodash…）就必跑失败，且报错指向运行时内部，用户看不懂。
//
// 安全设计（沿用 runtime-installer 的既有哲学，不另起一套）：
//   ① **包名白名单校验**：只允许规范包名（字母数字._-），拒绝 flag 注入（`--index-url` 之类）、
//      拒绝 URL / 路径（`./x`、`git+...`、`file:`）—— 否则等于给了任意代码注入口子；
//   ② **只装到隔离目录**，不污染用户全局环境（node → `<dataDir>/tool-runtime/node_modules`；
//      python → `--target <dataDir>/tool-runtime/pysite`）；
//   ③ **体积/时长可控**：单次安装总时长上限，超时即失败（不挂死任务）；
//   ④ **失败必须回显可行动信息**（缺哪个包、装失败原因、可否改用 python_exec），不静默。
//
// 本模块只做「装包」这一种形态（下载 → 落隔离目录），不做系统级安装（提权/注册表一律拒绝）。

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

/** 单次安装的时长上限（ms）。装大包（pandas 之类）可能慢，给足但必须有上限。 */
const INSTALL_TIMEOUT_MS = 180_000;

/**
 * 依赖隔离根目录。
 *
 * ★★ 必须落在**数据目录**（`db.ts` 的 dataDir = `DATA_DIR` 环境变量或 apps/server 同级），
 *   而不是 `serverState.workspaceDir` —— 后者是用户的**工作目录**（项目文件夹）！
 *   我第一版用了 workspaceDir，实测把 `tool-runtime/` 建到了用户项目根
 *   （`Desktop/github/yan-zhi-master/tool-runtime`）→ 污染用户代码目录、还会被 git 看到。
 *   依赖属于"应用自己的运行时状态"，就该跟数据库放一起（数据目录可整体删/迁移）。
 *
 * ★ `DATA_DIR` 未设时**不回落 cwd**（那正是污染仓库根的成因），而是回落到 db.ts 同级目录
 *   的约定位置（`<本文件>/../../..`，即 apps/server），与 db.ts 的 dataDir 默认值同构。
 */
export function toolRuntimeDir(): string {
  const envDir = String(process.env.DATA_DIR || '').trim();
  if (envDir) return path.join(envDir, 'tool-runtime');
  // 未设 DATA_DIR：与 db.ts 的 `dataDir = DATA_DIR || <db.ts>/..` 同一约定（都不回落 cwd），
  // 避免 dev/脚本场景把 tool-runtime 建到仓库根。
  return path.join(resolveServerRoot(), 'tool-runtime');
}

/**
 * 解析「server 包根目录」（apps/server）。
 *
 * ★ 为什么不能用 `process.cwd()`：dev 直接跑脚本时 cwd 常常是**仓库根**，
 *   于是 `cwd/tool-runtime` 会落到源码目录里（我第一版就这样污染了仓库根）。
 * ★ 为什么不用 `__dirname`：本包是 ESM（`"type": "module"` + dist 产物），`__dirname` 不存在。
 *   统一走 `import.meta.url`（与 python-runtime.ts 的 fileUrlToLocalPath 同一手法）。
 */
function resolveServerRoot(): string {
  try {
    // dist 产物位置：<repo>/apps/server/dist/apps/server/src/services/tool-deps.js
    // 源码位置同理向上到 apps/server。两种布局都用「从本文件向上找 apps/server 段」定位。
    const here = path.dirname(fileUrlToLocalPath(import.meta.url));
    const idx = here.replace(/\\/g, '/').indexOf('/apps/server/');
    if (idx > 0) return here.slice(0, idx) + '/apps/server';
    return here;
  } catch {
    return process.cwd();
  }
}

/** file:// URL → 本地路径（Windows 形如 /C:/x/y → C:/x/y） */
function fileUrlToLocalPath(u: string): string {
  const p = decodeURIComponent(String(u || '').replace(/^file:\/\//, ''));
  return /^\/[A-Za-z]:/.test(p) ? p.slice(1) : p;
}

/** 依赖安装结果（回显给模型/用户，让「为什么这次装不了」是可解释的） */
export interface DepInstallResult {
  ok: boolean;
  /** 实际已就绪的包 */
  installed: string[];
  /** 装失败的包 → 原因 */
  failed: Array<{ name: string; reason: string }>;
  /** 给模型/用户的补充说明（成功时可能含「已装入隔离目录」等） */
  note: string;
}

/**
 * 校验包名是否安全。
 *
 * ★ 为什么必须校验而不是"相信模型"：这些字符串会拼进 `npm install <pkg>` / `pip install <pkg>`。
 *   一个 `--index-url=file:///...` 或 `./evil` 就能变成任意本地安装源；
 *   而 `git+https://...` 会直接执行远端构建脚本。模型是**不可信输入源**。
 */
export function isSafePackageName(name: string): boolean {
  const n = String(name || '').trim();
  if (!n || n.length > 214) return false;                 // npm 包名上限 214
  // 只允许 npm/pip 规范的包名：scope（@scope/name）、字母数字、点、下划线、连字符
  if (!/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(n)) return false;
  if (n.startsWith('.') || n.startsWith('-') || n.startsWith('/')) return false; // 路径 / flag 注入
  if (/[\\:~\s]/.test(n)) return false;                    // 反斜杠、冒号（URL scheme）、波浪号、空白
  return true;
}

/** 过滤依赖清单：返回 [安全的, 被拒的(含原因)] */
export function partitionDependencies(deps: unknown): { safe: string[]; rejected: Array<{ name: string; reason: string }> } {
  const list = Array.isArray(deps) ? deps.map((d) => String(d || '').trim()).filter(Boolean) : [];
  const safe: string[] = [];
  const rejected: Array<{ name: string; reason: string }> = [];
  const seen = new Set<string>();
  for (const d of list) {
    if (seen.has(d)) continue;
    seen.add(d);
    if (isSafePackageName(d)) safe.push(d);
    else rejected.push({ name: d, reason: '包名不合法（只允许规范包名；拒绝 URL / 本地路径 / 命令行参数）' });
  }
  return { safe, rejected };
}

/**
 * 跑一个安装命令。
 *
 * ★★ Windows 上的两个坑（实测踩全了，务必保留此注释）：
 *  ① `where npm` 的**第一个结果是不带扩展名的 sh 脚本**（`...\node-versions\x\npm`），
 *     在本机不可执行 → 直接调报"退出码 1"，看起来像装包失败，其实是命令根本没跑起来；
 *  ② Node 18.20.2+/20.12.2+ 出于 CVE-2024-27980 安全修复，
 *     **禁止 `execFile` + `shell:true` 直接调 `.cmd`/`.bat`** → 抛 `spawn EINVAL`。
 *  → 正解：**显式挑 `.cmd` 并用 `cmd.exe /c` 调**（不走 shell:true 的隐式解析），
 *    既避开了 EINVAL，又保持参数是数组（不拼 shell 字符串 → 无注入面）。
 */
function run(cmd: string, args: string[], cwd: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const isWinCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd);
    const file = isWinCmd ? (process.env.ComSpec || 'cmd.exe') : cmd;
    const argv = isWinCmd ? ['/d', '/s', '/c', cmd, ...args] : args;
    execFile(file, argv, { cwd, timeout: INSTALL_TIMEOUT_MS, windowsHide: true, maxBuffer: 8 * 1024 * 1024, windowsVerbatimArguments: isWinCmd },
      (err, stdout, stderr) => {
        resolve({
          code: err ? (typeof (err as any).code === 'number' ? (err as any).code : 1) : 0,
          out: String(stdout || ''),
          err: String(stderr || ''),
        });
      });
  });
}

/**
 * 解析可用的命令路径（Windows 上 npm/pip 是 `.cmd`/`.exe`，直接 execFile 调不到）。
 * → 必须**优先挑 .cmd/.exe/.bat**（见 run() 注释里的坑①）。
 */
async function which(cmd: string): Promise<string | null> {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const r = await run(probe, [cmd], process.cwd());
  if (r.code !== 0) return null;
  const all = r.out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).filter((p) => existsSync(p));
  if (!all.length) return null;
  if (process.platform === 'win32') {
    return all.find((p) => /\.(cmd|exe|bat)$/i.test(p)) || all.find((p) => /\.(exe|bat)$/i.test(p)) || all[0];
  }
  return all[0];
}

/**
 * 按需安装依赖（幂等：已就绪的包跳过）。
 *
 * node  → `npm install --no-save --prefix <隔离目录> <pkgs>`，执行时把该 node_modules 注入沙箱 require
 * python→ `pip install --target <隔离站点包> <pkgs>`，执行时把该目录加到 PYTHONPATH
 *
 * @param runtime 'node' | 'python'
 * @param deps    dependencies_json 解析出来的数组
 */
export async function installToolDependencies(runtime: string, deps: unknown): Promise<DepInstallResult> {
  const { safe, rejected } = partitionDependencies(deps);
  if (!safe.length) {
    return {
      ok: rejected.length === 0,
      installed: [],
      failed: rejected,
      note: rejected.length ? '依赖清单全部被拒（包名不合法）' : '无依赖需安装',
    };
  }

  const root = toolRuntimeDir();
  const failed = [...rejected];
  const installed: string[] = [];

  if (runtime === 'python') {
    // ── Python：装到隔离站点包目录 ──
    const target = path.join(root, 'pysite');
    try { mkdirSync(target, { recursive: true }); } catch { /* 已存在 */ }
    // 优先用打包 python（若存在），否则系统 python
    const py = await which('python') || await which('python3') || await which('py');
    if (!py) {
      return { ok: false, installed: [], failed: safe.map((n) => ({ name: n, reason: '未找到 Python 解释器' })),
        note: '无法安装 Python 依赖：本机没找到 python。' };
    }
    const r = await run(py, ['-m', 'pip', 'install', '--target', target, '--disable-pip-version-check', '-q', ...safe], root);
    if (r.code === 0) installed.push(...safe);
    else {
      const reason = (r.err || r.out || '').split(/\r?\n/).filter(Boolean).slice(-3).join(' | ') || `退出码 ${r.code}`;
      for (const n of safe) failed.push({ name: n, reason });
    }
    return {
      ok: failed.length === 0,
      installed,
      failed,
      note: installed.length
        ? `Python 依赖已装入隔离目录 ${target}（执行时自动加进 PYTHONPATH，不影响系统环境）。`
        : 'Python 依赖安装失败，见 failed。',
    };
  }

  // ── Node：装到隔离 node_modules ──
  const npm = await which('npm');
  if (!npm) {
    return { ok: false, installed: [], failed: safe.map((n) => ({ name: n, reason: '未找到 npm' })),
      note: '无法安装 Node 依赖：本机没找到 npm（需安装 Node.js）。' };
  }
  try { mkdirSync(root, { recursive: true }); } catch { /* 已存在 */ }
  // --no-save：不写 package.json（每次按需装，避免状态漂移）；--prefix 指定隔离目录
  const r = await run(npm, ['install', '--no-save', '--no-audit', '--no-fund', '--prefix', root, ...safe], root);
  if (r.code === 0) installed.push(...safe);
  else {
    const reason = (r.err || r.out || '').split(/\r?\n/).filter(Boolean).slice(-3).join(' | ') || `退出码 ${r.code}`;
    for (const n of safe) failed.push({ name: n, reason });
  }
  return {
    ok: failed.length === 0,
    installed,
    failed,
    note: installed.length
      ? `Node 依赖已装入隔离目录 ${path.join(root, 'node_modules')}（执行时注入沙箱 require，不影响全局环境）。`
      : 'Node 依赖安装失败，见 failed。',
  };
}

/** 依赖是否已就绪（避免每次执行都跑一遍 npm/pip —— 那是秒级开销） */
export function depsReady(runtime: string, deps: unknown): boolean {
  const { safe } = partitionDependencies(deps);
  if (!safe.length) return true;
  const root = toolRuntimeDir();
  const base = runtime === 'python' ? path.join(root, 'pysite') : path.join(root, 'node_modules');
  if (!existsSync(base)) return false;
  return safe.every((n) => {
    // pip 把 `foo-bar` 落成 `foo_bar`；npm scope 落成 `@scope/name`
    const candidates = runtime === 'python'
      ? [n.replace(/-/g, '_'), n]
      : [n];
    return candidates.some((c) => existsSync(path.join(base, ...c.split('/'))));
  });
}

/**
 * 把一个 npm 包加载成「模块对象」供 node 沙箱注入。
 *
 * ⚠️ 已知取舍：这里在**宿主进程内**加载隔离目录里的包，再把模块对象交给 vm context，
 * 于是被注入的库代码运行在宿主里（可触达 Node 能力）。
 * 之所以接受：① 只注入用户在 dependencies 里**显式声明**的包；② 包名过了白名单校验；
 * ③ 需要完整 IO 能力（文件/网络）的场景应引导用 python（真子进程，隔离更自然）。
 * 若要"绝对隔离"，正确做法是给 node 也开子进程 runtime —— 那属于后续演进，见文档。
 */
export async function loadNodeModulesForSandbox(deps: string[]): Promise<Record<string, unknown>> {
  const nm = path.join(toolRuntimeDir(), 'node_modules');
  const out: Record<string, unknown> = {};
  for (const d of deps) {
    // ★ 模块缓存：同一进程内同一个包只加载一次。
    //   为什么需要：长任务里一个工具可能被调用几十次，每次都 import() 会重复走解析/读盘
    //   （ESM 有模块级缓存，但每次仍要构造注入对象、走一遍 path 检查）。
    const cached = NODE_MODULE_CACHE.get(d);
    if (cached !== undefined) { out[d] = cached; continue; }
    try {
      // ★ Windows 上绝对不能直接 import('C:/...') —— 抛 ERR_UNSUPPORTED_ESM_URL_SCHEME，
      //   而且会被 catch 静默吞掉 → 表现为"依赖装了但模块加载不到"（我踩过一次）。
      //   必须转成 file:// URL。
      const entry = path.join(nm, d, 'index.js');
      const mod = existsSync(entry)
        ? await import(pathToFileURL(entry).href)
        // 无 index.js 的包（部分库入口在 dist/ 或别处）：读 package.json 的 main
        : await import(pathToFileURL(path.join(nm, d, 'package.json')).href, { with: { type: 'json' } } as any)
            .then((pkg: any) => import(pathToFileURL(path.join(nm, d, pkg.default?.main || 'index.js')).href));
      const value = (mod as any)?.default ?? mod;
      NODE_MODULE_CACHE.set(d, value);
      out[d] = value;
    } catch (e: any) {
      // 加载失败必须留痕（否则沙箱内 require 报"未注入"，看不出是装失败还是加载失败）
      console.warn(`[tool-deps] 模块 ${d} 加载失败:`, e?.message || e);
    }
  }
  return out;
}

/** 已加载模块缓存（包名 → 模块对象）。依赖被重新安装（update dependencies）时需清空。 */
const NODE_MODULE_CACHE = new Map<string, unknown>();

/** 清空模块缓存（工具的 dependencies 变更后调用，避免继续用旧版本） */
export function clearNodeModuleCache(): void {
  NODE_MODULE_CACHE.clear();
}

/**
 * ★★★ 自定义工具的统一执行入口（**含依赖按需安装 + 注入**）—— 「模型自造工具」闭环的最后一环。
 *
 * 为什么必须有（2026-09-29，用户诉求「模型会不会自己用 Python 或 node 搞个自定义工具然后挂载调用」）：
 *   此前 `custom_tool.dependencies_json` **建了字段、写了 INSERT，执行前却从不读取**
 *   （`python-runtime.ts` 注释还写着「运行期不再 pip」）→ 声明了依赖的工具**必跑失败**，
 *   报错还指向运行时内部，用户看不懂。两条执行入口（ReAct 的 custom_ 分支、api_custom_tool_execute）
 *   各写一遍，于是两处都没有安装逻辑。
 *
 * 抽成一个函数后，两条入口共享同一套「装依赖 → 注模块/站点包 → 执行」语义。
 *
 * @param tool custom_tool 行（需含 code/entry/timeout/runtime/dependencies_json）
 * @returns 给模型看的文本（执行输出 + 依赖安装回显）
 */
export async function runCustomTool(tool: any, args: Record<string, unknown>): Promise<string> {
  const { runUserCode } = await import('@yan-zhi/core');
  const runtime = String(tool?.runtime || 'node');
  let deps: unknown = [];
  try { deps = JSON.parse(tool?.dependencies_json || '[]'); } catch { deps = []; }
  const hasDeps = Array.isArray(deps) && deps.length > 0;

  let depNote = '';
  let inject: { modules?: Record<string, unknown>; pythonPath?: string } | undefined;

  if (hasDeps && !depsReady(runtime, deps)) {
    const r = await installToolDependencies(runtime, deps);
    depNote = r.installed.length
      ? `\n[依赖] 已安装 ${r.installed.join(', ')}。${r.note}`
      : `\n[依赖] 安装失败：${r.failed.map((f) => `${f.name}（${f.reason}）`).join('；')}`;
    if (!r.ok && r.installed.length === 0) {
      return `工具 ${tool?.name || ''} 未执行：依赖装不上。${depNote}\n` +
        '处理建议：① 改用一个不需要该依赖的实现；② 若需要文件/网络能力，确认 runtime 已设为 python；' +
        '③ 或直接用 python_exec / cmd_exec 在会话里完成这一步。';
    }
  }
  if (hasDeps) {
    inject = runtime === 'python'
      ? { pythonPath: path.join(toolRuntimeDir(), 'pysite') }
      : { modules: await loadNodeModulesForSandbox(deps as string[]) };
  }

  const result = await runUserCode(tool.code, tool.entry, args, {
    timeout: tool?.timeout || 30000,
    runtime,
    deps: inject,
  });
  const text = typeof result === 'string' ? result : JSON.stringify(result);
  return depNote ? `${text}${depNote}` : text;
}