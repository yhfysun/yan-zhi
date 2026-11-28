import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  '稀缺、选择与机会成本': ['稀缺', '机会成本', '边际', '激励', '取舍', '模型'],
  '供需与价格：均衡如何形成': ['需求', '供给', '均衡', '移动', '短缺', '价格'],
  '弹性：价格变化影响多大': ['弹性', '百分比', '替代品', '收入', '长期', '总收益'],
  '市场效率与外部性': ['外部性', '私人成本', '社会成本', '庇古', '科斯', '交易成本'],
  '信息不对称与市场失灵': ['逆向选择', '道德风险', '信号', '筛选', '披露', '声誉'],
} as const;

const REQUIRED_SOURCE = {
  '稀缺、选择与机会成本': 'https://openstax.org/books/principles-economics-3e/pages/1-1-what-is-economics-and-why-is-it-important',
  '供需与价格：均衡如何形成': 'https://openstax.org/books/principles-economics-3e/pages/3-introduction-to-demand-and-supply',
  '弹性：价格变化影响多大': 'https://openstax.org/books/principles-economics-3e/pages/5-introduction-to-elasticity',
  '市场效率与外部性': 'https://openstax.org/books/principles-economics-3e/pages/12-introduction-to-environmental-protection-and-negative-externalities',
  '信息不对称与市场失灵': 'https://openstax.org/books/principles-economics-3e/pages/16-introduction-to-information-risk-and-insurance',
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 经济学第一章重写验收', () => {
  const chapter = getLearningV2Subject('economics')?.tracks.find(
    (track) => track.name === '经济学基础',
  );

  it('contains the five courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(Object.keys(COURSE_CONCEPTS));
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a complete five-step economics lesson`, () => {
      const plan = getLearningV2CoursePlan('economics', courseName);
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
    });

    it(`${courseName} has traceable sources and a balanced assessment`, () => {
      const plan = getLearningV2CoursePlan('economics', courseName);
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
        expect(question.explanation.length).toBeGreaterThanOrEqual(50);
      }
    });

    it(`${courseName} includes a concept or case archive`, () => {
      const plan = getLearningV2CoursePlan('economics', courseName);
      expect(plan.eventDetails).toHaveLength(1);
      const archive = plan.eventDetails![0];
      expect(['concept', 'case']).toContain(archive.kind);
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
