import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  '古希腊：德性与城邦': ['苏格拉底', '柏拉图', '亚里士多德', '德性', '城邦', '正义', '幸福'],
  '印度思想：正法、业与解脱': ['正法', '业', '轮回', '解脱', '奥义书', '佛教', '不二论'],
  '启蒙：理性、自由与进步': ['启蒙', '理性', '自由', '进步', '公共领域', '康德', '批判'],
  '德国古典：康德、黑格尔': ['康德', '黑格尔', '先验', '物自体', '绝对精神', '辩证法', '自由'],
  '自由主义、社会主义与保守主义': ['自由', '平等', '产权', '市场', '福利', '传统', '共同体', '革命'],
  '存在主义、实用主义与分析哲学': ['存在主义', '实用主义', '分析哲学', '存在', '意义', '真理', '语言', '公共理性'],
} as const;

const REQUIRED_SOURCE = {
  '古希腊：德性与城邦': 'https://plato.stanford.edu/entries/plato/',
  '印度思想：正法、业与解脱': 'https://iep.utm.edu/hindu-ph/',
  '启蒙：理性、自由与进步': 'https://plato.stanford.edu/entries/enlightenment/',
  '德国古典：康德、黑格尔': 'https://plato.stanford.edu/entries/kant/',
  '自由主义、社会主义与保守主义': 'https://plato.stanford.edu/entries/liberalism/',
  '存在主义、实用主义与分析哲学': 'https://plato.stanford.edu/entries/existentialism/',
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 百家思想第二章重写验收', () => {
  const chapter = getLearningV2Subject('schools')?.tracks.find(
    (track) => track.name === '世界思想',
  );

  it('contains the six courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(Object.keys(COURSE_CONCEPTS));
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a reproducible five-step comparative lesson`, () => {
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
      expect(bodyText).toContain('解释');
      expect(bodyText).toContain('比较');
      expect(bodyText).toContain('反例');
      expect(bodyText).toMatch(/历史语境|时代条件/);
      expect(bodyText).not.toMatch(/无需核对|只背代表人物|某家必然正确|所有传统完全相同/);
      expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
      expect(plan.studyPoints?.length).toBeGreaterThanOrEqual(3);
      expect(plan.studyPoints?.some((point) => point.label === '必背')).toBe(true);
    });

    it(`${courseName} has primary texts, scholarly aids and balanced assessment`, () => {
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

    it(`${courseName} includes a sourced intellectual-history archive`, () => {
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
