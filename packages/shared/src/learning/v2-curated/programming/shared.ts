import type {
  LearningV2CuratedCoursePlan,
  LearningV2LessonExample,
  LearningV2LessonStep,
  LearningV2Studio,
} from '../../v2-types.js';

export type ProgrammingTrackName =
  | 'P00 · 入门与工具链'
  | 'P01 · HTML / CSS / 浏览器'
  | 'P02 · JavaScript / TypeScript'
  | 'P03 · Vue 企业前端'
  | 'P04 · React 企业前端'
  | 'P05 · 后端共同基础'
  | 'P06 · Java / JVM / Spring'
  | 'P07 · Python 企业后端'
  | 'P08 · Go 企业后端'
  | 'P09 · C 系统编程'
  | 'P10 · C++ 高性能工程'
  | 'P11 · 设计模式与代码质量'
  | 'P12 · AI 编程与氛围编程'
  | 'P13 · 架构 / 交付 / 运维'
  | 'P14 · 独立语言课程'
  | 'P15 · 综合训练项目';

export type ProgrammingStepSeed = readonly [
  title: string,
  body: string,
  note: string,
  example?: LearningV2LessonExample,
];

export type ProgrammingCourseSeed = {
  readonly name: string;
  readonly track: ProgrammingTrackName;
  /** 未逐课人工整理的课程必须显式标记为 structured，不能冒充手写审校。 */
  readonly contentStatus?: 'reviewed' | 'structured';
  readonly minutes: number;
  readonly prerequisite: string;
  readonly goal: string;
  readonly guidedPractice: string;
  readonly independentPractice: string;
  readonly commonErrors: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly steps: readonly ProgrammingStepSeed[];
};

export type ProgrammingPracticeTask = {
  readonly courseName: string;
  readonly task: string;
  readonly output: string;
  readonly boundary: string;
  readonly features: readonly string[];
  readonly studio: LearningV2Studio;
};

export function programmingPlan(seed: ProgrammingCourseSeed): LearningV2CuratedCoursePlan {
  const substantive = (text: string, minimum = 30) =>
    text.length > minimum ? text : `${text} 完成后补充边界输入、失败路径和可重复验证记录。`;
  return {
    contentStatus: seed.contentStatus ?? 'reviewed',
    prerequisite: seed.prerequisite,
    plainLanguageGoal: substantive(seed.goal),
    guidedPractice: substantive(seed.guidedPractice),
    independentPractice: substantive(seed.independentPractice),
    commonErrors: seed.commonErrors,
    sourceRefs: seed.sourceRefs,
    steps: seed.steps.map(([title, body, note, example]) => {
      const namedBody = body.includes(seed.name) ? body : `${seed.name}：${body}`;
      return {
        title,
        body: namedBody.length >= 60
          ? namedBody
          : `${namedBody} 学完这一步，必须记录输入、状态变化、失败方式和可验证证据。`,
        note,
        ...(example ? { example } : {}),
      };
    }),
  };
}

export function programmingPlans(
  seeds: readonly ProgrammingCourseSeed[],
): Readonly<Record<string, LearningV2CuratedCoursePlan>> {
  return Object.fromEntries(
    seeds.map((seed) => [`programming:${seed.name}`, programmingPlan(seed)]),
  );
}

export function programmingPracticeTask(
  seed: ProgrammingCourseSeed,
  studio: LearningV2Studio,
): ProgrammingPracticeTask {
  return {
    courseName: seed.name,
    task: `围绕“${seed.name}”完成一次可运行、可测试、可部署的工程实验，并记录失败现象与修复证据。`,
    output: `“${seed.name}”代码、测试、构建或运行记录、复盘与来源卡`,
    boundary: '只在本地、测试环境或明确授权的学习环境操作；不接触生产密钥和真实用户数据。',
    features: [
      '运行环境与版本',
      '项目骨架与依赖',
      '测试与调试',
      '构建与部署',
      '日志、指标与回滚',
    ],
    studio,
  };
}

export function programmingLessonSteps(
  seeds: readonly ProgrammingCourseSeed[],
  courseName: string,
): readonly LearningV2LessonStep[] {
  const seed = seeds.find((item) => item.name === courseName) || seeds[0];
  if (!seed) return [];
  return seed.steps.map(([title, body, note, example]) => ({
    title,
    body: body.includes(seed.name)
      ? body
      : `${seed.name}：${body} 学完这一步，必须记录输入、状态变化、失败方式和可验证证据。`,
    note,
    ...(example ? { example } : {}),
  }));
}
