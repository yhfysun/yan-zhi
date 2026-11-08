// 学习模式 · db 服务层（学习模式方案 §3.3，2026-11-08）。
// 唯一实现收口：SRS/关卡/出题的全部业务规则在 ./srs.ts（纯函数），本文件只做读写编排，
// 路由层禁止自己复算盒数/星级/切关 —— 同一语义只能有一处实现。
import { db } from '../db.js';
import {
  srsAdvance, srsDemote, isDue, levelCountFor, levelSlice, starsFor,
  genDrillQuestions, judgeAnswer, type SrsWordRow, type DrillQuestion, type DrillAnswer,
} from './srs.js';
import { BUILTIN_WORDBOOKS } from './data/wordbooks.js';
import { buildLearningContextSummary } from './context.js';
import { COURSE_CATALOG, COURSE_STAGES, LEARNING_SUBJECTS, type CourseStage } from './curriculum.js';

export type LearningProfile = { cefr: string | null; goals: string | null; updated_at: number };

export function getProfile(userId: string): LearningProfile {
  const row = db.prepare('SELECT cefr, goals, updated_at FROM learning_profile WHERE user_id = ?').get(userId) as
    | { cefr: string | null; goals: string | null; updated_at: number }
    | undefined;
  return row ? { cefr: row.cefr, goals: row.goals, updated_at: row.updated_at } : { cefr: null, goals: null, updated_at: 0 };
}

/** 学习档案（带 streak）——前端学习页头部的火焰天数用（对标 Duolingo streak 的"损失厌恶"位） */
export function getProfileWithStreak(userId: string): LearningProfile & { streakDays: number } {
  const p = getProfile(userId);
  return { ...p, streakDays: computeStreak(userId, Date.now()) };
}

export function upsertProfile(userId: string, patch: { cefr?: string | null; goals?: string | null }): LearningProfile {
  const cur = getProfile(userId);
  const next: LearningProfile = {
    cefr: patch.cefr !== undefined ? patch.cefr : cur.cefr,
    goals: patch.goals !== undefined ? patch.goals : cur.goals,
    updated_at: Date.now(),
  };
  db.prepare(
    `INSERT INTO learning_profile (user_id, cefr, goals, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET cefr = excluded.cefr, goals = excluded.goals, updated_at = excluded.updated_at`,
  ).run(userId, next.cefr, next.goals, next.updated_at);
  return next;
}

// ── 词书 ────────────────────────────────────────────────────────────────────

export type WordBookView = {
  id: string;
  name: string;
  kind: 'builtin' | 'custom' | 'downloaded';
  course: string;
  level: string;
  subject: string;
  wordCount: number;
  levelCount: number;
  maxLevelCleared: number;
  /** 该词书当前到期词数（>0 时关卡地图亮复习角标，对标 Duolingo 金色节点衰减提醒） */
  dueCount: number;
};

/** 内置词书登记（幂等）：词表来自内容包不进库，word_book 只存一行目录（user_id NULL=共享） */
function ensureBuiltinBookRows(): void {
  for (const b of BUILTIN_WORDBOOKS) {
    db.prepare(
      `INSERT INTO word_book (id, user_id, name, kind, course, level, created_at) VALUES (?, NULL, ?, 'builtin', ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    ).run(b.id, b.name, b.course, b.level, Date.now());
  }
}

function maxClearedLevel(userId: string, bookId: string): number {
  const row = db.prepare('SELECT MAX(level_no) AS m FROM word_level WHERE user_id = ? AND book_id = ? AND passed = 1')
    .get(userId, bookId) as { m: number | null } | undefined;
  return row?.m ?? 0;
}

export function listWordBooks(userId: string): WordBookView[] {
  ensureBuiltinBookRows();
  // ★ 词书按用户过滤：内置（user_id NULL）共享；custom/downloaded 只归本人
  const rows = db.prepare(
    'SELECT id, name, kind, course, level, COALESCE(subject, \'英语\') AS subject FROM word_book WHERE user_id IS NULL OR user_id = ? ORDER BY created_at ASC',
  ).all(userId) as Array<{ id: string; name: string; kind: string; course: string; level: string; subject: string }>;
  return rows.map((r) => {
    const wc = r.kind === 'custom'
      ? (db.prepare('SELECT COUNT(*) AS c FROM learning_word WHERE user_id = ? AND book_id = ?').get(userId, r.id) as { c: number }).c
      : (BUILTIN_WORDBOOKS.find((b) => b.id === r.id)?.words.length ?? 0);
    const due = db.prepare(
      'SELECT COUNT(*) AS c FROM learning_word WHERE user_id = ? AND book_id = ? AND (due_at IS NULL OR due_at <= ?)',
    ).get(userId, r.id, Date.now()) as { c: number };
    return {
      id: r.id, name: r.name, kind: r.kind as WordBookView['kind'],
      course: r.course, level: r.level, subject: r.subject,
      wordCount: wc, levelCount: levelCountFor(wc),
      maxLevelCleared: maxClearedLevel(userId, r.id),
      dueCount: due.c,
    };
  });
}

/** 取一本书的词序列（builtin 来自内容包并按需落库；custom 按 ord 排序读库）。ord 决定切关顺序 */
function wordsOfBook(userId: string, bookId: string): SrsWordRow[] {
  // 归属校验：内置共享（user_id NULL），custom 只归本人 —— 别人的词书拿不到词
  const book = db.prepare('SELECT kind FROM word_book WHERE id = ? AND (user_id IS NULL OR user_id = ?)').get(bookId, userId) as { kind: string } | undefined;
  if (!book) return [];
  if (book.kind === 'custom') {
    return db.prepare(
      'SELECT id, word, phonetic, gloss, example, box, due_at FROM learning_word WHERE user_id = ? AND book_id = ? ORDER BY ord ASC, created_at ASC',
    ).all(userId, bookId) as unknown as SrsWordRow[];
  }
  const pack = BUILTIN_WORDBOOKS.find((b) => b.id === bookId);
  if (!pack) return [];
  const existing = db.prepare(
    'SELECT word, box, due_at FROM learning_word WHERE user_id = ? AND book_id = ?',
  ).all(userId, bookId) as Array<{ word: string; box: number; due_at: number | null }>;
  const byWord = new Map(existing.map((e) => [e.word, e]));
  return pack.words.map((w, i) => {
    const e = byWord.get(w.word);
    return {
      id: w.word,
      word: w.word,
      phonetic: w.phonetic ?? null,
      gloss: w.gloss,
      example: w.example ?? null,
      box: e?.box ?? 1,
      due_at: e?.due_at ?? null,
      ord: i,
    } as SrsWordRow & { ord: number };
  });
}

/** 科目清单（前端科目分段由服务端驱动，不写死在 UI：以后加科目只改 curriculum.ts） */
export function getSubjects() {
  return LEARNING_SUBJECTS.map((s) => ({ ...s }));
}

/** 自定义词书建书（subject 决定归属哪个科目；默认英语） */
export function createCustomBook(userId: string, name: string, words: Array<{ word: string; phonetic?: string; gloss: string; example?: string }>, subject = '英语'): string {
  const id = `wb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO word_book (id, user_id, name, kind, subject, course, level, created_at) VALUES (?, ?, ?, 'custom', ?, '自定义', '', ?)`)
      .run(id, userId, name, subject, now);
    const ins = db.prepare(
      `INSERT INTO learning_word (id, user_id, book_id, word, phonetic, gloss, example, box, due_at, ord, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)`,
    );
    words.forEach((w, i) => {
      ins.run(`lw_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`, userId, id,
        w.word.trim(), w.phonetic ?? null, w.gloss.trim(), w.example ?? null, i, now);
    });
  });
  tx();
  return id;
}

export function addWordToBook(userId: string, bookId: string, w: { word: string; phonetic?: string; gloss: string; example?: string }): void {
  const book = db.prepare("SELECT id FROM word_book WHERE id = ? AND kind = 'custom' AND user_id = ?").get(bookId, userId) as { id: string } | undefined;
  if (!book) throw new Error('只能向自己的自定义词书添加单词');
  const dup = db.prepare('SELECT id FROM learning_word WHERE user_id = ? AND book_id = ? AND word = ?').get(userId, bookId, w.word.trim());
  if (dup) return; // 幂等：重复添加静默跳过
  const ord = (db.prepare('SELECT COALESCE(MAX(ord), -1) + 1 AS o FROM learning_word WHERE user_id = ? AND book_id = ?')
    .get(userId, bookId) as { o: number }).o;
  db.prepare(
    `INSERT INTO learning_word (id, user_id, book_id, word, phonetic, gloss, example, box, due_at, ord, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)`,
  ).run(`lw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`, userId, bookId,
    w.word.trim(), w.phonetic ?? null, w.gloss.trim(), w.example ?? null, ord, Date.now());
}

// ── 关卡与闯关 ──────────────────────────────────────────────────────────────

export type LevelView = { levelNo: number; wordCount: number; stars: number; passed: boolean; unlocked: boolean };

export function getLevels(userId: string, bookId: string): LevelView[] {
  const words = wordsOfBook(userId, bookId);
  const rows = db.prepare('SELECT level_no, stars, passed FROM word_level WHERE user_id = ? AND book_id = ?')
    .all(userId, bookId) as Array<{ level_no: number; stars: number; passed: number }>;
  const byLevel = new Map(rows.map((r) => [r.level_no, r]));
  const total = levelCountFor(words.length);
  const out: LevelView[] = [];
  for (let no = 1; no <= total; no++) {
    const r = byLevel.get(no);
    const { start, end } = levelSlice(no, words.length);
    // 锁定规则：第 1 关始终开放；其后必须前一关 passed 才解锁
    const unlocked = no === 1 || byLevel.get(no - 1)?.passed === 1;
    out.push({
      levelNo: no,
      wordCount: end - start,
      stars: r?.stars ?? 0,
      passed: r?.passed === 1,
      unlocked,
    });
  }
  return out;
}

/** 生成一关的答题卷（答案不下发，判定在 submitDrill） */
export function getDrill(userId: string, bookId: string, levelNo: number): { questions: DrillQuestion[]; totalWords: number } {
  const words = wordsOfBook(userId, bookId);
  const { start, end } = levelSlice(levelNo, words.length);
  const slice = words.slice(start, end);
  const pool = words.map((w) => w.gloss);
  return { questions: genDrillQuestions(slice, pool), totalWords: slice.length };
}

export type DrillSubmitResult = {
  correct: number; total: number; stars: number; passed: boolean; pct: number;
  results: Array<{ qid: string; word: string; correct: boolean; expected: string }>;
};

export function submitDrill(
  userId: string, bookId: string, levelNo: number, answers: DrillAnswer[], questions: DrillQuestion[],
): DrillSubmitResult {
  const words = wordsOfBook(userId, bookId);
  const wordById = new Map(words.map((w) => [w.id, w]));
  const now = Date.now();
  let correct = 0;
  const results: DrillSubmitResult['results'] = [];
  const touched = new Map<string, boolean>(); // wordId → 最近一次对错
  for (const q of questions) {
    const a = answers.find((x) => x.qid === q.qid);
    const ok = a ? judgeAnswer(q, a, wordById) : false;
    if (ok) correct += 1;
    const w = wordById.get(q.wordId);
    if (w) {
      results.push({ qid: q.qid, word: w.word, correct: ok, expected: q.kind === 'choice' ? w.gloss : w.word });
      touched.set(w.id, ok);
    }
  }
  const { stars, passed, pct } = starsFor(correct, questions.length);
  const tx = db.transaction(() => {
    // SRS 更新（每词按最后判定）：先清过期语义 —— due_at 为 null 的词也参与
    for (const [wordId, ok] of touched) {
      const w = wordById.get(wordId)!;
      const cur = db.prepare('SELECT id, box FROM learning_word WHERE user_id = ? AND book_id = ? AND word = ?')
        .get(userId, bookId, wordId) as { id: string; box: number } | undefined;
      if (cur) {
        const next = ok ? srsAdvance(cur.box, now) : srsDemote(now);
        db.prepare('UPDATE learning_word SET box = ?, due_at = ? WHERE id = ?').run(next.box, next.dueAt, cur.id);
      } else {
        // builtin 词首次作答：按内容包数据落 learning_word
        const packWord = BUILTIN_WORDBOOKS.flatMap((b) => (b.id === bookId ? b.words.map((x, i) => ({ x, i })) : [])).find((p) => p.x.word === wordId);
        if (!packWord) continue;
        const next = ok ? srsAdvance(1, now) : srsDemote(now);
        db.prepare(
          `INSERT INTO learning_word (id, user_id, book_id, word, phonetic, gloss, example, box, due_at, ord, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(`lw_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`, userId, bookId,
          packWord.x.word, packWord.x.phonetic ?? null, packWord.x.gloss, packWord.x.example ?? null,
          next.box, next.dueAt, packWord.i, now);
      }
    }
    // 关卡成绩（保留最好成绩）
    const prev = db.prepare('SELECT stars, best_score, passed FROM word_level WHERE user_id = ? AND book_id = ? AND level_no = ?')
      .get(userId, bookId, levelNo) as { stars: number; best_score: number; passed: number } | undefined;
    const bestStars = Math.max(prev?.stars ?? 0, stars);
    const bestScore = Math.max(prev?.best_score ?? 0, pct);
    db.prepare(
      `INSERT INTO word_level (user_id, book_id, level_no, stars, best_score, passed, cleared_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, book_id, level_no) DO UPDATE SET
         stars = MAX(word_level.stars, excluded.stars),
         best_score = MAX(word_level.best_score, excluded.best_score),
         passed = CASE WHEN word_level.passed = 1 OR excluded.passed = 1 THEN 1 ELSE 0 END,
         cleared_at = COALESCE(word_level.cleared_at, excluded.cleared_at)`,
    ).run(userId, bookId, levelNo, bestStars, bestScore, passed ? 1 : 0, now);
    // 练习记录（供上下文注入与 P1 查询工具）
    db.prepare(
      'INSERT INTO learning_session (id, user_id, mode, scene_id, score, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(`ls_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`, userId, 'drill', `${bookId}#${levelNo}`, pct, now, now);
  });
  tx();
  return { correct, total: questions.length, stars, passed, pct, results };
}

// ── 到期复习（对标 Duolingo 的"练习恢复"环：SRS 到期词优先练，不挂关卡） ──────────────

/** 今日到期词数（头部复习卡角标） */
export function countDueWords(userId: string): number {
  const row = db.prepare(
    'SELECT COUNT(*) AS c FROM learning_word WHERE user_id = ? AND (due_at IS NULL OR due_at <= ?)',
  ).get(userId, Date.now()) as { c: number };
  return row.c;
}

export function getReviewDrill(userId: string, limit = 10): { questions: DrillQuestion[]; totalWords: number } {
  const rows = db.prepare(
    `SELECT id, word, phonetic, gloss, example, box, due_at FROM learning_word
     WHERE user_id = ? AND (due_at IS NULL OR due_at <= ?) ORDER BY due_at ASC LIMIT ?`,
  ).all(userId, Date.now(), Math.min(20, Math.max(3, limit))) as unknown as SrsWordRow[];
  const pool = db.prepare('SELECT DISTINCT gloss FROM learning_word WHERE user_id = ? AND gloss IS NOT NULL')
    .all(userId) as Array<{ gloss: string }>;
  return { questions: genDrillQuestions(rows, pool.map((p) => p.gloss)), totalWords: rows.length };
}

export function submitReviewDrill(userId: string, answers: DrillAnswer[], questions: DrillQuestion[]): DrillSubmitResult {
  const now = Date.now();
  const wordById = new Map<string, SrsWordRow>();
  for (const q of questions) {
    const row = db.prepare('SELECT id, word, phonetic, gloss, example, box, due_at FROM learning_word WHERE id = ? AND user_id = ?')
      .get(q.wordId, userId) as SrsWordRow | undefined;
    if (row) wordById.set(q.wordId, row);
  }
  let correct = 0;
  const results: DrillSubmitResult['results'] = [];
  for (const q of questions) {
    if (!wordById.has(q.wordId)) continue;
    const a = answers.find((x) => x.qid === q.qid);
    const ok = a ? judgeAnswer(q, a, wordById) : false;
    if (ok) correct += 1;
    const w = wordById.get(q.wordId)!;
    results.push({ qid: q.qid, word: w.word, correct: ok, expected: q.kind === 'choice' ? w.gloss : w.word });
  }
  const { stars, passed, pct } = starsFor(correct, questions.length);
  const tx = db.transaction(() => {
    for (const q of questions) {
      const w = wordById.get(q.wordId);
      if (!w) continue;
      const a = answers.find((x) => x.qid === q.qid);
      const ok = a ? judgeAnswer(q, a, wordById) : false;
      const next = ok ? srsAdvance(w.box, now) : srsDemote(now);
      db.prepare('UPDATE learning_word SET box = ?, due_at = ? WHERE id = ?').run(next.box, next.dueAt, q.wordId);
    }
    db.prepare(
      'INSERT INTO learning_session (id, user_id, mode, scene_id, score, started_at, ended_at) VALUES (?, ?, ?, NULL, ?, ?, ?)',
    ).run(`ls_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`, userId, 'review', pct, now, now);
  });
  tx();
  return { correct, total: questions.length, stars, passed, pct, results };
}

// ── 课程学段总览（§2.2 课程地图：11 门课按学段排列，各课进度/到期一目了然） ───────

export type CourseView = {
  id: string; name: string; stage: CourseStage; bookId: string; bookName: string;
  wordCount: number; levelCount: number; clearedLevels: number; totalLevels: number;
  dueCount: number; progressPct: number;
};

export function getCourses(userId: string, subject = '英语'): Array<{ stage: CourseStage; courses: CourseView[] }> {
  ensureBuiltinBookRows();
  const byStage = new Map<CourseStage, CourseView[]>();
  for (const c of COURSE_CATALOG) {
    // ★ 按科目过滤（此前路由声称支持但没接 —— 已收口到此唯一实现）
    if (c.subject !== subject) continue;
    const pack = BUILTIN_WORDBOOKS.find((b) => b.id === c.bookId);
    if (!pack) continue;
    const wc = pack.words.length;
    const totalLevels = levelCountFor(wc);
    const cleared = maxClearedLevel(userId, c.bookId);
    const due = db.prepare(
      'SELECT COUNT(*) AS c FROM learning_word WHERE user_id = ? AND book_id = ? AND (due_at IS NULL OR due_at <= ?)',
    ).get(userId, c.bookId, Date.now()) as { c: number };
    const view: CourseView = {
      id: c.id, name: c.name, stage: c.stage, bookId: c.bookId, bookName: pack.name,
      wordCount: wc, levelCount: totalLevels, clearedLevels: cleared, totalLevels,
      dueCount: due.c,
      progressPct: totalLevels ? Math.round((cleared / totalLevels) * 100) : 0,
    };
    const list = byStage.get(c.stage) || [];
    list.push(view);
    byStage.set(c.stage, list);
  }
  return COURSE_STAGES.filter((s) => byStage.has(s)).map((stage) => ({ stage, courses: byStage.get(stage)! }));
}

// ── 错误本 ──────────────────────────────────────────────────────────────────

export type LearningErrorRow = { id: string; wrong: string; right: string; reason: string | null; grammar_point: string | null; created_at: number };

export function listErrors(userId: string, limit = 50): LearningErrorRow[] {
  return db.prepare(
    'SELECT id, wrong, right, reason, grammar_point, created_at FROM learning_error WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
  ).all(userId, limit) as unknown as LearningErrorRow[];
}

export function addError(userId: string, e: { wrong: string; right: string; reason?: string; grammarPoint?: string; sourceConv?: string }): LearningErrorRow {
  const id = `le_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  db.prepare(
    `INSERT INTO learning_error (id, user_id, wrong, right, reason, grammar_point, source_conv, box, due_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, ?)`,
  ).run(id, userId, e.wrong, e.right, e.reason ?? null, e.grammarPoint ?? null, e.sourceConv ?? null, now);
  return { id, wrong: e.wrong, right: e.right, reason: e.reason ?? null, grammar_point: e.grammarPoint ?? null, created_at: now };
}

// ── 上下文注入（§3.6 第 1 层） ───────────────────────────────────────────────

/** 连续学习天数：learning_session 里相邻日期链条（今天或昨天为链尾才有效） */
function computeStreak(userId: string, now: number): number {
  const rows = db.prepare(
    "SELECT DISTINCT date(started_at / 1000, 'unixepoch') AS d FROM learning_session WHERE user_id = ? ORDER BY d DESC LIMIT 60",
  ).all(userId) as Array<{ d: string }>;
  if (!rows.length) return 0;
  const dayMs = 86_400_000;
  const today = Math.floor(now / dayMs);
  const days = rows.map((r) => Math.floor(new Date(`${r.d}T00:00:00Z`).getTime() / dayMs));
  if (days[0] < today - 1) return 0;
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1] - 1) streak += 1;
    else break;
  }
  return streak;
}

export function getLearningContext(userId: string): string {
  const now = Date.now();
  const profile = getProfile(userId);
  const recentLevels = db.prepare(
    `SELECT wl.level_no, wl.stars, wl.cleared_at, wb.name AS book_name
     FROM word_level wl JOIN word_book wb ON wb.id = wl.book_id
     WHERE wl.user_id = ? AND wl.passed = 1 AND wl.cleared_at IS NOT NULL
     ORDER BY wl.cleared_at DESC LIMIT 3`,
  ).all(userId) as Array<{ level_no: number; stars: number; cleared_at: number; book_name: string }>;
  const dueWords = db.prepare(
    'SELECT word FROM learning_word WHERE user_id = ? AND due_at IS NOT NULL AND due_at <= ? ORDER BY due_at ASC LIMIT 8',
  ).all(userId, now) as Array<{ word: string }>;
  const topErrors = db.prepare(
    'SELECT wrong, right FROM learning_error WHERE user_id = ? ORDER BY created_at DESC LIMIT 3',
  ).all(userId) as Array<{ wrong: string; right: string }>;
  const customBooks = db.prepare(
    `SELECT wb.id, wb.name, COUNT(lw.id) AS wc FROM word_book wb
     LEFT JOIN learning_word lw ON lw.book_id = wb.id AND lw.user_id = ?
     WHERE wb.kind = 'custom' AND wb.user_id = ? GROUP BY wb.id ORDER BY wb.created_at ASC`,
  ).all(userId, userId) as Array<{ id: string; name: string; wc: number }>;
  return buildLearningContextSummary({
    profile,
    recentLevels: recentLevels.map((r) => ({ bookName: r.book_name, levelNo: r.level_no, stars: r.stars, clearedAt: r.cleared_at })),
    dueWords: dueWords.map((w) => w.word),
    topErrors,
    customBooks: customBooks.map((b) => ({ name: b.name, wordCount: b.wc, maxLevelCleared: maxClearedLevel(userId, b.id) })),
    now,
  }, { streakDays: computeStreak(userId, now) });
}
