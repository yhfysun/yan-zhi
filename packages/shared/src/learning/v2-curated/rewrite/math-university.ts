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

const LIMIT_ARCHIVE = {
  id: 'limit-continuity-formal-model',
  kind: 'concept',
  title: '极限与连续：邻域、左右逼近和点值',
  period: '学习阶段 01—06',
  summary:
    '极限描述自变量接近某点时函数值趋向何处，不要求该点有定义。连续则同时要求函数在该点有定义、极限存在且二者相等。',
  background:
    '从图像看接近容易把“点值”和“极限”混为一谈。形式定义用邻域和任意小误差说明逼近，并为单侧极限、间断与连续提供统一语言。',
  timeline: [
    {
      date: '阶段 01',
      title: '从左右两侧逼近',
      body: '考察 x 从左侧和右侧接近 a 时的函数值。若两侧趋势不一致，双侧极限不存在；空洞与函数值不影响极限。',
      sourceIds: ['openstax-limit-function'],
    },
    {
      date: '阶段 02',
      title: '用邻域表达接近',
      body: '极限要求当 x 足够接近 a 但不等于 a 时，f(x) 可以任意接近 L。形式 ε-δ 定义把“足够”和“任意接近”写成可验证条件。',
      sourceIds: ['openstax-limit-function', 'openstax-derivative'],
    },
    {
      date: '阶段 03',
      title: '单侧极限给分段函数定位',
      body: '分段函数在拼接点的左右极限可能不同。必须分别计算，不能只代拼接点值或用某一侧趋势代表整体。',
      sourceIds: ['openstax-limit-function'],
    },
    {
      date: '阶段 04',
      title: '连续需要三个条件同时成立',
      body: 'f(a) 有定义、lim_{x→a}f(x) 存在、两者相等。缺任何一项都产生间断，但间断类型可能不同。',
      sourceIds: ['openstax-continuity'],
    },
    {
      date: '阶段 05',
      title: '极限法则需要条件',
      body: '和、积、商与复合的极限法则各有前提。商的分母极限不能为零，复合需内外趋势匹配，不能机械拆式。',
      sourceIds: ['openstax-limit-function', 'openstax-continuity'],
    },
    {
      date: '阶段 06',
      title: '反例检验直觉',
      body: '在空洞处函数可能无定义但极限存在；跳跃点可能点值存在但极限不存在。反例检查图与公式是否满足完整定义。',
      sourceIds: ['openstax-continuity'],
    },
  ],
  outcome:
    '可观察结果是能计算左右极限，判断连续三条件，并用间断反例说明极限与函数值的区别。',
  significance:
    '极限为导数、积分和连续性提供共同基础，也训练“靠近但不等于”的精确数学语言。',
  sourceCards: [
    source(
      'openstax-limit-function',
      '2.2 The Limit of a Function',
      'OpenStax Calculus Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/calculus-volume-1/pages/2-2-the-limit-of-a-function',
      '核对极限、单侧极限与无穷趋势。',
    ),
    source(
      'openstax-continuity',
      '2.4 Continuity',
      'OpenStax Calculus Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/calculus-volume-1/pages/2-4-continuity',
      '核对连续定义与间断类型。',
    ),
    source(
      'openstax-derivative',
      '3.1 Defining the Derivative',
      'OpenStax Calculus Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/calculus-volume-1/pages/3-1-defining-the-derivative',
      '核对差商极限与局部逼近。',
    ),
    source(
      'openintro-statistics',
      'OpenIntro Statistics',
      'OpenIntro',
      '2025 年访问版',
      'https://www.openintro.org/book/os/',
      '核对连续模型与图像解释的一般背景。',
    ),
  ],
} satisfies LearningV2EventDetail;

const CALCULUS_ARCHIVE = {
  id: 'accumulation-fundamental-theorem',
  kind: 'concept',
  title: '微分与积分：局部变化怎样累积成整体',
  period: '学习阶段 01—06',
  summary:
    '导数研究局部变化率，定积分研究累积量。微积分基本定理把二者连接：累积函数的导数给出原函数，原函数差值可计算定积分。',
  background:
    '面积直觉容易忽略单位、符号和区间。 Riemann 和把区间切分后求近似，极限得到定积分；基本定理提供更高效的计算路径。',
  timeline: [
    {
      date: '阶段 01',
      title: '从矩形和近似累积',
      body: '把区间分成小段，用函数值乘宽度构造矩形和。分得越细，近似在合适条件下越接近定积分。',
      sourceIds: ['openstax-approximating-areas'],
    },
    {
      date: '阶段 02',
      title: '定积分表示带符号累积',
      body: '轴上方面积与下方面积符号不同。定积分是带符号累积，不等同于几何总面积；单位和变量必须保留。',
      sourceIds: ['openstax-definite-integral'],
    },
    {
      date: '阶段 03',
      title: '累积函数随终点变化',
      body: '把上限看成变量，累积函数 F(x) 表示从起点到 x 的总量。它的局部变化率由被积函数给出。',
      sourceIds: ['openstax-fundamental-theorem'],
    },
    {
      date: '阶段 04',
      title: '基本定理连接微分与积分',
      body: '在连续条件下，累积函数可导且导数为原函数；定积分可用原函数在端点差值计算。连续性等条件不可省略。',
      sourceIds: ['openstax-fundamental-theorem'],
    },
    {
      date: '阶段 05',
      title: '积分变量与上下限改变结果',
      body: '交换上下限会使符号相反；变量只是积分内部的名称。改变单位、区间或被积函数都会改变累积含义。',
      sourceIds: ['openstax-definite-integral'],
    },
    {
      date: '阶段 06',
      title: '用数值和反例检验',
      body: '矩形和、图像几何、导数回代和单位检查能发现错误。反例包括只算几何面积忽略负号，或把被积函数当结果。',
      sourceIds: ['openstax-approximating-areas', 'openstax-fundamental-theorem'],
    },
  ],
  outcome:
    '可观察结果是能解释积分累积、计算简单定积分，并用导数、单位、图像和数值近似验证。',
  significance:
    '微积分基本定理把变化率与总量连接，是物理、工程和概率模型的基础。',
  sourceCards: [
    source(
      'openstax-approximating-areas',
      '5.1 Approximating Areas',
      'OpenStax Calculus Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/calculus-volume-1/pages/5-1-approximating-areas',
      '核对矩形和与面积近似。',
    ),
    source(
      'openstax-definite-integral',
      '5.2 The Definite Integral',
      'OpenStax Calculus Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/calculus-volume-1/pages/5-2-the-definite-integral',
      '核对定积分、符号与累积意义。',
    ),
    source(
      'openstax-fundamental-theorem',
      '5.3 The Fundamental Theorem of Calculus',
      'OpenStax Calculus Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/calculus-volume-1/pages/5-3-the-fundamental-theorem-of-calculus',
      '核对累积函数、原函数与基本定理。',
    ),
    source(
      'openstax-derivative',
      '3.1 Defining the Derivative',
      'OpenStax Calculus Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/calculus-volume-1/pages/3-1-defining-the-derivative',
      '核对导数的局部变化率意义。',
    ),
  ],
} satisfies LearningV2EventDetail;

const LINEAR_ARCHIVE = {
  id: 'matrix-linear-transformation-model',
  kind: 'concept',
  title: '矩阵不是数字表：线性变换如何移动空间',
  period: '学习阶段 01—06',
  summary:
    '矩阵表示从向量空间到向量空间的线性变换。列向量给出基向量的像，秩描述输出维数，核描述被压为零的方向，特征向量描述只伸缩不变向的方向。',
  background:
    '把矩阵只当计算器会忽略几何。分解列向量、观察网格、核与像能帮助理解可逆性、维数和特征方向。',
  timeline: [
    {
      date: '阶段 01',
      title: '向量由基方向组合',
      body: '给定基后，每个向量可写成坐标组合。换基改变坐标表示，但不改变同一个几何向量，矩阵也会随基改变。',
      sourceIds: ['mit-linear-algebra'],
    },
    {
      date: '阶段 02',
      title: '矩阵乘法按列理解',
      body: 'A x 是 A 的列向量按 x 的坐标加权组合。列空间因此是矩阵所有可能输出的集合，也是线性变换的像空间。',
      sourceIds: ['mit-linear-algebra', 'axler-linear-algebra'],
    },
    {
      date: '阶段 03',
      title: '矩阵表示线性变换',
      body: '线性变换保持向量加法和数乘。矩阵的每一列是标准基方向变换后的像，网格可显示拉伸、剪切、旋转和压维。',
      sourceIds: ['mit-linear-algebra', 'three-blue-linear'],
    },
    {
      date: '阶段 04',
      title: '秩与核描述输出和丢失',
      body: '秩是像空间维数，核是映射为零的向量集合。秩不足表示不同输入可能映射到同一输出，变换不可逆，丢失的信息无法由输出唯一恢复。',
      sourceIds: ['axler-linear-algebra'],
    },
    {
      date: '阶段 05',
      title: '特征向量只改变长度',
      body: '若 Av=λv 且 v≠0，变换在方向 v 上只伸缩 λ 倍。特征向量必须来自正确空间，特征值可为负或零，零值表示该方向被压掉。',
      sourceIds: ['mit-linear-algebra', 'axler-linear-algebra'],
    },
    {
      date: '阶段 06',
      title: '用网格、列和反例验证',
      body: '取基向量和一般向量验证像，检查行列式、秩与核。反例包括只看矩阵元素判断旋转，或忽略维数、基和定义域。',
      sourceIds: ['three-blue-linear', 'mit-linear-algebra'],
    },
  ],
  outcome:
    '可观察结果是能解释矩阵列、像、核、秩和特征向量，并通过网格和具体向量验证变换。',
  significance:
    '线性代数把数据、几何和方程组统一起来，是现代计算与建模的基础语言。',
  sourceCards: [
    source(
      'mit-linear-algebra',
      'Linear Algebra 18.06',
      'MIT OpenCourseWare',
      '2025 年访问版',
      'https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/',
      '核对向量空间、矩阵、基、秩和特征值。',
    ),
    source(
      'axler-linear-algebra',
      'Linear Algebra Done Right',
      'Sheldon Axler, Springer',
      '2025 年访问版',
      'https://linear.axler.net/',
      '核对线性映射、核、像、基与特征向量。',
    ),
    source(
      'three-blue-linear',
      'Linear Algebra',
      '3Blue1Brown',
      '2025 年访问版',
      'https://www.3blue1brown.com/topics/linear-algebra',
      '核对矩阵作为空间变换的几何直觉。',
    ),
    source(
      'openintro-statistics',
      'OpenIntro Statistics',
      'OpenIntro',
      '2025 年访问版',
      'https://www.openintro.org/book/os/',
      '核对向量、数据矩阵和线性组合的应用背景。',
    ),
  ],
} satisfies LearningV2EventDetail;

const RANDOM_VARIABLE_ARCHIVE = {
  id: 'random-variable-distribution-model',
  kind: 'concept',
  title: '随机变量与分布：数值结果怎样带概率',
  period: '学习阶段 01—06',
  summary:
    '随机变量把随机结果映射为数。离散变量用概率质量，连续变量用概率密度与区间面积；期望和方差概括中心与离散程度，但不描述全部形状。',
  background:
    '概率密度在某点的值不是该点概率。连续变量单点概率为零，概率来自区间积分。样本分布与理论分布也要分开。',
  timeline: [
    {
      date: '阶段 01',
      title: '把随机结果映射为数',
      body: '随机变量是从样本空间到实数的函数。事件“X 取某值或某区间”对应原样本空间中的结果集合。',
      sourceIds: ['openstax-discrete-random'],
    },
    {
      date: '阶段 02',
      title: '离散分布用概率质量',
      body: '每个可能值有非负概率，所有概率和为 1。期望是取值乘概率的总和，方差概括离中心的平均平方距离。',
      sourceIds: ['openstax-mean-random'],
    },
    {
      date: '阶段 03',
      title: '连续分布用密度和区间概率',
      body: '概率密度非负，总体积分为 1；某区间概率是密度在该区间下的面积。密度值本身不是概率。',
      sourceIds: ['openstax-continuous-random'],
    },
    {
      date: '阶段 04',
      title: '分布函数与分位数',
      body: '累积分布函数 F(x)=P(X≤x) 单调不减并趋于 1。分位数由 F 反推，但连续分布单点概率为零。',
      sourceIds: ['openstax-continuous-random'],
    },
    {
      date: '阶段 05',
      title: '期望、方差与单位',
      body: '期望描述长期平均，不保证一次结果接近。方差带原变量单位的平方，标准差回到原单位。',
      sourceIds: ['openstax-mean-random'],
    },
    {
      date: '阶段 06',
      title: '样本波动与模型反例',
      body: '有限样本的经验频率会波动，不等于理论分布。反例包括把密度当概率、忽略分布偏斜，或相信小数样本必然接近期望。',
      sourceIds: ['openstax-continuous-random', 'sep-probability-interpretations'],
    },
  ],
  outcome:
    '可观察结果是能区分离散与连续分布，计算区间/取值概率、期望和方差，并解释样本波动。',
  significance:
    '随机变量把概率转化为可计算模型，同时保留不确定性、单位与分布形状。',
  sourceCards: [
    source(
      'openstax-discrete-random',
      '4.1 Probability Distribution Function for a Discrete Random Variable',
      'OpenStax Introductory Statistics 2e',
      '2025 年访问版',
      'https://openstax.org/books/introductory-statistics-2e/pages/4-1-probability-distribution-function-pdf-for-a-discrete-random-variable',
      '核对离散随机变量、概率分布与累积概率。',
    ),
    source(
      'openstax-mean-random',
      '4.2 Mean or Expected Value and Standard Deviation',
      'OpenStax Introductory Statistics 2e',
      '2025 年访问版',
      'https://openstax.org/books/introductory-statistics-2e/pages/4-2-mean-or-expected-value-and-standard-deviation',
      '核对期望、方差和标准差。',
    ),
    source(
      'openstax-continuous-random',
      '5.1 Continuous Probability Functions',
      'OpenStax Introductory Statistics 2e',
      '2025 年访问版',
      'https://openstax.org/books/introductory-statistics-2e/pages/5-1-continuous-probability-functions',
      '核对连续密度、区间概率与累积分布。',
    ),
    source(
      'sep-probability-interpretations',
      'Interpretations of Probability',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/probability-interpret/',
      '核对概率模型与频率解释。',
    ),
  ],
} satisfies LearningV2EventDetail;

const LIMIT_SOURCES = [
  'OpenStax Calculus Volume 1, 2.2 The Limit of a Function。https://openstax.org/books/calculus-volume-1/pages/2-2-the-limit-of-a-function',
  'OpenStax Calculus Volume 1, 2.4 Continuity。https://openstax.org/books/calculus-volume-1/pages/2-4-continuity',
  'OpenStax Calculus Volume 1, 3.1 Defining the Derivative。https://openstax.org/books/calculus-volume-1/pages/3-1-defining-the-derivative',
  'OpenIntro Statistics。https://www.openintro.org/book/os/',
];

const CALCULUS_SOURCES = [
  'OpenStax Calculus Volume 1, 5.2 The Definite Integral。https://openstax.org/books/calculus-volume-1/pages/5-2-the-definite-integral',
  'OpenStax Calculus Volume 1, 5.3 The Fundamental Theorem of Calculus。https://openstax.org/books/calculus-volume-1/pages/5-3-the-fundamental-theorem-of-calculus',
  'OpenStax Calculus Volume 1, 5.1 Approximating Areas。https://openstax.org/books/calculus-volume-1/pages/5-1-approximating-areas',
  'OpenStax Calculus Volume 1, 3.1 Defining the Derivative。https://openstax.org/books/calculus-volume-1/pages/3-1-defining-the-derivative',
];

const LINEAR_SOURCES = [
  'MIT OpenCourseWare, Linear Algebra 18.06。https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/',
  'Sheldon Axler, Linear Algebra Done Right。https://linear.axler.net/',
  '3Blue1Brown, Linear Algebra。https://www.3blue1brown.com/topics/linear-algebra',
  'OpenIntro Statistics。https://www.openintro.org/book/os/',
];

const RANDOM_SOURCES = [
  'OpenStax Introductory Statistics 2e, 4.1 Discrete Random Variables。https://openstax.org/books/introductory-statistics-2e/pages/4-1-probability-distribution-function-pdf-for-a-discrete-random-variable',
  'OpenStax Introductory Statistics 2e, 4.2 Mean and Standard Deviation。https://openstax.org/books/introductory-statistics-2e/pages/4-2-mean-or-expected-value-and-standard-deviation',
  'OpenStax Introductory Statistics 2e, 5.1 Continuous Probability Functions。https://openstax.org/books/introductory-statistics-2e/pages/5-1-continuous-probability-functions',
  'Stanford Encyclopedia of Philosophy, Interpretations of Probability。https://plato.stanford.edu/entries/probability-interpret/',
];

export const MATH_UNIVERSITY_REWRITE: CuratedCoursePlanPatchMap = {
  'math:极限与连续': {
    contentStatus: 'reviewed',
    prerequisite: '能读函数图像、分段函数，理解绝对值和不等式。',
    plainLanguageGoal:
      '学完后，你能计算左右极限，判断连续三条件，并用空洞、跳跃和无穷间断反例解释结果。',
    guidedPractice:
      '分析 8 个函数点，完成左右极限、函数值、连续三条件、间断类型和一张验证图。',
    independentPractice:
      '构造两个不同间断函数，分别满足“极限存在但点值不同”和“点值存在但极限不存在”，并写出验证。',
    commonErrors: [
      '把函数在 a 点的值当作 a 点极限。',
      '只看图的一侧趋势，忽略左右极限不一致。',
      '套用极限商的法则时分母极限为零。',
    ],
    sourceRefs: LIMIT_SOURCES,
    studyPoints: [
      point('必背', '极限描述 x→a 时的趋势；连续要求 f(a) 有定义、极限存在且 lim f(x)=f(a)。', 1),
      point('重点', '单侧极限不一致时双侧极限不存在；极限可以存在而函数在该点无定义。', 2),
      point('易错', '连续条件缺一不可，极限法则也各有前提，分母趋零时不能直接套商法则。', 4),
    ],
    eventDetails: [LIMIT_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜图像有空洞时函数值是什么',
        body:
          '给出一个在 x=a 处有空洞、另一个在拼接点跳跃的分段函数。先做前测，分别求左极限、右极限和函数值，再判断连续。记录是否把 f(a) 直接当极限、是否漏写单侧、是否能说明间断类型。变式移动函数点值但保持趋势不变，观察连续结论如何变化。反例是 f(a) 无定义但极限存在，直接套“连续”会失败。',
        note: '趋势与点值分开。',
        objective: '能用左右极限、函数值和连续三条件诊断空洞与跳跃间断。',
        practice: '完成两个函数的前测表、左右极限、函数值、间断类型和一张趋势验证图。',
        checkpoint: '检查左右极限是否分别写，连续性三条件是否逐项满足，是否保留点值反例。',
      },
      {
        title: '材料与概念｜邻域、极限与连续',
        body:
          'lim_{x→a}f(x)=L 表示当 x 足够接近 a 但不等于 a 时，f(x) 能任意接近 L。ε-δ 定义把去心邻域、误差和距离写成条件。单侧极限分别从左右逼近；若左右不一致，双侧极限不存在。连续需要 f(a) 有定义、极限存在且等于 f(a)。极限法则中的和、积、商和复合都有前提，商法则要求分母极限非零（或按扩展情形处理）。',
        note: '连续是极限与点值的连接。',
        objective: '能解释邻域逼近、单侧极限、极限存在和连续三条件。',
        practice: '为三类函数各写左右极限、函数值、连续三条件和一条极限法则失效反例。',
        checkpoint: '检查极限是否独立于点值，左右是否分别计算，应用法则前是否核对前提。',
      },
      {
        title: '示范与推导｜分段函数在拼接点是否连续',
        body:
          '设 f(x)=x+1（x<2），f(2)=3，f(x)=x²−1（x>2）。左极限为 3，右极限为 7，因此双侧极限不存在；即使 f(2)=3，函数也不连续。示范画两侧趋势并写三项连续检查：点值存在、极限存在、二者相等。反例是把左极限 3 当整体极限。再令右支为 x+2 归一到 4，观察仍不连续。',
        note: '不同支要分别逼近。',
        objective: '能用分段函数完整计算两侧极限，并逐项判断连续性与间断类型。',
        practice: '完成一个拼接点的左右极限、连续性三条件、间断分类和一个参数变式。',
        checkpoint: '检查左右支表达式、极限值、点值和最终结论，说明哪一条件失败。',
      },
      {
        title: '引导练习｜八个函数点的极限表',
        body:
          '准备八个函数点，覆盖可去间断、跳跃、无穷、连续和需化简的 0/0 型。每点先做前测列点值和左右极限，再用代数化简或图形验证，后测判断连续类型。变式改变一个参数或函数值，观察极限和连续性怎样变化。记录点值代替极限、单侧遗漏、分母为零和图形误读四类错误，并在表中写对应反例与法则前提。',
        note: '0/0 要化简，不是直接判不存在。',
        objective: '能对八类函数点完成极限、连续判断和参数变式。',
        practice: '提交八行极限表、左右趋势图、三项连续检查、一个参数变式和四类错误。',
        checkpoint: '检查左右极限、函数值、连续性三条件、间断类型和法则前提是否齐全。',
      },
      {
        title: '独立迁移与评价｜构造并解释间断反例',
        body:
          '构造两个函数：一个极限存在但与点值不等，一个点值存在但左右极限不同。先做前测预测连续结论，再用代数与图像验证。24 小时后改变点值做变式，观察哪一个因素改变。评价四项：极限正确、点值明确、三条件完整、反例可复现。最后说明现实中“函数值存在”为何不能保证稳定趋势，并写出每个反例的具体定义域。',
        note: '反例要能写成函数。',
        objective: '能独立构造和验证不同间断类型，并解释极限与连续的区别。',
        practice: '提交两个反例函数、图像、极限计算、24 小时变式和四项自评。',
        checkpoint: '四项自评：极限有据、点值明确、连续判断完整、反例可复现；缺项需重写。',
      },
    ],
    quiz: [
      question(
        '函数在 a 点连续必须同时满足什么？',
        'f(a) 有定义，极限存在，且极限等于 f(a)',
        ['只要图像不断开', '只要左右极限存在', '只要 f(a) 有定义'],
        0,
        '连续是三条件合取。图像直观可辅助判断，但必须回到定义，尤其空洞和跳跃处，缺一项就不能判连续。左右极限一致也不自动保证点值相等。',
        '事实与定义',
      ),
      question(
        '某函数在 a 点无定义，但左右极限都为 3，这说明什么？',
        '双侧极限为 3，但函数在 a 点不一定连续',
        ['函数一定连续', '极限不存在', '函数值一定也为 3'],
        1,
        '极限不要求该点有定义。连续还要求 f(a) 存在并等于极限，因此空洞仍可能造成可去间断，即使趋势稳定。点值填错也会破坏连续。',
        '材料与推导',
      ),
      question(
        '哪种操作最可能错误？',
        '分母极限为零时仍直接套用商法则',
        ['分别计算左右极限', '用图像核对趋势', '在点值不明时标出缺失'],
        2,
        '极限法则有前提，商的分母趋零时不能直接使用。需要另做代数、单侧或无穷分析，并核对复合函数条件，不能只靠代入。',
        '常见误区',
      ),
      question(
        '把连续性迁移到程序输入函数时，哪种检查最有意义？',
        '检查边界输入的点值、左右邻近行为和极限是否一致',
        ['只看一个正常样例', '忽略边界条件', '把异常值删掉'],
        0,
        '边界附近的稳定性需要同时检查定义和左右邻域。一个正常样例不能保证边界连续，异常输入应成为测试案例并保留失败输出。',
        '迁移应用',
      ),
    ],
  },
  'math:微分与积分': {
    contentStatus: 'reviewed',
    prerequisite: '会求基本导数和原函数，能解释定积分作为带符号面积。',
    plainLanguageGoal:
      '学完后，你能用累积与变化率解释微分和积分，应用基本定理计算简单定积分并做单位与数值验证。',
    guidedPractice:
      '完成 8 个定积分或累积函数任务，写出矩形近似、原函数、端点差、单位和图像符号。',
    independentPractice:
      '用一个速度或流量模型计算累积量，再用导数、平均率和数值近似三种方式复核。',
    commonErrors: [
      '把定积分只当几何面积，忽略轴上下的符号。',
      '基本定理使用时忽略连续性或上下限方向。',
      '只算原函数差值，不检查单位和被积函数含义。',
    ],
    sourceRefs: CALCULUS_SOURCES,
    studyPoints: [
      point('必背', '定积分是带符号累积；在连续条件下，累积函数的导数为被积函数，定积分等于原函数端点差。', 1),
      point('重点', '分割区间、矩形和、取极限得到积分；单位是函数单位乘变量单位。', 2),
      point('易错', '基本定理需要相应连续性等条件，交换上下限会变号，不能把面积和积分混为一谈。', 4),
    ],
    eventDetails: [CALCULUS_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜面积为什么不等于所有积分',
        body:
          '给出一个在 x 轴上下都有图形的函数。先做前测计算几何面积与带符号积分，比较符号。记录是否只数面积、是否忽略上下限、是否知道单位。变式交换上下限，观察积分反号。反例是把轴上下的面积都当正数，累积量会与实际净变化不符。后测用一个速度模型解释面积对应位移，并要求检查单位，说明正值和负值怎样抵消。',
        note: '积分先问累积量是什么。',
        objective: '能用符号、上下限、单位和时间情境诊断积分面积误解。',
        practice: '完成一个有正负区域的积分前测、几何面积、带符号累积和单位说明。',
        checkpoint: '检查轴上/下符号，上下限方向，单位是否乘出，是否区分净累积和总面积。',
      },
      {
        title: '材料与概念｜累积、原函数与基本定理',
        body:
          '定积分由分割区间和矩形和的极限定义，表示带符号累积。累积函数 F(x)=∫_a^x f(t)dt 在 f 连续等条件下可导，且 F′(x)=f(x)。基本定理进一步把 ∫_a^b f(x)dx 与原函数差值 F(b)−F(a) 连接。积分变量是内部变量，不影响端点。单位是 f 的单位乘 x 的单位，结论要回到累积对象。',
        note: '微分与积分是同一关系的两面。',
        objective: '能解释矩形和、累积函数、基本定理、上下限和单位。',
        practice: '为一个被积函数写单位、累积含义、原函数、端点差和一个变上下限例子。',
        checkpoint: '检查基本定理条件，上下限顺序，累积函数变量，单位是否一致。',
      },
      {
        title: '示范与推导｜从 2x 的积分验证基本定理',
        body:
          '计算 ∫_0^3 2x dx：原函数 x²，端点差 9−0=9。几何上三角形面积也是 9，因为此处函数非负；累积函数 F(x)=x²，F′(x)=2x，回到被积函数。反例是直接取 2x 在 3 的值 6，既不是累积也不是原函数差。再做变式 ∫_3^0 2x dx=−9，验证交换上下限变号。',
        note: '计算、几何和求导三路验证。',
        objective: '能用基本定理计算简单积分，并通过几何、导数和上下限变式验证。',
        practice: '完成一个定积分的原函数、端点差、几何图、导数回代和一个上下限变式。',
        checkpoint: '检查原函数是否正确，端点代入，符号与上下限一致，单位和图形匹配。',
      },
      {
        title: '引导练习｜八个累积任务',
        body:
          '准备八题，覆盖正负区域、矩形近似、基本定理、上下限交换和累积函数。每题先做前测估符号与量级，再计算，后测用导数、数值和单位验证。变式改变上下限或函数系数，观察结果。记录面积符号、原函数、端点、单位四类错误。若被积函数不连续，基本定理的适用条件要先核对，不能直接套；若区间跨越零点，还要保留正负抵消。',
        note: '不连续时先停下来看条件。',
        objective: '能完成八类积分与累积任务，并做三路验证。',
        practice: '提交八题积分、近似值、原函数、单位、两个上下限变式和错误分类。',
        checkpoint: '检查条件和符号，端点差，数值近似，单位与累积对象是否一致。',
      },
      {
        title: '独立迁移与评价｜用积分解释真实累积',
        body:
          '选择速度、流量或成本率模型，先做前测写被积函数单位和累积意义，再计算积分并画出正负区域。24 小时后改变区间做变式，比较净累积与总累积。评价四项：模型清楚、积分正确、单位可解释、符号合理。最后写一个“几何面积为正但净变化为零”的反例。微分与积分连接变化率与总量，不能只看计算结果。',
        note: '净累积和总活动量可能不同。',
        objective: '能把积分迁移到真实累积量，并用单位、符号和导数回代解释。',
        practice: '提交模型、积分、正负区域、24 小时变式、单位解释和反例。',
        checkpoint: '四项自评：含义明确、计算正确、单位一致、符号可解释；任一缺失需重做。',
      },
    ],
    quiz: [
      question(
        '定积分与几何面积最关键的区别是什么？',
        '定积分是带符号累积，轴上方面积与下方贡献符号不同',
        ['定积分永远等于总面积', '定积分没有单位', '定积分只用于求面积'],
        0,
        '积分描述累积量，正负由被积函数和方向决定。几何面积只在上方且非负时才相同，交换上下限还会改变符号。累积对象不同，单位也不同。',
        '事实与定义',
      ),
      question(
        'F(x)=∫_a^x f(t)dt 的导数在适当条件下是什么？',
        'F′(x)=f(x)',
        ['F′(x)=x', 'F′(x)=f(a)', 'F′(x)=0'],
        1,
        '累积函数的变化率回到被积函数。基本定理把局部变化与累积连接，但需要相应连续等条件，变量与上限也要对应。上下限写错会直接改变累积。',
        '材料与推导',
      ),
      question(
        '哪种积分错误最容易漏掉？',
        '只算原函数差值，不检查上下限方向和被积函数单位',
        ['先画正负区域', '交换上下限后检查符号', '用数值近似核对'],
        2,
        '上下限交换会变号，单位决定累积含义。只做原函数运算可能答案数值对但解释错，尤其当函数穿越 x 轴时。应同时检查符号和区域。',
        '常见误区',
      ),
      question(
        '把积分迁移到流量数据时，哪种解释最完整？',
        '流量乘时间的面积表示累积量，净流量与总流量需分开',
        ['流量图越高总量越大即可', '只算最大流量', '忽略时间段'],
        0,
        '积分对时间累积流量，单位是流量单位×时间。正向与反向流量可能抵消，需要区分净累积和总活动，并保留区间与测量窗口。',
        '迁移应用',
      ),
    ],
  },
  'math:向量、矩阵与线性变换': {
    contentStatus: 'reviewed',
    prerequisite: '会解线性方程，能计算二维向量加减与数乘。',
    plainLanguageGoal:
      '学完后，你能把矩阵解释为线性变换，找出列空间、核和秩，并判断特征方向与可逆性。',
    guidedPractice:
      '完成 8 个二维或三维矩阵任务，计算基向量像、秩、核、特征向量和网格变化。',
    independentPractice:
      '选择一个数据或图形变换，写出矩阵、几何解释、核与秩，并用具体向量验证。',
    commonErrors: [
      '把矩阵只看成数字表，不解释列向量和空间作用。',
      '把秩与矩阵尺寸混为一谈。',
      '求特征向量时忽略非零条件和所属空间。',
    ],
    sourceRefs: LINEAR_SOURCES,
    studyPoints: [
      point('必背', '矩阵表示线性变换；列向量是标准基的像，秩是像空间维数，核被映为零。', 1),
      point('重点', '特征向量 v≠0 满足 Av=λv，表示变换在該方向只伸缩不转向。', 2),
      point('易错', '矩阵尺寸大不代表秩高；零向量永远不能满足特征向量定义中的非零条件。', 4),
    ],
    eventDetails: [LINEAR_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜矩阵乘法到底在移动什么',
        body:
          '给出二维矩阵和一组网格点，先做前测计算标准基 e1、e2 的像，并画变换后的网格。记录是否只机械做乘法、能否说明列向量意义、是否判断面积或方向变化。变式把一列改为零，观察二维空间被压到何处。反例是只看矩阵数字猜旋转，实际上列向量可能一个拉长一个缩短。后测要用一般向量 x 的线性组合验证。',
        note: '矩阵的列就是基向量的像。',
        objective: '能用基向量像、列组合和网格前测解释矩阵作为线性变换。',
        practice: '完成一个 2×2 矩阵的两列像、一个一般向量像、网格草图和压维反例。',
        checkpoint: '检查列对应正确，线性组合清楚，网格变化与秩相符，非数值机械代入。',
      },
      {
        title: '材料与概念｜基、像、核与秩',
        body:
          '线性变换满足 T(u+v)=T(u)+T(v) 和 T(cu)=cT(u)。给定基后，矩阵列记录基向量的像。A x 是列向量按 x 坐标加权组合，因此列空间是像空间。核是满足 Ax=0 的向量集合，秩是像空间维数。秩不足时映射丢失方向，不可逆。换基会改变矩阵表示，但不改变线性变换本身。',
        note: '同一条变换可用不同矩阵表示。',
        objective: '能解释基、矩阵列、像、核、秩和可逆性的关系。',
        practice: '为两个矩阵各写列空间、核、秩、可逆判断、一个换基观察和一组具体向量验证。',
        checkpoint: '检查线性性、基与坐标，核含零向量，秩与像维数一致，尺寸不等于秩。',
      },
      {
        title: '示范与推导｜从两列像看拉伸与压维',
        body:
          'A=[[2,0],[0,1]] 把 e1 变到 (2,0)，e2 保持 (0,1)，所以把水平方向拉伸两倍。一般向量 (x,y) 映到 (2x,y)。行列式 2 表示面积缩放。反例 B=[[1,0],[0,0]] 把 e2 映到零，秩为 1，二维空间被压到 x 轴，不可逆。示范再检查核：B(x,y)=0 得 y=0，核是 x 轴，说明该方向被丢失。',
        note: '秩与核共同描述信息丢失。',
        objective: '能由矩阵列解释拉伸、压维、秩、核和可逆性。',
        practice: '完成一个可逆矩阵和一个秩不足矩阵的列像、一般向量、核、秩和图形。',
        checkpoint: '检查列像、线性组合、核方程、秩和可逆判断一致，图示正确。',
      },
      {
        title: '引导练习｜八组矩阵变换',
        body:
          '准备八组二维或三维矩阵，覆盖旋转、剪切、拉伸、压维和特征方向。每组先做前测验算列像，再求秩、核和特征向量（适用时），最后画网格并用具体向量验证。变式改变一列或基，观察秩、核与特征方向怎样变化。记录列误解、秩尺寸混淆、零向量特征错误和换基错误四类，并说明哪些方向被丢失，以及输出能否恢复。',
        note: '特征向量必须非零。',
        objective: '能对八组矩阵完成变换、秩、核、特征方向与变式分析。',
        practice: '提交八张矩阵表、列像图、秩与核、特征向量、两组变式和错误分类。',
        checkpoint: '检查列空间与核，特征向量非零，秩和可逆性一致，图形与向量验证相符。',
      },
      {
        title: '独立迁移与评价｜用矩阵描述真实变换',
        body:
          '选择图形缩放、数据投影或坐标变换，先做前测定义向量空间和基，再写矩阵、解释列像、核与秩。24 小时后换基或改变一个参数做变式，比较矩阵表示。评价四项：变换清楚、基正确、秩核完整、验证有据。最后写一个会把信息压掉的方向反例，并说明为何不能从输出恢复。矩阵不是数字表，而是空间和信息的作用规则。',
        note: '模型要说明丢失了哪些信息。',
        objective: '能把线性代数学迁移到真实变换，并用基、秩、核和具体向量验证。',
        practice: '提交向量空间定义、矩阵、列像、核、秩、24 小时变式和丢失方向反例。',
        checkpoint: '四项自评：变换明确、基一致、秩核正确、验证可复现；不可逆必须说明丢失方向。',
      },
    ],
    quiz: [
      question(
        '矩阵乘向量 A x 最合理的解释是什么？',
        '用 x 的坐标加权组合 A 的列向量',
        ['逐元素随机相加', '把矩阵所有元素相加', '只看第一行'],
        0,
        '列组合解释把矩阵与线性变换连接。x 的每个坐标告诉对应列应当取多少，列空间因此就是所有可能输出，也是像空间。',
        '事实与定义',
      ),
      question(
        '二维矩阵秩为 1 通常说明什么？',
        '像空间只有一维，至少有一个方向被映射到零或与其他方向重合',
        ['矩阵尺寸一定是 1×1', '所有向量都保持不变', '特征值一定为 1'],
        1,
        '秩是像空间维数。二维输入秩 1 表示输出落在一条线上，变换不可逆并存在非零核方向，尺寸本身不能说明这些。核与像必须一起解释。',
        '材料与推导',
      ),
      question(
        '哪种特征向量计算最明显错误？',
        '把零向量当作特征向量，或忽略它必须属于正确空间',
        ['先求特征值', '检查 Av=λv', '确认 v≠0'],
        2,
        '零向量对任何 λ 都满足等式，却没有方向意义，所以定义明确排除。特征向量还必须位于算子定义域，并配合正确特征值，不能只凭方程形式判断。',
        '常见误区',
      ),
      question(
        '把矩阵迁移到数据投影时，哪种解释最完整？',
        '说明列空间表示可输出方向，核表示被压掉方向，并用实际向量验证',
        ['只看矩阵大小', '认为所有投影都无损', '忽略基和坐标'],
        0,
        '投影会丢失法向信息。秩和核能说明保留与丢失的空间，具体向量验证可确认方向解释，换基后矩阵也会变化但变换本身不变。',
        '迁移应用',
      ),
    ],
  },
  'math:随机变量与分布': {
    contentStatus: 'reviewed',
    prerequisite: '会计算离散概率和区间面积，能解释均值。',
    plainLanguageGoal:
      '学完后，你能区分离散与连续随机变量，计算取值/区间概率、期望和方差，并解释样本波动与模型边界。',
    guidedPractice:
      '完成 8 个离散或连续分布任务，写概率表/密度、期望、方差、区间概率和一个样本模拟。',
    independentPractice:
      '为一个排队、测量或风险场景建立随机变量模型，做期望、方差与样本波动分析。',
    commonErrors: [
      '把连续密度在某点的值当作该点概率。',
      '只报期望，不说明方差、分布形状和单位。',
      '把样本均值或经验频率直接当理论分布。',
    ],
    sourceRefs: RANDOM_SOURCES,
    studyPoints: [
      point('必背', '随机变量把结果映射为数；离散分布用概率质量，连续分布用密度面积，单点概率为零。', 1),
      point('重点', '期望是概率加权平均，方差是离期望的平方距离；标准差回到原单位。', 2),
      point('易错', '密度不是概率，期望不保证一次结果，样本频率会波动且不等于理论分布。', 4),
    ],
    eventDetails: [RANDOM_VARIABLE_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜密度值为什么会大于一',
        body:
          '给出一个连续密度函数，其某点高度大于 1。先做前测问该点概率和区间概率，记录是否把高度直接当概率。再给离散骰子分布，要求所有概率和为 1 并算期望。变式把密度区间缩窄，观察概率由面积变化。反例是密度高就概率大；概率取决于区间面积而非单点高度。后测要求用累积分布验证，并比较密度形状与期望位置。',
        note: '连续变量看面积，不看点高。',
        objective: '能用密度高度、区间面积和离散概率表诊断随机变量误解。',
        practice: '完成一个离散表和一个连续密度前测，写取值概率、区间概率和单位。',
        checkpoint: '检查总概率为 1，连续单点概率为零，区间面积与累积函数一致。',
      },
      {
        title: '材料与概念｜随机变量、分布与矩',
        body:
          '随机变量把样本结果映射到实数。离散随机变量用概率质量 p(x)，非负且总和为 1；连续随机变量用密度 f(x)，非负且积分 1，区间概率是密度面积。期望 E(X)=Σx p(x) 或 ∫x f(x)dx，方差 Var(X)=E[(X−E X)²]。期望是长期平均，方差描述离散程度。样本经验分布随抽样变化，不等同理论模型。',
        note: '分布不只由均值决定。',
        objective: '能解释随机变量、分布、概率密度、期望、方差和样本波动。',
        practice: '为一个离散和一个连续模型写概率规则、期望、方差与一个反例。',
        checkpoint: '检查概率归一，密度非负，期望单位，方差非负，样本与理论分开。',
      },
      {
        title: '示范与推导｜骰子的期望与方差',
        body:
          '公平六面骰子每个结果概率 1/6，E(X)=Σk/6=3.5。方差计算为 E(X²)−(E X)²：E(X²)=91/6≈15.17，减 12.25 得约 2.92。期望 3.5 本身不是可能点数，说明期望不必等于某个结果。反例是把 3.5 当作下一次一定接近的值。再用多次模拟检查频率与均值波动。',
        note: '期望是加权中心。',
        objective: '能由分布表计算期望和方差，并解释非整数期望与随机波动。',
        practice: '完成骰子期望、E(X²)、方差、标准差和 20 次模拟对照。',
        checkpoint: '检查概率和，平方项，方差公式，标准差单位，模拟样本量限制。',
      },
      {
        title: '引导练习｜八个分布任务',
        body:
          '准备八个分布，覆盖均匀、偏态、离散投票、连续区间、不同方差和样本模拟。每题先做前测画分布或列概率，再算期望、方差和区间，后测用模拟或累积函数验证。变式改变一个参数，观察中心与分散怎样变化。记录密度误解、归一化、方差单位和样本等同理论四类错误，并为每题写一个不能由均值推出的结论及其边界。',
        note: '先看形状，再报均值。',
        objective: '能对八类随机变量完成分布、期望、方差、区间和模拟检验。',
        practice: '提交八张分布卡、期望方差、区间概率、模拟结果和错误分类。',
        checkpoint: '检查概率和/积分，期望单位，方差非负，样本波动和模型条件。',
      },
      {
        title: '独立迁移与评价｜为真实过程建立随机模型',
        body:
          '选择排队、测量或风险场景，先做前测定义随机变量和范围，再建立分布、算期望方差并给区间。采集或模拟样本，比较理论频率和波动。24 小时后改变一个条件做变式。评价四项：模型定义清楚、概率规则正确、矩解释合理、样本验证谨慎。最后写一个分布假设失效的反例，例如服务时间出现极端阻塞，并说明模型应怎样调整。',
        note: '现实异常要进入模型边界。',
        objective: '能把随机变量模型迁移到真实场景，并用分布、矩和样本验证。',
        practice: '提交模型、分布、期望方差、区间、模拟比较、24 小时变式和假设反例。',
        checkpoint: '四项自评：变量明确、分布合理、矩有单位、验证谨慎；极端值不能被无解释删除。',
      },
    ],
    quiz: [
      question(
        '连续概率密度在某个点的值表示什么？',
        '密度高度，不是单点概率；概率来自区间上的面积',
        ['该点的确切概率', '总概率的一半', '随机变量的期望'],
        0,
        '连续分布单点概率为零。密度需非负且总积分为 1，某区间概率由积分面积计算，密度高度可以大于 1。必须区分高度和面积。',
        '事实与定义',
      ),
      question(
        '公平六面骰子的期望 3.5 说明什么？',
        '长期平均趋向 3.5，但单次结果不会出现 3.5 点',
        ['下一次一定掷出 3 或 4', '骰子不公平', '方差为 0'],
        1,
        '期望是概率加权中心，不必等于可实现结果。单次和有限样本会有波动，方差描述分散，样本均值也需随样本量解释。期望不能保证下一次结果。',
        '材料与推导',
      ),
      question(
        '哪种解释最不完整？',
        '只报期望，不说明方差、分布形状、单位和样本条件',
        ['同时报均值与标准差', '画出分布或概率表', '说明样本与理论区别'],
        2,
        '期望只描述中心。不同方差和偏斜分布可能有同一期望，决策还需要分散、极端值、单位和适用条件。只看均值会遗漏风险。',
        '常见误区',
      ),
      question(
        '把随机变量迁移到测量误差时，哪种建模最完整？',
        '定义误差变量、分布假设、单位与方差，并用样本校准',
        ['把一次误差当全部情况', '忽略单位', '只报最大误差'],
        0,
        '测量误差需要分布和单位。样本校准可检验假设，但异常值、偏置和仪器变化也要保留，不能只报一个平均误差或删除极端测量。',
        '迁移应用',
      ),
    ],
  },
};
