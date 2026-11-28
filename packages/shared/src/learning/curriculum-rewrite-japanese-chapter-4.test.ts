import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  '短文阅读：从句子到语境': ['短文', '主语', '指代', '转折', '原因', '结果', '语境', '证据', '摘要'],
  '汉字音读与训读': ['汉字', '音读', '训读', '送假名', '词形', '读音', '语境', '查词'],
  '听力：数字、时间与关键词': ['数字', '时间', '单位', '关键词', '转折', '复述', '误听', '笔记'],
  'JLPT N5 综合': ['N5', '语言知识', '阅读', '听力', '错因', '时间预算', '三天', '复测'],
  'JLPT N4 入门': ['N4', '普通形', '条件', '授受', '推测', '阅读', '听力', '错因', '复测'],
} as const;

const REQUIRED_SOURCE = {
  '短文阅读：从句子到语境': 'https://www3.nhk.or.jp/news/easy/',
  '汉字音读与训读': 'https://www.tofugu.com/japanese/how-to-learn-kanji/',
  '听力：数字、时间与关键词': 'https://www.tofugu.com/japanese-grammar/numbers-and-counters/',
  'JLPT N5 综合': 'https://www.jlpt.jp/e/about/levelsummary.html',
  'JLPT N4 入门': 'https://www.jlpt.jp/e/about/levelsummary.html',
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 日语第四章重写验收', () => {
  const chapter = getLearningV2Subject('japanese')?.tracks.find(
    (track) => track.name === '阅读与考试',
  );

  it('contains the five courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(
      Object.keys(COURSE_CONCEPTS),
    );
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a reproducible five-step Japanese reading or exam lesson`, () => {
      const plan = getLearningV2CoursePlan('japanese', courseName);
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
        expect(
          `${bodyText}\n${plan.quiz.map((item) => item.prompt).join('\n')}`,
        ).toContain(concept);
      }

      expect(bodyText).toContain('中文');
      expect(bodyText).toMatch(/听|录音|跟读|音频/);
      expect(bodyText).toMatch(/写|书写|抄写/);
      expect(bodyText).toMatch(/读|认读|朗读/);
      expect(bodyText).toContain('前测');
      expect(bodyText).toContain('后测');
      expect(bodyText).toContain('反例');
      expect(bodyText).toContain('变式');
      expect(bodyText).toMatch(/纠正|修正|纠错/);
      expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
    });

    it(`${courseName} has traceable sources and balanced assessment`, () => {
      const plan = getLearningV2CoursePlan('japanese', courseName);
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

    it(`${courseName} marks must-remember points and includes a sourced learning archive`, () => {
      const plan = getLearningV2CoursePlan('japanese', courseName);
      expect(plan.studyPoints?.length).toBeGreaterThanOrEqual(3);
      expect(plan.studyPoints?.some((point) => point.label === '必背')).toBe(true);

      expect(plan.eventDetails).toHaveLength(1);
      const archive = plan.eventDetails![0];
      expect(['event', 'concept', 'case', 'institution']).toContain(archive.kind);
      expect(archive.timeline.length).toBeGreaterThanOrEqual(6);
      expect(archive.sourceCards.length).toBeGreaterThanOrEqual(3);
      const sourceIds = new Set(archive.sourceCards.map((source) => source.id));
      for (const item of archive.timeline) {
        expect(item.body.trim().length).toBeGreaterThanOrEqual(40);
        expect(item.sourceIds.length).toBeGreaterThanOrEqual(1);
        for (const sourceId of item.sourceIds) {
          expect(sourceIds.has(sourceId)).toBe(true);
        }
      }
    });
  }
});
