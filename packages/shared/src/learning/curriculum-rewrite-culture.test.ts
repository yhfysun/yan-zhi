import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan } from './v2.js';

const COURSES = {
  '蒙学 · 对韵起步': ['对仗', '平仄', '词性', '意义类别', '声律启蒙', '诵读', '自创', '边界'],
  '诗词歌赋入门': ['诗经', '赋比兴', '意象', '格律', '平仄', '押韵', '诵读', '情感证据'],
  '四书章句': ['原文', '篇目', '字词注释', '句读', '历代注解', '现代白话', '版本', '证据'],
  '五经选读': ['诗经', '尚书', '礼记', '周易', '春秋', '版本', '今古文', '注疏', '证据'],
} as const;
const REQUIRED = {
  '蒙学 · 对韵起步': 'https://zh.wikisource.org/wiki/聲律啟蒙',
  '诗词歌赋入门': 'https://ctext.org/book-of-poetry',
  '四书章句': 'https://ctext.org/analects',
  '五经选读': 'https://ctext.org/book-of-poetry',
} as const;
const urls = (v: string) => [...v.matchAll(/https?:\/\/[^\s；。]+/g)].map((m) => m[0].replace(/[),，。；]+$/, ''));
const specific = (v: string) => urls(v).some((u) => new URL(u).pathname.length > 1);

describe('Learning V2 传统文化整科重写验收', () => {
  for (const [name, concepts] of Object.entries(COURSES)) {
    it(`${name} is a reproducible classical text lesson`, () => {
      const plan = getLearningV2CoursePlan('culture', name);
      const text = plan.steps.map((s) => s.body).join('\n');
      expect(plan.reviewStatus).toBe('reviewed');
      expect(plan.steps).toHaveLength(5);
      expect(plan.steps.map((s) => s.title)).toEqual([
        expect.stringMatching(/^情境与诊断｜/), expect.stringMatching(/^材料与概念｜/),
        expect.stringMatching(/^示范与推导｜/), expect.stringMatching(/^引导练习｜/),
        expect.stringMatching(/^独立迁移与评价｜/),
      ]);
      for (const step of plan.steps) {
        expect(step.body.trim().length, step.title).toBeGreaterThanOrEqual(140);
        expect(step.body.trim().length, step.title).toBeLessThanOrEqual(650);
        expect(step.objective?.trim().length, step.title).toBeGreaterThanOrEqual(20);
        expect(step.practice?.trim().length, step.title).toBeGreaterThanOrEqual(28);
        expect(step.checkpoint?.trim().length, step.title).toBeGreaterThanOrEqual(28);
      }
      for (const concept of concepts) expect(`${text}\n${plan.quiz.map((q) => q.prompt).join('\n')}`).toContain(concept);
      expect(text).toMatch(/原文|篇目/);
      expect(text).toContain('证据');
      expect(text).toContain('现代');
      expect(text).toContain('前测');
      expect(text).toContain('后测');
      expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
      expect(plan.sourceRefs.length).toBeGreaterThanOrEqual(4);
      expect(plan.sourceRefs.filter(specific).length).toBeGreaterThanOrEqual(3);
      expect(plan.sourceRefs.join('\n')).toContain(REQUIRED[name as keyof typeof REQUIRED]);
      expect(plan.quiz).toHaveLength(4);
      expect(new Set(plan.quiz.map((q) => q.answer)).size).toBe(4);
      for (const q of plan.quiz) expect(q.explanation.length).toBeGreaterThanOrEqual(50);
      expect(plan.studyPoints?.length).toBeGreaterThanOrEqual(3);
      expect(plan.studyPoints?.some((p) => p.label === '必背')).toBe(true);
    });
  }
});
