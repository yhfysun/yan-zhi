import { expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSES = ['乾卦精读', '坤卦与文言', '卦序与序卦', '系辞上精读', '系辞下与说卦', '彖象读法'] as const;

it('rewrites the T1 classical-text path as reviewed evidence-based lessons', () => {
  const track = getLearningV2Subject('zhouyi')?.tracks.find((item) => item.name === 'T1 · 经传精读');
  expect(track?.courses.map((course) => course.name)).toEqual(COURSES);
  for (const name of COURSES) {
    const plan = getLearningV2CoursePlan('zhouyi', name);
    expect(plan.reviewStatus).toBe('reviewed');
    expect(plan.steps).toHaveLength(5);
    const text = [
      ...plan.steps.map((step) => step.body),
      ...plan.quiz.flatMap((quiz) => [quiz.prompt, quiz.explanation]),
    ].join('\n');
    for (const step of plan.steps) {
      expect(step.body.length, step.title).toBeGreaterThanOrEqual(140);
      expect(step.objective?.length, step.title).toBeGreaterThanOrEqual(20);
      expect(step.practice?.length, step.title).toBeGreaterThanOrEqual(28);
      expect(step.checkpoint?.length, step.title).toBeGreaterThanOrEqual(28);
    }
    expect(text).toContain('原文');
    expect(text).toContain('证据');
    expect(text).toContain('注');
    expect(text).toContain('前测');
    expect(text).toContain('后测');
    expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
    expect(plan.sourceRefs.length).toBeGreaterThanOrEqual(4);
    expect(plan.quiz).toHaveLength(4);
    expect(new Set(plan.quiz.map((q) => q.answer)).size).toBe(4);
    for (const q of plan.quiz) expect(q.explanation.length).toBeGreaterThanOrEqual(50);
  }
});
