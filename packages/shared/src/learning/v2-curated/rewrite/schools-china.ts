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

const CONFUCIAN_ARCHIVE = {
  id: 'confucian-ren-li-junzi',
  kind: 'concept',
  title: '仁、礼与君子：儒家怎样从关系提出规范',
  period: '春秋末至战国',
  summary:
    '《论语》中的仁不是单一情绪，礼也不只是礼貌。文本把角色关系、行为分寸、自我约束和学习实践联系起来，君子则是持续修身的人格目标。',
  background:
    '春秋战国时期宗法礼制仍在，却难以单独约束列国与贵族行动。孔子及其后学要回答：在现实失序中，人凭什么约束自己，秩序又怎样从关系和制度中恢复。',
  timeline: [
    {
      date: '约前6—前5世纪',
      title: '礼制秩序面临竞争',
      body: '周代宗法、祭祀与身份礼制仍是政治语言，但诸侯竞争和贵族僭越削弱其约束力。儒家因此必须解释礼为何仍值得遵守，而不只重复仪式形式。',
      sourceIds: ['ctext-liji', 'sep-confucius'],
    },
    {
      date: '孔子时期',
      title: '以仁追问礼的内在依据',
      body: '《论语》多处把礼与仁、敬、哀等态度联系起来。外在动作若没有恰当情感和判断，就难以构成真正的礼；但只讲好心也会忽略角色和规范。',
      sourceIds: ['ctext-analects', 'sep-confucius'],
    },
    {
      date: '对话场景',
      title: '孝把规范放回具体关系',
      body: '孝不是一句抽象口号，而涉及供养、敬重、劝谏和丧祭等具体行为。不同弟子问孝得到不同回答，显示同一概念要结合提问者处境理解。',
      sourceIds: ['ctext-analects', 'sep-chinese-ethics'],
    },
    {
      date: '修身过程',
      title: '君子以学习与反省形成品格',
      body: '君子在文本中既指身份，也成为人格目标。好学、慎言、改过、言行一致和以义约束利益，构成可以逐项观察的修身要求。',
      sourceIds: ['ctext-analects', 'sep-confucius'],
    },
    {
      date: '战国展开',
      title: '孟子把义与不忍人之心推进论证',
      body: '孟子从恻隐等经验说明道德能力，并讨论义与利、仁政和修养。其论证不能直接回填到孔子原句，但显示儒家内部问题继续发展。',
      sourceIds: ['sep-chinese-ethics', 'ctext-analects'],
    },
    {
      date: '后世阅读',
      title: '注疏把原文变成多层解释传统',
      body: '何晏、朱熹等注家会在字词、篇章和义理上作不同判断。今天阅读必须区分经文、古代注疏、现代研究和自己的转述，避免把后起解释冒充原句。',
      sourceIds: ['ctext-analects', 'sep-confucius', 'sep-chinese-ethics'],
    },
  ],
  outcome:
    '可观察结果是能从短原文标出人物、动作和难词，引用注疏解释仁、礼、孝、义与君子，并明确区分原文和现代转述。',
  significance:
    '这一阅读方式训练把儒家当作可论证、可比较、也会受历史条件限制的思想传统，而不是一组人格口号。',
  sourceCards: [
    source(
      'ctext-analects',
      'Analects',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/analects',
      '核对《论语》原文、篇目与关键词语境。',
    ),
    source(
      'ctext-liji',
      'Book of Rites',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/liji',
      '核对礼制、角色与仪式语境。',
    ),
    source(
      'sep-confucius',
      'Confucius',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/confucius/',
      '核对孔子思想、仁礼关系和文本解释争议。',
    ),
    source(
      'sep-chinese-ethics',
      'Chinese Ethics',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/ethics-chinese/',
      '核对儒家伦理、义利与比较方法。',
    ),
  ],
} satisfies LearningV2EventDetail;

const YI_LI_ARCHIVE = {
  id: 'four-schools-yi-li-debate',
  kind: 'concept',
  title: '义利之辨：四家为何给出不同答案',
  period: '战国至秦汉思想整理',
  summary:
    '儒、墨、法、道都在处理利益、规范和秩序，却对“谁的利益”“由谁裁定”“用什么手段”回答不同。比较必须回到各自问题与论证，而非只贴学派标签。',
  background:
    '列国竞争使赏罚、外交、战争和民生分配成为紧迫问题。不同思想家对动机、制度、公共效用和自然秩序的强调各异，形成多条可竞争的规范路线。',
  timeline: [
    {
      date: '春秋末',
      title: '孔子把义与不正当逐利分开',
      body: '儒家并非不谈民众之利，而是反对以违背合宜关系和正当方式获取利益。义嵌入角色、礼与公共治理，不能简化成只看动机。',
      sourceIds: ['ctext-analects', 'sep-chinese-ethics'],
    },
    {
      date: '战国早期',
      title: '墨家从公共利害组织论证',
      body: '墨家以“兴天下之利，除天下之害”支持兼爱、非攻和节用。它要求比较行为对众人造成的后果，但总量收益仍需面对分配与少数权利问题。',
      sourceIds: ['ctext-mozi', 'sep-mohism'],
    },
    {
      date: '战国政治',
      title: '法家把自利纳入赏罚制度',
      body: '法家不依赖人人自觉，而用法、术、势和赏罚改变行为。它能解释执行与激励，却必须继续追问规则由谁制定、如何问责、是否会侵害基本权利。',
      sourceIds: ['ctext-hanfeizi', 'sep-legalism'],
    },
    {
      date: '战国思想',
      title: '道家质疑名分与功利框架',
      body: '《老子》警惕过度人为、争夺和名分制造的问题，主张减少强制干预。无为不等于完全不行动，而是对行动目的、尺度和反作用保持敏感。',
      sourceIds: ['ctext-dao', 'sep-daoism'],
    },
    {
      date: '比较阅读',
      title: '同一词不能直接跨文本平移到另一家',
      body: '义的合宜、墨家的公利、法家的法定赏罚、道家的自然都不是现代经济学“利益”的同义词。要分别说明对象、依据、执行者和代价。',
      sourceIds: ['sep-chinese-ethics', 'sep-daoism'],
    },
    {
      date: '现代应用',
      title: '把政策推论明确标为推论',
      body: '用先秦文本讨论现代政策时，原文只提供历史论证资源。制度环境、权利保障和可检验后果要另行说明，不能声称某家已经给出完整现代方案。',
      sourceIds: ['sep-chinese-ethics', 'sep-legalism', 'sep-mohism'],
    },
  ],
  outcome:
    '可观察结果是能为四家分别写问题、动机、规范依据、执行方式和反例，并在现代议题中区分原文、概念转译和政策推论。',
  significance:
    '义利对读训练同轴比较和最强论证复述，防止把思想史压成“谁更先进”的排名。',
  sourceCards: [
    source(
      'ctext-analects',
      'Analects',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/analects',
      '核对儒家义、利、礼与角色语境。',
    ),
    source(
      'ctext-mozi',
      'Mozi',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/mozi',
      '核对兼爱、非攻与公共利害论证。',
    ),
    source(
      'ctext-hanfeizi',
      'Han Feizi',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/hanfeizi',
      '核对法、术、势与赏罚制度。',
    ),
    source(
      'ctext-dao',
      'Dao De Jing',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/dao-de-jing',
      '核对无为、自然与少干预语境。',
    ),
    source(
      'sep-chinese-ethics',
      'Chinese Ethics',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/ethics-chinese/',
      '核对儒家、墨家与道家伦理比较。',
    ),
    source(
      'sep-mohism',
      'Mohism',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/mohism/',
      '核对墨家兼爱、功利与论证方法。',
    ),
    source(
      'sep-legalism',
      'Legalism in Chinese Philosophy',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/chinese-legalism/',
      '核对法家制度、权力与历史解释。',
    ),
    source(
      'sep-daoism',
      'Daoism',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/daoism/',
      '核对无为、自然与道家政治思想。',
    ),
  ],
} satisfies LearningV2EventDetail;

const DAO_ARCHIVE = {
  id: 'dao-wuwei-ziran',
  kind: 'concept',
  title: '道、无为与自然：少干预为什么不是不行动',
  period: '战国至魏晋注释传统',
  summary:
    '《老子》以道、反、无为和自然反思过度造作，《庄子》进一步讨论视角、齐物与自由。无为指向减少违背事物条件的强制行动，不是消极躺平。',
  background:
    '战国政治竞争强化法令、战争和名分争夺。道家文本一方面质疑人为标准的绝对性，一方面仍讨论治民、处世和如何行动，因此需要区分反强制、反判断与彻底不行动。',
  timeline: [
    {
      date: '战国传统',
      title: '道成为秩序与行动的尺度',
      body: '《老子》中的道不是可随意命令的人格神，而是万物生成、变化和行动必须考虑的根源性秩序。具体解释有争议，不能直接等同某一种现代自然观。',
      sourceIds: ['ctext-dao', 'sep-daoism'],
    },
    {
      date: '《老子》文本',
      title: '反者道之动提示反向作用',
      body: '过度追求、强制和显耀可能产生反作用，弱势、退让和节制也可能形成力量。此句需要放回全书政治与处世语境，不能变成成功学公式。',
      sourceIds: ['ctext-dao', 'sep-daoism'],
    },
    {
      date: '治理语境',
      title: '无为减少扰民式造作',
      body: '无为常与少法令、少强制、避免以统治者意志扭曲事务相连。它不是政府完全不存在，也不是任何领域都不采取行动，而是追问干预是否合宜。',
      sourceIds: ['ctext-dao', 'sep-daoism'],
    },
    {
      date: '《庄子》展开',
      title: '齐物审视立场与是非边界',
      body: '《庄子》通过寓言和多重视角质疑把局部标准当绝对真理。齐物不是宣布所有判断一样正确，而是要求看见判断所依赖的立场、语言和尺度。',
      sourceIds: ['ctext-zhuangzi', 'sep-daoism'],
    },
    {
      date: '魏晋以后',
      title: '注疏把道、自然和无为继续分层',
      body: '王弼等注家以不同哲学术语解释道与自然，后世道教也发展出不同实践传统。读本必须说明所用版本和注释，不能把某一注本等同先秦原文。',
      sourceIds: ['ctext-dao', 'ctext-zhuangzi', 'sep-daoism'],
    },
    {
      date: '现代转译',
      title: '技术治理要检查目的、依赖与反噬',
      body: '把少干预用于技术议题，要比较问题是否真实、是否有替代方案、是否制造依赖和长期副作用。自然不是一切未经设计的现状，无为也不能替代专业安全判断。',
      sourceIds: ['sep-daoism', 'sep-chinese-ethics'],
    },
  ],
  outcome:
    '可观察结果是能引用原文解释道、反、无为、自然与齐物，为一个现代干预问题写出少干预理由、替代行动和反例。',
  significance:
    '道家阅读训练区分反强制与反行动、视角差异与无判断，并保留文本版本和解释层次。',
  sourceCards: [
    source(
      'ctext-dao',
      'Dao De Jing',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/dao-de-jing',
      '核对道、反、无为与自然相关原文。',
    ),
    source(
      'ctext-zhuangzi',
      'Zhuangzi',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/zhuangzi',
      '核对齐物、视角与寓言语境。',
    ),
    source(
      'sep-daoism',
      'Daoism',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/daoism/',
      '核对道家文本、无为、自然与解释争议。',
    ),
    source(
      'sep-chinese-ethics',
      'Chinese Ethics',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/ethics-chinese/',
      '核对道家与儒家伦理的比较边界。',
    ),
  ],
} satisfies LearningV2EventDetail;

const MOHIST_ARCHIVE = {
  id: 'mohist-jianai-feigong-shangtong',
  kind: 'concept',
  title: '墨家论证：兼爱怎样连接非攻与尚同',
  period: '战国时期',
  summary:
    '墨家从天下祸乱出发，主张兼爱、非攻、尚贤、节用，并以尚同处理意见和治理。三表法把历史经验、百姓耳目与现实效用纳入论证检验。',
  background:
    '战国攻伐、奢侈和任人唯亲造成巨大成本。墨家不只提出道德理想，也尝试用可公共陈述的利害、制度和检验标准说服统治者与士人。',
  timeline: [
    {
      date: '战国早期',
      title: '从攻伐与贫穷描述问题',
      body: '墨家先列举战争、饥荒、奢侈和相互伤害，再问这些后果由哪些行为造成。问题描述连接伦理主张与政策判断，避免只讲抽象爱。',
      sourceIds: ['ctext-mozi', 'sep-mohism'],
    },
    {
      date: '《兼爱》诸篇',
      title: '兼爱要求把他人利益纳入行动理由',
      body: '兼爱不是取消亲疏或强制同一情感，而是反对只偏爱己方、不顾他人损害。其论证强调若人人以亏人自利行事，天下之害将扩大。',
      sourceIds: ['ctext-mozi', 'sep-mohism'],
    },
    {
      date: '《非攻》诸篇',
      title: '非攻把反侵略扩展到战争成本',
      body: '非攻批评以攻伐获利的行为，并指出杀少数人受罚而发动战争却被赞美的不一致。课程只做文本与历史分析，不转化为现实军事建议。',
      sourceIds: ['ctext-mozi', 'sep-mohism'],
    },
    {
      date: '治理方案',
      title: '尚贤与尚同处理任用和意见统一',
      body: '尚贤主张按能力任用，尚同讨论从基层到上级形成一致判断。但尚同也带来权力集中和异议空间问题，不能只当效率工具。',
      sourceIds: ['ctext-mozi', 'sep-mohism', 'sep-chinese-ethics'],
    },
    {
      date: '论证方法',
      title: '三表要求历史、经验和效用证据',
      body: '三表通常涉及古代圣王经验、百姓见闻和实际效用。它不是现代统计实验，但显示墨家重视可检验理由，并要求说明证据类型。',
      sourceIds: ['ctext-mozi', 'sep-mohism'],
    },
    {
      date: '后世命运',
      title: '墨学衰微不等于论证问题消失',
      body: '墨家在秦汉后传承衰弱，但其关于战争成本、公共福利和论证检验的问题仍可比较。评价时要区分历史影响、文本主张和现代重建。',
      sourceIds: ['sep-mohism', 'sep-chinese-ethics'],
    },
  ],
  outcome:
    '可观察结果是能为兼爱、非攻、尚贤、尚同、节用与三表分别引用原文，写出论证链、治理条件和最强反例。',
  significance:
    '墨家课程训练用公共理由检验伦理主张，同时警惕以总体效用压过分配、权利与异议。',
  sourceCards: [
    source(
      'ctext-mozi',
      'Mozi',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/mozi',
      '核对兼爱、非攻、尚同、尚贤、节用与三表。',
    ),
    source(
      'sep-mohism',
      'Mohism',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/mohism/',
      '核对墨家伦理、政治与论证方法。',
    ),
    source(
      'sep-chinese-ethics',
      'Chinese Ethics',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/ethics-chinese/',
      '核对墨家与儒家伦理的异同。',
    ),
    source(
      'ctext-analects',
      'Analects',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/analects',
      '核对儒家亲亲、义与公共秩序的比较语境。',
    ),
  ],
} satisfies LearningV2EventDetail;

const LEGALIST_ARCHIVE = {
  id: 'legalist-fa-shu-shi',
  kind: 'institution',
  title: '法、术、势：法家怎样拆解治理能力',
  period: '战国至秦',
  summary:
    '法家把秩序寄托在公开规则、赏罚、官僚考核和权位结构上。法、术、势分别处理规则、统治信息和权力位置，但效率不能替代正当性与问责。',
  background:
    '列国战争要求征兵、征税和行政动员，世袭贵族与私人关系难以满足国家能力需求。法家因此分析如何让规则可执行、官员可考核、君主权位可维持。',
  timeline: [
    {
      date: '战国变法',
      title: '国家竞争推动规则与户籍建设',
      body: '战争和财政压力促使各国改革税役、军功与地方治理。法家文本与这些制度变化相关，却不能把某本书直接等同全国统一实施的法律。',
      sourceIds: ['ctext-shangjunshu', 'sep-legalism'],
    },
    {
      date: '法家之“法”',
      title: '公开规则让赏罚可预期',
      body: '法强调公布、统一和执行，使臣民知道何种行为受赏罚。它可能提高可预期性，但若规则本身不受约束，也可能成为权力工具。',
      sourceIds: ['ctext-hanfeizi', 'sep-legalism'],
    },
    {
      date: '法家之“术”',
      title: '术处理信息不对称与官员考核',
      body: '君主无法亲自观察全部行政，需要核验言行、比较结果和识别欺瞒。术能降低信息问题，也带来监视、猜忌和权力滥用风险。',
      sourceIds: ['ctext-hanfeizi', 'sep-legalism'],
    },
    {
      date: '法家之“势”',
      title: '势关注权位与执行力',
      body: '即使有正确主张，没有位置和资源也难以执行。势把权力结构纳入分析，但把制度希望集中于最高权力，也会放大无人制衡的危险。',
      sourceIds: ['ctext-hanfeizi', 'sep-legalism'],
    },
    {
      date: '官僚赏罚',
      title: '把自利行为与可测结果连接',
      body: '法家用赏罚、权责和考核改变官员动机。课程任务要同时列出效率收益、指标操纵、责任归属和申诉救济，不能只问怎样让人服从。',
      sourceIds: ['ctext-hanfeizi', 'ctext-shangjunshu', 'sep-legalism'],
    },
    {
      date: '现代边界',
      title: '分析法家不等于推荐威权管理',
      body: '现代组织与公共治理需要透明规则，也需要基本权利、独立审查和问责。法家可作为权力分析资源，不能直接替代现代法治与正当程序。',
      sourceIds: ['sep-legalism', 'sep-chinese-ethics'],
    },
  ],
  outcome:
    '可观察结果是能区分法、术、势功能，为一项组织规则写出赏罚、信息检查、权力风险和救济机制。',
  significance:
    '法家课程训练从制度激励分析秩序，同时把效率、合法性和权利风险放在同一张评价表里。',
  sourceCards: [
    source(
      'ctext-hanfeizi',
      'Han Feizi',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/hanfeizi',
      '核对法、术、势、赏罚与官僚治理原文。',
    ),
    source(
      'ctext-shangjunshu',
      'Book of Lord Shang',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/shang-jun-shu',
      '核对战国变法、农战与制度设想。',
    ),
    source(
      'sep-legalism',
      'Legalism in Chinese Philosophy',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/chinese-legalism/',
      '核对法家文本、制度分析与解释争议。',
    ),
    source(
      'sep-chinese-ethics',
      'Chinese Ethics',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/ethics-chinese/',
      '核对法家与儒道伦理及治理比较。',
    ),
  ],
} satisfies LearningV2EventDetail;

const MING_YINYANG_ZONGHENG_ARCHIVE = {
  id: 'names-yinyang-diplomacy',
  kind: 'concept',
  title: '名实、阴阳与纵横：三种论证技术的边界',
  period: '战国至秦汉',
  summary:
    '名家分析名称与所指，阴阳家以关联框架解释自然与政治，纵横家计算国家利益和联盟。三者都发展出论证技术，却不能被当作同一种“智慧格言”。',
  background:
    '战国辩论、外交和宇宙论解释同时活跃。概念辨析需要处理语言与外延，政治联盟需要评估承诺与威胁，阴阳五行则需要把季节、方位和制度放入关联秩序。',
  timeline: [
    {
      date: '战国辩论',
      title: '名实问题进入公共论辩',
      body: '名称是否准确指向对象，影响法令、伦理和逻辑判断。名家把日常语言中的分类与外延拿出来分析，而不是只追求一句反常识名言。',
      sourceIds: ['ctext-gongsunlongzi', 'sep-school-names'],
    },
    {
      date: '《公孙龙子》',
      title: '白马命题区分概念范围',
      body: '“白马非马”可被读作讨论“白马”与“马”两个概念在外延和限定上的差异，不是直接否认现实中的白马属于马类。必须区分命题层级。',
      sourceIds: ['ctext-gongsunlongzi', 'sep-school-names'],
    },
    {
      date: '阴阳五行',
      title: '关联框架组织自然与政治',
      body: '阴阳、四时、五行可把方位、季节、颜色、政令和德性放入相生相克网络。它提供整体分类和历史合法性语言，却不自动构成现代因果证据。',
      sourceIds: ['ctext-lvshi', 'iep-yinyang'],
    },
    {
      date: '战国外交',
      title: '纵横家评估威胁、联盟与背叛成本',
      body: '合纵与连横不是固定道德阵营，而是不同国家在具体力量格局中的联盟策略。游说词会突出短期利害，读者要检查建议者的位置与承诺可信度。',
      sourceIds: ['ctext-zhanguoce', 'sep-chinese-ethics'],
    },
    {
      date: '文本形成',
      title: '故事、论辩与后世编纂层层叠加',
      body: '《战国策》等材料经过整理，人物言辞未必是现场逐字记录。分析联盟策略时要区分事件、策士说辞、编纂立场和现代解释。',
      sourceIds: ['ctext-zhanguoce', 'sep-school-names'],
    },
    {
      date: '现代使用',
      title: '概念分析、关联分类和策略说服不能混用',
      body: '把阴阳五行直接当科学模型会越界，把纵横术直接用于现实谈判也缺少伦理与条件。三种技术的证据标准和适用领域必须分别说明。',
      sourceIds: ['iep-yinyang', 'sep-school-names', 'sep-chinese-ethics'],
    },
  ],
  outcome:
    '可观察结果是能拆解白马命题的外延，说明阴阳五行的历史功能，分析一次合纵连横的利害与可信度，并指出三类知识的证据边界。',
  significance:
    '本课训练区分语言分析、关联宇宙论和策略说服，避免把它们混成不可检验的“东方智慧”。',
  sourceCards: [
    source(
      'ctext-gongsunlongzi',
      'Gongsun Longzi',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/gongsunlongzi',
      '核对白马、名实与外延相关原文。',
    ),
    source(
      'sep-school-names',
      'School of Names',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/school-names/',
      '核对名家语言分析与哲学解释。',
    ),
    source(
      'iep-yinyang',
      'Yinyang (Yin-yang)',
      'Internet Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://iep.utm.edu/yinyang/',
      '核对阴阳观念、关联思维与历史语境。',
    ),
    source(
      'ctext-zhanguoce',
      'Strategies of the Warring States',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/zhan-guo-ce',
      '核对合纵连横、游说与外交语境。',
    ),
    source(
      'ctext-lvshi',
      'Lüshi Chunqiu',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/lv-shi-chun-qiu',
      '核对阴阳、四时与政治关联材料。',
    ),
    source(
      'sep-chinese-ethics',
      'Chinese Ethics',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/ethics-chinese/',
      '核对先秦思想比较与伦理评价边界。',
    ),
  ],
} satisfies LearningV2EventDetail;

const PRACTICAL_SCHOOLS_ARCHIVE = {
  id: 'agriculture-war-medicine-syncretism',
  kind: 'concept',
  title: '农、兵、医、杂：知识怎样面对真实条件',
  period: '战国至秦汉',
  summary:
    '农家讨论生产、分工和治理，兵家计算情报、粮秣与地形，医家以整体关系解释身体，杂家综合编纂多家材料。四类知识都需明确证据、用途和现代边界。',
  background:
    '先秦知识并不只围绕抽象伦理。农业、军事、医学和文献编纂都有具体技术与社会条件，也常与政治秩序和价值判断交织。',
  timeline: [
    {
      date: '战国农家',
      title: '农家把耕作与治理放在一起争论',
      body: '农家既关心土壤、水利和劳力，也讨论君主是否应与民并耕、社会分工是否合理。技术建议、经济交换和权力分配要分层阅读。',
      sourceIds: ['ctext-mengzi', 'sep-chinese-ethics'],
    },
    {
      date: '兵学传统',
      title: '兵家先算情报、粮秣和地形',
      body: '《孙子兵法》把战争视为高成本行动，强调知彼知己、后勤和条件。它不是鼓励冒险，也不能被简化成现实军事操作指导。',
      sourceIds: ['ctext-art-of-war'],
    },
    {
      date: '医学文本',
      title: '医家以关系网络解释身体与季节',
      body: '《黄帝内经》传统涉及阴阳、脏腑、经络和四时关系。它属于历史医学理论，不能替代现代诊断、药物和急诊处理，课程只做文本与思想史阅读。',
      sourceIds: ['ctext-huangdi-neijing', 'iep-yinyang'],
    },
    {
      date: '杂家编纂',
      title: '《吕氏春秋》综合多家而不等于无立场',
      body: '杂家汇集不同材料并重新编排，体现统一知识和服务治理的雄心。综合会造成概念拼接，因此要追踪每段来源、语境与编纂目的。',
      sourceIds: ['ctext-lvshi', 'sep-chinese-ethics'],
    },
    {
      date: '文本传承',
      title: '技术经验和后世整理必须分开',
      body: '农书、医书和兵书都可能经历口传、增补和注释。现代读者需说明版本，不能把汉代以后内容直接当战国原貌，也不能把一项经验当普遍规律。',
      sourceIds: ['ctext-mengzi', 'ctext-huangdi-neijing', 'ctext-art-of-war'],
    },
    {
      date: '现代边界',
      title: '历史知识需要用途、风险和证据审查',
      body: '农家可用于理解生产与分工，兵家可用于文本与战略史，医家必须与现代医学边界分开。任何现实应用都要说明条件、失败风险和替代解释。',
      sourceIds: ['sep-chinese-ethics', 'ctext-huangdi-neijing'],
    },
  ],
  outcome:
    '可观察结果是能为农、兵、医、杂四类材料分别写问题、方法、证据类型、历史语境和现代不可直接套用的原因。',
  significance:
    '本课让思想史与技术史互相校验，既承认古代知识的具体成就，也拒绝把历史权威自动转化为现代专业结论。',
  sourceCards: [
    source(
      'ctext-mengzi',
      'Mengzi',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/mengzi',
      '核对农家、分工与孟子相关论辩。',
    ),
    source(
      'ctext-art-of-war',
      'The Art of War',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/art-of-war',
      '核对兵家情报、条件与战争成本。',
    ),
    source(
      'ctext-huangdi-neijing',
      'Huangdi Neijing',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/huangdi-neijing',
      '核对医家整体关系与历史医学语境。',
    ),
    source(
      'ctext-lvshi',
      'Lüshi Chunqiu',
      'Chinese Text Project',
      '公版原文，2025 年访问版',
      'https://ctext.org/lv-shi-chun-qiu',
      '核对杂家综合编纂与材料来源。',
    ),
    source(
      'iep-yinyang',
      'Yinyang (Yin-yang)',
      'Internet Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://iep.utm.edu/yinyang/',
      '核对阴阳关联思维及其历史边界。',
    ),
    source(
      'sep-chinese-ethics',
      'Chinese Ethics',
      'Stanford Encyclopedia of Philosophy',
      '2025 年访问版',
      'https://plato.stanford.edu/entries/ethics-chinese/',
      '核对先秦思想比较与规范评价。',
    ),
  ],
} satisfies LearningV2EventDetail;

const CONFUCIAN_SOURCES = [
  '《论语》公版原文，按篇目核对。https://ctext.org/analects',
  '《礼记》公版原文，用于核对礼制与角色语境。https://ctext.org/liji',
  'Stanford Encyclopedia of Philosophy, Confucius。https://plato.stanford.edu/entries/confucius/',
  'Stanford Encyclopedia of Philosophy, Chinese Ethics。https://plato.stanford.edu/entries/ethics-chinese/',
];

const YI_LI_SOURCES = [
  '《论语》公版原文。https://ctext.org/analects',
  '《墨子》公版原文。https://ctext.org/mozi',
  '《韩非子》公版原文。https://ctext.org/hanfeizi',
  '《老子》公版原文。https://ctext.org/dao-de-jing',
  'Stanford Encyclopedia of Philosophy, Chinese Ethics。https://plato.stanford.edu/entries/ethics-chinese/',
];

const DAO_SOURCES = [
  '《老子》公版原文。https://ctext.org/dao-de-jing',
  '《庄子》公版原文。https://ctext.org/zhuangzi',
  'Stanford Encyclopedia of Philosophy, Daoism。https://plato.stanford.edu/entries/daoism/',
  'Stanford Encyclopedia of Philosophy, Chinese Ethics。https://plato.stanford.edu/entries/ethics-chinese/',
];

const MOHIST_SOURCES = [
  '《墨子》公版原文。https://ctext.org/mozi',
  'Stanford Encyclopedia of Philosophy, Mohism。https://plato.stanford.edu/entries/mohism/',
  'Stanford Encyclopedia of Philosophy, Chinese Ethics。https://plato.stanford.edu/entries/ethics-chinese/',
  '《论语》公版原文，用于儒墨比较。https://ctext.org/analects',
];

const LEGALIST_SOURCES = [
  '《韩非子》公版原文。https://ctext.org/hanfeizi',
  '《商君书》公版原文。https://ctext.org/shang-jun-shu',
  'Stanford Encyclopedia of Philosophy, Legalism in Chinese Philosophy。https://plato.stanford.edu/entries/chinese-legalism/',
  'Stanford Encyclopedia of Philosophy, Chinese Ethics。https://plato.stanford.edu/entries/ethics-chinese/',
];

const MING_SOURCES = [
  '《公孙龙子》公版原文。https://ctext.org/gongsunlongzi',
  '《战国策》公版原文。https://ctext.org/zhan-guo-ce',
  '《吕氏春秋》公版原文。https://ctext.org/lv-shi-chun-qiu',
  'Stanford Encyclopedia of Philosophy, School of Names。https://plato.stanford.edu/entries/school-names/',
  'Internet Encyclopedia of Philosophy, Yinyang。https://iep.utm.edu/yinyang/',
];

const PRACTICAL_SOURCES = [
  '《孟子》公版原文，用于核对农家与分工论辩。https://ctext.org/mengzi',
  '《孙子兵法》公版原文。https://ctext.org/art-of-war',
  '《黄帝内经》公版原文。https://ctext.org/huangdi-neijing',
  '《吕氏春秋》公版原文。https://ctext.org/lv-shi-chun-qiu',
  'Internet Encyclopedia of Philosophy, Yinyang。https://iep.utm.edu/yinyang/',
];

export const SCHOOLS_CHINA_REWRITE: CuratedCoursePlanPatchMap = {
  'schools:儒家：仁、礼与君子': {
    contentStatus: 'reviewed',
    prerequisite: '无需古文基础；会使用带篇目和注释的公版原文，并能区分引文与自己的解释。',
    plainLanguageGoal:
      '学完后，你能从《论语》短段解释仁、礼、孝、义与君子的关系，并分别标注原文、注疏和现代转述。',
    guidedPractice:
      '选读六则《论语》短段，标人物、动作、难词、篇目和注释，再写仁、礼、君子三条概念卡与一个反例。',
    independentPractice:
      '围绕“遵守礼制是否等于有仁德”写一段有证据的短文，至少引用两则原文和一个注疏解释。',
    commonErrors: [
      '把仁只当善良情绪，忽略关系、实践和自我约束。',
      '把礼只当礼貌或繁文缛节，漏掉角色、仪式和秩序维度。',
      '把后世注疏或现代心理学直接说成孔子原话。',
    ],
    sourceRefs: CONFUCIAN_SOURCES,
    studyPoints: [
      point('必背', '仁是关系与实践中的道德关切，礼包含行为分寸、角色和制度维度，君子是持续修身的人格目标；三者互相约束。', 1),
      point('重点', '读一则原文先标人物、动作、难词和篇目，再引注疏；不同注家解释必须注明来源。', 2),
      point('易错', '仁不等于一次性善意，礼不等于礼貌，孝也不等于无条件服从；都要看具体行为和语境。', 3),
      point('考点', '区分原文、古代注疏、现代研究和自己的转述，并为一个现代情境说明适用边界。', 4),
    ],
    eventDetails: [CONFUCIAN_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜守礼的人一定有仁吗',
        body:
          '先做前测：一个人仪式动作完整却态度冷漠，另一个人出于关心却随意破坏重要礼制，谁更接近《论语》的仁与礼？要求先引原文、标篇目，再区分字词、人物动作和自己的判断。变式换成只有口头善意却没有行动的情境。反例是把仁等同内心感受、把礼等同外在表演。后测为两则短段写“原文证据—注疏解释—现代转述”三层卡，并说明证据不足以推出什么。',
        note: '先引原句，再作判断。',
        objective: '能从短原文区分仁、礼、态度、行为和历史语境，暴露口号化理解。',
        practice: '完成两组前测，标原文篇目、人物动作、难词、注疏与自己的转述。',
        checkpoint: '检查引文是否准确、篇目是否给出、原文与解释是否分层、反例是否可回应。',
      },
      {
        title: '材料与概念｜仁、礼、孝、义与君子',
        body:
          '《论语》的仁出现在爱、敬、克己、修身与关系实践之中，不能被一条定义封闭。礼包括仪式、称谓、分寸、角色和秩序；没有恰当态度的礼会空洞，没有规范判断的善意也可能伤害他人。孝要结合供养、敬重、劝谏和丧祭等语境。义约束获取利益的方式，君子则是可观察的学习、言行和改过目标。读这些概念要结合春秋战国历史语境和角色制度；注疏会发展原文，必须标明何晏、朱熹等解释层次，不能把后世转述倒灌成原句。',
        note: '概念要靠行为和篇目落地。',
        objective: '能引用文本解释仁、礼、孝、义、君子及注疏与原句的层次差异。',
        practice: '为五个概念各写一条原文线索、一个关系判断、一个现代误读和一条待核来源。',
        checkpoint: '检查概念是否回到原文、是否区分角色与制度、是否保留注释来源和适用边界。',
      },
      {
        title: '示范与推导｜从“礼”到“仁”的完整推理',
        body:
          '示范选《论语》中谈礼与敬、或孝与态度的短段：第一步抄原文并标篇目，第二步查难词和句读，第三步列人物动作，第四步比较一则古注与现代研究，第五步写“因此本段更支持什么、不能推出什么”。例如仪式形式可以训练分寸，但缺少敬与关切时不能自动证明仁。反例是把“礼”直接译成礼貌，再把礼貌等同道德全部。变式换一则谈君子言行的材料，检查推理链是否仍需同样证据。',
        note: '解释越强，越要写依据。',
        objective: '能完成从原文、字词、注疏到概念判断和限定结论的示范推理。',
        practice: '完成一则原文的五步注读、两注对照、概念关系图和一个不能推出的结论。',
        checkpoint: '检查引文准确、句读合理、注疏有出处、推理不过度、反例与限定句完整。',
      },
      {
        title: '引导练习｜六则原文的概念三角',
        body:
          '准备六则短材料，覆盖仁与爱、礼与敬、孝与劝谏、君子与言行、义与利、学习和改过。每题先做前测标人物动作，再查一处注疏，后测用原文证据判断概念关系并写反例。变式让同一概念出现在不同对话对象中，比较答案差异。记录“把仁当情绪”“把礼当礼貌”“把注疏当原文”“用现代个人主义直接解释”等错误，并要求每条结论都能回到篇目和字词。',
        note: '同一问题，换一则材料再验。',
        objective: '能对六则原文完成注读、概念比较、注疏核对和反例检验。',
        practice: '提交六张三角卡、篇目与字词表、两则注疏对照、三个变式和错误分类。',
        checkpoint: '检查原文/注疏/转述三层、人物语境、概念关系、反例质量和版本说明。',
      },
      {
        title: '独立迁移与评价｜写一页有来源的概念短文',
        body:
          '选择“礼是否足以保证仁”或“君子首先看言行还是身份”写一页短文，至少使用两则原文和一个注疏，另引一项现代研究作解释参照。先列最强反方，再回应其证据。24 小时后换一则材料做变式，检查论点是否仍成立。评价四项：引文准确、层次清楚、反例有力、现代转述有边界。最后写一个把《论语》原句与后世理学命题混为一谈的反例，并说明如何查篇目校正。',
        note: '结论必须带来源与边界。',
        objective: '能把儒家概念阅读迁移到独立论证，并用原文、注疏、反例和边界评价。',
        practice: '提交一页短文、引文表、注疏出处、最强反方、24 小时变式和混淆校正记录。',
        checkpoint: '四项自评：原文可查、注疏分层、论证回应反例、现代应用不越界；缺项需补证据。',
      },
    ],
    quiz: [
      question(
        '阅读《论语》一则短句时，第一步最合适做什么？',
        '核对篇目和原文，标出人物、动作、难词与句读',
        ['先给孔子思想下总定义', '直接套现代心理学结论', '只看白话翻译不看原文'],
        0,
        '短句的意义依赖对话对象和上下文。先固定原文、篇目与字词，才能讨论概念；直接套总定义会把复杂材料压成口号，也容易混入后世解释。',
        '事实与定义',
      ),
      question(
        '为什么不能把“礼”只译成礼貌？',
        '礼还涉及仪式、角色、分寸、制度与秩序，礼貌只覆盖部分日常行为',
        ['因为礼完全没有外在形式', '因为礼貌与任何规范无关', '因为古代文本没有礼字'],
        1,
        '礼在材料中连接外在仪式和内在态度，也分配角色与义务。只译成礼貌会漏掉制度维度，只把它当强制又会漏掉敬与情感。',
        '材料与推导',
      ),
      question(
        '哪种写法最不符合原文、注疏和转述分层？',
        '直接写“孔子认为人性本善”，却不说明这是孟子或后世注家的命题',
        ['标注《论语》篇目', '注明朱熹注释', '把现代解释写成“我的转述”'],
        2,
        '不同文本和注家的主张不能互相回填。把战国或后世命题直接冒称孔子原话，会破坏证据链；应标明作者、文本和解释层次。',
        '常见误区',
      ),
      question(
        '把儒家概念迁移到校园规则讨论时，哪种做法最严谨？',
        '先引原文说明礼与仁的张力，再分析现代学校角色、权利和后果，并标出推论',
        ['声称孔子已给出完整校规', '只引一句名言不作解释', '把所有服从都称为仁'],
        0,
        '古代概念可为现代讨论提供问题，却不能替代现代制度分析。引用、解释、现实条件和政策推论分开，才能看出适用价值与风险。',
        '迁移应用',
      ),
    ],
  },
  'schools:义利之辨：儒墨法道四路对读': {
    contentStatus: 'reviewed',
    prerequisite: '完成儒家入门，能区分原文、注释与现代解释，并愿意先复述再反驳。',
    plainLanguageGoal:
      '学完后，你能在同一问题下比较儒、墨、法、道的义利论证，写出各自最强理由、执行代价和现代应用边界。',
    guidedPractice:
      '为四家各读两则短原文，填写问题、人的动机、义利关系、秩序方案、证据和最强反例。',
    independentPractice:
      '围绕一项公共激励方案制作四家对读卡，引用至少三家原文，并写出一条现代制度不能直接套用的原因。',
    commonErrors: [
      '把儒家说成只讲义、完全不顾民众利益。',
      '把墨家公共效用简化成个人自私或简单多数投票。',
      '把道家无为等同完全不行动，把法家赏罚等同现代法治。',
    ],
    sourceRefs: YI_LI_SOURCES,
    studyPoints: [
      point('必背', '四家都讨论利益与秩序，但分别从合宜关系、公共效用、法定赏罚和少干预自然出发；比较的是论证结构，不是人物排名。', 1),
      point('重点', '先复述每家“问题—动机—方法—目标”，再列最强反例；不得把现代利益概念直接覆盖义、法、自然。', 2),
      point('易错', '儒家并非不谈利，墨家不是简单自私，道家无为不是不作为，法家公开赏罚也不自动等于现代法治。', 3),
      point('考点', '在同一公共议题中区分原文、概念转译、制度推论和可检验后果。', 4),
    ],
    eventDetails: [YI_LI_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜给灾区捐款越多越有义吗',
        body:
          '先做前测：一笔捐款若为了声誉，是否仍有公共价值？要求分别以儒、墨、法、道提出追问：动机、合宜关系、公共效用、制度激励和名分反作用。先写四家可能同意与不同意的部分，不急着裁决。引用时把原文、注疏和现代转述分栏，并交代各家历史语境，不能把解释当原句。变式把捐款换作企业税收优惠。反例是用现代“利”字覆盖四家全部概念，或只按代表人物立场投票。后测为四家各写一条原文依据、一个论证和一条反例。',
        note: '先分开问题，再比较答案。',
        objective: '能从动机、关系、公共后果、制度和自然反作用诊断义利问题。',
        practice: '完成捐款与税收两组前测，写四家追问、暂定理由、原文需求和反例。',
        checkpoint: '检查是否分别界定义与利、是否复述四家、是否避免现代词义覆盖和人物标签。',
      },
      {
        title: '材料与概念｜义、利、兼爱、法与无为',
        body:
          '儒家的义强调合宜关系与正当获取，同时讨论民众福祉；墨家以兴天下之利、除天下之害支持兼爱和非攻，重点是公共利害而非个人贪利；法家用公开规则和赏罚让自利行为可预期，但规则正当性另需论证；道家警惕名分、过度干预和争夺制造反噬，无为要求重新检查行动尺度。四家共享“秩序如何可能”的问题，却不共享同一套人性、证据和制度语言，概念转译必须保留差异。',
        note: '同轴比较，不平摊概念。',
        objective: '能解释四家各自的义利结构、公共效用法、赏罚和少干预主张。',
        practice: '为四家填写问题、动机、规范依据、执行者、公共后果与一个不可互换词。',
        checkpoint: '检查每家概念边界、论证依据、执行代价、历史语境与现代词义区分。',
      },
      {
        title: '示范与推导｜同一政策为什么出现四种反对',
        body:
          '设一项高额奖金鼓励举报。法家会先问规则是否公开、赏罚能否执行；墨家会计算公共收益与误报伤害；儒家会问是否破坏信任、角色义务和正当动机；道家会担心奖励制造诬告与名分争夺。示范为每个判断写原文线索、推理步和可能反例，例如墨家需处理总收益与少数人权利冲突。变式把奖金改为荣誉表彰，观察四家关注点如何变化。',
        note: '反对理由要能对应原文。',
        objective: '能把四家框架应用于同一激励制度，并写出各自最强理由和失败条件。',
        practice: '完成奖金案例四栏表、每栏两条推理、一个支持点、一个反例和条件变式。',
        checkpoint: '检查是否真正复述最强版本、是否用错学派、是否讨论分配与执行代价。',
      },
      {
        title: '引导练习｜四家八段原典对读',
        body:
          '准备八段材料，儒墨法道各两段，覆盖义与取、公利与伤害、赏罚与规则、无为与反噬。每题先做前测标关键词和语境，再写论证链，后测由另一段同家材料检验解释是否一致。变式把同一政策从短期改到长期，观察后果判断。记录“儒家只谈动机”“墨家只算总数”“法家等于法治”“道家反对所有行动”等错误，并要求为每家准备一个最难回应的现实情境。',
        note: '每段原文都要找到反例。',
        objective: '能对八段原典完成关键词、论证链、同家互证和最强反例分析。',
        practice: '提交八张原文卡、四家对读表、三组政策变式、反例和错误分类。',
        checkpoint: '检查原文篇目、概念区分、论证完整、同家一致、反例有效和现代边界。',
      },
      {
        title: '独立迁移与评价｜做一张四家政策对读卡',
        body:
          '选择教育补贴、公共举报或平台流量分配等安全议题，先做前测列四家可能判断，再各引至少一则原文写支持理由、执行代价和反例。把现代政策推论单独标色，说明历史条件与今日制度差异。24 小时后改变受助对象或执行规模做变式。评价四项：原文可查、复述公平、比较同轴、推论有边界。最后写一个“某家必然给出唯一现代方案”的反例，并说明还缺哪些经验证据。',
        note: '原文、转译、政策分开写。',
        objective: '能把四家义利框架迁移到公共议题，并用原文、公平复述、代价和边界评价。',
        practice: '提交四家卡、原文引用、政策推论、24 小时变式、最强反对和证据缺口。',
        checkpoint: '四项自评：未歪曲对手、比较维度一致、原文与推论分层、现实条件完整；缺一需修订。',
      },
    ],
    quiz: [
      question(
        '义利对读时最应先做什么？',
        '分别界定各家文本中的义、利、法和自然，再放在共同问题下比较',
        ['先判断哪家最先进', '只背四位代表人物', '把所有利都当金钱'],
        0,
        '共同词在不同文本中对象不同。先做概念注和语境，才能比较各家如何回答秩序与行为问题，避免用一个现代定义强行覆盖四家。',
        '事实与定义',
      ),
      question(
        '墨家“兴天下之利”最需要补充哪项检查？',
        '总收益之外还要检查利益分配、少数权利和实现手段',
        ['只要总量增加就无须讨论伤害', '只计算君主收益', '完全拒绝公共后果'],
        1,
        '公共效用要求比较众人利害，但总量不能自动解决分配与权利冲突。还要问谁承担代价、是否被欺骗以及制度能否被检验。',
        '材料与推导',
      ),
      question(
        '哪种比较最容易把法家误读成现代法治？',
        '看到公开赏罚就认定权力已受约束、权利已有保障',
        ['区分法与术', '追问规则由谁制定', '检查问责机制'],
        2,
        '法家重视规则和赏罚，但现代法治还包含权力约束、正当程序、基本权利和独立救济。形式公开不等于这些条件已经满足。',
        '常见误区',
      ),
      question(
        '把四家用于平台激励规则时，哪种分析最完整？',
        '分别写儒家信任、墨家公共效用、法家执行责任、道家反噬风险，再列证据缺口',
        ['只引用一句名言', '假定一家自动解决全部问题', '忽略执行者和受损者'],
        0,
        '现实议题需要把四家当互补追问而非完整方案。每栏都应有原文、机制、受影响者和可检验后果，最后再形成自己的制度判断。',
        '迁移应用',
      ),
    ],
  },
  'schools:道家：无为与自然': {
    contentStatus: 'reviewed',
    prerequisite: '完成儒家入门，能区分《老子》《庄子》与后世注疏，不把一句名言当全书结论。',
    plainLanguageGoal:
      '学完后，你能从原文解释道、反、无为、自然与齐物，区分少干预和不行动，并说明现代应用边界。',
    guidedPractice:
      '对读六则《老子》《庄子》材料，写关键词、行动建议、反作用、替代方案和最强反例。',
    independentPractice:
      '针对一个技术或管理干预情境写“少干预评估表”，说明何时行动、何时等待及如何验证结果。',
    commonErrors: [
      '把无为解释成完全不行动或放弃责任。',
      '把自然等同未经设计的现状，忽视权力与伤害。',
      '把齐物理解为所有判断一样正确，取消证据标准。',
    ],
    sourceRefs: DAO_SOURCES,
    studyPoints: [
      point('必背', '无为的核心是减少违背事物条件的强制造作，不等于不作为；自然也不是一切现状都合理。', 1),
      point('重点', '读“反者道之动”要分析过度追求、反向作用和全书语境，不能改成成功学因果公式。', 2),
      point('易错', '齐物质疑把局部标准绝对化，不表示所有主张同样正确，也不取消可检验证据。', 3),
      point('考点', '为一个干预问题写目的、替代行动、长期反噬、验证指标和不行动责任。', 4),
    ],
    eventDetails: [DAO_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜不管就是无为吗',
        body:
          '先做前测：公园出现垃圾时，管理者完全不处理是否就是《老子》所说的无为？要求区分不行动、少强制、改变激励和让社区自行组织。引一则原文，标行动者、对象和预期反作用。变式换成学校手机管理。反例是用“顺其自然”掩盖失职或既得利益。后测为一个干预写三种方案，并说明哪种更接近无为、依据是什么、怎样验证。',
        note: '无为先问怎样行动。',
        objective: '能用原文区分不行动、少干预和顺势行动，并识别“顺其自然”滥用。',
        practice: '完成公园与手机两组前测，写行动者、干预强度、替代方案、反作用和验证指标。',
        checkpoint: '检查原文依据、无为定义、责任归属、现状权力、反例和可检验后果。',
      },
      {
        title: '材料与概念｜道、反、无为、自然与齐物',
        body:
          '《老子》用道描述万物秩序与行动尺度，反者道之动提示过度有为可能引起反向结果。无为常与少扰民、少强制和不用单一意志扭曲事务相连，但仍需具体行动。《庄子》的齐物通过寓言和多重视角质疑把局部是非当绝对标准，并不取消全部判断。自然不是任何现状都合理，而是事物条件、关系与自发秩序需要被理解。现代转述要结合战国历史语境，文本、注疏和生态或管理概念必须分层。',
        note: '自然的现状也要审查权力。',
        objective: '能解释道、反、无为、自然、齐物及其政治与认识论边界。',
        practice: '为五个概念各写一则原文、一个现代误读、一个反例和一条尚待核实的解释。',
        checkpoint: '检查文本归属、概念关系、过度推演、反例、注疏层次和现代语义差异。',
      },
      {
        title: '示范与推导｜从“过度控制”到“少干预”',
        body:
          '示范一个社区噪音治理问题：若规则过细、执法频繁，可能引发规避和冲突；若完全不处理，又让受影响者失去保护。依据原文只能支持“检查强制是否必要、是否制造反噬”，不能直接给出具体法规。推理分为问题、受影响者、原方案、反作用、替代行动和验证指标六步。反例是管理者借无为放弃责任。变式把短期噪音改为长期施工，观察何时必须明确规则与救济。',
        note: '少干预也要承担后果。',
        objective: '能把无为转成可检验的干预评估，并区分文本依据与现代制度设计。',
        practice: '完成六步治理表、一则原文、一个反噬回路、两个替代方案和验证指标。',
        checkpoint: '检查原文是否支持推论、受影响者是否完整、反作用是否具体、责任与验证是否遗漏。',
      },
      {
        title: '引导练习｜六则道家的情境判断',
        body:
          '准备六则材料，覆盖少法令、反作用、柔弱、自然、齐物和技与道。每题先做前测注字词与语境，再写一个行动建议，后测用长期后果和受影响者检验。变式把个人修身改成公共治理，检查概念是否越界。记录“无为等于躺平”“自然等于现状”“齐物等于无标准”“任何反向都证明道家正确”等错误，并为每条建议写不行动的责任和可测指标。',
        note: '每个建议都要能失败。',
        objective: '能对六则材料完成概念注、治理转译、反例和失败条件分析。',
        practice: '提交六张情境卡、两则注疏、三个治理变式、反噬回路和错误分类。',
        checkpoint: '检查原文语境、无为尺度、自然与现状区分、责任、指标和可反驳性。',
      },
      {
        title: '独立迁移与评价｜写一份少干预评估',
        body:
          '选择一个安全的技术、环境或管理情境，先做前测列各方目标和现状问题，再引用《老子》或《庄子》一则原文提出少干预方案。必须写清谁行动、何时等待、替代措施、长期监测和不作为后果。24 小时后改变受影响群体或时间尺度做变式。评价四项：原文匹配、利益相关者完整、反噬分析具体、验证方式可执行。最后写一个用“自然”维护既得利益的反例并说明如何识别。',
        note: '自然不是替现状辩护。',
        objective: '能把道家概念迁移到干预评估，并用原文、责任、反噬和验证评价。',
        practice: '提交评估表、原文与注疏、行动和等待条件、24 小时变式、指标及反例。',
        checkpoint: '四项自评：引文不过度、受影响者无遗漏、少干预有替代方案、监测与责任清楚。',
      },
    ],
    quiz: [
      question(
        '“无为”在课程材料中最准确的理解是什么？',
        '减少违背事物条件的强制造作，同时保留合宜行动与责任',
        ['任何情况下都不行动', '完全取消制度和规则', '只听强者安排'],
        0,
        '无为不是消极缺席。它要求检查干预的目的、尺度和反作用，也可能采取少而关键的行动；完全不作为只是其中一种可能误读。',
        '事实与定义',
      ),
      question(
        '为什么不能把“反者道之动”直接当成功学公式？',
        '它需要放回《老子》的政治与处世语境，具体因果不能由一句原文直接推出',
        ['因为这句话没有文本来源', '因为反向作用从不存在', '因为《老子》只谈自然科学'],
        1,
        '原句提示反向和过度作用，却不是保证“先退一定成功”的机械规律。使用时要说明语境、机制、条件和反例，不能把哲学句变保证。',
        '材料与推导',
      ),
      question(
        '哪种说法最误解“齐物”？',
        '既然要看到不同视角，所以所有证据和判断都同样正确',
        ['局部标准可能被绝对化', '判断依赖语言和立场', '应比较不同观察尺度'],
        2,
        '齐物质疑单一视角的绝对性，不表示取消真假与证据。不同判断仍可比较理由、后果和可重复性，否则会失去论证责任。',
        '常见误区',
      ),
      question(
        '把道家用于技术治理时，哪种评估最完整？',
        '比较干预目的、替代方案、受影响者、长期反噬和监测指标，并保留必要行动',
        ['看到问题就完全不管', '把所有新技术称为不自然', '只引一句名言'],
        0,
        '技术问题需要具体制度与证据。道家可提醒检查过度控制和反作用，但必须同时分析利益、风险和替代方案，不能替代工程与公共决策。',
        '迁移应用',
      ),
    ],
  },
  'schools:墨家：兼爱、非攻与尚同': {
    contentStatus: 'reviewed',
    prerequisite: '完成儒家与道家入门，能区分伦理主张、政策方案和论证证据。',
    plainLanguageGoal:
      '学完后，你能解释兼爱、非攻、尚贤、尚同、节用与三表，并为墨家论证写出公共效用、分配和异议边界。',
    guidedPractice:
      '分析六则《墨子》材料，写问题、受益与受损者、论证链、证据类型、执行条件和最强反例。',
    independentPractice:
      '围绕一项公共安全方案写墨家式论证，同时检查总收益、分配、少数权利和异议表达。',
    commonErrors: [
      '把兼爱等同取消亲疏或要求所有人情感完全相同。',
      '只计算总收益，忽略谁承担代价和少数权利。',
      '把尚同当无条件服从，或把三表当现代统计证据。',
    ],
    sourceRefs: MOHIST_SOURCES,
    studyPoints: [
      point('必背', '兼爱要求把他人利益纳入行动理由，非攻反对侵略战争，尚贤重能力任用，尚同讨论意见统一但必须防范权力集中。', 1),
      point('重点', '墨家论证常从天下祸害、公共效用和历史经验出发；要同时检查总收益、分配、执行和异议空间。', 2),
      point('易错', '三表不是现代随机试验，兼爱不是取消一切差异，尚同也不等于上级永远正确。', 3),
      point('考点', '用墨家框架分析公共政策时，必须列出受益者、受损者、证据类型、执行成本和反例。', 4),
    ],
    eventDetails: [MOHIST_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜多数人受益就能牺牲少数吗',
        body:
          '先做前测：一项公共工程让九成人受益，却迫使少数人承担全部损失，是否可称为“兴天下之利”？要求复述墨家可能的支持与反对理由，分别列出总收益、分配、权利、执行和异议。变式把补偿从全额改为一成。反例是只报总收益、不看受损者，或把兼爱等同人人同感。后测用一则原文写公共效用法，并补一个分配反例和可验证指标。',
        note: '总利之外要看谁受损。',
        objective: '能用墨家公共利害框架识别总收益、分配、权利和异议问题。',
        practice: '完成工程两组前测，写受益者、受损者、总利、分配、证据和可能反例。',
        checkpoint: '检查是否真正复述墨家、是否区分总量与分配、是否讨论执行和异议。',
      },
      {
        title: '材料与概念｜兼爱、非攻、尚贤、尚同与三表',
        body:
          '墨家从相互伤害和天下祸乱出发，主张以兼爱扩展行动理由，以非攻限制侵略和战争伤害，以尚贤改善任人唯亲，以节用约束奢侈耗费。尚同试图统一判断和执行，却可能压缩异议，因此需要制度限制。三表把历史经验、百姓见闻与实际效用作为检验线索，但不是现代随机对照试验。阅读注疏时要把原句与后世转述分栏，并交代战国历史语境；公共效用还必须处理利益分配、权利底线和承诺可信度，不能只算总量。',
        note: '效用要和权利同时检查。',
        objective: '能解释墨家核心概念、公共效用法、尚同风险和三表证据边界。',
        practice: '为五个概念各写原文线索、政策含义、受益与受损者和一个反例。',
        checkpoint: '检查原文、概念区分、公共效用层次、尚同风险、三表边界和执行成本。',
      },
      {
        title: '示范与推导｜把“非攻”转成政策评估',
        body:
          '示范一项跨境冲突的民用防护预算：墨家式推理先列攻击、误伤、流离失所和资源耗损等公共伤害，再比较谈判、防护、制裁与军事升级的可能后果。原文支持慎战与减害，不能直接给出具体军事行动。表格分为目标、手段、受益者、受损者、可验证指标和最坏后果。反例是把非攻理解成任何时候都不能防御。变式缩小到社区安全，检查推理是否仍保留比例与证据。',
        note: '减害不等于放弃防护。',
        objective: '能把非攻转成冲突减害评估，并区分文本原则与现实安全决策。',
        practice: '完成四方案减害表、原文依据、最坏后果、防护边界和一个安全变式。',
        checkpoint: '检查是否区分进攻与防护、是否列平民代价、是否有证据和现实专业边界。',
      },
      {
        title: '引导练习｜六张墨家论证卡',
        body:
          '准备六段材料，覆盖兼爱、非攻、尚贤、节用、尚同和三表。每题先做前测找问题与关键词，再写受益者、受损者和论证链，后测用历史经验、见闻或效用中至少两类证据检验。变式改变受助群体或执行规模，观察公共效用和异议风险。记录“总量最大即正当”“尚同等于服从”“三表等于统计显著”等错误，并要求写出一个最强反例和补救方案。',
        note: '每张卡都要写受损者。',
        objective: '能对六类墨家材料完成论证复述、公共利害、证据检验和制度风险分析。',
        practice: '提交六张论证卡、三组规模变式、反例修复、来源和错误分类。',
        checkpoint: '检查概念准确、总量与分配并重、三表类型、尚同异议风险和政策边界。',
      },
      {
        title: '独立迁移与评价｜写一份公共效用评估',
        body:
          '选择校园安全、公共卫生或社区资源分配情境，先做前测列问题与受影响者，再用兼爱和非攻的减害视角提出方案。必须给出总量收益、分配后果、少数权利、异议渠道、执行成本和检验指标。24 小时后扩大受益范围或缩小预算做变式。评价四项：原文匹配、利益相关者完整、效用与权利并重、证据可检验。最后写一个“最多数受益所以无需补偿”的反例并修正。',
        note: '公共效用必须可被质疑。',
        objective: '能把墨家公共论证迁移到现实政策评估，并用原文、分配、权利和证据评价。',
        practice: '提交评估表、原文两则、受益受损名单、24 小时变式、指标和反例修复。',
        checkpoint: '四项自评：不把墨家简化、分配完整、异议有渠道、证据可检验；否则修订。',
      },
    ],
    quiz: [
      question(
        '墨家“兼爱”最接近哪种理解？',
        '反对只偏爱己方而伤害他人，要求把他人利益纳入行动理由',
        ['要求每个人情感强度完全相同', '取消所有家庭关系', '只爱与自己相似的人'],
        0,
        '兼爱是伦理与治理论证，不是强制统一情感。它批评亏人自利和只顾己方，但如何处理亲疏、制度与动机仍需结合原文讨论。',
        '事实与定义',
      ),
      question(
        '为什么公共效用不能只报告总收益？',
        '还要说明谁承担成本、少数权利是否受损以及补偿和执行是否可信',
        ['因为总收益永远没有意义', '因为只应计算君主收益', '因为不需要任何证据'],
        1,
        '总量只显示加总结果，无法揭示分配和权利问题。政策评估要列出受益者、受损者和执行成本，否则多数收益可能掩盖严重不公。',
        '材料与推导',
      ),
      question(
        '哪种说法最误解墨家“尚同”？',
        '尚同就是下级无条件服从上级，任何异议都应被禁止',
        ['尚同涉及意见统一和执行', '尚同可能带来权力集中风险', '尚同需要制度限制'],
        2,
        '尚同讨论如何形成共同判断，但统一不能自动证明正确，也可能压缩异议。阅读时要同时分析治理效率、纠错机制和权力风险。',
        '常见误区',
      ),
      question(
        '把墨家框架迁移到社区防诈骗时，哪种分析最完整？',
        '比较骗局伤害、宣传成本、覆盖人群、误伤与申诉，并用真实数据检验',
        ['只统计宣传册数量', '把所有嫌疑人都公开点名', '引用一句兼爱就结束'],
        0,
        '防诈骗方案涉及公共收益，也涉及误判、隐私和申诉。墨家式评估可帮助比较减害与执行，但必须补充现代权利和数据证据。',
        '迁移应用',
      ),
    ],
  },
  'schools:法家：法、术、势': {
    contentStatus: 'reviewed',
    prerequisite: '完成儒、道、墨比较，能区分制度效率、正当性和历史语境。',
    plainLanguageGoal:
      '学完后，你能区分法、术、势，分析赏罚和官僚考核的执行效果、权力风险与问责缺口。',
    guidedPractice:
      '分析六段《韩非子》《商君书》材料，填写规则、信息、权位、激励、执行者和滥用风险。',
    independentPractice:
      '为一个组织设计透明规则与考核方案，同时写权力约束、申诉救济和指标操纵的防线。',
    commonErrors: [
      '把法家“法”直接等同现代法治、基本权利和独立司法。',
      '只看到赏罚效率，不分析谁制定规则、谁监督最高权力。',
      '把术理解成办公室权谋，忽略信息不对称与官僚考核问题。',
    ],
    sourceRefs: LEGALIST_SOURCES,
    studyPoints: [
      point('必背', '法处理公开规则与赏罚，术处理信息与官员考核，势处理权位与执行力；三者相互配合，也共同放大缺乏问责的风险。', 1),
      point('重点', '评价法家制度要同时写效率、可预期性、权力约束、权利保障和申诉救济。', 2),
      point('易错', '公开赏罚不等于现代法治；术不等于私人阴谋；势也不保证判断正确。', 3),
      point('考点', '为一个组织方案画出规则—信息—权力—责任链，并指出指标操纵和滥用位置。', 4),
    ],
    eventDetails: [LEGALIST_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜公开赏罚就够了吗',
        body:
          '先做前测：学校公布迟到罚款规则，执行后迟到减少，是否说明制度已经完善？要求分析法是否公开、术是否能核验事实、势由谁掌握、处罚能否申诉。变式把罚款改为班级荣誉扣分。反例是只看服从率，不问误判、权力滥用和弱势者代价。后测为一项规则画“规则—信息—权力—责任—救济”链，并用一则法家原文说明它能解释和不能解释的部分。',
        note: '效率之外还要问责。',
        objective: '能用规则、信息、权位、责任和救济诊断法家式制度设计。',
        practice: '完成罚款与扣分前测，写规则、执行者、证据、申诉、滥用风险和原文依据。',
        checkpoint: '检查是否区分法术势、是否讨论误判与问责、是否把法家等同现代法治。',
      },
      {
        title: '材料与概念｜法、术、势与官僚赏罚',
        body:
          '法强调公开、统一和可执行的赏罚，降低臣民对行为后果的不确定；术处理统治者与官僚间的信息不对称，包括核验言行、比较结果和识别欺瞒；势关注权位、资源和执行能力，说明仅有正确主张未必能落地。三者结合可提升国家动员和行政效率，却也可能加强监视、任意权力和指标操纵。阅读注疏时要分开原句和后世转述，并放回战国变法历史语境；现代评价必须用可核证据检查规则正当性、基本权利、独立审查和救济，不能把历史制度直接当今日法治。',
        note: '三件工具不能混成一个“严”。',
        objective: '能解释法、术、势、赏罚、官僚考核及其效率和权力风险。',
        practice: '为三个概念各写一则原文、一个制度功能、一个滥用方式和一项现代约束。',
        checkpoint: '检查概念区别、历史语境、执行链、权力风险、正当性和现代边界。',
      },
      {
        title: '示范与推导｜一个考核指标怎样被操纵',
        body:
          '设公共窗口按办件数量奖励，工作人员可能拆分事项、追求快件而忽略复杂个案。法家式分析先问规则是否公开、指标能否核验、上级怎样获得信息、权位如何纠偏；随后补充现代审查：办事质量、申投诉、隐私和弱势者结果。示范画规则、信息、激励、行为和反噬五栏。反例是只提高奖励或加强监视，却不检查指标本身。变式把数量改为满意度，观察新的操纵风险。',
        note: '指标会塑造行为。',
        objective: '能分析赏罚指标如何塑造行为，并用信息和问责定位失真。',
        practice: '完成五栏考核链、两个指标变式、一个操纵路径、一条申诉和一项修正。',
        checkpoint: '检查规则公开、信息来源、激励方向、操纵风险、权责和现代权利保障。',
      },
      {
        title: '引导练习｜六张法家制度图',
        body:
          '准备六段材料，覆盖公开规则、赏罚一致、官员核验、权势位置、农战动员和权力滥用。每题先做前测标行动者与资源，再画规则—信息—权力链，后测写效率收益、受影响者、滥用风险和修正。变式改变监督者或处罚强度，观察行为反应。记录“法是现代法治”“术是办公室阴谋”“势大即正确”“罚得重就有效”等错误，并要求每条制度设计都有申诉和失败条件。',
        note: '每条规则都要配纠错。',
        objective: '能对六类法家材料完成制度拆解、激励预测、权力风险和救济设计。',
        practice: '提交六张制度图、两个奖惩变式、操纵路径、问责表、原文和错误分类。',
        checkpoint: '检查法术势区分、执行链、权力约束、受影响者、申诉救济和现代边界。',
      },
      {
        title: '独立迁移与评价｜设计一套可问责规则',
        body:
          '选择一个安全组织情境，先做前测列目标、风险和受影响者，再设计公开规则、信息核验、权责分配、申诉与复核。用一则法家原文说明哪部分受其启发，再说明哪些现代约束必须补充。24 小时后改变指标或处罚强度做变式。评价四项：规则可预期、信息可核验、权力受约束、救济可执行。最后写一个“只要结果变好就可忽略误判”的反例，并说明怎样用独立审查修正。',
        note: '制度不能只奖励服从。',
        objective: '能把法家分析迁移到组织制度，并用效率、权力、权利和救济评价。',
        practice: '提交规则草案、信息与权责图、24 小时变式、申诉流程、指标和反例修正。',
        checkpoint: '四项自评：执行链完整、滥用风险可见、权利有保护、复核可操作；缺项需重写。',
      },
    ],
    quiz: [
      question(
        '法、术、势在课程中分别主要关注什么？',
        '公开规则与赏罚、信息与官僚考核、权位与执行力',
        ['家庭礼仪、诗歌和音乐', '农学、医学和历法', '语言翻译、商贸和航海'],
        0,
        '三者是不同治理工具。法处理可预期规则，术处理统治信息，势处理位置和资源。把它们合并成“严刑”会丢失制度分析。',
        '事实与定义',
      ),
      question(
        '为什么“纪律变好”不足以证明一套赏罚制度完善？',
        '还要检查误判、指标操纵、权力滥用、申诉和受影响者权利',
        ['因为纪律永远无价值', '因为所有奖励都无效', '因为规则不需要公开'],
        1,
        '服从率可能来自有效规则，也可能来自恐惧或错误指标。制度评价必须同时看可预期性、事实核验、救济和权力约束，不能只看单一结果。',
        '材料与推导',
      ),
      question(
        '哪种说法最误导？',
        '法家有公开赏罚，因此已经具备现代法治的全部要素',
        ['法家重视规则执行', '术涉及信息不对称', '势可能放大权力风险'],
        2,
        '现代法治还要求权力受约束、正当程序、基本权利和独立司法。法家提供治理分析资源，却不能自动满足这些制度条件。',
        '常见误区',
      ),
      question(
        '把法家用于团队绩效改革时，哪种设计最完整？',
        '公开指标、核验数据、明确权责、设申诉复核，并监控指标操纵',
        ['只提高罚款', '让主管无记录决定', '只看短期排名'],
        0,
        '绩效规则会改变行为。若不设申诉和复核，成员可能追求数字而伤害质量。制度应同时考虑信息、权力和纠错，而非只加强处罚。',
        '迁移应用',
      ),
    ],
  },
  'schools:名家、阴阳家与纵横家': {
    contentStatus: 'reviewed',
    prerequisite: '完成儒、道、墨、法比较，能区分概念分析、宇宙论分类和策略说服。',
    plainLanguageGoal:
      '学完后，你能拆解名实命题，说明阴阳五行的历史功能，分析纵横联盟，并分别指出三类证据边界。',
    guidedPractice:
      '分析六组名家、阴阳和纵横材料，写概念所指、分类目的、利益格局、承诺可信度和证据类型。',
    independentPractice:
      '为一次多方合作制作名实澄清、关联分类与利益联盟三张表，并写出现代应用禁区。',
    commonErrors: [
      '把“白马非马”直接理解成现实中白马不属于马。',
      '把阴阳五行的历史分类功能说成已获现代科学证明。',
      '把纵横家的每一次游说都当成功策略，忽略建议者利益和承诺风险。',
    ],
    sourceRefs: MING_SOURCES,
    studyPoints: [
      point('必背', '名家分析名称与所指，阴阳家用关联体系组织自然政治，纵横家计算国家利益与联盟；三者的问题和证据标准不同。', 1),
      point('重点', '白马命题要区分概念外延与日常分类，阴阳五行要标历史用途，纵横分析要列参与方、威胁和承诺可信度。', 2),
      point('易错', '名辩不是无意义文字游戏，阴阳不是现代科学定论，纵横术也不是脱离伦理的万能谈判公式。', 3),
      point('考点', '遇到跨领域说法时先判定它属于概念分析、关联分类还是策略说服，再选相应证据。', 4),
    ],
    eventDetails: [MING_YINYANG_ZONGHENG_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜一句反常识就是深刻吗',
        body:
          '先做前测：“白马非马”若按日常话理解显然与经验冲突，为什么还可能构成哲学命题？要求分开词语所指、概念外延和现实分类。变式换成“会员不是人”这类现代句，检查偷换范围。反例是只凭语感宣布名辩无意义，或把名辩当任意颠倒概念。后测给一则联盟材料，要求区分名实澄清、阴阳分类和纵横利益计算，并写出各自需要的证据。',
        note: '先问命题在哪个层级。',
        objective: '能用所指、外延、分类和利益判断区分三类材料，暴露混读。',
        practice: '完成白马与联盟两组前测，写概念范围、现实对象、分类目的、承诺和证据类型。',
        checkpoint: '检查日常句与概念命题分层、对象范围、分类功能、联盟参与者和证据标准。',
      },
      {
        title: '材料与概念｜名实、阴阳五行与合纵连横',
        body:
          '名家关注名称、对象、限定和外延是否一致。“白马”增加颜色限定，可形成与“马”不同的概念集合，但现实中的白马仍属于马类，两层不能混。每条命题先抄原文，再说明注释和现代转述的差异。阴阳家把季节、方位、政令和五行放入关联网络，具有分类、合法化和整体解释功能，不是现代统计因果模型。纵横家评估国家安危、邻国威胁、盟约收益与背叛成本，合纵连横随力量格局变化，还需标明人物、历史语境和目标受众，避免把修辞力量当事实证明。',
        note: '三种问题，三套证据。',
        objective: '能解释名实、外延、阴阳五行、合纵连横及三类知识的证据差异。',
        practice: '为三类材料各写定义、一个适用范围、一个常见越界和一个可核来源。',
        checkpoint: '检查名实层级、关联分类边界、联盟利益结构、历史语境和证据标准匹配。',
      },
      {
        title: '示范与推导｜白马命题和一次联盟游说',
        body:
          '示范先把“马”与“白马”表示为两个词项，列出“所有白马是马”和“白马概念不等于马概念”并不矛盾。再用一次合纵游说做表：参与国、共同威胁、承诺、执行成本、背叛收益和验证信号。名辩训练概念一致，纵横分析训练利益结构，二者都不能替代事实调查。反例是把名辩用于逃避现实、把游说承诺直接当可执行条约。变式改变联盟中的第三方威胁，观察策略与可信度如何变化。',
        note: '概念一致不等于利益可信。',
        objective: '能分别完成概念外延分析与联盟利害分析，并说明两者不能互相替代。',
        practice: '完成白马两命题表、联盟六栏表、一个承诺核验信号和一个策略变式。',
        checkpoint: '检查概念层级、逻辑一致性、参与方利益、承诺可信度、执行成本和证据边界。',
      },
      {
        title: '引导练习｜六张跨领域证据卡',
        body:
          '准备六题，覆盖名称限定、名实混淆、阴阳气候关联、五行政治合法性、合纵联盟和连横游说。每题先做前测判断问题类型，再提取对象、目的和证据，后测用一张反证或替代解释检验。变式把材料移到现代语境，观察是否越界。记录“反常识即深刻”“古书关联即科学”“游说说得好就必然成功”等错误，并要求从未知、风险和反例三方面标注边界。',
        note: '先分类，再找证据。',
        objective: '能对六类材料完成问题分类、证据匹配、反证和现代越界判断。',
        practice: '提交六张证据卡、两则原典、三组现代转译、反证和错误分类。',
        checkpoint: '检查命题层级、分类功能、利益结构、来源、反证和现代科学或伦理边界。',
      },
      {
        title: '独立迁移与评价｜拆解一份多方合作提案',
        body:
          '选择一个安全的社区合作或社团联盟情境，先做前测列各参与方目标，再分别完成名实澄清、阴阳式关联分类和纵横式利益分析。名实表确认同一词是否同指，分类表只用于组织因素，利益表写威胁、承诺、执行和退出条件。24 小时后新增一个参与方做变式。评价四项：概念一致、分类透明、利益完整、证据边界清楚。最后写一个把五行关系直接当现代因果结论的反例并修正。',
        note: '分类帮助思考，不替代证据。',
        objective: '能把三种分析技术迁移到合作提案，并用概念、利益、证据和边界评价。',
        practice: '提交三张表、原典引用、24 小时参与方变式、承诺验证和反例修正。',
        checkpoint: '四项自评：词义一致、分类用途明确、利益与退出条件完整、未把古代框架当现代证据。',
      },
    ],
    quiz: [
      question(
        '“白马非马”更合理的课程解读是什么？',
        '讨论“白马”和“马”两个概念在外延与限定上的差异',
        ['主张现实中所有白马都不是马', '说明颜色不能描述物体', '证明语言完全没有作用'],
        0,
        '名辩关注词语所指和概念范围。白马增加颜色限定，因此作为概念不等于不加限定的马，但这不改变现实中白马属于马类的日常判断。',
        '事实与定义',
      ),
      question(
        '分析纵横家的合纵游说时，最需要核对什么？',
        '参与国利益、共同威胁、承诺、执行成本和背叛收益',
        ['只统计说辞篇幅', '只看游说者名气', '只按阴阳五行配对'],
        1,
        '联盟是否可信取决于利益和执行，不只是语言说服。要列参与方、承诺、监督和退出条件，并区分文本中的说辞与真实制度能力。',
        '材料与推导',
      ),
      question(
        '哪种说法最越界？',
        '阴阳五行曾是历史分类框架，所以已经等同于现代科学因果证据',
        ['阴阳五行有历史解释功能', '关联分类不等于统计因果', '现代使用需说明边界'],
        2,
        '历史分类体系可以研究其用途和影响，但不能自动获得现代科学证据地位。要经过可重复观测、机制和统计检验，不能仅凭对应关系。',
        '常见误区',
      ),
      question(
        '把三类分析迁移到社团合作时，哪种流程最严谨？',
        '先澄清词义，再用关联表组织因素，最后核对各方利益、承诺和退出条件',
        ['只用一句古语决定合作', '把所有分类当因果', '只听联盟发起者说法'],
        0,
        '概念、分类和联盟分析解决不同问题。三者按顺序使用能减少偷换概念和利益遗漏，但现实决策仍需现代证据、合同和风险审查。',
        '迁移应用',
      ),
    ],
  },
  'schools:农家、兵家、医家与杂家': {
    contentStatus: 'reviewed',
    prerequisite: '完成前六课，能区分原典、历史实践、后世整理和现代专业指南。',
    plainLanguageGoal:
      '学完后，你能比较农家生产分工、兵家条件计算、医家整体解释和杂家编纂，并说明各自证据与现代安全边界。',
    guidedPractice:
      '分析八段农、兵、医、杂材料，写问题、方法、证据、使用者、失败条件和现代不可直接套用处。',
    independentPractice:
      '制作四类知识对照卡，为每类选一则原文和一种现代场景，明确能借鉴的问题与不能替代的专业判断。',
    commonErrors: [
      '把农家只理解为农业技术，忽略分工、交换和治理争论。',
      '把兵家当鼓励战争，或把历史原则直接变成现实军事建议。',
      '把古代医家文本直接当现代临床指南，忽略医学证据与急诊边界。',
    ],
    sourceRefs: PRACTICAL_SOURCES,
    studyPoints: [
      point('必背', '农家同时讨论生产、分工与治理，兵家重情报和战争成本，医家以关系框架解释身体，杂家综合多家材料但仍有编纂立场。', 1),
      point('重点', '每类知识都要写明问题、方法、证据、使用者和失败条件，不能只用“古代智慧”概括。', 2),
      point('易错', '兵家不等于好战，医家古文不等于现代临床证据，杂家综合也不等于内部没有冲突。', 3),
      point('考点', '判断一项历史知识可用于理解问题、辅助专业讨论，还是必须被现代安全和证据规范替代。', 4),
    ],
    eventDetails: [PRACTICAL_SCHOOLS_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜古书经验能直接指导今天吗',
        body:
          '先做前测：一则古代医家文本提到四时与身体，一则兵家文本强调粮秣，能否直接用于今天治病或现实行动？要求先判断知识类型、使用者、证据和失败后果。变式把农家的轮作经验移到现代农场，观察土壤、气候和规模差异。反例是只凭文本年代久远就称权威，或反过来认为古代材料全无价值。后测为四类材料各写一条可借鉴问题和一个必须交给现代专业判断的边界。',
        note: '历史价值不等于专业授权。',
        objective: '能用问题、证据、使用者和失败后果判断历史知识的现代可用边界。',
        practice: '完成医学、兵学、农学三组前测，写知识类型、可借鉴问题、风险和替代证据。',
        checkpoint: '检查是否区分历史研究与现实操作、是否说明专业边界、失败后果和现代证据。',
      },
      {
        title: '材料与概念｜生产、战争、身体与编纂',
        body:
          '农家材料既涉及耕作、水利和劳力，也讨论君主与民并耕、社会分工和交换，技术建议和治理主张要分开。兵家把战争视作需要情报、粮秣、地形和组织条件的行动，强调代价而非轻率冒险。医家用阴阳、脏腑、经络和四时关系组织身体经验，属于历史理论，不替代现代诊断和安全处置。杂家《吕氏春秋》综合多家材料，服务统一知识和治理，但编纂选择、文本来源与内部张力仍需追踪。阅读注疏时要区分古人的解释和今天的历史转述，每类知识都要写证据类型和适用条件。',
        note: '先辨知识类型，再谈价值。',
        objective: '能解释农、兵、医、杂四类知识的问题、方法、证据和历史边界。',
        practice: '为四类知识各写对象、方法、证据、使用者、失败条件和现代边界。',
        checkpoint: '检查技术/治理分层、战争成本、医学安全、杂家编纂立场和来源追踪。',
      },
      {
        title: '示范与推导｜同一则材料能支持到哪一步',
        body:
          '示范一段医家四时材料：先注字词和篇目，再说明它在古代如何连接季节、身体和养生；第二步列它能支持的历史结论，如当时如何理解身体；第三步列它不能直接支持现代疗效或替代治疗。表格分为原文、历史解释、现代问题和禁止越界。反例是把“整体”当无需检查病因。变式换一则兵家粮秣材料，练习从历史条件推到组织问题，而不是给现实作战建议。',
        note: '每步都限制结论范围。',
        objective: '能把历史材料逐层限定为文本、历史解释和现代借鉴，并识别越界。',
        practice: '完成一则材料的六步推理、两个历史结论、两个现代不可推出项和一个安全变式。',
        checkpoint: '检查篇目、语境、历史结论、现代证据、专业边界和失败风险。',
      },
      {
        title: '引导练习｜八张知识边界卡',
        body:
          '准备八题，覆盖农家分工、耕作、兵家情报、战争代价、医家整体、杂家编纂、文本晚出和现代误用。每题先做前测判定知识类型，再抽原文、写历史功能，后测列可借鉴问题、不可替代的专业判断和反例。变式改变使用者或现实场景，观察风险是否上升。记录“古籍等于指南”“整体等于不需要诊断”“兵家就是鼓吹战争”“杂家没有立场”等错误，并要求说明证据等级、版本和安全边界。',
        note: '使用者一换，风险就变。',
        objective: '能对八类材料完成知识分类、历史解释、现代借鉴和风险边界分析。',
        practice: '提交八张边界卡、四则原文、两个场景变式、反例和错误分类。',
        checkpoint: '检查材料来源、历史功能、现代专业边界、失败风险、版本和证据等级。',
      },
      {
        title: '独立迁移与评价｜做四类知识对照卡',
        body:
          '为农、兵、医、杂各选一则短原文，先做前测写明历史问题和证据，再匹配一个现代场景。每张卡分“可直接用于理解、需要专业转换、不可据此操作”三层，并写一个失败案例。24 小时后改变一个使用者或规模做变式。评价四项：原文准确、历史语境清楚、现代边界诚实、风险有应对。最后写一个把古代医书当现代处方的反例，说明应转向何种合格医疗建议。',
        note: '医学问题交给持证专业人员。',
        objective: '能把四类历史知识迁移到现代场景，并用原文、语境、专业边界和风险评价。',
        practice: '提交四张对照卡、原典出处、24 小时变式、失败案例和风险应对清单。',
        checkpoint: '四项自评：不冒充专业、不把历史当证据、文本可查、风险应对明确；医学问题不自行处置。',
      },
    ],
    quiz: [
      question(
        '阅读农家材料时，为什么要区分生产技术与治理主张？',
        '耕作、水利等问题与分工、征收和权力分配需要不同证据',
        ['因为农家没有技术内容', '因为治理与农业无关', '因为所有古代技术都不可研究'],
        0,
        '农家文本同时涉及生产和政治。把技术经验与制度主张分层，才能判断证据、使用者和风险，不会用一条耕作经验直接证明治理方案。',
        '事实与定义',
      ),
      question(
        '兵家强调情报、粮秣和地形，说明什么？',
        '战争被视作受资源与条件约束的高成本行动，不能只凭勇气或意愿',
        ['战争不需要准备', '只要人多必然胜利', '兵家鼓励无条件开战'],
        1,
        '兵学文本重视计算与准备，提醒战争代价和不确定性。课程只做历史与思想分析，不提供现实军事操作，也不能把原则当胜利保证。',
        '材料与推导',
      ),
      question(
        '哪种医家使用方式最不恰当？',
        '依据一段古代文本直接替代现代诊断、药物和急诊处置',
        ['区分历史医学与现代临床', '说明文本版本和语境', '遇到危险症状建议就医'],
        2,
        '古代医家文本可用于思想史研究，但不能自动证明现代疗效。现实症状需要合格医疗评估，急症应优先处理，课程不能替代专业判断。',
        '常见误区',
      ),
      question(
        '把杂家迁移到资料整理时，哪种做法最严谨？',
        '保留每段来源、语境和立场，标出综合时的冲突与取舍',
        ['只留结论不记来源', '假定综合后没有矛盾', '把所有材料算成同一作者'],
        0,
        '杂家综合材料仍包含编辑目标和判断。现代整理也需要来源、版本和冲突记录，不能因为被编在一起就视为单一无矛盾观点。',
        '迁移应用',
      ),
    ],
  },
};
