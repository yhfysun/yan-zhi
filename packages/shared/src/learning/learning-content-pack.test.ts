import { afterEach, describe, expect, it } from 'vitest';
import {
  clearLearningContentPacks,
  configureLearningContentDistribution,
  getLearningV2Subject,
  getLearningV2Subjects,
  registerLearningContentPacks,
} from './v2.js';
import {
  createLearningContentSelectionManifest,
  createLearningSubjectPack,
  parseLearningSubjectPack,
  serializeLearningSubjectPack,
  validateLearningSubjectPack,
} from './learning-content-pack.js';

afterEach(() => {
  clearLearningContentPacks();
  configureLearningContentDistribution(null);
});

describe('learning subject content packs', () => {
  it('round-trips a subject pack and rejects excluded imports', () => {
    const pack = createLearningSubjectPack('math', {
      distribution: 'ondemand',
      contentVersion: 'test-1',
      generatedAt: '2026-11-23T00:00:00.000Z',
    });
    const parsed = parseLearningSubjectPack(
      JSON.parse(serializeLearningSubjectPack(pack)),
    );

    expect(parsed.packageId).toBe('learning.subject.math');
    expect(parsed.counts.courses).toBe(parsed.courses.length);
    expect(parsed.counts.steps).toBeGreaterThan(0);

    const excluded = { ...pack, distribution: 'excluded' as const };
    expect(validateLearningSubjectPack(excluded)).toContainEqual({
      path: '$.distribution',
      message: 'excluded 数据包不可导入',
    });
    expect(() => parseLearningSubjectPack(excluded)).toThrow('excluded 数据包不可导入');
  });

  it('registers a user pack over the built-in subject and restores it on removal', () => {
    const builtinCount = getLearningV2Subject('math')?.courses.length;
    const pack = createLearningSubjectPack('math', {
      distribution: 'ondemand',
      generatedAt: '2026-11-23T00:00:00.000Z',
    });

    registerLearningContentPacks([pack]);
    expect(getLearningV2Subject('math')?.courses).toHaveLength(pack.courses.length);
    expect(getLearningV2Subject('math')?.name).toBe(pack.subject.name);

    clearLearningContentPacks();
    expect(getLearningV2Subject('math')?.courses).toHaveLength(builtinCount || 0);
  });

  it('filters bundled subjects with one selection manifest', () => {
    configureLearningContentDistribution(['physics']);
    const keys = getLearningV2Subjects().map((subject) => subject.key);

    expect(keys).toContain('physics');
    expect(keys).not.toContain('math');

    const manifest = createLearningContentSelectionManifest([
      { subjectKey: 'math', distribution: 'excluded' },
      { subjectKey: 'physics', distribution: 'bundled' },
    ], '2026-11-23T00:00:00.000Z');
    expect(manifest.entries.find((entry) => entry.subjectKey === 'physics')?.distribution)
      .toBe('bundled');
    expect(manifest.entries.find((entry) => entry.subjectKey === 'math')?.distribution)
      .toBe('excluded');
  });
});
