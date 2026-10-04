// hunk-apply.ts — hunk 级选择性接受的三方合并核心（P2-2，2026-10-03）
//
// 语义：快照记录了 before/after 两个全文；用户只接受**部分 hunk**时，
// 结果 = before 为基底 + 被选中的 hunk 段落套用（未选中的部分保持 before 原样）。
//
// ★ 前提约束（调用方负责校验，本模块只做纯计算）：
//   盘上当前内容必须等于 after —— 用户手改过就走整文件审查，不在这里猜。
//
// 算法：before/after 逐行 LCS 对齐 → 编辑脚本切 hunk（带上下文）→
//   选中的 hunk 取 after 行，未选中的保留 before 行；上下文行两侧同文，取 after 即可。
// 行数护栏：超限（默认 5000×5000）拒绝 —— 三方合并宁可拒绝也不卡死。

const MAX_LCS_LINES = 5000;

export interface HunkRange {
  /** hunk 在**新文件（after）**中的起始行（1-based，含上下文） */
  newStart: number;
  /** 新文件中的结束行（1-based，含上下文，闭区间） */
  newEnd: number;
  /** 供前端展示：老文件侧起始行 */
  oldStart: number;
  oldEnd: number;
  /** 该 hunk 的实际变更行数（不含上下文） */
  changes: number;
}

interface LineOp {
  type: 'eq' | 'del' | 'ins';
  /** before 行号（0-based，del/eq 有效） */
  oldIdx?: number;
  /** after 行号（0-based，ins/eq 有效） */
  newIdx?: number;
}

function splitLines(s: string): string[] {
  const lines = (s ?? '').replace(/\r\n/g, '\n').split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** LCS 编辑脚本（O(n×m)，护栏内） */
function lineOps(a: string[], b: string[]): LineOp[] {
  const n = a.length, m = b.length;
  const dp: Uint32Array[] = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: LineOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ type: 'eq', oldIdx: i, newIdx: j }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: 'del', oldIdx: i }); i++; }
    else { ops.push({ type: 'ins', newIdx: j }); j++; }
  }
  while (i < n) { ops.push({ type: 'del', oldIdx: i }); i++; }
  while (j < m) { ops.push({ type: 'ins', newIdx: j }); j++; }
  return ops;
}

/** 编辑脚本 → hunk（含上下文行；changes = 实际变更行数） */
export function computeHunks(before: string, after: string, context = 3): HunkRange[] {
  const a = splitLines(before);
  const b = splitLines(after);
  if (a.length > MAX_LCS_LINES || b.length > MAX_LCS_LINES) {
    throw new Error(`文件超过 ${MAX_LCS_LINES} 行，不支持 hunk 级操作（请整文件接受/回退）`);
  }
  const ops = lineOps(a, b);
  const changed = ops.map((o, k) => (o.type !== 'eq' ? k : -1)).filter((k) => k >= 0);
  if (changed.length === 0) return [];

  const hunks: HunkRange[] = [];
  let groupStart = Math.max(0, changed[0] - context);
  let prev = -1;
  const flush = (endOpIdx: number) => {
    const seg = ops.slice(groupStart, endOpIdx);
    const newIdxs = seg.filter((o) => o.newIdx !== undefined).map((o) => o.newIdx!);
    const oldIdxs = seg.filter((o) => o.oldIdx !== undefined).map((o) => o.oldIdx!);
    hunks.push({
      newStart: (newIdxs[0] ?? 0) + 1,
      newEnd: (newIdxs[newIdxs.length - 1] ?? -1) + 1,
      oldStart: (oldIdxs[0] ?? 0) + 1,
      oldEnd: (oldIdxs[oldIdxs.length - 1] ?? -1) + 1,
      /** 变更操作数（del+ins，对齐 git diffstat 的 +/- 合计口径） */
      changes: seg.filter((o) => o.type !== 'eq').length,
    });
  };
  for (const k of changed) {
    if (prev !== -1 && k - prev > context * 2) {
      flush(Math.min(ops.length, prev + context + 1));
      groupStart = Math.max(0, k - context);
    }
    prev = k;
  }
  flush(Math.min(ops.length, prev + context + 1));
  return hunks;
}

/**
 * 按选择合并：selected = 用户接受的 hunk 集合（**新文件行号区间**，与 computeHunks 输出同坐标）。
 * 未被任何选中 hunk 覆盖的变更回退为 before；上下文/等同行从 after 取（同文）。
 * 返回 null = 选择与实际 hunk 完全不匹配（调用方报错，防止静默无操作）。
 */
export function applyHunkSelection(before: string, after: string, selected: HunkRange[]): string | null {
  const a = splitLines(before);
  const b = splitLines(after);
  const all = computeHunks(before, after);
  if (all.length === 0) return null;
  // 请求区间与实际 hunk 的匹配：有交集即命中
  const hit = (h: HunkRange) => selected.some((s) => s.newStart <= h.newEnd && s.newEnd >= h.newStart);
  const selectedHunks = all.filter(hit);
  if (selectedHunks.length === 0) return null;

  const out: string[] = [];
  let ai = 0, bi = 0; // 0-based 游标
  const ops = lineOps(a, b);
  // 重算每个 op 是否落在选中的 hunk 内（用与 computeHunks 相同的分组逻辑判定）
  const inSelected = new Array(ops.length).fill(false);
  {
    const changed = ops.map((o, k) => (o.type !== 'eq' ? k : -1)).filter((k) => k >= 0);
    if (changed.length) {
      let groupStart = Math.max(0, changed[0] - 3);
      let prev = -1;
      const mark = (endOpIdx: number) => {
        const seg = ops.slice(groupStart, endOpIdx);
        const newIdxs = seg.filter((o) => o.newIdx !== undefined).map((o) => o.newIdx!);
        if (!newIdxs.length) return;
        const range = { newStart: newIdxs[0] + 1, newEnd: newIdxs[newIdxs.length - 1] + 1 };
        if (selectedHunks.some((h) => h.newStart === range.newStart && h.newEnd === range.newEnd)) {
          for (let k = groupStart; k < endOpIdx; k++) inSelected[k] = true;
        }
      };
      for (const k of changed) {
        if (prev !== -1 && k - prev > 6) { mark(Math.min(ops.length, prev + 4)); groupStart = Math.max(0, k - 3); }
        prev = k;
      }
      mark(Math.min(ops.length, prev + 4));
    }
  }

  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    if (op.type === 'eq') { out.push(b[bi++]); ai++; continue; }
    if (op.type === 'ins') {
      if (inSelected[k]) out.push(b[bi]);
      bi++;
      continue;
    }
    // del：未选中 → 保留 before 行；选中 → 丢弃
    if (!inSelected[k]) out.push(a[ai]);
    ai++;
  }
  return out.join('\n');
}
