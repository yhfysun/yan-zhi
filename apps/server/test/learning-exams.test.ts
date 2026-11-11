// 历年真题训练：题库元数据、答案隔离、客观题判分与练习记录。
import { describe, it, expect, vi } from 'vitest';
import { db } from '../src/db';
import {
  EXAM_PAPERS,
  listExamPapers,
  getExamPaper,
  submitExamPaper,
} from '../src/learning/exams';
import { SOFT_MATERIALS, getSoftMaterial } from '../src/learning/exam-papers-extra';
import { SOFT_EXAM_REGIONS, getSoftExamLiveInfo } from '../src/learning/soft-exam-live';

const uid = `test-exam-${Date.now()}`;

describe('历年真题题库', () => {
  it('覆盖考研、高考与软考，年份覆盖 2021–2025', () => {
    const papers = listExamPapers();
    expect(papers.some((p) => p.examType === '考研')).toBe(true);
    expect(papers.some((p) => p.examType === '高考')).toBe(true);
    expect(papers.some((p) => p.examType === '软考')).toBe(true);
    const years = new Set(papers.map((p) => p.year));
    for (const year of [2021, 2022, 2023, 2024, 2025]) expect(years.has(year), String(year)).toBe(true);
    for (const p of papers.filter((x) => x.examType === '高考')) expect(p.region).toContain('全国');
  });

  it('★ 听力已并入整套综合卷，不再作为独立试卷出现在目录', () => {
    const listening = listExamPapers().filter((p) => p.hasListening);
    expect(listening.some((p) => p.examType === '考研')).toBe(true);
    expect(listening.some((p) => p.examType === '高考')).toBe(true);
    expect(listening.every((p) => p.section !== '听力理解')).toBe(true);
    expect(listening.find((p) => p.examType === '高考')?.section).toContain('综合');
    expect(listening.find((p) => p.examType === '考研')?.section).toContain('综合');
  });

  it('★ 取卷不下发答案与解析，避免前端提前看到正确项', () => {
    const paper = getExamPaper(EXAM_PAPERS[0].id)!;
    expect(paper.questions.length).toBeGreaterThanOrEqual(5);
    for (const q of paper.questions) {
      expect(q).not.toHaveProperty('answer');
      expect(q).not.toHaveProperty('explanation');
      if ((q.kind || 'choice') === 'choice') expect(q.options?.length).toBeGreaterThanOrEqual(4);
      else expect(q).not.toHaveProperty('reference');
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

  it('★ 软考提供中高级专业筛选、近三年综合知识和上机题', () => {
    const soft = listExamPapers('软考');
    const specialties = new Set(soft.map((p) => p.softSpecialty).filter(Boolean));
    expect(specialties.has('软件设计师')).toBe(true);
    expect(specialties.has('系统架构设计师')).toBe(true);
    expect(new Set(soft.map((p) => p.year))).toEqual(new Set([2023, 2024, 2025]));
    expect(soft.some((p) => p.examLevel === '中级' && p.examFormat === '上机实操' && p.hasPractice)).toBe(true);
    expect(soft.some((p) => p.examLevel === '高级' && p.examFormat === '上机实操' && p.hasPractice)).toBe(true);
  });

  it('★ 软考综合知识卷按真实考试规模提供 75 道不重复客观题', () => {
    const theoryPapers = listExamPapers('软考').filter((p) => p.examFormat === '综合知识');
    expect(theoryPapers.length).toBeGreaterThanOrEqual(12);
    for (const summary of theoryPapers) {
      expect(summary.questionCount).toBe(75);
      const paper = getExamPaper(summary.id)!;
      expect(paper.questions).toHaveLength(75);
      expect(new Set(paper.questions.map((question) => question.id)).size).toBe(75);
      for (const question of paper.questions) {
        expect(question.options?.length).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('★ 上机题交卷后返回作答和参考要点，不进入客观题分数', () => {
    const practical = listExamPapers('软考').find((p) => p.hasPractice)!;
    const paper = getExamPaper(practical.id)!;
    const practiceQuestion = paper.questions.find((q) => q.kind === 'practice')!;
    expect(practiceQuestion).not.toHaveProperty('reference');
    const result = submitExamPaper(uid, paper.id, {}, { [practiceQuestion.id]: 'SELECT 1;' });
    expect(result.score).toBe(0);
    expect(result.details.find((d) => d.questionId === practiceQuestion.id)).toMatchObject({
      kind: 'practice',
      pickedText: 'SELECT 1;',
      correct: null,
    });
    expect(result.details.find((d) => d.questionId === practiceQuestion.id)?.reference?.length).toBeGreaterThan(10);
  });

  it('★ 软考四个专业提供自编 Markdown 清单与最新版官方书目', () => {
    expect(SOFT_MATERIALS).toHaveLength(4);
    for (const summary of SOFT_MATERIALS) {
      const detail = getSoftMaterial(summary.id)!;
      expect(detail.fileName).toMatch(/\.md$/);
      expect(detail.content).toContain('# ');
      expect(detail.content).toContain('自编学习清单');
      expect(detail.content).toContain('官方考试用书');
      expect(detail.content).toContain('不是官方教材');
      expect(detail.knowledgeDomains.length).toBeGreaterThanOrEqual(10);
      expect(detail.chapterCount).toBeGreaterThanOrEqual(50);
      expect(detail.books).toHaveLength(3);
      expect(detail.books.every((book) => /^\d{13}$/.test(book.isbn))).toBe(true);
      expect(detail.freeResources.length).toBeGreaterThanOrEqual(4);
      expect(detail.freeResources.every((resource) => resource.url.startsWith('https://'))).toBe(true);
      expect(detail.freeResources.every((resource) => resource.license.length > 2)).toBe(true);
      expect(detail.officialBooksUrl).toContain('ruankao.org.cn/book/main.html');
      expect(detail.content.length).toBeGreaterThan(1500);
      expect(detail.content).toContain('免费自学资料');
      expect(detail.content).toContain('免费自学顺序');
      expect(detail.content).toContain('怎么用');
    }
    const software = getSoftMaterial('soft_material_software_designer')!;
    expect(software.content).toContain('自编上机与案例练习');
    expect(software.freeResources.map((resource) => resource.provider).join('\n')).toContain('GitHub');
  });

  it('★ 软考官方动态：地区白名单、HTML 通知提取与缓存兜底', async () => {
    expect(SOFT_EXAM_REGIONS.length).toBeGreaterThanOrEqual(30);
    await expect(getSoftExamLiveInfo('不存在的地区')).rejects.toThrow('未知软考地区');
    const fetchMock = vi.fn(async () => new Response(
      '<html><a href="/notice/1">2027年上半年软考报名通知</a><a href="/notice/2">2027年考试安排</a></html>',
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const live = await getSoftExamLiveInfo('上海');
      expect(live.status).toBe('live');
      expect(live.registrationUrl).toContain('bm.ruankao.org.cn');
      expect(live.notices.some((n) => n.title.includes('报名通知'))).toBe(true);
      expect(live.fetchedAt).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
