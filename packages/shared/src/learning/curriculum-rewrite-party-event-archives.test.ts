import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

describe('Learning V2 党史重大事件档案', () => {
  const subject = getLearningV2Subject('party');
  const courses = subject?.tracks.flatMap((track) => track.courses.map((course) => course.name)) ?? [];

  it('covers every Party course with a complete event archive', () => {
    expect(courses).toHaveLength(13);

    for (const courseName of courses) {
      const plan = getLearningV2CoursePlan('party', courseName);
      expect(plan.eventDetails?.length, courseName).toBeGreaterThanOrEqual(1);

      for (const event of plan.eventDetails ?? []) {
        expect(event.title.trim().length, courseName).toBeGreaterThanOrEqual(10);
        expect(event.period.trim().length, courseName).toBeGreaterThanOrEqual(6);
        expect(event.summary.trim().length, courseName).toBeGreaterThanOrEqual(55);
        expect(event.background.trim().length, courseName).toBeGreaterThanOrEqual(55);
        expect(event.outcome.trim().length, courseName).toBeGreaterThanOrEqual(45);
        expect(event.significance.trim().length, courseName).toBeGreaterThanOrEqual(50);
        expect(event.timeline.length, courseName).toBeGreaterThanOrEqual(6);
        expect(event.sourceCards.length, courseName).toBeGreaterThanOrEqual(3);

        const sourceIds = new Set(event.sourceCards.map((source) => source.id));
        expect(sourceIds.size, courseName).toBe(event.sourceCards.length);
        expect(event.sourceCards.some((source) => /^https:\/\//.test(source.url)), courseName)
          .toBe(true);

        for (const item of event.timeline) {
          expect(item.date.trim().length, `${courseName}/${item.title}`).toBeGreaterThanOrEqual(4);
          expect(item.sourceIds.length, `${courseName}/${item.title}`).toBeGreaterThanOrEqual(1);
          for (const sourceId of item.sourceIds) {
            expect(sourceIds.has(sourceId), `${courseName}/${item.title}/${sourceId}`).toBe(true);
          }
        }
      }
    }
  });

  it('keeps every event timeline node substantive', () => {
    const shortEntries = courses.flatMap((courseName) =>
      (getLearningV2CoursePlan('party', courseName).eventDetails ?? []).flatMap((event) =>
        event.timeline
          .filter((item) => item.body.trim().length < 40)
          .map((item) => ({
            course: courseName,
            event: event.id,
            node: item.title,
            length: item.body.trim().length,
          })),
      ),
    );
    expect(shortEntries).toEqual([]);
  });
});
