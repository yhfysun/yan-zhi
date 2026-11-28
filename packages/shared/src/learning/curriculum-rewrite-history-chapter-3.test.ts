import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  '古代文明与区域网络': ['区域文明', '河流', '贸易', '帝国', '宗教', '网络'],
  '大航海与全球贸易': ['大航海', '航海技术', '殖民', '白银', '奴隶贸易', '全球贸易'],
  '工业革命与社会转型': ['工业革命', '蒸汽', '煤炭', '工厂', '城市化', '社会转型'],
  '两次世界大战与秩序重建': ['一战', '二战', '殖民', '大屠杀', '联合国', '秩序'],
  '冷战与当代全球化': ['冷战', '核威慑', '去殖民化', '全球化', '供应链', '国际组织'],
} as const;

const REQUIRED_SOURCE = {
  '古代文明与区域网络': 'https://en.unesco.org/silkroad/',
  '大航海与全球贸易': 'https://www.britannica.com/event/Age-of-Exploration',
  '工业革命与社会转型': 'https://www.sciencemuseum.org.uk/objects-and-stories/industrial-revolution',
  '两次世界大战与秩序重建': 'https://www.iwm.org.uk/history/first-world-war',
  '冷战与当代全球化': 'https://history.state.gov/milestones/1989-1992/fall-of-communism',
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 历史第三章重写验收', () => {
  const chapter = getLearningV2Subject('history')?.tracks.find(
    (track) => track.name === '世界史',
  );

  it('contains the five courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(Object.keys(COURSE_CONCEPTS));
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a complete five-step world-history lesson`, () => {
      const plan = getLearningV2CoursePlan('history', courseName);
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
      const plan = getLearningV2CoursePlan('history', courseName);

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

    it(`${courseName} includes a sourced global event or concept archive`, () => {
      const plan = getLearningV2CoursePlan('history', courseName);
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
