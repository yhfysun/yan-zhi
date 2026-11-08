// 学习模式 · 单词 SRS / 关卡 / 出题纯函数引擎（不 import db，可直接单测）。
//
// 依据：学习模式方案 §2.3-单词记忆细节（2026-11-08 用户拍板关卡制）：
//   - Leitner 盒制 box 1..5，间隔 [1,3,7,14,30] 天；答对升盒、答错回盒 1；
//   - 词书 ~20 词一关；闯关 10 题，≥80% 过关、≥90% 三星（80~89 两星）；
//   - 题型 P0 两款：看词选义（choice）/ 看义拼词（spelling）；听写与例句填空 P1。
// 判定「存在 ≠ 生效」在这里的防线：路由层只准调本模块的导出，不自己复算 SRS（唯一实现收口）。

export const SRS_BOX_COUNT = 5;

/** box 1..5 对应的复习间隔（天）；due = 上次作答时间 + 间隔 */
export const SRS_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;

export const WORDS_PER_LEVEL = 20;
export const DRILL_QUESTIONS_PER_LEVEL = 10;
export const LEVEL_PASS_PCT = 80;
export const LEVEL_THREE_STAR_PCT = 90;

export type SrsWordRow = {
  id: string;
  word: string;
  phonetic?: string | null;
  gloss: string;
  example?: string | null;
  box: number;
  due_at: number | null;
};

/** 答对：升盒（封顶 5），返回新 box 与下次到期时间 */
export function srsAdvance(box: number, now: number): { box: number; dueAt: number } {
  const next = Math.min(SRS_BOX_COUNT, Math.max(1, box) + 1);
  return { box: next, dueAt: now + SRS_INTERVAL_DAYS[next - 1] * 86_400_000 };
}

/** 答错：回盒 1（当天就排，间隔取盒 1 的 1 天） */
export function srsDemote(now: number): { box: number; dueAt: number } {
  return { box: 1, dueAt: now + SRS_INTERVAL_DAYS[0] * 86_400_000 };
}

/** 是否到期（due_at <= now 视为到期；null 视为已到期——新词没排程就该练） */
export function isDue(w: { box: number; due_at: number | null }, now: number): boolean {
  return w.due_at == null || w.due_at <= now;
}

/** 词数 → 关卡数（向上取整，每关 WORDS_PER_LEVEL 词） */
export function levelCountFor(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_LEVEL));
}

/** 第 levelNo 关（1-based）对应的词切片区间 [start, end) */
export function levelSlice(levelNo: number, wordCount: number): { start: number; end: number } {
  const start = (Math.max(1, levelNo) - 1) * WORDS_PER_LEVEL;
  return { start, end: Math.min(wordCount, start + WORDS_PER_LEVEL) };
}

/** 正确率 → 星级与是否过关：≥90 三星 / 80~89 两星（过关）/ <80 不过关 */
export function starsFor(correct: number, total: number): { stars: 0 | 1 | 2 | 3; passed: boolean; pct: number } {
  const totalSafe = Math.max(1, total);
  const pct = Math.round((correct / totalSafe) * 100);
  if (pct >= LEVEL_THREE_STAR_PCT) return { stars: 3, passed: true, pct };
  if (pct >= LEVEL_PASS_PCT) return { stars: 2, passed: true, pct };
  // 没过关也留 1 星记录进步（0 星表示未通过本关）
  if (pct >= 60) return { stars: 1, passed: false, pct };
  return { stars: 0, passed: false, pct };
}

export type DrillQuestion =
  | { kind: 'choice'; qid: string; wordId: string; prompt: string; phonetic?: string | null; options: string[] }
  | { kind: 'spelling'; qid: string; wordId: string; prompt: string; gloss: string; hint: string }
  /** 听写：audio=单词本体（前端 TTS 播放，页面不展示该文本）；无语音包时前端整体过滤该题型 */
  | { kind: 'dictation'; qid: string; wordId: string; audio: string; hint: string }
  /** 例句填空：prompt=挖空例句（目标词替换为 ____），spelling 式作答 */
  | { kind: 'cloze'; qid: string; wordId: string; prompt: string; gloss: string; hint: string };

export type DrillAnswer = { qid: string; kind: 'choice' | 'spelling' | 'dictation' | 'cloze'; picked?: string; typed?: string };

type Rng = () => number;

/** Fisher-Yates（注入 rng 供测试确定性；默认 Math.random） */
function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 生成一关的答题卷：choice 与 spelling 交替，答案判定在 submitDrill（服务端握答案）。
 * @param words 本关词表（≤ WORDS_PER_LEVEL）
 * @param distractorPool 干扰项池（同书其它词的释义；至少需要 3 条不同释义）
 * @param rng 注入随机源
 */
export function genDrillQuestions(
  words: SrsWordRow[],
  distractorPool: string[],
  rng: Rng = Math.random,
): DrillQuestion[] {
  const pool = distractorPool.filter((g) => g && g.trim());
  const count = Math.min(DRILL_QUESTIONS_PER_LEVEL, words.length);
  const picked = shuffle(words, rng).slice(0, count);
  const questions: DrillQuestion[] = [];
  for (let i = 0; i < picked.length; i++) {
    const w = picked[i];
    const qid = `q${i + 1}`;
    const mod = i % 4; // 四题型轮换：选义 / 拼写 / 听写 / 例句填空（方案 §2.3）
    const hintOf = (word: string) => `${word.slice(0, 1)}${'＿'.repeat(Math.max(0, word.length - 1))}（${word.length} 个字母）`;
    if (mod === 0) {
      // 看词选义：正确释义 + 3 个来自干扰池且不等于正确释义的选项
      const wrongs = shuffle(pool.filter((g) => g.trim() !== w.gloss.trim()), rng).slice(0, 3);
      while (wrongs.length < 3) wrongs.push(`选项 ${wrongs.length + 1}`); // 兜底：词库过小时不空卷
      const options = shuffle([w.gloss, ...wrongs], rng);
      questions.push({ kind: 'choice', qid, wordId: w.id, prompt: w.word, phonetic: w.phonetic ?? null, options });
    } else if (mod === 2) {
      // 听写：TTS 念词 → 拼写；只给长度提示，不泄文本（无语音包时前端整体过滤该题型）
      questions.push({ kind: 'dictation', qid, wordId: w.id, audio: w.word, hint: `${w.word.length} 个字母` });
    } else if (mod === 3 && clozeMask(w.example || '', w.word)) {
      // 例句填空：例句挖掉目标词；例句缺失/挖空失败退回拼写
      questions.push({
        kind: 'cloze',
        qid,
        wordId: w.id,
        prompt: clozeMask(w.example || '', w.word) as string,
        gloss: w.gloss,
        hint: hintOf(w.word),
      });
    } else {
      // 看义拼词：给释义，拼出单词；hint = 首字母 + 长度
      questions.push({
        kind: 'spelling',
        qid,
        wordId: w.id,
        prompt: w.gloss,
        gloss: w.gloss,
        hint: hintOf(w.word),
      });
    }
  }
  return questions;
}

/** 例句挖空：整词边界匹配目标词（忽略大小写），挖空失败返回 null */
export function clozeMask(example: string, word: string): string | null {
  if (!example.trim() || !word.trim()) return null;
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (!re.test(example)) return null;
  return example.replace(re, '____');
}

/** 判一题：choice 比对释义原文（trim）；其余题型忽略大小写与首尾空格比对单词 */
export function judgeAnswer(q: DrillQuestion, a: DrillAnswer, wordById: Map<string, SrsWordRow>): boolean {
  const w = wordById.get(q.wordId);
  if (!w) return false;
  if (q.kind === 'choice' && a.kind === 'choice') return String(a.picked || '').trim() === w.gloss.trim();
  if (a.kind === 'choice') return false;
  return String(a.typed || '').trim().toLowerCase() === w.word.trim().toLowerCase();
}
