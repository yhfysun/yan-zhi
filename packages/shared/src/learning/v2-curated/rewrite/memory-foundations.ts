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

const ATTENTION_ARCHIVE = {
  id: 'attention-capacity-experiments',
  kind: 'experiment',
  title: '从过滤瓶颈到切换成本：注意研究如何测量',
  period: '1958—2006',
  summary:
    '注意研究没有把分心简单归因于意志薄弱，而是通过选择、负荷、切换和多任务实验测量有限资源怎样分配。',
  background:
    '人同时面对声音、文字、通知和内部念头时，并非所有信息都以相同方式进入加工。实验通过控制干扰、任务难度和切换频率，比较正确率、反应时与遗漏。',
  timeline: [
    {
      date: '1958',
      title: '过滤器模型提出选择瓶颈',
      body: 'Broadbent 用双耳分听任务研究注意选择。参与者被要求复述一只耳朵的信息时，对另一耳只保留声音特征而难以报告语义内容，说明早期选择会限制进入更深加工的信息。',
      sourceIds: ['broadbent-1958', 'noba-attention'],
    },
    {
      date: '1964',
      title: '未注意信息并非完全消失',
      body: 'Treisman 的注意衰减观点指出，未被选择的通道并非被完全截断，而是信号减弱。自己的名字等信息仍可能被察觉，提示选择更像权重分配而非一道绝对闸门。',
      sourceIds: ['noba-attention'],
    },
    {
      date: '1973',
      title: '容量模型强调资源分配',
      body: 'Kahneman 将注意描述为有限容量资源，任务越复杂、越需要控制，占用的资源越多。该框架解释了为何高负荷任务下的分心更明显，也提醒不能只责备主观意愿。',
      sourceIds: ['noba-attention'],
    },
    {
      date: '1995',
      title: '知觉负荷改变干扰效应',
      body: 'Lavie 的负荷实验比较低负荷与高负荷搜索任务，发现任务本身占用较多知觉资源时，无关刺激造成的影响反而减弱。干扰大小取决于主任务负荷与选择设置，而不是单一性格指标。',
      sourceIds: ['lavie-1995', 'noba-attention'],
    },
    {
      date: '2001',
      title: '执行控制与冲突被分开测量',
      body: '注意实验逐渐区分警觉、定向与执行控制，并用反应时差值衡量冲突解决。此类指标可观察、可重复，但不能直接等同于日常自控力或道德评价。',
      sourceIds: ['noba-attention'],
    },
    {
      date: '2006',
      title: '任务切换显示多任务成本',
      body: '美国心理学会关于多任务的研究概述指出，在任务间切换会消耗时间并增加错误。边写边回复消息并非两件事完全并行，而是反复重配目标并承担切换代价。',
      sourceIds: ['apa-multitasking'],
    },
  ],
  outcome:
    '注意可以通过干扰条件、主任务负荷、切换次数、错误率和反应时来测量。环境设计与任务拆分能改变表现，但不能承诺永久提升智力或消除所有分心。',
  significance:
    '这一证据链把“管住自己”改写成“识别资源冲突并改造条件”，使训练能够比较前后测，而不是只凭努力感下结论。',
  sourceCards: [
    source(
      'noba-attention',
      'Attention',
      'Noba Project',
      '2025 年访问版',
      'https://nobaproject.com/modules/attention',
      '核对选择性注意、容量限制、负荷与注意控制的公开概述。',
    ),
    source(
      'broadbent-1958',
      'Perception and Communication',
      'Donald E. Broadbent',
      '1958',
      'https://doi.org/10.1037/10037-000',
      '核对早期选择与双耳分听研究的理论背景。',
    ),
    source(
      'lavie-1995',
      'Perceptual Load as a Necessary Condition for Selective Attention',
      'Nilli Lavie, Journal of Experimental Psychology',
      '1995',
      'https://doi.org/10.1037/0096-1523.21.3.451',
      '核对知觉负荷实验及无关刺激干扰的条件。',
    ),
    source(
      'apa-multitasking',
      'Multitasking: Switching Costs',
      'American Psychological Association',
      '2006',
      'https://www.apa.org/topics/research/multitasking',
      '核对任务切换造成时间损失和错误增加的研究概述。',
    ),
  ],
} satisfies LearningV2EventDetail;

const WORKING_MEMORY_ARCHIVE = {
  id: 'working-memory-capacity-measurement',
  kind: 'experiment',
  title: '容量数字如何从 7±2 修正到约 4 个组块',
  period: '1956—2010',
  summary:
    '工作记忆容量不是一个所有人共享的固定硬盘。测量会受到材料、复述策略、组块方式、任务难度和年龄影响，所以训练重点是管理负荷而不是宣称扩容。',
  background:
    '早期研究用即时回忆估计短时记忆跨度，后续研究加入加工任务、干扰与组块控制，逐渐区分单纯保持、注意焦点和复杂工作记忆。',
  timeline: [
    {
      date: '1956',
      title: '短时记忆跨度被系统化',
      body: 'Miller 总结即时回忆与绝对判断研究，用“七加减二”概括有限容量。这个数字后来常被误读为所有任务、所有年龄都固定不变，实际上材料与策略会显著改变表现。',
      sourceIds: ['miller-1956'],
    },
    {
      date: '1974',
      title: '工作记忆被拆成多成分系统',
      body: 'Baddeley 与 Hitch 提出工作记忆不仅暂存信息，还参与加工。中央执行、语音回路与视空间成分承担不同负荷，任务同时要求保持和计算时更容易出现错误。',
      sourceIds: ['baddeley-hitch-1974'],
    },
    {
      date: '1980s',
      title: '组块降低单位数量',
      body: '组块研究显示，多个元素可以被已有知识组织成一个单位。电话号码分成区号与局部号码后较易保持，但组块依赖熟悉结构，陌生材料不能只靠“多想几个块”自动完成。',
      sourceIds: ['national-academies-how-people-learn'],
    },
    {
      date: '2001',
      title: '注意焦点估计约为四个组块',
      body: 'Cowan 在控制复述与组块策略后，综合多项实验认为成人注意焦点通常约为四个组块。该结果描述实验条件下的容量范围，不是日常学习只能记四件事的绝对上限。',
      sourceIds: ['cowan-2001'],
    },
    {
      date: '2005',
      title: '复杂跨度任务分离保持与加工',
      body: '阅读跨度、操作跨度等任务让参与者一边加工材料一边记住目标项。正确率下降既可能来自容量限制，也可能来自策略、熟练度和任务切换，因此单一数字不能代表全部认知能力。',
      sourceIds: ['cowan-2001', 'national-academies-how-people-learn'],
    },
    {
      date: '2010',
      title: '容量限制的解释被继续比较',
      body: 'Cowan 比较注意焦点、时间衰减和干扰解释，强调容量受多种机制共同约束。训练应通过分段、外部记录与降低无关负荷改善任务表现，而不是承诺把神经容量永久扩大。',
      sourceIds: ['cowan-2010'],
    },
  ],
  outcome:
    '可观察的训练结果是同样材料在分段、组块和减少负荷后获得更高序列正确率；延迟迁移仍需单独测量。短期任务进步不能自动解释为工作记忆容量永久增加。',
  significance:
    '这一修正过程说明容量教学必须写清任务条件。把“7±2”当定律会造成错误预期，把“4 个组块”当死限也会忽略专业知识与外部工具的作用。',
  sourceCards: [
    source(
      'miller-1956',
      'The Magical Number Seven, Plus or Minus Two',
      'George A. Miller, Psychological Review',
      '1956',
      'https://doi.org/10.1037/h0043158',
      '核对早期短时记忆容量概括及其任务背景。',
    ),
    source(
      'baddeley-hitch-1974',
      'Working Memory',
      'Alan D. Baddeley & Graham Hitch',
      '1974',
      'https://doi.org/10.1016/S0079-7421(08)60452-1',
      '核对工作记忆多成分模型与同时保持、加工任务。',
    ),
    source(
      'cowan-2001',
      'The Magical Number 4 in Short-Term Memory',
      'Nelson Cowan, Behavioral and Brain Sciences',
      '2001',
      'https://doi.org/10.1017/S0140525X01003922',
      '核对控制策略后约四个组块的容量估计。',
    ),
    source(
      'cowan-2010',
      'The Magical Mystery Four: How Is Working Memory Capacity Limited, and Why?',
      'Nelson Cowan, Current Directions in Psychological Science',
      '2010',
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC2864034/',
      '核对容量限制的竞争性解释和实验边界。',
    ),
    source(
      'national-academies-how-people-learn',
      'How People Learn: Brain, Mind, Experience, and School',
      'National Academies Press',
      '2000',
      'https://nap.nationalacademies.org/catalog/9853/how-people-learn-brain-mind-experience-and-school',
      '核对组块、先前知识与学习环境的教学含义。',
    ),
  ],
} satisfies LearningV2EventDetail;

const ENCODING_ARCHIVE = {
  id: 'encoding-specificity-experiments',
  kind: 'experiment',
  title: '从加工深度到编码特异性：线索怎样决定提取',
  period: '1972—1979',
  summary:
    '编码不是把文字原样复印进头脑。是否加工意义、材料之间是否可区分、学习与测试是否匹配，都会改变之后能否提取。',
  background:
    '记忆实验常控制每个词呈现时间与加工问题，再比较自由回忆或线索回忆。若只看熟悉感和重读流畅度，容易高估真正可提取的知识。',
  timeline: [
    {
      date: '1972',
      title: '加工深度框架提出',
      body: 'Craik 与 Lockhart 区分表面形式加工和较深的意义加工，提出保持效果取决于编码操作而非只由时间决定。该框架促使研究从“看多久”转向“怎样加工”。',
      sourceIds: ['craik-lockhart-1972', 'noba-memory'],
    },
    {
      date: '1975',
      title: '语义问题提高后续回忆',
      body: 'Craik 与 Tulving 让参与者判断词的字体、押韵或是否适合句子，再意外测试记忆。意义判断通常带来更好的保持，说明编码问题的操作会改变可提取信息。',
      sourceIds: ['craik-tulving-1975'],
    },
    {
      date: '1973',
      title: '编码特异性强调线索匹配',
      body: 'Tulving 与 Thomson 发现，测试时提供的线索若与学习时编码方式匹配，回忆会明显改变。材料“在脑内”不等于能在任意线索下取出，线索与编码必须建立联系。',
      sourceIds: ['tulving-thomson-1973'],
    },
    {
      date: '1977',
      title: '迁移适当加工修正“越深越好”',
      body: 'Morris 等研究表明，押韵加工在押韵测试中可能优于语义加工。所谓有效编码要结合最终任务，不能把某一类深加工机械套到所有考试与应用场景。',
      sourceIds: ['morris-1977'],
    },
    {
      date: '1979',
      title: '精细加工与可区分性受到重视',
      body: '研究逐渐强调材料与已有知识之间的独特联系。只是重复同一句话会增加熟悉感，却未必形成区别于其他项目的提取路径，因此精细加工必须产生具体差异。',
      sourceIds: ['noba-memory', 'craik-lockhart-1972'],
    },
    {
      date: '2006',
      title: '提取条件再次被纳入闭环',
      body: 'Roediger 与 Karpicke 的测试效应研究显示，学习后的主动提取会改变长期保持。编码设计因此不能停在制作漂亮笔记，还要用延迟问题和迁移任务检查线索是否有效。',
      sourceIds: ['roediger-karpicke-2006'],
    },
  ],
  outcome:
    '有效编码通常包含意义联系、独特区别和与测试任务匹配的线索。主观熟悉、排版精美或重复次数不能单独证明长期可提取。',
  significance:
    '这一证据链让编码训练从“把笔记做厚”转为“形成可区分、可检索、能迁移的线索”，并保留任务不匹配时的失败边界。',
  sourceCards: [
    source(
      'noba-memory',
      'Memory (Encoding, Storage, Retrieval)',
      'Noba Project',
      '2025 年访问版',
      'https://nobaproject.com/modules/memory-encoding-storage-retrieval',
      '核对编码、储存、提取与线索的公开教学概述。',
    ),
    source(
      'craik-lockhart-1972',
      'Levels of Processing: A Framework for Memory Research',
      'Fergus I. M. Craik & Robert S. Lockhart',
      '1972',
      'https://doi.org/10.1016/S0022-5371(72)80001-X',
      '核对加工深度框架和编码操作对保持的影响。',
    ),
    source(
      'craik-tulving-1975',
      'Depth of Processing and the Retention of Words in Episodic Memory',
      'Fergus I. M. Craik & Endel Tulving',
      '1975',
      'https://psycnet.apa.org/doiLanding?doi=10.1037/0096-3445.104.3.268',
      '核对字体、押韵与语义判断任务的经典实验。',
    ),
    source(
      'tulving-thomson-1973',
      'Encoding Specificity and Retrieval Processes in Episodic Memory',
      'Endel Tulving & Donald M. Thomson',
      '1973',
      'https://doi.org/10.1016/S0022-5371(73)80014-3',
      '核对编码与提取线索匹配的实验证据。',
    ),
    source(
      'morris-1977',
      'Levels of Processing versus Transfer Appropriate Processing',
      'C. D. Morris, J. D. Bransford & J. J. Franks',
      '1977',
      'https://doi.org/10.1016/S0022-5371(77)80016-9',
      '核对加工方式与测试任务匹配对成绩的影响。',
    ),
    source(
      'roediger-karpicke-2006',
      'Test-Enhanced Learning: Taking Memory Tests Improves Long-Term Retention',
      'Henry L. Roediger III & Jeffrey D. Karpicke',
      '2006',
      'https://doi.org/10.1111/j.1467-9280.2006.01693.x',
      '核对主动提取对延迟保持的作用。',
    ),
  ],
} satisfies LearningV2EventDetail;

const RETRIEVAL_ARCHIVE = {
  id: 'retrieval-practice-experiments',
  kind: 'experiment',
  title: '测试效应：为什么重读后的熟悉感并不可靠',
  period: '1900—2017',
  summary:
    '主动提取会暴露缺口并强化检索路径。它通常优于等时重读，但需要反馈、间隔和迁移任务配合；失败提取若没有纠正，也可能留下错误。',
  background:
    '学习研究常比较重读、概念图和闭卷回忆。若只看学习当时的流畅感，重读常显得更舒服；延迟测试则更能区分短期熟悉与长期保持。',
  timeline: [
    {
      date: '1900',
      title: '早期实验已观察测试效应',
      body: 'Abbott 在教育心理学实验中比较复述与回忆条件，发现主动回忆可改善后续保持。早期研究虽方法有限，却已提出“测试也是学习事件”的问题。',
      sourceIds: ['dunlosky-2013'],
    },
    {
      date: '2006',
      title: '延迟测试揭示重读错觉',
      body: 'Roediger 与 Karpicke 让参与者学习文章后重读或做回忆测试，再在短延迟和一周后测。重复学习在短延迟看似有利，但测试条件在长期保持上更有优势。',
      sourceIds: ['roediger-karpicke-2006', 'learning-scientists-retrieval'],
    },
    {
      date: '2008',
      title: '提取本身被证明关键',
      body: 'Karpicke 与 Roediger 比较重复学习与重复提取，结果显示反复尝试提取对后续保持贡献更大。仅增加接触次数，不能替代从记忆中重新生成答案。',
      sourceIds: ['karpicke-roediger-2008'],
    },
    {
      date: '2013',
      title: '有效学习技术综述区分练习条件',
      body: 'Dunlosky 等综述多项技术，认为练习测试具有较高效用证据，但效果受材料、反馈、间隔和问题形式影响。方法被推荐不等于任意小测都能自动产生长期学习。',
      sourceIds: ['dunlosky-2013'],
    },
    {
      date: '2017',
      title: '元分析比较练习测试的整体效应',
      body: 'Adesope 等汇总实践测试研究，发现相比重读等条件，练习测试通常带来更好的保持与迁移。汇总效应仍不能抹去个体任务差异，也不支持把测试当作惩罚工具。',
      sourceIds: ['adesope-2017'],
    },
    {
      date: '2020s',
      title: '反馈与间隔进入完整复习闭环',
      body: '教学实践强调“尝试提取—核对反馈—再次提取—延迟复查”。无反馈的错误答案可能被重复巩固，间隔过长或过短也会改变复习收益，因此需要记录错误与日期。',
      sourceIds: ['learning-scientists-retrieval', 'dunlosky-2013'],
    },
  ],
  outcome:
    '提取练习的有效结果应同时报告即时表现、延迟保持和迁移。若闭卷回忆后没有核对反馈，正确率提高可能包含猜测或错误巩固，不能直接视为学习成功。',
  significance:
    '这一链条把测试从评价工具变成学习工具，同时限定其条件：先尝试、后反馈、再间隔复习，并用新材料检验迁移。',
  sourceCards: [
    source(
      'roediger-karpicke-2006',
      'Test-Enhanced Learning: Taking Memory Tests Improves Long-Term Retention',
      'Henry L. Roediger III & Jeffrey D. Karpicke',
      '2006',
      'https://doi.org/10.1111/j.1467-9280.2006.01693.x',
      '核对重读与回忆测试在延迟保持上的比较。',
    ),
    source(
      'karpicke-roediger-2008',
      'The Critical Importance of Retrieval for Learning',
      'Jeffrey D. Karpicke & Henry L. Roediger III, Science',
      '2008',
      'https://doi.org/10.1126/science.1152408',
      '核对重复提取与重复学习对长期保持的差异。',
    ),
    source(
      'dunlosky-2013',
      'Improving Students’ Learning With Effective Learning Techniques',
      'John Dunlosky et al., Psychological Science in the Public Interest',
      '2013',
      'https://doi.org/10.1177/1529100612453266',
      '核对练习测试的证据等级、条件和教育应用边界。',
    ),
    source(
      'adesope-2017',
      'Rethinking the Use of Tests: A Meta-Analysis of Practice Testing',
      'Olusola O. Adesope, Dominic A. Trevisan & Narayan K. Sundararajan',
      '2017',
      'https://doi.org/10.3102/0034654316689306',
      '核对实践测试对保持和迁移的元分析结果。',
    ),
    source(
      'learning-scientists-retrieval',
      'Retrieval Practice',
      'The Learning Scientists',
      '2025 年访问版',
      'https://www.learningscientists.org/retrieval-practice',
      '核对先提取、后反馈与间隔复习的教学实施建议。',
    ),
  ],
} satisfies LearningV2EventDetail;

const ATTENTION_SOURCES = [
  'Noba Project, Attention。注意选择、负荷与容量概述。https://nobaproject.com/modules/attention',
  'American Psychological Association, Multitasking: Switching Costs。任务切换成本研究概述。https://www.apa.org/topics/research/multitasking',
  'Nilli Lavie, Perceptual Load as a Necessary Condition for Selective Attention, 1995。https://doi.org/10.1037/0096-1523.21.3.451',
  'OpenStax, Psychology 2e, 8.1 How Memory Functions。注意与记忆加工的开放教材。https://openstax.org/books/psychology-2e/pages/8-1-how-memory-functions',
];

const WORKING_MEMORY_SOURCES = [
  'Nelson Cowan, The Magical Mystery Four, 2010。工作记忆容量限制与解释。https://pmc.ncbi.nlm.nih.gov/articles/PMC2864034/',
  'Nelson Cowan, The Magical Number 4 in Short-Term Memory, 2001。https://doi.org/10.1017/S0140525X01003922',
  'George A. Miller, The Magical Number Seven, Plus or Minus Two, 1956。https://doi.org/10.1037/h0043158',
  'National Academies, How People Learn。组块、先前知识与学习环境。https://nap.nationalacademies.org/catalog/9853/how-people-learn-brain-mind-experience-and-school',
];

const ENCODING_SOURCES = [
  'Noba Project, Memory (Encoding, Storage, Retrieval)。https://nobaproject.com/modules/memory-encoding-storage-retrieval',
  'Fergus I. M. Craik & Robert S. Lockhart, Levels of Processing, 1972。https://doi.org/10.1016/S0022-5371(72)80001-X',
  'Fergus I. M. Craik & Endel Tulving, Depth of Processing and Retention, 1975。https://psycnet.apa.org/doiLanding?doi=10.1037/0096-3445.104.3.268',
  'Endel Tulving & Donald M. Thomson, Encoding Specificity, 1973。https://doi.org/10.1016/S0022-5371(73)80014-3',
];

const RETRIEVAL_SOURCES = [
  'The Learning Scientists, Retrieval Practice。先提取、反馈与间隔实施建议。https://www.learningscientists.org/retrieval-practice',
  'Henry L. Roediger III & Jeffrey D. Karpicke, Test-Enhanced Learning, 2006。https://doi.org/10.1111/j.1467-9280.2006.01693.x',
  'Jeffrey D. Karpicke & Henry L. Roediger III, The Critical Importance of Retrieval for Learning, 2008。https://doi.org/10.1126/science.1152408',
  'John Dunlosky et al., Improving Students’ Learning With Effective Learning Techniques, 2013。https://doi.org/10.1177/1529100612453266',
];

export const MEMORY_FOUNDATIONS_REWRITE: CuratedCoursePlanPatchMap = {
  'memory:注意力不是意志力': {
    contentStatus: 'reviewed',
    prerequisite: '无先修要求；准备同一篇 300 字材料、计时器、纸笔和可关闭的通知设备。',
    plainLanguageGoal:
      '学完后，你能用前测、干扰条件和切换次数比较两种注意环境，并用正确率、错误位置和延迟复查判断改变是否有效。',
    guidedPractice:
      '用两篇难度相近的 300 字材料，分别在有可见通知和通知离屏两种条件下阅读 12 分钟，记录切换次数、要点题得分和完成时间。',
    independentPractice:
      '连续三天选择三个真实任务，各比较一次原环境与改造环境，保留任务单、干扰记录、前后测成绩和 24 小时后的内容回忆。',
    commonErrors: [
      '把一次分心解释为意志薄弱，没有记录通知、任务负荷、疲劳和切换次数。',
      '同时改动手机位置、任务时长和材料难度，结果无法判断哪一个条件起作用。',
      '只凭“今天更专注”评价，未设置前测、后测和延迟复查。',
    ],
    sourceRefs: ATTENTION_SOURCES,
    studyPoints: [
      point('必背', '注意是有限资源；分心要同时看任务负荷、干扰显著性和切换成本，不能只用意志力解释。', 1),
      point('重点', '比较注意环境时必须固定材料、时长和目标，只改变一个干扰条件。', 3),
      point('易错', '更安静不一定更好；难度过高或任务不清也会造成停顿，需要区分负荷问题与干扰问题。', 4),
    ],
    eventDetails: [ATTENTION_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜为什么越提醒自己专注越容易切走',
        body:
          '同一个人安静读书时可能持续二十分钟，边写报告边把手机放在视线内时却频繁切走。差异不只在决心，还在通知显著性、任务复杂度、目标清晰度和切换后的重新进入成本。先做十分钟前测：阅读一篇三百字材料并回答三个要点题，记录实际切换次数、完成时间、答对数和最常出现的干扰。把干扰分为外部提醒、内部念头和任务受阻三类，再选择一个能在后测中重复的环境变量。',
        note: '先记录切换，不先评价自控。',
        objective: '能用切换次数、完成时间、要点得分和干扰来源诊断一次注意失败。',
        practice: '完成十分钟阅读前测，列出每次切换发生在哪一句、由什么触发、恢复用了多久。',
        checkpoint: '检查是否记录三类干扰，是否固定材料与时长，是否用可重复分数而非“感觉不错”描述。',
      },
      {
        title: '材料与概念｜选择性注意、负荷与切换成本',
        body:
          '选择性注意是在多个刺激或目标之间分配加工资源的过程。相关线索、任务目标、刺激显著性和既有习惯都会改变选择结果。任务切换研究提示，两件事快速交替时会产生重新配置成本，表现为时间增加、遗漏和错误上升。主任务负荷也重要：如果工作记忆被步骤、格式和陌生概念占满，更容易被无关信息拉走。注意训练的目标不是让大脑永远警觉，而是识别资源竞争，设置清晰目标、减少无关负荷、安置提醒，并测量干预前后的差别。',
        note: '注意问题先看任务结构。',
        objective: '能区分选择性注意、任务负荷、干扰显著性和切换成本四个解释层。',
        practice: '为一次真实分心制作四列表：发生时刻、主任务负荷、外部干扰、切换代价。',
        checkpoint: '检查是否把分心全部归因于意志，是否给出任务、刺激和切换三类证据。',
      },
      {
        title: '示范与推导｜从一次切走推到可测量干预',
        body:
          '假设阅读时每两分钟查看一次消息。先不增加“必须专注”的要求，而是记录切换前最后一句、消息位置和恢复后是否重读。若消息可见时切换多，隐藏通知是合理干预；若任务生词过多时切换多，应先降负荷；若切换后反复回读，则切换成本是主要指标。示范写出推导链：触发—注意转移—重新定位—遗漏或回读—得分变化。然后固定材料、时长和题目，只把通知从视线内移到视线外，比较切换、用时和要点正确率，避免一次改动多个条件。',
        note: '每次只验证一个条件。',
        objective: '能把分心事件转成条件、机制、指标和单变量干预的完整推导。',
        practice: '为一个分心样本写出五个推导节点，并设计只改通知位置的前后测方案。',
        checkpoint: '检查是否说明替代解释，是否固定任务，是否预测切换成本和成绩如何变化。',
      },
      {
        title: '引导练习｜同一难度材料的两条件对照',
        body:
          '准备两篇长度、题型和难度相近的三百字材料。条件 A 把手机通知设为可见，条件 B 把设备放到视线外并把下一步动作写在纸上。两种条件各阅读十二分钟，完成后立即回答同一结构的三个要点题。记录切换次数、首次切换时间、重读句子数、答对数和主观努力。为减少顺序效应，第二天交换材料与条件再测一次。比较时先看两篇材料是否等难，再看切换和正确率是否同向变化；若只有主观努力下降而成绩不变，不能宣称学习已经提升。',
        note: '顺序要交换，材料要等难。',
        objective: '能在控制材料与时长后比较一种注意环境改造的可观察效果。',
        practice: '完成两条件对照表，列出切换次数、重读数、要点得分、用时和交换顺序后的复测。',
        checkpoint: '检查是否只改一个变量，是否交换顺序，是否同时报告错误、速度和努力感。',
      },
      {
        title: '独立迁移与评价｜把注意改造带进真实任务',
        body:
          '连续三天各选一个真实任务，例如读教材、整理会议记录或做练习。每次先完成十五分钟原环境前测，再完成同等难度的改造环境后测，并在二十四小时后回忆三个关键结论。评价标准有四项：任务和材料可比较，切换与错误有计数，后测不是只凭熟悉感，延迟复查仍能说明内容。最后写一条适用边界，例如“通知离屏对低负荷抄写帮助有限，对需要连续推理的任务更值得使用”，并保留一次没有改善的反例，防止把方法包装成万能专注术。',
        note: '延迟回忆与反例都要保留。',
        objective: '能在三个真实任务中验证注意环境改造，并说明适用条件与失败边界。',
        practice: '提交三次前后测记录、24 小时回忆、四项评价和一条不能套用的任务类型。',
        checkpoint: '四项自评：条件可比、指标完整、延迟有效、边界清楚；任一项缺失需重做对照。',
      },
    ],
    quiz: [
      question(
        '本课所说的注意训练，首先应改变什么？',
        '识别任务负荷与干扰条件，并用前后测比较一种环境调整',
        ['要求自己永远不分心', '把每项任务都延长到一小时', '只看学习时的流畅感'],
        0,
        '注意表现受任务结构、刺激显著性和切换成本共同影响。先记录条件再改动一个变量，才能判断调整是否真的改善结果；材料、时长或题目同时变化时不能归因。',
        '事实与定义',
      ),
      question(
        '一个人在消息可见时切换更多，但题目得分没有下降，最合理的结论是什么？',
        '切换成本已出现，但当前测试太容易，尚未测到成绩差异',
        ['说明分心完全不会影响学习', '证明意志力已经提高', '可以直接宣称长期记忆增强'],
        1,
        '切换次数增加说明行为成本存在，得分不变可能来自天花板效应或题目难度不足。需要提高材料难度或加入延迟测试再判断，不能反过来宣称分心没有代价。',
        '材料与推导',
      ),
      question(
        '哪一种做法最可能让对照结果无法解释？',
        '同时换材料难度、任务时长、手机位置和测试题型',
        ['固定阅读材料与答题时间', '交换两种条件的先后顺序', '分别记录切换次数和正确率'],
        2,
        '同时改动多个条件后，结果差异无法归因。单变量对照和顺序交换才是可解释设计，其余选项都有助于降低混淆并保留重复测量。',
        '常见误区',
      ),
      question(
        '把本课方法迁移到会议记录时，最合适的评价组合是什么？',
        '原环境与改造环境各测一次，并记录切换、关键信息、重读和会后回查',
        ['只比较哪次会议更长', '只问自己是否更努力', '只看笔记页数是否更多'],
        0,
        '真实任务仍需可比较的前后测。切换、关键信息、重读和会后回查能同时反映注意分配与结果质量，还应记录一次没有改善的任务边界。',
        '迁移应用',
      ),
    ],
  },
  'memory:工作记忆的容量限制': {
    contentStatus: 'reviewed',
    prerequisite: '能使用计时器并记录序列答案；无需先修心理学课程。',
    plainLanguageGoal:
      '学完后，你能用序列正确率比较原始材料与组块材料的负荷差异，并解释为何短期表现改善不等于永久扩容。',
    guidedPractice:
      '用长度 8 的 12 组数字完成顺向回忆，再以每组 3–4 个数字进行组块呈现，记录项目正确率、顺序正确率和主观负荷。',
    independentPractice:
      '选一份真实术语表，把它分成 4 个有意义的语义组，比较原始顺序与组块版本在即时和 24 小时后的自由回忆。',
    commonErrors: [
      '把“七加减二”或“四个组块”当成所有人固定不变的绝对上限。',
      '把组块数量减少误认为信息已经长期掌握，省略延迟提取。',
      '组块没有意义联系，只是把长串随意切成等长片段。',
    ],
    sourceRefs: WORKING_MEMORY_SOURCES,
    studyPoints: [
      point('必背', '工作记忆容量有限且受材料、策略和任务条件影响；常见估计约为四个组块，不是全民固定硬盘。', 1),
      point('重点', '组块通过已有意义把多个元素合成较少单位，能降低即时负荷，但长期保持仍需提取练习。', 2),
      point('易错', '任意等长切分不一定形成组块；分段后序列正确率没有提高时，应检查联系是否真实可用。', 4),
    ],
    eventDetails: [WORKING_MEMORY_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜为什么十二个数字一听完就散了',
        body:
          '让朋友以每秒一个的速度朗读十二个无关数字，读完后立刻按顺序写出。多数人只能稳定报告其中一段，错误常集中在后半段或顺序交换。这个结果不能直接换算成智力，也不能证明“记性差”。先完成三组前测，分别记录写对的项目数、位置正确数和放弃前停留时间。再观察自己是否默念、分组或寻找数字联系；这些策略会改变实际占用的组块数。若题目同时要求计算，负荷还会继续上升，所以容量必须先写清材料与任务。',
        note: '先分清项目记住与顺序记住。',
        objective: '能用项目正确率和顺序正确率描述一次工作记忆前测，而不是只给笼统评价。',
        practice: '完成三组十二位数字的即时顺向回忆，逐位标出正确、遗漏和错序。',
        checkpoint: '检查是否记录呈现速度、材料类型、项目分和顺序分，是否说明是否允许复述。',
      },
      {
        title: '材料与概念｜容量、组块与认知负荷',
        body:
          '工作记忆是在短时间内保持并操作信息的有限系统。容量不是单一格子数，材料越熟悉、联系越清楚，越可能把多个元素组织成一个组块。早期“七加减二”来自特定即时回忆任务，后续控制复述和组块策略的研究常给出约四个组块的估计，但年龄、专业知识、呈现方式和测试要求都会改变结果。认知负荷可分为材料本身的关键负荷与表达混乱造成的无关负荷。分段、外部记录和熟悉结构能减少同时占用的单位，却不能自动把信息写入长期记忆。',
        note: '容量数字必须带任务条件。',
        objective: '能解释容量、组块、认知负荷与长期记忆之间的区别和联系。',
        practice: '用四列表比较原始数字串、有语义组块和同时计算三种条件的容量占用。',
        checkpoint: '检查是否把容量估计写成固定定律，是否说明熟悉度和任务要求的影响。',
      },
      {
        title: '示范与推导｜从一个长串推到四个意义组块',
        body:
          '以“138001380000”为例，逐位保持需要处理十二个项目，按“138—0013—80000”处理则变成三个较熟悉单位。组块有效的条件不是切得整齐，而是每个单位能被立即识别并在之后还原。示范先算原始单位数，再标出组块依据，最后设计同长度新材料检验是否仍有效。如果只在熟悉电话格式上成功，换成随机字母就失败，说明优势来自先前知识而非一般容量扩容。推导链应写成：材料结构—可用知识—组块数—序列正确率—延迟保持，并保留一个无法组块的反例。',
        note: '组块必须能还原。',
        objective: '能把一串材料拆成可解释的组块，并预测其即时与延迟表现。',
        practice: '为十二位数字、十二个单词和四个公式各写一种组块方案，并标注所需先前知识。',
        checkpoint: '检查组块是否有意义，是否能还原全部信息，是否说明陌生材料的失败条件。',
      },
      {
        title: '引导练习｜原始与组块序列的对照',
        body:
          '准备二十四组长度相同的数字，一半保持随机顺序，一半按有意义的日期、区号或熟悉序列组织。两种条件交替呈现，每组看完后立即按顺序写出并作为即时后测，十秒后再补写一次。记录项目正确率、完全正确序列数、最长正确连续段和主观负荷。不要在同一组中边看答案边修改，以免把提示误当容量。完成后先比较整体均值，再找出组块条件下仍失败的组，分析是否缺少必要知识或组块过长。',
        note: '组块材料也要防止泄题。',
        objective: '能用多项指标比较原始序列与组块序列的即时负荷差异。',
        practice: '完成 24 组序列回忆，填写两条件正确率、最长正确段、负荷评分和失败组说明。',
        checkpoint: '检查是否交替呈现，是否区分项目与顺序，是否记录组块所依赖的先前知识。',
      },
      {
        title: '独立迁移与评价｜从即时回忆走向真实术语',
        body:
          '选择当前正在学习的一份术语表，先按原始顺序学习十分钟并即时回忆；第二天用同等时间把术语分成四个有意义的语义组，再完成即时回忆和二十四小时自由回忆。评价看四项：组块联系是否能解释，即时顺序是否改善，延迟测试是否仍有效，能否在新例子中识别该组。最后写一条边界，例如“组块帮助我同时处理较少单位，但术语定义仍需通过提取和例子巩固”。短期表现变好不应直接写成工作记忆永久提升。',
        note: '即时改善与长期掌握分开报告。',
        objective: '能把组块策略迁移到真实术语学习，并用即时和延迟测试评价效果与边界。',
        practice: '提交原始与组块两版术语表、两次即时回忆、24 小时测试、四项评分和一条失败条件。',
        checkpoint: '四项自评：联系有意义、顺序可还原、延迟仍有效、边界不夸大；缺一项需补充证据。',
      },
    ],
    quiz: [
      question(
        '“约四个组块”这一研究估计最适合怎样表述？',
        '在控制复述和组块策略的若干实验条件下，成人注意焦点通常约为四个组块',
        ['所有人任何时候都只能记住四件事', '四分钟后所有短时记忆都会消失', '只要分成四组就能永久掌握'],
        0,
        '容量估计依赖材料、策略与测试条件。把它写成全民固定硬盘会忽略专业知识、年龄和任务差异，也无法解释为什么组块后表现会变化。',
        '事实与定义',
      ),
      question(
        '为什么相同十二个数字按三个熟悉单位排列后更容易回忆？',
        '组块利用已有知识减少了需要同时保持的单位数',
        ['数字数量在排列后自动减少', '工作记忆容量被永久扩大', '顺序信息不再需要保持'],
        1,
        '组块没有删除信息，而是借助熟悉结构把多个元素作为一个单位处理。顺序仍需保持，容量也没有因此永久改变，换材料后还要重新验证。',
        '材料与推导',
      ),
      question(
        '哪种结果最不能支持“组块策略有效”？',
        '熟悉电话号码格式改善，但换成随机字母后完全没有差异，仍宣称容量普遍提升',
        ['同类新材料仍保持较高序列正确率', '延迟测试仍能还原每组内容', '组块依据能由学习者解释'],
        2,
        '若优势只存在于熟悉格式，更合理的解释是先前知识而非普遍容量提升。需要新材料与延迟测试才能限定结论，成功组块也应能完整还原。',
        '常见误区',
      ),
      question(
        '把容量方法迁移到法律条文学习时，最完整的做法是什么？',
        '按要件组成意义单元，同时保留原文核对、即时回忆和延迟案例应用',
        ['只按标点把条文切成四段', '只统计一分钟能读多少字', '看完后直接认为已经掌握'],
        0,
        '法律材料需要准确还原和案例迁移。意义分组只能降低即时负荷，还要用原文核对和延迟应用验证掌握，不能只凭分段整齐判断。',
        '迁移应用',
      ),
    ],
  },
  'memory:编码：让信息变得可区分': {
    contentStatus: 'reviewed',
    prerequisite: '完成注意与工作记忆基础课程，能制作卡片并安排 24 小时复查。',
    plainLanguageGoal:
      '学完后，你能把一组抽象信息改写成有意义、可区分并匹配测试任务的线索卡，再用延迟提取判断编码质量。',
    guidedPractice:
      '为 12 个真实术语分别制作“定义—例子—对比”三项编码卡，只保留问题面，完成即时回忆和 24 小时后线索回忆。',
    independentPractice:
      '从当前课程选 10 个易混概念，比较原句抄写与可区分线索卡两种版本，在陌生例子和延迟测试中评价迁移。',
    commonErrors: [
      '把重新抄写、加颜色和高亮当作编码完成，却没有形成区别于其他项目的意义联系。',
      '线索卡直接写出答案，复习时只是在确认熟悉感，没有真正从记忆中提取。',
      '只按学习时的材料形式出题，不检查新例子和不同问法下的迁移。',
    ],
    sourceRefs: ENCODING_SOURCES,
    studyPoints: [
      point('必背', '编码质量取决于意义联系、可区分性和与提取任务匹配的线索，不取决于笔记是否更厚或更漂亮。', 1),
      point('重点', '精细加工要产生具体区别，例如定义、例子、反例和适用条件；泛泛联想不能替代准确内容。', 2),
      point('易错', '熟悉感不是掌握证据；卡片若泄露答案，就必须改成闭卷问题并安排延迟测试。', 4),
    ],
    eventDetails: [ENCODING_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜为什么看过的概念一换问法就不会',
        body:
          '读完一页笔记觉得每句话都熟悉，合上材料却无法解释概念之间的区别，常见原因是编码只留下了排版和关键词印象，没有形成可检索的关系。先做十分钟前测：选十二个术语，每个看六秒，其中六个只需抄写，六个要写出一个例子和一个易混项。十分钟后只看术语尝试解释，二十四小时后再用新例子判断。记录准确率、混用次数和遗漏项。前测要保留原始卡片，之后比较两种编码方式，才能判断是材料难度还是编码操作造成差异。',
        note: '先测能否解释，不测是否眼熟。',
        objective: '能用解释准确率、易混次数和延迟表现诊断一次编码失败。',
        practice: '完成 12 个术语的两种编码方式前测，标出抄写组与意义组的即时和延迟结果。',
        checkpoint: '检查是否使用相同术语难度，是否保留答案，是否区分熟悉感与可解释输出。',
      },
      {
        title: '材料与概念｜编码、可区分性与线索匹配',
        body:
          '编码是把外部信息转成可保存、可提取表征的操作。重复能增加接触次数，但若每次加工都相同，项目之间仍可能缺少区别。意义加工、精细提问和例子能连接已有知识；可区分性则要求新的表征不只说“很重要”，而能回答它和相邻概念哪里不同。编码特异性提醒学习时使用的线索要接近之后提取的条件；迁移适当加工进一步指出，押韵线索适合押韵任务，案例线索适合案例判断。编码不是一次性写入，之后主动提取与反馈会继续改变可提取性。',
        note: '编码要留下可检索区别。',
        objective: '能解释意义加工、可区分性、线索匹配和后续提取之间的关系。',
        practice: '为三个易混概念写出“定义、正例、反例、与邻项区别”四格编码卡。',
        checkpoint: '检查是否有具体区别而非空洞联想，是否说明未来测试任务与线索形式。',
      },
      {
        title: '示范与推导｜把一句定义改成可提取线索',
        body:
          '以“机会成本”为例，只写“选择某方案放弃的最佳替代收益”仍容易与沉没成本混用。可把它拆成四项：决策时点只看未来替代，已发生支出不能倒推改变，例子是选工作放弃的最高工资，反例是已经花掉的报名费。问题面写成“一个已发生费用为什么不是机会成本”，答案面才保留解释。示范时要检查线索是否泄露答案、是否与案例题匹配、能否在二十四小时后仍区分类别。若换例子就失败，应增加边界对照，而不是继续给原句加颜色。',
        note: '线索要提示，不要代答。',
        objective: '能把抽象定义加工成不泄题、可区分并匹配案例测试的线索卡。',
        practice: '选一个易混概念制作三版问题面，删去直接答案词，并标出预计测试题型。',
        checkpoint: '检查是否包含正例、反例和边界，是否能在不看答案时生成解释。',
      },
      {
        title: '引导练习｜十二个术语的双通道编码',
        body:
          '准备十二个真实术语，随机分成两组。抄写组只把定义原样写一遍；意义组必须写出一个具体例子、一个易混项和一条适用边界。两组各学习十二分钟，随后只看术语做两分钟自由解释作为即时后测，并立即核对反馈。第二天用新的例子和不同问法再测一次。记录准确要点数、混淆项、完全空白和错误自信。比较时不能把更长的文字直接算更高分，评分只看得分点与区别是否准确；若意义组只是写得多但无法提取，编码仍不合格。',
        note: '评分看要点，不看字数。',
        objective: '能用相同评分标准比较原样抄写与意义编码的即时和延迟效果。',
        practice: '完成 12 张编码卡、即时解释、24 小时新例测试，并填写要点与混淆统计。',
        checkpoint: '检查两种材料难度是否相近，是否闭卷提取，是否用新题而不是重复原句。',
      },
      {
        title: '独立迁移与评价｜用陌生例子检验线索质量',
        body:
          '从当前学科选十个最易混概念，制作问题面不泄答案的线索卡，每张至少包含一个使用条件和一个对比对象。学习后先做即时闭卷解释，间隔二十四小时再用陌生例子判断，并把无法迁移的卡片重写。评价四项：要点准确、区别具体、线索不泄题、陌生情境可用。最后保留一张失败卡，说明它为什么只记住了原句而无法应用。编码质量的证据来自延迟提取和新情境，不是卡片颜色、厚度或阅读时产生的熟悉感。',
        note: '新情境是编码的最终检验。',
        objective: '能独立制作、测试并修正可迁移线索卡，区分短期熟悉与长期可提取。',
        practice: '提交十张卡片、两轮测试、一张失败卡的重写版和四项自评证据。',
        checkpoint: '四项自评：内容准确、区别清楚、线索有效、迁移成立；任何一项不足都要回改对应卡片。',
      },
    ],
    quiz: [
      question(
        '哪一种编码最可能在延迟测试中形成可用线索？',
        '写出定义、具体例子、易混项和适用边界，并保留闭卷问题面',
        ['把定义原句抄三遍', '只给标题涂不同颜色', '复习时一直看着答案读'],
        0,
        '例子、对比和边界形成更具体的区别，闭卷问题面又能触发提取。单纯抄写或看答案只增加熟悉感，不能证明换问法后仍能解释。',
        '事实与定义',
      ),
      question(
        '学生在押韵测试中表现更好、在意义测试中表现较差，最合理的解释是什么？',
        '编码方式需要与提取任务匹配，押韵练习只迁移到相近测试',
        ['押韵加工证明所有深层加工无效', '工作记忆已经永久扩大', '意义信息无法被记忆'],
        1,
        '迁移适当加工强调学习操作与测试要求的对应关系。一种编码并非在所有任务上都最优，需看线索和使用方式，也要用不同题型复核。',
        '材料与推导',
      ),
      question(
        '卡片问题面直接包含完整答案，会造成什么主要问题？',
        '复习变成识别熟悉文字，不能证明能否从记忆中独立提取',
        ['卡片数量会自动减少', '所有例子都会更难', '延迟测试变得没有必要'],
        2,
        '看到答案后产生流畅感并不等于掌握。问题面应提供必要情境但不直接泄露答案，之后再做反馈和再次提取，并记录延迟表现。',
        '常见误区',
      ),
      question(
        '把编码方法迁移到数学公式时，哪种卡片最完整？',
        '写出公式条件、一个正例、一个不适用反例和与相近公式的区别',
        ['只把公式抄得更大', '只记录公式出现了几次', '只背符号排列不看条件'],
        0,
        '数学公式的可区分性来自条件、适用范围和反例。只有符号外形不足以支持变式题和迁移判断，还应保留一次陌生情境检验。',
        '迁移应用',
      ),
    ],
  },
  'memory:提取练习为什么比重读有效': {
    contentStatus: 'reviewed',
    prerequisite: '完成编码课程，能准备同难度材料、闭卷题和间隔复查记录。',
    plainLanguageGoal:
      '学完后，你能用等时重读与闭卷回忆的对照，记录即时表现、反馈修正和延迟保持，判断提取练习是否真正有效。',
    guidedPractice:
      '把一篇材料分成难度相近的两段，一段等时重读，一段阅读后闭卷回忆并核对反馈，分别在十分钟和 24 小时后测试。',
    independentPractice:
      '为当前课程建立 8 个闭卷问题，按第 1、3、7 天完成提取、反馈和错题重测，并用新例子检查迁移。',
    commonErrors: [
      '把提取练习等同于频繁小测，却没有核对反馈或处理空白答案。',
      '用重读组多学一次、提取组少学一次的不等时比较，结果无法归因。',
      '只看当堂正确率，不做延迟测试和新情境迁移，误把短期流畅当长期保持。',
    ],
    sourceRefs: RETRIEVAL_SOURCES,
    studyPoints: [
      point('必背', '提取练习的核心是闭卷生成答案、及时核对反馈并间隔重测，而不是只看测验分数。', 1),
      point('重点', '比较重读与提取时，学习总时长、材料难度和测试题必须尽量相同，并加入延迟测试。', 3),
      point('易错', '当堂回忆更流畅不代表长期保持更好；无反馈的错误提取可能巩固错误，必须纠正后再测。', 4),
    ],
    eventDetails: [RETRIEVAL_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜为什么读三遍不如合上书讲一遍',
        body:
          '连续重读同一段材料时，句子会越来越眼熟，但合上材料解释因果关系可能仍然断裂。先做一次短前测：阅读一篇四百字材料八分钟，随即闭卷写出能回忆的全部要点作为即时后测，再打开原文标记遗漏。把答案按“完整、部分、错误、空白”分类，记录哪些地方只是看见时认识。随后用一段等难材料做重读后回忆，比较两组的总学习时长和反馈方式。前测的重点不是给自己打分，而是找到可被后续提取纠正的具体缺口。',
        note: '先暴露缺口，再设计练习。',
        objective: '能用完整、部分、错误和空白四类结果定位阅读后的知识缺口。',
        practice: '完成八分钟阅读和闭卷自由回忆，按四类统计要点并为遗漏处标出原文位置。',
        checkpoint: '检查是否闭卷，是否记录反馈，是否只凭熟悉感估计掌握程度。',
      },
      {
        title: '材料与概念｜测试效应、反馈与间隔',
        body:
          '提取练习是在不看材料时尝试回忆、解释或应用知识，再用反馈修正。与重读相比，它迫使学习者重新生成答案并暴露检索路径，但效果取决于几个条件：学习总时间是否相近，问题是否要求理解，反馈是否及时，错误是否再次测试，复习是否有间隔。测试效应描述的是主动提取对后续保持的促进作用，不等于任何考试形式都有效。若题目只考原句识别、答案长期不核对，或只测当堂表现，仍可能形成短期流畅而缺乏长期迁移。',
        note: '提取之后必须有反馈。',
        objective: '能解释提取练习、反馈、间隔与延迟保持之间的条件关系。',
        practice: '为一次阅读设计三项闭卷问题，分别要求定义、因果解释和新例子应用。',
        checkpoint: '检查问题是否只考原句，是否安排反馈和重测，是否区分即时与延迟结果。',
      },
      {
        title: '示范与推导｜从当堂流畅推到一周保持',
        body:
          '假设材料有八个关键要点。重读组连续阅读两遍，提取组阅读一遍后用同等剩余时间闭卷写下全部要点，再核对反馈并重写遗漏项。两组总时长相同，十分钟后和一星期后各测一次。推导时先比较即时得分，再比较延迟得分和遗忘量。若提取组即时略低但延迟更高，说明提取过程产生了长期保持优势；若两组都下降，则问题可能超出材料或测试过难。还要检查反馈是否让错误答案被纠正，避免把重复错误误当有效练习。',
        note: '同总时长才有可比性。',
        objective: '能设计等时对照并用即时、延迟和遗忘量解释结果。',
        practice: '为一篇材料写两条件学习流程，明确每段用时、闭卷输出、反馈和两次测试时间。',
        checkpoint: '检查总时长是否相等，是否同题难度，是否同时记录错误修正和延迟保持。',
      },
      {
        title: '引导练习｜重读与提取的等时对照',
        body:
          '准备两段长度、术语密度和结构相近的材料。A 段用十分钟重读，B 段用四分钟阅读、三分钟闭卷回忆、两分钟核对反馈、一分钟重写遗漏。两种条件总时长都控制在十分钟，并交换材料后在第二天重复一次。十分钟后做三项要点题，二十四小时后再做同结构新题。记录得分、反馈前空白、反馈后修正和延迟遗忘。比较时先确认材料难度和总时长，若提取组只在新题上优势明显，应把它写成迁移证据，而不是笼统说“测试提高记忆”。',
        note: '交换材料以排除顺序效应。',
        objective: '能在等时条件下完成重读与提取对照，并记录反馈修正与延迟迁移。',
        practice: '完成两轮对照，提交即时、24 小时、反馈前错误和反馈后修正四项统计。',
        checkpoint: '检查是否等时等难，是否使用新题，是否把即时得分与延迟结果分别报告。',
      },
      {
        title: '独立迁移与评价｜建立七天提取与反馈闭环',
        body:
          '从当前课程选八个重要概念，制作不泄答案的问题卡。第 1 天闭卷作答并核对反馈，把错误改成下次提示；第 3 天先重测全部卡片，再只重写错误项；第 7 天用新例子和不同问法测试迁移。评价四项：问题不泄答案，反馈能纠正错误，间隔日期有记录，新情境仍能应用。最后写一条停止条件，例如连续两次在新题中混淆同一概念，就回到编码卡补反例。提取练习的成果应体现在延迟保持和迁移，不是把测验次数堆高。',
        note: '错误必须进入下一轮提取。',
        objective: '能建立带反馈、间隔和迁移检查的个人提取复习闭环。',
        practice: '提交八张问题卡、第 1/3/7 天记录、错误修正、新例测试和一条停止条件。',
        checkpoint: '四项自评：闭卷有效、反馈具体、间隔落实、迁移可证；缺少任一项不能判定完成。',
      },
    ],
    quiz: [
      question(
        '提取练习区别于单纯重读的关键操作是什么？',
        '在不看材料时生成答案，再用反馈修正并安排后续重测',
        ['把材料朗读得更大声', '把所有答案提前标成高亮', '只统计阅读总页数'],
        0,
        '主动生成会暴露能否检索，反馈纠正后再次测试才形成闭环。只重读或看答案无法证明可以独立提取，也不能说明长期保持是否改善。',
        '事实与定义',
      ),
      question(
        '提取组即时得分略低、一周后得分明显更高，最合理的解释是什么？',
        '即时流畅不等于长期保持，提取过程可能带来更好的延迟保持',
        ['一周测试一定比即时测试简单', '重读组从未接触材料', '短期得分可以完全忽略'],
        1,
        '测试效应常表现在延迟保持而非当堂舒适感。仍需检查两组总时长、材料难度和反馈条件，排除设计差异后再解释延迟优势。',
        '材料与推导',
      ),
      question(
        '哪种设计最可能让“提取比重读有效”的结论失真？',
        '重读组学习十分钟，提取组只学习四分钟且题目还不同',
        ['两组使用等难材料和相同总时长', '交换两条件的学习顺序', '在反馈后再次测试错误项'],
        2,
        '总时长和题目难度不同会增加竞争解释。等时、等难、交换顺序和反馈重测都是为了把差异尽量归因于学习操作本身，而不是题目偶然更简单。',
        '常见误区',
      ),
      question(
        '把提取练习迁移到医学案例分析时，哪种问题卡最合适？',
        '给出症状与检查线索，要求闭卷提出判断依据，再用标准反馈和变式复测',
        ['把诊断名称写在题面下方', '只问教材页码是多少', '每次复习都直接朗读答案'],
        0,
        '案例学习需要生成判断并核对依据。新病情和不同线索可检验迁移，泄露答案或只记页码不能证明临床推理，也不能替代专业诊断。',
        '迁移应用',
      ),
    ],
  },
};
