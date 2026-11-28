import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  大学英语四级: [
    '听力场景',
    '长篇阅读',
    '同义表达',
    '仔细阅读',
    '推理边界',
    '汉译英',
    '句法重组',
    '限时写作',
  ],
  大学英语六级: [
    '学术语篇',
    '推断题',
    '转折结构',
    '作者态度',
    '汉译英',
    '信息顺序',
    '限时输出',
    '修改顺序',
  ],
} as const;

const OFFICIAL_CET_SOURCE = 'https://cet.neea.edu.cn/';

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 英语第五章重写验收', () => {
  const chapter = getLearningV2Subject('english')?.tracks.find(
    (track) => track.name === '大学',
  );

  it('contains the two courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(
      Object.keys(COURSE_CONCEPTS),
    );
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a reproducible five-step university English lesson`, () => {
      const plan = getLearningV2CoursePlan('english', courseName);
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
      expect(bodyText).toMatch(/听|朗读|音频/);
      expect(bodyText).toMatch(/读|阅读/);
      expect(bodyText).toMatch(/写|短文|摘要|翻译/);
      expect(bodyText).toContain('前测');
      expect(bodyText).toContain('后测');
      expect(bodyText).toContain('反例');
      expect(bodyText).toContain('变式');
      expect(bodyText).toMatch(/纠正|修正|纠错/);
      expect(bodyText).not.toMatch(/只背词表|无需修改|一次写对|逐词翻译即可/);
      expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
    });

    it(`${courseName} has traceable sources and balanced assessment`, () => {
      const plan = getLearningV2CoursePlan('english', courseName);
      expect(plan.sourceRefs.length).toBeGreaterThanOrEqual(5);
      expect(plan.sourceRefs.filter(isSpecificSource).length).toBeGreaterThanOrEqual(4);
      expect(plan.sourceRefs.join('\n')).toContain(OFFICIAL_CET_SOURCE);
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
      const plan = getLearningV2CoursePlan('english', courseName);
      expect(plan.studyPoints?.length).toBeGreaterThanOrEqual(3);
      expect(plan.studyPoints?.some((point) => point.label === '必背')).toBe(true);

      expect(plan.eventDetails).toHaveLength(1);
      const archive = plan.eventDetails![0];
      expect(['event', 'concept', 'case', 'institution']).toContain(archive.kind);
      expect(archive.timeline.length).toBeGreaterThanOrEqual(6);
      expect(archive.sourceCards.length).toBeGreaterThanOrEqual(4);
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
