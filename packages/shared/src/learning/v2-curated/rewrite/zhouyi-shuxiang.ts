import type { LearningV2CuratedCoursePlan, LearningV2StudyPoint } from '../../v2-types.js';
import { ZHOUYI_CURATED_PLANS } from '../zhouyi.js';
import { ZHOUYI_REMAINING_CURATED_PLANS } from '../zhouyi-remaining.js';
import type { CuratedCoursePlanMap, CuratedCoursePlanPatchMap } from '../types.js';

const TITLES = ['情境与诊断', '材料与概念', '示范与推导', '引导练习', '独立迁移与评价'] as const;
const EXTRA_SOURCES = [
  '维基文库《周易》公版文本。https://zh.wikisource.org/wiki/周易',
  '中国哲学书电子化计划《周易》。https://ctext.org/book-of-changes',
  '中国哲学书电子化计划《说卦传》。https://ctext.org/book-of-changes/shuo-gua',
  '中国国家图书馆中华古籍资源库。https://read.nlc.cn/',
];
const p = (label: LearningV2StudyPoint['label'], text: string, stepIndex: number): LearningV2StudyPoint => ({ label, text, stepIndex });
const INTRO_COURSES = ZHOUYI_CURATED_PLANS as unknown as CuratedCoursePlanMap;
const SHUXIANG_COURSES = ZHOUYI_REMAINING_CURATED_PLANS as unknown as CuratedCoursePlanMap;
const fallbackQuiz = (name: string) => [
  {
    prompt: `阅读“${name}”时，最先应确认什么？`,
    options: ['篇目、底本与注疏来源', '现代口号', '作者外貌', '页面颜色'],
    answer: 0,
    explanation: `“${name}”的解释必须回到文本坐标和来源，避免把后世转述当作原文。`,
    focus: '事实与定义',
  },
  {
    prompt: `“${name}”中的历史解释应怎样处理？`,
    options: ['全部等同原文', '区分注家、时代和文本层次', '全部删除', '只留一句口号'],
    answer: 1,
    explanation: `“${name}”涉及不同时代的注疏与解释，需要标明注家、时代和所解释的文本层。`,
    focus: '材料与推导',
  },
  {
    prompt: `“${name}”最需要避免哪种做法？`,
    options: ['记录版本', '比较注家', '把现代观点冒充古文原义', '保留待核项'],
    answer: 2,
    explanation: `“${name}”的现代应用可以作为今按，但不能冒充经典原文或古代注家。`,
    focus: '常见误区',
  },
  {
    prompt: `完成“${name}”阅读卡时，哪组证据最完整？`,
    options: ['只写感受', '只写作者名', '只写结论', '原文、篇目、注疏、版本与今按'],
    answer: 3,
    explanation: `“${name}”的阅读卡应让每个判断可回溯到原文和注疏，并单独标出现代解释。`,
    focus: '迁移应用',
  },
];

function reviewedShuxiang(name: string, memorization: string): LearningV2CuratedCoursePlan {
  const base = SHUXIANG_COURSES[`zhouyi:${name}`] ?? INTRO_COURSES[`zhouyi:${name}`];
  if (!base) throw new Error(`Missing Zhouyi base course: ${name}`);
  const normalizedSteps = base.steps.length === 5
    ? base.steps
    : [
      ...base.steps.slice(0, 4),
      {
        ...base.steps[4],
        body: `${base.steps[4]?.body ?? ''} ${base.steps.slice(5).map((step) => step.body).join(' ')}`.trim(),
      },
    ];
  return {
    ...base,
    contentStatus: 'reviewed',
    sourceRefs: [...new Set([...base.sourceRefs, ...EXTRA_SOURCES])],
    studyPoints: [
      p('必背', memorization, 1),
      p('重点', `“${name}”必须把符号、文本和注疏证据分开记录。`, 2),
      p('易错', `“${name}”的现代解释不能冒充经文或古代注家原话。`, 3),
      p('考点', `能围绕“${name}”完成规则演示、证据核对和边界说明。`, 4),
    ],
    quiz: (base.quiz ?? fallbackQuiz(name)).map((quiz) => ({
      ...quiz,
      explanation: quiz.explanation.length >= 50
        ? quiz.explanation
        : `${quiz.explanation} 同时保留原文、规则来源和现代解释边界。`,
    })),
    steps: normalizedSteps.map((step, index) => ({
      ...step,
      title: `${TITLES[index]}｜${name}：${['先辨符号', '建立规则', '示范推演', '跟做核对', '迁移复盘'][index]}`,
      body: `${step.body} 本步${name}-${index + 1}复核“${step.body.slice(0, 30)}”，再单列${name}的底本、篇目、注疏、异文、证据与待核项。`,
      objective: step.objective?.length && step.objective.length >= 20
        ? step.objective
        : `能解释“${name}”的符号关系、规则来源和适用边界。`,
      practice: step.practice?.length && step.practice.length >= 28
        ? step.practice
        : `完成“${name}”的符号表、原文卡和一次规则演示，逐项标出篇目、规则来源和待核版本。`,
      checkpoint: step.checkpoint?.length && step.checkpoint.length >= 28
        ? step.checkpoint
        : `检查“${name}”的符号位置、规则依据、原文篇目、版本来源和现代解释边界是否完整。`,
    })),
  };
}

const REMAINING_ZHOUYI: Record<string, string> = {
  河图洛书: '河图洛书是易图传统，必须区分图式、文献来源与后世解释。',
  太极图说: '《太极图说》的作者、版本与无极太极异文需要分别标注。',
  先后天图: '先后天方位是不同图式传统，不能与现代地图混用。',
  卦气纳甲消息: '卦气、纳甲和消息是不同术数规则，须逐项列文献出处。',
  易图辨伪: '图式年代与托名问题要按版本和文献证据判断。',
  历代易图: '历代易图变异要记录图像、题跋、版本和解释传统。',
  '《太极图说》精读：无极而太极': '精读《太极图说》须分原文、异文、注家和现代解释。',
  梅花易数源流: '梅花易数托名邵雍，今本形成与流传需保留争议。',
  梅花起卦: '梅花起卦只作规则演示，须给算法出处和边界。',
  梅花体用: '体用判断是先设规则后的演示，不构成现实预测。',
  六爻纳甲: '六爻纳甲涉及八宫、世应、六亲与干支，算法须可复现。',
  三式: '三式是术数史分类，先讲文献与规则，不提供现实决策指导。',
  杂占: '杂占材料需辨托名、时代与规则，只作文化史阅读。',
  风水总论: '风水阅读区分地形环境观察、象征解释与现实安全边界。',
  形势派: '形势派文本要结合历史地理和建筑证据，不替代专业勘察。',
  '理气派（上）': '理气派规则须给古籍出处，图式与现代空间不可直接等同。',
  八宅与玄空: '八宅与玄空是不同传统，排盘规则和托名争议要分开。',
  阳宅营造: '阳宅课程只做文化解读与安全常识，不提供现实施工方案。',
  命理相法择日: '命理、相法与择日只作历史规则演示，不用于重大现实决策。',
  '《葬书》内篇节选精读：乘生气与风水之名': '《葬书》作者存疑，精读须标版本、注疏与辨伪。',
  易与中医: '易与中医共享古代语汇，但不能用易学替代诊断和治疗。',
  易与丹道历法: '丹道与历法材料须区分原文、托名、注家和现代科学边界。',
  易与数学: '易图与现代数学比较要区分历史影响、结构类比和事后附会。',
  易与文艺传播: '易学对文艺的影响需给具体作品与传播证据。',
  出土易文献: '出土材料须记录编号、释文、年代和与传世本差异。',
  研究方法与引用: '易学研究要区分底本、注疏、现代研究和网络转述。',
  '《周易参同契》节选精读：乾坤门户与丹道': '《周易参同契》精读区分经传、丹道术语、注家和化学现代解释。',
};

export const ZHOUYI_SHUXIANG_REWRITE: CuratedCoursePlanPatchMap = {
  'zhouyi:阴阳爻位': reviewedShuxiang('阴阳爻位', '阴阳爻、上下位、当位、中正和应比关系都必须回到卦体。'),
  'zhouyi:八卦基础': reviewedShuxiang('八卦基础', '八卦由三爻组成，先后天方位与现代象征不可混用。'),
  'zhouyi:六十四卦': reviewedShuxiang('六十四卦', '重卦要区分上下卦、卦名、卦序、错综和变卦层次。'),
  'zhouyi:五行': reviewedShuxiang('五行', '五行生克是关系模型，不能脱离对象和出处宣布现实结论。'),
  'zhouyi:干支甲子': reviewedShuxiang('干支甲子', '干支用于历法与纪时，换算必须给基准和算法证据。'),
  'zhouyi:大衍筮法': reviewedShuxiang('大衍筮法', '大衍筮法只作古籍规则演示，结果不等于对现实的科学预测。'),
  'zhouyi:《说卦传》第一至三章精读：立卦生爻': reviewedShuxiang(
    '《说卦传》第一至三章精读：立卦生爻',
    '《说卦传》取象与卦爻结构须按原文、注疏和版本分层。',
  ),
  'zhouyi:两派六宗': reviewedShuxiang('两派六宗', '四库提要对易学的分类是文献谱系，不等于简单二元对立。'),
  'zhouyi:汉易': reviewedShuxiang('汉易', '汉易需区分象数方法、师承、佚文和后世转述。'),
  'zhouyi:王弼与玄学易': reviewedShuxiang('王弼与玄学易', '王弼注重义理与得意忘象，仍须按具体注文核对。'),
  'zhouyi:唐代注疏': reviewedShuxiang('唐代注疏', '《周易正义》是王弼注与孔颖达疏的综合层，不可混成原文。'),
  'zhouyi:宋易': reviewedShuxiang('宋易', '宋易涵盖图书、义理与心性等多种路径，不能只归为一种学派。'),
  'zhouyi:清与近现代易学': reviewedShuxiang('清与近现代易学', '清代考据和近现代研究需区分校本、解释与出土材料。'),
  ...Object.fromEntries(
    Object.entries(REMAINING_ZHOUYI).map(([name, memorization]) => [
      `zhouyi:${name}`,
      reviewedShuxiang(name, memorization),
    ]),
  ),
};
