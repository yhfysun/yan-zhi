import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  软件设计师: ['软件生命周期', '需求', '数据流图', 'UML', '数据库', '算法', '复杂度', '设计模式', '测试', '案例'],
  网络工程师: ['OSI', 'TCP/IP', 'IPv4', '子网', '路由', '交换', 'VLAN', 'DNS', 'HTTP', '故障'],
  系统架构设计师: ['质量属性', '质量场景', '架构风格', 'ATAM', '分层', '微服务', '事件驱动', '高可用', '权衡'],
  系统分析师: ['业务需求', '利益相关者', '可行性', '需求工程', '用例', '数据建模', '业务价值', '变更', '证据'],
} as const;

const REQUIRED_SOURCE = {
  软件设计师: 'https://www.ruankao.org.cn/',
  网络工程师: 'https://www.rfc-editor.org/rfc/rfc9110.html',
  系统架构设计师: 'https://sre.google/sre-book/table-of-contents/',
  系统分析师: 'https://www.ruankao.org.cn/',
} as const;

function sourceUrls(source: string): string[] {
  return [...source.matchAll(/https?:\/\/[^\s；。]+/g)].map((match) =>
    match[0].replace(/[),，。；]+$/, ''),
  );
}

function isSpecificSource(source: string): boolean {
  return sourceUrls(source).some((rawUrl) => new URL(rawUrl).pathname.length > 1);
}

describe('Learning V2 软考整科重写验收', () => {
  const chapter = getLearningV2Subject('soft')?.tracks.find(
    (track) => track.name === '软考',
  );

  it('contains the four exam directions in the required order', () => {
    expect(chapter?.courses.map((course) => course.name)).toEqual(
      Object.keys(COURSE_CONCEPTS),
    );
  });

  for (const [courseName, requiredConcepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is a reproducible five-step exam case lesson`, () => {
      const plan = getLearningV2CoursePlan('soft', courseName);
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

      expect(bodyText).toContain('案例');
      expect(bodyText).toContain('证据');
      expect(bodyText).toMatch(/计算|度量|推导/);
      expect(bodyText).toMatch(/权衡|比较|边界/);
      expect(bodyText).toContain('前测');
      expect(bodyText).toContain('后测');
      expect(bodyText).toContain('反例');
      expect(bodyText).toContain('变式');
      expect(bodyText).toMatch(/纠正|修正|纠错/);
      expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
    });

    it(`${courseName} has traceable sources and balanced assessment`, () => {
      const plan = getLearningV2CoursePlan('soft', courseName);
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

    it(`${courseName} marks must-remember points and includes a sourced case archive`, () => {
      const plan = getLearningV2CoursePlan('soft', courseName);
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
        for (const sourceId of item.sourceIds) {
          expect(sourceIds.has(sourceId)).toBe(true);
        }
      }
    });
  }
});
