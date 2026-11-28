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

const DEDUCTION_ARCHIVE = {
  id: 'deductive-validity-proof',
  kind: 'concept',
  title: '有效与可靠：演绎为什么能脱离结论真假来检查',
  period: '古代逻辑—现代形式逻辑',
  summary:
    '演绎有效性关心前提若真时结论是否必然真。有效推理仍可能因前提虚假而得到不可靠结论；可靠则要求有效且前提真实。',
  background:
    '从三段论到现代命题逻辑，研究者把推理形式与具体内容分开。形式化让反模型和证明成为检查论证的工具。',
  timeline: [
    {
      date: '古代',
      title: '三段论整理前提与结论关系',
      body: '亚里士多德传统分析全称、特称与否定命题的组合，形成可检查的推理形式。它强调结论必须由前提结构推出，而不是取决于说话者声望。',
      sourceIds: ['sep-classical-logic'],
    },
    {
      date: '19 世纪末',
      title: '现代逻辑扩展形式语言',
      body: 'Frege 等把连接词、量词和推理规则形式化，使复杂句子可转成符号结构。形式化减少自然语言歧义，也让反模型更精确。',
      sourceIds: ['sep-classical-logic'],
    },
    {
      date: '20 世纪',
      title: '自然演绎与证明系统进入教学',
      body: '自然演绎用引入和消去规则展示结论怎样一步步获得。证明正确说明形式有效，却不能自动证明现实前提为真。',
      sourceIds: ['forallx-calgary'],
    },
    {
      date: '20 世纪中后期',
      title: '有效性、可靠性与完备性被区分',
      body: '逻辑教材区分句法证明与语义真值：有效看所有模型，可靠看前提真实，证明系统则讨论可证明与有效之间的关系。',
      sourceIds: ['forallx-calgary', 'sep-classical-logic'],
    },
    {
      date: '当代教学',
      title: '反模型成为检查论证的工具',
      body: '若能为前提真、结论假构造一致情境，就说明当前形式无效。反模型比只说“感觉不对”更能定位推理漏洞。',
      sourceIds: ['forallx-calgary'],
    },
    {
      date: '应用边界',
      title: '形式有效不等于现实正确',
      body: '把真实论证形式化后，还要检查前提、定义和省略语义。错误翻译可能把有效论证误判为无效，或把虚假前提藏进符号。',
      sourceIds: ['sep-classical-logic', 'forallx-calgary'],
    },
  ],
  outcome:
    '可观察结果是能把论证转成形式，判断前提真时结论是否可能假，并分别说明有效性与前提真实性。',
  significance:
    '这一结构让演绎评价从“我同意结论”转为可检查的形式，同时保留现实前提与语言翻译的责任。',
  sourceCards: [
    source(
      'sep-classical-logic',
      'Classical Logic',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/logic-classical/',
      '核对形式语言、语义有效性与逻辑后承。',
    ),
    source(
      'forallx-calgary',
      'forall x: Calgary',
      'P. D. Magnus et al., Open Logic Project',
      '2025 年访问版',
      'https://forallx.openlogicproject.org/',
      '核对自然演绎、证明、有效与可靠。',
    ),
    source(
      'sep-logic',
      'Logic and Reasoning',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/logic/',
      '核对逻辑、推理与论证评价的总体框架。',
    ),
    source(
      'openstax-philosophy',
      'Introduction to Philosophy',
      'OpenStax',
      '2025 年访问版',
      'https://openstax.org/details/books/introduction-philosophy',
      '核对逻辑与哲学论证的开放教材背景。',
    ),
  ],
} satisfies LearningV2EventDetail;

const INDUCTION_ARCHIVE = {
  id: 'inductive-sample-support',
  kind: 'concept',
  title: '样本与支持：归纳结论为什么只能写成概率',
  period: '18 世纪—2019',
  summary:
    '归纳从有限观察推到更广结论，结论强度取决于样本大小、选择方式、代表性、测量和反例。它不能获得演绎式必然性。',
  background:
    '休谟问题讨论从过去经验推到未来是否可证明，现代统计与研究方法则用抽样、概率和不确定性来评价归纳支持。',
  timeline: [
    {
      date: '18 世纪',
      title: '休谟提出归纳的辩护问题',
      body: '休谟追问：我们凭什么从过去反复经验推出未来必然相同。归纳习惯能指导行动，但若要求演绎式必然保证，就需要额外前提。',
      sourceIds: ['sep-problem-induction'],
    },
    {
      date: '20 世纪',
      title: '归纳逻辑建立概率框架',
      body: '归纳逻辑研究证据怎样改变假设概率，区分演绎保证与程度支持。结论不再二分为真或假，而要说明在当前证据下的可信程度。',
      sourceIds: ['sep-inductive-logic'],
    },
    {
      date: '20 世纪中后期',
      title: '抽样与代表性进入统计教学',
      body: '随机抽样、样本量与选择偏差决定样本能否代表总体。方便样本即使很大，也可能系统遗漏某类人群而不具代表性。',
      sourceIds: ['openintro-statistics'],
    },
    {
      date: '1990s—2000s',
      title: '观察研究强调偏倚与置信区间',
      body: '统计报告逐渐要求说明效应大小、不确定性和研究设计。单一显著结果不能替代重复与一致证据。',
      sourceIds: ['openintro-statistics', 'nasem-reproducibility'],
    },
    {
      date: '2019',
      title: '重复性报告区分结果与推广',
      body: '美国国家科学院报告讨论研究重复、可重复性和解释边界。一个样本中的发现需要跨场景验证，才可能支持更广归纳。',
      sourceIds: ['nasem-reproducibility'],
    },
    {
      date: '应用',
      title: '归纳结论要写样本、概率与反例',
      body: '结论应说明样本来源、范围和不确定性，并主动寻找能削弱概括的反例。只增加支持案例而忽略选择机制，会制造虚假稳定感。',
      sourceIds: ['sep-inductive-logic', 'openintro-statistics'],
    },
  ],
  outcome:
    '可观察结果是能判断样本是否代表目标总体，并把“所有”“一定”改成与数据匹配的概率或范围结论。',
  significance:
    '归纳训练让学习者评价证据累积与样本选择，而不是用个别成功案例制造普遍规律。',
  sourceCards: [
    source(
      'sep-inductive-logic',
      'Inductive Logic',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/logic-inductive/',
      '核对归纳支持、概率与证据程度。',
    ),
    source(
      'sep-problem-induction',
      'The Problem of Induction',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/induction-problem/',
      '核对休谟问题与归纳辩护边界。',
    ),
    source(
      'openintro-statistics',
      'OpenIntro Statistics',
      'OpenIntro',
      '2025 年访问版',
      'https://www.openintro.org/book/os/',
      '核对抽样、代表性、概率与不确定性。',
    ),
    source(
      'nasem-reproducibility',
      'Reproducibility and Replicability in Science',
      'National Academies',
      '2019',
      'https://nap.nationalacademies.org/catalog/25303/reproducibility-and-replicability-in-science',
      '核对重复验证、推广与解释边界。',
    ),
  ],
} satisfies LearningV2EventDetail;

const ANALOGY_ARCHIVE = {
  id: 'structure-mapping-analogy',
  kind: 'concept',
  title: '结构映射：类比借的是关系，不是表面相似',
  period: '1983—1997',
  summary:
    '强类比把源领域中的关系结构映射到目标领域，再检验关键差异和预测。表面元素相似但关系不同，通常不能支持迁移。',
  background:
    '结构映射研究比较人们怎样从熟悉案例推理解新问题，强调高阶关系、系统性和一致性，而不是只数共同属性。',
  timeline: [
    {
      date: '1983',
      title: '结构映射理论提出',
      body: 'Gentner 将类比描述为源域到目标域的关系映射。对象可以不同，但因果关系、层级和约束若同构，类比才可能提供推理结构。',
      sourceIds: ['gentner-1983'],
    },
    {
      date: '1980s',
      title: '表面相似与结构相似被区分',
      body: '两个故事有相同角色，不代表推理关系相同；元素名称不同，也可能共享同一机制。评价类比要指出哪些关系被映射。',
      sourceIds: ['sep-analogy', 'gentner-1983'],
    },
    {
      date: '1990s',
      title: '系统性与一致性受到重视',
      body: '若一个映射能同时解释多条相互关联的关系，通常比零散共同点更有支持力。类比不是随便找一条相似，而是找可工作的结构。',
      sourceIds: ['gentner-1983'],
    },
    {
      date: '1997',
      title: '类比与相似性被放入同一框架',
      body: 'Gentner 与 Markman 比较结构对齐与属性相似。类比更依赖关系一致性，相似判断还可能受表面特征影响，需要明确任务。',
      sourceIds: ['gentner-markman-1997'],
    },
    {
      date: '当代教学',
      title: '关键差异决定迁移上限',
      body: '类比后要列出源域与目标域不同的约束、尺度和反馈。如果差异会改变结论，就应将类比降为启发工具，不能直接当证据。',
      sourceIds: ['sep-analogy'],
    },
    {
      date: '应用边界',
      title: '类比生成假设，不替代验证',
      body: '类比可提出新预测和解释，但预测仍需在目标域检验。结构相似增加可迁移性，不保证目标域一定遵循相同机制。',
      sourceIds: ['sep-analogy', 'gentner-markman-1997'],
    },
  ],
  outcome:
    '可观察结果是能画出源域与目标域的关系映射，指出关键相似、关键差异和一个可检验预测。',
  significance:
    '结构映射让类比从修辞变成可评估的推理工具，同时保留目标域验证的必要性。',
  sourceCards: [
    source(
      'gentner-1983',
      'Structure-Mapping: A Theoretical Framework for Analogy',
      'Dedre Gentner, Cognitive Science',
      '1983',
      'https://doi.org/10.1207/s15516709cog0702_3',
      '核对关系映射、系统性与结构相似。',
    ),
    source(
      'gentner-markman-1997',
      'Structure Mapping in Analogy and Similarity',
      'Dedre Gentner & Arthur B. Markman, American Psychologist',
      '1997',
      'https://doi.org/10.1037/0003-066X.52.1.45',
      '核对类比、相似性与结构对齐。',
    ),
    source(
      'sep-analogy',
      'Analogy and Analogical Reasoning',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/reasoning-analogy/',
      '核对类比评价、关键差异与推理作用。',
    ),
    source(
      'forallx-calgary',
      'forall x: Calgary',
      'Open Logic Project',
      '2025 年访问版',
      'https://forallx.openlogicproject.org/',
      '核对论证结构与形式支持背景。',
    ),
  ],
} satisfies LearningV2EventDetail;

const FALLACY_ARCHIVE = {
  id: 'fallacy-patterns-and-labels',
  kind: 'concept',
  title: '谬误不是万能标签：先找模式，再问修复',
  period: '古代—当代',
  summary:
    '谬误是常见但有争议的错误论证模式。标注名称不如指出错误落在形式、相关性、语言或证据哪一层，并说明怎样修复。',
  background:
    '从古代辩驳术到非形式逻辑，谬误研究既列模式，也提醒同一段话可能因语境、省略前提和解释不同而承担不同评价。',
  timeline: [
    {
      date: '古代',
      title: '谬误被系统分类',
      body: '亚里士多德《辩谬篇》整理语言和论证中的常见错误。分类帮助识别模式，但名称本身不能替代对具体推理的说明。',
      sourceIds: ['sep-fallacies'],
    },
    {
      date: '20 世纪中后期',
      title: '非形式逻辑重新审视谬误',
      body: '非形式逻辑研究日常论证、语境和省略前提，指出脱离对话目的很难判断一句话是否真的构成谬误。',
      sourceIds: ['sep-fallacies', 'walton-fallacies'],
    },
    {
      date: '1980s—1990s',
      title: '论证图与修复问题进入教学',
      body: '课堂不只要求学生说出谬误名称，还要补前提、指出相关性缺口或重新定义概念。修复问题能防止把标签当作终止讨论。',
      sourceIds: ['forallx-calgary'],
    },
    {
      date: '1990s',
      title: '对话语境被纳入评价',
      body: '同一诉诸权威在引用专家证据时可能合理，在无关领域却不可靠。评价要问权威是否具备相关性、共识是否经过独立形成。',
      sourceIds: ['walton-fallacies'],
    },
    {
      date: '当代',
      title: '形式与非形式错误被分开讨论',
      body: '否定前件属于形式问题，歧义和人身攻击更多涉及语言与相关性。把全部错误都叫“逻辑谬误”会掩盖真正需要修复的层次。',
      sourceIds: ['sep-fallacies'],
    },
    {
      date: '应用边界',
      title: '最善意解释优先于快速贴标签',
      body: '遇到省略表达，应先补最合理前提再评价。若修复后论证成立，原句可能只是表达不完整；若修复后仍错误，才说明模式问题。',
      sourceIds: ['sep-fallacies', 'forallx-calgary'],
    },
  ],
  outcome:
    '可观察结果是能说出错误模式、所在层级、修复问题和反例，而不是只给一个拉丁名称。',
  significance:
    '这一训练把谬误识别从口号和攻击工具变成论证修复程序，并保留语境与善意解释。',
  sourceCards: [
    source(
      'sep-fallacies',
      'Fallacies',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/fallacies/',
      '核对谬误定义、分类争议与语境。',
    ),
    source(
      'walton-fallacies',
      'Informal Logic: A Handbook for Critical Argumentation',
      'Douglas Walton',
      '1989',
      'https://doi.org/10.1017/CBO9780511804632',
      '核对对话语境与非形式论证评价。',
    ),
    source(
      'forallx-calgary',
      'forall x: Calgary',
      'Open Logic Project',
      '2025 年访问版',
      'https://forallx.openlogicproject.org/',
      '核对形式错误与反模型。',
    ),
    source(
      'purdue-logical-fallacies',
      'Logical Fallacies',
      'Purdue Online Writing Lab',
      '2025 年访问版',
      'https://owl.purdue.edu/owl/general_writing/academic_writing/logic_in_argumentative_writing/fallacies.html',
      '核对常见非形式谬误及写作修复。',
    ),
  ],
} satisfies LearningV2EventDetail;

const DEDUCTION_SOURCES = [
  'Stanford Encyclopedia of Philosophy, Classical Logic。https://plato.stanford.edu/entries/logic-classical/',
  'forall x: Calgary, An Open Introduction to Formal Logic。https://forallx.openlogicproject.org/',
  'Stanford Encyclopedia of Philosophy, Logic and Reasoning。https://plato.stanford.edu/entries/logic/',
  'OpenStax, Introduction to Philosophy。https://openstax.org/details/books/introduction-philosophy',
];

const INDUCTION_SOURCES = [
  'Stanford Encyclopedia of Philosophy, Inductive Logic。https://plato.stanford.edu/entries/logic-inductive/',
  'Stanford Encyclopedia of Philosophy, The Problem of Induction。https://plato.stanford.edu/entries/induction-problem/',
  'OpenIntro, OpenIntro Statistics。https://www.openintro.org/book/os/',
  'National Academies, Reproducibility and Replicability in Science, 2019。https://nap.nationalacademies.org/catalog/25303/reproducibility-and-replicability-in-science',
];

const ANALOGY_SOURCES = [
  'Dedre Gentner, Structure-Mapping, Cognitive Science, 1983。https://doi.org/10.1207/s15516709cog0702_3',
  'Dedre Gentner & Arthur B. Markman, Structure Mapping in Analogy and Similarity, 1997。https://doi.org/10.1037/0003-066X.52.1.45',
  'Stanford Encyclopedia of Philosophy, Analogy and Analogical Reasoning。https://plato.stanford.edu/entries/reasoning-analogy/',
  'forall x: Calgary。https://forallx.openlogicproject.org/',
];

const FALLACY_SOURCES = [
  'Stanford Encyclopedia of Philosophy, Fallacies。https://plato.stanford.edu/entries/fallacies/',
  'Douglas Walton, Informal Logic: A Handbook for Critical Argumentation。https://doi.org/10.1017/CBO9780511804632',
  'forall x: Calgary。https://forallx.openlogicproject.org/',
  'Purdue Online Writing Lab, Logical Fallacies。https://owl.purdue.edu/owl/general_writing/academic_writing/logic_in_argumentative_writing/fallacies.html',
];

export const THINKING_LOGIC_REWRITE: CuratedCoursePlanPatchMap = {
  'thinking:演绎：前提如何推出结论': {
    contentStatus: 'reviewed',
    prerequisite: '完成清晰思考课程；能识别主张、理由和结论。',
    plainLanguageGoal:
      '学完后，你能把条件句论证形式化，用反模型检查有效性，并分别判断推理有效和前提真实。',
    guidedPractice:
      '分析 10 个短论证，标出形式、寻找前提真而结论假的反模型，并分开写有效性与可靠性。',
    independentPractice:
      '从评论文章选 3 段论证，转写条件句、补省略前提，并用一个反模型或前提核查评价。',
    commonErrors: [
      '因为结论事实上为真，就认定推理有效。',
      '因为前提听起来合理，就跳过从前提到处结论的形式检查。',
      '把否定前件或肯定后件误当成有效推理。',
    ],
    sourceRefs: DEDUCTION_SOURCES,
    studyPoints: [
      point('必背', '演绎有效指前提若真则结论不可能假；可靠还要求前提真实，两者不能混为一谈。', 1),
      point('重点', '条件句推理要检查方向：肯定前件与否定后件可能有效，否定前件与肯定后件通常无效。', 2),
      point('易错', '反模型要求前提真、结论假且情境一致；只说“我觉得不可能”不算形式反驳。', 4),
    ],
    eventDetails: [DEDUCTION_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜结论是真的，推理就一定有效吗',
        body:
          '给出八段短论证，有些形式有效但前提可疑，有些前提真实却推不出结论。先做前测，要求分别标出前提、结论、直觉真假和形式判断。记录是否因结论喜欢而判有效，是否把事实真假与推理关系混在一起。示范题可用“若下雨则地面湿；没下雨；所以地面不湿”，结论可能因洒水而假。前测需要保留原句，后测再要求写反模型，避免只靠日常经验猜。',
        note: '先看前提与结论关系。',
        objective: '能分开记录论证形式、前提真假、结论真假和有效性直觉。',
        practice: '完成八段论证前测，每段写前提、结论、一个可能反模型和初步有效性判断。',
        checkpoint: '检查是否用结论真假代替有效性，是否保留条件方向，是否说明反模型前提与结论。',
      },
      {
        title: '材料与概念｜形式、有效性、可靠性与反模型',
        body:
          '演绎论证声称前提若真，结论必然真。有效性只评价这个关系；可靠性要求论证有效且所有前提真实。条件句 P→Q 中，肯定 P 可推出 Q，否定 Q 可推出非 P；肯定 Q 或否定 P 都不能反向推出另一项。形式化不是把自然语言逐字换符号，而要保留条件、范围和歧义。反模型是让所有前提真而结论假的可能情境；只要能构造一致反模型，当前形式就无效。现实前提是否真实要另查。',
        note: '有效看形式，可靠再加真前提。',
        objective: '能准确解释形式、有效性、可靠性和反模型，并识别四种条件句模式。',
        practice: '为四种条件句模式各写一个形式、一个有效或无效判断和一个反模型。',
        checkpoint: '检查条件方向是否正确，是否区分有效与可靠，反模型是否与前提相容。',
      },
      {
        title: '示范与推导｜从自然语言到反模型',
        body:
          '把“如果项目按期完成，就会通过验收；项目通过验收；所以项目按期完成”写成 P→Q、Q，因此 P。示范先指出这是肯定后件，再构造反模型：项目延期但通过整改后验收，使前提真而结论假。这个反例说明结论并非必然。若原句实际表达“只有按期完成才能验收”，翻译会不同，因此要回问定义。示范输出包括自然语言、符号、可能反模型和翻译风险。有效性判断不是拉丁术语表演，而是能否找到前提真结论假的一致情境。',
        note: '先准确翻译，再判形式。',
        objective: '能把自然语言条件句准确形式化，并用反模型判断推理模式。',
        practice: '为两个容易混淆的条件句完成翻译、模式命名、反模型和可靠性核查。',
        checkpoint: '检查翻译是否保留原意，反模型是否一致，是否另查前提真实性。',
      },
      {
        title: '引导练习｜十段论证的有效性表',
        body:
          '准备十段论证，覆盖肯定前件、否定后件、否定前件、肯定后件、选言推理和省略前提。学习者先做前测，将论证形式化，再用反模型检查有效性；第二栏单独评前提真实性，最后写可靠或不可靠。第二天交换三题作为后测，只允许根据反模型反驳。记录翻译、形式、反模型、前提和可靠五项。若形式正确但前提未查，可靠性不能通过；若反模型实际违背前提，应重写。',
        note: '有效与可靠分两栏。',
        objective: '能对十段论证完成形式化、反模型、前提与可靠性分层评价。',
        practice: '提交十段论证表、至少三个反模型、前提核查和第二天交换后测。',
        checkpoint: '检查翻译与形式一致，反模型前提全真，可靠性判断没有跳过前提真实性。',
      },
      {
        title: '独立迁移与评价｜审读真实论证中的隐藏形式',
        body:
          '从评论文章选三段论证，先做前测，再补省略前提并转成条件或选言结构。每段写一个能挑战有效性的反模型，再查一个关键前提的现实证据。24 小时后用另一段新材料复核。评价四项：翻译准确、形式清楚、反模型有效、可靠判断完整。最后写一句如果结论仍要保留，需要补哪条前提或限定。演绎训练的目标不是说所有强论证都形式化，而是让关键推理步骤可以被检查。',
        note: '真实论证常有省略前提。',
        objective: '能把形式检查迁移到真实评论，并区分翻译问题、无效推理和假前提。',
        practice: '提交三段论证翻译、反模型、前提核查、24 小时复核和一条补充限定。',
        checkpoint: '四项自评：翻译保真、形式清楚、反模型一致、可靠性有据；任何一步缺失都需重做。',
      },
    ],
    quiz: [
      question(
        '演绎论证“有效”最准确的含义是什么？',
        '所有前提若为真，结论就不可能为假',
        ['结论在现实中一定为真', '前提一定真实', '说话者相信结论'],
        0,
        '有效性只看前提与结论的形式关系。有效论证仍可能有假前提，因此结论不一定现实可靠；可靠性才要求前提真实，二者评价层次不同。',
        '事实与定义',
      ),
      question(
        '“若 P 则 Q；Q；所以 P”为什么不有效？',
        '可能存在 P 假而 Q 真的情境，使前提真、结论假',
        ['因为条件句从不正确', '因为 Q 必须永远为假', '因为 P 与 Q 不能同时出现'],
        1,
        '这是肯定后件。反模型可以令 Q 由其他原因成立而 P 不成立，因而无法从 Q 反推出 P，条件方向不能反过来使用。',
        '材料与推导',
      ),
      question(
        '哪种评价方式最不完整？',
        '结论听起来正确，因此不再检查形式与前提',
        ['把有效性与前提真实性分开', '构造前提真结论假的反模型', '写明自然语言翻译风险'],
        2,
        '结论真假不能替代推理检查。完整评价要同时看翻译、形式、反模型和现实前提，可靠性不能由结论单独推出，也不能靠术语名称代替反例。',
        '常见误区',
      ),
      question(
        '把演绎检查迁移到软件事故报告时，哪种做法最稳妥？',
        '把故障条件与结论形式化，检查反例和前提日志，再判断因果链是否成立',
        ['只因为最终恢复成功就认定过程正确', '删除不符合预期的日志', '只看报告标题'],
        0,
        '事故推理也需要条件与证据。形式化可暴露跳步，日志核查可检验前提，二者共同支持可靠结论，也能区分沟通解释与真实故障链。',
        '迁移应用',
      ),
    ],
  },
  'thinking:归纳：样本够不够': {
    contentStatus: 'reviewed',
    prerequisite: '能读懂比例、样本量和基本图表，完成因果基础课程。',
    plainLanguageGoal:
      '学完后，你能评价样本代表性与结论范围，把一个过强归纳改写成带概率、条件和反例的有限结论。',
    guidedPractice:
      '分析 8 个归纳主张，检查样本来源、大小、代表性、测量和反例，并把结论强度分为弱、中、较强。',
    independentPractice:
      '选一条调查或用户反馈结论，重做样本偏差分析，提出改进抽样和验证反例的方案。',
    commonErrors: [
      '只统计样本数量，不看样本如何被选入。',
      '用几个成功案例推出所有人都会成功。',
      '把统计显著或比例差异直接写成必然规律。',
    ],
    sourceRefs: INDUCTION_SOURCES,
    studyPoints: [
      point('必背', '归纳结论只有程度支持，没有演绎式必然性；样本大小、选择方式、代表性和反例共同决定强度。', 1),
      point('重点', '方便样本、幸存者偏差和自选样本即使数量很大，也可能系统遗漏目标人群。', 2),
      point('易错', '增加更多同类案例不等于增强代表性；必须检查是否只收集了支持结论的样本。', 4),
    ],
    eventDetails: [INDUCTION_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜一万条好评能代表所有用户吗',
        body:
          '展示一份产品调查：页面访问者中一万人填写满意度，平均四点八分。先做前测，要求判断能否推出“所有用户满意”。记录样本来源、谁被排除、问卷措辞、样本量和反例。常见错误是只看一万这个数字，没有注意填写者可能更活跃或更满意。进一步问未购买者、流失用户和不同设备用户是否进入样本。后测要为结论写出目标总体、样本范围和可能偏差，而不是直接给总体打分。',
        note: '先问谁被样本排除。',
        objective: '能用目标总体、入样方式、排除人群和测量方式诊断归纳样本。',
        practice: '完成调查前测，写出总体、样本、三种遗漏人群和两个可能反例。',
        checkpoint: '检查是否只看样本量，是否说明自选与流失偏差，是否保留目标范围。',
      },
      {
        title: '材料与概念｜样本、代表性与归纳支持',
        body:
          '归纳从有限观察支持更广结论，但支持强度取决于样本是否代表目标总体、测量是否一致、是否存在选择机制和反例。随机抽样让每个成员有已知入样机会，便利样本则受可接触性影响；自选样本还会叠加表达意愿。大样本可减少随机波动，却不能自动修复系统偏差。归纳逻辑用概率表达证据程度，结论应写明范围与条件。一个反例可能推翻全称结论，却未必推翻概率性结论，要区分“所有”和“多数”。',
        note: '大样本不能修复选择偏差。',
        objective: '能解释样本量、随机性、代表性、测量和反例对归纳强度的不同影响。',
        practice: '为三种抽样方式各写目标总体、入样机制、样本覆盖范围、优势和最大偏差。',
        checkpoint: '检查是否区分随机误差与系统偏差，是否说明结论是概率而非必然。',
      },
      {
        title: '示范与推导｜从满意度样本推到有限结论',
        body:
          '假设调查只覆盖最近一周活跃用户，流失用户无法填写。即使一万人给出高分，也只能支持“本周活跃且愿意回应者中满意度较高”，不能代表所有用户。示范列出目标总体、入样框、缺席群体、回答偏差和测量误差，再把结论降级。若补充随机抽取全体账户并在多设备发送问卷，支持会增强但仍需报告未回应。推导重点不是找绝对完美样本，而是说明偏差如何改变结论和还缺什么数据。',
        note: '结论范围跟随样本范围。',
        objective: '能把样本偏差逐项映射到结论降级和补充证据。',
        practice: '为一个满意度样本画入样流程，标出三个遗漏点、一条反例，并改写结论范围。',
        checkpoint: '检查目标总体与样本是否一致，是否说明缺席原因，结论是否没有超出覆盖范围。',
      },
      {
        title: '引导练习｜八条归纳主张的强度表',
        body:
          '准备八条归纳，覆盖小样本、便利样本、幸存者偏差、重复测量、反例和较高质量抽样。每条先做前测，填写目标总体、样本来源、代表性、测量、反例与证据强度。后测把“全部”“一定”改成概率或范围结论，并写一个能降低强度的反例。记录样本量误判、选择偏差、反例遗漏和结论过强四类。若只增加支持案例而不处理选择机制，强度不能上调。',
        note: '反例与选择机制一起看。',
        objective: '能对八类归纳样本完成代表性分析、强度分档和结论改写。',
        practice: '提交八条强度表、至少三个选择偏差、两个反例和后测改写句。',
        checkpoint: '检查组内是否区分大小与代表性，是否保留反例，结论是否与样本范围一致。',
      },
      {
        title: '独立迁移与评价｜重做一次真实调查判断',
        body:
          '选一条真实调查或用户反馈结论，记录来源、抽样方式、样本量、未回应和测量问题。先做前测给出原结论，再画入样流程图，写两个替代解释和一个会推翻概括的反例。设计更合适的抽样或分组验证。24 小时后用新数据复核。评价四项：样本可追、偏差具体、结论有限定、改进可执行。最后把“用户都喜欢”改写为包含人群、时间和比例不确定性的句子。',
        note: '归纳结论要允许新证据修正。',
        objective: '能把归纳评价迁移到真实调查，并用改进抽样与反例检验结论。',
        practice: '提交调查报告分析、流程图、两个反例、改进方案、24 小时复核和限定结论。',
        checkpoint: '四项自评：总体明确、偏差有据、结论匹配、改进可做；缺失样本信息时不得写全称结论。',
      },
    ],
    quiz: [
      question(
        '评价归纳结论时，样本量为什么不是唯一标准？',
        '样本可能因选择、流失或自选机制系统偏离目标总体',
        ['样本越大越没有信息', '所有随机样本都完美', '归纳结论一定是必然真'],
        0,
        '大样本能减少部分随机波动，却不能修复系统选择偏差。入样机制决定样本能否代表目标人群，结论范围也必须随样本范围收缩。',
        '事实与定义',
      ),
      question(
        '活跃用户满意度很高，但流失用户没有填写，最合理的限制是什么？',
        '结论只能覆盖参与调查的活跃用户，不能代表全部用户',
        ['说明产品对所有人一定有效', '说明样本量一万没有意义', '可以删除流失用户概念'],
        1,
        '样本范围决定结论范围。缺席群体可能对产品评价不同，需补充流失用户或重新抽样才能扩展结论，不能把沉默者假定为满意。',
        '材料与推导',
      ),
      question(
        '哪种方式最不能提高归纳支持？',
        '继续收集同一支持群体的更多好评，同时忽略缺席和反例',
        ['改进随机抽样', '报告未回应与流失', '主动寻找反例和替代解释'],
        2,
        '重复同一选择机制只会增加同质样本。代表性、未回应和反例检查才能发现结论是否被系统性高估，单纯扩大样本可能放大偏差。',
        '常见误区',
      ),
      question(
        '把样本评价迁移到教学效果调查时，哪种结论最稳妥？',
        '在参与班级和当前课程中观察到改善，其他群体与长期效果仍需验证',
        ['所有学校都必然改善', '只要平均分提高就证明长期有效', '一个成功案例足以推广'],
        0,
        '教学调查需看班级构成、对照、测量和持续时间。当前样本的结果可提供支持，但推广要经过更多场景验证，不能只靠一个成功案例。',
        '迁移应用',
      ),
    ],
  },
  'thinking:类比：相似点是否关键': {
    contentStatus: 'reviewed',
    prerequisite: '能把论证拆成对象、关系和结论；完成因果关系基础课程。',
    plainLanguageGoal:
      '学完后，你能画出源域到目标域的关系映射，指出关键相似与关键差异，并把类比预测变成可检验命题。',
    guidedPractice:
      '分析 6 个类比，标出对象对应、关系映射、关键差异、可检验预测和失效条件。',
    independentPractice:
      '选一个政策或产品类比，画出结构图，提出支持与反对预测，并说明目标域验证方式。',
    commonErrors: [
      '只数两个对象的共同属性，不比较因果关系和约束。',
      '把名称不同但结构相近的案例忽略掉。',
      '提出类比后直接下结论，没有在目标域做验证。',
    ],
    sourceRefs: ANALOGY_SOURCES,
    studyPoints: [
      point('必背', '强类比依赖关系结构和约束的映射，而不是表面名称或属性相似；关键差异会限制结论。', 1),
      point('重点', '类比应先画对象对应和关系，再提出可观察预测；预测失败时修正映射或放弃结论。', 3),
      point('易错', '类比适合生成假设和解释，不能替代目标域的数据验证。', 4),
    ],
    eventDetails: [ANALOGY_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜两个案例看起来像就能照搬吗',
        body:
          '给出两个案例：成熟平台限制第三方接口与城市交通限行。先做前测，问“平台治理是否应照搬交通限行”。要求列出对象、目标、约束、参与者和反馈，并标出相似与差异。记录是否只看“都在管理拥堵”，是否忽略平台可复制、网络效应和交通物理容量等差异。后测要求画映射并写预测。诊断重点不是立刻说类比好坏，而是找出这些相似是否与结论所需机制有关。',
        note: '先问相似点是否关键。',
        objective: '能用对象、关系、约束和差异诊断一个类比的表面相似问题。',
        practice: '完成案例前测，列出三个相似、三个差异和一个可能影响结论的关键差异。',
        checkpoint: '检查是否只数属性，是否说明相似与结论机制的关系，是否保留目标域差异。',
      },
      {
        title: '材料与概念｜映射、结构与关键差异',
        body:
          '类比把源域中的对象对应到目标域，并把关系、因果和约束一起迁移。表面相似指名称或属性接近，结构相似指关系网络一致。多个相互支持的高阶关系通常比零散共同点更有解释力。关键差异是那些会改变因果机制、尺度、反馈或边界条件的区别。评价类比可问：哪些对象对应，哪些关系保持，哪些差异会阻断结论，能提出什么目标域预测。类比用于生成假设和教学解释，本身不是目标域证据。',
        note: '迁移关系，不搬对象名字。',
        objective: '能准确解释对象对应、关系映射、结构相似和关键差异。',
        practice: '为一个类比画源域和目标域关系图，标出至少两条映射和一条断裂差异。',
        checkpoint: '检查映射是否是关系而非名称，差异是否会影响结论，是否保留目标域验证。',
      },
      {
        title: '示范与推导｜从交通限行映射到平台接口',
        body:
          '交通限行与平台接口都可能涉及“减少拥堵”，但交通容量受道路物理约束，平台拥堵受带宽、推荐和网络效应影响；限行成本不可复制，平台接口可被自动化调用。示范先映射目标、行为者和反馈，再标出断裂：资源可复制、反馈速度、用户迁移成本不同。由此得到可检验预测：接口限流应关注调用峰值与第三方替代，而不只是数量限制。预测若不符合目标域数据，类比需降级。',
        note: '类比要产生可失败预测。',
        objective: '能把类比映射转成可检验预测，并用关键差异限定迁移范围。',
        practice: '为两个案例完成关系映射、三个关键断裂差异和两条可在目标域失败的预测。',
        checkpoint: '检查预测是否可观察，差异是否真的影响机制，是否没有把源域结论直接照搬。',
      },
      {
        title: '引导练习｜六个类比的结构表',
        body:
          '准备六个类比，覆盖生物—技术、历史—商业、教育—医疗、交通—网络和两个表面相似但结构不同案例。每个先做前测，填写源域、目标域、对象对应、关系映射、关键差异和可检验预测。第二轮去掉源域名称，只保留结构，检查学习者是否仍能判断支持。后测加入一个反例预测，要求说明类比在哪一步失效。记录表面属性、关系缺失、差异遗漏和结论越界。',
        note: '去掉名字后再看结构。',
        objective: '能对六类类比完成结构映射、差异分析和反例预测。',
        practice: '提交六张结构表、两条目标域预测、一个失效反例和结构匿名判断。',
        checkpoint: '检查映射是否依赖名称，差异是否关键，预测是否能在目标域失败。',
      },
      {
        title: '独立迁移与评价｜评价一个真实政策类比',
        body:
          '选一个真实政策或产品类比，先做前测，再画结构图。列出至少三条相似和三个关键差异，说明差异如何影响成本、尺度、反馈或参与者。提出两条支持类比的预测和一条反对预测，并写目标域验证方式。24 小时后用新数据复核。评价四项：映射清楚、差异关键、预测可测、边界明确。最后用一句话写出类比能帮助什么、不能证明什么。',
        note: '类比只负责提示，不负责证明。',
        objective: '能把结构映射迁移到真实政策或产品讨论，并生成可检验支持与反例预测。',
        practice: '提交类比结构图、关键差异、三条预测、验证方式、24 小时复核和边界句。',
        checkpoint: '四项自评：映射完整、差异关键、预测可测、结论有边界；预测失败时必须修正类比。',
      },
    ],
    quiz: [
      question(
        '一个类比的推理力主要来自什么？',
        '源域与目标域之间关键关系、因果和约束的结构映射',
        ['两个对象的名称相似', '共同属性数量最多', '故事讲得最生动'],
        0,
        '类比不是属性计数，而是关系结构迁移。只有影响目标机制的关系成立，类比才能支持预测，表面名称相同不足以说明结构一致。',
        '事实与定义',
      ),
      question(
        '平台接口可低成本复制、道路容量不可复制，这一差异对类比意味着什么？',
        '它可能改变资源约束和治理机制，需降低直接照搬交通政策的强度',
        ['说明两类系统完全没有共同点', '说明道路容量一定更大', '说明类比永远不能使用'],
        1,
        '关键差异会阻断部分关系映射，但不一定让类比全无价值。它可以促使提出针对平台反馈的新预测，并提醒不能照搬交通政策。',
        '材料与推导',
      ),
      question(
        '哪种类比评价最不可靠？',
        '只要两个案例都有“拥堵”一词，就认定治理方法相同',
        ['画出对象和关系对应', '寻找会改变机制的关键差异', '提出目标域可失败预测'],
        2,
        '相同词语不代表相同结构。忽略资源、反馈和尺度差异，会把表面相似误当可迁移证据，也无法说明预测为什么可能失败。',
        '常见误区',
      ),
      question(
        '把类比迁移到组织管理时，哪种结论最稳妥？',
        '类比提供可能机制与预测，仍需结合本组织数据、约束和试点验证',
        ['成功公司如此做，所以所有公司必成功', '只看行业名称相同', '删除不符合类比的本地数据'],
        0,
        '管理类比可启发假设，却受规模、文化、市场和资源影响。目标组织验证才能决定迁移是否成立，局部试点也可提供反例。',
        '迁移应用',
      ),
    ],
  },
  'thinking:常见谬误的四种伪装': {
    contentStatus: 'reviewed',
    prerequisite: '完成演绎、归纳与假设课程；能区分前提真假和推理关系。',
    plainLanguageGoal:
      '学完后，你能按形式、相关性、歧义和因果四类分析错误论证，给出修复问题，并避免用谬误名称封杀讨论。',
    guidedPractice:
      '分析 12 段短论证，先补最善意前提，再判定错误层级，写出修复问题和一条反例。',
    independentPractice:
      '选一段真实争论，分别写最强解释和最弱解释，识别错误模式并改写为可继续讨论的论证。',
    commonErrors: [
      '给论证贴上谬误名称后就不再说明具体错在哪里。',
      '没有补出合理省略前提，把表达不完整误判为谬误。',
      '把前提虚假、证据不足和形式无效全部混成同一种逻辑错误。',
    ],
    sourceRefs: FALLACY_SOURCES,
    studyPoints: [
      point('必背', '谬误评价先补善意前提，再指出错误落在形式、相关性、歧义还是因果层，并写修复问题。', 1),
      point('重点', '同一句话因语境和省略前提可能合理也可能错误；谬误名称只是线索，不是最终分析。', 2),
      point('易错', '前提为假不等于推理无效；证据弱也不一定构成形式谬误，必须区分失败层级。', 4),
    ],
    eventDetails: [FALLACY_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜一不顺耳就贴“逻辑谬误”',
        body:
          '给出八段争论，包括人身攻击、偷换定义、否定前件、以偏概全和两段可能合理的诉诸权威。先做前测，要求先写最善意解释，再判断问题层级和修复动作。记录是否只给标签、是否补前提、是否区分假前提与无效形式。例如“专家说该药有效”在相关领域且有共识时可合理，在无关领域则不可靠。后测要求用一句“即使这个标签成立，具体缺口是……”来证明分析没有停在名称。',
        note: '先理解最强版本，再评价。',
        objective: '能用善意解释、错误层级和修复动作诊断谬误标签化。',
        practice: '完成八段争论前测，每段写最强解释、问题层级、修复问题和不能成立的理由。',
        checkpoint: '检查是否只贴标签，是否补出前提，是否区分形式、语言、相关性和证据问题。',
      },
      {
        title: '材料与概念｜四种伪装与失败层级',
        body:
          '第一类是形式伪装：表面像有效推理，实际是否定前件、肯定后件等无效模式。第二类是相关性伪装：用情绪、人格或无关信息替代理由。第三类是语言伪装：关键词意义在不同位置变化，导致结论不成立。第四类是因果或证据伪装：用先后、个例、权威或热度替代因果与代表证据。前提虚假和证据不足也可能让论证失败，但不必强行称为形式谬误。评价要写具体模式、语境、善意修复和仍存在的问题。',
        note: '四类只是入口，不是万能箱。',
        objective: '能区分形式、相关性、语言、因果/证据四类错误及假前提等非谬误失败。',
        practice: '为四类伪装各写一个真实风格例子、一个合理边界、一个修复问题和一条反例。',
        checkpoint: '检查类别是否对应实际缺口，是否说明语境，是否没有把所有错误都归为形式谬误。',
      },
      {
        title: '示范与推导｜从人身攻击到可讨论主张',
        body:
          '原句“他反对这个方案，因为他根本不懂业务，所以方案一定可行”。先补最善意解释：发言者可能想质疑专业能力。具体缺口是人格或身份没有直接说明方案效果，属于相关性替代。修复问题应变成：方案效果有哪些数据？反对者的业务论点是否成立？再给一个反例：即使反对者不懂业务，方案也可能不可行。示范不禁止讨论专业能力，而是要求能力信息通过证据和角色相关性进入论证。',
        note: '标签之后必须指出缺口。',
        objective: '能把带人身攻击的争论改写成可检验的证据问题，同时保留合理相关性。',
        practice: '为一个争论写最强解释、错误层级、修复问题、可检验证据和一个反例。',
        checkpoint: '检查是否抓住人格替代理由，是否允许专业能力在相关条件下成为合理证据。',
      },
      {
        title: '引导练习｜十二段论证的四层分析',
        body:
          '准备十二段材料，覆盖形式错误、相关性替代、歧义、因果跳跃、假前提和两个可能合理的案例。每段先做前测，写最强解释、省略前提、错误层级、修复问题和反例。第二轮把其中四段改写成可继续讨论的论证，再作后测。记录标签先行、语境遗漏、层级混淆和修复缺失。若只写“诉诸权威”，必须补充权威是否相关、是否有共识和是否有独立证据。',
        note: '修复问题比名称更重要。',
        objective: '能对十二段论证完成四层分析，并将部分材料修复为可讨论结构。',
        practice: '提交十二段分析表、四段修复稿、一个反例和一份标签先行错误记录。',
        checkpoint: '检查善意解释是否成立，标签与缺口是否匹配，修复是否把争论引向可检验证据。',
      },
      {
        title: '独立迁移与评价｜审读真实争论而不封杀讨论',
        body:
          '选一段真实争论，先做前测列出所有显性和隐含前提，再分别写最强解释与最弱解释。找出一个最明确的错误层级，写具体缺口、修复问题和仍可能成立的合理部分。24 小时后用另一段回应复核。评价四项：善意解释、层级准确、修复可行、边界清楚。最后把原文改写成一段可继续讨论的论证。若证据不足以判谬误，应写“尚不能确定”，而不是为了赢辩论强行贴标签。',
        note: '识别谬误是为了继续推理。',
        objective: '能把谬误分析迁移到真实争论，修复论证并保留不确定与合理部分。',
        practice: '提交真实争论分析、两种解释、错误层级、24 小时回应、修复稿和不确定说明。',
        checkpoint: '四项自评：解释善意、层级准确、修复可做、边界诚实；标签不能替代具体论证分析。',
      },
    ],
    quiz: [
      question(
        '评价所谓逻辑谬误时，第一步最合适做什么？',
        '补出最合理的省略前提，理解论证最强版本后再分析缺口',
        ['先选一个熟悉的谬误名称', '只看说话者是谁', '听到不同意见就判错误'],
        0,
        '日常表达常省略前提，先善意修复能避免误判。之后才判断缺口属于形式、相关性、语言还是证据层，并写出具体修复动作。',
        '事实与定义',
      ),
      question(
        '“他不懂业务，所以方案一定可行”主要错在哪一层？',
        '用身份或人格替代方案效果证据，属于相关性替代',
        ['条件句否定前件', '关键词在句中被偷换', '样本随机性不足'],
        1,
        '说话者是否懂业务可能影响可信度，但不能直接推出方案效果。修复应转向试点、成本和结果数据，同时保留专业经验在相关场景的作用。',
        '材料与推导',
      ),
      question(
        '哪种做法最违背本课原则？',
        '一看到“专家说”就宣布诉诸权威，不检查领域相关性和独立证据',
        ['补充省略前提再评价', '区分假前提与无效推理', '给出一个反例和修复问题'],
        2,
        '诉诸权威是否错误取决于领域、共识和证据。脱离语境只贴标签，无法说明具体推理缺口，也无法区分权威合理使用与盲目依赖。',
        '常见误区',
      ),
      question(
        '把谬误分析迁移到团队决策时，哪种表达最有效？',
        '保留对方合理担忧，指出证据缺口，并提出能共同检查的数据或试点',
        ['用谬误名称结束讨论', '攻击提出异议的人', '只看支持自己方案的证据'],
        0,
        '决策争论需要可检验证据。指出缺口并提出验证方式，比标签化更能改进判断和合作，也能保留异议中的合理担忧。',
        '迁移应用',
      ),
    ],
  },
};
