// 算法与数据结构手写教案汇总：按课程主题键合并 8 个阶段（algorithms.ts 覆盖模板用）。
import type { LearningV2CuratedCoursePlan } from '../v2-types.js';
import { HANDWRITTEN_ALGORITHM_A0_PLANS } from './a0.js';
import { HANDWRITTEN_ALGORITHM_A1_PLANS } from './a1.js';
import { HANDWRITTEN_ALGORITHM_A2_PLANS } from './a2.js';
import { HANDWRITTEN_ALGORITHM_A3_PLANS } from './a3.js';
import { HANDWRITTEN_ALGORITHM_A4_PLANS } from './a4.js';
import { HANDWRITTEN_ALGORITHM_A5_PLANS } from './a5.js';
import { HANDWRITTEN_ALGORITHM_A6_PLANS } from './a6.js';
import { HANDWRITTEN_ALGORITHM_A7_PLANS } from './a7.js';

export const ALGORITHM_HANDWRITTEN_TOPIC_PLANS: Readonly<Record<string, LearningV2CuratedCoursePlan>> = {
  ...HANDWRITTEN_ALGORITHM_A0_PLANS,
  ...HANDWRITTEN_ALGORITHM_A1_PLANS,
  ...HANDWRITTEN_ALGORITHM_A2_PLANS,
  ...HANDWRITTEN_ALGORITHM_A3_PLANS,
  ...HANDWRITTEN_ALGORITHM_A4_PLANS,
  ...HANDWRITTEN_ALGORITHM_A5_PLANS,
  ...HANDWRITTEN_ALGORITHM_A6_PLANS,
  ...HANDWRITTEN_ALGORITHM_A7_PLANS,
};
