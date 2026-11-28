import type {
  LearningV2CuratedCoursePlan,
  LearningV2EventDetail,
  LearningV2Practice,
  LearningV2StudyPoint,
} from '../../v2-types.js';
import type { CuratedCoursePlanPatchMap } from '../types.js';

type CourseSeed = Omit<LearningV2CuratedCoursePlan, 'contentStatus'>;

const point = (
  label: LearningV2StudyPoint['label'],
  text: string,
  stepIndex: number,
): LearningV2StudyPoint => ({ label, text, stepIndex });

const question = (
  prompt: string,
  correct: string,
  distractors: readonly [string, string, string],
  answer: number,
  explanation: string,
  focus: string,
): LearningV2Practice => {
  const options = [...distractors];
  options.splice(answer, 0, correct);
  return {
    prompt,
    options,
    answer,
    explanation: `${explanation}，并用任务要求和录音或文本证据复核。`,
    focus,
  };
};

const source = (
  id: string,
  title: string,
  issuer: string,
  date: string,
  url: string,
  usedFor: string,
) => ({ id, title, issuer, date, url, usedFor });

const course = (seed: CourseSeed): LearningV2CuratedCoursePlan => ({
  contentStatus: 'reviewed',
  ...seed,
});

const IELTS_ARCHIVE = {
  id: 'english-ielts-four-criteria',
  kind: 'concept',
  title: '雅思任务链：从图表概述到口语录音复盘',
  period: 'IELTS Academic 分项训练',
  summary:
    '雅思训练按 Task 1 数据概述、Task 2 论证展开、口语三部分互动和四项评分分项推进。每次输出都配任务回应、组织、词汇、语法与发音证据，避免只看总分。',
  background:
    '四六级分数不能推算雅思成绩，背整段口语答案也不能应对追问。学习者需要分别记录任务回应、组织、词汇、语法范围与准确性，以及口语的流利度和可理解度。',
  timeline: [
    {
      date: '诊断',
      title: '四项任务分别测，不先合成总分',
      body: '听力、阅读、写作和口语按题型与评分维度分别记录。先找最影响目标的一项，再决定训练组合；单次总分无法说明问题发生在定位、表达还是互动。',
      sourceIds: ['ielts-academic', 'bc-prepare'],
    },
    {
      date: 'Task 1',
      title: '先写总体趋势，再分组比较',
      body: '图表题用一句话概述最显著趋势或差异，再按上升、下降、稳定或高低分组。只引用能支持比较的数字，不逐点抄表，也不推测图表没有给出的原因。',
      sourceIds: ['ielts-academic', 'bc-writing'],
    },
    {
      date: 'Task 2',
      title: '逐问回应，每段推进一个理由',
      body: '先确认题目每一问，再给明确立场和不同理由。例子要解释机制或后果，让步后仍回到自己的判断。高级词不能弥补题目回应不全或论证空洞。',
      sourceIds: ['purdue-argument', 'bc-writing'],
    },
    {
      date: '口语',
      title: 'Part 1 直接回答，Part 2 按提示卡展开',
      body: 'Part 1 用直接回答加原因，Part 2 用提示卡关键词组织两分钟独白，Part 3 把具体现象提升到原因、影响和比较。三部分都需要回应问题，而不是背诵同一段答案。',
      sourceIds: ['ielts-academic', 'bc-prepare'],
    },
    {
      date: '录音',
      title: '录音同时看内容、流利度和可理解度',
      body: '复盘录音先看是否覆盖要点，再看停顿是否影响理解、重音和意群是否清楚。口音不是扣分点，关键信息漏失和无法继续交流才是主要问题。',
      sourceIds: ['bc-prepare', 'bc-writing'],
    },
    {
      date: '评分',
      title: '四项评分分别找最强和最弱证据',
      body: '每篇或每次录音注明任务回应、连贯衔接、词汇资源、语法范围与准确性；口语再加入流利度与发音。下一轮只设一两个可观察目标，用新任务验证。',
      sourceIds: ['ielts-academic', 'purdue-argument'],
    },
  ],
  outcome:
    '可观察结果是完成一份 Task 1、一份 Task 2、一轮三部分口语录音，并按四项评分写出分项修正目标。',
  significance:
    '分项证据让雅思训练从“刷整套”转为对任务回应和可理解度的连续改进。',
  sourceCards: [
    source(
      'ielts-academic',
      'IELTS Academic test',
      'IELTS',
      '2026 年访问版',
      'https://ielts.org/take-a-test/test-types/ielts-academic-test',
      '核对学术类考试任务与评分信息入口。',
    ),
    source(
      'bc-prepare',
      'Prepare for IELTS',
      'British Council IELTS',
      '2026 年访问版',
      'https://takeielts.britishcouncil.org/take-ielts/prepare',
      '核对分项练习、口语与写作准备材料。',
    ),
    source(
      'bc-writing',
      'Writing',
      'British Council LearnEnglish',
      '2026 年访问版',
      'https://learnenglish.britishcouncil.org/skills/writing',
      '核对写作组织、修改和读者意识。',
    ),
    source(
      'purdue-argument',
      'Argumentative Essays',
      'Purdue Online Writing Lab',
      '2026 年访问版',
      'https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/argumentative_essays.html',
      '核对 Task 2 论点、让步、反驳和证据。',
    ),
  ],
} satisfies LearningV2EventDetail;

const IELTS_SOURCES = [
  'IELTS, IELTS Academic test。https://ielts.org/take-a-test/test-types/ielts-academic-test',
  'British Council IELTS, Prepare for IELTS。https://takeielts.britishcouncil.org/take-ielts/prepare',
  'British Council LearnEnglish, Writing。https://learnenglish.britishcouncil.org/skills/writing',
  'Purdue Online Writing Lab, Argumentative Essays。https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/argumentative_essays.html',
];

const TOEFL_ARCHIVE = {
  id: 'english-toefl-information-relations',
  kind: 'concept',
  title: '托福任务链：讲座结构、材料关系与短时输出',
  period: 'TOEFL iBT 分项训练',
  summary:
    '托福训练按学术讲座结构笔记、阅读段落功能、综合写作的阅读与听力关系、学术讨论写作和口语时间分配推进。输出先保信息准确，再优化语言。',
  background:
    '逐词记讲座会漏掉结构和转折，综合写作加入个人观点会改变任务，短时口语追求复杂句又常丢掉关键关系。先画信息结构，再做限时表达，才能稳住内容。',
  timeline: [
    {
      date: '讲座',
      title: '学术讲座按主题、定义、例证和转折记',
      body: '笔记只写结构信号和关键词：主题、分类、定义、原因、例子、对比与结论。听到 however、for example 或 in contrast 时调整层级，不试图记录完整句子。',
      sourceIds: ['ets-content', 'bc-listening'],
    },
    {
      date: '阅读',
      title: '先看段落在材料中承担什么功能',
      body: '阅读段落可能提出主张、给证据、让步或限定。综合任务需要保留这些功能，再与讲座逐点对应；段落中读懂的细节不能脱离它在材料中的任务。',
      sourceIds: ['ets-content', 'purdue-academic'],
    },
    {
      date: '综合',
      title: '综合写作逐点呈现阅读与听力关系',
      body: '每个讲座要点要对应它真正回应的阅读主张，可能是否定、替代解释或程度削弱。概括双方时不加入个人立场，也不要把相邻例子合并成不存在的反驳。',
      sourceIds: ['ets-content', 'ets-prepare'],
    },
    {
      date: '讨论',
      title: '学术讨论先给立场，再用机制清楚的例子',
      body: '短时间先直接回应问题，再选一个能展开的理由，用具体场景说明它如何成立，并回应已有同学观点。抽象名词不能代替因果或过程。',
      sourceIds: ['ets-prepare', 'purdue-academic'],
    },
    {
      date: '口语',
      title: '独立题先立场，综合题先材料关系',
      body: '独立口语先立场后两个理由，综合口语先用一句话概括材料，再说明支持、反驳或替代关系。准备时间只写关键词和箭头，不写逐字稿。',
      sourceIds: ['ets-content', 'bc-listening'],
    },
    {
      date: '复盘',
      title: '按信息覆盖与时间分配回听回读',
      body: '录音先查是否覆盖题目和关系，再看停顿与清晰度；作文先查阅读与听力是否逐点对应，再查语法和拼写。下一轮只改最影响理解的一两项。',
      sourceIds: ['ets-prepare', 'purdue-academic'],
    },
  ],
  outcome:
    '可观察结果是完成一段学术讲座笔记、一篇综合写作、一段学术讨论写作和一组口语回答，并记录信息关系与时间分配。',
  significance:
    '托福的核心不是背模板，而是迅速恢复材料结构并在限时内准确表达关系。',
  sourceCards: [
    source(
      'ets-content',
      'TOEFL iBT Test Content',
      'ETS',
      '2026 年访问版',
      'https://www.ets.org/toefl/test-takers/ibt/about/content.html',
      '核对阅读、听力、口语和写作任务构成。',
    ),
    source(
      'ets-prepare',
      'TOEFL iBT Test Prep',
      'ETS',
      '2026 年访问版',
      'https://www.ets.org/toefl/test-takers/ibt/prepare.html',
      '核对官方练习、时间与任务准备材料。',
    ),
    source(
      'purdue-academic',
      'Academic Writing',
      'Purdue Online Writing Lab',
      '2026 年访问版',
      'https://owl.purdue.edu/owl/general_writing/academic_writing/index.html',
      '核对学术写作组织、证据和读者。',
    ),
    source(
      'bc-listening',
      'Listening',
      'British Council LearnEnglish',
      '2026 年访问版',
      'https://learnenglish.britishcouncil.org/skills/listening',
      '核对学术听力结构笔记与关系判断。',
    ),
    source(
      'bc-writing',
      'Writing',
      'British Council LearnEnglish',
      '2026 年访问版',
      'https://learnenglish.britishcouncil.org/skills/writing',
      '核对限时写作组织与修改。',
    ),
  ],
} satisfies LearningV2EventDetail;

const TOEFL_SOURCES = [
  'ETS, TOEFL iBT Test Content。https://www.ets.org/toefl/test-takers/ibt/about/content.html',
  'ETS, TOEFL iBT Test Prep。https://www.ets.org/toefl/test-takers/ibt/prepare.html',
  'Purdue Online Writing Lab, Academic Writing。https://owl.purdue.edu/owl/general_writing/academic_writing/index.html',
  'British Council LearnEnglish, Listening。https://learnenglish.britishcouncil.org/skills/listening',
  'British Council LearnEnglish, Writing。https://learnenglish.britishcouncil.org/skills/writing',
];

export const ENGLISH_INTERNATIONAL_REWRITE: CuratedCoursePlanPatchMap = {
  'english:雅思': course({
    prerequisite:
      '达到约 B1-B2 英语水平，能读中等长度文章并完成基础议论文。',
    plainLanguageGoal:
      '学完后，你能按 IELTS Academic 任务完成图表概述、Task 2 论证、三部分口语回答和四项评分复盘。',
    guidedPractice:
      '写一份图表概述和一篇 Task 2 主体段，录音完成 Part 1 与 Part 2，并按四项评分各找一条证据。',
    independentPractice:
      '完成一套写作与口语小练，记录任务回应、组织、词汇、语法、发音和流利度，并制定下一轮两个目标。',
    commonErrors: [
      '用四六级分数直接推算雅思成绩，不记录四项任务差异。',
      'Task 1 逐点抄数字，没有总体趋势和分组比较。',
      '口语背诵整段答案，遇到追问无法继续交流。',
    ],
    sourceRefs: IELTS_SOURCES,
    studyPoints: [
      point(
        '必背',
        'Task 1 先给总体趋势或显著差异，再分组比较关键数据；Task 2 必须逐问回应并用理由和例子展开。',
        1,
      ),
      point(
        '重点',
        '口语 Part 1 直接回答加原因，Part 2 按提示卡扩展，Part 3 讨论原因、影响和比较，不能三部分共用一段背诵。',
        2,
      ),
      point(
        '易错',
        '口音不等于发音错误；复盘应关注关键信息是否清楚、意群和重音是否可理解、交流能否继续。',
        3,
      ),
      point(
        '考点',
        '四项评分分别看任务回应、连贯衔接、词汇资源和语法范围与准确性，口语再加入流利度与发音。',
        4,
      ),
    ],
    eventDetails: [IELTS_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜为什么背完整答案仍不会考试',
        body: '先做前测：用中文列 IELTS Academic 听说读写四项各一个任务，再完成一道图表概述、一个 Task 2 开头和一轮 Part 1 录音。听一段 Part 3 追问，记录自己的回答是否只重复背诵。变式把 Part 1 问题换一个对象，观察答案能否自然调整。反例是用四六级分数估计雅思，并把口语答案写成整篇作文背诵。后测对照录音标出一个内容漏点、一个停顿位置和一个可理解度问题，再用中文写三项修正动作，并纠正一处把“口音”当成唯一发音问题的判断。',
        note: '四项任务分别留证据。',
        objective: '能诊断雅思任务回应、口语互动和分项评分的起点。',
        practice: '完成四项任务清单、图表概述、Task 2 开头、Part 1 录音和三项修正。',
        checkpoint: '检查任务识别、图表概述、立场回应、口语互动、发音可理解度和修正动作。',
      },
      {
        title: '材料与概念｜图表概述、论证展开与口语三部分',
        body: 'Task 1 先写总体趋势或最显著差异，再按时间段、对象或变化方向分组比较，只引用支持比较的数据。Task 2 先确认题目每一问，再用两个主体段分别推进理由，例子要说明机制或后果，让步后仍回到立场。口语 Part 1 直接回答加一个原因，Part 2 借提示卡关键词组织两分钟独白，Part 3 把具体现象提升到原因、影响、比较和条件。四项评分要分开记录任务回应、连贯衔接、词汇资源、语法范围与准确性；口语再加入流利度与发音。中文对照用于核查意思，但不能把整段答案翻译后背诵。',
        note: '任务要求先于高级表达。',
        objective: '能解释 Task 1、Task 2、口语三部分和四项评分的可观察要求。',
        practice: '为一张图表列概述与两组数据，为一道 Task 2 列两个理由，为口语三部分各写提纲。',
        checkpoint: '检查总趋势、分组、数据依据、逐问回应、口语互动、评分维度和中文意思。',
      },
      {
        title: '示范与推导｜从图表趋势到两分钟口语',
        body: '示范图表：总体访客数上升，但周末与工作日增幅不同，先写总趋势，再分别比较两个时段，不推测原因。示范 Task 2 主体段：先给理由，再用具体场景解释，最后限定适用范围。示范 Part 2 提示卡只写时间、地点、人物、过程和感受五个关键词，按“背景—过程—结果—意义”展开，而不是背完整句。Part 3 追问再问原因时，用 because、this is partly due to 和 however 引入条件。反例是 Task 1 逐月抄数字、口语 Part 2 只写高级词。变式把图表时间范围缩短，检查概述是否仍准确，并纠正一处无法回指的口语指代。',
        note: '关键词支撑表达，不替代真实交流。',
        objective: '能示范图表概述、论证主体段和口语提示卡扩展。',
        practice: '完成图表概述、一个 Task 2 主体段、Part 2 关键词卡和一段 Part 3 追问。',
        checkpoint: '检查概述准确、比较分组、理由有例子、口语覆盖要点、指代清楚和录音可理解。',
      },
      {
        title: '引导练习｜写作与口语四联练',
        body: '先做前测分配时间：Task 1 用几分钟规划和检查，Task 2 先列立场与两段理由，口语 Part 1 直接回答，Part 2 准备关键词，Part 3 准备原因与比较。完成一份图表概述、一篇 Task 2 短文、Part 1 三问和三分钟 Parts 2–3 录音。后测按任务回应、连贯衔接、词汇资源、语法范围录音复评；听回自己的回答，标出一次内容漏点、一次停顿过长和一次重音不清。变式缩短准备时间，观察提纲是否仍能支持回答。反例是 Task 2 只写观点没有例子，口语只背模板。最后纠正一处任务遗漏并记录下一轮动作。',
        note: '每轮都留分项证据。',
        objective: '能在写作与口语限时任务中覆盖要点并完成四项评分复盘。',
        practice: '提交 Task 1、Task 2、三问 Part 1、Parts 2–3 录音、四项评分和三项修正。',
        checkpoint: '检查图表概述、逐问回应、例子、口语互动、流利度、发音和修正具体性。',
      },
      {
        title: '独立迁移与评价｜建立下一轮雅思训练组合',
        body: '独立完成一组 IELTS Academic 小练：一份图表报告、一篇 Task 2、完整口语三部分录音。先做前测按四项评分记录起点，再给每项写一条最强证据和一条待改证据。朗读或重听录音检查意群，24 小时后换图表或题目重做同一结构。反例是把下一轮目标写成“提高口语”，没有场景、时长和可观察标准。最后设两个目标，例如“Part 2 两分钟内覆盖四个提示点”和“Task 2 每段用一个例子解释理由”，并写明材料、次数与检查标准。',
        note: '目标必须能在下一次任务中验证。',
        objective: '能迁移雅思分项方法，独立形成可执行的四项评分训练计划。',
        practice: '提交 Task 1、Task 2、口语录音、四项评分、24 小时变式和两个可验证目标。',
        checkpoint: '五项自评：任务回应完整、组织清楚、词汇准确、语法可读、口语可理解；否则重做。',
      },
    ],
    quiz: [
      question(
        'IELTS Task 1 最合理的开头任务是什么？',
        '用一句话概述总体趋势或最显著差异',
        ['逐月列出所有数字', '解释图表没有提供的原因', '先写个人对图表的评价'],
        0,
        'Task 1 需要概述主要特征，再分组比较数据。逐点抄数字会失去总体关系，推测原因也超出图表证据。',
        '事实与定义',
      ),
      question(
        'Task 2 哪个主体段安排最清楚？',
        '一段推进一个理由，用具体例子解释机制并回收立场',
        ['一段列五个互不相关的理由', '全部段落只重复同义立场', '先写让步，再完全不回应自己的观点'],
        1,
        '主体段需要清楚的中心和证据链。一个段落只推进一个主要理由，例子要说明为什么支持它，段落结尾再回到任务问题。',
        '材料与推导',
      ),
      question(
        '口语 Part 2 提示卡准备最有效的记录是什么？',
        '时间、地点、人物、过程、结果和感受等关键词',
        ['逐字写好两分钟全文', '只记一个高级习语', '完全不准备直接背诵 Part 1 答案'],
        2,
        '关键词让表达能根据提示卡自然扩展，也保留组织方向。逐字稿容易变成背诵，遇到追问时无法灵活调整。',
        '常见误区',
      ),
      question(
        '录音复盘时，哪组证据最适合判断口语表现？',
        '内容覆盖、意群停顿、重音清楚和能否继续交流',
        ['声音是否像某国母语者', '录音文件大小', '一共用了多少个长单词'],
        3,
        '口语评分关注任务回应、流利度、词汇、语法和发音可理解度。接近某种口音不是必要条件，关键信息清楚并能继续交流更重要。',
        '迁移应用',
      ),
    ],
  }),
  'english:托福': course({
    prerequisite:
      '达到约 B2 英语水平，能听学术讲座主旨并写结构清楚的短文。',
    plainLanguageGoal:
      '学完后，你能用结构化笔记记录学术讲座，逐点呈现阅读与听力的信息关系，写学术讨论回答，并按时间分配完成口语与复盘。',
    guidedPractice:
      '听一段学术讲座并记结构，读完阅读材料后写三个对应关系；完成一段学术讨论写作用于练习。',
    independentPractice:
      '完成一组托福读写听口语小练，记录信息关系、立场、例子、时间分配和下一轮修正。',
    commonErrors: [
      '学术讲座试图逐词记录，漏掉定义、例子和转折层级。',
      '综合写作加入个人立场，或把讲座例子对应到错误的阅读主张。',
      '口语准备写逐字稿，作答时因回忆句子而失去信息关系。',
    ],
    sourceRefs: TOEFL_SOURCES,
    studyPoints: [
      point(
        '必背',
        '学术讲座笔记记主题、定义、分类、例子、对比和结论；综合写作必须逐点呈现阅读与听力的信息关系。',
        1,
      ),
      point(
        '重点',
        '综合写作只概括双方，不加入个人观点；一个讲座例子只对应它真正回应的阅读主张。',
        2,
      ),
      point(
        '易错',
        '学术讨论写作先给明确立场和机制清楚的例子，抽象词不能替代因果、过程或后果。',
        3,
      ),
      point(
        '考点',
        '口语准备只写关键词和箭头，先保信息覆盖与关系准确，再提升停顿、清晰度和复杂表达。',
        4,
      ),
    ],
    eventDetails: [TOEFL_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜笔记写满一页，为什么还是说不清讲座',
        body: '先做前测：听一段两分钟学术讲座，只记主题、定义、分类、例子和转折，再用中文复述结构。阅读一段相关材料，写主张、证据和限定，但不看听力内容。变式删去一个 for example，观察结论是否失去支撑。反例是笔记逐词抄写，却分不清研究者结论与反对意见。后测把听力与阅读各列三点并画对应箭头，标出哪些是否定、替代或程度削弱；随后录音说一分钟，纠正一处把相邻例子合并的关系错误，并记录自己在信息覆盖和时间分配上的起点。',
        note: '先恢复结构，再追求句子完整。',
        objective: '能诊断学术讲座笔记、阅读功能和材料关系中的起点问题。',
        practice: '完成讲座结构笔记、阅读功能表、三点关系图、一分钟录音和一处修正。',
        checkpoint: '检查主题层级、例子归属、阅读功能、关系箭头、录音覆盖和中文复述。',
      },
      {
        title: '材料与概念｜讲座结构、材料关系、讨论与口语时间',
        body: '学术讲座按主题、定义、分类、原因、例子、对比和结论记录，听到转折或举例信号时更新层级。阅读段落先判断它提出什么、用什么支持、哪里让步或限定。综合写作把每个讲座要点对应到阅读主张，区分否定、替代解释和程度削弱，不加入个人立场。学术讨论写作先给明确立场，再用一个机制清楚的例子推进一步，并回应已有观点。口语的时间分配按准备和作答分开：准备只写关键词和箭头，独立题先立场后理由，综合题先概括材料再说关系。中文对照用于核查关系，不用于背逐字稿。',
        note: '材料关系和输出时间都要显式记录。',
        objective: '能解释讲座结构、阅读功能、综合写作关系、学术讨论和口语时间分配。',
        practice: '为一段讲座画层级图，为三组材料标关系，为一道讨论题列立场和例子，为口语写关键词。',
        checkpoint: '检查讲座层级、阅读主张、关系类型、立场、例子机制、口语关键词和中英意思。',
      },
      {
        title: '示范与推导｜从讲座反驳到学术讨论例子',
        body: '示范综合写作：阅读主张说远程办公降低团队创新，讲座先用 a controlled study 指出面对面头脑风暴并非普遍更优，再用 distributed teams 的异步提案说明替代机制。写作只概括“阅读主张—讲座反证—替代解释”，不写个人赞成。示范学术讨论回答：先表明限制通知频率有助专注，再用一个课程群的具体场景说明打断如何恢复，并回应同学对紧急信息的担忧。口语综合题用一句话先说 both materials discuss，再用 whereas 标关系。反例是只写 reading says no、lecture says yes，没有证据。变式把讲座改为例证支持，检查关系词，并纠正一处时间分配失控。',
        note: '关系词要准确写出材料在做什么。',
        objective: '能示范综合写作的逐点关系与学术讨论的机制例子。',
        practice: '完成一组阅读—讲座关系表、一段综合写作、一段讨论回答和口语关系提纲。',
        checkpoint: '检查双方概括、关系类型、例子对应、个人立场边界、口语结构和修正。',
      },
      {
        title: '引导练习｜讲座、综合写作、讨论与口语',
        body: '先做前测分配听记、阅读、写作和口语时间：讲座只写结构，阅读先标段落功能，综合写作先列三点对应，学术讨论先给立场和例子，口语只写关键词。完成后做后测，综合写作检查是否逐点回应，讨论写作检查例子是否解释机制，口语回听检查准备是否写成逐字稿。听第二遍讲座只补漏掉的转折和例子。变式缩短口语准备时间，观察关键词是否够用。反例是综合写作加入自己的赞成理由，讨论回答只写抽象口号。最后纠正一处信息关系，并写一个下一轮可观察目标。',
        note: '输出先守住任务，再改善语言。',
        objective: '能在限时组合任务中保持讲座结构、材料关系和口语关键词。',
        practice: '提交讲座笔记、阅读功能、综合写作、讨论段落、口语录音和关系纠错。',
        checkpoint: '检查三点对应、双方概括、例子机制、口语覆盖、准备方式和时间分配。',
      },
      {
        title: '独立迁移与评价｜形成托福短时输出清单',
        body: '独立完成一组托福小练：两分钟讲座笔记、一篇阅读、一篇综合写作、一段学术讨论写作和一组口语回答。先做前测写任务顺序与时间分配，后测按“信息准确、关系清楚、任务完整、语言可读、时间稳定”五项评分。回听口语先查关系和要点，再看停顿和清晰度；回读作文先查阅读与听力是否逐点对应，再查主谓、拼写和连接。24 小时后换材料只重做综合写作关系图。反例是下一轮计划只写“多练口语”，没有材料、时间和检查标准。最后设两个目标，并保留一次修改前后对照。',
        note: '把关系图作为读写听口语共同底稿。',
        objective: '能迁移托福任务方法，独立形成短时输出的检查清单和训练目标。',
        practice: '提交讲座笔记、综合写作、讨论写作、口语录音、五维评分、关系图和两个目标。',
        checkpoint: '五项自评：信息准确、关系逐点、任务完整、语言可读、时间受控；否则重做。',
      },
    ],
    quiz: [
      question(
        '托福学术讲座笔记最应保留什么？',
        '主题、定义、分类、例子、转折和结论的层级',
        ['每个单词的完整拼写', '说话者每次停顿的时间', '与讲座无关的个人经历'],
        0,
        '笔记服务于结构恢复和口头概括。保留层级信号与关键词，能快速重建讲座逻辑；逐词转写会消耗注意力并漏掉关系。',
        '事实与定义',
      ),
      question(
        '综合写作中，讲座例子应怎样处理？',
        '对应它真正回应的阅读主张，并说明反驳、替代或削弱的类型',
        ['把所有例子合成一个笼统反对', '只写自己的赞成理由', '只要出现相同单词就合并'],
        1,
        '综合任务考的是材料关系。例子必须放回它实际回应的主张，并说明关系类型；合并错误会产生不存在的论证。',
        '材料与推导',
      ),
      question(
        '学术讨论写作中，哪种例子最有效？',
        '说明一个具体机制，解释它怎样导致结果并回应已有观点',
        ['只重复题目中的抽象名词', '写五个互不相关的例子', '不表明立场只列生词'],
        2,
        '短时讨论需要清楚推进。具体机制让读者看见从原因到结果的过程，也能自然回应同学观点，而抽象口号不能证明立场。',
        '常见误区',
      ),
      question(
        '托福口语准备时间最合理的产物是什么？',
        '立场、理由、材料关系和几个关键词箭头',
        ['两分钟逐字稿', '完整背下的范文', '完全空白等待作答'],
        3,
        '关键词提纲能保留组织，又不把注意力绑在回忆句子上。准备应服务信息覆盖和关系表达，而不是制造背诵负担。',
        '迁移应用',
      ),
    ],
  }),
};
