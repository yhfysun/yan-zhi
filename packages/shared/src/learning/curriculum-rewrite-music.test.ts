import { expect, it } from 'vitest';
import { getLearningV2CoursePlan } from './v2.js';

const COURSES = {
  现代通用乐理: ['音高', '节奏', '节拍', '音程', '音阶', '和弦', '调性', '听辨', '创作'],
  中国传统音乐: ['五声', '宫商角徵羽', '工尺谱', '简谱', '节拍', '旋律', '试奏', '版权'],
} as const;
const REQUIRED = {
  现代通用乐理: 'https://viva.pressbooks.pub/openmusictheory/',
  中国传统音乐: 'https://www.britannica.com/art/Chinese-music',
} as const;
const urls = (v: string) => [...v.matchAll(/https?:\/\/[^\s；。]+/g)].map((m) => m[0].replace(/[),，。；]+$/, ''));
const specific = (v: string) => urls(v).some((u) => new URL(u).pathname.length > 1);

it('music courses are complete evidence-based lessons', () => {
  for (const [name, concepts] of Object.entries(COURSES)) {
    const plan = getLearningV2CoursePlan('music', name);
    const text = plan.steps.map((s) => s.body).join('\n');
    expect(plan.reviewStatus).toBe('reviewed');
    expect(plan.steps).toHaveLength(5);
    for (const step of plan.steps) {
      expect(step.body.length).toBeGreaterThanOrEqual(140);
      expect(step.objective?.length).toBeGreaterThanOrEqual(20);
      expect(step.practice?.length).toBeGreaterThanOrEqual(28);
      expect(step.checkpoint?.length).toBeGreaterThanOrEqual(28);
    }
    for (const c of concepts) expect(`${text}\n${plan.quiz.map((q) => q.prompt).join('\n')}`).toContain(c);
    expect(text).toMatch(/听|音频|录音/);
    expect(text).toContain('谱');
    expect(text).toContain('前测');
    expect(text).toContain('后测');
    expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
    expect(plan.sourceRefs.length).toBeGreaterThanOrEqual(4);
    expect(plan.sourceRefs.filter(specific).length).toBeGreaterThanOrEqual(3);
    expect(plan.sourceRefs.join('\n')).toContain(REQUIRED[name as keyof typeof REQUIRED]);
    expect(plan.quiz).toHaveLength(4);
    expect(new Set(plan.quiz.map((q) => q.answer)).size).toBe(4);
    for (const q of plan.quiz) expect(q.explanation.length).toBeGreaterThanOrEqual(50);
    expect(plan.studyPoints?.some((p) => p.label === '必背')).toBe(true);
  }
});
