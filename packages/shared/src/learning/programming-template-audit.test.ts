import { expect, it } from 'vitest';
import { getLearningV2CoursePlan } from './v2.js';
import { PROGRAMMING_COURSE_SEEDS } from './v2-curated/programming/catalog.js';

it('keeps the remaining generated programming backlog explicit', () => {
  const rows = PROGRAMMING_COURSE_SEEDS.map((seed) => {
    const plan = getLearningV2CoursePlan('programming', seed.name);
    return {
      track: seed.track,
      name: seed.name,
      qualityStatus: plan.qualityStatus,
      reviewStatus: plan.reviewStatus,
      studyPoints: plan.studyPoints?.length ?? 0,
      mustMemorize: plan.studyPoints?.some((point) => point.label === '必背') ?? false,
      steps: plan.steps.length,
      firstStepTitle: plan.steps[0]?.title ?? '',
      expandedSteps: plan.steps.filter((step) =>
        step.body.includes('本步的可复核产出是'),
      ).length,
    };
  });

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    grouped.set(row.track, [...(grouped.get(row.track) ?? []), row]);
  }
  const summary = [...grouped.entries()].map(([track, courses]) => ({
    track,
    total: courses.length,
    curated: courses.filter((course) => course.qualityStatus === 'curated').length,
    generated: courses.filter((course) => course.qualityStatus === 'generated').length,
    draft: courses.filter((course) => course.qualityStatus === 'draft').length,
    reviewed: courses.filter((course) => course.reviewStatus === 'reviewed').length,
    studyPointsReady: courses.filter((course) => course.studyPoints >= 2).length,
    mustMemorizeReady: courses.filter((course) => course.mustMemorize).length,
    expandedSteps: courses.reduce((total, course) => total + course.expandedSteps, 0),
  }));

  console.table(summary);
  expect(rows).toHaveLength(946);
  expect(rows.filter((row) => row.qualityStatus === 'curated')).toHaveLength(946);
  expect(rows.filter((row) => row.qualityStatus === 'generated')).toHaveLength(0);
  expect(rows.filter((row) => row.reviewStatus === 'reviewed')).toHaveLength(946);
  expect(rows.filter((row) => row.studyPoints >= 2)).toHaveLength(946);
  expect(rows.filter((row) => row.mustMemorize)).toHaveLength(946);
  expect(rows.reduce((total, row) => total + row.expandedSteps, 0)).toBe(0);
});
