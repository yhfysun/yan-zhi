import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  '新中国成立与秩序重建': ['1949', '共同纲领', '统一财经', '土地改革', '抗美援朝'],
  '社会主义改造的路径': ['1953', '互助组', '初级社', '高级社', '公私合营'],
  '探索中的成就与曲折': ['1956', '一五', '两弹一星', '信息失真', '纠错'],
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => {
    const url = new URL(rawUrl);
    return (
      ['qstheory.cn', 'gov.cn', 'dswxyjy.org.cn'].some((host) =>
        url.hostname.endsWith(host),
      )
      && url.pathname.length > 1
    );
  });
}

describe('Learning V2 党史第二章重写验收', () => {
  const subject = getLearningV2Subject('party');
  const chapter = subject?.tracks.find((track) =>
    track.name === '社会主义革命和建设',
  );

  it('contains the three courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(Object.keys(COURSE_CONCEPTS));
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a complete five-step lesson plan`, () => {
      const plan = getLearningV2CoursePlan('party', courseName);
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
        /https:\/\/(?:www\.)?(?:gov\.cn|dswxyjy\.org\.cn)\/?\s*$/m,
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
  }
});
