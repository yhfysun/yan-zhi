// 历年真题训练：题库元数据、答案隔离、客观题判分与练习记录。
import { describe, it, expect } from 'vitest';
import { db } from '../src/db';
import {
  EXAM_PAPERS,
  listExamPapers,
  getExamPaper,
  submitExamPaper,
} from '../src/learning/exams';

const uid = `test-exam-${Date.now()}`;

describe('历年真题题库', () => {
  it('同时覆盖考研与高考，且包含多个年份', () => {
    const papers = listExamPapers();
    expect(papers.some((p) => p.examType === '考研')).toBe(true);
    expect(papers.some((p) => p.examType === '高考')).toBe(true);
    expect(new Set(papers.map((p) => p.year)).size).toBeGreaterThanOrEqual(4);
  });

  it('★ 考研复试与高考都提供听力专项，目录标记 hasListening 且题量完整到 8/10 题', () => {
    const listening = listExamPapers().filter((p) => p.hasListening);
    expect(listening.some((p) => p.examType === '考研')).toBe(true);
    expect(listening.some((p) => p.examType === '高考')).toBe(true);
    const gaokao = listening.find((p) => p.examType === '高考')!;
    const retest = listening.find((p) => p.examType === '考研')!;
    expect(gaokao.questionCount).toBe(10);
    expect(retest.questionCount).toBe(8);
  });

  it('★ 取卷不下发答案与解析，避免前端提前看到正确项', () => {
    const paper = getExamPaper(EXAM_PAPERS[0].id)!;
    expect(paper.questions.length).toBeGreaterThanOrEqual(5);
    for (const q of paper.questions) {
      expect(q).not.toHaveProperty('answer');
      expect(q).not.toHaveProperty('explanation');
      expect(q.options.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('★ 听力卷下发朗读稿供播放，但列表接口不泄露原文', () => {
    const summary = listExamPapers().find((p) => p.hasListening)!;
    expect(summary).not.toHaveProperty('listeningScript');
    const paper = getExamPaper(summary.id)!;
    expect(paper.listeningScript?.length).toBeGreaterThan(200);
  });

  it('★ 交卷按客观题计分，返回逐题解析并写入 exam 学习记录', () => {
    const paper = EXAM_PAPERS[0];
    const source = new Map(paper.questions.map((q) => [q.id, q]));
    const answers = Object.fromEntries(paper.questions.map((q, i) => [
      q.id,
      i < 3 ? q.answer : (q.answer + 1) % q.options.length,
    ]));

    const result = submitExamPaper(uid, paper.id, answers);
    expect(result.correct).toBe(3);
    expect(result.total).toBe(paper.questions.length);
    expect(result.score).toBe(Math.round((3 / paper.questions.length) * 100));
    expect(result.details).toHaveLength(paper.questions.length);
    expect(result.details[0].answer).toBe(source.get(result.details[0].questionId)!.answer);
    expect(result.details[0].explanation.length).toBeGreaterThan(4);

    const session = db.prepare(
      "SELECT mode, scene_id, score FROM learning_session WHERE user_id = ? AND mode = 'exam' ORDER BY started_at DESC LIMIT 1",
    ).get(uid) as { mode: string; scene_id: string; score: number } | undefined;
    expect(session).toMatchObject({ mode: 'exam', scene_id: paper.id, score: result.score });
  });
});
