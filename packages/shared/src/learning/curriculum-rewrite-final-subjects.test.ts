import { describe, expect, it } from 'vitest';
import { ALGORITHM_LESSONS } from './algorithms.js';
import { MEDICINE_LESSONS } from './medicine.js';
import { getCoursePracticeTask, getLearningV2CoursePlan } from './v2.js';

const EXPECTED_TITLES = [
  '情境与诊断',
  '材料与概念',
  '示范与推导',
  '引导练习',
  '独立迁移与评价',
];

describe('final subjects rewrite', () => {
  it.each([
    ['algorithms', ALGORITHM_LESSONS, 64],
    ['medicine', MEDICINE_LESSONS, 50],
  ] as const)('accepts every %s course through the five-step gate', (subjectKey, lessons, count) => {
    expect(lessons).toHaveLength(count);
    for (const lesson of lessons) {
      const plan = getLearningV2CoursePlan(subjectKey, lesson.courseName);
      const practice = getCoursePracticeTask(subjectKey, lesson.courseName);
      const tag = lesson.courseName;

      expect(plan.reviewStatus, tag).toBe('reviewed');
      expect(plan.qualityStatus, tag).toBe('curated');
      expect(plan.steps, tag).toHaveLength(5);
      expect(plan.steps.map((step) => step.title.split('｜')[0]), tag).toEqual(EXPECTED_TITLES);
      expect(new Set(plan.steps.map((step) => step.body)).size, tag).toBe(5);
      for (const step of plan.steps) {
        expect(step.body.length, `${tag}/${step.title}`).toBeGreaterThanOrEqual(60);
        expect(step.objective?.length ?? 0, `${tag}/${step.title}`).toBeGreaterThanOrEqual(12);
        expect(step.practice?.length ?? 0, `${tag}/${step.title}`).toBeGreaterThanOrEqual(28);
        expect(step.checkpoint?.length ?? 0, `${tag}/${step.title}`).toBeGreaterThanOrEqual(28);
      }
      expect(plan.prerequisite.length, tag).toBeGreaterThan(20);
      expect(plan.guidedPractice.length, tag).toBeGreaterThan(30);
      expect(plan.independentPractice.length, tag).toBeGreaterThan(30);
      expect(plan.commonErrors.length, tag).toBeGreaterThanOrEqual(2);
      expect(plan.sourceRefs.length, tag).toBeGreaterThanOrEqual(3);
      expect(plan.sourceRefs.filter((source) => source.includes('https://')).length, tag)
        .toBeGreaterThanOrEqual(2);
      expect(plan.studyPoints?.some((point) => point.label === '必背'), tag).toBe(true);
      expect(plan.studyPoints?.every((point) => point.stepIndex >= 0 && point.stepIndex < 5), tag)
        .toBe(true);
      expect(practice.output.length, tag).toBeGreaterThan(4);
      expect(practice.boundary.length, tag).toBeGreaterThan(8);
      expect(practice.studio.steps.length, tag).toBeGreaterThan(0);

      expect(plan.quiz.length, tag).toBeGreaterThanOrEqual(4);
      expect(new Set(plan.quiz.slice(0, 4).map((quiz) => quiz.answer)).size, tag).toBe(4);
      for (const [index, quiz] of plan.quiz.slice(0, 4).entries()) {
        expect(quiz.options, `${tag}/题${index + 1}`).toHaveLength(4);
        expect(new Set(quiz.options).size, `${tag}/题${index + 1}`).toBe(4);
        expect(quiz.answer, `${tag}/题${index + 1}`).toBeGreaterThanOrEqual(0);
        expect(quiz.answer, `${tag}/题${index + 1}`).toBeLessThan(4);
        expect(quiz.explanation.length, `${tag}/题${index + 1}`).toBeGreaterThanOrEqual(25);
        expect(quiz.focus.length, `${tag}/题${index + 1}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps runnable algorithm evidence and medical safety boundaries', () => {
    for (const lesson of ALGORITHM_LESSONS) {
      const plan = getLearningV2CoursePlan('algorithms', lesson.courseName);
      expect(plan.codeLab?.practice.id, lesson.courseName).toBeTruthy();
      expect(plan.codeLab?.apply.id, lesson.courseName).toBeTruthy();
      expect(plan.codeLab?.practice.id, lesson.courseName).not.toBe(plan.codeLab?.apply.id);
      expect(
        plan.steps.map((step) => step.body).join(' '),
        lesson.courseName,
      ).toMatch(/复杂度|正确性|输入|输出|反例|基准/);
    }
    for (const lesson of MEDICINE_LESSONS) {
      const plan = getLearningV2CoursePlan('medicine', lesson.courseName);
      const allText = [
        plan.plainLanguageGoal,
        plan.independentPractice,
        ...plan.commonErrors,
        ...plan.sourceRefs,
        ...plan.studyPoints!.map((point) => point.text),
        ...plan.steps.flatMap((step) => [
          step.body,
          step.objective ?? '',
          step.practice ?? '',
          step.checkpoint ?? '',
        ]),
      ].join(' ');
      expect(allText, lesson.courseName).toMatch(/诊断|处方|急救|专业|就医/);
      expect(allText, lesson.courseName).toMatch(/危险信号|急症|红线|专业帮助/);
    }
  });
});
