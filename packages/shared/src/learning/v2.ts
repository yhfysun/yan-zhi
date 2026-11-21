import { LEARNING_V2_RAW_CATALOG } from './v2-catalog.js';
import { LEARNING_V2_CURATED_PLANS } from './v2-curated/index.js';
import { SUBJECT_EXPERT_NOTES } from './v2-curated/expert-notes.js';
import { ALGORITHM_SUBJECT } from './algorithms.js';
import { MEDICINE_SUBJECT } from './medicine.js';
import { PROGRAMMING_SUBJECT } from './v2-curated/programming/catalog.js';
import { planKey } from './v2-curated/types.js';
import type {
  LearningV2CatalogData,
  LearningV2CoursePlan,
  LearningV2CourseRef,
  LearningV2CuratedCoursePlan,
  LearningV2LibraryEntry,
  LearningV2LessonStep,
  LearningV2PageKey,
  LearningV2Studio,
  LearningV2Subject,
  LearningV2SubjectView,
} from './v2-types.js';

export {
  JAVA_ENTERPRISE_COURSE,
  PROGRAMMING_CURRICULUM_PHASES,
  PROGRAMMING_COURSE_PACKAGES,
  getProgrammingCoursePackage,
} from './v2-curated/programming/programs.js';
export { SUBJECT_EXPERT_NOTES } from './v2-curated/expert-notes.js';
export type {
  ProgrammingCurriculumCourseRef,
  ProgrammingCurriculumPhase,
  ProgrammingCoursePackage,
  ProgrammingCourseStatus,
  ProgrammingLessonOutline,
  ProgrammingStageOutline,
} from './v2-curated/programming/programs.js';
export {
  PROGRAMMING_PROJECTS,
  PROGRAMMING_PROJECT_COURSE_SEEDS,
} from './v2-curated/programming/projects.js';
export type {
  ProgrammingProject,
  ProgrammingProjectKind,
  ProgrammingProjectLevel,
  ProgrammingProjectPhase,
  ProgrammingProjectPhaseMode,
} from './v2-curated/programming/projects.js';
export {
  ALGORITHM_SUBJECT,
  ALGORITHM_TRACKS,
  ALGORITHM_LESSONS,
} from './algorithms.js';
export {
  MEDICINE_SUBJECT,
  MEDICINE_TRACKS,
  MEDICINE_LESSONS,
  MEDICINE_CURATED_PLANS,
} from './medicine.js';
export type {
  AlgorithmLesson,
  AlgorithmTrack,
} from './algorithms.js';
export type {
  MedicineBranch,
  MedicineLesson,
  MedicineTrack,
} from './medicine.js';
export {
  ALGORITHM_CATEGORY_LABELS,
  ALGORITHM_DIFFICULTIES,
  ALGORITHM_PRACTICE_PROBLEMS,
  ALGORITHM_RESOURCE_SITES,
  getAlgorithmProblemById,
} from './algorithm-problems.js';
export type {
  AlgorithmProblem,
  AlgorithmProblemCategory,
  AlgorithmProblemDifficulty,
  AlgorithmResourceSite,
} from './algorithm-problems.js';

const RAW = LEARNING_V2_RAW_CATALOG as unknown as LearningV2CatalogData;

export const LEARNING_V2_PAGES = RAW.pages as readonly {
  readonly key: LearningV2PageKey;
  readonly label: string;
}[];

function flattenCourses(subject: LearningV2Subject): LearningV2CourseRef[] {
  return subject.tracks.flatMap((track, trackIndex) =>
    track.courses.map((course, courseIndex) => ({
      ...course,
      id: `${subject.key}:${trackIndex}:${courseIndex}`,
      subjectKey: subject.key,
      subjectName: subject.name,
      trackName: track.name,
    })),
  );
}

/**
 * 用户可见名称已从“周易”升级为“易学”，内部 key 继续使用 zhouyi，
 * 避免旧会话、链接、本地进度和服务端进度记录失效。
 */
function normalizeSubjectName(subject: LearningV2Subject): LearningV2Subject {
  if (subject.key !== 'zhouyi') return subject;
  return {
    ...subject,
    name: '易学',
    short: '易学',
    line: '以《周易》经传为文本核心，结合历代注疏、现代研究与生活化讲授，练习来源分层、象数规则和解释边界。',
    current: {
      ...subject.current,
      stage: subject.current.stage.replace('周易', '易学'),
    },
  };
}

const SUBJECT_VIEWS: readonly LearningV2SubjectView[] = [
  ...RAW.subjects.map(normalizeSubjectName),
  PROGRAMMING_SUBJECT,
  ALGORITHM_SUBJECT,
  MEDICINE_SUBJECT,
].map((subject) => ({
  ...subject,
  courses: flattenCourses(subject),
}));

const CATALOG = {
  pages: LEARNING_V2_PAGES,
  subjects: SUBJECT_VIEWS,
  courses: SUBJECT_VIEWS.flatMap((subject) => subject.courses),
} as const;

const STUDIO_TASKS: Record<string, (courseName: string) => string> = {
  party: (courseName) => `围绕“${courseName}”选择材料，列出可验证事件、证据与因果链。`,
  politics: (courseName) => `围绕“${courseName}”固定比较变量，完成一张制度或概念比较表。`,
  economics: (courseName) => `围绕“${courseName}”改变一个模型变量，解释图形与现实结论的边界。`,
  military: (courseName) => `围绕“${courseName}”重做一次历史态势判断，并复盘行动代价。`,
  history: (courseName) => `围绕“${courseName}”建立来源卡，完成一次互证与短论证。`,
  calligraphy: (courseName) => `围绕“${courseName}”完成读帖、摹写、叠合对照和第二次临写。`,
  memory: (courseName) => `围绕“${courseName}”完成编码、提取测试与下一次复习安排。`,
  thinking: (courseName) => `围绕“${courseName}”定义状态与约束，画出一次问题模型。`,
  math: (courseName) => `围绕“${courseName}”完成一次图像、代数或证明操作。`,
  physics: (courseName) => `围绕“${courseName}”完成一次测量、作图、模型建立与误差复盘。`,
  schools: (courseName) => `围绕“${courseName}”选择两段原典，先复述再完成概念比较。`,
  english: (courseName) => `围绕“${courseName}”完成听音、拆音、跟读或短句表达。`,
  japanese: (courseName) => `围绕“${courseName}”完成听音、认形、跟读与一次替换造句。`,
  soft: (courseName) => `围绕“${courseName}”拆一个案例，写出约束、方案权衡与结论。`,
  security: (courseName) => `围绕“${courseName}”在授权靶场完成一次识别、复现、修复与回归复盘。`,
  culture: (courseName) => `围绕“${courseName}”完成一次原文诵读、注释核对与对句练习。`,
  music: (courseName) => `围绕“${courseName}”完成四小节试奏、修改与回放。`,
  zhouyi: (courseName) => `围绕“${courseName}”完成原文核对、规则演练、天文历法与地理方位复盘。`,
  medicine: (courseName) => `围绕“${courseName}”完成合成病例观察、中医与西医双路径解释、危险信号复核和就医沟通摘要。`,
  divination: (courseName) => `围绕“${courseName}”完成一次符号观察、牌阵叙事、概率提示与复盘。`,
  programming: (courseName) => `围绕“${courseName}”完成可运行代码、测试、构建、部署观察和失败复盘。`,
  algorithms: (courseName) => `围绕“${courseName}”完成题意建模、手算追踪、代码实现、反例、复杂度证明和基准实验。`,
};

const SUBJECT_SOURCE_URLS: Record<string, string> = {
  party: 'https://www.dswxyjy.org.cn/',
  politics: 'https://plato.stanford.edu/entries/authority/',
  economics: 'https://openstax.org/details/books/principles-economics-3e',
  military: 'https://history.army.mil/',
  history: 'https://ctext.org/histories',
  calligraphy: 'https://commons.wikimedia.org/wiki/Category:Chinese_calligraphy',
  memory: 'https://www.learningscientists.org/',
  thinking: 'https://plato.stanford.edu/entries/logic/',
  math: 'https://openstax.org/details/books/college-algebra-2e',
  physics: 'https://openstax.org/details/books/college-physics-2e',
  schools: 'https://ctext.org/confucianism',
  english: 'https://learnenglish.britishcouncil.org/',
  japanese: 'https://www.nhk.or.jp/lesson/',
  soft: 'https://www.ruankao.org.cn/',
  security: 'https://owasp.org/www-project-top-ten/',
  culture: 'https://ctext.org/',
  music: 'https://www.ihchina.cn/',
  zhouyi: 'https://ctext.org/book-of-changes',
  medicine: 'https://www.who.int/health-topics',
  divination: 'https://www.metmuseum.org/toah/hd/divi/hd_divi.htm',
  programming: 'https://developer.mozilla.org/en-US/docs/Web',
  algorithms: 'https://oi-wiki.org/',
};

const SUBJECT_COMMON_ERRORS: Record<string, readonly string[]> = {
  party: ['只背年代，不说明政策目标、实施条件和结果。', '用一个口号替代具体因果机制。', '把后来评价直接当成当时事实。'],
  politics: ['只背概念名称，不说明适用范围。', '把现实制度硬塞进单一理想类型。', '忽略权力约束、程序与问责。'],
  economics: ['不写假设就直接套模型结论。', '混淆相关、因果和均衡条件。', '只讲效率，不分析分配和外部性。'],
  military: ['用结果倒推所有决策都显而易见。', '只比较总兵力，不看地形、后勤和信息。', '做战例分析时缺少现实伦理边界。'],
  history: ['只看一个来源，不比较形成时间与立场。', '用现代概念直接套古代语境。', '把复杂变化压缩成单一原因。'],
  calligraphy: ['只看字形，不观察起收和结构关系。', '一次修改多个变量，无法判断问题来源。', '把碑刻刀痕直接等同于毛笔书写。'],
  memory: ['把熟悉感当成真正记住。', '一次塞入过多信息，没有提取练习。', '只重复，不根据错误类型调整线索。'],
  thinking: ['把例子数量当成普遍结论。', '只找支持观点的证据，不主动寻找反例。', '概念没有定义就开始争论。'],
  schools: ['只摘一句名言，不看篇章语境。', '用现代政治标签替代原典概念。', '比较不同思想时没有共同维度。'],
  japanese: ['只靠罗马字记忆，不建立假名和声音联系。', '逐词对译，不分析助词和句尾。', '能看懂固定例句，却不会替换成分。'],
  security: ['在未授权目标上测试。', '只记漏洞名称，不说明入口、权限和影响链。', '只改前端，不在服务端复验控制。'],
  zhouyi: ['把后世注文当成卦爻辞原文。', '只追求占断结论，不核对字词和结构。', '把文化解释用于医疗、法律、金融或现实预测。'],
  medicine: ['把课程中的合成病例直接套到真人身上。', '把单个症状、指标或经典条文当作诊断和处方。', '忽略急症、药物相互作用、证据等级与专业转诊边界。'],
  divination: ['先有结论再挑符号。', '把模糊描述和巧合当作命中证据。', '越过文化娱乐边界，替代专业决策。'],
  programming: ['只复制代码，不检查版本、边界和错误路径。', '程序能运行就认为可以发布，没有测试、观测和回滚。', '只会使用框架生成器，不能解释运行时和工具链。'],
  algorithms: ['只背模板，不从输入规模和操作模型推导适用性。', '只测样例，没有最坏、重复、退化输入和反例。', '复杂度分析忽略了隐式复制、哈希退化、递归栈和实现常数。'],
};

function generatedSubjectSteps(
  subjectKey: string,
  courseName: string,
  trackName: string,
  practice: ReturnType<typeof getCoursePracticeTask>,
): LearningV2LessonStep[] {
  const step = (title: string, body: string, note: string) => ({
    title,
    body: body.includes(courseName) ? body : `${courseName}：${body}`,
    note,
  });
  const firstFeature = practice.features[0] || practice.studio.steps[0] || '核心观察记录';
  switch (subjectKey) {
    case 'party':
      return [
        step('历史背景与主要矛盾', `${courseName}需要放回具体历史阶段理解。先记录当时的经济社会条件、政治力量关系、外部环境和需要解决的问题，再判断政策为什么在那个时点出现。`, '背景、矛盾、目标三层先写清'),
        step('关键事件与政策决定', `围绕“${courseName}”建立时间线，区分会议、文件、政策实施和群众行动。每个节点写时间、参与主体、决定内容和材料来源。`, '事件、决定和结果不能混成一句'),
        step('实施机制与组织条件', `政策从决定到结果需要组织、干部、资源和社会动员。分析${trackName}中的执行链条，说明中央与地方、城市与乡村或不同组织之间怎样协作。`, '决定之后还要看执行'),
        step('结果、代价与历史评价', `评价“${courseName}”至少检查短期效果、长期影响、受益与承担成本的人群。把可核事实、历史解释和价值判断分开。`, '结果与评价分开写'),
        step('史料互证与短论证', `至少使用两类材料说明${courseName}：一类记录事件或政策，一类提供统计、回忆或研究解释。写出证据冲突、限制和仍需查证的问题。`, '两类独立材料才能互证'),
      ];
    case 'politics':
      return [
        step('概念边界与问题', `先定义“${courseName}”中的核心概念，说明它回答的是权力、权利、合法性、制度还是公共选择问题，并列出容易混淆的近邻概念。`, '概念先定义再比较'),
        step('制度结构与行动者', `把${courseName}拆成规则、职位、行动者和资源。说明谁作决定、谁执行、谁被影响，以及有哪些正式与非正式约束。`, '规则、角色、资源分开'),
        step('比较案例与共同维度', `选择两个${trackName}案例，用相同维度比较：目标、授权、决策程序、执行能力、问责和权利保障。不能只比较制度名称。`, '用同一维度比较'),
        step('反例与制度风险', `为${courseName}寻找一个反例，检查效率是否损害权利、程序是否流于形式、执行是否被俘获。反例要能说明理论在什么条件下失效。`, '理论必须写失效条件'),
        step('形成有范围的政策判断', `结论写明适用对象、时期、证据和规范标准。说明哪种解释最强、哪种价值冲突仍无法消除，以及需要补充什么数据。`, '判断要有范围和代价'),
      ];
    case 'economics':
      return [
        step('模型目标与假设', `分析${courseName}先确定参与者、目标、约束和市场范围。列出“其他条件不变”等关键假设，说明没有这些假设模型会怎样变化。`, '目标、约束、假设先写'),
        step('变量关系与图形', `把${courseName}的核心变量放进关系图或坐标图，区分沿曲线变化和曲线移动。每一步变化只改一个条件，并写出预期方向。`, '先单变量，再多变量'),
        step('效率、分配与激励', `政策或市场结果不仅看总效率，还要看成本由谁承担、收益由谁获得、激励如何改变。使用“${firstFeature}”记录一个具体案例。`, '效率与分配一起看'),
        step('现实偏差与数据检验', `现实中的信息成本、垄断、外部性、制度和行为偏差可能让模型偏离。选择一项数据或案例，说明偏差方向和证据限制。`, '模型结论必须回到数据'),
        step('规范判断与政策边界', `区分实证结论“会发生什么”和规范判断“应该怎么做”。为${courseName}写一条有条件政策建议，列出受益者、承担者、成本和失败条件。`, '实证与规范分开'),
      ];
    case 'military':
      return [
        step('政治目标与战略层级', `${courseName}先区分政治目标、战略目标、战役行动和战术动作。说明行动要改变什么，以及不同层级成功为何不能互相替代。`, '目的、战役、战术分层'),
        step('态势、兵力和地形', `建立${trackName}态势图，标出双方兵力、位置、补给、地形、情报和行动半径。总数之外还要看局部比例与机动条件。`, '地图和后勤先于胜负'),
        step('决策过程与不确定性', `复盘${courseName}时写出当时可获得的信息、通信延迟、组织摩擦和可能选择。不能把战后已知结果塞回决策者脑中。`, '区分当时信息与事后知识'),
        step('结果、代价与反事实', `比较行动结果、伤亡、资源消耗和政治影响，提出一个受证据约束的反事实：如果关键条件改变，结果可能怎样不同。`, '反事实不能随意改写'),
        step('历史复盘与现实边界', `把${courseName}写成历史分析，不提供现实攻击目标、武器制作或行动指导。讨论军民关系、伦理和公开史料限制。`, '只做历史与安全教育'),
      ];
    case 'history':
      return [
        step('时间线与问题范围', `为${courseName}划出起止时间、空间范围和关键行动者。先建立 chronology，再讨论变化与延续，避免把不同时期混成一个结论。`, '时间、空间、行动者先定'),
        step('史料来源与形成语境', `收集与${courseName}相关的文献、实物、统计或口述材料，记录作者、时间、目的和保存过程。不同证据功能不能互换。`, '来源信息决定证据重量'),
        step('原因、机制与比较', `解释${courseName}时区分长期结构、直接触发和行动选择。用比较案例或反事实检查哪些条件真正改变结果。`, '长期、触发、行动分层'),
        step('不同群体与历史经验', `从统治者、基层、城市、乡村、性别或区域等角度检查${courseName}的影响。总体趋势不能抹掉成本与经验差异。`, '总体变化要落到群体'),
        step('写成可追溯历史论证', `结论包含主张、两类证据、推理、反例和证据缺口。说明${courseName}中哪些判断较稳定，哪些仍依赖解释框架。`, '论证必须能回到来源'),
      ];
    case 'calligraphy':
      return [
        step('读帖与版本', `学习${courseName}先确认碑帖或墨迹版本，比较原字的大小、外轮廓、重心和章法。区分书写形态与刻石、传拓造成的细节。`, '先看整体关系，再看局部'),
        step('关键笔画与结构', `从${courseName}中选出三处关键笔画，标出起笔、行笔、收笔和与相邻部件的关系。用线和边界框记录，不直接抄字形。`, '笔画功能服从结构'),
        step('单变量临写', `第一遍按外轮廓，第二遍只改一个笔画或结构变量。每次保留作品并与范字并排，记录具体偏差。`, '一次只改一个变量'),
        step('叠合对照与修正', `将临写与范字按重心和边界框叠合。先看整体宽高、重心和空间，再看局部起收，按层级修正。`, '先整体后局部'),
        step('形成下一遍目标', `根据${firstFeature}写一条可执行反馈：改哪个字、哪个位置、哪一笔以及怎样改。下一遍只验证这一项。`, '反馈必须落到下一笔'),
      ];
    case 'memory':
      return [
        step('材料分析与分块', `整理${courseName}需要记住的材料，先按意义、结构和难度分块。每块保持可提取，不把长串内容一次塞入工作记忆。`, '先分块，再做编码'),
        step('建立独特编码', `为每个节点选择图像、动作、声音或关键词线索，并写明它与原信息的关系。${firstFeature}必须能还原原内容。`, '线索要独特且可还原'),
        step('无提示提取测试', `关闭材料，按顺序回忆${courseName}，记录漏项、错序、停顿和串项。熟悉感不算掌握，必须实际输出。`, '不看材料完成提取'),
        step('按错误类型修线索', `漏项通常修图像强度，错序修路径，串项修区分度。先定位最早断掉的节点，只重做问题节点，再用一次完整提取检查修改是否有效，不整段重复抄写。`, '不同错误用不同修复'),
        step('间隔复习与迁移', `安排当天、次日和一周后的提取测试，比较错误分布。把${courseName}迁移到新例子，检查方法与内容是否都能使用。`, '间隔、测试、迁移一起做'),
      ];
    case 'thinking':
      return [
        step('定义概念与问题', `处理${courseName}先给关键词下工作定义，列出边界案例和相邻概念。定义不清时，后面的证据和结论无法比较。`, '概念、边界、问题先写'),
        step('写出论证结构', `把${courseName}写成结论、理由和隐藏假设。检查理由是否相关、是否足够，以及结论强度有没有超过证据。`, '结论强度匹配证据'),
        step('构造正例与反例', `为正反两种判断各找一个最强案例，再寻找能推翻过度概括的反例。反例要说明原结论需要增加什么条件。`, '主动寻找最强反例'),
        step('检查常见谬误', `检查${courseName}是否出现相关当因果、以偏概全、虚假二分或循环论证。指出错误发生在哪个推理步骤。`, '谬误要定位到推理步骤'),
        step('迁移到新情境', `保留${courseName}的推理结构，换一个生活或学科情境重新使用。说明哪些表面特征改变，哪些逻辑关系仍然有效。`, '迁移结构，不搬表面词'),
      ];
    case 'schools':
      return [
        step('原典语境与关键词', `学习${courseName}先核对篇章、版本和关键词原义。引用原句时保留上下文，不能用现代标签替代古代概念。`, '原句、篇章、版本可回查'),
        step('核心论证与概念关系', `把${courseName}拆成问题、核心主张、理由和例子。区分思想家原话与后来注家、现代研究的解释。`, '原话与解释分层'),
        step('与相邻思想比较', `选择两个共同维度，如秩序来源、人性假设、权力限制或理想生活，比较${courseName}与其他流派。`, '共同维度下比较'),
        step('历史语境与制度后果', `把${courseName}放回当时政治、社会和知识环境，讨论它在历史中如何被使用、改造和批评。`, '思想要放回历史场景'),
        step('现代应用与边界', `把${courseName}迁移到当代问题时，明确哪些概念可类比、哪些制度条件不同，不把古代方案直接当现代政策答案。`, '类比必须写不可比部分'),
      ];
    case 'japanese':
      return [
        step('形式、读音与意义', `学习${courseName}先记录日语形式、假名读音和中文意义。${firstFeature}要拆到助词、词尾和语序，不只写整句翻译。`, '形、音、义一起记'),
        step('句法位置与助词', `分析${courseName}中的名词、形容词或动词如何由助词和活用连接。替换一个成分，检查句子意义和助词是否仍成立。`, '换成分后重新检查'),
        step('场景例句与语体', `为${courseName}写正式与日常两组例句，说明敬语、时态、肯定否定和说话对象。不能只背固定模板。`, '场景决定语体和礼貌度'),
        step('听读输入与辨义', `用短对话或短文定位${courseName}，先听关键词和句尾，再核对文字。记录漏听、误解和生词。`, '先抓结构，再补细节'),
        step('输出与纠错', `完成一次替换造句或短对话，录音后检查助词、活用、语序和发音。把${courseName}迁移到新场景再测一次。`, '输出后按四项纠错'),
      ];
    case 'security':
      return [
        step('资产、威胁与授权边界', `分析${courseName}先画资产、主体、入口和信任边界，明确测试只发生在自有或书面授权范围。记录禁止操作和停止条件。`, '先授权，再测试'),
        step('风险路径与控制点', `把${courseName}拆成输入、权限、存储、输出和依赖链，找出可能失败的控制点。漏洞名称不能替代具体影响链。`, '入口、权限、数据、影响'),
        step('最小复现与证据', `在隔离靶场验证${courseName}，只采集证明问题所需的最小证据。记录请求、响应、角色、时间和限制。`, '最小范围、最小数据'),
        step('修复方案与工程权衡', `从服务端校验、权限、编码、监控和依赖治理设计修复，说明兼容性、性能和发布成本。修复要覆盖根因及同类入口，并给出上线前的回滚条件。`, '修复要覆盖根因和同类入口'),
        step('正反回归与复盘', `验证攻击路径被阻断、正常业务可用、相关接口采用同一策略。把${courseName}写进检测规则和回归测试。`, '阻断风险且不破坏正常流程'),
      ];
    case 'zhouyi':
      return [
        step('原文与版本', `学习${courseName}先核对卦爻辞、传文和所用底本，逐句记录异文与难字。后世注文不能混入原文。`, '第一层：原文可回查'),
        step('字词与句读', `为${courseName}中的关键词标注本义、语境义和读音，结合句读、异文和前后句确定当前含义，先解决一句之内的问题，再扩展整章。`, '第二层：字词有依据'),
        step('经传与结构', `区分卦爻辞、《彖》《象》《文言》和其他传文的功能，标出爻位、上下关系和篇章结构。`, '第三层：经传不混写'),
        step('注家与解释路径', `选择至少两家公版注本解释${courseName}，写清关键词、象数或义理依据与结论，不用“意思相近”抹平差异。`, '第四层：注家、时代、论证'),
        step('历史语境与流派', `把${courseName}放回两派六宗、汉宋易学或出土文献背景，记录作者、时代、所用底本和解释目的，说明解释为何随知识条件与问题意识变化。`, '第五层：解释史不可省略'),
        step('自测与文化边界', `完成一条原文、字词、注家和个人按语分层自测。${courseName}只作文化学习，不构成医疗、法律、金融或现实预测建议。`, '第六层：来源标签与边界'),
      ];
    case 'divination':
      return [
        step('历史来源与文化语境', `学习${courseName}先确认时代、地区、文本或图像来源，说明实践在何种社会场景中使用，不用一个现代标签覆盖所有传统。`, '来源、时代、场景先写'),
        step('符号系统与规则', `把${courseName}的符号、排列、运算或牌阵规则写成可复算步骤。规则变化时保留版本，不能抽完再改解释。`, '规则先固定，解释后展开'),
        step('观察、抽取与记录', `围绕${courseName}完成一次低风险文化练习，逐项记录图像、结果、第一解释、替代解释和现实行动。`, '原始记录不可事后修改'),
        step('概率、心理与替代解释', `检查${courseName}中的随机波动、巴纳姆效应、确认偏误和事后合理化，为同一结果写出一个竞争性解释。`, '至少保留一个替代解释'),
        step('伦理边界与复盘', `把${courseName}转成可执行现实行动，涉及健康、法律、金融或安全时转向专业帮助。延迟复盘只看原始记录和反证。`, '文化娱乐不替代专业决策'),
      ];
    default:
      return Array.from({ length: 5 }, (_, index) => step(
        `${practice.studio.steps[index] || practice.features[index] || `第 ${index + 1} 阶段`}`,
        `围绕“${courseName}”完成${practice.studio.steps[index] || firstFeature}，记录输入、操作、结果和需要回查的材料。`,
        `${trackName} · ${practice.output}`,
      ));
  }
}

export function getLearningV2Catalog(): typeof CATALOG {
  return CATALOG;
}

export function getLearningV2Subjects(): readonly LearningV2SubjectView[] {
  return SUBJECT_VIEWS;
}

export function getLearningV2Subject(key: string): LearningV2SubjectView | undefined {
  return SUBJECT_VIEWS.find((subject) => subject.key === key);
}

export function isLearningV2CourseReady(subjectKey: string, courseName: string): boolean {
  const subject = getLearningV2Subject(subjectKey);
  if (!subject) return false;
  return subject.courses.some((course) => course.name === courseName);
}

export function getCoursePracticeTask(subjectKey: string, courseName: string): {
  courseName: string;
  task: string;
  output: string;
  boundary: string;
  features: readonly string[];
  studio: LearningV2Studio;
} {
  const subject = getLearningV2Subject(subjectKey);
  if (!subject) throw new Error(`unknown learning subject: ${subjectKey}`);
  const taskFactory = STUDIO_TASKS[subjectKey];
  return {
    courseName,
    task: taskFactory
      ? taskFactory(courseName)
      : `围绕“${courseName}”完成一次${subject.studio.type}。`,
    output: subject.studio.output,
    boundary: subject.studio.boundary,
    features: subject.studio.features,
    studio: subject.studio,
  };
}

function enrichReviewedSteps(
  plan: LearningV2CuratedCoursePlan,
  courseName: string,
): LearningV2LessonStep[] {
  return plan.steps.map((step, index) => {
    const finalStep = index === plan.steps.length - 1;
    const independentStep = index === plan.steps.length - 2;
    const guidedStep = index === 2;
    const practice = step.practice
      ?? (guidedStep
        ? plan.guidedPractice
        : independentStep
          ? plan.independentPractice
          : finalStep
            ? `把引导练习和独立练习合并成一份可提交的“${courseName}”学习记录：至少包含一条证据或操作结果、一处适用边界和一个仍待核问题。`
            : `围绕“${step.title}”写下三行记录：观察到什么、依据是什么、还可能错在哪里。`);

    return {
      ...step,
      objective: step.objective ?? `本步要能说清：${step.note}`,
      practice,
      checkpoint: step.checkpoint
        ?? `关闭提示，用“主张—依据—边界”三句话复述“${step.note}”。再指出一个可能的反例或需要回查的来源。`,
    };
  });
}

export function getLearningV2CoursePlan(subjectKey: string, courseName: string): LearningV2CoursePlan {
  const subject = getLearningV2Subject(subjectKey);
  if (!subject) throw new Error(`unknown learning subject: ${subjectKey}`);
  const course = subject.courses.find((item) => item.name === courseName);
  if (!course) throw new Error(`unknown course: ${subjectKey}/${courseName}`);
  const sameTrack = subject.courses.filter((item) => item.trackName === course.trackName);
  const courseIndex = sameTrack.findIndex((item) => item.name === course.name);
  const previous = courseIndex > 0 ? sameTrack[courseIndex - 1] : null;
  const practice = getCoursePracticeTask(subjectKey, courseName);
  const curated = LEARNING_V2_CURATED_PLANS[planKey(subjectKey, courseName)];
  const fallbackSteps = course.name === subject.current.course
    ? subject.lesson.steps
    : generatedSubjectSteps(subjectKey, courseName, course.trackName, practice);
  const selectedSteps = curated
    ? enrichReviewedSteps(curated, courseName)
    : fallbackSteps;

  return {
    subjectKey,
    courseName,
    trackName: course.trackName,
    title: course.name,
    prerequisite: curated?.prerequisite
      ?? (previous
        ? `先完成同阶段课程“${previous.name}”。`
        : '从零基础起步；只要求会阅读本页例子，不要求预先掌握术语。'),
    plainLanguageGoal: curated?.plainLanguageGoal
      ?? `学完“${course.name}”后，能用自己的话解释核心概念，并完成本课实践产出（${practice.output}）。`,
    guidedPractice: curated?.guidedPractice
      ?? `按“${practice.studio.steps.join(' → ')}”跟做一遍，允许查看提示。`,
    independentPractice: curated?.independentPractice ?? practice.task,
    commonErrors: curated?.commonErrors
      ?? SUBJECT_COMMON_ERRORS[subjectKey]
      ?? [
        '只记住结论，不能说明依据或适用条件。',
        '跳过基础步骤，直接套用未理解的方法。',
      ],
    sourceRefs: curated?.sourceRefs ?? [
      `科目公开资料入口：${SUBJECT_SOURCE_URLS[subjectKey] || subject.book.source}`,
      `${subject.book.title}：${subject.book.source}`,
      `本科目实践边界：${practice.boundary}`,
    ],
    qualityStatus: curated !== undefined ? 'curated' : 'generated',
    steps: selectedSteps,
    expertNotes: curated?.expertNotes ?? SUBJECT_EXPERT_NOTES[subjectKey] ?? [],
  };
}

export function getLearningV2Library(subjectKey?: string): readonly LearningV2LibraryEntry[] {
  return SUBJECT_VIEWS
    .filter((subject) => !subjectKey || subject.key === subjectKey)
    .flatMap((subject) =>
      subject.book.shelf.map((title, index) => {
        const readable = index === 0;
        return {
          id: `${subject.key}:${index}`,
          subjectKey: subject.key,
          subjectName: subject.name,
          title,
          kind: readable ? subject.book.kind : '书目登记',
          original: readable ? subject.book.original : '该书目已登记，原文与版本按许可状态接入。',
          translation: readable ? subject.book.translation : '',
          source: readable ? subject.book.source : '版本与许可信息待核验',
          readable,
        };
      }),
    );
}
