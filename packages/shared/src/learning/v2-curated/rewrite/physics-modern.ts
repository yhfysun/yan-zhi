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

const HEAT_ARCHIVE = {
  id: 'temperature-heat-internal-energy',
  kind: 'experiment',
  title: '温度、热量与内能：三种量不能互换',
  period: '学习阶段 01—06',
  summary:
    '温度描述热平衡下的冷热程度，热量是能量传递，内能是系统微观能量总和。接触冷热感会受导热影响，不能单凭触觉判断温度。',
  background:
    '相同温度的不同材料摸起来冷热不同，因为导热和热容不同。混合与加热问题需要系统边界、质量和比热。',
  timeline: [
    {
      date: '阶段 01',
      title: '温度由热平衡定义',
      body: '两系统接触足够久后不再有净热流，即达到热平衡。温度计需与物体充分接触并达到自身平衡。',
      sourceIds: ['openstax-temperature'],
    },
    {
      date: '阶段 02',
      title: '热量是过程量',
      body: '热量是温差导致的能量传递，不是物体“含有多少热”。同一个物体在不同过程中可吸热或放热。',
      sourceIds: ['openstax-heat'],
    },
    {
      date: '阶段 03',
      title: '内能是状态量',
      body: '内能描述系统微观运动与相互作用能量。它依赖温度、体积、粒子数和相态，不是一个简单触觉。',
      sourceIds: ['openstax-temperature', 'openstax-heat'],
    },
    {
      date: '阶段 04',
      title: '比热连接热量与温升',
      body: '在无相变的近似下 Q=mcΔT，c 是比热容。单位 J/(kg·K)，热量、质量和温差都要明确。',
      sourceIds: ['openstax-heat'],
    },
    {
      date: '阶段 05',
      title: '相变可无温升吸收能量',
      body: '熔化或汽化过程中温度可近似不变，但系统吸收潜热。只用 mcΔT 会漏掉相变能量。',
      sourceIds: ['openstax-heat'],
    },
    {
      date: '阶段 06',
      title: '用混合与安全实验验证',
      body: '量热实验要记录初温、末温、质量、容器热损失和搅拌。反例包括用触觉判温度或把“热量”当状态量。',
      sourceIds: ['openstax-heat', 'bipm-si'],
    },
  ],
  outcome:
    '可观察结果是能量热平衡、温度、热量、内能、比热和相变，并计算简单量热问题。',
  significance:
    '区分三者是热力学第一定律和能量守恒的基础。',
  sourceCards: [
    source(
      'openstax-temperature',
      '1.1 Temperature and Thermal Equilibrium',
      'OpenStax University Physics Volume 2',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-2/pages/1-1-temperature-and-thermal-equilibrium',
      '核对温度、热平衡和温度测量。',
    ),
    source(
      'openstax-heat',
      '1.4 Heat Transfer, Specific Heat, and Calorimetry',
      'OpenStax University Physics Volume 2',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-2/pages/1-4-heat-transfer-specific-heat-and-calorimetry',
      '核对热量、比热、相变与量热。',
    ),
    source(
      'bipm-si',
      'The International System of Units',
      'BIPM',
      '2019',
      'https://www.bipm.org/en/publications/si-brochure',
      '核对开尔文、焦耳和比热单位。',
    ),
    source(
      'openintro-statistics',
      'OpenIntro Statistics',
      'OpenIntro',
      '2025 年访问版',
      'https://www.openintro.org/book/os/',
      '核对测量、误差和数据处理。',
    ),
  ],
} satisfies LearningV2EventDetail;

const THERMO_ARCHIVE = {
  id: 'thermodynamic-laws-processes',
  kind: 'concept',
  title: '热力学：能量守恒与不可逆方向',
  period: '学习阶段 01—06',
  summary:
    '第一定律规定内能变化等于吸热减对外做功（按所选符号约定），第二定律给自然过程方向和效率上限。熵不是“混乱度”口号，而是可计算的状态函数。',
  background:
    '热力学计算最常见错误是符号约定不统一和系统边界不清。绝热、等温、等压、等容过程条件决定哪些量不变。',
  timeline: [
    {
      date: '阶段 01',
      title: '先定义系统与外界',
      body: '系统边界决定哪些能量交换算热、功或质量流。同一过程改变边界，第一定律的写法也会改变。',
      sourceIds: ['openstax-thermo-systems'],
    },
    {
      date: '阶段 02',
      title: '第一定律是能量守恒',
      body: '常用约定为 ΔU=Q−W，Q 为系统吸热，W 为系统对外做功。使用其他约定时必须全题统一并在题解说明。',
      sourceIds: ['openstax-first-law'],
    },
    {
      date: '阶段 03',
      title: '过程条件限定路径',
      body: '等温、绝热、等压和等容分别固定不同量。无热交换不等于无温度变化，等温也不等于无热量交换。',
      sourceIds: ['openstax-thermo-systems', 'openstax-first-law'],
    },
    {
      date: '阶段 04',
      title: '第二定律给方向和效率限制',
      body: '孤立系统总熵不减，热不能自发从低温流向高温而不留下其他变化。热机效率不可能达到 1。',
      sourceIds: ['openstax-irreversible', 'sep-time-thermo'],
    },
    {
      date: '阶段 05',
      title: '熵与可逆过程需要统计理解',
      body: '可逆过程是理想极限，实际过程有耗散和有限速率。熵增加反映状态数变化和不可逆，不是道德或主观混乱。',
      sourceIds: ['sep-time-thermo', 'openstax-irreversible'],
    },
    {
      date: '阶段 06',
      title: '用能量账本和安全实验核对',
      body: '记录热、功、内能变化和单位，检查总能量闭合。反例包括未声明符号、把绝热当等温或声称效率 100%。',
      sourceIds: ['openstax-first-law', 'bipm-si'],
    },
  ],
  outcome:
    '可观察结果是能按系统边界应用第一定律，识别过程条件，并解释第二定律与效率上限。',
  significance:
    '热力学连接能量守恒和过程方向，是工程、化学与统计物理的基础。',
  sourceCards: [
    source(
      'openstax-thermo-systems',
      '3.1 Thermodynamic Systems',
      'OpenStax University Physics Volume 2',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-2/pages/3-1-thermodynamic-systems',
      '核对系统、状态、过程与过程条件。',
    ),
    source(
      'openstax-first-law',
      '3.2 Work, Heat, and Internal Energy',
      'OpenStax University Physics Volume 2',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-2/pages/3-2-work-heat-and-internal-energy',
      '核对功、热、内能与第一定律。',
    ),
    source(
      'openstax-irreversible',
      '4.1 Reversible and Irreversible Processes',
      'OpenStax University Physics Volume 2',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-2/pages/4-1-reversible-and-irreversible-processes',
      '核对可逆、不可逆和第二定律。',
    ),
    source(
      'sep-time-thermo',
      'Thermodynamic Asymmetry in Time',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/time-thermo/',
      '核对熵、时间方向与统计解释。',
    ),
    source(
      'bipm-si',
      'The International System of Units',
      'BIPM',
      '2019',
      'https://www.bipm.org/en/publications/si-brochure',
      '核对热力学过程中的焦耳、开尔文和功率单位。',
    ),
  ],
} satisfies LearningV2EventDetail;

const LIGHT_ARCHIVE = {
  id: 'wave-particle-light-evidence',
  kind: 'experiment',
  title: '光的波粒二象性：不同实验回答不同问题',
  period: '学习阶段 01—06',
  summary:
    '干涉和衍射支持光的波动描述，光电效应显示能量交换具有量子化特征。波模型和粒子模型不是互相取消，而是描述不同实验侧面。',
  background:
    '光电效应关键不是光强，而是频率是否超过阈值。提高强度可增加光子数，却不改变单个光子能量 hf。',
  timeline: [
    {
      date: '阶段 01',
      title: '干涉与衍射显示波动性',
      body: '双缝和光栅产生明暗条纹，相位差决定叠加结果。条纹间距与波长、缝距和距离有关，条纹位置不能由单次光子决定。',
      sourceIds: ['openstax-blackbody'],
    },
    {
      date: '阶段 02',
      title: '黑体辐射挑战经典连续模型',
      body: '黑体谱的能量分布无法用经典连续振子完全解释，Planck 假设能量交换按 hf 量子化。',
      sourceIds: ['openstax-blackbody'],
    },
    {
      date: '阶段 03',
      title: '光电效应显示频率阈值',
      body: '入射光频率低于阈值时不发射电子，即使增强光强；高于阈值时最大动能随频率增加，光强主要增加电子数。',
      sourceIds: ['openstax-photoelectric'],
    },
    {
      date: '阶段 04',
      title: '光子能量 hf 与功函数',
      body: 'Einstein 关系 K_max=hf−φ。频率低于 φ/h 时无光电子，单位电子伏特需要转换。',
      sourceIds: ['openstax-photoelectric'],
    },
    {
      date: '阶段 05',
      title: '互补描述而非二元巫术',
      body: '波动模型解释传播与干涉，粒子模型解释离散能量交换。量子理论用概率幅统一，不表示光会“看情境装成波或粒子”。',
      sourceIds: ['openstax-photoelectric', 'openstax-blackbody'],
    },
    {
      date: '阶段 06',
      title: '用安全光谱与模拟验证',
      body: '课堂使用低强度光源、滤光片和模拟，记录频率、光强、截止电压。反例是只提高强度试图越过频率阈值。',
      sourceIds: ['openstax-photoelectric', 'bipm-si'],
    },
  ],
  outcome:
    '可观察结果是能用干涉和光电效应分别支持波动与粒子描述，计算光子能量和最大电子动能。',
  significance:
    '波粒二象性训练按实验证据建立模型，而不是把经典直觉强加给量子现象。',
  sourceCards: [
    source(
      'openstax-blackbody',
      '6.1 Blackbody Radiation',
      'OpenStax University Physics Volume 3',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-3/pages/6-1-blackbody-radiation',
      '核对黑体谱、Planck 量子假设和波动背景。',
    ),
    source(
      'openstax-photoelectric',
      '6.2 Photoelectric Effect',
      'OpenStax University Physics Volume 3',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-3/pages/6-2-photoelectric-effect',
      '核对频率阈值、光子能量和功函数。',
    ),
    source(
      'openstax-refraction',
      '1.3 Refraction',
      'OpenStax University Physics Volume 3',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-3/pages/1-3-refraction',
      '核对光速、频率和波长关系。',
    ),
    source(
      'bipm-si',
      'The International System of Units',
      'BIPM',
      '2019',
      'https://www.bipm.org/en/publications/si-brochure',
      '核对焦耳、电子伏特和频率单位。',
    ),
  ],
} satisfies LearningV2EventDetail;

const SPECTRUM_ARCHIVE = {
  id: 'atomic-energy-levels-spectra',
  kind: 'experiment',
  title: '原子光谱：离散能量差怎样形成谱线',
  period: '学习阶段 01—06',
  summary:
    '原子能级离散，光子吸收或发射满足 E=ΔE=hf。发射谱线和吸收谱线记录同一组能量差，谱线强度还依赖跃迁概率和粒子数。',
  background:
    'Bohr 氢原子模型能解释部分谱线但并非完整量子力学。模型有效范围和连续谱、精细结构需要更完整理论。',
  timeline: [
    {
      date: '阶段 01',
      title: '离散谱线提示离散能量差',
      body: '原子气体发出特定波长而不是任意连续颜色，说明内部能量交换受能级结构限制。谱线位置应可重复测量。',
      sourceIds: ['openstax-hydrogen'],
    },
    {
      date: '阶段 02',
      title: 'Bohr 模型给氢能级',
      body: '氢能级近似 E_n=−13.6 eV/n²。能级为负表示束缚态，能量差才对应可观测光子，不能直接取任一能级绝对值。',
      sourceIds: ['openstax-hydrogen'],
    },
    {
      date: '阶段 03',
      title: '发射与吸收对应跃迁',
      body: '电子从高能级到低能级发射光子，从低到高吸收光子。光子能量等于能级差，而不是任意能级绝对值。',
      sourceIds: ['openstax-hydrogen', 'openstax-photoelectric'],
    },
    {
      date: '阶段 04',
      title: '波长由 E=hc/λ 计算',
      body: '用能级差求频率，再由波长关系定位谱线。单位和能级符号要统一，跃迁方向决定发射或吸收。',
      sourceIds: ['openstax-hydrogen'],
    },
    {
      date: '阶段 05',
      title: '谱线强度与选择定则',
      body: '能级差允许的跃迁不一定同样明亮。粒子数、跃迁概率和选择定则影响强度，Bohr 模型不能完整解释全部细节。',
      sourceIds: ['openstax-hydrogen', 'openstax-blackbody'],
    },
    {
      date: '阶段 06',
      title: '用安全光谱图验证',
      body: '用灯管光谱、滤光片或模拟读谱线，比较氢系公式与数据。反例是把谱线宽度当能级厚度或把 Bohr 模型用于所有原子。',
      sourceIds: ['openstax-hydrogen', 'bipm-si'],
    },
  ],
  outcome:
    '可观察结果是能由能级差计算光子频率和波长，区分解释/吸收谱并说明 Bohr 模型边界。',
  significance:
    '原子光谱把量子能级与可观测光联系起来，是理解激光、天文光谱和化学分析的基础。',
  sourceCards: [
    source(
      'openstax-hydrogen',
      '8.1 The Hydrogen Atom',
      'OpenStax University Physics Volume 3',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-3/pages/8-1-the-hydrogen-atom',
      '核对氢能级、发射吸收谱和 Bohr 模型边界。',
    ),
    source(
      'openstax-photoelectric',
      '6.2 Photoelectric Effect',
      'OpenStax University Physics Volume 3',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-3/pages/6-2-photoelectric-effect',
      '核对光子能量与跃迁能量。',
    ),
    source(
      'openstax-blackbody',
      '6.1 Blackbody Radiation',
      'OpenStax University Physics Volume 3',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-3/pages/6-1-blackbody-radiation',
      '核对光量子与光谱能量分布。',
    ),
    source(
      'bipm-si',
      'The International System of Units',
      'BIPM',
      '2019',
      'https://www.bipm.org/en/publications/si-brochure',
      '核对电子伏特、焦耳、频率和波长单位。',
    ),
  ],
} satisfies LearningV2EventDetail;

const QUANTUM_ARCHIVE = {
  id: 'quantum-probability-measurement',
  kind: 'concept',
  title: '量子入门：概率、测量与经典边界',
  period: '学习阶段 01—06',
  summary:
    '量子模型用波函数给出测量结果概率幅，测量得到离散或连续结果。不确定性、叠加和隧穿不是任意神秘，而有明确数学和实验条件。',
  background:
    '宏观物体也有量子描述，但退相干和尺度使经典近似常足够好。量子课程只讨论概念、证据和边界，不提供危险辐射实验。',
  timeline: [
    {
      date: '阶段 01',
      title: '量子化来自可观测离散结果',
      body: '能量、角动量和某些测量可呈离散值。量子化是边界条件和相互作用的结果，不等于所有量都只能取整数。',
      sourceIds: ['openstax-blackbody'],
    },
    {
      date: '阶段 02',
      title: '波函数给出概率幅',
      body: '波函数本身不是直接可测概率，绝对平方给出位置等结果的概率密度。相位影响干涉，不能只看振幅大小。',
      sourceIds: ['openstax-blackbody', 'openstax-hydrogen'],
    },
    {
      date: '阶段 03',
      title: '测量改变可预测范围',
      body: '测量前系统可由叠加态描述，测量得到某个结果并按规则更新状态。单次结果随机不等于理论没有预测力。',
      sourceIds: ['openstax-blackbody'],
    },
    {
      date: '阶段 04',
      title: '不确定性是共轭量约束',
      body: '位置与动量等共轭量的不确定性满足下限关系，不是仪器笨拙或“看一眼改变一切”的简单故事。',
      sourceIds: ['openstax-hydrogen'],
    },
    {
      date: '阶段 05',
      title: '经典近似来自尺度与退相干',
      body: '大尺度、强环境耦合时相位关系难以保持，经典轨迹成为有效描述。量子效应并非只在微观世界存在，但通常更难观测。',
      sourceIds: ['openstax-blackbody', 'openstax-photoelectric'],
    },
    {
      date: '阶段 06',
      title: '用双缝、光电和模拟验证',
      body: '课堂使用安全光和量子模拟，观察干涉、离散探测和概率分布。反例是把量子等同于心想事成或忽略测量设置。',
      sourceIds: ['openstax-photoelectric', 'bipm-si'],
    },
  ],
  outcome:
    '可观察结果是能解释量子化、波函数概率、测量、不确定性和经典近似，并拒绝神秘化。',
  significance:
    '量子入门训练用概率和实验约束替代经典直觉，同时保留可计算与可反驳边界。',
  sourceCards: [
    source(
      'openstax-blackbody',
      '6.1 Blackbody Radiation',
      'OpenStax University Physics Volume 3',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-3/pages/6-1-blackbody-radiation',
      '核对量子化、波函数概念背景与实验证据。',
    ),
    source(
      'openstax-photoelectric',
      '6.2 Photoelectric Effect',
      'OpenStax University Physics Volume 3',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-3/pages/6-2-photoelectric-effect',
      '核对离散探测和频率阈值。',
    ),
    source(
      'openstax-hydrogen',
      '8.1 The Hydrogen Atom',
      'OpenStax University Physics Volume 3',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-3/pages/8-1-the-hydrogen-atom',
      '核对量子数与概率分布。',
    ),
    source(
      'bipm-si',
      'The International System of Units',
      'BIPM',
      '2019',
      'https://www.bipm.org/en/publications/si-brochure',
      '核对量子课程涉及的单位与常数。',
    ),
  ],
} satisfies LearningV2EventDetail;

const HEAT_SOURCES = [
  'OpenStax University Physics Volume 2, 1.1 Temperature and Thermal Equilibrium。https://openstax.org/books/university-physics-volume-2/pages/1-1-temperature-and-thermal-equilibrium',
  'OpenStax University Physics Volume 2, 1.4 Heat Transfer, Specific Heat, and Calorimetry。https://openstax.org/books/university-physics-volume-2/pages/1-4-heat-transfer-specific-heat-and-calorimetry',
  'BIPM, The International System of Units。https://www.bipm.org/en/publications/si-brochure',
  'OpenIntro Statistics。https://www.openintro.org/book/os/',
];

const THERMO_SOURCES = [
  'OpenStax University Physics Volume 2, 3.1 Thermodynamic Systems。https://openstax.org/books/university-physics-volume-2/pages/3-1-thermodynamic-systems',
  'OpenStax University Physics Volume 2, 3.2 Work, Heat, and Internal Energy。https://openstax.org/books/university-physics-volume-2/pages/3-2-work-heat-and-internal-energy',
  'OpenStax University Physics Volume 2, 4.1 Reversible and Irreversible Processes。https://openstax.org/books/university-physics-volume-2/pages/4-1-reversible-and-irreversible-processes',
  'Stanford Encyclopedia of Philosophy, Thermodynamic Asymmetry in Time。https://plato.stanford.edu/entries/time-thermo/',
];

const LIGHT_SOURCES = [
  'OpenStax University Physics Volume 3, 6.1 Blackbody Radiation。https://openstax.org/books/university-physics-volume-3/pages/6-1-blackbody-radiation',
  'OpenStax University Physics Volume 3, 6.2 Photoelectric Effect。https://openstax.org/books/university-physics-volume-3/pages/6-2-photoelectric-effect',
  'OpenStax University Physics Volume 3, 1.3 Refraction。https://openstax.org/books/university-physics-volume-3/pages/1-3-refraction',
  'BIPM, The International System of Units。https://www.bipm.org/en/publications/si-brochure',
];

const SPECTRUM_SOURCES = [
  'OpenStax University Physics Volume 3, 8.1 The Hydrogen Atom。https://openstax.org/books/university-physics-volume-3/pages/8-1-the-hydrogen-atom',
  'OpenStax University Physics Volume 3, 6.2 Photoelectric Effect。https://openstax.org/books/university-physics-volume-3/pages/6-2-photoelectric-effect',
  'OpenStax University Physics Volume 3, 6.1 Blackbody Radiation。https://openstax.org/books/university-physics-volume-3/pages/6-1-blackbody-radiation',
  'BIPM, The International System of Units。https://www.bipm.org/en/publications/si-brochure',
];

const QUANTUM_SOURCES = [
  'OpenStax University Physics Volume 3, 6.1 Blackbody Radiation。https://openstax.org/books/university-physics-volume-3/pages/6-1-blackbody-radiation',
  'OpenStax University Physics Volume 3, 6.2 Photoelectric Effect。https://openstax.org/books/university-physics-volume-3/pages/6-2-photoelectric-effect',
  'OpenStax University Physics Volume 3, 8.1 The Hydrogen Atom。https://openstax.org/books/university-physics-volume-3/pages/8-1-the-hydrogen-atom',
  'BIPM, The International System of Units。https://www.bipm.org/en/publications/si-brochure',
];

export const PHYSICS_MODERN_REWRITE: CuratedCoursePlanPatchMap = {
  'physics:温度、热量与内能': {
    contentStatus: 'reviewed',
    prerequisite: '会使用温度计、热量单位和基本能量守恒。',
    plainLanguageGoal:
      '学完后，你能区分温度、热量和内能，完成简单比热与混合计算，并解释相变和触觉反例。',
    guidedPractice:
      '完成 8 个温度、热量和相变任务，写系统边界、质量、比热、温升和热损失。',
    independentPractice:
      '设计安全的冷热水混合实验，记录初末温与质量，比较理论热量和容器热损失。',
    commonErrors: [
      '把温度高当热量多，或把热量当物体内含的状态量。',
      '忽略质量或相变，只用温度变化判断热量。',
      '只凭触摸判断温度，忽略材料导热和热容。',
    ],
    sourceRefs: HEAT_SOURCES,
    studyPoints: [
      point('必背', '温度描述热平衡冷热、热量是过程传递、内能是系统状态能量；Q=mcΔT 仅在无相变等条件下使用。', 1),
      point('重点', '量热问题要写系统边界、质量、比热、初末温和热损失。', 2),
      point('易错', '触觉受导热影响，不能直接当温度；相变时温度可不变但仍有潜热。', 4),
    ],
    eventDetails: [HEAT_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜金属比木头更冷吗',
        body:
          '先做前测：同室温下摸金属和木头，为什么金属感觉更冷？要求区分温度、热流、导热和内能。记录是否把触觉当温度、是否认为金属温度更低。变式给两者贴相同温度计并等待热平衡。反例是金属温度与木头相同，但导热快使手感觉更冷。后测再用 Q=mcΔT 解释不同材料温升，并写出热流方向与平衡时间。',
        note: '触觉不是温度计。',
        objective: '能用热平衡、导热、热量和内能诊断触觉温度误解。',
        practice: '完成金属木头前测，写温度、热流、导热、比热、平衡时间和一个反例。',
        checkpoint: '检查系统边界、热平衡时间、温度与热量区别、单位和材料差异。',
      },
      {
        title: '材料与概念｜温度、热量与内能',
        body:
          '温度在热平衡意义下描述系统冷热，热量是温差导致的能量传递，内能是系统微观运动与相互作用的总能量。Q=mcΔT 在无相变且热容近似恒定时使用，c 的单位 J/(kg·K)。相变时潜热可改变内能而温度近恒定。热量是过程量，不是物体储存的“热”。量热实验要记录容器和环境影响，单位 J、kg、K 不可混用。',
        note: '热量是过程，内能是状态。',
        objective: '能解释温度、热量、内能、比热、热平衡和相变潜热。',
        practice: '为一个混合问题写系统边界、热量方向、Q=mcΔT 和单位检查。',
        checkpoint: '检查过程量/状态量、质量与比热、相变条件、热损失和单位。',
      },
      {
        title: '示范与推导｜冷热水混合的热量账本',
        body:
          '设 0.2 kg、80°C 的水与 0.3 kg、20°C 的水混合，忽略热损失，则 m₁c(80−T)=m₂c(T−20)，解得 T=44°C。示范把热水放热与冷水吸热分栏，检查质量、温度和单位。反例是直接取两个温度平均得 50°C，忽略质量。变式加入容器热容或部分冰相变，观察方程怎样扩展。',
        note: '热量收支要成对。',
        objective: '能建立冷热水混合热量方程并解释质量、热损和相变变式。',
        practice: '完成一组混合计算、冷热分栏、温度求值、质量变式和单位验证。',
        checkpoint: '检查质量权重、热量方向、相变项、热损失、单位和最终温度范围。',
      },
      {
        title: '引导练习｜八个热量与相变任务',
        body:
          '准备八题，覆盖不同质量、材料、混合、相变、热损失和触觉反例。每题先做前测写系统和未知量，再算 Q 或末温，后测用温度范围和能量账本验证。变式改变质量或是否发生相变，比较末温和热量。记录温度当热量、漏质量、潜热遗漏和单位四类错误。所有热水实验使用安全温度、护目和防烫容器，并记录环境温度。',
        note: '先检查相变再套公式。',
        objective: '能对八类量热问题完成系统、公式、相变、单位与安全分析。',
        practice: '提交八张热量表、两处相变、三个质量变式、实验安全和错误分类。',
        checkpoint: '检查热量方向、质量、比热、潜热、末温范围和单位，热损失有说明。',
      },
      {
        title: '独立迁移与评价｜做一份量热实验报告',
        body:
          '设计安全的冷热水混合或材料比热实验，先做前测写系统与假设，再记录初末温和质量，计算热量并比较热损失。24 小时后改变质量做变式。评价四项：系统边界、测量精度、热量账本、安全。最后写一个触觉或相变导致“温度没变所以无热量”的反例，并说明如何用搅拌、保温、对照、校准和重复测量减少误差。',
        note: '安全温度和热损失要记录。',
        objective: '能把热量与内能模型迁移到量热实验，并用数据、误差和安全评价。',
        practice: '提交实验设计、原始数据、热量计算、24 小时变式、误差与反例。',
        checkpoint: '四项自评：边界清晰、单位完整、能量闭合、安全合规；相变和热损不可遗漏。',
      },
    ],
    quiz: [
      question(
        '温度、热量和内能最准确的区分是什么？',
        '温度描述冷热程度，热量是过程传递能量，内能是系统微观能量总量',
        ['三者完全同义', '热量是状态量', '温度越大内能必定越大'],
        0,
        '温度、热量和内能属于不同层级。内能还依赖粒子数、体积和相态，热量只在过程发生时出现，不能把三者当同义词。',
        '事实与定义',
      ),
      question(
        '冷热水混合忽略热损失时，为什么不能直接把两个初温平均？',
        '不同质量的水对最终温度影响不同，应按 mcΔT 做热量平衡',
        ['因为温度不能相加', '因为水没有比热', '因为热量总是负数'],
        1,
        '热量平衡中质量作为权重，温度差与比热也参与。只有质量相等且比热相同时，简单平均才可能成立，热损失还会改变结果。',
        '材料与推导',
      ),
      question(
        '哪种热量计算最容易遗漏？',
        '发生相变时温度不变，但仍需计入潜热',
        ['记录质量', '记录初末温度', '使用正确比热'],
        2,
        '相变过程中的能量改变温度不变，只用 mcΔT 会漏掉潜热。必须先检查材料和相态，并分别计算显热与潜热。',
        '常见误区',
      ),
      question(
        '把热量模型迁移到建筑保温时，哪种分析最完整？',
        '比较材料导热、热容、面积、温差和时间，并记录热损失路径',
        ['只看室温', '忽略材料厚度', '认为热量会消失'],
        0,
        '建筑热流涉及导热、热容和边界。热量不会消失，只是传递到其他系统，需要追踪路径和时间，并区分温度与热量。',
        '迁移应用',
      ),
    ],
  },
  'physics:热力学定律与过程': {
    contentStatus: 'reviewed',
    prerequisite: '掌握温度、热量、功和内能，能使用 P-V 图。',
    plainLanguageGoal:
      '学完后，你能按统一符号应用第一定律，识别热力学过程，并解释第二定律、熵和效率上限。',
    guidedPractice:
      '分析 8 个 P-V 过程，标系统边界、Q、W、ΔU、熵方向和不可逆来源。',
    independentPractice:
      '用安全气体模拟或数据图表分析等温、绝热和循环过程，检查能量和熵方向。',
    commonErrors: [
      '不说明符号约定就套 ΔU=Q−W。',
      '把绝热过程误认为温度不变，或把等温过程误认为无热量交换。',
      '认为第二定律禁止局部熵减少，或声称热机效率可达 100%。',
    ],
    sourceRefs: THERMO_SOURCES,
    studyPoints: [
      point('必背', '第一定律是能量守恒 ΔU=Q−W（按约定）；第二定律规定孤立系统总熵不减并限制热机效率。', 1),
      point('重点', '先定义系统边界和过程条件，再判断 Q、W、ΔU 与 P-V 图面积。', 2),
      point('易错', '绝热是 Q=0，不保证 ΔT=0；可逆是理想极限，真实过程有耗散。', 4),
    ],
    eventDetails: [THERMO_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜吸热一定升温吗',
        body:
          '先做前测：等温膨胀、绝热压缩和相变吸热，哪些温度变化？要求写系统边界和 Q、W 方向。记录是否把绝热当等温、是否不声明符号约定、是否只看温度不看能量。变式把系统从气体改为气加容器，观察功和热边界变化。反例是孤立系统自发回到更有序状态而总熵降低。后测要画 P-V 图并做能量账本，说明熵产生位置。',
        note: '先定系统，再定符号。',
        objective: '能用系统边界、过程条件和符号约定诊断热力学前测。',
        practice: '完成三个过程前测，写系统、Q/W 符号、ΔU 和熵方向。',
        checkpoint: '检查绝热/等温区别，符号约定，P-V 面积，孤立系统与效率边界。',
      },
      {
        title: '材料与概念｜第一定律、第二定律与熵',
        body:
          '取 ΔU=Q−W，Q 为系统吸热、W 为系统对外做功；其他约定需全题统一。热力学第一定律是能量守恒，过程条件决定 Q、W、T、P 和 V 的限制。热力学第二定律说明孤立系统总熵不减，热机效率低于 1。可逆过程是准静态无耗散极限，真实摩擦和有限温差会产生熵。熵是状态函数，不只是模糊的“混乱”。',
        note: '能量方向与过程方向同时约束。',
        objective: '能解释第一定律、第二定律、熵、可逆、绝热和效率。',
        practice: '为四个过程写 Q/W/ΔU 符号、P-V 特征和熵来源。',
        checkpoint: '检查符号约定、过程条件、热功方向、熵产生、可逆极限和效率单位。',
      },
      {
        title: '示范与推导｜等温与绝热过程比较',
        body:
          '理想气体等温膨胀时 ΔU=0，Q=W，吸热全部对外做功；绝热膨胀 Q=0，ΔU=−W，气体做功导致内能和温度下降。两者都可能体积增加，但温度和能量交换不同。示范算 P-V 曲线下面积与功，并标注方向。反例是看到“膨胀”就认为温度一定不变。变式改为压缩，观察 Q/W 和温度趋势反向。',
        note: 'P-V 面积是功，但要带方向。',
        objective: '能比较等温与绝热过程，并用第一定律解释温度和能量变化。',
        practice: '完成两过程能量表、P-V 草图、功方向、温度判断和一次压缩变式。',
        checkpoint: '检查 ΔU、Q、W 关系，面积方向，温度趋势和符号约定。',
      },
      {
        title: '引导练习｜八个热力学过程',
        body:
          '准备八题，覆盖等温、绝热、等压、等容、循环、局部降温和效率限制。每题先做前测画系统与 P-V 图，再填 Q/W/ΔU，后测计算效率或熵方向并验证能量账本。变式改变路径、温度或耗散，观察功与熵怎样变化。记录符号、绝热等温、第二定律和效率四类错误。若局部系统熵减少，必须找到环境更大的熵增并核对总账。',
        note: '局部熵可降，总账不能降。',
        objective: '能对八类过程完成第一定律、P-V、熵方向和效率分析。',
        practice: '提交八张过程表、P-V 图、三个变式、熵账本和错误分类。',
        checkpoint: '检查系统边界、符号、路径、功面积、温度变化、熵总账和效率上限。',
      },
      {
        title: '独立迁移与评价｜分析一个热机循环',
        body:
          '用一个简化循环数据或模拟，先做前测标吸热、放热、净功和效率，再计算能量账本与熵方向。24 小时后改变低温/高温温度做变式。评价四项：过程条件、符号一致、能量闭合、不可逆性。最后写一个效率达到 1 或热自发反向而没有补偿的反例，并说明卡诺上限、热损失、不可逆摩擦、环境温度和全部单位。',
        note: '效率是收益除输入。',
        objective: '能把热力学定律迁移到循环模型，并用能量、熵和效率评价。',
        practice: '提交循环图、能量表、效率、24 小时温度变式、熵分析和反例。',
        checkpoint: '四项自评：过程明确、符号一致、能量闭合、第二定律满足；缺项需重算。',
      },
    ],
    quiz: [
      question(
        '使用 ΔU=Q−W 前最应该做什么？',
        '声明系统边界和 Q、W 的符号约定，并全题一致使用',
        ['先算效率', '忽略功方向', '把所有热量都设正'],
        0,
        '不同教材的 W 符号约定可能相反。没有统一定义就无法判断吸热和做功的正负，能量账本会互相矛盾，题解必须先说明约定并保持全题一致。',
        '事实与定义',
      ),
      question(
        '绝热膨胀中 Q=0，第一定律说明什么？',
        'ΔU=−W，气体对外做功会使内能和温度下降',
        ['温度一定升高', '内能不变', '功一定为零'],
        1,
        '绝热只是无热交换。若气体膨胀做功且无输入热，只能消耗内能，因此温度通常下降，不能把绝热误当等温或认为 Q=0 就没有能量变化。',
        '材料与推导',
      ),
      question(
        '哪种说法最违反第二定律？',
        '孤立系统可自发从均匀状态集中能量而总熵降低',
        ['热机效率小于 1', '摩擦产生熵', '局部冷却伴随环境熵增加'],
        2,
        '孤立系统总熵不减少。局部有序可以出现，但必须由更大熵增补偿，因此不能只看一个子系统或短期局部，也不能把熵当主观感受。',
        '常见误区',
      ),
      question(
        '把热力学迁移到数据中心散热时，哪种分析最完整？',
        '追踪电能、热流、冷却功、环境温度和总熵，而不只看芯片温度',
        ['只报房间温度', '忽略冷却功耗', '认为热量被删除'],
        0,
        '散热系统需要能量与熵账本。热量被转移到环境，冷却本身也耗能并产生额外热，因此不能只看芯片温度或忽略环境总熵。',
        '迁移应用',
      ),
    ],
  },
  'physics:光的波动性与粒子性': {
    contentStatus: 'reviewed',
    prerequisite: '理解频率、波长、能量和基本概率。',
    plainLanguageGoal:
      '学完后，你能用干涉和光电效应区分波动与粒子证据，计算光子能量和光电子最大动能，并说明互补边界。',
    guidedPractice:
      '分析 8 个双缝、滤光片和光电效应数据，判断波长、强度、频率和截止电压关系。',
    independentPractice:
      '用低强度光源或模拟测量干涉条纹和光电阈值，区分传播性质与能量交换。',
    commonErrors: [
      '认为提高光强就能越过光电效应频率阈值。',
      '把光强与单个光子能量混同。',
      '用“波或粒子只能选一个”替代量子概率模型。',
    ],
    sourceRefs: LIGHT_SOURCES,
    studyPoints: [
      point('必背', '光子能量 E=hf；光电效应满足 K_max=hf−φ，频率低于阈值时光强再大也无光电子。', 1),
      point('重点', '干涉与衍射支持波动描述，离散吸收和发射支持粒子描述，二者是互补模型。', 2),
      point('易错', '光强在粒子图中对应光子数，不提高单个光子能量；单位 eV 与 J 需转换。', 4),
    ],
    eventDetails: [LIGHT_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜增强红光能打出电子吗',
        body:
          '先做前测：低强度高频光和强低频光照射同一金属，哪种可能产生光电子？要求画光强、频率、最大动能和电子数。记录是否只提高亮度、是否把强度当频率、是否区分最大动能和电流。变式更换功函数材料。反例是低于阈值仍靠光强打出电子。后测用 K_max=hf−φ 计算并核对 eV 与 J 的单位。',
        note: '频率决定单光子能量。',
        objective: '能用频率阈值、光强、功函数和电子动能诊断光电效应前测。',
        practice: '完成两组光照前测，写频率、强度、电子数、最大动能和阈值反例。',
        checkpoint: '检查光强与光子数、频率与能量、阈值条件、eV/J 单位和材料功函数。',
      },
      {
        title: '材料与概念｜波动、粒子与光电效应',
        body:
          '干涉和衍射由相位叠加产生，支持光的波动描述。光电效应中光子能量 E=hf，电子最大动能 K_max=hf−φ；低于阈值不发射电子，强度增加主要增加光子数。波模型解释传播和干涉，粒子模型解释离散能量交换，量子理论统一为概率幅。模型选择由实验问题决定，不是光任意变成两种东西，也不是观察者意识决定。',
        note: '互补模型不是矛盾。',
        objective: '能解释波、粒子、干涉、光电效应、频率、概率和互补关系。',
        practice: '为干涉和光电各写实验证据、模型解释、单位和一条不能推出的结论。',
        checkpoint: '检查光强/频率区分，阈值条件，能量单位，波粒模型边界和概率。',
      },
      {
        title: '示范与推导｜由功函数求最大电子动能',
        body:
          '若 φ=2.0 eV，入射光 3.0 eV，则 K_max=1.0 eV；若光能改为 1.5 eV，则低于阈值无光电子。示范先把 hf 统一为 eV 或 J，再判断阈值，最后计算截止电压。反例是把 10% 光强增加当作光子能量增加。再用波长与频率反比做变式，并核对截止电压对应动能。',
        note: '先阈值，再动能。',
        objective: '能用光子能量与功函数计算最大电子动能和截止电压。',
        practice: '完成两组频率、阈值、K_max、截止电压、电子数和单位转换。',
        checkpoint: '检查 hf、φ 同单位，阈值判断，电子数/能量区别，eV/J 转换。',
      },
      {
        title: '引导练习｜八组波粒实验',
        body:
          '准备八题，覆盖双缝条纹、单缝衍射、滤光片、强度变化、材料功函数、波长换算和量子模拟。每题先做前测判断应使用波还是粒子模型，再计算或解释，后测用实验数据验证。变式改变波长、频率或强度，比较条纹、阈值和电子动能。记录能量强度混淆、阈值遗漏、单位、模型绝对化四类错误，并写模型选择依据。',
        note: '换问题，不换物理。',
        objective: '能对八类光学实验完成模型选择、计算和证据解释。',
        practice: '提交八张波粒表、完整计算、两个参数变式、数据验证和错误分类。',
        checkpoint: '检查相位/概率、E=hf、阈值、截止电压、单位和互补表述。',
      },
      {
        title: '独立迁移与评价｜比较干涉与光电证据',
        body:
          '用低强度光源、双缝或光电模拟，先做前测预测条纹或阈值，再记录数据并比较两种模型。24 小时后改变波长或光强做变式。评价四项：实验条件、数据、模型选择、边界。最后写一个“光强可越过频率阈值”的反例并解释光子能量、截止电压、材料功函数、暗电流、测量误差和安全限制。所有强光操作遵守安全。',
        note: '模型跟随实验证据。',
        objective: '能把波粒二象性迁移到安全实验，并用数据、单位和边界评价。',
        practice: '提交两组数据、波粒解释、24 小时变式、安全记录和反例。',
        checkpoint: '四项自评：条件可重复、计算正确、模型匹配、边界清楚；不直视强光。',
      },
    ],
    quiz: [
      question(
        '光电效应中决定单个光子能量的是什么？',
        '频率 f，满足 E=hf',
        ['光强', '照射面积', '材料颜色'],
        0,
        '光子能量由频率决定。光强增加主要是光子数增加，不会自动提高单个光子能量，频率阈值也不能靠亮度绕过，单位必须统一。',
        '事实与定义',
      ),
      question(
        '入射光子能量低于材料功函数时，为什么增强光强仍不出电子？',
        '每个光子都不足以跨越阈值，增加光子数不能增加单个光子能量',
        ['光子互相叠加提高频率', '金属会自动降低功函数', '光强改变电子电荷'],
        1,
        '光电效应是单光子能量交换。低于阈值时更多光子仍各自不足，电子无法逸出，光强只增加尝试次数，截止电压仍为零。',
        '材料与推导',
      ),
      question(
        '哪种波粒解释最不准确？',
        '光有意识地在波和粒子之间切换，实验者想看什么就变成什么',
        ['波模型解释干涉', '粒子模型解释离散能量交换', '量子理论用概率幅统一'],
        2,
        '互补性是模型与测量语境的关系，不是光有意识选择。量子理论用统一数学形式预测，不能把波粒二象性神秘化或当作心理现象。',
        '常见误区',
      ),
      question(
        '把光电模型迁移到太阳能电池时，哪种分析最完整？',
        '比较光谱频率、材料带隙、光强和能量转换损失',
        ['只看电池面积', '认为光越强单个光子能量越大', '忽略材料阈值'],
        0,
        '太阳能转换依赖光子能量与材料带隙、光强和损失机制。只扩大面积不等于提高单光子能量，也要考虑反射、热损失和光谱匹配。',
        '迁移应用',
      ),
    ],
  },
  'physics:原子结构与光谱': {
    contentStatus: 'reviewed',
    prerequisite: '理解光子能量、频率与波长，能读简单光谱图。',
    plainLanguageGoal:
      '学完后，你能由能级差计算光子频率和波长，区分发射/吸收谱，并说明 Bohr 模型的适用范围。',
    guidedPractice:
      '分析 8 个氢原子能级跃迁，计算光子和波长，判断发射或吸收及谱线位置。',
    independentPractice:
      '用氢光谱模拟或安全灯管读谱，比较能级差预测和观测，解释强度与模型边界。',
    commonErrors: [
      '把能级绝对值当光子能量，或忽略跃迁方向。',
      '发射谱与吸收谱位置混用，或认为所有跃迁强度相同。',
      '把 Bohr 模型当成所有原子的完整理论。',
    ],
    sourceRefs: SPECTRUM_SOURCES,
    studyPoints: [
      point('必背', '光子能量等于能级差 E=ΔE=hf=hc/λ；高到低发射，低到高吸收。', 1),
      point('重点', '氢能级 E_n=−13.6 eV/n²，能级为负表示束缚；光子能量取正的差值。', 2),
      point('易错', '谱线强度还依赖跃迁概率与粒子数，Bohr 模型不能解释全部原子和精细结构。', 4),
    ],
    eventDetails: [SPECTRUM_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜为什么氢灯只有几条亮线',
        body:
          '先做前测：氢原子从 n=3 到 n=2 与从 n=2 到 n=3，哪个发射、哪个吸收？要求写能级差、频率和波长关系。记录是否用绝对值、是否把能级负号当不可能、是否把谱线亮度当能量。变式改用不同原子，观察 Bohr 模型是否仍适用。反例是所有跃迁强度相同。后测计算一条可见谱线，并比较谱线位置与亮度。',
        note: '光子能量来自能级差。',
        objective: '能用能级差、跃迁方向和谱线强度诊断原子光谱前测。',
        practice: '完成三组跃迁、发射/吸收、能级差、频率/波长和强度反例。',
        checkpoint: '检查能级差取正、跃迁方向、E=hf、hc/λ、强度与概率和模型边界。',
      },
      {
        title: '材料与概念｜能级、光子与光谱',
        body:
          '原子能级离散，跃迁吸收或发射光子满足 ΔE=hf。氢 Bohr 能级 E_n=−13.6eV/n²，负值是束缚能量约定。发射谱来自高能级向低能级，吸收谱对应低到高。谱线位置由能量差决定，强度受跃迁概率、粒子数和选择定则影响。Bohr 模型解释氢部分谱线，却不能覆盖多电子原子和精细结构。',
        note: '能级差而非绝对能级发谱线。',
        objective: '能解释能级、跃迁、光子、吸收、发射、光谱强度和模型边界。',
        practice: '为两条跃迁写 ΔE、发射/吸收、频率、波长、强度解释和模型适用范围。',
        checkpoint: '检查能级公式、方向、能量单位、波长换算、选择定则和模型适用性。',
      },
      {
        title: '示范与推导｜从 n=3 到 n=2 的氢谱线',
        body:
          'E₃=−13.6/9≈−1.51 eV，E₂=−13.6/4=−3.40 eV，ΔE=1.89 eV。发射光子能量 1.89 eV，换算 J 后用 f=E/h、λ=c/f 得约 656 nm，位于红光附近。反例是直接把 13.6−3.4 当能量，忽略初态。变式从 n=2 到 n=3 为吸收同样能量。',
        note: '先算差，再换波长。',
        objective: '能由氢能级计算谱线能量、频率、波长和吸收/发射方向。',
        practice: '完成 n=3→2 的能级差、eV/J、频率、波长和反向吸收。',
        checkpoint: '检查能级公式、差值方向、单位转换、λ=c/f 和谱区判断。',
      },
      {
        title: '引导练习｜八组原子跃迁',
        body:
          '准备八题，覆盖氢发射、吸收、不同 n、波长转频率、强度差异和 Bohr 模型边界。每题先做前测画能级箭头，再算 ΔE 和波长，后测用光谱图定位并比较强度。变式改变原子种类、n 值或跃迁方向，比较谱线位置。记录绝对值、方向、eV/J、强度四类错误。超高能辐射不进入课堂实验，只用模拟。',
        note: '箭头方向决定发射吸收。',
        objective: '能对八组跃迁完成能级、光子、波长和谱线证据分析。',
        practice: '提交八张能级图、完整计算、光谱定位、两个跃迁变式和错误分类。',
        checkpoint: '检查能级差、能量单位、方向、谱线位置、强度解释和模型边界。',
      },
      {
        title: '独立迁移与评价｜读一条安全光谱',
        body:
          '用安全灯管光谱或模拟，先做前测记录已知谱线，再用氢能级预测至少两条，比较波长、位置和强度。24 小时后换一种原子做变式。评价四项：能级计算、单位、谱线匹配、模型边界。最后写一个“Bohr 模型可解释所有原子全部谱线”的反例，并说明强度为何不只看能级差、模型为何不能无限推广、观测误差怎样记录和验证。',
        note: '模型与数据都要保留。',
        objective: '能把原子光谱模型迁移到安全观测，并用数据、单位与边界评价。',
        practice: '提交谱线记录、能级预测、误差、24 小时原子变式和反例。',
        checkpoint: '四项自评：计算正确、单位完整、匹配有据、边界清楚；不进行危险辐射操作。',
      },
    ],
    quiz: [
      question(
        '原子发射光子的能量由什么决定？',
        '两个能级之间的能量差',
        ['高能级的绝对值', '低能级的绝对值', '原子总质量'],
        0,
        '初末能级差决定光子能量。负能级是束缚能量约定，不能直接把绝对值当发射能量，跃迁方向还要区分吸收与发射，并统一 eV/J。',
        '事实与定义',
      ),
      question(
        '电子从 n=2 到 n=3 通常发生什么？',
        '吸收能量等于能级差的光子',
        ['发射任意能量光子', '保持能级不变', '只改变质量'],
        1,
        '从低能级到高能级需要吸收能量；反向跃迁则发射同样能量的光子。谱线位置相同，但谱型、强度条件与粒子数不同。',
        '材料与推导',
      ),
      question(
        '哪种谱线解释最不完整？',
        '能级差相同，所以所有相关谱线亮度一定相同',
        ['发射和吸收对应同一组能量差', '谱线强度受跃迁概率影响', 'Bohr 模型有适用范围'],
        2,
        '能级差决定位置，强度还受粒子数、选择定则和跃迁概率影响。Bohr 模型也不能解释精细结构、多电子原子和全部谱线。',
        '常见误区',
      ),
      question(
        '把原子光谱迁移到天文观测时，哪种分析最完整？',
        '比较红移前后谱线位置、元素能级、吸收/发射条件和谱线强度',
        ['只数星星数量', '忽略谱线位移', '把所有谱线当同一元素'],
        0,
        '天文光谱通过能级、红移和强度识别元素与物理条件，模型和观测误差都需保留，不能只看一条线定性或忽略谱线宽度。',
        '迁移应用',
      ),
    ],
  },
  'physics:量子世界的第一组概念': {
    contentStatus: 'reviewed',
    prerequisite: '掌握概率、波和光子能量，理解经典物理的适用范围。',
    plainLanguageGoal:
      '学完后，你能解释量子化、波函数概率、测量、不确定性和经典近似，并用证据拒绝神秘化说法。',
    guidedPractice:
      '分析 8 个双缝、光谱、光电和模拟场景，写量子模型、概率、测量和经典边界。',
    independentPractice:
      '用安全光、电子衍射图或模拟建立概率分布，比较预测、单次结果和大量统计。',
    commonErrors: [
      '把波函数直接当可测粒子波，或认为测量前所有结果都不存在。',
      '把不确定性说成仪器粗糙或“看一眼改变一切”。',
      '把量子概念用于意识控制、包治百病等无证据主张。',
    ],
    sourceRefs: QUANTUM_SOURCES,
    studyPoints: [
      point('必背', '量子模型用波函数给出概率幅，平方对应概率密度；测量得到具体结果，单次随机不否定统计预测。', 1),
      point('重点', '不确定性来自共轭量的理论约束，经典近似来自尺度和退相干。', 2),
      point('易错', '量子不等于意识或万能；任何模型都要有可重复证据、单位和适用边界。', 4),
    ],
    eventDetails: [QUANTUM_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜单次落点随机就说明理论无用吗',
        body:
          '先做前测：双缝实验单次探测位置随机，但大量点形成条纹，如何解释？要求区分单次结果、概率分布、干涉和测量设置。记录是否把随机等同无规律、是否把观察者意识当必要条件、是否引用无法检验的量子神秘论。变式改变缝距或波长，观察条纹间距。反例是只凭一次落点判断模式。后测要用重复统计和模型比较。',
        note: '概率模型用统计检验。',
        objective: '能用单次结果、概率分布和干涉证据诊断量子随机性误解。',
        practice: '完成双缝前测，写单次落点、条纹分布、波长/缝距变式和一个错误解释。',
        checkpoint: '检查概率与单次、波函数、测量设置、统计样本和可检验证据。',
      },
      {
        title: '材料与概念｜量子化、波函数与测量',
        body:
          '量子模型用波函数描述状态，绝对平方给出概率密度，相位决定干涉。测量得到具体结果并按规则更新状态；单次随机不等于理论没有预测力。共轭量满足不确定性下限，经典轨迹在大尺度、强环境耦合下成为有效近似。量子化是边界和相互作用结果，不是所有物理量只取整数。量子概念必须有可重复实验、明确单位、误差和数学条件。',
        note: '概率与测量不是意识。',
        objective: '能解释量子、波函数、概率、测量、不确定性、退相干和经典边界。',
        practice: '为一个量子实验写状态、概率、测量结果、统计验证和经典边界。',
        checkpoint: '检查波函数平方、相位、测量设置、误差、单位、证据和反伪科学边界。',
      },
      {
        title: '示范与推导｜从波函数到统计条纹',
        body:
          '双缝模型中，两个路径的概率幅相加，相位差决定某些位置相长、某些相消，屏幕上的概率密度形成条纹。单次探测只给一个点，多次记录才近似概率分布。示范改变波长，条纹间距按几何关系变化；关闭一缝后分布改变。反例是把单次落点当完整分布，或用观测者意识代替测量设置。最后用足够样本量和置信范围估计误差。',
        note: '概率幅相加，概率是模平方。',
        objective: '能由双缝模型解释概率幅、相位、干涉和单次/统计差异。',
        practice: '画双缝概率幅、相长/相消位置、单次点和多次条纹，并做缝数变式。',
        checkpoint: '检查概率幅与概率、相位、测量设置、单次随机、统计预测和样本量。',
      },
      {
        title: '引导练习｜八组量子证据',
        body:
          '准备八场景，覆盖双缝、光电、光谱、电子衍射、不确定性、退相干和伪科学说法。每题先做前测选模型，再写概率、能量和测量设置，后测用数据或模拟验证。变式改变波长、粒子数或环境耦合，观察分布和经典近似。记录神秘化、只看单次、忽视模型条件和样本量四类错误，并写出可重复检验方案、失败条件和边界。',
        note: '每个量子说法都要有证据。',
        objective: '能对八类量子证据完成模型选择、概率、测量和边界分析。',
        practice: '提交八张量子证据表、两个统计模拟、三个变式、单位和伪科学拒绝理由。',
        checkpoint: '检查概率、相位、测量、统计、不确定性、退相干和可重复证据。',
      },
      {
        title: '独立迁移与评价｜做一次量子概率模拟',
        body:
          '用安全光、电子衍射图或模拟，先做前测预测分布，再采集单次结果和累计统计，比较模型。24 小时后改变一个参数做变式。评价四项：模型条件、概率解释、统计证据、经典边界。最后写一个“量子意识控制结果”的无证据反例，并说明应要求什么可重复证据、误差范围、样本量和独立复现，不能用个案替代统计。',
        note: '边界与证据同样重要。',
        objective: '能把量子概率模型迁移到模拟，并用统计、边界和证据评价陈述。',
        practice: '提交预测、单次与累计图、24 小时变式、模型边界和反伪科学说明。',
        checkpoint: '四项自评：概率正确、统计充分、单位与条件清楚、边界诚实；拒绝不可检验的万能量子论。',
      },
    ],
    quiz: [
      question(
        '量子波函数与概率的关系最准确是什么？',
        '波函数的绝对平方给出概率密度，相位影响干涉',
        ['波函数就是可直接观察的粒子轨迹', '概率等于波函数本身', '波函数只描述宏观物体'],
        0,
        '波函数是概率幅，本身通常不可直接测；模平方给概率密度。相位关系是干涉核心，单次测量只给一个结果，统计需要重复样本。',
        '事实与定义',
      ),
      question(
        '双缝实验单次探测落点随机，为什么仍能检验理论？',
        '多次结果的概率分布可预测并与实验比较，单次随机不等于无规律',
        ['因为单次落点必须固定', '因为随机性不需要统计', '因为观察者意识决定所有结果'],
        1,
        '量子理论预测分布和统计量，通过大量重复检验。单次结果随机并不否定可计算概率，样本量不足才无法比较分布和显著性。',
        '材料与推导',
      ),
      question(
        '哪种量子说法最应被拒绝？',
        '量子意识可以无证据地包治疾病或操纵所有随机事件',
        ['量子化有实验证据', '测量影响状态描述', '经典近似在大尺度有效'],
        2,
        '可检验量子理论有数学结构和重复实验。把量子当万能神秘力量没有可反驳机制，超出物理学边界，也不应替代医疗或专业判断。',
        '常见误区',
      ),
      question(
        '把量子概率迁移到随机数模拟时，哪种验证最完整？',
        '比较单次序列、累计分布和理论概率，并检查随机源与样本量',
        ['只看第一次结果', '忽略模型参数', '认为任何偏差都证明量子现象'],
        0,
        '随机模拟也需统计检验。单次结果无意义，累计分布、样本量、伪随机性和模型参数共同决定验证质量，偏差需有替代解释和复现。',
        '迁移应用',
      ),
    ],
  },
};
