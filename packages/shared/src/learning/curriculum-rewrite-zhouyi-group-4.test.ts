import { expect, it } from 'vitest';
import { getLearningV2CoursePlan } from './v2.js';

const COURSES = ['两派六宗', '汉易', '王弼与玄学易', '唐代注疏', '宋易', '清与近现代易学'] as const;

it('rewrites the T3 history path as reviewed lessons', () => {
  for (const name of COURSES) {
    const plan = getLearningV2CoursePlan('zhouyi', name);
    expect(plan.reviewStatus).toBe('reviewed');
    expect(plan.steps).toHaveLength(5);
    for (const step of plan.steps) {
      expect(step.body.length, `${name}/${step.title}`).toBeGreaterThanOrEqual(140);
      expect(step.objective?.length).toBeGreaterThanOrEqual(20);
      expect(step.practice?.length).toBeGreaterThanOrEqual(28);
      expect(step.checkpoint?.length).toBeGreaterThanOrEqual(28);
    }
    expect(plan.sourceRefs.length).toBeGreaterThanOrEqual(4);
    expect(plan.quiz).toHaveLength(4);
    expect(new Set(plan.quiz.map((q) => q.answer)).size).toBe(4);
    for (const q of plan.quiz) expect(q.explanation.length).toBeGreaterThanOrEqual(50);
    expect(plan.studyPoints?.some((p) => p.label === '必背')).toBe(true);
    expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
  }
});
