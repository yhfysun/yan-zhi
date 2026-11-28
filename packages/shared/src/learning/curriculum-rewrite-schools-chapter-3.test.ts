import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  '义与利：动机和公共后果': ['义', '利', '动机', '后果', '公共效用', '权利'],
  '礼与法：秩序如何可能': ['礼', '法', '秩序', '正当性', '强制', '问责'],
  '自然与人为：技术时代的边界': ['自然', '人为', '技术', '反噬', '风险', '边界'],
  '权力与自由：谁来判断正当': ['权力', '自由', '正当性', '同意', '法治', '非支配'],
  '知识与无知：如何知道我们知道': ['知识', '证据', '证言', '无知', '认知不正义', '置信'],
  '平等与差异：正义的两种入口': ['平等', '差异', '分配', '能力', '正义', '弱势'],
} as const;

const REQUIRED_SOURCE = {
  '义与利：动机和公共后果': 'https://plato.stanford.edu/entries/ethics-chinese/',
  '礼与法：秩序如何可能': 'https://plato.stanford.edu/entries/rule-of-law/',
  '自然与人为：技术时代的边界': 'https://plato.stanford.edu/entries/ethics-computer/',
  '权力与自由：谁来判断正当': 'https://plato.stanford.edu/entries/liberty-positive-negative/',
  '知识与无知：如何知道我们知道': 'https://plato.stanford.edu/entries/epistemology/',
  '平等与差异：正义的两种入口': 'https://plato.stanford.edu/entries/equality/',
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 百家思想第三章重写验收', () => {
  const chapter = getLearningV2Subject('schools')?.tracks.find(
    (track) => track.name === '专题对读',
  );

  it('contains the six courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(Object.keys(COURSE_CONCEPTS));
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a reproducible five-step comparative seminar`, () => {
      const plan = getLearningV2CoursePlan('schools', courseName);
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

      expect(bodyText).toMatch(/原典|一手/);
      expect(bodyText).toContain('比较');
      expect(bodyText).toContain('反例');
      expect(bodyText).toMatch(/来源|证据/);
      expect(bodyText).toMatch(/边界|适用范围/);
      expect(bodyText).not.toMatch(/无需核对|只背结论|一方必然正确|所有价值完全相同/);
      expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
      expect(plan.studyPoints?.length).toBeGreaterThanOrEqual(3);
      expect(plan.studyPoints?.some((point) => point.label === '必背')).toBe(true);
    });

    it(`${courseName} has traceable sources and balanced assessment`, () => {
      const plan = getLearningV2CoursePlan('schools', courseName);
      expect(plan.sourceRefs.length).toBeGreaterThanOrEqual(4);
      expect(plan.sourceRefs.filter(isSpecificSource).length).toBeGreaterThanOrEqual(3);
      expect(plan.sourceRefs.join('\n')).toContain(
        REQUIRED_SOURCE[courseName as keyof typeof REQUIRED_SOURCE],
      );
      expect(plan.quiz).toHaveLength(4);
      expect(new Set(plan.quiz.map((question) => question.focus)).size).toBe(4);
      expect(new Set(plan.quiz.map((question) => question.answer)).size).toBe(4);
      for (const question of plan.quiz) {
        expect(question.options).toHaveLength(4);
        expect(new Set(question.options).size).toBe(4);
        expect(question.explanation.length).toBeGreaterThanOrEqual(50);
      }
    });

    it(`${courseName} includes a sourced comparative archive`, () => {
      const plan = getLearningV2CoursePlan('schools', courseName);
      expect(plan.eventDetails).toHaveLength(1);
      const archive = plan.eventDetails![0];
      expect(['event', 'concept', 'case', 'institution']).toContain(archive.kind);
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
