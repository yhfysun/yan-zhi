import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  '二次函数：参数如何改变图像': ['顶点', '对称轴', '开口', '参数', '配方', '反例'],
  '三角函数的周期与相位': ['振幅', '周期', '相位', '频率', '图像', '定义域'],
  '数列：递推与通项': ['数列', '递推', '通项', '首项', '单调', '归纳'],
  '解析几何：方程与图形': ['坐标', '方程', '轨迹', '距离', '焦点', '图形'],
  '导数：变化率的局部语言': ['导数', '极限', '瞬时', '切线', '平均变化率', '局部'],
  '概率统计：证据与不确定性': ['总体', '样本', '变异性', '概率', '估计', '证据'],
} as const;

const REQUIRED_SOURCE = {
  '二次函数：参数如何改变图像': 'https://openstax.org/books/college-algebra-2e/pages/5-1-quadratic-functions',
  '三角函数的周期与相位': 'https://openstax.org/books/precalculus-2e/pages/6-1-graphs-of-the-sine-and-cosine-functions',
  '数列：递推与通项': 'https://openstax.org/books/college-algebra-2e/pages/9-1-sequences-and-their-notations',
  '解析几何：方程与图形': 'https://openstax.org/books/college-algebra-2e/pages/8-1-the-ellipse',
  '导数：变化率的局部语言': 'https://openstax.org/books/calculus-volume-1/pages/3-1-defining-the-derivative',
  '概率统计：证据与不确定性': 'https://openstax.org/books/introductory-statistics-2e/pages/1-1-definitions-of-statistics-probability-and-key-terms',
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 数学第二章重写验收', () => {
  const chapter = getLearningV2Subject('math')?.tracks.find(
    (track) => track.name === '高中核心',
  );

  it('contains the six courses in the required chapter order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(Object.keys(COURSE_CONCEPTS));
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a derived five-step high-school mathematics lesson`, () => {
      const plan = getLearningV2CoursePlan('math', courseName);
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
      expect(bodyText).not.toMatch(/公式万能|不用检验|只背答案|无需推导/);
      expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
    });

    it(`${courseName} has traceable sources and a balanced assessment`, () => {
      const plan = getLearningV2CoursePlan('math', courseName);

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

    it(`${courseName} marks must-remember points and includes a sourced derivation archive`, () => {
      const plan = getLearningV2CoursePlan('math', courseName);
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
