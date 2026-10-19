// Codex 式 apply_patch 协议 —— 纯解析/应用实现（无 IO，便于单测）。
//
// ★ 为什么需要（2026-10-19，对标 Codex 后引入）：
//   file_edit 的 old_string 语义要求模型**逐字复述**被替换的整段文本，且必须全文件唯一。
//   实测失败集中在这两处：
//     ① 复述时丢缩进/尾随空格/注释 → 未命中（虽有 rtrim 容忍，仍要整段复述）；
//     ② old_string 太短（`  }`、`return null;`）→ 命中多处 → 报"需扩大上下文"，
//        模型只能重来一次，一步白跑。
//   apply_patch 把"复述整段"降级成"几行上下文 + 增删行"，并且**先做语法校验**：
//   补丁结构不合法时在落盘前就给出精确到行号的错误，而不是执行到一半才发现对不上。
//
// ★ 支持的语法（Codex apply_patch 子集，逐条有测试）：
//   *** Begin Patch
//   *** Update File: <相对或绝对路径>
//   @@ 可选锚点说明（仅提示，不参与匹配）
//    上下文行（行首一个空格）
//   -删除行
//   +新增行
//   *** Add File: <路径>
//   +整行内容
//   *** Delete File: <路径>
//   *** End Patch
//
// ★ 与 Codex 的差异（有意为之）：
//   1) 不支持 `*** Move to:` —— 当前没有需求，加进来只会扩大解析面；
//   2) Add File 段允许裸空行（模型常吃掉行尾空白，丢个 "+" 不该让整块失败）；
//   3) 整个补丁**跨文件原子**：调用方先在内存里算完所有文件，任一失败则不写任何文件。
//      Codex 是逐文件落的 —— 半改状态在本项目是明确的负资产（回滚与 Diff 都难处理）。

export interface PatchLine {
  /** ' ' = 上下文；'-' = 删除；'+' = 新增 */
  op: ' ' | '-' | '+';
  text: string;
}

export interface PatchHunk {
  /** `@@` 后的说明文字（可为空）；仅用于报错定位，不参与匹配 */
  header?: string;
  lines: PatchLine[];
  /** 该 hunk 在补丁文本中的起始行号（1-based），仅用于报错 */
  startLine: number;
}

export interface PatchOp {
  kind: 'update' | 'add' | 'delete';
  path: string;
  hunks: PatchHunk[];
  addLines: string[];
  /** 段头在补丁文本中的行号（1-based），仅用于报错 */
  startLine: number;
}

export interface ParsePatchResult {
  ok: boolean;
  ops: PatchOp[];
  error?: string;
}

const BEGIN = '*** Begin Patch';
const END = '*** End Patch';
const HEADER_RE = /^\*\*\*\s*(Update File|Add File|Delete File):\s*(.+?)\s*$/;

function preview(s: string, n = 80): string {
  const t = s.length > n ? `${s.slice(0, n)}…` : s;
  return JSON.stringify(t);
}

function fail(line: number | null, msg: string): ParsePatchResult {
  return { ok: false, ops: [], error: line === null ? msg : `第 ${line} 行：${msg}` };
}

/**
 * 解析补丁文本。**不碰文件系统** —— 语法/结构问题在这里一次性暴露。
 * 路径重复、hunk 无上下文这类"应用时才致命"的问题也在此拦截。
 */
export function parseApplyPatch(text: string): ParsePatchResult {
  const src = String(text ?? '').replace(/\r\n/g, '\n');
  const lines = src.split('\n');

  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length) return fail(null, '补丁为空');
  if (lines[i].trim() !== BEGIN) {
    return fail(i + 1, `补丁必须以 "${BEGIN}" 开头（当前：${preview(lines[i])}）`);
  }
  i++;

  const ops: PatchOp[] = [];
  const seenPaths = new Map<string, number>();
  let closed = false;

  while (i < lines.length) {
    const raw = lines[i];
    if (raw.trim() === '') { i++; continue; }
    if (raw.trim() === END) { closed = true; i++; break; }

    const hdr = HEADER_RE.exec(raw.trim());
    if (!hdr) {
      return fail(i + 1, `无法识别（段头只允许 "*** Update File:" / "*** Add File:" / "*** Delete File:"）：${preview(raw)}`);
    }
    const kind: PatchOp['kind'] = hdr[1] === 'Update File' ? 'update' : hdr[1] === 'Add File' ? 'add' : 'delete';
    const rawPath = hdr[2].trim();
    if (!rawPath) return fail(i + 1, '段头缺少文件路径');
    // 归一化仅用于查重：同一文件出现两段时，原子/顺序语义都会变得难以推理
    const normPath = rawPath.replace(/\\/g, '/');
    const dup = seenPaths.get(normPath);
    if (dup !== undefined) {
      return fail(i + 1, `文件在补丁中出现多次（首次在第 ${dup} 行）：${rawPath}。请合并成一个段。`);
    }
    seenPaths.set(normPath, i + 1);
    const startLine = i + 1;
    i++;

    const op: PatchOp = { kind, path: rawPath, hunks: [], addLines: [], startLine };

    if (kind === 'update') {
      let cur: PatchHunk | null = null;
      while (i < lines.length) {
        const r = lines[i];
        const t = r.trim();
        if (t === END || HEADER_RE.test(t)) break;
        if (r.startsWith('@@')) {
          if (cur) op.hunks.push(cur);
          cur = { header: r.slice(2).trim() || undefined, lines: [], startLine: i + 1 };
          i++;
          continue;
        }
        if (!cur) cur = { lines: [], startLine: i + 1 };
        if (r === '') { cur.lines.push({ op: ' ', text: '' }); i++; continue; }
        const c = r[0];
        if (c !== ' ' && c !== '+' && c !== '-') {
          return fail(i + 1, `更新块内每行必须以空格（上下文）、"-"（删除）或 "+"（新增）开头：${preview(r)}`);
        }
        cur.lines.push({ op: c, text: r.slice(1) });
        i++;
      }
      if (cur) op.hunks.push(cur);
      if (op.hunks.length === 0) return fail(startLine, `Update File 段没有任何内容：${rawPath}`);
    } else if (kind === 'add') {
      while (i < lines.length) {
        const r = lines[i];
        const t = r.trim();
        if (t === END || HEADER_RE.test(t)) break;
        if (r === '') { op.addLines.push(''); i++; continue; }
        if (r[0] !== '+') {
          return fail(i + 1, `Add File 段内每行必须以 "+" 开头：${preview(r)}`);
        }
        op.addLines.push(r.slice(1));
        i++;
      }
    } else {
      // Delete File：段体必须为空
      while (i < lines.length) {
        const r = lines[i];
        const t = r.trim();
        if (t === END || HEADER_RE.test(t)) break;
        if (t !== '') return fail(i + 1, `Delete File 段内不能有内容：${preview(r)}`);
        i++;
      }
    }

    ops.push(op);
  }

  if (!closed) {
    return fail(null, `补丁缺少 "${END}"（输出被截断？）`);
  }
  if (ops.length === 0) return fail(null, '补丁里没有文件段');

  // hunk 必须有可定位的旧内容；纯新增块交给 Add File
  for (const op of ops) {
    if (op.kind !== 'update') continue;
    for (const h of op.hunks) {
      if (h.lines.filter((l) => l.op !== '+').length === 0) {
        return fail(h.startLine, `该块只有 "+" 新增行，没有上下文/删除行 → 无法定位。请至少带 2~3 行未修改的上下文（行首一个空格）；新建文件请用 *** Add File。`);
      }
    }
  }

  return { ok: true, ops };
}

export interface ApplyHunksResult {
  ok: boolean;
  content: string;
  error?: string;
  added: number;
  removed: number;
  /** 是否有 hunk 走了"行尾空白容忍"匹配（用于提示模型注意逐字性） */
  fuzzy: boolean;
}

function findAllMatches(hay: string[], needle: string[], fuzzy: boolean): number[] {
  const eq = fuzzy
    ? (a: string, b: string) => a.replace(/\s+$/, '') === b.replace(/\s+$/, '')
    : (a: string, b: string) => a === b;
  const last = hay.length - needle.length;
  const hits: number[] = [];
  for (let i = 0; i <= last; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (!eq(hay[i + j], needle[j])) { ok = false; break; }
    }
    if (ok) hits.push(i);
  }
  return hits;
}

/**
 * 把 hunks 套用到内容上（LF 规范空间）。任一 hunk 失败 → 返回 ok:false，内容原样返回。
 * 语义与 Codex 一致：按**行**匹配（不是子串），上下文行必须连续命中。
 */
export function applyHunksToContent(content: string, hunks: PatchHunk[], label = 'file'): ApplyHunksResult {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let added = 0;
  let removed = 0;
  let fuzzyAny = false;

  for (let hi = 0; hi < hunks.length; hi++) {
    const h = hunks[hi];
    const oldSeq = h.lines.filter((l) => l.op !== '+').map((l) => l.text);
    const newSeq = h.lines.filter((l) => l.op !== '-').map((l) => l.text);
    const where = `${label} 第 ${h.startLine} 行的 @@ 块${h.header ? `（${h.header}）` : ''}`;

    if (oldSeq.length === 0) {
      return { ok: false, content, added, removed, fuzzy: fuzzyAny, error: `${where} 只有新增行，无法定位` };
    }

    let hits = findAllMatches(lines, oldSeq, false);
    let fuzzy = false;
    if (hits.length === 0) {
      hits = findAllMatches(lines, oldSeq, true);
      fuzzy = hits.length > 0;
    }

    if (hits.length === 0) {
      const head = oldSeq.slice(0, 2).map((s) => `    ${s}`).join('\n');
      return {
        ok: false, content, added, removed, fuzzy: fuzzyAny,
        error: `${where} 未命中 —— 文件里找不到这组上下文行（允许行尾空白差异）。期望的上下文：\n${head}\n请用 file_read 重新读取该区域后重发补丁；上下文行必须与文件逐行一致（缩进、空行都算）。`,
      };
    }
    if (hits.length > 1) {
      const at = hits.slice(0, 5).map((n) => n + 1).join('、');
      return {
        ok: false, content, added, removed, fuzzy: fuzzyAny,
        error: `${where} 命中 ${hits.length} 处（文件第 ${at} 行）→ 无法确定改哪一处。请在 @@ 块里多带几行上下文（或带上函数签名行）使其唯一。`,
      };
    }

    if (fuzzy) fuzzyAny = true;
    lines.splice(hits[0], oldSeq.length, ...newSeq);
    added += h.lines.filter((l) => l.op === '+').length;
    removed += h.lines.filter((l) => l.op === '-').length;
  }

  return { ok: true, content: lines.join('\n'), added, removed, fuzzy: fuzzyAny };
}

/** 供结果文案/日志用：一行摘要（如 "M src/a.ts (+5/-3)"） */
export function summarizeOp(op: PatchOp, stats?: { added: number; removed: number }): string {
  const tag = op.kind === 'update' ? 'M' : op.kind === 'add' ? 'A' : 'D';
  if (stats) return `${tag} ${op.path} (+${stats.added}/-${stats.removed})`;
  if (op.kind === 'add') return `${tag} ${op.path} (${op.addLines.length} 行)`;
  return `${tag} ${op.path} (${op.hunks.length} 块)`;
}
