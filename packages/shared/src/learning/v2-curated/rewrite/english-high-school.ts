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
    explanation: `${explanation}，并回到句法或语篇证据核对判断。`,
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

const SENIOR_ONE_ARCHIVE = {
  id: 'english-senior-one-main-clause-to-paragraph',
  kind: 'concept',
  title: '长句与段落：让复杂结构服务中心意思',
  period: '高中英语阅读与观点写作',
  summary:
    '长句分析先找主句主语、谓语和宾语，再识别从句、非谓语与插入成分。阅读段落时标出主题句、例证、转折和结论，最后用原文证据写观点短文。',
  background:
    '学习者常在每个单词上平均用力，句子越长越容易把从句谓语误当主句，段落写作则容易把例子和理由混在一起。拆主干与标功能能把阅读判断变成可复核的步骤。',
  timeline: [
    {
      date: '主干',
      title: '先锁定主句的谓语',
      body: '复杂句可以加入从句、短语和插入语，但主句仍必须有能独立承担时态的主谓结构。先划谓语，再回找它的主语和宾语，能排除修饰成分制造的干扰。',
      sourceIds: ['bc-upper-grammar', 'purdue-sentence'],
    },
    {
      date: '从句',
      title: '从句有连接词和自己的主谓',
      body: '名词性、定语和状语从句进入主句的不同位置，内部通常另有主语和谓语。判断从句边界时要看连接词、标点和谓语关系，不能只数逗号。',
      sourceIds: ['bc-upper-grammar', 'cambridge-clauses'],
    },
    {
      date: '非谓语',
      title: '非谓语短语不能独自充当谓语',
      body: '不定式、动名词和分词可压缩从句信息，却不会像限定动词那样单独承担主句时态。改写前先找逻辑主语，避免出现悬垂修饰。',
      sourceIds: ['purdue-sentence', 'cambridge-clauses'],
    },
    {
      date: '段落',
      title: '句子功能由段落在全文中的作用决定',
      body: '主题句提出中心，例证提供可核对材料，转折限制范围，结论回收问题。概括段意需要串起这些功能，不能机械抄首句或只摘例子。',
      sourceIds: ['purdue-writing', 'bc-listening'],
    },
    {
      date: '态度',
      title: '评价词和转折共同暴露作者态度',
      body: 'however、although、may 和评价形容词会让作者立场呈现保留或限定。态度判断必须引用最能暴露立场的两处表达，不能只看文章标题。',
      sourceIds: ['bc-listening', 'purdue-writing'],
    },
    {
      date: '证据',
      title: '观点短文让理由和例子各司其职',
      body: '立场句回答题目，理由说明为什么成立，例子提供人物、情境或数据，解释句再把例子连回理由。三类句子混在一起时，段落看似很长却没有推进。',
      sourceIds: ['purdue-writing', 'bc-upper-grammar'],
    },
  ],
  outcome:
    '可观察结果是能拆解十个复杂句的主干，概括一篇三百词文章的段落功能，并写出一百词有证据链的观点短文。',
  significance:
    '本课把语法拆句与语篇理解连接起来，为高二从句整合、论证让步和限时阅读建立共同操作。',
  sourceCards: [
    source(
      'bc-upper-grammar',
      'Upper-intermediate B2 grammar',
      'British Council LearnEnglish',
      '2026 年访问版',
      'https://learnenglish.britishcouncil.org/grammar/upper-intermediate-b2-grammar',
      '核对复杂句、从句与非谓语的学习层级。',
    ),
    source(
      'purdue-sentence',
      'Sentence Structure',
      'Purdue Online Writing Lab',
      '2026 年访问版',
      'https://owl.purdue.edu/owl/general_writing/mechanics/sentence_structure.html',
      '核对主谓结构、从句和句子边界。',
    ),
    source(
      'cambridge-clauses',
      'Clauses and sentences',
      'Cambridge Dictionary Grammar',
      '2026 年访问版',
      'https://dictionary.cambridge.org/grammar/british-grammar/clauses-and-sentences',
      '核对从句类型、限定动词与非谓语形式。',
    ),
    source(
      'purdue-writing',
      'Developing Strong Thesis Statements',
      'Purdue Online Writing Lab',
      '2026 年访问版',
      'https://owl.purdue.edu/owl/general_writing/academic_writing/establishing_arguments/thesis_statements.html',
      '核对中心主张与段落支撑关系。',
    ),
    source(
      'bc-listening',
      'Listening',
      'British Council LearnEnglish',
      '2026 年访问版',
      'https://learnenglish.britishcouncil.org/skills/listening',
      '核对听读中的主旨、态度和细节证据。',
    ),
  ],
} satisfies LearningV2EventDetail;

const SENIOR_ONE_SOURCES = [
  'British Council LearnEnglish, Upper-intermediate B2 grammar。https://learnenglish.britishcouncil.org/grammar/upper-intermediate-b2-grammar',
  'Purdue Online Writing Lab, Sentence Structure。https://owl.purdue.edu/owl/general_writing/mechanics/sentence_structure.html',
  'Purdue Online Writing Lab, Developing Strong Thesis Statements。https://owl.purdue.edu/owl/general_writing/academic_writing/establishing_arguments/thesis_statements.html',
  'Cambridge Dictionary Grammar, Clauses and sentences。https://dictionary.cambridge.org/grammar/british-grammar/clauses-and-sentences',
  'British Council LearnEnglish, Listening。https://learnenglish.britishcouncil.org/skills/listening',
];

const SENIOR_TWO_ARCHIVE = {
  id: 'english-senior-two-clauses-concession-rebuttal',
  kind: 'concept',
  title: '复杂信息与议论文：先保主次，再公平回应反方',
  period: '高中英语复杂句与论证写作',
  summary:
    '从句类型由信息关系决定，复杂句必须保持主次和可读性。议论文先准确复述对方最强理由，再用条件、证据或代价反驳，指代与衔接共同保证读者能恢复论证路径。',
  background:
    '学习者常把“多写从句”当作高级表达，结果主句中心消失；让步段又容易攻击对方最弱版本。可复核的句法标注和论证图能把复杂性与说服力分开检查。',
  timeline: [
    {
      date: '关系',
      title: '从句类型由信息关系决定',
      body: '名词性从句充当主语、宾语或表语，定语从句限定名词，状语从句表达时间、原因、条件或让步。先判断缺失成分和两句关系，再选结构，不能按连接词清单机械套用。',
      sourceIds: ['bc-upper-grammar', 'cambridge-clauses'],
    },
    {
      date: '主次',
      title: '复杂句必须保留清楚主干',
      body: '一句话可以承载多层信息，但主句断言仍要一眼可辨。连续堆叠三个从句会挤压主句，改写时应把独立断言拆句，或把次要信息降为非谓语短语。',
      sourceIds: ['purdue-argumentative', 'bc-upper-grammar'],
    },
    {
      date: '让步',
      title: '让步先公平复述最强理由',
      body: '承认反方最合理的时间、成本或公平性考虑，再说明它在什么条件下被限制。准确复述对方观点能建立共同讨论基础，也能避免稻草人式反驳。',
      sourceIds: ['purdue-argumentative'],
    },
    {
      date: '反驳',
      title: '反驳需要新的条件、证据或代价',
      body: '有效反驳不只重复自己的立场，而要指出对方理由的适用范围、反证材料或实施方案后的代价。接受哪一部分、削弱哪一部分，要分别写清。',
      sourceIds: ['purdue-argumentative', 'purdue-transitions'],
    },
    {
      date: '衔接',
      title: '指代和同义替换共同维持连贯',
      body: 'this policy、such measures 和 they 必须有唯一可回指的先行词。连接词表达因果、对比或递进，不能只按字数插入；同义替换也要保持概念范围不变。',
      sourceIds: ['purdue-transitions', 'cambridge-clauses'],
    },
    {
      date: '修改',
      title: '先改结构和公平性，再润色语言',
      body: '修改议论文先检查立场、段落功能和让步是否公平，再看证据能否回连理由。结构通过后，才处理主谓、时态、搭配、指代和拼写，避免用高级词遮盖论证漏洞。',
      sourceIds: ['purdue-argumentative', 'bc-upper-grammar'],
    },
  ],
  outcome:
    '可观察结果是能把三类从句放回正确成分，写一百二十词议论文，并让让步、反驳和指代都能被读者明确追踪。',
  significance:
    '本课把复杂语法限制在可读性之内，并把让步与反驳从写作套路变成可检查的论证关系。',
  sourceCards: [
    source(
      'bc-upper-grammar',
      'Upper-intermediate B2 grammar',
      'British Council LearnEnglish',
      '2026 年访问版',
      'https://learnenglish.britishcouncil.org/grammar/upper-intermediate-b2-grammar',
      '核对从句、复杂句和非谓语的学习层级。',
    ),
    source(
      'purdue-argumentative',
      'Argumentative Essays',
      'Purdue Online Writing Lab',
      '2026 年访问版',
      'https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/argumentative_essays.html',
      '核对论点、让步、反驳和证据组织。',
    ),
    source(
      'purdue-transitions',
      'Transitions and Transitional Devices',
      'Purdue Online Writing Lab',
      '2026 年访问版',
      'https://owl.purdue.edu/owl/general_writing/academic_writing/transitions.html',
      '核对逻辑关系与衔接手段。',
    ),
    source(
      'cambridge-clauses',
      'Clauses and sentences',
      'Cambridge Dictionary Grammar',
      '2026 年访问版',
      'https://dictionary.cambridge.org/grammar/british-grammar/clauses-and-sentences',
      '核对名词性、定语和状语从句的句法位置。',
    ),
  ],
} satisfies LearningV2EventDetail;

const SENIOR_TWO_SOURCES = [
  'British Council LearnEnglish, Upper-intermediate B2 grammar。https://learnenglish.britishcouncil.org/grammar/upper-intermediate-b2-grammar',
  'Purdue Online Writing Lab, Argumentative Essays。https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/argumentative_essays.html',
  'Purdue Online Writing Lab, Transitions and Transitional Devices。https://owl.purdue.edu/owl/general_writing/academic_writing/transitions.html',
  'Cambridge Dictionary Grammar, Clauses and sentences。https://dictionary.cambridge.org/grammar/british-grammar/clauses-and-sentences',
];

const SENIOR_THREE_ARCHIVE = {
  id: 'english-senior-three-timed-reading-error-loop',
  kind: 'concept',
  title: '限时训练：把分数拆成可执行的错因',
  period: '高中英语高考冲刺',
  summary:
    '限时阅读先建立题型与时间预算，再用同义改写、否定和范围核对原文。完形与语法填空先判断句子缺什么成分和逻辑，写作按内容、结构、语言逐项评分，模拟后只选最有影响的两项进入下一周计划。',
  background:
    '只记录总分无法告诉学习者下一步练什么。真正的复盘要同时记录题型、耗时、证据判断和错误触发条件，再把结果转成少量可验证任务。',
  timeline: [
    {
      date: '基线',
      title: '先测题型正确率和耗时',
      body: '一次模拟至少记录阅读各篇耗时、完形与语法填空正确率、写作四项评分。只有分数没有时间与错误分布，无法判断是理解、定位还是节奏问题。',
      sourceIds: ['cambridge-first', 'bc-reading'],
    },
    {
      date: '题型',
      title: '先确认题目要求再定位',
      body: '主旨、细节、推断、词义和结构题需要不同证据。题干先标任务词与对象，再回原文找同义关系，不能因为看到相同单词就直接选。',
      sourceIds: ['bc-reading', 'cambridge-first'],
    },
    {
      date: '线索',
      title: '同义改写伴随范围与否定变化',
      body: 'some 可能改成 not all，may 可能被选项夸成 must，原因和结果也可能交换。比对选项时同时检查人物、时间、否定、程度和范围。',
      sourceIds: ['bc-reading', 'purdue-argument'],
    },
    {
      date: '完形',
      title: '完形先判断句子缺什么',
      body: '空格前后决定词性、成分和逻辑关系，再比较词义与搭配。转折、因果和复现线索要放回全段核对，不能只看本句最常见搭配。',
      sourceIds: ['cambridge-first', 'cambridge-grammar'],
    },
    {
      date: '语法填空',
      title: '语法填空同时检查结构与语境',
      body: '先判断主谓是否完整、空格需要谓语还是非谓语，再检查时态、语态、单复数、词性和固定搭配。一个形式正确但不符合上下文的答案仍不成立。',
      sourceIds: ['cambridge-grammar', 'cambridge-first'],
    },
    {
      date: '计划',
      title: '每周只强化最影响分数的两项',
      body: '复盘把错误分成词汇、长句、定位、逻辑、语法和写作六类，计算每类影响与稳定性。下一周安排可验证任务，例如两篇八分钟细节题或三次从句改错。',
      sourceIds: ['purdue-argument', 'bc-reading'],
    },
  ],
  outcome:
    '可观察结果是完成一次分项限时训练，形成带耗时与错误触发的错因表，并写出两周内可检查的训练计划。',
  significance:
    '本课把冲刺从“刷更多题”改为“用证据选择下一步”，同时保留阅读、语言形式和写作之间的连接。',
  sourceCards: [
    source(
      'cambridge-first',
      'B2 First',
      'Cambridge English',
      '2026 年访问版',
      'https://www.cambridgeenglish.org/exams-and-tests/qualifications/first/',
      '核对 B2 阅读、语言运用与写作任务范围。',
    ),
    source(
      'bc-reading',
      'Reading',
      'British Council LearnEnglish',
      '2026 年访问版',
      'https://learnenglish.britishcouncil.org/skills/reading',
      '核对阅读定位、主旨、推断与限时策略。',
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
      '核对完形和语法填空所需的结构与搭配。',
    ),
    source(
      'purdue-argument',
      'Argumentative Essays',
      'Purdue Online Writing Lab',
      '2026 年访问版',
      'https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/argumentative_essays.html',
      '核对写作结构、证据与修改顺序。',
    ),
  ],
} satisfies LearningV2EventDetail;

const SENIOR_THREE_SOURCES = [
  'Cambridge English, B2 First。https://www.cambridgeenglish.org/exams-and-tests/qualifications/first/',
  'British Council LearnEnglish, Reading。https://learnenglish.britishcouncil.org/skills/reading',
  'British Council LearnEnglish, Writing。https://learnenglish.britishcouncil.org/skills/writing',
  'Cambridge Dictionary Grammar, English Grammar Today。https://dictionary.cambridge.org/grammar/british-grammar/',
  'Purdue Online Writing Lab, Argumentative Essays。https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/argumentative_essays.html',
];

export const ENGLISH_HIGH_SCHOOL_REWRITE: CuratedCoursePlanPatchMap = {
  'english:高一': course({
    prerequisite: '完成初三读写，能识别简单句主谓并写八十词短文。',
    plainLanguageGoal:
      '学完后，你能拆出复杂句主干，判断从句与非谓语的功能，理解段落作用，并用原文证据写一百词观点短文。',
    guidedPractice:
      '拆解十个复杂句并标主句谓语，再为三百词文章的每段写“功能＋证据＋一句中文对照”。',
    independentPractice:
      '围绕“校园是否应限制课间手机使用”写一百词观点短文，使用两个不同理由、一个具体例子和一处让步。',
    commonErrors: [
      '只按单词顺序逐译长句，没有先找主句谓语。',
      '把非谓语短语当成并列谓语，导致句子边界判断错误。',
      '段落里只堆例子，不解释例子怎样支持理由。',
    ],
    sourceRefs: SENIOR_ONE_SOURCES,
    studyPoints: [
      point(
        '必背',
        '复杂句先锁主句主语、谓语和宾语；从句有自己的主谓结构，非谓语短语不能独自承担主句时态。',
        1,
      ),
      point(
        '重点',
        '阅读段落按主题句、例证、转折和结论标功能，段落大意要说明这些句子如何共同推进中心。',
        2,
      ),
      point(
        '易错',
        'however、although 和 may 往往表示限定或保留，不能把作者态度简单分成完全赞成或完全反对。',
        3,
      ),
      point(
        '考点',
        '观点短文用“立场—理由—例子—解释”闭合证据链，例子必须回连到它所支持的判断。',
        4,
      ),
    ],
    eventDetails: [SENIOR_ONE_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜句子很长时，先把哪一部分站稳',
        body: '先做前测：读 The report that students submitted after the workshop shows how small changes can affect attention. 圈出主句谓语，再用中文写出整句意思。听一段两分钟校园讨论，记录说话者支持的措施和保留条件。朗读原句并标出停顿，随后做一个变式：删去 that 从句，检查主句是否仍完整。反例是把 submitted 或 affect 直接当作主句谓语，导致整句结构断裂。后测要求从两段阅读材料各找一句长句，写出主句主干、一个修饰成分和作者态度证据；最后对照中文翻译修正一处误判，并说明证据来自哪个连接词或评价表达。',
        note: '先找能独立承担时态的主谓结构。',
        objective: '能用主句谓语和态度证据诊断长句阅读中的结构误判。',
        practice: '完成一句前测拆解、听力态度表、中文对照、朗读停顿和一段变式。',
        checkpoint: '核对主句主谓、从句边界、态度证据、中文意思和一次修正说明。',
      },
      {
        title: '材料与概念｜主干、从句、非谓语与段落功能',
        body: '长句主干是主句主语、谓语和必要宾语；定语从句限定名词，状语从句说明时间、原因、条件或让步，名词性从句可充当主语、宾语或表语。非谓语短语能压缩信息，却没有限定动词的独立时态，使用时先确认逻辑主语。阅读段落时给句子标主题、材料、转折或结论，再判断段落功能。作者态度要从评价词、情态动词和转折结构交叉核对，不能只凭一个褒义词。中文对照用来确认意思，但结构判断仍要回到英文连接词、标点和谓语。',
        note: '结构边界与语篇功能同时标。',
        objective: '能解释长句主干、三类从句、非谓语和段落功能的判断依据。',
        practice: '为六个长句标主干与修饰成分，为一段文章标四种句子功能和作者态度。',
        checkpoint: '检查主句谓语唯一、从句边界、非谓语逻辑主语、段落功能和态度证据。',
      },
      {
        title: '示范与推导｜从主句到一段有推进的论证',
        body: '示范解析：Although some students use phones to check schedules, a rule that limits notifications during lessons may protect attention. 主句是 a rule may protect attention；Although 引出让步，that 从句限定 rule。随后示范段落：先写立场，再给理由“减少打断”，用课堂观察作例子，解释通知如何恢复注意力，最后用让步限制为“仅在课堂内”。朗读时在转折和从句后停顿，中文对照只保留核心关系。反例是 Because the rule is useful, so students should follow it. 中原因与结果重复标记。变式把让步移到段尾，检查中心是否仍清楚，并修正一个悬垂分词短语。',
        note: '复杂句要有主次，观点段要有推进。',
        objective: '能把长句分析迁移到观点段的理由、例子和让步组织。',
        practice: '完成一个主句拆解、一个段落功能表、中文对照和一处连接或悬垂修正。',
        checkpoint: '检查主句唯一、让步真实、例子回连理由、句子边界和中英意思一致。',
      },
      {
        title: '引导练习｜阅读三百词文章并搭证据表',
        body: '阅读一篇三百词校园科技文章，先做前测标题型和段落主旨，再为每段填写“功能、关键句、作者态度”三栏。把三个长句拆成主句和修饰成分，其中至少一句含非谓语。听同一主题的短讨论，记下支持观点和保留条件，与阅读材料做三角核对。后测写一段八十词摘要，必须引用两处原文关系并给出一句中文对照。变式删去一个转折句，观察结论是否失去边界。最后按主干、从句、态度、证据四类记录错误，并选一条写出具体纠错动作。',
        note: '摘要只能使用已核对的关系。',
        objective: '能提取文章段落功能与态度证据，并完成有依据的英文摘要。',
        practice: '提交段落功能表、三个长句拆解、听力条件表、八十词摘要和错因记录。',
        checkpoint: '检查段落功能、原文证据、态度边界、长句主干、摘要事实和中文对照。',
      },
      {
        title: '独立迁移与评价｜用证据写一百词观点短文',
        body: '就“校园是否应限制课间手机使用”写一百词观点短文。先做前测列立场、两个不同理由和一个可能反方理由，再为每个理由配可观察例子。写作时至少使用一个从句、一个非谓语短语和一处让步；完成后做后测，按“中心明确、段落推进、句法可控、证据贴合”四项评分。朗读录音检查意群停顿，24 小时后换“图书馆是否延长开放”做同结构变式。反例是全文只重复手机有害却没有例子。最后保留评分表、中文对照和一条下一轮修正动作。',
        note: '每个理由都要由例子和解释完成闭环。',
        objective: '能迁移长句与段落方法，写有证据链的一百词观点短文。',
        practice: '提交立场表、一百词短文、从句与非谓语标记、两轮朗读、四项评分和变式提纲。',
        checkpoint: '四项自评：中心清楚、理由不同、例子能支持理由、句子边界正确；否则重写。',
      },
    ],
    quiz: [
      question(
        '复杂句分析时，最先应确定什么？',
        '主句的主语、谓语和必要宾语',
        ['所有生词的中文意思', '逗号出现的位置', '从句里最长的名词'],
        0,
        '主句决定句子的核心断言和时态，修饰成分再多也要围绕主句展开。先锁主干再处理从句，能避免把从句谓语误当主句。',
        '事实与定义',
      ),
      question(
        'The book that she recommended explains how habits form. 的主句是什么？',
        'The book explains',
        ['she recommended', 'how habits form', 'The book that she'],
        1,
        'that she recommended 是修饰 book 的定语从句，how habits form 是 explains 的宾语从句。去掉两个从句后，主句仍是 The book explains。',
        '材料与推导',
      ),
      question(
        '哪一处最可能造成非谓语短语误判？',
        'Walking home, she saw the sign. 中 Walking home 被当作独立谓语句',
        ['把 she 识别为主语', '把 saw 识别为谓语', '把 the sign 识别为宾语'],
        2,
        'Walking home 是分词短语，逻辑主语是 she，但整句主句谓语是 saw。分词本身不承担该句的限定时态，不能另起一个独立谓语结构。',
        '常见误区',
      ),
      question(
        '写观点短文时，哪种证据链最完整？',
        '先给立场，再说明理由，用具体观察作例子，并解释观察怎样支持理由',
        ['只写三个同义立场句', '先列五个生词再给结论', '只引用一个例子，不说明它与理由的关系'],
        3,
        '完整证据链要让读者看见从主张到理由、再到材料和解释的推进。只重复立场或孤立堆例子，都不能证明观点。',
        '迁移应用',
      ),
    ],
  }),
  'english:高二': course({
    prerequisite: '完成高一长句拆解与观点段写作，能识别主句和基础从句。',
    plainLanguageGoal:
      '学完后，你能按信息关系使用名词性从句、定语从句和状语从句，写出包含公平让步、有效反驳和清楚指代的一百二十词议论文。',
    guidedPractice:
      '比较同一观点的三个复杂句改写，标出从句成分和主次；再为一段论证补写“公平让步—条件反驳”。',
    independentPractice:
      '就“学校是否应统一管理生成式 AI 工具”写一百二十词议论文，包含立场、最强反方理由、条件反驳和清楚指代。',
    commonErrors: [
      '连续堆叠从句，主句断言被修饰信息淹没。',
      '让步段只复述对方最弱说法，形成稻草人式反驳。',
      'it、this 和 they 同时指向多个对象，读者无法恢复指代关系。',
    ],
    sourceRefs: SENIOR_TWO_SOURCES,
    studyPoints: [
      point(
        '必背',
        '从句类型由信息关系决定：名词性从句充当句子成分，定语从句限定名词，状语从句表达条件、原因或让步。',
        1,
      ),
      point(
        '重点',
        '复杂句先保主句断言，再按信息重要度安排从句和非谓语，复杂不等于冗长。',
        2,
      ),
      point(
        '易错',
        '让步要先准确复述对方最强理由，反驳要提出条件、证据或代价，不能只重复自己的立场。',
        3,
      ),
      point(
        '考点',
        '衔接依靠指代、同义替换和连接词共同完成，每个 this、it 或 they 都需要唯一回指对象。',
        4,
      ),
    ],
    eventDetails: [SENIOR_TWO_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜从句越多，为什么读者越找不到重点',
        body: '先做前测：读 Although the proposal that students who use AI should report every prompt may reduce misuse, it could also discourage experimentation. 标出主句、名词性从句、定语从句和状语从句，再用中文写一句摘要。听一段关于技术规范的短辩论，分别记录支持理由和反方最强理由。变式把两个从句拆成独立句，比较可读性。反例是把 this rule may help 误写成 this rule that may help，或让 it 同时指规则和学生。后测朗读改写后的句子，按主次和指代修正一处，并说明改动后读者更容易看到什么关系。',
        note: '句法复杂度和论证清晰度分开检查。',
        objective: '能诊断从句堆叠、主次丢失和指代模糊造成的阅读困难。',
        practice: '完成一句前测标注、听力正反理由表、中文摘要、拆句变式和一处修正。',
        checkpoint: '核对主句、三类从句、中文摘要、指代对象、朗读意群和修正理由。',
      },
      {
        title: '材料与概念｜三类从句、让步反驳与语篇衔接',
        body: '名词性从句可作主语、宾语或表语，定语从句紧跟名词补充限定，状语从句表达时间、原因、条件或让步。每个从句都要在句中承担清楚成分，不能只为拉长句子。议论文的让步段先公平复述对方最强理由，再用条件、证据或实施方案的代价进行反驳。指代、同义替换和连接词共同形成衔接；this policy 前必须只有一个合理解释，they 也要有明确复数先行词。中文对照帮助核查意思是否在拆分后保持完整，但不能代替英文成分判断。',
        note: '关系先确定，结构再选择。',
        objective: '能解释三类从句的句法位置、让步反驳关系和指代衔接条件。',
        practice: '为六句标从句成分、主次和指代对象，再为一个反方理由写准确转述。',
        checkpoint: '检查从句位置、主句完整、让步公平、反驳有关系、指代唯一和中文意思。',
      },
      {
        title: '示范与推导｜从最强反方理由到条件反驳',
        body: '示范反方理由：Uniform rules may protect students from accidental data leaks. 先承认数据安全风险真实，再补条件：A rule that bans all tools may also prevent supervised practice, while a classroom protocol can limit sensitive uploads without removing feedback. 句中 that 从句限定 rule，while 对比两种方案。阅读这段时标出“被接受的风险、被质疑的手段、替代条件”，再写两句中文对照。反例是 Students who like AI are lazy, so rules are unnecessary. 这既没有公平复述，也没有证据。变式把反驳改成让步开头，检查立场是否仍一致并修正一个模糊 this。',
        note: '接受风险，不等于接受对方推荐的手段。',
        objective: '能示范公平让步、条件反驳和清楚指代的完整推理。',
        practice: '完成反方理由转述、条件反驳句、从句标注、中文对照和一处指代修正。',
        checkpoint: '检查反方是否最强版本、反驳是否加新理由、主次清楚、指代唯一和中文一致。',
      },
      {
        title: '引导练习｜复杂句改写与议论文骨架',
        body: '先做前测，把三组短句分别改写为名词性从句、定语从句和状语从句，并说明每组为什么需要该关系。阅读一段一百五十词议论文，标出立场、两个理由、让步、反驳和结论。听同一议题的短讨论，补一张“对方最合理担忧—可接受部分—限制条件”表。后测写一段一百二十词议论文骨架，使用一个从句、一处让步和至少两个唯一指代。变式删去反驳中的条件，观察论证是否变成简单对立。最后对中标点和连接词，纠正一处逻辑关系或指代错误。',
        note: '先画论证关系，再补复杂句。',
        objective: '能把三类从句用于论证骨架，并完成让步、反驳与衔接检查。',
        practice: '提交三组句法改写、论证功能表、反方忧虑表、一百二十词骨架和错因记录。',
        checkpoint: '检查从句类型、主次可读、让步公平、反驳有依据、指代清楚和逻辑连接。',
      },
      {
        title: '独立迁移与评价｜写有公平让步的议论文',
        body: '就“学校是否应统一管理生成式 AI 工具”写一百二十词议论文。先做前测列立场和对方最强理由，再写两个主体段：一段推进自己的理由，一段完成让步与反驳。至少使用一个定语从句、一个状语从句和三个明确指代。完成后做后测，按“立场一致、让步公平、反驳有效、衔接可追、语言准确”五项评分。朗读录音检查长句意群，24 小时后换“图书馆是否引入 AI 检索”写新提纲。反例是只列三条规则却不回应风险。最后根据评分修正一段并记录一项下一轮动作。',
        note: '公平复述不等于放弃自己的立场。',
        objective: '能迁移复杂从句和让步反驳，写结构完整且指代清楚的一百二十词议论文。',
        practice: '提交论证图、一百二十词议论文、从句与指代标记、两轮朗读、五项评分和变式提纲。',
        checkpoint: '五项自评：立场统一、反方准确、反驳有新依据、指代唯一、复杂句可读；否则重写。',
      },
    ],
    quiz: [
      question(
        '名词性从句与定语从句的主要区别是什么？',
        '名词性从句充当主语、宾语或表语，定语从句修饰名词',
        ['名词性从句只能放句首', '定语从句不能有主语', '两者可以无条件互换'],
        0,
        '两类从句的句法任务不同。名词性从句占据名词可出现的句子位置，定语从句则依附名词并提供限定或补充信息。',
        '事实与定义',
      ),
      question(
        '哪句最清楚保留了复杂句的主次？',
        'Although the new rule may reduce distractions, teachers who want flexibility can still approve short listening tasks.',
        ['Although the rule that teachers who want flexibility may reduce distractions and can approve tasks.', 'The rule, although teachers, which may reduce distractions and flexibility, approve tasks.', 'Because the rule and teachers that flexibility although distractions.'],
        1,
        '该句主句是 teachers can still approve tasks，Although 引导让步，who 从句修饰 teachers。其他选项都出现成分缺失、主次消失或连接词关系冲突。',
        '材料与推导',
      ),
      question(
        '哪种让步最接近公平反驳？',
        '先承认统一规则能保护数据，再质疑“禁止全部工具”是否会损失受监督练习',
        ['先说反对者都不懂技术，再重复自己的结论', '只写“有人说不好，但我不同意”', '完全不提反方理由'],
        2,
        '公平让步要准确说明对方最强担忧，再区分风险本身与推荐手段。这样反驳才针对真实分歧，而不是攻击弱版本。',
        '常见误区',
      ),
      question(
        '修改议论文时，发现一个 this 可能指政策和结果，最合理动作是什么？',
        '把 this 改成具体名词或拆句，并检查先行词是否唯一',
        ['把所有 this 都删除', '换成高级连接词即可', '保留 because 读者能猜出来'],
        3,
        '指代必须能由上下文唯一恢复。把 this 具体化为 this upload rule 或 this reduction in errors，必要时拆句，比继续堆连接词更清楚。',
        '迁移应用',
      ),
    ],
  }),
  'english:高三 · 高考冲刺': course({
    prerequisite:
      '完成高一、高二的复杂句和议论文训练，能在提示下完成分项限时练习。',
    plainLanguageGoal:
      '学完后，你能用时间预算完成限时阅读、完形和语法填空，按评分表修改短文，并把错因转成下一周计划。',
    guidedPractice:
      '完成一篇八分钟限时阅读、一组完形和语法填空，填写题型、耗时、证据与错误触发四栏。',
    independentPractice:
      '完成一次分项模拟，写一篇短文并按内容、结构、语言、表达四项评分，最后只制定两个下一周训练目标。',
    commonErrors: [
      '只记总分和答案，不记录耗时、题型与错误触发条件。',
      '阅读看到相同单词就选择，忽略同义改写、否定和范围变化。',
      '作文只背模板，不覆盖题目要点，也不留时间做结构检查。',
    ],
    sourceRefs: SENIOR_THREE_SOURCES,
    studyPoints: [
      point(
        '必背',
        '每道错题至少记录题型、耗时、错误触发和修正动作；没有触发条件的“粗心”不能指导下一次训练。',
        1,
      ),
      point(
        '重点',
        '限时阅读先确认题目任务，再核对原文同义改写、人物、时间、否定、程度和范围。',
        2,
      ),
      point(
        '易错',
        '完形和语法填空先判断句子缺什么成分与逻辑，再比较词义、形式、时态、语态和搭配。',
        3,
      ),
      point(
        '考点',
        '写作按内容要点、篇章结构、语言准确和表达丰富四项评分，先补漏点和结构，再润色措辞。',
        4,
      ),
    ],
    eventDetails: [SENIOR_THREE_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜限时做完后，为什么总分帮不了下一次',
        body: '先做前测：用八分钟完成一篇阅读，记录每道题的题干任务、原文证据和耗时。再做一组完形与语法填空，分别标注“先判断结构还是先看词义”。听一段短对话并记录转折与结论，检查听力笔记是否只剩零散词。变式把一道正确题改为限时最后三十秒完成，观察证据核对是否被压缩。反例是复盘只写“粗心错两题”，没有说明在哪一步失去依据。后测用错因分类表重写三题记录，每项包含触发条件和修正动作，并用中文说明一次时间预算失败如何影响选项判断。',
        note: '分数是结果，错因才是训练输入。',
        objective: '能用题型、耗时和错误触发条件诊断限时训练的失分原因。',
        practice: '完成八分钟阅读、完形语法标注、听力笔记、三题错因记录和一次预算复盘。',
        checkpoint: '检查题干任务、原文证据、耗时、错误触发、修正动作和中英理解一致性。',
      },
      {
        title: '材料与概念｜阅读证据、填空条件与写作评分',
        body: '限时阅读要建立时间预算：先完成可得分题，标记疑难题，主旨题最后回看结构。答案必须由原文支持，注意同义改写、否定、程度和范围变化。完形先判断空格成分和句间逻辑，再比较词性与搭配；语法填空先看主谓是否完整、需要谓语还是非谓语，再检查时态、语态、单复数和词性。写作评分表分开内容要点、篇章结构、语言准确和表达丰富，先补漏点再润色。错因分类把词汇、长句、定位、逻辑、语法和写作分开，中文对照用于确认意思而非替代证据。',
        note: '题型不同，证据条件也不同。',
        objective: '能解释限时阅读、完形、语法填空和写作评分的关键判断条件。',
        practice: '为一道阅读、一个完形空、一个语法填空和一篇短文各写四项判断依据。',
        checkpoint: '检查时间预算、原文证据、结构判断、语法条件、写作评分和中文核对。',
      },
      {
        title: '示范与推导｜从原文证据到评分修改',
        body: '示范阅读：题干说 the scheme may reduce waste，原文写 some packaging is now reused, but total consumption has not fallen. 推理先承认部分改善，再用 but 后的范围限制排除“全面减少”选项。语法填空示范先判断句子缺谓语，再根据时间标志和主语选择形式。写作示范先列三个题目要点，再检查段落功能，最后按评分表只改最影响表达的句子。反例是看到 reduce waste 就选含相同词的选项，或作文使用复杂句却没有覆盖第二个要点。变式把 may 改为 must，观察结论强度变化，并纠正一处时间预算分配。',
        note: '证据强度要和选项范围一致。',
        objective: '能示范阅读证据排除、语法形式判断和按评分表修改短文。',
        practice: '完成一条证据链、一个语法条件推导、一篇短文评分和一处范围修正。',
        checkpoint: '检查同义关系、否定范围、句子成分、时态语态、写作要点和修改理由。',
      },
      {
        title: '引导练习｜二十分钟阅读与十五分钟写作',
        body: '做一组引导训练：二十分钟完成两篇阅读，八分钟完成完形，七分钟完成语法填空，随后用十五分钟写一篇短文。先做前测分配时间预算，再在每道题旁记录题型和证据位置。完成后做后测，按阅读、完形、语法、写作四块统计正确率和超时点，不先看总分。听一段同主题材料补记关键词。变式缩短阅读两分钟，观察哪些题仍能靠证据完成。最后选三个错误，分别写出触发条件、订正证据和下一轮具体动作，并标出一处评分表与实际表达的差距。',
        note: '先按模块复盘，再合成总分画像。',
        objective: '能在分项限时中记录证据和耗时，并把错误转成具体训练动作。',
        practice: '提交时间预算、两篇阅读记录、完形语法统计、短文、写作评分和三项订正。',
        checkpoint: '检查预算执行、题型判断、原文证据、填空条件、要点覆盖、评分理由和订正动作。',
      },
      {
        title: '独立迁移与评价｜一次模拟生成下一周计划',
        body: '完成一次独立分项模拟，先做前测设定阅读、完形、语法、写作的时间预算，再逐块记录分数、耗时和错误触发。短文按内容要点、篇章结构、语言准确、表达丰富四项评分表自评，朗读录音检查拼写以外的句间衔接。24 小时后只重做最影响分数的两类错误。反例是下一周计划写“多刷题”，没有篇数、限时和检查标准。最后把错因分类汇总成两个可验证目标，例如“连续三篇八分钟细节题，每个答案写证据句”和“完成两篇短文，要点遗漏为零”。提交复盘前后记录和计划执行标准。',
        note: '下一周计划必须是可完成、可检查的动作。',
        objective: '能迁移限时与评分方法，独立形成有证据的冲刺复盘和下一周计划。',
        practice: '提交分项模拟、评分表、朗读记录、24 小时重做、错因汇总和两个周目标。',
        checkpoint: '五项自评：预算可执行、证据可追、评分有依据、只抓关键错因、周计划可验证；否则重做。',
      },
    ],
    quiz: [
      question(
        '限时阅读复盘时，哪项记录最能指导下一次训练？',
        '题型、耗时、原文证据位置和错误触发条件',
        ['只写总分数', '只抄正确答案', '只统计生词数量'],
        0,
        '总分只能说明结果，题型与错误触发能说明在哪一步失效。再配证据位置和耗时，才能选择针对性练习并验证是否改善。',
        '事实与定义',
      ),
      question(
        '原文说 some packaging is now reused, but total consumption has not fallen，哪项判断最准确？',
        '材料支持部分包装被重复使用，但不能推出整体浪费已经减少',
        ['some 与 all 同义，所以浪费全面减少', 'but 只是语气词，可以忽略', '出现 reused 就能证明总消耗下降'],
        1,
        'some 限定范围，but 引出反面的总消耗事实。正确判断要同时保留局部改善和整体未下降，不能把局部证据扩大为全面结论。',
        '材料与推导',
      ),
      question(
        '语法填空最合理的第一步是什么？',
        '先判断空格所在句缺什么成分和逻辑，再检查形式与搭配',
        ['先选最熟悉的单词', '只按前后一个词判断词性', '看到 and 就填同一词形'],
        2,
        '空格可能需要谓语、非谓语、名词或连接词，句子成分决定候选范围。成分确定后再核对时态、语态、单复数和上下文逻辑，才能排除常见搭配陷阱。',
        '常见误区',
      ),
      question(
        '模拟后写成“下一周多刷题”为什么不合格？',
        '没有篇数、限时、检查标准和可观察的完成条件',
        ['因为刷题一定无效', '因为没有记录总分', '因为只练阅读不练数学'],
        3,
        '训练计划要能被执行和验证。限定材料数量、时间、证据动作与达标条件，才能判断方法是否真的改善，而不是继续增加无目标的练习量。',
        '迁移应用',
      ),
    ],
  }),
};
