import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  '动词全本': ['原形', '过去式', '过去分词', '助动词', '时态', '语态', '搭配'],
  '名词分类': ['可数', '不可数', '单复数', '限定词', '量词', '主谓一致'],
  '动植物分类': ['类别', '栖息地', '外形', '食物', '生命周期', '单复数'],
  '生活物品': ['there be', '介词', '位置', '数量', '参照物', '用途'],
  '食物与饮品': ['可数', '量词', '份量', '菜单', '偏好', '过敏'],
  '身体与健康': ['身体部位', '症状', '询问', '建议', '就医', '边界'],
  '口语高频句': ['交际功能', '礼貌', '语调', '澄清', '修复', '追问'],
  '英语习语': ['固定搭配', '字面义', '习语义', '语境', '语域', '反例'],
  '时态必背': ['时间轴', '体貌', '一般时', '进行时', '完成时', '时态一致'],
} as const;

const REQUIRED_SOURCE = {
  '动词全本': 'https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/verbs',
  '名词分类': 'https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/nouns',
  '动植物分类': 'https://www.britannica.com/animal',
  '生活物品': 'https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/prepositions-of-place',
  '食物与饮品': 'https://learnenglish.britishcouncil.org/vocabulary/a1-a2-vocabulary/food',
  '身体与健康': 'https://learnenglish.britishcouncil.org/vocabulary/a1-a2-vocabulary/health',
  '口语高频句': 'https://learnenglish.britishcouncil.org/skills/speaking',
  '英语习语': 'https://dictionary.cambridge.org/grammar/british-grammar/idioms',
  '时态必背': 'https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/verbs',
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 英语第二章重写验收', () => {
  const chapter = getLearningV2Subject('english')?.tracks.find(
    (track) => track.name === '必背专题',
  );

  it('contains the nine courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(Object.keys(COURSE_CONCEPTS));
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a reproducible five-step language lesson`, () => {
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
        expect(`${bodyText}\n${plan.quiz.map((item) => item.prompt).join('\n')}`)
          .toContain(concept);
      }

      expect(bodyText).toContain('中文');
      expect(bodyText).toMatch(/听|音频|朗读/);
      expect(bodyText).toMatch(/写|拼写|造句/);
      expect(bodyText).toContain('前测');
      expect(bodyText).toContain('后测');
      expect(bodyText).toContain('反例');
      expect(bodyText).toContain('变式');
      expect(bodyText).toMatch(/纠正|修正|纠错/);
      expect(bodyText).not.toMatch(/只背词表|无需录音|忽略搭配|一次听清/);
      expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
    });

    it(`${courseName} has traceable sources and balanced assessment`, () => {
      const plan = getLearningV2CoursePlan('english', courseName);
      expect(plan.sourceRefs.length).toBeGreaterThanOrEqual(4);
      expect(plan.sourceRefs.filter(isSpecificSource).length).toBeGreaterThanOrEqual(3);
      expect(plan.sourceRefs.join('\n')).toContain(
        REQUIRED_SOURCE[courseName as keyof typeof REQUIRED_SOURCE],
      );
      expect(plan.quiz).toHaveLength(4);
      expect(new Set(plan.quiz.map((question) => question.focus)).size).toBe(4);
      expect(new Set(plan.quiz.map((question) => question.answer)).size).toBe(4);
      for (const question of plan.quiz) {
        expect(question.options).toHaveLength(4);
        expect(new Set(question.options).size).toBe(4);
        expect(question.explanation.length).toBeGreaterThanOrEqual(50);
      }
    });

    it(`${courseName} marks must-remember points and includes a sourced usage archive`, () => {
      const plan = getLearningV2CoursePlan('english', courseName);
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
  }
});
