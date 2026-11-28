import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  '消费者选择与预算约束': ['预算约束', '无差异', '边际效用', '替代', '收入效应', '机会成本'],
  '企业成本与规模经济': ['固定成本', '可变成本', '边际成本', '平均成本', '规模经济', '范围经济'],
  '完全竞争与垄断': ['完全竞争', '价格接受者', '垄断', '进入壁垒', '边际收益', '市场势力'],
  '价格歧视与平台定价': ['价格歧视', '一级', '三级', '平台', '动态定价', '消费者剩余'],
  '劳动、工资与人力资本': ['劳动供给', '边际生产率', '人力资本', '补偿性工资', '议价', '工资差异'],
} as const;

const REQUIRED_SOURCE = {
  '消费者选择与预算约束': 'https://openstax.org/books/principles-economics-3e/pages/6-introduction-to-consumer-choices',
  '企业成本与规模经济': 'https://openstax.org/books/principles-economics-3e/pages/7-introduction-to-costs-and-industry-structure',
  '完全竞争与垄断': 'https://openstax.org/books/principles-economics-3e/pages/8-perfect-competition',
  '价格歧视与平台定价': 'https://openstax.org/books/principles-economics-3e/pages/9-monopoly',
  '劳动、工资与人力资本': 'https://openstax.org/books/principles-economics-3e/pages/14-introduction-to-labor-markets-and-income',
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 经济学第二章重写验收', () => {
  const chapter = getLearningV2Subject('economics')?.tracks.find(
    (track) => track.name === '微观经济学',
  );

  it('contains the five courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(Object.keys(COURSE_CONCEPTS));
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a complete five-step microeconomics lesson`, () => {
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
      expect(['concept', 'case', 'institution']).toContain(archive.kind);
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
