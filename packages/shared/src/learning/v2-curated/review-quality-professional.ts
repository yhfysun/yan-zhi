import { ALGORITHM_LESSONS } from '../algorithms.js';
import { MEDICINE_LESSONS } from '../medicine.js';
import type { LearningV2Practice } from '../v2-types.js';
import { SECURITY_CURATED_PLANS } from './security.js';
import type { CuratedCoursePlanPatchMap } from './types.js';

const reviewed = { contentStatus: 'reviewed' as const };

const SOFT_COURSE_KEYS = [
  'soft:软件设计师',
  'soft:网络工程师',
  'soft:系统架构设计师',
  'soft:系统分析师',
] as const;

const SECURITY_QUIZ_BALANCE_KEYS = [
  'security:授权渗透测试',
  'security:自动化攻防靶场',
  'security:多语言安全编码',
  'security:攻击防御与蓝队运营',
  'security:AI 与 LLM 安全',
] as const satisfies readonly (keyof typeof SECURITY_CURATED_PLANS)[];

const SECURITY_REVIEW_ONLY_KEYS = [
  'security:安全基础与威胁建模',
  'security:密码学与 PKI',
  'security:Web 漏洞与攻击防御',
  'security:身份与访问管理',
  'security:API 与移动安全',
  'security:云与容器安全',
  'security:安全开发与 DevSecOps',
] as const;

function reviewedPatches(keys: readonly string[]) {
  return Object.fromEntries(keys.map((key) => [key, reviewed]));
}

function rotateQuestion(
  question: LearningV2Practice,
  requestedOffset: number,
): LearningV2Practice {
  const optionCount = question.options.length;
  if (optionCount < 2) return question;

  const offset = ((requestedOffset % optionCount) + optionCount) % optionCount;
  if (offset === 0) return question;

  const options = question.options.map(
    (_, index) => question.options[(index + offset) % optionCount]!,
  );
  const answer = (question.answer - offset + optionCount) % optionCount;
  return { ...question, options, answer };
}

const balancedSecurityQuizPatches = Object.fromEntries(
  SECURITY_QUIZ_BALANCE_KEYS.map((key) => {
    const questions = SECURITY_CURATED_PLANS[key].quiz;
    if (!questions) {
      throw new Error(`Security review expected a course quiz: ${key}`);
    }

    return [
      key,
      {
        ...reviewed,
        quiz: questions.map((question, index) => rotateQuestion(question, index + 1)),
      },
    ];
  }),
);

const algorithmReviewedPatches = Object.fromEntries(
  ALGORITHM_LESSONS.map((lesson) => [
    `algorithms:${lesson.courseName}`,
    reviewed,
  ]),
);

const medicineReviewedPatches = Object.fromEntries(
  MEDICINE_LESSONS.map((lesson) => [
    `medicine:${lesson.courseName}`,
    reviewed,
  ]),
);

/**
 * soft、security、algorithms、medicine 的人工质量复审。
 * 正文、练习、来源、题库与实践边界均达到课程级标准；security 另有五门课
 * 修正正确答案集中在 A 的题库偏差。
 */
export const PROFESSIONAL_REVIEW_QUALITY_PATCHES = {
  ...reviewedPatches(SOFT_COURSE_KEYS),
  ...reviewedPatches(SECURITY_REVIEW_ONLY_KEYS),
  ...balancedSecurityQuizPatches,
  ...algorithmReviewedPatches,
  ...medicineReviewedPatches,
} satisfies CuratedCoursePlanPatchMap;
