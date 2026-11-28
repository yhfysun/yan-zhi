import type {
  LearningV2EventDetail,
  LearningV2Practice,
  LearningV2StudyPoint,
} from '../../v2-types.js';
import type { CuratedCoursePlanPatchMap } from '../types.js';

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
  return { prompt, options, answer, explanation, focus };
};

const source = (id: string, title: string, issuer: string, date: string, url: string, usedFor: string) =>
  ({ id, title, issuer, date, url, usedFor });

const ENGLISH_ARCHIVE = {
  id: 'morphology-context-vocabulary-evidence',
  kind: 'experiment',
  title: '词根与例句双钩：形态线索必须回到真实语境',
  period: '2001—2022',
  summary:
    '词根、前缀和后缀能提示词形与部分意义，但同一个词根不保证现代词义可直推。有效词汇学习要把形态分析、词性、例句和间隔提取连接起来。',
  background:
    '词汇教学研究比较词表记忆、语境阅读和形态教学。形态意识有助于拆解陌生词，但学习者仍要核对发音、词性、搭配和真实使用。',
  timeline: [
    {
      date: '2001',
      title: '词汇学习被放回使用任务',
      body: 'Nation 的词汇研究强调词形、意义和使用是不同维度。认识一个词不等于能在听读中辨认、在句子中搭配或主动表达，教学需要多种提取任务。',
      sourceIds: ['nation-2001'],
    },
    {
      date: '2010',
      title: '形态教学综述显示有限但积极效果',
      body: 'Bowers 等系统综述比较形态教学与常规读写教学，发现形态线索对词形和词义学习可能有帮助，但研究任务、年龄和实施方式差异较大。',
      sourceIds: ['bowers-2010'],
    },
    {
      date: '2012',
      title: '元分析强调任务与教学强度',
      body: 'Goodwin 与 Ahn 汇总形态干预研究，认为整体效果积极，但并非任意拆词都有效。学习者需要有机会把词根分析用于阅读、拼写和句子理解。',
      sourceIds: ['goodwin-2012'],
    },
    {
      date: '2013',
      title: '单纯关键词不能替代语境',
      body: 'Dunlosky 等对关键词记忆术的评价较谨慎，提醒词汇线索可能在即时回忆有效，却不一定迁移到句子、听力与长期使用。',
      sourceIds: ['dunlosky-2013'],
    },
    {
      date: '2015',
      title: '记忆术要与真实材料匹配',
      body: 'Putnam 的教学综述强调示范、生成、反馈和迁移。一个词根故事或谐音画面若不能帮助还原准确词义，就应退出而非继续重复。',
      sourceIds: ['putnam-2015'],
    },
    {
      date: '2022',
      title: '词汇知识继续被拆分评估',
      body: '新版词汇研究强调接受性与产出性知识、词频和搭配。双钩训练因此要记录听音、词性、例句填空和延迟造句，而不只看选择题。',
      sourceIds: ['nation-2022'],
    },
  ],
  outcome:
    '词根与例句的有效组合应同时支持词形拆解、准确释义、词性判断和语境使用。若只在看到原卡时认出答案，不能证明词汇已经迁移。',
  significance:
    '双钩把形态记忆与语境记忆连接，同时限制词根万能论；它提供线索，但准确词义仍要从可靠词典和真实例句核对。',
  sourceCards: [
    source(
      'nation-2001',
      'Learning Vocabulary in Another Language',
      'I. S. P. Nation, Cambridge University Press',
      '2001',
      'https://doi.org/10.1017/CBO9781139524759',
      '核对词形、意义、使用与词汇教学维度。',
    ),
    source(
      'bowers-2010',
      'The Effects of Morphological Instruction on Literacy Skills',
      'Peter N. Bowers, John R. Kirby & S. Hélène Deacon',
      '2010',
      'https://doi.org/10.3102/0034654309359353',
      '核对形态教学对读写与词汇结果的系统综述。',
    ),
    source(
      'goodwin-2012',
      'A Meta-Analysis of Morphological Interventions in English',
      'Amanda P. Goodwin & Soyeon Ahn',
      '2012',
      'https://doi.org/10.1080/10888438.2012.689791',
      '核对形态干预效果与教学任务差异。',
    ),
    source(
      'dunlosky-2013',
      'Improving Students’ Learning With Effective Learning Techniques',
      'John Dunlosky et al.',
      '2013',
      'https://doi.org/10.1177/1529100612453266',
      '核对关键词记忆术的效用限制。',
    ),
    source(
      'putnam-2015',
      'Mnemonics in Education: Current Research and Applications',
      'A. L. Putnam',
      '2015',
      'https://doi.org/10.1037/tps0000023',
      '核对记忆术教学中的生成、反馈和迁移。',
    ),
    source(
      'nation-2022',
      'Learning Vocabulary in Another Language',
      'I. S. P. Nation, Cambridge University Press',
      '2022',
      'https://doi.org/10.1017/9781009093873',
      '核对接受性、产出性词汇知识与使用评估。',
    ),
  ],
} satisfies LearningV2EventDetail;

const HISTORY_ARCHIVE = {
  id: 'historical-thinking-chronology-evidence',
  kind: 'concept',
  title: '年代不是孤立数字：时间轴、因果与史料互证',
  period: '1991—2020s',
  summary:
    '历史记忆要把日期放回事件顺序、参与者、证据和因果解释中。仅把年代编成故事，可能记得数字却误解事件为什么发生。',
  background:
    '历史思维研究关注学习者如何比较史料、判断来源和建立解释。档案教学强调观察、来源、背景与证据，而非只复述时间线。',
  timeline: [
    {
      date: '1991',
      title: '历史问题解决研究比较专家与新手',
      body: 'Wineburg 研究专家和新手阅读历史文件时的加工差异。专家更常关注来源、语境和证据冲突，而不是把所有陈述当成同质事实。',
      sourceIds: ['wineburg-1991'],
    },
    {
      date: '2000s',
      title: '档案分析进入课堂程序',
      body: '美国国家档案馆的文档分析工具引导学习者观察文件类型、作者、时间、目的和证据。年代因此与来源信息一起进入历史判断。',
      sourceIds: ['nara-analysis'],
    },
    {
      date: '2010s',
      title: '史料互证被拆成可教学问题',
      body: 'Digital Inquiry Group 的历史思维图把来源、语境、佐证和证据使用转化为阅读问题。学生需要说明某份材料能证明什么、不能证明什么。',
      sourceIds: ['sheg-chart'],
    },
    {
      date: '2010s',
      title: '阅读像历史学家进入课堂',
      body: '历史课程通过多份材料比较同一事件的不同叙述。日期帮助定位变化，但因果关系仍需材料支持，不能因为两件事先后发生就自动建立因果。',
      sourceIds: ['sheg-lessons'],
    },
    {
      date: '2013',
      title: '延迟提取进入记忆策略评估',
      body: '学习技术综述提示，时间线记忆也需要主动提取和间隔复查。反复阅读年代表容易形成熟悉感，闭卷重建和解释才能暴露顺序与因果缺口。',
      sourceIds: ['dunlosky-2013'],
    },
    {
      date: '2020s',
      title: '数字材料增加来源核验需求',
      body: '网络材料可快速复制日期却缺少上下文。学习者要记录发布者、原始文件、版本和证据路径，避免把二次摘要中的孤立数字当作完整历史事实。',
      sourceIds: ['nara-analysis', 'sheg-chart'],
    },
  ],
  outcome:
    '可迁移的年代记忆结果包括按时间重建、解释前后变化、标记证据来源和区分事实与推断。单纯背出日期不能自动说明理解历史。',
  significance:
    '时间轴提供顺序骨架，史料和因果解释提供内容。把三者分层，可以同时提高提取准确性与历史论证质量。',
  sourceCards: [
    source(
      'wineburg-1991',
      'Historical Problem Solving',
      'Sam Wineburg, Journal of Educational Psychology',
      '1991',
      'https://doi.org/10.1037/0022-0663.83.1.73',
      '核对历史专家与新手的史料阅读差异。',
    ),
    source(
      'nara-analysis',
      'Document Analysis',
      'U.S. National Archives',
      '2025 年访问版',
      'https://www.archives.gov/education/lessons/worksheets',
      '核对文件来源、时间、目的与证据分析框架。',
    ),
    source(
      'sheg-chart',
      'Historical Thinking Chart',
      'Digital Inquiry Group',
      '2025 年访问版',
      'https://sheg.stanford.edu/historical-thinking-chart',
      '核对来源、语境、佐证和证据使用问题。',
    ),
    source(
      'sheg-lessons',
      'History Lessons',
      'Digital Inquiry Group',
      '2025 年访问版',
      'https://sheg.stanford.edu/history-lessons',
      '核对多材料历史探究与课堂问题设计。',
    ),
    source(
      'dunlosky-2013',
      'Improving Students’ Learning With Effective Learning Techniques',
      'John Dunlosky et al.',
      '2013',
      'https://doi.org/10.1177/1529100612453266',
      '核对主动提取与间隔复习的证据。',
    ),
  ],
} satisfies LearningV2EventDetail;

const MATH_ARCHIVE = {
  id: 'worked-example-formula-graph-evidence',
  kind: 'experiment',
  title: '公式、图像与变式：从样例到可迁移条件',
  period: '1985—2015',
  summary:
    '数学公式不是符号排列。公式包含变量、参数、定义域、单位和适用条件，图像提供关系检查，变式练习检验学习者是否真正理解条件。',
  background:
    '认知负荷与样例研究关注新手如何从完整步骤过渡到独立解题。交错练习研究进一步比较混合题型对迁移与策略选择的影响。',
  timeline: [
    {
      date: '1985',
      title: '完整样例降低初期负荷',
      body: 'Sweller 与 Cooper 比较代数样例学习与直接解题，发现初学者从有步骤的样例中获取规则可减少无效搜索。样例之后仍需逐渐撤去提示。',
      sourceIds: ['sweller-cooper-1985'],
    },
    {
      date: '2006',
      title: '最少指导不等于高效教学',
      body: 'Kirschner、Sweller 与 Clark 综述认知负荷研究，强调新手缺少足够先前知识时，需要清晰示范、分步材料与练习反馈，不能只靠自由探索。',
      sourceIds: ['kirschner-2006'],
    },
    {
      date: '2010s',
      title: '图像成为关系检查工具',
      body: '函数图像把参数变化、交点、顶点和增减关系可视化。图像能帮助发现符号错误，但不能代替代数条件、定义域与单位核对。',
      sourceIds: ['openstax-transformations'],
    },
    {
      date: '2015',
      title: '交错练习改变题型选择',
      body: 'Rohrer 等比较数学交错练习与分块练习，发现混合题型可促使学习者先判断该用哪种方法。前提是每种方法已经学过，否则交错只会增加混乱。',
      sourceIds: ['rohrer-2015'],
    },
    {
      date: '2015',
      title: '变式必须改变关键条件',
      body: '有效变式不是只换数字，而是改变参数、定义域、单位和图形位置，让学习者判断哪些关系保持、哪些条件失效。这样才能检验迁移。',
      sourceIds: ['openstax-transformations', 'rohrer-2015'],
    },
    {
      date: '教学边界',
      title: '公式记忆必须与推导和检验相连',
      body: '记住外形可减少搜索时间，但若说不出条件、单位和图像含义，遇到变式仍会误用。完整学习闭环应包含样例、解释、独立题和延迟复查。',
      sourceIds: ['kirschner-2006', 'dunlosky-2013'],
    },
  ],
  outcome:
    '可观察结果包括正确识别变量与条件、由图像判断变化、用单位或代入点检查结果，并在新参数下选择合适方法。',
  significance:
    '把公式、图像和变式放在同一条推理链上，可兼顾记忆效率与数学理解，避免纯符号背诵和只凭图像猜答案。',
  sourceCards: [
    source(
      'sweller-cooper-1985',
      'The Use of Worked Examples as a Substitute for Problem Solving in Learning Algebra',
      'John Sweller & Graham Cooper',
      '1985',
      'https://doi.org/10.1207/s1532690xci0201_3',
      '核对代数样例学习与初学者负荷。',
    ),
    source(
      'kirschner-2006',
      'Why Minimal Guidance During Instruction Does Not Work',
      'Paul A. Kirschner, John Sweller & Richard E. Clark',
      '2006',
      'https://doi.org/10.1207/s15326985ep4102_1',
      '核对清晰示范、分步指导与先前知识。',
    ),
    source(
      'openstax-transformations',
      '3.5 Transformation of Functions',
      'OpenStax College Algebra 2e',
      '2025 年访问版',
      'https://openstax.org/books/college-algebra-2e/pages/3-5-transformation-of-functions',
      '核对函数变换、参数与图像关系。',
    ),
    source(
      'rohrer-2015',
      'Interleaved Practice Improves Mathematics Learning',
      'Doug Rohrer, Robert F. Dedrick & Sandra Stershic',
      '2015',
      'https://doi.org/10.1037/edu0000001',
      '核对交错练习与数学题型选择。',
    ),
    source(
      'dunlosky-2013',
      'Improving Students’ Learning With Effective Learning Techniques',
      'John Dunlosky et al.',
      '2013',
      'https://doi.org/10.1177/1529100612453266',
      '核对练习测试、间隔与学习技术边界。',
    ),
  ],
} satisfies LearningV2EventDetail;

const LAW_ARCHIVE = {
  id: 'case-method-scenario-retrieval',
  kind: 'case',
  title: '从案例到要件：法条为什么要按场景检索',
  period: '1870s—2022',
  summary:
    '法条学习不是把句子背成口号，而是把规范拆成适用对象、行为、条件、例外与后果，再用案例事实逐项匹配。案例可以帮助检索，但不能替代原文和权威解释。',
  background:
    '案例教学在法学教育中用于训练问题识别、规则提取和论证。场景化检索将抽象条文放入具体事实，再通过反例和例外检查边界。',
  timeline: [
    {
      date: '1870s',
      title: '案例法教学在美国法学院扩展',
      body: 'Langdell 式案例教学通过上诉案例训练学生提取规则和论证。它把法律视为需要从材料中分析的结构，而不是只背条文清单。',
      sourceIds: ['case-method-2018'],
    },
    {
      date: '20 世纪',
      title: '案例教学与问题解决结合',
      body: '课堂逐渐加入假设事实、角色任务和反例，让学习者在不确定事实中寻找争点。案例故事有价值，但必须以规则原文和适用条件为核对基准。',
      sourceIds: ['case-method-2018'],
    },
    {
      date: '2006',
      title: '主动提取被证明能增强保持',
      body: 'Roediger 与 Karpicke 的测试效应研究提示，法条学习不能只看案例解析。闭卷写出要件、例外和适用结论，再对照反馈，才能暴露检索漏洞。',
      sourceIds: ['roediger-karpicke-2006'],
    },
    {
      date: '2013',
      title: '练习测试成为可迁移学习工具',
      body: 'Dunlosky 等综述认为练习测试具有较强证据，但问题形式、反馈和间隔会影响效果。案例小测若只问结论，不要求规则依据，仍难以训练论证。',
      sourceIds: ['dunlosky-2013'],
    },
    {
      date: '2018',
      title: '案例法被重新审视',
      body: '案例教学研究强调课前准备、课堂讨论和反馈。没有文本核对与结构化输出时，生动案例可能只留下情节，学习者无法把规则迁移到新事实。',
      sourceIds: ['case-method-2018'],
    },
    {
      date: '2022',
      title: '规则推理与类比推理被区分',
      body: '法律推理既可依规则演绎，也可通过相似案例类比。场景化检索必须先确认规范文本和构成要件，再比较案例相似点与差异，避免只凭故事表面相似。',
      sourceIds: ['legal-reasoning-2022', 'case-method-2018'],
    },
  ],
  outcome:
    '可观察结果包括从法条提取要件、在案例事实中逐项匹配、识别例外和说明结论依据。合成案例练习不构成现实法律意见。',
  significance:
    '把案例当作检索场景而非答案库，可以同时训练记忆与论证；权威原文、构成要件和例外仍是核对底线。',
  sourceCards: [
    source(
      'case-method-2018',
      'The Case Method in Legal Education',
      'Asian Journal of Legal Education',
      '2018',
      'https://doi.org/10.1177/2322005818780754',
      '核对案例教学的目标、课堂实施与局限。',
    ),
    source(
      'roediger-karpicke-2006',
      'Test-Enhanced Learning: Taking Memory Tests Improves Long-Term Retention',
      'Henry L. Roediger III & Jeffrey D. Karpicke',
      '2006',
      'https://doi.org/10.1111/j.1467-9280.2006.01693.x',
      '核对主动提取对规则保持与反馈的作用。',
    ),
    source(
      'dunlosky-2013',
      'Improving Students’ Learning With Effective Learning Techniques',
      'John Dunlosky et al.',
      '2013',
      'https://doi.org/10.1177/1529100612453266',
      '核对练习测试、间隔和反馈条件。',
    ),
    source(
      'legal-reasoning-2022',
      'Rule-Based Legal Reasoning',
      'Cambridge University Press',
      '2022',
      'https://doi.org/10.1017/9781009162517.003',
      '核对规则适用、构成要件与演绎推理。',
    ),
    source(
      'scenario-learning-2021',
      'Comparing In-Class Scenario-Based Learning to Scenario-Based eLearning',
      'Journal of Education for Business',
      '2021',
      'https://doi.org/10.1080/08832323.2021.1943294',
      '核对场景任务与案例学习设计。',
    ),
  ],
} satisfies LearningV2EventDetail;

const ENGLISH_SOURCES = [
  'Peter N. Bowers, John R. Kirby & S. Hélène Deacon, The Effects of Morphological Instruction on Literacy Skills, 2010。https://doi.org/10.3102/0034654309359353',
  'I. S. P. Nation, Learning Vocabulary in Another Language, 2nd ed. 2022。https://doi.org/10.1017/9781009093873',
  'Amanda P. Goodwin & Soyeon Ahn, A Meta-Analysis of Morphological Interventions in English, 2012。https://doi.org/10.1080/10888438.2012.689791',
  'John Dunlosky et al., Improving Students’ Learning With Effective Learning Techniques, 2013。https://doi.org/10.1177/1529100612453266',
];

const HISTORY_SOURCES = [
  'Digital Inquiry Group, Historical Thinking Chart。来源、语境、佐证与证据问题。https://sheg.stanford.edu/historical-thinking-chart',
  'Digital Inquiry Group, History Lessons。多材料历史探究。https://sheg.stanford.edu/history-lessons',
  'U.S. National Archives, Document Analysis。文件来源、时间、目的与证据。https://www.archives.gov/education/lessons/worksheets',
  'Sam Wineburg, Historical Problem Solving, 1991。https://doi.org/10.1037/0022-0663.83.1.73',
];

const MATH_SOURCES = [
  'OpenStax, College Algebra 2e, 3.5 Transformation of Functions。https://openstax.org/books/college-algebra-2e/pages/3-5-transformation-of-functions',
  'John Sweller & Graham Cooper, The Use of Worked Examples in Learning Algebra, 1985。https://doi.org/10.1207/s1532690xci0201_3',
  'Paul A. Kirschner, John Sweller & Richard E. Clark, Why Minimal Guidance During Instruction Does Not Work, 2006。https://doi.org/10.1207/s15326985ep4102_1',
  'Doug Rohrer, Robert F. Dedrick & Sandra Stershic, Interleaved Practice Improves Mathematics Learning, 2015。https://doi.org/10.1037/edu0000001',
];

const LAW_SOURCES = [
  'Asian Journal of Legal Education, The Case Method in Legal Education, 2018。https://doi.org/10.1177/2322005818780754',
  'Henry L. Roediger III & Jeffrey D. Karpicke, Test-Enhanced Learning, 2006。https://doi.org/10.1111/j.1467-9280.2006.01693.x',
  'John Dunlosky et al., Improving Students’ Learning With Effective Learning Techniques, 2013。https://doi.org/10.1177/1529100612453266',
  'Cambridge University Press, Rule-Based Legal Reasoning, 2022。https://doi.org/10.1017/9781009162517.003',
];

export const MEMORY_SUBJECT_TRANSFER_REWRITE: CuratedCoursePlanPatchMap = {
  'memory:英语词汇：词根与例句双钩': {
    contentStatus: 'reviewed',
    prerequisite: '能查音标和词性；准备 10 个真实生词、词典释义与各自例句。',
    plainLanguageGoal:
      '学完后，你能用词根或词缀提出词义假设，再用词典与例句核实，并通过词形、释义、词性和 24 小时造句评价掌握。',
    guidedPractice:
      '为 10 个生词制作词根—词缀—词性—例句四格卡，完成看词释义、看义写词、例句填空和 24 小时造句。',
    independentPractice:
      '从真实阅读材料选 12 个生词，分别建立形态线索与语境卡，在一周后用陌生句子和听力辨词检验迁移。',
    commonErrors: [
      '看到熟悉词根就直推现代词义，未查词典和例句。',
      '只记中文对应词，不记录词性、搭配和发音。',
      '例句直接给出答案，复习时只是识别而不是主动生成。',
    ],
    sourceRefs: ENGLISH_SOURCES,
    studyPoints: [
      point('必背', '词根与词缀只提供词义假设，必须用词典、词性和真实例句核对；词汇掌握要覆盖词形、意义和使用。', 1),
      point('重点', '双钩卡一面提示形态拆解，另一面必须包含准确释义、词性、搭配和一个能区分用法的例句。', 2),
      point('易错', '词根相同不等于意义相同，词性变化也可能改变句法功能；只做选择题会高估产出能力。', 4),
    ],
    eventDetails: [ENGLISH_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜拆出词根为什么还是用错词',
        body:
          '给出十个真实生词，先做前测：看词写释义、看中文写词、填一个词性正确的句子空位。记录词形识别、释义接近、词性错误和搭配错误。再让学习者仅凭词根猜测两个陌生词，并用词典核对，常会发现历史词源与当代用法并不完全一致。诊断要保留标准音标与例句，不能只判断“像不像”。后测将分别检查形态拆解、准确释义和语境使用，三个结果不允许互相替代。',
        note: '词根假设必须回到词典。',
        objective: '能用释义、词性、搭配和例句前测区分词形熟悉与真实词汇掌握。',
        practice: '完成十词四项前测，把词根猜测与词典释义并排，标出词性和搭配错误。',
        checkpoint: '检查是否查音标与词典，是否记录词性，是否区分看到认识与能够造句。',
      },
      {
        title: '材料与概念｜词根、词缀、词性与语境',
        body:
          '词根提供历史语义线索，前缀和后缀都属于词缀，可能提示方向、程度、词性或关系，但现代词义经过演变，不能机械相加。例如同一个词根在不同词中可能已失去可直接拆解的意义。有效双钩卡包含四条信息：可核对的形态线索、标准发音与词性、准确释义、一个展现搭配的例句。形态帮助记忆词形，例句帮助记忆使用，二者通过同一问题面相连。词汇知识还分接受性与产出性，能看懂不等于能写出或在听力中辨认。',
        note: '形态线索与语境线索分工。',
        objective: '能解释词根、词缀、词性、释义和例句在词汇学习中的不同作用。',
        practice: '为一个生词制作四格卡，标明哪些信息用于提示、哪些必须核对、哪些用于产出测试。',
        checkpoint: '检查是否把词根当万能答案，是否记录词性与搭配，例句是否体现真实用法。',
      },
      {
        title: '示范与推导｜从一个陌生词推到可用例句',
        body:
          '以 credible 为例，cred 可提供“相信”的词源线索，ible 提示形容词能力，但准确释义仍需查为“可信的”。例句可写 “The report is credible because its data can be checked.” 问题面不直接写答案，而提示“cred + ible：描述证据可被相信”。示范先拆形，再查词性和释义，最后从例句中圈出搭配与原因结构。若把 credible 误用为动词，应回到词性和句法，而不是再编一个谐音故事。',
        note: '先提假设，再核对使用。',
        objective: '能把陌生词从形态假设推进到准确词性、释义和可复用例句。',
        practice: '为一个词完成假设、词典核对、词性判断、搭配圈画和问题面改写。',
        checkpoint: '检查假设与词典是否一致，例句是否包含词性线索，问题面是否泄露完整答案。',
      },
      {
        title: '引导练习｜十词双钩卡与四项后测',
        body:
          '选十个难度相近的生词，前五个只做词表与释义，后五个制作形态—词性—例句双钩卡，两组学习总时长相同。完成后做即时后测：看词写义、看义写词、选正确词性、填空。24 小时后用未见例句完成句子，并做听音辨词。记录形态线索有效、释义准确、词性正确和语境可用四类结果。若双钩组只在中译英占优而例句仍失败，结论应限定为词形提取改善，而非整体词汇掌握。',
        note: '两种编码方式要等时比较。',
        objective: '能在等时条件下比较普通词表与词根例句双钩卡的即时和延迟词汇表现。',
        practice: '提交十张卡、四项即时后测、24 小时陌生句填空和听音结果。',
        checkpoint: '检查两组难度与时长，问题面是否泄题，是否分别记录释义、词性、搭配和听力。',
      },
      {
        title: '独立迁移与评价｜把双钩带进真实阅读',
        body:
          '从当前阅读材料选十二个生词，先保留原文句和前测结果，再制作双钩卡。每张卡需有一个形态假设、一个核对后的释义、一个词性、一个原文搭配和一个自造句。间隔一周后用陌生文章辨认、听音和造句三项测试。评价四项：形态假设合理、词典核对准确、语境搭配自然、延迟迁移成立。最后记录一个词根误导案例，说明为什么必须查证。词汇卡片不是词典替代品，最终要回到真实听读说写。',
        note: '真实阅读与听力是最终检验。',
        objective: '能把词根例句双钩迁移到真实阅读词汇，并用延迟听读任务评价效果。',
        practice: '提交十二词卡、陌生文章辨词、听音测试、自造句和一个词根误导案例。',
        checkpoint: '四项自评：形态合理、释义准确、搭配自然、迁移有效；任何一项失败都要回到词典与例句。',
      },
    ],
    quiz: [
      question(
        '词根分析在词汇学习中的合理位置是什么？',
        '提供词形和词义假设，再由词典、词性与例句核对',
        ['直接替代所有词典释义', '只记词根不需要发音', '看到一个词根就认定所有词同义'],
        0,
        '词根能帮助拆解和记忆，但现代词义、词性与搭配可能变化。它必须连接到可靠释义和真实使用，不能单独作为答案，更不能跳过音标核对。',
        '事实与定义',
      ),
      question(
        '双钩组在 24 小时例句填空上失败，但看词选义表现很好，最合理的结论是什么？',
        '词汇可能停留在接受性识别，尚未形成产出性与语境使用能力',
        ['所有词根信息完全无效', '听力测试一定没有意义', '应该删除例句只背中文'],
        1,
        '再认和主动使用是不同层次。若例句与听音失败，应增加产出任务和搭配练习，而不能用选择题成绩代替整体掌握，也不能因此否认词根的提示价值。',
        '材料与推导',
      ),
      question(
        '哪种例句最不适合作为双钩卡示例？',
        '例句直接写出目标词答案，且没有体现词性或搭配',
        ['例句包含清楚搭配', '例句能在语境中区分词义', '例句旁标注词性与发音'],
        2,
        '例句应帮助理解使用并支持后续提取。直接泄题或缺少语法线索，会让复习退化为识别，无法检验产出能力，也看不到词性与搭配错误。',
        '常见误区',
      ),
      question(
        '迁移到学术阅读词汇时，哪种评价组合最完整？',
        '陌生文章中辨词、听音、词性判断和自造句四项同时检查',
        ['只看一次词表阅读速度', '只统计卡片颜色数量', '只背词根不查原文'],
        0,
        '学术词汇需要在阅读和表达中使用。多通道任务能揭示形态、意义和语法是否真正连接，避免只在原卡情境中成功，也便于定位该回到词典还是例句。',
        '迁移应用',
      ),
    ],
  },
  'memory:历史年代：时间轴与因果链': {
    contentStatus: 'reviewed',
    prerequisite: '完成记忆方法课程；准备同一事件的多份史料、年代卡和空白时间轴。',
    plainLanguageGoal:
      '学完后，你能把 8 个事件放入时间轴，区分先后、因果与证据强弱，并在 24 小时后用新材料解释变化。',
    guidedPractice:
      '用 8 个事件卡建立时间轴、因果箭头和来源表，完成闭卷排序、前后关系和一份史料证据说明。',
    independentPractice:
      '从当前历史单元选两组事件，比较时间顺序与史料解释，在新材料中判断哪些因果关系成立、哪些只是同时发生。',
    commonErrors: [
      '看到两件事先后发生就直接判定前因后果。',
      '只记年份，不记录事件参与者、范围和来源。',
      '把一条二手叙述当作全部证据，忽略材料立场与缺失。',
    ],
    sourceRefs: HISTORY_SOURCES,
    studyPoints: [
      point('必背', '时间轴只说明先后；因果判断必须另有机制、证据和竞争解释，史料要记录来源与语境。', 1),
      point('重点', '年代卡应绑定事件、参与者、范围、前后关系和至少一条来源，避免孤立数字。', 2),
      point('易错', '先后关系不等于因果关系；同一事件的多份叙述可能互补或冲突，不能只取最顺的一版。', 4),
    ],
    eventDetails: [HISTORY_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜年份背对了为什么解释仍然错',
        body:
          '把八个事件卡打乱，先做前测：按年代排序、填写相邻事件、回答两个“为什么发生”的问题，并给每个判断写材料依据。记录年份正确、顺序正确、因果箭头、证据引用和过度推断。常见错误是年份全对，却把同时发生的政策与经济变化直接写成因果。诊断时把事实、时间关系、解释和评价分成四栏，前测不要求统一结论，而要求说明哪份材料支持哪一步。后测会保留同样分层，并加入一份新材料。',
        note: '先分开事实与解释。',
        objective: '能用时间顺序、因果判断、证据引用和过度推断四类结果诊断历史记忆。',
        practice: '完成八事件排序与两题解释，逐项写出材料依据和仍不确定之处。',
        checkpoint: '检查是否只背年份，是否区分先后与因果，是否标明材料来源和解释边界。',
      },
      {
        title: '材料与概念｜年代、时间轴与因果链',
        body:
          '年代提供事件定位，时间轴显示先后与重叠，因果链说明某条件怎样通过行动或机制影响后续。三者不是同一层信息：两个事件相邻不证明一个导致另一个；相关变化也可能由第三因素、共同原因或选择材料造成。史料还要检查作者、时间、目的、受众和保存过程。有效记忆卡一面写年代与事件，另一面写参与者、背景、后果和至少一条证据。闭卷重建时应先搭时间骨架，再补因果解释与证据，防止只记顺口故事。',
        note: '顺序、机制、证据分别记。',
        objective: '能准确解释年代、时间轴、因果机制和史料证据之间的区别。',
        practice: '制作四列事件卡：时间、事件、可能机制、证据；另写一个不能由顺序推出的因果反例。',
        checkpoint: '检查每张卡是否含来源，是否把相关写成因果，是否保留不确定性和竞争解释。',
      },
      {
        title: '示范与推导｜从相邻事件推到有证据的解释',
        body:
          '假设材料中有改革、经济变化和社会运动三个相邻节点。先按时间排好，再问改革是否直接造成运动，还是通过资源分配、组织能力或信息传播产生作用。查找一份同时期文件与一份后来研究，分别标出能证明和不能证明的内容。示范结论应写成“在某范围内，材料支持某机制，但另一因素仍可能竞争”，而不是“因为在前，所以导致”。最后用箭头图区分确定先后、疑似机制和未被证据支持的关系。',
        note: '因果箭头要写机制与证据。',
        objective: '能把相邻事件转成含机制、证据和竞争解释的因果判断。',
        practice: '为三事件画时间轴和三种箭头，分别标确定、可能、未证实，并附一条来源。',
        checkpoint: '检查是否只凭顺序，是否说明行动者与机制，是否保留第三因素和证据缺口。',
      },
      {
        title: '引导练习｜八事件时间轴与证据表',
        body:
          '准备八个事件卡，每卡含年代、事件、参与者和一条材料提示。先不看教材完成排序，再补画因果箭头，每个箭头必须写机制和证据类型。随后闭卷写出三个关键转折，说明前因、后果和仍不确定处。第二天抽出两张事件卡，用新材料回答“是否支持原解释”。记录年代、顺序、机制、证据和推断五类分数；若顺序高而机制低，下一轮只练因果解释，不要继续重复年份。',
        note: '错因要落到时间或机制。',
        objective: '能用八事件材料完成时间重建、因果说明和 24 小时证据复查。',
        practice: '提交时间轴、因果箭头、三个转折说明、24 小时新材料判断和错误分类。',
        checkpoint: '检查箭头是否都有机制，证据是否可追溯，是否区分事件范围与作者解释。',
      },
      {
        title: '独立迁移与评价｜用新史料重建历史问题',
        body:
          '从当前单元选择两组事件和至少三份材料，先做前测，再制作双层时间轴：上层放年代与事件，下层放因果机制、证据和争议。间隔 24 小时后，用一份未见材料回答事件定位、前后关系、解释是否成立和还需什么证据。评价四项：年代准确、顺序稳定、因果关系有据、来源边界清楚。最后写一条“只能说明相关”的例子，提醒自己不要把叙事顺畅当作证明。历史记忆的终点是能解释材料，而不是背诵一条无争议故事。',
        note: '新史料检验解释迁移。',
        objective: '能把时间轴与史料互证迁移到新材料，并评价因果解释的证据强度。',
        practice: '提交双层时间轴、三份材料表、24 小时新材料问答和一条相关性反例。',
        checkpoint: '四项自评：时间准确、顺序稳定、机制有据、边界清楚；缺证据的箭头必须降级为假设。',
      },
    ],
    quiz: [
      question(
        '时间轴在历史学习中主要负责什么？',
        '定位事件先后与重叠，为因果和史料分析提供顺序骨架',
        ['自动证明前一件事导致后一件事', '替代所有史料来源', '说明所有参与者动机相同'],
        0,
        '时间轴组织先后关系，但不能单独证明因果。解释还需要机制、材料证据和竞争因素，否则容易把相关误当因果，也无法说明行动者为何作出选择。',
        '事实与定义',
      ),
      question(
        '两件事同年发生、时间轴相邻，作者却写成一个导致另一个，首先应检查什么？',
        '作者是否给出作用机制和独立证据，是否存在共同原因或第三因素',
        ['事件名称是否更短', '时间轴颜色是否一致', '所有后来研究是否都同意'],
        1,
        '时间相邻只提供相关线索。要判断因果，需要说明谁通过什么机制影响谁，并排除共同原因和替代解释，再核对材料是否支持该范围。',
        '材料与推导',
      ),
      question(
        '哪种年代卡最不完整？',
        '只写“某年发生某事件”，没有参与者、范围、来源和后果',
        ['记录事件与年代并附来源', '写出背景和可能机制', '标明尚不确定的解释'],
        2,
        '孤立年代容易形成顺序记忆而缺少历史内容。事件范围、参与者、材料和后果共同支持后续解释与迁移，缺失这些信息就无法判断叙事是否可靠。',
        '常见误区',
      ),
      question(
        '把时间轴迁移到世界史比较时，哪种做法最稳妥？',
        '并列不同地区时间线，再用同时代材料比较制度、交流与共同冲击',
        ['只按一个国家的时间顺序看世界', '把同时发生自动写成全球因果', '删除不同材料的立场差异'],
        0,
        '世界史需要处理不同地区的并行时间与互动。并列时间线和多源材料能区分独立发展、传播与共同环境，避免单线叙事，也能暴露资料覆盖不均。',
        '迁移应用',
      ),
    ],
  },
  'memory:数学公式：条件与图像': {
    contentStatus: 'reviewed',
    prerequisite: '完成基础函数与代数课程；准备方格纸、计算器和可绘制图像的公式卡。',
    plainLanguageGoal:
      '学完后，你能为 8 个公式标出变量、参数、定义域、单位和适用条件，并用图像或代入点检查变式。',
    guidedPractice:
      '为 8 个二次函数或变换公式制作条件—图像—单位卡，完成参数解释、顶点判断、代入检验和变式题。',
    independentPractice:
      '从当前数学单元选 6 个公式，比较纯符号记忆与条件图像卡在 24 小时后变式题中的表现，并保留错因。',
    commonErrors: [
      '只记公式外形，不写变量含义、定义域或参数限制。',
      '把图像当作证明，未用代数条件和代入点核对。',
      '变式只换数字不换条件，未检验参数变化时的适用范围。',
    ],
    sourceRefs: MATH_SOURCES,
    studyPoints: [
      point('必背', '公式卡必须同时写变量、参数、定义域或限制、单位和适用条件；图像只作关系检查，不能替代推导。', 1),
      point('重点', '顶点式 y=a(x-h)²+k 中 a 控制开口与伸缩，h 控制水平平移，k 控制竖直平移，顶点为 (h,k)。', 2),
      point('易错', '括号内 x-h 的符号容易读反；参数为零或用错单位时，公式形式可能仍像正确，实际条件已失效。', 4),
    ],
    eventDetails: [MATH_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜公式背得熟为什么一换参数就错',
        body:
          '给出五个公式题，先做前测：写出每个符号的含义、说出参数变化、画大致图像、代入一个点检查。记录公式外形、变量解释、条件、图像和变式五类结果。常见情况是能背 y=a(x-h)²+k，却把顶点写成 (h,k) 以外位置，或看到 a<0 仍画开口向上。诊断要求每条结论附理由，例如“因为 a<0，所以开口向下”。前测不追求画得漂亮，而看能否由条件推出图像特征并用一个点反查。',
        note: '每个图像结论都要有代数依据。',
        objective: '能用变量、条件、图像和代入检查诊断公式记忆中的具体缺口。',
        practice: '完成五题前测，逐题写符号含义、一个参数结论、一个图像特征和一个代入点。',
        checkpoint: '检查是否只背外形，是否写出定义域或限制，图像与参数是否对应。',
      },
      {
        title: '材料与概念｜变量、参数、条件与图像',
        body:
          '数学公式是一组带条件的关系，不是无意义字符串。以 y=a(x-h)²+k 为例，a 不能为 0 才是二次函数；a 的符号控制开口，绝对值影响纵向伸缩，h、k 给顶点平移。公式卡应写变量与参数、定义域或限制、图像特征、单位或量纲和一个检验点。图像能快速显示增减、交点和极值，却可能因比例或描绘误差造成误判，所以要用代数变形和代入验证。变式题应改变参数、条件或表达形式，而不只换一个数字。',
        note: '参数变化要能解释。',
        objective: '能说明公式中的变量、参数、条件、图像与单位怎样共同决定使用。',
        practice: '为顶点式制作五格卡，并写出 a=0、a<0、h 改变三种变式预测。',
        checkpoint: '检查条件是否完整，参数方向是否正确，是否用图像与代数双重核对。',
      },
      {
        title: '示范与推导｜从参数符号推到图像与检验点',
        body:
          '分析 y=-2(x-3)²+4。因为 a=-2<0，所以开口向下且比基本抛物线更窄；顶点由 x-3=0 得 x=3，再取 y=4，顶点为 (3,4)。当 x=2 或 x=4 时，y=-2(±1)²+4=2，代入点 (2,2) 可以检查曲线相对顶点下降。示范还要说明若把 x-3 误读成左移 3，图像与点检验会冲突。推导链是：条件—参数—顶点—开口—取样点—图像，任何一步不吻合都回到代数核对。',
        note: '代入点是图像的反查证据。',
        objective: '能由函数参数完整推导顶点、开口、伸缩和可检验点。',
        practice: '对一个顶点式完成参数解释、顶点计算、两个取样点、草图和一个常见误读反例。',
        checkpoint: '检查 x-h 符号、a 不为零条件、取样点计算和图像方向是否一致。',
      },
      {
        title: '引导练习｜八张条件图像卡',
        body:
          '准备八个二次函数或变换公式，每张卡只写公式作为问题面，答案面必须包含变量含义、参数限制、顶点或关键点、开口或趋势、单位和一个检验点。先做纯符号记忆五分钟，再做图像卡五分钟，完成即时后测：给参数判断图像、给图像选择公式、给一个点检验。第二天改两个参数条件做变式。记录条件漏写、符号误读、图像方向、代入计算和单位五类错误，不能只统计最后对错。',
        note: '错因要落到公式哪一条。',
        objective: '能用条件图像卡完成参数、图像与变式题的多向连接。',
        practice: '提交八张条件图像卡、即时三类题、24 小时参数变式，以及按五类错因整理的全部记录。',
        checkpoint: '检查每张卡是否有条件与检验点，是否改变关键参数，是否用单位或代入验证。',
      },
      {
        title: '独立迁移与评价｜在新参数下选择并证明方法',
        body:
          '从当前单元选六个公式，覆盖函数、几何或统计条件。每个公式制作“符号—条件—图像—单位—检验”五格卡，然后完成三道新参数题：一道由公式画图，一道由图像反推公式，一道判断条件缺失时方法是否仍成立。24 小时后不看卡重做，并写出选择依据。评价四项：条件完整、图像关系正确、检验有效、变式可迁移。最后留下一个因定义域或单位不适用而拒绝套公式的反例，证明记忆没有取代判断。',
        note: '会拒绝错误套用才算掌握。',
        objective: '能把公式条件与图像迁移到新参数和新题型，并说明不适用边界。',
        practice: '提交六张五格卡、三类变式题、24 小时重测和一个拒绝套公式的反例。',
        checkpoint: '四项自评：条件完整、图像正确、检验成立、边界清楚；条件缺失时必须停止套用并重新分析。',
      },
    ],
    quiz: [
      question(
        '一张合格数学公式卡最不能缺少什么？',
        '变量与参数含义、限制条件、图像关系、单位和检验方式',
        ['只写公式最后答案', '只记录页码', '只把字母涂成不同颜色'],
        0,
        '公式是带条件的关系。变量、参数、限制、单位和检验共同支持理解与迁移，颜色不能替代这些信息，也不能说明参数变化会怎样影响图像。',
        '事实与定义',
      ),
      question(
        '对 y=-2(x-3)²+4，哪一个判断正确？',
        'a<0 开口向下，顶点为 (3,4)，x=2 时 y=2',
        ['开口向上且顶点 (-3,4)', '顶点 (3,-4) 且不过 (2,2)', 'a=0 所以图像是直线'],
        1,
        'a=-2 表示开口向下并变窄；x-3=0 得 h=3，加上 k=4 得顶点 (3,4)。代入 x=2 得 y=2，可用于核对，若结果不符应回到符号与计算。',
        '材料与推导',
      ),
      question(
        '哪种变式最不能检验公式理解？',
        '保持所有条件不变，只把答案数字换成另一个相同结构数字',
        ['改变参数符号并要求解释图像', '缺少定义域时判断能否套用', '由图像反推公式条件'],
        2,
        '只换数字可能训练机械计算，却不检查参数、条件和图像关系。改变符号、定义域或表达方向更能暴露误解，也能检验是否会用图像反查。',
        '常见误区',
      ),
      question(
        '把公式卡迁移到物理计算时，最先增加的核对项是什么？',
        '单位与量纲，以及公式成立的条件和变量范围',
        ['只把公式写得更长', '删除所有图像', '只记字母顺序'],
        0,
        '物理公式必须与单位和量纲一致，并有实验或模型条件。数学外形正确但单位不符时，计算结果不能直接使用，还要核对变量范围和测量误差。',
        '迁移应用',
      ),
    ],
  },
  'memory:法条与规范：场景化检索': {
    contentStatus: 'reviewed',
    prerequisite: '能读取规范原文并标记条件句；本课只使用合成案例，不作为真实法律意见。',
    plainLanguageGoal:
      '学完后，你能把法条拆成适用对象、行为、构成要件、例外和后果，并用合成案例完成有依据的检索结论。',
    guidedPractice:
      '用一条合成规范建立要件表，分析六个小案例，写出争点、规则、适用、例外、结论和仍需核实的事实。',
    independentPractice:
      '选两条真实公开规范，只做学习性要件拆解，再用合成事实卡比较相似案例与差异，并标注需咨询专业人士的边界。',
    commonErrors: [
      '只背法条结论，不拆分适用对象、行为、条件和例外。',
      '看到一个相似案例就照搬结果，不比较关键事实差异。',
      '把合成课堂案例当作现实法律意见，省略原文版本和专业核实。',
    ],
    sourceRefs: LAW_SOURCES,
    studyPoints: [
      point('必背', '法条检索必须回到规范原文，拆出适用对象、行为、构成要件、例外与后果，再用关键事实逐项匹配。', 1),
      point('重点', '案例卡应写争点、规则、事实对应、例外、结论和不确定事实，不能让故事相似替代要件分析。', 2),
      point('易错', '课堂合成案例只用于方法训练；现实事项要核对现行有效文本、地域、时间和专业意见。', 4),
    ],
    eventDetails: [LAW_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜背出法条为什么套不进案例',
        body:
          '先给出一条合成规范：“进入校园实验楼须佩戴有效通行证；紧急救援人员除外。”再给三个小案例，要求写出适用对象、触发条件、例外和结论。前测记录规则复述、要件缺失、例外遗漏和事实越界。这个练习不涉及真实法律效力，只训练阅读结构。常见错误是看到“进入实验楼”就处罚，却没有检查是否为紧急救援人员，或把没有通行证与通行证过期混为一谈。后测会换事实，但仍要求回到同一条规范。',
        note: '先拆要件，再判断故事。',
        objective: '能用适用对象、条件、例外和后果诊断法条阅读中的遗漏。',
        practice: '完成三个合成案例的前测，逐条写出规范要件、事实匹配和仍不确定的信息。',
        checkpoint: '检查是否引用原文结构，是否遗漏例外，是否把假设事实当成已证实事实。',
      },
      {
        title: '材料与概念｜构成要件与场景检索',
        body:
          '规范通常由适用对象、行为或状态、构成要件、例外、程序与后果组成。案例检索不是寻找情节最像的一则故事，而是把案件事实映射到每个构成要件，并标出已证实、未证实和冲突信息。案例教学有助于形成问题图式，但必须回到规范原文和权威解释。规则推理与类比推理也要区分：类比需要说明相似点为何在法律上重要，差异是否会改变结论。合成案例可以训练方法，却不能替代现行法核对与专业判断。',
        note: '事实匹配要逐要件进行。',
        objective: '能解释法条原文、构成要件、案例事实、例外与结论之间的推理关系。',
        practice: '为一条合成规范制作六格表：对象、行为、条件、例外、后果、需核实事实。',
        checkpoint: '检查是否拆出全部条件，是否说明案例相似点的法律相关性，是否保留专业边界。',
      },
      {
        title: '示范与推导｜从一条规范推到案例结论',
        body:
          '对“进入实验楼须佩戴有效通行证，紧急救援除外”制作要件表。案例：某人通行证过期，但正在护送受伤学生进入实验楼。先判断是否属于紧急救援，再核对通行证有效性是否仍为必要条件，若例外成立则不能直接按普通违规处理。示范输出应包含争点、规范原文、事实证据、例外判断、结论和未决问题。若只写“通行证过期所以违规”，遗漏例外；若只写“救人就一定例外”，又没有核实紧急性和救援身份。',
        note: '结论必须能回到每个要件。',
        objective: '能把案例事实逐项映射到规范要件，并处理例外与证据不确定。',
        practice: '完成一个合成案例的要件表，写出两种可能解释和各自需要的补充事实。',
        checkpoint: '检查争点是否清楚，例外是否有事实支持，结论是否标明条件与不确定性。',
      },
      {
        title: '引导练习｜六个合成案例的检索卡',
        body:
          '围绕一条合成规范设计六个案例，覆盖要件齐全、缺少条件、例外成立、例外不成立、事实冲突和证据不足。每个案例先遮住结论，完成即时后测：圈出适用对象、列出要件、标记例外、写结论依据。第二天重新排列事实，只改变一个关键条件，再做 24 小时变式判断。记录原文遗漏、要件错配、例外漏判和事实跳跃四类错误。案例情节可相似，但结论必须由要件差异决定。',
        note: '每次只改变一个关键事实。',
        objective: '能用六类合成案例完成规范检索，并通过 24 小时单变量变式检查迁移。',
        practice: '提交六张案例卡、即时要件表、24 小时变式结论和四类错误统计。',
        checkpoint: '检查每张卡是否有原文、要件、例外和事实依据，是否区分已证实与假设。',
      },
      {
        title: '独立迁移与评价｜真实规范的学习性拆解',
        body:
          '选择两条公开、现行有效的规范，只做学习性要件拆解，不提供现实法律意见。记录来源、版本、发布日期和适用地域，再制作对象、行为、条件、例外、后果与程序卡。用合成事实完成两个变式和一次 24 小时检索。评价四项：原文准确、要件完整、案例匹配、边界清楚。最后写一栏“必须核实的信息”，包括时效、地域、主体身份和权威解释。若问题涉及现实权益，应停止自学推断并寻求合资格专业人士。',
        note: '方法训练不等于法律意见。',
        objective: '能把场景化检索迁移到公开规范，并明确时效、地域和专业判断边界。',
        practice: '提交两条规范的来源卡、要件表、合成案例、24 小时变式和必须核实清单。',
        checkpoint: '四项自评：原文可追溯、要件完整、事实匹配、专业边界明确；现实争议不得由课堂卡片替代。',
      },
    ],
    quiz: [
      question(
        '场景化法条检索最核心的操作是什么？',
        '回到规范原文，拆分适用对象、要件、例外与后果，再逐项匹配事实',
        ['找情节最相似的案例照抄结论', '只背法规名称', '只看网上摘要不看版本'],
        0,
        '规则适用需要原文和事实双重对应。案例可提供问题图式，但不能替代构成要件分析与时效、地域核对，也不能跳过例外。',
        '事实与定义',
      ),
      question(
        '合成案例中通行证过期者正在紧急救援，为什么不能直接下结论？',
        '需要核实紧急救援例外是否成立，并判断其与通行证条件的适用关系',
        ['因为所有过期证件都会自动有效', '因为案例文字太长', '因为只看法条名称就足够'],
        1,
        '例外事实可能改变适用结果，但仍需核实身份、紧迫性和证据。规则推理必须逐构成要件完成，不能由单一情节跳到结论，也不能只凭同情判断。',
        '材料与推导',
      ),
      question(
        '哪种案例学习最可能造成错误迁移？',
        '只记相似故事的最终结果，不比较关键事实和法律要件',
        ['标出原文版本与地域', '区分要件与例外', '在 24 小时后做单事实变式'],
        2,
        '案例结果依赖具体要件与事实组合。只记故事结局会把类比变成照搬，无法识别相似点是否具有法律意义，也容易遗漏关键差异。',
        '常见误区',
      ),
      question(
        '把本课方法用于现实合同争议前，最重要的一步是什么？',
        '核对现行有效文本、适用地域和时间，并寻求合资格专业意见',
        ['直接套用课堂合成案例结论', '只发布到社交媒体求证', '删除所有不确定事实'],
        0,
        '课堂方法不能替代法律意见。现实事项需核对权威文本和专业判断，并保存证据，不能把合成案例当结论，也不能省略适用地域与时间。',
        '迁移应用',
      ),
    ],
  },
};
