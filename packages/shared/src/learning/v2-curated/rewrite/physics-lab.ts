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

const UNCERTAINTY_ARCHIVE = {
  id: 'experimental-data-error-uncertainty',
  kind: 'experiment',
  title: '测量误差与不确定度：读数怎样变成可信结论',
  period: '学习阶段 01—06',
  summary:
    '实验记录必须同时保留读数、单位、仪器分辨率和条件。重复测量可估计随机波动，校准可暴露系统偏差，有效数字和不确定度共同说明结果精度。',
  background:
    '实验数字不是随意截取的符号。仪器零点、读数方式、环境变化和模型近似都可能让测值偏离真值，因此需要把原始数据、修正、统计和不确定度报告连成证据链。',
  timeline: [
    {
      date: '阶段 01',
      title: '先记录原始读数与条件',
      body: '记录仪器量程、分辨率、零点、单位和环境条件，保留未取整的原始读数。后续任何计算都应能回到测量记录，不能只留下一个看似精确的平均值。',
      sourceIds: ['nist-tn-1297', 'bipm-si'],
    },
    {
      date: '阶段 02',
      title: '校准寻找系统偏差',
      body: '用已知参考标准或零点检查仪器。若每个读数都偏向同一方向，重复测量只能减小随机波动，不能自动消除零点或刻度系统误差。',
      sourceIds: ['nist-tn-1297', 'nist-calibration'],
    },
    {
      date: '阶段 03',
      title: '重复测量观察随机分散',
      body: '在条件不变时多次读数，可观察随机误差造成的分散。样本数量和读数独立性必须说明，重复同一次被污染的记录并不能制造独立证据。',
      sourceIds: ['nist-tn-1297', 'openstax-dimensions'],
    },
    {
      date: '阶段 04',
      title: '由数据估计不确定度',
      body: '平均值降低部分随机波动，但标准不确定度还要考虑重复性与已知修正。报告常写成测得值加减扩展不确定度，并说明覆盖因子或置信约定。',
      sourceIds: ['nist-tn-1297'],
    },
    {
      date: '阶段 05',
      title: '有效数字表达信息量',
      body: '结果位数应与不确定度或仪器分辨率相称。中间计算保留额外位，最终取舍；把 2.35 cm 写成 2.351 428 cm 会制造测量并未提供的精度。',
      sourceIds: ['nist-tn-1297', 'bipm-si'],
    },
    {
      date: '阶段 06',
      title: '模型与单位复核结论',
      body: '把不确定度传播到计算结果，并做量纲与数量级检查。若模型忽略空气阻力或仪器响应时间，即使算术正确，结论也只在模型边界内成立。',
      sourceIds: ['openstax-dimensions', 'nist-tn-1297'],
    },
  ],
  outcome:
    '可观察结果是能保存原始数据，区分误差来源，完成重复与校准记录，并用不确定度、有效数字和单位报告结果。',
  significance:
    '透明的数据链让实验结果可复现、可质疑，也避免把计算精度误当测量精度。',
  sourceCards: [
    source(
      'nist-tn-1297',
      'NIST Technical Note 1297: Guidelines for Evaluating and Expressing the Uncertainty of NIST Measurement Results',
      'National Institute of Standards and Technology',
      '1994',
      'https://www.nist.gov/pml/nist-technical-note-1297',
      '核对测量模型、不确定度评定与结果报告。',
    ),
    source(
      'nist-calibration',
      'Calibration and Measurement Fundamentals',
      'NIST Physical Measurement Laboratory',
      '2025 年访问版',
      'https://www.nist.gov/pml/nist-tn-1297-appendix-d',
      '核对校准、修正和不确定度来源。',
    ),
    source(
      'openstax-dimensions',
      '1.4 Dimensional Analysis',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/1-4-dimensional-analysis',
      '核对单位一致性与量纲检查。',
    ),
    source(
      'bipm-si',
      'The International System of Units',
      'BIPM',
      '2019',
      'https://www.bipm.org/en/publications/si-brochure',
      '核对测量单位、符号和有效数字书写。',
    ),
  ],
} satisfies LearningV2EventDetail;

const MOTION_LAB_ARCHIVE = {
  id: 'force-motion-controlled-experiment',
  kind: 'experiment',
  title: '力与运动实验：把一个猜想变成可检验关系',
  period: '学习阶段 01—06',
  summary:
    '动力学实验先定义自变量、因变量和控制变量，再用传感器记录力与加速度。图像拟合给参数估计，残差检查系统偏差，重复和换条件检验关系是否稳定。',
  background:
    '小车实验看似只需“加力测加速度”，实际要处理摩擦、滑轮质量、传感器零点、采样时间和质量变化。控制变量不是口号，而是让竞争解释可以被排除。',
  timeline: [
    {
      date: '阶段 01',
      title: '提出可反驳的关系',
      body: '先写清猜想：质量近似不变时，合力与加速度可能成正比。自变量、因变量和应控制的变量必须提前定义，不能看完数据再挑选关系。',
      sourceIds: ['phet-forces-motion', 'openstax-newton-second'],
    },
    {
      date: '阶段 02',
      title: '校准力与运动测量',
      body: '调平轨道、清零传感器并检查采样率。测力计与加速度计若有固定偏移，会同时影响斜率和截距，重复读数不能替代校准。',
      sourceIds: ['openstax-newton-second', 'nist-tn-1297'],
    },
    {
      date: '阶段 03',
      title: '控制质量与摩擦条件',
      body: '保持小车质量、轨道倾角和接触面条件近似一致，逐次改变拉力。若总质量随配重改变，施加力与加速度的关系会被另一个变量混入。',
      sourceIds: ['phet-forces-motion', 'openstax-newton-second'],
    },
    {
      date: '阶段 04',
      title: '用净力而非名义拉力',
      body: '真实加速度响应的是合力。摩擦、滑轮张力和传感器零点都可能让名义拉力偏离净力，因此图示和结论必须明确力的对象与来源。',
      sourceIds: ['openstax-newton-second', 'openstax-force'],
    },
    {
      date: '阶段 05',
      title: '拟合直线并查看残差',
      body: '作加速度对净力的图，拟合斜率并对照 1/m。残差若呈弯曲或单侧排列，提示摩擦、零点或模型范围问题，不能只报告相关系数。',
      sourceIds: ['phet-forces-motion', 'scipy-curve-fit'],
    },
    {
      date: '阶段 06',
      title: '换质量与方向做验证',
      body: '改变小车质量或运动方向，检查参数是否按牛顿第二定律变化。若只在原条件成立，应缩小结论范围并记录边界，而不是外推到所有运动。',
      sourceIds: ['openstax-newton-second', 'phet-forces-motion'],
    },
  ],
  outcome:
    '可观察结果是能设计受控实验，绘制净力与加速度关系，解释拟合参数和残差，并说明实验边界。',
  significance:
    '这一流程把牛顿第二定律与真实测量连接起来，训练用竞争解释和残差结构检验模型。',
  sourceCards: [
    source(
      'phet-forces-motion',
      'Forces and Motion: Basics',
      'PhET Interactive Simulations, University of Colorado Boulder',
      '2025 年访问版',
      'https://phet.colorado.edu/en/simulations/forces-and-motion-basics',
      '核对合力、质量、加速度与摩擦的可视化实验。',
    ),
    source(
      'openstax-newton-second',
      "5.3 Newton's Second Law",
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/5-3-newtons-second-law',
      '核对合力、质量、加速度及单位。',
    ),
    source(
      'openstax-force',
      '5.1 Forces',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/5-1-forces',
      '核对受力对象、合力与常见力的模型。',
    ),
    source(
      'scipy-curve-fit',
      'curve_fit',
      'SciPy Documentation',
      '2025 年访问版',
      'https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.curve_fit.html',
      '核对参数拟合、不确定度与数据输入要求。',
    ),
    source(
      'nist-tn-1297',
      'NIST Technical Note 1297',
      'National Institute of Standards and Technology',
      '1994',
      'https://www.nist.gov/pml/nist-technical-note-1297',
      '核对校准、测量不确定度与数据报告。',
    ),
  ],
} satisfies LearningV2EventDetail;

const ELECTROMAGNETISM_LAB_ARCHIVE = {
  id: 'electrical-magnetic-lab-evidence',
  kind: 'experiment',
  title: '电路与磁学实验：让电压、电流和磁场互相校验',
  period: '学习阶段 01—06',
  summary:
    '电学实验必须以闭合回路、正确量程和安全连接为前提。电压、电流和电阻数据可检验欧姆关系，磁场实验则用方向、变化和感应结果建立证据。',
  background:
    '电学错误常来自接线、接地和仪表位置，而不是公式。电压表并联、电流表串联，量程和极性必须预先检查；磁学实验还要区分恒定场与变化场。',
  timeline: [
    {
      date: '阶段 01',
      title: '断电检查元件与量程',
      body: '连接前确认电源关闭、导线绝缘、元件额定值和仪表量程。电源短路、过流和错误极性是首要风险，未知参数应从低能量配置开始。',
      sourceIds: ['phet-circuit-dc', 'openstax-current'],
    },
    {
      date: '阶段 02',
      title: '建立回路并确认仪表位置',
      body: '电流表串联测通过支路的电流，电压表并联测两点间电势差。仪表若接入错误位置，既可能改变电路，也可能损坏自身或造成读数误判。',
      sourceIds: ['openstax-current', 'openstax-resistance'],
    },
    {
      date: '阶段 03',
      title: '用多组数据检验电压电流关系',
      body: '在电阻近似恒定的范围内逐级改变电压，记录对应电流并检查单位。若图像明显弯曲，应检查发热、量程和非欧姆元件，不能强行套一条直线。',
      sourceIds: ['phet-circuit-dc', 'openstax-resistance'],
    },
    {
      date: '阶段 04',
      title: '比较串联与并联证据',
      body: '串联支路电流相同、电压分配；并联支路电压相同、电流分流。测量点要画在电路图上，节点和回路方向不能只凭口头描述。',
      sourceIds: ['phet-circuit-dc', 'openstax-resistance'],
    },
    {
      date: '阶段 05',
      title: '用小磁针和感应实验描述磁场',
      body: '小磁针指示局部磁场方向，改变电流方向可观察方向反转。只有磁通量变化时才有感应电动势，静止强磁铁不等于持续发电。',
      sourceIds: ['phet-faraday', 'openstax-faraday'],
    },
    {
      date: '阶段 06',
      title: '把安全与证据写入结论',
      body: '记录接线图、量程、读数、极性和环境条件。证据不足时缩小结论，不以单次闪烁或一次偏转证明全部电磁规律，并保留误差和替代解释。',
      sourceIds: ['openstax-faraday', 'nist-tn-1297', 'phet-circuit-dc'],
    },
  ],
  outcome:
    '可观察结果是能安全搭接简单电路，正确读取电压和电流，比较串并联关系，并用磁场方向与变化证据解释感应。',
  significance:
    '电路与磁学实验训练把不可见场转化为可重复读数，同时把安全边界视为实验设计的一部分。',
  sourceCards: [
    source(
      'phet-circuit-dc',
      'Circuit Construction Kit: DC',
      'PhET Interactive Simulations, University of Colorado Boulder',
      '2025 年访问版',
      'https://phet.colorado.edu/en/simulations/circuit-construction-kit-dc',
      '核对回路、电压、电流、电阻和串并联实验。',
    ),
    source(
      'phet-faraday',
      "Faraday's Electromagnetic Lab",
      'PhET Interactive Simulations, University of Colorado Boulder',
      '2025 年访问版',
      'https://phet.colorado.edu/en/simulations/faradays-electromagnetic-lab',
      '核对磁场方向、磁通变化与感应现象。',
    ),
    source(
      'openstax-current',
      '9.1 Electrical Current',
      'OpenStax University Physics Volume 2',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-2/pages/9-1-electrical-current',
      '核对电流定义、方向、单位与测量。',
    ),
    source(
      'openstax-resistance',
      '9.4 Ohm’s Law',
      'OpenStax University Physics Volume 2',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-2/pages/9-4-ohms-law',
      '核对电压、电流、电阻关系及适用条件。',
    ),
    source(
      'openstax-faraday',
      '13.2 Faraday’s Law',
      'OpenStax University Physics Volume 2',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-2/pages/13-2-faradays-law',
      '核对磁通量变化与感应电动势。',
    ),
    source(
      'nist-tn-1297',
      'NIST Technical Note 1297',
      'National Institute of Standards and Technology',
      '1994',
      'https://www.nist.gov/pml/nist-technical-note-1297',
      '核对读数、校准与不确定度报告。',
    ),
  ],
} satisfies LearningV2EventDetail;

const WAVE_OPTICS_ARCHIVE = {
  id: 'interference-diffraction-measurement',
  kind: 'experiment',
  title: '波动光学实验：从明暗条纹反推波长',
  period: '学习阶段 01—06',
  summary:
    '相干光通过双缝或多缝形成强度分布，条纹位置与波长、缝距和屏距相关。图像测量需要背景扣除、尺度标定、峰位识别和不确定度报告。',
  background:
    '相机看到的亮斑不是无限细的几何线。衍射包络、像素分辨率、曝光和激光稳定性都会影响强度图像，因此峰位与强度要分别检查。',
  timeline: [
    {
      date: '阶段 01',
      title: '建立相干与几何条件',
      body: '双缝实验需要足够相干的光源和稳定光路，屏距、缝距与条纹尺度必须使用统一单位。几何近似失效时，简单小角公式不能直接套用。',
      sourceIds: ['phet-wave-interference', 'openstax-double-slit'],
    },
    {
      date: '阶段 02',
      title: '区分干涉峰与衍射包络',
      body: '多缝干涉给出细密峰，单缝衍射形成较宽包络。两者叠加可造成某些峰缺失或强度变化，不能把包络当背景噪声随意删除。',
      sourceIds: ['openstax-diffraction', 'phet-wave-interference'],
    },
    {
      date: '阶段 03',
      title: '先标定图像尺度',
      body: '用已知尺或模拟刻度把像素换算成毫米，记录屏距和缝距。没有尺度标定的条纹间距只是像素数，不能代入波长公式。',
      sourceIds: ['openstax-double-slit', 'bipm-si'],
    },
    {
      date: '阶段 04',
      title: '测量峰位而不是只凭肉眼',
      body: '沿强度剖面找峰，扣除暗背景并记录曝光。中央峰和旁峰的选择要一致，峰宽与峰间距是不同量，不能把最亮像素当唯一证据。',
      sourceIds: ['phet-wave-interference', 'openstax-intensity'],
    },
    {
      date: '阶段 05',
      title: '由条纹间距计算波长',
      body: '小角近似下相邻亮纹间距约为波长乘屏距再除以缝距。用多组间距求平均并传播尺度误差，检查结果是否落在光源标称波长范围。',
      sourceIds: ['openstax-double-slit', 'openstax-intensity'],
    },
    {
      date: '阶段 06',
      title: '换缝距与屏距验证',
      body: '改变一个几何参数后重新测量，检查条纹间距按预期变化。若图像饱和或光源漂移，即使公式吻合也要把该条件列为限制，不能外推。',
      sourceIds: ['phet-wave-interference', 'bipm-si'],
    },
  ],
  outcome:
    '可观察结果是能标定条纹图像，识别干涉与衍射特征，由峰间距估算波长，并报告强度、误差和模型边界。',
  significance:
    '波动光学实验把相位差转化为可测强度分布，展示图像数据如何服务物理模型。',
  sourceCards: [
    source(
      'phet-wave-interference',
      'Wave Interference',
      'PhET Interactive Simulations, University of Colorado Boulder',
      '2025 年访问版',
      'https://phet.colorado.edu/en/simulations/wave-interference',
      '核对双缝、单缝、波长与强度分布。',
    ),
    source(
      'openstax-double-slit',
      "3.1 Young's Double-Slit Interference",
      'OpenStax University Physics Volume 3',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-3/pages/3-1-youngs-double-slit-interference',
      '核对双缝几何、条纹间距与波长关系。',
    ),
    source(
      'openstax-diffraction',
      '3.4 Diffraction',
      'OpenStax University Physics Volume 3',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-3/pages/3-4-diffraction',
      '核对单缝衍射与强度包络。',
    ),
    source(
      'openstax-intensity',
      '3.3 Multiple-Slit Interference',
      'OpenStax University Physics Volume 3',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-3/pages/3-3-multiple-slit-interference',
      '核对干涉强度、峰位和缝数影响。',
    ),
    source(
      'bipm-si',
      'The International System of Units',
      'BIPM',
      '2019',
      'https://www.bipm.org/en/publications/si-brochure',
      '核对长度与波长单位及换算。',
    ),
  ],
} satisfies LearningV2EventDetail;

const COMPUTATIONAL_MODEL_ARCHIVE = {
  id: 'computational-model-validation',
  kind: 'concept',
  title: '计算模型检验：模拟结果何时能支持物理结论',
  period: '学习阶段 01—06',
  summary:
    '计算模型把假设写成状态、参数和更新规则。仿真必须检查时间步、数值稳定和参数敏感性，并用未参与拟合的数据验证；残差结构和边界决定结论能走多远。',
  background:
    '能画出光滑曲线不代表模型可信。参数拟合可能掩盖错误机制，过小时间步会增加计算量，过大时间步会制造虚假稳定，因此必须把数值误差与物理误差分开。',
  timeline: [
    {
      date: '阶段 01',
      title: '把物理假设写成变量关系',
      body: '先说明状态量、控制方程、可测输出和忽略因素。模型边界要写成可检查条件，例如是否忽略空气阻力、磁场变化或物体形变。',
      sourceIds: ['modsimpy', 'openstax-projectile'],
    },
    {
      date: '阶段 02',
      title: '为参数赋予单位和范围',
      body: '质量、阻力系数、初速度和重力加速度都需单位与合理范围。参数不能只因拟合方便就取任意值，敏感性分析应说明结论依赖哪个参数。',
      sourceIds: ['modsimpy', 'scipy-least-squares'],
    },
    {
      date: '阶段 03',
      title: '选择算法与时间步',
      body: '数值更新把连续方程离散化。时间步缩小后结果应收敛；若轨迹、能量或稳定性随步长剧烈变化，应先做数值检验，而不是解释成新奇物理。',
      sourceIds: ['modsimpy'],
    },
    {
      date: '阶段 04',
      title: '比较数据并计算残差',
      body: '把模拟输出与实验或观测数据对齐单位和时间，计算观测减预测的残差。残差若有曲线趋势，说明模型结构或参数可能错，而不只是随机误差。',
      sourceIds: ['scipy-least-squares', 'nist-tn-1297'],
    },
    {
      date: '阶段 05',
      title: '用独立数据做验证',
      body: '参数在一部分数据上估计，再在未参与拟合的数据上检查预测。只在训练数据上贴合是校准，不是充分验证；验证失败应报告而不是改边界。',
      sourceIds: ['modsimpy', 'scipy-least-squares'],
    },
    {
      date: '阶段 06',
      title: '报告敏感性、误差与边界',
      body: '改变关键参数和时间步，展示结论稳定性。最终报告区分测量误差、数值误差和模型误差，并说明模型只适用于哪些尺度和条件。',
      sourceIds: ['nist-tn-1297', 'modsimpy', 'openstax-projectile'],
    },
  ],
  outcome:
    '可观察结果是能写出模型状态和参数，运行并检查仿真，计算残差，用留出数据验证，并明确数值与物理边界。',
  significance:
    '计算建模把数学、编程与实验连接起来，核心不是生成漂亮曲线，而是让假设可测试、误差可分解。',
  sourceCards: [
    source(
      'modsimpy',
      'Modeling and Simulation in Python',
      'Allen B. Downey',
      '2025 年访问版',
      'https://allendowney.github.io/ModSimPy/',
      '核对状态模型、参数、仿真与验证流程。',
    ),
    source(
      'scipy-least-squares',
      'scipy.optimize.least_squares',
      'SciPy Documentation',
      '2025 年访问版',
      'https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.least_squares.html',
      '核对残差函数、参数拟合与收敛结果。',
    ),
    source(
      'openstax-projectile',
      '4.3 Projectile Motion',
      'OpenStax University Physics Volume 1',
      '2025 年访问版',
      'https://openstax.org/books/university-physics-volume-1/pages/4-3-projectile-motion',
      '核对抛体运动假设、加速度与轨迹边界。',
    ),
    source(
      'nist-tn-1297',
      'NIST Technical Note 1297',
      'National Institute of Standards and Technology',
      '1994',
      'https://www.nist.gov/pml/nist-technical-note-1297',
      '核对测量不确定度与模型误差报告。',
    ),
  ],
} satisfies LearningV2EventDetail;

const DATA_SOURCES = [
  'NIST, Technical Note 1297: Guidelines for Evaluating and Expressing the Uncertainty of NIST Measurement Results。https://www.nist.gov/pml/nist-technical-note-1297',
  'BIPM, The International System of Units。https://www.bipm.org/en/publications/si-brochure',
  'OpenStax University Physics Volume 1, 1.4 Dimensional Analysis。https://openstax.org/books/university-physics-volume-1/pages/1-4-dimensional-analysis',
  'NIST, Technical Note 1297 Appendix D: Calibration。https://www.nist.gov/pml/nist-tn-1297-appendix-d',
];

const MOTION_SOURCES = [
  'PhET Interactive Simulations, Forces and Motion: Basics。https://phet.colorado.edu/en/simulations/forces-and-motion-basics',
  "OpenStax University Physics Volume 1, 5.3 Newton's Second Law。https://openstax.org/books/university-physics-volume-1/pages/5-3-newtons-second-law",
  'OpenStax University Physics Volume 1, 5.1 Forces。https://openstax.org/books/university-physics-volume-1/pages/5-1-forces',
  'SciPy Documentation, curve_fit。https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.curve_fit.html',
];

const ELECTRICITY_SOURCES = [
  'PhET Interactive Simulations, Circuit Construction Kit: DC。https://phet.colorado.edu/en/simulations/circuit-construction-kit-dc',
  'PhET Interactive Simulations, Faraday’s Electromagnetic Lab。https://phet.colorado.edu/en/simulations/faradays-electromagnetic-lab',
  'OpenStax University Physics Volume 2, 9.1 Electrical Current。https://openstax.org/books/university-physics-volume-2/pages/9-1-electrical-current',
  'OpenStax University Physics Volume 2, 9.4 Ohm’s Law。https://openstax.org/books/university-physics-volume-2/pages/9-4-ohms-law',
];

const OPTICS_SOURCES = [
  'PhET Interactive Simulations, Wave Interference。https://phet.colorado.edu/en/simulations/wave-interference',
  "OpenStax University Physics Volume 3, 3.1 Young's Double-Slit Interference。https://openstax.org/books/university-physics-volume-3/pages/3-1-youngs-double-slit-interference",
  'OpenStax University Physics Volume 3, 3.3 Multiple-Slit Interference。https://openstax.org/books/university-physics-volume-3/pages/3-3-multiple-slit-interference',
  'OpenStax University Physics Volume 3, 3.4 Diffraction。https://openstax.org/books/university-physics-volume-3/pages/3-4-diffraction',
];

const MODEL_SOURCES = [
  'Allen B. Downey, Modeling and Simulation in Python。https://allendowney.github.io/ModSimPy/',
  'SciPy Documentation, scipy.optimize.least_squares。https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.least_squares.html',
  'OpenStax University Physics Volume 1, 4.3 Projectile Motion。https://openstax.org/books/university-physics-volume-1/pages/4-3-projectile-motion',
  'NIST, Technical Note 1297。https://www.nist.gov/pml/nist-technical-note-1297',
];

export const PHYSICS_LAB_REWRITE: CuratedCoursePlanPatchMap = {
  'physics:实验数据、误差与有效数字': {
    contentStatus: 'reviewed',
    prerequisite: '会读取刻度、换算常见 SI 单位，并能记录带单位的数据。',
    plainLanguageGoal:
      '学完后，你能区分误差与不确定度，设计重复和校准步骤，并用有效数字报告有依据的实验结果。',
    guidedPractice:
      '分析 8 组长度、时间和质量读数，写出系统/随机来源、重复方案、修正和最终不确定度。',
    independentPractice:
      '用尺、电子秤或温度计完成一组重复测量，对照参考量校准，并写完整数据与误差报告。',
    commonErrors: [
      '认为多测几次就能消除零点偏差或错误校准。',
      '保留超过仪器分辨率和不确定度支持的有效数字。',
      '把误差当“算错了”，或在不说明模型的情况下宣称结果等于真值。',
    ],
    sourceRefs: DATA_SOURCES,
    studyPoints: [
      point('必背', '测量结果应写成“最佳估计值 ± 不确定度（单位）”；重复估计随机分散，校准识别系统偏差，二者不能互相替代。', 1),
      point('重点', '有效数字由测量分辨率和不确定度共同决定，中间计算多留位，最终再取舍。', 2),
      point('易错', '平均只降低部分随机波动；零点、刻度或模型偏差需要校准、对照或修正。', 3),
      point('考点', '根据原始读数判断精度、报告结果，并用量纲检查公式和单位。', 4),
    ],
    eventDetails: [UNCERTAINTY_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜为什么测了十次还是不准',
        body:
          '先做前测：同一把尺的零点偏离 2 mm，连续十次读数都很接近，平均值是否已消除偏差？要求区分重复波动、校准偏差、读数误差与模型近似，并写出原始读数和单位。变式把尺换成未归零电子秤，观察误差方向是否改变。反例是只报平均值、不报条件，直接把 2.351 cm 当成真值。后测用一组重复读数和参考量，形成“误差来源—修正—不确定度—有效数字”的验证链。',
        note: '重复不等于校准。',
        objective: '能用重复差异、参考量偏差和仪器条件诊断实验数据前测。',
        practice: '完成尺与秤两组前测，列出系统/随机来源、校准动作、单位和初步有效数字。',
        checkpoint: '检查误差来源方向、重复独立性、校准证据、不确定度表述和量纲。',
      },
      {
        title: '材料与概念｜误差、不确定度与有效数字',
        body:
          '误差是测得值与参考值的差，不确定度是对结果可信范围的量化。随机误差造成分散，系统误差让读数整体偏移；校准、对照和环境记录用于识别后者。重复测量先算最佳估计和分散，再结合仪器分辨率、修正量和模型限制形成不确定度。有效数字表达信息量而不是装饰，结果末位应与不确定度相称。任何公式都要检查单位与量纲，任何测量模型都要说明忽略了什么。',
        note: '误差有方向，不确定度给范围。',
        objective: '能区分误差、不确定度、随机与系统来源，并定义有效数字和模型边界。',
        practice: '为三条原始读数写平均值、假设、校准检查、不确定度来源和报告单位。',
        checkpoint: '检查平均值含义、系统/随机归类、覆盖范围、有效数字规则和单位一致性。',
      },
      {
        title: '示范与推导｜三组读数怎样写成可信结果',
        body:
          '长度读数 2.34、2.36、2.35 cm 的平均为 2.35 cm。考虑尺的分辨率和重复分散，可暂报 2.35±0.01 cm；若零点偏 0.02 cm，则先修正再报告。示范把重复波动与校准偏移分栏，计算中间量时保留额外位。反例是使用标准差却保留四位小数，或发现单侧偏差仍把它当随机噪声。变式改变分辨率或样本数，检查最终位数和不确定度是否随之调整。',
        note: '先修正，再合成不确定度。',
        objective: '能由原始读数计算最佳估计、修正系统偏差并报告合理有效数字。',
        practice: '完成平均值、样本分散、零点修正、误差来源表和最终结果书写。',
        checkpoint: '检查系统修正顺序、重复统计、分辨率、有效数字和单位量纲。',
      },
      {
        title: '引导练习｜八组测量证据卡',
        body:
          '准备八题，覆盖长度、时间、质量、温度、零点偏差、分辨率不足、异常值和模型近似。每题先做前测标出误差来源，再给重复与校准方案，后测写“测得值 ± 不确定度”及有效数字。变式替换仪器或减少样本，观察结论可信范围。记录“平均即校准”“位数越多越准”“剔除异常不写依据”等错误，并要求保留原始数据、单位、修正记录和验证步骤。',
        note: '每张卡都要能复现。',
        objective: '能对八类测量数据完成来源判断、重复、校准、报告和量纲检查。',
        practice: '提交八张证据卡、三类修正、两个仪器变式、完整单位和错误分类。',
        checkpoint: '检查原始数据、误差方向、独立重复、校准依据、不确定度、有效数字和量纲。',
      },
      {
        title: '独立迁移与评价｜交一份可复现测量报告',
        body:
          '选择安全尺、电子秤或温度计，先做前测预测精度，再对同一参考量重复测量并检查校准。记录环境、仪器分辨率、原始值、修正、平均值和不确定度，并用不同时间或量程做变式。评价四项：过程可复现、误差来源完整、计算与单位正确、结论边界诚实。最后写一个“十次都偏同一方向仍称随机误差”的反例，说明应通过什么对照或标准件检验模型。',
        note: '报告要能让他人重做。',
        objective: '能把测量模型迁移到真实仪器，并用重复、校准、单位和边界评价报告。',
        practice: '提交仪器条件、至少五次原始读数、参考对照、修正、不确定度、变式和反例。',
        checkpoint: '四项自评：记录可追溯、不确定度合理、有效数字相称、模型边界明确；缺证据应重测。',
      },
    ],
    quiz: [
      question(
        '测量结果“12.40±0.03 cm”表达了什么？',
        '最佳估计为 12.40 cm，并与约 0.03 cm 的不确定度相联系',
        ['真值必定等于 12.40 cm', '仪器误差已经等于零', '有效数字可以无限增加'],
        0,
        '加减号给出估计与不确定度范围，不保证真值必然落在某个无限精确点。0.03 说明可信程度和取舍位数，仍要记录来源与单位。',
        '事实与定义',
      ),
      question(
        '连续十次读数都偏向同一方向，最应优先检查什么？',
        '零点、刻度或参考量等系统偏差，并做校准或对照',
        ['把十个数全部删掉', '增加更多有效数字', '只算平均并宣称偏差消失'],
        1,
        '同向偏差不是随机分散的典型表现。重复平均不会自动修正固定偏移，需要检查零点和标准件，记录修正量后再合成不确定度。',
        '材料与推导',
      ),
      question(
        '哪种实验记录最不符合可复现要求？',
        '只写最终平均值，不记仪器、单位、原始读数和修正过程',
        ['保存原始数据', '记录校准与分辨率', '写明不确定度来源'],
        2,
        '最终值离不开测量模型。缺少仪器、原始值、单位和修正，他人无法检查误差来源，也无法判断有效数字是否合理，结论就不可复核。',
        '常见误区',
      ),
      question(
        '把测量流程迁移到课堂测重力加速度时，哪种方案最完整？',
        '校准计时与长度仪器，多次独立测量，记录系统偏差并用不确定度传播检验结果',
        ['只取最快的一次', '看到接近 9.8 就停止记录', '忽略摆长和计时的单位'],
        0,
        '物理实验需要先保证仪器与过程，再讨论结果。重复、独立校准、单位统一和不确定度传播共同支持结论，单次贴近预期值不构成验证。',
        '迁移应用',
      ),
    ],
  },
  'physics:力与运动实验': {
    contentStatus: 'reviewed',
    prerequisite: '掌握位移、速度、加速度，能画受力图并使用牛顿第二定律。',
    plainLanguageGoal:
      '学完后，你能设计受控动力学实验，区分变量与混淆因素，并用拟合、残差和换条件验证力与加速度关系。',
    guidedPractice:
      '分析 8 组小车或模拟数据，写变量、控制条件、净力、加速度、拟合参数与残差结构。',
    independentPractice:
      '用低速小车或 PhET 模拟改变力与质量，记录多组数据，检验加速度对净力和质量的依赖。',
    commonErrors: [
      '把拉力直接当净力，忽略摩擦或把物体质量与配重混同。',
      '通过改变力的同时改变总质量，却把全部变化归因于力。',
      '只看拟合相关系数，不看残差、单位或模型适用范围。',
    ],
    sourceRefs: MOTION_SOURCES,
    studyPoints: [
      point('必背', '牛顿第二定律写作 F_net=ma；实验中加速度响应净力，方向取合力方向，质量必须包含被加速的全部物体。', 1),
      point('重点', '自变量是主动改变的条件，因变量是测量结果，控制变量用于排除竞争解释。', 2),
      point('易错', '名义拉力不一定是净力；残差有结构说明模型或条件仍有偏差。', 3),
      point('考点', '由 a-F 图像斜率判断质量，并由截距、残差和换质量实验评价模型。', 4),
    ],
    eventDetails: [MOTION_LAB_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜多挂一个砝码一定更准吗',
        body:
          '先做前测：不断增加拉力时同时给小车加配重，加速度变小能否只归因于摩擦？要求写出自变量、因变量和控制变量，并画小车受力图。变式让拉力方向改变，观察加速度与合力方向。反例是只记录“挂了几个砝码”，不换算力、不扣摩擦、不说明总质量。后测把一组力与加速度数据画成散点，预测直线斜率与质量关系，并用残差和单位量纲检验结果。',
        note: '变量变了要能解释。',
        objective: '能用变量、控制条件、受力图和单位诊断力与运动实验设计。',
        practice: '完成两组实验前测，写自变量、因变量、控制变量、净力与质量。',
        checkpoint: '检查受力对象、合力、总质量、变量控制、方向、单位和竞争解释。',
      },
      {
        title: '材料与概念｜变量、合力、加速度与拟合',
        body:
          '受控实验主动改变自变量，测量因变量，并尽量保持其他条件不变。牛顿第二定律 F_net=ma 中，净力是所有外力的矢量和，质量是实际被加速的系统总质量。实验中摩擦、滑轮惯量、传感器零点和轨道倾角都可能成为混淆变量。拟合直线给斜率和截距，但残差若呈系统弯曲或单侧分布，说明线性模型、条件或测量仍有问题。单位与量纲必须贯穿表格、图像和结论。',
        note: '先画受力，再谈拟合。',
        objective: '能解释变量控制、净力、总质量、加速度、拟合参数和残差含义。',
        practice: '为一个小车方案画受力图，并写出数据表列、拟合式、单位与两个替代解释。',
        checkpoint: '检查合力矢量、总质量范围、控制变量、模型形式、残差解释和量纲。',
      },
      {
        title: '示范与推导｜从 a-F 数据求有效质量',
        body:
          '若小车加传感器总质量约 0.50 kg，净力为 0.20、0.40、0.60 N 时加速度约 0.38、0.79、1.17 m/s²，作 a 对 F 图可得斜率接近 2.0 kg⁻¹，对应质量约 0.50 kg。示范保留每个数据点、单位和残差，检查直线是否过原点。反例是使用名义拉力却忽略摩擦，或只报一条漂亮拟合线。变式改变总质量，预测斜率应如何变化并重新检验。',
        note: '斜率也要带单位。',
        objective: '能由图线斜率估计质量，并用残差和换质量数据验证牛顿第二定律。',
        practice: '完成 a-F 表、斜率、倒数质量、截距、残差和一次质量变式。',
        checkpoint: '检查净力、总质量、斜率单位、倒数量关系、截距解释和残差结构。',
      },
      {
        title: '引导练习｜八组动力学证据',
        body:
          '准备八题，覆盖恒定质量变力、恒定力变质量、摩擦力未扣、轨道倾斜、传感器零点、采样过慢和非线性区间。每题先做前测画受力图，再写控制变量和预期图线，后测解释斜率、截距与残差并做参数变式。记录“力越大加速度必然越大但不管质量”“相关系数高就无需检查残差”“模拟没有摩擦所以等同真实”等错误，要求报告单位、验证步骤和结论边界。',
        note: '每个残差都要有解释。',
        objective: '能对八类动力学数据完成变量识别、图像判断、拟合和替代解释。',
        practice: '提交八张变量表、四张图像、两个质量变式、残差诊断和错误分类。',
        checkpoint: '检查变量控制、合力、总质量、斜率单位、残差结构、验证和模型边界。',
      },
      {
        title: '独立迁移与评价｜做一次受控加速度实验',
        body:
          '使用低速小车或模拟，先做前测写假设和预期，再改变一个力或质量条件并采集至少五组数据。记录摩擦、轨道、传感器、采样和总质量，制作净力—加速度图并检查残差。24 小时后换质量做变式。评价四项：变量受控、受力与单位正确、拟合有诊断、验证和边界完整。最后写一个“名义拉力等于净力”的反例，说明摩擦、滑轮和零点如何被检查。',
        note: '改变一个量，验证一个关系。',
        objective: '能把受控实验和牛顿第二定律迁移到新装置，并用数据、残差和边界评价。',
        practice: '提交设计、原始数据、受力图、拟合与残差、24 小时变式、误差和反例。',
        checkpoint: '四项自评：只改变目标变量、净力与质量有证据、单位完整、结论不过界；否则重做。',
      },
    ],
    quiz: [
      question(
        '牛顿第二定律中 F_net 的含义是什么？',
        '作用在被研究系统上的所有外力矢量和',
        ['任意一个最大力', '只算拉力', '只算摩擦力'],
        0,
        '加速度由净力决定，必须把研究对象受到的力全部纳入矢量合成。只取名义拉力或忽略摩擦，都会让预测和测量出现系统偏差。',
        '事实与定义',
      ),
      question(
        'a-F 图斜率约 2.0 kg⁻¹ 说明什么？',
        '在实验模型内有效质量约为 0.50 kg，仍需检查截距与残差',
        ['质量一定等于 2.0 kg', '加速度与力无关', '实验没有误差'],
        1,
        '由 a=(1/m)F，斜率是质量倒数，因此约为 0.50 kg 的倒数。但截距、摩擦和残差仍可能影响解释，单位也必须写清。',
        '材料与推导',
      ),
      question(
        '哪种实验设计最容易产生混淆变量？',
        '每增加一个拉力砝码时也给小车增加不同配重，却不记录总质量',
        ['固定轨道倾角', '提前校准传感器', '记录每次净力'],
        2,
        '力和被加速质量同时改变，就无法把加速度变化单独归因于力。控制变量要求至少记录并解释质量变化，或设计能分离两个因素的条件。',
        '常见误区',
      ),
      question(
        '把动力学流程迁移到电梯加速度测量时，哪种验证最完整？',
        '记录加速度计方向与零点，考虑支持力和重力，比较启动、匀速与制动阶段',
        ['只取启动峰值', '忽略方向', '把显示最大值当净力'],
        0,
        '电梯中的视重与加速度方向有关，需建立坐标系并区分重力、支持力和净力。多阶段数据和校准能揭示模型边界，单峰值证据不足。',
        '迁移应用',
      ),
    ],
  },
  'physics:电路与磁学实验': {
    contentStatus: 'reviewed',
    prerequisite: '理解电荷、电压、电流、电阻与磁场方向，能读简单电路图。',
    plainLanguageGoal:
      '学完后，你能安全搭接简单电路，正确测量电压与电流，比较串并联结果，并用磁场变化证据解释电磁感应。',
    guidedPractice:
      '分析 8 张电路与磁学任务，判断仪表位置、量程、节点、读数关系和安全风险。',
    independentPractice:
      '用低电压直流套件或 PhET 模拟完成电阻关系、串并联和磁通变化实验，保留接线与证据。',
    commonErrors: [
      '把电流表并联在电源两端，或带电改接导致短路和仪表损坏。',
      '不画节点与回路，误把电压或电流读数套到错误元件。',
      '认为磁铁静止放在线圈旁就会持续产生电流。',
    ],
    sourceRefs: ELECTRICITY_SOURCES,
    studyPoints: [
      point('必背', '电流表串联测电流，电压表并联测两点电势差；R=U/I 只在相应元件模型与条件下使用。', 1),
      point('重点', '串联电流相同、电压分配；并联电压相同、电流分流，结论必须绑定具体节点。', 2),
      point('易错', '电磁感应来自磁通量变化，不是“有磁铁就有电流”；接线和量程必须先于通电检查。', 3),
      point('考点', '根据接线图判断仪表读数关系，并区分恒定磁场与变化磁通产生的证据。', 4),
    ],
    eventDetails: [ELECTROMAGNETISM_LAB_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜灯泡不亮是电源坏了吗',
        body:
          '先做前测：闭合开关后灯泡不亮，电流表读数为零，如何用回路、节点、电压和量程定位问题？要求先画接线图并标正负极、仪表位置和安全断开点。变式把电压表误接成串联，观察读数为何不能按原意解释。反例是不断电拔线、用导线直接跨接电源或用大电流档试错。后测给出读数与磁针偏转记录，要求区分电路断路、接触不良和磁场证据。',
        note: '先断电，再改接。',
        objective: '能用回路、节点、仪表位置、量程和安全步骤诊断电路与磁学前测。',
        practice: '完成两张接线图前测，标电流表/电压表、正负极、可能断路和磁场方向。',
        checkpoint: '检查闭合回路、仪表串联/并联、极性、量程、短路风险、节点和证据。',
      },
      {
        title: '材料与概念｜电压、电流、电路与磁场',
        body:
          '电压描述两点间电势差，电流是电荷定向流动率，电路必须形成允许电荷运动的闭合路径。电流表串联进入支路，电压表并联在待测两点，量程和极性要与预计读数匹配。欧姆关系 R=U/I 需绑定具体元件和近似恒定条件。串联电流相同、并联电压相同，但能量与功率关系另算。磁场有方向，小磁针可显示局部方向；感应电动势依赖磁通量变化，安全证据必须包含断电、绝缘和限流。',
        note: '仪表位置改变测量对象。',
        objective: '能解释电压、电流、电阻、节点、串并联、磁场方向和感应条件。',
        practice: '为串联与并联各画节点图，写仪表位置、读数预期、方向和安全检查。',
        checkpoint: '检查电势差与电流区别、仪表连接、节点、单位、磁通变化和安全边界。',
      },
      {
        title: '示范与推导｜为什么两盏灯的读数不同',
        body:
          '设两电阻串联接在 6 V 电源上，R₁=100 Ω、R₂=200 Ω，则电流约 0.020 A，R₁两端电压约 2.0 V、R₂约 4.0 V，总电压相加为 6 V。示范在电路图上标每个节点的电势差和同一支路电流，检查单位。反例是把电压表串联后仍把读数当元件电压。变式改为并联，预测各支路电压相同而电流按电阻分配，并记录接线的安全风险。',
        note: '读数必须对应电路位置。',
        objective: '能用节点和元件关系推导串并联电压电流，并解释仪表位置影响。',
        practice: '完成一组串联计算、节点表、仪表位置、功率检查和并联变式。',
        checkpoint: '检查同一支路电流、节点电压、R=U/I、单位、功率和仪表连接。',
      },
      {
        title: '引导练习｜八张电路与磁场证据图',
        body:
          '准备八题，覆盖断路、短路风险、串并联、仪表反接、量程过小、磁针方向、静止磁铁和磁通变化。每题先做前测画节点与安全步骤，再读表或预测偏转，后测用另一组数据验证并写出替代解释。变式改变电阻、电源电压或磁铁运动方向，检查证明链条是否变化。记录“有磁铁就有电”“所有电流都同向化简”“读数正确即可忽略接线”等错误，单位、证据与安全必须同时呈现。',
        note: '每一次偏转都要有对照。',
        objective: '能对八类电路与磁学任务完成接线、预测、读数、验证和安全评价。',
        practice: '提交八张节点图、读数表、两个方向变式、安全记录和错误分类。',
        checkpoint: '检查回路、仪表、量程、节点、单位、磁通变化、对照和安全边界。',
      },
      {
        title: '独立迁移与评价｜设计一份低压电磁实验记录',
        body:
          '使用低电压直流套件或 PhET，先做前测画接线与预期，再完成三组电压—电流数据、一组串并联比较和一组磁铁运动感应。24 小时后改变电阻或运动方向做变式。评价四项：连接安全、仪表位置正确、读数与单位完整、证据能支持结论。最后写一个“静止磁铁持续发电”的反例，说明磁通变化、感应电动势、接触电阻和误差分别怎样检查。',
        note: '低压不等于可以带电试错。',
        objective: '能把电路和磁学模型迁移到安全实验，并用读数、方向和误差评价证据。',
        practice: '提交接线图、三组数据、串并联表、感应对照、24 小时变式、安全与反例。',
        checkpoint: '四项自评：断电改接、量程正确、节点清楚、证据可重复；任何短路风险立即停止。',
      },
    ],
    quiz: [
      question(
        '测量某个电阻两端电压时，电压表应怎样连接？',
        '并联在电阻两端，并选择合适量程和极性',
        ['串联在电源中', '把电源直接短接', '与电流表互换位置'],
        0,
        '电压表测两点间电势差，应并联到待测元件。串联会改变回路并可能产生错误读数或损坏风险，量程与极性也必须预先检查。',
        '事实与定义',
      ),
      question(
        '串联电阻 R₁=100 Ω、R₂=200 Ω 接在 6 V 电源上，哪项最合理？',
        '两电阻电流相同，R₂两端电压约为 R₁的两倍',
        ['两电阻电压都等于 6 V', 'R₁电流更大', '总电压等于两者电流之和'],
        1,
        '串联电流相同，电压按电阻分配。R₂较大，因此分得更大电压；两个元件电压之和约等于电源电压，电流不是相加的电压量。',
        '材料与推导',
      ),
      question(
        '哪种磁学判断最缺乏证据？',
        '磁铁静止在线圈旁，所以线圈应持续产生电流',
        ['改变磁通量可产生感应电动势', '小磁针可显示局部磁场方向', '运动方向会影响感应方向'],
        2,
        '感应需要磁通量变化。静止磁铁可能产生稳定磁场，却不能单凭“有磁铁”推出持续电流；还要检查闭合回路、方向和测量时间。',
        '常见误区',
      ),
      question(
        '把电学流程迁移到检查家用充电器外壳温度时，哪种做法最安全且完整？',
        '不拆开带电设备，只在允许的低压模拟中研究电路，并记录发热、量程与安全边界',
        ['用导线跨接保险丝', '带电触摸未知电路', '用普通电流表测墙插两端电阻'],
        0,
        '真实市电设备存在触电与火灾风险，课程实验只使用安全低压或模拟。模型可以研究电压电流，但不能把低压套件经验直接当作可拆修家电的授权。',
        '迁移应用',
      ),
    ],
  },
  'physics:波动光学实验': {
    contentStatus: 'reviewed',
    prerequisite: '理解波长、频率、叠加和相位差，能按比例读取图像。',
    plainLanguageGoal:
      '学完后，你能从双缝或光栅条纹图像测量间距，识别干涉与衍射，估算波长并报告图像误差。',
    guidedPractice:
      '分析 8 张条纹或强度图，标缝距、屏距、尺度、峰位和误差，判断干涉与衍射证据。',
    independentPractice:
      '用 PhET 或安全低功率光源形成条纹，标定图像并改变缝距或波长，比较预测与观测。',
    commonErrors: [
      '未把像素换算为长度就直接代入波长公式。',
      '把中央峰宽度、相邻峰间距和衍射包络混为同一个量。',
      '在图像饱和或背景未扣除时仍把峰强当可靠测量。',
    ],
    sourceRefs: OPTICS_SOURCES,
    studyPoints: [
      point('必背', '小角双缝近似下相邻亮纹间距 Δy≈λL/d；λ 是波长，L 是屏距，d 是缝距，三者单位必须一致。', 1),
      point('重点', '干涉决定细密条纹，衍射形成强度包络；图像先做尺度标定和背景处理，再找峰位。', 2),
      point('易错', '像素间距不是物理长度，最亮像素也不等于唯一峰位；强度与峰位是不同观测量。', 3),
      point('考点', '由多组峰位估算波长，改变缝距或屏距验证几何关系，并报告图像误差。', 4),
    ],
    eventDetails: [WAVE_OPTICS_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜条纹变宽是波长变了吗',
        body:
          '先做前测：同一张图像中条纹间距变大，可能是屏幕更远、缝距更小还是波长更长？要求写出波长、屏距、缝距和图像尺度，并标出中央峰与相邻峰。变式只改变曝光，观察峰位是否移动。反例是未标定像素尺就直接计算，或把饱和亮斑当真实强度。后测给定一张有刻度的条纹图，预测几何变化并用峰间距、背景和单位量纲做验证。',
        note: '先定尺度，再读条纹。',
        objective: '能用波长、屏距、缝距、尺度标定和强度诊断波动光学前测。',
        practice: '完成三张条纹前测，写峰位、物理间距、图像尺度、几何条件和单位。',
        checkpoint: '检查像素/长度换算、峰位一致性、几何关系、强度饱和、单位与替代解释。',
      },
      {
        title: '材料与概念｜干涉、衍射与图像证据',
        body:
          '两束相干光在屏幕上按相位差叠加，产生相长和相消的干涉条纹。多缝留下细密峰，单缝衍射形成较宽的强度包络；实际图像是两者与光源、镜头响应共同作用的结果。小角条件下相邻亮纹间距约 Δy=λL/d。图像要先用标尺或已知间距标定，再扣背景、找峰位并报告误差。强度提供峰高与包络证据，峰位提供间距，两者不能混同；波长计算还需统一纳米与米的单位。',
        note: '峰位和强度回答不同问题。',
        objective: '能解释干涉、衍射、波长、屏距、缝距、强度图像和误差来源。',
        practice: '为一张条纹图写几何量、像素尺度、峰位算法、强度处理和误差清单。',
        checkpoint: '检查相干条件、公式条件、尺度标定、峰位/强度区分、单位和误差。',
      },
      {
        title: '示范与推导｜用三组峰位估算波长',
        body:
          '设图像标尺为每像素 0.050 mm，相邻峰间距分别为 82、83、84 像素，平均约 83 像素，即约 4.15 mm。若屏距 1.00 m、缝距 0.150 mm，则 λ≈Δy·d/L≈6.23×10⁻⁷ m，即约 623 nm。示范把每个峰位记录、尺度换算、平均和结果分栏。反例是把中央暗纹到亮纹的宽度也当相邻亮纹间距。变式改变缝距，预测 λL/d 如何变化并检查残差。',
        note: '单位先统一，再代公式。',
        objective: '能由标定后的峰间距和几何参数计算波长，并解释测量误差。',
        practice: '完成三组峰位、尺度换算、平均间距、波长计算和一次缝距变式。',
        checkpoint: '检查峰选择、像素换算、小角条件、波长单位、有效数字和几何变式。',
      },
      {
        title: '引导练习｜八张条纹与强度图',
        body:
          '准备八题，覆盖双缝、单缝包络、多缝、不同屏距、不同缝距、饱和图像、背景噪声和对焦偏差。每题先做前测标尺度与峰位，再算间距或预测方向，后测用第二组峰位、强度和残差验证。变式改变一个几何参数，观察图像是否按模型移动。记录“像素数当毫米”“最亮像素唯一峰”“只改曝光就会改波长”等错误，要求给出图像证据、单位、误差和模型边界。',
        note: '一张图至少两种证据。',
        objective: '能对八类条纹图像完成标定、峰位识别、波长计算和误差判断。',
        practice: '提交八张标定图、峰位与强度表、两个几何变式、误差分析和错误分类。',
        checkpoint: '检查尺度、峰位一致、强度处理、公式条件、单位、残差和模型边界。',
      },
      {
        title: '独立迁移与评价｜从安全模拟测出一条波长',
        body:
          '使用 PhET 或安全低功率光源，先做前测预测条纹随波长或缝距的变化，再保存带尺度的图像并测量至少三组峰位。记录曝光、背景、屏距、缝距和误差，计算波长并与光源标称值比较。24 小时后改变一个几何参数做变式。评价四项：图像标定、峰位证据、计算单位、模型边界。最后写一个“只凭肉眼亮点估波长”的反例，说明为何要重复、标定和报告误差。',
        note: '不直视激光，模拟优先。',
        objective: '能把波动光学模型迁移到安全条纹实验，并用图像、单位、误差和验证评价。',
        practice: '提交图像、尺度、三组峰位、强度剖面、波长、24 小时变式、误差和反例。',
        checkpoint: '四项自评：尺度可追溯、峰位可复核、单位与误差完整、几何条件清楚；否则重测。',
      },
    ],
    quiz: [
      question(
        '双缝干涉中小角相邻亮纹间距近似由什么决定？',
        'Δy≈λL/d，并依赖波长、屏距和缝距',
        ['只依赖光强', '只依赖曝光时间', '只依赖屏幕颜色'],
        0,
        '条纹间距来自相位差随屏幕位置的几何变化。波长、屏距和缝距共同决定间距，光强更多影响可见度与计数，不改变该近似下的峰位。',
        '事实与定义',
      ),
      question(
        '三组峰间距为 82、83、84 像素，为什么不能直接写成 83 像素就是物理间距？',
        '还缺少像素到长度的尺度标定和屏距、缝距等几何条件',
        ['因为平均值一定错误', '因为像素没有颜色', '因为峰间距与波长无关'],
        1,
        '像素是图像坐标，不是毫米。必须先由标尺得到比例，再结合屏距和缝距计算波长；直接用像素数代入物理公式会造成量纲和数值同时错误。',
        '材料与推导',
      ),
      question(
        '哪种条纹图像最可能给出不可靠的强度结论？',
        '中央峰严重饱和，背景也未扣除，却直接比较各峰真实亮度',
        ['记录曝光时间', '标定图像尺度', '多测量相邻峰位'],
        2,
        '饱和会截断强度峰，背景会把暗区抬高。此时峰位或许仍可粗测，但强度比较需要检查曝光、动态范围和扣除背景，不能把屏幕亮度当物理强度。',
        '常见误区',
      ),
      question(
        '把条纹测量迁移到声波干涉实验时，哪种验证最完整？',
        '标定麦克风位置与间距，测量多个声压极值，改变频率或声源距并检查波长关系',
        ['只听一次最响位置', '把音量当频率', '忽略麦克风间距单位'],
        0,
        '声波同样可用相位差与图样研究，但需要位置标定、多个极值、频率与几何变式。安全音量、背景噪声和传感器方向也会影响证据。',
        '迁移应用',
      ),
    ],
  },
  'physics:用计算模型检验物理假设': {
    contentStatus: 'reviewed',
    prerequisite: '会写基础 Python 循环或使用电子表格，理解速度、加速度和基本图表。',
    plainLanguageGoal:
      '学完后，你能把物理假设写成含参数的计算模型，运行模拟，检查残差与数值稳定性，并用独立数据验证模型边界。',
    guidedPractice:
      '分析 8 个抛体或运动模型，写状态、参数、时间步、残差、拟合和边界，找出过拟合与数值伪影。',
    independentPractice:
      '用 Python、电子表格或模拟建立带阻力的运动模型，拟合或选择参数，并在留出数据上检验预测。',
    commonErrors: [
      '模型在拟合数据上误差小，就宣称它在新条件下也有效。',
      '改变时间步后结果明显变化，仍把数值误差解释成物理现象。',
      '参数没有单位或超出合理范围，却只追求拟合曲线更贴近。',
    ],
    sourceRefs: MODEL_SOURCES,
    studyPoints: [
      point('必背', '计算模型由状态、参数、更新规则和边界组成；验证必须使用未参与拟合的数据，并分别报告测量、数值和模型误差。', 1),
      point('重点', '残差=观测−预测；残差有结构提示模型或参数有问题，时间步与参数敏感性检查数值稳定性。', 2),
      point('易错', '训练集贴合并不能证明外推有效；拟合参数必须带单位、合理范围和可解释性。', 3),
      point('考点', '根据残差、留出验证和边界条件判断模拟结论是否成立，并区分模型误差与计算误差。', 4),
    ],
    eventDetails: [COMPUTATIONAL_MODEL_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜曲线最贴合就能预测吗',
        body:
          '先做前测：一个抛体模型在十组旧数据上几乎穿过所有点，为什么仍可能在新速度下失败？要求写出模型、参数、模拟输出、验证数据和边界，并区分测量误差与数值误差。变式改变时间步或初速度，观察预测是否稳定。反例是只报告拟合优度、不保留独立测试集，或随意调参数。后测检查残差方向、参数单位和单位量纲，并写出一条能推翻模型的验证。',
        note: '拟合好不等于模型对。',
        objective: '能用参数、残差、独立验证和数值步长诊断计算模型前测。',
        practice: '完成两组模型前测，写状态、参数、拟合数据、验证数据、残差和边界。',
        checkpoint: '检查模型假设、参数单位、训练/验证分离、残差结构、数值误差和边界。',
      },
      {
        title: '材料与概念｜模型、参数、模拟与验证',
        body:
          '计算模型把物理状态、参数和更新规则写成可运行结构，输出必须对应可测物理量。参数有单位、范围和不确定性；模拟把连续时间离散化，时间步过大会改变轨迹，过小会增加累计误差与成本。残差等于观测减预测，随机散布与系统弯曲提供不同线索。验证使用未参与拟合的数据，敏感性分析改变关键参数。最终报告区分数值误差、测量误差和模型误差，并明确模型不能外推的条件。',
        note: '训练、验证、边界三件事分开。',
        objective: '能解释计算模型、参数、时间步、残差、独立验证和敏感性边界。',
        practice: '为一个运动模型列状态、参数、单位、更新式、残差定义和验证方案。',
        checkpoint: '检查状态与输出、参数单位、离散化、残差定义、留出验证和模型边界。',
      },
      {
        title: '示范与推导｜时间步和残差怎样暴露问题',
        body:
          '设小球在重力下运动，用 v_{n+1}=v_n+aΔt、x_{n+1}=x_n+v_{n+1}Δt 更新。Δt 从 0.1 s 缩到 0.01 s 后轨迹应逐渐收敛；若总能量或落点持续漂移，需检查算法。拿模拟位置减观测位置得残差，若残差随速度单调增大，阻力模型可能缺失。示范把时间步、参数、预测和残差画在同一表中。反例是只挑一组 Δt 使曲线最好看，变式改用留出初速度检验预测。',
        note: '先看稳定，再看贴合。',
        objective: '能比较不同时间步并计算残差，判断数值误差和模型结构问题。',
        practice: '完成两组 Δt 轨迹、收敛表、残差图、一个参数变式和留出预测。',
        checkpoint: '检查更新式符号、时间步收敛、残差方向、参数单位、验证数据和边界。',
      },
      {
        title: '引导练习｜八个模拟诊断任务',
        body:
          '准备八题，覆盖抛体、带阻力运动、拟合参数、过拟合、时间步过大、初值敏感、传感器偏差和边界外推。每题先做前测写状态与参数，再运行或读模拟，后测计算残差、比较训练验证并做参数或步长变式。记录“误差小就证明”“残差均值零就无结构”“调参数没有范围”等错误，要求保存代码或表格、单位、随机种子和验证证据。',
        note: '每个结果都要能重跑。',
        objective: '能对八类模型完成参数检查、数值复核、残差分析和独立验证。',
        practice: '提交八张模型卡、两组收敛测试、三张残差图、留出验证、错误分类和单位表。',
        checkpoint: '检查状态、参数范围、时间步、残差结构、训练/验证分离、单位、复现和边界。',
      },
      {
        title: '独立迁移与评价｜用留出数据验证一个运动模型',
        body:
          '用 Python、电子表格或 PhET 建立一个小球或车辆运动模型，先做前测写假设与预测，再用部分数据选参数，保留另一条件的数据做验证。检查时间步、参数范围和残差，并至少改变一个参数做敏感性分析。24 小时后改变初速度或阻力条件做变式。评价四项：假设明确、计算可复现、残差与验证完整、边界诚实。最后写一个“训练集拟合很好所以一定可外推”的反例，说明如何设计反驳测试。',
        note: '没有留出验证就不算充分验证。',
        objective: '能把计算建模流程迁移到新运动问题，并用可复现模拟、残差和留出数据评价。',
        practice: '提交模型说明、代码或表格、参数、时间步测试、残差、留出验证、变式和反例。',
        checkpoint: '四项自评：状态与单位清楚、结果可重跑、验证独立、边界有证据；任一缺失需重做。',
      },
    ],
    quiz: [
      question(
        '计算模型中最不可缺少的四项结构是什么？',
        '状态、参数、更新规则和适用边界',
        ['颜色、标题、字体和按钮', '只看最终图像', '越复杂的公式越好'],
        0,
        '模型必须说明系统状态怎样随规则变化，参数代表什么，输出如何对应观测，以及在哪些条件下近似成立。缺少边界就无法判断外推是否合理。',
        '事实与定义',
      ),
      question(
        '减小时间步后预测持续明显变化，首先应怎样理解？',
        '可能是数值离散尚未收敛，应先做时间步检验再解释物理现象',
        ['说明物理定律改变了', '时间步越小越不真实', '可以忽略这个变化'],
        1,
        '连续方程被离散后会引入误差。结果随步长收敛才可信；若步长变化导致大幅漂移，不能急于把差异归因于新物理机制。',
        '材料与推导',
      ),
      question(
        '哪种模型验证最不充分？',
        '只用参与参数拟合的数据检查曲线，并据此宣称所有新条件都能预测',
        ['保留独立验证数据', '检查残差结构', '做参数敏感性分析'],
        2,
        '在训练数据上贴合只是必要条件。没有留出验证，模型可能把噪声或偶然条件拟合进去，外推能力无法被检验，误差也不能分解。',
        '常见误区',
      ),
      question(
        '把建模流程迁移到天气模拟时，哪种做法最严谨？',
        '分开历史拟合与未来验证，做参数敏感性、分辨率和边界检查，并报告集合不确定性',
        ['只看一张预报图', '不断调参直到今天完全吻合', '忽略初值误差'],
        0,
        '复杂系统需要区分拟合、验证与外推，初值和参数误差会增长。集合与敏感性分析能表达不确定性，不能用一个漂亮案例替代整体证据。',
        '迁移应用',
      ),
    ],
  },
};
