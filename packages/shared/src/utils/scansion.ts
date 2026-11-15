// 格律评分 —— 自拟对句 / 写诗（绝句）的判分唯一实现，server 与 ui 共用。
// ★ 口径（教学近似，非学术考据）：
//   平仄以普通话近似（1/2 声=平，3/4 声=仄），pinyin-pro 取声调；
//   古入声字按普通话归调，不单独修正——评分结果一律标注「按普通话近似口径」，
//   提示层面使用，不做学术裁定。
//   押韵取韵母主元音近似（final 去介音后同韵即算押韵），零基础教学够用。
import { pinyin } from 'pinyin-pro';

export type ToneClass = '平' | '仄' | '轻' | '未知';

export type PingzeChar = {
  ch: string;
  tone: ToneClass;
  /** 声调数字（1~4，轻声 0）；未知为 null */
  toneNum: number | null;
};

export type PingzeLine = {
  text: string;
  /** 逐字平仄（仅汉字，标点已剔除） */
  chars: PingzeChar[];
};

const HAN_RE = /[\u4e00-\u9fff]/;

/** 逐字取声调并归类平仄；多音字取首个读音，轻声归「轻」不计入扣分 */
export function pingzeLine(text: string): PingzeLine {
  const chars: PingzeChar[] = [];
  for (const ch of text) {
    if (!HAN_RE.test(ch)) continue;
    let toneNum: number | null = null;
    let tone: ToneClass = '未知';
    try {
      const nums = pinyin(ch, { pattern: 'num', toneType: 'num' }).trim();
      const n = parseInt(nums, 10);
      if (Number.isFinite(n)) {
        toneNum = n;
        tone = n === 0 ? '轻' : n <= 2 ? '平' : '仄';
      }
    } catch { /* 个别字符查不到则标未知，不扣分只提示 */ }
    chars.push({ ch, tone, toneNum });
  }
  return { text, chars };
}

/** 韵脚（末字韵母主元音近似）：iu=iou、ui=uei 省写先还原，再去介音取主元音做同韵比较 */
function rhymeKey(ch: string): string | null {
  try {
    let finals = pinyin(ch, { pattern: 'final', toneType: 'none' }).trim();
    if (!finals) return null;
    if (finals === 'iu') finals = 'iou';
    if (finals === 'ui') finals = 'uei';
    const stripped = finals.replace(/^[iuvü]+/, '');
    return stripped || finals;
  } catch { return null; }
}

export type ScanIssue = {
  index: number;        // 句索引（0 起）
  detail: string;       // 具体问题，如「第 3 句「愁」出韵（韵脚应为 an）」
};

export type PoemScanResult = {
  formOk: boolean;          // 句数与每句字数合格
  lineCount: number;
  requiredLines: number;
  charsPerLineOk: boolean;
  rhymeOk: boolean;         // 双数句押韵且不换韵（首句不计）
  rhymeKey: string | null;  // 判定的韵部（首句或第二句末字）
  pingzeWarn: number;       // 2/4/6 位失替的提示数（近似口径，只提示不判死）
  issues: ScanIssue[];
  /** 逐句逐字平仄（供 UI 标注） */
  lines: PingzeLine[];
  /** 三项总分（0~100）：格律形式 40 / 押韵 30 / 无重字等 30 的简化权重 */
  score: number;
  /** 一句话总评（零基础口径，只鼓励 + 指出最该改的一处） */
  summary: string;
};

export type PoemForm = '五言绝句' | '七言绝句';

const FORM_SPEC: Record<PoemForm, { lines: number; chars: number }> = {
  '五言绝句': { lines: 4, chars: 5 },
  '七言绝句': { lines: 4, chars: 7 },
};

/** 绝句格律评分（纯函数，可直接单测）。按普通话近似口径，评分从宽、提示从严。 */
export function scanPoem(input: string[], form: PoemForm): PoemScanResult {
  const spec = FORM_SPEC[form];
  const texts = input.map((s) => s.trim()).filter((s) => s.length > 0);
  const lines = texts.map((t) => pingzeLine(t));
  const issues: ScanIssue[] = [];

  const lineCount = texts.length;
  const formOk = lineCount === spec.lines;
  if (lineCount !== spec.lines) {
    issues.push({ index: -1, detail: `${form}应为 ${spec.lines} 句，现写 ${lineCount} 句` });
  }

  let charsPerLineOk = true;
  texts.forEach((t, i) => {
    const n = pingzeLine(t).chars.length;
    if (n !== spec.chars) {
      charsPerLineOk = false;
      issues.push({ index: i, detail: `第 ${i + 1} 句 ${n} 字，应为 ${spec.chars} 字` });
    }
  });

  // 押韵：取第二句末字定韵部，双数句须同韵；首句可押可不押（出韵仅提示）
  const rhymeOf = (i: number) => {
    const cs = lines[i]?.chars ?? [];
    const last = cs[cs.length - 1];
    return last ? rhymeKey(last.ch) : null;
  };
  const baseRhyme = lineCount >= 2 ? rhymeOf(1) : null;
  let rhymeOk = lineCount >= 2;
  if (lineCount >= 2 && baseRhyme) {
    for (let i = 3; i < lineCount; i += 2) {
      const r = rhymeOf(i);
      if (r && r !== baseRhyme) {
        rhymeOk = false;
        const ch = lines[i].chars[lines[i].chars.length - 1]?.ch ?? '';
        issues.push({ index: i, detail: `第 ${i + 1} 句韵脚「${ch}」出韵（应与第 2 句同韵：${baseRhyme}）` });
      }
    }
    const first = rhymeOf(0);
    if (first && first !== baseRhyme) {
      const ch = lines[0].chars[lines[0].chars.length - 1]?.ch ?? '';
      issues.push({ index: 0, detail: `首句韵脚「${ch}」与第 2 句不同韵——首句可不押，仅提示` });
    }
  }

  // 平仄提示：只看每句 2/4/6 位（一三五不论），相邻节奏点应交替；失替只提示不扣死
  let pingzeWarn = 0;
  lines.forEach((line, i) => {
    const nodes = line.chars.filter((c) => c.tone === '平' || c.tone === '仄');
    const evenPos = nodes.filter((_, k) => (k + 1) % 2 === 0 && (k + 1) <= spec.chars - 1);
    for (let k = 1; k < evenPos.length; k++) {
      if (evenPos[k].tone === evenPos[k - 1].tone) {
        pingzeWarn++;
        issues.push({ index: i, detail: `第 ${i + 1} 句节奏点平仄未交替（${evenPos[k - 1].ch}→${evenPos[k].ch}）——按普通话近似，仅提示` });
        break;
      }
    }
  });

  // 重字（绝句忌无谓重字，修辞性重复除外——只提示）
  const all = texts.join('');
  const seen = new Map<string, number>();
  for (const ch of all) if (HAN_RE.test(ch)) seen.set(ch, (seen.get(ch) ?? 0) + 1);
  let dupCount = 0;
  for (const [ch, n] of seen) {
    if (n > 1) { dupCount++; issues.push({ index: -1, detail: `「${ch}」重复 ${n} 次——除非是有意的修辞（如叠字），建议避免` }); }
  }

  let score = 100;
  if (!formOk) score -= 30;
  if (!charsPerLineOk) score -= 15;
  if (!rhymeOk) score -= 20;
  score -= Math.min(15, pingzeWarn * 5);
  score -= Math.min(10, dupCount * 5);
  score = Math.max(30, Math.min(100, score));

  const firstFix = issues.find((x) => x.index >= 0) ?? issues[0];
  const summary = score >= 90
    ? '格律形式过关！再打磨意象，就是一首像样的绝句了。'
    : firstFix
      ? `有 ${issues.length} 处可改进，先改最要紧的一处：${firstFix.detail}。`
      : '形式合格，继续读几首名作找找语感。';

  return {
    formOk, lineCount, requiredLines: spec.lines, charsPerLineOk,
    rhymeOk, rhymeKey: baseRhyme, pingzeWarn, issues, lines, score, summary,
  };
}

export type CoupletFreeResult = {
  lengthOk: boolean;
  lenA: number;
  lenB: number;
  tonePairOk: boolean;       // 逐字平仄相对
  firstMismatch: string | null;   // 如「第 3 字「春」（平）与「雨」（仄）同声」
  endOk: boolean;            // 上联仄收、下联平收
  dupOk: boolean;            // 同位不重字
  score: number;
  summary: string;
};

/** 自拟对句评分：上联（出句）+ 下联（对句），纯函数。 */
export function scanCoupletFree(a: string, b: string): CoupletFreeResult {
  const la = pingzeLine(a);
  const lb = pingzeLine(b);
  const lenA = la.chars.length;
  const lenB = lb.chars.length;
  const lengthOk = lenA === lenB;

  let tonePairOk = lengthOk;
  let firstMismatch: string | null = null;
  if (lengthOk) {
    for (let i = 0; i < lenA; i++) {
      const ta = la.chars[i].tone;
      const tb = lb.chars[i].tone;
      if (ta === '未知' || tb === '未知' || ta === '轻' || tb === '轻') continue;
      if (ta === tb) {
        firstMismatch = `第 ${i + 1} 字「${lb.chars[i].ch}」（${tb}）与上联「${la.chars[i].ch}」（${ta}）同声，宜相对`;
        tonePairOk = false;
        break;
      }
    }
  } else {
    tonePairOk = false;
  }

  const endA = la.chars[lenA - 1]?.tone ?? '未知';
  const endB = lb.chars[lenB - 1]?.tone ?? '未知';
  const endOk = (endA === '仄' || endA === '未知') && endB === '平';

  let dupOk = true;
  for (let i = 0; i < Math.min(lenA, lenB); i++) {
    if (la.chars[i].ch === lb.chars[i].ch) { dupOk = false; break; }
  }

  let score = 100;
  if (!lengthOk) score -= 40;
  if (!tonePairOk) score -= 20;
  if (!endOk) score -= 20;
  if (!dupOk) score -= 10;
  score = Math.max(30, Math.min(100, score));

  const summary = score === 100
    ? '字数、平仄、收尾全部合格——好对子！'
    : firstMismatch
      ? `先改一处：${firstMismatch}`
      : !lengthOk
        ? `上下联字数要相等：上联 ${lenA} 字、下联 ${lenB} 字。`
        : !endOk
          ? '上联末字用仄声、下联末字用平声（仄起平收）。'
          : '有重复字，换一个字试试。';

  return { lengthOk, lenA, lenB, tonePairOk, firstMismatch, endOk, dupOk, score, summary };
}
