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

const STATE_ARCHIVE = {
  id: 'state-space-search-problem-solving',
  kind: 'concept',
  title: '状态空间：把试错变成可检查的搜索',
  period: '1968—1999',
  summary:
    '状态图把当前局面、合法行动和目标条件写成节点与边。记录已访问状态和转移代价后，问题可从凭感觉试错变成可比较、可回溯的搜索。',
  background:
    '认知科学与人工智能研究用状态空间表示问题。状态定义过粗会混淆局面，过细则产生大量无用节点，关键是保留影响合法行动和目标的信息。',
  timeline: [
    {
      date: '1968',
      title: '启发式最短路径方法被形式化',
      body: 'Hart 等提出 A* 搜索，用路径代价与启发估计共同选择节点。该工作说明状态、转移代价和目标检验清楚后，算法才能讨论最短或近似最优。',
      sourceIds: ['hart-1968'],
    },
    {
      date: '1971',
      title: '问题解决被描述为搜索',
      body: 'Newell 与 Simon 总结人类问题解决研究，把问题空间、算子和目标状态放到统一框架。人的策略与计算机搜索可以共享某些结构，但不等同。',
      sourceIds: ['newell-simon-1971'],
    },
    {
      date: '1970s—1980s',
      title: '启发式搜索权衡完备与效率',
      body: '广度优先能找最少步数但可能扩展很多节点，深度优先节省内存却可能走远路。启发式能减少搜索，却要检查可采纳性和重复状态。',
      sourceIds: ['hart-1968', 'aima'],
    },
    {
      date: '1990s',
      title: '状态表示进入认知建模',
      body: '问题表征研究强调，状态不只记录物理位置，也包含目标、知识和可行算子。表征选择会改变问题难度，却不改变现实约束。',
      sourceIds: ['newell-simon-1971'],
    },
    {
      date: '1999',
      title: '状态空间搜索成为通用教材框架',
      body: '人工智能教材系统介绍状态、后继函数、路径代价、重复检测和启发式。统一框架使谜题、排期和路径问题可用相同方式分析。',
      sourceIds: ['state-space-1999', 'aima'],
    },
    {
      date: '应用边界',
      title: '模型正确不代表现实最优',
      body: '遗漏约束会生成非法路径，错误代价会把短路径优化成低价值路径。建模后仍需用已知解、反例和现实检查验证状态与转移。',
      sourceIds: ['state-space-1999', 'newell-simon-1971'],
    },
  ],
  outcome:
    '可观察结果是能定义状态元组、合法转移、目标测试和路径代价，并通过已访问集找到一条最少步数路径。',
  significance:
    '状态空间把“多试几次”变成可复用的问题表征方法，同时提醒模型边界和代价假设仍需验证。',
  sourceCards: [
    source(
      'state-space-1999',
      'State-Space Search for Problem Solving',
      'Springer',
      '1999',
      'https://doi.org/10.1007/978-1-4612-1538-7_1',
      '核对状态、后继、目标与搜索的基础框架。',
    ),
    source(
      'newell-simon-1971',
      'Human Problem Solving: The State of the Theory in 1970',
      'Allen Newell & Herbert A. Simon, American Psychologist',
      '1971',
      'https://doi.org/10.1037/h0030806',
      '核对问题空间、算子与目标状态。',
    ),
    source(
      'hart-1968',
      'A Formal Basis for the Heuristic Determination of Minimum Cost Paths',
      'Peter E. Hart, Nils J. Nilsson & Bertram Raphael',
      '1968',
      'https://doi.org/10.1109/TSSC.1968.300136',
      '核对启发式最短路径与路径代价。',
    ),
    source(
      'aima',
      'Artificial Intelligence: A Modern Approach',
      'Stuart Russell & Peter Norvig',
      '2025 年访问版',
      'https://aima.cs.berkeley.edu/',
      '核对搜索、后继函数和启发式教材框架。',
    ),
  ],
} satisfies LearningV2EventDetail;

const PROBLEM_TREE_ARCHIVE = {
  id: 'problem-structuring-methods',
  kind: 'concept',
  title: '问题树：先把问题结构化，再找答案',
  period: '1970s—2004',
  summary:
    '问题结构化方法把模糊现象拆成目标差距、利益相关者、原因假设和可行动信息。问题树是协作与证据组织工具，不是自动生成的真相。',
  background:
    '运筹学与系统方法面对多方目标和不确定信息时，发展出软系统与问题结构化方法。它强调问题定义本身就需要选择、讨论和验证。',
  timeline: [
    {
      date: '1970s—1980s',
      title: '软系统方法关注问题定义',
      body: '复杂组织问题常没有单一客观描述，参与者对目标和边界有不同理解。结构化方法先显式比较这些看法，再形成可行动问题。',
      sourceIds: ['rosenhead-1996'],
    },
    {
      date: '1996',
      title: '问题结构化方法被系统归纳',
      body: 'Rosenhead 总结多种参与式方法，强调模型是讨论和学习的媒介。问题树若只由一个人闭门完成，容易把既有答案伪装成原因。',
      sourceIds: ['rosenhead-1996'],
    },
    {
      date: '2003',
      title: '方法被要求连接实际行动',
      body: '问题结构化方法在行动研究中强调利益相关者、边界和承诺。树状分析要指向可收集证据与可执行实验，而不只是漂亮分类。',
      sourceIds: ['problem-structuring-action'],
    },
    {
      date: '2004',
      title: '结构化方法进入复杂实践',
      body: '研究比较不同项目中的问题结构、参与过程和结果。工具效果取决于能否容纳冲突信息、修正问题陈述并推动决策。',
      sourceIds: ['problem-structuring-action', 'rosenhead-1996'],
    },
    {
      date: '2010s',
      title: '因果树与假设验证结合',
      body: '实际分析把原因分支写成可测试假设，为每支指定指标、反例和区分证据。证据不足的分支保留，不用看起来专业的名词补齐。',
      sourceIds: ['problem-structuring-action'],
    },
    {
      date: '应用边界',
      title: '问题树不是原因证明',
      body: '分支完整不代表原因真实，团队共识也不代表证据充分。行动前要标明最可能、最不确定和影响最大的分支，并安排验证。',
      sourceIds: ['rosenhead-1996', 'problem-structuring-action'],
    },
  ],
  outcome:
    '可观察结果是形成一份带现象、目标差距、原因假设、证据、反例、优先级和下一步行动的树。',
  significance:
    '问题树把模糊抱怨转成协作问题，并迫使团队区分现象、原因、方案和证据。',
  sourceCards: [
    source(
      'rosenhead-1996',
      "What's the Problem? An Introduction to Problem Structuring Methods",
      'Jonathan Rosenhead, Interfaces',
      '1996',
      'https://doi.org/10.1287/inte.26.6.117',
      '核对问题定义、参与式结构化与模型作用。',
    ),
    source(
      'problem-structuring-action',
      'Problem Structuring Methods in Action',
      'European Journal of Operational Research',
      '2004',
      'https://doi.org/10.1016/S0377-2217(03)00056-0',
      '核对结构化方法在实践中的过程与边界。',
    ),
    source(
      'decision-theory',
      'Decision Theory',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/decision-theory/',
      '核对目标、不确定性、价值与行动选择。',
    ),
    source(
      'openintro-statistics',
      'OpenIntro Statistics',
      'OpenIntro',
      '2025 年访问版',
      'https://www.openintro.org/book/os/',
      '核对数据、样本与证据表达。',
    ),
  ],
} satisfies LearningV2EventDetail;

const MECE_ARCHIVE = {
  id: 'partition-and-mece-boundary',
  kind: 'concept',
  title: 'MECE：分区检查而不是万能分类法',
  period: '1990s—2004',
  summary:
    'MECE 要求在同一个分类维度下项目互斥、整体穷尽。它适合检查重叠与遗漏，却不能保证维度选对，也不能强迫现实中连续或交叉的属性变成整齐格子。',
  background:
    '结构化咨询和问题方法常用 MECE 组织议题树。方法价值在暴露分类冲突，风险是把整齐误当真实、把“其他”无限扩展或混用多个维度。',
  timeline: [
    {
      date: '1990s',
      title: '议题树广泛用于结构化沟通',
      body: '咨询与决策实践用树状分解把大问题拆成可调查分支。分类完整有助于分工，但未经验证的分支仍只是假设。',
      sourceIds: ['problem-structuring-action'],
    },
    {
      date: '1996',
      title: '问题结构化强调边界选择',
      body: 'Rosenhead 指出问题边界本身需要讨论。MECE 只检查当前维度是否覆盖，无法替代利益相关者确定什么应进入问题。',
      sourceIds: ['rosenhead-1996'],
    },
    {
      date: '2000s',
      title: '分类检验被用于减少重复工作',
      body: '互斥可避免同一项目被两个团队重复计数，穷尽可揭示未分配对象。实际分类要写定义、判定规则和“其他”的负责人。',
      sourceIds: ['problem-structuring-action'],
    },
    {
      date: '2010s',
      title: '多维度问题暴露 MECE 局限',
      body: '用户可按渠道、地区、生命周期等多个维度分类，每一层可互斥，但不同维度不能混在同一层。强行全塞进一个树会造成语义冲突。',
        sourceIds: ['problem-structuring-action', 'aima'],
    },
    {
      date: '2020s',
      title: '分类与数据标签需要双向核对',
      body: '数据中的缺失、多重标签和边界案例会破坏互斥。分析者要记录归类规则、重复计数、遗漏率和无法归类项，而非只画整齐树。',
      sourceIds: ['openintro-statistics'],
    },
    {
      date: '应用边界',
      title: '整齐不等于有效',
      body: 'MECE 检查的是分类结构，不检查维度是否与决策目标相关。真正有效的分支还要有证据、影响和可行动性。',
      sourceIds: ['rosenhead-1996', 'problem-structuring-action'],
    },
  ],
  outcome:
    '可观察结果是能在一个层级使用单一维度，给每类写判定规则，检查重叠、遗漏和边界案例，并保留未分类项。',
  significance:
    'MECE 被还原为分类质量检查，避免把整洁树当成真实因果或完整策略。',
  sourceCards: [
    source(
      'rosenhead-1996',
      "What's the Problem? An Introduction to Problem Structuring Methods",
      'Jonathan Rosenhead',
      '1996',
      'https://doi.org/10.1287/inte.26.6.117',
      '核对问题边界与结构化分类的参与性。',
    ),
    source(
      'problem-structuring-action',
      'Problem Structuring Methods in Action',
      'European Journal of Operational Research',
      '2004',
      'https://doi.org/10.1016/S0377-2217(03)00056-0',
      '核对分类在实践中的使用和边界。',
    ),
    source(
      'openintro-statistics',
      'OpenIntro Statistics',
      'OpenIntro',
      '2025 年访问版',
      'https://www.openintro.org/book/os/',
      '核对数据分类、缺失和计数边界。',
    ),
    source(
      'aima',
      'Artificial Intelligence: A Modern Approach',
      'Russell & Norvig',
      '2025 年访问版',
      'https://aima.cs.berkeley.edu/',
      '核对类别、状态和问题表示的一般框架。',
    ),
  ],
} satisfies LearningV2EventDetail;

const MATRIX_ARCHIVE = {
  id: 'weighted-decision-matrix-sensitivity',
  kind: 'concept',
  title: '决策矩阵：权重从目标来，结论靠敏感性检验',
  period: '1940s—1993',
  summary:
    '加权矩阵把方案、标准、权重和评分放在一起，便于比较和沟通。权重必须来自目标与价值判断，评分需有尺度；结论还要通过敏感性分析检查是否依赖任意数字。',
  background:
    '多目标决策研究处理价值冲突、风险和不确定结果。加权和是透明工具，却会压缩复杂性，使用时要保留不可补偿约束和权重争议。',
  timeline: [
    {
      date: '1940s—1950s',
      title: '期望效用与多目标选择进入形式化',
      body: '决策理论研究在不确定结果下如何按偏好比较行动。形式化提高一致性，也要求偏好和价值来源能被说明。',
      sourceIds: ['sep-decision-theory'],
    },
    {
      date: '1970s',
      title: '多属性价值权衡被系统研究',
      body: 'Keeney 与 Raiffa 讨论多个目标之间的价值权衡。权重不是客观藏在数据里的常数，而与决策目标和价值判断相连。',
      sourceIds: ['keeney-raiffa'],
    },
    {
      date: '1980s',
      title: '多准则分析扩展权重与评分方法',
      body: '不同方法处理定性标准、群体偏好和不确定性。加权和只是其中一种透明基线，不适合所有不可补偿条件。',
      sourceIds: ['keeney-raiffa', 'sep-decision-theory'],
    },
    {
      date: '1990s',
      title: '敏感性分析成为必要步骤',
      body: '当权重小改动就使排序翻转，结论不应假装稳定。分析者要报告临界权重、评分误差和关键取舍。',
      sourceIds: ['keeney-raiffa'],
    },
    {
      date: '2000s',
      title: '群体决策暴露权重来源冲突',
      body: '不同利益相关者可能给成本、速度和质量不同权重。矩阵应显式保留分歧，不能用平均数掩盖一方的重要约束。',
      sourceIds: ['sep-decision-theory'],
    },
    {
      date: '应用边界',
      title: '加权分数不是价值本身',
      body: '矩阵使假设透明，却不会替人决定价值。若某标准是安全或合规门槛，应先作为硬约束过滤，再比较剩余方案。',
      sourceIds: ['keeney-raiffa', 'sep-decision-theory'],
    },
  ],
  outcome:
    '可观察结果是能列出方案、标准、权重来源、评分尺度、加权总分、硬约束和一组敏感性变化。',
  significance:
    '决策矩阵帮助公开取舍，同时防止把数字精度误当价值确定性。',
  sourceCards: [
    source(
      'sep-decision-theory',
      'Decision Theory',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/decision-theory/',
      '核对偏好、价值、不确定性与行动选择。',
    ),
    source(
      'keeney-raiffa',
      'Decisions with Multiple Objectives',
      'Ralph L. Keeney & Howard Raiffa, Cambridge University Press',
      '1993',
      'https://doi.org/10.1017/CBO9781139174084',
      '核对多目标价值权衡、权重与决策分析。',
    ),
    source(
      'problem-structuring-action',
      'Problem Structuring Methods in Action',
      'European Journal of Operational Research',
      '2004',
      'https://doi.org/10.1016/S0377-2217(03)00056-0',
      '核对多方问题结构与行动选择。',
    ),
    source(
      'openintro-statistics',
      'OpenIntro Statistics',
      'OpenIntro',
      '2025 年访问版',
      'https://www.openintro.org/book/os/',
      '核对评分、不确定性和数据解释。',
    ),
  ],
} satisfies LearningV2EventDetail;

const STATE_SOURCES = [
  'State-Space Search for Problem Solving, Springer, 1999。https://doi.org/10.1007/978-1-4612-1538-7_1',
  'Allen Newell & Herbert A. Simon, Human Problem Solving, 1971。https://doi.org/10.1037/h0030806',
  'Peter E. Hart, Nils J. Nilsson & Bertram Raphael, A Formal Basis for Heuristic Minimum Cost Paths, 1968。https://doi.org/10.1109/TSSC.1968.300136',
  'Stuart Russell & Peter Norvig, Artificial Intelligence: A Modern Approach。https://aima.cs.berkeley.edu/',
];

const PROBLEM_TREE_SOURCES = [
  'Jonathan Rosenhead, What’s the Problem? An Introduction to Problem Structuring Methods, 1996。https://doi.org/10.1287/inte.26.6.117',
  'Problem Structuring Methods in Action, European Journal of Operational Research, 2004。https://doi.org/10.1016/S0377-2217(03)00056-0',
  'Stanford Encyclopedia of Philosophy, Decision Theory。https://plato.stanford.edu/entries/decision-theory/',
  'OpenIntro, OpenIntro Statistics。https://www.openintro.org/book/os/',
];

const MECE_SOURCES = [
  'Problem Structuring Methods in Action, European Journal of Operational Research, 2004。https://doi.org/10.1016/S0377-2217(03)00056-0',
  'Jonathan Rosenhead, What’s the Problem?, 1996。https://doi.org/10.1287/inte.26.6.117',
  'OpenIntro, OpenIntro Statistics。https://www.openintro.org/book/os/',
  'Artificial Intelligence: A Modern Approach。https://aima.cs.berkeley.edu/',
];

const MATRIX_SOURCES = [
  'Stanford Encyclopedia of Philosophy, Decision Theory。https://plato.stanford.edu/entries/decision-theory/',
  'Ralph L. Keeney & Howard Raiffa, Decisions with Multiple Objectives, 1993。https://doi.org/10.1017/CBO9781139174084',
  'Problem Structuring Methods in Action, 2004。https://doi.org/10.1016/S0377-2217(03)00056-0',
  'OpenIntro, OpenIntro Statistics。https://www.openintro.org/book/os/',
];

export const THINKING_STRUCTURED_REWRITE: CuratedCoursePlanPatchMap = {
  'thinking:渡河谜题：把约束画成状态图': {
    contentStatus: 'reviewed',
    prerequisite: '能区分事实、约束和目标；会画节点与箭头图。',
    plainLanguageGoal:
      '学完后，你能把渡河局面写成状态元组，列出合法转移，并用已访问集找到最少步数路径。',
    guidedPractice:
      '为狼、羊、菜问题绘制全部可达状态，标出违法转移、重复状态、目标状态和一条 7 步最短路径。',
    independentPractice:
      '把两人值班或单台设备排期写成状态图，定义合法转移、代价和目标，比较两条路径并记录模型遗漏。',
    commonErrors: [
      '状态没有记录船或关键角色位置，导致不同局面被误判为相同。',
      '只凭肉眼判断合法转移，没有逐条检查容量与安全约束。',
      '记录路线却不记录已访问状态，反复回到同一局面。',
    ],
    sourceRefs: STATE_SOURCES,
    studyPoints: [
      point('必背', '状态图由状态、合法转移和目标测试组成；路径搜索还要记录已访问状态与代价。', 1),
      point('重点', '状态应保留影响合法行动和目标判定的信息，过粗会混淆，过细会增加无用分支。', 2),
      point('易错', '找到一条可行路径不等于最短；必须逐步扩展合法转移并比较路径长度或代价。', 4),
    ],
    eventDetails: [STATE_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜为什么同一局面总被反复走进',
        body:
          '给出狼、羊、菜与农夫渡河问题。先做前测：写下船容量、不能单独留下的组合、目标状态和第一条尝试路径。记录是否只靠口头推理、是否反复出现同一岸上组合、是否漏掉船的位置。常见错误是把“狼和菜在左岸”当成完整状态，却没有写羊和农夫在哪。前测要求为每次移动记录前后局面；后测再要求画已访问节点。先暴露状态缺失，不急着公布七步答案。',
        note: '先定义完整局面。',
        objective: '能用岸边成员、船位置和约束诊断渡河问题中的非法与重复路径。',
        practice: '完成渡河前测，写出初始状态、三条尝试转移和每个被违反的约束。',
        checkpoint: '检查状态是否含全部角色和船位置，是否逐条验证容量与安全，是否记录重复。',
      },
      {
        title: '材料与概念｜状态、转移、目标与代价',
        body:
          '状态是描述当前局面所需的最少信息；转移是一次合法行动产生的后继状态；目标测试判断是否完成。渡河问题可把状态写成“左岸集合｜船位置”，每次移动只改变农夫和至多一个同行对象。合法转移必须满足船容量与安全约束，路径代价可记作过河次数。搜索时把新状态加入已访问集，避免回到旧局面。广度优先按层扩展，在单位代价下先找到最少步数；若代价不同，则要比较总成本。',
        note: '状态完整，转移才可枚举。',
        objective: '能解释状态、合法转移、目标测试、已访问集和路径代价的关系。',
        practice: '为渡河问题写状态表示、后继函数、目标测试和违反约束的反例。',
        checkpoint: '检查状态是否足够，后继是否只含合法动作，代价与目标是否明确。',
      },
      {
        title: '示范与推导｜从初始状态扩展到第一条解',
        body:
          '初始状态为“农夫、狼、羊、菜在左岸，船在左岸”。合法第一步只能带羊，否则狼吃羊或羊吃菜。到达右岸后，农夫必须独自返回，再带狼或菜，随后把羊带回，形成必要的回退。示范只展开合法后继，并把已出现状态标为重复。反例是直接带狼而不带回羊，右岸留下狼与羊会违法。沿着层次逐层扩展，路径长度七步时通过目标测试；若同层还有路径，要继续比较再确定最短。',
        note: '回退也可能是最短路径的一部分。',
        objective: '能从初始状态逐层扩展，解释回退步骤并找到最少过河次数。',
        practice: '手写三层状态节点、全部合法边、重复标记、一个非法反例和一条七步解路径。',
        checkpoint: '检查每次转移容量与安全，是否记录回退，是否证明更短路径不可能。',
      },
      {
        title: '引导练习｜完整状态图与最短路径',
        body:
          '建立一张完整状态表，列出左右岸集合和船位置；每一行写可达后继、违反约束的候选、是否已访问和当前距离。先做前测只画前两层，再用广度优先扩展到目标。后测要求给出七步路径，并写出一个看似可行但被安全约束排除的反例。记录状态遗漏、非法边、重复扩展和目标误判。若只画路径不画状态表，无法说明为什么其他分支不合法。',
        note: '非法分支也要留证据。',
        objective: '能独立完成渡河状态图、合法性检查和最短路径证明。',
        practice: '提交完整状态表、转移图、七步路径、非法反例和最少步数理由。',
        checkpoint: '检查状态无遗漏，边均有约束依据，重复被剪枝，目标路径长度可比较。',
      },
      {
        title: '独立迁移与评价｜把状态图用于资源排期',
        body:
          '选择两人值班或单台设备排期，先做前测写出任务、资源、互斥条件和目标。把“已安排任务集合、当前时间、资源状态”作为状态，转移为安排下一任务，非法转移包括超时或冲突。用图找出两条可行排期，再比较总等待或切换代价。评价四项：状态完整、转移合法、目标明确、代价可比较。最后写一个模型遗漏，例如请假或临时故障，说明状态需要怎样扩展。',
        note: '模型边界要写出来。',
        objective: '能把状态图迁移到真实排期问题，并用路径代价比较方案。',
        practice: '提交排期状态定义、转移规则、两条路径、代价比较和一个遗漏约束。',
        checkpoint: '四项自评：状态完整、转移合法、目标可测、代价相比；遗漏约束必须明确而非隐藏。',
      },
    ],
    quiz: [
      question(
        '一个状态表示最少应包含什么？',
        '影响合法转移、目标判断和后续结果的关键信息',
        ['所有曾经说过的话', '页面颜色和标题', '不需要任何约束'],
        0,
        '状态要足够区分不同局面，又要避免无关细节。缺少关键信息会混淆局面，过细会增加无用搜索，因此表示方式必须服务转移和目标判断。',
        '事实与定义',
      ),
      question(
        '为什么广度优先在单位代价搜索中先找到最少步数路径？',
        '它按距离逐层扩展，首次到达目标时更短层已处理完',
        ['它随机选节点', '它只记录目标不记录状态', '它保证所有路径代价相同'],
        1,
        '广度优先按路径长度分层，在单位代价条件下先处理近层。若边代价不同，需要按总成本选择搜索策略，并检查重复状态和启发式。',
        '材料与推导',
      ),
      question(
        '哪种做法最可能让状态图给出错误路径？',
        '遗漏船的位置或人物组合，使不同现实局面被当成同一状态',
        ['记录已访问状态', '逐条检查容量约束', '保留非法分支作为反例'],
        2,
        '状态混淆会让算法从错误起点继续扩展。完整状态与约束检查是路径正确性的前提，发现模型错误时应先修状态而不是继续搜索。',
        '常见误区',
      ),
      question(
        '把状态图迁移到项目排期时，哪种状态最完整？',
        '已安排任务、资源占用、当前时间和未满足约束',
        ['只记录项目名称', '只记录最终日期', '只记录谁最忙'],
        0,
        '排期状态需要知道哪些任务已完成、哪些资源被占用、当前约束怎样。这样才能判断下一步合法安排，并比较等待或切换代价。',
        '迁移应用',
      ),
    ],
  },
  'thinking:问题树：从现象到可行动问题': {
    contentStatus: 'reviewed',
    prerequisite: '能区分事实与假设，会给指标写来源和证据需求。',
    plainLanguageGoal:
      '学完后，你能把模糊现象改写成带范围和目标差距的问题陈述，建立原因假设树，并选出最值得验证的行动。',
    guidedPractice:
      '围绕“续费率下降”建立 4 个一级原因、12 个可测假设，标出指标、反例、影响、不确定性和下一步行动。',
    independentPractice:
      '选一个真实现象，访谈至少两类利益相关者，形成问题树并用现有数据淘汰一个分支。',
    commonErrors: [
      '把“做促销”“加强管理”等方案写成原因。',
      '问题陈述没有对象、时间、指标和目标差距，导致每个方向都能讨论。',
      '分支看起来完整，却没有为假设指定证据和验证动作。',
    ],
    sourceRefs: PROBLEM_TREE_SOURCES,
    studyPoints: [
      point('必背', '问题树从可测现象和目标差距出发，把原因写成可验证假设，再连接证据与行动。', 1),
      point('重点', '原因分支要区分人群、流程、资源和外部条件，并给每条假设写指标、反例与验证动作。', 2),
      point('易错', '方案不是原因；树上出现“应该做促销”时，应追问它想解决哪条原因假设。', 4),
    ],
    eventDetails: [PROBLEM_TREE_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜续费率下降，先别急着做促销',
        body:
          '给出“最近续费率下降，需要搞促销”的会议发言。先做前测，要求判断这是现象、问题、原因还是方案，并写出缺失信息。常见缺失包括对象、时间段、基线和目标、下降幅度及不同用户分组。若问题没有边界，团队会把定价、产品、服务和渠道所有事项都塞进树。前测还要求写一个反例：如果下降只发生在某小群体，整体促销可能浪费资源。后测将把发言改写成可行动问题。',
        note: '先定义差距，再列原因。',
        objective: '能从模糊发言中区分现象、问题、原因和方案，并指出缺失范围。',
        practice: '完成会议发言前测，写出对象、时间、指标、目标差距、一个反例和待确认信息。',
        checkpoint: '检查是否把方案当原因，问题是否有量化差距，是否保留用户分组和时间范围。',
      },
      {
        title: '材料与概念｜现象、问题、假设与行动',
        body:
          '现象是观察到的变化，问题陈述把现象写成目标与当前差距，原因树把差距拆成可能机制，行动则针对证据最强的分支进行验证或干预。每个原因应写成可证伪假设，并配一个指标和一个可能否定它的反例。树的维度可按用户、流程、资源、外部环境分开，不能在同一层混用。优先级可综合影响、不确定性和验证成本。问题树的价值不是一次列全真相，而是组织证据收集和团队讨论，随数据更新。',
        note: '每条分支都要能被证据淘汰。',
        objective: '能解释现象、问题陈述、原因假设、证据与行动之间的逻辑顺序。',
        practice: '为同一现象写一句问题陈述、四个一级原因假设和一个验证动作。',
        checkpoint: '检查原因是否可测，是否区分方案，是否给反例与指标，优先级是否说明依据。',
      },
      {
        title: '示范与推导｜从续费率差距展开原因树',
        body:
          '把问题写成“过去三个月，中小企业用户在首月续费节点的续费率从 85% 降到 72%，希望 30 天内定位主要下降分支”。一级分支可分为用户构成、产品使用、价格与合同、服务流程，每支再写假设和指标。例如“新渠道用户增加且留存更低”，指标是分渠道续费率与样本量，反例是各渠道下降幅度相同。示范给每条分支标影响、不确定性和验证成本，并先安排低成本高信息动作，而不是直接发折扣。',
        note: '先找区分证据，再选行动。',
        objective: '能把量化问题展开成原因假设、指标、反例和验证优先级。',
        practice: '为四条一级分支各写两个可测假设、一个反例和一项数据动作。',
        checkpoint: '检查问题陈述完整，原因非方案，指标能区分分支，优先级有依据。',
      },
      {
        title: '引导练习｜十二个假设的问题树',
        body:
          '以续费率现象为材料，第一轮建立四个一级分支和十二个二级假设，每个节点写指标、反例、影响、不确定性和验证成本。第二轮用一组模拟数据淘汰两个分支，并记录为什么保留仍不确定项。后测把树上最优先行动写成一周验证计划，说明需要谁、取什么数据、何时停止。记录方案混入、分支重叠、证据缺失和行动不可执行。树越整齐不代表越正确，能被数据改变才算有效。',
        note: '数据要能改变树。',
        objective: '能建立可测问题树，用模拟证据淘汰分支并形成一周验证计划。',
        practice: '提交 12 节点树、指标与反例、优先级、数据淘汰记录和一周行动。',
        checkpoint: '检查分支不混方案，指标可收集，反例会改变判断，行动有负责人和停止条件。',
      },
      {
        title: '独立迁移与评价｜让利益相关者参与问题定义',
        body:
          '选择一个真实现象，访谈至少两类利益相关者，记录他们对目标、范围和原因的不同理解。先做前测形成个人树，再合并为带冲突标记的共享树。用现有数据淘汰或降级一条分支，并保留一个无法判断的假设。24 小时后更新一次问题陈述。评价四项：问题可测、原因可证伪、证据可追、行动可执行。最后写一条系统边界，例如暂时不分析政策变化，说明何时重开。问题树不是共识表演，而是把分歧变成可检验问题。',
        note: '保留分歧，不强制假装共识。',
        objective: '能把问题树迁移到真实多方情境，并融合分歧、证据与行动边界。',
        practice: '提交访谈记录、个人与共享问题树、数据淘汰、24 小时更新和系统边界。',
        checkpoint: '四项自评：问题可测、假设可验、证据可追、行动可行；冲突不能靠删除异见解决。',
      },
    ],
    quiz: [
      question(
        '一个可行动问题陈述最应包含什么？',
        '对象、时间、指标、当前值与目标差距，以及可接受的范围',
        ['一个预设解决方案', '一句“情况不好”', '所有可能原因'],
        0,
        '问题需要可测边界，才能决定哪些原因相关、怎样判断行动有效。直接写促销方案会跳过问题诊断，也无法比较不同原因的证据。',
        '事实与定义',
      ),
      question(
        '树上出现“加强培训”时，首先应追问什么？',
        '它针对哪条可测原因假设，培训通过什么机制改善哪个指标',
        ['培训预算是否最高', '标题是否简短', '是否有四个一级分支'],
        1,
        '培训是行动，不是原因。必须连接到能力缺口、错误率或服务质量等机制，并说明可被哪些证据支持或否定，再决定行动优先级。',
        '材料与推导',
      ),
      question(
        '哪种问题树最可能看似完整却无法行动？',
        '每条分支都没有指标、反例和负责人，只写抽象名词',
        ['每条假设配数据来源', '标出影响与不确定性', '保留未解决分歧'],
        2,
        '没有指标与反例，分支无法被证据淘汰，也无法安排验证。整齐分类不能替代可执行诊断，分支越多反而可能稀释资源。',
        '常见误区',
      ),
      question(
        '把问题树迁移到团队绩效时，哪种做法最稳妥？',
        '区分工作量、能力、流程、资源和外部条件假设，并用分组数据逐条验证',
        ['先宣布所有人都要加班', '只看总产出一个数字', '删除反对意见'],
        0,
        '绩效下降可能来自多种机制。分组数据和可证伪假设能区分原因，并把行动放在最需要的分支，同时保留外部条件与测量偏差。',
        '迁移应用',
      ),
    ],
  },
  'thinking:MECE 不是把所有事都列一遍': {
    contentStatus: 'reviewed',
    prerequisite: '能建立分类表，识别对象多重标签和缺失数据。',
    plainLanguageGoal:
      '学完后，你能在一个层级使用单一分类维度，检查互斥、穷尽、重叠、遗漏和边界案例，并把结果用于行动。',
    guidedPractice:
      '为 12 个流失原因建立三种分类树，逐一检查互斥、穷尽、维度混用和“其他”项，修正重叠与遗漏。',
    independentPractice:
      '选一份真实用户或任务清单，建立单维度分类规则，量化未分类与多重标签，并说明哪些决策不适合 MECE。',
    commonErrors: [
      '把不同维度混在同一层，例如渠道、年龄和原因并列。',
      '类别名称重叠，同一对象可按两种定义落入多处。',
      '为了表面穷尽，把无法归类项硬塞进不合适类别，忽略“其他/未知”。',
    ],
    sourceRefs: MECE_SOURCES,
    studyPoints: [
      point('必背', 'MECE 检查同一维度的互斥与集体穷尽；它不保证维度选对，也不保证分类与决策目标相关。', 1),
      point('重点', '每类必须有判定规则，重叠项、遗漏项、未分类项和“其他”都要能被看见。', 2),
      point('易错', '不同维度可以分层使用，但不能在同一层混放；整齐树不是因果树。', 4),
    ],
    eventDetails: [MECE_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜分类看起来整齐，为什么总数对不上',
        body:
          '给出十二个流失原因和一张分类树，其中“价格原因”“用户体验”“渠道问题”互相重叠，且“账号迁移”无处放置。先做前测，要求把每个原因归入一类并统计总数。记录重叠、遗漏、双重计数和维度混用。常见错误是把“产品复杂”和“功能缺失”都放进“用户问题”，却没有判定规则。前测末尾加入一个边界案例：用户因公司政策停用，应放哪里？后测要求修改树并解释。',
        note: '先找重叠与遗漏。',
        objective: '能用重叠项、遗漏项、双重计数和维度混用诊断分类树。',
        practice: '完成十二项分类前测，标出每个重叠、无类可归项和判定模糊项。',
        checkpoint: '检查是否每项只有一个类，是否总数一致，是否保留未分类边界案例。',
      },
      {
        title: '材料与概念｜互斥、穷尽与单一维度',
        body:
          '互斥要求同一对象在同一层级只满足一个类别，穷尽要求所有待分类对象至少落入一个类别。二者都必须基于明确判定规则和同一维度：按流程阶段分类时不要再混入年龄，按用户类型分类时不要再混入原因。现实中常见缺失、未知和多重标签，可设“其他、未知、待核实”类别并安排负责人。MECE 是分类质量检查，不判断类别是否重要、原因是否真实。树可以很整齐却与目标无关，也可以保留未分类而更诚实。',
        note: '一个层级只用一个维度。',
        objective: '能解释互斥、穷尽、单一维度、判定规则和未分类项的作用。',
        practice: '为一个分类题目写维度、互斥规则、穷尽来源、其他类和两个边界案例。',
        checkpoint: '检查类别是否同维度，定义是否可判定，其他类是否有处理规则，边界案例是否保留。',
      },
      {
        title: '示范与推导｜从混合分类改成单维度树',
        body:
          '原树把“新用户”“价格异议”“渠道广告”并列。示范先选维度“流失发生阶段”，分为首次使用、价值形成、续费决策和售后，再把价格与渠道放到其他维度分析。每类写判定问题和例子；重复项只保留主类，并记录次标签。反例是已退款又投诉价格的用户：根据当前维度按首次失败阶段归类，不能同时计数两次。修正后总数等于样本数，未分类项进入待核实清单。',
        note: '主类与次标签分开。',
        objective: '能把混合分类改成单维度 MECE 树，并正确处理重复与未分类。',
        practice: '为三种分类树各写维度、判定问题、重复项处理规则、遗漏检查和未分类负责人。',
        checkpoint: '检查同层不混维度，主类唯一，其他和未知有负责人，不能解释的保留不硬塞。',
      },
      {
        title: '引导练习｜三种树与十二项清单',
        body:
          '用十二个流失原因分别按用户类型、使用阶段和原因类型建三棵树。每棵树先做前测统计总数，再检查互斥与穷尽；第二轮交换分类，由同伴指出一个重叠和一个遗漏。后测写出每棵树适合回答的问题和不适合回答的问题。记录维度混用、类别重叠、遗漏、其他膨胀和无关分类。若“其他”超过约定比例，应重开类别而不是继续假装穷尽。',
        note: '“其他”膨胀说明分类需重做。',
        objective: '能用同一清单比较三种分类维度，并评估各自的适用问题与边界。',
        practice: '提交三棵树、总数核对、同伴复核、其他类比例和适用/不适用问题。',
        checkpoint: '检查每棵树单维度、总数一致、重叠与遗漏有记录、其他类不失控。',
      },
      {
        title: '独立迁移与评价｜用数据核对分类质量',
        body:
          '选择真实用户或任务清单，先做前测建立分类树，再用数据验证数量。记录多重标签、缺失字段、无法判定和“其他”比例，抽样复核十条判定。24 小时后根据复核调整规则。评价四项：维度单一、判定可复现、总数可核、边界诚实。最后写一个不适合 MECE 的问题，例如连续变量被强行切成类别可能损失信息。分类是决策工具，不是现实本身。',
        note: '分类规则要能被别人复现。',
        objective: '能把 MECE 检查迁移到真实数据，按复核结果修正规则并说明不适用场景。',
        practice: '提交真实分类树、计数核对、十条抽样复核、24 小时修正和不适用场景。',
        checkpoint: '四项自评：同维分类、规则可复现、计数可核、边界清楚；其他比例过高必须重做。',
      },
    ],
    quiz: [
      question(
        'MECE 中的“互斥”在当前层级意味着什么？',
        '同一对象按同一维度只能落入一个类别',
        ['所有类别名字必须不同', '每个类别只能有一个对象', '任何对象都不能多标签'],
        0,
        '互斥依赖当前维度与判定规则。对象可有其他维度标签，但在当前主分类中不能重复计数，因此主类与次标签必须分开记录。',
        '事实与定义',
      ),
      question(
        '“其他”类占比很高时，最合理的解释是什么？',
        '当前分类可能遗漏重要类别或判定规则不清，需要重新查看数据',
        ['说明分类已经完美', '说明所有对象都不重要', '应删除其他类让总数变小'],
        1,
        '其他类膨胀常提示遗漏或定义过窄。应抽取未分类项，调整维度或增加可行动类别，而不是隐藏，更不能把无法判断的对象强行分入近似类。',
        '材料与推导',
      ),
      question(
        '哪种分类树最可能违反 MECE？',
        '同一层同时并列渠道、年龄和流失原因，且类别可重叠',
        ['同一层只按流程阶段分类', '为缺失数据设置未知类', '记录多重标签但不重复计数'],
        2,
        '混用维度会让对象无法唯一归类，重叠和遗漏难以检查。多维度应分层分析，而不是堆在同一层，也不能用更多分支掩盖定义冲突。',
        '常见误区',
      ),
      question(
        '把 MECE 迁移到项目管理任务清单时，哪种做法最稳妥？',
        '先按阶段分类并定义完成判定，再另表记录负责人和优先级',
        ['把阶段、负责人、优先级混成一个树', '无法分类的任务直接删掉', '只追求每层四个节点'],
        0,
        '任务主分类与属性可以分层管理。单维主树便于统计，其他维度作为标签，不强迫一个分类回答所有问题，也保留跨维度筛选能力。',
        '迁移应用',
      ),
    ],
  },
  'thinking:决策矩阵：权重从哪里来': {
    contentStatus: 'reviewed',
    prerequisite: '能区分目标、标准和方案，会计算加权平均与简单敏感性变化。',
    plainLanguageGoal:
      '学完后，你能为 3 个方案建立决策矩阵，说明权重的价值来源，并用敏感性分析揭示排序是否稳定。',
    guidedPractice:
      '为 3 个供应商建立 5 项标准和权重，完成评分、加权总分、硬约束过滤和至少三组权重变化。',
    independentPractice:
      '选一个真实选择，访谈两类利益相关者确定权重，做敏感性分析并写出矩阵不能替代的价值判断。',
    commonErrors: [
      '先给权重再找理由，没有说明权重来自哪些目标和利益相关者。',
      '把不同单位直接相加，或评分方向没有统一。',
      '只报一个加权总分，不做权重变化和硬约束检查。',
    ],
    sourceRefs: MATRIX_SOURCES,
    studyPoints: [
      point('必背', '权重来自目标与价值权衡，评分要有尺度；加权总分必须配合硬约束和敏感性分析。', 1),
      point('重点', '矩阵先统一标准方向与单位，再做归一化或明确评分规则，避免不同量纲直接相加。', 2),
      point('易错', '第一名只是当前权重下的结果，不是客观最优；权重小改动导致翻转时要保留取舍而非强行定论。', 4),
    ],
    eventDetails: [MATRIX_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜总分最高的方案真的更值得选吗',
        body:
          '给出三个供应商方案和一张临时矩阵：价格、速度、质量、风险四项，权重看似随意。先做前测，要求检查标准方向、评分尺度、权重来源、硬约束和总分。记录是否把低价自动当高分、是否把百分比和天数直接相加、是否只看排名。加入反例：某供应商价格最低但不符合数据合规硬约束，加权高分也不能让它入选。后测要求重新设计矩阵，并注明权重由谁和哪个目标决定。',
        note: '先过硬约束，再比较取舍。',
        objective: '能用尺度、方向、权重来源、硬约束和敏感性诊断一张决策矩阵。',
        practice: '完成供应商矩阵前测，标出两个量纲问题、两个权重疑点和一个硬约束反例。',
        checkpoint: '检查评分方向是否一致，权重是否有来源，硬约束是否先过滤，结论是否只有单一分数。',
      },
      {
        title: '材料与概念｜方案、标准、权重与评分',
        body:
          '决策矩阵把方案与标准列成表，按统一尺度评分，再用权重表达不同目标的相对重要性。权重不是数据自动给出的常数，而来自决策目标、利益相关者价值、风险偏好和约束；应写明来源与争议。评分需说明 1 至 5 分各代表什么，成本类标准应先转换方向或使用成本变量。硬约束如安全、合规和预算底线应先过滤，不能靠高分享补偿。加权和透明但会压缩复杂价值，结果必须配合敏感性分析。',
        note: '权重是一个可辩论判断。',
        objective: '能解释方案、标准、权重、评分、硬约束和加权总分的含义与限制。',
        practice: '为一个选择写四项标准、评分锚点、权重来源和一个不可补偿硬约束。',
        checkpoint: '检查标准是否独立，评分可复现，权重来源清楚，硬约束没有混入加权补偿。',
      },
      {
        title: '示范与推导｜从权重变化看排序稳定性',
        body:
          '假设方案 A 当前总分 4.1，方案 B 为 4.0。示范先检查评分与权重，再把质量权重从 0.3 调到 0.4，观察排序是否翻转；随后提高风险权重做第二轮。若小改动就翻转，结论应写成“在质量优先下 A 较高，在风险优先下 B 较高”，而不是宣布某方案客观第一。再检查一个硬约束：若 A 不满足，总分比较停止。推导要保留原始评分、公式、变化前后权重和翻转阈值。',
        note: '排序翻转是信息，不是失败。',
        objective: '能用权重变化定位排序翻转，并把结果写成条件化取舍。',
        practice: '为一个矩阵计算原始总分，完成三组权重变化并记录翻转条件。',
        checkpoint: '检查计算与评分一致，变化只改权重，翻转结论没有被写成绝对最优。',
      },
      {
        title: '引导练习｜三方案五项标准的矩阵',
        body:
          '为三个供应商建立五项标准，先做前测确定评分锚点和权重来源，再完成即时后测计算。先过滤硬约束，再算加权总分；随后分别给成本、质量和风险权重加减 0.1，观察排序。记录量纲错误、权重来源缺失、硬约束遗漏和敏感变化四类问题。第二轮由同伴只凭评分锚点复算一项，检查可复现性。若别人复算结果不同，先修规则再加新标准。',
        note: '别人能复算才算透明。',
        objective: '能独立建立可复算矩阵，完成硬约束、加权和敏感性与同伴复核。',
        practice: '提交三方案矩阵、五项评分锚点、权重来源、硬约束、三组敏感性和复核记录。',
        checkpoint: '检查量纲统一，评分可复算，权重可解释，硬约束优先，排序翻转被如实报告。',
      },
      {
        title: '独立迁移与评价｜把价值分歧留在矩阵里',
        body:
          '选择真实工作或学习决策，访谈两类利益相关者，分别确定权重并记录分歧。先做前测列出目标和标准，再建立矩阵，完成敏感性与一个不可补偿约束。24 小时后用新信息更新一项评分。评价四项：标准完整、权重有据、计算透明、取舍清楚。最后写矩阵不能替谁决定什么，例如预算底线不能由高总分抵消。决策矩阵的作用是让价值判断可见，而不是用数字消灭争议。',
        note: '数字不能替代责任与价值判断。',
        objective: '能把决策矩阵迁移到多方真实选择，并保留权重分歧、敏感性和不可补偿边界。',
        practice: '提交两类权重、矩阵计算、24 小时更新、敏感性结论和矩阵不能替代的判断。',
        checkpoint: '四项自评：标准完整、权重可辩、计算可复、边界明确；硬约束必须先于总分。',
      },
    ],
    quiz: [
      question(
        '决策矩阵中的权重最应该来自哪里？',
        '决策目标、利益相关者价值、风险偏好和约束的显式判断',
        ['随机分配后不再解释', '永远平均分配', '数值最大的方案自动获得高权重'],
        0,
        '权重表达价值取舍，不是数据自然产生的常数。写明来源和分歧，才能让矩阵可讨论、可调整，也能解释最终责任属于决策者。',
        '事实与定义',
      ),
      question(
        '质量权重从 0.3 调到 0.4 后第一名翻转，最合理结论是什么？',
        '选择对权重敏感，应报告不同价值优先级下的条件化结果',
        ['原矩阵完全没有意义', '必须永远选择原来的第一名', '权重不能调整'],
        1,
        '敏感性分析揭示排序依赖价值判断。翻转不是计算失败，而是需要明确质量与风险等目标的取舍，并把结果写成条件结论。',
        '材料与推导',
      ),
      question(
        '哪种决策矩阵最容易产生误导？',
        '把安全合规硬约束放进加权分，让高分方案抵消底线违规',
        ['先过滤硬约束再比较', '统一评分锚点', '展示三组敏感性结果'],
        2,
        '不可补偿约束不能被其他分数抵消。安全、合规和预算底线应先作为通过条件，再比较剩余方案，避免高加权分掩盖不可接受风险。',
        '常见误区',
      ),
      question(
        '把矩阵迁移到学习方案选择时，哪种做法最完整？',
        '列成本、效果、时间和可持续性，说明权重来源并测试变化',
        ['只选价格最低', '只看宣传评价', '把所有标准混成一个形容词'],
        0,
        '学习选择涉及多个目标和不确定性。透明评分、权重和敏感性可帮助比较，但仍需保留个人价值判断，并先排除时间或资质硬约束。',
        '迁移应用',
      ),
    ],
  },
};
