import { expect, it } from 'vitest';
import { getLearningV2CoursePlan } from './v2.js';

const COURSES = [
  '河图洛书', '太极图说', '先后天图', '卦气纳甲消息', '易图辨伪', '历代易图', '《太极图说》精读：无极而太极',
  '梅花易数源流', '梅花起卦', '梅花体用', '六爻纳甲', '三式', '杂占',
  '风水总论', '形势派', '理气派（上）', '八宅与玄空', '阳宅营造', '命理相法择日', '《葬书》内篇节选精读：乘生气与风水之名',
  '易与中医', '易与丹道历法', '易与数学', '易与文艺传播', '出土易文献', '研究方法与引用', '《周易参同契》节选精读：乾坤门户与丹道',
] as const;

it('rewrites the remaining Zhouyi tracks as reviewed lessons', () => {
  for (const name of COURSES) {
    const plan = getLearningV2CoursePlan('zhouyi', name);
    expect(plan.reviewStatus, name).toBe('reviewed');
    expect(plan.steps.length, name).toBe(5);
    for (const step of plan.steps) {
      expect(step.body.length, `${name}/${step.title}`).toBeGreaterThanOrEqual(140);
      expect(step.objective?.length, step.title).toBeGreaterThanOrEqual(20);
      expect(step.practice?.length, step.title).toBeGreaterThanOrEqual(28);
      expect(step.checkpoint?.length, step.title).toBeGreaterThanOrEqual(28);
    }
    expect(plan.sourceRefs.length, name).toBeGreaterThanOrEqual(4);
    expect(plan.quiz.length, name).toBe(4);
    expect(new Set(plan.quiz.map((q) => q.answer)).size, name).toBe(4);
    for (const q of plan.quiz) expect(q.explanation.length, q.prompt).toBeGreaterThanOrEqual(50);
    expect(plan.studyPoints?.some((p) => p.label === '必背'), name).toBe(true);
    expect(plan.commonErrors.length, name).toBeGreaterThanOrEqual(2);
  }
});
