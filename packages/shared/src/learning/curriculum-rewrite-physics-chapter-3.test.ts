import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  '温度、热量与内能': ['温度', '热量', '内能', '比热', '平衡', '反例'],
  '热力学定律与过程': ['热力学第一定律', '热力学第二定律', '熵', '绝热', '可逆', '效率'],
  '光的波动性与粒子性': ['波', '粒子', '干涉', '光电效应', '频率', '概率'],
  '原子结构与光谱': ['能级', '跃迁', '光子', '吸收', '发射', '光谱'],
  '量子世界的第一组概念': ['量子', '波函数', '概率', '测量', '不确定性', '经典边界'],
} as const;

const REQUIRED_SOURCE = {
  '温度、热量与内能': 'https://openstax.org/books/university-physics-volume-2/pages/1-1-temperature-and-thermal-equilibrium',
  '热力学定律与过程': 'https://openstax.org/books/university-physics-volume-2/pages/3-2-work-heat-and-internal-energy',
  '光的波动性与粒子性': 'https://openstax.org/books/university-physics-volume-3/pages/6-2-photoelectric-effect',
  '原子结构与光谱': 'https://openstax.org/books/university-physics-volume-3/pages/8-1-the-hydrogen-atom',
  '量子世界的第一组概念': 'https://openstax.org/books/university-physics-volume-3/pages/6-1-blackbody-radiation',
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 物理第三章重写验收', () => {
  const chapter = getLearningV2Subject('physics')?.tracks.find(
    (track) => track.name === '热光与近代物理',
  );

  it('contains the five courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(Object.keys(COURSE_CONCEPTS));
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is an evidence-bound five-step modern physics lesson`, () => {
      const plan = getLearningV2CoursePlan('physics', courseName);
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
      expect(bodyText).toContain('变式');
      expect(bodyText).toMatch(/验证|检验/);
      expect(bodyText).toMatch(/单位|量纲/);
      expect(bodyText).not.toMatch(/无需实验|公式万能|忽略误差|只背结论|量子包治/);
      expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
    });

    it(`${courseName} has traceable sources and a balanced assessment`, () => {
      const plan = getLearningV2CoursePlan('physics', courseName);

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
      const plan = getLearningV2CoursePlan('physics', courseName);
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
