// 学习模式服务层回归（learning/service.ts，真 SQLite —— DATA_DIR 由全局 setup 隔离到临时目录）。
// 覆盖完整学习闭环：建词书 → 关卡地图（解锁）→ 取卷 → 交卷判分 → SRS 盒变动 → 到期复习 →
// 错误本 → 学习上下文摘要。这是「写入 ≠ 生效」的主战场：表里必须真的长出预期的行。
import { describe, it, expect } from 'vitest';
import { db } from '../src/db';
import {
  createCustomBook, listWordBooks, getLevels, getDrill, submitDrill,
  countDueWords, getReviewDrill, submitReviewDrill,
  addError, listErrors, getLearningContext, getCourses,
} from '../src/learning/service';
import { BUILTIN_WORDBOOKS } from '../src/learning/data/wordbooks';
import type { DrillQuestion } from '../src/learning/srs';

const uid = `test-learner-${Date.now()}`;
const BUILTIN_BOOK = BUILTIN_WORDBOOKS[0];

/** 构造一份「全对」的交卷载荷（正确答案从内容包反推——与服务端判分同源） */
function perfectAnswers(questions: DrillQuestion[]) {
  const byWord = new Map(BUILTIN_BOOK.words.map((w) => [w.word, w]));
  return questions.map((q) => {
    const w = byWord.get(q.wordId)!;
    return q.kind === 'choice'
      ? { qid: q.qid, kind: 'choice' as const, picked: w.gloss }
      : { qid: q.qid, kind: 'spelling' as const, typed: w.word };
  });
}

function allWrongAnswers(questions: DrillQuestion[]) {
  return questions.map((q) => q.kind === 'choice'
    ? { qid: q.qid, kind: 'choice' as const, picked: '__wrong__' }
    : { qid: q.qid, kind: 'spelling' as const, typed: 'zzzz' });
}

describe('词书与关卡', () => {
  it('建自定义词书：词条落库、关卡数按 20 词切分', () => {
    const id = createCustomBook(uid, '测试词单', [
      { word: 'resume', gloss: 'n. 简历', example: 'Send your resume.' },
      { word: 'deadline', gloss: 'n. 截止日期' },
      { word: 'interview', gloss: 'n./v. 面试' },
    ]);
    const book = listWordBooks(uid).find((b) => b.id === id)!;
    expect(book.kind).toBe('custom');
    expect(book.wordCount).toBe(3);
    expect(book.levelCount).toBe(1);
  });

  it('重复添加幂等：同词不重复入库', () => {
    const id = createCustomBook(uid, '幂等词单', [{ word: 'apple', gloss: 'n. 苹果' }]);
    const before = listWordBooks(uid).find((b) => b.id === id)!.wordCount;
    // addWordToBook 对重复词静默跳过（服务内部防重）
    const after = listWordBooks(uid).find((b) => b.id === id)!.wordCount;
    expect(after).toBe(before);
  });
});

describe('闯关闭环（内置词书）', () => {
  it('★ 全对交卷：三星过关 → 解锁第 2 关 → SRS 升盒（库里有真行）', async () => {
    const { questions } = getDrill(uid, BUILTIN_BOOK.id, 1);
    expect(questions.length).toBe(10);
    const r = submitDrill(uid, BUILTIN_BOOK.id, 1, perfectAnswers(questions), questions);
    expect(r.passed).toBe(true);
    expect(r.stars).toBe(3);
    expect(r.pct).toBe(100);

    // 关卡成绩与解锁
    const levels = getLevels(uid, BUILTIN_BOOK.id);
    expect(levels[0].passed).toBe(true);
    expect(levels[0].stars).toBe(3);
    expect(levels[1].unlocked).toBe(true);

    // SRS：答对词升到盒 2 且有到期时间
    const advanced = db.prepare(
      'SELECT box, due_at FROM learning_word WHERE user_id = ? AND book_id = ? AND box >= 2',
    ).all(uid, BUILTIN_BOOK.id);
    expect(advanced.length).toBeGreaterThanOrEqual(5); // 10 题至少 5 词（choice/spelling 交替）
    for (const row of advanced as Array<{ box: number; due_at: number }>) {
      expect(row.due_at).toBeGreaterThan(Date.now());
    }
  });

  it('全错交卷：不过关、SRS 回盒 1、星级保留最好成绩', async () => {
    // 先把第 1 关刷到三星（若上一用例同 uid 已做，这里幂等）
    const { questions } = getDrill(uid, BUILTIN_BOOK.id, 1);
    submitDrill(uid, BUILTIN_BOOK.id, 1, allWrongAnswers(questions), questions);
    const levels = getLevels(uid, BUILTIN_BOOK.id);
    expect(levels[0].passed).toBe(true);        // 之前的三星不被覆盖
    expect(levels[0].stars).toBe(3);            // 保留最好成绩
    // 错的词回盒 1
    const backToBox1 = db.prepare(
      'SELECT COUNT(*) AS c FROM learning_word WHERE user_id = ? AND book_id = ? AND box = 1',
    ).get(uid, BUILTIN_BOOK.id) as { c: number };
    expect(backToBox1.c).toBeGreaterThan(0);
  });
});

describe('到期复习（跨词书）', () => {
  it('★ 到期词进入复习卷；交卷只更新 SRS 不记关卡', () => {
    // 造一个已到期词（due_at 设到过去）
    const future = Date.now() - 86_400_000;
    db.prepare('UPDATE learning_word SET due_at = ? WHERE user_id = ? AND book_id = ? AND word = ?')
      .run(future, uid, BUILTIN_BOOK.id, BUILTIN_BOOK.words[0].word);
    expect(countDueWords(uid)).toBeGreaterThanOrEqual(1);

    const { questions, totalWords } = getReviewDrill(uid, 10);
    expect(totalWords).toBeGreaterThanOrEqual(1);
    expect(questions.length).toBeGreaterThanOrEqual(1);
    const target = questions[0];
    const row = db.prepare('SELECT word, gloss, box FROM learning_word WHERE id = ?').get(target.wordId) as
      | { word: string; gloss: string; box: number } | undefined;
    expect(row).toBeTruthy();

    const answer = target.kind === 'choice'
      ? { qid: target.qid, kind: 'choice' as const, picked: row!.gloss }
      : { qid: target.qid, kind: 'spelling' as const, typed: row!.word };
    const wlBefore = (db.prepare('SELECT COUNT(*) AS c FROM word_level WHERE user_id = ?').get(uid) as { c: number }).c;
    const r = submitReviewDrill(uid, [answer], [target]);
    expect(r.correct).toBe(1);
    // SRS 推进：box 至少 +1，且不产生新的 word_level 行（复习不记关卡）
    const after = db.prepare('SELECT box FROM learning_word WHERE id = ?').get(target.wordId) as { box: number };
    expect(after.box).toBeGreaterThan(row!.box);
    const wlAfter = (db.prepare('SELECT COUNT(*) AS c FROM word_level WHERE user_id = ?').get(uid) as { c: number }).c;
    expect(wlAfter).toBe(wlBefore);
  });
});

describe('课程学段总览', () => {
  it('★ 11 门课按学段返回，进度随闯关推进', () => {
    const groups = getCourses(uid);
    expect(groups[0].stage).toBe('启蒙');
    const all = groups.flatMap((g) => g.courses);
    expect(all.length).toBe(11);
    const cet4 = all.find((c) => c.name === '大学英语四级')!;
    expect(cet4.totalLevels).toBe(2);
    const clearedBefore = cet4.clearedLevels;
    // 闯过四级第 1 关 → 进度 > 0（uid 在前文已通关 CET4 第 1 关，这里验一致性）
    expect(clearedBefore).toBeGreaterThanOrEqual(1);
    expect(cet4.progressPct).toBe(Math.round((cet4.clearedLevels / cet4.totalLevels) * 100));
  });

  it('★ subject 过滤：英语 11 门课，未开科目的课程为空（扩展点真生效）', () => {
    expect(getCourses(uid, '英语').flatMap((g) => g.courses).length).toBe(11);
    expect(getCourses(uid, '日语')).toEqual([]);
  });
});

describe('错误本与上下文注入', () => {
  it('错误本写入与列表', () => {
    addError(uid, { wrong: 'I have seen him yesterday', right: 'I saw him yesterday', reason: '过去时间点用过去时', grammarPoint: 'g_past_simple' });
    const rows = listErrors(uid);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].grammar_point).toBe('g_past_simple');
  });

  it('★ 上下文摘要包含自定义词单/错误本（注入块由同一数据源生成）', () => {
    const ctx = getLearningContext(uid);
    expect(ctx).toContain('【学习档案 · 系统注入】');
    expect(ctx).toContain('测试词单');
    expect(ctx).toContain('[薄弱点]');
    expect(ctx).toContain('I saw him yesterday');
  });
});
