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

const MEASURE_ARCHIVE = {
  id: 'measurement-units-uncertainty',
  kind: 'experiment',
  title: '测量、单位与误差：数字什么时候有意义',
  period: '学习阶段 01—06',
  summary:
    '物理量由数值和单位共同组成。测量值与真值之间可能有系统误差和随机误差，有效数字表达精度，量纲检查可发现公式错误。',
  background:
    '同一数值换单位后物理意义不变；没有单位的公式无法核对。多次测量、仪器分辨率和不确定度报告共同决定结果可信度。',
  timeline: [
    {
      date: '阶段 01',
      title: '定义物理量与单位',
      body: '长度、时间、质量等物理量由测量程序和国际单位制定义。单位不是标签，而是参与运算和换算的量，也是结果验证的一部分。',
      sourceIds: ['openstax-units', 'bipm-si'],
    },
    {
      date: '阶段 02',
      title: '换算保持物理量不变',
      body: '单位换算使用比值 1，例如 100 cm=1 m。数值改变但物理长度不变，平方或立方单位要分别换算，每个长度因子都要乘一次。',
      sourceIds: ['openstax-units'],
    },
    {
      date: '阶段 03',
      title: '量纲检查公式结构',
      body: '等式两边和相加项必须有相同量纲。量纲正确不代表公式一定正确，但量纲错误足以排除候选公式，检查时每个因子都要展开。',
      sourceIds: ['openstax-dimensions'],
    },
    {
      date: '阶段 04',
      title: '识别随机与系统误差',
      body: '随机误差可由多次测量和平均降低，系统误差如零点偏移不会因重复而自动消失。需要校准和独立对照，并记录偏移方向。',
      sourceIds: ['openstax-units', 'nist-uncertainty'],
    },
    {
      date: '阶段 05',
      title: '有效数字表达精度',
      body: '计算结果的位数不能超过输入精度所能支持的信息。中间步骤保留额外位，最终按不确定度或有效数字规则取舍。',
      sourceIds: ['nist-uncertainty'],
    },
    {
      date: '阶段 06',
      title: '用数量和量级复核',
      body: '结果应有合理数量级。反例包括单位未平方、厘米与米混用以及把校准偏差当随机波动。报告前应回看原始单位和数量级。',
      sourceIds: ['openstax-units', 'openstax-dimensions'],
    },
  ],
  outcome:
    '可观察结果是能记录原始读数、单位、不确定度，完成换算和量纲检查，并报告合理精度。',
  significance:
    '测量训练让物理计算与真实世界连接，避免只有数字没有单位或精度。',
  sourceCards: [
    source(
      'openstax-units',
      '1.2 Units and Standards',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/1-2-units-and-standards',
      '核对 SI 单位、测量与单位换算。',
    ),
    source(
      'openstax-dimensions',
      '1.4 Dimensional Analysis',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/1-4-dimensional-analysis',
      '核对量纲一致性与公式检查。',
    ),
    source(
      'bipm-si',
      'The International System of Units (SI Brochure)',
      'BIPM',
      '2019',
      'https://www.bipm.org/en/publications/si-brochure',
      '核对国际单位制定义与单位符号。',
    ),
    source(
      'nist-uncertainty',
      'NIST Technical Note 1297: Guidelines for Evaluating and Expressing Uncertainty',
      'NIST',
      '1994',
      'https://www.nist.gov/pml/nist-technical-note-1297',
      '核对测量不确定度与报告方式。',
    ),
  ],
} satisfies LearningV2EventDetail;

const KINEMATICS_ARCHIVE = {
  id: 'kinematics-position-velocity-acceleration',
  kind: 'experiment',
  title: '运动学：位置、速度和加速度的方向',
  period: '学习阶段 01—06',
  summary:
    '位置依赖坐标原点，位移是位置变化，速度是位移变化率，加速度是速度变化率。图像斜率与面积把三者连接，方向必须用坐标系解释。',
  background:
    '“速度为负”不等于“正在减速”；加速度方向与速度方向相反才表示减速。图像和实验必须共享同一坐标与时间基准。',
  timeline: [
    {
      date: '阶段 01',
      title: '选原点与正方向',
      body: '位置是相对坐标原点的坐标。先规定正方向，符号才有意义；换原点只平移位置数值，不改变位移。',
      sourceIds: ['openstax-position'],
    },
    {
      date: '阶段 02',
      title: '位移与路程区分',
      body: '位移是末位置减初位置，路程是轨迹长度。往返运动可以有非零路程和零位移，平均速度与平均速率也不同。',
      sourceIds: ['openstax-position'],
    },
    {
      date: '阶段 03',
      title: '速度是位置变化率',
      body: '平均速度是位移除以时间，瞬时速度是时间间隔趋小时的极限。位置—时间图斜率表示速度，斜率符号给出运动方向。',
      sourceIds: ['openstax-position', 'phet-moving-man'],
    },
    {
      date: '阶段 04',
      title: '加速度是速度变化率',
      body: '加速度不为零表示速度改变，不只表示速度大小改变。方向改变也会产生加速度，因此转弯即使速率不变也有加速度。',
      sourceIds: ['openstax-acceleration'],
    },
    {
      date: '阶段 05',
      title: '图像斜率与面积',
      body: 'x-t 斜率是速度，v-t 斜率是加速度，v-t 图面积是位移。无符号面积不是位移，需按轴上下区分。',
      sourceIds: ['openstax-acceleration', 'phet-moving-man'],
    },
    {
      date: '阶段 06',
      title: '用实验与反例验证',
      body: '低速小车或运动传感器记录等时间位置，检查图像与方程。反例是坐标原点改变后把位置变化误当速度变化。',
      sourceIds: ['phet-moving-man', 'openstax-position'],
    },
  ],
  outcome:
    '可观察结果是能由位置数据计算位移、速度和加速度，并从图像正确解释方向和面积。',
  significance:
    '运动学为牛顿定律、能量和动量提供描述运动变化的统一语言。',
  sourceCards: [
    source(
      'openstax-position',
      '3.1 Position, Displacement, and Average Velocity',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/3-1-position-displacement-and-average-velocity',
      '核对位置、位移、平均速度和方向。',
    ),
    source(
      'openstax-acceleration',
      '3.3 Average and Instantaneous Acceleration',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/3-3-average-and-instantaneous-acceleration',
      '核对平均/瞬时加速度与图像。',
    ),
    source(
      'phet-moving-man',
      'The Moving Man',
      'PhET Interactive Simulations',
      '2025 年访问版',
      'https://phet.colorado.edu/en/simulations/moving-man',
      '核对位置、速度和加速度图像联动。',
    ),
    source(
      'college-physics-kinematics',
      'Introduction to Kinematics',
      'OpenStax College Physics 2e',
      '2025 年访问版',
      'https://openstax.org/books/college-physics-2e/pages/2-introduction-to-kinematics',
      '核对一维运动学概念与例题。',
    ),
  ],
} satisfies LearningV2EventDetail;

const NEWTON_ARCHIVE = {
  id: 'newton-laws-force-model',
  kind: 'experiment',
  title: '力与运动：牛顿定律不是“有力就运动”',
  period: '学习阶段 01—06',
  summary:
    '力是相互作用，惯性描述无合外力时速度保持不变。牛顿第二定律连接合力、质量与加速度，第三定律描述成对作用；参考系决定惯性描述是否直接适用。',
  background:
    '常见误解是“运动必须有力”或“力大速度就大”。力改变速度，合力为零时物体可匀速直线运动。',
  timeline: [
    {
      date: '阶段 01',
      title: '力是物体间相互作用',
      body: '力有施力者、受力者、方向与大小。画受力图时只画作用在该物体上的力，不能把它的反作用力混在同一个物体的合力里。',
      sourceIds: ['openstax-forces'],
    },
    {
      date: '阶段 02',
      title: '惯性不是力',
      body: '物体保持速度不变的倾向称惯性。惯性大小由质量体现，不能把“惯性力”随意加入惯性系受力图。',
      sourceIds: ['openstax-first-law'],
    },
    {
      date: '阶段 03',
      title: '合力为零时速度不变',
      body: '平衡不等于静止。匀速直线运动也可合力为零；若有速度但没有合外力，物体不会自动停下。',
      sourceIds: ['openstax-first-law', 'openstax-second-law'],
    },
    {
      date: '阶段 04',
      title: 'ΣF=ma 连接合力与加速度',
      body: '合力方向决定加速度方向，质量越大在相同合力下加速度越小。公式使用一致单位，并需在选定参考系中分析。',
      sourceIds: ['openstax-second-law'],
    },
    {
      date: '阶段 05',
      title: '作用与反作用成对在不同物体',
      body: 'A 对 B 的力与 B 对 A 的力大小相等方向相反，作用对象不同，因此不会在同一物体上抵消。',
      sourceIds: ['openstax-forces', 'phet-forces'],
    },
    {
      date: '阶段 06',
      title: '用实验和反例检验受力图',
      body: '低速小车、滑轮或弹簧测力计可检验合力与加速度。反例是忽略摩擦或把速度方向当合力方向。',
      sourceIds: ['phet-forces', 'openstax-second-law'],
    },
  ],
  outcome:
    '可观察结果是能画正确受力图，判断合力与运动变化，并用质量和单位解释加速度。',
  significance:
    '牛顿定律把力、惯性和参考系连接，是经典力学的核心模型。',
  sourceCards: [
    source(
      'openstax-forces',
      '5.1 Forces',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/5-1-forces',
      '核对力的相互作用与受力图。',
    ),
    source(
      'openstax-first-law',
      '5.2 Newton’s First Law',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/5-2-newtons-first-law',
      '核对惯性与平衡。',
    ),
    source(
      'openstax-second-law',
      '5.3 Newton’s Second Law',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/5-3-newtons-second-law',
      '核对合力、质量、加速度与单位。',
    ),
    source(
      'phet-forces',
      'Forces and Motion: Basics',
      'PhET Interactive Simulations',
      '2025 年访问版',
      'https://phet.colorado.edu/en/simulations/forces-and-motion-basics',
      '核对合力、摩擦和运动变化。',
    ),
  ],
} satisfies LearningV2EventDetail;

const ENERGY_ARCHIVE = {
  id: 'work-energy-conservation',
  kind: 'experiment',
  title: '功与能量：守恒的是系统总能量',
  period: '学习阶段 01—06',
  summary:
    '功是力沿位移方向传递的能量，动能与速度平方相关，势能属于系统相互作用。机械能守恒只在无非保守力做功等条件下成立。',
  background:
    '“能量消失”通常意味着转化为热、声或形变。功率描述能量传递速率，不能与总能量混淆。',
  timeline: [
    {
      date: '阶段 01',
      title: '功包含力和位移方向',
      body: '恒力做功 W=Fd cosθ；力垂直位移不做功。把力乘距离而不看方向会造成能量错误，正负功取决于夹角。',
      sourceIds: ['openstax-work'],
    },
    {
      date: '阶段 02',
      title: '动能与速度平方相关',
      body: 'K=½mv²，速度加倍动能变四倍。动能变化等于合力做功，可用于连接力和速度，但速度方向仍需单独判断。',
      sourceIds: ['openstax-kinetic-energy'],
    },
    {
      date: '阶段 03',
      title: '势能属于系统',
      body: '重力势能或弹性势能由相互作用与相对位置定义。先选参考零点，势能变化才有物理意义；势能不属于单个物体。',
      sourceIds: ['openstax-potential-energy'],
    },
    {
      date: '阶段 04',
      title: '机械能守恒有明确条件',
      body: '只有保守力做功或非保守力总功为零时，机械能 E=K+U 保持不变。摩擦存在时总能量仍守恒，但机械能不守恒。',
      sourceIds: ['openstax-kinetic-energy', 'openstax-potential-energy'],
    },
    {
      date: '阶段 05',
      title: '功率描述能量变化速率',
      body: 'P=W/t 或 P=Fv，单位瓦特。相同能量在更短时间传递功率更大，但总量不一定更多。功率描述速率，不能替代总能量和效率。',
      sourceIds: ['openstax-work'],
    },
    {
      date: '阶段 06',
      title: '用斜面和弹簧验证',
      body: '低速小车、斜面和弹簧可测高度、速度与形变。反例是忽略摩擦热或把势能参考点位置当绝对值。',
      sourceIds: ['phet-energy', 'openstax-potential-energy'],
    },
  ],
  outcome:
    '可观察结果是能计算功、动能、势能和功率，判断守恒条件并解释能量去向。',
  significance:
    '能量方法绕开复杂受力细节，但必须明确系统边界和转化路径。',
  sourceCards: [
    source(
      'openstax-work',
      '7.1 Work',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/7-1-work',
      '核对功、方向和功率。',
    ),
    source(
      'openstax-kinetic-energy',
      '7.2 Kinetic Energy',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/7-2-kinetic-energy',
      '核对动能和功—能定理。',
    ),
    source(
      'openstax-potential-energy',
      '8.1 Potential Energy of a System',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/8-1-potential-energy-of-a-system',
      '核对势能、系统与参考点。',
    ),
    source(
      'phet-energy',
      'Energy Skate Park',
      'PhET Interactive Simulations',
      '2025 年访问版',
      'https://phet.colorado.edu/en/simulations/energy-skate-park',
      '核对动能、势能与摩擦能量转化。',
    ),
  ],
} satisfies LearningV2EventDetail;

const MOMENTUM_ARCHIVE = {
  id: 'momentum-impulse-collision',
  kind: 'experiment',
  title: '动量与冲量：碰撞中什么守恒',
  period: '学习阶段 01—06',
  summary:
    '动量是质量乘速度，冲量是力对时间的累积并改变动量。无外力合冲量时系统总动量守恒；弹性碰撞还保持总动能，普通碰撞则不一定。',
  background:
    '动量有方向，必须按坐标分量相加。碰撞中单个物体动量会改变，但系统总动量可在合外力冲量可忽略时守恒。',
  timeline: [
    {
      date: '阶段 01',
      title: '动量包含质量与速度方向',
      body: 'p=mv 是矢量。速率相同、方向相反的两个物体动量不同，分析碰撞要选坐标并处理分量。',
      sourceIds: ['openstax-momentum'],
    },
    {
      date: '阶段 02',
      title: '冲量是力随时间的累积',
      body: '冲量 J=∫F dt，恒力时 J=FΔt，等于动量变化。延长时间可减小平均力，这是缓冲装置的原理。',
      sourceIds: ['openstax-momentum'],
    },
    {
      date: '阶段 03',
      title: '系统总动量守恒需要条件',
      body: '当系统所受外力合冲量可忽略时，总动量保持不变。内力可改变各物体动量，却使系统总动量成对抵消。',
      sourceIds: ['openstax-momentum-conservation'],
    },
    {
      date: '阶段 04',
      title: '弹性与完全非弹性碰撞',
      body: '弹性碰撞同时保持总动量和总动能；完全非弹性碰撞后同速，总动能减少为形变和热。动量守恒不能自动推出动能守恒。',
      sourceIds: ['openstax-momentum-conservation', 'phet-collision'],
    },
    {
      date: '阶段 05',
      title: '质心描述系统整体运动',
      body: '质心速度由系统总动量除以总质量。外冲量为零时质心速度不变，但各物体仍可相对运动。',
      sourceIds: ['openstax-momentum'],
    },
    {
      date: '阶段 06',
      title: '用轨道和数据检验',
      body: '低速小车碰撞可测质量与速度，检查动量分量和能量。反例是忽略方向符号或把有摩擦的碰撞误判为弹性。',
      sourceIds: ['phet-collision', 'openstax-momentum-conservation'],
    },
  ],
  outcome:
    '可观察结果是能计算动量与冲量，利用分量守恒求碰撞后速度，并检查动能是否保持。',
  significance:
    '动量为碰撞、反冲和推进提供守恒框架，并训练矢量与系统边界。',
  sourceCards: [
    source(
      'openstax-momentum',
      '9.1 Linear Momentum',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/9-1-linear-momentum',
      '核对动量、冲量与质心。',
    ),
    source(
      'openstax-momentum-conservation',
      '9.3 Conservation of Linear Momentum',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/9-3-conservation-of-linear-momentum',
      '核对系统动量守恒与碰撞。',
    ),
    source(
      'phet-collision',
      'Collision Lab',
      'PhET Interactive Simulations',
      '2025 年访问版',
      'https://phet.colorado.edu/en/simulations/collision-lab',
      '核对弹性、非弹性碰撞和动量。',
    ),
    source(
      'college-physics-momentum',
      'Linear Momentum and Collisions',
      'OpenStax College Physics 2e',
      '2025 年访问版',
      'https://openstax.org/details/books/college-physics-2e',
      '核对碰撞和应用题背景。',
    ),
  ],
} satisfies LearningV2EventDetail;

const MEASURE_SOURCES = [
  'OpenStax University Physics Volume 1, 1.2 Units and Standards。https://openstax.org/books/university-physics-volume-1/pages/1-2-units-and-standards',
  'OpenStax University Physics Volume 1, 1.4 Dimensional Analysis。https://openstax.org/books/university-physics-volume-1/pages/1-4-dimensional-analysis',
  'BIPM, The International System of Units (SI Brochure)。https://www.bipm.org/en/publications/si-brochure',
  'NIST, Technical Note 1297: Measurement Uncertainty。https://www.nist.gov/pml/nist-technical-note-1297',
];

const KINEMATICS_SOURCES = [
  'OpenStax University Physics Volume 1, 3.1 Position, Displacement, and Average Velocity。https://openstax.org/books/university-physics-volume-1/pages/3-1-position-displacement-and-average-velocity',
  'OpenStax University Physics Volume 1, 3.3 Average and Instantaneous Acceleration。https://openstax.org/books/university-physics-volume-1/pages/3-3-average-and-instantaneous-acceleration',
  'PhET, The Moving Man。https://phet.colorado.edu/en/simulations/moving-man',
  'OpenStax College Physics 2e, Introduction to Kinematics。https://openstax.org/books/college-physics-2e/pages/2-introduction-to-kinematics',
];

const NEWTON_SOURCES = [
  'OpenStax University Physics Volume 1, 5.1 Forces。https://openstax.org/books/university-physics-volume-1/pages/5-1-forces',
  'OpenStax University Physics Volume 1, 5.2 Newton’s First Law。https://openstax.org/books/university-physics-volume-1/pages/5-2-newtons-first-law',
  'OpenStax University Physics Volume 1, 5.3 Newton’s Second Law。https://openstax.org/books/university-physics-volume-1/pages/5-3-newtons-second-law',
  'PhET, Forces and Motion: Basics。https://phet.colorado.edu/en/simulations/forces-and-motion-basics',
];

const ENERGY_SOURCES = [
  'OpenStax University Physics Volume 1, 7.1 Work。https://openstax.org/books/university-physics-volume-1/pages/7-1-work',
  'OpenStax University Physics Volume 1, 7.2 Kinetic Energy。https://openstax.org/books/university-physics-volume-1/pages/7-2-kinetic-energy',
  'OpenStax University Physics Volume 1, 8.1 Potential Energy of a System。https://openstax.org/books/university-physics-volume-1/pages/8-1-potential-energy-of-a-system',
  'PhET, Energy Skate Park。https://phet.colorado.edu/en/simulations/energy-skate-park',
];

const MOMENTUM_SOURCES = [
  'OpenStax University Physics Volume 1, 9.1 Linear Momentum。https://openstax.org/books/university-physics-volume-1/pages/9-1-linear-momentum',
  'OpenStax University Physics Volume 1, 9.3 Conservation of Linear Momentum。https://openstax.org/books/university-physics-volume-1/pages/9-3-conservation-of-linear-momentum',
  'PhET, Collision Lab。https://phet.colorado.edu/en/simulations/collision-lab',
  'OpenStax College Physics 2e。https://openstax.org/details/books/college-physics-2e',
];

export const PHYSICS_MECHANICS_REWRITE: CuratedCoursePlanPatchMap = {
  'physics:测量、单位与数量级': {
    contentStatus: 'reviewed',
    prerequisite: '会使用尺、计时器和电子秤，理解小数与科学计数法。',
    plainLanguageGoal:
      '学完后，你能正确记录单位、换算、量纲和不确定度，并用数量级判断结果是否合理。',
    guidedPractice:
      '完成 8 次长度或时间测量，记录分辨率、平均值、偏差、单位换算和一个量纲检查。',
    independentPractice:
      '设计一份物体尺寸与质量测量记录，报告不确定度，并用量纲和数量级检查一个速度公式。',
    commonErrors: [
      '写数值不写单位，或面积、体积换算只乘一次比例。',
      '把系统误差当成随机波动，通过重复测量掩盖。',
      '保留远多于仪器分辨率支持的位数。',
    ],
    sourceRefs: MEASURE_SOURCES,
    studyPoints: [
      point('必背', '物理量由数值和单位组成；量纲一致的相加项才能进入同一公式，结果精度受测量限制。', 1),
      point('重点', '单位换算用比值 1 保持物理量，平方与立方单位需分别换算。', 2),
      point('易错', '随机误差可平均，系统误差需校准；量纲正确只排除部分错误，不能证明公式完整。', 4),
    ],
    eventDetails: [MEASURE_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜两米和两百厘米差在哪里',
        body:
          '先做前测：用同一把尺测桌面长度三次，记录读数和单位，再把一个速度公式的速度单位改写为 cm/s，检查面积 2 m² 换成 cm² 是否正确。记录是否漏单位、是否只乘 100、是否把小差异当随机误差。变式改用毫米刻度，观察分辨率与末位。反例是读数差来自尺子未对零，重复平均不会消除偏移。后测要报告原始数据和不确定度。',
        note: '数值、单位和精度一起记录。',
        objective: '能用原始读数、单位换算、重复偏差和仪器分辨率诊断测量问题。',
        practice: '完成三次长度测量、一次速度换算、一次面积换算和一个系统误差反例。',
        checkpoint: '检查单位、换算因子、有效位和原始数据，区分随机波动与零点偏移。',
      },
      {
        title: '材料与概念｜单位、量纲与不确定度',
        body:
          '物理量由数值和单位组成，单位换算是乘以等于 1 的比值。量纲用基本量表示导出量，等式两边和相加项必须同量纲。测量不确定度来自仪器分辨率、随机波动和系统偏差。有效数字表达输入支持的精度，中间计算可多留位，最终按不确定度报告。科学计数法适合大数量级。结果还要与预期数量级比较，防止单位漏平方等错误。',
        note: '量纲检查只能排除，不能证明。',
        objective: '能解释单位、量纲、数量级、误差、有效数字与不确定度。',
        practice: '为一个速度、面积和能量量写作量纲分析，并给出一个量纲不符反例。',
        checkpoint: '检查基本量纲、相加项一致、单位换算、误差来源和结果精度。',
      },
      {
        title: '示范与推导｜从原始测量到报告值',
        body:
          '用分度 1 mm 的尺测同一长度得 12.3、12.4、12.3 cm。平均值 12.33 cm，但仪器分辨率和波动使报告不宜写成 12.3333。示范计算平均偏差、说明零点校准，并转成 0.123 m。再检查速度 v=d/t 的量纲为 L/T，若用 cm 与秒混合要统一。反例是把 2 m² 写成 200 cm²，实际是 20,000 cm²。',
        note: '先写原始数据，再计算。',
        objective: '能从原始读数计算平均值、表达不确定度，并完成单位和量纲检查。',
        practice: '完成一组原始读数、平均值、偏差、单位换算、量纲式和数量级复核。',
        checkpoint: '检查原始记录、换算与平方、量纲、有效位、系统误差和结果数量级是否完整。',
      },
      {
        title: '引导练习｜八个测量与换算任务',
        body:
          '准备八题，覆盖长度、面积、速度、科学计数法、分辨率、随机与系统误差。每题先做前测写数值和单位，再完成换算与量纲检查，后测把结果改为合理有效位。变式改变单位前缀或测量次数，检查精度是否随仪器变化。记录漏单位、平方换算、精度过度和误差类型四类问题。若重复测量结果非常一致但有固定偏移，应查校准而非继续平均。',
        note: '一致不等于准确。',
        objective: '能对八类测量任务完成单位换算、误差分类、精度和量纲验证。',
        practice: '提交八题记录、误差分类、两次变式、所有量纲和一个错误反例。',
        checkpoint: '检查数值单位、换算、系统误差、有效位和量纲，不能只给最终数。',
      },
      {
        title: '独立迁移与评价｜制作可信测量报告',
        body:
          '选择长度、质量或时间测量，先做前测设计步骤与仪器分辨率，再收集数据、报告平均值和不确定度。24 小时后换一个单位或仪器复测并验证结果。评价四项：原始记录完整、单位正确、误差有分类、量纲与数量级合理。最后写一个系统误差导致“精确但错误”的反例。测量不是把数字写得越长越好，而是让证据可复核并允许他人重测。',
        note: '可复核比小数位多重要。',
        objective: '能独立制作测量报告，并用单位、量纲、误差和复测评价可信度。',
        practice: '提交原始记录、统计、误差分类、24 小时复测、量纲检查和精确错误反例。',
        checkpoint: '四项自评：记录完整、单位正确、误差清楚、结论适度；缺任一不能算可信报告。',
      },
    ],
    quiz: [
      question(
        '物理量 2.0 m 中最重要的两个组成是什么？',
        '数值 2.0 与单位 m，缺失任一都不能完整描述物理量',
        ['只有数字 2', '只有单位 m', '字体和颜色'],
        0,
        '物理量是数值与单位的组合。单位参与换算和量纲检查，数值精度表达测量能力，缺少任一部分都会使记录不完整，也无法比较。',
        '事实与定义',
      ),
      question(
        '把 2 m² 换算成 cm² 的正确结果是什么？',
        '20,000 cm²，因为每个长度方向都乘 100',
        ['200 cm²', '2,000 cm²', '20 cm²'],
        1,
        '面积单位包含两个长度因子，(100 cm/m)²=10,000 cm²/m²，所以 2 m²=20,000 cm²。只乘 100 会把面积当长度，体积还要乘三次。',
        '材料与推导',
      ),
      question(
        '哪种测量误差最不可能通过重复平均自动消除？',
        '仪器零点偏移等系统误差',
        ['随机读数波动', '短暂反应时间差异', '偶然估计末位'],
        2,
        '系统误差方向较固定，需要校准或改变方法。重复平均主要减小随机波动，不能自动修复偏移，甚至会给出更稳定但错误的均值和更窄的虚假精度。',
        '常见误区',
      ),
      question(
        '把量纲分析迁移到新公式时，哪种结论最合理？',
        '量纲不符可以否定公式，量纲相符仍需实验和推导确认',
        ['量纲相符就证明公式正确', '量纲分析只能算单位名字', '量纲不符也可直接使用'],
        0,
        '量纲一致是必要条件而非充分条件。常量和函数关系仍需理论与实验验证，量纲不符则通常可直接否定公式，不能靠调参数补救。',
        '迁移应用',
      ),
    ],
  },
  'physics:运动学：位置、速度与加速度': {
    contentStatus: 'reviewed',
    prerequisite: '会读直线坐标、平均数和图像斜率，完成测量单位课程。',
    plainLanguageGoal:
      '学完后，你能由位置数据计算位移、速度和加速度，并用图像斜率、面积和实验验证方向。',
    guidedPractice:
      '用 8 个等时间位置数据计算位移、平均速度、近似瞬时速度和加速度，并画 x-t、v-t 图。',
    independentPractice:
      '设计一次低速小车运动实验，记录位置—时间数据，比较两种时间间隔的速度估计。',
    commonErrors: [
      '把路程当位移，忽略往返和方向。',
      '速度为负就认为减速，没有比较速度与加速度方向。',
      '把位置图曲线高度当速度，或把 v-t 图面积当无符号路程。',
    ],
    sourceRefs: KINEMATICS_SOURCES,
    studyPoints: [
      point('必背', '位移是末位置减初位置；平均速度是位移除以时间，加速度是速度变化率。', 1),
      point('重点', 'x-t 图斜率是速度，v-t 图斜率是加速度，v-t 图带符号面积是位移。', 2),
      point('易错', '速度与加速度符号相反表示减速；位置原点改变不改变位移和速度。', 4),
    ],
    eventDetails: [KINEMATICS_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜走了十米为什么位移是零',
        body:
          '先做前测：一个人从原点走到 +5 m 再回原点，路程和位移各多少？再给一段位置等时间数据，判断哪段速度最大、何时反向。记录是否把曲线高度当速度、是否把负速度当减速。变式移动坐标原点，比较位置数值和位移。反例是汽车速度为负但加速度同向，速度大小正在增加，不是减速。后测要求画出 v-t 图并标方向。',
        note: '先规定正方向和原点。',
        objective: '能用坐标、路程/位移和图像方向诊断运动学前测错误。',
        practice: '完成往返运动与三段位置表前测，写路程、位移、方向和两个图像判断。',
        checkpoint: '检查正方向、坐标原点、位置变化和速度/加速度方向，不只看数值大小。',
      },
      {
        title: '材料与概念｜位置、速度、加速度与图像',
        body:
          '位置是相对原点的坐标，位移是末位置减初位置，路程是轨迹长度。平均速度是位移除以时间，瞬时速度是时间间隔趋小时的极限。加速度是速度变化率，包含方向变化。x-t 图斜率给速度，v-t 图斜率给加速度，v-t 图面积给位移。负号表示方向相对于正轴，是否加速要看速度与加速度是否同向，图像必须共享时间和坐标零点。',
        note: '图像斜率与面积各有物理意义。',
        objective: '能解释位置、位移、速度、加速度、方向和图像关系。',
        practice: '为一组位置数据写位移、平均速度、两个区间加速度和对应图像特征。',
        checkpoint: '检查位移终点减起点，单位，斜率/面积含义，速度和加速度方向。',
      },
      {
        title: '示范与推导｜从位置表到加速度',
        body:
          '设在 t=0,1,2,3 s 的位置为 0,1,4,9 m。相邻位移为 1,3,5 m，对应平均速度 1,3,5 m/s；速度每 1 s 增加约 2 m/s，所以加速度约 2 m/s²。x-t 图是上弯曲线，v-t 图为上升直线。反例是把 9 m 终点位置直接当速度。再用更小时间间隔估计瞬时速度，检查结果趋近 2t。',
        note: '速度是位置变化，不是位置本身。',
        objective: '能从离散位置表计算速度和加速度，并由图像验证。',
        practice: '完成一个位置表的速度、加速度、两张图和一次更小间隔变式。',
        checkpoint: '检查差分方向、时间间隔、单位、曲线斜率、瞬时估计趋势和坐标原点。',
      },
      {
        title: '引导练习｜八组运动数据',
        body:
          '准备八组数据，覆盖匀速、加速、减速、反向、原点平移和图像转换。每组先做前测描述运动，再计算位移、平均速度、加速度并画图，后测用另一种表达验证。变式改变时间间隔或原点，观察速度与加速度估计如何变化。记录路程位移混淆、斜率高度混淆、方向不足和单位四类错误。若速度为负而加速度也为负，应说明速度大小实际在增加。',
        note: '符号解释必须带正方向。',
        objective: '能对八组运动数据完成计算、图像与方向解释。',
        practice: '提交八张运动表、x-t/v-t 图、方向说明、两个变式和错误统计。',
        checkpoint: '检查坐标方向、单位、斜率面积、正负解释和离散估计一致性。',
      },
      {
        title: '独立迁移与评价｜记录一次真实低速运动',
        body:
          '用低速小车、纸带或运动传感器记录位置—时间数据。先做前测规定坐标和时间零点，再计算位移、速度和加速度，画图并比较大小时间间隔的瞬时估计。24 小时后重新取样做变式。评价四项：坐标一致、数据可读、图像正确、方向解释完整。最后写一个设备延迟或原点变化造成的反例，并说明怎样检查采样和坐标。',
        note: '实验模型也要写误差。',
        objective: '能把运动学迁移到真实低速实验，并用数据和图像评价模型。',
        practice: '提交坐标设定、原始数据、两张图、速度估计、24 小时复测和误差反例。',
        checkpoint: '四项自评：坐标明确、数据准确、图像一致、方向合理；设备误差不能隐藏。',
      },
    ],
    quiz: [
      question(
        '一个人从 x=0 走到 x=5 m 再回 x=0，位移和路程分别是多少？',
        '位移 0，路程 10 m',
        ['位移 10 m，路程 0', '位移 5 m，路程 10 m', '两者都为 0'],
        0,
        '位移只看到末位置差，回到原点所以为 0；路程累计轨迹长度，去回共 10 m。两者不能因为单位相同而混用，方向信息也不同。',
        '事实与定义',
      ),
      question(
        '位置—时间图的斜率表示什么？',
        '瞬时速度，斜率符号表示运动方向',
        ['加速度', '路程总量', '质量'],
        1,
        '位置对时间的变化率是速度。图的高度是位置，不是速度；斜率变化才与加速度相关，斜率符号表示运动方向，曲线弯曲程度给加速度信息。',
        '材料与推导',
      ),
      question(
        '速度为负、加速度也为负时，物体在做什么？',
        '沿负方向运动且速度大小正在增加',
        ['一定在减速', '一定静止', '正在反向于负轴'],
        2,
        '两者同号表示速度在这一方向变大；异号才是减速。符号方向必须相对坐标正方向解释，不能把负号直接等同于减速或减速为零。',
        '常见误区',
      ),
      question(
        '把运动学迁移到车辆刹车记录时，哪种数据组合最有用？',
        '位置或速度时间序列、方向、时间间隔和传感器误差',
        ['只看最终位置', '只看车辆颜色', '不记录时间'],
        0,
        '刹车分析需要速度随时间变化及方向。采样间隔和误差影响加速度估计，必须记录，并保留原始时间序列和传感器时间偏差。',
        '迁移应用',
      ),
    ],
  },
  'physics:力与牛顿运动定律': {
    contentStatus: 'reviewed',
    prerequisite: '会画矢量与受力示意，理解速度、加速度和坐标方向。',
    plainLanguageGoal:
      '学完后，你能识别物体受力、画受力图，用合力与质量解释加速度，并区分平衡与作用反作用。',
    guidedPractice:
      '分析 8 个物体受力场景，画受力图、求合力、判断加速度和参考系。',
    independentPractice:
      '设计低速小车或弹簧实验，测量合力与加速度关系，并解释摩擦和参考系影响。',
    commonErrors: [
      '认为运动一定需要持续力。',
      '把速度方向和合力方向混为一谈。',
      '把作用力与反作用力画在同一物体的合力中而错误抵消。',
    ],
    sourceRefs: NEWTON_SOURCES,
    studyPoints: [
      point('必背', '力是相互作用；无合外力时速度不变，ΣF=ma 表示合力造成加速度。', 1),
      point('重点', '受力图只画作用在目标物体上的力，并先选惯性参考系与正方向。', 2),
      point('易错', '作用力与反作用力作用在不同物体；同一物体上大小相等方向相反的力才可能平衡。', 4),
    ],
    eventDetails: [NEWTON_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜推着物体才动，松手就说明没有惯性吗',
        body:
          '先做前测：桌上小车被轻推后滑行，为什么最终停下？要求画受力图并判断合力。记录是否认为“运动需要持续推力”、是否忽略摩擦、是否把速度方向当合力。变式换成无摩擦气垫轨道，观察速度保持。反例是静止物体也可能受多个平衡力，而运动物体也可能合力为零。后测要区分惯性、合力和摩擦，并写出运动状态变化的条件。',
        note: '运动状态变化看合力。',
        objective: '能用受力图、合力和摩擦诊断“有力才运动”的误解。',
        practice: '完成小车滑行前测，画受力图、合力、加速度方向和停车原因。',
        checkpoint: '检查是否画摩擦与支持力，是否区分速度方向，是否把平衡当零力。',
      },
      {
        title: '材料与概念｜力、惯性、合力与参考系',
        body:
          '力是物体间相互作用，具有施力者、受力者和方向。惯性是保持速度不变的倾向，不是额外力。牛顿第一定律说明合外力为零时速度不变；第二定律 ΣF=ma 连接合力、质量和加速度；第三定律说明作用与反作用成对作用于不同物体。分析前先选惯性参考系和正方向，画受力图，再分解分量，并核对每个力的对象和来源。',
        note: '先受力，再运动。',
        objective: '能解释力、惯性、合力、质量、加速度和惯性参考系。',
        practice: '为三个物体画完整受力图，区分第一、第二、第三定律各自回答的问题。',
        checkpoint: '检查每个力有来源和作用对象，合力不混反作用力，参考系已声明。',
      },
      {
        title: '示范与推导｜从受力图求小车加速度',
        body:
          '低速小车受重力 mg、支持力 N、拉力 T 和摩擦 f。竖直方向平衡：N−mg=0；水平取右正：T−f=ma。若 m=2 kg、T=6 N、f=2 N，则合力 4 N，a=2 m/s²。反例是忘记摩擦导致估计过高。再用 N 与重力比较说明作用反作用：地面对小车的 N 与小车对地面的力不是同一物体上的平衡力。',
        note: '合力是一物体所受力的矢量和。',
        objective: '能从完整受力图分解求合力，并计算加速度、方向与单位。',
        practice: '完成一个四力小车问题、竖直平衡、水平加速度和反作用说明。',
        checkpoint: '检查力对象、正方向、合力、单位 m/s²，作用反作用不混入合外力。',
      },
      {
        title: '引导练习｜八个受力与运动场景',
        body:
          '准备八场景，覆盖静止平衡、匀速、加速、减速、斜面、两物体连接和参考系变化。每场景先做前测画受力图，再求合力与加速度，后测用运动图或数据验证。变式改变质量或摩擦，观察加速度和平衡条件怎样变化。记录漏力、速度当力、反作用混用和单位四类错误。若合力为零，不能自动说物体静止；它也可能匀速运动。',
        note: '平衡包括匀速运动。',
        objective: '能对八类场景完成受力图、合力、加速度和运动状态判断。',
        practice: '提交八张受力图、合力表、三个参数变式、运动验证、方向说明和错误分类。',
        checkpoint: '检查作用对象、方向和正负，平衡不等于静止，加速度与合力同向。',
      },
      {
        title: '独立迁移与评价｜测合力与加速度',
        body:
          '用低速小车、弹簧测力计或 PhET 模拟，先做前测写假设，再测不同合力下的加速度并作图。24 小时后增加质量做变式。评价四项：受力图完整、数据单位、图像关系、误差解释。最后写一个摩擦或传感器延迟导致偏差的反例，并说明如何控制变量、重复采样和校准零点。牛顿定律模型需要明确系统、参考系和外力边界。',
        note: '实验先控制变量。',
        objective: '能把牛顿第二定律迁移到低速实验，并用图像、单位与误差验证。',
        practice: '提交受力图、数据表、F-a 图、24 小时质量变式、误差和反例。',
        checkpoint: '四项自评：受力完整、单位一致、关系可验、误差有解释；控制变量必须记录。',
      },
    ],
    quiz: [
      question(
        '合外力为零时，物体的运动状态是什么？',
        '速度保持不变，可静止也可匀速直线运动',
        ['一定静止', '一定加速', '一定改变方向'],
        0,
        '平衡不等于静止。牛顿第一定律说明速度矢量不变，包括零速度和非零恒定速度，因此匀速直线运动也可合外力为零。加速度才需要非零合力。',
        '事实与定义',
      ),
      question(
        '同一物体受 6 N 向右拉力和 2 N 向左摩擦，合力与加速度方向如何？',
        '合力 4 N 向右，加速度也向右',
        ['合力 8 N 向右', '合力 4 N 向左', '合力为零'],
        1,
        '先选正方向再矢量相加，合力为 4 N 向右。加速度与合力同向，大小还除以质量，不能直接等于合力数值，单位也要转换。',
        '材料与推导',
      ),
      question(
        '哪种受力图分析最错误？',
        '把作用力与反作用力都画在同一物体上并让它们抵消',
        ['先标出施力者与受力者', '只算作用在目标物体上的力', '把合力与加速度比较'],
        2,
        '作用反作用力作用于不同物体，不会在同一物体内部平衡。受力图必须明确对象，并只合并作用在该对象上的外力，不能混入它的反作用力。',
        '常见误区',
      ),
      question(
        '把牛顿定律迁移到安全带设计时，哪种解释最完整？',
        '延长碰撞时间减小平均冲力，同时分析乘员受力和约束',
        ['安全带让动量不再守恒', '延长距离让质量消失', '只提高速度'],
        0,
        '安全带通过变形延长减速时间，降低平均冲力。系统动量与外部冲量仍需完整分析，约束力也不能凭空消失，作用时间与峰值力要区分。',
        '迁移应用',
      ),
    ],
  },
  'physics:功、能量与能量守恒': {
    contentStatus: 'reviewed',
    prerequisite: '会计算矢量点积或力与位移的夹角，理解速度平方。',
    plainLanguageGoal:
      '学完后，你能计算功、动能、势能和功率，判断机械能守恒条件并解释能量去向。',
    guidedPractice:
      '完成 8 个功与能量任务，写系统边界、参考点、能量转化、守恒条件和功率。',
    independentPractice:
      '用斜面或弹簧记录高度、速度与形变，比较机械能变化并估算摩擦损失。',
    commonErrors: [
      '把力乘距离却不考虑夹角和位移方向。',
      '在有摩擦时仍直接使用机械能守恒。',
      '把势能归属于单个物体或忽略参考点变化。',
    ],
    sourceRefs: ENERGY_SOURCES,
    studyPoints: [
      point('必背', '功是力沿位移方向的能量传递，K=½mv²，势能属于系统；机械能守恒需非保守力总功条件。', 1),
      point('重点', '先定义系统边界和势能参考点，再列初末能量和能量去向。', 2),
      point('易错', '摩擦不使总能量消失，而把机械能转为热；总能量守恒与机械能守恒不是同一句话。', 4),
    ],
    eventDetails: [ENERGY_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜推着重物走一圈为什么总功可能为零',
        body:
          '先做前测：提着箱子水平走、把箱子匀速提高、推箱子沿地面滑行，分别判断重力、提力、摩擦做功。记录是否只看力或距离、是否忽略夹角、是否把势能与动能混同。变式让物体回到起点，观察重力总功为零但路程不为零。反例是摩擦产生热，总能量没有消失。后测要求写系统边界、参考点和能量去向，并解释每一项是否为零。',
        note: '功看力与位移的方向关系。',
        objective: '能用夹角、位移和系统边界诊断功与能量前测错误。',
        practice: '完成三个做功情境、两个参考点、一个摩擦热反例和能量去向。',
        checkpoint: '检查力方向、位移、夹角、系统边界和参考点，是否区分机械能与总能量。',
      },
      {
        title: '材料与概念｜功、动能、势能与功率',
        body:
          '恒力做功 W=Fd cosθ，垂直位移的力不做功。动能 K=½mv²，功—能定理说明合力功等于动能变化。重力势能或弹性势能属于相互作用系统，参考点可任选但变化量有物理意义。非保守力做功会改变机械能，摩擦把机械能转化为热。功率 P=W/t 描述能量传递速率，不是总能量，也不能替代效率。',
        note: '先定义系统，再谈能量属于谁。',
        objective: '能解释功、动能、势能、机械能守恒、非保守力和功率。',
        practice: '为一个斜面小车写系统边界、参考点、初末能量、摩擦功和功率表达式。',
        checkpoint: '检查功的夹角，势能参考点，系统边界，摩擦能量去向和功率单位。',
      },
      {
        title: '示范与推导｜斜面上滑下的小车',
        body:
          '质量 1 kg 小车从高 0.5 m 处释放，初速为零。若无摩擦，mgh=½mv²，v=√(2gh)≈3.13 m/s。若测得速度 2.8 m/s，机械能减少，差额转为热和声。示范计算初末机械能、摩擦损失和平均功率。反例是直接用 mgh 求有摩擦情况的速度而不扣损失。再用参考点改到斜面底部，验证能量差不变。',
        note: '能量差比绝对参考值更稳。',
        objective: '能用能量法计算无摩擦速度，并在有摩擦时解释机械能损失。',
        practice: '完成斜面初末能量、速度、摩擦损失、功率、能量去向和参考点变式。',
        checkpoint: '检查 mgh、½mv²、单位、能量差和摩擦去向，参考点变化不改变结果。',
      },
      {
        title: '引导练习｜八个功与能量任务',
        body:
          '准备八题，覆盖不同夹角、动能变化、重力/弹簧势能、摩擦、功率和参考点。每题先做前测画能量条或表，再列方程，后测用另一参考点或数值路径验证。变式改变高度、质量或摩擦，观察能量分配。记录功夹角、守恒条件、参考点和功率四类错误。若总机械能改变，必须找到非保守力功或其他能量输出，并核对单位。',
        note: '能量账本必须平衡。',
        objective: '能对八类能量任务完成系统、参考点、能量转化和功率分析。',
        practice: '提交八张能量表、功计算、两处参考点、三个变式和错误分类。',
        checkpoint: '检查能量项、单位、守恒条件、摩擦热、功率和参考点，账目是否闭合。',
      },
      {
        title: '独立迁移与评价｜测量机械能与损失',
        body:
          '用低速小车、斜面和尺，或 PhET 能量滑板，先做前测写系统与假设，再测高度、速度与摩擦影响。24 小时后改变斜面角度做变式。评价四项：系统明确、能量项完整、数据单位、损失解释。最后写一个“机械能守恒不成立但总能量仍守恒”的反例，并比较不同角度下的损失。能量方法不是绕过条件，而是把条件写进账本。',
        note: '机械能损失不等于能量消失。',
        objective: '能把能量方法迁移到低速实验，并用数据、守恒条件和损失评价。',
        practice: '提交系统假设、数据、能量账本、24 小时角度变式、损失估算和反例。',
        checkpoint: '四项自评：系统明确、能量闭合、单位一致、损失有据；缺项需重做。',
      },
    ],
    quiz: [
      question(
        '力与位移垂直时，这个力做功是多少？',
        '零，因为 cos90°=0',
        ['最大正功', '等于力乘距离', '总等于负功'],
        0,
        '功只看力沿位移方向的分量。垂直时没有能量沿位移传递，但力仍可改变方向，所以“不做功”不等于“没有作用”，也不等于力为零。',
        '事实与定义',
      ),
      question(
        '质量不变、速度加倍时，动能怎样变化？',
        '变为原来的四倍',
        ['变为两倍', '不变', '减半'],
        1,
        '动能与速度平方成正比，2²=4。因此同样速度增量在高速时需要的能量更多，不能按线性比例估算，方向变化也需另算。',
        '材料与推导',
      ),
      question(
        '有摩擦的斜面下滑，哪种说法正确？',
        '机械能减少，但总能量守恒并转为热等',
        ['总能量消失', '机械能一定守恒', '摩擦不做功'],
        2,
        '摩擦是非保守力，减少机械能。能量转化为热和声，系统总能量仍守恒，但机械能守恒式不能直接使用，必须记录路径和热量。',
        '常见误区',
      ),
      question(
        '把功与能量迁移到制动系统时，哪种分析最完整？',
        '计算初动能、制动做功、热耗散和平均功率，并说明系统边界',
        ['只看制动力大小', '忽略速度平方', '认为摩擦让能量消失'],
        0,
        '制动把动能转为热。初始动能、力与距离、时间和散热情形共同决定安全与温升，平均功率也需要单独计算，不能只看制动力。',
        '迁移应用',
      ),
    ],
  },
  'physics:动量、碰撞与守恒': {
    contentStatus: 'reviewed',
    prerequisite: '会进行矢量分量运算，理解速度方向和系统边界。',
    plainLanguageGoal:
      '学完后，你能计算动量与冲量，判断系统动量守恒条件，并用碰撞数据检查动量和动能。',
    guidedPractice:
      '分析 8 个碰撞或反冲场景，选系统、坐标，计算初末动量和冲量。',
    independentPractice:
      '用两辆低速小车或 PhET 碰撞实验，比较多组质量与速度，判断弹性和非弹性碰撞。',
    commonErrors: [
      '忽略速度方向，把速率直接当动量。',
      '把单个物体动量守恒与系统总动量守恒混为一谈。',
      '动量守恒后自动假定动能也守恒。',
    ],
    sourceRefs: MOMENTUM_SOURCES,
    studyPoints: [
      point('必背', '动量 p=mv 是矢量，冲量等于动量变化；系统外合冲量可忽略时总动量守恒。', 1),
      point('重点', '弹性碰撞同时保持总动量和总动能，完全非弹性碰撞只保证总动量。', 2),
      point('易错', '单个物体动量会因碰撞改变，系统总和才可能守恒；方向符号必须统一。', 4),
    ],
    eventDetails: [MOMENTUM_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜两车相撞后谁的速度方向变了',
        body:
          '先做前测：两辆小车相向运动，质量不同，求碰后共同速度。记录是否正确设正方向、是否把速率当动量、是否只算轻车。变式计算系统外力摩擦冲量不可忽略的情况，观察原题还能否用动量守恒。反例是把碰撞后动能总和保持不变，除非题目明确弹性。后测要用前后动量表、速度方向和动能变化验证，不能只给出数值。',
        note: '动量先选方向再相加。',
        objective: '能用方向、系统边界、外冲量和弹性条件诊断碰撞前测。',
        practice: '完成两车相撞前测，写坐标、初末动量、共同速度和两个条件反例。',
        checkpoint: '检查质量与速度符号，系统总动量，外力冲量，动能是否被误当守恒。',
      },
      {
        title: '材料与概念｜动量、冲量与系统守恒',
        body:
          '动量 p=mv，冲量 J=∫Fdt 等于动量变化；恒力时 J=FΔt。碰撞中内力成对，若系统受到的外力合冲量可忽略，总动量守恒。单个物体动量可以大幅改变。完全非弹性碰撞后共速，总动能减少；弹性碰撞还满足总动能守恒。二维碰撞要分别列分量。质心速度由总动量除以总质量决定，系统边界必须明确。',
        note: '守恒是系统层面的结论。',
        objective: '能解释动量、冲量、系统、质心、弹性碰撞和守恒条件。',
        practice: '为一个碰撞写系统边界、正方向、初末动量、冲量、能量判断和守恒条件。',
        checkpoint: '检查矢量符号、系统边界、外冲量和弹性条件，不混淆动量和动能。',
      },
      {
        title: '示范与推导｜完全非弹性碰撞',
        body:
          '质量 2 kg、速度 +3 m/s 的小车与 1 kg、速度 −1 m/s 的小车碰撞后粘连。总动量 2×3+1×(−1)=5 kg·m/s，总质量 3 kg，碰后共同速度 +5/3 m/s。初动能 9+0.5=9.5 J，末动能约 4.17 J，损失转为热和形变。反例是直接用速率相加得 2 m/s，忽略方向和动能损失。',
        note: '先算系统总动量，再求末速度。',
        objective: '能用动量守恒求完全非弹性碰撞速度，并检查能量变化。',
        practice: '完成一维完全非弹性碰撞的动量、速度、初末动能和能量去向。',
        checkpoint: '检查方向符号、系统总质量、动量单位、末速度、动能损失和能量去向。',
      },
      {
        title: '引导练习｜八个碰撞与反冲场景',
        body:
          '准备八场景，覆盖粘连接触、弹性碰撞、反冲、二维碰撞和摩擦不可忽略。每题先做前测选系统与坐标，再列总动量方程，后测计算冲量与动能变化。变式改变质量、速度方向或外力，观察守恒条件是否仍成立。记录符号、系统边界、弹性和单位四类错误。若外力冲量显著，应改用冲量—动量方程，不能套理想守恒。',
        note: '条件不满足就改用完整方程。',
        objective: '能对八类碰撞/反冲问题完成系统动量、冲量和能量分析。',
        practice: '提交八张动量表、冲量、两个二维分量、三个变式和错误分类。',
        checkpoint: '检查矢量符号、系统边界、总动量、冲量、弹性判断、单位和外冲量。',
      },
      {
        title: '独立迁移与评价｜用碰撞实验检查守恒',
        body:
          '用低速小车或 PhET 碰撞实验，先做前测记录质量、方向和速度，再计算总动量与总动能。24 小时后改变质量做变式，检查结论。评价四项：系统明确、方向一致、数据可靠、能量解释合理。最后写一个动量近似守恒但机械能明显损失的场景，并说明摩擦冲量与传感器误差的来源。动量守恒与能量守恒分别回答不同问题。',
        note: '两条守恒定律不能互相替代。',
        objective: '能把动量守恒迁移到碰撞实验，并用数据、方向和能量变化评价。',
        practice: '提交实验数据、前后动量、动能损失、24 小时变式、误差和适用反例。',
        checkpoint: '四项自评：系统清楚、方向统一、动量可验、能量解释完整；缺项需重做。',
      },
    ],
    quiz: [
      question(
        '两个物体速度方向相反时，计算总动量首先要做什么？',
        '选正方向，把速度用带符号数值代入',
        ['把速率直接相加', '只算质量大的物体', '删去负速度'],
        0,
        '动量是矢量。统一正方向后，反向速度取负号，系统总动量按分量相加；把速率直接相加会丢失方向信息，也会误判碰后方向。',
        '事实与定义',
      ),
      question(
        '系统动量守恒最需要检查什么条件？',
        '系统所受外力的合冲量是否可忽略',
        ['物体是否接触', '动能是否一定不变', '质量是否相等'],
        1,
        '内力不能改变系统总动量，外冲量才会。接触和等质量都不是守恒必要条件，关键是系统边界与外冲量，外力可忽略才可近似。',
        '材料与推导',
      ),
      question(
        '完全非弹性碰撞后，哪一项通常不守恒？',
        '总动能',
        ['总动量', '总质量', '矢量方向分量'],
        2,
        '粘连碰撞有最大动能损失。若外冲量可忽略，系统总动量仍守恒，总能量也守恒，但机械能减少为热和形变，不能误判为能量消失。',
        '常见误区',
      ),
      question(
        '把动量迁移到火箭推进时，哪种分析最完整？',
        '把火箭与喷出气体视为系统，考虑质量变化、速度方向和外部冲量',
        ['只看火箭质量', '把喷气速度忽略', '认为系统总动量不守恒'],
        0,
        '火箭推进是系统动量变化与反冲。质量随时间变化，必须明确系统边界和外部作用，不能把火箭与气体分开后各自套守恒，还要追踪喷气速度。',
        '迁移应用',
      ),
    ],
  },
};
