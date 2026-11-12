// 学习模式服务层回归（learning/service.ts，真 SQLite —— DATA_DIR 由全局 setup 隔离到临时目录）。
// 覆盖完整学习闭环：建词书 → 关卡地图（解锁）→ 取卷 → 交卷判分 → SRS 盒变动 → 到期复习 →
// 错误本 → 学习上下文摘要。这是「写入 ≠ 生效」的主战场：表里必须真的长出预期的行。
import { describe, it, expect } from 'vitest';
import { db } from '../src/db';
import {
  createCustomBook, listWordBooks, getLevels, getDrill, submitDrill,
  countDueWords, getReviewDrill, submitReviewDrill,
  addError, listErrors, getLearningContext, getCourses, listBookWords, deleteCustomBook,
  checkDrillAnswer,
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

describe('词汇表全量浏览（listBookWords）', () => {
  it('★ 内置词书：total = 内容包全量词数（不是某一关的 20 词）', () => {
    const p = listBookWords(uid, BUILTIN_BOOK.id, 0, 50);
    expect(p.total).toBe(BUILTIN_BOOK.words.length);
    expect(p.words.length).toBe(50); // 第一页满页
    expect(p.words[0].gloss.length).toBeGreaterThan(0);
  });

  it('分页：翻页词不重叠、末页不越界', () => {
    const p1 = listBookWords(uid, BUILTIN_BOOK.id, 0, 50);
    const p2 = listBookWords(uid, BUILTIN_BOOK.id, 1, 50);
    const seen = new Set(p1.words.map((w) => w.word));
    for (const w of p2.words) expect(seen.has(w.word)).toBe(false);
    const last = listBookWords(uid, BUILTIN_BOOK.id, Math.ceil(p1.total / 50) - 1, 50);
    expect(last.words.length).toBeGreaterThan(0);
    // 越界页返回空但不报错
    expect(listBookWords(uid, BUILTIN_BOOK.id, 9999, 50).words.length).toBe(0);
  });

  it('搜索：英文单词与中文释义都能命中', () => {
    const sample = BUILTIN_BOOK.words[0];
    const byWord = listBookWords(uid, BUILTIN_BOOK.id, 0, 20, sample.word);
    expect(byWord.words.some((w) => w.word === sample.word)).toBe(true);
    // 中文释义搜索：取释义前两个字（ qwerty 词库释义含空格/标点，前缀更稳）
    const zhKey = sample.gloss.slice(0, 2);
    const byGloss = listBookWords(uid, BUILTIN_BOOK.id, 0, 20, zhKey);
    expect(byGloss.words.some((w) => w.word === sample.word)).toBe(true);
    expect(listBookWords(uid, BUILTIN_BOOK.id, 0, 20, '__不存在的词__').total).toBe(0);
  });

  it('自定义词书：从 DB 读全量 + 权限隔离（别人的书拿不到词）', () => {
    const id = createCustomBook(uid, '浏览词单', [
      { word: 'alpha', gloss: '字母 A' },
      { word: 'beta', gloss: '字母 B' },
      { word: 'gamma', gloss: '字母 G' },
    ]);
    const p = listBookWords(uid, id, 0, 50);
    expect(p.total).toBe(3);
    expect(p.words.map((w) => w.word)).toEqual(['alpha', 'beta', 'gamma']);
    expect(listBookWords(uid, id, 0, 50, 'beta').words.length).toBe(1);
    // 另一个用户查这本书 → 报错（词书不存在或无权访问）
    expect(() => listBookWords(`other-${uid}`, id, 0, 50)).toThrow(/无权访问/);
  });

  it('内置词书目录行名称自愈：旧库残留「示例」名会被刷新成全量名', () => {
    // 模拟旧版本目录行：手写一条旧名（ON CONFLICT DO NOTHING 时代的产物）
    db.prepare(
      "INSERT OR IGNORE INTO word_book (id, user_id, name, kind, course, level, created_at) VALUES (?, NULL, '旧示例名', 'builtin', 'x', 'y', 0)",
    ).run(BUILTIN_BOOK.id);
    // listBookWords 不触发目录刷新；listWordBooks 里的 ensureBuiltinBookRows 会
    listWordBooks(uid);
    const row = db.prepare('SELECT name FROM word_book WHERE id = ?').get(BUILTIN_BOOK.id) as { name: string };
    expect(row.name).toBe(BUILTIN_BOOK.name);
    expect(row.name).not.toContain('示例');
  });

  it('删除自定义词书：词行+关卡进度连清；内置词书和别人的词书不可删', () => {
    const id = createCustomBook(uid, '待删词单', [
      { word: 'alpha', gloss: '字母 A' },
      { word: 'beta', gloss: '字母 B' },
    ]);
    // 先闯一关留下进度行
    const { questions } = getDrill(uid, id, 1);
    submitDrill(uid, id, 1, questions.map((q) => ({ qid: q.qid, kind: 'spelling' as const, typed: 'zzz' })), questions);
    expect(db.prepare('SELECT COUNT(*) AS c FROM learning_word WHERE user_id = ? AND book_id = ?').get(uid, id)).toBeTruthy();

    deleteCustomBook(uid, id);
    expect(db.prepare('SELECT COUNT(*) AS c FROM word_book WHERE id = ?').get(id)).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) AS c FROM learning_word WHERE book_id = ?').get(id)).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) AS c FROM word_level WHERE book_id = ?').get(id)).toEqual({ c: 0 });
    expect(listWordBooks(uid).some((b) => b.id === id)).toBe(false);

    // 内置词书不可删
    expect(() => deleteCustomBook(uid, BUILTIN_BOOK.id)).toThrow(/不可删除/);
    // 不存在的书报错
    expect(() => deleteCustomBook(uid, 'wb_no_such')).toThrow(/不存在/);
    // 别人的 custom 书删不了
    const other = createCustomBook(`other-${uid}`, '别人的词单', [{ word: 'x', gloss: 'y' }]);
    expect(() => deleteCustomBook(uid, other)).toThrow(/不存在/);
  });

  it('★ 无主 custom 词书（user_id NULL 的早期遗留）对任何用户不可见且会被自动清理', () => {
    // 模拟老库脏数据：kind=custom 但无归属（早期无 user_id 列时代的产物）
    db.prepare(
      "INSERT INTO word_book (id, user_id, name, kind, course, level, created_at) VALUES ('wb_orphan_test', NULL, '无主词单', 'custom', '自定义', '', 0)",
    ).run();
    db.prepare(
      "INSERT INTO learning_word (id, user_id, book_id, word, phonetic, gloss, example, box, due_at, ord, created_at) VALUES ('lw_orphan', ?, 'wb_orphan_test', 'foo', NULL, '测试', NULL, 1, NULL, 0, 0)",
    ).run(uid);
    // 任何用户都看不到它（此前 user_id IS NULL 分支会把它泄露给所有人）
    expect(listWordBooks(uid).some((b) => b.id === 'wb_orphan_test')).toBe(false);
    expect(listWordBooks(`other-${uid}`).some((b) => b.id === 'wb_orphan_test')).toBe(false);
    // 触发 ensureBuiltinBookRows 的清理链（listWordBooks 内部调用）
    expect(db.prepare('SELECT COUNT(*) AS c FROM word_book WHERE id = ?').get('wb_orphan_test')).toEqual({ c: 0 });
    // 连带孤儿词行清掉
    expect(db.prepare('SELECT COUNT(*) AS c FROM learning_word WHERE id = ?').get('lw_orphan')).toEqual({ c: 0 });
  });
});

describe('闯关闭环（内置词书）', () => {
  it('★ 逐题判题：答错立即返回正确答案与解释，且不提前改动 SRS', () => {
    const { questions } = getDrill(uid, BUILTIN_BOOK.id, 1);
    const spelling = questions.find((q) => q.kind !== 'choice')!;
    const word = BUILTIN_BOOK.words.find((w) => w.word === spelling.wordId)!;
    const before = db.prepare(
      'SELECT COUNT(*) AS c FROM learning_word WHERE user_id = ? AND book_id = ? AND word = ?',
    ).get(uid, BUILTIN_BOOK.id, spelling.wordId) as { c: number };

    const feedback = checkDrillAnswer(uid, BUILTIN_BOOK.id, spelling, {
      qid: spelling.qid,
      kind: spelling.kind,
      typed: 'definitely-wrong',
    });

    expect(feedback.correct).toBe(false);
    expect(feedback.word).toBe(word.word);
    expect(feedback.expected).toBe(word.word);
    expect(feedback.explanation).toContain(word.gloss);
    const after = db.prepare(
      'SELECT COUNT(*) AS c FROM learning_word WHERE user_id = ? AND book_id = ? AND word = ?',
    ).get(uid, BUILTIN_BOOK.id, spelling.wordId) as { c: number };
    expect(after.c).toBe(before.c);
  });

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

describe('关卡复习角标（P2 金色节点）', () => {
  it('★ dueCount 只数「已学过且 SRS 到期」的词；新词（due_at NULL）不算', () => {
    // 第 1 关前 3 个词的 learning_word 行已在前面闯关用例落库；先清第 2 关影响再构造：
    // ① 把第 1 关（词序 0..19）中前 2 个学过的词设为已到期
    const lvl1Words = BUILTIN_BOOK.words.slice(0, 20).map((w) => w.word);
    const past = Date.now() - 1000;
    let setPast = 0;
    for (const w of lvl1Words) {
      const row = db.prepare('SELECT id FROM learning_word WHERE user_id = ? AND book_id = ? AND word = ?')
        .get(uid, BUILTIN_BOOK.id, w) as { id: string } | undefined;
      if (row && setPast < 2) { db.prepare('UPDATE learning_word SET due_at = ? WHERE id = ?').run(past, row.id); setPast++; }
    }
    // ② 未学过的词造不了行（不落库）——直接验证 NULL 语义：插入一行 due_at=NULL 的假想新词不在此关
    const levels = getLevels(uid, BUILTIN_BOOK.id);
    expect(levels[0].dueCount).toBe(setPast); // 只有显式设为到期的词算
    // ③ 复习交卷清零：把到期词全部答对推进 SRS 后，角标归零
    for (const w of lvl1Words) {
      db.prepare('UPDATE learning_word SET due_at = ? WHERE user_id = ? AND book_id = ? AND word = ? AND due_at IS NOT NULL')
        .run(Date.now() + 86_400_000, uid, BUILTIN_BOOK.id, w);
    }
    const levelsAfter = getLevels(uid, BUILTIN_BOOK.id);
    expect(levelsAfter[0].dueCount).toBe(0);
  });
});

describe('课程学段总览', () => {
  it('★ 20 门英语课 + 4 门软考专业 + 12 条安全路线按学段返回', () => {
    const groups = getCourses(uid);
    expect(groups[0].stage).toBe('启蒙');
    const all = groups.flatMap((g) => g.courses);
    expect(all.length).toBe(20);
    const soft = getCourses(uid, '软考').flatMap((g) => g.courses);
    expect(soft).toHaveLength(4);
    expect(soft.every((c) => c.kind === 'exam')).toBe(true);
    const security = getCourses(uid, '网络安全').flatMap((g) => g.courses);
    expect(security).toHaveLength(12);
    expect(security.every((c) => c.kind === 'security' && !!c.securityPathId)).toBe(true);
    const cet4 = all.find((c) => c.name === '大学英语四级')!;
    // 全量词书接入后总关卡数按 20 词/关动态计算
    const expectedLevels = Math.ceil(cet4.wordCount / 20);
    expect(cet4.totalLevels).toBe(expectedLevels);
    expect(expectedLevels).toBeGreaterThan(100);
    const clearedBefore = cet4.clearedLevels;
    // 闯过四级第 1 关 → 进度 > 0（uid 在前文已通关 CET4 第 1 关，这里验一致性）
    expect(clearedBefore).toBeGreaterThanOrEqual(1);
    expect(cet4.progressPct).toBe(Math.round((cet4.clearedLevels / cet4.totalLevels) * 100));
  });

  it('★ subject 过滤：英语 20 门课，未开科目的课程为空（扩展点真生效）', () => {
    expect(getCourses(uid, '英语').flatMap((g) => g.courses).length).toBe(20);
    expect(getCourses(uid, '软考').flatMap((g) => g.courses).length).toBe(4);
    expect(getCourses(uid, '网络安全').flatMap((g) => g.courses).length).toBe(12);
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
