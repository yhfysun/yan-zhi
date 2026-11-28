import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  '英语词汇：词根与例句双钩': ['词根', '词缀', '例句', '语境', '词性', '24 小时'],
  '历史年代：时间轴与因果链': ['年代', '时间轴', '因果', '史料', '前后', '迁移'],
  '数学公式：条件与图像': ['公式', '条件', '图像', '变量', '单位', '变式'],
  '法条与规范：场景化检索': ['法条', '构成要件', '案例', '场景', '例外', '检索'],
} as const;

const REQUIRED_SOURCE = {
  '英语词汇：词根与例句双钩': 'https://doi.org/10.3102/0034654309359353',
  '历史年代：时间轴与因果链': 'https://sheg.stanford.edu/historical-thinking-chart',
  '数学公式：条件与图像': 'https://openstax.org/books/college-algebra-2e/pages/3-5-transformation-of-functions',
  '法条与规范：场景化检索': 'https://doi.org/10.1177/2322005818780754',
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 记忆训练第三章重写验收', () => {
  const chapter = getLearningV2Subject('memory')?.tracks.find(
    (track) => track.name === '学科迁移',
  );

  it('contains the four courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(Object.keys(COURSE_CONCEPTS));
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a measurable subject-transfer lesson`, () => {
      const plan = getLearningV2CoursePlan('memory', courseName);
      const bodyText = plan.steps.map((step) => step.body).join('\n');

      expect(plan.reviewStatus).toBe('reviewed');
      expect(plan.steps).toHaveLength(5);
      expect(plan.steps.map((step) => step.title)).toEqual([
        expect.stringMatching(/^情境与诊断｜/),
        expect.stringMatching(/^材料与概念｜/),
        expect.stringMatching(/^示范与推导｜/),
        expect.stringMatching(/^引导练习｜/),
        expect.stringMatching(/^独立迁移与评价｜/),
      ]);

      for (const step of plan.steps) {
        expect(step.body.trim().length, step.title).toBeGreaterThanOrEqual(140);
        expect(step.body.trim().length, step.title).toBeLessThanOrEqual(650);
        expect(step.objective?.trim().length, step.title).toBeGreaterThanOrEqual(20);
        expect(step.practice?.trim().length, step.title).toBeGreaterThanOrEqual(28);
        expect(step.checkpoint?.trim().length, step.title).toBeGreaterThanOrEqual(28);
        expect(step.note.trim().length, step.title).toBeGreaterThanOrEqual(8);
        expect(step.body, step.title).not.toMatch(/本页|本步将|学习流程|写作意图/);
      }

      for (const concept of requiredConcepts) {
        expect(`${bodyText}\n${plan.quiz.map((item) => item.prompt).join('\n')}`)
          .toContain(concept);
      }

      expect(bodyText).toContain('前测');
      expect(bodyText).toContain('后测');
      expect(bodyText).toContain('24 小时');
      expect(bodyText).not.toMatch(/过目不忘|开发大脑|提升智商|永久记忆|一次记忆终身不忘/);
      expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
    });

    it(`${courseName} has traceable sources and a balanced assessment`, () => {
      const plan = getLearningV2CoursePlan('memory', courseName);

      expect(plan.sourceRefs.length).toBeGreaterThanOrEqual(3);
      expect(plan.sourceRefs.filter(isSpecificSource).length).toBeGreaterThanOrEqual(2);
      expect(plan.sourceRefs.join('\n')).toContain(
        REQUIRED_SOURCE[courseName as keyof typeof REQUIRED_SOURCE],
      );
      expect(plan.quiz).toHaveLength(4);
      expect(new Set(plan.quiz.map((question) => question.focus)).size).toBe(4);
      for (const question of plan.quiz) {
        expect(question.options).toHaveLength(4);
        expect(new Set(question.options).size).toBe(4);
        expect(question.answer).toBeGreaterThanOrEqual(0);
        expect(question.answer).toBeLessThan(question.options.length);
        expect(question.explanation.length).toBeGreaterThanOrEqual(50);
      }
    });

    it(`${courseName} marks must-remember points and includes a sourced transfer archive`, () => {
      const plan = getLearningV2CoursePlan('memory', courseName);
      expect(plan.studyPoints?.length).toBeGreaterThanOrEqual(2);
      expect(plan.studyPoints?.some((point) => point.label === '必背')).toBe(true);

      expect(plan.eventDetails).toHaveLength(1);
      const archive = plan.eventDetails![0];
      expect(['concept', 'experiment', 'case']).toContain(archive.kind);
      expect(archive.timeline.length).toBeGreaterThanOrEqual(6);
      expect(archive.sourceCards.length).toBeGreaterThanOrEqual(3);

      const sourceIds = new Set(archive.sourceCards.map((source) => source.id));
      for (const item of archive.timeline) {
        expect(item.body.trim().length).toBeGreaterThanOrEqual(40);
        expect(item.sourceIds.length).toBeGreaterThanOrEqual(1);
        for (const sourceId of item.sourceIds) expect(sourceIds.has(sourceId)).toBe(true);
      }
    });
  }
});
