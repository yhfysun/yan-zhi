import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  '反馈回路：为什么越用力越糟': ['反馈', '回路', '存量', '流量', '延迟', '增强'],
  '延迟效应与短期指标': ['延迟', '短期', '指标', '滞后', '趋势', '反例'],
  '约束如何激发创造': ['约束', '目标', '限制', '选项', '结构', '创造'],
  '类比迁移：借结构不借表面': ['类比', '结构', '映射', '表面', '迁移', '反例'],
} as const;

const REQUIRED_SOURCE = {
  '反馈回路：为什么越用力越糟': 'https://doi.org/10.4324/9781849773386-8',
  '延迟效应与短期指标': 'https://doi.org/10.2105/AJPH.2005.066043',
  '约束如何激发创造': 'https://doi.org/10.1037/1931-3896.1.2.107',
  '类比迁移：借结构不借表面': 'https://doi.org/10.1016/0010-0285(83)90002-6',
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 思维训练第四章重写验收', () => {
  const chapter = getLearningV2Subject('thinking')?.tracks.find(
    (track) => track.name === '系统与创造',
  );

  it('contains the four courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(Object.keys(COURSE_CONCEPTS));
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a measurable five-step systems lesson`, () => {
      const plan = getLearningV2CoursePlan('thinking', courseName);
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
        expect(`${bodyText}\n${plan.quiz.map((item) => item.prompt).join('\n')}`)
          .toContain(concept);
      }

      expect(bodyText).toContain('前测');
      expect(bodyText).toContain('后测');
      expect(bodyText).toContain('反例');
      expect(bodyText).not.toMatch(/万能方法|绝对预测|不需要验证|永远创新/);
      expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
    });

    it(`${courseName} has traceable sources and a balanced assessment`, () => {
      const plan = getLearningV2CoursePlan('thinking', courseName);

      expect(plan.sourceRefs.length).toBeGreaterThanOrEqual(3);
      expect(plan.sourceRefs.filter(isSpecificSource).length).toBeGreaterThanOrEqual(2);
      expect(plan.sourceRefs.join('\n')).toContain(
        REQUIRED_SOURCE[courseName as keyof typeof REQUIRED_SOURCE],
      );
      expect(plan.quiz).toHaveLength(4);
      expect(new Set(plan.quiz.map((question) => question.focus)).size).toBe(4);
      for (const question of plan.quiz) {
        expect(question.options).toHaveLength(4);
        expect(new Set(question.options).size).toBe(4);
        expect(question.answer).toBeGreaterThanOrEqual(0);
        expect(question.answer).toBeLessThan(question.options.length);
        expect(question.explanation.length).toBeGreaterThanOrEqual(50);
      }
    });

    it(`${courseName} marks must-remember points and includes a sourced system archive`, () => {
      const plan = getLearningV2CoursePlan('thinking', courseName);
      expect(plan.studyPoints?.length).toBeGreaterThanOrEqual(2);
      expect(plan.studyPoints?.some((point) => point.label === '必背')).toBe(true);

      expect(plan.eventDetails).toHaveLength(1);
      const archive = plan.eventDetails![0];
      expect(['concept', 'experiment', 'case']).toContain(archive.kind);
      expect(archive.timeline.length).toBeGreaterThanOrEqual(6);
      expect(archive.sourceCards.length).toBeGreaterThanOrEqual(3);

      const sourceIds = new Set(archive.sourceCards.map((source) => source.id));
      for (const item of archive.timeline) {
        expect(item.body.trim().length).toBeGreaterThanOrEqual(40);
        expect(item.sourceIds.length).toBeGreaterThanOrEqual(1);
        for (const sourceId of item.sourceIds) expect(sourceIds.has(sourceId)).toBe(true);
      }
    });
  }
});
