// 发音打分纯函数回归（learning/pronunciation.ts）。
// 打分口径是产品语义（读对=满分/读错=部分分/漏读=0/多说=扣分），改口径必须过这里。
import { describe, it, expect } from 'vitest';
import { normalizeForScore, tokenize, charSimilarity, scorePronunciation } from '../src/learning/pronunciation';

describe('normalizeForScore / tokenize', () => {
  it('去标点、小写、压缩空白', () => {
    expect(normalizeForScore('Hello, World!')).toBe('hello world');
    expect(normalizeForScore("I'm  fine—today.")).toBe("i'm fine today"); // em dash → 空格
    expect(normalizeForScore('  A  B\tC\n')).toBe('a b c');
    expect(normalizeForScore('')).toBe('');
  });

  it('tokenize：空串返回空数组', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('。。。')).toEqual([]);
  });
});

describe('charSimilarity', () => {
  it('相同=1，空串参与=0，相近词部分分', () => {
    expect(charSimilarity('apple', 'apple')).toBe(1);
    expect(charSimilarity('', '')).toBe(1);
    expect(charSimilarity('apple', '')).toBe(0);
    expect(charSimilarity('cat', 'cap')).toBeCloseTo(2 / 3, 5); // 1 词差异 / 3
    expect(charSimilarity('cat', 'dog')).toBeLessThan(charSimilarity('cat', 'cap'));
  });
});

describe('scorePronunciation', () => {
  it('★ 完全读对：100 分，逐词 ok', () => {
    const r = scorePronunciation('I would like a coffee', 'I would like a coffee');
    expect(r.score).toBe(100);
    expect(r.words.every((w) => w.status === 'ok')).toBe(true);
    expect(r.extraWords).toEqual([]);
  });

  it('★ 标点/大小写/时态归一不扣分', () => {
    const r = scorePronunciation('Hello, World!', 'hello world.');
    expect(r.score).toBe(100);
  });

  it('漏读一个词：扣该词全部权重（5 词读对 4 词 = 80）', () => {
    const r = scorePronunciation('I would like a coffee', 'I would like a');
    expect(r.words.find((w) => w.expected === 'coffee')?.status).toBe('missing');
    expect(r.score).toBe(80);
  });

  it('读错一个词：按字符相似度给部分分（cat→cap ≈ 67）', () => {
    const r = scorePronunciation('the cat sits', 'the cap sits');
    const wrong = r.words.find((w) => w.status === 'wrong')!;
    expect(wrong.spoken).toBe('cap');
    expect(wrong.sim).toBeCloseTo(2 / 3, 5);
    expect(r.score).toBe(Math.round(((1 + 1 + 2 / 3) / 3) * 100));
  });

  it('多说词：降分且封顶扣 20（目标 1 词 + 6 个无关词）', () => {
    const r = scorePronunciation('hello', 'hello a b c d e f');
    expect(r.extraWords).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    // 基础分 100，扣 6×4=24 但封顶 20 → 80
    expect(r.score).toBe(80);
  });

  it('目标句为空=0（路由层不会放空，纯函数兜底）', () => {
    expect(scorePronunciation('', 'hello').score).toBe(0);
  });

  it('说了但目标为空：words 空、extraWords 全记', () => {
    const r = scorePronunciation('   ', 'hello world');
    expect(r.words).toEqual([]);
    expect(r.extraWords).toEqual(['hello', 'world']);
    expect(r.score).toBe(0);
  });

  it('完全没说对：0 分（无 ok 词）', () => {
    const r = scorePronunciation('good morning', 'zzz qqq');
    expect(r.words.every((w) => w.status !== 'ok')).toBe(true);
    expect(r.score).toBe(0);
  });

  it('★ 词序颠倒仍按对齐匹配（发音打分不关心语序，多重集配对）', () => {
    const r = scorePronunciation('a coffee please', 'please a coffee');
    expect(r.words.every((w) => w.status === 'ok')).toBe(true);
    expect(r.score).toBe(100);
  });
});
