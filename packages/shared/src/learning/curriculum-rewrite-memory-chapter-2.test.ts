import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  '记忆宫殿：20 个词的有序提取': ['宫殿', '锚点', '路线', '动态画面', '顺序', '随机抽查'],
  '联想链：从荒诞到稳定': ['联想链', '相邻', '动作', '关系', '乱序', '干扰'],
  '分块：把长串压缩成结构': ['分块', '类别', '层次', '长串', '顺序', '完整还原'],
  '首字母与关键词法': ['首字母', '关键词', '发音', '图像', '词义', '边界'],
  '故事法：人物、动作与地点': ['故事', '人物', '动作', '地点', '情节', '顺序'],
} as const;

const REQUIRED_SOURCE = {
  '记忆宫殿：20 个词的有序提取': 'https://doi.org/10.1016/j.neuron.2017.02.003',
  '联想链：从荒诞到稳定': 'https://doi.org/10.1016/S0022-5371(70)80096-2',
  '分块：把长串压缩成结构': 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2864034/',
  '首字母与关键词法': 'https://doi.org/10.1037/tps0000023',
  '故事法：人物、动作与地点': 'https://doi.org/10.3758/BF03332778',
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 记忆训练第二章重写验收', () => {
  const chapter = getLearningV2Subject('memory')?.tracks.find(
    (track) => track.name === '记忆方法',
  );

  it('contains the five courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(Object.keys(COURSE_CONCEPTS));
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a measurable mnemonic lesson`, () => {
      const plan = getLearningV2CoursePlan('memory', courseName);
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
      expect(bodyText).toContain('24 小时');
      expect(bodyText).not.toMatch(/过目不忘|开发大脑|提升智商|永久记忆|一次记忆终身不忘/);
      expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
    });

    it(`${courseName} has traceable sources and a balanced assessment`, () => {
      const plan = getLearningV2CoursePlan('memory', courseName);

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

    it(`${courseName} marks must-remember points and includes a sourced evidence archive`, () => {
      const plan = getLearningV2CoursePlan('memory', courseName);
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
