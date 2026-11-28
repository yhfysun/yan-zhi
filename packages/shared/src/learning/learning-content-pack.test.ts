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

  it('validates event archive source cards and timeline references', () => {
    const pack = createLearningSubjectPack('party', {
      distribution: 'bundled',
      generatedAt: '2026-11-25T00:00:00.000Z',
    });
    const raw = JSON.parse(serializeLearningSubjectPack(pack)) as any;
    const eventCourse = raw.courses.find((course: any) => course.name === '建党与初心');
    expect(eventCourse?.plan.eventDetails?.length).toBeGreaterThan(0);
    const event = eventCourse.plan.eventDetails[0];
    expect(validateLearningSubjectPack(raw)).toEqual([]);

    event.sourceCards[0].url = 'http://example.com/source';
    event.timeline[0].sourceIds = ['missing-source'];
    const issues = validateLearningSubjectPack(raw);
    expect(issues).toContainEqual(expect.objectContaining({
      message: '来源卡缺少 id、标题或 HTTPS URL',
    }));
    expect(issues).toContainEqual(expect.objectContaining({
      message: '未知来源 id：missing-source',
    }));
  });

  it('validates study markers against lesson steps', () => {
    const pack = createLearningSubjectPack('party', {
      distribution: 'bundled',
      generatedAt: '2026-11-25T00:00:00.000Z',
    });
    const raw = JSON.parse(serializeLearningSubjectPack(pack)) as any;
    const course = raw.courses.find((item: any) => item.plan.studyPoints?.length);
    expect(validateLearningSubjectPack(raw)).toEqual([]);

    course.plan.studyPoints[0].stepIndex = 99;
    course.plan.studyPoints[1].label = '选学';
    expect(validateLearningSubjectPack(raw)).toContainEqual(expect.objectContaining({
      message: '重点标记需要合法标签、正文和步骤下标',
    }));
  });
});
