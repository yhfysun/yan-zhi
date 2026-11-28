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

const NUMBER_ARCHIVE = {
  id: 'number-sense-estimation-model',
  kind: 'concept',
  title: '数感与估算：先判断大小，再决定要算多精确',
  period: '学习阶段 01—06',
  summary:
    '数感是对数量、位值、比例和结果合理性的敏感。估算用基准与相容数快速得到量级，再用误差和精确计算检验，而不是随意取整。',
  background:
    '估算题常见错误是每个数随便四舍五入后立即作答，没有检查方向与误差。可复现流程要写基准、近似式、误差范围和使用场景。',
  timeline: [
    {
      date: '阶段 01',
      title: '识别数量与位值',
      body: '先判断数字由哪些位值组成，例如 4,980 接近 5,000，19.8% 接近 20%。位值判断让数量级成为可解释信息。',
      sourceIds: ['openstax-whole-numbers'],
    },
    {
      date: '阶段 02',
      title: '选择基准与相容数',
      body: '基准是便于心算的参照，如 10%、25%、100。相容数使运算简单且误差可控；选择依据是题目精度，不是哪个数看起来整齐。',
      sourceIds: ['openstax-whole-numbers', 'openintro-statistics'],
    },
    {
      date: '阶段 03',
      title: '估算并保留方向',
      body: '把 49×21 估为 50×20=1000，并记录两个因数分别被上调、下调。方向信息能帮助判断实际结果大约高于还是低于估算。',
      sourceIds: ['openstax-whole-numbers'],
    },
    {
      date: '阶段 04',
      title: '用精确值或范围检验',
      body: '49×21=1029，与估算相差 29。误差要写成绝对差或相对差，并结合用途判断是否可接受，而不是只说“差不多”。',
      sourceIds: ['openintro-statistics'],
    },
    {
      date: '阶段 05',
      title: '把估算迁移到真实量',
      body: '预算、人口、浓度和科学计数法都需要先判断数量级。真实数据还要考虑单位和测量误差，估算不能替代需要精确结算的结果。',
      sourceIds: ['openintro-statistics', 'openstax-rational-representations'],
    },
    {
      date: '阶段 06',
      title: '保留反例与边界',
      body: '反例是估算看似合理但方向误差叠加，例如所有因数都向下取整。若误差影响决策，应提高精度或重新选择基准。',
      sourceIds: ['openstax-whole-numbers', 'openintro-statistics'],
    },
  ],
  outcome:
    '可观察结果是能为一个情境写出基准、近似计算、数量级、绝对误差和是否需要精确复算的判断。',
  significance:
    '数感把计算从照公式操作变成结果合理性检查，并为后续测量、统计和建模提供共同语言。',
  sourceCards: [
    source(
      'openstax-whole-numbers',
      '1.1 Introduction to Whole Numbers',
      'OpenStax Prealgebra 2e',
      '2025 年访问版',
      'https://openstax.org/books/prealgebra-2e/pages/1-1-introduction-to-whole-numbers',
      '核对位值、数轴、比较和取整基础。',
    ),
    source(
      'openintro-statistics',
      'OpenIntro Statistics',
      'OpenIntro',
      '2025 年访问版',
      'https://www.openintro.org/book/os/',
      '核对数值表示、误差与不确定性。',
    ),
    source(
      'openstax-rational-representations',
      '4.1 Visualize Fractions',
      'OpenStax Prealgebra 2e',
      '2025 年访问版',
      'https://openstax.org/books/prealgebra-2e/pages/4-1-visualize-fractions',
      '核对分数、整体与数轴表示，用于比较估算值。',
    ),
    source(
      'math-practice',
      'Mathematics Practice Standards',
      'Core Standards',
      '2025 年访问版',
      'https://www.thecorestandards.org/Math/Practice/',
      '核对解释、推理、建模和精确性等数学实践。',
    ),
  ],
} satisfies LearningV2EventDetail;

const FRACTION_ARCHIVE = {
  id: 'fraction-unit-and-operation-model',
  kind: 'concept',
  title: '分数：单位分数如何变成可运算的整体',
  period: '学习阶段 01—06',
  summary:
    '分数表示整体中的等份关系。单位分数是基本单位，等价分数保持同一数量，通分让分母一致，约分简化表示，四则运算各有不同含义。',
  background:
    '把分子分母分别相加是常见错误，因为它把不同大小的单位直接合并。可复现教学要同时使用面积、数轴和语言解释。',
  timeline: [
    {
      date: '阶段 01',
      title: '从等份定义单位分数',
      body: '把同一整体分成若干等份，其中一份是单位分数。分母描述份数，分子描述取了多少份；整体必须相同，份额才可直接比较。',
      sourceIds: ['openstax-visualize-fractions'],
    },
    {
      date: '阶段 02',
      title: '用等价分数保持数量',
      body: '同一块区域既可分为 2 份取 1 份，也可分为 4 份取 2 份。表示变化但数值相等，乘同一非零因子可生成等价分数。',
      sourceIds: ['openstax-visualize-fractions', 'openstax-multiply-fractions'],
    },
    {
      date: '阶段 03',
      title: '通分使单位一致',
      body: '1/2 与 1/3 的单位大小不同，不能直接把分子相加。通分把两者改为同分母的等份，再按同一单位合并。',
      sourceIds: ['openstax-visualize-fractions'],
    },
    {
      date: '阶段 04',
      title: '约分只改变表示',
      body: '约分把分子分母同除公因数，数值不变。约分不能把不同单位的分数随意通约；等式是否保持要看运算依据。',
      sourceIds: ['openstax-multiply-fractions'],
    },
    {
      date: '阶段 05',
      title: '除法表示包含多少个单位',
      body: '3/4 ÷ 1/2 可问“3/4 中有多少个 1/2”。乘以倒数来源于分数除法的等价变形，应与实际包含关系同时验证。',
      sourceIds: ['openstax-multiply-fractions'],
    },
    {
      date: '阶段 06',
      title: '用配方与反例核对',
      body: '把 2/3 杯配方按比例缩放到 3/2 倍，结果应可还原并符合数量级。反例是把 2/3+1/2 写成 3/5，明显小于其中一个加数。',
      sourceIds: ['openstax-visualize-fractions', 'openstax-multiply-fractions'],
    },
  ],
  outcome:
    '可观察结果是能用图形和数轴解释等价分数，完成四则运算，并通过代入、数量级或反例检查结果。',
  significance:
    '分数连接比例、除法和小数，是代数运算与真实测量的基础。',
  sourceCards: [
    source(
      'openstax-visualize-fractions',
      '4.1 Visualize Fractions',
      'OpenStax Prealgebra 2e',
      '2025 年访问版',
      'https://openstax.org/books/prealgebra-2e/pages/4-1-visualize-fractions',
      '核对单位分数、等价分数和整体表示。',
    ),
    source(
      'openstax-multiply-fractions',
      '4.2 Multiply and Divide Fractions',
      'OpenStax Prealgebra 2e',
      '2025 年访问版',
      'https://openstax.org/books/prealgebra-2e/pages/4-2-multiply-and-divide-fractions',
      '核对乘除、约分与倒数规则。',
    ),
    source(
      'openstax-elementary-algebra',
      'Elementary Algebra 2e',
      'OpenStax',
      '2025 年访问版',
      'https://openstax.org/details/books/elementary-algebra-2e',
      '核对比例、有理数与代数运算背景。',
    ),
    source(
      'openintro-statistics',
      'OpenIntro Statistics',
      'OpenIntro',
      '2025 年访问版',
      'https://www.openintro.org/book/os/',
      '核对分数、比例与概率表示的数值基础。',
    ),
  ],
} satisfies LearningV2EventDetail;

const EQUATION_ARCHIVE = {
  id: 'equation-balance-inverse-operations',
  kind: 'concept',
  title: '方程：未知量怎样被关系约束',
  period: '学习阶段 01—06',
  summary:
    '方程不是带字母的算式，而是对未知量与数量关系的约束。等式性质允许两边做同样合法运算，逆运算逐步隔离未知量，代入原式检验解。',
  background:
    '解题步骤若只记“移项变号”，容易忘记为何可以这样做。平衡模型和等式性质把操作理由显性化。',
  timeline: [
    {
      date: '阶段 01',
      title: '用未知量表示关系',
      body: '先定义未知量及单位，再把语言关系翻译成等式。例如总价等于单价乘数量再加固定费用，未知量不同，方程结构也不同。',
      sourceIds: ['openstax-equations-21'],
    },
    {
      date: '阶段 02',
      title: '把方程看成平衡约束',
      body: '等号表示两边数量相等。对一边加、减、乘或除非零数时，另一边必须做同样操作，等式才保持。',
      sourceIds: ['openstax-equations-21'],
    },
    {
      date: '阶段 03',
      title: '用逆运算隔离未知量',
      body: '3x+5=20 先减 5 再除以 3。每一步都由等式性质和逆运算驱动，不是符号位置改变带来的神秘规则。',
      sourceIds: ['openstax-equations-21'],
    },
    {
      date: '阶段 04',
      title: '变量在两边时合并同类项',
      body: '两边都有变量时，可通过等式性质把变量集中到一边、常数集中到另一边，再解出候选值。每一步仍应可逆或保持等价。',
      sourceIds: ['openstax-equations-23'],
    },
    {
      date: '阶段 05',
      title: '代入检验并解释解',
      body: '候选值代回原方程检查两边相等，还要回到情境检查单位、正负和范围。代数解不一定符合现实限制。',
      sourceIds: ['openstax-equations-21', 'openstax-equations-23'],
    },
    {
      date: '阶段 06',
      title: '用反例区分解与等价',
      body: '操作后得到候选值不代表过程一定等价。平方、乘零或忘记定义域可能引入伪解；反例代回原式能暴露问题。',
      sourceIds: ['openstax-equations-23'],
    },
  ],
  outcome:
    '可观察结果是能定义未知量、写出等式、按等式性质求解，并同时做代入检验和情境检验。',
  significance:
    '方程训练把语言、符号和约束连接起来，为函数、不等式和建模奠定基础。',
  sourceCards: [
    source(
      'openstax-equations-21',
      '2.1 Solve Equations Using the Subtraction and Addition Properties of Equality',
      'OpenStax Elementary Algebra 2e',
      '2025 年访问版',
      'https://openstax.org/books/elementary-algebra-2e/pages/2-1-solve-equations-using-the-subtraction-and-addition-properties-of-equality',
      '核对等式性质、逆运算与检验。',
    ),
    source(
      'openstax-equations-23',
      '2.3 Solve Equations with Variables and Constants on Both Sides',
      'OpenStax Elementary Algebra 2e',
      '2025 年访问版',
      'https://openstax.org/books/elementary-algebra-2e/pages/2-3-solve-equations-with-variables-and-constants-on-both-sides',
      '核对两边含变量方程的等价操作。',
    ),
    source(
      'mactutor-alkhwarizmi',
      'Al-Khwarizmi Biography',
      'MacTutor History of Mathematics',
      '2025 年访问版',
      'https://mathshistory.st-andrews.ac.uk/Biographies/Al-Khwarizmi/',
      '核对代数方法与历史背景。',
    ),
    source(
      'sep-proof-theory',
      'Proof Theory',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/proof-theory/',
      '核对推导步骤与证明结构。',
    ),
  ],
} satisfies LearningV2EventDetail;

const GEOMETRY_ARCHIVE = {
  id: 'euclid-construction-proof',
  kind: 'concept',
  title: '作图不等于证明：几何结论如何由已知推出',
  period: '学习阶段 01—06',
  summary:
    '几何作图给出构造对象，证明则说明构造为什么满足定义。完整证明要列已知、作法和依据，再把定义、公设和已证结论连成链条。',
  background:
    '欧几里得《几何原本》I.1 要求在给定线段上作等边三角形。圆规画弧提供交点，圆的定义提供等长半径，最后才能推出三边相等。',
  timeline: [
    {
      date: '阶段 01',
      title: '明确已知与所求',
      body: '给定线段 AB，要求构造等边三角形 ABC。已知对象、允许作图和目标结论必须先分开，避免边画边改目标。',
      sourceIds: ['euclid-i1'],
    },
    {
      date: '阶段 02',
      title: '执行允许的构造',
      body: '分别以 A、B 为圆心、AB 为半径作圆，取交点 C，连接 AC 与 BC。构造步骤每项都需有定义或公设支持。',
      sourceIds: ['euclid-i1'],
    },
    {
      date: '阶段 03',
      title: '由定义得到等量',
      body: 'C 在 A 为圆心的圆上，所以 AC=AB；C 在 B 为圆心的圆上，所以 BC=AB。这里依据是同一圆半径相等。',
      sourceIds: ['euclid-i1'],
    },
    {
      date: '阶段 04',
      title: '连接中间结论',
      body: 'AC=AB 且 BC=AB，由等于同量的量彼此相等可得 AC=BC，因此 AB=AC=BC，三角形满足等边定义。',
      sourceIds: ['euclid-i1', 'euclid-i2'],
    },
    {
      date: '阶段 05',
      title: '区分图、构造与证明',
      body: '图像可帮助观察，手画误差不能证明等长。证明必须说明为何对任意给定线段都成立，而不是只对这一张图碰巧成立。',
      sourceIds: ['euclid-i1', 'sep-proof-theory'],
    },
    {
      date: '阶段 06',
      title: '寻找缺失依据与反例',
      body: '若省略圆半径相等的依据，推导链断裂；若只测图得到三边近似相等，没有完成一般证明。反例检查要问哪些前提被悄悄使用。',
      sourceIds: ['sep-proof-theory', 'euclid-i2'],
    },
  ],
  outcome:
    '可观察结果是能把作图步骤、定义依据、中间结论和最终证明分开，并指出一个只靠图观察无法推出的结论。',
  significance:
    '几何证明训练从对象定义到一般结论的推理，也训练对图示证据边界的敏感。',
  sourceCards: [
    source(
      'euclid-i1',
      'Euclid’s Elements, Book I, Proposition 1',
      'Euclid, translated by David E. Joyce',
      '2025 年访问版',
      'https://mathcs.clarku.edu/~djoyce/java/elements/bookI/propI1.html',
      '核对等边三角形构造与证明步骤。',
    ),
    source(
      'euclid-i2',
      'Euclid’s Elements, Book I, Proposition 2',
      'Euclid, translated by David E. Joyce',
      '2025 年访问版',
      'https://mathcs.clarku.edu/~djoyce/java/elements/bookI/propI2.html',
      '核对构造证明对已知条件的依赖。',
    ),
    source(
      'sep-proof-theory',
      'Proof Theory',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/proof-theory/',
      '核对证明结构、推理规则与形式化。',
    ),
    source(
      'elements-index',
      'Euclid’s Elements',
      'David E. Joyce, Clark University',
      '2025 年访问版',
      'https://mathcs.clarku.edu/~djoyce/java/elements/elements.html',
      '核对公设、公理和几何命题结构。',
    ),
  ],
} satisfies LearningV2EventDetail;

const PROBABILITY_ARCHIVE = {
  id: 'probability-sample-space-model',
  kind: 'concept',
  title: '从游戏到模型：样本空间决定概率怎样算',
  period: '学习阶段 01—06',
  summary:
    '概率模型先列样本空间和事件，再说明等可能或赋予概率的依据。理论概率与长期频率可互相检查，但一次结果不能推翻模型。',
  background:
    '掷两枚骰子时常误以为 11 个和值等可能。实际样本空间有 36 个有序结果，不同和值包含的结果数不同。',
  timeline: [
    {
      date: '阶段 01',
      title: '列全样本空间',
      body: '两枚不同骰子的结果可写成 36 个有序对。样本空间必须覆盖所有可能结果，并明确骰子是否可区分。',
      sourceIds: ['openstax-probability-31'],
    },
    {
      date: '阶段 02',
      title: '用事件筛选结果',
      body: '事件“和为 7”包含 (1,6) 到 (6,1) 共 6 个结果。概率是事件结果在样本空间中的比例，前提是模型与等可能性成立。',
      sourceIds: ['openstax-probability-31'],
    },
    {
      date: '阶段 03',
      title: '区分理论概率与观察频率',
      body: '公平骰子的理论概率可计算，实际投掷频率会波动。频率接近理论值需要次数和条件，不能用一个结果判断模型真假。',
      sourceIds: ['openstax-probability-31', 'openintro-statistics'],
    },
    {
      date: '阶段 04',
      title: '检查独立与条件',
      body: '独立事件要求一个事件发生不改变另一个事件概率；互斥事件不能同时发生。独立与互斥不是同义词，需用定义和样本空间检查。',
      sourceIds: ['openstax-probability-32'],
    },
    {
      date: '阶段 05',
      title: '用模型解释长期频率',
      body: '大量重复下的相对频率可检验模型，但模型还依赖公平性、抽样和独立性假设。现实抽奖、诊断和游戏常不满足简单等可能条件。',
      sourceIds: ['sep-probability-interpretations', 'openintro-statistics'],
    },
    {
      date: '阶段 06',
      title: '保留反例与边界',
      body: '反例是骰子有偏或样本空间列错，使表面公式给出错误概率。模型必须写假设，并用数据、边界和替代解释复核。',
      sourceIds: ['openstax-probability-32', 'sep-probability-interpretations'],
    },
  ],
  outcome:
    '可观察结果是能列样本空间、定义事件、计算理论概率、比较频率并写出模型假设与反例。',
  significance:
    '概率训练把不确定性变成显式模型，同时保留随机波动、假设和数据之间的差别。',
  sourceCards: [
    source(
      'openstax-probability-31',
      '3.1 Terminology',
      'OpenStax Introductory Statistics 2e',
      '2025 年访问版',
      'https://openstax.org/books/introductory-statistics-2e/pages/3-1-terminology',
      '核对样本空间、事件、理论概率与频率。',
    ),
    source(
      'openstax-probability-32',
      '3.2 Independent and Mutually Exclusive Events',
      'OpenStax Introductory Statistics 2e',
      '2025 年访问版',
      'https://openstax.org/books/introductory-statistics-2e/pages/3-2-independent-and-mutually-exclusive-events',
      '核对独立、互斥与条件概率基础。',
    ),
    source(
      'sep-probability-interpretations',
      'Interpretations of Probability',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/probability-interpret/',
      '核对概率解释与模型假设。',
    ),
    source(
      'openintro-statistics',
      'OpenIntro Statistics',
      'OpenIntro',
      '2025 年访问版',
      'https://www.openintro.org/book/os/',
      '核对随机性、频率和模拟。',
    ),
  ],
} satisfies LearningV2EventDetail;

const NUMBER_SOURCES = [
  'OpenStax Prealgebra 2e, 1.1 Introduction to Whole Numbers。https://openstax.org/books/prealgebra-2e/pages/1-1-introduction-to-whole-numbers',
  'OpenIntro Statistics。https://www.openintro.org/book/os/',
  'OpenStax Prealgebra 2e, 4.1 Visualize Fractions。https://openstax.org/books/prealgebra-2e/pages/4-1-visualize-fractions',
  'Core Standards, Mathematics Practice Standards。https://www.thecorestandards.org/Math/Practice/',
];

const FRACTION_SOURCES = [
  'OpenStax Prealgebra 2e, 4.1 Visualize Fractions。https://openstax.org/books/prealgebra-2e/pages/4-1-visualize-fractions',
  'OpenStax Prealgebra 2e, 4.2 Multiply and Divide Fractions。https://openstax.org/books/prealgebra-2e/pages/4-2-multiply-and-divide-fractions',
  'OpenStax, Elementary Algebra 2e。https://openstax.org/details/books/elementary-algebra-2e',
  'OpenIntro Statistics。https://www.openintro.org/book/os/',
];

const EQUATION_SOURCES = [
  'OpenStax Elementary Algebra 2e, 2.1 Subtraction and Addition Properties of Equality。https://openstax.org/books/elementary-algebra-2e/pages/2-1-solve-equations-using-the-subtraction-and-addition-properties-of-equality',
  'OpenStax Elementary Algebra 2e, 2.3 Variables and Constants on Both Sides。https://openstax.org/books/elementary-algebra-2e/pages/2-3-solve-equations-with-variables-and-constants-on-both-sides',
  'MacTutor, Al-Khwarizmi。https://mathshistory.st-andrews.ac.uk/Biographies/Al-Khwarizmi/',
  'Stanford Encyclopedia of Philosophy, Proof Theory。https://plato.stanford.edu/entries/proof-theory/',
];

const GEOMETRY_SOURCES = [
  'Euclid, Elements, Book I, Proposition 1。https://mathcs.clarku.edu/~djoyce/java/elements/bookI/propI1.html',
  'Euclid, Elements, Book I, Proposition 2。https://mathcs.clarku.edu/~djoyce/java/elements/bookI/propI2.html',
  'Stanford Encyclopedia of Philosophy, Proof Theory。https://plato.stanford.edu/entries/proof-theory/',
  'Euclid’s Elements Index。https://mathcs.clarku.edu/~djoyce/java/elements/elements.html',
];

const PROBABILITY_SOURCES = [
  'OpenStax Introductory Statistics 2e, 3.1 Terminology。https://openstax.org/books/introductory-statistics-2e/pages/3-1-terminology',
  'OpenStax Introductory Statistics 2e, 3.2 Independent and Mutually Exclusive Events。https://openstax.org/books/introductory-statistics-2e/pages/3-2-independent-and-mutually-exclusive-events',
  'Stanford Encyclopedia of Philosophy, Interpretations of Probability。https://plato.stanford.edu/entries/probability-interpret/',
  'OpenIntro Statistics。https://www.openintro.org/book/os/',
];

export const MATH_FOUNDATIONS_REWRITE: CuratedCoursePlanPatchMap = {
  'math:数感与估算': {
    contentStatus: 'reviewed',
    prerequisite: '会读整数、小数和百分数，能在数轴上比较大小。',
    plainLanguageGoal:
      '学完后，你能选择基准与相容数估算，解释数量级和误差，并用精确计算或范围检验结果。',
    guidedPractice:
      '完成 10 道估算题，为每题写基准、近似式、估算值、精确值、绝对误差和是否需要复算。',
    independentPractice:
      '为购物预算、人口数据和一个科学量级任务分别估算，比较相对误差并写使用边界。',
    commonErrors: [
      '所有数都向同一方向取整，导致误差叠加而不自知。',
      '把估算值当精确答案用于结算或安全判断。',
      '只写“差不多”，没有给出误差或数量级。',
    ],
    sourceRefs: NUMBER_SOURCES,
    studyPoints: [
      point('必背', '估算要有基准、相容数、误差和精确复核；数量级先判断，精度再按用途决定。', 1),
      point('重点', '近似时记录取整方向和相对误差，反例可用精确值或上下界发现。', 2),
      point('易错', '估算不是随意取整；同向误差叠加可能让结果偏离决策所需精度。', 4),
    ],
    eventDetails: [NUMBER_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜先判断一万还是一百万',
        body:
          '先做前测：不计算精确值，判断 497×1,980 的数量级，并估算 19.8% 的 4,920。要求写出近似式和结果范围。记录是否直接列竖式、是否只会取整不解释、是否检查量级。变式可把 19.8% 改成 20.3%，观察估计是否移动。前测重点不是速度，而是能否说明用了什么基准、哪些数被放大或缩小，以及最终用于什么决策。',
        note: '先看数量级，再算数。',
        objective: '能用基准、近似式、数量级和精确值诊断估算过程。',
        practice: '完成三道前测，每题写近似式、估算值、精确值、绝对误差和量级判断。',
        checkpoint: '检查近似方向是否记录，量级是否正确，是否用精确值或上下界验证。',
      },
      {
        title: '材料与概念｜基准、相容数与误差',
        body:
          '数感包括对位值、数量级、比例和结果合理性的判断。估算常使用 10%、25%、1,000 等基准，把不便计算的数换成相容数。误差可写成绝对差或相对差；用途决定允许多大误差。近似方向很重要：若多个因子都向下取整，结果可能系统性偏低，反之偏高。估算之后仍要检查单位与量级。精确值不是估算的敌人，而是验证工具。',
        note: '误差方向也是证据。',
        objective: '能解释基准、相容数、数量级、绝对误差和相对误差。',
        practice: '为整数乘法、百分数和除法各写一种估算策略与一个误差叠加反例。',
        checkpoint: '检查策略是否可复现，误差是否量化，是否说明何时必须精确计算。',
      },
      {
        title: '示范与推导｜从近似式推到真实误差',
        body:
          '估计 49×21：把 49 上调到 50，把 21 下调到 20，估算 1,000；精确值 1,029，绝对误差 29，相对误差约 2.8%。两个近似方向相反，部分误差抵消，但不能保证每次都抵消。若把 49 和 21 都下调为 40 和 20，估算 800，误差过大且方向一致。示范要求把选择理由与误差写在同一行。',
        note: '近似选择要能解释。',
        objective: '能把近似过程、误差计算和结果合理性连成完整推导。',
        practice: '完成一次乘法估算，写出两个取整方向、相对误差和一条更好的替代基准。',
        checkpoint: '检查近似值与精确值是否比较，误差方向是否正确，替代方案是否有清楚理由。',
      },
      {
        title: '引导练习｜十道估算与精确复核',
        body:
          '准备十道题，覆盖乘法、百分数、除法、单位换算和异常大数。每题先做估算，再计算精确值作为后测，记录绝对误差、相对误差、方向和是否需要复算。第二轮改变一个数的数量级做变式，例如 49.7 变 497，检查结果是否按十倍变化。记录取整方向、误差遗漏、量级错误和边界误用。评分看过程与验证，不只看估算值接近。',
        note: '变式要改变量级。',
        objective: '能对十道题完成估算、精确复核和数量级变式。',
        practice: '提交十题估算表、五组绝对与相对误差、三个量级变式，以及每题是否需要复算的判断。',
        checkpoint: '检查每题有基准与误差，变式数量级正确，不能精确替代的场景已标明。',
      },
      {
        title: '独立迁移与评价｜把估算用于真实决策',
        body:
          '选择购物预算、人口规模和一个科学计数法场景，分别估算并判断是否需要精确值。写清单位、误差和决策阈值，例如预算超出十元就必须复算。24 小时后用新数据复核。评价四项：量级正确、方法可复现、误差有界、边界明确。最后写一个不能只靠估算的决策反例，例如药物剂量或精确付款。数感帮助判断，但不替代场景要求的精度。',
        note: '精度由用途决定。',
        objective: '能把估算迁移到真实场景，并用误差、阈值和边界评价适用性。',
        practice: '提交三个场景的估算、精确复核、阈值、24 小时更新和一个禁用估算反例。',
        checkpoint: '四项自评：量级正确、过程可复现、误差可量化、边界清楚；高风险场景必须精确核算。',
      },
    ],
    quiz: [
      question(
        '估算 49×21 时，哪种记录最完整？',
        '写出取整方向、近似式、估算值，并用 1,029 核对误差',
        ['直接写“约一千”不说明依据', '把两个数都随意改成十', '只列精确竖式'],
        0,
        '估算需要可解释的基准与误差。记录方向和精确复核能判断近似是否适合当前用途，也能发现同向取整造成的系统偏差。',
        '事实与定义',
      ),
      question(
        '多个因子都向下取整时，结果最可能出现什么？',
        '系统性偏低，且误差方向叠加',
        ['一定完全准确', '系统性偏高', '数量级必然增加'],
        1,
        '同向取整会把近似偏差累积。需要估算误差范围或调整一个因子来抵消，而不是假定误差自动消失或把估算值直接当精确答案。',
        '材料与推导',
      ),
      question(
        '哪种场景最不适合只给粗略估算？',
        '需要精确付款、剂量或安全阈值的场景',
        ['判断大致人口规模', '选择预算量级', '快速检查答案是否合理'],
        2,
        '高风险或精确交易需要可复算值。估算可以用来预警，却不能替代规则要求的精确计算和核验，也不能省略单位和上下界。',
        '常见误区',
      ),
      question(
        '把数感迁移到读图表时，哪种做法最稳妥？',
        '先看轴单位与数量级，再用基准估读并检查精确标注',
        ['只看柱子颜色', '忽略单位', '把最高柱直接当准确数值'],
        0,
        '图表可能使用不同单位和截断轴。先读轴、再估读、最后核对精确标签，能避免量级误判，也能防止把视觉高度直接当数据。',
        '迁移应用',
      ),
    ],
  },
  'math:分数：从分割到运算': {
    contentStatus: 'reviewed',
    prerequisite: '会做整数乘除，能理解平均分和数轴上的等分。',
    plainLanguageGoal:
      '学完后，你能用单位分数解释等价、通分和四则运算，并通过图形、数轴与反例验证结果。',
    guidedPractice:
      '完成 12 道分数题，每题配一个图形或数轴模型，并检查分母、整体和运算意义。',
    independentPractice:
      '按 2/3 杯配方缩放到 3/2 倍并用不同方法验证，再用一个生活场景解释为何分母不能直接相加。',
    commonErrors: [
      '直接把分子与分子、分母与分母相加，忽略单位分数大小不同。',
      '约分时使用了不同单位的对象，导致等式关系被破坏。',
      '只会套倒数规则，无法解释除法在问“包含多少个单位”。',
    ],
    sourceRefs: FRACTION_SOURCES,
    studyPoints: [
      point('必背', '分数描述同一整体被等分后取若干份；加减先统一单位，等价分数只改变表示不改变数值。', 1),
      point('重点', '通分、约分和乘除规则都要能回到单位分数、整体或包含关系解释。', 2),
      point('易错', '1/2+1/3≠2/5；相加的是同大小单位份数，不是两个分母直接合并。', 4),
    ],
    eventDetails: [FRACTION_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜半块蛋糕加三分之一块是多少',
        body:
          '先做前测：计算 1/2+1/3 并用图表示。常见答案是 2/5。要求画两个同样大小的整体，分别涂 1/2 与 1/3，再问合并后超过 1/2 还是小于 1/2。若图上明显大于 1/2，2/5 作为反例立即失效。接着比较 2/3 与 3/5，判断哪个大并说明基准。前测记录分母误加、整体不一致、无法解释运算和约分错误。',
        note: '整体相同才能直接比较份数。',
        objective: '能用图形与数量级诊断分数加法、比较和整体不一致错误。',
        practice: '完成三道分数前测，每题画图、估大小并写出一个错误答案为什么错。',
        checkpoint: '检查整体是否同样大小，单位分数是否正确，结果是否通过图形和大于/小于基准验证。',
      },
      {
        title: '材料与概念｜单位分数、等价与通分',
        body:
          '分数把整体分成若干等份，分母是份数，分子是取用份数。单位分数 1/n 是基本单位，例如 1/2 与 1/3 的大小不同，不能直接把份数相加。等价分数通过同乘或同除同一非零数保持数量；通分把不同单位换成同一分母，再合并份数。约分只简化表示。乘法的“几分之几”与除法的“包含多少个单位”各有模型，规则必须和意义一起记。',
        note: '先统一单位，再运算。',
        objective: '能解释单位分数、等价、通分、约分和四则运算的意义。',
        practice: '为一个等价分数、一个分数加法和一个分数除法各画模型并写运算依据。',
        checkpoint: '检查整体一致，单位大小正确，规则与图形解释一致，约分不改变值。',
      },
      {
        title: '示范与推导｜从图形推出 1/2+1/3',
        body:
          '两个相同整体分别分成 2 份和 3 份。把两者都再分成 6 等份：1/2=3/6，1/3=2/6，所以和为 5/6。反例 2/5 不成立，因为 2/5 小于 1/2，不可能等于 1/2 加正数。再解释 3/4÷1/2：3/4 中有 1 个完整的 1/2，还剩 1/4，即半个 1/2，共 1.5 个，所以结果为 3/2。',
        note: '通分和除法都用统一单位解释。',
        objective: '能用统一步骤解释分数加法与除法，并排除明显错误答案。',
        practice: '画出 1/2+1/3 与 3/4÷1/2 的模型，写出通分、包含关系和结果。',
        checkpoint: '检查图形等份是否准确，等价分数是否正确，反例是否能由数量级排除。',
      },
      {
        title: '引导练习｜十二道图形运算',
        body:
          '准备十二题，覆盖加减、乘、除、约分和混合数。每题先做前测预测结果范围，再画图或数轴，最后计算并作为后测对照原预测，用反例检查。第二轮改变一个分母或整体做变式，观察结果怎样变化。记录分母直接相加、整体不一致、倒数方向错误和约分过度。若答案小于其中一个加数，应立即怀疑加法错误；若除法结果大于被除数，要检查除数是否小于 1。',
        note: '结果范围能抓大错。',
        objective: '能完成十二道分数运算，并用范围、图形和变式检验。',
        practice: '提交十二题模型与计算、三个范围反例、三个分母变式和错误分类。',
        checkpoint: '检查每步单位一致，结果范围合理，变式能够解释，而不是只套算法。',
      },
      {
        title: '独立迁移与评价｜用分数处理真实比例',
        body:
          '一份配方用 2/3 杯原料，按 3/2 倍缩放，计算用量并说明为何结果在 2/3 与 4/3 之间。再用购买、时间或地图比例做一个分数任务。评价四项：整体定义清楚、单位一致、计算正确、结果可解释。24 小时后用整数值验证，例如把 2/3 换成 4/6 复核。最后写一个不能用“分子加分子、分母加分母”的反例。',
        note: '真实任务要保留单位。',
        objective: '能把分数运算迁移到配方和比例任务，并用多种表示验证。',
        practice: '提交配方计算、整数复核、一个比例任务、24 小时复测和分母相加反例。',
        checkpoint: '四项自评：整体一致、单位明确、结果合理、表示可互验；无法解释的步骤不能算完成。',
      },
    ],
    quiz: [
      question(
        '为什么 1/2+1/3 不能等于 2/5？',
        '1/2 与 1/3 的单位大小不同，必须通分后再合并份数',
        ['因为分母不能相加但分子可以', '因为 1/2 小于 1/3', '因为分数只能相乘'],
        0,
        '单位分数大小不同，不能把份数直接合并。通分后 1/2=3/6、1/3=2/6，总和才是 5/6，图形也能立即排除 2/5。',
        '事实与定义',
      ),
      question(
        '3/4÷1/2=3/2，最直观的解释是什么？',
        '3/4 中包含一个半 1/2 单位',
        ['3/4 比 1/2 小', '分子乘分子得到 3/2', '所有除法都要取相反数'],
        1,
        '除以 1/2 是在问 3/4 中包含多少个 1/2。一个完整 1/2 加半个 1/2，共 1.5 个单位，因此结果是 3/2。',
        '材料与推导',
      ),
      question(
        '哪种错误最容易通过图形模型发现？',
        '把 2/3+1/3 算成 3/6，结果只有半个整体',
        ['约分后写成 1/2', '先把整数部分相加', '用数轴表示分数'],
        2,
        '两个分数合计应为一整个整体，3/6 明显小于 1。图形和结果范围能立即暴露分母相加错误，也能避免只记结论。',
        '常见误区',
      ),
      question(
        '把分数迁移到地图比例时，哪种检查最重要？',
        '确认图上单位对应现实单位，并检查缩放后的量级',
        ['只看分子是否整数', '把所有比例都倒过来', '忽略单位'],
        0,
        '比例题依赖单位对应和缩放方向。检查现实量级能防止把 1/100 与 100 倍混淆，也能发现地图单位遗漏。',
        '迁移应用',
      ),
    ],
  },
  'math:方程：把未知量变成关系': {
    contentStatus: 'reviewed',
    prerequisite: '熟悉四则逆运算，能计算含括号的一次式。',
    plainLanguageGoal:
      '学完后，你能定义未知量、把情境写成方程，用等式性质求解，并通过代入和情境范围验证。',
    guidedPractice:
      '完成 10 道一次方程，记录两边操作、等式性质、候选解、代入结果和情境限制。',
    independentPractice:
      '为固定费加单价、总量分配和两边变量三类情境各建一个方程，求解并用反例检查。',
    commonErrors: [
      '只移动符号却不说明两边做了什么合法操作。',
      '求出候选值后不代回原方程，也不检查单位与范围。',
      '变量在两边时只处理一侧，破坏等式平衡。',
    ],
    sourceRefs: EQUATION_SOURCES,
    studyPoints: [
      point('必背', '方程是未知量与数量关系的约束；等式两边必须做同样合法操作，解要代回原方程检验。', 1),
      point('重点', '未知量、单位、等式结构和解集先写清，再选择逆运算；变量在两边时要把同类项系统处理。', 2),
      point('易错', '移项变号不是独立魔法，背后是两边同时加减；现实解还需满足正数、整数或容量等范围。', 4),
    ],
    eventDetails: [EQUATION_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜为什么答案算出负数却不能用',
        body:
          '先做前测：某活动固定费用 5 元，每人 3 元，总费用 20 元，求人数。要求定义未知量、列方程、求解并解释单位。候选解是 5，但变式总费用 11 元时会算出 2，仍可用；若方程写成 3x−5=11，可能出现错误增根。记录未知量未定义、等式方向错、只移号不解释和负数未检查。后测要求代入原式并回到情境。',
        note: '方程解先过数学检验，再过情境检验。',
        objective: '能用未知量、单位、等式和情境范围诊断一次方程问题。',
        practice: '完成两个情境前测，分别写未知量、方程、求解、代入和单位解释。',
        checkpoint: '检查等式是否匹配语言，操作是否两边一致，候选解是否代回原式和现实范围。',
      },
      {
        title: '材料与概念｜未知量、等式性质与解集',
        body:
          '未知量用符号表示数量，必须说明单位和含义。方程陈述两边数量相等，等式性质允许同时加减同一数、同时乘除同一非零数。逆运算用于隔离未知量。变量在两边时，先通过等式性质把变量集中到一边，再处理常数。方程的解集是所有满足等式的值；现实情境可能只接受整数、正数或某范围。等价变形保留解集，非等价操作可能引入或丢失解。',
        note: '每一步都问等式为何仍成立。',
        objective: '能解释未知量、等式性质、逆运算、等价变形和解集。',
        practice: '为三类方程各写一步合法操作、操作依据和一个解集不变或范围变化的例子。',
        checkpoint: '检查操作两边一致，除法不除零，未知量单位清楚，解集范围未被遗漏。',
      },
      {
        title: '示范与推导｜从情境到 3x+5=20',
        body:
          '设人数为 x，则总费用 3x+5=20。两边减 5 得 3x=15，两边除以 3 得 x=5。代回原式 3×5+5=20，且人数为正整数，解释成立。若误解为“5 元是每人费用”，方程结构会变。变式把总费用改成 21，求解并检查整数条件；若现实不允许半人，x=16/3 需重新解释。推导链必须包含定义、等式操作、检验和情境结论。',
        note: '先建模，再解方程。',
        objective: '能完成从情境定义到方程求解、代入和现实解释的完整链条。',
        practice: '为固定费情境完成方程、四步等式操作、代入检验和总费用变式。',
        checkpoint: '检查未知量含义，操作两边一致，候选值代回原式，情境限制有说明。',
      },
      {
        title: '引导练习｜十道一次方程与情境变式',
        body:
          '准备十道方程，覆盖加减、乘除、括号、变量两边和现实限制。每题先做前测写出解集允许范围，再逐步记录等式性质，最后代入。后测改变一个常数或系数做变式，比较解如何移动。记录符号错误、只改一边、除零、代入错误和情境越界。若解出 x=2.5 人，应判模型或题目条件需修正，不能机械写成“2.5 人”。',
        note: '现实变量可能有离散限制。',
        objective: '能对十道一次方程完成等价求解、代入和情境变式。',
        practice: '提交十题步骤、五组变式、全部代入记录和两类情境边界说明。',
        checkpoint: '检查等价操作、解集、现实限制和变式解释，任何一项缺失都要重做。',
      },
      {
        title: '独立迁移与评价｜用方程表达三个真实关系',
        body:
          '分别建立固定费加单价、总量分配和变量两边问题。先做前测列出未知量与单位，再求解、代入和解释。24 小时后改变一个条件重做，并比较解集怎样移动。评价四项：模型准确、操作等价、检验完整、解释合理。最后写一个方程有数学解但现实不可用的反例，例如负长度或非整数人数。方程解决关系问题，最终仍要回到情境。',
        note: '数学解不等于现实可行解。',
        objective: '能把一次方程迁移到三类情境，并用代入、范围和反例评价解。',
        practice: '提交三组建模、逐步求解、代入检验、24 小时变式、一个现实反例和四项自评。',
        checkpoint: '四项自评：关系准确、步骤等价、检验有据、现实可行；不能只凭计算结果下结论。',
      },
    ],
    quiz: [
      question(
        '解方程时“两边同时减去同一个数”的依据是什么？',
        '等式性质：对相等两边做相同合法操作，等式仍成立',
        ['为了让字母换到右边', '因为减号会自动变正号', '只改有字母的一边'],
        0,
        '移项的本质是等式两边同步操作。说明这一步能保持等式，才不会把符号规则当成无依据口诀，也能检查是否只改了一边并保持解集。',
        '事实与定义',
      ),
      question(
        '解出 x=5 后，最必要的下一步是什么？',
        '代回原方程并检查情境单位和范围',
        ['只看答案是否为整数', '把原题数字全部删除', '再随便解另一个方程'],
        1,
        '代入能发现计算错误，情境检查能发现负数、非整数或超范围。数学解和现实解释需要同时成立，不能只凭整数外观判断可行性。',
        '材料与推导',
      ),
      question(
        '哪种操作最可能破坏等式等价？',
        '只在一侧加数，或两边除以可能为零的表达式',
        ['两边同减一个常数', '两边同除非零常数', '把 3x 写成 x+x+x'],
        2,
        '等式操作必须两边同步且合法。除零无定义，单边操作改变平衡，可能导致错误解，因此每一步都要写出依据并保留候选解检查。',
        '常见误区',
      ),
      question(
        '把方程迁移到成本规划时，哪种建模最完整？',
        '定义人数、单价和固定费用的单位，列等式并检查容量和整数限制',
        ['只写一个 x 不解释', '先设答案再补方程', '忽略固定费用'],
        0,
        '成本模型需要变量含义、单位和现实边界。完整建模能让方程解真正支持决策，也能暴露非整数人数等不可行结果，并促使修订假设。',
        '迁移应用',
      ),
    ],
  },
  'math:几何直观与证明': {
    contentStatus: 'reviewed',
    prerequisite: '认识点、线、圆和三角形，能完成基本尺规作图。',
    plainLanguageGoal:
      '学完后，你能把作图步骤与证明依据分开，用定义和已知条件证明一个几何结论，并指出图示不能替代的部分。',
    guidedPractice:
      '重写《几何原本》I.1 的已知、作法、依据、证明和结论，并删除一个关键依据制造反例。',
    independentPractice:
      '选择一条简单几何命题，画图、列已知、完成证明并检查是否能推广到任意情形。',
    commonErrors: [
      '把图上看起来相等当作已知相等。',
      '作图步骤与证明步骤混在一起，没有说明依据。',
      '只验证一个特例就声称对任意图形成立。',
    ],
    sourceRefs: GEOMETRY_SOURCES,
    studyPoints: [
      point('必背', '作图构造对象，证明说明构造为何满足定义；结论必须由已知、定义、公设和已证命题推出。', 1),
      point('重点', '证明写成已知—作法—依据—中间结论—最终结论，图像只辅助观察。', 2),
      point('易错', '一个特例的三边近似相等不能证明等边；任意线段情形需要一般依据。', 4),
    ],
    eventDetails: [GEOMETRY_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜画得像等边就能证明吗',
        body:
          '先做前测：给一条线段 AB，要求作等边三角形并说明为什么三边相等。记录学习者是否只量图、是否写出圆规步骤、是否能引用圆半径相等。给出反例：手画误差很小的三角形并不保证 AB=AC=BC。再把任务改成“证明对任意线段成立”，检查是否仍依赖具体长度。后测要求把画图和证明分成两栏，删除任何“看起来相等”的依据。',
        note: '图是辅助，不是公理。',
        objective: '能区分图示观察、构造操作和证明依据，并暴露量图代替证明的错误。',
        practice: '完成 I.1 前测，分别写已知、作图、三个等量依据和一条只靠图不能推出的结论。',
        checkpoint: '检查是否引用定义或公设，是否对任意线段讨论，是否保留图和证明的差异。',
      },
      {
        title: '材料与概念｜定义、已知、公设与证明链',
        body:
          '几何定义规定对象性质，已知是当前命题允许使用的前提，公设和公理提供基本作图与等量规则。作图步骤构造对象，证明步骤说明对象为何满足目标。证明链中每个结论都应有依据，不能跳过中间关系。图示可辅助识别对象，但手画误差和特例不构成一般证明。反例常来自悄悄增加的假设，例如“交点当然存在”或“看起来在线段中间”。',
        note: '每一句结论都要能问“依据是什么”。',
        objective: '能解释定义、已知、作图、公设、中间结论和最终证明的角色。',
        practice: '为 I.1 制作五栏表：已知、作法、依据、中间结论、最终结论。',
        checkpoint: '检查操作与依据对应，未使用图观测量，公设引用明确，结论满足定义。',
      },
      {
        title: '示范与推导｜等边三角形的构造证明',
        body:
          '已知线段 AB。以 A 为圆心、AB 为半径作圆，以 B 为圆心、AB 为半径作圆，取交点 C，连接 AC、BC。因 C 在两圆上，AC=AB 且 BC=AB；由等于同量的量彼此相等，AC=BC；因此 AB=AC=BC，ABC 为等边三角形。反例检查：若删去“两圆半径相等”的依据，只能看到三条线接近相等，无法推出一般结论。',
        note: '构造每步都有数学依据。',
        objective: '能完整写出 I.1 的构造与证明，并说明每个等号的来源。',
        practice: '完成一次构造，写三条半径关系、等量传递、等边定义结论和任意线段的适用说明。',
        checkpoint: '检查交点、半径、等量传递和定义是否齐全，是否没有使用测量。',
      },
      {
        title: '引导练习｜删依据找断点',
        body:
          '给出一份省略依据的 I.1 证明，先做前测找出至少三个断点，再补全。第二轮删除一条关键定义或改变作图条件，观察结论是否仍成立，并写反例。后测把证明改写成更一般的语言，说明任意线段都适用。记录图观察、循环证明、未引用定义和特例推广。若证明只写“因为三角形看起来等边”，必须退回证明链。',
        note: '断点要指出缺哪条依据。',
        objective: '能识别并修复几何证明中的依据缺口，说明一般性范围。',
        practice: '提交原证明标注、三个依据补全、一个删条件反例、一般化改写和任意线段适用范围。',
        checkpoint: '检查补全依据来自定义或公设，反例能改变结论，一般化没有依赖具体长度。',
      },
      {
        title: '独立迁移与评价｜证明一条简单命题',
        body:
          '选择一条简单命题，例如同圆半径相等或对顶角相等（按课程材料）。先画图并做前测列出已知与目标，再写证明，最后用一个特例验证是否误把图当依据。24 小时后换一种图形布局做变式复核，观察证明是否仍成立。评价四项：已知完整、依据明确、结论一般、图示不越界。最后写一个图看起来成立但需要额外前提的反例。',
        note: '图布局变化不应改变证明。',
        objective: '能把几何证明流程迁移到新命题，并评价一般性与依据完整性。',
        practice: '提交命题证明、已知与依据表、24 小时变图复核、反例和四项自评。',
        checkpoint: '四项自评：已知完整、依据可追、结论一般、图示不替代证明；缺一项需重写。',
      },
    ],
    quiz: [
      question(
        '几何作图与几何证明最核心的区别是什么？',
        '作图构造对象，证明说明对象为何满足定义和结论',
        ['作图一定比证明更严格', '证明只需要图形好看', '两者完全相同'],
        0,
        '作图给出对象，证明提供逻辑依据。没有证明，图像近似和特例不能支持一般结论，也不能说明任意已知线段都适用。',
        '事实与定义',
      ),
      question(
        '在 I.1 中，AC=AB 的直接依据是什么？',
        'C 在以 A 为圆心、AB 为半径的圆上，因此圆半径相等',
        ['三角形看起来等边', 'C 在纸上位置居中', 'AC 与 BC 都画得很直'],
        1,
        '等量来自圆的定义和作图条件，而不是肉眼。BC=AB 同理，再由等量传递得到三边相等，因此满足等边定义。',
        '材料与推导',
      ),
      question(
        '哪种做法最可能产生错误证明？',
        '把图上看起来相等直接写成已知相等，不引用定义或条件',
        ['写出已知与作图步骤', '引用圆半径相等', '用特例检查是否遗漏条件'],
        2,
        '视觉近似不是数学依据。证明必须说明等量为何成立，并对任意符合条件的情形有效，而不只对一张手画图成立。',
        '常见误区',
      ),
      question(
        '把证明方法迁移到程序设计文档时，哪种做法最稳妥？',
        '把假设、步骤、依据和结论写清楚，并用反例检查边界',
        ['只截图运行结果', '把一次成功当所有输入正确', '省略关键前提'],
        0,
        '程序论证同样需要前提、步骤和依据。反例和边界输入能发现“看起来正确”但未被证明的情况，也能暴露隐藏假设。',
        '迁移应用',
      ),
    ],
  },
  'math:概率：从游戏到模型': {
    contentStatus: 'reviewed',
    prerequisite: '会计算分数、比例和简单列表，能区分随机与确定事件。',
    plainLanguageGoal:
      '学完后，你能列出样本空间、定义事件、计算理论概率，用频率和假设检查模型，并指出独立与互斥的区别。',
    guidedPractice:
      '为两枚骰子、抽球和公平游戏列出样本空间，计算 6 个事件概率并用模拟频率比较。',
    independentPractice:
      '设计一个公平游戏，写出概率模型、假设、模拟次数和偏差解释，24 小时后更新结论。',
    commonErrors: [
      '把和值 11 与实际 11 个结果混为一谈，忘记样本空间大小。',
      '认为小样本频率偏离理论值就证明骰子有偏。',
      '把互斥事件误当成独立事件，或用一次结果推断长期概率。',
    ],
    sourceRefs: PROBABILITY_SOURCES,
    studyPoints: [
      point('必背', '概率计算先列完整样本空间和事件，再说明等可能或给定概率；理论模型与观察频率需分开。', 1),
      point('重点', '独立看一个事件是否改变另一个事件概率，互斥看能否同时发生，两者不是同义词。', 2),
      point('易错', '一次结果不能否定模型；频率偏差要结合样本量、随机波动和偏差假设判断。', 4),
    ],
    eventDetails: [PROBABILITY_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜两枚骰子和为 7 为什么比 2 常见',
        body:
          '先做前测：列出两枚骰子的样本空间，计算和为 2、7、12 的概率。常见答案把和值 2 至 12 当成 11 个等可能结果，得出相同概率。要求写出有序对并数事件包含结果数。再抛出反例：若骰子有偏，样本空间仍相同，但各结果的概率不再相同。诊断记录样本遗漏、等可能假设和一次投掷推断长期概率三类错误。',
        note: '先数结果，再谈概率。',
        objective: '能列 36 个有序结果并诊断等可能与样本遗漏错误。',
        practice: '完成两骰子前测，列出完整样本空间、三个事件的计数和一个非等可能反例。',
        checkpoint: '检查样本空间是否完整，事件计数是否准确，是否明确写出公平骰子假设。',
      },
      {
        title: '材料与概念｜样本空间、事件与独立性',
        body:
          '样本空间是所有可能结果的集合，事件是其中子集。理论概率在等可能模型下是事件结果数除以总结果数；更一般模型直接赋予结果概率。相对频率是实际试验中事件发生比例，会受随机波动影响。独立事件指一个事件发生不改变另一个事件概率；互斥事件指不能同时发生。两个概念不同，必须用定义和计数验证。现实模型还要写骰子公平、抽取是否放回等假设。',
        note: '概率是模型量，频率是观察量。',
        objective: '能解释样本空间、事件、理论概率、频率、独立和互斥。',
        practice: '为一个抽球实验列样本空间，区分两个独立问题和一个互斥问题。',
        checkpoint: '检查样本完整，事件定义清楚，独立与互斥判断有依据，模型假设写明。',
      },
      {
        title: '示范与推导｜从 36 个结果推到概率',
        body:
          '两枚公平骰子的有序结果共 36 个。和 7 的结果有 (1,6)、(2,5)、(3,4)、(4,3)、(5,2)、(6,1)，共 6 个，所以概率 6/36=1/6。和 2 只有 (1,1)，概率 1/36；和 12 只有 (6,6)，概率 1/36。和值本身不是等可能事件；“和为 2”与“和为 12”互斥，却不是独立。反例是把 11 个和值都当 1/11，会与计数冲突。',
        note: '等可能是结果层面，不是和值层面。',
        objective: '能由样本空间和事件计数计算概率，并说明互斥与独立。',
        practice: '完成三个和值事件的计算、两个互斥说明和一个非等可能偏差模型。',
        checkpoint: '检查结果总数、事件数、分数化简和假设一致，独立判断没有滥用。',
      },
      {
        title: '引导练习｜骰子、抽球与频率模拟',
        body:
          '准备三个模型：两骰子、放回抽球和公平游戏。每个先做前测列样本空间并计算两个事件，再做后测用 30、300、3,000 次模拟比较频率。记录样本遗漏、等可能误判、独立互斥混淆和频率过度解读。若 30 次和 300 次结果差异大，应讨论随机波动而不是立即改模型。最后改变放回条件做变式，比较概率变化。',
        note: '频率波动本身也是数据。',
        objective: '能对三类模型完成理论计算、模拟比较和条件变式。',
        practice: '提交三组样本空间、概率计算、三个样本量频率、波动解释和放回变式。',
        checkpoint: '检查模型假设一致，样本完整，模拟记录可复现，频率判断没有超出随机性。',
      },
      {
        title: '独立迁移与评价｜设计一个公平游戏',
        body:
          '设计一个基于骰子或抽卡的游戏，先定义结果、胜负事件和公平含义，再计算双方概率。用模拟检验，记录 24 小时后的更大样本。评价四项：规则清楚、样本空间完整、概率正确、结论尊重波动。最后写一个使游戏不公平的偏差反例，例如骰子偏重或抽取不放回。公平不是“有人赢过”，而是规则概率或长期期望符合约定。',
        note: '公平是模型性质，不靠口头保证。',
        objective: '能设计并评价公平游戏，用理论概率、模拟和偏差反例说明结论。',
        practice: '提交游戏规则、样本空间、概率计算、模拟记录、24 小时复测和偏差反例。',
        checkpoint: '四项自评：规则明确、样本完整、计算正确、波动解释谨慎；不能以一次输赢判断公平。',
      },
    ],
    quiz: [
      question(
        '计算两枚公平骰子和值的概率，第一步应做什么？',
        '列出 36 个有序结果，再数事件包含的结果',
        ['把 2 至 12 当 11 个等可能结果', '直接写 1/11', '只投一次骰子观察'],
        0,
        '先定义完整样本空间才能计数。和值由多个有序结果组成，概率依赖每个和值包含多少结果，而不是和值名称的数量。',
        '事实与定义',
      ),
      question(
        '掷出和为 2 与和为 12 为什么是互斥事件？',
        '一次两骰子投掷不能同时出现两个不同和值',
        ['因为两事件概率相同', '因为一个事件会改变另一个事件', '因为样本空间只有两个结果'],
        1,
        '互斥指两事件不能同时发生。概率相同不代表互斥，独立也要求一个事件发生不改变另一个事件概率，三个概念不能混用。',
        '材料与推导',
      ),
      question(
        '模拟 30 次偏差很大，最合理的下一步是什么？',
        '保留模型假设，增加样本并观察波动，而不是立即判定骰子有偏',
        ['立刻改掉理论概率', '只保留符合预期的结果', '删除全部模拟记录'],
        2,
        '小样本波动通常较大。需要更大样本、重复实验和偏差模型检验，才能判断偏离是否超出随机范围，不能挑选符合预期的结果。',
        '常见误区',
      ),
      question(
        '把概率模型迁移到垃圾邮件过滤时，哪种评价最完整？',
        '定义样本空间、类别成本和阈值，用频率和误差评估模型',
        ['只看一次分类结果', '只追求零误报', '忽略模型假设'],
        0,
        '现实分类有不同错误成本。样本、阈值和频率能帮助评价模型，但仍需考虑分布变化和误判后果，不能只看总体准确率。',
        '迁移应用',
      ),
    ],
  },
};
