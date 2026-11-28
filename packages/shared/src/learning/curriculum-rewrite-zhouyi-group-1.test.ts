import { expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSES = [
  '易学导论',
  '三易与成书',
  '经传结构',
  '底本与版本',
  '五层阅读法',
  '易学术语总表',
  '谦卦精读示范：五层阅读法入门',
] as const;

it('rewrites the T0 introduction path as reviewed evidence-based lessons', () => {
  const track = getLearningV2Subject('zhouyi')?.tracks.find((item) => item.name === 'T0 · 易学导论');
  expect(track?.courses.map((course) => course.name)).toEqual(COURSES);
  for (const name of COURSES) {
    const plan = getLearningV2CoursePlan('zhouyi', name);
    expect(plan.reviewStatus).toBe('reviewed');
    expect(plan.steps).toHaveLength(5);
    expect(plan.steps.map((step) => step.title)).toEqual([
      expect.stringMatching(/^情境与诊断｜/), expect.stringMatching(/^材料与概念｜/),
      expect.stringMatching(/^示范与推导｜/), expect.stringMatching(/^引导练习｜/),
      expect.stringMatching(/^独立迁移与评价｜/),
    ]);
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
    expect(text).toContain('前测');
    expect(text).toContain('后测');
    expect(text).toContain('现代');
    expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
    expect(plan.sourceRefs.length).toBeGreaterThanOrEqual(4);
    expect(plan.sourceRefs.filter((source) => /https?:\/\/[^\s；。]+\/.+/.test(source)).length)
      .toBeGreaterThanOrEqual(3);
    expect(plan.quiz).toHaveLength(4);
    expect(new Set(plan.quiz.map((q) => q.answer)).size).toBe(4);
    for (const q of plan.quiz) expect(q.explanation.length).toBeGreaterThanOrEqual(50);
    expect(plan.studyPoints?.some((point) => point.label === '必背')).toBe(true);
  }
});
