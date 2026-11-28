import { expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSES = [
  '世界占卜文化导论', '象征、隐喻与解释', '概率、心理与确认偏误', '占卜记录与复盘', '文化伦理与使用边界',
  '天文基础：星空、行星与季节', '星座的文化史', '黄道十二宫：历法与象征', '行星、宫位与相位', '星盘实践：从符号到叙事',
  '塔罗图像史与公版牌组', '大阿卡纳：22 张象征', '小阿卡纳：四组牌', '塔罗牌：三张牌阵如何形成叙事', '塔罗解读与复盘',
  '水晶球凝视与注意力', '骰子、签筒与随机', '数字占卜与历法', '地理方位与地方占俗', '中外占卜传统比较',
] as const;

it('rewrites all twenty divination courses as reviewed cultural lessons', () => {
  expect(getLearningV2Subject('divination')?.courses.map((course) => course.name)).toEqual(COURSES);
  for (const name of COURSES) {
    const plan = getLearningV2CoursePlan('divination', name);
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
