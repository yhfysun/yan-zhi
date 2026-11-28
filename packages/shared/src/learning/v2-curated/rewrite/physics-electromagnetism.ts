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

const CHARGE_ARCHIVE = {
  id: 'charge-field-potential-model',
  kind: 'experiment',
  title: '电荷、电场与电势：场不是力，电势不是势能',
  period: '学习阶段 01—06',
  summary:
    '电场描述单位正电荷所受的力，电势描述单位电荷的势能位置。电场是矢量可叠加，电势是标量可代数相加；接地提供参考与电荷转移路径。',
  background:
    '静电现象由电荷、导体和绝缘体共同决定。摩擦起电不是创造电荷，而是分离已有电荷；感应与接地需要具体路径。',
  timeline: [
    {
      date: '阶段 01',
      title: '电荷有正负且守恒',
      body: '同种电荷相斥、异种相吸。摩擦转移电子，使两物体带等量异号净电荷，系统总电荷保持。',
      sourceIds: ['openstax-charge'],
    },
    {
      date: '阶段 02',
      title: '导体与绝缘体约束移动',
      body: '导体中部分电荷可移动，绝缘体中电荷更受束缚。感应时导体内部电荷重排，净电荷总量不必改变，但局部表面会出现净电荷。',
      sourceIds: ['openstax-conductors'],
    },
    {
      date: '阶段 03',
      title: '电场是矢量场',
      body: 'E=F/q 表示单位正电荷受力。多电荷场按矢量叠加，场线方向给正试探电荷受力方向，密度表示强弱。',
      sourceIds: ['openstax-charge'],
    },
    {
      date: '阶段 04',
      title: '电势是标量位置量',
      body: '电势 V 与单位电荷势能相关，电势差驱动电荷运动。电势可正可负，数值大小不直接等于受力大小。',
      sourceIds: ['openstax-potential'],
    },
    {
      date: '阶段 05',
      title: '接地选择参考与路径',
      body: '接地可为电势设参考并允许电荷流入大地。接地后的电荷分布取决于导体、外部电场和连接位置。',
      sourceIds: ['openstax-conductors', 'openstax-potential'],
    },
    {
      date: '阶段 06',
      title: '用叠加和反例验证',
      body: '反例包括把电场方向当电势高低，或忽略矢量分量直接相加。低压静电实验需防高压源和敏感设备。',
      sourceIds: ['openstax-charge', 'openstax-potential'],
    },
  ],
  outcome:
    '可观察结果是能计算点电荷场与电势的叠加，区分力和能量，并解释导体感应与接地。',
  significance:
    '场与势是电磁学的统一语言，为电路、感应和波提供基础。',
  sourceCards: [
    source(
      'openstax-charge',
      '5.1 Electric Charge',
      'OpenStax University Physics Volume 2',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-2/pages/5-1-electric-charge',
      '核对电荷、电场和叠加。',
    ),
    source(
      'openstax-conductors',
      '5.2 Conductors, Insulators, and Charging by Induction',
      'OpenStax University Physics Volume 2',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-2/pages/5-2-conductors-insulators-and-charging-by-induction',
      '核对导体、绝缘体、感应和接地。',
    ),
    source(
      'openstax-potential',
      '7.1 Electric Potential Energy',
      'OpenStax University Physics Volume 2',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-2/pages/7-1-electric-potential-energy',
      '核对电势能、电势和电势差。',
    ),
    source(
      'bipm-si',
      'The International System of Units',
      'BIPM',
      '2019',
      'https://www.bipm.org/en/publications/si-brochure',
      '核对电荷、电场和电势的单位。',
    ),
  ],
} satisfies LearningV2EventDetail;

const CIRCUIT_ARCHIVE = {
  id: 'circuit-current-voltage-resistance',
  kind: 'experiment',
  title: '电路：电流、电压和电阻各描述什么',
  period: '学习阶段 01—06',
  summary:
    '电流是电荷流动率，电压是单位电荷能量差，电阻限制电流。欧姆定律适用于特定元件条件，串并联改变总电阻和电流分配。',
  background:
    '“电流被用完”是常见误解。闭合电路中电荷流动，能量由电源提供并在元件中转化，电流在串联支路中连续。',
  timeline: [
    {
      date: '阶段 01',
      title: '电流是电荷通过率',
      body: 'I=ΔQ/Δt，方向按正电荷流动约定。电子实际漂移方向可相反，但常规电流符号统一使用正电荷方向。串联回路各截面电流相同。',
      sourceIds: ['openstax-current'],
    },
    {
      date: '阶段 02',
      title: '电压是单位电荷能量差',
      body: '电势差表示单位电荷从一点到另一点的能量变化。电源提供电动势，电阻把电能转为热，电压不等于电流。',
      sourceIds: ['openstax-emf'],
    },
    {
      date: '阶段 03',
      title: '电阻依赖材料与几何',
      body: 'R=ρL/A，电阻率是材料属性，长度和截面积改变阻力。温度也可影响电阻，长度翻倍并不只增加一倍功耗。',
      sourceIds: ['openstax-resistance'],
    },
    {
      date: '阶段 04',
      title: '欧姆定律有条件',
      body: '对欧姆元件 V=IR。非欧姆元件或温度显著变化时，V-I 关系可能非线性，不能无条件套公式。',
      sourceIds: ['openstax-current', 'openstax-resistance'],
    },
    {
      date: '阶段 05',
      title: '功率描述能量转化率',
      body: 'P=IV=I²R=V²/R。电阻功率转为热，电源还需考虑内阻和效率。电流大不代表功率必然大，电压也参与。',
      sourceIds: ['openstax-emf'],
    },
    {
      date: '阶段 06',
      title: '串并联与安全实验',
      body: '串联电流相同、电压分配；并联电压相同、电流分配。只用低压电源，避免短路、过热和错误量程。',
      sourceIds: ['openstax-current', 'openstax-emf'],
    },
  ],
  outcome:
    '可观察结果是能区分电流、电压、电阻，计算功率，并用串并联规则分析低压电路。',
  significance:
    '电路模型连接场的能量描述与实际电气测量，也是安全用电的基础。',
  sourceCards: [
    source(
      'openstax-current',
      '9.1 Electrical Current',
      'OpenStax University Physics Volume 2',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-2/pages/9-1-electrical-current',
      '核对电流、欧姆定律和符号。',
    ),
    source(
      'openstax-emf',
      '10.1 Electromotive Force',
      'OpenStax University Physics Volume 2',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-2/pages/10-1-electromotive-force',
      '核对电动势、内阻、功率和电路能量。',
    ),
    source(
      'openstax-resistance',
      '9.3 Resistivity and Resistance',
      'OpenStax University Physics Volume 2',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-2/pages/9-3-resistivity-and-resistance',
      '核对电阻率、电阻几何和温度影响。',
    ),
    source(
      'bipm-si',
      'The International System of Units',
      'BIPM',
      '2019',
      'https://www.bipm.org/en/publications/si-brochure',
      '核对安培、伏特、欧姆和瓦特单位。',
    ),
  ],
} satisfies LearningV2EventDetail;

const INDUCTION_ARCHIVE = {
  id: 'electromagnetic-induction-flux',
  kind: 'experiment',
  title: '电磁感应：磁通量变化怎样产生电动势',
  period: '学习阶段 01—06',
  summary:
    '感应电动势来自穿过回路的磁通量变化。法拉第定律给大小，楞次定律给方向，能量守恒解释感应电流的阻碍作用。',
  background:
    '磁场存在但不变化不一定产生感应电动势。必须改变磁通量：改磁场、面积、角度或相对运动。',
  timeline: [
    {
      date: '阶段 01',
      title: '磁场是有方向的矢量场',
      body: '磁感应强度 B 有大小和方向。磁感线闭合，单位与特斯拉相关；方向判断不能只看铁屑图案。',
      sourceIds: ['openstax-faraday'],
    },
    {
      date: '阶段 02',
      title: '磁通量是穿过面积的有效量',
      body: 'Φ_B=B·A=BA cosθ。改变 B、面积或夹角都可改变磁通量，面积法线和磁场夹角必须一致。',
      sourceIds: ['openstax-faraday'],
    },
    {
      date: '阶段 03',
      title: '法拉第定律给电动势大小',
      body: 'ε=−N ΔΦ/Δt，N 是匝数。变化越快或匝数越多，感应电动势越大；要使用一段时间的平均变化率或瞬时变化率。',
      sourceIds: ['openstax-faraday'],
    },
    {
      date: '阶段 04',
      title: '楞次定律给阻碍方向',
      body: '感应电流产生的磁通量阻碍原磁通量变化，而不是总与外部磁场反向。磁通增加与减少时方向不同。',
      sourceIds: ['openstax-lenz'],
    },
    {
      date: '阶段 05',
      title: '能量守恒限制“免费发电”',
      body: '感应电流会受磁力阻碍，机械功转为电能。若声称仅靠静磁场持续发电，必须检查能量来源和闭合回路。',
      sourceIds: ['openstax-lenz', 'openstax-motional-emf'],
    },
    {
      date: '阶段 06',
      title: '用线圈和磁体实验验证',
      body: '插入磁体、保持静止和改变速度比较电流计读数。反例是磁体静止但宣称有稳定感应电流，或忽略线圈方向。',
      sourceIds: ['openstax-motional-emf', 'openstax-faraday'],
    },
  ],
  outcome:
    '可观察结果是能计算磁通量变化率与感应电动势，判断方向并解释能量来源。',
  significance:
    '电磁感应连接电、磁与机械能，是发电机和变压器的核心模型。',
  sourceCards: [
    source(
      'openstax-faraday',
      '13.1 Faraday’s Law',
      'OpenStax University Physics Volume 2',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-2/pages/13-1-faradays-law',
      '核对磁通量、法拉第定律和电动势。',
    ),
    source(
      'openstax-lenz',
      '13.2 Lenz’s Law',
      'OpenStax University Physics Volume 2',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-2/pages/13-2-lenzs-law',
      '核对感应电流方向和磁通量阻碍。',
    ),
    source(
      'openstax-motional-emf',
      '13.3 Motional Emf',
      'OpenStax University Physics Volume 2',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-2/pages/13-3-motional-emf',
      '核对运动导体、能量转化和方向。',
    ),
    source(
      'bipm-si',
      'The International System of Units',
      'BIPM',
      '2019',
      'https://www.bipm.org/en/publications/si-brochure',
      '核对特斯拉、韦伯和伏特单位。',
    ),
  ],
} satisfies LearningV2EventDetail;

const WAVE_ARCHIVE = {
  id: 'mechanical-wave-sound-model',
  kind: 'experiment',
  title: '波与声：介质振动怎样传递能量',
  period: '学习阶段 01—06',
  summary:
    '机械波传播振动和能量，介质质点不随波整体迁移。频率由波源决定，波速由介质条件决定，波长满足 v=fλ。',
  background:
    '声音不是“空气分子从声源跑到耳朵”，而是压强扰动传播。频率决定音高，声压振幅与响度相关但并不等同主观音量。',
  timeline: [
    {
      date: '阶段 01',
      title: '波传播状态而非介质整体',
      body: '横波质点振动方向垂直传播方向，纵波平行。媒质质点围绕平衡位置振动，波峰移动但物质不整体随行。',
      sourceIds: ['openstax-traveling-waves'],
    },
    {
      date: '阶段 02',
      title: '波长、频率与波速关联',
      body: '波长 λ 是一次完整周期在空间中的长度，频率 f 是单位时间振动次数，v=fλ。三者单位分别是 m、Hz、m/s。',
      sourceIds: ['openstax-wave-math'],
    },
    {
      date: '阶段 03',
      title: '介质条件影响波速',
      body: '弦波速度与张力和线密度有关，声速随介质弹性与密度变化。频率改变通常不改变线性介质中的波速。',
      sourceIds: ['openstax-traveling-waves', 'openstax-sound'],
    },
    {
      date: '阶段 04',
      title: '声波是压强扰动',
      body: '声波在空气中为纵波，声压振幅与能量相关。人耳主观响度还依赖频率和听觉系统，不等于声压数值。',
      sourceIds: ['openstax-sound'],
    },
    {
      date: '阶段 05',
      title: '边界与共振改变波形',
      body: '反射、叠加和边界条件可形成驻波。共振频率由系统和边界决定，外界频率接近时振幅可增大。',
      sourceIds: ['openstax-wave-math'],
    },
    {
      date: '阶段 06',
      title: '用弦、弹簧和声频实验验证',
      body: '测量多个周期的时间和波形长度算 f、λ、v。反例是把音量大小当频率高低，或忽略温度对空气声速的影响。',
      sourceIds: ['openstax-sound', 'openstax-traveling-waves'],
    },
  ],
  outcome:
    '可观察结果是能由实验求频率、波长和波速，解释介质、边界和共振对声音的影响。',
  significance:
    '波模型连接振动、声音、电磁波和光学，是周期传播的统一描述。',
  sourceCards: [
    source(
      'openstax-traveling-waves',
      '16.1 Traveling Waves',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/16-1-traveling-waves',
      '核对横波、纵波和波速。',
    ),
    source(
      'openstax-wave-math',
      '16.2 Mathematics of Waves',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/16-2-mathematics-of-waves',
      '核对频率、波长、叠加与驻波。',
    ),
    source(
      'openstax-sound',
      '17.1 Sound Waves',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/17-1-sound-waves',
      '核对声压、声速和声波传播。',
    ),
    source(
      'bipm-si',
      'The International System of Units',
      'BIPM',
      '2019',
      'https://www.bipm.org/en/publications/si-brochure',
      '核对赫兹、米和声压单位。',
    ),
  ],
} satisfies LearningV2EventDetail;

const OPTICS_ARCHIVE = {
  id: 'reflection-refraction-imaging',
  kind: 'experiment',
  title: '反射、折射与成像：光线模型何时有效',
  period: '学习阶段 01—06',
  summary:
    '反射角等于入射角，折射由介质光速变化引起，斯涅尔定律给出角度关系。薄透镜成像依赖焦距、物距和符号约定。',
  background:
    '光线模型忽略衍射与波动细节，在尺度远大于波长时好用。实像可由光实际会聚，虚像由反向延长线形成。',
  timeline: [
    {
      date: '阶段 01',
      title: '光线表示传播方向',
      body: '光线垂直于波面，用于追踪反射和折射路径。它是模型线，不是物理上无限细的实体，也不能表示全部衍射。微小结构需改用波动模型。',
      sourceIds: ['openstax-reflection'],
    },
    {
      date: '阶段 02',
      title: '反射定律与镜面条件',
      body: '入射角等于反射角，角度相对法线测量。粗糙表面产生漫反射，但局部仍满足反射关系，整体方向分布因此改变。',
      sourceIds: ['openstax-reflection'],
    },
    {
      date: '阶段 03',
      title: '折射率改变光速与方向',
      body: 'n=c/v，光从一种介质进入另一种介质时频率不变、速度和波长改变。斯涅尔定律 n₁ sinθ₁=n₂ sinθ₂。',
      sourceIds: ['openstax-refraction'],
    },
    {
      date: '阶段 04',
      title: '临界角与全反射',
      body: '光从光密介质射向光疏介质且入射角超过临界角时发生全反射。光纤利用该条件约束光，临界角由两侧折射率决定，低于临界角仍有折射。',
      sourceIds: ['openstax-refraction'],
    },
    {
      date: '阶段 05',
      title: '薄透镜连接物距像距',
      body: '1/f=1/d_o+1/d_i，放大率 m=−d_i/d_o。实像与虚像、正立与倒立要按符号约定判断，单位统一为米或厘米。虚像像距取负时必须写清约定。',
      sourceIds: ['openstax-lenses'],
    },
    {
      date: '阶段 06',
      title: '用光具座和光线图验证',
      body: '低功率激光或光具座需避免直视光束。反例是角度相对界面测量、把虚像当实际光会聚位置或忽略符号。每次只改一个入射角或物距。',
      sourceIds: ['openstax-lenses', 'openstax-reflection'],
    },
  ],
  outcome:
    '可观察结果是能画反射折射光线、计算全反射和薄透镜成像，并说明实像虚像。',
  significance:
    '光学模型连接波、材料与成像设备，同时训练符号和近似条件。',
  sourceCards: [
    source(
      'openstax-reflection',
      '1.2 The Law of Reflection',
      'OpenStax University Physics Volume 3',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-3/pages/1-2-the-law-of-reflection',
      '核对光线、法线、反射角和漫反射。',
    ),
    source(
      'openstax-refraction',
      '1.3 Refraction',
      'OpenStax University Physics Volume 3',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-3/pages/1-3-refraction',
      '核对折射率、斯涅尔定律和全反射。',
    ),
    source(
      'openstax-lenses',
      '2.4 Thin Lenses',
      'OpenStax University Physics Volume 3',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-3/pages/2-4-thin-lenses',
      '核对透镜方程、实像和虚像。',
    ),
    source(
      'bipm-si',
      'The International System of Units',
      'BIPM',
      '2019',
      'https://www.bipm.org/en/publications/si-brochure',
      '核对米、屈光度与相关单位背景。',
    ),
  ],
} satisfies LearningV2EventDetail;

const CHARGE_SOURCES = [
  'OpenStax University Physics Volume 2, 5.1 Electric Charge。https://openstax.org/books/university-physics-volume-2/pages/5-1-electric-charge',
  'OpenStax University Physics Volume 2, 5.2 Conductors, Insulators and Induction。https://openstax.org/books/university-physics-volume-2/pages/5-2-conductors-insulators-and-charging-by-induction',
  'OpenStax University Physics Volume 2, 7.1 Electric Potential Energy。https://openstax.org/books/university-physics-volume-2/pages/7-1-electric-potential-energy',
  'BIPM, The International System of Units。https://www.bipm.org/en/publications/si-brochure',
];

const CIRCUIT_SOURCES = [
  'OpenStax University Physics Volume 2, 9.1 Electrical Current。https://openstax.org/books/university-physics-volume-2/pages/9-1-electrical-current',
  'OpenStax University Physics Volume 2, 9.3 Resistivity and Resistance。https://openstax.org/books/university-physics-volume-2/pages/9-3-resistivity-and-resistance',
  'OpenStax University Physics Volume 2, 10.1 Electromotive Force。https://openstax.org/books/university-physics-volume-2/pages/10-1-electromotive-force',
  'BIPM, The International System of Units。https://www.bipm.org/en/publications/si-brochure',
];

const INDUCTION_SOURCES = [
  'OpenStax University Physics Volume 2, 13.1 Faraday’s Law。https://openstax.org/books/university-physics-volume-2/pages/13-1-faradays-law',
  'OpenStax University Physics Volume 2, 13.2 Lenz’s Law。https://openstax.org/books/university-physics-volume-2/pages/13-2-lenzs-law',
  'OpenStax University Physics Volume 2, 13.3 Motional Emf。https://openstax.org/books/university-physics-volume-2/pages/13-3-motional-emf',
  'BIPM, The International System of Units。https://www.bipm.org/en/publications/si-brochure',
];

const WAVE_SOURCES = [
  'OpenStax University Physics Volume 1, 16.1 Traveling Waves。https://openstax.org/books/university-physics-volume-1/pages/16-1-traveling-waves',
  'OpenStax University Physics Volume 1, 16.2 Mathematics of Waves。https://openstax.org/books/university-physics-volume-1/pages/16-2-mathematics-of-waves',
  'OpenStax University Physics Volume 1, 17.1 Sound Waves。https://openstax.org/books/university-physics-volume-1/pages/17-1-sound-waves',
  'BIPM, The International System of Units。https://www.bipm.org/en/publications/si-brochure',
];

const OPTICS_SOURCES = [
  'OpenStax University Physics Volume 3, 1.2 The Law of Reflection。https://openstax.org/books/university-physics-volume-3/pages/1-2-the-law-of-reflection',
  'OpenStax University Physics Volume 3, 1.3 Refraction。https://openstax.org/books/university-physics-volume-3/pages/1-3-refraction',
  'OpenStax University Physics Volume 3, 2.4 Thin Lenses。https://openstax.org/books/university-physics-volume-3/pages/2-4-thin-lenses',
  'BIPM, The International System of Units。https://www.bipm.org/en/publications/si-brochure',
];

export const PHYSICS_ELECTROMAGNETISM_REWRITE: CuratedCoursePlanPatchMap = {
  'physics:电荷、电场与电势': {
    contentStatus: 'reviewed',
    prerequisite: '理解矢量、力与能量，能使用低压静电材料或模拟。',
    plainLanguageGoal:
      '学完后，你能区分电荷、电场、电势和势能，完成一维叠加，并解释导体感应与接地。',
    guidedPractice:
      '分析 8 个点电荷或导体场景，画电场方向、算电势叠加、判断受力与接地路径。',
    independentPractice:
      '用低压静电或 PhET 模拟记录吸引/排斥和感应现象，并与电场、电势差解释对照。',
    commonErrors: [
      '把电场方向和电势高低当成同一件事。',
      '电势是标量却按矢量方向相加，或电场只加大小不加方向。',
      '摩擦起电被说成创造电荷，忽略系统电荷守恒。',
    ],
    sourceRefs: CHARGE_SOURCES,
    studyPoints: [
      point('必背', '电荷守恒；电场 E=F/q 是矢量，电势是标量，电势差与单位电荷势能变化相关。', 1),
      point('重点', '多电荷场按矢量叠加，电势按代数相加；导体感应和接地需追踪可移动电荷。', 2),
      point('易错', '单位正电荷受力方向给电场方向，不等于电势增加方向；接地不必然让所有电荷消失。', 4),
    ],
    eventDetails: [CHARGE_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜吸起纸屑说明纸屑一定带电吗',
        body:
          '先做前测：带电橡胶棒靠近中性纸屑，为什么纸屑被吸引？要求画感应电荷、电场方向和可能的接地路径。记录是否认为只有带电物体才能被吸引、是否把“电势高”与“受力大”混同。变式改变电荷符号，观察电场方向翻转但场强大小不变。反例是摩擦前后系统总电荷不守恒的说法。后测要分开电场、电势和能量。',
        note: '先区分力、场和势能。',
        objective: '能用感应、电荷守恒和场/势区别诊断静电前测。',
        practice: '完成纸屑前测，画感应电荷、电场方向、一个接地路径和两种符号变式。',
        checkpoint: '检查总电荷守恒，电场矢量方向，电势标量性质，接地路径和单位。',
      },
      {
        title: '材料与概念｜电荷、电场、电势与势能',
        body:
          '电荷有正负，摩擦转移电子而总电荷守恒。电场 E=F/q 是单位正电荷受力场，是矢量；电场线从正电荷指向外。电势 V 是单位电荷的势能位置量，是标量，可代数叠加。电势差驱动电荷运动。导体中电荷可移动，感应会重排电荷；接地可提供参考和转移路径。静电实验只用低压、安全材料，并记录湿度等条件。',
        note: '场是矢量，势是标量。',
        objective: '能解释电荷、电场、电势、势能、叠加、导体感应与接地。',
        practice: '为两点电荷画场线与等势概念，分别写一个矢量叠加和一个标量叠加例子。',
        checkpoint: '检查电场方向和单位，电势正负，导体内部重排，接地路径与条件。',
      },
      {
        title: '示范与推导｜两个同号点电荷的叠加',
        body:
          '两个同号点电荷在轴线上，中点电场大小相等方向相反，合场为零；电势却为两者正值之和，不为零。示范分别算 E 和 V，再用试探电荷受力与能量解释差异。反例是看到电势不为零就认为中点一定有电场。变式改为一正一负，观察中点电场相加而电势可能抵消；再移动电荷位置，检查场方向、等势面和单位。',
        note: '叠加规则取决于量是矢量还是标量。',
        objective: '能对同号和异号点电荷分别计算电场与电势叠加。',
        practice: '完成两种电荷配置的中点电场、电势、试探正电荷受力与一个反例。',
        checkpoint: '检查矢量方向、标量符号、单位和反例解释，是否正确区分 E=0 与 V=0。',
      },
      {
        title: '引导练习｜八个场与导体场景',
        body:
          '准备八场景，覆盖点电荷场、电势差、导体球、感应、接地、两电荷零场点和带电板。每题先做前测判断矢量或标量，再计算或画图，后测用试探电荷和单位验证。变式改变电荷符号、位置或接地位置，观察场和电势如何变化。记录场势混淆、矢量漏分量、接地误解和单位四类错误。高压设备不进入课堂实验，只使用低压或模拟。',
        note: '接地位置改变问题。',
        objective: '能对八类静电场问题完成方向、叠加、能量和接地分析。',
        practice: '提交八张场势表、接地图、三个符号变式、单位检查和错误分类。',
        checkpoint: '检查场矢量与势标量，电荷守恒，接地路径，单位 V/m 与 V，反例完整。',
      },
      {
        title: '独立迁移与评价｜用安全实验检验静电模型',
        body:
          '用低压静电材料或 PhET 模拟，先做前测预测吸引、排斥和感应，再记录现象、距离、材料与湿度影响。24 小时后改变一个条件做变式。评价四项：现象可重复、场势区分、接地路径、单位与安全。最后写一个“被吸引不等于带同号净电荷”的反例，并说明是感应电荷还是净电荷造成，以及如何用另一次实验区分。',
        note: '安全与可重复优先。',
        objective: '能把场和势模型迁移到安全静电实验，并用数据、条件和反例评价。',
        practice: '提交实验记录、场势解释、24 小时变式、误差与一个反例。',
        checkpoint: '四项自评：现象真实、模型清楚、方向正确、安全合规；高压源不得用于课堂。',
      },
    ],
    quiz: [
      question(
        '电场与电势最关键的区别是什么？',
        '电场是单位正电荷受力的矢量，电势是单位电荷势能位置量、为标量',
        ['两者都是矢量', '电势决定受力方向', '电场只能由正电荷产生'],
        0,
        '电场可按矢量叠加，电势按标量相加。电势高低不直接给出力方向，二者单位也不同，不能用一个量的正负解释另一个，等势面上电场也未必为零。',
        '事实与定义',
      ),
      question(
        '两个等量同号点电荷中点，电场和电势通常如何？',
        '合电场为零，电势为两正值之和且不为零',
        ['两者都为零', '电场不为零，电势为零', '两者方向相同'],
        1,
        '两个电场在中点方向相反抵消，但电势是标量，正值相加。E=0 不能推出 V=0；反过来 V=0 也可能有非零电场，必须分别计算。',
        '材料与推导',
      ),
      question(
        '哪种静电解释最错误？',
        '摩擦创造新电荷，因此总电荷增加',
        ['摩擦转移电子', '导体电荷可重排', '接地可提供电荷路径'],
        2,
        '起电是电荷分离和转移，系统总电荷守恒。创造净电荷会违反电荷守恒，摩擦只是让电子在物体间重新分配，两个物体带等量异号净电荷。',
        '常见误区',
      ),
      question(
        '把场势模型迁移到电子设备防护时，哪种分析最完整？',
        '区分外部电场、导体感应、接地路径和敏感元件电位差',
        ['只看材料颜色', '认为绝缘体永不极化', '忽略接地位置'],
        0,
        '设备防护涉及场、感应电荷和电位差。接地路径与局部几何都会改变风险，不能只看材料名称，也不能忽略敏感元件和连接顺序。',
        '迁移应用',
      ),
    ],
  },
  'physics:电路、电流与电阻': {
    contentStatus: 'reviewed',
    prerequisite: '理解电势差和电荷，能使用低压电源、表计和模拟电路。',
    plainLanguageGoal:
      '学完后，你能区分电流、电压和电阻，使用欧姆定律与功率公式，分析低压串并联电路。',
    guidedPractice:
      '分析 8 个低压电路，画电流路径、标电压、算等效电阻、功率和安全风险。',
    independentPractice:
      '用低压电池、电阻或 PhET 电路模拟测量 V-I，比较欧姆与非欧姆元件。',
    commonErrors: [
      '认为电流在电阻后被“用完”，不知道串联电流连续。',
      '把额定电压、实际电压和电动势混为一谈。',
      '并联电路按串联加电阻，忽略电压相同和电流分流。',
    ],
    sourceRefs: CIRCUIT_SOURCES,
    studyPoints: [
      point('必背', 'I=ΔQ/Δt，电压是单位电荷能量差，欧姆元件满足 V=IR；功率 P=IV。', 1),
      point('重点', '串联电流相同、并联电压相同；等效电阻和功率要按连接方式计算。', 2),
      point('易错', '非欧姆或温度变化时 V=IR 不能无条件使用，内阻也需计入电源。', 4),
    ],
    eventDetails: [CIRCUIT_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜电流会被电阻用掉吗',
        body:
          '先做前测：一个电池串联两个小灯泡，电流是否在第一个灯泡后变小？要求画闭合回路、电流方向和电压分配。记录是否把电流与能量混同、是否忽略内阻、是否将并联电阻直接相加。变式短路一个灯泡，观察亮度与电流。反例是电流在串联元件间“用完”后下一元件无电流，违反电荷连续性。后测还要说明哪一元件把电能转为热和光。',
        note: '电流连续，能量转化。',
        objective: '能用闭合回路、电流方向与能量转化诊断串并联前测。',
        practice: '完成两灯泡前测，画电流、标电压、判断亮度和一个短路反例。',
        checkpoint: '检查闭合路径、串联电流、电压分配、功率、内阻和低压安全边界。',
      },
      {
        title: '材料与概念｜电流、电压、电阻与功率',
        body:
          '电流是电荷通过率 I=ΔQ/Δt，方向按正电荷约定。电势差是单位电荷能量差，电源电动势提供能量但需考虑内阻。电阻 R=ρL/A 依赖材料、长度、面积和温度。欧姆定律对欧姆元件写成 V=IR；非欧姆元件关系可非线性。功率 P=IV=I²R=V²/R，表示能量转化率。串并联规则中，串联电流相同、电压相加；并联电压相同、电流分流。',
        note: '每个公式都有适用条件。',
        objective: '能解释电流、电压、电阻、电动势、功率、内阻和串并联。',
        practice: '为两类电路写电流、电压、等效电阻和功率关系，并标出欧姆条件。',
        checkpoint: '检查单位 A/V/Ω/W，串联/并联规则，内阻和非欧姆边界，电流方向。',
      },
      {
        title: '示范与推导｜串联与并联的等效电阻',
        body:
          '两个 6 Ω 电阻串联为 12 Ω，同一电流通过两电阻，电压各按 IR 分配；并联等效为 3 Ω，两端电压相同，电流分别 1/6 A 和 1/6 A（若总电压 1 V）。示范用 P=V²/R 比较功率，并解释并联总电阻更小。反例是把并联 6 Ω 相加成 12 Ω，会导致电流低估。',
        note: '连接方式决定公式。',
        objective: '能计算串并联等效电阻、电流、电压和功率。',
        practice: '完成一组串联和并联计算，写电流路径、电压、功率和错误反例。',
        checkpoint: '检查等效电阻、电流分流、电压分配、功率单位、内阻和短路风险。',
      },
      {
        title: '引导练习｜八个低压电路',
        body:
          '准备八电路，覆盖串联、并联、混合、内阻、短路、非欧姆元件和安全开关。每题先做前测画回路，再求等效电阻、电流、电压、功率，后测用测量或模拟验证。变式改变一个电阻或电压，比较功率和安全性。记录电流用完、并联合成串联、忽略内阻和功率公式四类错误，并为每题标出量程、接触电阻、短路风险与保护措施。',
        note: '先画回路，再代数。',
        objective: '能对八类低压电路完成等效、电流、电压、功率与安全分析。',
        practice: '提交八张电路图、计算、功率、两个变式、模拟/测量和安全风险。',
        checkpoint: '检查回路、串并联、单位、内阻、非欧姆条件和功率，短路必须标出。',
      },
      {
        title: '独立迁移与评价｜测量 V-I 与能量',
        body:
          '用低压电池、电阻或 PhET 电路模拟，先做前测设计接线，再测多组 V-I，画图并判断是否近似欧姆。24 小时后改变电阻或温度条件做变式。评价四项：回路正确、单位一致、功率有解释、安全范围。最后写一个非欧姆元件使 V/I 不恒定的反例，并说明如何从曲线判断线性区间与量程，以及如何记录接线和量程误差。',
        note: '实验必须低压且有保护。',
        objective: '能把电路模型迁移到低压实验，并用 V-I 图、功率和条件评价。',
        practice: '提交接线图、数据表、V-I 图、24 小时变式、功率和安全反例。',
        checkpoint: '四项自评：接线正确、量程安全、单位完整、结论有界；短路与过热必须避免。',
      },
    ],
    quiz: [
      question(
        '串联电路中电流和电压怎样分配？',
        '各元件电流相同，电压按电阻分配并相加',
        ['电流按电阻分配，电压相同', '两者都相同', '电流被电阻用完'],
        0,
        '串联只有一条路径，电荷连续所以电流相同；电势差沿各元件累加，功率按元件计算，能量在元件中转化而非电流消失。电压分配与电阻比例有关。',
        '事实与定义',
      ),
      question(
        '两个 6 Ω 电阻并联的等效电阻是多少？',
        '3 Ω',
        ['12 Ω', '6 Ω', '0 Ω'],
        1,
        '并联电阻满足 1/R=1/6+1/6=1/3，所以 R=3 Ω。并联总电阻通常小于任一分支，总电流等于各支路之和，各分支电压相同。',
        '材料与推导',
      ),
      question(
        '哪种说法最不准确？',
        '任何元件任何温度下都严格满足 V=IR',
        ['欧姆元件在合适条件下满足 V=IR', '电阻随材料几何变化', '功率可转为热'],
        2,
        '欧姆定律适用于满足线性关系的元件和条件。温度、非线性材料会改变这一点，内阻和接触电阻也要考虑，不能把公式当所有元件的定义。',
        '常见误区',
      ),
      question(
        '把电路模型迁移到家庭安全时，哪种分析最完整？',
        '区分火线零线、负载功率、过流保护和接地泄漏路径',
        ['只看电压数字', '忽略电流路径', '认为绝缘永久有效'],
        0,
        '家庭用电风险来自电压差、电流路径、过流和绝缘状态。任何实际操作需合格电工和法规，课程只做模型与低压模拟，不进行市电接线。',
        '迁移应用',
      ),
    ],
  },
  'physics:磁场与电磁感应': {
    contentStatus: 'reviewed',
    prerequisite: '掌握电荷、电路和矢量叉积基本方向规则。',
    plainLanguageGoal:
      '学完后，你能计算磁通量与磁通量变化率，用法拉第定律求电动势，并用楞次定律与能量守恒判断方向。',
    guidedPractice:
      '分析 8 个线圈、磁体和运动导体场景，计算磁通量、电动势、方向和能量来源。',
    independentPractice:
      '用线圈、低磁体或 PhET 电磁实验记录插入、静止、速度和方向变化，解释电流计读数。',
    commonErrors: [
      '认为有磁场就有感应电动势，忘记磁通量必须变化。',
      '把楞次定律理解成感应磁场总和原磁场反向，忽略磁通增加或减少。',
      '只算电动势大小，不检查回路方向、匝数和能量来源。',
    ],
    sourceRefs: INDUCTION_SOURCES,
    studyPoints: [
      point('必背', 'ε=−N ΔΦ/Δt，Φ=B·A；磁通量变化产生感应电动势，楞次定律给阻碍方向。', 1),
      point('重点', '变化可来自 B、面积或夹角；多匝线圈电动势与 N 成正比。', 2),
      point('易错', '静磁场不变化不产生持续感应电动势；能量来自机械功等外部输入。', 4),
    ],
    eventDetails: [INDUCTION_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜磁铁静止在线圈里为什么没有电流',
        body:
          '先做前测：磁体静止在线圈中、快速插入和缓慢离开，哪时有电流？要求判断磁通量变化而不是磁场是否存在。记录是否把“磁感线穿过”当恒定电动势、是否忽略运动方向。变式把线圈翻转让法线反向。反例是把静止磁体周围有磁场误写成持续发电。后测要求用法拉第和楞次两步回答大小、方向与能量来源，并写清变化项。',
        note: '变化才有感应电动势。',
        objective: '能用磁通量是否变化诊断静磁场与运动磁体差异。',
        practice: '完成三场景前测，写磁通量变化、电动势大小趋势、电流方向和一个反例。',
        checkpoint: '检查是否区分 B 存在与 Φ 变化，是否正确取面积法线，是否检能量来源。',
      },
      {
        title: '材料与概念｜磁通量、法拉第定律与楞次定律',
        body:
          '磁通量 Φ=B·A=BA cosθ，变化可来自磁感应强度、回路面积或夹角。法拉第定律给感应电动势大小 ε=−NΔΦ/Δt，负号与方向约定有关。楞次定律说明感应电流产生的磁通量阻碍原变化：增加时反向抵消，减少时同向补足。多匝线圈按 N 累加。感应电流的能量来自机械运动或其他外部源，不能凭空产生。计算时要保留韦伯、伏特等单位。',
        note: '大小看法拉第，方向看楞次。',
        objective: '能解释磁通量、感应电动势、匝数、楞次方向和能量来源。',
        practice: '为四个磁通变化场景写 Φ 变化、ε 趋势、感应磁场方向和能量来源。',
        checkpoint: '检查面积法线、变化率、匝数、方向规则和能量守恒，不把静磁场当电源。',
      },
      {
        title: '示范与推导｜磁体插入线圈的方向判断',
        body:
          '磁体 N 极快速插入线圈，线圈处向下的磁通量增加。感应电流要产生向上的磁通量阻碍增加，因此由右手定则确定电流方向。电动势大小随插入速度增加。拔出时磁通量减少，感应磁场方向反转以补足。示范把“变化方向—阻碍—电流方向—电流计偏转”写成四步，并注明慢速时读数小、静止时为零，法线翻转时方向改变。',
        note: '先判断变化，再谈阻碍。',
        objective: '能从磁通量变化方向推出感应磁场与电流方向。',
        practice: '完成插入、拔出、翻转三种情况的方向表、两个速度变式和能量来源说明。',
        checkpoint: '检查磁通量增减、阻碍方向、右手定则、速度与电动势和能量来源。',
      },
      {
        title: '引导练习｜八组感应场景',
        body:
          '准备八场景，覆盖磁体插入拔出、面积变化、线圈旋转、运动导体、静止磁场和匝数变化。每题先做前测算 ΔΦ/Δt，再用法拉第求大小趋势，用楞次求方向，后测画出感应电流、能量输入与电流计偏转。变式改变速度、匝数或法线，比较电动势和方向。记录静磁场误判、方向全反、速度遗漏和 ± 号四类错误。',
        note: '负号是方向约定，不是自动答案。',
        objective: '能对八组场景完成磁通量、电动势大小、方向和能量分析。',
        practice: '提交八张磁通量表、电动势趋势、方向图、三个变式和错误分类。',
        checkpoint: '检查面积法线、变化率、匝数、右手方向、能量和单位 V/Wb。',
      },
      {
        title: '独立迁移与评价｜用线圈实验检验感应',
        body:
          '用低磁体、线圈和模拟，先做前测设计插入速度、方向和匝数，再记录电流计偏转与静止对照。24 小时后改变速度做变式。评价四项：模型条件、数据趋势、方向解释、能量来源。最后写一个“磁通量不变但有电流”或“无能量输入却持续输出”的反例，并说明如何用静止对照验证、翻转方向和改变速度排除仪器零漂。',
        note: '安全材料和可重复优先。',
        objective: '能把电磁感应迁移到线圈实验，并用趋势、方向和能量守恒评价。',
        practice: '提交实验记录、Φ/ε 分析、24 小时速度变式、方向图和反例。',
        checkpoint: '四项自评：变化明确、方向正确、数据支持、能量闭合；静止对照不可省略。',
      },
    ],
    quiz: [
      question(
        '电磁感应最直接需要什么？',
        '穿过回路的磁通量发生变化',
        ['空间中存在恒定磁场', '线圈没有任何面积', '导线必须断开'],
        0,
        '仅有磁场不够，必须出现磁通量变化，如磁体运动、面积变化或线圈转动。磁场强度、面积和夹角都能改变磁通量，静止磁体不会持续发电。',
        '事实与定义',
      ),
      question(
        '磁体插入线圈速度加倍，感应电动势大小大致怎样变化？',
        '在其他条件近似不变时约加倍，因为磁通量变化率加倍',
        ['自动变为四倍且不受匝数影响', '变为零', '与速度无关'],
        1,
        '法拉第定律依赖 ΔΦ/Δt，速度改变变化率。匝数、磁场强度和角度也仍影响结果，方向还需楞次定律判断，平均与瞬时电动势要区分。',
        '材料与推导',
      ),
      question(
        '楞次定律最准确的说法是什么？',
        '感应电流产生的磁通量阻碍原磁通量的变化',
        ['总是使感应磁场与原磁场同向', '总是使感应磁场与原磁场反向', '只决定电动势大小'],
        2,
        '阻碍的是变化而非原磁场本身：增加时反向抵消，减少时同向补足。方向要结合变化判断，不能只记“反向”，也不能把负号直接当空间方向。',
        '常见误区',
      ),
      question(
        '把感应模型迁移到发电机时，哪种解释最完整？',
        '机械输入改变磁通量，电动势与转速、匝数和磁场相关，能量来自机械功',
        ['静磁场自动提供无限能量', '线圈越大一定功率越高', '感应电流不产生阻力'],
        0,
        '发电机把机械能转为电能。变化的磁通量、线圈参数和能量守恒共同约束输出，静磁场不能自动提供能量，转速与负载也会影响结果。',
        '迁移应用',
      ),
    ],
  },
  'physics:机械波与声波': {
    contentStatus: 'reviewed',
    prerequisite: '会读函数图像，理解周期、频率和速度。',
    plainLanguageGoal:
      '学完后，你能区分波传播与介质振动，使用 v=fλ，解释声压、介质、边界和共振。',
    guidedPractice:
      '分析 8 组弦波或声波数据，计算频率、波长、波速并说明介质与边界。',
    independentPractice:
      '用绳、弹簧或声频模拟记录周期和波长，比较不同介质条件下的波速。',
    commonErrors: [
      '认为介质质点随波整体向前移动。',
      '把音高与响度、频率与振幅混为一谈。',
      '改变频率后仍认为波长不变，或忽略介质改变波速。',
    ],
    sourceRefs: WAVE_SOURCES,
    studyPoints: [
      point('必背', '机械波传递振动与能量，介质质点不随波整体迁移；v=fλ。', 1),
      point('重点', '频率通常由波源决定，波速由介质条件决定，波长随两者调整。', 2),
      point('易错', '声音是纵波压强扰动，不是空气分子整体跑到耳朵；响度不等于频率。', 4),
    ],
    eventDetails: [WAVE_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜声音是从声源跑到耳朵吗',
        body:
          '先做前测：拨动琴弦，弦、空气和耳朵各发生什么？要求区分振动传播、介质运动和能量传递。记录是否认为空气分子整体从琴弦飞到耳朵、是否把高音等同大声。变式把空气换成水，观察声速和频率条件。反例是波峰向前移动就认为每个质点也一直向前。后测要求画横波与纵波质点方向，并标出频率、波长和振幅。',
        note: '波传能量，质点在平衡附近振动。',
        objective: '能区分波传播、介质运动、频率和振幅前测。',
        practice: '完成琴弦与空气前测，画横波/纵波质点方向、频率与振幅差异和一个反例。',
        checkpoint: '检查质点不整体迁移，波速介质依赖，频率由源决定，声压与响度区别。',
      },
      {
        title: '材料与概念｜波速、频率与波长',
        body:
          '机械波需要介质，横波与纵波按振动方向区分。频率 f 是单位时间周期数，由波源和边界条件决定；波长 λ 是空间一个周期的长度；速度 v=fλ，单位 m/s。波进入不同介质时频率通常保持不变，速度改变导致波长改变。声波是压强与密度扰动，响度与声压幅度相关但还受频率和听觉影响，声压不是质点位移。边界与驱动频率接近时还会出现共振。',
        note: '频率和波速不是同一个量。',
        objective: '能解释波速、频率、波长、介质、声压和共振。',
        practice: '为一个弦波和一个声波写周期、频率、波长、波速和介质条件。',
        checkpoint: '检查单位，v=fλ，频率源决定，声压与响度区分，边界条件说明。',
      },
      {
        title: '示范与推导｜由图像求波速',
        body:
          '一段波形两个相邻波峰相距 0.5 m，即 λ=0.5 m；某点每 0.25 s 完成一次振动，f=4 Hz，则 v=fλ=2 m/s。若波进入介质速度变为 3 m/s 且频率仍 4 Hz，波长变为 0.75 m。反例是把波峰移动速度与质点振动速度混同。再用驻波边界检查可允许频率。',
        note: '先分别求 f 和 λ。',
        objective: '能由周期和空间波形求频率、波长和波速，并处理介质变式。',
        practice: '完成一组 v=fλ 推导、介质变式、单位检查和质点速度反例。',
        checkpoint: '检查周期倒数、空间周期、介质声速、频率不变条件、单位与波峰质点区别。',
      },
      {
        title: '引导练习｜八组波与声数据',
        body:
          '准备八组数据，覆盖不同频率、波长、介质、振幅、驻波和声压。每题先做前测列已知量，再算 v、f 或 λ，后测画波形、标单位并解释听感或边界。变式改变介质、边界长度或振幅，观察波速、波长和响度怎样变化。记录频率振幅混淆、波速频率混淆、单位缺失和质点运动误解四类错误，并写一个介质变式反例。',
        note: '先画波形，再做代数。',
        objective: '能对八类波/声数据完成频率、波长、波速、介质和驻波分析。',
        practice: '提交八张波表、波形图、三个介质/边界变式、单位检查和错误统计。',
        checkpoint: '检查 v=fλ、介质条件、边界共振、声压/响度区别和质点方向。',
      },
      {
        title: '独立迁移与评价｜测量一次波的传播',
        body:
          '用绳、弹簧或安全声频模拟，先做前测测多个周期时间和空间波长，再计算波速。24 小时后改变张力、介质或边界做变式。评价四项：测量方法、单位、波速解释、边界说明。最后写一个“频率增加所以波速同比增加”的反例，并说明频率由波源决定、介质与边界如何改变波速和波长，以及为什么质点不随波迁移。每次测量都用另一段波形复核验证。',
        note: '控制介质和边界。',
        objective: '能把波模型迁移到实验，并用周期、波长、介质和边界评价结果。',
        practice: '提交原始周期/长度、波速计算、24 小时变式、边界图和反例。',
        checkpoint: '四项自评：测量可重复、单位正确、波速合理、边界明确；高音量需控制时长。',
      },
    ],
    quiz: [
      question(
        '机械波传播时，介质质点怎样运动？',
        '围绕平衡位置振动，不随波整体向前迁移',
        ['一直跟着波峰前进', '完全静止', '全部向声源移动'],
        0,
        '波传播振动状态和能量，质点只在局部位移。波峰位置移动不等于每个质点整体迁移，介质整体不随波前进，质点速度也不等于波速。',
        '事实与定义',
      ),
      question(
        '波长 0.5 m、频率 4 Hz 的波速是多少？',
        '2 m/s',
        ['0.125 m/s', '4.5 m/s', '8 m/s'],
        1,
        'v=fλ=4×0.5=2 m/s。频率与波长的单位相乘给 m/s，频率改变或介质改变时还要看哪个量保持不变，不能默认三者同比变化。',
        '材料与推导',
      ),
      question(
        '哪种说法最错误？',
        '声音越大就表示频率越高',
        ['声波是压强扰动', '频率通常由波源决定', '介质可改变声速'],
        2,
        '响度与声压幅度相关，音高与频率相关，两者不是同一属性。听感还受频率、持续时间、距离和听觉系统影响，声压级也不是线性幅度。',
        '常见误区',
      ),
      question(
        '把波模型迁移到乐器调音时，哪种解释最完整？',
        '弦长、张力和线密度改变边界与波速，从而改变共振频率',
        ['只看演奏者音量', '改变频率但不影响波长', '认为空气分子整体移动'],
        0,
        '调音涉及介质参数和边界条件。频率、波长和波速由系统共同约束，不能只看响度或只改一个量，弦的张力与长度也会共同决定共振。',
        '迁移应用',
      ),
    ],
  },
  'physics:光的反射、折射与成像': {
    contentStatus: 'reviewed',
    prerequisite: '会使用三角函数和相似三角形，能画几何光线图。',
    plainLanguageGoal:
      '学完后，你能应用反射和折射定律，判断全反射，使用薄透镜方程并区实像与虚像。',
    guidedPractice:
      '完成 8 个镜面、界面和透镜任务，画法线、光线、像位置和符号表。',
    independentPractice:
      '用低功率光源、镜面、水槽或 PhET 光学实验测量角度与像距，并与斯涅尔和透镜方程比较。',
    commonErrors: [
      '角度相对界面而非法线测量。',
      '把折射率大于 1 当成光速变大，或混用入射与折射介质。',
      '透镜方程中符号约定不统一，把虚像当实际光会聚位置。',
    ],
    sourceRefs: OPTICS_SOURCES,
    studyPoints: [
      point('必背', '反射角等于入射角；n₁ sinθ₁=n₂ sinθ₂；薄透镜满足 1/f=1/d_o+1/d_i。', 1),
      point('重点', '角度都相对法线，折射率 n=c/v，光从光密到光疏可能全反射。', 2),
      point('易错', '实像由实际光线会聚，虚像由反向延长线形成；符号约定必须全题统一。', 4),
    ],
    eventDetails: [OPTICS_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜为什么水中的筷子看起来折了',
        body:
          '先做前测：光从空气进入水，速度和方向怎样变化？为什么池底看起来比实际浅？要求画法线、入射角和折射角。记录是否相对水面测角、是否认为光速变大、是否把视位置当实际位置。变式改变入射角观察折射趋势。反例是垂直入射时仍偏折，实际方向不变但速度改变。后测要区分实际光路与眼睛反向延长线形成的视位置。',
        note: '角度从法线量起。',
        objective: '能用介质、法线、速度和视位置诊断折射前测。',
        practice: '完成空气-水界面光路、速度比较、视深解释和一个垂直入射反例。',
        checkpoint: '检查法线角度、n=c/v、入射折射介质方向、视位置和实际位置差异。',
      },
      {
        title: '材料与概念｜反射、折射率与成像符号',
        body:
          '反射定律 θ_i=θ_r，角度相对法线。折射率 n=c/v，通常 n>1，进入光密介质光速变小。斯涅尔定律 n₁sinθ₁=n₂sinθ₂，频率不变、速度与波长改变。从光密到光疏且超过临界角发生全反射。薄透镜方程 1/f=1/d_o+1/d_i，放大率 m=−d_i/d_o。实像由实际光线会聚，虚像由延长线形成，符号需统一。',
        note: '先画光线，再代符号。',
        objective: '能解释反射、折射、折射率、全反射、实像、虚像和焦距。',
        practice: '为三种介质界面和一组透镜成像写光线图、公式、符号与像类型。',
        checkpoint: '检查法线角、斯涅尔方向、全反射条件、透镜符号和焦点单位。',
      },
      {
        title: '示范与推导｜空气到玻璃的折射',
        body:
          'n₁=1、n₂=1.5、θ₁=30°，则 sinθ₂=sin30°/1.5≈0.333，θ₂≈19.5°，光线向法线偏折。演示先画法线再测角，若相对界面测 60°和 70.5°，必须换算。反例是把 n₂ 放错边导致折射角变大。再用 n>1 说明光速变小而频率不变，求出介质中波长并检查数量级。',
        note: '介质方向决定正弦比。',
        objective: '能正确应用斯涅尔定律并解释光速、波长与方向变化。',
        practice: '完成空气-玻璃计算、法线角标注、n 位置反例和波长变化说明。',
        checkpoint: '检查 n 编号、角度、正弦值、全反射边界和单位，不用界面角代替法线角。',
      },
      {
        title: '引导练习｜八组光学界面和透镜',
        body:
          '准备八题，覆盖反射、空气到水、水到空气、全反射、凸透镜实像虚像和凹透镜。每题先做前测画法线和主光线，再计算角度或像距，后测标像类型、放大率和单位。变式改变入射角、焦距或物距，比较像的位置与方向。记录角度基准、n 比值、符号和虚像四类错误。低功率光源避免直视，光路图与公式必须互相对应。',
        note: '先画图，后代公式。',
        objective: '能对八类光学任务完成光路、角度、成像和符号分析。',
        practice: '提交八张光路图、斯涅尔/透镜计算、三个变式、像类型与错误分类。',
        checkpoint: '检查法线、n 方向、全反射、透镜符号、实虚像、放大率和单位。',
      },
      {
        title: '独立迁移与评价｜测量折射角或像距',
        body:
          '用低功率光源、镜面、水槽或 PhET 光学实验，先做前测记录入射角、折射角或物距像距，再与模型比较验证。24 小时后改变一个条件做变式。评价四项：光路准确、单位、模型条件、误差解释。最后写一个符号错乱导致虚像误判的反例。所有强光操作必须避免直视，并比较实际光路与观察方向、记录环境光。',
        note: '强光安全边界不可省略。',
        objective: '能把反射折射与成像迁移到安全实验，并用几何、公式和误差评价。',
        practice: '提交实验或模拟数据、光路图、模型计算、24 小时变式和反例。',
        checkpoint: '四项自评：角度正确、符号统一、数据可追、安全合规；不能直视激光。',
      },
    ],
    quiz: [
      question(
        '反射角和折射角应相对哪条线测量？',
        '法线',
        ['界面本身', '镜面边缘', '水平地面'],
        0,
        '光学角度约定相对法线。相对界面测量会把余角当入射角，代入斯涅尔定律会出错，图中必须先画法线和标明两侧介质。',
        '事实与定义',
      ),
      question(
        '光从空气进入 n=1.5 的玻璃，通常怎样变化？',
        '光速变小，频率不变，波长变短，光线向法线偏折',
        ['光速变大且远离法线', '频率升高', '速度和波长都不变'],
        1,
        'n=c/v>1 表示介质中光速更小。频率由光源保持不变，v=fλ使波长变短，方向由两侧折射率共同决定，入射与折射介质不能颠倒。',
        '材料与推导',
      ),
      question(
        '哪种成像判断最可能出错？',
        '把虚像的反向延长线交点当成实际光线会聚点',
        ['实像由实际光线会聚', '先画主光线再算公式', '统一符号约定'],
        2,
        '虚像没有实际光线在该位置会聚，只是观察方向延长。混淆会导致屏幕位置、像距和正倒立判断错误，符号约定必须始终一致。',
        '常见误区',
      ),
      question(
        '把光学模型迁移到摄像镜头设计时，哪种分析最完整？',
        '用焦距、物距、像距、符号和实际光路判断成像，再考虑像差',
        ['只看镜片直径', '忽略物体距离', '把虚像放在屏幕上接收'],
        0,
        '镜头设计需先用薄透镜模型定位像，再考虑实际镜片厚度、像差和传感器位置，符号约定也必须保持一致，不能把虚像放在屏幕上接收。',
        '迁移应用',
      ),
    ],
  },
};
