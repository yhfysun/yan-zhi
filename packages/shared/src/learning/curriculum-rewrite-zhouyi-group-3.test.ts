import { expect, it } from 'vitest';
import { getLearningV2CoursePlan } from './v2.js';

const COURSES = [
  '阴阳爻位',
  '八卦基础',
  '六十四卦',
  '五行',
  '干支甲子',
  '大衍筮法',
  '《说卦传》第一至三章精读：立卦生爻',
] as const;

it('rewrites the T2 symbolic foundations path as reviewed lessons', () => {
  for (const name of COURSES) {
    const plan = getLearningV2CoursePlan('zhouyi', name);
    expect(plan.reviewStatus).toBe('reviewed');
    expect(plan.steps).toHaveLength(5);
    expect(plan.steps.map((step) => step.title)).toEqual([
      expect.stringMatching(/^情境与诊断｜/),
      expect.stringMatching(/^材料与概念｜/),
      expect.stringMatching(/^示范与推导｜/),
      expect.stringMatching(/^引导练习｜/),
      expect.stringMatching(/^独立迁移与评价｜/),
    ]);
    const text = plan.steps.map((step) => step.body).join('\n');
    for (const step of plan.steps) {
      expect(step.body.length, step.title).toBeGreaterThanOrEqual(140);
      expect(step.objective?.length, step.title).toBeGreaterThanOrEqual(20);
      expect(step.practice?.length, step.title).toBeGreaterThanOrEqual(28);
      expect(step.checkpoint?.length, step.title).toBeGreaterThanOrEqual(28);
    }
    expect(text).toContain('证据');
    expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
    expect(plan.sourceRefs.length).toBeGreaterThanOrEqual(4);
    expect(plan.quiz).toHaveLength(4);
    expect(new Set(plan.quiz.map((q) => q.answer)).size).toBe(4);
    for (const q of plan.quiz) expect(q.explanation.length).toBeGreaterThanOrEqual(50);
    expect(plan.studyPoints?.some((p) => p.label === '必背')).toBe(true);
  }
});
