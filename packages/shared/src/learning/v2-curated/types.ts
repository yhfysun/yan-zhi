import type { LearningV2CuratedCoursePlan } from '../v2-types.js';

export type CuratedCoursePlanMap = Readonly<Record<string, LearningV2CuratedCoursePlan>>;
export type CuratedCoursePlanPatchMap = Readonly<
  Record<string, Partial<LearningV2CuratedCoursePlan>>
>;

export function planKey(subjectKey: string, courseName: string): string {
  return `${subjectKey}:${courseName}`;
}

export function mergeCuratedCoursePlans(
  base: CuratedCoursePlanMap,
  ...patchMaps: readonly CuratedCoursePlanPatchMap[]
): CuratedCoursePlanMap {
  const merged: Record<string, LearningV2CuratedCoursePlan> = { ...base };
  for (const patches of patchMaps) {
    for (const [key, patch] of Object.entries(patches)) {
      const current = merged[key];
      if (!current) {
        throw new Error(`Curated course patch has no matching base course: ${key}`);
      }
      merged[key] = { ...current, ...patch };
    }
  }
  return merged;
}
