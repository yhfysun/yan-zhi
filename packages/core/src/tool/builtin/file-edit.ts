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
import { readPathArg } from './path-args';
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

/** 字符二元组 Dice 系数（0..1），只用于"哪一行最像"，不参与是否命中的判定 */
function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let overlap = 0;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) || 0);
  return (2 * overlap) / (a.length - 1 + b.length - 1);
}

/**
 * 未命中时定位"最接近的片段"，供模型**照抄**修正 old_string。
 *
 * ★★★ 为什么需要（2026-10-21 实报，conv 9e9bcd12）：模型在 449 行的 `home_page.dart` 上
 *   连续 5 次 file_edit 全部「old_string 未命中」，每次拿到的唯一线索是**文件头 300 字符**
 *   （全是 import），于是它反复整读 449 行文件、再猜一次 ⇒ 6 分钟、25 步全耗在原地，
 *   最后用户手动终止。判据：未命中反馈必须**指向落点**，否则模型只能靠重读+猜。
 *   ⇒ 用 old_string 里最长的一行做锚点，二分查最相似行，回一段带行号的原文窗口。
 * 命中率低于 0.5 视为无相近片段（宁可不给，也不能给错落点）。
 */
function findNearestRegion(
  lines: string[],
  oldLines: string[],
): { startLine: number; endLine: number; text: string; score: number } | null {
  const anchors = oldLines
    .map((l) => l.trim())
    .filter((l) => l.length >= 3)
    .sort((a, b) => b.length - a.length);
  const anchor = anchors[0];
  if (!anchor) return null;

  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    const score = diceCoefficient(lines[i].trim(), anchor);
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  if (bestIdx < 0 || bestScore < 0.5) return null;

  const start = Math.max(0, bestIdx - 2);
  const end = Math.min(lines.length, bestIdx + Math.max(oldLines.length, 3) + 2);
  return {
    startLine: start + 1,
    endLine: end,
    text: lines.slice(start, end).join('\n'),
    score: bestScore,
  };
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

/**
 * Trae / Cline 的 **SEARCH/REPLACE 块** 解析（2026-10-21 对齐三家格式）。
 *
 * 格式（两家写法都认）：
 *   <<<<<<< SEARCH        |  ------- SEARCH
 *   原文逐行               |  原文逐行
 *   =======               |  =======
 *   新文逐行               |  新文逐行
 *   >>>>>>> REPLACE       |  +++++++ REPLACE
 *
 * ★ 为什么支持：模型在 Trae / Cline 里训练出的编辑习惯就是发这种块，而本仓原实现只认
 *   `edits` 数组与 apply_patch —— 参数名/格式对不上时模型会把整块当成 old_string，
 *   必然"未命中"，然后陷入重试。
 */
const SR_START = /^(?:<{5,}\s*SEARCH|-{5,}\s*SEARCH)$/i;
const SR_MID = /^={5,}$/;
const SR_END = /^(?:>{5,}\s*REPLACE|\+{5,}\s*REPLACE)$/i;

function parseSearchReplaceBlocks(text: string): EditSpec[] {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const specs: EditSpec[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!SR_START.test(lines[i].trim())) { i += 1; continue; }
    i += 1;
    const oldLines: string[] = [];
    while (i < lines.length && !SR_MID.test(lines[i].trim()) && !SR_END.test(lines[i].trim())) {
      oldLines.push(lines[i]);
      i += 1;
    }
    if (i >= lines.length || !SR_MID.test(lines[i].trim())) break; // 结构不完整 → 交给调用方报错
    i += 1;
    const newLines: string[] = [];
    while (i < lines.length && !SR_END.test(lines[i].trim())) {
      newLines.push(lines[i]);
      i += 1;
    }
    i += 1; // 跳过结束标记
    const oldText = oldLines.join('\n');
    if (!oldText.trim()) continue; // 空 SEARCH 段无意义
    specs.push({ old: oldText, new: newLines.join('\n'), replaceAll: false });
  }
  return specs;
}

/** 解析入参成 EditSpec 列表：优先 edits 数组（multi-hunk），兼容单 old_string/new_string */
function parseEditSpecs(args: Record<string, unknown>): { specs: EditSpec[]; error?: string } {
  // ① Trae / Cline 的 SEARCH/REPLACE 块（可能是 edits 字符串、diff 或 search_replace 字段）
  const blockSource = typeof args.search_replace === 'string' ? args.search_replace
    : typeof args.diff === 'string' ? args.diff
      : typeof args.edits === 'string' ? args.edits
        : '';
  if (blockSource && /(?:<<<<<<<|-------)\s*SEARCH/i.test(blockSource)) {
    const specs = parseSearchReplaceBlocks(blockSource);
    if (!specs.length) {
      return {
        specs: [],
        error: 'SEARCH/REPLACE 块解析失败：结构应为「<<<<<<< SEARCH / ======= / >>>>>>> REPLACE」（或 Cline 的 ------- / +++++++），且 SEARCH 段不能为空。',
      };
    }
    return { specs };
  }
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
  description = '对已有文件做局部编辑。两种用法：① 传 patch（apply_patch 补丁文本）——**多文件或多处改动优先用它**：按行上下文定位，不需要复述整段原文，也不会因 old_string 过短而撞上"多处命中"；一个补丁跨文件原子生效（任一失败则全不落盘）。② 传 old_string/new_string 或 edits 数组——单处小改时用，old_string 需与文件内容一致且唯一（行尾空白差异自动容忍）。③ 传 search_replace——Trae/Cline 的 SEARCH/REPLACE 块文本（<<<<<<< SEARCH / ======= / >>>>>>> REPLACE），多块原子生效。路径参数可用 path 或 file_path（Claude Code / Codex 命名）。新建文件用 file_write（或用补丁的 *** Add File）。';

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
        description: 'The file to edit (absolute or relative path). Must already exist — use file_write to create new files. 传 patch 时不需要它（路径写在段头里）。也接受 file_path（Claude Code / Codex 命名）。',
      },
      file_path: {
        type: 'string',
        description: '`path` 的别名（Claude Code / Codex 的 file_path 命名），二者等价。',
      },
      old_string: {
        type: 'string',
        description: 'The exact text to replace. Must be unique in the file unless replace_all is true.',
      },
      new_string: {
        type: 'string',
        description: 'The replacement text. Use empty string to delete the matched text.',
      },
      search_replace: {
        type: 'string',
        description: [
          'Trae / Cline 的 SEARCH/REPLACE 块文本（与 edits 等价，用它更省 token）：',
          '<<<<<<< SEARCH',
          '原文（逐字，含缩进）',
          '=======',
          '新文',
          '>>>>>>> REPLACE',
          '可连续写多块，一次调用全部原子生效。',
        ].join('\n'),
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
    // 路径参数兼容 path / file_path / filePath（Claude Code、Codex 用 file_path）
    const rawPath = readPathArg(args);
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
        const done = i > 0 ? `（前 ${i} 个 hunk 已在内存中匹配成功，但**未落盘** —— 本调用原子生效）` : '';
        const where = i > 0 ? '（行号按「已套用前几个 hunk 后」的内容计）' : '';
        const near = findNearestRegion(work.split('\n'), spec.old.split('\n'));
        const hint = near
          ? `\n最接近的片段在第 ${near.startLine}-${near.endLine} 行${where}（相似度 ${near.score.toFixed(2)}）：\n` +
            `---8<---\n${near.text}\n--->8---\n` +
            `请**逐字照抄**上面这段原文作为 old_string（不要凭记忆重写，也不要只改其中一行）。`
          : `\n文件里找不到相近片段${where}：先用 file_grep 搜关键字定位，再按 offset/limit 读那一段；` +
            `若目标文本已不存在，改用 file_write 或 patch。`;
        return toolError(
          `Error: edit ${i + 1}/${specs.length} failed: ${r.error}. ${done}${hint}\n` +
          `不要拿同一个 old_string 再试一次（相同输入必然再次失败）。`,
        );
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
