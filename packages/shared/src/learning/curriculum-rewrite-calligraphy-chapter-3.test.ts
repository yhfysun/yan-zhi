import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  '赵孟頫《洛神赋》行楷': ['洛神赋', '赵孟頫', '行楷', '连带', '匀称', '行气'],
  '赵孟頫《赤壁赋》行楷': ['赤壁赋', '赵孟頫', '行楷', '节奏', '收放', '行气'],
  '王羲之《兰亭序》行书': ['兰亭序', '王羲之', '行书', '变化', '行气', '临摹'],
  '颜真卿《祭侄文稿》行书': ['祭侄文稿', '颜真卿', '行书', '悲愤', '涂改', '节奏'],
  '苏轼《黄州寒食帖》行书': ['寒食帖', '苏轼', '行书', '结构', '墨色', '情绪'],
  '米芾《蜀素帖》行书': ['蜀素帖', '米芾', '行书', '欹侧', '用笔', '章法'],
} as const;

const REQUIRED_SOURCE = {
  '赵孟頫《洛神赋》行楷': 'https://www.dpm.org.cn/collection/',
  '赵孟頫《赤壁赋》行楷': 'https://www.dpm.org.cn/collection/',
  '王羲之《兰亭序》行书': 'https://www.metmuseum.org/toah/hd/chcl/hd_chcl.htm',
  '颜真卿《祭侄文稿》行书': 'https://www.britannica.com/art/calligraphy',
  '苏轼《黄州寒食帖》行书': 'https://www.dpm.org.cn/collection/',
  '米芾《蜀素帖》行书': 'https://www.metmuseum.org/toah/hd/chcl/hd_chcl.htm',
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 书法第三章重写验收', () => {
  const chapter = getLearningV2Subject('calligraphy')?.tracks.find(
    (track) => track.name === '行楷与行书 · 经典临摹',
  );

  it('contains the six courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(Object.keys(COURSE_CONCEPTS));
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a complete five-step running-script lesson`, () => {
      const plan = getLearningV2CoursePlan('calligraphy', courseName);
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
    });

    it(`${courseName} has traceable sources and a balanced assessment`, () => {
      const plan = getLearningV2CoursePlan('calligraphy', courseName);

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

    it(`${courseName} includes a sourced manuscript archive`, () => {
      const plan = getLearningV2CoursePlan('calligraphy', courseName);
      expect(plan.eventDetails).toHaveLength(1);
      const archive = plan.eventDetails![0];
      expect(['concept', 'case', 'institution']).toContain(archive.kind);
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
