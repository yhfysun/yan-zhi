import { describe, expect, it } from 'vitest';
import {
  getLearningV2CoursePlan,
  getLearningV2Subject,
} from './v2.js';
import { LEARNING_V2_REWRITTEN_COURSE_KEYS } from './v2-curated/rewrite/index.js';

describe('Learning V2 rewritten-course study markers', () => {
  it('marks key and must-memorize content on every rewritten course', () => {
    const violations: string[] = [];

    for (const key of LEARNING_V2_REWRITTEN_COURSE_KEYS) {
      const separator = key.indexOf(':');
      const subjectKey = key.slice(0, separator);
      const courseName = key.slice(separator + 1);
      const subject = getLearningV2Subject(subjectKey);
      if (!subject?.courses.some((course) => course.name === courseName)) {
        violations.push(`${key}: course missing`);
        continue;
      }
      const plan = getLearningV2CoursePlan(subjectKey, courseName);
      const points = plan.studyPoints ?? [];
      if (points.length < 2) violations.push(`${key}: fewer than 2 study points`);
      if (!points.some((point) => point.label === '必背')) {
        violations.push(`${key}: no must-memorize point`);
      }
      for (const point of points) {
        if (!['重点', '必背', '易错', '考点'].includes(point.label)) {
          violations.push(`${key}: invalid label ${point.label}`);
        }
        if (point.text.trim().length < 12) violations.push(`${key}: short point text`);
        if (!Number.isInteger(point.stepIndex) || point.stepIndex < 0 || point.stepIndex >= plan.steps.length) {
          violations.push(`${key}: invalid step index ${point.stepIndex}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
