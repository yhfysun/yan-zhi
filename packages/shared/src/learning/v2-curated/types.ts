import type { LearningV2CuratedCoursePlan } from '../v2-types.js';

export type CuratedCoursePlanMap = Readonly<Record<string, LearningV2CuratedCoursePlan>>;

export function planKey(subjectKey: string, courseName: string): string {
  return `${subjectKey}:${courseName}`;
}
