import { describe, expect, it } from 'vitest';
import { ENGLISH_PATH, getEnglishPath } from '../src/learning/english-path';

describe('零基础英语学习主线', () => {
  it('按拼读、构词、句型、故事、口语输出排列', () => {
    expect(ENGLISH_PATH.map((stage) => stage.id)).toEqual([
      'sounds',
      'word-building',
      'sentence-core',
      'story-input',
      'real-speaking',
    ]);
  });

  it('每阶段都有可立即完成的三节微课', () => {
    for (const stage of ENGLISH_PATH) {
      expect(stage.steps, stage.id).toHaveLength(3);
      for (const step of stage.steps) {
        expect(step.goal.length, step.id).toBeGreaterThan(8);
        expect(step.explanation.length, step.id).toBeGreaterThan(20);
        expect(step.examples.length, step.id).toBeGreaterThan(0);
        expect(step.task.length, step.id).toBeGreaterThan(10);
        expect(step.minutes).toBeGreaterThan(0);
      }
    }
  });

  it('同时覆盖自然拼读、词根词缀、语法和故事输入', () => {
    const kinds = new Set(ENGLISH_PATH.flatMap((stage) => stage.steps.map((step) => step.kind)));
    expect(kinds).toEqual(new Set(['phonics', 'roots', 'grammar', 'story', 'speaking']));
    expect(ENGLISH_PATH[1].steps.some((step) => step.pattern?.includes('port'))).toBe(true);
    expect(ENGLISH_PATH[3].steps.some((step) => step.kind === 'story')).toBe(true);
  });

  it('返回副本，页面修改不会污染课程真相源', () => {
    const copy = getEnglishPath();
    copy[0].title = 'changed';
    copy[0].steps[0].title = 'changed';
    expect(ENGLISH_PATH[0].title).toBe('先会读');
    expect(ENGLISH_PATH[0].steps[0].title).toBe('五个短元音');
  });
});
