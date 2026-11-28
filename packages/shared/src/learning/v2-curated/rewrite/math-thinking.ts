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

const PROOF_ARCHIVE = {
  id: 'proof-direct-contrapositive-contradiction',
  kind: 'concept',
  title: '三种证明入口：假设从哪里开始',
  period: '学习阶段 01—06',
  summary:
    '直接证明从前提推向结论；逆否证明证明结论否定推出前提否定；反证假设目标不成立并推出矛盾。入口不同，但都必须写清定义、假设和结论。',
  background:
    '证明不是把例子写长。全称命题需要覆盖任意对象，存在命题需要构造实例；有限验证和图示只能提供线索。',
  timeline: [
    {
      date: '阶段 01',
      title: '先写清已知与目标',
      body: '把命题拆成前提 P 与结论 Q，定义每个符号和对象范围。证明开始时需要明确自己假设什么、要推出什么。',
      sourceIds: ['libretexts-logic-proof'],
    },
    {
      date: '阶段 02',
      title: '直接证明从 P 到 Q',
      body: '直接证明假定 P 成立，使用定义、已证定理和代数推导得到 Q。每一步都应说明依据，不能把目标当作前提。',
      sourceIds: ['libretexts-logic-proof', 'sep-proof-theory'],
    },
    {
      date: '阶段 03',
      title: '逆否证明改写蕴含',
      body: 'P→Q 与 ¬Q→¬P 逻辑等价。证明逆否时先假设结论不成立，推出前提不成立，适用于否定形式更易处理的情况。',
      sourceIds: ['libretexts-logic-proof', 'forallx'],
    },
    {
      date: '阶段 04',
      title: '反证假设目标不成立',
      body: '反证常假设整个结论为假，推导出与已知、定义或定理矛盾。反证不能只证明某个竞争结论错误，必须让否定目标本身导致矛盾。',
      sourceIds: ['sep-proof-theory'],
    },
    {
      date: '阶段 05',
      title: '全称与存在命题需要不同产物',
      body: '全称命题要处理任意对象并说明一般性；存在命题要给出构造或证明存在，反例则用于推翻全称命题。',
      sourceIds: ['forallx', 'libretexts-logic-proof'],
    },
    {
      date: '阶段 06',
      title: '反例与错误入口检查',
      body: '一个反例即可推翻全称命题，却不能证明它；用特例验证不能完成一般证明。检查入口是否真正匹配目标，是证明复核的核心。',
      sourceIds: ['libretexts-logic-proof'],
    },
  ],
  outcome:
    '可观察结果是能为一个命题选择直接、逆否或反证入口，写清假设、推导依据和最终结论。',
  significance:
    '证明训练把计算、定义和语言连接起来，形成可复核的数学论证。',
  sourceCards: [
    source(
      'libretexts-logic-proof',
      'Mathematical Logic and Proofs',
      'LibreTexts Mathematics',
      '2025 年访问版',
      'https://math.libretexts.org/Bookshelves/Mathematical_Logic_and_Proof',
      '核对直接证明、逆否、反证与量词。',
    ),
    source(
      'sep-proof-theory',
      'Proof Theory',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/proof-theory/',
      '核对证明结构、推理规则与反证。',
    ),
    source(
      'forallx',
      'forall x: Calgary',
      'Open Logic Project',
      '2025 年访问版',
      'https://forallx.openlogicproject.org/',
      '核对命题逻辑、量词与证明方法。',
    ),
    source(
      'euclid-elements',
      'Euclid’s Elements',
      'David E. Joyce',
      '2025 年访问版',
      'https://mathcs.clarku.edu/~djoyce/java/elements/elements.html',
      '核对定义、公设和经典几何证明。',
    ),
  ],
} satisfies LearningV2EventDetail;

const MODELING_ARCHIVE = {
  id: 'mathematical-modeling-variable-assumptions',
  kind: 'concept',
  title: '数学建模：变量不是把现实换个字母',
  period: '学习阶段 01—06',
  summary:
    '模型从目标和假设选择变量、单位、参数与关系，再用数据校准和验证。模型结论只在其条件和误差范围内成立。',
  background:
    '把每个现实因素都放进模型会不可计算，把所有因素都省略又会失真。变量选择要围绕问题目标、可测性、变化尺度和因果结构。',
  timeline: [
    {
      date: '阶段 01',
      title: '先定义问题和输出',
      body: '明确模型要回答什么、预测什么时间尺度、服务哪个决策。输出不同，需要的变量和精度也不同。',
      sourceIds: ['modsimpy'],
    },
    {
      date: '阶段 02',
      title: '区分变量、参数与常量',
      body: '变量随情境或时间变化，参数在单次模型运行中固定但可校准，常量由定义或物理条件决定。类别错误会让模型含义混乱。',
      sourceIds: ['modsimpy', 'sep-models-science'],
    },
    {
      date: '阶段 03',
      title: '写单位、范围和假设',
      body: '每个变量需有单位、可行范围和测量方式。假设要写成可检查条件，例如忽略迁移、资源无限或线性响应。',
      sourceIds: ['sep-models-science', 'openintro-statistics'],
    },
    {
      date: '阶段 04',
      title: '选择关系并估参数',
      body: '关系可来自机制、经验拟合或近似。参数估计需数据和不确定性，不能只挑让历史曲线最好看的数值。',
      sourceIds: ['modsimpy'],
    },
    {
      date: '阶段 05',
      title: '用独立数据验证',
      body: '训练数据拟合好不代表模型可预测。留出数据、反例和情景变式可检查外推、尺度和假设失效。',
      sourceIds: ['modsimpy', 'openintro-statistics'],
    },
    {
      date: '阶段 06',
      title: '报告边界与替代模型',
      body: '模型应说明误差、未纳入因素、参数敏感性和可替代解释。结论是条件下的近似，不是现实本身。',
      sourceIds: ['sep-models-science', 'openintro-statistics'],
    },
  ],
  outcome:
    '可观察结果是能写出变量表、单位、假设、关系、参数来源、验证数据和模型失效条件。',
  significance:
    '建模训练从现实问题抽象出可计算结构，同时保留误差、证据和决策边界。',
  sourceCards: [
    source(
      'modsimpy',
      'Modeling and Simulation in Python',
      'Allen B. Downey',
      '2025 年访问版',
      'https://allendowney.github.io/ModSimPy/',
      '核对变量、假设、模型构建和模拟验证。',
    ),
    source(
      'sep-models-science',
      'Models in Science',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/models-science/',
      '核对模型表征、理想化和适用边界。',
    ),
    source(
      'openintro-statistics',
      'OpenIntro Statistics',
      'OpenIntro',
      '2025 年访问版',
      'https://www.openintro.org/book/os/',
      '核对数据、参数估计和模型验证。',
    ),
    source(
      'mit-algorithms',
      'Introduction to Algorithms 6.006',
      'MIT OpenCourseWare',
      '2025 年访问版',
      'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/',
      '核对计算模型和效率分析。',
    ),
  ],
} satisfies LearningV2EventDetail;

const ALGORITHM_ARCHIVE = {
  id: 'algorithm-complexity-growth',
  kind: 'concept',
  title: '复杂度直觉：输入变大时工作怎样增长',
  period: '学习阶段 01—06',
  summary:
    '算法是一组有限、明确的步骤。复杂度描述运行时间或空间随输入规模增长的阶，不直接等于某台机器上的秒数。',
  background:
    '最坏、最好和平均情况回答不同问题。大 O 给上界，大 Θ 给同阶界，常数和低阶项在大规模增长中常被忽略但不能忽略小规模实现成本。',
  timeline: [
    {
      date: '阶段 01',
      title: '算法必须有明确输入输出',
      body: '步骤有限、无歧义，并对指定输入范围终止或明确允许不终止。伪代码省略语法，但不能省略控制流程。',
      sourceIds: ['mit-algorithms'],
    },
    {
      date: '阶段 02',
      title: '输入规模决定成本函数',
      body: '数组长度、图顶点数或数值位数都可成为规模 n。不同问题的 n 不同，比较复杂度前要先统一成本模型。',
      sourceIds: ['mit-algorithms', 'python-time-complexity'],
    },
    {
      date: '阶段 03',
      title: '最坏与最好回答不同问题',
      body: '最坏情况给保证，最好情况给下限，平均情况依赖输入分布。只报一个而不知道问题，会误导性能判断。',
      sourceIds: ['mit-algorithms'],
    },
    {
      date: '阶段 04',
      title: '大 O 描述渐近上界',
      body: 'O 表示存在常数与起点后增长不超过某函数阶。常数因子和低阶项在大 n 时次要，但实际实现仍需测量。',
      sourceIds: ['python-time-complexity', 'mit-algorithms'],
    },
    {
      date: '阶段 05',
      title: '递归要写递推并求增长',
      body: '递归算法的成本由子问题数量、规模和合并成本决定。错误递推会把指数算法误判为线性算法。',
      sourceIds: ['mit-algorithms'],
    },
    {
      date: '阶段 06',
      title: '复杂度需实验和反例校验',
      body: '数循环可估主导项，但库函数和数据结构操作成本不同。实验应跨多个输入规模，检查增长曲线而非单点秒数。',
      sourceIds: ['python-time-complexity', 'mit-algorithms'],
    },
  ],
  outcome:
    '可观察结果是能计算简单代码的操作次数，写出复杂度，并用多规模运行数据验证增长趋势。',
  significance:
    '算法思维训练从输入、步骤和资源限制评价解法，为编程与算法课程提供数学基础。',
  sourceCards: [
    source(
      'mit-algorithms',
      'Introduction to Algorithms 6.006',
      'MIT OpenCourseWare',
      '2025 年访问版',
      'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/',
      '核对算法、数据结构、递归与复杂度。',
    ),
    source(
      'python-time-complexity',
      'TimeComplexity',
      'Python Wiki',
      '2025 年访问版',
      'https://wiki.python.org/moin/TimeComplexity',
      '核对常见容器操作的平均与最坏成本。',
    ),
    source(
      'clrs',
      'Introduction to Algorithms',
      'Cormen et al., MIT Press',
      '2022',
      'https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/',
      '核对算法分析与渐近记号教材定义。',
    ),
    source(
      'openintro-statistics',
      'OpenIntro Statistics',
      'OpenIntro',
      '2025 年访问版',
      'https://www.openintro.org/book/os/',
      '核对多规模数据、趋势和实验解释。',
    ),
  ],
} satisfies LearningV2EventDetail;

const HISTORY_ARCHIVE = {
  id: 'history-mathematical-structures',
  kind: 'concept',
  title: '数学史的结构变化：符号、公理、无穷与计算',
  period: '古代—20 世纪',
  summary:
    '数学史不只是人物年表，而是问题、符号、公理和证明标准的变化。非欧几何、抽象代数、集合论与可计算性改变了“数学对象是什么”的理解。',
  background:
    '历史材料需要区分原始文本、后世解释和现代术语。用今天的符号重写古代方法可帮助理解，但不能把现代概念直接当作当时已完整存在。',
  timeline: [
    {
      date: '古代',
      title: '几何与数值方法承担不同问题',
      body: '不同文明发展计数、测量、方程与几何构造。原始材料的符号和表达方式与现代代数不同，解释时要保留语境。',
      sourceIds: ['euclid-elements', 'mactutor-alkhwarizmi'],
    },
    {
      date: '9 世纪',
      title: '代数方法被系统整理',
      body: 'Al-Khwarizmi 的著作用文字和几何方式处理方程。后世看到公式化代数，但当时尚未使用现代符号系统。',
      sourceIds: ['mactutor-alkhwarizmi'],
    },
    {
      date: '17—18 世纪',
      title: '符号化推动代数与微积分',
      body: '符号体系提高运算与一般化能力，也让新对象与规则出现。符号便利同时带来基础问题，需要后来重新解释。',
      sourceIds: ['mactutor-non-euclidean', 'sep-proof-theory'],
    },
    {
      date: '19 世纪',
      title: '非欧几何改变公理角色',
      body: '平行公设并非唯一选择，替换公理可得到不同几何。公理不再只是描述唯一空间的显然真理，也是定义形式系统的条件。',
      sourceIds: ['mactutor-non-euclidean'],
    },
    {
      date: '19 世纪末—20 世纪',
      title: '集合、结构与基础危机进入中心',
      body: '集合论扩展无穷与数学对象语言，也产生悖论和基础争论。抽象代数、拓扑和逻辑把“结构关系”置于研究对象中心。',
      sourceIds: ['sep-proof-theory'],
    },
    {
      date: '20 世纪',
      title: '可计算性连接逻辑与机器',
      body: '形式系统和算法概念让“可证明”“可计算”成为研究对象。数学史的结构变化从此也包含计算模型、复杂性和机器实现。',
      sourceIds: ['mit-algorithms', 'sep-proof-theory'],
    },
  ],
  outcome:
    '可观察结果是能围绕一个结构变化写出旧问题、新工具、证明标准、影响和历史证据，而不是只列年代。',
  significance:
    '结构史帮助理解数学概念为何变化，并提醒现代符号和历史语境之间的差异。',
  sourceCards: [
    source(
      'mactutor-non-euclidean',
      'Non-Euclidean Geometry',
      'MacTutor History of Mathematics',
      '2025 年访问版',
      'https://mathshistory.st-andrews.ac.uk/HistTopics/Non-Euclidean_geometry/',
      '核对平行公设、非欧几何与公理观念变化。',
    ),
    source(
      'mactutor-alkhwarizmi',
      'Al-Khwarizmi Biography',
      'MacTutor History of Mathematics',
      '2025 年访问版',
      'https://mathshistory.st-andrews.ac.uk/Biographies/Al-Khwarizmi/',
      '核对代数方法与历史语境。',
    ),
    source(
      'sep-proof-theory',
      'Proof Theory',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/proof-theory/',
      '核对形式系统、证明与基础研究。',
    ),
    source(
      'euclid-elements',
      'Euclid’s Elements',
      'David E. Joyce',
      '2025 年访问版',
      'https://mathcs.clarku.edu/~djoyce/java/elements/elements.html',
      '核对古代公设、定义与几何结构。',
    ),
    source(
      'mit-algorithms',
      'Introduction to Algorithms 6.006',
      'MIT OpenCourseWare',
      '2025 年访问版',
      'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/',
      '核对可计算过程、形式算法与复杂度分析。',
    ),
  ],
} satisfies LearningV2EventDetail;

const PROOF_SOURCES = [
  'LibreTexts, Mathematical Logic and Proofs。https://math.libretexts.org/Bookshelves/Mathematical_Logic_and_Proof',
  'Stanford Encyclopedia of Philosophy, Proof Theory。https://plato.stanford.edu/entries/proof-theory/',
  'forall x: Calgary。https://forallx.openlogicproject.org/',
  'Euclid’s Elements。https://mathcs.clarku.edu/~djoyce/java/elements/elements.html',
];

const MODELING_SOURCES = [
  'Allen B. Downey, Modeling and Simulation in Python。https://allendowney.github.io/ModSimPy/',
  'Stanford Encyclopedia of Philosophy, Models in Science。https://plato.stanford.edu/entries/models-science/',
  'OpenIntro Statistics。https://www.openintro.org/book/os/',
  'MIT OpenCourseWare, Introduction to Algorithms 6.006。https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/',
];

const ALGORITHM_SOURCES = [
  'MIT OpenCourseWare, Introduction to Algorithms 6.006。https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/',
  'Python Wiki, TimeComplexity。https://wiki.python.org/moin/TimeComplexity',
  'Cormen et al., Introduction to Algorithms, MIT Press。https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/',
  'OpenIntro Statistics。https://www.openintro.org/book/os/',
];

const HISTORY_SOURCES = [
  'MacTutor, Non-Euclidean Geometry。https://mathshistory.st-andrews.ac.uk/HistTopics/Non-Euclidean_geometry/',
  'MacTutor, Al-Khwarizmi。https://mathshistory.st-andrews.ac.uk/Biographies/Al-Khwarizmi/',
  'Stanford Encyclopedia of Philosophy, Proof Theory。https://plato.stanford.edu/entries/proof-theory/',
  'Euclid’s Elements。https://mathcs.clarku.edu/~djoyce/java/elements/elements.html',
];

export const MATH_THINKING_REWRITE: CuratedCoursePlanPatchMap = {
  'math:数学证明的三种入口': {
    contentStatus: 'reviewed',
    prerequisite: '能识别命题条件与结论，会使用偶数和整除定义。',
    plainLanguageGoal:
      '学完后，你能为命题选择直接、逆否或反证入口，写清假设与依据，并区分证明与反例。',
    guidedPractice:
      '分析 12 个命题，选择证明入口，写假设、目标、关键定义和一个反例或错误入口。',
    independentPractice:
      '为三个不同命题分别使用直接、逆否和反证证明，并用一个反例检查全称范围。',
    commonErrors: [
      '用几个例子验证后宣称证明了全称命题。',
      '逆否证明没有先否定结论，直接从错误假设出发。',
      '反证中证明了另一个结论矛盾，却没有让目标否定产生矛盾。',
    ],
    sourceRefs: PROOF_SOURCES,
    studyPoints: [
      point('必背', '直接证明从前提推结论，逆否证明证 ¬Q→¬P，反证假设目标不成立并推出矛盾。', 1),
      point('重点', '全称命题要处理任意对象，存在命题要构造实例，一个反例即可推翻全称命题。', 2),
      point('易错', '例子和图示只能提供线索，不能代替一般证明；反证必须让否定目标导致矛盾。', 4),
    ],
    eventDetails: [PROOF_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜举了十个例子为什么还不算证明',
        body:
          '给出命题“任意两个偶数之和为偶数”。先做前测让学习者举三个例子并写证明。记录是否只说“都是偶数”、是否用 2m+2n 推导、是否知道反例可推翻全称。变式加入负偶数和零，检查定义范围。反例检查：若有人只验证个位数，是否能保证所有整数？后测把例子、定义和一般推导分栏，并要求指出每个例子只覆盖了什么范围。',
        note: '例子是线索，定义给一般性。',
        objective: '能用定义、例子和反例前测区分特例验证与一般证明。',
        practice: '为三个命题各写两个例子、一个定义展开和一句为什么例子不足以证明。',
        checkpoint: '检查是否使用任意对象，定义范围是否包含负数或零，是否把反例与证明分开。',
      },
      {
        title: '材料与概念｜直接、逆否与反证',
        body:
          '直接证明假设 P 并推出 Q；逆否证明利用 P→Q 与 ¬Q→¬P 等价，假设 Q 假推出 P 假；反证通常假设目标不成立，推出与定义、已知或定理矛盾。三种方法都必须写清命题、前提、目标和依据。全称命题处理任意对象，存在命题需构造或证明存在。证明中的代数步骤要可逆或明确说明等价条件。',
        note: '入口不同，逻辑目标相同。',
        objective: '能准确解释直接、逆否、反证、全称与存在命题的证明要求。',
        practice: '为同一命题写直接与逆否的起手式、目标和假设，并说明反证应否定什么。',
        checkpoint: '检查假设与目标匹配，逆否方向正确，反证否定的是目标而非无关结论。',
      },
      {
        title: '示范与推导｜从偶数定义证明和的偶数性',
        body:
          '设 a、b 为任意偶数，则存在整数 m、n 使 a=2m、b=2n。于是 a+b=2m+2n=2(m+n)，而 m+n 为整数，所以 a+b 为偶数。反例检查负数同样成立，因为整数定义没有限制正负。再用逆否证明变式“若 3n+2 为奇数，则 n 为奇数”：假设 n 为偶数，n=2k，得 3n+2=6k+2=2(3k+1)，与目标奇数矛盾。',
        note: '每步都引用定义或代数。',
        objective: '能完成一个直接证明，并为一个逆否证明写正确起手式。',
        practice: '完成偶数和直接证明、3n+2 逆否证明和两个错误入口反例。',
        checkpoint: '检查定义展开、整数集合闭合、结论一般性，以及逆否假设与目标是否正确。',
      },
      {
        title: '引导练习｜十二个命题的入口选择',
        body:
          '准备十二个命题，覆盖直接整除、逆否条件、反证、全称和存在。每题先做前测写 P、Q、假设和目标，再选择入口，最后写证明或构造反例。后测由同伴只检查入口与依据，不看结论是否熟悉。变式把全称改为存在或加入范围限制，观察证明是否仍成立。记录特例代替证明、逆否方向、反证目标和定义缺失四类错误。',
        note: '入口错了，计算再顺也无效。',
        objective: '能对十二个命题选择正确证明入口，并写出可检查的假设与依据。',
        practice: '提交十二张证明计划、三类完整证明、一个反例和口选择错误记录。',
        checkpoint: '检查 P/Q 分解、逆否与反证假设、定义使用、一般性和反例身份。',
      },
      {
        title: '独立迁移与评价｜为一组命题写证明组合',
        body:
          '选择三个命题，分别使用直接、逆否和反证。先做前测写入口理由，再完成证明，最后让同伴寻找隐藏前提或反例。24 小时后改变量词或范围做变式。评价四项：入口正确、定义充分、推导完整、一般性成立。最后写一个“例子很多但存在反例”的全称命题。证明的目标不是让文字看起来严谨，而是让他人能复核每一步。',
        note: '证明要能经受反例审查。',
        objective: '能独立完成三种证明，并用反例、量词变化和同伴复核评价一般性。',
        practice: '提交三类证明、24 小时量词变式、隐藏前提清单、反例和四项自评。',
        checkpoint: '四项自评：入口匹配、定义明确、步骤有据、结论一般；任一空缺都需补证。',
      },
    ],
    quiz: [
      question(
        '证明 P→Q 的逆否命题应证明什么？',
        '¬Q→¬P',
        ['P→¬Q', 'Q→P', '¬P→Q'],
        0,
        'P→Q 与逆否命题 ¬Q→¬P 等价。证明时应假设结论 Q 不成立，推出前提 P 不成立；不能把条件方向原样保留。',
        '事实与定义',
      ),
      question(
        '一个全称命题已经验证了十个例子，为什么仍可能有反例？',
        '全称命题覆盖所有对象，有限例子不能排除未检查情形',
        ['因为例子数量必须是一百', '因为全称命题永远错误', '因为定义不允许例子'],
        1,
        '有限验证只能增加线索，不能构成全称证明。需要一般定义和推导，且一个反例即可推翻，即使已经验证很多例子。',
        '材料与推导',
      ),
      question(
        '反证证明中最常见的入口错误是什么？',
        '没有假设目标不成立，却推出一个无关结论矛盾',
        ['先写出已知定义', '假设结论不成立', '最后声明矛盾'],
        2,
        '反证必须让否定目标的假设与已知、定义或定理冲突。只证明另一个说法错误，不能推出原目标成立，也不能把无关矛盾算作证明。',
        '常见误区',
      ),
      question(
        '把证明思维迁移到程序正确性时，哪种做法最合适？',
        '写清前置条件、后置条件和每步不变量，并用反例测试边界',
        ['运行一个成功用例即可', '忽略输入范围', '把异常当作不存在'],
        0,
        '程序论证也需要前提、目标和可检查步骤。反例测试能暴露不变量或边界假设错误，并帮助确认输入范围是否写对。',
        '迁移应用',
      ),
    ],
  },
  'math:建模：现实问题的变量选择': {
    contentStatus: 'reviewed',
    prerequisite: '能写函数关系、单位换算，并读取基本数据表。',
    plainLanguageGoal:
      '学完后，你能为一个现实问题定义变量、单位、参数和假设，建立可计算关系，并用独立数据验证。',
    guidedPractice:
      '为排队、增长或资源问题建立变量表、假设表、关系式、参数来源和验证数据。',
    independentPractice:
      '为一个真实决策建立简化模型，比较两种假设下的预测，并用留出数据检查误差。',
    commonErrors: [
      '变量没有单位和范围，导致不同量纲直接相加。',
      '把参数当常量或把无法测量的因素塞进变量表。',
      '只追求拟合历史数据，不用独立数据检验外推。',
    ],
    sourceRefs: MODELING_SOURCES,
    studyPoints: [
      point('必背', '模型由变量、参数、假设、单位、关系和验证组成；结论只在条件和误差范围内成立。', 1),
      point('重点', '变量按目标选择并记录可测性、范围与单位；参数可在不同情景中校准。', 2),
      point('易错', '拟合历史数据不等于可预测，模型必须用独立数据和反例检查。', 4),
    ],
    eventDetails: [MODELING_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜变量越多模型越真实吗',
        body:
          '给出一个配送时间问题，要求先做前测列出可能变量：距离、交通、天气、司机、订单数量等。记录是否把所有因素都塞进模型、是否有单位和可测范围、是否定义预测目标。变式把决策从“预测平均时间”改为“保证最晚送达”，变量和模型目标随之变化。反例是把司机心情等不可测因素直接放进公式，模型无法验证。后测要删去至少两个低价值变量并说明理由。',
        note: '变量选择由目标和证据驱动。',
        objective: '能用目标、可测性、单位、范围和验证前测筛选建模变量。',
        practice: '完成配送问题前测，列出 8 个候选变量、单位、可测性和保留/删除理由。',
        checkpoint: '检查目标明确，变量有单位与范围，是否删除不可测或与决策无关因素。',
      },
      {
        title: '材料与概念｜变量、参数、常量与假设',
        body:
          '变量随情境或时间变化，参数在一次模型运行中通常固定但可校准，常量由定义或环境条件决定。每个变量要有单位、范围和测量方式；每个假设要说明简化了什么，以及可能怎样影响结果。模型关系可来自机制、守恒、经验或近似。数据用于估参和验证，但不能自动决定因果结构。模型不是现实，而是为问题服务的可检验表征。',
        note: '假设是模型的一部分。',
        objective: '能解释变量、参数、常量、假设、关系、数据和验证的区别。',
        practice: '为一个排队模型写五类要素，并给每条假设一个可能的失效条件。',
        checkpoint: '检查变量可测，参数可校准，假设可检验，数据用途不被夸大。',
      },
      {
        title: '示范与推导｜从配送时间到可计算模型',
        body:
          '设总时间 T=行驶时间+等待与装卸时间，距离 d 与平均速度 v 可测，T_travel=d/v，等待时间用近期分时段均值估计。假设忽略极端天气和交通事故，并把速度视为区间平均。参数来自历史数据并按高峰、平峰分组。反例是把全天平均速度用于晚高峰，误差会系统偏大。再用留出一周数据检验 MAE 和最大误差。',
        note: '模型先服务目标，再追求细节。',
        objective: '能围绕一个决策建立变量表、关系式、参数估计和验证指标。',
        practice: '完成配送模型的结构式、参数来源、两条假设、留出数据和误差指标。',
        checkpoint: '检查单位和量纲，参数分组，假设有失效条件，验证不是训练集拟合。',
      },
      {
        title: '引导练习｜三个模型的变量选择',
        body:
          '准备三个问题：资源增长、排队等待和考试成绩。每题先做前测画变量关系，再写变量/参数表、单位、范围、假设和关系。后测用一组留出数据比较预测，再改变一个参数做变式。记录单位混合、参数常量混淆、遗漏关键变量和过拟合四类问题。若删除变量后误差变化很小，应优先保留更简单模型，并说明简化可能丢失的解释。',
        note: '简化也要有证据。',
        objective: '能对三个现实问题完成变量选择、关系建模、参数变式和独立验证。',
        practice: '提交三张模型卡、三组留出预测、参数变式、误差和简化理由。',
        checkpoint: '检查每个变量有单位和范围，参数来源可追，验证独立，简化没有破坏关键关系。',
      },
      {
        title: '独立迁移与评价｜做一个可失败的模型',
        body:
          '选择一个真实决策，先做前测写目标、变量、参数和假设，再建立简化模型并做 24 小时数据检验。改变一个假设或参数做变式，报告区间和反例。评价四项：目标清楚、变量可测、模型可算、验证可失败。最后写一个模型不适用的场景，例如突发事件、制度变化或数据分布漂移，并说明哪项假设首先失效及其后果。',
        note: '能失败、能更新才算模型。',
        objective: '能把建模流程迁移到真实决策，并用独立数据、变式和失效条件评价。',
        practice: '提交模型规格、关系式、数据检验、24 小时变式、误差范围和不适用场景。',
        checkpoint: '四项自评：目标明确、变量可测、关系可算、验证独立；不能解释误差就需修模型。',
      },
    ],
    quiz: [
      question(
        '数学建模中变量最应先满足什么？',
        '与问题和决策相关，有明确单位、范围和测量方式',
        ['数量越多越好', '名字越复杂越专业', '不必记录单位'],
        0,
        '变量必须可测并服务目标。无关或不可测因素会增加复杂度，单位缺失会让关系失去意义，范围错误会让外推失真，变量名也不能替代定义。',
        '事实与定义',
      ),
      question(
        '参数与常量最合理的区别是什么？',
        '参数可在情景中校准或改变，常量由定义或环境条件固定',
        ['参数永远是未知数', '常量一定可以随意改', '两者完全同义'],
        1,
        '参数用于描述可调机制，常量是当前模型固定条件。区分它们有助于敏感性分析和验证，也能说明哪些结论依赖估计值而非固定事实。',
        '材料与推导',
      ),
      question(
        '哪种模型评价最不可靠？',
        '只在训练数据上拟合得很好，不看留出数据、误差和假设失效',
        ['用独立数据验证', '报告参数敏感性', '列出模型不适用场景'],
        2,
        '历史拟合可能来自过拟合。独立验证、误差和边界才能判断模型能否外推，训练集上的高分不能替代留出测试和误差报告。',
        '常见误区',
      ),
      question(
        '把建模迁移到业务预测时，哪种做法最完整？',
        '定义目标和单位，列假设与参数，使用时间外验证并保留误差范围',
        ['只追求最高准确率', '忽略数据漂移', '删除预测错的时期'],
        0,
        '业务预测需要目标、假设和外推验证。时间外样本能暴露分布变化，误差范围支持决策，数据漂移必须被记录并触发再校准。',
        '迁移应用',
      ),
    ],
  },
  'math:算法思维与复杂度直觉': {
    contentStatus: 'reviewed',
    prerequisite: '会读伪代码、循环和简单递归，理解对数与指数增长。',
    plainLanguageGoal:
      '学完后，你能计算简单算法的操作次数，区分最好、最坏和平均情况，并用多规模数据验证增长阶。',
    guidedPractice:
      '分析 8 段伪代码，写出输入规模、主导循环、最好/最坏操作数和渐近复杂度。',
    independentPractice:
      '实现或伪写线性查找、二分查找和嵌套循环，用多规模数据验证增长曲线。',
    commonErrors: [
      '把算法运行秒数直接当复杂度，忽略机器与实现。',
      '只报最坏情况或只报平均情况，不说明问题。',
      '看到一层循环就判 O(n)，忽略循环范围、递归和数据结构操作。',
    ],
    sourceRefs: ALGORITHM_SOURCES,
    studyPoints: [
      point('必背', '复杂度描述运行时间或空间随输入规模增长的阶；大 O 是上界，不直接等于秒数。', 1),
      point('重点', '最好、最坏和平均情况回答不同问题，平均情况依赖输入分布。', 2),
      point('易错', '一层循环不必然 O(n)，嵌套也不必然 O(n²)，要看每层范围和递归成本。', 4),
    ],
    eventDetails: [ALGORITHM_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜十秒和 O(n)哪个信息更有用',
        body:
          '给出两段查找代码及不同 n 的运行时间。先做前测让学习者判断哪个增长更快，并写输入规模和最坏情况。记录是否用单次秒数比较、是否忽略排序成本、是否把平均情况当保证。变式让 n 从 100 增到 1,000,000，观察复杂度差异。反例是二分查找更快但前提数组已排序，忽略预处理会误判整个任务成本。',
        note: '先统一输入规模和成本模型。',
        objective: '能用输入规模、最坏情况、预处理和运行数据诊断复杂度比较。',
        practice: '完成两算法前测，写输入规模、最坏操作、预处理和一条误判反例。',
        checkpoint: '检查是否区分秒数与增长阶，是否说明输入规模、数据分布、排序前提和最坏情况。',
      },
      {
        title: '材料与概念｜算法、输入规模与渐近增长',
        body:
          '算法是有限、明确、对指定输入终止的步骤集合。复杂度分析把基本操作数写成输入规模 n 的函数。大 O 给渐近上界，大 Θ 给同阶界；常数与低阶项在渐近比较中忽略，但实际小规模仍需测量。最好情况给最少成本，最坏情况给保证，平均情况依赖输入概率。递归需列递推并考虑子问题数和合并成本。空间复杂度也按额外存储随 n 增长分析。',
        note: '复杂度是增长模型，不是秒表。',
        objective: '能解释算法、输入规模、最坏/最好/平均、渐进记号与空间成本。',
        practice: '为三段代码分别写输入规模、基本操作数、最好/最坏情况和空间成本。',
        checkpoint: '检查基本操作选择，循环范围，递归与空间，最好/最坏条件是否明确。',
      },
      {
        title: '示范与推导｜线性与二分查找',
        body:
          '线性查找最坏检查 n 个元素，时间复杂度 Θ(n)，不需要排序。二分查找每次把区间减半，最多约 log₂n 次比较，Θ(log n)，但要求有序数组。若把排序成本 O(n log n) 算入一次查询，单次二分不一定优于线性。反例是对未排序数组直接二分，结果错误，复杂度也无意义。因此必须报告前提和查询次数。',
        note: '复杂度要连同前提一起报告。',
        objective: '能比较线性与二分查找的时间、空间和预处理条件。',
        practice: '完成两算法最好/最坏比较、二分前提、预处理总成本和一次误用反例。',
        checkpoint: '检查 log 推导，最坏情况，排序前提，查询次数与预处理是否计入。',
      },
      {
        title: '引导练习｜八段伪代码的增长分析',
        body:
          '准备八段伪代码，覆盖单循环、双循环、三角循环、相邻循环、递归减半、递归树和哈希平均/最坏。每段先做前测算基本操作，再写 T(n)、最好/最坏和空间，后测用多规模操作计数或运行数据验证。变式改变循环上界或输入分布，观察主导项是否改变。记录只看嵌套、忽略提前退出、混淆平均最坏和漏空间四类错误。',
        note: '循环结构要具体计数。',
        objective: '能对八段算法完成操作计数、渐近复杂度和数据验证。',
        practice: '提交八张复杂度表、两段完整递推、多规模数据和四类错误统计。',
        checkpoint: '检查主导项、上下界、最好/最坏条件、空间和实验增长趋势。',
      },
      {
        title: '独立迁移与评价｜为真实任务选择算法',
        body:
          '选择一个搜索、排序或去重任务，先做前测定义 n、查询次数、数据结构与预处理，再比较两种算法的时间与空间。24 小时后改变数据规模做变式，检验选择是否翻转。评价四项：规模明确、成本完整、前提合规、验证有据。最后写一个复杂度更好但常数、内存或预处理不合适的小规模反例，并说明实际选择。',
        note: '渐近最优不等于所有场景最优。',
        objective: '能把复杂度分析迁移到真实任务，并用规模、前提和实验数据选择算法。',
        practice: '提交两算法成本表、24 小时规模变式、实验趋势、选择理由和反例。',
        checkpoint: '四项自评：规模清楚、成本完整、前提满足、数据支持；不能只看复杂度标签。',
      },
    ],
    quiz: [
      question(
        '算法复杂度主要描述什么？',
        '基本操作数或资源随输入规模增长的渐近趋势',
        ['某台机器上的固定秒数', '代码行数', '变量名字长度'],
        0,
        '复杂度是增长模型，不直接等于秒数。实现、硬件和常数会影响实际时间，但增长阶仍可比较，前提是输入规模定义一致。',
        '事实与定义',
      ),
      question(
        '二分查找 Θ(log n) 的前提是什么？',
        '数据已按可比较顺序排列，且能按索引访问中间元素',
        ['数据完全随机', '只能使用递归', 'n 必须为偶数'],
        1,
        '二分依赖有序性和可定位中点。未排序数据要先排序，排序成本也必须计入整体任务，查询次数越多预处理越值得。',
        '材料与推导',
      ),
      question(
        '哪种复杂度判断最草率？',
        '看到一层循环就直接判 O(n)，不看每轮操作和提前退出',
        ['计算循环执行次数', '区分最好和最坏情况', '把排序成本计入总任务'],
        2,
        '循环中的操作、范围和递归都影响总成本。必须数基本操作，而不是按代码形状贴标签，最好与最坏情况也要说明。',
        '常见误区',
      ),
      question(
        '把复杂度迁移到数据库查询时，哪种分析最完整？',
        '定义数据规模、索引与查询模式，并比较时间、空间和预处理成本',
        ['只看一次查询耗时', '忽略索引维护', '只报最好情况'],
        0,
        '数据库性能依赖数据分布和索引。查询、索引维护与存储共同构成成本，单次测试不足，规模变化可能改变最优选择。',
        '迁移应用',
      ),
    ],
  },
  'math:数学史上的结构变化': {
    contentStatus: 'reviewed',
    prerequisite: '具备基础几何、代数和证明概念，能阅读简史材料。',
    plainLanguageGoal:
      '学完后，你能围绕符号、公理、结构、几何、无穷和计算的变化，用原始材料与历史解释写出有证据的分析。',
    guidedPractice:
      '制作一条“旧问题—新工具—证明标准—影响”的结构变化时间线，包含 6 个节点和来源。',
    independentPractice:
      '选择一个结构变化专题，比较原始材料与现代解释，写 500 字分析并标明不能直接套用的现代概念。',
    commonErrors: [
      '只按年代列人物和发现，没有说明问题与证明标准怎样变化。',
      '用现代符号重写古代材料后，把现代概念当作当时已完整存在。',
      '把数学史写成单线进步，忽略并行传统、争议和失败路径。',
    ],
    sourceRefs: HISTORY_SOURCES,
    studyPoints: [
      point('必背', '数学史要分析符号、公理、证明标准和数学对象观念的变化，而不只是人物年表。', 1),
      point('重点', '原始文本、翻译和现代解释要分层；用现代符号重写时必须标注差异。', 2),
      point('易错', '数学变化不是单线进步，非欧几何与基础危机都包含竞争解释和旧问题重述。', 4),
    ],
    eventDetails: [HISTORY_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜数学史只是年代加人物吗',
        body:
          '给出一个非欧几何时间线和一段 Al-Khwarizmi 的材料描述。先做前测要求区分事实、后世解释和现代术语。记录是否只抄年代、是否把现代公式直接塞回古代、是否说明公理观念变化。变式把“非欧几何发现”改成“平行公设问题如何变化”，观察叙事从事件转为结构。反例是把历史争议写成一个人突然发明全部新数学。',
        note: '先问问题怎样变。',
        objective: '能用原始材料、后世解释和现代术语前测诊断年表式数学史。',
        practice: '完成两个材料前测，各写事实、解释、现代术语和仍不确定之处。',
        checkpoint: '检查来源分层，年代不是唯一内容，现代公式没有被当作原始概念。',
      },
      {
        title: '材料与概念｜符号、公理、结构与证明标准',
        body:
          '数学结构变化可以从六个维度观察：问题对象、符号工具、公理地位、证明标准、抽象层次和应用计算。非欧几何改变公理角色；符号代数提高一般化；集合论扩展无穷；可计算性把算法纳入数学研究。原始文献与翻译版本可能有表达差异，现代教材的符号是重述。历史解释需要证据、语境和替代叙述，不能把所有变化归为单线进步。',
        note: '结构变化要写机制和证据。',
        objective: '能解释符号、公理、结构、证明标准、无穷和可计算性之间的历史变化。',
        practice: '为一个结构变化主题写六维表，标出原始证据和现代解释边界。',
        checkpoint: '检查六维有具体内容，证据来源清楚，现代概念与历史语境分开。',
      },
      {
        title: '示范与推导｜平行公设如何改变几何观',
        body:
          '旧问题是平行公设能否由其他公设证明；新几何表明替换公设可形成自洽系统，于是公理不再只是唯一现实空间的显然描述。示范时间线写出：欧氏公设、长期证明尝试、否定平行公设的模型、非欧几何接受和现代公理观。反例是只写“某年发现非欧几何”，没有说明问题、工具、证明标准和数学对象观念怎样变化。',
        note: '历史节点要连接问题变化。',
        objective: '能用问题—工具—证明标准—影响链条解释非欧几何的结构变化。',
        practice: '完成五个节点时间线，每节点写变化、证据、现代解释和仍存争议。',
        checkpoint: '检查节点有因果和材料，不是人物年表，现代术语均有边界说明。',
      },
      {
        title: '引导练习｜六节点结构史时间线',
        body:
          '选择一个主题，如符号代数、非欧几何、集合论或可计算性。先做前测列年代和人物，再改写成结构时间线，覆盖旧问题、新工具、证明标准、接受过程、影响和反例。后测用第二来源核对一个节点，并做变式改变叙事中心，例如从人物中心改为问题中心。记录年表化、现代回溯、单线和来源不足四类问题，并标明无法由现有材料证明的推断。',
        note: '换叙事中心会暴露结构。',
        objective: '能把年表改造成有证据的结构变化时间线，并用第二来源复核。',
        practice: '提交六节点时间线、第二来源核对、问题中心改写和四类错误记录。',
        checkpoint: '检查机制、语境、证据、争议和现代术语边界，时间线不只是一串日期。',
      },
      {
        title: '独立迁移与评价｜写一篇有证据的结构史分析',
        body:
          '选择一个结构变化专题，先做前测列原始问题和常见误解，再比较至少两份来源。24 小时后用另一份材料验证一个判断，检查证据是否支持同一结论。评价四项：问题清楚、证据可追、叙事非单线、现代解释有限定。最后写一个不能用现代概念直接套用的历史例子，并说明史料缺口。数学史不是装饰，而是理解数学对象和证明标准如何形成。',
        note: '历史解释要允许竞争叙述。',
        objective: '能把结构史方法迁移到独立专题，并用多来源、反例和现代概念边界评价。',
        practice: '提交 500 字结构史、两份来源、24 小时复核、竞争解释和一个现代回溯反例。',
        checkpoint: '四项自评：问题明确、证据可追、叙事多线、术语有限定；缺证据的断言必须降级。',
      },
    ],
    quiz: [
      question(
        '数学史中的“结构变化”最准确指什么？',
        '问题对象、符号、公理、证明标准或数学观念发生系统改变',
        ['只记录数学家出生年份', '只统计论文数量', '只背公式发明者名字'],
        0,
        '结构变化关注数学如何被理解和证明，而不只是人物年表。需要材料、语境和机制，并区分原始概念与现代重述，说明变化发生在哪一层。',
        '事实与定义',
      ),
      question(
        '非欧几何为什么改变了对公理的理解？',
        '替换平行公设仍可形成自洽几何，公理不再只描述唯一显然空间',
        ['因为欧氏几何被证明全错', '因为公理从此不需要证明', '因为所有几何都变成代数'],
        1,
        '非欧模型显示不同公理系统都可自洽，公理角色从显然真理转向系统定义条件，但不否定欧氏几何自身，只改变其唯一性地位和适用范围。',
        '材料与推导',
      ),
      question(
        '哪种数学史写法最不可靠？',
        '用现代符号重写古代材料后，直接说当时已有完整现代概念',
        ['区分原始材料与翻译', '标注现代术语差异', '比较竞争历史解释'],
        2,
        '现代重写可帮助理解，却不能抹去历史语境。必须说明翻译、符号和概念差异，并保留当时尚未解决的问题，不能把结果倒推为初衷。',
        '常见误区',
      ),
      question(
        '把结构史迁移到算法史时，哪种叙事最完整？',
        '说明问题规模、机器模型、可计算性和复杂度观念如何共同变化',
        ['只列计算机发明年份', '只记住某位人物', '把所有算法都归为同一时代'],
        0,
        '算法史涉及问题、模型、资源和证明标准。结构叙事能解释为什么同一算法在不同机器模型下意义不同，也避免单线发明史和人物神话。',
        '迁移应用',
      ),
    ],
  },
};
