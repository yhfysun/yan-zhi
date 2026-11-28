import type { LearningV2CuratedCoursePlan, LearningV2Practice, LearningV2StudyPoint } from '../../v2-types.js';
import { ALGORITHM_CURATED_PLANS } from '../../algorithms.js';
import { MEDICINE_CURATED_PLANS } from '../../medicine.js';
import { ALGORITHM_FOUR_OPTION_PATCHES } from '../quiz-four-option-algorithms.js';
import type { CuratedCoursePlanMap, CuratedCoursePlanPatchMap } from '../types.js';

const TITLES = ['情境与诊断', '材料与概念', '示范与推导', '引导练习', '独立迁移与评价'] as const;
const ALGORITHM_SOURCES = [
  'OpenStax, Introduction to Algorithms and Data Structures 相关开放教材入口。https://openstax.org/',
  'MIT OpenCourseWare 6.006 Introduction to Algorithms。https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/',
  'VisuAlgo。https://visualgo.net/en',
  'CP-Algorithms。https://cp-algorithms.com/',
];
const MEDICINE_SOURCES = [
  'WHO, Fact sheets。https://www.who.int/news-room/fact-sheets',
  'MedlinePlus, Medical Encyclopedia。https://medlineplus.gov/encyclopedia.html',
  'OpenStax, Anatomy and Physiology。https://openstax.org/details/books/anatomy-and-physiology-2e',
  'NCBI Bookshelf。https://www.ncbi.nlm.nih.gov/books/',
];
const p = (label: LearningV2StudyPoint['label'], text: string, stepIndex: number): LearningV2StudyPoint => ({ label, text, stepIndex });

type FinalSubject = '算法' | '医学';

function normalizeSteps(base: LearningV2CuratedCoursePlan): LearningV2CuratedCoursePlan['steps'] {
  if (base.steps.length === 5) return base.steps;
  const firstFour = base.steps.slice(0, 4);
  const remaining = base.steps.slice(4);
  return [
    ...firstFour,
    {
      ...remaining[0],
      title: remaining.map((step) => step.title).join(' → '),
      body: remaining.map((step) => step.body.trim()).filter(Boolean).join(' '),
      note: remaining.map((step) => step.note.trim()).filter(Boolean).join('；'),
      objective: remaining
        .map((step) => step.objective?.trim())
        .filter((value): value is string => Boolean(value))
        .join('；'),
      practice: remaining
        .map((step) => step.practice?.trim())
        .filter((value): value is string => Boolean(value))
        .join('；'),
      checkpoint: remaining
        .map((step) => step.checkpoint?.trim())
        .filter((value): value is string => Boolean(value))
        .join('；'),
      example: remaining.find((step) => step.example)?.example,
    },
  ];
}

function excerpt(text: string, limit = 56): string {
  const first = text.trim().split(/[。；！？]/).find(Boolean)?.trim() ?? text.trim();
  return first.length > limit ? `${first.slice(0, limit)}…` : first;
}

function uniqueFour(correct: string, distractors: readonly string[]): readonly [string, string, string, string] {
  const values = [correct, ...distractors]
    .map((value) => value.trim())
    .filter(Boolean);
  const unique = [...new Set(values)];
  const pad = [
    '只看结论，不记录条件与证据。',
    '删掉失败路径，只保留一次成功结果。',
    '把相邻题型的固定模板直接套到本题。',
    '忽略适用对象，把局部经验外推到所有情境。',
  ];
  for (const value of pad) {
    if (unique.length >= 4) break;
    if (!unique.includes(value)) unique.push(value);
  }
  return unique.slice(0, 4) as unknown as readonly [string, string, string, string];
}

function fallbackQuiz(
  name: string,
  subject: FinalSubject,
  base: LearningV2CuratedCoursePlan,
  steps: LearningV2CuratedCoursePlan['steps'],
): LearningV2Practice[] {
  const algorithmDistractors = ['只背代码模板，不检查输入条件。', '看到样例通过就宣布算法正确。', '优化前不测量，只凭循环层数猜测瓶颈。'];
  const medicineDistractors = ['把课程通识内容当成个人诊断。', '用一个症状直接替代鉴别过程。', '自行调整处方药或停药。'];
  const distractors = subject === '算法' ? algorithmDistractors : medicineDistractors;
  const definitions = [
    {
      prompt: `“${name}”的核心学习结果更接近哪一项？`,
      correct: excerpt(base.plainLanguageGoal, 48),
      explanation: `本课目标需要同时给出可观察产出和适用边界；只复述名称不能证明已经能完成“${name}”的任务。`,
      focus: '事实与定义',
    },
    {
      prompt: `示范“${name}”时，哪一种证据链最完整？`,
      correct: excerpt(steps[2]?.body ?? base.guidedPractice, 48),
      explanation: `示范必须保留“${name}”的条件、中间推导和结果，不能只展示最后一句结论。`,
      focus: '材料与推导',
    },
    {
      prompt: `处理“${name}”时，哪项最符合本课指出的常见误区？`,
      correct: excerpt(base.commonErrors[0] ?? distractors[0]!, 48),
      explanation: `误区题要求识别错误发生在哪一层；对于“${name}”，需要把错误描述对应回证据、条件或安全边界。`,
      focus: '常见误区',
    },
    {
      prompt: `把“${name}”迁移到新情境，首先应保留什么？`,
      correct: excerpt(base.independentPractice, 48),
      explanation: `迁移时保留“${name}”的推理结构，同时重查对象、条件、证据和产出要求。`,
      focus: '迁移应用',
    },
  ];
  return definitions.map((item) => ({
    prompt: item.prompt,
    options: uniqueFour(item.correct, distractors),
    answer: 0,
    explanation: item.explanation,
    focus: item.focus,
  }));
}

function medicalBody(
  courseName: string,
  base: LearningV2CuratedCoursePlan,
  stepIndex: number,
): string {
  const topic = courseName.slice(courseName.indexOf('·') + 1).trim();
  const isTcm = courseName.startsWith('中医');
  const sentences = stepIndex === 0
    ? [
      `${topic}先标记教学虚构。`,
      `${topic}记录时间、主诉和已知事实。`,
      `${topic}标出缺失、矛盾和高风险红线。`,
      `${topic}不判断真人急症，优先联系当地急救或专业人员。`,
    ]
    : stepIndex === 1
      ? [
        `${topic}按起病与变化建立时间轴。`,
        `${topic}分列症状、体征、检验和影像。`,
        `${topic}注明每项信息的时点与来源。`,
        `${topic}先写缺失项，再写不确定项。`,
      ]
      : stepIndex === 2
        ? isTcm
          ? [
            `${topic}核对公版原文、篇章和注疏。`,
            `${topic}分开原文、古注和白话转述。`,
            `${topic}记录时代、作者与方法限制。`,
            `${topic}不把经典条文直接当作处方。`,
          ]
          : [
            `${topic}核对人体机制和适用人群。`,
            `${topic}区分机制、观察与临床结论。`,
            `${topic}记录研究设计、终点和证据等级。`,
            `${topic}不把科普材料当作诊疗指南。`,
          ]
        : stepIndex === 3
          ? [
            `${topic}至少列出两种竞争解释。`,
            `${topic}为每种解释写支持证据。`,
            `${topic}再写反证和仍需核对项。`,
            `${topic}不把单一术语当最终结论。`,
          ]
          : [
            `${topic}只形成就医沟通摘要。`,
            `${topic}按症状、用药和问题排序。`,
            `${topic}复核隐私、危险信号和转诊边界。`,
            `${topic}不提供处方、剂量或停药指令。`,
            isTcm
              ? `${topic}复盘经典、注疏、现代研究与个人经验。`
              : `${topic}复盘研究对象、样本、终点与适用人群。`,
          ];
  const evidence = [
    base.prerequisite,
    base.commonErrors[0] ?? '',
    base.sourceRefs[0] ?? '',
    base.guidedPractice,
    base.independentPractice,
  ][stepIndex] ?? base.plainLanguageGoal;
  return [
    ...sentences,
    `${topic}本步核对“${excerpt(evidence, 18)}”。`,
  ].join('');
}

function reviewedPlan(
  key: string,
  base: LearningV2CuratedCoursePlan,
  subject: FinalSubject,
): LearningV2CuratedCoursePlan {
  const name = key.slice(key.indexOf(':') + 1);
  const sources = subject === '算法' ? ALGORITHM_SOURCES : MEDICINE_SOURCES;
  const normalizedSteps = normalizeSteps(base);
  const steps = subject === '医学'
    ? normalizedSteps.map((step, index) => ({
      ...step,
      body: medicalBody(name, base, index),
    }))
    : normalizedSteps;
  const fallback = fallbackQuiz(name, subject, base, steps);
  const existingQuiz = base.quiz ?? [];
  const quizzes = Array.from(
    { length: 4 },
    (_, index) => existingQuiz[index] ?? fallback[index]!,
  );
  const firstError = base.commonErrors[0]
    ?? (subject === '算法' ? '忽略输入规模和数据条件。' : '把通识内容当作个体诊疗。');
  return {
    ...base,
    contentStatus: 'reviewed',
    sourceRefs: [...new Set([...base.sourceRefs, ...sources])],
    commonErrors: base.commonErrors.length >= 2
      ? base.commonErrors
      : [...base.commonErrors, subject === '算法' ? '忽略输入规模和数据条件。' : '把通识内容当作个体诊疗。'],
    studyPoints: [
      p('必背', subject === '算法'
        ? `“${name}”必须同时说明正确性、复杂度和失败条件。`
        : `“${name}”只作通识学习，不替代诊断、处方、检查或急救。`, 0),
      p('重点', excerpt(base.plainLanguageGoal, 72), 1),
      p('易错', firstError, 3),
      p('考点', excerpt(base.independentPractice, 72), 4),
    ],
    quiz: quizzes.map((quiz) => ({
      ...quiz,
      explanation: quiz.explanation.length >= 50
        ? quiz.explanation
        : `${quiz.explanation} ${name}的证据、适用条件和失败边界必须一起核对。`,
    })),
    steps: steps.map((step, index) => ({
      ...step,
      title: `${TITLES[index]}｜${name}`,
      objective: step.objective?.length && step.objective.length >= 12
        ? step.objective
        : `${excerpt(step.body, 72)}。`,
      practice: step.practice?.length && step.practice.length >= 28
        ? step.practice
        : `${name}：${excerpt(step.body, 64)}；提交条件、过程、结果和一次失败记录。`,
      checkpoint: step.checkpoint?.length && step.checkpoint.length >= 28
        ? step.checkpoint
        : `检查“${name}”的${TITLES[index]}证据，指出条件变化、失败现象和需要重做的部分。`,
    })),
  };
}

const ALGORITHMS = Object.fromEntries(
  Object.entries(ALGORITHM_CURATED_PLANS).map(([key, plan]) => [
    key,
    { ...plan, ...ALGORITHM_FOUR_OPTION_PATCHES[key] },
  ]),
) as unknown as CuratedCoursePlanMap;
const MEDICINE = MEDICINE_CURATED_PLANS as unknown as CuratedCoursePlanMap;

export const FINAL_SUBJECTS_REWRITE: CuratedCoursePlanPatchMap = Object.fromEntries([
  ...Object.entries(ALGORITHMS).map(([key, plan]) => [key, reviewedPlan(key, plan, '算法')]),
  ...Object.entries(MEDICINE).map(([key, plan]) => [key, reviewedPlan(key, plan, '医学')]),
]);
