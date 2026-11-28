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

const YI_LI_ARCHIVE = {
  id: 'topic-yi-li-motive-consequence',
  kind: 'concept',
  title: '义与利：动机、规则和公共后果怎样连接',
  period: '先秦至现代伦理学',
  summary:
    '义利问题不只是“道德还是利益”。儒家问合乎角色的正当获取，墨家比较公共利害，义务论检查规则与动机，后果论评估总体结果，权利视角关注不可牺牲者。',
  background:
    '资源分配、举报奖励和公共政策都同时涉及动机、规则、后果与权利。只用一种伦理框架容易遗漏受影响者或把总收益当全部理由。',
  timeline: [
    {
      date: '先秦',
      title: '儒家把义放入关系和正当获取',
      body: '儒家反对不正当逐利，同时讨论民众福祉和治理后果。义不是脱离关系的空规则，而要结合角色、礼和公共责任判断。',
      sourceIds: ['ctext-analects', 'sep-chinese-ethics'],
    },
    {
      date: '战国',
      title: '墨家从公共利害论证行动',
      body: '墨家以兴天下之利、除天下之害支持兼爱与非攻，要求比较行为对众人造成的后果，也要面对总量与分配的冲突。',
      sourceIds: ['ctext-mozi', 'sep-chinese-ethics'],
    },
    {
      date: '18世纪',
      title: '义务论强调规则与动机',
      body: '康德伦理学从可普遍化原则和尊重人格出发，反对只把行为当达成结果的工具。它仍需回答规则冲突和现实后果。',
      sourceIds: ['sep-kant-moral'],
    },
    {
      date: '19世纪',
      title: '后果论按结果评价行为',
      body: '功利主义比较行为对总体福利的影响，优点是公开考虑后果，难点是测量、分配和少数权利可能被总量掩盖。',
      sourceIds: ['sep-utilitarianism'],
    },
    {
      date: '现代',
      title: '权利与程序加入义利评估',
      body: '公共决策还要检查同意、程序、基本权利和受影响者申诉。权利限制并非不计算后果，而是防止某些代价被轻易忽略。',
      sourceIds: ['sep-rule-of-law', 'sep-chinese-ethics'],
    },
    {
      date: '综合分析',
      title: '动机、规则、后果与权利分开写',
      body: '一个政策可能动机良好但后果差，也可能总收益高但分配不公。比较应分栏取证，再用有限理由形成判断。',
      sourceIds: ['sep-utilitarianism', 'sep-kant-moral'],
    },
  ],
  outcome:
    '可观察结果是能为同一义利案例写动机、规则、公共效用、权利和分配五种判断，并说明各自证据与反例。',
  significance:
    '课程训练多框架伦理分析，避免把“好心”或“总收益”单独当充分证明。',
  sourceCards: [
    source('ctext-analects', 'Analects', 'Chinese Text Project', '公版原文', 'https://ctext.org/analects', '核对儒家义利与角色语境。'),
    source('ctext-mozi', 'Mozi', 'Chinese Text Project', '公版原文', 'https://ctext.org/mozi', '核对公共利害与兼爱非攻。'),
    source('sep-chinese-ethics', 'Chinese Ethics', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/ethics-chinese/', '核对儒墨伦理与比较方法。'),
    source('sep-kant-moral', 'Kant’s Moral Philosophy', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/kant-moral/', '核对义务、动机与人格尊重。'),
    source('sep-utilitarianism', 'The History of Utilitarianism', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/utilitarianism/', '核对后果论、福利与分配难题。'),
    source('sep-rule-of-law', 'Rule of Law', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/rule-of-law/', '核对程序、权利与权力约束。'),
  ],
} satisfies LearningV2EventDetail;

const ORDER_LAW_ARCHIVE = {
  id: 'topic-ritual-law-order',
  kind: 'institution',
  title: '礼与法：秩序为什么需要两种语言',
  period: '先秦至现代法治',
  summary:
    '礼通过角色、仪式和内在态度形成秩序，法通过公开规则、强制与问责协调行为。二者都可能压迫，也都需要正当性、可预期性和纠错机制。',
  background:
    '家庭、学校和组织既使用规范教育，也使用规则处罚。只讲礼可能依赖权力和身份，只讲法可能忽略关系、动机与执行资源。',
  timeline: [
    {
      date: '先秦礼制',
      title: '礼连接身份、仪式与义务',
      body: '礼通过称谓、动作、祭祀和分寸确认角色关系，也分配责任和资源。形式若脱离敬与合宜会空洞，内在态度也不能代替制度。',
      sourceIds: ['ctext-liji', 'sep-chinese-ethics'],
    },
    {
      date: '战国变法',
      title: '法家以公开赏罚提高可预期性',
      body: '法家强调规则、执行和权位，但规则可能成为不受约束的权力工具。公开本身不等于正当程序或基本权利保障。',
      sourceIds: ['ctext-hanfeizi', 'sep-legalism'],
    },
    {
      date: '现代法治',
      title: '规则需要约束权力与保护权利',
      body: '现代法治理念要求公开、可预期、程序公正、独立审查和救济。法家制度分析可比较，却不能自动满足这些条件。',
      sourceIds: ['sep-rule-of-law', 'sep-legalism'],
    },
    {
      date: '正当性',
      title: '服从不能只靠强制',
      body: '秩序需要说明谁有权制定规则、依据什么理由、如何回应异议。强制可短期维持行为，却难以证明制度正当。',
      sourceIds: ['sep-legitimacy', 'sep-rule-of-law'],
    },
    {
      date: '执行层面',
      title: '裁量、资源和误差决定规则效果',
      body: '基层执行者可能误判，弱势者可能无法申诉。礼的教化与法的程序都必须检查信息、资源和问责，而非只看表面服从。',
      sourceIds: ['sep-rule-of-law', 'sep-legitimacy'],
    },
    {
      date: '综合比较',
      title: '礼法互补也要共同受限',
      body: '礼可培养关系与判断，法可提供公开边界与救济。任何一方都必须接受权力约束、反例和受影响者检验。',
      sourceIds: ['sep-chinese-ethics', 'sep-rule-of-law', 'sep-legitimacy'],
    },
  ],
  outcome:
    '可观察结果是能为一个秩序方案区分礼、法、强制、正当性和问责，并写出执行失败条件。',
  significance:
    '本课防止把礼等同文明、把法等同严罚，训练制度分析同时检查意义与权力。',
  sourceCards: [
    source('ctext-liji', 'Book of Rites', 'Chinese Text Project', '公版原文', 'https://ctext.org/liji', '核对礼制、仪式与角色。'),
    source('ctext-hanfeizi', 'Han Feizi', 'Chinese Text Project', '公版原文', 'https://ctext.org/hanfeizi', '核对法、术、势与赏罚。'),
    source('sep-rule-of-law', 'Rule of Law', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/rule-of-law/', '核对公开规则、权力约束与法治边界。'),
    source('sep-legitimacy', 'Legitimacy', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/legitimacy/', '核对政治正当性、服从与证成。'),
    source('sep-legalism', 'Legalism in Chinese Philosophy', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/chinese-legalism/', '核对法家制度与解释差异。'),
    source('sep-chinese-ethics', 'Chinese Ethics', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/ethics-chinese/', '核对礼、德性与秩序的比较。'),
  ],
} satisfies LearningV2EventDetail;

const NATURE_TECH_ARCHIVE = {
  id: 'topic-nature-technology-boundary',
  kind: 'concept',
  title: '自然与人为：技术边界不是“用或不用”',
  period: '先秦至数字时代',
  summary:
    '道家提醒检查过度造作和反噬，现代技术伦理要求分析风险、受益、同意、责任和替代方案。自然不能被当作一切现状，技术也不能自动等于进步。',
  background:
    '自动化、医疗增强和环境工程同时带来效率与权力问题。争论若停在“自然好”或“技术中立”，会遗漏制度、分配和失败后果。',
  timeline: [
    {
      date: '先秦',
      title: '道家质疑过度人为与反噬',
      body: '《老子》提醒强制造作可能产生反向结果，少干预要求理解事物条件。它不等于放弃专业责任或把所有现状称为自然。',
      sourceIds: ['ctext-dao', 'sep-daoism'],
    },
    {
      date: '工业化',
      title: '技术收益伴随不可见风险',
      body: '生产效率提高的同时出现污染、工伤和规模风险。评估需要区分直接使用者、受影响者和未来代际。',
      sourceIds: ['sep-env-ethics', 'sep-tech-ethics'],
    },
    {
      date: '20世纪后期',
      title: '环境伦理扩展道德考虑范围',
      body: '自然系统、动物和后代是否应进入伦理判断成为争论。不同理论对内在价值与人类福利的权重不一。',
      sourceIds: ['sep-env-ethics'],
    },
    {
      date: '计算机时代',
      title: '算法系统把责任分散到多方',
      body: '数据、设计、部署和使用者共同影响结果。技术并非完全中立，责任也不能只归给最后一个点击按钮的人。',
      sourceIds: ['sep-tech-ethics'],
    },
    {
      date: '风险管理',
      title: '需要比较不确定性与可逆性',
      body: '风险估计不能只看平均收益，还要看严重失败、不可逆损害、监控和退出机制。预防原则不等于永久禁止技术。',
      sourceIds: ['sep-precaution', 'sep-env-ethics'],
    },
    {
      date: '综合判断',
      title: '从目的、替代、反噬与边界四问出发',
      body: '技术方案要说明解决什么问题、是否有低风险替代、谁受益受损、如何监测和停止。自然理由也要接受同样审查。',
      sourceIds: ['sep-daoism', 'sep-tech-ethics', 'sep-precaution'],
    },
  ],
  outcome:
    '可观察结果是能为一项技术方案写目的、替代、受益受损、风险、监控和退出边界，并引用道家或技术伦理资料。',
  significance:
    '本课把“自然与人为”从文化口号变成可检验的治理问题，同时保留技术创新的可能。',
  sourceCards: [
    source('ctext-dao', 'Dao De Jing', 'Chinese Text Project', '公版原文', 'https://ctext.org/dao-de-jing', '核对无为、自然与反作用。'),
    source('sep-daoism', 'Daoism', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/daoism/', '核对道家少干预与解释边界。'),
    source('sep-tech-ethics', 'Ethics of Artificial Intelligence and Robotics', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/ethics-computer/', '核对算法责任、隐私与治理。'),
    source('sep-env-ethics', 'Environmental Ethics', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/environmental-ethics/', '核对自然价值与环境治理争论。'),
    source('sep-precaution', 'Precautionary Principle', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/precautionary-principle/', '核对不确定风险与预防原则。'),
  ],
} satisfies LearningV2EventDetail;

const POWER_FREEDOM_ARCHIVE = {
  id: 'topic-power-freedom-legitimacy',
  kind: 'concept',
  title: '权力与自由：服从何时才算正当',
  period: '17世纪至现代',
  summary:
    '自由既可能是免于干涉，也可能是参与自治或不受支配。权力可通过同意、法治和可争辩性获得正当性，也可能借保护之名扩张。',
  background:
    '平台、学校和政府对个人都有规则权力。判断正当性不能只看结果效率，还要看授权、程序、异议、退出和基本权利。',
  timeline: [
    {
      date: '17世纪',
      title: '社会契约重问政治权威',
      body: '霍布斯、洛克等以自然状态和同意说明权力来源。不同契约论对反抗、产权和主权范围结论不同。',
      sourceIds: ['sep-social-contract'],
    },
    {
      date: '18世纪',
      title: '积极自由与自治进入争论',
      body: '自由可被理解为自我治理和公共参与，也可能被权力借“真正自由”之名强制个人。需要检查谁定义真正利益。',
      sourceIds: ['sep-liberty'],
    },
    {
      date: '19世纪',
      title: '消极自由强调免于强制',
      body: '免于干涉保护个人空间，但缺少资源和能力时，形式自由可能难以实现。自由仍要处理私人权力与依赖。',
      sourceIds: ['sep-liberty', 'sep-social-contract'],
    },
    {
      date: '共和主义',
      title: '非支配关注任意权力',
      body: '即使主人暂时不干涉，奴隶仍受任意权力支配。共和主义因此关注地位、法律保障和可争辩性。',
      sourceIds: ['sep-republicanism', 'sep-liberty'],
    },
    {
      date: '现代法治',
      title: '程序与救济约束权力',
      body: '公开规则、独立审查、听证和申诉使权力可被问责。仅有选举或法律形式，也不保证少数群体受到保护。',
      sourceIds: ['sep-rule-of-law', 'sep-republicanism'],
    },
    {
      date: '综合判断',
      title: '同时问范围和判断者',
      body: '分析权力要问它管什么、由谁授权、如何判断、能否反对、退出代价和失败救济。自由不能只用“有没有限制”衡量。',
      sourceIds: ['sep-liberty', 'sep-social-contract', 'sep-rule-of-law'],
    },
  ],
  outcome:
    '可观察结果是能用消极自由、积极自由、非支配、同意和法治分析一项权力安排，并指出滥用风险。',
  significance:
    '本课训练把自由与权力制度连接，避免把“没人管”或“多数同意”直接等同正当。',
  sourceCards: [
    source('sep-liberty', 'Positive and Negative Liberty', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/liberty-positive-negative/', '核对积极/消极自由及争论。'),
    source('sep-republicanism', 'Republicanism', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/republicanism/', '核对非支配、公民自由与制度。'),
    source('sep-social-contract', 'Social Contract Theory', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/social-contract/', '核对同意、主权与政治义务。'),
    source('sep-rule-of-law', 'Rule of Law', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/rule-of-law/', '核对权力约束、程序与法治。'),
  ],
} satisfies LearningV2EventDetail;

const KNOWLEDGE_ARCHIVE = {
  id: 'topic-knowledge-ignorance',
  kind: 'concept',
  title: '知识与无知：什么时候可以说“我知道”',
  period: '现代认识论',
  summary:
    '知识不只等于自信。证据、可靠性、证言和社会位置会影响判断，认知不正义则提醒我们，某些声音可能因身份被系统性低估。',
  background:
    '搜索、AI 回答和新闻传播让信息更易获得，也更难核实。高置信不等于知识，无知也可能是有结构的遗漏而非个人空白。',
  timeline: [
    {
      date: '传统认识论',
      title: '知识需要信念与证据条件',
      body: '知识通常不能只是碰巧正确的信念，还要有适当依据与可靠性。不同理论争论证据、安全和德性条件。',
      sourceIds: ['sep-epistemology'],
    },
    {
      date: '证言认识论',
      title: '多数知识依赖他人',
      body: '我们通过专家、教师和媒体获得大量知识，但需要判断专业能力、利益、复现和纠错机制，不能盲信也不能全盘拒绝。',
      sourceIds: ['sep-testimony', 'sep-epistemology'],
    },
    {
      date: '社会认识论',
      title: '知识分布在制度和工具中',
      body: '数据库、同行评审和公共记录能积累知识，也可能固化遗漏。机构需要透明度、异议渠道和版本追踪。',
      sourceIds: ['sep-epistemic-injustice', 'sep-testimony'],
    },
    {
      date: '认知不正义',
      title: '身份偏见会压低可信度',
      body: '证言不正义使某些人的经验被轻视，解释不正义使群体缺少概念描述自身处境。判断要检查谁被允许说话。',
      sourceIds: ['sep-epistemic-injustice'],
    },
    {
      date: '概率与校准',
      title: '置信要随证据调整',
      body: '概率判断可通过校准和预测记录评估。表达“多确定”应与长期命中的比例和可复现证据相连，而不是气势。',
      sourceIds: ['sep-epistemology', 'sep-testimony'],
    },
    {
      date: '综合判断',
      title: '建立可修订的证据账本',
      body: '把事实、来源、推断、未知和置信分开记录，并设计推翻条件。承认无知不是失败，而是防止过度承诺。',
      sourceIds: ['sep-epistemic-injustice', 'sep-epistemology'],
    },
  ],
  outcome:
    '可观察结果是能区分信息、证据、推断与知识，评估证言可信度，并记录认知不正义和置信修正。',
  significance:
    '本课训练可修订判断和制度性纠错，避免把自信、流量或单一权威当知识。',
  sourceCards: [
    source('sep-epistemology', 'Epistemology', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/epistemology/', '核对知识、证据、可靠性与信念。'),
    source('sep-testimony', 'Epistemology of Testimony', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/testimony-episprob/', '核实证言、信任与专家知识。'),
    source('sep-epistemic-injustice', 'Epistemic Injustice', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/epistemic-injustice/', '核对证言不正义与解释不正义。'),
    source('sep-rule-of-law', 'Rule of Law', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/rule-of-law/', '核对可问责制度与公开理由。'),
  ],
} satisfies LearningV2EventDetail;

const EQUALITY_ARCHIVE = {
  id: 'topic-equality-difference-justice',
  kind: 'concept',
  title: '平等与差异：同样对待还是按需支持',
  period: '18世纪至当代正义理论',
  summary:
    '形式平等要求相同规则，实质平等关注资源、机会和能力差异。正义既要避免不公歧视，也要为不同处境提供可达条件。',
  background:
    '教育、医疗和残障支持中，机械同等待遇可能维持不平等。差异支持也可能带来标签、成本和权力问题，因此需要公开标准。',
  timeline: [
    {
      date: '18世纪',
      title: '形式平等挑战身份特权',
      body: '法律面前同等对待削弱世袭特权，但若资源与权力差距巨大，相同规则仍可能产生不平等结果。',
      sourceIds: ['sep-equality'],
    },
    {
      date: '19世纪',
      title: '社会问题推动实质平等',
      body: '工业化暴露阶级与贫困差异，平等开始涉及教育、劳动和基本生活条件，而不只法律形式。',
      sourceIds: ['sep-equality', 'sep-justice'],
    },
    {
      date: '1971年',
      title: '罗尔斯用公平原则分配基本善',
      body: '罗尔斯以原初状态和差异原则讨论不平等何时可接受。抽象契约仍需面对残障、关系和全球正义批评。',
      sourceIds: ['sep-rawls', 'sep-justice'],
    },
    {
      date: '1980年代',
      title: '能力路径关注真实可行选择',
      body: '能力路径不只看资源数量，还看人能否实际获得教育、健康、参与和尊严。相同资源在不同处境中价值不同。',
      sourceIds: ['sep-capabilities', 'sep-equality'],
    },
    {
      date: '当代',
      title: '差异与反歧视并非二选一',
      body: '合理便利、无障碍和定向支持可减少障碍，但资格、隐私和污名需要制度约束。差异措施必须说明目标和复核。',
      sourceIds: ['sep-equality', 'sep-capabilities'],
    },
    {
      date: '综合判断',
      title: '同规则、资源与能力三层检查',
      body: '正义分析要问规则是否公平、资源是否足够、不同处境能否实际参与，并检查标签、成本和申诉。',
      sourceIds: ['sep-justice', 'sep-rawls', 'sep-capabilities'],
    },
  ],
  outcome:
    '可观察结果是能比较形式平等、资源分配、罗尔斯原则和能力路径，并为差异支持写目标、资格和复核边界。',
  significance:
    '本课避免把平等等同完全相同，也防止差异措施缺少公开理由和权利保障。',
  sourceCards: [
    source('sep-equality', 'Equality', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/equality/', '核对形式平等、实质平等与差异争论。'),
    source('sep-justice', 'Distributive Justice', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/justice-distributive/', '核对资源、福利与分配正义。'),
    source('sep-rawls', 'John Rawls', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/rawls/', '核对公平原则与差异原则。'),
    source('sep-capabilities', 'Capability Approach', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/capability-approach/', '核对可行能力、功能与真实选择。'),
  ],
} satisfies LearningV2EventDetail;

const YI_LI_SOURCES = [
  'Stanford Encyclopedia of Philosophy, Chinese Ethics。https://plato.stanford.edu/entries/ethics-chinese/',
  '《论语》公版原文。https://ctext.org/analects',
  '《墨子》公版原文。https://ctext.org/mozi',
  'Stanford Encyclopedia of Philosophy, Kant’s Moral Philosophy。https://plato.stanford.edu/entries/kant-moral/',
  'Stanford Encyclopedia of Philosophy, Utilitarianism。https://plato.stanford.edu/entries/utilitarianism/',
];

const ORDER_LAW_SOURCES = [
  'Stanford Encyclopedia of Philosophy, Rule of Law。https://plato.stanford.edu/entries/rule-of-law/',
  '《礼记》公版原文。https://ctext.org/liji',
  '《韩非子》公版原文。https://ctext.org/hanfeizi',
  'Stanford Encyclopedia of Philosophy, Legitimacy。https://plato.stanford.edu/entries/legitimacy/',
];

const NATURE_TECH_SOURCES = [
  'Stanford Encyclopedia of Philosophy, Ethics of AI and Robotics。https://plato.stanford.edu/entries/ethics-computer/',
  '《老子》公版原文。https://ctext.org/dao-de-jing',
  'Stanford Encyclopedia of Philosophy, Daoism。https://plato.stanford.edu/entries/daoism/',
  'Stanford Encyclopedia of Philosophy, Environmental Ethics。https://plato.stanford.edu/entries/environmental-ethics/',
  'Stanford Encyclopedia of Philosophy, Precautionary Principle。https://plato.stanford.edu/entries/precautionary-principle/',
];

const POWER_FREEDOM_SOURCES = [
  'Stanford Encyclopedia of Philosophy, Positive and Negative Liberty。https://plato.stanford.edu/entries/liberty-positive-negative/',
  'Stanford Encyclopedia of Philosophy, Republicanism。https://plato.stanford.edu/entries/republicanism/',
  'Stanford Encyclopedia of Philosophy, Social Contract Theory。https://plato.stanford.edu/entries/social-contract/',
  'Stanford Encyclopedia of Philosophy, Rule of Law。https://plato.stanford.edu/entries/rule-of-law/',
];

const KNOWLEDGE_SOURCES = [
  'Stanford Encyclopedia of Philosophy, Epistemology。https://plato.stanford.edu/entries/epistemology/',
  'Stanford Encyclopedia of Philosophy, Epistemology of Testimony。https://plato.stanford.edu/entries/testimony-episprob/',
  'Stanford Encyclopedia of Philosophy, Epistemic Injustice。https://plato.stanford.edu/entries/epistemic-injustice/',
  'Stanford Encyclopedia of Philosophy, Rule of Law。https://plato.stanford.edu/entries/rule-of-law/',
];

const EQUALITY_SOURCES = [
  'Stanford Encyclopedia of Philosophy, Equality。https://plato.stanford.edu/entries/equality/',
  'Stanford Encyclopedia of Philosophy, Distributive Justice。https://plato.stanford.edu/entries/justice-distributive/',
  'Stanford Encyclopedia of Philosophy, John Rawls。https://plato.stanford.edu/entries/rawls/',
  'Stanford Encyclopedia of Philosophy, Capability Approach。https://plato.stanford.edu/entries/capability-approach/',
];

export const SCHOOLS_TOPICS_REWRITE: CuratedCoursePlanPatchMap = {
  'schools:义与利：动机和公共后果': {
    contentStatus: 'reviewed',
    prerequisite: '完成中国诸子与世界思想两章，能为伦理主张写理由、后果和反例。',
    plainLanguageGoal:
      '学完后，你能分栏分析义利案例的动机、规则、公共效用和权利，并指出单一框架的遗漏。',
    guidedPractice:
      '分析八个奖励、举报和分配案例，分别写儒家、墨家、义务论和后果论判断与反例。',
    independentPractice:
      '围绕一项公共激励写四框架伦理评估，至少引用三类来源并提出有限制度建议。',
    commonErrors: [
      '把良好动机当结果正确的充分证明，或把总收益当分配正义的充分证明。',
      '把所有义务论等同遵守任意规则，把所有后果论等同牺牲少数。',
      '用现代“利益”一词直接覆盖先秦义、利、公共效用等概念。',
    ],
    sourceRefs: YI_LI_SOURCES,
    studyPoints: [
      point('必背', '义利判断至少分动机、规则、公共效用、分配和权利五层；任何单层都不能自动证明完整结论。', 1),
      point('重点', '先复述每种理论最强理由，再用反例检查它遗漏的受影响者和条件。', 2),
      point('易错', '儒家不是完全不谈利，后果论不是只算总数，义务论也不能忽略规则冲突。', 3),
      point('考点', '区分原文、理论解释和经验后果，给制度建议标注证据与适用边界。', 4),
    ],
    eventDetails: [YI_LI_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜高额奖励一定促进善行吗',
        body:
          '先做前测：给举报者高额奖金会增加公共善还是制造诬告？要求分别从动机、规则、公共效用、权利和分配提出判断，并引一条原典或理论来源。变式改为荣誉表彰。反例是只看奖励后案件数量，不问真假、隐私和弱势者风险。后测为一个方案写五种理由、两个最强反例和一条需要经验检验的问题，并比较各框架的适用范围。',
        note: '先分理由，再站队。',
        objective: '能用动机、规则、后果、权利和分配诊断公共激励方案。',
        practice: '完成奖金与表彰前测，写五种理由、受益受损、两个反例和证据问题。',
        checkpoint: '检查伦理框架、原文或理论来源、分配、权利、动机和经验后果是否分开。',
      },
      {
        title: '材料与概念｜义、利、义务与公共效用',
        body:
          '儒家的义强调合宜关系与正当获取，也会讨论民众福祉；墨家从公共利害支持兼爱和非攻；义务论要求尊重人格并检查行为原则能否普遍化；后果论比较行为对总体福利的影响。公共效用必须继续问谁承担代价，权利和程序则防止某些人被动成为工具。四类框架关注问题不同，可互补但不能混同。比较时要写明来源与历史语境，经验后果靠数据而非学派标签决定。',
        note: '动机与后果都要有位置。',
        objective: '能解释儒家、墨家、义务论和后果论的义利结构及互补边界。',
        practice: '为四框架各写核心问题、判断标准、优点、盲点、一个反例和一条来源。',
        checkpoint: '检查概念准确、历史语境、后果衡量、分配权利、规则冲突和来源层次。',
      },
      {
        title: '示范与推导｜同一奖励政策四路评估',
        body:
          '示范举报奖励：儒家问是否破坏信任和角色义务；墨家比较公共减害与误报；义务论问是否把举报者当工具或侵犯正当程序；后果论估计总收益、误伤和长期信任。示范先列事实假设，再写价值判断，最后标出需要调查的数据。反例是用“多数受益”跳过隐私申诉。变式改变奖金来源或公开程度，检查结论哪里变化、哪里仍冲突。',
        note: '价值判断不能假装成数据。',
        objective: '能把四种框架应用于同一政策，并区分价值冲突与可检验事实。',
        practice: '完成四栏评估、事实假设表、三项指标、两个反例和一个政策变式。',
        checkpoint: '检查框架匹配、事实与价值分层、分配、正当程序、证据和变式逻辑。',
      },
      {
        title: '引导练习｜八项义利案例',
        body:
          '准备八题，覆盖慈善、税收、举报、价格、公共工程、家庭责任、企业责任和紧急分配。每题先做前测列受影响者，再写至少三框架理由，后测加反例和数据。变式改变时间尺度或透明度，观察判断变化。记录“动机好即正确”“总量大即公平”“规则存在即正当”等错误，并要求每条建议说明谁执行、谁申诉、什么证据会推翻它。',
        note: '每个判断都要有推翻条件。',
        objective: '能对八类义利案例完成多框架评估、反例和证据设计。',
        practice: '提交八张伦理矩阵、三个变式、受益受损表、来源和错误分类。',
        checkpoint: '检查理由公平、分配与权利、经验问题、执行主体、申诉和边界完整。',
      },
      {
        title: '独立迁移与评价｜写一页公共激励评估',
        body:
          '选择教育、公益或平台治理中的激励方案，先用三框架写支持与反对，再给出自己的有限判断。至少引用三类来源，并用数据说明总收益、分配和执行条件。24 小时后改变受益范围做变式。评价四项：理由完整、反例有力、事实价值分层、制度边界清楚。最后写一个“只要结果总量最大就无需权利保障”的反例并修正。',
        note: '结论要说明代价和未知。',
        objective: '能把义利多框架迁移到制度评估，并用来源、反例、证据和边界评价。',
        practice: '提交评估短文、三框架表、数据来源、24 小时变式、最强反例和修订。',
        checkpoint: '四项自评：未稻草人化、价值事实分开、受影响者完整、结论有推翻条件。',
      },
    ],
    quiz: [
      question(
        '义利案例为什么不能只问动机好坏？',
        '良好动机仍可能造成伤害，还要检查规则、后果、分配和权利',
        ['因为动机从不影响行为', '因为后果永远无法估计', '因为所有规则都错误'],
        0,
        '动机是伦理判断的一部分，却不能独自证明结果正当。政策还可能误伤、分配不公或侵犯程序，需要多层证据与反例，还要说明谁执行和如何修正。',
        '事实与定义',
      ),
      question(
        '公共效用分析最需要补充什么？',
        '谁承担代价、少数权利和程序是否得到保障',
        ['只计算最大数字', '只看倡议者动机', '完全忽略后果'],
        1,
        '总体收益无法自动解决分配问题。应列受益者、受损者、补偿、同意和申诉，否则多数利益可能掩盖严重不公；补偿和申诉也决定制度是否可信。',
        '材料与推导',
      ),
      question(
        '哪种比较最不可靠？',
        '先用现代“利益”定义覆盖儒墨文本，再宣布四家都在回答同一问题',
        ['先注原文语境', '区分动机与后果', '检查制度执行'],
        2,
        '跨传统比较需要保留概念差异。现代利益、公利、义和合宜并不完全同义，直接覆盖会造成假比较和错误评价，因为同一中文词可能对应不同问题。',
        '常见误区',
      ),
      question(
        '评估公益奖励时，哪种流程最完整？',
        '先列事实与受影响者，再多框架评价，最后用数据、反例和申诉检验',
        ['先定立场再找一句名言', '只看奖励金额', '假定所有参与者都诚实'],
        0,
        '伦理评估既需价值论证，也需现实信息和制度设计。多框架与反例能揭示遗漏，数据与申诉则帮助修正判断，最终建议应标明未知和退出条件。',
        '迁移应用',
      ),
    ],
  },
  'schools:礼与法：秩序如何可能': {
    contentStatus: 'reviewed',
    prerequisite: '完成义利对读，能区分规范理由、强制手段和现实后果。',
    plainLanguageGoal:
      '学完后，你能比较礼与法的秩序机制，并分析正当性、强制、问责和执行失败。',
    guidedPractice:
      '分析八个校园或公共秩序案例，写礼、法、强制、正当性、受影响者和救济机制。',
    independentPractice:
      '设计一份组织规范，同时说明价值教育、公开规则、权力约束和申诉复核。',
    commonErrors: [
      '把礼只当礼貌，把法只当处罚。',
      '认为规则公开就自动等于现代法治或正当。',
      '只问秩序是否形成，不问谁被压制、如何申诉。',
    ],
    sourceRefs: ORDER_LAW_SOURCES,
    studyPoints: [
      point('必背', '礼通过关系、仪式和态度形成秩序，法通过公开规则、强制和问责协调行为；二者都需要正当性、权利与纠错。', 1),
      point('重点', '评价制度同时看规则、执行者、信息、裁量、救济和受影响者，不能只看服从率。', 2),
      point('易错', '公开规则不等于权力已受约束，礼的教化也不能替代程序保障。', 3),
      point('考点', '为一项规范画出“规则—执行—申诉—复核”链，并指出强制失败和滥用位置。', 4),
    ],
    eventDetails: [ORDER_LAW_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜没有处罚就没有秩序吗',
        body:
          '先做前测：图书馆安静秩序靠礼、规则、处罚还是共同习惯？要求分别写礼的角色、法的公开边界、强制风险、正当性和申诉。引一则原典或法治研究资料。变式改为网络社区规范。反例是只看违规数量，不问误判和寒蝉效应。后测为一个秩序方案画“规范—执行—申诉—复核”链，并说明哪处需要教育、哪处需要正式规则、哪处必须限制权力。',
        note: '秩序形成不等于制度正当。',
        objective: '能用礼、法、强制、正当性和问责诊断秩序方案。',
        practice: '完成图书馆与网络前测，写规范、执行、受影响者、申诉、滥用和证据。',
        checkpoint: '检查礼法区别、规则公开、权力约束、受影响者、申诉救济和秩序代价。',
      },
      {
        title: '材料与概念｜礼、法、秩序与正当性',
        body:
          '礼通过称谓、仪式、角色和态度塑造关系，也可分配资源与义务；法以公开规则、赏罚和程序提高可预期性。比较礼法时要看各自依赖的态度、强制和信息条件。法家重视执行和权势，现代法治理念还要求约束权力、保护权利和提供独立救济。正当性说明谁有权制定规则、依据何种理由以及如何回应异议。强制可以提高服从，却可能制造规避、误判和寒蝉效应。评价要同时看规则质量、执行信息、裁量、问责和受影响者，不能把“有秩序”当全部成功。',
        note: '强制只是制度的一环。',
        objective: '能解释礼、法、强制、正当性、法治和问责的关系。',
        practice: '为六个概念各写功能、风险机制、一个现实反例和一条来源依据。',
        checkpoint: '检查礼法机制、正当性、强制边界、程序、问责、权利和历史语境。',
      },
      {
        title: '示范与推导｜一条校规怎样才算完整',
        body:
          '示范手机管理规则：目标写清教学干扰与安全；规则公开；执行者接受培训；证据要求可核；学生可解释和申诉；定期复核影响。礼的部分通过课堂约定和关系教育形成习惯，法的部分提供明确边界和救济。反例是只加重处罚却不管误判和差异需求。变式改为考试诚信，检查隐私、举证和复核如何变化。结论必须说明哪种手段解决哪类问题，不能混成一个“严”字。',
        note: '每种手段解决不同问题。',
        objective: '能把礼法分析转成完整规范链，并说明教育、强制和救济的分工。',
        practice: '完成校规六步设计、两类手段分工、三个风险和一次考试变式。',
        checkpoint: '检查目标、公开性、执行证据、裁量、申诉、复核、比例和权利边界。',
      },
      {
        title: '引导练习｜八项秩序制度',
        body:
          '准备八题，覆盖课堂、宿舍、交通、平台、医疗排队、公共空间、处罚和申诉。每题先做前测列目标与受影响者，再分礼、法、强制和问责，后测写误判、滥用和修正。变式改变群体规模或执行资源，观察制度效果。记录“有处罚即法治”“礼等于礼貌”“多数同意即正当”等错误，并要求报告证据、裁量范围和复核周期。',
        note: '每项制度都要有纠错口。',
        objective: '能对八类制度完成机制分工、权力风险、救济和证据分析。',
        practice: '提交八张秩序链、三个规模变式、误判案例、申诉流程和错误分类。',
        checkpoint: '检查礼法分工、正当性、强制比例、执行信息、申诉复核和受影响者。',
      },
      {
        title: '独立迁移与评价｜设计一份可问责规范',
        body:
          '选择一个组织场景，先做前测列秩序目标和风险，再设计教育约定、公开规则、执行证据、裁量边界、申诉复核和数据复盘。引用一则礼法原典和一项法治研究。24 小时后改变成员构成做变式。评价四项：目标明确、规则可预期、权力受约束、救济可执行。最后写一个“违规下降就证明制度成功”的反例，并说明还需检查哪些误判和排斥。',
        note: '服从率不是唯一结果。',
        objective: '能把礼法比较迁移到制度设计，并用正当性、问责、权利和证据评价。',
        practice: '提交规范草案、制度链、24 小时变式、误判分析、申诉表和反例。',
        checkpoint: '四项自评：规则公开、裁量受限、申诉可达、结果有复核；缺一需重写。',
      },
    ],
    quiz: [
      question(
        '礼与法在课程中最重要的区别是什么？',
        '礼更重关系、仪式与态度，法更重公开规则、强制与问责',
        ['礼完全没有社会功能', '法只研究个人礼貌', '二者都只能靠处罚'],
        0,
        '礼和法都可能形成秩序，但机制不同。礼依赖角色、意义和习惯，法提供公开边界与执行程序；现实制度往往需要两者并用。',
        '事实与定义',
      ),
      question(
        '为什么“规则公开”不足以证明制度正当？',
        '还要检查谁制定规则、权力是否受约束、程序与救济是否公平',
        ['因为规则不应公开', '因为所有强制都无效', '因为公众永远不服从'],
        1,
        '公开能提高可预期性，却不能自动保护权利或限制制定者。现代法治还要求权力约束、程序正义、独立审查和救济。',
        '材料与推导',
      ),
      question(
        '哪种制度评价最片面？',
        '只看违规率下降，不检查误判、寒蝉效应和申诉困难',
        ['检查执行证据', '比较受影响者', '设置复核机制'],
        2,
        '违规率下降可能来自有效规范，也可能来自恐惧或放弃申诉。必须同时看误判、排斥和制度成本，不能以单一数字证明成功。',
        '常见误区',
      ),
      question(
        '设计校园规范时，哪种结构最完整？',
        '明确目标、公开规则、培训执行、允许解释申诉并定期复核',
        ['只提高处罚', '让执行者随意裁量', '把多数投票当全部程序'],
        0,
        '规范需要目标与手段匹配，也要有权力限制和纠错。解释、申诉和复核能发现误判，定期数据复盘则可修正规则本身。',
        '迁移应用',
      ),
    ],
  },
  'schools:自然与人为：技术时代的边界': {
    contentStatus: 'reviewed',
    prerequisite: '完成道家和专题对读前两课，能区分自然描述、价值判断与技术事实。',
    plainLanguageGoal:
      '学完后，你能用目的、替代、受益受损、风险和退出机制评估技术方案，并说明自然的规范边界。',
    guidedPractice:
      '分析八项技术或环境方案，写目的、自然与人为理由、风险、替代、受影响者和监测指标。',
    independentPractice:
      '为一个 AI、医疗或环境工具做技术伦理评估，给出可停止、可申诉和可复核的边界。',
    commonErrors: [
      '把自然等同未经改变的现状，忽略现状中的权力和伤害。',
      '把技术中立当责任豁免，忽略设计、部署和使用者选择。',
      '只比较平均收益，不看严重、不可逆和分配风险。',
    ],
    sourceRefs: NATURE_TECH_SOURCES,
    studyPoints: [
      point('必背', '自然不自动等于善，技术不自动等于进步；方案要比较目的、替代、受益受损、风险、可逆性和退出机制。', 1),
      point('重点', '道家少干预可提醒反噬，但技术治理还需现代风险、责任和权利分析。', 2),
      point('易错', '预防原则不是永久禁止，技术中立也不是无人负责。', 3),
      point('考点', '为一个工具写最低风险替代、监测指标、停用条件和受影响者申诉。', 4),
    ],
    eventDetails: [NATURE_TECH_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜不用新技术就更自然吗',
        body:
          '先做前测：拒绝自动诊断工具是否一定更自然、更安全？要求比较人工诊断的错误、等待、偏见和资源差异，并写技术方案的目的、替代、风险和退出。引一则道家或技术伦理来源。变式改为环境监测。反例是把旧做法天然正当，或把新工具效率当全部证据。后测为一个方案列三种选择，说明哪种风险最低、谁承担后果、什么监测会促使停止。',
        note: '不用技术也有风险。',
        objective: '能从自然理由、技术风险和替代方案诊断“用或不用”的二元争论。',
        practice: '完成诊疗与环境前测，写目的、替代、受益受损、风险、监测和反例。',
        checkpoint: '检查自然与现状区分、技术责任、风险比较、受影响者、替代和退出条件。',
      },
      {
        title: '材料与概念｜自然、人为、风险与责任',
        body:
          '自然可以指事物未经强制的条件，也可被用作价值赞词，两者不能混。技术是人为设计，但责任分散在设计、数据、部署和使用者之间，不能以中立为由免除。风险评价要同时看概率、严重性、可逆性、分配和未知，低风险替代与监测可降低不确定性。《老子》原典的少干预提醒检查过度造作和反噬，现代技术伦理补充同意、隐私、公平和问责。任何边界都要说明保护谁、限制谁和如何复核。',
        note: '自然理由也要接受审查。',
        objective: '能解释自然、人为、技术责任、风险、可逆性和预防边界。',
        practice: '为六个概念各写定义、一个价值误用、一个技术案例和一条来源依据。',
        checkpoint: '检查自然现状区分、技术责任、风险维度、受影响者、权利和监管边界。',
      },
      {
        title: '示范与推导｜一个 AI 工具的风险账本',
        body:
          '设 AI 辅助筛选简历：先写目标是减少阅读量，不能直接写提高公平。列人工基线、误筛、偏见、隐私、申诉和低风险替代。比较总体准确率、弱势群体错误率和不可逆机会损失。设监测、停用、人工复核和公开报告。反例是以平均准确率掩盖少数群体失败。变式改为辅助而非自动淘汰，检查责任和风险如何下降。最后区分可验证技术指标与价值选择。',
        note: '平均准确率会藏住伤害。',
        objective: '能把技术方案拆成目标、基线、受益受损、风险、替代和退出机制。',
        practice: '完成简历工具七栏表、三个指标、两个反例、一个辅助变式和停用条件。',
        checkpoint: '检查目标与价值、人工基线、分配风险、隐私申诉、可逆性和监测责任。',
      },
      {
        title: '引导练习｜八项技术边界卡',
        body:
          '准备八题，覆盖自动诊断、人脸识别、环境工程、自动驾驶、推荐算法、医疗器械、数据采集和低技术替代。每题先做前测列目的与受影响者，再写自然或人为理由、风险和替代，后测设监测与退出。变式改变部署规模或数据质量，观察风险。记录“自然即安全”“技术中立”“平均有效即公平”等错误，并要求每条方案说明证据、责任主体和申诉机制。',
        note: '规模改变，风险也会改变。',
        objective: '能对八项技术完成风险、替代、责任、公平和退出边界分析。',
        practice: '提交八张边界卡、三个部署变式、风险指标、申诉流程和错误分类。',
        checkpoint: '检查自然理由、技术事实、受益受损、可逆性、隐私、责任和监测退出。',
      },
      {
        title: '独立迁移与评价｜写一份技术边界评估',
        body:
          '选择一个安全技术议题，先做前测列目标、人工基线和受影响者，再用道家少干预与技术伦理共同检查。必须给低风险替代、严重失败、不可逆风险、监测指标和停用条件。24 小时后改变部署对象做变式。评价四项：目的明确、风险完整、替代可行、责任可追。最后写一个用“自然”拒绝所有改进或只用技术效率证明一切的反例，并修正。',
        note: '边界必须能被执行。',
        objective: '能把自然与技术比较迁移到治理评估，并用替代、风险、责任和退出评价。',
        practice: '提交评估表、原典与伦理来源、24 小时变式、申诉、监测和反例修订。',
        checkpoint: '四项自评：不把自然神圣化、不把技术中立化、风险分配可见、停用可操作。',
      },
    ],
    quiz: [
      question(
        '为什么“自然”不能自动作为正确性的证明？',
        '现状也包含权力、风险和伤害，需要说明自然在这里指什么以及保护谁',
        ['因为自然完全不存在', '因为所有人为改变都正确', '因为传统没有价值'],
        0,
        '自然可指未被强制的状态，也常被当价值赞词。若直接等同善，会忽略疾病、灾害和制度伤害，也会掩盖谁有权定义自然；具体定义还要说明谁有权力界定。',
        '事实与定义',
      ),
      question(
        '技术风险评估除平均收益外还要看什么？',
        '严重失败、不可逆损害、分配影响、未知和退出机制',
        ['只看宣传材料', '只问开发者是否自信', '只算使用人数'],
        1,
        '风险不是平均值。低概率高严重事件、弱势群体受损和不可逆后果都可能改变结论，监测与退出能力也属于设计质量；高风险场景可能需要分阶段验证。',
        '材料与推导',
      ),
      question(
        '哪种说法最误解预防原则？',
        '只要存在任何不确定性，就应永久禁止所有技术',
        ['不确定风险需要评估', '可考虑低风险替代', '监测和停止条件很重要'],
        2,
        '预防原则要求面对严重不确定性时谨慎，不等于禁止一切创新。还要比较替代、收益、证据和成本，不能把谨慎变成任意否决；应比较不同预防强度和替代方案。',
        '常见误区',
      ),
      question(
        '评估自动筛选工具时，哪种方案最完整？',
        '比较人工基线、不同群体错误、隐私申诉、人工复核和停用指标',
        ['只看总体准确率', '取消所有申诉', '假定算法不会歧视'],
        0,
        '公平问题可能被平均值掩盖。人工基线、分组错误、申诉与复核能揭示分配影响，停用指标则使边界可执行；分组数据和人工复核是必要证据。',
        '迁移应用',
      ),
    ],
  },
  'schools:权力与自由：谁来判断正当': {
    contentStatus: 'reviewed',
    prerequisite: '完成礼法对读，能分析规则、强制、正当性和问责。',
    plainLanguageGoal:
      '学完后，你能区分积极自由、消极自由和非支配，并分析权力授权、程序、退出和滥用风险。',
    guidedPractice:
      '分析八项权力安排，写自由类型、授权来源、限制范围、判断者、申诉和退出成本。',
    independentPractice:
      '为学校、平台或社区权力设计一份正当性审查表，比较不同自由观并写滥用反例。',
    commonErrors: [
      '把自由只理解成没有限制，忽略依赖和任意权力。',
      '把多数同意当所有决定的充分正当性。',
      '把积极自由用于替他人规定“真正利益”。',
    ],
    sourceRefs: POWER_FREEDOM_SOURCES,
    studyPoints: [
      point('必背', '消极自由关注免于干涉，积极自由关注自治与能力，非支配关注不受任意权力支配；三者需同时检查。', 1),
      point('重点', '权力正当性取决于授权、范围、程序、可争辩性、退出和救济，不只是效率或多数票。', 2),
      point('易错', '没有实际干涉也可能受支配；多数同意也可能侵犯权利。', 3),
      point('考点', '为一项权力安排写谁授权、管什么、如何判断、怎样反对和退出代价。', 4),
    ],
    eventDetails: [POWER_FREEDOM_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜没人管就等于自由吗',
        body:
          '先做前测：平台可以随时封号但暂未封你，你是否自由？要求分消极自由、积极自由、非支配、同意和法治判断。写权力范围、判断者、申诉和退出成本。引一则一手理论文本，标出它对自由的定义。变式改为学校宿舍管理。反例是只看是否发生干涉，或把用户协议当充分同意。后测为一项权力安排画授权、程序、复核和退出链，并说明三种自由观各看见什么、遗漏什么。',
        note: '潜在任意权力也是约束。',
        objective: '能用三种自由观和正当性条件诊断权力安排。',
        practice: '完成平台与宿舍前测，写授权、范围、干涉、支配、申诉和退出成本。',
        checkpoint: '检查自由类型、权力范围、同意质量、程序、可争辩性、退出和反例。',
      },
      {
        title: '材料与概念｜积极自由、消极自由与非支配',
        body:
          '消极自由强调免于他人干涉，保护个人空间；积极自由强调自治、参与和自我实现，却可能被权力借真正利益之名强制。共和主义非支配关注即使无干涉也存在任意权力，需要法律地位和可争辩保障。社会契约论讨论授权与政治义务，现代法治强调权力约束和救济。自由与能力、资源和依赖相关，正式选择不等于真实可行。比较时要写限制对象、判断者、失败条件和适用范围边界。',
        note: '自由有多种入口和风险。',
        objective: '能解释三种自由观、社会契约、法治和权力正当性。',
        practice: '为五种理论各写核心自由、制度要求、优点、风险和一条反例。',
        checkpoint: '检查自由概念、授权、可争辩性、能力资源、法治救济和滥用边界。',
      },
      {
        title: '示范与推导｜平台规则的正当性审查',
        body:
          '示范平台内容管理：目标是减少伤害；权力来自用户协议但同意可能不充分；规则需公开，处罚需证据，申诉需独立复核，退出成本需说明。消极自由关注表达空间，积极自由关注用户参与规则，非支配关注平台任意决定权。表格列目的、授权、证据、裁量、申诉和退出。反例是以“私有平台”或多数投票跳过基本权利。变式改为紧急安全封禁，检查时限与事后复核。',
        note: '紧急权力也要有日落条款。',
        objective: '能把平台权力拆成授权、规则、程序、申诉、退出和自由影响。',
        practice: '完成六栏审查、三种自由判断、两个反例、一个紧急封禁变式和来源注。',
        checkpoint: '检查同意质量、权力范围、证据裁量、独立复核、退出成本、比例和时限。',
      },
      {
        title: '引导练习｜八项权力安排',
        body:
          '准备八题，覆盖校园、平台、雇主、家庭、社区、警察、医疗和算法治理。每题先做前测列授权与自由影响，再写程序、申诉和退出，后测用权力滥用反例检验。变式改变紧急程度或资源差距，观察正当性。记录“不干涉即自由”“多数同意即正当”“反对就是违规”等错误，并要求说明谁判断、谁复核、何时失效。',
        note: '每个权力都要有判断边界。',
        objective: '能对八类权力完成自由、授权、程序、滥用和救济分析。',
        practice: '提交八张权力图、三个紧急变式、滥用案例、申诉流程和错误分类。',
        checkpoint: '检查自由类型、授权质量、裁量范围、复核独立性、退出成本、时限和滥用风险。',
      },
      {
        title: '独立迁移与评价｜设计一份正当性审查表',
        body:
          '选择一个组织权力场景，先做前测列目标和受影响者，再设计授权、范围、证据、听取意见、独立复核、退出和定期复审。比较三种自由观分别要求哪些保障。24 小时后扩大紧急权力做变式。评价四项：授权清楚、范围有限、可争辩、退出可行。最后写一个“无人投诉所以权力正当”的反例，并说明如何发现沉默和依赖。',
        note: '沉默不等于同意。',
        objective: '能把权力与自由理论迁移到组织制度，并用授权、程序、自由和反例评价。',
        practice: '提交审查表、三种自由比较、24 小时变式、沉默风险、申诉与复审。',
        checkpoint: '四项自评：不把无干涉等同自由、授权可追、复核独立、退出成本可见；否则修订。',
      },
    ],
    quiz: [
      question(
        '消极自由与积极自由的主要差别是什么？',
        '前者强调免于干涉，后者强调自治、参与或自我实现',
        ['前者只关心财富', '后者完全反对制度', '两者都只问法律条文数量'],
        0,
        '两种自由观关注不同问题，也可能互相支持或冲突。积极自由若替个人规定真正利益，会带来家长主义风险，需要制度限制；制度也要防止以真正自由之名强制个人。',
        '事实与定义',
      ),
      question(
        '为什么暂时没有干涉也可能存在非自由？',
        '权力仍可能任意支配个人，取决于是否有保障、可争辩和退出',
        ['因为自由只由天气决定', '因为所有规则都合理', '因为权力从不影响选择'],
        1,
        '非支配关注权力关系本身，而非只看是否正在干涉。若他人可任意改变你的处境且缺少救济，你仍处于依赖和支配中；法律保障和申诉渠道能降低任意支配。',
        '材料与推导',
      ),
      question(
        '哪种说法最误解政治正当性？',
        '只要多数投票通过，任何限制都自动正当',
        ['授权来源需要说明', '程序与权利需要检查', '少数应有申诉渠道'],
        2,
        '多数是授权的一部分，却不能自动取消基本权利、程序正义和独立审查。正当性需要范围、理由、可争辩性和救济共同支持，还需要公开理由和少数保护。',
        '常见误区',
      ),
      question(
        '审查平台封禁权时，哪种设计最完整？',
        '明确规则、证据、时限、人工复核、申诉和误封恢复',
        ['只写用户同意', '删除全部记录', '让同一算法复核自己'],
        0,
        '封禁权需要可预期程序与独立纠错。记录、时限和恢复能降低误判和任意性，也帮助外部审查比例原则；时限、恢复和独立复核能降低任意性。',
        '迁移应用',
      ),
    ],
  },
  'schools:知识与无知：如何知道我们知道': {
    contentStatus: 'reviewed',
    prerequisite: '完成权力自由对读，能区分事实、推断、价值与证据。',
    plainLanguageGoal:
      '学完后，你能评估证据与证言，识别认知不正义，并用置信、未知和推翻条件报告知识状态。',
    guidedPractice:
      '分析八项新闻、AI、专家和亲历证言，写证据类型、可靠性、置信、未知和可能的认知偏见。',
    independentPractice:
      '围绕一个公共健康或技术议题制作证据账本，分别记录事实、来源、推断、争议和推翻条件。',
    commonErrors: [
      '把自信、重复或流量等同知识。',
      '盲信单一专家，或因身份轻视有证据的证言。',
      '只记录支持结论的信息，不写未知和推翻条件。',
    ],
    sourceRefs: KNOWLEDGE_SOURCES,
    studyPoints: [
      point('必背', '知识需要适当证据和可靠性；置信、来源与推断要分开记录，未知和推翻条件同样属于结论。', 1),
      point('重点', '证言可信度看专业、证据、独立性和纠错机制，不只看身份或气势。', 2),
      point('易错', '认知不正义不是“谁都可以随便主张”，而是有证据的声音被身份偏见系统性压低。', 3),
      point('考点', '为一个判断制作证据账本，列出已知、未知、置信、替代解释和更新条件。', 4),
    ],
    eventDetails: [KNOWLEDGE_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜很多人都说就对吗',
        body:
          '先做前测：一个说法被大量转发，是否就可以说“我们知道”？要求分开信息数量、证据质量、来源独立性、推断和置信。引一则认识论或证言研究资料。变式改为只有亲历者知道的情境。反例是把流量当真理，或因群体身份忽略经验。后测建立一个证据账本，写已知、未知、替代解释、置信和什么证据会改变判断，并比较两种来源的可靠性。',
        note: '热度不是证据质量。',
        objective: '能区分信息、证据、知识、置信和证言可靠性。',
        practice: '完成转发与亲历前测，写来源、证据、未知、置信、偏见和推翻条件。',
        checkpoint: '检查证据与推断分层、来源独立、证言评估、认知不正义、置信和更新条件。',
      },
      {
        title: '材料与概念｜证据、证言与认知不正义',
        body:
          '知识通常要求真实、信念和适当依据，具体理论仍有争论。多数知识依赖证言，需要评估专业能力、利益、独立复现和纠错记录。原典或一手经验可以提供独特证据，但仍需交叉核对。社会制度能积累知识，也会通过遗漏和权力形成无知。证言不正义会压低某些群体的可信度，解释不正义会让经验缺少概念和表达空间。校准要求置信与长期证据命中相称。事实、推断、价值和未知要分栏，任何结论都应说明适用范围和变化的证据条件。',
        note: '知识要能承认自己会错。',
        objective: '能解释知识、证据、证言、认知不正义、无知与置信校准。',
        practice: '为六个概念各写定义、一个误用案例、一个证据要求和一条来源依据。',
        checkpoint: '检查知识条件、证言评估、身份偏见、制度遗漏、置信校准和边界。',
      },
      {
        title: '示范与推导｜两条冲突证言怎样核对',
        body:
          '示范两个目击者对事故时间说法不同：先记录原话和条件，再检查位置、记忆延迟、利益和独立证据。不能因一方身份低就降低可信度，也不能因另一方身份高就免检。表格列来源、直接证据、推断、矛盾和验证办法。反例是把“亲自看见”当绝对无误，或把专家意见当无需解释。变式加入监控时间戳，检查哪些判断可更新、哪些仍未知。',
        note: '证言要核条件，不核身份刻板印象。',
        objective: '能核对冲突证言并更新置信，同时识别认知不正义。',
        practice: '完成证言对照表、三项独立证据、两个反例、一个时间戳变式和更新记录。',
        checkpoint: '检查来源条件、利益、独立性、偏见、证据质量、未知和置信更新。',
      },
      {
        title: '引导练习｜八份知识证据账本',
        body:
          '准备八题，覆盖新闻、AI 回答、专家共识、个人证言、统计图、论文摘要、历史记录和制度遗漏。每题先做前测分事实与推断，再评来源与证言，后测写置信和推翻条件。变式改变样本或独立来源数量，观察结论。记录“自信即知识”“多数即真理”“身份决定可信度”等错误，并要求说明谁的经验可能被系统性忽略、如何补证。',
        note: '每个结论都要写未知。',
        objective: '能对八类证据完成来源评估、证言核对、偏见检查和置信更新。',
        practice: '提交八份证据账本、三个样本变式、认知不正义案例、反例和错误分类。',
        checkpoint: '检查事实推断、来源独立、专业与经验、认知不正义、置信校准和推翻条件。',
      },
      {
        title: '独立迁移与评价｜制作一个公共议题证据账本',
        body:
          '选择一个安全的健康、教育或技术议题，先做前测列已知和争议，再收集至少三类来源，记录事实、推断、未知、利益和置信。必须检查哪些群体声音可能被漏掉，并写出何种证据会改变结论。24 小时后加入一项新证据做变式。评价四项：来源可查、事实推断分开、证言公平、更新条件明确。最后写一个“没有证据也不能质疑”或“身份决定全部可信度”的反例并修正。',
        note: '可错性让知识更可靠。',
        objective: '能把认识论方法迁移到公共判断，并用证据、公平、置信和更新评价。',
        practice: '提交证据账本、三类来源、24 小时更新、未知清单、认知偏见检查和反例。',
        checkpoint: '四项自评：来源独立可查、事实与推断分开、弱势证言被公平评估、结论可修订。',
      },
    ],
    quiz: [
      question(
        '知识为什么不能只等于高置信？',
        '还需真实、适当证据和可靠性，自信本身不保证正确',
        ['因为知识不需要信念', '因为证据从不重要', '因为置信越低越正确'],
        0,
        '高的主观确信可能是偏见或误信息。认识论要求依据、可靠性或适当支持，并要求判断能接受反证和修正；错误证据应能改变置信。',
        '事实与定义',
      ),
      question(
        '评估证言可信度时，最合理的做法是什么？',
        '检查专业、直接经验、独立性、利益、证据和纠错记录',
        ['只看说话者身份', '只看声音大小', '只看转发数量'],
        1,
        '证言质量取决于具体条件，而不是刻板身份。身份偏见会压低有证据的声音，但也不能因此取消对证据和专业的核查；两类问题必须同时处理。',
        '材料与推导',
      ),
      question(
        '哪种说法最误解认知不正义？',
        '为了避免偏见，应无条件相信任何自称亲身经历的人',
        ['有些证言会因身份被低估', '解释资源也可能分配不均', '制度需要纠错机制'],
        2,
        '认知不正义要求公平评估，不是取消证据标准。亲历经验可能提供独特信息，但仍需语境、一致性和其他证据核对；公平评估要求解释标准和申诉机制。',
        '常见误区',
      ),
      question(
        '做公共议题证据账本时，哪种内容必须有？',
        '来源、事实、推断、未知、利益、置信和推翻条件',
        ['只收集支持己方的链接', '删除冲突证言', '把专家结论当不可质疑'],
        0,
        '证据账本让判断可复核和修订。冲突信息、未知和推翻条件能防止确认偏误，也帮助识别哪些声音被遗漏；记录版本可让判断被复核。',
        '迁移应用',
      ),
    ],
  },
  'schools:平等与差异：正义的两种入口': {
    contentStatus: 'reviewed',
    prerequisite: '完成权力自由与知识课程，能区分形式规则、资源和真实能力。',
    plainLanguageGoal:
      '学完后，你能比较形式平等、分配正义、罗尔斯原则和能力路径，并设计有目标的差异支持。',
    guidedPractice:
      '分析八项教育、医疗和无障碍方案，写相同规则、资源差异、能力障碍、资格、成本与复核。',
    independentPractice:
      '围绕一项差异支持政策写正义评估，说明目标、资格、隐私、申诉和退出条件。',
    commonErrors: [
      '把平等只理解为完全相同对待，忽略起点和障碍差异。',
      '把所有差异支持都视为特权，不检查目标与证据。',
      '用群体标签替代个体需要，忽略隐私、污名和申诉。',
    ],
    sourceRefs: EQUALITY_SOURCES,
    studyPoints: [
      point('必背', '形式平等要求相同规则，实质平等关注资源、机会和能力；差异支持必须说明目标、资格、隐私和复核。', 1),
      point('重点', '罗尔斯关注不平等能否改善最不利者，能力路径关注真实可行选择，两者都不只看资源数量。', 2),
      point('易错', '差异措施不等于无标准优待，相同规则也不自动产生公平结果。', 3),
      point('考点', '为一个差异方案写受益障碍、资格证据、替代方案、成本和停止条件。', 4),
    ],
    eventDetails: [EQUALITY_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜同一把尺就公平吗',
        body:
          '先做前测：考试提供同样时间是否公平？要求比较相同规则、资源、能力、无障碍、家庭条件和评价目标。引一则平等或能力研究资料，并核对其中使用的一手理论文本。变式改为延长考试时间或提供辅助技术。反例是只追求完全相同，不看谁无法参与；也不能把任何差异都当合理。后测为一项支持方案写目标、资格、受益障碍、成本、隐私和复核，并说明何时应停止或调整。',
        note: '相同规则也要检查可达性。',
        objective: '能从规则、资源、能力和障碍诊断形式平等与差异支持。',
        practice: '完成考试与辅助技术前测，写规则、资源、能力、资格、成本和反例。',
        checkpoint: '检查形式与实质平等、真实障碍、资格证据、隐私、成本和复核边界。',
      },
      {
        title: '材料与概念｜平等、分配、能力与差异',
        body:
          '形式平等要求相同规则和反歧视，实质平等关注资源、机会和结果差异。分配正义讨论什么应被公平分配，罗尔斯的差异原则允许部分不平等仅在改善最不利者时成立。能力路径进一步问人能否实际获得教育、健康、参与和尊严，而不只看资源数量。差异支持可为无障碍、补贴或定向资源，尤其要检查弱势群体是否被排除，但必须有目标、资格、证据、申诉和适用边界，防止标签与权力滥用。平等与差异不是二选一，而是不同正义入口。',
        note: '资源相同不等于能力相同。',
        objective: '能解释形式平等、分配正义、差异原则、能力路径和差异支持边界。',
        practice: '为五个概念各写定义、一个案例、一个优点、一个风险和一条反例。',
        checkpoint: '检查规则与结果、资源和能力、最不利者、资格隐私、成本与复核。',
      },
      {
        title: '示范与推导｜无障碍支持是否公平',
        body:
          '示范坡道和无障碍考试：目标不是给同一物品，而是让有障碍者获得参与能力。比较无障碍改造、个人补贴和统一取消台阶三种方案，列受益者、成本、可持续性、隐私和替代。反例是把支持当降低标准，或把群体标签强加给不需要者。变式改为临时伤病，检查资格与退出。结论要区分价值理由、证据和制度设计，并说明支持是否扩大真实选择。',
        note: '公平有时要求不同条件。',
        objective: '能用能力路径分析无障碍支持，并比较成本、资格和替代。',
        practice: '完成三方案比较、受益障碍表、两项反例、临时伤病变式和退出条件。',
        checkpoint: '检查目标、能力障碍、资格证据、成本分配、隐私、替代和复核风险。',
      },
      {
        title: '引导练习｜八项平等与差异议题',
        body:
          '准备八题，覆盖考试、无障碍、医疗、教育、住房、收入、语言支持和临时照护。每题先做前测列相同规则与能力障碍，再写至少两种正义方案，后测检查资格、成本、隐私和反例。变式改变群体规模或资源，观察方案。记录“平等即完全一样”“差异即特权”“群体标签等于个体需要”等错误，并要求每个方案说明谁决定、如何申诉和何时结束。',
        note: '差异支持也要可问责。',
        objective: '能对八类方案完成形式平等、资源、能力、资格和权利分析。',
        practice: '提交八张正义矩阵、三个规模变式、受益障碍表、申诉和错误分类。',
        checkpoint: '检查平等类型、能力障碍、资格证据、成本、隐私、替代和退出。',
      },
      {
        title: '独立迁移与评价｜设计一项差异支持',
        body:
          '选择教育、医疗或社区支持，先做前测列不平等机制，再写目标、对象、资格、资源、隐私、申诉和复核。比较不行动、统一规则和定向支持三种方案。至少引用三类来源。24 小时后改变资源或群体规模做变式。评价四项：目标清楚、资格公平、成本透明、可停可改。最后写一个“给群体贴标签就完成支持”的反例并修正。',
        note: '支持应扩大选择，不是固化标签。',
        objective: '能把正义理论迁移到差异政策，并用目标、资格、能力、成本和复核评价。',
        practice: '提交方案、三方比较、来源、24 小时变式、隐私申诉、退出条件和反例。',
        checkpoint: '四项自评：不把平等单一化、资格有证据、隐私受保护、支持可复核；否则修订。',
      },
    ],
    quiz: [
      question(
        '形式平等与实质平等的主要差别是什么？',
        '前者强调相同规则，后者关注资源、机会和能力差异造成的结果',
        ['前者只谈财富', '后者反对所有规则', '两者完全无关'],
        0,
        '相同规则能反对明显歧视，却未必消除障碍。实质平等继续检查资源、能力和可达性，但差异措施也需透明和复核；差异措施仍要接受目标和效果审查。',
        '事实与定义',
      ),
      question(
        '能力路径为什么不只看资源数量？',
        '相同资源在不同处境中可能无法转化为教育、健康或参与机会',
        ['因为资源永远无用', '因为所有人都需要同样帮助', '因为能力不需要制度'],
        1,
        '能力路径关注人实际能做什么和成为什么。转换条件、障碍和支持影响资源价值，因此要看真实可行选择；支持服务应扩大可行选择。',
        '材料与推导',
      ),
      question(
        '哪种差异支持最缺乏正当性？',
        '没有目标、资格和复核，只因身份标签就永久限制或优待某群体',
        ['公开目标和资格', '提供申诉渠道', '定期检查效果'],
        2,
        '差异支持需要说明解决何种障碍、谁符合条件、隐私如何保护以及何时调整。永久标签可能固化污名并扩大权力滥用；停止条件和个体申诉不可遗漏。',
        '常见误区',
      ),
      question(
        '设计无障碍考试时，哪种评估最完整？',
        '明确能力目标，比较统一规则与合理便利，检查成本、隐私、申诉和效果',
        ['只延长所有人时间', '取消评价标准', '用一个标签决定全部安排'],
        0,
        '合理便利应服务真实参与，而不是随意降低目标。比较替代、成本与复核能保护公平，也避免标签化和资源浪费；方案还要说明谁承担成本。',
        '迁移应用',
      ),
    ],
  },
};
