import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  '建党与初心': ['五四运动', '马克思主义', '早期组织', '中共一大', '中共二大'],
  '遵义会议：转折如何发生': [
    '1935',
    '政治局扩大会议',
    '总结的决议',
    '三人团',
    '扎西会议',
    '四渡赤水',
  ],
  '全民族抗战：统一战线如何运转': [
    '西安事变',
    '1937',
    '国共合作宣言',
    '抗日民族统一战线',
    '陕甘宁边区政府',
  ],
  '解放战争：战略态势如何翻转': [
    '1946',
    '1947',
    '大别山',
    '土地改革',
    '三大战役',
  ],
} as const;

const DEEP_SOURCE_HOSTS = [
  'qstheory.cn',
  'zunyihy.cn',
  '1937china.com',
  'dswxyjy.org.cn',
  'gov.cn',
  'people.com.cn',
] as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => {
    const url = new URL(rawUrl);
    if (!DEEP_SOURCE_HOSTS.some((host) => url.hostname.endsWith(host))) return false;
    return url.pathname !== '/' && url.pathname.length > 1;
  });
}

describe('Learning V2 党史第一章重写验收', () => {
  const subject = getLearningV2Subject('party');
  const chapter = subject?.tracks.find((track) => track.name === '新民主主义革命');

  it('contains the four courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(Object.keys(COURSE_CONCEPTS));
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a complete five-step lesson plan`, () => {
      const plan = getLearningV2CoursePlan('party', courseName);
      const bodyText = plan.steps.map((step) => step.body).join('\n');

      expect(plan.reviewStatus).toBe('reviewed');
      expect(plan.steps).toHaveLength(5);
      expect(new Set(plan.steps.map((step) => step.title)).size).toBe(5);
      expect(plan.steps.map((step) => step.title)).toEqual([
        expect.stringMatching(/^情境与诊断｜/),
        expect.stringMatching(/^材料与概念｜/),
        expect.stringMatching(/^示范与推导｜/),
        expect.stringMatching(/^引导练习｜/),
        expect.stringMatching(/^独立迁移与评价｜/),
      ]);

      for (const step of plan.steps) {
        expect(step.body.trim().length, step.title).toBeGreaterThanOrEqual(120);
        expect(step.body.trim().length, step.title).toBeLessThanOrEqual(620);
        expect(step.objective?.trim().length, step.title).toBeGreaterThanOrEqual(18);
        expect(step.practice?.trim().length, step.title).toBeGreaterThanOrEqual(24);
        expect(step.checkpoint?.trim().length, step.title).toBeGreaterThanOrEqual(24);
        expect(step.note.trim().length, step.title).toBeGreaterThanOrEqual(8);
        expect(step.body, step.title).not.toMatch(/本页|本步将|学习流程|写作意图/);
      }

      for (const concept of requiredConcepts) {
        expect(`${bodyText}\n${plan.quiz.map((item) => item.prompt).join('\n')}`)
          .toContain(concept);
      }
    });

    it(`${courseName} has traceable sources and a balanced assessment`, () => {
      const plan = getLearningV2CoursePlan('party', courseName);

      expect(plan.sourceRefs.length).toBeGreaterThanOrEqual(3);
      expect(plan.sourceRefs.filter(isSpecificSource).length).toBeGreaterThanOrEqual(2);
      expect(plan.sourceRefs).toContainEqual(expect.stringContaining(
        'https://www.qstheory.cn/yaowen/2021-06/28/c_1127603704.htm',
      ));
      expect(plan.sourceRefs.join('\n')).not.toMatch(
        /https:\/\/(?:www\.)?(?:gov\.cn|dswxyjy\.org\.cn|zunyihy\.cn|1937china\.com)\/?\s*$/m,
      );

      expect(plan.quiz).toHaveLength(4);
      expect(new Set(plan.quiz.map((question) => question.focus)).size).toBe(4);
      for (const question of plan.quiz) {
        expect(question.options).toHaveLength(4);
        expect(new Set(question.options).size).toBe(4);
        expect(question.answer).toBeGreaterThanOrEqual(0);
        expect(question.answer).toBeLessThan(question.options.length);
        expect(question.explanation.length).toBeGreaterThanOrEqual(45);
      }
    });

    it(`${courseName} includes a complete event archive with source cards`, () => {
      const plan = getLearningV2CoursePlan('party', courseName);
      expect(plan.eventDetails).toHaveLength(1);
      const event = plan.eventDetails![0];

      expect(event.period.trim().length).toBeGreaterThanOrEqual(8);
      expect(event.summary.trim().length).toBeGreaterThanOrEqual(60);
      expect(event.background.trim().length).toBeGreaterThanOrEqual(70);
      expect(event.outcome.trim().length).toBeGreaterThanOrEqual(50);
      expect(event.significance.trim().length).toBeGreaterThanOrEqual(60);
      expect(event.timeline.length).toBeGreaterThanOrEqual(8);
      expect(event.sourceCards.length).toBeGreaterThanOrEqual(3);
      expect(new Set(event.sourceCards.map((source) => source.id)).size)
        .toBe(event.sourceCards.length);
      const sourceIds = new Set(event.sourceCards.map((source) => source.id));
      for (const item of event.timeline) {
        expect(item.date.trim().length).toBeGreaterThanOrEqual(4);
        expect(item.title.trim().length).toBeGreaterThanOrEqual(4);
        expect(item.body.trim().length).toBeGreaterThanOrEqual(45);
        expect(item.sourceIds.length).toBeGreaterThanOrEqual(1);
        for (const sourceId of item.sourceIds) expect(sourceIds.has(sourceId)).toBe(true);
      }
      for (const source of event.sourceCards) {
        expect(source.url).toMatch(/^https:\/\//);
        expect(source.usedFor.trim().length).toBeGreaterThanOrEqual(18);
      }
    });
  }
});
