// 三向冲突对齐算法（GitConflictResolver.vue）—— 纯逻辑回归测试。
//
// 对齐 IntelliJ IDEA 的 Merge Revisions 语义：
//   左 = 我的版本(HEAD)、中 = 基线(BASE)、右 = 传入版本(MERGE_HEAD)
//   逐块取舍（◀ 左 / 双方 / 右 ▶）、「仅套用非冲突改动」、行级对齐（差异处补位空行）。
//
// 这里复刻组件内的 diffHunks / applySide / buildGroups / buildResult 四个纯函数，
// 使推断与渲染均可脱 DOM 验证（组件本体只做状态编排）。
//
// 关键回归点：
//   1) 仅一侧改动 → 判为「非冲突」，自动套用改动侧（不产生冲突标记）
//   2) 两侧改同一处且结果不同 → 判为「冲突」
//   3) 两侧改同一处且结果相同 → 非冲突（一致的改动直接采纳）
//   4) 相邻/重叠的改动块必须**并成一组**（否则会把一次编辑拆成多组，用户要选两次）
//   5) 未选择的冲突块保留 <<<<<<< 标记，不能静默丢改动

import { describe, it, expect } from 'vitest';

interface Hunk { aStart: number; aEnd: number; bStart: number; bEnd: number }
interface ChangeGroup {
  aStart: number; aEnd: number;
  base: string[]; ours: string[]; theirs: string[];
  conflict: boolean; desc: string;
}

/** base → other 的行级差异（与组件实现同一算法：剥公共前后缀 + LCS DP） */
function diffHunks(a: string[], b: string[]): Hunk[] {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }

  const core = a.slice(s, ea);
  const coreB = b.slice(s, eb);
  const hunks: Hunk[] = [];
  const flush = (as: number, ae: number, bs: number, be: number) => {
    if (ae > as || be > bs) hunks.push({ aStart: s + as, aEnd: s + ae, bStart: s + bs, bEnd: s + be });
  };
  if (!core.length || !coreB.length || core.length * coreB.length > 2_000_000) {
    flush(0, core.length, 0, coreB.length);
    return hunks;
  }
  const n = core.length, m = coreB.length, W = m + 1;
  const dp = new Uint32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * W + j] = core[i] === coreB[j]
        ? dp[(i + 1) * W + (j + 1)] + 1
        : Math.max(dp[(i + 1) * W + j], dp[i * W + (j + 1)]);
    }
  }
  let ai = 0, bi = 0, sa = 0, sb = 0;
  while (ai < n || bi < m) {
    if (ai < n && bi < m && core[ai] === coreB[bi]) {
      flush(sa, ai, sb, bi);
      ai++; bi++; sa = ai; sb = bi;
    } else if (bi >= m || (ai < n && dp[(ai + 1) * W + bi] >= dp[ai * W + (bi + 1)])) {
      ai++;
    } else {
      bi++;
    }
  }
  flush(sa, ai, sb, bi);
  return hunks;
}

function applySide(base: string[], hunks: Hunk[], other: string[], aStart: number, aEnd: number): string[] {
  const own = hunks.filter((h) => h.aStart >= aStart && h.aEnd <= aEnd).sort((x, y) => x.aStart - y.aStart);
  const out: string[] = [];
  let p = aStart;
  for (const h of own) {
    for (let i = p; i < h.aStart; i++) out.push(base[i]);
    for (let i = h.bStart; i < h.bEnd; i++) out.push(other[i]);
    p = h.aEnd;
  }
  for (let i = p; i < aEnd; i++) out.push(base[i]);
  return out;
}

function buildGroups(base: string[], ours: string[], theirs: string[]): ChangeGroup[] {
  const hOurs = diffHunks(base, ours);
  const hTheirs = diffHunks(base, theirs);
  type Ev = { aStart: number; aEnd: number };
  const evs: Ev[] = [
    ...hOurs.map((h) => ({ aStart: h.aStart, aEnd: h.aEnd })),
    ...hTheirs.map((h) => ({ aStart: h.aStart, aEnd: h.aEnd })),
  ].sort((x, y) => (x.aStart - y.aStart) || (x.aEnd - y.aEnd));

  const groups: ChangeGroup[] = [];
  let i = 0;
  while (i < evs.length) {
    let aStart = evs[i].aStart;
    let aEnd = evs[i].aEnd;
    let j = i + 1;
    while (j < evs.length && evs[j].aStart <= aEnd) { aEnd = Math.max(aEnd, evs[j].aEnd); j++; }
    const baseSlice = base.slice(aStart, aEnd);
    const oursSlice = applySide(base, hOurs, ours, aStart, aEnd);
    const theirsSlice = applySide(base, hTheirs, theirs, aStart, aEnd);
    const baseTxt = baseSlice.join('\n');
    const oursTxt = oursSlice.join('\n');
    const theirsTxt = theirsSlice.join('\n');
    const oursChanged = oursTxt !== baseTxt;
    const theirsChanged = theirsTxt !== baseTxt;
    const conflict = oursChanged && theirsChanged && oursTxt !== theirsTxt;
    groups.push({ aStart, aEnd, base: baseSlice, ours: oursSlice, theirs: theirsSlice, conflict, desc: '' });
    i = j;
  }
  return groups;
}

/** 非冲突块「自动套用」该取哪一侧：只按真正改动的那侧取 */
function autoSide(g: ChangeGroup): 'left' | 'right' {
  const baseTxt = g.base.join('\n');
  const oursChanged = g.ours.join('\n') !== baseTxt;
  const theirsChanged = g.theirs.join('\n') !== baseTxt;
  if (oursChanged && !theirsChanged) return 'left';
  if (theirsChanged && !oursChanged) return 'right';
  return 'left';
}

/** 按选择重建结果（未选的冲突块保留标记） */
function buildResult(
  base: string[], groups: ChangeGroup[],
  choices: Record<number, 'left' | 'right' | 'both'>,
): string {
  const parts: string[] = [];
  let p = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    for (let i = p; i < g.aStart; i++) parts.push(base[i]);
    p = g.aEnd;
    const chosen = choices[gi];
    if (chosen === 'left') parts.push(...g.ours);
    else if (chosen === 'right') parts.push(...g.theirs);
    else if (chosen === 'both') {
      for (const sl of [g.ours, g.theirs].filter((x) => x.length > 0 && x.join('') !== '')) parts.push(...sl);
    } else if (g.conflict) {
      parts.push('<<<<<<< HEAD', ...g.ours, '=======', ...g.theirs, '>>>>>>> MERGE_HEAD');
    } else {
      // ★ 必须按真正改动的那一侧取（曾固定取 ours → 右侧改动静默丢失）
      parts.push(...(autoSide(g) === 'right' ? g.theirs : g.ours));
    }
  }
  for (let i = p; i < base.length; i++) parts.push(base[i]);
  return parts.join('\n');
}

const L = (s: string) => s.split('\n');

describe('diffHunks：行级差异定位', () => {
  it('完全相同时无差异块', () => {
    expect(diffHunks(L('a\nb\nc'), L('a\nb\nc'))).toEqual([]);
  });

  it('中间一行被替换 → 一个替换块', () => {
    const h = diffHunks(L('a\nb\nc'), L('a\nX\nc'));
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ aStart: 1, aEnd: 2, bStart: 1, bEnd: 2 });
  });

  it('整行插入 → aStart === aEnd（纯插入）', () => {
    const h = diffHunks(L('a\nb'), L('a\nN\nb'));
    expect(h).toHaveLength(1);
    expect(h[0].aStart).toBe(h[0].aEnd);
  });

  it('整行删除 → bStart === bEnd（纯删除）', () => {
    const h = diffHunks(L('a\nb\nc'), L('a\nc'));
    expect(h).toHaveLength(1);
    expect(h[0].bStart).toBe(h[0].bEnd);
  });

  it('头部与尾部改动都被识别（公共前后缀剥离不吞改动）', () => {
    const h = diffHunks(L('a\nb\nc\nd'), L('A\nb\nc\nD'));
    expect(h).toHaveLength(2);
  });
});

describe('buildGroups：冲突 / 非冲突判定', () => {
  it('仅左侧改动 → 非冲突', () => {
    const g = buildGroups(L('a\nb\nc'), L('a\nX\nc'), L('a\nb\nc'));
    expect(g).toHaveLength(1);
    expect(g[0].conflict).toBe(false);
    expect(g[0].ours).toEqual(['X']);
    expect(g[0].theirs).toEqual(['b']);
  });

  it('仅右侧改动 → 非冲突', () => {
    const g = buildGroups(L('a\nb\nc'), L('a\nb\nc'), L('a\nY\nc'));
    expect(g[0].conflict).toBe(false);
    expect(g[0].theirs).toEqual(['Y']);
  });

  it('两侧改同一处且结果不同 → 冲突', () => {
    const g = buildGroups(L('a\nb\nc'), L('a\nX\nc'), L('a\nY\nc'));
    expect(g).toHaveLength(1);
    expect(g[0].conflict).toBe(true);
  });

  it('两侧改同一处但结果相同 → 非冲突（一致的改动直接采纳）', () => {
    const g = buildGroups(L('a\nb\nc'), L('a\nZ\nc'), L('a\nZ\nc'));
    expect(g).toHaveLength(1);
    expect(g[0].conflict).toBe(false);
  });

  it('两侧改不同位置 → 两个独立非冲突块', () => {
    const g = buildGroups(L('a\nb\nc\nd\ne'), L('A\nb\nc\nd\ne'), L('a\nb\nc\nd\nE'));
    expect(g).toHaveLength(2);
    expect(g.every((x) => !x.conflict)).toBe(true);
  });

  it('★ 相邻改动块必须并成一组（否则用户要为一次编辑点两次）', () => {
    // 左侧改第 2 行、右侧改第 3 行 → base 区间相邻 → 同一组
    const g = buildGroups(L('a\nb\nc\nd'), L('a\nB\nc\nd'), L('a\nb\nC\nd'));
    expect(g).toHaveLength(1);
    expect(g[0].conflict).toBe(true); // 两组改动落在同一区间 → 按冲突处理更安全
  });

  it('两侧同时在同一位置插入 → 并组且判为冲突', () => {
    const g = buildGroups(L('a\nz'), L('a\nX\nz'), L('a\nY\nz'));
    expect(g).toHaveLength(1);
    expect(g[0].conflict).toBe(true);
  });
});

describe('buildResult：按选择重建内容', () => {
  const base = L('a\nb\nc');
  const groups = buildGroups(base, L('a\nX\nc'), L('a\nY\nc')); // 一处冲突

  it('未选择 → 保留冲突标记（不静默丢改动）', () => {
    const out = buildResult(base, groups, {});
    expect(out).toContain('<<<<<<< HEAD');
    expect(out).toContain('=======');
    expect(out).toContain('>>>>>>> MERGE_HEAD');
    expect(out).toContain('X');
    expect(out).toContain('Y');
  });

  it('选左侧 → 无标记，采用左侧内容', () => {
    const out = buildResult(base, groups, { 0: 'left' });
    expect(out).not.toContain('<<<<<<<');
    expect(out).toBe('a\nX\nc');
  });

  it('选右侧 → 采用右侧内容', () => {
    expect(buildResult(base, groups, { 0: 'right' })).toBe('a\nY\nc');
  });

  it('选双方 → 两侧内容都在且无标记', () => {
    const out = buildResult(base, groups, { 0: 'both' });
    expect(out).not.toContain('<<<<<<<');
    expect(out).toContain('X');
    expect(out).toContain('Y');
    expect(out).toBe('a\nX\nY\nc');
  });

  it('非冲突块即使未做选择也会自动套用（不会留下标记）', () => {
    const g2 = buildGroups(base, L('a\nX\nc'), base); // 仅左侧
    const out = buildResult(base, g2, {});
    expect(out).not.toContain('<<<<<<<');
    expect(out).toBe('a\nX\nc');
  });

  it('多块混合：选了一块、另一块留空 → 只有留空的保留标记', () => {
    const b = L('a\nb\nc\nd\ne\nf');
    const ours = L('a\nX\nc\nd\ne\nf');       // 第 2 行
    const theirs = L('a\nY\nc\nd\ne\nZ');     // 第 2 行 + 末行 → 第 2 行冲突、末行仅右侧
    const gs = buildGroups(b, ours, theirs);
    const conflictIdx = gs.findIndex((g) => g.conflict);
    expect(conflictIdx).toBeGreaterThanOrEqual(0);
    const out = buildResult(b, gs, {});        // 都不选
    // 冲突块留标记；非冲突块（末行）自动套用 → 出现 Z 且只有一处标记
    expect(out).toContain('<<<<<<< HEAD');
    expect(out).toContain('Z');
    expect(out.split('<<<<<<< HEAD').length - 1).toBe(1);
  });
});

describe('acceptAll：批量套用非冲突改动', () => {
  /** 复刻组件的 acceptAll 选择逻辑 */
  function acceptAllChoices(
    groups: ChangeGroup[], side: 'left' | 'right',
  ): Record<number, 'left' | 'right'> {
    const next: Record<number, 'left' | 'right'> = {};
    groups.forEach((g, i) => {
      if (g.conflict) return;
      const baseTxt = g.base.join('\n');
      const oursChanged = g.ours.join('\n') !== baseTxt;
      const theirsChanged = g.theirs.join('\n') !== baseTxt;
      next[i] = oursChanged && theirsChanged ? side : autoSide(g);
    });
    return next;
  }

  it('★「全部接受左侧」不得丢弃仅右侧改动的块', () => {
    // 第 1 行左侧改动、第 4 行右侧改动
    const base = L('a\nb\nc\nd');
    const ours = L('A\nb\nc\nd');
    const theirs = L('a\nb\nc\nD');
    const gs = buildGroups(base, ours, theirs);
    expect(gs).toHaveLength(2);
    const choices = acceptAllChoices(gs, 'left');
    const out = buildResult(base, gs, choices as Record<number, 'left' | 'right' | 'both'>);
    expect(out).toBe('A\nb\nc\nD');   // 两侧改动都保住了
  });

  it('「全部接受右侧」不得丢弃仅左侧改动的块', () => {
    const base = L('a\nb\nc\nd');
    const ours = L('A\nb\nc\nd');
    const theirs = L('a\nb\nc\nD');
    const gs = buildGroups(base, ours, theirs);
    const out = buildResult(base, gs, acceptAllChoices(gs, 'right') as Record<number, 'left' | 'right' | 'both'>);
    expect(out).toBe('A\nb\nc\nD');
  });

  it('冲突块不被批量套用影响（保留标记待人工选择）', () => {
    const base = L('a\nb\nc');
    const ours = L('a\nX\nc');
    const theirs = L('a\nY\nc');
    const gs = buildGroups(base, ours, theirs);
    const out = buildResult(base, gs, acceptAllChoices(gs, 'left') as Record<number, 'left' | 'right' | 'both'>);
    expect(out).toContain('<<<<<<< HEAD');
  });
});

describe('applySide：区间内套用单侧改动', () => {
  it('组内无该侧改动时原样返回 base 切片', () => {
    const base = L('a\nb\nc');
    const hunks = diffHunks(base, L('a\nX\nc'));
    expect(applySide(base, hunks, L('a\nX\nc'), 0, 1)).toEqual(['a']); // 区间不含改动
  });

  it('组内含该侧改动时替换为 other 内容', () => {
    const base = L('a\nb\nc');
    const hunks = diffHunks(base, L('a\nX\nc'));
    expect(applySide(base, hunks, L('a\nX\nc'), 1, 2)).toEqual(['X']);
  });
});

describe('规模保护：超大 core 退化为整段替换（不卡死）', () => {
  it('超大改动区仍返回结果（不抛异常、不无限循环）', () => {
    const big = Array.from({ length: 1600 }, (_, i) => `line-${i}`);
    const big2 = Array.from({ length: 1600 }, (_, i) => `LINE-${i}`);
    const h = diffHunks(big, big2);
    expect(h.length).toBeGreaterThan(0);
    expect(h[0]).toMatchObject({ aStart: 0, aEnd: 1600 });
  });
});