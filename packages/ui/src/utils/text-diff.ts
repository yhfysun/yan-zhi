// text-diff.ts — 行级 unified diff 构建（LCS）
//
// ★ 为什么存在：DiffBody 吃的是 unified diff 文本，此前的供给方全是 git（git diff 输出）。
//   聊天流内嵌 diff 卡片（ChatFileChangeCard）手里的素材是 file_change 快照的
//   before/after 两个全文 —— 中间缺一个"全文对 → unified diff"的构建器，就是它。
//
// 复杂度护栏：LCS DP 是 O(n×m)，行数超限（默认 2000×2000）直接退化为"整文件替换"
//   的两 hunk 输出 —— 卡片场景宁可粗糙也不能卡死 UI。

/** 行数护栏：超过它不做 LCS，直接输出整文件替换的两段式 diff */
const MAX_LCS_LINES = 2000;

/** 按行切分：统一换行 + 去掉结尾换行产生的幽灵空行（空串 → 0 行，对齐 git 新文件惯例 -0,0） */
function splitLines(s: string): string[] {
  const lines = (s ?? '').replace(/\r\n/g, '\n').split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * 构建 unified diff 文本（不带 ---/+++ 头，只含 @@ hunk + 行内容，
 * 与 DiffBody 的解析约定一致：@@ 头开 hunk，' '/'-'/'+' 开行）。
 */
export function buildUnifiedDiff(before: string, after: string, context = 3): string {
  const a = splitLines(before);
  const b = splitLines(after);
  if (a.length > MAX_LCS_LINES || b.length > MAX_LCS_LINES) {
    return [
      `@@ -1,${a.length} +1,${b.length} @@`,
      ...a.map((l) => `-${l}`),
      ...b.map((l) => `+${l}`),
    ].join('\n');
  }

  // LCS DP
  const n = a.length, m = b.length;
  const dp: Uint32Array[] = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // 回溯出编辑脚本
  const ops: Array<{ t: ' ' | '-' | '+'; line: string; ai: number; bi: number }> = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ t: ' ', line: a[i], ai: i, bi: j }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: '-', line: a[i], ai: i, bi: j }); i++; }
    else { ops.push({ t: '+', line: b[j], ai: i, bi: j }); j++; }
  }
  while (i < n) { ops.push({ t: '-', line: a[i], ai: i, bi: m }); i++; }
  while (j < m) { ops.push({ t: '+', line: b[j], ai: n, bi: j }); j++; }

  if (!ops.some((o) => o.t !== ' ')) return ''; // 无差异

  // 切 hunk：以变更行为种子向两侧扩 context
  const changedIdx = ops.map((o, k) => (o.t !== ' ' ? k : -1)).filter((k) => k >= 0);
  const hunks: Array<[number, number]> = []; // [startOpIdx, endOpIdx)
  let start = Math.max(0, changedIdx[0] - context);
  let prev = -1;
  for (const k of changedIdx) {
    if (prev !== -1 && k - prev > context * 2) {
      hunks.push([start, Math.min(ops.length, prev + context + 1)]);
      start = Math.max(0, k - context);
    }
    prev = k;
  }
  hunks.push([start, Math.min(ops.length, prev + context + 1)]);

  const out: string[] = [];
  for (const [s, e] of hunks) {
    // hunk 头：老文件起始行/行数 与 新文件起始行/行数（1-based）
    let aCount = 0, bCount = 0, aStart = -1, bStart = -1;
    for (let k = s; k < e; k++) {
      const o = ops[k];
      if (o.t !== '+') { if (aStart < 0) aStart = o.ai + 1; aCount++; }
      if (o.t !== '-') { if (bStart < 0) bStart = o.bi + 1; bCount++; }
    }
    // git 惯例：纯新增 hunk 老侧 -0,0；纯删除 hunk 新侧 +0,0
    if (aCount === 0) aStart = 0;
    if (bCount === 0) bStart = 0;
    out.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`);
    for (let k = s; k < e; k++) out.push(ops[k].t + ops[k].line);
  }
  return out.join('\n');
}
