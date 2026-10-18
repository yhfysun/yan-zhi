/**
 * ★★★ 仓库地图（repo map）常驻注入 —— 开发模式"写码弱"根因修复之三（2026-10-18）。
 *
 * 为什么需要：开发模式有 code_search/outline/refs/graph 一堆检索工具，但仓库的"符号地图"
 *   不常驻提示词 —— 长任务里模型反复 file_list/file_grep 逐目录重新探索，白烧大量步数
 *   （对齐 CodeBuddy/aider 的 repo-map 能力，见 docs/开发模式长任务与上下文-对齐CodeBuddy差距与优化方案.md 差距矩阵 #8）。
 *
 * 设计约束：
 *   - **同步**：buildSystemPromptForBackend / buildSubAgentSharedSections 都是同步组装，
 *     这里用同步的 parseWithTs（TS Compiler API，纯函数）而非 async 的 tryParseAst。
 *   - **有界**：文件数/深度/每文件符号数/总字符全部设上限，超大仓库自动降级（截断并注明），
 *     绝不让地图撑爆系统提示词。
 *   - **可丢弃**：地图是快照不是真相源 —— 提示词里明说"动手前对目标文件 file_read 确认"。
 *   - **缓存**：同目录 5 分钟 TTL（任务内多次组装提示词不必重算；文件变了最多延迟 5 分钟，
 *     模型本就被要求 file_read 确认，快照过期无害）。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { parseWithTs, loadTsCompiler } from '@yan-zhi/core';

// ★ TS 编译器预热：parseWithTs 依赖模块级 tsModule（由 async 的 loadTsCompiler 装载）。
//   本服务被 llm-task-manager 在启动时 import → 服务进程一起跑就预热；
//   装载完成前的头几次组装只列文件名不提符号（快照缺符号无害，模型被要求 file_read 确认）。
void loadTsCompiler().catch(() => { /* 编译器不可用 → 地图退化为纯目录+文件名清单 */ });

/** 不进地图的目录：依赖/产物/版本管理/隐藏目录（起始 . 一律跳过） */
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'out', 'build', 'coverage', 'target', '__pycache__',
  '.git', '.svn', '.hg', '.venv', 'venv', '.next', '.nuxt', '.idea', '.vscode',
  'dist-release', 'runtime', 'testdata', 'test-results', 'playwright-report',
]);

/** 参与符号提取的扩展名（parseWithTs 支持的 TS/JS 家族；.vue 走 tryParseAst 是 async，这里只列文件名） */
const PARSE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** 默认上限：本仓（约 2 千源码文件）实测意义下的保守值，可按仓库规模调 */
const DEFAULTS = {
  maxDepth: 5,          // 目录深度（根=0）
  maxFiles: 300,        // 最多列出的文件数
  maxFileBytes: 256 * 1024, // 超大文件不解析符号（列名即可）
  maxSymbolsPerFile: 6, // 每文件最多列出的符号数
  maxChars: 8000,       // 地图总字符预算
};

export interface RepoMapResult {
  text: string;
  truncated: boolean;
  fileCount: number;
}

export interface RepoMapOptions {
  maxDepth?: number;
  maxFiles?: number;
  maxFileBytes?: number;
  maxSymbolsPerFile?: number;
  maxChars?: number;
  /** 测试用：跳过 TTL 缓存强制重算 */
  fresh?: boolean;
}

interface CacheEntry { at: number; value: RepoMapResult; }
const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 8;

/** 测试钩子：清缓存（改完文件想立刻看新地图时也用它） */
export function resetRepoMapCache(): void {
  CACHE.clear();
}

/** 声明是否值得进地图：顶层符号（无 parent）+ 类/函数/接口/类型/枚举/导出常量；方法太碎不进 */
function declWorthy(kind: string, exported: boolean, hasParent: boolean): boolean {
  if (hasParent) return false; // 方法/成员不进
  if (['class', 'interface', 'enum', 'type'].includes(kind)) return true;
  if (kind === 'function') return true;
  if (kind === 'const' && exported) return true;
  return false;
}

/** 跳过 generate/synthetic 味道的符号（如 __decorate 之类），保持地图干净 */
function looksSynthetic(name: string): boolean {
  return name.startsWith('__') || name === '<anonymous>' || name === '<module>';
}

/**
 * 构建仓库地图（同步）。异常由调用方兜（repoMapPromptSection 已 try/catch）。
 */
export function buildRepoMapSync(root: string, opts?: RepoMapOptions): RepoMapResult {
  const o = { ...DEFAULTS, ...opts };
  const cacheKey = path.resolve(root);
  if (!opts?.fresh) {
    const hit = CACHE.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    if (hit) CACHE.delete(cacheKey);
  }
  // 简单 LRU：超容量清最旧
  if (CACHE.size >= CACHE_MAX) {
    const oldest = [...CACHE.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) CACHE.delete(oldest[0]);
  }

  const rootName = path.basename(cacheKey) || cacheKey;
  const lines: string[] = [];
  let fileCount = 0;
  let truncated = false;

  /** 每目录一节：文件行 = 相对路径 + 符号清单（name:line，kind 缩写前缀） */
  const walk = (dir: string, rel: string, depth: number): void => {
    if (truncated || depth > o.maxDepth || fileCount >= o.maxFiles) { truncated = truncated || fileCount >= o.maxFiles; return; }
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch { return; }
    const dirs: import('node:fs').Dirent[] = [];
    const files: import('node:fs').Dirent[] = [];
    for (const e of entries) {
      if (e.isDirectory()) {
        const n = e.name;
        if (n.startsWith('.') || SKIP_DIRS.has(n) || SKIP_DIRS.has(n.toLowerCase())) continue;
        dirs.push(e);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (PARSE_EXTS.has(ext)) files.push(e);
      }
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    for (const f of files) {
      if (fileCount >= o.maxFiles) { truncated = true; return; }
      const abs = path.join(dir, f.name);
      let size = 0;
      try { size = statSync(abs).size; } catch { continue; }
      fileCount++;
      let syms = '';
      if (size <= o.maxFileBytes) {
        try {
          const source = readFileSync(abs, 'utf-8');
          const parsed = parseWithTs(source, f.name);
          if (parsed) {
            const picked = parsed.decls
              .filter((d) => declWorthy(d.kind, d.exported, !!d.parent))
              .filter((d) => !looksSynthetic(d.name))
              // 导出的排前，同优先级按行号
              .sort((a, b) => (a.exported === b.exported ? a.line - b.line : a.exported ? -1 : 1))
              .slice(0, o.maxSymbolsPerFile)
              .map((d) => `${d.name}:${d.line}`);
            if (picked.length) syms = `: ${picked.join(', ')}`;
          }
        } catch { /* 读失败/解析失败 → 只列文件名 */ }
      }
      lines.push(`${rel}${f.name}${syms}`);
    }
    for (const d of dirs) {
      if (truncated) return;
      lines.push(`${rel}${d.name}/`);
      walk(path.join(dir, d.name), `${rel}${d.name}/`, depth + 1);
    }
  };

  walk(cacheKey, '', 0);

  // 根 package.json scripts：构建/测试命令是地图上最值钱的一行
  try {
    const pkg = JSON.parse(readFileSync(path.join(cacheKey, 'package.json'), 'utf-8'));
    const scripts = pkg?.scripts || {};
    const pairs = Object.entries(scripts as Record<string, string>)
      .filter(([k]) => !k.startsWith('pre') && !k.startsWith('post'))
      .slice(0, 8)
      .map(([k, v]) => `${k}=${v}`);
    if (pairs.length) {
      lines.push('');
      lines.push(`package.json scripts: ${pairs.join('; ')}`);
    }
  } catch { /* 无 package.json 正常 */ }

  let text = lines.join('\n');
  if (text.length > o.maxChars) {
    text = `${text.slice(0, o.maxChars)}\n…（仓库较大，地图已截断；细粒度探索用 code_search / code_outline / file_grep）`;
    truncated = true;
  }
  const value: RepoMapResult = { text, truncated, fileCount };
  CACHE.set(cacheKey, { at: Date.now(), value });
  return value;
}

/** 开发模式相关智能体（架构师 + 探索者 + 三个实现者）：repo map 注入对象 */
export const DEV_REPO_MAP_AGENT_IDS = new Set([
  'a_builtin_code_agent', 'a_builtin_code_explorer',
  'a_builtin_backend_dev', 'a_builtin_frontend_dev', 'a_builtin_java_agent',
]);

/** 统一的提示词段封装：两个注入点（主循环 buildSystemPromptForBackend / 子智能体共享段）共用 */
export function repoMapPromptSection(workspaceDir?: string | null): string {
  if (!workspaceDir || !workspaceDir.trim()) return '';
  try {
    const m = buildRepoMapSync(workspaceDir);
    if (!m.text.trim()) return '';
    const header = [
      '---',
      '## 仓库地图（repo map，自动生成的结构快照）',
      '> 开工先看这里：目录职责、关键符号与行号都在图上 —— 找文件/定位符号优先用图，别再逐目录 file_list 盲探。',
      '> ★ 地图是**快照**：动手修改前对目标文件 file_read 确认现状；图上没有的符号用 code_search 找。',
    ].join('\n');
    const tail = m.truncated ? '\n（注：本图因仓库过大被截断，只覆盖部分目录）' : '';
    return `${header}\n\n${m.text}${tail}`;
  } catch {
    return ''; // 地图生成失败绝不影响任务
  }
}
