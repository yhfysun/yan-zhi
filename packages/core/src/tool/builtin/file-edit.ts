// file_edit 内置工具 — 文件局部精准编辑（old_string → new_string 替换，避免整文件重写）
// 语义对齐主流编码助手的 replace_in_file：old_string 必须在文件中唯一命中（或 replace_all），
// 未命中/多命中时返回引导性错误，让模型补充上下文或改用 file_grep 定位。
//
// 2026-10-03 升级（P0）：
//   1) multi-hunk：`edits` 数组一次调用改多处（对齐 Cline 的 SEARCH/REPLACE 块），
//      原子语义 —— 任一 hunk 失败则整个调用不落盘，避免半改状态。
//   2) 模糊匹配回退：精确匹配失败后按「行尾空白容忍」再匹配一次（rtrim 逐行比对），
//      容忍模型复述代码时的尾随空格差异；仍失败才报错。
import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';
import { resolveToolPath } from './fs-walk';

interface EditSpec {
  old: string;
  new: string;
  replaceAll: boolean;
}

interface ApplyResult {
  ok: boolean;
  text: string;
  count: number;
  /** 匹配策略：exact=逐字符；whitespace-tolerant=行尾空白容忍的逐行回退 */
  strategy: 'exact' | 'whitespace-tolerant';
  error?: string;
}

/** 行尾空白容忍匹配：把两侧行都 rtrim 后逐行比对，返回所有命中起点（行号 0-based） */
function findFuzzyMatches(lines: string[], oldLines: string[]): number[] {
  if (oldLines.length === 0 || oldLines.length > lines.length) return [];
  const rtrim = (s: string) => s.replace(/\s+$/, '');
  const needle = oldLines.map(rtrim);
  const hits: number[] = [];
  for (let start = 0; start <= lines.length - oldLines.length; start++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (rtrim(lines[start + j]) !== needle[j]) { match = false; break; }
    }
    if (match) hits.push(start);
  }
  return hits;
}

/** 单个 hunk 的替换：先精确（LF 规范空间），失败后模糊回退 */
function applyEdit(norm: string, spec: EditSpec): ApplyResult {
  const oldNorm = spec.old;
  const newNorm = spec.new;

  // ── 1) 精确匹配 ──
  let count = 0;
  let idx = norm.indexOf(oldNorm);
  while (idx !== -1) {
    count++;
    idx = norm.indexOf(oldNorm, idx + oldNorm.length);
  }
  if (count > 1 && !spec.replaceAll) {
    return { ok: false, text: norm, count, strategy: 'exact', error: `old_string 匹配到 ${count} 处，需扩大上下文使其唯一或传 replace_all=true` };
  }
  if (count >= 1) {
    const next = spec.replaceAll ? norm.split(oldNorm).join(newNorm) : norm.replace(oldNorm, newNorm);
    return { ok: true, text: next, count: spec.replaceAll ? count : 1, strategy: 'exact' };
  }

  // ── 2) 模糊回退：行尾空白容忍 ──
  const lines = norm.split('\n');
  const oldLines = oldNorm.split('\n');
  const newLines = newNorm.split('\n');
  const hits = findFuzzyMatches(lines, oldLines);
  if (hits.length === 0) {
    return { ok: false, text: norm, count: 0, strategy: 'whitespace-tolerant', error: 'old_string 未命中（含行尾空白容忍匹配）' };
  }
  if (hits.length > 1 && !spec.replaceAll) {
    return { ok: false, text: norm, count: hits.length, strategy: 'whitespace-tolerant', error: `old_string（容忍行尾空白后）匹配到 ${hits.length} 处，需扩大上下文使其唯一或传 replace_all=true` };
  }
  // 从后往前替换，避免行号位移（replaceAll 时多个命中都要换）
  const targets = spec.replaceAll ? hits.reverse() : hits.slice(-1);
  for (const start of targets) {
    lines.splice(start, oldLines.length, ...newLines);
  }
  return { ok: true, text: lines.join('\n'), count: targets.length, strategy: 'whitespace-tolerant' };
}

/** 解析入参成 EditSpec 列表：优先 edits 数组（multi-hunk），兼容单 old_string/new_string */
function parseEditSpecs(args: Record<string, unknown>): { specs: EditSpec[]; error?: string } {
  if (Array.isArray(args.edits)) {
    const specs: EditSpec[] = [];
    for (let i = 0; i < args.edits.length; i++) {
      const e = args.edits[i] as Record<string, unknown> | null;
      const oldS = typeof e?.old_string === 'string' ? e.old_string : '';
      const newS = e?.new_string;
      if (!oldS) return { specs: [], error: `edits[${i}].old_string is required and must be non-empty` };
      if (newS === undefined || newS === null) return { specs: [], error: `edits[${i}].new_string is required (use empty string to delete text)` };
      specs.push({ old: oldS, new: String(newS), replaceAll: Boolean(e?.replace_all) });
    }
    return { specs };
  }
  const oldString = args.old_string as string | undefined;
  const newString = args.new_string as string | undefined;
  if (oldString === undefined || oldString === null || oldString === '') {
    return { specs: [], error: 'old_string is required and must be non-empty. To create a new file, use file_write instead. For multiple changes in one call, pass the edits array.' };
  }
  if (newString === undefined || newString === null) {
    return { specs: [], error: 'new_string is required (use empty string to delete text).' };
  }
  return { specs: [{ old: oldString, new: newString, replaceAll: Boolean(args.replace_all) }] };
}

export class FileEditTool implements BuiltInTool {
  name = 'file_edit';
  description = '对已有文件做局部替换编辑：把 old_string 精确替换为 new_string。old_string 需与文件内容一致且唯一（多处时扩大上下文或传 replace_all=true）；行尾空白差异会自动容忍。一次改多处传 edits 数组 [{old_string,new_string},...]（原子生效：任一处未命中则整个调用不写入）。适合修改大文件/配置，比 file_write 整文件覆盖更安全省 token。新建文件请用 file_write。';

  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The file to edit (absolute or relative path). Must already exist — use file_write to create new files.',
      },
      old_string: {
        type: 'string',
        description: 'The exact text to replace. Must be unique in the file unless replace_all is true.',
      },
      new_string: {
        type: 'string',
        description: 'The replacement text. Use empty string to delete the matched text.',
      },
      edits: {
        type: 'array',
        description: 'Multiple replacements in one atomic call (preferred for multi-hunk edits). Each item: { old_string, new_string, replace_all? }. Applied in order; if ANY edit fails to match, nothing is written.',
        items: {
          type: 'object',
          properties: {
            old_string: { type: 'string', description: 'Exact text to replace (unique in file unless replace_all).' },
            new_string: { type: 'string', description: 'Replacement text; empty string deletes.' },
            replace_all: { type: 'boolean', description: 'Replace all occurrences of this item\'s old_string.' },
          },
          required: ['old_string', 'new_string'],
        },
      },
      replace_all: {
        type: 'boolean',
        description: 'Replace ALL occurrences of old_string. Defaults to false (requires unique match).',
      },
    },
    required: ['path'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const { fs } = getPlatformAdapter();
    // ★★ 必填校验看**原始入参**（先校验再解析，理由见 file-read.ts 同处注释）
    const rawPath = typeof args.path === 'string' ? args.path.trim() : '';
    if (!rawPath) {
      return { content: [{ type: 'text', text: 'Error: path is required' }], isError: true };
    }
    // ★ 相对路径基于**工作目录**解析（见 fs-walk.ts:resolveToolPath）
    const path = resolveToolPath(rawPath, ctx?.workspaceDir);

    const parsed = parseEditSpecs(args);
    if (parsed.error || parsed.specs.length === 0) {
      return { content: [{ type: 'text', text: `Error: ${parsed.error || 'no edits provided'}` }], isError: true };
    }
    const specs = parsed.specs;

    const exists = await fs.exists(path);
    if (!exists) {
      return {
        content: [{ type: 'text', text: `Error: file not found: ${path}. To create a new file, use file_write.` }],
        isError: true,
      };
    }

    let content: string;
    try {
      content = await fs.readFile(path);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error reading file: ${msg}` }], isError: true };
    }

    // 统一换行比较/替换（都在 LF 规范空间进行），写回时还原原换行风格
    const isCrlf = content.includes('\r\n');
    const fileNorm = content.replace(/\r\n/g, '\n');

    // 依次套用各 hunk（在 LF 规范空间），任一失败即中止 —— 原子语义，不写半改状态
    let work = fileNorm;
    let totalReplaced = 0;
    const strategies: string[] = [];
    for (let i = 0; i < specs.length; i++) {
      const spec: EditSpec = { ...specs[i], old: specs[i].old.replace(/\r\n/g, '\n'), new: specs[i].new.replace(/\r\n/g, '\n') };
      const r = applyEdit(work, spec);
      if (!r.ok) {
        const preview = fileNorm.slice(0, 300);
        const done = i > 0 ? `（前 ${i} 个 hunk 已在内存中匹配成功，但**未落盘** —— 本调用原子生效）` : '';
        return {
          content: [{
            type: 'text',
            text: `Error: edit ${i + 1}/${specs.length} failed: ${r.error}. ${done}\nRe-read the file (or use file_grep to locate the region) and copy old_string verbatim.\nFile head preview:\n${preview}`,
          }],
          isError: true,
        };
      }
      work = r.text;
      totalReplaced += r.count;
      strategies.push(r.strategy === 'exact' ? 'exact' : 'fuzzy');
    }

    const next = isCrlf ? work.replace(/\n/g, '\r\n') : work;

    try {
      await fs.writeFile(path, next);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error writing file: ${msg}` }], isError: true };
    }

    const fuzzyUsed = strategies.includes('fuzzy');
    const strategyNote = specs.length > 1
      ? ` (${specs.length} hunks: ${strategies.join(', ')})`
      : fuzzyUsed ? ' (matched with trailing-whitespace tolerance — consider copying old_string verbatim)' : '';
    return {
      content: [{
        type: 'text',
        text: `Successfully edited ${path}: applied ${specs.length} edit${specs.length > 1 ? 's' : ''}, replaced ${totalReplaced} occurrence${totalReplaced > 1 ? 's' : ''}${strategyNote}. New file size: ${next.length} chars.`,
      }],
      _meta: { path, category: 'intermediate', bytes: next.length, edits: totalReplaced },
    };
  }
}
