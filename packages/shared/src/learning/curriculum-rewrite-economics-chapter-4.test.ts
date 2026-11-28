import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  '古典经济学与看不见的手': ['分工', '市场范围', '看不见的手', '价格信号', '产权', '政府'],
  '马克思、边际革命与凯恩斯': ['劳动价值', '剩余价值', '边际效用', '有效需求', '不确定性', '危机'],
  '新古典、制度与行为经济学': ['理性预期', '制度', '交易成本', '有限理性', '默认选项', '执行'],
  '不平等、平台经济与全球化': ['收入', '财富', '基尼', '平台', '网络效应', '全球价值链'],
  '气候、金融风险与公共政策': ['外部性', '贴现', '碳定价', '转型风险', '披露', '系统性风险'],
} as const;

const REQUIRED_SOURCE = {
  '古典经济学与看不见的手': 'https://www.gutenberg.org/ebooks/3300',
  '马克思、边际革命与凯恩斯': 'https://www.marxists.org/archive/marx/works/1867-c1/',
  '新古典、制度与行为经济学': 'https://plato.stanford.edu/entries/behavioral-economics/',
  '不平等、平台经济与全球化': 'https://wid.world/',
  '气候、金融风险与公共政策': 'https://www.ipcc.ch/',
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 经济学第四章重写验收', () => {
  const chapter = getLearningV2Subject('economics')?.tracks.find(
    (track) => track.name === '经济思想与专题',
  );

  it('contains the five courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(Object.keys(COURSE_CONCEPTS));
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a complete five-step economics lesson`, () => {
      const plan = getLearningV2CoursePlan('economics', courseName);
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
      const plan = getLearningV2CoursePlan('economics', courseName);
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
        expect(question.explanation.length).toBeGreaterThanOrEqual(50);
      }
    });

    it(`${courseName} includes a concept or case archive`, () => {
      const plan = getLearningV2CoursePlan('economics', courseName);
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
