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
import { applyHunksToContent, parseApplyPatch, summarizeOp, type PatchOp } from './apply-patch';
import { toolError } from '../result';

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
  description = '对已有文件做局部编辑。两种用法：① 传 patch（apply_patch 补丁文本）——**多文件或多处改动优先用它**：按行上下文定位，不需要复述整段原文，也不会因 old_string 过短而撞上"多处命中"；一个补丁跨文件原子生效（任一失败则全不落盘）。② 传 old_string/new_string 或 edits 数组——单处小改时用，old_string 需与文件内容一致且唯一（行尾空白差异自动容忍）。新建文件用 file_write（或用补丁的 *** Add File）。';

  inputSchema = {
    type: 'object',
    properties: {
      patch: {
        type: 'string',
        description: [
          'apply_patch 补丁文本（多文件/多处改动首选）。格式：',
          '*** Begin Patch',
          '*** Update File: src/a.ts',
          '@@ 可选锚点说明',
          ' 未修改的上下文行（行首一个空格）',
          '-要删除的行',
          '+要新增的行',
          '*** Add File: src/b.ts',
          '+新文件内容逐行',
          '*** Delete File: src/c.ts',
          '*** End Patch',
          '规则：上下文行必须与文件逐行一致（缩进/空行都算，仅容忍行尾空白）；每块至少带 2~3 行上下文；同一文件只出现一次；整个补丁原子生效。',
        ].join('\n'),
      },
      path: {
        type: 'string',
        description: 'The file to edit (absolute or relative path). Must already exist — use file_write to create new files. 传 patch 时不需要它（路径写在段头里）。',
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
    // ★ 不再静态声明 required: ['path'] —— patch 模式的路径写在段头里，静态必填会让
    //   「只传 patch」的合法调用被 missingRequiredArgs 挡在门外。必填校验改在 execute 里按模式做。
    required: [],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const { fs } = getPlatformAdapter();

    // ── 模式一：apply_patch 补丁（Codex 语法；多文件/多处改动优先）──────────
    const patchText = typeof args.patch === 'string' ? args.patch : '';
    if (patchText.trim()) {
      if (args.old_string !== undefined || args.edits !== undefined) {
        return toolError('Error: 不要同时传 patch 与 old_string/edits —— 两种模式二选一。patch 的文件路径写在 "*** Update File:" 段头里。');
      }
      return this.executePatch(patchText, ctx);
    }

    // ★★ 必填校验看**原始入参**（先校验再解析，理由见 file-read.ts 同处注释）
    const rawPath = typeof args.path === 'string' ? args.path.trim() : '';
    if (!rawPath) {
      return toolError('Error: path is required（或改用 patch 模式，把路径写在 "*** Update File:" 段头里）');
    }
    // ★ 相对路径基于**工作目录**解析（见 fs-walk.ts:resolveToolPath）
    const path = resolveToolPath(rawPath, ctx?.workspaceDir);

    const parsed = parseEditSpecs(args);
    if (parsed.error || parsed.specs.length === 0) {
      return toolError(`Error: ${parsed.error || 'no edits provided'}`);
    }
    const specs = parsed.specs;

    const exists = await fs.exists(path);
    if (!exists) {
      return toolError(`Error: file not found: ${path}. To create a new file, use file_write.`);
    }

    let content: string;
    try {
      content = await fs.readFile(path);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return toolError(`Error reading file: ${msg}`);
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
        return toolError(`Error: edit ${i + 1}/${specs.length} failed: ${r.error}. ${done}\nRe-read the file (or use file_grep to locate the region) and copy old_string verbatim.\nFile head preview:\n${preview}`);
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
      return toolError(`Error writing file: ${msg}`);
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

  /**
   * apply_patch 模式：解析 → **在内存里算完所有文件** → 全部成功才落盘。
   *
   * ★ 为什么跨文件原子：一次补丁常同时改实现与测试/类型。若逐文件落盘，第二处失败时
   *   第一处已写入 → 仓库停在"实现改了、测试没改"的半截状态，回滚还得靠用户。
   *   先把所有 before/after 算出来，失败的补丁**一个字节都不写**。
   */
  private async executePatch(patchText: string, ctx?: ToolContext): Promise<McpCallResult> {
    const { fs } = getPlatformAdapter();
    const parsed = parseApplyPatch(patchText);
    if (!parsed.ok) {
      return toolError(`Error: invalid patch — ${parsed.error}\n补丁未执行，文件未被修改。`);
    }

    interface PendingChange {
      op: PatchOp;
      path: string;
      before: string | null;
      after: string | null;
      added: number;
      removed: number;
      fuzzy: boolean;
    }
    const pending: PendingChange[] = [];
    // ★ 解析层只按字面查重（a.ts vs ./a.ts 查不出来），这里按**解析后的绝对路径**再查一次：
    //   同一文件两段会让原子语义与后段匹配都变得不可靠。
    const claimed = new Set<string>();

    for (const op of parsed.ops) {
      const filePath = resolveToolPath(op.path, ctx?.workspaceDir);
      const resolvedKey = filePath.replace(/\\/g, '/');
      if (claimed.has(resolvedKey)) {
        return toolError(`Error: 同一文件在补丁中出现多次：${filePath}。请合并成一个段。\n补丁未执行，文件未被修改。`);
      }
      claimed.add(resolvedKey);
      const exists = await fs.exists(filePath);

      if (op.kind === 'update') {
        if (!exists) {
          return toolError(`Error: *** Update File 目标不存在：${filePath}。新建文件请用 *** Add File。\n补丁未执行，文件未被修改。`);
        }
        const before = await fs.readFile(filePath);
        const r = applyHunksToContent(before, op.hunks, filePath);
        if (!r.ok) {
          return toolError(`Error: ${r.error}\n补丁未执行，文件未被修改（整份补丁原子生效）。`);
        }
        // 保留原换行风格（与 old_string 路径同一口径）
        const isCrlf = before.includes('\r\n');
        const after = isCrlf ? r.content.replace(/\n/g, '\r\n') : r.content;
        pending.push({ op, path: filePath, before, after, added: r.added, removed: r.removed, fuzzy: r.fuzzy });
      } else if (op.kind === 'add') {
        if (exists) {
          return toolError(`Error: *** Add File 目标已存在：${filePath}。要修改它请用 *** Update File。\n补丁未执行，文件未被修改。`);
        }
        const after = op.addLines.length ? `${op.addLines.join('\n')}\n` : '';
        pending.push({ op, path: filePath, before: null, after, added: op.addLines.length, removed: 0, fuzzy: false });
      } else {
        if (!exists) {
          return toolError(`Error: *** Delete File 目标不存在：${filePath}。\n补丁未执行，文件未被修改。`);
        }
        const before = await fs.readFile(filePath);
        pending.push({ op, path: filePath, before, after: null, added: 0, removed: before.split('\n').length, fuzzy: false });
      }
    }

    // ── 落盘（此时内容已全部校验通过，失败只可能是 IO/权限）──
    const failed: string[] = [];
    for (const p of pending) {
      try {
        if (p.op.kind === 'delete') {
          await fs.remove(p.path);
        } else {
          const dir = dirNameOf(p.path);
          if (dir && !(await fs.exists(dir))) await fs.mkdir(dir);
          await fs.writeFile(p.path, p.after!);
        }
      } catch (e: unknown) {
        failed.push(`${p.path}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (failed.length) {
      return toolError(`Error: 补丁校验通过，但写入失败：\n${failed.join('\n')}\n已写入 ${pending.length - failed.length}/${pending.length} 个文件。请检查路径/权限后重试。`);
    }

    const lines = pending.map((p) => summarizeOp(p.op, { added: p.added, removed: p.removed }));
    const totalAdded = pending.reduce((n, p) => n + p.added, 0);
    const totalRemoved = pending.reduce((n, p) => n + p.removed, 0);
    const fuzzyNote = pending.some((p) => p.fuzzy)
      ? '\n（有块按行尾空白容忍匹配成功 —— 后续尽量逐字复制上下文行）'
      : '';
    return {
      content: [{
        type: 'text',
        text: `Successfully applied patch: ${pending.length} file${pending.length > 1 ? 's' : ''}, +${totalAdded}/-${totalRemoved} lines.\n${lines.join('\n')}${fuzzyNote}`,
      }],
      // _meta.changes 供调用方逐文件写 file_change 快照（前端 Diff 卡片按文件展示）
      _meta: {
        path: pending[0]?.path || '',
        category: 'intermediate',
        edits: pending.reduce((n, p) => n + p.op.hunks.length, 0),
        bytes: pending.reduce((n, p) => n + (p.after?.length || 0), 0),
        changes: pending.map((p) => ({ path: p.path, beforeContent: p.before, afterContent: p.after })),
      },
    } as McpCallResult;
  }
}

/** 取目录部分（兼容 / 与 \；无分隔符返回空串） */
function dirNameOf(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i > 0 ? p.slice(0, i) : '';
}
