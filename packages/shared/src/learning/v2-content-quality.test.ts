import { describe, expect, it } from 'vitest';
import { getLearningV2Catalog, getLearningV2CoursePlan } from './v2.js';

const plans = getLearningV2Catalog().courses
  .map((course) => getLearningV2CoursePlan(course.subjectKey, course.name))
  .filter((plan) => plan.qualityStatus !== 'draft');

describe('Learning V2 reviewed-course content quality', () => {
  it('keeps every reviewed lesson body substantive and free of writing-process commentary', () => {
    const bodyOwners = new Map<string, string[]>();
    for (const plan of plans) {
      for (const step of plan.steps) {
        const key = step.body.trim();
        bodyOwners.set(key, [...(bodyOwners.get(key) || []), `${plan.subjectKey}/${plan.courseName}/${step.title}`]);
      }
    }
    const repeatedBodies = [...bodyOwners.entries()]
      .filter(([, owners]) => owners.length > 1)
      .map(([body, owners]) => ({ body: body.slice(0, 80), owners }));

    const banned = [
      '把这一步放回整课任务',
      '本步要主动避开的偏差',
      '完成本课时，不要求',
      '这不是一节',
      '先说明为什么',
      '这一页',
      '本页',
    ];
    const violations = plans.flatMap((plan) =>
      plan.steps
        .filter((step) => step.body.trim().length < 40)
        .map((step) => `${plan.subjectKey}/${plan.courseName}/${step.title}: body=${step.body.trim().length}`),
    );

    expect(violations).toEqual([]);
    expect(repeatedBodies).toEqual([]);
    for (const plan of plans) {
      for (const step of plan.steps) {
        for (const phrase of banned) {
          expect(step.body, `${plan.subjectKey}/${plan.courseName}/${step.title}`).not.toContain(phrase);
        }
      }
    }
  });
});
