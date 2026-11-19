import { describe, expect, it } from 'vitest';
import {
  ALGORITHM_DIFFICULTIES,
  ALGORITHM_LESSONS,
  ALGORITHM_PRACTICE_PROBLEMS,
  ALGORITHM_RESOURCE_SITES,
  ALGORITHM_TRACKS,
  getLearningV2CoursePlan,
  getLearningV2Subject,
  getLearningV2Subjects,
  isLearningV2CourseReady,
} from './v2.js';

describe('algorithm and data structures subject', () => {
  it('registers a standalone subject beside programming', () => {
    const subjects = getLearningV2Subjects();
    const algorithms = getLearningV2Subject('algorithms');
    const programming = getLearningV2Subject('programming');

    expect(subjects).toHaveLength(21);
    expect(algorithms).toBeTruthy();
    expect(programming).toBeTruthy();
    expect(algorithms!.key).toBe('algorithms');
    expect(algorithms!.tracks).toHaveLength(8);
    expect(ALGORITHM_LESSONS).toHaveLength(64);
    expect(programming!.courses.some((course) => course.name.includes('算法与数据结构 ·'))).toBe(false);
    expect(programming!.courses.some((course) => course.name.includes('数据结构、算法与复杂度'))).toBe(false);
  });

  it('keeps every algorithm lesson story-led and fully teachable', () => {
    for (const track of ALGORITHM_TRACKS) {
      expect(track.story.length, track.id).toBeGreaterThan(30);
      expect(track.topics).toHaveLength(8);
    }

    for (const lesson of ALGORITHM_LESSONS) {
      expect(isLearningV2CourseReady('algorithms', lesson.courseName), lesson.courseName).toBe(true);
      const plan = getLearningV2CoursePlan('algorithms', lesson.courseName);
      expect(plan.qualityStatus, lesson.courseName).toBe('curated');
      expect(plan.steps, lesson.courseName).toHaveLength(6);
      expect(plan.steps.every((step) => step.body.length >= 60), lesson.courseName).toBe(true);
      expect(plan.prerequisite.length, lesson.courseName).toBeGreaterThan(20);
      expect(plan.guidedPractice.length, lesson.courseName).toBeGreaterThan(30);
      expect(plan.independentPractice.length, lesson.courseName).toBeGreaterThan(30);
      expect(plan.commonErrors.length, lesson.courseName).toBeGreaterThanOrEqual(3);
      expect(plan.sourceRefs.length, lesson.courseName).toBeGreaterThanOrEqual(4);
      expect(plan.sourceRefs.some((source) => source.includes('https://')), lesson.courseName).toBe(true);
    }
  });

  it('provides thousands of original story-based practice variants', () => {
    expect(ALGORITHM_PRACTICE_PROBLEMS).toHaveLength(4320);
    expect(new Set(ALGORITHM_PRACTICE_PROBLEMS.map((problem) => problem.id)).size).toBe(4320);
    expect(ALGORITHM_PRACTICE_PROBLEMS.filter((problem) => problem.flagship).length).toBe(240);
    expect(new Set(ALGORITHM_PRACTICE_PROBLEMS.map((problem) => problem.category))).toEqual(
      new Set(['hot', 'classic', 'contest', 'cold', 'engineering']),
    );
    expect(new Set(ALGORITHM_PRACTICE_PROBLEMS.map((problem) => problem.difficulty))).toEqual(
      new Set(ALGORITHM_DIFFICULTIES),
    );

    for (const problem of ALGORITHM_PRACTICE_PROBLEMS.slice(0, 200)) {
      expect(problem.story.length, problem.id).toBeGreaterThan(30);
      expect(problem.objective.length, problem.id).toBeGreaterThan(20);
      expect(problem.model.length, problem.id).toBeGreaterThan(20);
      expect(problem.approach.length, problem.id).toBeGreaterThan(30);
      expect(problem.starterPseudo.length, problem.id).toBe(4);
      expect(problem.hints.length, problem.id).toBe(3);
      expect(problem.pitfalls.length, problem.id).toBe(3);
      expect(problem.checklist.length, problem.id).toBe(4);
    }
  });

  it('offers official practice platforms without copying their content', () => {
    expect(ALGORITHM_RESOURCE_SITES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(ALGORITHM_RESOURCE_SITES.map((site) => site.url)).size).toBe(
      ALGORITHM_RESOURCE_SITES.length,
    );
    expect(ALGORITHM_RESOURCE_SITES.every((site) => site.url.startsWith('https://'))).toBe(true);
    for (const name of ['LeetCode', '洛谷', 'Codeforces', 'AtCoder', 'CSES', 'OI Wiki', 'CP-Algorithms']) {
      expect(ALGORITHM_RESOURCE_SITES.map((site) => site.name).join(' ')).toContain(name);
    }
  });
});
