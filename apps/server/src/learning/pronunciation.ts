// 学习模式 · 发音打分（P2）纯函数（不 import db，可直接单测）。
//
// 方案 §2.4 提的「音素对齐」需要 wav2vec2/gentle 这类重型对齐器，本机跑不动也不引新栈；
// 本实现是工程折中：whisper(en) 转写词序错乱率低，对「转写文本 vs 目标句」做**词级对齐**
// （Levenshtein DP，替换代价 = 1 − 字符相似度）→ 逐词 ok/wrong/missing + 多说词清单。
// 打分口径（钉死，别随意调）：
//   - 每个目标词的得分 = 1（读对）/ 字符相似度（读错，部分分）/ 0（漏读）；
//   - 总分 = 目标词得分均值 × 100，再按多说词扣分（每个 4 分，封顶扣 20）；
//   - 归一化：小写、去标点（保留字母/数字/撇号/连字符）、压缩空白。
export interface PronWordMatch {
  expected: string;
  spoken: string | null;
  status: 'ok' | 'wrong' | 'missing';
  /** 字符相似度 0~1（ok 恒 1；wrong = 1 − 编辑距离/较长词长度；missing = 0） */
  sim: number;
}

export interface PronunciationScore {
  /** 0~100 整数 */
  score: number;
  words: PronWordMatch[];
  /** 目标句里没有、但说了的词（提醒不是说这个） */
  extraWords: string[];
}

/** 归一化：小写、去标点（保留字母/数字/撇号/连字符/空格）、压缩空白 */
export function normalizeForScore(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9'’\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(s: string): string[] {
  const t = normalizeForScore(s);
  return t ? t.split(' ').filter(Boolean) : [];
}

/** 字符相似度：1 − levenshtein(a,b)/max(len)，两空串视为 1 */
export function charSimilarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;
  // 两行滚动 DP（词长都很短，不 cache 优化）
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1, // 删
        cur[j - 1] + 1, // 插
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), // 替
      );
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

/**
 * 词级对齐打分。
 * 第一步：相同词按多重集直接配对（发音打分不关心词序，语序颠倒不该全灭）；
 * 第二步：剩余词做 DP 编辑距离对齐（替换代价 = 1 − 字符相似度），回溯产出逐词比对。
 */
export function scorePronunciation(expected: string, spoken: string): PronunciationScore {
  const E = tokenize(expected);
  const S0 = tokenize(spoken);
  // 第一步：多重集配对相同词（语序无关）
  const sPool = [...S0];
  const preMatched = new Map<number, string>(); // E 下标 → 配对词
  const used = new Set<number>();
  for (let i = 0; i < E.length; i++) {
    const k = sPool.findIndex((s, idx) => s === E[i] && !used.has(idx));
    if (k >= 0) { preMatched.set(i, sPool[k]); used.add(k); }
  }
  const ERest: string[] = [];
  const eRestIndexOf = new Map<number, number>(); // E 下标 → 剩余词数组下标
  for (let i = 0; i < E.length; i++) {
    if (!preMatched.has(i)) { eRestIndexOf.set(i, ERest.length); ERest.push(E[i]); }
  }
  const SRest = sPool.filter((_, idx) => !used.has(idx));
  // 第二步：剩余词 DP 对齐（0=斜(匹配/替换) 1=上(E 漏读) 2=左(S 多说)）
  const dp: number[][] = Array.from({ length: ERest.length + 1 }, () => new Array(SRest.length + 1).fill(0));
  const bt: number[][] = Array.from({ length: ERest.length + 1 }, () => new Array(SRest.length + 1).fill(0));
  for (let i = 1; i <= ERest.length; i++) { dp[i][0] = i; bt[i][0] = 1; }
  for (let j = 1; j <= SRest.length; j++) { dp[0][j] = j; bt[0][j] = 2; }
  for (let i = 1; i <= ERest.length; i++) {
    for (let j = 1; j <= SRest.length; j++) {
      const e = ERest[i - 1];
      const s = SRest[j - 1];
      const sub = dp[i - 1][j - 1] + (e === s ? 0 : 1 - charSimilarity(e, s));
      const del = dp[i - 1][j] + 1;
      const ins = dp[i][j - 1] + 1;
      if (sub <= del && sub <= ins) { dp[i][j] = sub; bt[i][j] = 0; }
      else if (del <= ins) { dp[i][j] = del; bt[i][j] = 1; }
      else { dp[i][j] = ins; bt[i][j] = 2; }
    }
  }
  // 回溯：先收齐逐词比对与多余词，再正序输出
  const restMatches = new Map<number, { expected: string; spoken: string | null; status: 'ok' | 'wrong' | 'missing'; sim: number }>();
  const extrasRev: string[] = [];
  let i = ERest.length;
  let j = SRest.length;
  while (i > 0 || j > 0) {
    const dir = bt[i][j];
    if (dir === 0) {
      const e = ERest[i - 1];
      const s = SRest[j - 1];
      restMatches.set(i - 1, e === s
        ? { expected: e, spoken: s, status: 'ok', sim: 1 }
        : { expected: e, spoken: s, status: 'wrong', sim: charSimilarity(e, s) });
      i--; j--;
    } else if (dir === 1) {
      restMatches.set(i - 1, { expected: ERest[i - 1], spoken: null, status: 'missing', sim: 0 });
      i--;
    } else {
      extrasRev.push(SRest[j - 1]);
      j--;
    }
  }
  const words: PronWordMatch[] = E.map((w, k) => {
    if (preMatched.has(k)) return { expected: w, spoken: preMatched.get(k)!, status: 'ok' as const, sim: 1 };
    return restMatches.get(eRestIndexOf.get(k)!) ?? { expected: w, spoken: null, status: 'missing' as const, sim: 0 };
  });
  const extraWords = extrasRev.reverse();
  if (!E.length) return { score: 0, words, extraWords };
  const credit = words.reduce((acc, w) => acc + (w.status === 'ok' ? 1 : w.sim), 0);
  const penalty = Math.min(20, extraWords.length * 4);
  const score = Math.max(0, Math.round((credit / E.length) * 100) - penalty);
  return { score, words, extraWords };
}
