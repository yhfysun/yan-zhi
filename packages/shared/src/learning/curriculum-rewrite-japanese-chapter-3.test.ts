import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  自我介绍与问候: ['はじめまして', '姓名', '身份', '问候', '追问', '澄清', '语域'],
  '购物、点餐与交通': ['购物', '点餐', '交通', '数量', '价格', '请求', '确认', '方向', '结账'],
  '时间、日期与预约': ['时间', '日期', '预约', '时刻', '量词', '可用', '不可用', '改约'],
  常用敬语与礼貌表达: ['敬语', '尊敬语', '谦让语', '丁宁语', '请求', '道歉', '拒绝', '关系', '边界'],
} as const;

const REQUIRED_SOURCE = {
  自我介绍与问候: 'https://www.nhk.or.jp/lesson/',
  '购物、点餐与交通': 'https://www.nhk.or.jp/lesson/',
  '时间、日期与预约': 'https://www.tofugu.com/japanese-grammar/numbers-and-counters/',
  常用敬语与礼貌表达: 'https://www.tofugu.com/japanese/keigo/',
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 日语第三章重写验收', () => {
  const chapter = getLearningV2Subject('japanese')?.tracks.find(
    (track) => track.name === '场景实践',
  );

  it('contains the four courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(
      Object.keys(COURSE_CONCEPTS),
    );
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a reproducible five-step Japanese scenario lesson`, () => {
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
