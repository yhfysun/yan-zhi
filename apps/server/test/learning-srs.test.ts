// SRS / 关卡 / 出题纯函数回归（learning/srs.ts）。
// 为什么值得测：这是词书关卡业务规则的唯一实现，路由层只准调它不复算——
// 规则被改坏（比如切关偏移一格、星级判定倒挂）会让闯关体验静默变错且不报错。
import { describe, it, expect } from 'vitest';
import {
  srsAdvance, srsDemote, isDue, levelCountFor, levelSlice, starsFor,
  genDrillQuestions, judgeAnswer, WORDS_PER_LEVEL, DRILL_QUESTIONS_PER_LEVEL,
  SRS_BOX_COUNT, SRS_INTERVAL_DAYS, type SrsWordRow, type DrillQuestion,
} from '../src/learning/srs';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

function w(i: number, over: Partial<SrsWordRow> = {}): SrsWordRow {
  return {
    id: `w${i}`, word: `word${i}`, phonetic: null,
    gloss: `释义${i}`, example: null, box: 1, due_at: null, ...over,
  };
}

/** 固定 rng：伪随机但确定（xorshift-ish），保证出题断言稳定 */
function seededRng(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('SRS 盒调度', () => {
  it('答对升盒，due 按盒间隔推算', () => {
    const { box, dueAt } = srsAdvance(1, NOW);
    expect(box).toBe(2);
    expect(dueAt).toBe(NOW + SRS_INTERVAL_DAYS[1] * DAY);
    const top = srsAdvance(SRS_BOX_COUNT, NOW);
    expect(top.box).toBe(SRS_BOX_COUNT); // 封顶不越界
  });

  it('答错回盒 1', () => {
    const { box, dueAt } = srsDemote(NOW);
    expect(box).toBe(1);
    expect(dueAt).toBe(NOW + SRS_INTERVAL_DAYS[0] * DAY);
  });

  it('isDue：null 视为到期（新词未排程就该练）', () => {
    expect(isDue({ box: 1, due_at: null }, NOW)).toBe(true);
    expect(isDue({ box: 1, due_at: NOW + 1000 }, NOW)).toBe(false);
    expect(isDue({ box: 1, due_at: NOW - 1000 }, NOW)).toBe(true);
  });
});

describe('关卡切分', () => {
  it('词数 → 关数向上取整', () => {
    expect(levelCountFor(1)).toBe(1);
    expect(levelCountFor(WORDS_PER_LEVEL)).toBe(1);
    expect(levelCountFor(WORDS_PER_LEVEL + 1)).toBe(2);
    expect(levelCountFor(0)).toBe(1); // 空书兜底至少 1 关
  });

  it('第 n 关切片不越界、相邻衔接', () => {
    const total = 45;
    const l1 = levelSlice(1, total);
    const l2 = levelSlice(2, total);
    const l3 = levelSlice(3, total);
    expect([l1.start, l1.end]).toEqual([0, WORDS_PER_LEVEL]);
    expect([l2.start, l2.end]).toEqual([WORDS_PER_LEVEL, 2 * WORDS_PER_LEVEL]);
    expect([l3.start, l3.end]).toEqual([2 * WORDS_PER_LEVEL, 45]);
    expect(levelSlice(9, 10).end).toBe(10); // 越界钳到词数
  });
});

describe('星级判定', () => {
  it('≥90 三星 / 80~89 两星过关 / 60~79 一星不过 / <60 零星', () => {
    expect(starsFor(9, 10)).toEqual({ stars: 3, passed: true, pct: 90 });
    expect(starsFor(8, 10)).toMatchObject({ stars: 2, passed: true });
    expect(starsFor(7, 10)).toMatchObject({ stars: 1, passed: false });
    expect(starsFor(3, 10)).toMatchObject({ stars: 0, passed: false });
  });

  it('全对 100%；total=0 不除零', () => {
    expect(starsFor(10, 10).pct).toBe(100);
    expect(starsFor(0, 0)).toEqual({ stars: 0, passed: false, pct: 0 });
  });
});

describe('出题与判分', () => {
  it('题目数不超过关卡词数上限', () => {
    const words = Array.from({ length: 5 }, (_, i) => w(i));
    const qs = genDrillQuestions(words, words.map((x) => x.gloss), seededRng());
    expect(qs.length).toBe(5); // 词少时以词数封顶
  });

  it('满关词数出 DRILL_QUESTIONS_PER_LEVEL 题，choice/spelling 交替，选项 4 个', () => {
    const words = Array.from({ length: WORDS_PER_LEVEL }, (_, i) => w(i));
    const qs = genDrillQuestions(words, words.map((x) => x.gloss), seededRng());
    expect(qs.length).toBe(DRILL_QUESTIONS_PER_LEVEL);
    expect(qs[0].kind).toBe('choice');
    expect(qs[1].kind).toBe('spelling');
    const choice = qs[0] as Extract<DrillQuestion, { kind: 'choice' }>;
    expect(choice.options).toHaveLength(4);
    expect(choice.options.filter((o) => o === words.find((x) => x.id === choice.wordId)!.gloss)).toHaveLength(1);
  });

  it('judgeAnswer：choice 比对释义，spelling 忽略大小写与空白', () => {
    const words = [w(1), w(2, { word: 'Abandon' })];
    const map = new Map(words.map((x) => [x.id, x]));
    const qs = genDrillQuestions(words, words.map((x) => x.gloss), () => 0.99);
    const choice = qs.find((q) => q.kind === 'choice') as Extract<DrillQuestion, { kind: 'choice' }>;
    const spelling = qs.find((q) => q.kind === 'spelling') as Extract<DrillQuestion, { kind: 'spelling' }>;
    expect(judgeAnswer(choice, { qid: choice.qid, kind: 'choice', picked: '释义1' }, map)).toBe(true);
    expect(judgeAnswer(choice, { qid: choice.qid, kind: 'choice', picked: '释义2' }, map)).toBe(false);
    const word = map.get(spelling.wordId)!;
    expect(judgeAnswer(spelling, { qid: spelling.qid, kind: 'spelling', typed: word.word.toUpperCase() }, map)).toBe(true);
    expect(judgeAnswer(spelling, { qid: spelling.qid, kind: 'spelling', typed: ` ${word.word} ` }, map)).toBe(true);
  });

  it('答案不相等才算干扰项：正确释义不重复出现在选项里', () => {
    const words = Array.from({ length: WORDS_PER_LEVEL }, (_, i) => w(i));
    for (let round = 0; round < 5; round++) {
      const qs = genDrillQuestions(words, words.map((x) => x.gloss), seededRng(round + 1));
      for (const q of qs.filter((x) => x.kind === 'choice') as Array<Extract<DrillQuestion, { kind: 'choice' }>>) {
        const g = words.find((x) => x.id === q.wordId)!.gloss;
        expect(q.options.filter((o) => o === g).length).toBe(1);
      }
    }
  });
});
