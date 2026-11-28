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
    explanation: `${explanation}，并用原文、听力笔记或句法标记复核。`,
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

const CET_FOUR_ARCHIVE = {
  id: 'english-cet-four-timed-task-chain',
  kind: 'concept',
  title: '四级任务链：从场景笔记到句法重组',
  period: '大学英语四级分项训练',
  summary:
    '四级训练按听力场景、长篇阅读匹配、仔细阅读证据、汉译英重组和限时写作分项推进。每个答案都记录定位证据与耗时，复盘时把错误转成下一次检查动作。',
  background:
    '整卷分数不能说明错误发生在听辨、匹配、推理还是表达。把任务拆开后，学习者才能看见“没听到”“定位慢”“推理越界”和“英语句子失衡”之间的差别。',
  timeline: [
    {
      date: '场景',
      title: '听力先锁定人物、任务和转折',
      body: '校园服务、选课、面试和出行场景都有稳定任务关系。笔记只记人物、问题、数字、转折和决定，不试图逐词转写；听到 however、but 或 instead 时更新结论。',
      sourceIds: ['cet-official', 'bc-reading'],
    },
    {
      date: '匹配',
      title: '长篇阅读用主题和同义表达对齐段落',
      body: '先提取题干的对象、范围和判断，再回原文寻找近义概念与重复主题。只出现一个相同单词不能证明匹配，段落仍需同时满足对象和关系。',
      sourceIds: ['cet-official', 'purdue-paraphrase'],
    },
    {
      date: '边界',
      title: '仔细阅读的推理不能超出文本证据',
      body: '事实题引用原句，推断题需要一到两步可由原文支持的推理。选项扩大范围、交换因果或加入未出现的动机，都应被排除。',
      sourceIds: ['bc-reading', 'purdue-paraphrase'],
    },
    {
      date: '翻译',
      title: '汉译英先组主干再挂修饰',
      body: '中文常用短句和意合衔接，英语需要明确主谓、时态和逻辑层级。先确定核心断言，再决定从句、非谓语或并列结构，专名和文化词先查证。',
      sourceIds: ['cambridge-grammar', 'cet-official'],
    },
    {
      date: '写作',
      title: '限时写作先保要点和清楚表达',
      body: '用几分钟列结构，再写主题句、理由和例子，最后留时间补漏点、查主谓、时态、拼写和连接。复杂词不能弥补信息缺失。',
      sourceIds: ['purdue-argument', 'cet-official'],
    },
    {
      date: '复盘',
      title: '把耗时与错误触发写进训练记录',
      body: '每道错题记录任务类型、证据位置、耗时和修正动作。下一次只改最影响正确率或速度的一两项，才能判断训练是否有效。',
      sourceIds: ['purdue-argument', 'bc-reading'],
    },
  ],
  outcome:
    '可观察结果是完成一组四级听力、阅读、翻译与写作分项训练，形成带证据和耗时的错误记录。',
  significance:
    '分项训练把语言能力、任务策略和时间管理拆开检查，再合并成整卷表现。',
  sourceCards: [
    source(
      'cet-official',
      '全国大学英语四、六级考试',
      '中国教育考试网',
      '2026 年访问版',
      'https://cet.neea.edu.cn/',
      '核对四级考试科目与官方发布入口。',
    ),
    source(
      'purdue-paraphrase',
      'Quoting, Paraphrasing, and Summarizing',
      'Purdue Online Writing Lab',
      '2026 年访问版',
      'https://owl.purdue.edu/owl/research_and_citation/using_research/quoting_paraphrasing_and_summarizing/index.html',
      '核对同义改写、概括与原文关系。',
    ),
    source(
      'purdue-argument',
      'Argumentative Essays',
      'Purdue Online Writing Lab',
      '2026 年访问版',
      'https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/argumentative_essays.html',
      '核对短文结构、证据与修改顺序。',
    ),
    source(
      'bc-reading',
      'Reading',
      'British Council LearnEnglish',
      '2026 年访问版',
      'https://learnenglish.britishcouncil.org/skills/reading',
      '核对阅读定位、主旨和推断边界。',
    ),
    source(
      'cambridge-grammar',
      'English Grammar Today',
      'Cambridge Dictionary Grammar',
      '2026 年访问版',
      'https://dictionary.cambridge.org/grammar/british-grammar/',
      '核对主谓、时态、从句和翻译句式。',
    ),
  ],
} satisfies LearningV2EventDetail;

const CET_FOUR_SOURCES = [
  '中国教育考试网，全国大学英语四、六级考试。https://cet.neea.edu.cn/',
  'Purdue Online Writing Lab, Quoting, Paraphrasing, and Summarizing。https://owl.purdue.edu/owl/research_and_citation/using_research/quoting_paraphrasing_and_summarizing/index.html',
  'Purdue Online Writing Lab, Argumentative Essays。https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/argumentative_essays.html',
  'British Council LearnEnglish, Reading。https://learnenglish.britishcouncil.org/skills/reading',
  'Cambridge Dictionary Grammar, English Grammar Today。https://dictionary.cambridge.org/grammar/british-grammar/',
];

const CET_SIX_ARCHIVE = {
  id: 'english-cet-six-academic-inference',
  kind: 'concept',
  title: '六级学术语篇：抽象概念、推断证据与输出时段',
  period: '大学英语六级分项训练',
  summary:
    '六级阅读常以抽象名词、嵌套句和保留态度组织论证。先给抽象概念建立上下文义，再拆主从句与指代，推断题只走可由原文支持的步骤。翻译和写作按信息顺序、时间预算与修改顺序完成。',
  background:
    '生词多不等于难句多，细节读懂也不等于能识别作者论证结构。将抽象概念、句法层级、态度证据和输出时段分开记录，能定位真正造成失分的环节。',
  timeline: [
    {
      date: '概念',
      title: '抽象名词由上下文获得具体含义',
      body: 'sustainability、accountability 或 agency 等词首次出现时，需要从对象、动作和反面例子确定作者所指。后文同义替换帮助补全含义，不能只背一个脱离语境的中文标签。',
      sourceIds: ['cet-six-official', 'purdue-academic'],
    },
    {
      date: '层级',
      title: '嵌套句先拆主干再恢复层级',
      body: '主句主语和谓语决定核心断言，从句、插入语与非谓语短语提供限定。逗号不是句子终点，拆句后还必须说明各层怎样重新组合成一个完整意思。',
      sourceIds: ['cambridge-grammar', 'purdue-academic'],
    },
    {
      date: '态度',
      title: '转折结构暴露保留而非简单支持',
      body: 'although、while、however 和情态动词可能表示作者支持目标但怀疑手段。推断题要引用最能暴露态度的两处表达，排除增加绝对程度或交换因果的选项。',
      sourceIds: ['purdue-argument', 'bc-writing'],
    },
    {
      date: '翻译',
      title: '信息顺序按英语重心重新组织',
      body: '中文背景在前、结论在后时，英语可先给核心断言再补条件。长定语可改为从句或同位语，文化专名先查准确名称，必要时解释，不为句子漂亮硬造词。',
      sourceIds: ['cambridge-grammar', 'cet-six-official'],
    },
    {
      date: '时段',
      title: '限时输出必须显式预留修改',
      body: '审题、成文和检查是不同任务。先分配时段，再按信息遗漏、主谓时态、搭配拼写和重复句式修改，可避免最后几分钟整篇失控重写。',
      sourceIds: ['bc-writing', 'purdue-argument'],
    },
    {
      date: '复盘',
      title: '修改顺序固定为内容先于措辞',
      body: '先补题目要求和关键关系，再处理语法准确与拼写，最后替换更精确表达。高级词不能弥补漏点；复盘要记录每个错误发生在阅读、翻译还是输出阶段。',
      sourceIds: ['purdue-academic', 'bc-writing'],
    },
  ],
  outcome:
    '可观察结果是能拆解一篇六级学术语篇的抽象概念、嵌套句和态度证据，并在限定时间内完成翻译与短文修改。',
  significance:
    '本课把“看懂难词”升级为“追踪论证并管理输出”，为更高阶学术阅读与写作建立可复用流程。',
  sourceCards: [
    source(
      'cet-six-official',
      '全国大学英语四、六级考试',
      '中国教育考试网',
      '2026 年访问版',
      'https://cet.neea.edu.cn/',
      '核对六级考试科目与官方发布入口。',
    ),
    source(
      'purdue-academic',
      'Academic Writing',
      'Purdue Online Writing Lab',
      '2026 年访问版',
      'https://owl.purdue.edu/owl/general_writing/academic_writing/index.html',
      '核对学术写作组织、读者和证据表达。',
    ),
    source(
      'purdue-argument',
      'Argumentative Essays',
      'Purdue Online Writing Lab',
      '2026 年访问版',
      'https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/argumentative_essays.html',
      '核对论证、让步、反驳和修改顺序。',
    ),
    source(
      'bc-writing',
      'Writing',
      'British Council LearnEnglish',
      '2026 年访问版',
      'https://learnenglish.britishcouncil.org/skills/writing',
      '核对写作组织、修改与读者意识。',
    ),
    source(
      'cambridge-grammar',
      'English Grammar Today',
      'Cambridge Dictionary Grammar',
      '2026 年访问版',
      'https://dictionary.cambridge.org/grammar/british-grammar/',
      '核对主从结构、信息顺序与翻译句式。',
    ),
  ],
} satisfies LearningV2EventDetail;

const CET_SIX_SOURCES = [
  '中国教育考试网，全国大学英语四、六级考试。https://cet.neea.edu.cn/',
  'Purdue Online Writing Lab, Academic Writing。https://owl.purdue.edu/owl/general_writing/academic_writing/index.html',
  'Purdue Online Writing Lab, Argumentative Essays。https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/argumentative_essays.html',
  'British Council LearnEnglish, Writing。https://learnenglish.britishcouncil.org/skills/writing',
  'Cambridge Dictionary Grammar, English Grammar Today。https://dictionary.cambridge.org/grammar/british-grammar/',
];

export const ENGLISH_UNIVERSITY_REWRITE: CuratedCoursePlanPatchMap = {
  'english:大学英语四级': course({
    prerequisite: '完成高中英语，能读中等长度文章并写一百词左右短文。',
    plainLanguageGoal:
      '学完后，你能记录听力场景与转折，完成长篇阅读匹配和有证据的仔细阅读，把中文主干重组成英语句，并在限时内写完检查短文。',
    guidedPractice:
      '完成一段校园听力笔记、一组长篇阅读匹配、两道仔细阅读、两句汉译英和一篇一百二十词短文。',
    independentPractice:
      '独立完成一组四级分项小练，并为每个错误记录任务类型、证据位置、耗时和修正动作。',
    commonErrors: [
      '听力试图逐词记录，反而漏掉转折后的决定。',
      '长篇阅读只凭相同单词匹配，忽略题干对象和范围。',
      '汉译英逐字对应中文语序，造成英语主谓和修饰关系失衡。',
    ],
    sourceRefs: CET_FOUR_SOURCES,
    studyPoints: [
      point(
        '必背',
        '听力场景先记人物、问题、数字、转折和决定；长篇阅读匹配必须同时满足对象、范围和同义表达。',
        1,
      ),
      point(
        '重点',
        '仔细阅读的推理边界由原文证据决定，扩大范围、交换因果或加入未出现动机都属于过度推断。',
        2,
      ),
      point(
        '易错',
        '汉译英不能按中文逐词搬家，应先确定英语主谓和逻辑层级，再安排从句、非谓语或并列结构。',
        3,
      ),
      point(
        '考点',
        '限时写作先覆盖题目要点，再检查结构、主谓、时态、拼写和连接，最后才考虑替换高级表达。',
        4,
      ),
    ],
    eventDetails: [CET_FOUR_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜整卷做完，为什么仍不知道错在哪',
        body: '先做前测：听一段校园服务对话，只记人物、问题、数字、转折和决定，复述时标出转折词。阅读一段多主题文章，用八分钟完成两道长篇阅读配题，再写一句为什么选该段。做一道仔细阅读后，用中文标出原文证据和推理步骤。变式把 however 删除，观察答案是否改变。反例是笔记写满整段对话，却没有记下最终决定。后测给每个错误补“任务类型、证据位置、耗时、修正动作”四项记录，并纠正一处只凭相同单词匹配的判断，录音复述自己的检查动作。',
        note: '分项记录比整卷分数更能指导训练。',
        objective: '能用场景笔记、证据位置和耗时诊断四级分项任务中的错误。',
        practice: '完成听力笔记、两句长篇匹配、一条仔细阅读证据链和四项错误记录。',
        checkpoint: '核对人物任务、转折决定、匹配对象、原文证据、推理步骤和修正动作。',
      },
      {
        title: '材料与概念｜听力场景、阅读匹配与汉译英主干',
        body: '听力场景先确定对话发生在哪里、双方要解决什么，再抓数字、转折和结论。长篇阅读先读题干对象与判断，再找段落的主题重复和同义表达；相同单词只是线索。仔细阅读分事实与推断，推理边界必须由原文依据和不超过两步的连接决定。汉译英先拆中文的核心主谓、时间与逻辑，再决定英语主句、从句和非谓语，文化专名与固定表达要查证。限时写作按要点、结构、语言、拼写检查，中文对照用于防止漏意，但不能把中文句序直接套进英语。',
        note: '先确认任务条件，再选语言结构。',
        objective: '能解释听力、长篇阅读、仔细阅读、汉译英和限时写作的关键条件。',
        practice: '为一段听力、三道阅读、两句翻译和一篇短文各写判断依据与检查项。',
        checkpoint: '检查场景笔记、同义表达、推理边界、英语主干、写作要点和中文对照。',
      },
      {
        title: '示范与推导｜从段落匹配到英语主句',
        body: '示范长篇阅读：题干说 a measure reduces food waste by changing portion size，B 段写 smaller servings led canteens to throw away less food，对象、变化和结果都一致，才可匹配。示范仔细阅读时先写“原文事实—必要推理—排除项”。汉译英的句法重组示范“学校通过缩短供餐窗口的排队时间，减少了学生因赶时间而浪费食物”，先定主句 The school reduced food waste，再用 by shortening queuing time 和 caused by time pressure 安排关系。反例是按中文逗号逐段翻成多个无主句。变式把被动改主动，检查信息焦点，并修正一处范围的过度扩大。',
        note: '匹配看关系同构，翻译先搭英语骨架。',
        objective: '能示范阅读同义匹配、推理边界和汉译英句法重组。',
        practice: '完成一段匹配证据、一条推理链、两句翻译改写和一处范围修正。',
        checkpoint: '检查对象范围、同义关系、推理步数、英语主谓、逻辑层级和中文原意。',
      },
      {
        title: '引导练习｜听力、阅读、翻译与短文的四联练',
        body: '先做前测分配时间：听力只写关键词，长篇阅读先标题干对象，仔细阅读每题圈证据，翻译先列中文主干，写作先列要点。完成一段校园听力、两组长篇阅读、两道仔细阅读、两句汉译英和一篇一百二十词短文。后测用不同颜色标出证据句、推理步骤、英语主句和写作要点。听一段同主题材料，核对先前的场景判断。变式删去一个连接词或缩短两分钟，观察哪一步最易失去证据，并纠正一处逐字翻译或拼写错误。',
        note: '四类任务共用“先条件、后表达”的检查习惯。',
        objective: '能在限时四联练中保留证据、重组句子并覆盖短文要点。',
        practice: '提交时间分配、听力笔记、阅读证据、两句翻译、短文和分类错误记录。',
        checkpoint: '检查场景、匹配、推理、主谓、逻辑、要点、拼写和修正说明。',
      },
      {
        title: '独立迁移与评价｜生成下一次分项训练单',
        body: '独立完成一组四级分项练习：听力记录一次转折决定，长篇阅读完成三题匹配，仔细阅读写两条证据链，汉译英把三句中文重组成两到三句英语，限时写一篇短文。先做前测列任务顺序，后测按正确率、证据完整、句法准确、要点覆盖和耗时评分。朗读短文检查句间衔接，24 小时后只重做最慢或最不稳的一项。反例是训练单只写“多练阅读”，没有材料数量、限时和证据动作。最后提交两个可验证目标，并写一条本轮最有效的修正动作。',
        note: '下一次训练必须有数量、时间和检查标准。',
        objective: '能迁移四级分项方法，独立形成可验证的复盘和下一次训练单。',
        practice: '提交分项结果、五维评分、朗读记录、24 小时重做、两个目标和一条修正动作。',
        checkpoint: '五项自评：证据可追、翻译主干清楚、写作要点齐全、耗时受控、计划可验证；否则重做。',
      },
    ],
    quiz: [
      question(
        '四级听力笔记最应优先记录哪组信息？',
        '人物、问题、数字、转折和最终决定',
        ['每个单词的拼写', '说话者的全部停顿', '与题目无关的背景介绍'],
        0,
        '听力任务靠关系恢复，完整转写既慢又容易漏掉转折。人物、问题、数字和决定能直接支持场景判断与答案核对。',
        '事实与定义',
      ),
      question(
        '题干说 reduce waste by changing portion size，原文写 smaller servings led to less discarded food，能否匹配？',
        '可以，供给份量变化与浪费减少的对象和结果一致',
        ['不能，因为没有出现 reduce 原词', '可以，只要都出现 school', '不能，因为 smaller 和 less 不同'],
        1,
        '匹配要看概念关系和题干对象，而不是只找相同拼写。smaller servings 对应 changing portion size，less discarded food 对应 reduce waste。',
        '材料与推导',
      ),
      question(
        '哪项推理最可能超出原文边界？',
        '原文说 some students missed breakfast，选项推断所有学生都不重视早餐',
        ['原文说 the club met on Friday，选项写周五开会', '原文说 the plan may cost more，选项写成本可能上升', '原文说 two routes were closed，选项写两条路线关闭'],
        2,
        'some 不能扩成 all，缺席早餐也不能直接推出态度判断。其他选项分别只做同义改写、保留可能语气或复述事实。',
        '常见误区',
      ),
      question(
        '汉译英第一步最合理做什么？',
        '确定中文核心断言、时间和逻辑，再搭英语主谓骨架',
        ['把每个中文词替换成英文词', '先找一个生僻同义词', '保留中文逗号逐段直译'],
        3,
        '中英句法组织不同，先确定核心事件、时间与因果，才能选择主句、从句和非谓语。逐词替换容易造成无主句和修饰错挂。',
        '迁移应用',
      ),
    ],
  }),
  'english:大学英语六级': course({
    prerequisite:
      '完成四级分项训练，能读较长说明文并写结构清楚的短文。',
    plainLanguageGoal:
      '学完后，你能为六级学术语篇中的抽象概念建立上下文义，拆解嵌套句，判断保留态度，并按时段完成翻译、写作和修改。',
    guidedPractice:
      '拆解一篇六级阅读的六个长句，完成两道推断题证据链，并把两句中文重组成英语。',
    independentPractice:
      '完成一组六级阅读、翻译和短文训练，记录信息顺序、时间分配、修改顺序与高频错误。',
    commonErrors: [
      '把生词多误判为句子难，跳过主句主语和谓语的定位。',
      '推断题只抓局部词句，没有检查转折结构和作者保留态度。',
      '限时输出不留修改时段，漏点、主谓和拼写错误同时出现。',
    ],
    sourceRefs: CET_SIX_SOURCES,
    studyPoints: [
      point(
        '必背',
        '学术语篇先给抽象名词建立上下文义，再拆主句、从句、插入语、非谓语和指代层级。',
        1,
      ),
      point(
        '重点',
        '推断题必须引用原文证据并限制推理步数，转折结构和情态表达常显示作者保留态度。',
        2,
      ),
      point(
        '易错',
        '汉译英先确定核心断言和英语信息重心，再安排背景、条件、修饰和文化词解释。',
        3,
      ),
      point(
        '考点',
        '限时输出要分配审题、成文和修改时段；修改顺序先内容关系，后语法拼写，最后措辞。',
        4,
      ),
    ],
    eventDetails: [CET_SIX_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜每个词都认识，为什么仍读不出作者立场',
        body: '先做前测：读一段关于平台治理的六级学术语篇，圈出三个抽象名词并写它们在文中的具体所指，再标一道推断题的原文证据和推理步骤。听一段学术讨论，记录研究者支持的目标、质疑的手段和转折词。朗读最长一句并画出主句与插入成分。变式把 however 改为 therefore，观察作者态度是否被误读。反例是看到 innovation 就认定作者完全支持平台扩张，忽略 but 后的条件。后测用中文写一段摘要，修正一处过度推断，并用“原文证据—推理—结论”三栏说明改动理由。',
        note: '生词、句法和态度要分别定位。',
        objective: '能诊断学术语篇中的抽象概念空转、句法层级和态度过度推断。',
        practice: '完成三个抽象词建义、一道推断证据链、听力态度表、朗读和一处修正。',
        checkpoint: '检查抽象词所指、主句层级、转折态度、推理步数、中文摘要和修正。',
      },
      {
        title: '材料与概念｜抽象词、嵌套句、推断与信息顺序',
        body: '学术语篇中的抽象名词需要由对象、动作、条件和反例建立具体含义，后文同义替换继续补充。嵌套句先找主句主谓，再标从句、插入语、非谓语和代词指代，拆开后要能恢复完整意思。推断题只使用原文证据和必要连接，转折结构、情态动词与评价词共同显示作者保留态度，不能强行二选一。汉译英先确定中文核心断言，再按英语信息重心安排背景、条件、修饰与文化解释。限时输出把审题、成文和修改分开，中文对照用于确认关系，而不是逐字搬句。',
        note: '先建概念和层级，再判断语气与表达。',
        objective: '能解释学术抽象词、嵌套句、推断态度、信息顺序和限时输出条件。',
        practice: '为六个抽象词写上下文义，为三句长句标层级，并为两句翻译列信息顺序。',
        checkpoint: '检查概念所指、主谓层级、指代、推断边界、态度证据、信息重心和中文关系。',
      },
      {
        title: '示范与推导｜从嵌套句证据到翻译重心',
        body: '示范句子：Although the framework that regulators introduced may improve disclosure, it leaves unclear who bears the cost when smaller firms cannot comply. 主句是 it leaves unclear；that 从句限定 framework，when 从句说明成本出现的条件，Although 让作者态度带保留。推断时只写“披露可能改善，但成本责任仍不清”，不能扩成“框架无效”。翻译示范先定核心断言，再补背景和条件，必要时把中文长定语改成从句。反例是把 it leaves unclear 译成“它离开不清楚”。变式把被动改主动，检查信息焦点，并纠正一处绝对化推断或信息倒置。',
        note: '保留态度不等于完全否定。',
        objective: '能示范嵌套句拆解、证据化推断和翻译信息重心重组。',
        practice: '完成一句层级图、一条推断链、两句翻译、中文对照和一处逻辑修正。',
        checkpoint: '检查主句、从句边界、指代、态度强度、翻译主谓、信息顺序和中英一致。',
      },
      {
        title: '引导练习｜阅读推断、翻译与限时短文',
        body: '先做前测分配阅读、翻译和写作时段，再读一篇六级学术语篇，给每段标主题、证据、限定和结论。两道推断题必须写出证据句、推理步数和排除理由；把两句中文重组成英语，标出核心断言与文化词处理。后测用十五分钟写一篇短文，先列要点，再留三分钟检查主谓、时态、拼写和连接。听一段相关讨论补记反方条件。变式把修改时间缩短一分钟，观察最易漏掉的层级。最后纠正一处信息顺序或修改顺序错误，并记录下一轮只练的一项。',
        note: '每种任务都保留可复核中间产物。',
        objective: '能在限时任务中保留阅读证据、翻译主干、写作要点和修改时段。',
        practice: '提交时段表、段落功能、推断证据、两句翻译、短文、检查记录和下一轮目标。',
        checkpoint: '检查推断边界、态度证据、翻译重心、短文要点、修改顺序、拼写和目标可执行。',
      },
      {
        title: '独立迁移与评价｜形成六级高质量输出流程',
        body: '独立完成一篇学术阅读、两道推断、两句汉译英和一篇限时短文。先做前测安排审题、阅读、翻译、成文和修改时段；后测按证据准确、信息完整、句法可读、表达清楚、时间稳定五项评分。朗读短文检查句间关系，24 小时后只重写最弱的一段。反例是把“多背高级词”当作唯一提升方式，却没有减少漏点和逻辑断裂。最后提交时间日志、修改前后对照、评分表和下一轮两项训练目标，其中每项都要有材料数量、限时和检查标准。',
        note: '高质量来自可复用流程，不是堆难词。',
        objective: '能迁移六级阅读、翻译和写作方法，独立形成稳定输出与复盘流程。',
        practice: '提交阅读证据、推断链、翻译、短文、时间日志、修改对照、五维评分和两个目标。',
        checkpoint: '五项自评：证据准确、信息完整、主谓时态可控、修改有优先级、时间稳定；否则重做。',
      },
    ],
    quiz: [
      question(
        '六级学术语篇中遇到抽象名词，最合理的第一步是什么？',
        '结合对象、动作、条件和后文同义替换确定它在文中的具体含义',
        ['只背词典第一个中文义项', '跳过该句只看选项', '把所有抽象词都替换成高级词'],
        0,
        '抽象词的具体含义由论证语境决定。对象、动作、条件与同义替换能限制理解范围，避免用一个脱离上下文的中文标签替代作者概念。',
        '事实与定义',
      ),
      question(
        'Although the reform may improve access, it leaves unclear who pays for compliance. 最准确的态度判断是什么？',
        '作者承认可能改善，同时保留对成本责任的疑虑',
        ['作者完全支持改革且没有担忧', '作者认为改革一定失败', '作者只讨论语法，不表达态度'],
        1,
        'Although 引导让步，may 保留可能性，leaves unclear 明确指出未解决问题。合起来是带条件的支持与保留，而非全盘肯定或否定。',
        '材料与推导',
      ),
      question(
        '哪项最可能造成嵌套句拆解错误？',
        '把插入语或非谓语短语中的动词当成主句谓语',
        ['先找主句主语', '标出从句连接词', '恢复各层与主句的关系'],
        2,
        '主句只能由限定谓语承担核心时态。插入语和非谓语会提供额外动作，却不应取代主句谓语；先锁主句能防止层级倒置。',
        '常见误区',
      ),
      question(
        '限时写作最合理的修改顺序是什么？',
        '先补内容要点和逻辑关系，再查主谓时态与拼写，最后优化措辞',
        ['先替换所有普通词', '先重写整篇开头', '只检查单词长度'],
        3,
        '内容和关系决定文章是否回应任务，语法与拼写影响可读性，措辞是最后一步。顺序反过来容易在漂亮句子中保留漏点和逻辑断裂。',
        '迁移应用',
      ),
    ],
  }),
};
