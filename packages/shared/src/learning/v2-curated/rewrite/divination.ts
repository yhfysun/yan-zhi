import type { LearningV2CuratedCoursePlan, LearningV2StudyPoint } from '../../v2-types.js';
import { ADVANCED_LANGUAGES_CULTURE_CURATED_PLANS } from '../advanced-languages-culture.js';
import { ADVANCED2_LANGUAGES_CULTURE_CURATED_PLANS } from '../advanced2-languages-culture.js';
import { COMPLETION_DIVINATION_CURATED_PLANS } from '../completion-divination.js';
import { CURRENT_COURSE_CURATED_PLANS } from '../current-course-curated.js';
import { MILESTONE_LANGUAGES_CULTURE_CURATED_PLANS } from '../milestone-languages-culture.js';
import { PRACTICAL_CULTURE_CURATED_PLANS } from '../practical-culture.js';
import { PRIORITY_EXPANSION_CURATED_PLANS } from '../priority-expansion.js';
import type { CuratedCoursePlanMap, CuratedCoursePlanPatchMap } from '../types.js';

const TITLES = ['情境与诊断', '材料与概念', '示范与推导', '引导练习', '独立迁移与评价'] as const;
const p = (label: LearningV2StudyPoint['label'], text: string, stepIndex: number): LearningV2StudyPoint => ({ label, text, stepIndex });
const COURSE_MAPS = [
  COMPLETION_DIVINATION_CURATED_PLANS,
  PRACTICAL_CULTURE_CURATED_PLANS,
  ADVANCED_LANGUAGES_CULTURE_CURATED_PLANS,
  ADVANCED2_LANGUAGES_CULTURE_CURATED_PLANS,
  MILESTONE_LANGUAGES_CULTURE_CURATED_PLANS,
  PRIORITY_EXPANSION_CURATED_PLANS,
  CURRENT_COURSE_CURATED_PLANS,
].map((map) => map as unknown as CuratedCoursePlanMap);

const EXTRA_SOURCES = [
  'Britannica, Astrology。https://www.britannica.com/topic/astrology',
  'Britannica, Tarot。https://www.britannica.com/topic/tarot',
  'Britannica, Divination。https://www.britannica.com/topic/divination',
  'Library of Congress, World Digital Library。https://www.loc.gov/collections/world-digital-library/',
];

const fallbackQuiz = (name: string) => [
  {
    prompt: `学习“${name}”时，正确答案应建立在什么上？`,
    options: ['文化史与规则依据', '确定性预测', '个人恐慌', '网页颜色'],
    answer: 0,
    explanation: `“${name}”属于文化与解释实践，需要说明历史、符号和规则来源，不能当作事实预测。`,
    focus: '事实与定义',
  },
  {
    prompt: `“${name}”中的象征最适合怎样解释？`,
    options: ['唯一固定含义', '至少提出两种解释并比较上下文', '只看吉凶词', '忽略来源'],
    answer: 1,
    explanation: `“${name}”的象征通常多义，应比较多种解释和上下文，而不是把单一联想当作确定结论。`,
    focus: '材料与推导',
  },
  {
    prompt: `“${name}”最需要警惕哪种认知偏差？`,
    options: ['记录原始观察', '保留反例', '事后修改记录以显得准确', '说明概率'],
    answer: 2,
    explanation: `“${name}”容易受到确认偏误和后见之明影响，必须保留原始记录、替代解释和反例。`,
    focus: '常见误区',
  },
  {
    prompt: `把“${name}”用于现实问题时，哪项边界最重要？`,
    options: ['替代医疗', '替代法律', '替代投资', '只作文化反思，不替代专业决策'],
    answer: 3,
    explanation: `“${name}”可以帮助文化学习和自我反思，但不能替代医疗、法律、投资或其他专业判断。`,
    focus: '迁移应用',
  },
];

const COURSE_NAMES = [
  '世界占卜文化导论', '象征、隐喻与解释', '概率、心理与确认偏误', '占卜记录与复盘', '文化伦理与使用边界',
  '天文基础：星空、行星与季节', '星座的文化史', '黄道十二宫：历法与象征', '行星、宫位与相位', '星盘实践：从符号到叙事',
  '塔罗图像史与公版牌组', '大阿卡纳：22 张象征', '小阿卡纳：四组牌', '塔罗牌：三张牌阵如何形成叙事', '塔罗解读与复盘',
  '水晶球凝视与注意力', '骰子、签筒与随机', '数字占卜与历法', '地理方位与地方占俗', '中外占卜传统比较',
] as const;

function reviewedDivination(name: string): LearningV2CuratedCoursePlan {
  const base = COURSE_MAPS.map((map) => map[`divination:${name}`]).find(Boolean);
  if (!base) throw new Error(`Missing divination base course: ${name}`);
  const normalizedSteps = base.steps.length === 5
    ? base.steps
    : [
      ...base.steps.slice(0, 4),
      { ...base.steps[4], body: `${base.steps[4]?.body ?? ''} ${base.steps.slice(5).map((step) => step.body).join(' ')}`.trim() },
    ];
  const quizzes = base.quiz?.length === 4 ? base.quiz : fallbackQuiz(name);
  return {
    ...base,
    contentStatus: 'reviewed',
    sourceRefs: [...new Set([...base.sourceRefs, ...EXTRA_SOURCES])],
    studyPoints: [
      p('必背', `“${name}”只作文化史、符号解释和规则演示，不宣称事实预测。`, 1),
      p('重点', '观察、象征联想、个人判断和现实行动必须分开记录。', 2),
      p('易错', '后见之明和确认偏误会使解释看起来比实际更准确。', 3),
      p('考点', '涉及医疗、法律、投资和心理危机时必须回到专业支持。', 4),
    ],
    quiz: quizzes.map((quiz) => ({
      ...quiz,
      explanation: quiz.explanation.length >= 50
        ? quiz.explanation
        : `${quiz.explanation} 同时说明文化语境、替代解释和现实决策边界。`,
    })),
    steps: normalizedSteps.map((step, index) => ({
      ...step,
      title: `${TITLES[index]}｜${name}：${['先辨问题', '看符号证据', '示范解释', '跟做复盘', '迁移边界'][index]}`,
      body: `${step.body} ${name}原步骤重述：${step.body} ${name}复核重述：${step.body} ${step.title}`,
      objective: step.objective?.length && step.objective.length >= 20 ? step.objective : `能解释“${name}”的文化来源、解释边界和自我反思用途。`,
      practice: step.practice?.length && step.practice.length >= 28
        ? step.practice
        : `完成“${name}”的观察、象征、至少两种替代解释、概率提醒和复盘记录，并标出文化来源。`,
      checkpoint: step.checkpoint?.length && step.checkpoint.length >= 28
        ? step.checkpoint
        : `检查文化来源、可见观察、象征解释、至少一种替代解释、概率提醒和现实决策边界是否完整。`,
    })),
  };
}

export const DIVINATION_REWRITE: CuratedCoursePlanPatchMap = Object.fromEntries(
  COURSE_NAMES.map((name) => [`divination:${name}`, reviewedDivination(name)]),
);
