// Git 按 hunk 暂存 —— 纯解析/拼装层（2026-10-29）。
//
// ★ 为什么需要：工作区常被多个会话共用，一个文件里同时躺着两条线的改动。
//   现有的 api_git_add / api_git_commit 只有文件粒度（simple-git 的 add(files)），
//   要"只提交我这几段"就只能把别人的改动一起带走，或者让模型手拼 diff —— 后者
//   缩进/上下文错一个字就整块失败，等于没有这个能力。
//
// 这里只做**纯函数**：把 `git diff -- <file>` 的文本切成 hunk、按编号挑出来、
// 再拼回一个合法补丁。真正的 `git apply --cached` 在 GitService 里，落盘/命令
// 相关的失败面不混进来，单测能直接跑边界。

/** 一个 hunk 的可读摘要 + 解析后的元信息 */
export interface DiffHunk {
  /** 1-based，按 diff 中出现顺序编号 —— 模型用它来挑，不是 git 的 @@ 行号 */
  id: number;
  /** 原始 `@@ -a,b +c,d @@` 行 */
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** 正文行（含行首 ' '/'-'/'+'/'\\'） */
  lines: string[];
  added: number;
  removed: number;
  /** 给人看的摘要：取第一处新增行的内容（没有则取第一处删除行），截断到 80 字 */
  summary: string;
}

export interface ParsedDiff {
  /** 第一个 `@@` 之前的全部行（diff --git / index / --- / +++ / 二进制声明等） */
  header: string[];
  hunks: DiffHunk[];
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const SUMMARY_MAX = 80;

function summarize(lines: string[]): string {
  const pick = lines.find((l) => l.startsWith('+') && !l.startsWith('+++') && l.slice(1).trim())
    ?? lines.find((l) => l.startsWith('-') && !l.startsWith('---') && l.slice(1).trim());
  if (!pick) return '';
  const text = pick.slice(1).trim();
  return text.length > SUMMARY_MAX ? text.slice(0, SUMMARY_MAX - 1) + '…' : text;
}

function finalize(raw: Omit<DiffHunk, 'added' | 'removed' | 'summary'>): DiffHunk {
  let added = 0;
  let removed = 0;
  for (const line of raw.lines) {
    if (line.startsWith('+')) added += 1;
    else if (line.startsWith('-')) removed += 1;
  }
  return { ...raw, added, removed, summary: summarize(raw.lines) };
}

/**
 * 解析单个文件的 unified diff。
 *
 * ★ 只接受**一个文件**的 diff（服务层始终带 `-- <file>` 调用），因此不对
 *   第二个 `diff --git` 做分文件处理 —— 真出现了说明调用方漏了路径限定，
 *   按"第一个文件之外都算 hunk 正文"处理会静默产出错误补丁，宁可让它自然失败。
 */
export function parseUnifiedDiff(text: string): ParsedDiff {
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();

  const header: string[] = [];
  const hunks: DiffHunk[] = [];
  let current: Omit<DiffHunk, 'added' | 'removed' | 'summary'> | null = null;

  for (const line of lines) {
    const m = HUNK_HEADER_RE.exec(line);
    if (m) {
      if (current) hunks.push(finalize(current));
      current = {
        id: hunks.length + 1,
        header: line,
        oldStart: Number(m[1]),
        oldLines: m[2] === undefined ? 1 : Number(m[2]),
        newStart: Number(m[3]),
        newLines: m[4] === undefined ? 1 : Number(m[4]),
        lines: [],
      };
      continue;
    }
    if (current) current.lines.push(line);
    else header.push(line);
  }
  if (current) hunks.push(finalize(current));
  return { header, hunks };
}

/**
 * 按编号挑 hunk。编号必须全部落在已有范围内 —— 越界静默忽略会让"我以为暂存了
 * 第 7 段"变成只暂存了 1 段，提交信息与内容对不上，所以这里直接抛。
 */
export function selectHunks(parsed: ParsedDiff, ids: number[]): DiffHunk[] {
  if (!ids.length) throw new Error('未指定要暂存的 hunk 编号');
  const byId = new Map(parsed.hunks.map((h) => [h.id, h]));
  const picked: DiffHunk[] = [];
  for (const id of ids) {
    const h = byId.get(id);
    if (!h) throw new Error(`hunk 编号 ${id} 不存在（本文件共 ${parsed.hunks.length} 段）`);
    if (!picked.includes(h)) picked.push(h);
  }
  return picked;
}

/**
 * 把选中的 hunk 拼回补丁。
 *
 * ★ 行号保持原样即可：git apply 允许 hunk 定位有偏移，而我们用的是同一份 diff
 *   里原封不动的 header/context，不会错位。不要"重新编号"，那才是自找麻烦。
 */
export function buildPatch(parsed: ParsedDiff, picked: DiffHunk[]): string {
  const out = [...parsed.header];
  for (const h of picked) out.push(h.header, ...h.lines);
  return out.join('\n') + '\n';
}

/** 二进制/仅改权限这类 diff 没有 hunk，调用方需要据此给出可读的拒绝理由 */
export function describeNoHunks(parsed: ParsedDiff): string {
  const header = parsed.header.join('\n');
  if (/^Binary files .* differ$/m.test(header)) return '二进制文件不支持按 hunk 暂存，请用 api_git_add 整文件暂存';
  if (/^old mode |^new mode /m.test(header)) return '只有文件权限变化，没有可按 hunk 暂存的文本改动';
  return '该文件没有可拆分的改动';
}
