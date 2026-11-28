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

const QUADRATIC_ARCHIVE = {
  id: 'quadratic-parameter-vertex-form',
  kind: 'concept',
  title: '参数与图像：顶点式怎样保存结构',
  period: '学习阶段 01—06',
  summary:
    '二次函数 y=a(x-h)²+k（a≠0）把开口、伸缩和顶点位置分开。图像提供直观，配方和取点提供代数证明。',
  background:
    '只记“左加右减”容易把 h 的符号读反。参数卡需要同时写条件、顶点、对称轴、开口、检验点与变式。',
  timeline: [
    {
      date: '阶段 01',
      title: '从抛物线识别结构与参数',
      body: '先观察开口方向、最值和对称轴，再写出顶点式。图像帮助提出参数猜想，不能直接证明一般关系。',
      sourceIds: ['openstax-quadratic'],
    },
    {
      date: '阶段 02',
      title: 'a 决定开口与伸缩',
      body: 'a>0 开口向上，a<0 向下；|a| 越大图像越窄。a=0 时退化为一次函数，不再满足二次函数条件。',
      sourceIds: ['openstax-quadratic'],
    },
    {
      date: '阶段 03',
      title: 'h 与 k 定位顶点',
      body: 'x−h=0 时 y=k，因此顶点是 (h,k)，对称轴 x=h。括号内是 x−h，不能只凭“向左向右”背符号。',
      sourceIds: ['openstax-quadratic', 'openstax-transformations'],
    },
    {
      date: '阶段 04',
      title: '标准式配方回到顶点式',
      body: '从 ax²+bx+c 配方，把 x² 项和 x 项组成完全平方。配方是恒等变形，可证明顶点位置，而不是只换外观。',
      sourceIds: ['openstax-quadratic'],
    },
    {
      date: '阶段 05',
      title: '用取样点验证图像',
      body: '选取对称轴两侧等距的 x 值，函数值应相等。一个代入点可发现 h 或 k 误读，但不能替代完整推导。',
      sourceIds: ['openstax-transformations'],
    },
    {
      date: '阶段 06',
      title: '定义域与情境限制',
      body: '数学定义域可为全体实数，利润、长度和时间等情境常把变量限制在非负区间。最值结论要同时检查顶点和区间端点。',
      sourceIds: ['openstax-quadratic', 'openstax-transformations'],
    },
  ],
  outcome:
    '可观察结果是能在标准式、顶点式和图像之间互译，利用配方和对称取样验证参数。',
  significance:
    '二次函数把代数结构与图像变化统一，并训练条件、定义域和极值意识。',
  sourceCards: [
    source(
      'openstax-quadratic',
      '5.1 Quadratic Functions',
      'OpenStax College Algebra 2e',
      '2025 年访问版',
      'https://openstax.org/books/college-algebra-2e/pages/5-1-quadratic-functions',
      '核对顶点、对称轴、配方和二次函数图像。',
    ),
    source(
      'openstax-transformations',
      '3.5 Transformation of Functions',
      'OpenStax College Algebra 2e',
      '2025 年访问版',
      'https://openstax.org/books/college-algebra-2e/pages/3-5-transformation-of-functions',
      '核对平移、伸缩和函数变换顺序。',
    ),
    source(
      'openintro-statistics',
      'OpenIntro Statistics',
      'OpenIntro',
      '2025 年访问版',
      'https://www.openintro.org/book/os/',
      '核对图像、数据与模型验证的一般方法。',
    ),
    source(
      'sep-proof-theory',
      'Proof Theory',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/proof-theory/',
      '核对恒等变形与推导依据。',
    ),
  ],
} satisfies LearningV2EventDetail;

const TRIG_ARCHIVE = {
  id: 'trig-period-phase-model',
  kind: 'concept',
  title: '周期与相位：参数如何控制重复和移动',
  period: '学习阶段 01—06',
  summary:
    '正弦函数 y=A sin(B(x−C))+D 中，振幅、周期、相位、纵向平移和定义域分别承担不同任务。公式参数与图像特征必须互证。',
  background:
    '相位既有 C 也有 B 的影响，直接看括号内数字容易误判。单位（弧度或角度）和符号方向也必须先声明。',
  timeline: [
    {
      date: '阶段 01',
      title: '单位圆生成周期波形',
      body: '角增加一周，对应点回到同一位置，因此正弦和余弦重复。周期不是图像看起来的任意间隔，而是满足 f(x+T)=f(x) 的最小正 T。',
      sourceIds: ['openstax-sine-cosine'],
    },
    {
      date: '阶段 02',
      title: '振幅反映相对中线的最大偏离',
      body: 'y=A sin(...)+D 的振幅是 |A|，中线为 y=D。A 为负会上下翻转，振幅仍非负。',
      sourceIds: ['openstax-sine-cosine'],
    },
    {
      date: '阶段 03',
      title: 'B 改变周期',
      body: 'sin(Bx) 的周期为 2π/|B|。B 的绝对值增大，周期缩短；B 为零时函数退化，不再是该周期模型。',
      sourceIds: ['openstax-sine-cosine'],
    },
    {
      date: '阶段 04',
      title: '相位移动由 C 与 B 共同决定',
      body: 'B(x−C) 在 x=C 时相位为零，所以水平移动是 C。若写成 Bx−φ，则移动量是 φ/B，不能只看常数项。',
      sourceIds: ['openstax-sine-cosine'],
    },
    {
      date: '阶段 05',
      title: '定义域、值域与周期共同限定模型',
      body: '基本正弦定义域为全体实数，值域为 [D−|A|,D+|A|]。现实模型的时间通常非负，结束点还要按情境截断。',
      sourceIds: ['openstax-sine-cosine', 'openstax-other-trig'],
    },
    {
      date: '阶段 06',
      title: '用峰谷和零点检验参数',
      body: '由最大值与最小值算中线，由相邻峰值算周期，再由一个峰值位置反推相位。反例包括混用角度与弧度，或把 C 当 φ。',
      sourceIds: ['openstax-sine-cosine'],
    },
  ],
  outcome:
    '可观察结果是由图像或情境读出振幅、中线、周期和相位，再写出并检验函数。',
  significance:
    '三角函数训练周期现象的参数解释、单位一致和图像验证。',
  sourceCards: [
    source(
      'openstax-sine-cosine',
      '6.1 Graphs of the Sine and Cosine Functions',
      'OpenStax Precalculus 2e',
      '2025 年访问版',
      'https://openstax.org/books/precalculus-2e/pages/6-1-graphs-of-the-sine-and-cosine-functions',
      '核对振幅、周期、相位与图像。',
    ),
    source(
      'openstax-other-trig',
      '6.2 Graphs of the Other Trigonometric Functions',
      'OpenStax Precalculus 2e',
      '2025 年访问版',
      'https://openstax.org/books/precalculus-2e/pages/6-2-graphs-of-the-other-trigonometric-functions',
      '核对周期函数、定义域和其他三角函数。',
    ),
    source(
      'openstax-trig-functions',
      'OpenStax Precalculus 2e',
      'OpenStax',
      '2025 年访问版',
      'https://openstax.org/details/books/precalculus-2e',
      '核对角、单位圆和三角函数基础。',
    ),
    source(
      'openintro-statistics',
      'OpenIntro Statistics',
      'OpenIntro',
      '2025 年访问版',
      'https://www.openintro.org/book/os/',
      '核对模型、周期数据与图像解释。',
    ),
  ],
} satisfies LearningV2EventDetail;

const SEQUENCE_ARCHIVE = {
  id: 'sequence-recursion-explicit-induction',
  kind: 'concept',
  title: '递推与通项：规则怎样从一步推到一般',
  period: '学习阶段 01—06',
  summary:
    '递推公式描述相邻项如何生成，通项公式直接给出第 n 项。两者可互相转化，但必须核对首项、下标范围和等式是否对所有目标 n 成立。',
  background:
    '数列是定义在正整数上的函数。证明通项需要归纳或代数推导，不能只根据前几项猜一个规律就宣布成立。',
  timeline: [
    {
      date: '阶段 01',
      title: '数列是带下标的函数',
      body: 'a_n 表示第 n 项，定义域通常是正整数或其子集。改变起始下标会改变公式与和式，必须先核对。',
      sourceIds: ['openstax-sequences'],
    },
    {
      date: '阶段 02',
      title: '递推需要首项与转移规则',
      body: 'a_{n+1}=a_n+d 只有配合 a_1 才能唯一生成数列。缺首项时，同一个递推规则对应无限多条数列。',
      sourceIds: ['openstax-sequences'],
    },
    {
      date: '阶段 03',
      title: '等差与等比有明确结构',
      body: '等差数列相邻差固定，等比数列相邻比为固定非零常数。混合差分、比值和图像可识别类型。',
      sourceIds: ['openstax-arithmetic-sequences', 'openstax-geometric-sequences'],
    },
    {
      date: '阶段 04',
      title: '通项可直接定位远处项',
      body: 'a_n=a_1+(n−1)d 或 a_n=a_1 r^{n−1} 给出直接计算。公式中的 n−1 来自首项到第 n 项有 n−1 次转移。',
      sourceIds: ['openstax-arithmetic-sequences'],
    },
    {
      date: '阶段 05',
      title: '归纳证明覆盖所有正整数',
      body: '归纳先验证起点，再假设某个 n 成立并推出 n+1。两段合起来覆盖无限多个情形，前几项验证不能替代归纳。',
      sourceIds: ['openstax-sequences'],
    },
    {
      date: '阶段 06',
      title: '用反例与边界检查公式',
      body: '把 n=1、n=2 和较大 n 代入通项可发现下标偏移。非整数 n 不符合数列定义；现实模型还要检查最大项或终止条件。',
      sourceIds: ['openstax-sequences', 'openstax-geometric-sequences'],
    },
  ],
  outcome:
    '可观察结果是能由首项和递推生成数列，推导或验证通项，并说明归纳证明的起点和转移。',
  significance:
    '数列把离散变化、函数与证明连接起来，是后续极限和算法分析的基础。',
  sourceCards: [
    source(
      'openstax-sequences',
      '9.1 Sequences and Their Notations',
      'OpenStax College Algebra 2e',
      '2025 年访问版',
      'https://openstax.org/books/college-algebra-2e/pages/9-1-sequences-and-their-notations',
      '核对数列、递推、通项与下标。',
    ),
    source(
      'openstax-arithmetic-sequences',
      '9.2 Arithmetic Sequences',
      'OpenStax College Algebra 2e',
      '2025 年访问版',
      'https://openstax.org/books/college-algebra-2e/pages/9-2-arithmetic-sequences',
      '核对等差数列与通项。',
    ),
    source(
      'openstax-geometric-sequences',
      '9.3 Geometric Sequences',
      'OpenStax College Algebra 2e',
      '2025 年访问版',
      'https://openstax.org/books/college-algebra-2e/pages/9-3-geometric-sequences',
      '核对等比数列、公比与通项。',
    ),
    source(
      'sep-proof-theory',
      'Proof Theory',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/proof-theory/',
      '核对证明结构和归纳推理背景。',
    ),
  ],
} satisfies LearningV2EventDetail;

const ANALYTIC_ARCHIVE = {
  id: 'analytic-geometry-locus-equation',
  kind: 'concept',
  title: '方程与图形：坐标怎样把轨迹变成关系',
  period: '学习阶段 01—06',
  summary:
    '解析几何把点的位置写成坐标，把满足距离、方向或焦点条件的轨迹写成方程。图形提供直观，代数方程提供可验证的精确关系。',
  background:
    '圆和椭圆定义简洁，但方程含平方、中心和半径或半轴。配方、距离和参数条件决定图形是否存在、是否退化。',
  timeline: [
    {
      date: '阶段 01',
      title: '坐标把几何关系变成变量',
      body: '点用有序数对表示，距离由勾股关系计算。坐标选择会改变方程复杂度，但不改变几何对象。',
      sourceIds: ['openstax-analytic'],
    },
    {
      date: '阶段 02',
      title: '轨迹由条件定义',
      body: '圆是到定点距离等于定长的点集，椭圆是到两焦点距离和为常数的点集。先写条件，再化简方程。',
      sourceIds: ['openstax-ellipse'],
    },
    {
      date: '阶段 03',
      title: '标准方程暴露中心和参数',
      body: '椭圆标准式 x²/a²+y²/b²=1 中 a、b 是半轴长度，焦点位置由 c²=a²−b² 决定。参数必须满足正数与大小关系。',
      sourceIds: ['openstax-ellipse'],
    },
    {
      date: '阶段 04',
      title: '配方从一般式恢复标准式',
      body: '一般二次方程可通过配方得到中心与半轴。配方保持等式，必须同时处理常数项，否则中心或半径错误。',
      sourceIds: ['openstax-ellipse', 'openstax-hyperbola'],
    },
    {
      date: '阶段 05',
      title: '联立方程求交点',
      body: '曲线交点同时满足两个方程。代入或相减后要对解做图形验证，因为平方变形可能引入额外解。',
      sourceIds: ['openstax-parabola'],
    },
    {
      date: '阶段 06',
      title: '退化与情境限制',
      body: '半径为零、半轴不正或判别式不符可能得到点、空集或不同曲线。现实模型还要限制单位和参数范围。',
      sourceIds: ['openstax-ellipse', 'openstax-hyperbola'],
    },
  ],
  outcome:
    '可观察结果是能由轨迹定义建立方程、识别参数、配方恢复标准式，并用点或交点验证图形。',
  significance:
    '解析几何把空间直觉、代数和证明连接，是后续向量和微积分几何应用的基础。',
  sourceCards: [
    source(
      'openstax-ellipse',
      '8.1 The Ellipse',
      'OpenStax College Algebra 2e',
      '2025 年访问版',
      'https://openstax.org/books/college-algebra-2e/pages/8-1-the-ellipse',
      '核对椭圆定义、标准方程、焦点与中心。',
    ),
    source(
      'openstax-hyperbola',
      '8.2 The Hyperbola',
      'OpenStax College Algebra 2e',
      '2025 年访问版',
      'https://openstax.org/books/college-algebra-2e/pages/8-2-the-hyperbola',
      '核对双曲线标准式、参数与渐近线。',
    ),
    source(
      'openstax-parabola',
      '8.3 The Parabola',
      'OpenStax College Algebra 2e',
      '2025 年访问版',
      'https://openstax.org/books/college-algebra-2e/pages/8-3-the-parabola',
      '核对焦点、准线和抛物线方程。',
    ),
    source(
      'openstax-analytic',
      'OpenStax College Algebra 2e',
      'OpenStax',
      '2025 年访问版',
      'https://openstax.org/details/books/college-algebra-2e',
      '核对坐标、方程和函数图像基础。',
    ),
  ],
} satisfies LearningV2EventDetail;

const DERIVATIVE_ARCHIVE = {
  id: 'derivative-limit-tangent',
  kind: 'concept',
  title: '导数：平均变化率如何逼近瞬时变化',
  period: '学习阶段 01—06',
  summary:
    '导数由差商的极限定义，描述函数在某一点的瞬时变化率和切线斜率。先算平均变化率，再让区间缩短，是理解导数的核心路径。',
  background:
    '把导数只当公式会忽略局部与单位。切线是极限位置，不是随意画一条碰到的线；函数不可连续或尖点时，导数可能不存在。',
  timeline: [
    {
      date: '阶段 01',
      title: '平均变化率连接两个点',
      body: '区间 [a,b] 上的平均变化率是 (f(b)−f(a))/(b−a)，单位是函数单位除以变量单位。它描述整段平均，不是某一点瞬时值。',
      sourceIds: ['openstax-derivative-definition'],
    },
    {
      date: '阶段 02',
      title: '差商随 h 缩小逼近切线',
      body: '在 x=a 附近取 a+h，差商连接两点。当 h 趋近 0 时，割线位置趋于切线，极限若存在就是导数。',
      sourceIds: ['openstax-derivative-definition'],
    },
    {
      date: '阶段 03',
      title: '导数成为新的函数',
      body: '对每个可导点求极限可得到导函数。导数的定义域是原函数中极限存在的点，不一定与原函数定义域相同。',
      sourceIds: ['openstax-derivative-function'],
    },
    {
      date: '阶段 04',
      title: '规则来自极限结构',
      body: '幂函数、乘积和商的求导规则可由极限推导。规则加快计算，但仍需检查定义域、可导性和链式结构。',
      sourceIds: ['openstax-differentiation-rules'],
    },
    {
      date: '阶段 05',
      title: '符号、单位与图像互相检验',
      body: '导数正负对应局部增减，绝对值对应陡峭程度，单位对应两个量之比。图像检查不能替代极限证明，但可发现符号和量纲错误。',
      sourceIds: ['openstax-derivative-function'],
    },
    {
      date: '阶段 06',
      title: '尖点与不连续处可能不可导',
      body: '绝对值函数在尖点左右斜率不同，差商极限不存在；跳跃或断裂处更不可能可导。可导必然连续，连续不一定可导。',
      sourceIds: ['openstax-derivative-definition', 'openstax-derivative-function'],
    },
  ],
  outcome:
    '可观察结果是能用差商与极限求导，解释单位和局部变化，并指出不可导反例。',
  significance:
    '导数把平均变化、局部近似和优化连接起来，是微积分的基本语言。',
  sourceCards: [
    source(
      'openstax-derivative-definition',
      '3.1 Defining the Derivative',
      'OpenStax Calculus Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/calculus-volume-1/pages/3-1-defining-the-derivative',
      '核对差商、极限、切线与导数定义。',
    ),
    source(
      'openstax-derivative-function',
      '3.2 The Derivative as a Function',
      'OpenStax Calculus Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/calculus-volume-1/pages/3-2-the-derivative-as-a-function',
      '核对导函数、可导性与图像关系。',
    ),
    source(
      'openstax-differentiation-rules',
      '3.3 Differentiation Rules',
      'OpenStax Calculus Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/calculus-volume-1/pages/3-3-differentiation-rules',
      '核对幂、乘积和商的求导规则。',
    ),
    source(
      'openintro-statistics',
      'OpenIntro Statistics',
      'OpenIntro',
      '2025 年访问版',
      'https://www.openintro.org/book/os/',
      '核对变化率、单位和数据解释。',
    ),
  ],
} satisfies LearningV2EventDetail;

const STATS_ARCHIVE = {
  id: 'sample-evidence-uncertainty',
  kind: 'concept',
  title: '总体、样本与证据：统计结论为什么带不确定性',
  period: '学习阶段 01—06',
  summary:
    '统计用样本估计总体，但抽样方式、变异性和测量决定结论强度。概率模型描述随机性，观察结果只是证据，不等于总体真相或因果证明。',
  background:
    '新闻常把样本比例写成总体事实，把相关性写成因果。规范分析要说明总体、入样方式、样本量、变异性、估计和不确定性。',
  timeline: [
    {
      date: '阶段 01',
      title: '先定义总体与研究问题',
      body: '总体是所有目标单位，样本是被观察子集。总体定义若不清晰，任何比例或均值都缺少外推对象。',
      sourceIds: ['openstax-stats-definitions'],
    },
    {
      date: '阶段 02',
      title: '抽样方式决定代表性',
      body: '方便样本、自选样本和随机样本的入样机制不同。样本量大可减少波动，但不能自动修复选择偏差。',
      sourceIds: ['openstax-sampling'],
    },
    {
      date: '阶段 03',
      title: '变异性是数据的一部分',
      body: '同一总体不同样本会给出不同统计量。报告均值和比例时要同时看分散程度、样本量和分布。',
      sourceIds: ['openstax-sampling', 'openintro-statistics'],
    },
    {
      date: '阶段 04',
      title: '概率描述随机模型',
      body: '概率给出在模型下的相对可能性，实际观察频率会波动。一次显著结果或多重比较可能产生误导。',
      sourceIds: ['sep-probability-interpretations'],
    },
    {
      date: '阶段 05',
      title: '估计需要区间与假设',
      body: '样本估计不是总体真值。置信区间和假设检验依赖抽样模型、独立性、误差和不缺失机制，报告时要说明边界。',
      sourceIds: ['openintro-statistics'],
    },
    {
      date: '阶段 06',
      title: '相关证据与因果需要不同设计',
      body: '观察研究可提示关联，因果主张需要时间、机制、混杂控制和反事实比较。统计显著性不等于现实重要性或因果。',
      sourceIds: ['openstax-sampling', 'openintro-statistics'],
    },
  ],
  outcome:
    '可观察结果是能写出总体、样本、统计量、变异性、估计范围和不能推出的结论。',
  significance:
    '统计训练把数字与推断边界连接，防止用样本结果制造绝对结论。',
  sourceCards: [
    source(
      'openstax-stats-definitions',
      '1.1 Definitions of Statistics, Probability, and Key Terms',
      'OpenStax Introductory Statistics 2e',
      '2025 年访问版',
      'https://openstax.org/books/introductory-statistics-2e/pages/1-1-definitions-of-statistics-probability-and-key-terms',
      '核对总体、样本、统计量与参数。',
    ),
    source(
      'openstax-sampling',
      '1.2 Data, Sampling, and Variation in Data and Sampling',
      'OpenStax Introductory Statistics 2e',
      '2025 年访问版',
      'https://openstax.org/books/introductory-statistics-2e/pages/1-2-data-sampling-and-variation-in-data-and-sampling',
      '核对抽样偏差、随机变异和数据类型。',
    ),
    source(
      'sep-probability-interpretations',
      'Interpretations of Probability',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/probability-interpret/',
      '核对概率模型与频率解释。',
    ),
    source(
      'openintro-statistics',
      'OpenIntro Statistics',
      'OpenIntro',
      '2025 年访问版',
      'https://www.openintro.org/book/os/',
      '核对描述统计、抽样分布和推断基础。',
    ),
  ],
} satisfies LearningV2EventDetail;

const QUADRATIC_SOURCES = [
  'OpenStax College Algebra 2e, 5.1 Quadratic Functions。https://openstax.org/books/college-algebra-2e/pages/5-1-quadratic-functions',
  'OpenStax College Algebra 2e, 3.5 Transformation of Functions。https://openstax.org/books/college-algebra-2e/pages/3-5-transformation-of-functions',
  'OpenIntro Statistics。https://www.openintro.org/book/os/',
  'Stanford Encyclopedia of Philosophy, Proof Theory。https://plato.stanford.edu/entries/proof-theory/',
];

const TRIG_SOURCES = [
  'OpenStax Precalculus 2e, 6.1 Graphs of the Sine and Cosine Functions。https://openstax.org/books/precalculus-2e/pages/6-1-graphs-of-the-sine-and-cosine-functions',
  'OpenStax Precalculus 2e, 6.2 Graphs of the Other Trigonometric Functions。https://openstax.org/books/precalculus-2e/pages/6-2-graphs-of-the-other-trigonometric-functions',
  'OpenStax Precalculus 2e。https://openstax.org/details/books/precalculus-2e',
  'OpenIntro Statistics。https://www.openintro.org/book/os/',
];

const SEQUENCE_SOURCES = [
  'OpenStax College Algebra 2e, 9.1 Sequences and Their Notations。https://openstax.org/books/college-algebra-2e/pages/9-1-sequences-and-their-notations',
  'OpenStax College Algebra 2e, 9.2 Arithmetic Sequences。https://openstax.org/books/college-algebra-2e/pages/9-2-arithmetic-sequences',
  'OpenStax College Algebra 2e, 9.3 Geometric Sequences。https://openstax.org/books/college-algebra-2e/pages/9-3-geometric-sequences',
  'Stanford Encyclopedia of Philosophy, Proof Theory。https://plato.stanford.edu/entries/proof-theory/',
];

const ANALYTIC_SOURCES = [
  'OpenStax College Algebra 2e, 8.1 The Ellipse。https://openstax.org/books/college-algebra-2e/pages/8-1-the-ellipse',
  'OpenStax College Algebra 2e, 8.2 The Hyperbola。https://openstax.org/books/college-algebra-2e/pages/8-2-the-hyperbola',
  'OpenStax College Algebra 2e, 8.3 The Parabola。https://openstax.org/books/college-algebra-2e/pages/8-3-the-parabola',
  'OpenStax College Algebra 2e。https://openstax.org/details/books/college-algebra-2e',
];

const DERIVATIVE_SOURCES = [
  'OpenStax Calculus Volume 1, 3.1 Defining the Derivative。https://openstax.org/books/calculus-volume-1/pages/3-1-defining-the-derivative',
  'OpenStax Calculus Volume 1, 3.2 The Derivative as a Function。https://openstax.org/books/calculus-volume-1/pages/3-2-the-derivative-as-a-function',
  'OpenStax Calculus Volume 1, 3.3 Differentiation Rules。https://openstax.org/books/calculus-volume-1/pages/3-3-differentiation-rules',
  'OpenIntro Statistics。https://www.openintro.org/book/os/',
];

const STATS_SOURCES = [
  'OpenStax Introductory Statistics 2e, 1.1 Definitions of Statistics, Probability, and Key Terms。https://openstax.org/books/introductory-statistics-2e/pages/1-1-definitions-of-statistics-probability-and-key-terms',
  'OpenStax Introductory Statistics 2e, 1.2 Data, Sampling, and Variation。https://openstax.org/books/introductory-statistics-2e/pages/1-2-data-sampling-and-variation-in-data-and-sampling',
  'Stanford Encyclopedia of Philosophy, Interpretations of Probability。https://plato.stanford.edu/entries/probability-interpret/',
  'OpenIntro Statistics。https://www.openintro.org/book/os/',
];

export const MATH_HIGH_SCHOOL_REWRITE: CuratedCoursePlanPatchMap = {
  'math:二次函数：参数如何改变图像': {
    contentStatus: 'reviewed',
    prerequisite: '会画 y=x²，能进行完全平方配方和代入计算。',
    plainLanguageGoal:
      '学完后，你能由标准式配方得到顶点式，解释 a、h、k 对图像的影响，并用对称取样验证。',
    guidedPractice:
      '完成 8 个二次函数的标准式—顶点式—图像转换，标出开口、顶点、对称轴、定义域和两个检验点。',
    independentPractice:
      '用二次函数建模一个面积或利润问题，先在限定区间找最值，再用图像和端点比较解释结果。',
    commonErrors: [
      '把 x−h 中的 h 符号读反，导致顶点左右颠倒。',
      '只看顶点求最值，忽略现实定义域和区间端点。',
      '配方时只在一边加减常数，破坏等式恒等。',
    ],
    sourceRefs: QUADRATIC_SOURCES,
    studyPoints: [
      point('必背', 'y=a(x−h)²+k 中 a≠0，顶点为 (h,k)，对称轴 x=h；a 的符号决定开口，绝对值影响宽窄。', 1),
      point('重点', '标准式配方可证明顶点式，对称轴两侧等距点的函数值相等可用于核对。', 2),
      point('易错', '顶点最大值或最小值只在定义域内成立；现实区间可能让最优值落在端点。', 4),
    ],
    eventDetails: [QUADRATIC_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜为什么图像左右移动总读反',
        body:
          '给出 y=(x−3)²+1 与 y=(x+3)²+1，先做前测让学习者判断顶点、对称轴和左右移动。记录是否把 x−3 读成形似 x+3，是否通过代点验证。变式把 k 改为 −2，要求找出最小值。反例可选 x=3 附近点并说明括号为零的位置。前测不仅看答案，还要求写“何时平方项为零”的理由，随后用标准式配方检验。',
        note: '顶点由平方项为零定位。',
        objective: '能用平方项为零、代点和图像前测诊断二次函数平移错误。',
        practice: '完成三组顶点判断，写平方项为零的 x、顶点、对称轴和两个取样点。',
        checkpoint: '检查符号方向，代点是否对称，是否说明 a=0 时不再是二次函数。',
      },
      {
        title: '材料与概念｜参数、顶点式与配方',
        body:
          '二次函数 y=a(x−h)²+k，a≠0。a 的符号决定开口，|a| 越大图形越窄；顶点 (h,k)，对称轴 x=h。标准式 ax²+bx+c 可通过配方得到顶点式，配方是恒等变形而非换皮。定义域可受情境限制，开口向上的顶点是最小值点，但在有限区间还要比较端点。图像、代点和配方三者应互相验证。',
        note: '图形结论要回到代数条件。',
        objective: '能解释 a、h、k、顶点、对称轴、定义域与最值的关系。',
        practice: '为一个顶点式和一个标准式各写参数条件、顶点、对称轴、两个取样点和变式。',
        checkpoint: '检查 a≠0，h 符号正确，配方等式保持，定义域与最值判断一致。',
      },
      {
        title: '示范与推导｜从标准式配到顶点式',
        body:
          '以 y=2x²−12x+11 为例，提取 2 得 2(x²−6x)+11，再配成 2[(x−3)²−9]+11=2(x−3)²−7。顶点 (3,−7)，对称轴 x=3，开口向上；代 x=2 和 x=4 都得到 −5，验证对称。反例是漏掉括号外的 2 导致写成 (x−3)²−9+11，参数结构完全错误。再用顶点式还原标准式完成双向检验。',
        note: '配方每一步都要保持等式。',
        objective: '能通过配方从标准式得到顶点，并用对称点验证。',
        practice: '完成一个标准式的配方、顶点、对称点、反向展开和参数变式。',
        checkpoint: '检查提取系数、配平常数、顶点符号、对称点和标准式双向变形是否一致。',
      },
      {
        title: '引导练习｜八组函数与图像转换',
        body:
          '准备八组函数，覆盖开口上下、h 正负、k 平移和有限定义域。每组先做前测预测顶点和开口，再完成标准式与顶点式互化，画草图并取两个对称点。后测改变一个参数做变式，观察顶点和最值怎样变化。记录符号、配方、定义域和最值四类错误。若顶点不在允许区间，最值必须比较端点，不能继续套顶点结论。',
        note: '最值问题先看定义域。',
        objective: '能完成八组二次函数转换，并在有限区间比较顶点与端点。',
        practice: '提交八组参数表、配方过程、草图、对称点、有限区间最值和错误分类。',
        checkpoint: '检查 a≠0、顶点和对称轴正确，取样可验证，区间最值没有遗漏端点。',
      },
      {
        title: '独立迁移与评价｜用抛物线解决受限优化',
        body:
          '选择面积、利润或抛物线运动情境，先做前测定义变量和允许区间，再建二次函数、配方求顶点，并用端点和取样点验证。24 小时后改变一个约束做变式。评价四项：模型合理、配方正确、定义域完整、解释可验。最后写一个“顶点是数学最值但不在现实区间”的反例。函数图像帮助判断，结论仍需回到实际限制。',
        note: '数学顶点不一定可实施。',
        objective: '能把二次函数迁移到受限优化，并用图像、代数与现实条件验证。',
        practice: '提交建模、配方、顶点与端点比较、24 小时变式、现实反例和四项自评。',
        checkpoint: '四项自评：模型清楚、配方等价、区间完整、解释现实；任一条件缺失都要重算。',
      },
    ],
    quiz: [
      question(
        'y=−2(x−3)²+4 的顶点和开口是什么？',
        '顶点 (3,4)，因为 a<0 开口向下',
        ['顶点 (−3,4)，开口向上', '顶点 (3,−4)，开口向下', '顶点 (4,3)，开口向上'],
        0,
        '平方项在 x=3 时为零，因此最大值为 4；a=−2<0 表示开口向下并变窄。符号和顶点分别判断，避免把 h 与 k 读反。',
        '事实与定义',
      ),
      question(
        '为什么 x=2 与 x=4 的函数值相等可作为核对？',
        '两点关于对称轴 x=3 等距，二次函数图像关于该轴成对对应',
        ['因为两点都是偶数', '因为 a 一定为正', '因为顶点在原点'],
        1,
        '对称轴 x=h 时，h±d 的平方项相同。取一对对称点能发现 h 或配方符号错误，但不能代替完整推导，也不能判断有限区间最值。',
        '材料与推导',
      ),
      question(
        '哪种最值判断最容易出错？',
        '不检查现实定义域，直接把顶点当允许区间内的最值',
        ['先配方再判断', '比较端点与顶点', '检查 a 的符号'],
        2,
        '顶点只在定义域内可用。若允许区间不包含顶点，最值可能出现在端点，必须把顶点、端点和开口方向一起比较。',
        '常见误区',
      ),
      question(
        '把二次函数迁移到利润优化时，哪种验证最完整？',
        '配方得到顶点，同时检查价格区间、端点和单位',
        ['只画一张图', '只看顶点坐标', '忽略负数价格'],
        0,
        '利润模型有价格范围和单位，顶点只是候选最优点。端点、可行性和图像能共同验证结论，负价格或超容量必须排除。',
        '迁移应用',
      ),
    ],
  },
  'math:三角函数的周期与相位': {
    contentStatus: 'reviewed',
    prerequisite: '熟悉正弦、余弦图像，能使用弧度并读取函数峰谷。',
    plainLanguageGoal:
      '学完后，你能从图像或情境读出振幅、中线、周期、相位和定义域，并写出可检验的正弦模型。',
    guidedPractice:
      '分析 8 个正弦图像或周期数据，写出参数、方程、定义域和两个检验点。',
    independentPractice:
      '用潮汐、温度或轮子高度数据建立正弦模型，做参数解释、预测和误差检查。',
    commonErrors: [
      '把相位参数 C 与 Bx−φ 中的 φ 混为一谈。',
      '角度与弧度混用，导致周期或相位倍率错误。',
      '只凭一个峰值确定模型，没有检查谷值、周期和定义域。',
    ],
    sourceRefs: TRIG_SOURCES,
    studyPoints: [
      point('必背', 'y=A sin(B(x−C))+D 中振幅为 |A|，周期为 2π/|B|，中线为 y=D，水平相位移动为 C。', 1),
      point('重点', '若写成 Bx−φ，相位移动是 φ/B；角度与弧度必须统一。', 2),
      point('易错', 'A 为负只表示翻转，振幅仍取绝对值；一个峰值不能唯一确定周期。', 4),
    ],
    eventDetails: [TRIG_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜峰值位置为什么不是相位本身',
        body:
          '给出一个峰谷图像，先做前测读最大值、最小值、中线、周期和第一个峰值位置。要求写 y=A sin(B(x−C))+D 中各参数。记录是否把峰值横坐标直接当 C，是否混用角度。反例是保持 C 不变把 B 加倍，周期缩短且波形拥挤。后测用一个正弦表或图像拟合同样的参数，并要求代入峰谷点验证。',
        note: '先读图像量，再写参数。',
        objective: '能从峰谷、周期和相位前测识别参数定义与单位错误。',
        practice: '完成一个图像参数表：最大值、最小值、中线、振幅、周期、相位和两个检验点。',
        checkpoint: '检查中线与振幅关系，周期单位一致，相位移动与 B 的倍率正确。',
      },
      {
        title: '材料与概念｜振幅、周期、相位与中线',
        body:
          '正弦的基本周期为 2π。加入 B 后，B 越大，完成一次完整循环所需 x 越短，因此周期为 2π/|B|。A 的绝对值是振幅，A<0 会让图像上下翻转；D 把整条曲线上下平移，中线为 y=D。相位由 B 与括号内的移动共同决定。图像的定义域可以是全体实数，但现实周期模型常把时间限制为非负并设定观察窗口。频率是周期的倒数。',
        note: '参数之间不是同一个单位。',
        objective: '能解释振幅、周期、相位、频率、中线、定义域和值域。',
        practice: '为一个正弦函数写出五参数表、值域、定义域和一条相位或周期变式。',
        checkpoint: '检查参数单位，B 不为零，相位与 B 一同计算，定义域符合情境。',
      },
      {
        title: '示范与推导｜从峰谷反推模型',
        body:
          '若最大值为 7、最小值为 1，则中线 D=4、振幅 |A|=3；相邻峰值间隔 12 小时，则 2π/|B|=12，取 B=π/6。若第一个峰值在 t=3，则令相位项在 t=3 达到 π/2，或使用平移形式 A cos(...) 避免混淆。示范用峰、谷、中线三点代入，发现 C 偏一单位会同时错开所有峰值。反例是把角度制周期直接代入弧度公式。',
        note: '每个参数都要有图像证据。',
        objective: '能由最大值、最小值、周期和峰值位置建立并验证正弦模型。',
        practice: '完成一个从峰谷到方程的推导，写出参数、单位、代点和一次错误修正。',
        checkpoint: '检查中线与振幅，B 与周期互逆，相位代点正确，没有角度弧度混用。',
      },
      {
        title: '引导练习｜八组图像与周期数据',
        body:
          '准备八组正弦图像或数据，覆盖不同振幅、周期、相位和纵向平移。每组先做前测读参数，再写方程，后测取三个点验证，并做 B 加倍或 C 平移的变式。记录振幅绝对化、周期倒数、相位倍率和角度弧度混用四类错误。若只用一个点匹配，必须再加峰谷与周期约束，否则多个模型可能同时通过，预测也无法区分。',
        note: '模型要多点共同验证。',
        objective: '能对八组周期现象完成参数读取、方程建立和变式检验。',
        practice: '提交八张参数表、方程、三点代入、两种参数变式，以及按四类错因整理的记录。',
        checkpoint: '检查周期与 B 关系，相位与移动量，振幅符号，值域和现实窗口。',
      },
      {
        title: '独立迁移与评价｜建立可解释的周期模型',
        body:
          '选择潮汐、温度或轮子高度数据，先做前测判断是否适合正弦模型，再估最大值、最小值、周期和相位。写模型后预测两个时间点，并用留出的数据检验。24 小时后加入一个异常点做变式。评价四项：参数有理、单位一致、预测可验、边界明确。最后说明模型不能解释的部分，例如天气突变或设备故障，避免把相关性当机制。',
        note: '周期模型只描述可重复结构。',
        objective: '能把三角函数迁移到真实周期数据，并用回测与边界评价模型。',
        practice: '提交数据参数、方程、两次预测、留出检验、24 小时异常点和模型边界。',
        checkpoint: '四项自评：参数正确、单位一致、预测有据、边界明确；异常不能靠调参数掩盖。',
      },
    ],
    quiz: [
      question(
        'y=A sin(B(x−C))+D 中，周期等于什么？',
        '2π/|B|（B 按弧度单位解释）',
        ['2π/|A|', 'C/B', '|D|'],
        0,
        'B 决定波形在水平方向重复的快慢。|B| 越大周期越短；C 只描述相位移动，D 是中线的平移，A 则控制振幅和翻转。',
        '事实与定义',
      ),
      question(
        '最大值 7、最小值 1 的正弦模型，中线与振幅分别是多少？',
        '中线 4，振幅 3',
        ['中线 8，振幅 6', '中线 1，振幅 7', '中线 3，振幅 4'],
        1,
        '中线是最大值与最小值的平均：(7+1)/2=4；振幅是到中线的距离：7−4=3。两个量不能从单个峰值直接得到。',
        '材料与推导',
      ),
      question(
        '哪种错误最容易让相位整体错开？',
        '把 Bx−φ 中的 φ 直接当水平移动，而不除以 B',
        ['先算周期再算相位', '用峰谷计算中线', '检查角度弧度'],
        2,
        '两种写法的参数化不同。Bx−φ 的零点在 x=φ/B，直接取 φ 会按 B 的倍率错位，所有峰谷会整体偏移。',
        '常见误区',
      ),
      question(
        '把正弦模型迁移到温度预测时，哪种边界最重要？',
        '季节、地点和天气突变可能使单一周期模型不适用',
        ['只要有一个峰值就能预测全年', '温度没有单位', '振幅一定为负'],
        0,
        '周期模型描述可重复的平均结构，不自动解释异常天气。外推范围、地点和季节必须写清，留出数据也要用于检验。',
        '迁移应用',
      ),
    ],
  },
  'math:数列：递推与通项': {
    contentStatus: 'reviewed',
    prerequisite: '认识函数、下标，会做整数幂和简单代数变形。',
    plainLanguageGoal:
      '学完后，你能从首项和递推生成数列，识别等差或等比结构，写出通项并用归纳或代入验证。',
    guidedPractice:
      '分析 10 个数列，完成前 6 项、差分或比值、递推式、通项公式和至少两个下标检验。',
    independentPractice:
      '为储蓄、增长或排班建立数列模型，写首项、递推、通项和适用范围。',
    commonErrors: [
      '缺首项却直接由递推断言唯一数列。',
      '通项中的 n−1 写成 n，导致首项错位。',
      '只看前几项猜规律，没有归纳或代数验证。',
    ],
    sourceRefs: SEQUENCE_SOURCES,
    studyPoints: [
      point('必背', '数列是定义在整数下标上的函数；递推必须包含首项与转移规则，通项要说明下标范围。', 1),
      point('重点', '等差数列看相邻差，等比数列看相邻比；通项中的 n−1 对应从首项开始的转移次数。', 2),
      point('易错', '有限项可由多种公式拟合，必须用递推、归纳或更多条件验证。', 4),
    ],
    eventDetails: [SEQUENCE_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜前四项能猜出唯一规律吗',
        body:
          '给出 1,3,5,7，先做前测让学习者写下一项并解释。常见答案是 9，但要求再构造一个前三项相同而第四项不同的规则作为反例，说明有限项不能唯一决定规律。记录是否只看表面差、是否缺首项、是否验证通项。变式改成 1,3,9,27，要求区分等差和等比。后测用递推与通项同时预测第 10 项，并检查下标与首项。',
        note: '有限项不自动决定规律。',
        objective: '能用差分、比值和反例诊断数列模式的不唯一性。',
        practice: '为两组前四项各写两种可能规律、首项、递推式和第 10 项预测。',
        checkpoint: '检查是否说明规则依据，是否保留反例，是否写好 n 的起始值。',
      },
      {
        title: '材料与概念｜数列、递推与通项',
        body:
          '数列可看作 a_n=f(n)，n 通常取正整数。递推公式用前一或前几项生成后项，必须配首项；通项直接计算第 n 项。等差数列满足 a_{n+1}−a_n=d，等比数列满足 a_{n+1}/a_n=r（r≠0且分母非零）。数列的单调性比较相邻项，极限与本节暂不展开。通项证明可用归纳：验证起项，再由假设推出下一项。',
        note: '首项和下标是模型的一部分。',
        objective: '能解释数列、递推、通项、首项、单调性和归纳的关系。',
        practice: '为等差与等比各写首项、递推、通项、下标范围、单调条件和一项反例。',
        checkpoint: '检查递推是否完整，通项下标与起始值是否正确，单调判断是否有相邻项比较依据。',
      },
      {
        title: '示范与推导｜从 3n−2 到递推',
        body:
          'a_n=3n−2 前几项为 1,4,7,10。相邻差 a_{n+1}−a_n=3，因此它是等差数列，首项 a_1=1，递推为 a_{n+1}=a_n+3。反过来由递推生成项，再用归纳证明 a_n=1+3(n−1)=3n−2。反例是把 a_n 写成 3n+1，代入 n=1 会发现首项不符。再用 n=2 和 n=10 验证，确保不是只对一个点巧合。',
        note: '通项与递推可互相校验。',
        objective: '能把通项转成递推，再由首项和递推归纳回通项。',
        practice: '为一个等差数列写出 6 项、递推、通项、两处代入和归纳两步。',
        checkpoint: '检查 n−1 结构，首项正确，递推与通项对同一列项一致。',
      },
      {
        title: '引导练习｜十个数列的多路验证',
        body:
          '准备十个数列，覆盖等差、等比、平方型、递推混合和无法唯一确定的反例。每组先做前测写前 6 项，再算差分或比值，写可能递推和通项。后测改变首项或公差做变式，检查公式如何移动。记录缺首项、idx 偏移、比值除零和模式过拟合。若前几项只能支持一个猜测，应明确保留多种模型并用额外条件区分。',
        note: '无法唯一时保留竞争模型。',
        objective: '能对十个数列完成差分、递推、通项和变式验证。',
        practice: '提交十张数列验证表、通项、两处下标代入、一个模式反例和两个参数变式。',
        checkpoint: '检查下标范围、首项、差分或比值，是否为不确定模式保留替代模型。',
      },
      {
        title: '独立迁移与评价｜用数列描述累积变化',
        body:
          '选择储蓄、增长或排班情境，先做前测定义首项和每次变化，再写递推、通项和范围。用第 1、2、10 项及一个情境约束检查。24 小时后改变增长率或起点做变式。评价四项：变量有意义、递推完整、通项可验、边界合理。最后写一个模型不能适用的情境，例如增长突然受资源上限限制，或离散资源不能取分数。',
        note: '递推模型要说明能持续到何时。',
        objective: '能把数列迁移到真实累积过程，并用多项和情境边界评价。',
        practice: '提交建模、递推、通项、三项代入、24 小时变式和适用边界。',
        checkpoint: '四项自评：变量清楚、递推完整、通项可验、边界明确；超出条件时不得继续套用。',
      },
    ],
    quiz: [
      question(
        '递推公式 a_{n+1}=a_n+3 为什么不足以唯一确定数列？',
        '还必须给出首项 a_1，缺少起点会有很多条平移数列',
        ['因为 3 太小', '因为所有数列都必须等比', '因为 n 不能是整数'],
        0,
        '递推只规定相邻变化。不同首项会生成不同数列，因此首项与下标范围必须一起写，缺一就无法唯一预测远处项。',
        '事实与定义',
      ),
      question(
        'a_n=3n−2 的第 1 项和第 10 项分别是多少？',
        '1 和 28',
        ['2 和 30', '3 和 28', '1 和 29'],
        1,
        '代入 n=1 得 1，代入 n=10 得 28。两处代入能发现公式中的 n−1 偏移或常数错误，也能核对递推产生的前几项。',
        '材料与推导',
      ),
      question(
        '只看 1,3,5,7 后直接断定下一项一定是 9，错在哪里？',
        '有限前项可以有多种规则，额外规律或条件才能区分',
        ['因为奇数不能组成数列', '因为下一项一定是 11', '因为数列必须有递推'],
        2,
        '连续奇数是合理规律，但不是唯一可能。若题目要求唯一答案，必须提供额外限制，例如说明等差或给出后续项。',
        '常见误区',
      ),
      question(
        '把数列迁移到分期储蓄时，哪种做法最完整？',
        '定义首期金额、每期变化、下标范围和现实上限，再验证前几期',
        ['只写最后总额', '忽略首期金额', '把任何增长都当无限等比'],
        0,
        '金融或资源模型需要起点、变化规则和边界。数列公式可预测，但超出适用条件时要调整模型，不能把增长无限外推。',
        '迁移应用',
      ),
    ],
  },
  'math:解析几何：方程与图形': {
    contentStatus: 'reviewed',
    prerequisite: '会计算两点距离，了解圆的方程和完全平方配方。',
    plainLanguageGoal:
      '学完后，你能由轨迹条件建立曲线方程，识别中心和半轴，通过配方和点检验验证图形。',
    guidedPractice:
      '完成 8 个圆、抛物线或椭圆任务，从定义、方程、参数、中心和检验点互相对应。',
    independentPractice:
      '为一个距离或焦点条件建立轨迹方程，画出图形并用至少两个点验证。',
    commonErrors: [
      '只看方程二次项就直接分类，忽略中心、半轴符号和参数条件。',
      '配方时漏掉括号系数或常数调整。',
      '平方后引入额外解，不回到几何定义检验。',
    ],
    sourceRefs: ANALYTIC_SOURCES,
    studyPoints: [
      point('必背', '解析几何先写轨迹条件，再把距离或焦点关系化为方程；标准式中的中心、半轴、焦点必须满足条件。', 1),
      point('重点', '配方可从一般式恢复中心和半轴，点检验可发现参数与图形不一致。', 2),
      point('易错', '方程有平方不代表一定是同一种曲线；参数为零或符号错误可能退化为点、直线或空集。', 4),
    ],
    eventDetails: [ANALYTIC_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜所有平方项都表示同一个圆吗',
        body:
          '给出三个二次方程，先做前测判断曲线类型、中心和关键参数，并选一个点检验。记录是否只看 x²+y²，是否忽略系数与右端常数，是否把方程外形当成完整定义。反例是 x²+y²=0 只表示一个点，x²+y²=−1 在实数平面为空集。后测加入配方和参数变式，观察一般式如何恢复标准式，以及右端变化为何导致退化。',
        note: '先看条件，再看方程外形。',
        objective: '能用定义、参数条件和点检验诊断二次曲线分类错误。',
        practice: '完成三个方程的类型、中心、参数、两个检验点、定义条件和退化反例。',
        checkpoint: '检查标准式条件，配方是否正确，点是否满足原方程，是否标明空集或退化。',
      },
      {
        title: '材料与概念｜轨迹、标准式与配方',
        body:
          '几何轨迹可由距离、焦点或方向条件定义。圆和椭圆的方程包含中心、半径或半轴；标准式让参数直观，一般式需要配方恢复。椭圆要求 a、b 为正且焦点参数满足 c²=a²−b²（按长轴方向调整）。方程交点是同时满足两曲线的点。平方与代入可能扩大解集，最终要回到原定义和图形确认，不能只凭代数解数量判断几何关系。',
        note: '方程是轨迹条件的代数表达。',
        objective: '能解释轨迹条件、标准式、中心、半轴、焦点与配方的关系。',
        practice: '为一个圆和一个椭圆各写轨迹条件、标准式、中心和一项反例。',
        checkpoint: '检查参数正负、焦点关系、配方是否保持等式，以及几何定义与方程是否一致。',
      },
      {
        title: '示范与推导｜从一般式恢复到轨迹参数',
        body:
          '考虑 x²+4y²−6x+8y−3=0。分别对 x、y 配方，把常数移到右侧，得到中心与非负右端后才可判断椭圆或空集。示范每步保留原等式，并检查右端是否为正。反例是把 4y² 的配方常数忽略，中心或半轴就错。取中心和一个轴端点代入原方程，验证图形与参数一致；若右端为负，应立即停止画图并判为空集。',
        note: '配方后右端决定存在性。',
        objective: '能通过配方恢复中心与半轴，并判断曲线是否退化。',
        practice: '完成一个二次方程配方、曲线分类、中心、两个轴端点及退化条件判断。',
        checkpoint: '检查提取系数、配平常数、右端符号、退化判断和点代入是否一致。',
      },
      {
        title: '引导练习｜八组轨迹与方程互译',
        body:
          '准备八组任务，覆盖圆、椭圆、抛物线和退化方程。每组先做前测写轨迹条件，再写方程或配方，最后画图和取点。后测改变一个参数做变式，观察中心、半轴或焦点怎样移动。记录参数误读、配方错误、平方增根和图形分类四类问题。若右端为负，必须判空集而不是继续画；若平方操作引入额外点，必须逐个代回原方程。',
        note: '图形与代数必须双向核对。',
        objective: '能完成八组解析几何互译，并处理退化与平方增根。',
        practice: '提交八张轨迹表、方程、配方、草图、检验点、参数变式和退化条件。',
        checkpoint: '检查每个方程与定义一致，参数条件完整，交点和解均代回原方程。',
      },
      {
        title: '独立迁移与评价｜建立并验证自己的轨迹模型',
        body:
          '选择一个距离、焦点或反射条件，先做前测写轨迹定义，再建立方程、配方、画图并用至少两个点验证。24 小时后改变一个条件做变式。评价四项：定义清楚、方程正确、图形一致、边界完整。最后写一个平方后出现但几何上不成立的反例。解析几何不是只认方程形状，而是让条件与图形相互证明，并核对坐标尺度与单位。',
        note: '代数和几何要互相校验。',
        objective: '能把解析几何迁移到自定义轨迹，并用方程、点和图形评价模型。',
        practice: '提交轨迹定义、方程推导、配方、图形、24 小时变式、反例和四项自评。',
        checkpoint: '四项自评：定义完整、方程等价、图形吻合、边界明确；增根或退化必须单列。',
      },
    ],
    quiz: [
      question(
        '解析几何建立方程的第一步应做什么？',
        '明确轨迹的几何条件，再用坐标表示距离或关系',
        ['直接背一个标准方程', '只看二次项数量', '先画任意图形'],
        0,
        '方程应来自几何条件。先定义轨迹，再进行代数化，才能判断标准式和参数是否匹配，也能检查退化与增根，避免只凭方程外形分类。',
        '事实与定义',
      ),
      question(
        '配方后右端为负数时，实数平面上的圆方程表示什么？',
        '空集，因为平方和非负，不可能等于负数',
        ['一个大圆', '一条直线', '两个焦点'],
        1,
        '平方项不小于零，右端为负时没有实数点满足。若右端为零则退化为单点，需要按条件区分空集和点集，并回到几何定义。',
        '材料与推导',
      ),
      question(
        '哪种错误最容易导致解析几何图形错位？',
        '配方时漏掉括号系数带来的常数平衡',
        ['先写轨迹条件', '用距离公式', '把点代回原方程'],
        2,
        '配方必须保持等式，提取系数后新增常数要与原常数同步处理。否则中心和半轴会整体错误，点检验也会失败，后续分类结论随之失真。',
        '常见误区',
      ),
      question(
        '把解析几何迁移到卫星轨道建模时，哪种检查最关键？',
        '参数单位和焦点位置是否符合几何定义，并做轨道点验证',
        ['只看方程美观', '忽略坐标尺度', '删除异常点'],
        0,
        '轨道模型需要几何参数、单位和实际点匹配。只凭标准式形状不能说明模型适用，还要检查离心率、观测范围和坐标尺度。',
        '迁移应用',
      ),
    ],
  },
  'math:导数：变化率的局部语言': {
    contentStatus: 'reviewed',
    prerequisite: '会计算函数差商，理解极限的直观意义和图像斜率。',
    plainLanguageGoal:
      '学完后，你能从平均变化率推到差商极限，求简单函数导数，并用单位、图像和不可导反例解释结果。',
    guidedPractice:
      '完成 8 个平均变化率与差商任务，逐步求极限，并对多项式使用求导规则核对。',
    independentPractice:
      '用一个成本、速度或人口模型解释导数单位与局部变化，并指出模型失效点。',
    commonErrors: [
      '把平均变化率直接当瞬时导数。',
      '忽略 h→0 的极限过程，只在 h=0 处直接代入导致零除。',
      '只记求导公式，不检查定义域和不可导点。',
    ],
    sourceRefs: DERIVATIVE_SOURCES,
    studyPoints: [
      point('必背', '导数定义为差商在 h→0 时的极限，表示某点的瞬时变化率和切线斜率。', 1),
      point('重点', '平均变化率看区间，导数看局部；单位始终是函数单位除以自变量单位。', 2),
      point('易错', '可导必连续，连续不一定可导；尖点、跳跃或竖直切线处需单独检查。', 4),
    ],
    eventDetails: [DERIVATIVE_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜平均速度为什么不是瞬时速度',
        body:
          '给出一辆车在 0 到 10 秒内的位移，先做前测计算平均速度，再问第 5 秒瞬时速度能否直接用同一商。记录是否只算总位移、是否忽略区间、是否把差商中的 h 当零。变式让区间从 [0,10] 缩到 [4,6]，观察平均速度趋近。反例是 h=0 直接代入出现零除，说明必须研究极限而不是普通除法。',
        note: '先区分区间与点。',
        objective: '能用平均变化率、区间和差商前测识别瞬时速度误解。',
        practice: '计算三个区间的平均变化率，写出差商式、单位和一个 h=0 错误反例。',
        checkpoint: '检查区间正确，单位正确，是否区分平均与瞬时，是否保留极限过程。',
      },
      {
        title: '材料与概念｜差商、极限与切线',
        body:
          '函数 f 在 [a,a+h] 上的平均变化率是 (f(a+h)−f(a))/h。当 h 趋近 0，差商若趋于一个有限值，该值就是 f′(a)，也是切线斜率。导数描述局部变化，不是区间总量。单位是 y 单位/x 单位，符号表示方向。导函数在每个可导点给出导数；定义域可能缩小。可导要求函数连续且左右变化率一致。',
        note: '极限是导数定义的核心。',
        objective: '能解释差商、极限、瞬时变化率、切线与可导性。',
        practice: '为一个函数写平均变化率、差商、极限表达式和一个不可导反例。',
        checkpoint: '检查极限变量，单位，连续与可导区别，是否避免 h=0 直接代入。',
      },
      {
        title: '示范与推导｜用极限求 f(x)=x² 在 x=2 的导数',
        body:
          '差商为 ((2+h)²−4)/h=(4+4h+h²−4)/h=4+h。只要 h≠0，可化简为 4+h；令 h→0，极限为 4。因此切线斜率为 4，瞬时变化率为每改变 1 个 x 单位 y 约改变 4 个单位。反例是把 h=0 代入原差商，得到 0/0，说明必须先用代数化简。再用规则 f′(x)=2x 在 x=2 得 4，互相验证。',
        note: '先化简差商，再取极限。',
        objective: '能按差商化简和极限步骤求导，并用求导规则复核。',
        practice: '完成 x² 在 x=2 的详细推导、单位解释和规则对照。',
        checkpoint: '检查 h≠0 条件、差商化简、极限结果、单位解释和图像斜率是否一致。',
      },
      {
        title: '引导练习｜八个变化率与求导任务',
        body:
          '准备八题，覆盖多项式、分式、图像斜率、尖点和有限区间。每题先做前测算平均变化率，再用差商或规则求导数，最后用单位、点和图像验证。后测改变一点或区间做变式，比较结果。记录零除、极限遗漏、定义域和不可导四类错误。若函数在点不连续或左右斜率不一致，应明确写“导数不存在”，并说明是哪一个条件失败。',
        note: '不存在的导数也要有理由。',
        objective: '能完成八题的平均变化、差商极限、规则核对与不可导判断。',
        practice: '提交八题计算、至少两个图像验证、一个不可导反例和三类错误统计。',
        checkpoint: '检查极限过程完整，规则使用有定义域依据，不可导点不被强行套公式。',
      },
      {
        title: '独立迁移与评价｜解释一个真实变化率',
        body:
          '选择成本、速度、温度或人口模型，先做前测解释平均变化，再求导数并说明单位。用图形、样本点和数值区间验证。24 小时后改变输入点或单位做变式。评价四项：定义正确、单位清楚、局部解释合理、模型边界明确。最后写一个尖点或离散时间导致导数不可用的反例。导数描述局部，不等于长期全部变化，也不能脱离具体点谈斜率。',
        note: '导数解释必须带单位。',
        objective: '能把导数迁移到真实变化率，并用单位、图形和边界解释。',
        practice: '提交平均与瞬时变化对照、导数计算、单位解释、24 小时变式和不可导反例。',
        checkpoint: '四项自评：定义正确、单位一致、图像匹配、边界明确；无单位解释不能算完成。',
      },
    ],
    quiz: [
      question(
        '导数的定义最核心是什么？',
        '差商在 h→0 时的极限，表示某点瞬时变化率',
        ['任意两点的平均变化率', '函数最大值', '分母为 h 的普通代数式'],
        0,
        '导数必须经过极限过程。直接用 h=0 会产生除零，平均变化率只描述整个区间，二者不能混用，也不能省略化简步骤。',
        '事实与定义',
      ),
      question(
        'f(x)=x² 在 x=2 的导数为 4，单位应怎样解释？',
        'x 每增加一个单位时，y 在局部约增加 4 个单位',
        ['y 的绝对值一定为 4', '函数最大值为 4', '平均速度永远为 4'],
        1,
        '导数是局部变化率，单位是 y 单位/x 单位。它的数值不等于函数值，也不保证整个区间都按同样速度变化，必须带点和单位解释。',
        '材料与推导',
      ),
      question(
        '哪种情况最可能使导数不存在？',
        '尖点处左右斜率不同，或函数在该点不连续',
        ['函数在该点有定义', '图像经过原点', '导数为正'],
        2,
        '可导要求左右差商极限一致且函数连续。尖点或不连续会破坏条件，不能只代求导规则，必须回到定义检查左右极限。',
        '常见误区',
      ),
      question(
        '把导数迁移到成本模型时，哪种解释最完整？',
        '说明单位、当前产量附近边际成本，并限制模型适用范围',
        ['只看导数正负', '把导数当总成本', '忽略产量单位'],
        0,
        '边际成本是成本对产量的局部变化，单位通常是货币/单位产量。模型外推和离散生产还需另做处理，不能把导数当总成本或平均成本。',
        '迁移应用',
      ),
    ],
  },
  'math:概率统计：证据与不确定性': {
    contentStatus: 'reviewed',
    prerequisite: '会计算比例、均值，能读取基本图表和抽样描述。',
    plainLanguageGoal:
      '学完后，你能定义总体与样本，描述变异性，区分概率模型和观察结果，并写出样本证据不能推出的结论。',
    guidedPractice:
      '分析 6 个调查或实验摘要，写出总体、样本、统计量、变异性、抽样偏差和证据边界。',
    independentPractice:
      '评估一条公共数据结论，整理样本来源和变异，提出可改进抽样与不确定性表达。',
    commonErrors: [
      '把样本均值或比例直接当总体真值。',
      '样本很大就认为没有偏差，忽略入样方式。',
      '把统计显著、相关或一次结果直接解释成因果和确定性。',
    ],
    sourceRefs: STATS_SOURCES,
    studyPoints: [
      point('必背', '统计用样本估计总体；结论强度取决于抽样、样本量、变异、测量和外推范围。', 1),
      point('重点', '概率模型描述随机机制，实际频率会波动；估计应报告范围与不确定性。', 2),
      point('易错', '大样本不能自动修复选择偏差，显著结果也不等于现实重要或因果成立。', 4),
    ],
    eventDetails: [STATS_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜样本平均分能代表所有学生吗',
        body:
          '给出一项只覆盖活跃用户或自愿参与者的满意度调查，先做前测确定总体、样本、统计量和结论强度。记录是否只看样本量、是否忽略未回应者、是否把比例当总体真值。变式让样本量增大但仍是同一自选人群，观察结论能否自动变强。反例是只调查最满意用户，结果高但代表性差。后测要求写估计范围和不可推出的结论。',
        note: '先问谁进入样本。',
        objective: '能用总体、样本、统计量、入样机制和前测结果诊断统计外推。',
        practice: '完成调查前测，写出总体、样本、入样方式、遗漏人群和两个反例。',
        checkpoint: '检查是否区分样本与总体，是否记录偏差，是否避免用样本量替代代表性。',
      },
      {
        title: '材料与概念｜总体、样本、变异与估计',
        body:
          '总体是研究对象的全体，样本是实际观察子集。样本统计量随抽样变化，产生抽样变异；样本越大通常降低随机波动，但不修复系统选择偏差。概率分布描述随机模型，观察频率用于检验和估计。报告结果应写清样本来源、缺失、测量、统计量和不确定性。统计证据可以支持某范围内的推断，但不能自动说明因果，也不能替代价值判断。',
        note: '代表性来自入样机制。',
        objective: '能解释总体、样本、统计量、变异性、概率、估计与证据边界。',
        practice: '为一个调查写总体定义、两种抽样方式、变异性来源和一个因果误判反例。',
        checkpoint: '检查抽样机制清楚，变异来源具体，估计与总体范围匹配，因果主张有额外条件。',
      },
      {
        title: '示范与推导｜从样本比例推到有限估计',
        body:
          '假设 400 名随机样本中 240 人满意，样本比例为 0.6。示范先检查总体、抽样与缺失，再说明 0.6 是样本估计，不是总体真值。用不确定性和抽样模型给出合理区间后，结论应写成“总体比例可能在该范围”。反例是样本实际来自一个高满意渠道，随机区间无法修复选择偏差。统计推断的每一步都要写模型条件。',
        note: '区间不能修复错误总体。',
        objective: '能把样本统计量转成带范围和假设的估计结论。',
        practice: '完成一个比例的估计、缺失检查、变异来源、区间解释和两句带范围限定结论。',
        checkpoint: '检查总体与抽样方式，比例计算，区间解释和不能推出的因果结论。',
      },
      {
        title: '引导练习｜六个调查与实验摘要',
        body:
          '准备六份摘要，覆盖自选样本、随机样本、大样本偏差、重复测量、观察相关和实验比较。每份先做前测标注总体、样本、统计量、变异性、缺失和假设，再写支持与反对结论。后测改变样本来源或增加一次重复实验，判断证据如何变化。记录样本等同总体、偏差被大样本修复、显著等同重要和观察等同因果四类错误。',
        note: '证据变化要写清方向。',
        objective: '能对六类统计证据完成样本审查、估计和结论边界判断。',
        practice: '提交六张证据表、三项样本偏差、三项重复结果，以及结论强度变化与范围说明。',
        checkpoint: '检查总体样本匹配、变异性完整、推断范围有限，因果判断有设计依据。',
      },
      {
        title: '独立迁移与评价｜审读一条公共数据结论',
        body:
          '选择一条公共数据或研究报道，先做前测写原结论，再追查总体、抽样、样本量、测量、缺失和比较设计。24 小时后加入一条新证据更新结论。评价四项：数据可追、样本清楚、不确定性明确、因果边界合理。最后把绝对化标题改写成带范围、时间和条件的结论。统计帮助我们在不确定中做判断，不提供无误差真相。',
        note: '允许新证据改变结论。',
        objective: '能把统计证据审查迁移到公共报道，并用不确定性、反例和更新条件改写结论。',
        practice: '提交报道审查、24 小时新证据、限定改写、两个反例和四项自评。',
        checkpoint: '四项自评：来源可追、样本明确、估计有范围、因果有边界；缺失数据不得省略。',
      },
    ],
    quiz: [
      question(
        '总体与样本的关系是什么？',
        '总体是研究目标全体，样本是实际观察到并用于估计的子集',
        ['样本一定等于总体', '总体只包含受访者', '样本越大就一定代表总体'],
        0,
        '样本用于推断总体，但推断依赖入样方式。随机性、偏差和测量都会影响估计，不能把样本直接等同总体或总体真值，也不能省略不确定性。',
        '事实与定义',
      ),
      question(
        '样本量扩大但仍是同一自选渠道用户，能否修复选择偏差？',
        '不能，扩大同质样本只会让偏差估计更精确',
        ['可以，样本大就随机', '可以，比例会自动接近真值', '可以，删除缺失即可'],
        1,
        '大样本减少随机波动，但不改变谁被纳入。选择偏差需要改进总体覆盖和抽样机制，继续扩大同质样本只会更精确地偏离总体。',
        '材料与推导',
      ),
      question(
        '哪种结论最超出统计证据？',
        '看到一个显著相关就宣称已证明因果关系',
        ['报告样本比例和不确定性', '写清总体与缺失', '把观察结果作为相关证据'],
        2,
        '显著相关仍可能由混杂、反向或选择造成。因果需要设计、机制与替代解释检查，统计显著也可能缺乏现实重要性或实际幅度。',
        '常见误区',
      ),
      question(
        '把统计思维迁移到产品满意度调查时，哪种报告最稳妥？',
        '说明总体、抽样、缺失、样本比例与不确定性，并限定外推范围',
        ['只公布最高分', '把自选用户当全体', '删除低分回答'],
        0,
        '满意度调查需要透明样本与范围。低分和缺失也是信息，删除会制造偏差，平均分还应配分布和不确定范围，不能只报一个最高分。',
        '迁移应用',
      ),
    ],
  },
};
