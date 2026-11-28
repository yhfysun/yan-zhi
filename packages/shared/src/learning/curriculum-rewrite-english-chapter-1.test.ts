import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_NAME = '字母与音标';
const REQUIRED_SOURCE = 'https://www.internationalphoneticassociation.org/content/ipa-chart';

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 英语第一章重写验收', () => {
  const chapter = getLearningV2Subject('english')?.tracks.find(
    (track) => track.name === '启蒙',
  );

  it('contains the foundation course in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual([COURSE_NAME]);
  });

  it('is a measurable five-step pronunciation lesson', () => {
    const plan = getLearningV2CoursePlan('english', COURSE_NAME);
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

    for (const concept of [
      '字母名称',
      '音素',
      '音标',
      '最小对立',
      '重音',
      '连读',
      '中文',
      '听辨',
      '朗读',
      '录音',
      '拼写',
    ]) {
      expect(`${bodyText}\n${plan.quiz.map((item) => item.prompt).join('\n')}`)
        .toContain(concept);
    }

    expect(bodyText).toContain('前测');
    expect(bodyText).toContain('后测');
    expect(bodyText).toContain('反例');
    expect(bodyText).toContain('变式');
    expect(bodyText).toMatch(/回听|回放/);
    expect(bodyText).toMatch(/纠正|修正/);
    expect(bodyText).not.toMatch(/中文谐音足够|听一遍就会|无需录音|只背音标符号/);
    expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
  });

  it('has traceable pronunciation sources and balanced assessment', () => {
    const plan = getLearningV2CoursePlan('english', COURSE_NAME);

    expect(plan.sourceRefs.length).toBeGreaterThanOrEqual(4);
    expect(plan.sourceRefs.filter(isSpecificSource).length).toBeGreaterThanOrEqual(3);
    expect(plan.sourceRefs.join('\n')).toContain(REQUIRED_SOURCE);
    expect(plan.quiz).toHaveLength(4);
    expect(new Set(plan.quiz.map((question) => question.focus)).size).toBe(4);
    expect(new Set(plan.quiz.map((question) => question.answer)).size).toBe(4);
    for (const question of plan.quiz) {
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options).size).toBe(4);
      expect(question.explanation.length).toBeGreaterThanOrEqual(50);
    }
  });

  it('marks must-remember points and includes a sourced language-history archive', () => {
    const plan = getLearningV2CoursePlan('english', COURSE_NAME);
    expect(plan.studyPoints?.length).toBeGreaterThanOrEqual(3);
    expect(plan.studyPoints?.some((point) => point.label === '必背')).toBe(true);

    expect(plan.eventDetails).toHaveLength(1);
    const archive = plan.eventDetails![0];
    expect(['event', 'concept', 'case', 'institution']).toContain(archive.kind);
    expect(archive.timeline.length).toBeGreaterThanOrEqual(6);
    expect(archive.sourceCards.length).toBeGreaterThanOrEqual(3);

    const sourceIds = new Set(archive.sourceCards.map((source) => source.id));
    for (const item of archive.timeline) {
      expect(item.body.trim().length).toBeGreaterThanOrEqual(40);
      expect(item.sourceIds.length).toBeGreaterThanOrEqual(1);
      for (const sourceId of item.sourceIds) expect(sourceIds.has(sourceId)).toBe(true);
    }
  });
});
