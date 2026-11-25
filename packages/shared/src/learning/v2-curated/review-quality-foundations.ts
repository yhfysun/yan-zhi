import type { LearningV2CuratedCoursePlan } from '../v2-types.js';
import { ADVANCED2_FOUNDATIONS_CURATED_PLANS } from './advanced2-foundations.js';
import { ADVANCED_FOUNDATIONS_CURATED_PLANS } from './advanced-foundations.js';
import { ARTS_HUMANITIES_REMAINING_CURATED_PLANS } from './arts-humanities-remaining.js';
import { CALLIGRAPHY_CURATED_PLANS } from './calligraphy.js';
import { CORE_MATH_CURATED_PLANS } from './core-math.js';
import { CORE_PHYSICS_CURATED_PLANS } from './core-physics.js';
import { CURRENT_COURSE_CURATED_PLANS } from './current-course-curated.js';
import { ARTS_DEPTH_PATCHES } from './depth-arts.js';
import { STEM_DEPTH_PATCHES } from './depth-stem.js';
import { FOUNDATIONS_CURATED_PLANS } from './foundations.js';
import { MILESTONE_FOUNDATIONS_CURATED_PLANS } from './milestone-foundations.js';
import { PHYSICS_CURATED_PLANS } from './physics.js';
import { PRIORITY_EXPANSION_CURATED_PLANS } from './priority-expansion.js';
import type { CuratedCoursePlanPatchMap } from './types.js';

const BASE_PLAN_MAPS = [
  ADVANCED2_FOUNDATIONS_CURATED_PLANS,
  ADVANCED_FOUNDATIONS_CURATED_PLANS,
  ARTS_HUMANITIES_REMAINING_CURATED_PLANS,
  CALLIGRAPHY_CURATED_PLANS,
  CORE_MATH_CURATED_PLANS,
  CORE_PHYSICS_CURATED_PLANS,
  CURRENT_COURSE_CURATED_PLANS,
  FOUNDATIONS_CURATED_PLANS,
  MILESTONE_FOUNDATIONS_CURATED_PLANS,
  PHYSICS_CURATED_PLANS,
  PRIORITY_EXPANSION_CURATED_PLANS,
];

const DEPTH_PATCHES: CuratedCoursePlanPatchMap = {
  ...ARTS_DEPTH_PATCHES,
  ...STEM_DEPTH_PATCHES,
};

const CURRENT_STEPS_BY_BASE = new WeakMap<
  LearningV2CuratedCoursePlan['steps'],
  LearningV2CuratedCoursePlan['steps']
>();

for (const plans of BASE_PLAN_MAPS) {
  for (const [key, plan] of Object.entries(plans)) {
    const deepenedSteps = DEPTH_PATCHES[key]?.steps;
    if (deepenedSteps) {
      CURRENT_STEPS_BY_BASE.set(plan.steps, deepenedSteps);
    }
  }
}

function appendBodies(
  plan: LearningV2CuratedCoursePlan,
  additions: Readonly<Record<string, string>>,
): LearningV2CuratedCoursePlan['steps'] {
  const currentSteps = CURRENT_STEPS_BY_BASE.get(plan.steps) ?? plan.steps;
  const missing = Object.keys(additions).filter(
    (title) => !currentSteps.some((step) => step.title === title),
  );
  if (missing.length > 0) {
    throw new Error(`Review patch references missing steps: ${missing.join(', ')}`);
  }

  return currentSteps.map((step) => {
    const addition = additions[step.title];
    return addition ? { ...step, body: `${step.body} ${addition}` } : step;
  });
}

const REVIEWED_COURSE_KEYS: readonly string[] = [
  'math:三角函数的周期与相位',
  'math:数列：递推与通项',
  'math:解析几何：方程与图形',
  'math:导数：变化率的局部语言',
  'math:概率统计：证据与不确定性',
  'math:极限与连续',
  'math:微分与积分',
  'math:向量、矩阵与线性变换',
  'math:随机变量与分布',
  'math:数学证明的三种入口',
  'math:建模：现实问题的变量选择',
  'math:算法思维与复杂度直觉',
  'math:数学史上的结构变化',
  'math:二次函数：参数如何改变图像',
  'math:分数：从分割到运算',
  'math:方程：把未知量变成关系',
  'math:几何直观与证明',
  'math:数感与估算',
  'math:概率：从游戏到模型',
  'physics:磁场与电磁感应',
  'physics:机械波与声波',
  'physics:光的反射、折射与成像',
  'physics:温度、热量与内能',
  'physics:热力学定律与过程',
  'physics:光的波动性与粒子性',
  'physics:原子结构与光谱',
  'physics:实验数据、误差与有效数字',
  'physics:力与运动实验',
  'physics:电路与磁学实验',
  'physics:波动光学实验',
  'physics:用计算模型检验物理假设',
  'physics:运动学：位置、速度与加速度',
  'physics:功、能量与能量守恒',
  'physics:动量、碰撞与守恒',
  'physics:电荷、电场与电势',
  'physics:测量、单位与数量级',
  'physics:力与牛顿运动定律',
  'physics:电路、电流与电阻',
  'physics:量子世界的第一组概念',
  'calligraphy:九成宫：横画的起收与重心',
  'calligraphy:起笔、行笔、收笔',
  'calligraphy:九成宫：左右结构的避让',
  'calligraphy:颜勤礼碑：宽博与筋力',
  'calligraphy:玄秘塔碑：中宫与撇捺',
  'calligraphy:胆巴碑：楷中带行',
  'calligraphy:赵孟頫《洛神赋》行楷',
  'calligraphy:赵孟頫《赤壁赋》行楷',
  'calligraphy:王羲之《兰亭序》行书',
  'calligraphy:颜真卿《祭侄文稿》行书',
  'calligraphy:苏轼《黄州寒食帖》行书',
  'calligraphy:米芾《蜀素帖》行书',
  'calligraphy:硬笔基本笔画与结构',
  'calligraphy:横线格中的字距与行距',
  'calligraphy:从碑帖结构到硬笔书写',
  'calligraphy:日常笔记的清晰与速度',
  'calligraphy:坐姿、执笔与运腕',
  'calligraphy:中锋与侧锋：线条的骨肉',
  'calligraphy:硬笔的力度与速度',
  'memory:记忆宫殿：20 个词的有序提取',
  'memory:工作记忆的容量限制',
  'memory:编码：让信息变得可区分',
  'memory:联想链：从荒诞到稳定',
  'memory:分块：把长串压缩成结构',
  'memory:首字母与关键词法',
  'memory:故事法：人物、动作与地点',
  'memory:英语词汇：词根与例句双钩',
  'memory:历史年代：时间轴与因果链',
  'memory:数学公式：条件与图像',
  'memory:法条与规范：场景化检索',
  'memory:间隔复习：什么时候再看',
  'memory:交错练习：混合不是混乱',
  'memory:睡眠与记忆巩固',
  'memory:建立个人复习节奏',
  'memory:注意力不是意志力',
  'memory:提取练习为什么比重读有效',
  'thinking:渡河谜题：把约束画成状态图',
  'thinking:相关不等于因果',
  'thinking:证据强度与结论强度',
  'thinking:演绎：前提如何推出结论',
  'thinking:归纳：样本够不够',
  'thinking:类比：相似点是否关键',
  'thinking:常见谬误的四种伪装',
  'thinking:问题树：从现象到可行动问题',
  'thinking:MECE 不是把所有事都列一遍',
  'thinking:决策矩阵：权重从哪里来',
  'thinking:反馈回路：为什么越用力越糟',
  'thinking:延迟效应与短期指标',
  'thinking:约束如何激发创造',
  'thinking:类比迁移：借结构不借表面',
  'thinking:事实与观点的分界',
  'thinking:隐藏假设怎么找',
];

const STATUS_PATCHES: CuratedCoursePlanPatchMap = Object.fromEntries(
  REVIEWED_COURSE_KEYS.map((key) => [key, { contentStatus: 'reviewed' as const }]),
);

const REWRITTEN_PATCHES = {
  'math:三角函数的周期与相位': {
    contentStatus: 'reviewed',
    steps: appendBodies(CORE_MATH_CURATED_PLANS['math:三角函数的周期与相位'], {
      '角度、弧度与单位圆':
        '换算关系给出可检验的锚点：180°=π rad，所以 30°=π/6、90°=π/2；半径 r 上圆心角 θ 对应的弧长为 s=rθ。若 θ 用了角度，s 的单位就会错；用同一圆周分别按两种单位计算弧长，结果一致才说明换算正确。',
      '周期、振幅与平衡位置':
        '把正弦型函数写成 y=A sin(Bx+C)+D 后，振幅是 |A|，周期是 2π/|B|，平衡位置是 D。例如 A=3、D=5 时，函数值在 2 到 8 之间；反例是把 D 当成振幅，会把最大值和最小值整体算错。',
      '相位与图像平移':
        '例如 y=sin(2x−π/2) 应先写成 sin[2(x−π/4)]，图像向右平移 π/4，不是 π/2。把 x=π/4 代入可核对它落在 sin 0，正好对应原函数在 0 的位置，因此符号与平移量必须一起验证。',
      '建立周期模型':
        '例如某地潮位可用 h(t)=1.5+2sin(πt/6.2) 近似描述，单位为 m，周期约 12.4 h，平衡潮位 1.5 m、振幅 2 m。把预测与当天六个实测点比较；若低潮附近的残差持续偏大，就要增加趋势项或缩短模型可用范围。',
    }),
  },
  'math:分数：从分割到运算': {
    contentStatus: 'reviewed',
    steps: appendBodies(ADVANCED_FOUNDATIONS_CURATED_PLANS['math:分数：从分割到运算'], {
      '用面积操作加减':
        '例如 2/3+1/4 取 12 等份，分别写成 8/12 与 3/12，相加得 11/12；面积图上先估计接近 1，再核对和为 11 份。若直接写成 3/7，等于混用了两种不同大小的份数。',
      '用估算和逆运算检查':
        '例如 7/8+5/6 两项都接近 1，和必须在 1 到 2 之间；若算出 35/48，虽然分母看似合理，却小于任一加数，立刻说明通分或加法写错。乘法则用 2/3×1/4=1/6 做逆运算检查：1/6÷1/4 应回到 2/3。',
    }),
  },
  'math:数感与估算': {
    contentStatus: 'reviewed',
    steps: appendBodies(FOUNDATIONS_CURATED_PLANS['math:数感与估算'], {
      '用边界值检查结果':
        '以 300 页、每页 500 到 1000 字计，字数的合理区间是 300×500=15 万到 300×1000=30 万。把因子分别取低值和高值可得到包络；若结果落在区间外，先查页数与每页字数的单位是否混用，而不是继续保留更多小数。',
      '解释误差来自哪里':
        '例如估算 487×21 时，把 487 取成 500 引入约 2.7% 的相对误差，把 21 取成 20 引入约 4.8%，两者合起来仍应接近 1 万。若答案变成 10 万，误差不可能只来自取整，通常是数量级或小数位错了；先查单位，再决定是否需要精算。',
    }),
  },
  'math:概率：从游戏到模型': {
    contentStatus: 'reviewed',
    steps: appendBodies(PRIORITY_EXPANSION_CURATED_PLANS['math:概率：从游戏到模型'], {
      '先列完整样本空间':
        '把第一枚和第二枚硬币分别记作 H/T，样本空间就是 {HH,HT,TH,TT}，每个结果概率 1/4；“至少一个正面”包含 HH、HT、TH 三个结果，概率为 3/4。反例是把 HH 和 TT 当作全部结果，漏掉两枚不同的混合情况。',
      '把文字事件翻成集合':
        '若事件 A 为“至少一个正面”，它对应 {HH,HT,TH}，所以 P(A)=3/4；它的补集是 {TT}。用补集检查可避免重复计数：P(A)+P(A的补集) 必须等于 1；若写成一正一反两个结果再乘 2，就要说明到底用了哪个计数空间。',
      '区分理论概率与实验频率':
        '例如理论值 P(H)=1/2，但连续抛 10 次出现 7 次正面并不自动说明硬币不公平；可以模拟 1000 组“每组 10 次”，观察出现 7 次以上正面的组所占比例。实验频率应连同样本量、随机波动范围和模型假设一起报告。',
      '用模拟检查直觉':
        '例如先算两枚硬币“至少一正”的概率为 3/4，再模拟 100 次并记录成功比例；重复若干批，观察结果围绕 0.75 波动。若一次只抛 4 次得到 0.5，不能据此否定模型，应报告样本数、允许误差和可重复的抽样步骤。',
    }),
  },
  'physics:热力学定律与过程': {
    contentStatus: 'reviewed',
    steps: appendBodies(CORE_PHYSICS_CURATED_PLANS['physics:热力学定律与过程'], {
      '热机、制冷与能量账本':
        '例如热机从高温热源吸收 Q_h=600 J，对外做功 W=200 J，则向低温热源放热 Q_c=400 J；能量账本必须满足 600=200+400，所有量都用 J。若漏掉 Q_c，就会错误宣称效率或能量凭空变化；实际装置还要记录摩擦、散热和温度单位。',
    }),
  },
  'physics:光的波动性与粒子性': {
    contentStatus: 'reviewed',
    steps: appendBodies(CORE_PHYSICS_CURATED_PLANS['physics:光的波动性与粒子性'], {
      '波粒二象性与模型边界':
        '例如双缝实验测到条纹间距随波长增大，而同一材料的光电效应只随频率跨过截止值才产生电子；两套实验讨论的是不同可观察量。结论要把装置、频率、强度和材料条件并列，不能把“既是波又是粒子”当作无需测量条件的口号。',
    }),
  },
  'physics:运动学：位置、速度与加速度': {
    contentStatus: 'reviewed',
    steps: appendBodies(CURRENT_COURSE_CURATED_PLANS['physics:运动学：位置、速度与加速度'], {
      '复盘测量与模型偏差':
        '例如记录 x(t) 后发现拟合残差在启动和停止附近最大，说明匀速或匀变速假设只覆盖中段；可缩短分析区间、提高采样频率并比较不同拟合窗口。结论应写成“在该采样间隔和区间内，加速度约为 a±Δa”，同时保留原始数据与异常点。',
    }),
  },
  'physics:功、能量与能量守恒': {
    contentStatus: 'reviewed',
    steps: appendBodies(ADVANCED_FOUNDATIONS_CURATED_PLANS['physics:功、能量与能量守恒'], {
      '先观察能去了哪里':
        '例如小球释放前只有重力势能，最低点近似全为动能，但若轨道有摩擦，部分能量会变成内能与声能。先写系统边界和参考高度，再把 mgh 与 ½mv² 逐项对齐；若两者不等，先检查质量、速度和高度单位，而不是宣称能量消失。',
      '写出能量转换链':
        '例如从高度 h 释放的小球理论速度满足 mgh=½mv²，所以 v=√(2gh)，高度用 m、重力加速度用 9.8 m/s²，速度单位才是 m/s。把预测速度与五次实测值比较；若实测偏小，列出摩擦、转动和空气阻力等可能损失，再设计控制变量的下一轮实验。',
      '用误差解释差异':
        '例如 h=0.300 m 时预测 v≈2.42 m/s，实测平均 2.25 m/s，差异约 7%，可结合计时反应、有效高度和摩擦解释。结论应写成带不确定度的范围并说明模型忽略了什么；不能用一次偏差断言守恒定律失效，也不能把误差当成全部原因。',
    }),
  },
  'physics:测量、单位与数量级': {
    contentStatus: 'reviewed',
    steps: appendBodies(PHYSICS_CURATED_PLANS['physics:测量、单位与数量级'], {
      '先观察一次不完整的测量':
        '例如刻度尺最小分度 1 mm 时可读到 12.0 cm，最后一位是估读；只说 12 无法区分 12 cm、12 mm 还是 12 in。复现记录还应写仪器零点和测量位置，因为换尺或从不同端点起测都可能改变系统误差。',
      '把单位当成模型的一部分':
        '例如 1 cm=10^-2 m，12.0 cm 应写成 0.120 m；若公式要求 N、m、s，先把 250 g 改成 0.250 kg，再计算 F=ma。完成换算后用量级检查：一本书宽 0.12 m 合理，写成 120 m 则说明小数点或单位错了。',
      '做五次重复测量':
        '例如五次读数 12.0、12.1、12.0、12.2、12.0 cm，平均值 12.06 cm，但报告不必保留到百分之一毫米；结合最小分度可写 12.1 cm 或附约 0.1 cm 的波动范围。若每次都比标准值大 0.2 cm，重复测量无法消除尺子零点偏差，应校准或改正系统误差。',
      '写一条带精度的结论':
        '例如尺子最小分度 1 mm、五次读数分散约 0.1 cm，可写“书宽约 12.1 cm，重复测量波动约 0.1 cm，未校正尺子零点误差”。这里的 ± 不是保证真值一定落在区间，而是说明当前方法和条件下的分辨能力；改变仪器或测量位置后要重新评估。',
    }),
  },
  'physics:力与牛顿运动定律': {
    contentStatus: 'reviewed',
    steps: appendBodies(PHYSICS_CURATED_PLANS['physics:力与牛顿运动定律'], {
      '从推书的感受开始':
        '例如书静止时重力和支持力平衡，轻推未动时静摩擦参与平衡；推动后松手，书靠惯性滑行而合力主要是摩擦。先比较速度是否变化，再判断合力方向；把“有力”直接等同于“在加速”会把平衡状态和运动状态混为一谈。',
      '把物体和周围分开':
        '例如分析书时只画地球给的重力、桌面给的支持力和手给的推力；书压桌面的力作用在桌面上，不能和桌面对书的支持力一起当作书所受的平衡力。画完逐个写施力物体，若某个箭头找不到外部施力者，就不应放进受力图。',
      '用 F=ma 连接合力与加速度':
        '例如质量 2 kg 的物体受水平合力 6 N，则 a=F/m=3 m/s²；若支持力 19.6 N、重力 19.6 N 竖直平衡，它们不影响水平加速度。合力为零时速度可以保持不变且不为零；只看到某个 6 N 的力，也不能跳过其他力直接写加速度。',
      '用弹簧测力计做小幅实验':
        '例如小车的拉力从 0.5 N 增到 1.0 N，可记录运动状态变化并计算 a；若测力计未调零，读数整体偏大，重复测量不会自动消失。实验前检查量程、零点和拉线方向，逐步增加力并保持低速，不能为了得到漂亮数据突然猛拉。',
      '把电梯感受写成物理解释':
        '例如电梯加速上升时，人受重力 mg 向下、地板支持力 N 向上，N>mg，所以 a=(N−mg)/m 向上；匀速时 N=mg，减速上升时 N<mg。所谓“变重”是支持力变化，不是质量或重力突然增加；必须同时说明运动阶段和加速度方向。',
    }),
  },
  'physics:电路、电流与电阻': {
    contentStatus: 'reviewed',
    steps: appendBodies(PRIORITY_EXPANSION_CURATED_PLANS['physics:电路、电流与电阻'], {
      '建立电压、电流、电阻三变量':
        '例如 1 C 电荷通过 3 V 电源获得 3 J 能量，单位关系为 1 V=1 J/C；若 2 A 电流持续 5 s，通过截面电荷量为 Q=It=10 C。电压不是“电流的大小”，电阻也不是“电压的单位”，三个符号相邻但量纲和测量对象完全不同。',
      '先画出闭合回路':
        '例如两电阻串联时只有一条路径，电流处处相等；并联时两个支路接在同一对节点上，电压相同而电流分流。画图时标出节点 A、B 和电流箭头，再把电压表并联、电流表串联；先判断拓扑可以避免把总电阻公式套反。',
      '用欧姆定律做局部检查':
        '例如 R=10 Ω、两端电压 U=5 V 时，I=U/R=0.5 A；回代 P=UI=2.5 W，并与电阻额定功率比较。若算得 50 A，先检查是否把 5 V 与 10 Ω 的除法做反，或把 mA 当成 A；单位、量级和器件规格三项必须同时合理。',
      '区分串联和并联的总电阻':
        '例如 R1=6 Ω、R2=3 Ω 串联总电阻 9 Ω；并联时 1/R=1/6+1/3=1/2，所以总电阻 2 Ω。串联总电阻大于任一分电阻，并联总电阻小于任一分电阻，可用这两个边界检查公式是否套错。',
      '把功率与安全边界写出来':
        '例如并联支路总电流 0.3 A、两端电压 5 V，总功率 P=UI=1.5 W，不能把各支路功率重复相加后再算一次。实验只使用低压电池和限流电阻，先断电接线、核对量程，再通电观察；出现异味、过热或异常跳变立即断开。',
    }),
  },
  'physics:量子世界的第一组概念': {
    contentStatus: 'reviewed',
    steps: appendBodies(PRIORITY_EXPANSION_CURATED_PLANS['physics:量子世界的第一组概念'], {
      '从能量量子化开始':
        '例如氢原子能级之间的跃迁只能吸收或发射特定频率的光，光谱呈分立谱线；这里的“离散”是模型允许状态受限，不是说空间中的物体只能停在离散小点。把谱线频率换算成能量 E=hf，并与能级差比较，才能检验量子化模型。',
      '用概率描述实验结果':
        '例如重复进行同一双缝实验，单次电子落点看似随机，但大量事件累积出稳定条纹；理论预测的是落点分布和条纹间距，不是每个电子的确定轨迹。样本量、实验条件和探测器位置必须写清，否则“概率”只是一句无法复核的描述。',
      '理解测量会改变条件':
        '例如测量位置需要让系统与屏幕、探测器或光子发生相互作用，而测量动量又依赖另一套条件；不同装置的误差和反作用不能混为一谈。先画装置、写可观察量，再讨论不确定性或波函数变化，不能用“观测者意识”代替可重复实验。',
      '区分科学结论与流行说法':
        '例如某产品声称“量子能量”改善健康，却没有给出可测量的系统、对照组和重复实验，就不能借量子力学术语获得可信度。判断时应查论文、样本、效应量和独立复现；科学结论的范围由实验条件限定，不由广告中的“量子”二字扩大。',
    }),
  },
  'calligraphy:坐姿、执笔与运腕': {
    contentStatus: 'reviewed',
    steps: appendBodies(CALLIGRAPHY_CURATED_PLANS['calligraphy:坐姿、执笔与运腕'], {
      '先看一张稳定的书写现场':
        '可以用手机侧面拍照，检查耳肩髋是否大致成线、双脚是否落地、双肘是否获得支撑；连续书写十分钟后若肩颈酸痛，说明姿势无法持续，需缩短单次练习并调整桌面高度。',
      '摹写一次正确的执笔结构':
        '用镜子或侧面照片确认笔杆方向、虎口空间与指节弯曲，再在纸上连续画五条短线；如果掌心塌陷或手指发白，先松开一指的力度，观察线条是否更稳，而不是继续加力。',
      '对照自己的握笔照片':
        '比较两次照片时保持同一角度、同一支笔和同一坐姿，只圈出一个差异最小但可持续改善的部位；改完立刻写五条横线，记录抖动次数和起收位置，照片与线条结果必须同时变好才算有效。',
      '用运腕临写基本线':
        '画横线时让前臂获得支撑、腕部只做小幅平移，竖线则保持手指结构稳定、避免整条手臂悬空；每条线标出起收点，若末端逐渐抬离或抖动增多，先缩短长度，再逐步延长到五厘米。',
      '做一次单变量点评':
        '例如目标写“掌心保持不塌、每写三条停一次检查”，练习后只记录是否做到、哪一条最先失控和下一次调整动作；连续两轮同一指标改善，再换下一个姿势变量，避免一次把所有问题都归因于“不够认真”。',
    }),
  },
  'calligraphy:起笔、行笔、收笔': {
    contentStatus: 'reviewed',
    steps: appendBodies(ADVANCED_FOUNDATIONS_CURATED_PLANS['calligraphy:起笔、行笔、收笔'], {
      '先看一笔的三段时间':
        '把横画拆成入纸点、行笔中线和离纸点三个坐标，比较同一书家的五条横画，记录三处的粗细、方向与速度变化。若只看外形轮廓，容易把刻帖刀痕当成毛笔动作；先看连续笔势，再判断哪些细节属于书写、哪些属于拓本。',
      '摹写一个清楚的开头':
        '可用中性笔先做一厘米短线：笔尖以约 30° 方向轻落，停约 0.2 秒后匀速右行，末端稍驻再离纸。若开头形成过重墨块，说明落笔压力或停顿过大；若边缘断裂，先检查入纸角度和纸面支撑，一次只改一个变量并连写五条对照。',
      '对照行笔的速度与压力':
        '例如同样写两厘米横线，A 组全程约一秒、压力不变，B 组中段突然加速；叠合后看边缘毛糙、粗细突变和末端失控各出现在何处。记录变化位置而不是只说“手感不同”，下一轮只改速度或压力中的一项，才能知道差异由哪个变量造成。',
      '用一项标准点评':
        '例如把目标定为“起笔方向与范字一致、行笔边缘稳定、收笔不拖尾”，每条线只勾选一个观察点，并为下一遍写一个动作：入纸角度减小、速度保持匀速或收笔提前离纸。完成后用同角度照片和范字并排复核，不能只凭写完后像不像来判断。',
    }),
  },
  'calligraphy:中锋与侧锋：线条的骨肉': {
    contentStatus: 'reviewed',
    steps: appendBodies(CALLIGRAPHY_CURATED_PLANS['calligraphy:中锋与侧锋：线条的骨肉'], {
      '先看线条而不是字形':
        '用同一支笔写一厘米、两厘米、四厘米三种线，分别观察边缘是两侧均匀、单侧发实还是中段断续；把“锋位”和“线条粗细”分开记录，才能看出是笔毫铺开位置变化，还是压力突然增大。',
      '摹写一条中锋线':
        '保持纸张和速度不变，从距离起笔点约一毫米的中央位置进入，行笔时让笔尖方向与线方向一致，末端减速后离纸。每条线旁标注“中心实、边缘整、末端不拖”；若做不到就缩短到一厘米，下一轮只改入纸点或压力。',
      '叠合比较两种受力':
        'A 组保持锋位居中，B 组只把笔尖向一侧偏约半毫米，速度、压力和纸都不变；叠合后记录边缘哪一侧更实、粗细差出现在起笔还是中段。若两组几乎无差别，可能是压力太大掩盖了锋位，应先减轻压力再比较。',
      '临写碑帖中的横与竖':
        '临写前先在范字上标出横画的中线方向和起收位置，再判断它更依赖稳定中锋还是侧锋外形；每条线旁写“锋位、速度、压力”三项中实际改变的一项。三次练习后选差异最明显的一条，与范字并排说明下一遍只改什么。',
    }),
  },
  'calligraphy:硬笔的力度与速度': {
    contentStatus: 'reviewed',
    steps: appendBodies(PRIORITY_EXPANSION_CURATED_PLANS['calligraphy:硬笔的力度与速度'], {
      '先区分压力与速度':
        '用同一种笔在同一种纸上画两厘米横线，A 组只增加压力，B 组只提高速度，C 组保持两者不变；比较线条粗细、墨色、边缘和手部疲劳。若三者同时变化，无法判断抖动来自压力、速度还是握笔，下一组必须只改一个变量。',
      '让速度服务结构':
        '例如写长横时用较慢速度保留起收，转折处停顿约 0.2 秒再换方向，点画末端不反复描补；快速写“三、十、川”时观察哪一处开始失控。速度要与笔画任务绑定，完成后用同样字距、字格和笔再写一组，比较稳定性而不是只看完成时间。',
      '检查手指、手腕与肩':
        '用侧面照片和五次短线记录同时检查：手指是否发白、虎口是否塌陷、肩是否耸起、手腕是否悬空。只改一个身体变量后重写同一条线，比较抖动次数和末端位置；若调整姿势后仍抖，再检查笔尖磨损、纸张摩擦和速度。',
      '做一次单变量对照':
        '例如 A 组保持原速，B 组只在转折处减速，字、纸、笔和坐姿不变；每组写六遍，统计抖动次数、起收偏差和完成时间，并圈出最稳定与最失控各一条。若 B 组只是更慢却边缘更乱，说明问题不在速度，需回查握笔和压力。',
    }),
  },
  'memory:工作记忆的容量限制': {
    contentStatus: 'reviewed',
    steps: appendBodies(ADVANCED_FOUNDATIONS_CURATED_PLANS['memory:工作记忆的容量限制'], {
      '先测一次同时处理':
        '用同一组字母和步骤做两次：A 组同时心算与记忆，B 组把步骤写在纸上；记录正确数、漏项位置和恢复任务所需时间。若 B 组明显更稳，说明限制来自同时维持的信息量，不是“脑子笨”，下一步应减少并行任务而不是延长硬撑时间。',
      '把零散信息变成组块':
        '例如把十二个随机字母分成三组各四个，再给每组一个有意义的短词；记录分组前后的正确数和回忆时间。若为了记分组规则又多背三句口诀，测试会显示负荷没有下降，说明组块必须调用已有知识，不能增加新的同时维持项。',
    }),
  },
  'memory:注意力不是意志力': {
    contentStatus: 'reviewed',
    steps: appendBodies(FOUNDATIONS_CURATED_PLANS['memory:注意力不是意志力'], {
      '先测一次分心，而不是先责怪自己':
        '准备纸笔做六十秒词表复述，每次视线离开、手碰手机或思绪跳到别处就在旁栏画一道线，并记录恢复所需时间。结束后不要先评价“专心不专心”，而要找出最常见触发点；若切换集中在通知、查词或任务过难，就分别用环境隔离、延后记录和拆小目标处理。',
    }),
  },
  'memory:提取练习为什么比重读有效': {
    contentStatus: 'reviewed',
    steps: appendBodies(PRIORITY_EXPANSION_CURATED_PLANS['memory:提取练习为什么比重读有效'], {
      '把熟悉感和可提取性分开':
        '做一次对照：先重读一段材料并给熟悉度打一到五分，再合上材料用自己的话写出三个要点；比较熟悉度与正确提取数。若评分很高但写不出结构和例子，说明材料在眼前带来的流畅感不能代替检索，下一轮应先提问再看原文。',
      '先关材料再回答':
        '例如读“光合作用”后合上书回答：光反应在哪里发生、能量如何转成 ATP 和 NADPH、暗反应输入输出是什么；先写关键词和箭头，再看材料补漏。答案不必一次完整，但必须由自己生成，随后用另一种颜色标出想不起、记错和表述不清三类问题。',
      '用错误类型决定下一步':
        '若完全想不起“工作记忆容量”，先补意义线索和典型例子；若把“相关”说成“因果”，则要比较两个案例和方向条件；若知道答案却说不清，改用三步提纲复述。为每类错误写一个不同动作，下一次只针对最常出现的类型练习，避免所有错误都靠重读解决。',
      '用数据复盘方法效果':
        '例如首次测试十题答对六题且需要四次提示，隔天答对七题、提示降到两次，说明检索路径在改善；若正确数没变但开放题表达更完整，也要记录。只有选择题正确率高、开放题仍空白时，应增加无提示解释和应用题，不能只看一个分数。',
    }),
  },
  'thinking:相关不等于因果': {
    contentStatus: 'reviewed',
    steps: appendBodies(ADVANCED_FOUNDATIONS_CURATED_PLANS['thinking:相关不等于因果'], {
      '先把相关写成变量关系':
        '例如把“冰淇淋销量高时溺水多”写成两个时间序列，明确销量单位、溺水人数、统计地区和时间粒度；再检查是否按天、按月或按夏季汇总。没有这些条件，“相关”无法比较，也无法判断共同的高温、假期或人口变化是否在背后起作用。',
      '检查方向是否可能反转':
        '例如“运动多的人更健康”也可能反过来由健康的人更能运动，或由年龄、收入同时影响两者。至少写出 A→B、B→A、C→A 且 C→B 三个箭头，再说明哪项时间顺序或干预数据能区分它们；只看到同向变化不能给箭头定方向。',
      '检查选择和测量偏差':
        '例如只调查健身房会员，会使运动与健康的关系被选择偏差放大；用不同设备记录步数，也可能让某类人更容易被计入。先画样本进入、变量测量和缺失数据的流程，再问哪个环节会让相关变强或变弱，不能只盯最终系数。',
      '写一条可检验的因果假设':
        '例如写成“若增加学习时间导致成绩提高，那么在控制原有基础和作业完成度后，先增加时间的学生应在一周后看到更大提升；若未增加时间的对照组也同步提升，假设就受削弱”。同时写清变量、时间窗、控制条件和可能反例，主张才可检验。',
    }),
  },
  'thinking:证据强度与结论强度': {
    contentStatus: 'reviewed',
    steps: appendBodies(ADVANCED2_FOUNDATIONS_CURATED_PLANS['thinking:证据强度与结论强度'], {
      '先看证据与主张有多近':
        '例如“某方法提高记忆”若证据只测了再认速度，却主张长期自由回忆，测量对象和结果指标都未对齐；再权威的来源也只能支持它实际测到的内容。把主张拆成对象、干预、对照、结果和时间五项，再逐项追问证据是否覆盖。',
      '让结论降级到证据边界':
        '例如证据只来自二十名志愿者、两周前后测，就应写成“在该小样本和短期内可能改善，长期与不同人群效果未知”，不能写成“人人有效”。同时给出下一步需要更大样本、对照和延迟测试，结论的每个限定词都要对应证据缺口。',
    }),
  },
  'thinking:事实与观点的分界': {
    contentStatus: 'reviewed',
    steps: appendBodies(FOUNDATIONS_CURATED_PLANS['thinking:事实与观点的分界'], {
      '给事实主张加验证条件':
        '例如把“系统很慢”改写为“在当前数据量下，商品列表首次加载中位耗时八秒，超过团队设定的两秒目标”，对象、指标、条件和阈值就清楚了。若没有阈值，只能报告耗时事实，不能直接推出“不可接受”，评价标准要另写。',
      '把评价还原为价值标准':
        '例如“方案不好”可能依据成本、风险、公平或维护难度；分别写成“若总成本超过预算 20% 则不可接受”或“若迁移导致停服超过三十分钟则风险过高”。标准明确后，再用数据核对事实，讨论不同标准冲突时为什么选择当前优先级。',
    }),
  },
  'thinking:隐藏假设怎么找': {
    contentStatus: 'reviewed',
    steps: appendBodies(PRIORITY_EXPANSION_CURATED_PLANS['thinking:隐藏假设怎么找'], {
      '先标结论和理由':
        '例如句子“这个应用很受欢迎，所以它更有效”，应先圈出结论“更有效”和支持理由“很受欢迎”，再把“用户多”从评价词里剥离。只有结构化复原后，才能检查“受欢迎”是否真的能推出学习效果，而不是把作者的语气或例子当成理由。',
      '寻找理由到结论的缺口':
        '例如要由“受欢迎”推出“有效”，至少需要“使用者确实持续使用”和“使用带来可测学习提升”两座桥。逐条问如果理由为真而桥梁为假，结论是否仍成立；若仍成立，说明它只是背景而不是必要假设，不应全部塞进批评清单。',
      '删掉不必要假设':
        '例如“应用有效所以学生成绩会提高”的必要假设可能是学生真的使用、使用时长足够且测试测量同一能力；若这些条件不成立，论证就失去支持。给每个候选假设写一个反例和观察指标，再删掉无法改变结论支持的背景陈述。',
      '把假设转成验证问题':
        '例如把“受欢迎因为有效”改成三个可查问题：用户三十天留存多少、学习前后同一测试提高多少、未使用者是否也同步提高。为每项写样本、时间窗和可能的替代解释，问题才不是把原句改写成问号，而是能产生支持或反驳的数据。',
      '给出有保留的评价':
        '例如结论可写“现有小样本结果提示可能有效，但依赖持续使用和测试同一能力两个假设；若独立样本不能复现，置信度应下降”。评价分成支持度、关键假设、反例和下一步证据四栏，避免只说“有道理”却没有可执行的调查方向。',
    }),
  },
} satisfies CuratedCoursePlanPatchMap;

export const FOUNDATION_REVIEW_QUALITY_PATCHES = {
  ...STATUS_PATCHES,
  ...REWRITTEN_PATCHES,
} satisfies CuratedCoursePlanPatchMap;
