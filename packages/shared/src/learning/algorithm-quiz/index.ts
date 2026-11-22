// 算法与数据结构手写章节题库汇总：按课程主题键合并 8 个阶段（algorithms.ts 挂接 quiz 用）。
import type { LearningV2Practice } from '../v2-types.js';
import { HANDWRITTEN_ALGORITHM_QUIZ_A0 } from './a0.js';
import { HANDWRITTEN_ALGORITHM_QUIZ_A1 } from './a1.js';
import { HANDWRITTEN_ALGORITHM_QUIZ_A2 } from './a2.js';
import { HANDWRITTEN_ALGORITHM_QUIZ_A3 } from './a3.js';
import { HANDWRITTEN_ALGORITHM_QUIZ_A4 } from './a4.js';
import { HANDWRITTEN_ALGORITHM_QUIZ_A5 } from './a5.js';
import { HANDWRITTEN_ALGORITHM_QUIZ_A6 } from './a6.js';
import { HANDWRITTEN_ALGORITHM_QUIZ_A7 } from './a7.js';

export const ALGORITHM_HANDWRITTEN_QUIZ: Readonly<Record<string, readonly LearningV2Practice[]>> = {
  ...HANDWRITTEN_ALGORITHM_QUIZ_A0,
  ...HANDWRITTEN_ALGORITHM_QUIZ_A1,
  ...HANDWRITTEN_ALGORITHM_QUIZ_A2,
  ...HANDWRITTEN_ALGORITHM_QUIZ_A3,
  ...HANDWRITTEN_ALGORITHM_QUIZ_A4,
  ...HANDWRITTEN_ALGORITHM_QUIZ_A5,
  ...HANDWRITTEN_ALGORITHM_QUIZ_A6,
  ...HANDWRITTEN_ALGORITHM_QUIZ_A7,
};
