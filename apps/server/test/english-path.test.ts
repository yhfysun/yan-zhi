import { describe, expect, it } from 'vitest';
import { ENGLISH_PATH, getEnglishPath } from '../src/learning/english-path';

describe('零基础英语学习主线', () => {
  it('按拼读、构词、句型、寓言、短篇、长篇、口语输出排列', () => {
    expect(ENGLISH_PATH.map((stage) => stage.id)).toEqual([
      'sounds',
      'word-building',
      'sentence-core',
      'fable-reading',
      'story-input',
      'long-story',
      'real-speaking',
    ]);
  });

  it('每阶段都有可立即完成的微课，每课都有完整教案和自测', () => {
    for (const stage of ENGLISH_PATH) {
      expect(stage.steps.length, stage.id).toBeGreaterThanOrEqual(3);
      for (const step of stage.steps) {
        expect(step.goal.length, step.id).toBeGreaterThan(8);
        expect(step.explanation.length, step.id).toBeGreaterThan(20);
        expect(step.examples.length, step.id).toBeGreaterThan(0);
        expect(step.task.length, step.id).toBeGreaterThan(10);
        expect(step.minutes).toBeGreaterThan(0);
        expect(step.quickCheck, `${step.id} quickCheck`).toBeTruthy();
        expect(step.quickCheck!.options.length, `${step.id} options`).toBeGreaterThanOrEqual(3);
        expect(step.quickCheck!.answer, `${step.id} answer`).toBeGreaterThanOrEqual(0);
        expect(step.quickCheck!.answer, `${step.id} answer`).toBeLessThan(step.quickCheck!.options.length);
        expect(step.quickCheck!.explanation.length, `${step.id} explanation`).toBeGreaterThan(8);
      }
    }
  });

  it('同时覆盖自然拼读、词根词缀、语法、寓言、短篇和长篇故事', () => {
    const kinds = new Set(ENGLISH_PATH.flatMap((stage) => stage.steps.map((step) => step.kind)));
    expect(kinds).toEqual(new Set(['phonics', 'roots', 'grammar', 'fable', 'story', 'long-story', 'speaking']));
    expect(ENGLISH_PATH[1].steps.some((step) => step.pattern?.includes('port'))).toBe(true);
    expect(ENGLISH_PATH.find((stage) => stage.id === 'fable-reading')?.steps.every((step) => step.kind === 'fable')).toBe(true);
    expect(ENGLISH_PATH.find((stage) => stage.id === 'long-story')?.steps.length).toBeGreaterThanOrEqual(3);
    expect(
      ENGLISH_PATH.find((stage) => stage.id === 'long-story')?.steps.every((step) =>
        step.examples.reduce((sum, example) => sum + example.en.length, 0) > 250),
    ).toBe(true);
  });

  it('主线课程量足以形成完整学习路径，而不是示例卡', () => {
    expect(ENGLISH_PATH.reduce((sum, stage) => sum + stage.steps.length, 0)).toBeGreaterThanOrEqual(100);
    const counts = Object.fromEntries(ENGLISH_PATH.map((stage) => [stage.id, stage.steps.length]));
    expect(counts.sounds).toBeGreaterThanOrEqual(12);
    expect(counts['word-building']).toBeGreaterThanOrEqual(16);
    expect(counts['sentence-core']).toBeGreaterThanOrEqual(42);
    expect(counts['fable-reading']).toBeGreaterThanOrEqual(12);
    expect(counts['story-input']).toBeGreaterThanOrEqual(12);
    expect(counts['long-story']).toBeGreaterThanOrEqual(8);
    expect(counts['real-speaking']).toBeGreaterThanOrEqual(12);
  });

  it('词根课不是四词示例：每课至少提供 8 个同根词和释义', () => {
    const roots = ENGLISH_PATH.find((stage) => stage.id === 'word-building')!.steps;
    for (const step of roots) {
      expect(step.wordFamily?.length, step.id).toBeGreaterThanOrEqual(8);
      for (const entry of step.wordFamily!) {
        expect(entry.word.length, step.id).toBeGreaterThan(1);
        expect(entry.gloss.length, `${step.id}:${entry.word}`).toBeGreaterThan(0);
      }
    }
    const port = roots.find((step) => step.id === 'roots_port')!;
    expect(port.wordFamily?.map((entry) => entry.word)).toEqual(expect.arrayContaining([
      'import', 'export', 'transport', 'portable', 'report', 'support', 'teleport',
    ]));
  });

  it('返回副本，页面修改不会污染课程真相源', () => {
    const copy = getEnglishPath();
    copy[0].title = 'changed';
    copy[0].steps[0].title = 'changed';
    copy[0].steps[0].quickCheck!.options[0] = 'changed';
    expect(ENGLISH_PATH[0].title).toBe('先会读');
    expect(ENGLISH_PATH[0].steps[0].title).toBe('五个短元音');
    expect(ENGLISH_PATH[0].steps[0].quickCheck!.options[0]).not.toBe('changed');
  });
});
