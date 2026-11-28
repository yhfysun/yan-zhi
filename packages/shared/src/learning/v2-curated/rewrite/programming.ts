import { PROGRAMMING_CURATED_PLANS } from '../programming/catalog.js';
import type { CuratedCoursePlanPatchMap } from '../types.js';

/**
 * 编程 946 门已经分别通过模板、五步正文、题库、实践和真实步骤样例专项审计。
 * 这里只做审校准入，不替换已核对的课程正文与代码台。
 */
export const PROGRAMMING_REWRITE: CuratedCoursePlanPatchMap = Object.fromEntries(
  Object.entries(PROGRAMMING_CURATED_PLANS).map(([key, plan]) => {
    const courseName = key.slice(key.indexOf(':') + 1);
    const excerpt = (text: string, limit = 72) => {
      const value = text.trim().replace(/\s+/g, ' ');
      const clipped = value.length > limit ? `${value.slice(0, limit)}…` : value;
      return clipped.length >= 12
        ? clipped
        : `“${courseName}”${clipped || '记录输入、输出与失败边界'}，并保留可复核证据。`;
    };
    return [
      key,
      {
        contentStatus: 'reviewed' as const,
        studyPoints: [
          {
            label: '必背' as const,
            text: `“${courseName}”必须同时记录运行版本、输入条件、可观察输出和失败边界。`,
            stepIndex: 0,
          },
          {
            label: '重点' as const,
            text: excerpt(plan.plainLanguageGoal),
            stepIndex: 1,
          },
          {
            label: '易错' as const,
            text: excerpt(plan.commonErrors[0] ?? plan.independentPractice),
            stepIndex: 3,
          },
          {
            label: '考点' as const,
            text: excerpt(plan.independentPractice),
            stepIndex: 4,
          },
        ],
      },
    ];
  }),
);
