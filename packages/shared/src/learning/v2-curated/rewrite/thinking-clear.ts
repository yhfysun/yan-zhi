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

const FACT_ARCHIVE = {
  id: 'argument-claim-evidence-structure',
  kind: 'concept',
  title: '从主张、理由到证据：判断怎样变得可检查',
  period: '1958—2019',
  summary:
    '把陈述拆成主张、理由、证据和限定后，争论才能从立场对撞变成可检查结构。事实陈述可被来源验证，评价与预测则需要说明尺度和条件。',
  background:
    '论证研究关注结论如何由理由支持，信息素养研究关注来源、作者、时效和目的。两者结合，能区分“我不同意”与“这句话缺乏证据”。',
  timeline: [
    {
      date: '1958',
      title: 'Toulmin 论证模型提出',
      body: 'Toulmin 把论证拆成主张、依据、保证、支持、限定和反驳。模型提醒人们：结论并非只靠一句事实，连接事实与结论的推理规则同样需要说明。',
      sourceIds: ['toulmin-1958'],
    },
    {
      date: '1990s',
      title: '信息素养强调来源评价',
      body: '图书馆与写作课程把作者、发布机构、日期、目的和引用链纳入来源评估。一个可核页面比无法追溯的截图更能支持事实判断。',
      sourceIds: ['purdue-evaluating-sources'],
    },
    {
      date: '2003',
      title: '论证模型被修订与扩展',
      body: 'Toulmin 著作修订版继续影响论证教学。主张强度要与依据质量匹配，遇到反例时应增加限定或修正推理，而不是把原结论重复得更大声。',
      sourceIds: ['toulmin-2003'],
    },
    {
      date: '2018',
      title: '批判思维被描述为质疑与判断程序',
      body: 'Stanford Encyclopedia of Philosophy 的 Critical Thinking 条目讨论批判性判断涉及理由、证据、偏见和替代解释。批判不是否定一切，而是让判断承担举证责任。',
      sourceIds: ['sep-critical-thinking'],
    },
    {
      date: '2019',
      title: '可重复性研究区分结果与解释',
      body: '美国国家科学院报告讨论研究结果、重复验证和解释边界。单个结果不能自动代表稳定结论，来源和不确定性需要进入公开判断。',
      sourceIds: ['nasem-reproducibility'],
    },
    {
      date: '教学应用',
      title: '事实与观点不是二分标签',
      body: '课堂判断要再问四件事：陈述能否核验、依据来自哪里、是否包含评价尺度、限定范围是什么。这样能避免把“有出处”误当“永远正确”。',
      sourceIds: ['sep-critical-thinking', 'purdue-evaluating-sources'],
    },
  ],
  outcome:
    '可观察结果是能把一段混合陈述拆成事实、解释、评价和预测，并为每一部分写出证据需求与适用范围。',
  significance:
    '这一结构让事实判断可追溯、观点表达可比较，也保留不确定性而非制造虚假的绝对客观。',
  sourceCards: [
    source(
      'toulmin-1958',
      'The Uses of Argument',
      'Stephen E. Toulmin, Cambridge University Press',
      '1958',
      'https://doi.org/10.1017/CBO9780511840005',
      '核对主张、依据、保证、限定与反驳的论证结构。',
    ),
    source(
      'toulmin-2003',
      'The Uses of Argument, Updated Edition',
      'Stephen E. Toulmin, Cambridge University Press',
      '2003',
      'https://doi.org/10.1017/CBO9780511840005',
      '核对修订版论证模型及其应用。',
    ),
    source(
      'purdue-evaluating-sources',
      'Evaluating Sources of Information',
      'Purdue Online Writing Lab',
      '2025 年访问版',
      'https://owl.purdue.edu/owl/research_and_citation/conducting_research/evaluating_sources_of_information/index.html',
      '核对作者、机构、时效、目的与来源评价。',
    ),
    source(
      'sep-critical-thinking',
      'Critical Thinking',
      'Stanford Encyclopedia of Philosophy',
      '2018',
      'https://plato.stanford.edu/entries/critical-thinking/',
      '核对理由、证据、偏见与替代解释的批判思维框架。',
    ),
    source(
      'nasem-reproducibility',
      'Reproducibility and Replicability in Science',
      'National Academies of Sciences, Engineering, and Medicine',
      '2019',
      'https://nap.nationalacademies.org/catalog/25303/reproducibility-and-replicability-in-science',
      '核对结果、重复验证与科学解释边界。',
    ),
  ],
} satisfies LearningV2EventDetail;

const CAUSATION_ARCHIVE = {
  id: 'correlation-causation-inference',
  kind: 'concept',
  title: '相关不等于因果：混杂、时间与反事实',
  period: '2015—2020',
  summary:
    '两个变量一起变化只说明统计关联。因果判断还要检查时间先后、共同原因、选择偏差、机制和反事实：若干预一个变量，另一个是否会改变。',
  background:
    '观察数据容易受到混杂和选择影响。因果推断研究通过研究设计、模型和敏感性分析，尝试让“如果采取不同行动会怎样”成为可比较的问题。',
  timeline: [
    {
      date: '2015',
      title: '统计关联与因果被明确区分',
      body: 'Altman 与 Krzywinski 面向研究读者解释关联、相关与因果。相关描述变量共同变化，因果则需要关于干预和机制的主张，不能由系数大小自动推出。',
      sourceIds: ['nature-correlation-2015'],
    },
    {
      date: '2015',
      title: '混杂因素可制造强关联',
      body: '第三变量若同时影响两个变量，会使它们看起来直接相连。分析必须问：是否存在共同原因、选择条件或测量路径，能同时解释两端？',
      sourceIds: ['nature-correlation-2015'],
    },
    {
      date: '2016',
      title: '反事实框架把因果写成比较',
      body: '潜在结果框架把因果效应定义为同一单位在不同处理下的结果差异。现实中只能观察一个结果，因此需要明确目标比较和识别假设。',
      sourceIds: ['causal-inference-what-if'],
    },
    {
      date: '2019',
      title: '时间顺序不能省略',
      body: '原因必须发生在结果之前，或在合理机制下与结果形成稳定关系。横断面关联无法单独确定先后，也不能排除结果反向影响原因。',
      sourceIds: ['causal-inference-what-if', 'sep-causation-manipulation'],
    },
    {
      date: '2020',
      title: '机制与可操作性加强解释',
      body: '因果主张若说明作用机制，就能提出更可检验的预测。机制并非装饰，必须与数据、时间和其他已知关系一致，并能指出在哪些条件下失效。',
      sourceIds: ['sep-causation-manipulation'],
    },
    {
      date: '教学应用',
      title: '用四项检查表给因果主张降级',
      body: '面对新闻或研究结论，逐项检查混杂、时间、机制和反事实。任何一项缺口都可能使“导致”降级为“有关联”或“尚待验证”。',
      sourceIds: ['nature-correlation-2015', 'causal-inference-what-if'],
    },
  ],
  outcome:
    '可观察结果是能从相关性报道中列出至少两个替代解释，并写出下一项能区分因果与混杂的证据。',
  significance:
    '因果检查让学习者不只记住“相关不等于因果”这句话，而能指出究竟缺哪类证据以及结论应降级到何处。',
  sourceCards: [
    source(
      'nature-correlation-2015',
      'Association, Correlation and Causation',
      'Naomi Altman & Martin Krzywinski, Nature Methods',
      '2015',
      'https://doi.org/10.1038/nmeth.3587',
      '核对关联、相关、因果及混杂解释。',
    ),
    source(
      'causal-inference-what-if',
      'Causal Inference: What If',
      'Miguel A. Hernán & James M. Robins',
      '2020',
      'https://miguelhernan.org/whatifbook',
      '核对反事实、目标比较与识别假设。',
    ),
    source(
      'sep-causation-manipulation',
      'Causation and Manipulability',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/causation-mani/',
      '核对因果、干预、机制与可操作性观点。',
    ),
    source(
      'openintro-statistics',
      'OpenIntro Statistics',
      'OpenIntro',
      '2025 年访问版',
      'https://www.openintro.org/book/os/',
      '核对相关、回归与观察研究的解释边界。',
    ),
  ],
} satisfies LearningV2EventDetail;

const ASSUMPTION_ARCHIVE = {
  id: 'toulmin-hidden-assumptions',
  kind: 'concept',
  title: '隐藏假设：理由到主张之间漏掉的桥',
  period: '1958—2025',
  summary:
    '隐藏假设不是任何没写出来的想法，而是理由要支持主张时必须成立、却尚未明说的前提。补出后应检查真假、必要性和替代解释。',
  background:
    '论证模型把依据与主张之间的保证规则显式化。日常表达常省略人人都以为共享的前提，但争议恰恰可能藏在这条桥上。',
  timeline: [
    {
      date: '1958',
      title: '论证的“保证”被单独识别',
      body: 'Toulmin 模型把依据与主张之间的推理许可称为 warrant。它说明为什么这些理由能支持这个结论，常以未明说形式出现，却是判断论证强弱的关键。',
      sourceIds: ['toulmin-argument'],
    },
    {
      date: '1970s',
      title: '非形式逻辑关注日常论证',
      body: '日常论证不像形式证明那样列全前提，省略是正常沟通现象。分析任务不是把所有句子补满，而是只补那些若为假便无法推出结论的必要前提。',
      sourceIds: ['sep-critical-thinking'],
    },
    {
      date: '1990s',
      title: '论证图进入教学',
      body: '把理由、反驳和结论画成节点，可暴露重复理由与缺失连接。图上的箭头不是装饰，每条都要能回答“依据什么规则推出下一步”。',
      sourceIds: ['purdue-argument'],
    },
    {
      date: '2003',
      title: '限定与反驳被放到同一模型',
      body: 'Toulmin 更新版继续强调整体性。强结论需要强保证；若存在反例，结论应缩小到“通常”“在该条件下”或增加例外。',
      sourceIds: ['toulmin-argument'],
    },
    {
      date: '2018',
      title: '批判思维要求检查替代解释',
      body: '批判判断不只问前提真假，还问是否存在别的路径、样本选择和概念歧义。补出一个假设后，应继续寻找能让它失效的反例。',
      sourceIds: ['sep-critical-thinking'],
    },
    {
      date: '教学应用',
      title: '假设必须能接受检验',
      body: '有效分析要给隐藏假设附上验证动作，例如查定义、找数据、做反例或询问适用范围。只写“他可能另有目的”不是结构分析。',
      sourceIds: ['toulmin-argument', 'purdue-argument'],
    },
  ],
  outcome:
    '可观察结果是能把主张与理由之间的隐含前提写成完整句子，并用一个反例或证据需求检验它是否必要。',
  significance:
    '识别假设让争论从“你就是这么想”转向可检验的推理缺口，同时避免把无关动机随意当作论证前提。',
  sourceCards: [
    source(
      'toulmin-argument',
      'The Uses of Argument',
      'Stephen E. Toulmin, Cambridge University Press',
      '1958 / 2003',
      'https://doi.org/10.1017/CBO9780511840005',
      '核对主张、依据、保证、限定与反驳结构。',
    ),
    source(
      'sep-critical-thinking',
      'Critical Thinking',
      'Stanford Encyclopedia of Philosophy',
      '2018',
      'https://plato.stanford.edu/entries/critical-thinking/',
      '核对理由、替代解释与批判判断。',
    ),
    source(
      'purdue-argument',
      'Argumentative Essays',
      'Purdue Online Writing Lab',
      '2025 年访问版',
      'https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/argumentative_essays.html',
      '核对主张、证据、反驳与论证组织。',
    ),
    source(
      'informal-logic',
      'Informal Logic',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/logic-informal/',
      '核对日常论证、隐含前提和推理评价。',
    ),
  ],
} satisfies LearningV2EventDetail;

const EVIDENCE_ARCHIVE = {
  id: 'grade-evidence-strength',
  kind: 'concept',
  title: '证据强度：为什么“有研究”仍不足以下强结论',
  period: '1992—2025',
  summary:
    '证据判断不是只看研究设计名称，而要综合偏倚风险、不一致、间接性、精确性和发表偏倚。证据强度与结论强度必须分开写。',
  background:
    '循证实践与系统评价方法逐渐把证据质量从简单等级表拓展为多维度判断。课堂使用 GRADE 思路训练降级、升级和限定结论。',
  timeline: [
    {
      date: '1992',
      title: '循证医学强调证据与决策连接',
      body: '循证实践要求把研究证据、专业判断和服务对象价值放在一起。单个研究标题不能替代对研究质量与适用性的评价。',
      sourceIds: ['cebm-levels'],
    },
    {
      date: '2000',
      title: 'GRADE 方法形成',
      body: 'GRADE 工作组建立跨研究类型的证据分级框架，避免把随机对照和观察研究机械固定为高低两级，而要看具体结果与偏倚。',
      sourceIds: ['grade-handbook'],
    },
    {
      date: '2004',
      title: '多维度降级进入指南',
      body: '证据质量可因偏倚风险、结果不一致、间接性、精确性不足和发表偏倚下降。每个维度都要说明与本结论的关系，而不是只给一个总分。',
      sourceIds: ['grade-handbook'],
    },
    {
      date: '2008',
      title: '证据质量与推荐强度被区分',
      body: '高质量证据不一定在所有情境都产生同一推荐，价值、资源、公平和可行性也参与决策。课堂据此区分“证据支持什么”与“我们应做什么”。',
      sourceIds: ['grade-bmj-2008'],
    },
    {
      date: '2011',
      title: '证据层级被要求说明问题类型',
      body: 'Oxford CEBM 的证据层级提醒，不同临床问题需要不同研究设计。治疗、诊断、预后和危害不能直接使用同一条排名。',
      sourceIds: ['cebm-levels'],
    },
    {
      date: '教学应用',
      title: '结论强度要写出限定与更新条件',
      body: '面对一组证据，先判断直接性、样本与一致性，再决定结论用“证明”“支持”“提示”还是“尚不确定”。出现更高质量或更直接证据时应允许更新。',
      sourceIds: ['grade-handbook', 'cebm-levels'],
    },
  ],
  outcome:
    '可观察结果是能为一条结论列出证据强弱维度、替代解释、限定条件和需要补充的研究。',
  significance:
    '多维度证据判断避免“有论文就正确”和“等级低就毫无价值”两个极端，使结论强度与不确定性对应。',
  sourceCards: [
    source(
      'grade-handbook',
      'GRADE Handbook',
      'GRADE Working Group',
      '2025 年访问版',
      'https://gdt.gradepro.org/app/handbook/handbook.html',
      '核对证据质量、降级维度与推荐强度。',
    ),
    source(
      'cebm-levels',
      'Oxford Centre for Evidence-Based Medicine: Levels of Evidence',
      'Oxford CEBM',
      '2011',
      'https://www.cebm.ox.ac.uk/resources/levels-of-evidence/ocebm-levels-of-evidence',
      '核对问题类型与证据层级的关系。',
    ),
    source(
      'grade-bmj-2008',
      'GRADE: Grading Quality of Evidence and Strength of Recommendations',
      'BMJ',
      '2008',
      'https://doi.org/10.1136/bmj.a139',
      '核对证据质量与推荐强度的区分。',
    ),
    source(
      'sep-evidence',
      'Evidence',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/evidence/',
      '核对证据、理由与信念支持的一般哲学框架。',
    ),
    source(
      'nasem-reproducibility',
      'Reproducibility and Replicability in Science',
      'National Academies',
      '2019',
      'https://nap.nationalacademies.org/catalog/25303/reproducibility-and-replicability-in-science',
      '核对重复验证与结果解释边界。',
    ),
  ],
} satisfies LearningV2EventDetail;

const FACT_SOURCES = [
  'Stanford Encyclopedia of Philosophy, Critical Thinking, 2018。https://plato.stanford.edu/entries/critical-thinking/',
  'Stephen E. Toulmin, The Uses of Argument, updated edition。https://doi.org/10.1017/CBO9780511840005',
  'Purdue Online Writing Lab, Evaluating Sources of Information。https://owl.purdue.edu/owl/research_and_citation/conducting_research/evaluating_sources_of_information/index.html',
  'National Academies, Reproducibility and Replicability in Science, 2019。https://nap.nationalacademies.org/catalog/25303/reproducibility-and-replicability-in-science',
];

const CAUSATION_SOURCES = [
  'Naomi Altman & Martin Krzywinski, Association, Correlation and Causation, Nature Methods, 2015。https://doi.org/10.1038/nmeth.3587',
  'Miguel A. Hernán & James M. Robins, Causal Inference: What If。https://miguelhernan.org/whatifbook',
  'Stanford Encyclopedia of Philosophy, Causation and Manipulability。https://plato.stanford.edu/entries/causation-mani/',
  'OpenIntro, OpenIntro Statistics。https://www.openintro.org/book/os/',
];

const ASSUMPTION_SOURCES = [
  'Stephen E. Toulmin, The Uses of Argument, updated edition。https://doi.org/10.1017/CBO9780511840005',
  'Stanford Encyclopedia of Philosophy, Critical Thinking, 2018。https://plato.stanford.edu/entries/critical-thinking/',
  'Purdue Online Writing Lab, Argumentative Essays。https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/argumentative_essays.html',
  'Stanford Encyclopedia of Philosophy, Informal Logic。https://plato.stanford.edu/entries/logic-informal/',
];

const EVIDENCE_SOURCES = [
  'GRADE Working Group, GRADE Handbook。https://gdt.gradepro.org/app/handbook/handbook.html',
  'Oxford CEBM, Levels of Evidence, 2011。https://www.cebm.ox.ac.uk/resources/levels-of-evidence/ocebm-levels-of-evidence',
  'BMJ, GRADE: Grading Quality of Evidence and Strength of Recommendations, 2008。https://doi.org/10.1136/bmj.a139',
  'Stanford Encyclopedia of Philosophy, Evidence。https://plato.stanford.edu/entries/evidence/',
];

export const THINKING_CLEAR_REWRITE: CuratedCoursePlanPatchMap = {
  'thinking:事实与观点的分界': {
    contentStatus: 'reviewed',
    prerequisite: '无先修要求；准备两段新闻材料、来源信息和一张四栏判断表。',
    plainLanguageGoal:
      '学完后，你能把混合陈述拆成事实、解释、评价与预测，并为每部分写出可检验依据、来源和限定。',
    guidedPractice:
      '把 12 条陈述分成事实、解释、评价和预测四类，为每条写出核验动作、来源要求和一个可能限定。',
    independentPractice:
      '选一段真实报道，标出可核事实、作者解释、价值评价和未来预测，并追查至少两条原始来源。',
    commonErrors: [
      '把语气坚定当作事实，把语气犹豫当作观点。',
      '看到有来源就认为陈述一定正确，不检查来源是否直接支持该结论。',
      '把事实与观点当成互斥二分，忽略解释、预测和带尺度的评价。',
    ],
    sourceRefs: FACT_SOURCES,
    studyPoints: [
      point('必背', '事实陈述要有可核来源与范围；观点可表达评价或预测，但仍需说明理由、尺度和可检验部分。', 1),
      point('重点', '判断一条陈述要分开问：是否可核验、来源是什么、使用什么评价尺度、适用于哪些条件。', 2),
      point('易错', '“有出处”不等于“永远正确”；来源要直接、可靠、最新到足以支持当前结论。', 4),
    ],
    eventDetails: [FACT_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜一句话里到底混了几种判断',
        body:
          '给出十二句混合陈述，例如“这项政策实施后满意度上升了十个百分点，所以它是最有效的方案”。先做前测，要求圈出可核数字、作者解释、评价词和未来预测，并为事实部分写来源需求。记录四个问题：是否区分事实与评价、是否检查来源、是否写出评价尺度、是否标明适用范围。常见错误是只按语气强弱分类，或把数字出现自动当事实。后测将加入相反来源，检查能否修正判断。',
        note: '先拆句子，再判断真假。',
        objective: '能用可核性、来源、评价尺度与限定拆分混合陈述的前测。',
        practice: '完成 12 条陈述分类，逐句标出事实候选、解释、评价、预测和所需证据。',
        checkpoint: '检查是否按结构而非语气分类，是否为数字写来源，是否保留评价尺度和适用范围。',
      },
      {
        title: '材料与概念｜事实、解释、评价与预测',
        body:
          '事实陈述通常可以被记录、测量或由可靠来源核对，因此比纯评价更可检验，但事实仍可能带测量误差与版本差异。解释说明事实为何出现，预测说明未来可能怎样，评价则使用某种价值或效果尺度。三者不是“观点就不用证据”，而是证据类型不同。判断一条陈述要看来源是否直接、发布者能力、时间、方法与引用链。Toulmin 模型进一步要求说明从依据到结论的推理规则。事实与观点分界的价值，是让每类判断承担相应的举证责任。',
        note: '不同判断承担不同举证责任。',
        objective: '能准确解释事实、解释、评价、预测与论证依据之间的区别。',
        practice: '为四类判断各写一个真实风格例子、一个证据要求、一个限定范围和一种常见误判。',
        checkpoint: '检查是否把评价当成无依据意见，是否把有来源当成绝对正确，是否说明尺度。',
      },
      {
        title: '示范与推导｜从数字推到有限结论',
        body:
          '材料写“满意度从 60% 升到 70%，因此项目最有效”。先核验调查对象、样本、时间和问题措辞；再做前测后测比较；然后检查是否有其他项目同时变化；最后把“最有效”改成可支持的比较结论。示范输出包含原句、可核事实、解释、评价尺度、缺失证据和改写句。若来源只是项目自评摘要，就不能直接代表独立调查。改写要保留不确定性，例如“在该样本中满意度提高十个百分点，是否优于其他项目尚需对照”。',
        note: '结论只写证据支持的范围。',
        objective: '能把带数字的强结论改写成与来源和方法相匹配的有限结论。',
        practice: '完成一段材料的来源核对、替代解释、评价尺度分析和一句限定改写。',
        checkpoint: '检查是否核对原始来源，是否保留数字条件，是否把“最有效”降级到可证明范围。',
      },
      {
        title: '引导练习｜十二句的四种判断表',
        body:
          '准备十二句真实风格陈述，混合事实、解释、评价、预测和多重判断。学习者先独立分类，再写每句的核验动作：查原始数据、找第二来源、询问定义、阅读方法或等待时间验证。第二轮给每条加一个可能反例，例如来源利益冲突、样本不同或评价尺度改变。记录分类、来源、限定和改写四项成绩。若分类正确但改写仍把强评价保留原样，说明证据与结论强度没有连接。',
        note: '分类之后必须改写。',
        objective: '能对十二句混合陈述完成分类、来源核验、反例检查和限定改写。',
        practice: '提交十二句四栏表、至少三个反例、来源核对记录和三条改写。',
        checkpoint: '检查分类是否一致，来源是否直接，反例是否具体，改写是否保留可核事实与不确定性。',
      },
      {
        title: '独立迁移与评价｜审读一段真实报道',
        body:
          '选择一段真实报道，先保留原文做前测，再标出可核事实、作者解释、价值评价和未来预测。追查至少两个原始或独立来源，记录标题、机构、日期、方法和引用链。后测把最关键的强结论改写成一句带条件的话，并写一个会改变判断的新证据。评价四项：分类清楚、来源可追溯、尺度明确、结论有限定。最后保留一段无法核实的陈述，说明为何不能只凭转发量判断。事实判断的目标不是消灭观点，而是让观点和事实各说清依据。',
        note: '无法核实也要明确标出。',
        objective: '能把事实与观点分界迁移到真实报道，并用来源、尺度和反例评价结论。',
        practice: '提交原文标注、两条来源、前测后测、限定改写、改变判断的新证据和未核实项。',
        checkpoint: '四项自评：分类准确、来源可追、尺度明确、结论有限定；未核实内容不得包装成事实。',
      },
    ],
    quiz: [
      question(
        '事实与观点分界最有效的操作是什么？',
        '拆出可核事实、解释、评价和预测，并分别写证据要求与限定',
        ['根据说话语气判断真假', '看到数字就全部认定为事实', '把观点视为完全不需要理由'],
        0,
        '一句话常混合多种判断。分类后仍要追来源、看尺度和范围，才能让事实可核、观点可比较，也能避免用语气代替证据。',
        '事实与定义',
      ),
      question(
        '报告给出满意度从 60% 升到 70%，作者据此称项目“最有效”，还应检查什么？',
        '调查对象、问题措辞、对照条件和其他同时变化的项目',
        ['作者是否使用感叹号', '满意度数字是否为整数', '文章是否配有图片'],
        1,
        '数字可核不等于比较结论成立。样本、测量和对照都影响“最有效”的判断，必须补充方法与替代解释，再缩小结论范围。',
        '材料与推导',
      ),
      question(
        '哪种说法最容易造成错误判断？',
        '只要引用了一个来源，这条结论就一定能被当作事实',
        ['来源需要与当前结论直接相关', '评价判断也要说明尺度', '预测需要写出验证条件'],
        2,
        '来源相关性和质量决定它能支持什么。转引、利益冲突或间接材料都不能自动证明强结论，读者还应检查来源是否直接测量了该结果。',
        '常见误区',
      ),
      question(
        '把本课方法迁移到工作汇报时，哪种表达最稳妥？',
        '讲清可核数据、样本范围、解释和仍不确定部分，再提出建议',
        ['只讲最有利数字并省略条件', '把个人偏好写成客观事实', '所有判断都用肯定语气'],
        0,
        '工作汇报也需要证据与结论匹配。清楚区分结果、解释和建议，能让听众判断风险并追问依据，也能避免把个人偏好包装成客观事实。',
        '迁移应用',
      ),
    ],
  },
  'thinking:相关不等于因果': {
    contentStatus: 'reviewed',
    prerequisite: '能读取简单图表并区分平均数、比例与趋势；无需统计推断先修。',
    plainLanguageGoal:
      '学完后，你能对一项相关性主张检查混杂、时间、机制和反事实，并把“导致”降级或提出可区分证据。',
    guidedPractice:
      '分析 6 条相关性报道，分别写出可能混杂、时间关系、机制假设、反事实比较和所需下一项证据。',
    independentPractice:
      '选一条真实相关性报道，画出变量关系图，列三个替代解释，并设计一个能区分因果与混杂的观察或实验。',
    commonErrors: [
      '只重复“相关不等于因果”，却不能指出具体混杂或反向因果。',
      '把机制解释写得通顺就当作因果证据，不检查数据和时间。',
      '用横断面数据直接判断先后，忽略结果也可能反向影响暴露。',
    ],
    sourceRefs: CAUSATION_SOURCES,
    studyPoints: [
      point('必背', '相关只说明变量共同变化；因果判断至少检查时间、机制、混杂和反事实比较。', 1),
      point('重点', '观察到强相关时，先问是否有共同原因、选择偏差或反向影响，再决定结论能否用“导致”。', 2),
      point('易错', '无法完全排除混杂不等于因果关系永不可研究；关键是指明识别假设和仍需的证据。', 4),
    ],
    eventDetails: [CAUSATION_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜销量和溺水一起上升，谁导致了谁',
        body:
          '给出冰淇淋销量与溺水人数同步上升的数据图，不做解释，先做前测：写出两个变量、趋势、可能方向、第三因素和想做的下一步比较。记录相关描述、方向判断、混杂、时间、机制和反事实六项。常见回答是“吃冰淇淋导致溺水”或只说“这只是相关”。较好的诊断会指出高温可能同时增加两项，并要求按温度分层或比较不同天气。前测要保留原图与变量定义，避免把总人数与比例混用。',
        note: '先画变量关系，不先选结论。',
        objective: '能用变量、趋势、方向、混杂、机制和反事实诊断一条相关报道。',
        practice: '完成数据图前测，写出两个替代解释和一个可区分它们的观察。',
        checkpoint: '检查是否只复述口号，是否指出第三变量，是否说明时间顺序和证据需求。',
      },
      {
        title: '材料与概念｜相关、混杂与反事实',
        body:
          '相关描述两个或多个变量共同变化，方向与强度可被统计指标概括，但统计关系本身不说明谁影响谁。因果主张需要时间先后、合理机制、排除主要混杂和可比较的反事实。混杂因素同时影响暴露与结果，选择偏差决定哪些单位进入数据，反向因果则是结果影响了暴露。潜在结果框架把因果效应写成“同一单位接受不同处理时的结果差”，现实只能观察其中一个，因此需要研究设计和假设。相关性仍有价值，可提示线索、预测风险和生成假设。',
        note: '相关能提示，因果要识别。',
        objective: '能解释相关、混杂、选择偏差、反向因果和反事实比较的关系。',
        practice: '为一条相关关系画暴露、结果和第三变量图，标出至少两条竞争路径。',
        checkpoint: '检查是否说明路径方向，是否列出共同原因或选择条件，是否给出可检验预测。',
      },
      {
        title: '示范与推导｜从同步趋势推到高温混杂',
        body:
          '冰淇淋销量与溺水人数都随高温上升。若能按气温分层，并比较同温条件下的销量与溺水，原本强关联可能减弱；再检查游泳时间和人群暴露，寻找更直接机制。示范写出三条竞争模型：高温共同原因、冰淇淋独立导致溺水、溺水事件反向增加销量，并为每条模型列预测与可能的观察反例。推导不给最终因果定论，而是找能区分模型的数据。若某模型无法提出可观察差异，它的解释力就弱。',
        note: '好解释要能被数据区分。',
        objective: '能把同步趋势转成竞争因果模型，并设计能区分它们的比较。',
        practice: '为案例画三条竞争路径图，各写一个可观察预测、一个关键假设和一个失败条件。',
        checkpoint: '检查模型方向明确，预测可观察，是否考虑温度、人群暴露和反向路径。',
      },
      {
        title: '引导练习｜六条相关性报道检查表',
        body:
          '准备六条相关性报道，覆盖共同原因、反向因果、选择偏差、时间不明、机制不足和较强因果证据。每条先做前测，填写变量、相关方向、可能混杂、时间关系、机制、反事实和下一项证据。再把结论分为“仅为相关”“提示因果”“较强支持因果”三档，并写降级理由。第二天用一条新数据做后测并修改一档判断。评分不看得出的结论是否大胆，而看证据与档位是否匹配。',
        note: '结论档位要跟证据匹配。',
        objective: '能用统一检查表比较六类相关性证据并写出结论档位。',
        practice: '提交六条报道检查表、分类档位、降级理由和一条新数据修订。',
        checkpoint: '检查是否指出具体混杂，是否说明时间与机制，是否保留不确定性并写出区分证据。',
      },
      {
        title: '独立迁移与评价｜审读一条真实因果主张',
        body:
          '选择一条真实报道，记录原始研究类型、样本、时间、比较组和结果。先做前测判断作者使用了“相关”“预测”还是“导致”，再画关系图和三个替代解释。设计一个能部分区分因果与混杂的下一步研究：随机干预、自然实验、纵向追踪或分层比较，并写识别假设。24 小时后用新材料复核。评价四项：变量清楚、替代解释具体、时间机制完整、结论文档一致。最后写一句如果要保留“导致”还需什么证据。',
        note: '每一步都写仍需什么证据。',
        objective: '能把因果检查迁移到真实报道，并提出可执行的区分证据与结论限定。',
        practice: '提交原文、关系图、三个替代解释、研究设计、24 小时复核和缺失证据清单。',
        checkpoint: '四项自评：变量明确、替代解释具体、时间机制完整、结论与证据匹配；缺一项就降级。',
      },
    ],
    quiz: [
      question(
        '“相关不等于因果”最准确的解释是什么？',
        '变量共同变化可由共同原因、选择偏差、反向影响或真实因果等多种结构产生',
        ['任何相关都完全没有价值', '只要相关很强就一定是因果', '因果不需要时间顺序'],
        0,
        '相关能提供线索和预测信息，但因果需要排除竞争结构。关键是写出具体替代解释并寻找区分证据，而不是只重复一句口号。',
        '事实与定义',
      ),
      question(
        '冰淇淋销量与溺水人数同升，最先应检查哪类替代解释？',
        '高温等共同原因是否同时提高两项，以及人群暴露是否变化',
        ['冰淇淋品牌名称是否好听', '两个数字是否都为整数', '图表颜色是否一致'],
        1,
        '共同原因会制造强关联。按温度、时间和人群暴露分层，可以比较原关联是否仍然存在，也能检查暴露与结果是否被同时移动。',
        '材料与推导',
      ),
      question(
        '哪种推理最不充分？',
        '机制故事讲得通顺，因此不再检查时间、混杂和对照',
        ['检查暴露是否先于结果', '寻找共同原因和选择偏差', '提出能区分模型的数据'],
        2,
        '机制是因果支持之一，但不能替代数据与设计。合理故事仍可能与时间、混杂或反事实缺口冲突，必须提出能被观察区分的预测。',
        '常见误区',
      ),
      question(
        '把因果检查迁移到产品数据时，哪种分析最稳妥？',
        '明确用户分组与时间顺序，检查共同原因，并用对照或自然实验比较结果',
        ['只比较使用产品最多的用户', '看到转化率更高就宣布因果', '删除所有未使用用户'],
        0,
        '产品数据也受选择和共同因素影响。清晰分组、时间与对照设计能减少把用户差异误当产品效果，并保留因果结论的适用边界。',
        '迁移应用',
      ),
    ],
  },
  'thinking:隐藏假设怎么找': {
    contentStatus: 'reviewed',
    prerequisite: '能识别一句主张和至少一条支持理由；会画简单箭头图。',
    plainLanguageGoal:
      '学完后，你能把理由到主张之间缺失的必要前提写成完整句子，并用反例、定义核对和数据需求检验它。',
    guidedPractice:
      '分析 8 段短论证，补出隐含假设，标出必要与充分混淆，并用一个反例或证据需求测试。',
    independentPractice:
      '选一篇评论文章，画出主张—理由—假设—反驳图，找出最影响结论的一条假设并提出验证方案。',
    commonErrors: [
      '把任何未说出的背景知识都叫隐藏假设，补出与结论无关的内容。',
      '只猜作者动机，不检查理由与主张之间的推理许可。',
      '补出假设后不测试真假，直接把它当成作者一定相信的事实。',
    ],
    sourceRefs: ASSUMPTION_SOURCES,
    studyPoints: [
      point('必背', '隐藏假设是理由要支持主张所必需但未明说的前提；补出后必须能接受反例或证据检验。', 1),
      point('重点', 'Toulmin 结构中的保证连接依据与主张，限定和反驳则说明结论适用到哪一步。', 2),
      point('易错', '必要前提不等于充分条件；满足一个假设可能仍不足以推出强结论。', 4),
    ],
    eventDetails: [ASSUMPTION_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜理由看起来对，结论为什么跳得太快',
        body:
          '呈现一句论证：“他每天阅读商业新闻，所以一定能做出正确投资决策。”先做前测，要求写出主张、理由、缺失前提和一个可能反例。记录是否只复述内容、是否补出无关背景、是否说明连接规则。较好的答案是“阅读商业新闻足以提高正确决策概率”，但这仍可能被市场不确定性、信息质量和执行偏差反驳。前测要把“假设是什么”和“假设是否成立”分开，避免一补出句子就当成事实。',
        note: '补桥不等于证明桥存在。',
        objective: '能用主张、理由、缺失前提和反例诊断一段跳跃论证。',
        practice: '分析三个短论证，分别写出主张、理由、必要假设和一个不能让结论成立的反例。',
        checkpoint: '检查假设是否介于理由与主张之间，是否说明为什么缺少它结论不能推出，是否另列真假检验。',
      },
      {
        title: '材料与概念｜保证、必要前提与充分条件',
        body:
          '论证由主张、依据、保证、支持和限定构成。保证回答“这些依据凭什么支持这个结论”，常被省略。补隐藏假设时可测试：若把该前提设为假，原结论是否失去支持；若补上该前提，结论是否仍不能必然成立。第二问区分必要与充分。日常论证通常依赖概率和例外，因此结论应带限定。识别隐含前提不是猜作者动机，而是恢复推理桥；任何假设都要写核验方式，如定义、样本、机制或反例。',
        note: '必要与充分要分开。',
        objective: '能区分依据、保证、隐含假设、必要条件和充分条件。',
        practice: '为一段论证画 Toulmin 图，分别删去一个依据和一个保证，观察结论支持怎样变化。',
        checkpoint: '检查是否把动机当保证，是否说明必要/充分差异，是否给假设附检验动作。',
      },
      {
        title: '示范与推导｜从阅读新闻推到投资结论',
        body:
          '原论证只为“阅读商业新闻”提供了接触信息的依据，却直接跳到“正确投资决策”。隐含保证可能是“信息量增加会稳定提高决策质量”。示范用反例检验：信息过载、来源偏差、市场变化和情绪交易都可能使关系不成立。接着把结论改成“可能帮助识别部分信息”，并增加条件“来源可靠、能核对数据、控制风险”。推导过程显示：原假设若为假，结论不能推出；即使为真，也只支持概率提高而非必然正确。',
        note: '强结论需要多条桥。',
        objective: '能补出论证假设、用反例削弱、区分必要与充分并改写结论。',
        practice: '为原论证写三个可能保证，各配一个反例和一个需要补充的证据。',
        checkpoint: '检查每个假设是否连接理由与结论，是否说明削弱路径，是否把结论降级到可支持强度。',
      },
      {
        title: '引导练习｜八段论证的假设检验',
        body:
          '准备八段短论证，覆盖样本代表、因果跳跃、定义含糊、权威假定、价值冲突和例外遗漏。每段先做前测，填写主张、理由、保证、隐含假设、一个反例和检验动作。第二轮交换图表作为后测，只允许根据对方写出的假设判断“若为假，结论是否失去支持”。记录假设相关性、必要性、真假检验和改写质量。若补出的句子只是重复理由或攻击作者人格，应退回重写。',
        note: '假设必须改变结论支持。',
        objective: '能对八类论证补出必要假设并用反例和证据需求进行检验。',
        practice: '提交八张论证图、反例、检验动作、必要性与充分性说明，以及一条限定改写。',
        checkpoint: '检查假设是否缺失即削弱结论，是否可检验，是否避免无关动机和人身推测。',
      },
      {
        title: '独立迁移与评价｜审读一篇评论文章',
        body:
          '选择一篇有明确主张的评论文章，先做前测列出理由和结论，再画主张—理由—假设—反驳图。找出最影响结论的一条隐含假设，写明若它为假会发生什么，并设计验证动作：查定义、找样本、比较案例或寻找机制。24 小时后用新材料复核一次。评价四项：结构完整、假设必要、反例具体、检验可行。最后改写结论，使其与已验证的假设相匹配。批判不是猜动机，而是把推理桥暴露出来。',
        note: '检验假设，不审判作者。',
        objective: '能把隐藏假设分析迁移到真实评论，并用反例、证据和限定改写检验结论。',
        practice: '提交文章结构图、核心假设、若假结果、验证方案、24 小时复核和改写句。',
        checkpoint: '四项自评：结构完整、假设必要、反例有效、验证可行；无法检验的假设要标为不确定。',
      },
    ],
    quiz: [
      question(
        '隐藏假设最准确的定义是什么？',
        '理由要支持主张所必需、但论证中没有明说的前提',
        ['作者心里所有没想到的事情', '任何与主题有关的背景知识', '对作者动机的负面猜测'],
        0,
        '隐藏假设是推理桥，不是任意背景或动机。若前提为假会削弱支持，才说明它对该论证必要，之后还要单独检验真假。',
        '事实与定义',
      ),
      question(
        '补出“阅读新闻能提高投资决策质量”后，为什么结论仍不能写成“必然正确”？',
        '该前提即使成立也可能只是必要条件或概率条件，不足以保证强结论',
        ['因为所有新闻都一定错误', '因为隐藏假设永远不能检验', '因为结论不需要理由'],
        1,
        '必要与充分不同。即使信息有助于判断，市场、执行和风险控制仍可能影响结果，结论需要限定为概率或条件判断。',
        '材料与推导',
      ),
      question(
        '哪种做法不属于有效的假设分析？',
        '猜测作者自私，因此不再检查理由与结论之间的连接',
        ['写出缺失前提并做反例测试', '区分必要与充分条件', '为假设设计数据核对'],
        2,
        '动机猜测不能替代结构分析。有效做法是恢复推理桥，再用反例、定义和证据检查其真假与支持力，并保留无法检验的假设。',
        '常见误区',
      ),
      question(
        '把假设分析迁移到项目方案时，哪种问题最关键？',
        '方案依赖哪些未明说的用户行为、资源或因果条件，若为假会怎样',
        ['汇报人是否语气自信', '幻灯片模板是否漂亮', '会议是否准时结束'],
        0,
        '项目方案常隐含资源可用、用户会响应或效果会传导等前提。逐条写出并检验，才能发现实施风险，也能避免把计划愿望当事实。',
        '迁移应用',
      ),
    ],
  },
  'thinking:证据强度与结论强度': {
    contentStatus: 'reviewed',
    prerequisite: '能区分事实、解释和因果主张；会阅读样本量与基本研究摘要。',
    plainLanguageGoal:
      '学完后，你能按偏倚、不一致、间接性、精确性和直接性评估证据，并把结论写成与证据强度匹配的限定。',
    guidedPractice:
      '分析 4 份关于同一问题的研究摘要，填写 GRADE 降级表，区分证据质量、推荐强度与仍待证据。',
    independentPractice:
      '选一条公共议题主张，整理至少三类证据，写证据表、结论等级、反例和更新条件。',
    commonErrors: [
      '只按研究设计名称排名，不看问题类型、执行质量和直接性。',
      '把一条显著结果当作整体证据，忽略重复、样本和发表偏倚。',
      '证据质量与推荐强度混为一谈，没有考虑价值、资源和适用人群。',
    ],
    sourceRefs: EVIDENCE_SOURCES,
    studyPoints: [
      point('必背', '证据强度要综合偏倚风险、不一致、间接性、精确性和直接性；证据质量不等于推荐强度。', 1),
      point('重点', '强结论需要更直接、更一致、更精确的证据；证据不足时结论应降级并写更新条件。', 2),
      point('易错', '一个显著研究不等于稳定结论，低等级证据也不是毫无价值；关键是它能支持到什么范围。', 4),
    ],
    eventDetails: [EVIDENCE_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜三篇研究支持同一句话，够不够',
        body:
          '提供三条证据摘要：一项小样本观察研究、一项方法有缺陷的试验和一篇综述，都指向同一方向。先做前测，要求给“该措施有效”的证据强度打档，并写理由。记录是否看样本、偏倚、一致性、直接性和精确性。常见错误是按“三篇”数量累加，或看到综述就自动最高。还要区分“证据支持有效”与“应该采用”：后者还涉及成本、价值和适用人群。前测保留每条摘要的方法信息，后面逐项复核。',
        note: '数量不能替代质量与一致性。',
        objective: '能用样本、设计、一致性和直接性诊断一条证据主张。',
        practice: '阅读三条摘要，为每条写主要优点、主要缺口和能支持的最大结论。',
        checkpoint: '检查是否只看研究类型，是否记录样本与人群，是否把效果证据和推荐混在一起。',
      },
      {
        title: '材料与概念｜GRADE 维度与结论限定',
        body:
          '证据强度不是单一排名。GRADE 思路从偏倚风险、结果不一致、间接性、精确性和发表偏倚等维度判断证据质量，并区分证据质量与推荐强度。随机试验通常可减少混杂，但执行差、样本小或人群不同仍会降级；观察研究在特定条件下也可能提供较强证据。结论应说明对象、干预、比较、结果和情境。证据不足时，不写“完全无效”，而写“目前不确定，需要更直接研究”。强度判断同时要记录更新条件。',
        note: '证据强度是多维判断。',
        objective: '能解释 GRADE 关键维度、证据质量和推荐强度之间的区别。',
        practice: '为一条结论制作五维降级表，并写出证据质量与建议强度两行判断。',
        checkpoint: '检查是否说明每个降级理由与结果的关系，是否把质量与价值决策分开。',
      },
      {
        title: '示范与推导｜从三篇证据推到有限结论',
        body:
          '假设三篇材料都显示某学习措施提高测试分数。先查它们是否测量同一人群与同一结果；再看样本、对照、流失和研究者利益；随后比较效应方向与置信区间。若人类研究只有一项且样本很小，动物或邻近任务研究只能算间接。示范输出包含证据表、总体质量、结论等级、适用边界和更新条件。可能结论是“在短期测验中有初步积极信号，对长期迁移仍不确定”。这比“方法有效”更忠于证据，也能指导下一步研究。',
        note: '把不确定写进结论。',
        objective: '能把多条不完整证据综合成带质量等级、适用边界和更新条件的结论。',
        practice: '为三篇证据填写完整表格，写出总体降级理由、适用人群和一句带更新条件的限定结论。',
        checkpoint: '检查是否逐项降级，是否把间接证据说明，结论是否没有超出结果与人群。',
      },
      {
        title: '引导练习｜四份摘要的证据表',
        body:
          '准备四份同一议题的研究摘要，设置不同偏倚、不一致、间接性和精确性问题。学习者先做前测给每份证据打初档，再用 GRADE 五维表逐项标记，并把总体质量与推荐强度分开。第二轮加入一份相反结果或反例，要求更新一致性和结论。记录维度遗漏、方向误读、质量与推荐混淆和限定不足。若某条证据只研究短期指标，就不能直接支持长期效果；若样本很小，结论应更谨慎。',
        note: '相反结果必须在下一轮进入。',
        objective: '能用五维表综合四份证据，并在出现相反结果后更新结论。',
        practice: '提交四份证据表、总体质量、推荐强度、相反结果更新和一条仍缺证据。',
        checkpoint: '检查是否逐维说明，是否正确处理相反结果，是否区分质量、价值和推荐。',
      },
      {
        title: '独立迁移与评价｜审读一条公共议题主张',
        body:
          '选一条公共议题主张，整理至少三类证据，记录来源、样本、比较、结果和适用人群。先做前测给出原结论强度，再用 GRADE 思路做后测：哪些维度支持、哪些降级、还缺什么。24 小时后加入一条新材料，重新判断结论是否改变。评价四项：证据可追、维度完整、结论匹配、更新条件明确。最后把“有效”或“无效”改写成包含对象、结果、时间和不确定性的句子。强结论不是声音大，而是证据链完整。',
        note: '允许新材料改变结论。',
        objective: '能把证据分级迁移到公共议题，并用新材料更新结论强度。',
        practice: '提交三类证据表、前后测强度、24 小时新材料、限定结论和更新条件。',
        checkpoint: '四项自评：来源可追、维度完整、结论匹配、可更新；无法说明适用人群时不得给强推荐。',
      },
    ],
    quiz: [
      question(
        '证据强度判断最合理的原则是什么？',
        '综合偏倚、不一致、间接性、精确性和直接性，并区分证据质量与推荐强度',
        ['研究数量越多就一定越强', '随机试验永远不需要评价质量', '观察研究一定没有任何价值'],
        0,
        '研究设计只是起点。执行、结果一致性、人群适用性和精确度都会改变证据质量，推荐还需价值与资源判断，二者不能合并成一个分数。',
        '事实与定义',
      ),
      question(
        '三篇研究都支持同一方向，其中两篇是邻近任务、一篇样本很小，最合理结论是什么？',
        '存在初步积极信号，但直接性和精确性不足，需要更直接研究',
        ['已经可以宣布对所有人群有效', '研究数量足以消除所有偏差', '三篇都应被完全删除'],
        1,
        '方向一致并不自动等于强证据。任务间接和样本小会限制结论，应写成有条件的初步判断并说明缺口，而不是推广到所有人群。',
        '材料与推导',
      ),
      question(
        '哪种做法最混淆证据质量与推荐强度？',
        '证据质量中等就直接推出所有情境都应强制采用',
        ['单列价值、成本与适用人群', '按 GRADE 维度说明降级', '记录仍需的直接研究'],
        2,
        '证据质量描述支持结论的可靠程度，推荐还取决于价值、资源、公平和实施条件，不能直接等同，也不能省略适用人群。',
        '常见误区',
      ),
      question(
        '把证据评估迁移到教育产品选择时，哪种结论最稳妥？',
        '在该样本和短期指标中显示改善，长期迁移与不同学生群体仍需验证',
        ['所有学校都会同样成功', '只要界面好看就证明有效', '一项研究显著即可永久采用'],
        0,
        '教育产品需要看人群、对照、结果持续时间和实施条件。短期限结果不能自动推广到长期和所有学校，低质量证据也应写明它能支持的具体范围。',
        '迁移应用',
      ),
    ],
  },
};
