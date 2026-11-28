import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  '儒家：仁、礼与君子': ['仁', '礼', '君子', '孝', '义', '修身'],
  '义利之辨：儒墨法道四路对读': ['义', '利', '兼爱', '法', '无为', '公共效用'],
  '道家：无为与自然': ['道', '无为', '自然', '齐物', '有为', '反者道之动'],
  '墨家：兼爱、非攻与尚同': ['兼爱', '非攻', '尚同', '尚贤', '节用', '三表'],
  '法家：法、术、势': ['法', '术', '势', '赏罚', '官僚', '权力'],
  '名家、阴阳家与纵横家': ['名实', '白马', '外延', '阴阳', '五行', '合纵', '连横', '利益'],
  '农家、兵家、医家与杂家': ['农家', '分工', '兵家', '情报', '条件', '医家', '整体', '杂家', '编纂', '边界'],
} as const;

const REQUIRED_SOURCE = {
  '儒家：仁、礼与君子': 'https://ctext.org/analects',
  '义利之辨：儒墨法道四路对读': 'https://plato.stanford.edu/entries/ethics-chinese/',
  '道家：无为与自然': 'https://ctext.org/dao-de-jing',
  '墨家：兼爱、非攻与尚同': 'https://ctext.org/mozi',
  '法家：法、术、势': 'https://plato.stanford.edu/entries/chinese-legalism/',
  '名家、阴阳家与纵横家': 'https://ctext.org/gongsunlongzi',
  '农家、兵家、医家与杂家': 'https://ctext.org/art-of-war',
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 百家思想第一章重写验收', () => {
  const chapter = getLearningV2Subject('schools')?.tracks.find(
    (track) => track.name === '中国诸子',
  );

  it('contains the seven courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(Object.keys(COURSE_CONCEPTS));
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a reproducible five-step close-reading lesson`, () => {
      const plan = getLearningV2CoursePlan('schools', courseName);
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

      expect(bodyText).toContain('原文');
      expect(bodyText).toMatch(/注释|注疏/);
      expect(bodyText).toContain('转述');
      expect(bodyText).toContain('反例');
      expect(bodyText).toMatch(/历史语境|时代条件/);
      expect(bodyText).toMatch(/证据|依据/);
      expect(bodyText).not.toMatch(/无需核对|只背结论|某家必然正确|所有人格相同/);
      expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
      expect(plan.studyPoints?.length).toBeGreaterThanOrEqual(3);
      expect(plan.studyPoints?.some((point) => point.label === '必背')).toBe(true);
    });

    it(`${courseName} has primary texts, scholarly aids and balanced assessment`, () => {
      const plan = getLearningV2CoursePlan('schools', courseName);

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

    it(`${courseName} includes a sourced intellectual-history archive`, () => {
      const plan = getLearningV2CoursePlan('schools', courseName);
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
