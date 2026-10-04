// code_diagnostics 内置工具 — 项目诊断（tsc 类型检查 / eslint / node --check 语法检查）
//
// ★★★ 为什么需要（2026-10-03 P0 反馈闭环）：此前没有任何诊断类工具，模型改完代码只能
//   靠 cmd_exec 手跑 tsc（实测经常不跑），改完就宣称完成 —— 类型错误/语法错误直接交付给用户。
//   本工具 + executeTool 的「编辑后自动诊断」钩子（llm-task-manager.maybeAutoDiagnose）构成闭环：
//   改完 → 自动跑诊断 → 错误回喂模型 → 当场自修。
//
// 设计取向：
//   - 零新增依赖：tsc/eslint 一律用**目标项目自己**的 node_modules（node <path>/tsc.js），
//     core 自身不 import typescript（浏览器构建安全）；都没装时降级 node --check 单文件语法检查。
//   - 缓存：tsc 全项目跑一次可能数十秒，按项目根缓存 90s（TTL），编辑后由钩子主动失效。
//   - 输出有界：问题条数封顶 + capToolOutput，防大项目刷屏撑爆上下文。
import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { resolveToolPath } from './fs-walk';
import { capToolOutput } from './output-cap';
import { toolError } from '../result';

// ───────────────────────── node 内置模块动态加载（同 cmd-exec 手法） ─────────────────────────

/** execFile 的最小类型签名（避免依赖完整 @types/node） */
type ExecFileFn = (
  file: string,
  args: string[],
  opts?: { cwd?: string; timeout?: number; maxBuffer?: number; windowsHide?: boolean },
  cb?: (err: (Error & { killed?: boolean }) | null, stdout: string | Buffer, stderr: string | Buffer) => void,
) => unknown;

type FsMod = {
  existsSync(p: string): boolean;
  statSync(p: string): { isDirectory(): boolean; size: number; mtimeMs: number };
};

async function loadNodeModule<T>(name: string): Promise<T | null> {
  try {
    // 变量拼接模块名 + @vite-ignore：浏览器构建不做静态分析，运行时才解析（Node 环境才有）
    const mod = await import(/* @vite-ignore */ name);
    return mod as T;
  } catch {
    return null;
  }
}

let cpCache: { execFile: ExecFileFn } | null | undefined;
let fsCache: FsMod | null | undefined;

async function loadCp(): Promise<{ execFile: ExecFileFn } | null> {
  if (cpCache === undefined) {
    const m = await loadNodeModule<{ execFile: ExecFileFn }>('node:child' + '_process');
    cpCache = m && typeof m.execFile === 'function' ? m : null;
  }
  return cpCache ?? null;
}
async function loadFs(): Promise<FsMod | null> {
  if (fsCache === undefined) fsCache = await loadNodeModule<FsMod>('node:' + 'fs');
  return fsCache ?? null;
}

// ───────────────────────── 结构化诊断结果 ─────────────────────────

export interface DiagProblem {
  file: string;
  line: number;
  col: number;
  severity: 'error' | 'warning';
  code?: string;
  message: string;
}

export interface DiagnosticsRun {
  /** 实际执行的检查（tsc / eslint / syntax）；空数组 = 没有任何可跑的检查 */
  ran: string[];
  projectRoot: string | null;
  problems: DiagProblem[];
  /** 给模型的补充说明（为什么某项没跑等） */
  notes: string[];
  durationMs: number;
  /** 已格式化的完整文本（显式调用工具时直接展示） */
  text: string;
}

/** tsc 输出行：src/a.ts(12,5): error TS2304: Cannot find name 'foo'. */
const TSC_LINE_RE = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/;
/** eslint 默认 stylish 输出：  12:5  error  Unexpected ...  rule-name */
const ESLINT_LINE_RE = /^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}([\w@/-]+)$/;

function execFileAsync(
  execFile: ExecFileFn,
  file: string,
  args: string[],
  opts: { cwd?: string; timeout?: number },
): Promise<{ stdout: string; stderr: string; exitCode: number; failed: boolean }> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { cwd: opts.cwd, timeout: opts.timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({
          stdout: typeof stdout === 'string' ? stdout : String(stdout ?? ''),
          stderr: typeof stderr === 'string' ? stderr : String(stderr ?? ''),
          // 超时/被杀也带部分输出（err.message 里有 signal），failed 标记交给上层决定怎么呈现
          exitCode: err ? (err as { code?: number }).code ?? 1 : 0,
          failed: !!err,
        });
      },
    );
  });
}

/** 从目标路径向上找项目根（tsconfig.json / package.json 所在目录），最多 15 层 */
function findProjectRoot(fsMod: FsMod, startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 15; i++) {
    if (fsMod.existsSync(join(dir, 'tsconfig.json')) || fsMod.existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/** 路径拼接（不引 node:path，浏览器构建安全；首段决定分隔符风格） */
function join(...segs: string[]): string {
  if (segs.length === 0) return '';
  const base = segs[0];
  const sep = base.includes('\\') || /^[A-Za-z]:/.test(base) ? '\\' : '/';
  let out = base.replace(/[\\/]+$/, '');
  for (let i = 1; i < segs.length; i++) {
    out += sep + segs[i].replace(/^[\\/]+|[\\/]+$/g, '');
  }
  return out;
}
function dirname(p: string): string {
  const norm = p.replace(/[\\/]+$/, '');
  const idx = Math.max(norm.lastIndexOf('\\'), norm.lastIndexOf('/'));
  return idx <= 0 ? norm : norm.slice(0, idx);
}

/** 目标项目本地的 tsc.js —— 项目没有 typescript 依赖时返回 null */
function findLocalTsc(fsMod: FsMod, root: string): string | null {
  const tscJs = join(join(root, 'node_modules'), join('typescript', 'lib', 'tsc.js'));
  return fsMod.existsSync(tscJs) ? tscJs : null;
}

/**
 * 目标项目本地的 vue-tsc 入口（Vue 项目的类型检查器）。
 * ★ 探测到即优先使用：vue-tsc 是 tsc 的超集（无 .vue 文件时行为等同 tsc），
 *   输出格式与 tsc 完全一致 —— 解析器（TSC_LINE_RE）零改动。
 */
function findLocalVueTsc(fsMod: FsMod, root: string): string | null {
  const entry = join(join(root, 'node_modules'), join('vue-tsc', 'bin', 'vue-tsc.js'));
  return fsMod.existsSync(entry) ? entry : null;
}

function findLocalEslint(fsMod: FsMod, root: string): string | null {
  const entry = join(join(root, 'node_modules'), join('eslint', 'bin', 'eslint.js'));
  return fsMod.existsSync(entry) ? entry : null;
}

const ESLINT_CONFIG_FILES = [
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs',
  '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml', '.eslintrc',
];

const SYNTAX_CHECK_EXTS = new Set(['js', 'jsx', 'mjs', 'cjs']);

// ───────────────────────── tsc 结果缓存 ─────────────────────────
// tsc 全项目一次可能几十秒；自动诊断钩子在编辑循环里高频触发，必须缓存。
// 钩子在每次成功写文件后调 invalidateDiagnosticsCache() —— 缓存只在「没改文件」的窗口内复用。

interface TscCacheEntry { expiresAt: number; problems: DiagProblem[]; durationMs: number; projectRoot: string }
const TSC_CACHE_TTL_MS = 90_000;
const tscCache = new Map<string, TscCacheEntry>();

/** 失效项目级诊断缓存。root 省略 = 全清（自动诊断钩子用全清：改了哪个文件的根不好反查）。 */
export function invalidateDiagnosticsCache(root?: string): void {
  if (root) tscCache.delete(root);
  else tscCache.clear();
}

async function runTsc(
  execFile: ExecFileFn,
  fsMod: FsMod,
  root: string,
  timeoutMs: number,
  force: boolean,
): Promise<{ problems: DiagProblem[]; durationMs: number; note?: string } | null> {
  // ★ Vue 项目优先 vue-tsc（P2-3）：tsc 不解析 .vue 的 <script lang="ts">，
  //   vue-tsc 输出格式与 tsc 完全一致 → 解析器/缓存零改动；但更慢（约 2~3 倍）→ 超时下限抬高。
  const vueTscJs = findLocalVueTsc(fsMod, root);
  const tscJs = vueTscJs ?? findLocalTsc(fsMod, root);
  if (!tscJs) {
    // 项目本地没有 typescript —— 试全局 tsc（PATH 上）
    return { problems: [], durationMs: 0, note: '项目 node_modules 中未找到 typescript，跳过 tsc 类型检查' };
  }
  const effectiveTimeout = vueTscJs ? Math.max(timeoutMs, 180_000) : timeoutMs;
  const cached = tscCache.get(root);
  const now = Date.now();
  if (!force && cached && cached.expiresAt > now) {
    return { problems: cached.problems, durationMs: cached.durationMs };
  }
  const started = Date.now();
  const r = await execFileAsync(execFile, process.execPath || 'node', [tscJs, '--noEmit', '--pretty', 'false', '-p', root], {
    cwd: root,
    timeout: effectiveTimeout,
  });
  if (r.failed && r.exitCode !== 1 && r.exitCode !== 2 && r.exitCode !== 0) {
    // 非常规退出码（如超时被杀 / node 不存在）→ 不缓存、给出提示
    return { problems: [], durationMs: Date.now() - started, note: `tsc 运行异常（exit=${r.exitCode}${r.stderr ? ': ' + r.stderr.slice(0, 200) : ''}）` };
  }
  const problems: DiagProblem[] = [];
  // ★ Windows 下 execFile 的 stdout 是 CRLF：行尾 \r 会让 `(.*)$` 匹配失败（JS 的 . 不匹配 \r），
  //   2026-10-03 集成自测实测：tsc 明明报错却解析出 0 条 —— 解析前必须归一化换行。
  for (const line of (r.stdout || '').replace(/\r\n/g, '\n').split('\n')) {
    const m = line.match(TSC_LINE_RE);
    if (!m) continue;
    problems.push({
      file: m[1].trim(),
      line: Number(m[2]),
      col: Number(m[3]),
      severity: m[4] as 'error' | 'warning',
      code: m[5],
      message: m[6].trim(),
    });
  }
  const durationMs = Date.now() - started;
  tscCache.set(root, { expiresAt: now + TSC_CACHE_TTL_MS, problems, durationMs, projectRoot: root });
  return { problems, durationMs };
}

async function runEslint(
  execFile: ExecFileFn,
  fsMod: FsMod,
  root: string,
  targetAbs: string,
  timeoutMs: number,
): Promise<{ problems: DiagProblem[]; raw: string; note?: string } | null> {
  const hasConfig = ESLINT_CONFIG_FILES.some((f) => fsMod.existsSync(join(root, f)));
  if (!hasConfig) return { problems: [], raw: '', note: '项目未配置 eslint，跳过 lint' };
  const eslintJs = findLocalEslint(fsMod, root);
  if (!eslintJs) return { problems: [], raw: '', note: '项目 node_modules 中未找到 eslint，跳过 lint' };
  // 相对路径跑（eslint 对绝对路径在部分 flat config 下行为不一致）
  const rel = targetAbs.startsWith(root + '\\') || targetAbs.startsWith(root + '/')
    ? targetAbs.slice(root.length + 1)
    : targetAbs.startsWith(root) ? targetAbs.slice(root.length).replace(/^[\\/]/, '') : targetAbs;
  const r = await execFileAsync(execFile, process.execPath || 'node', [eslintJs, rel, '--no-error-on-unmatched-pattern'], {
    cwd: root,
    timeout: timeoutMs,
  });
  const problems: DiagProblem[] = [];
  let curFile = rel;
  for (const line of (r.stdout || '').replace(/\r\n/g, '\n').split('\n')) {
    const fm = line.match(/^(.+?\.(?:ts|tsx|js|jsx|mjs|cjs|vue))$/);
    if (fm) { curFile = fm[1]; continue; }
    const m = line.match(ESLINT_LINE_RE);
    if (!m) continue;
    problems.push({ file: curFile, line: Number(m[1]), col: Number(m[2]), severity: m[3] as 'error' | 'warning', code: m[5], message: m[4] });
  }
  return { problems, raw: r.stdout || '' };
}

/** node --check 单文件语法检查（无 tsconfig 的小项目 / 纯 JS 的兜底） */
async function runSyntaxCheck(
  execFile: ExecFileFn,
  fileAbs: string,
  timeoutMs: number,
): Promise<DiagProblem[]> {
  const r = await execFileAsync(execFile, process.execPath || 'node', ['--check', fileAbs], { timeout: timeoutMs });
  if (!r.failed) return [];
  const msg = (r.stderr || r.stdout || '').trim();
  const lm = msg.match(/^(.+?):(\d+)/);
  return [{
    file: fileAbs,
    line: lm ? Number(lm[2]) : 0,
    col: 0,
    severity: 'error',
    code: 'syntax',
    message: msg.split('\n').slice(0, 6).join(' | ').slice(0, 400) || 'syntax error',
  }];
}

// ───────────────────────── 统一入口（工具与自动诊断钩子共用） ─────────────────────────

export interface RunDiagnosticsOptions {
  /** 会话工作目录（相对路径的解析基准 + 默认诊断目标） */
  workspaceDir?: string | null;
  /** 目标文件/目录（绝对或相对工作目录）。省略 = 整个工作目录 */
  targetPath?: string | null;
  /** 跳过 tsc 缓存强制重跑（显式调工具时用） */
  force?: boolean;
  /** 单项检查超时（ms），默认 tsc 120s */
  timeoutMs?: number;
  /** 只跑这些检查；省略 = 全部。自动诊断钩子传 ['tsc']（eslint 每次全量太慢） */
  checks?: Array<'tsc' | 'eslint' | 'syntax'>;
  /** 问题条数封顶，默认 50 */
  maxProblems?: number;
}

/**
 * 跑一轮项目诊断。核心逻辑独立成函数（不只是工具类方法）：
 * llm-task-manager 的「编辑后自动诊断」钩子要直接调它，不走工具注册表。
 */
export async function runCodeDiagnostics(opts: RunDiagnosticsOptions): Promise<DiagnosticsRun> {
  const started = Date.now();
  const empty: DiagnosticsRun = { ran: [], projectRoot: null, problems: [], notes: [], durationMs: 0, text: '' };
  const cp = await loadCp();
  const fsMod = await loadFs();
  if (!cp || !fsMod) {
    empty.notes.push('当前环境不支持子进程（浏览器端），诊断不可用');
    empty.text = empty.notes[0];
    return empty;
  }
  const execFile = cp.execFile;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const maxProblems = opts.maxProblems ?? 50;
  const wantTsc = !opts.checks || opts.checks.includes('tsc');
  const wantEslint = !opts.checks || opts.checks.includes('eslint');
  const wantSyntax = !opts.checks || opts.checks.includes('syntax');

  const target = opts.targetPath
    ? resolveToolPath(opts.targetPath, opts.workspaceDir || undefined)
    : (opts.workspaceDir || process.cwd());

  const notes: string[] = [];
  const ran: string[] = [];
  const problems: DiagProblem[] = [];

  // 目标是文件还是目录
  let isFile = false;
  try { isFile = fsMod.existsSync(target) && !fsMod.statSync(target).isDirectory(); } catch { isFile = false; }

  const startDir = isFile ? dirname(target) : target;
  const root = findProjectRoot(fsMod, startDir);
  if (!root) {
    empty.notes.push(`未找到项目根（向上 15 层都没有 tsconfig.json / package.json）：${startDir}`);
    empty.text = empty.notes[0];
    return empty;
  }
  empty.projectRoot = root;

  const ext = isFile ? (target.split('.').pop() || '').toLowerCase() : '';

  // 1) tsc 类型检查（有 tsconfig.json 才跑；缓存 90s）
  if (wantTsc && fsMod.existsSync(join(root, 'tsconfig.json'))) {
    const r = await runTsc(execFile, fsMod, root, timeoutMs, !!opts.force);
    if (r) {
      if (r.note) notes.push(r.note);
      else {
        ran.push('tsc');
        problems.push(...r.problems);
      }
    }
  } else if (wantTsc) {
    notes.push('项目无 tsconfig.json，跳过 tsc 类型检查');
  }

  // 2) eslint（有配置才跑；只 lint 目标文件/目录，不跑全项目）
  if (wantEslint) {
    const r = await runEslint(execFile, fsMod, root, target, Math.min(timeoutMs, 90_000));
    if (r) {
      if (r.note) notes.push(r.note);
      else {
        ran.push('eslint');
        problems.push(...r.problems);
      }
    }
  }

  // 3) node --check：无 tsc 覆盖的 JS 单文件语法兜底
  if (wantSyntax && isFile && SYNTAX_CHECK_EXTS.has(ext) && !ran.includes('tsc')) {
    const bad = await runSyntaxCheck(execFile, target, 15_000);
    if (bad.length) {
      ran.push('syntax');
      problems.push(...bad);
    }
  }

  const durationMs = Date.now() - started;

  // 排序：error 在前；目标文件的问题排最前（编辑后自动诊断场景，模型最关心自己刚改的文件）
  const targetNorm = target.toLowerCase();
  problems.sort((a, b) => {
    const aTarget = a.file.toLowerCase() === targetNorm ? 0 : 1;
    const bTarget = b.file.toLowerCase() === targetNorm ? 0 : 1;
    if (aTarget !== bTarget) return aTarget - bTarget;
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return a.file.localeCompare(b.file) || a.line - b.line;
  });
  const shown = problems.slice(0, maxProblems);
  const errors = problems.filter((p) => p.severity === 'error').length;
  const warnings = problems.length - errors;

  const parts: string[] = [];
  parts.push(`[诊断] ${root}`);
  parts.push(`检查: ${ran.join(' + ') || '无可用检查'} | 耗时 ${(durationMs / 1000).toFixed(1)}s | ${errors} error, ${warnings} warning（共 ${problems.length} 条${problems.length > shown.length ? `，仅显示前 ${shown.length}` : ''}）`);
  for (const p of shown) {
    const code = p.code ? ` ${p.code}` : '';
    parts.push(`  ${p.file}:${p.line}${p.col ? ':' + p.col : ''}  ${p.severity}${code}: ${p.message}`);
  }
  if (notes.length) parts.push(`说明: ${notes.join('；')}`);
  if (problems.length === 0 && ran.length > 0) parts.push('✅ 未发现问题');

  const text = capToolOutput(parts.join('\n'));
  return { ran, projectRoot: root, problems, notes, durationMs, text };
}

// ───────────────────────── 工具类（显式调用入口） ─────────────────────────

export class CodeDiagnosticsTool implements BuiltInTool {
  name = 'code_diagnostics';
  description = '对项目跑静态诊断并返回结构化问题清单：TypeScript 类型检查（项目装了 vue-tsc 时自动用 vue-tsc，覆盖 .vue 文件的类型错误；否则 tsc --noEmit，均用项目自己的 node_modules）、ESLint、node --check 语法检查（按项目配置自动选择）。在修改 .ts/.js/.vue 等代码文件之后、宣布任务完成之前，务必调用本工具确认没有类型/语法错误；发现错误应立即修复再复查。大项目首次跑可能较慢，结果会缓存约 90 秒。';

  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File or directory to diagnose (absolute or relative to workspace). Defaults to the workspace root. Results are project-wide for tsc, scoped to this target for eslint.',
      },
      force: {
        type: 'boolean',
        description: 'Bypass the ~90s result cache and re-run checks. Use after confirming edits are complete.',
      },
    },
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const rawPath = typeof args.path === 'string' ? args.path.trim() : '';
    const r = await runCodeDiagnostics({
      workspaceDir: ctx?.workspaceDir,
      targetPath: rawPath || null,
      force: Boolean(args.force),
    });
    if (r.ran.length === 0) {
      return toolError(`无法执行诊断：${r.notes.join('；') || '没有可用的检查项'}`);
    }
    return { content: [{ type: 'text', text: r.text }] };
  }
}
