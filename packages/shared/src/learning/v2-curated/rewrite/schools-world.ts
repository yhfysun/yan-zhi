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

const GREEK_ARCHIVE = {
  id: 'greek-virtue-polis',
  kind: 'concept',
  title: '德性与城邦：古希腊怎样追问“好生活”',
  period: '公元前5—前4世纪',
  summary:
    '苏格拉底把德性、知识与善生活变成公共追问，柏拉图用灵魂与城邦结构讨论正义，亚里士多德以实践习惯、中道和幸福分析德性。',
  background:
    '雅典民主、诉讼和智术师辩论让“谁有资格判断好坏”成为现实问题。哲学不再只解释自然，也介入公民如何行动、城邦如何培养品格。',
  timeline: [
    {
      date: '前5世纪',
      title: '城邦公共生活提出德性问题',
      body: '雅典公民在议会、法庭和节庆中辩论公正与利益。多元意见使“习俗是否等于善”成为问题，也推动哲学考察公共判断。',
      sourceIds: ['sep-plato', 'mit-republic'],
    },
    {
      date: '苏格拉底',
      title: '追问定义并暴露自知无知',
      body: '苏格拉底式对话要求给出定义并检验反例，常让自以为确定的人陷入困惑。其具体主张需通过柏拉图等后代文本谨慎重建。',
      sourceIds: ['sep-plato', 'mit-republic'],
    },
    {
      date: '约前380年',
      title: '柏拉图把正义放到灵魂与城邦',
      body: '《理想国》以分工、教育和统治结构讨论正义，也包含难以接受的等级安排。阅读要同时分析论证与历史限制，不能只取一句名言。',
      sourceIds: ['mit-republic', 'sep-plato'],
    },
    {
      date: '前4世纪',
      title: '亚里士多德以实践与习惯理解德性',
      body: '德性不是只懂定义，而是在具体处境中通过习惯形成的稳定品质。中道依赖情境和判断，不等于机械取平均。',
      sourceIds: ['mit-ethics', 'sep-aristotle'],
    },
    {
      date: '前4世纪后期',
      title: '幸福与城邦教育相连',
      body: '幸福被理解为合乎德性的活动，受关系、资源和政治共同体影响。它不等于瞬间快乐，也不保证任何制度都能自动培养德性。',
      sourceIds: ['mit-ethics', 'sep-aristotle'],
    },
    {
      date: '现代阅读',
      title: '保留问题，质疑排他结构',
      body: '古希腊德性论可帮助分析品格和教育，却受奴隶制、性别排斥和等级政治限制。比较时既不许把古代理想浪漫化，也不把它简化成空谈。',
      sourceIds: ['sep-plato', 'sep-aristotle'],
    },
  ],
  outcome:
    '可观察结果是能比较苏格拉底、柏拉图、亚里士多德对德性、正义和幸福的不同论证，并指出历史限制。',
  significance:
    '本课训练从对话与论证重建哲学立场，而不是用代表人物标签代替推理。',
  sourceCards: [
    source('mit-republic', 'Plato, Republic', 'MIT Internet Classics Archive', '公版英译', 'https://classics.mit.edu/Plato/republic.html', '核对正义、灵魂、教育与城邦论证。'),
    source('mit-ethics', 'Aristotle, Nicomachean Ethics', 'MIT Internet Classics Archive', '公版英译', 'https://classics.mit.edu/Aristotle/nicomachaen.html', '核对德性、中道、实践智慧与幸福。'),
    source('sep-plato', 'Plato', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/plato/', '核对柏拉图对话、正义与解释争议。'),
    source('sep-aristotle', 'Aristotle', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/aristotle/', '核对亚里士多德伦理与政治哲学。'),
  ],
} satisfies LearningV2EventDetail;

const INDIA_ARCHIVE = {
  id: 'india-dharma-karma-moksha',
  kind: 'concept',
  title: '正法、业与解脱：印度思想中的行动与自由',
  period: '约公元前8世纪至公元8世纪',
  summary:
    '奥义书、佛教、耆那教与不二论从不同形而上学和修行路径回答：行动如何产生后果，自我是什么，怎样从轮回中获得解脱。',
  background:
    '印度思想不是单一体系。吠陀祭祀、奥义书探究、沙门运动、佛教缘起、耆那教非暴力和吠檀多注释传统彼此争论，共同构成复杂历史。',
  timeline: [
    {
      date: '约前8—前5世纪',
      title: '奥义书追问自我与终极实在',
      body: '奥义书以对话和隐喻讨论梵、我、呼吸与解脱。文本层次复杂，不能用一个“万物归一”口号抹平不同篇章的差异。',
      sourceIds: ['iep-hindu', 'gita-text'],
    },
    {
      date: '约前6—前5世纪',
      title: '沙门运动强化修行与解脱问题',
      body: '佛教、耆那教等传统在恒河流域兴起，对祭祀权威、苦行、自我和业提出不同解释，形成持续争论的思想场。',
      sourceIds: ['iep-buddha', 'iep-jain'],
    },
    {
      date: '佛教早期',
      title: '缘起与无我重述苦和行动',
      body: '佛教以条件依存解释身心过程，反对固定不变自我。业不是简单命运判决，而是有意行为及其条件后果的一部分。',
      sourceIds: ['iep-buddha'],
    },
    {
      date: '耆那教传统',
      title: '非暴力与严格自律服务解脱',
      body: '耆那教强调对一切生命的非暴力和身心约束，业被理解为影响灵魂的细微机制。其宇宙论与修行论需整体阅读。',
      sourceIds: ['iep-jain'],
    },
    {
      date: '《薄伽梵歌》',
      title: '行动、职责与不执著被重新连接',
      body: '《薄伽梵歌》在战争对话中讨论正法、行动瑜伽和内在不执著。它属于史诗叙事，不能抽一句脱离阿周那的困境。',
      sourceIds: ['gita-text', 'iep-hindu'],
    },
    {
      date: '8世纪以后',
      title: '不二论形成系统注释',
      body: '商羯罗等思想家以注释传统发展不二论，讨论梵与我、无明和解脱。后世概括必须区分经句、注疏与哲学体系。',
      sourceIds: ['iep-hindu', 'iep-jain'],
    },
  ],
  outcome:
    '可观察结果是能区分奥义书、佛教、耆那教和不二论对自我、业与解脱的不同回答，并说明文本与解释层次。',
  significance:
    '本课避免把多元印度传统压成同一神秘主义，同时训练跨传统比较和宗教语言边界。',
  sourceCards: [
    source('iep-hindu', 'Hindu Philosophy', 'Internet Encyclopedia of Philosophy', '2025 年访问版', 'https://iep.utm.edu/hindu-ph/', '核对奥义书、吠檀多与不二论文本脉络。'),
    source('iep-buddha', 'Buddha', 'Internet Encyclopedia of Philosophy', '2025 年访问版', 'https://iep.utm.edu/buddha/', '核对佛教缘起、无我与解脱语境。'),
    source('iep-jain', 'Jain Philosophy', 'Internet Encyclopedia of Philosophy', '2025 年访问版', 'https://iep.utm.edu/jain/', '核对耆那教非暴力、业与修行。'),
    source('gita-text', 'Bhagavad Gita 2.47', 'Holy Bhagavad Gita', '2025 年访问版', 'https://www.holy-bhagavad-gita.org/chapter/2/verse/47', '核对行动、不执著与职责的原文节点。'),
  ],
} satisfies LearningV2EventDetail;

const ENLIGHTENMENT_ARCHIVE = {
  id: 'enlightenment-reason-public',
  kind: 'event',
  title: '启蒙：公共理性如何挑战权威',
  period: '17世纪末至18世纪',
  summary:
    '启蒙不是一条统一教义，而是围绕公共理性、知识界限、宗教宽容、自由和进步展开的争论。康德把启蒙概括为公开运用理性的勇气。',
  background:
    '科学革命、印刷公共空间、商业和革命政治改变知识权威。启蒙思想家既批评教会与专制，也产生欧洲中心主义和进步目的论问题。',
  timeline: [
    {
      date: '17世纪',
      title: '科学方法重划知识权威',
      body: '自然研究和数学的成功使观察、推理与可公开检验的论证获得更高地位，但科学方法本身也经历长期争论。',
      sourceIds: ['sep-enlightenment', 'fordham-kant'],
    },
    {
      date: '17世纪末',
      title: '公共讨论空间扩大',
      body: '报刊、沙龙、通信和百科全书让观点跨地域传播。公共性提高，但读者受教育、性别和阶级限制。',
      sourceIds: ['sep-enlightenment'],
    },
    {
      date: '1784年',
      title: '康德区分私人与公开理性',
      body: '康德要求人敢于独立判断，并区分职位职责中的受限表达与面向公众的自由讨论。该区分本身需要历史检验。',
      sourceIds: ['fordham-kant', 'sep-kant'],
    },
    {
      date: '18世纪',
      title: '自由与进步成为竞争概念',
      body: '不同思想家对自由是免于干涉、参与自治还是道德自律有不同理解；进步也可能被理解为知识、制度或道德改善。',
      sourceIds: ['sep-enlightenment', 'sep-rousseau'],
    },
    {
      date: '法国大革命',
      title: '抽象理想进入制度冲突',
      body: '权利、公民和理性政治被写入革命语言，同时暴露暴力、排斥和代表制难题。思想影响不能简化为单因果。',
      sourceIds: ['sep-enlightenment', 'sep-rousseau'],
    },
    {
      date: '现代反思',
      title: '解放承诺与殖民阴影并存',
      body: '启蒙提供批判权利和公共论证资源，也常把欧洲道路设为普遍标准。今天的比较要保留可继承方法与历史代价。',
      sourceIds: ['sep-enlightenment', 'sep-kant'],
    },
  ],
  outcome:
    '可观察结果是能解释理性、自由、进步和公共领域的不同版本，并为启蒙主张写出历史成就与反例。',
  significance:
    '启蒙课训练区分批判方法、制度方案和欧洲中心叙事，避免把“理性”当无需论证的赞词。',
  sourceCards: [
    source('sep-enlightenment', 'Enlightenment', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/enlightenment/', '核对启蒙运动、理性、进步与公共性争议。'),
    source('fordham-kant', 'Immanuel Kant: What Is Enlightenment?', 'Fordham Internet History Sourcebooks', '1784，英译公开', 'https://sourcebooks.fordham.edu/mod/kant-whatis.asp', '核对公开运用理性与启蒙定义。'),
    source('sep-kant', 'Immanuel Kant', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/kant/', '核对康德批判哲学与自由理论。'),
    source('sep-rousseau', 'Jean Jacques Rousseau', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/rousseau/', '核对自由、公意与社会契约。'),
  ],
} satisfies LearningV2EventDetail;

const GERMAN_IDEALISM_ARCHIVE = {
  id: 'german-idealism-kant-hegel',
  kind: 'concept',
  title: '康德到黑格尔：主体、界限与历史',
  period: '1781—1831',
  summary:
    '康德考察经验如何可能并区分现象与物自体，黑格尔则以辩证运动、承认和历史展开绝对精神。两者都在回应自由与知识条件。',
  background:
    '康德批判形而上学后，德国观念论试图从主体条件重建知识、道德和历史。文本术语密集，不能用“唯心就是一切靠想象”代替解释。',
  timeline: [
    {
      date: '1781年',
      title: '康德发动认识论转向',
      body: '《纯粹理性批判》追问经验如何可能，主张知识依赖感性与知性的共同条件。先验指经验可能性的条件，不是神秘物体。',
      sourceIds: ['sep-kant', 'sep-idealism'],
    },
    {
      date: '1780年代',
      title: '现象与物自体划出知识界限',
      body: '我们认识显现给主体的对象，不能把物自体直接当成可经验对象。该区分限制传统形而上学，也带来解释争议。',
      sourceIds: ['sep-kant'],
    },
    {
      date: '1788—1790年',
      title: '自由与判断连接道德和自然',
      body: '康德以实践理性讨论自律与义务，并试图说明自由如何与自然因果相容。不能把自律理解成任意想做就做。',
      sourceIds: ['sep-kant', 'sep-idealism'],
    },
    {
      date: '1807年',
      title: '黑格尔以辩证运动分析意识经验',
      body: '《精神现象学》让意识在矛盾、否定和重建中前进，强调概念与历史社会条件相连。辩证法不是简单“正反合”三词公式。',
      sourceIds: ['sep-hegel', 'hegel-text'],
    },
    {
      date: '1810年代后',
      title: '绝对精神与自由制度展开',
      body: '绝对精神描述思想在艺术、宗教和哲学中把握自身，不等同全知人格。自由也需在权利、伦理生活和历史中实现。',
      sourceIds: ['sep-hegel'],
    },
    {
      date: '现代评价',
      title: '宏大体系同时产生批判工具与风险',
      body: '德国观念论深刻影响马克思、存在主义和批判理论，也因抽象体系、目的论和自由局限受到批评。阅读要回到具体论证。',
      sourceIds: ['sep-idealism', 'sep-hegel', 'sep-kant'],
    },
  ],
  outcome:
    '可观察结果是能解释先验、物自体、辩证法、绝对精神和自由，并比较康德与黑格尔的方法差异。',
  significance:
    '本课训练在高抽象文本中重建问题、术语和论证，避免用模糊口号制造深度感。',
  sourceCards: [
    source('sep-kant', 'Immanuel Kant', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/kant/', '核对先验哲学、物自体、自由与道德。'),
    source('sep-hegel', 'Georg Wilhelm Friedrich Hegel', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/hegel/', '核对辩证法、精神、历史与自由。'),
    source('sep-idealism', 'Idealism', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/idealism/', '核对德国观念论的知识与实在问题。'),
    source('hegel-text', 'Hegel, Phenomenology of Spirit', 'Marxists Internet Archive', '公版英译', 'https://www.marxists.org/reference/archive/hegel/works/ph/phintro.htm', '核对《精神现象学》序言与辩证法语境。'),
  ],
} satisfies LearningV2EventDetail;

const IDEOLOGIES_ARCHIVE = {
  id: 'liberalism-socialism-conservatism',
  kind: 'concept',
  title: '自由、平等与传统：三大意识形态怎样争论',
  period: '18世纪末至今',
  summary:
    '自由主义、社会主义与保守主义内部都很复杂。它们围绕产权、市场、福利、共同体、革命与传统形成重叠和冲突，不能按左右标签一句话封口。',
  background:
    '法国大革命、工业资本主义、阶级冲突与大众政治催生不同诊断。每种传统内部都存在古典与现代表述，并与宗教、民族和民主争论交织。',
  timeline: [
    {
      date: '1789年后',
      title: '革命把自由与秩序问题推到前台',
      body: '权利、代表制和旧制度崩解引发支持与反对。革命既开启现代政治，也暴露暴力、不稳定和谁有资格参与的问题。',
      sourceIds: ['sep-liberalism', 'sep-conservatism'],
    },
    {
      date: '19世纪',
      title: '自由主义分化出权利与市场议题',
      body: '自由主义强调个人自由、法治和有限权力，但不同分支对市场、再分配和社会公平判断不同，不能只归为一种经济立场。',
      sourceIds: ['sep-liberalism'],
    },
    {
      date: '19世纪',
      title: '社会主义批判资本与阶级结构',
      body: '社会主义传统关注剥削、所有权、集体行动和社会平等，内部从革命到改良、从国家计划到市场社会主义差异巨大。',
      sourceIds: ['sep-socialism'],
    },
    {
      date: '18世纪末以后',
      title: '保守主义重估传统与制度连续性',
      body: '保守主义批评抽象改造，强调惯例、共同体和失败代价，但并非天然反对所有变化，也存在威权与民主保守分支。',
      sourceIds: ['sep-conservatism'],
    },
    {
      date: '20世纪',
      title: '福利国家与冷战重塑阵营',
      body: '普遍选举、福利制度和冷战使各传统互相吸收。现实政党常混合市场、福利、传统和权利议题，单轴左右描述不足。',
      sourceIds: ['sep-liberalism', 'sep-socialism', 'sep-conservatism'],
    },
    {
      date: '当代',
      title: '用议题矩阵替代标签投票',
      body: '分析时应分别看自由、平等、产权、市场、福利、传统、共同体和革命态度。同一个政策可由不同理由支持，也会产生交叉代价。',
      sourceIds: ['sep-liberalism', 'sep-socialism', 'sep-conservatism'],
    },
  ],
  outcome:
    '可观察结果是能用多个议题轴比较三大传统，区分内部流派，并为政策写出支持理由和反例。',
  significance:
    '本课防止意识形态标签化，训练在价值、制度与后果之间建立可检验的比较。',
  sourceCards: [
    source('sep-liberalism', 'Liberalism', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/liberalism/', '核对自由、权利、法治与自由派分支。'),
    source('sep-socialism', 'Socialism', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/socialism/', '核对社会主义所有制、平等与流派。'),
    source('sep-conservatism', 'Conservatism', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/conservatism/', '核对传统、共同体与保守主义类型。'),
    source('sep-rawls', 'John Rawls', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/rawls/', '核对正义、自由与再分配争论。'),
  ],
} satisfies LearningV2EventDetail;

const CONTEMPORARY_ARCHIVE = {
  id: 'existentialism-pragmatism-analytic',
  kind: 'concept',
  title: '存在、实践与语言：三条现当代哲学入口',
  period: '19世纪中叶至今',
  summary:
    '存在主义追问具体存在与意义，实用主义以实践后果澄清信念，分析哲学通过逻辑和语言分析问题。三条路径不同，却在行动、真理和公共理性上持续交叉。',
  background:
    '工业化、世界大战、现代逻辑和科学发展改变哲学问题。哲学不再只有宏大体系，也出现现象学描述、概念分析、实用探究和公共理性讨论。',
  timeline: [
    {
      date: '19世纪中叶',
      title: '克尔凯郭尔与尼采强调具体存在',
      body: '焦虑、选择、价值创造和历史批判进入哲学，反对把人的处境只当抽象知识对象。两人的问题与后起存在主义不等于同一体系。',
      sourceIds: ['sep-existentialism'],
    },
    {
      date: '20世纪上半叶',
      title: '存在主义分析自由与荒诞',
      body: '海德格尔、萨特和波伏娃等从不同方向讨论存在、他者、自由与责任。自由不是没有条件，而是必须在限制中承担选择。',
      sourceIds: ['sep-existentialism'],
    },
    {
      date: '19世纪末至20世纪',
      title: '实用主义把观念放回实践',
      body: '皮尔士、詹姆斯和杜威关注信念如何指导探究与行动。实用主义不是“有用即真”的任意版本，真理仍受公共检验与经验修正。',
      sourceIds: ['sep-pragmatism'],
    },
    {
      date: '19世纪末',
      title: '现代逻辑推动分析哲学',
      body: '弗雷格、罗素和维特根斯坦使语言、意义和逻辑形式成为核心问题，哲学论证追求更清晰的区分与反例。',
      sourceIds: ['iep-analytic', 'sep-truth'],
    },
    {
      date: '20世纪中后期',
      title: '语言转向扩展到心灵、科学与社会',
      body: '分析哲学不再只做语言清理，也进入心灵哲学、科学哲学、政治哲学等。方法多样，不能用“只会抠字眼”概括。',
      sourceIds: ['iep-analytic', 'sep-pragmatism'],
    },
    {
      date: '当代',
      title: '三条传统在公共议题中交叉',
      body: '存在处境、实践后果和语言清晰可同时用于医学伦理、AI 与人际责任。比较要保留方法差异，再讨论互补与冲突。',
      sourceIds: ['sep-existentialism', 'sep-pragmatism', 'iep-analytic'],
    },
  ],
  outcome:
    '可观察结果是能区分三条传统的问题和方法，用存在、实践、语言三个轴分析同一议题并指出边界。',
  significance:
    '本课训练现当代哲学的方法自觉，避免把不同传统混成泛泛人生格言。',
  sourceCards: [
    source('sep-existentialism', 'Existentialism', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/existentialism/', '核对存在、自由、荒诞与责任。'),
    source('sep-pragmatism', 'Pragmatism', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/pragmatism/', '核对信念、探究、真理与实践后果。'),
    source('iep-analytic', 'Analytic Philosophy', 'Internet Encyclopedia of Philosophy', '2025 年访问版', 'https://iep.utm.edu/analytic-philosophy/', '核对分析哲学方法、语言转向与分支。'),
    source('sep-truth', 'Truth', 'Stanford Encyclopedia of Philosophy', '2025 年访问版', 'https://plato.stanford.edu/entries/truth/', '核对真理理论与语言分析边界。'),
  ],
} satisfies LearningV2EventDetail;

const GREEK_SOURCES = [
  'Plato, Republic，公版英译。https://classics.mit.edu/Plato/republic.html',
  'Aristotle, Nicomachean Ethics，公版英译。https://classics.mit.edu/Aristotle/nicomachaen.html',
  'Stanford Encyclopedia of Philosophy, Plato。https://plato.stanford.edu/entries/plato/',
  'Stanford Encyclopedia of Philosophy, Aristotle。https://plato.stanford.edu/entries/aristotle/',
];

const INDIA_SOURCES = [
  'Internet Encyclopedia of Philosophy, Hindu Philosophy。https://iep.utm.edu/hindu-ph/',
  'Internet Encyclopedia of Philosophy, Buddha。https://iep.utm.edu/buddha/',
  'Internet Encyclopedia of Philosophy, Jain Philosophy。https://iep.utm.edu/jain/',
  'Bhagavad Gita 2.47。https://www.holy-bhagavad-gita.org/chapter/2/verse/47',
];

const ENLIGHTENMENT_SOURCES = [
  'Stanford Encyclopedia of Philosophy, Enlightenment。https://plato.stanford.edu/entries/enlightenment/',
  'Immanuel Kant, What Is Enlightenment?。https://sourcebooks.fordham.edu/mod/kant-whatis.asp',
  'Stanford Encyclopedia of Philosophy, Immanuel Kant。https://plato.stanford.edu/entries/kant/',
  'Stanford Encyclopedia of Philosophy, Rousseau。https://plato.stanford.edu/entries/rousseau/',
];

const IDEALISM_SOURCES = [
  'Stanford Encyclopedia of Philosophy, Immanuel Kant。https://plato.stanford.edu/entries/kant/',
  'Stanford Encyclopedia of Philosophy, Hegel。https://plato.stanford.edu/entries/hegel/',
  'Stanford Encyclopedia of Philosophy, Idealism。https://plato.stanford.edu/entries/idealism/',
  'Hegel, Phenomenology of Spirit，公版英译。https://www.marxists.org/reference/archive/hegel/works/ph/phintro.htm',
];

const IDEOLOGY_SOURCES = [
  'Stanford Encyclopedia of Philosophy, Liberalism。https://plato.stanford.edu/entries/liberalism/',
  'Stanford Encyclopedia of Philosophy, Socialism。https://plato.stanford.edu/entries/socialism/',
  'Stanford Encyclopedia of Philosophy, Conservatism。https://plato.stanford.edu/entries/conservatism/',
  'Stanford Encyclopedia of Philosophy, John Rawls。https://plato.stanford.edu/entries/rawls/',
];

const CONTEMPORARY_SOURCES = [
  'Stanford Encyclopedia of Philosophy, Existentialism。https://plato.stanford.edu/entries/existentialism/',
  'Stanford Encyclopedia of Philosophy, Pragmatism。https://plato.stanford.edu/entries/pragmatism/',
  'Internet Encyclopedia of Philosophy, Analytic Philosophy。https://iep.utm.edu/analytic-philosophy/',
  'Stanford Encyclopedia of Philosophy, Truth。https://plato.stanford.edu/entries/truth/',
];

export const SCHOOLS_WORLD_REWRITE: CuratedCoursePlanPatchMap = {
  'schools:古希腊：德性与城邦': {
    contentStatus: 'reviewed',
    prerequisite: '完成中国诸子第一章，能从原典、解释和现代评价三层阅读思想文本。',
    plainLanguageGoal:
      '学完后，你能重建苏格拉底、柏拉图、亚里士多德关于德性、正义与幸福的论证，并指出其城邦限制。',
    guidedPractice:
      '对读六段《理想国》《尼各马可伦理学》材料，写问题、前提、德性或正义判断、反例和历史语境。',
    independentPractice:
      '围绕“好公民是否必然是好人有德性者”写一页比较短文，至少使用两位哲学家的一手材料。',
    commonErrors: [
      '把苏格拉底本人的观点直接等同柏拉图对话中的所有发言。',
      '把亚里士多德中道理解成机械取平均或折中。',
      '把古希腊城邦理想普遍化，忽略奴隶制、性别排斥和公民范围。',
    ],
    sourceRefs: GREEK_SOURCES,
    studyPoints: [
      point('必背', '苏格拉底以追问检验定义，柏拉图用灵魂与城邦讨论正义，亚里士多德把德性理解为实践中形成的稳定品质。', 1),
      point('重点', '中道依赖情境、对象和判断，不是固定数值；幸福不是瞬时快乐。', 2),
      point('易错', '对话人物的话不等于作者本人观点，古代城邦理想也不能直接普遍化。', 3),
      point('考点', '引用一手文本重建论证，再用历史限制和反例评价其适用范围。', 4),
    ],
    eventDetails: [GREEK_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜好人一定擅长公共事务吗',
        body:
          '先做前测：一个人私德良好却不懂城邦治理，是否能称为完整的好人？要求分别提出苏格拉底式定义追问、柏拉图的灵魂与分工论证和亚里士多德的实践品质判断。引述一手原典时必须标作者、篇目和发言者。变式把城邦换为现代组织。反例是只背人物名字、把柏拉图角色发言直接当苏格拉底原话。后测用一段文本重建前提、结论和反例，并交代古希腊历史语境。',
        note: '先问谁在说、凭什么说。',
        objective: '能从德性、知识、分工和实践中诊断“好人—好公民”问题。',
        practice: '完成两组前测，写定义、论证前提、发言者、历史条件和至少一个反例。',
        checkpoint: '检查文本归属、论证前提、德性与政治关系、历史边界和反例是否回应结论。',
      },
      {
        title: '材料与概念｜德性、正义、城邦与幸福',
        body:
          '苏格拉底式对话通过定义与反例检验德性知识；《理想国》用灵魂结构、教育和城邦分工讨论正义，但其等级方案有历史限制；亚里士多德把德性看成在具体行动中通过习惯形成的稳定品质，以实践智慧把握情境中的中道。幸福是合乎德性的活动，需要关系和外部条件，却不是快乐总和。阅读原典要区分说话角色、作者建构、古代制度与现代解释，并说明这些理论为何不能直接覆盖所有居民。',
        note: '概念要跟论证一起出现。',
        objective: '能解释德性、正义、城邦、中道与幸福的文本含义和解释边界。',
        practice: '为五个概念各写一条原典依据、一个前提、一个现代误读和一个反例。',
        checkpoint: '检查原典出处、角色层次、德性与知识关系、中道条件、城邦限制和幸福边界。',
      },
      {
        title: '示范与推导｜从功能论证到正义',
        body:
          '示范柏拉图的论证：事物按特有功能良好运作被称为有德性，灵魂也有功能，因此正义可被理解为灵魂各部分的正确秩序。接着列两个反对点：功能类比是否成立，城邦分工是否压制个人选择。再用亚里士多德式实践判断检验规则是否适应情境。反例是把“各做各的”机械套到现代职业。变式换一则教育材料，检查同一论证是否仍要求政治条件。',
        note: '每一步都要能被反例击中。',
        objective: '能重建从功能、灵魂秩序到城邦正义的推理，并主动提出反对。',
        practice: '完成六步推理、两个反例、一个亚里士多德式变式和历史限制说明。',
        checkpoint: '检查前提是否显式、概念是否偷换、反例是否有效、变式是否保留文本条件。',
      },
      {
        title: '引导练习｜六则古希腊德性材料',
        body:
          '准备六则材料，覆盖苏格拉底追问、柏拉图正义、教育、亚里士多德中道、选择和幸福。每题先做前测标发言者与问题，再写论证链，后测用反例、现代情境和历史语境检验。变式让同一德目出现在私人关系与公共职位中，比较要求差异。记录“苏格拉底等于柏拉图”“中道等于平均”“德性等于知识”“幸福等于快乐”等错误，并要求每条判断附篇目与限定。',
        note: '同一德目换场景再检验。',
        objective: '能对六则材料完成发言者识别、论证重建、反例和历史评价。',
        practice: '提交六张论证卡、两则原典、三个场景变式、反例和错误分类。',
        checkpoint: '检查文本归属、概念准确、前提完整、反例相关、历史条件和现代推论分层。',
      },
      {
        title: '独立迁移与评价｜写一页德性与制度短文',
        body:
          '围绕“制度能否培养德性”写一页短文，至少使用《理想国》和《尼各马可伦理学》各一则材料，比较柏拉图的教育制度论与亚里士多德的习惯实践论。加入一个历史限制和一个现代反例，最后提出自己的有限判断。24 小时后改换学校或职业场景做变式。评价四项：原典准确、论证完整、反例有效、历史边界清楚。最后写一个把古希腊公民理想直接当现代全民方案的错误示范并修正。',
        note: '古典问题可借鉴，制度不可照搬。',
        objective: '能把古希腊德性论迁移到制度问题，并用原典、论证、反例和边界评价。',
        practice: '提交短文、两则引文、24 小时变式、历史限制、现代反例和修订记录。',
        checkpoint: '四项自评：引文可查、推理连贯、反例有回应、现代应用说明排除对象；否则重写。',
      },
    ],
    quiz: [
      question(
        '阅读柏拉图对话时，为什么要区分发言者与作者？',
        '对话中的角色主张不等同柏拉图本人全部观点，需要结合情节和论证判断',
        ['所有角色都由同一人配音', '作者从不在对话中出现', '发言者越有名越正确'],
        0,
        '柏拉图以戏剧化对话呈现争论，苏格拉底等角色会提出不同层次的意见。把角色台词直接归给作者，会跳过论证结构和文学语境。',
        '事实与定义',
      ),
      question(
        '亚里士多德的中道最准确的理解是什么？',
        '在具体情境中由实践智慧把握合宜程度，不是机械平均',
        ['任何选择都取两个数中点', '永远不要表达立场', '只看行为数量不看对象'],
        1,
        '中道依赖对象、时机、目的和行动者处境。它不是算平均，也不是取消判断；实践智慧负责识别在此时此地怎样行动才合宜。',
        '材料与推导',
      ),
      question(
        '哪种评价最忽略古希腊城邦的历史限制？',
        '把公民德性理想直接说成适用于城邦内所有居民和现代所有人',
        ['指出奴隶制限制', '说明女性被排除', '区分公民范围'],
        2,
        '古希腊公民只是居民的一部分，德性与政治参与理想建立在排他制度上。现代使用要说明谁被排除，不能把有限公民经验当普遍方案。',
        '常见误区',
      ),
      question(
        '把德性论迁移到学校评价时，哪种设计最完整？',
        '同时看行为习惯、实践判断、外部条件和反例，避免只给品格标签',
        ['用一次考试决定德性', '只统计口号背诵', '把服从教师等同正义'],
        0,
        '德性涉及长期实践与情境判断。评价应有行为证据、反思和不同场景，并检查制度是否提供公平条件，不能用一个分数固化标签。',
        '迁移应用',
      ),
    ],
  },
  'schools:印度思想：正法、业与解脱': {
    contentStatus: 'reviewed',
    prerequisite: '完成中国诸子与古希腊入门，能区分多种传统并用文本证据比较。',
    plainLanguageGoal:
      '学完后，你能区分奥义书、佛教、耆那教和不二论对正法、业、自我与解脱的回答，并避免把印度思想单一化。',
    guidedPractice:
      '分析八段奥义书、佛教、耆那教和《薄伽梵歌》材料，写自我观、行动、业、解脱路径和文本层次。',
    independentPractice:
      '围绕“行动是否束缚人”制作四传统对读卡，各引一则材料并写一个反例与现代宗教边界。',
    commonErrors: [
      '把业简化成“做坏事遭报应”，忽略意图、条件和轮回理论差异。',
      '把佛教无我、奥义书梵我和不二论说成完全相同。',
      '把瑜伽或冥想从传统语境抽离，宣称可替代医疗或任何现实专业判断。',
    ],
    sourceRefs: INDIA_SOURCES,
    studyPoints: [
      point('必背', '正法、业、轮回和解脱在奥义书、佛教、耆那教与不二论中含义不同，必须先说明文本传统再比较。', 1),
      point('重点', '《薄伽梵歌》的行动不执著依赖史诗对话和职责问题，不能抽成一句励志口号。', 2),
      point('易错', '佛教无我不是灵魂消失的简单断言，业也不是外部命运判决；印度传统内部存在长期争论。', 3),
      point('考点', '用自己的话解释差异时，至少给出一条术语、一个反例和一条文本或研究来源。', 4),
    ],
    eventDetails: [INDIA_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜“随业而来”到底在说什么',
        body:
          '先做前测：一个人遭遇困难，被说成“这是业”，这句话可能涉及哪些不同理论？要求把行为、意图、后果、轮回、自我和解脱分开。分别找奥义书、佛教、耆那教和《薄伽梵歌》的一条线索，不先假定四者同义。变式把解释从个人遭遇改为社会制度。反例是用业解释一切受害并取消责任。后测比较两种业论，指出文本依据、共同点和不可互换处，并交代时代条件。',
        note: '先问是哪一种业论。',
        objective: '能拆开正法、业、轮回、自我与解脱，诊断印度思想单一化误解。',
        practice: '完成两组前测，写行为、意图、后果、自我、轮回和文本传统六栏。',
        checkpoint: '检查术语归属、意图与后果、轮回结构、文本依据、反例和社会责任。',
      },
      {
        title: '材料与概念｜正法、业、轮回与解脱',
        body:
          '奥义书以梵、我、无明和解脱展开探究；佛教用缘起、无我和苦集灭道解释身心与修行；耆那教强调非暴力、自律和业对灵魂的束缚；不二论以注释传统讨论梵我关系。正法可指秩序、职责或教法，业涉及有意行动及其条件后果，轮回与解脱也不是各传统同义。阅读一手文本要标注篇目和译本，再引研究解释；比较先列共同问题，再说明概念结构的差异。',
        note: '同名概念也要问结构。',
        objective: '能解释正法、业、轮回、解脱、无我、梵与不二论的传统差异。',
        practice: '为四个传统各写自我观、业、修行路径、解脱状态和一个不可混同点。',
        checkpoint: '检查文本归属、术语结构、修行路径、解脱含义、反例和译本说明。',
      },
      {
        title: '示范与推导｜行动为什么会成为束缚',
        body:
          '示范《薄伽梵歌》2.47：行动权利与结果焦虑被区分，阿周那正面对职责与暴力的冲突。先写叙事语境，再说明“不执著结果”不等于不负责任或取消后果判断。佛教会用意图与条件分析行动，耆那教会突出非暴力与业束缚，三者不能互换。表格列行动者、意图、后果、执著、解脱路径和反例。变式把材料移到现代职业选择，检查哪些解释仍是文本支持，哪些只是现代转述。',
        note: '不执著不是不计后果。',
        objective: '能以《薄伽梵歌》为核心比较行动、后果、执著与解脱路径。',
        practice: '完成行动六栏表、一则原文、两种比较解释、一个现代反例和边界说明。',
        checkpoint: '检查叙事语境、职责、意图、后果、不执著含义、传统差异和现代推论。',
      },
      {
        title: '引导练习｜八段印度思想材料',
        body:
          '准备八段材料，覆盖奥义书自我、佛教缘起、无我、四谛、耆那教非暴力、不二论和《薄伽梵歌》职责。每题先做前测标传统与译本，再写核心问题和术语结构，后测引另一则同传统材料互证并写反例。变式改变行动者或社会情境，检查解释是否失真。记录“所有印度思想都一样”“业即命运”“无我即没有经验”“冥想可替代医疗”等错误，并标明宗教实践与现代专业边界。',
        note: '同传统内部也要互证。',
        objective: '能对八类材料完成传统识别、术语分析、同传统互证和反例比较。',
        practice: '提交八张对读卡、四个传统矩阵、三个变式、反例和来源说明。',
        checkpoint: '检查传统与篇目、概念结构、互证质量、反例、现代边界和译本层次。',
      },
      {
        title: '独立迁移与评价｜写一份多传统行动比较',
        body:
          '围绕“行动是否必然造成束缚”写一页比较，选择至少三种传统，各引一则原典或研究来源，说明自我、意图、后果和修行路径。必须把一个现代转述单独标色，并写它不能推出的结论。24 小时后改变行动者身份做变式。评价四项：传统区分、文本证据、比较同轴、现实边界。最后写一个把复杂仪式或冥想直接当医疗替代的反例，并说明如何转向合格专业支持。',
        note: '比较不是合成一种万能宗教。',
        objective: '能把印度思想比较迁移到行动议题，并用文本、差异、反例和安全边界评价。',
        practice: '提交比较短文、三条来源、术语表、24 小时变式、现代转述和边界声明。',
        checkpoint: '四项自评：不混传统、不脱离文本、比较维度一致、医疗与宗教边界清楚。',
      },
    ],
    quiz: [
      question(
        '比较印度思想时，最先要确认什么？',
        '材料属于哪个传统、篇目和译本，以及同一术语在该体系中的结构',
        ['所有传统是否用同一个中文词', '作者是否现代', '篇幅是否最长'],
        0,
        '“正法”“业”“解脱”等词跨传统有不同结构。先固定文本和解释传统，再比较共同问题，才能避免把多元材料合成一种模糊神秘主义。',
        '事实与定义',
      ),
      question(
        '《薄伽梵歌》中的“不执著结果”最不应理解成什么？',
        '行动后完全不顾后果，也不需要责任判断',
        ['减少对结果焦虑', '履行职责时的内在训练', '行动瑜伽的修行维度'],
        1,
        '不执著针对行动者与结果的关系，不等于忽视现实后果。原文处在战争与职责的叙事中，需要同时讨论伦理冲突和解释边界。',
        '材料与推导',
      ),
      question(
        '哪种说法最混淆佛教与奥义书传统？',
        '直接说佛教的无我、奥义书的梵我和不二论都是同一个永恒自我',
        ['各传统对自我有不同解释', '佛教强调缘起', '不二论有自身注释传统'],
        2,
        '这些传统存在交叉，却不能用同一“真我”定义抹平。无我、梵我关系和不二论各有论证与修行语境，必须分别说明。',
        '常见误区',
      ),
      question(
        '把印度思想用于当代压力管理时，哪种边界最清楚？',
        '可作为思想与修行传统研究，但不宣称替代心理或医疗服务，并说明去语境风险',
        ['把冥想承诺为万能治疗', '用业解释所有疾病', '只引用一句梵语口号'],
        0,
        '传统实践进入现代生活要说明来源、改编和效果证据。严重心理或身体症状应寻求合格专业支持，思想课程不能替代诊疗。',
        '迁移应用',
      ),
    ],
  },
  'schools:启蒙：理性、自由与进步': {
    contentStatus: 'reviewed',
    prerequisite: '完成古希腊和印度思想入门，能区分一手文本、历史语境与价值评价。',
    plainLanguageGoal:
      '学完后，你能解释启蒙的多种版本，分析理性、自由、进步与公共领域，并指出欧洲中心与排斥问题。',
    guidedPractice:
      '分析八段启蒙文本与历史案例，写作者问题、公共性、自由类型、进步尺度、受益者和反例。',
    independentPractice:
      '围绕“公共讨论是否必然带来进步”写一篇短评，至少使用两则一手材料和一项历史反例。',
    commonErrors: [
      '把启蒙当成所有思想家共享的单一纲领。',
      '把理性等同于冷漠计算，或认为只要自称理性就无需检验。',
      '把进步只看技术增长，忽略权利、分配和殖民代价。',
    ],
    sourceRefs: ENLIGHTENMENT_SOURCES,
    studyPoints: [
      point('必背', '启蒙是围绕理性、自由、进步和公共性的多元运动；康德强调公开运用理性，但不同思想家目标不统一。', 1),
      point('重点', '公共讨论要检查参与范围、权力结构、论证质量和可纠错机制，不能把出版数量等同进步。', 2),
      point('易错', '理性不等于自封正确，自由不止一种含义，进步也不能只用技术和财富衡量。', 3),
      point('考点', '为一个“知识带来解放”的主张写出受益者、被排斥者、机制和反例。', 4),
    ],
    eventDetails: [ENLIGHTENMENT_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜更多信息就会更自由吗',
        body:
          '先做前测：互联网让信息增加，是否必然带来更理性的公共讨论？要求拆开知识可及、表达自由、公共领域、权力和进步五个问题。引康德《什么是启蒙？》一段，说明“公开运用理性”针对什么。变式把平台改成校园公告。反例是信息越多越极化、参与被算法限制。后测为一个公共讨论方案写受益者、被排除者、证据和失败条件，并交代18世纪历史语境。',
        note: '信息量不等于公共理性。',
        objective: '能用理性、公共领域、自由和进步诊断“信息更多就更好”的误解。',
        practice: '完成互联网与校园前测，写知识、表达、参与、权力、证据和反例六栏。',
        checkpoint: '检查公共性与私人性区别、参与范围、权力、理性质量、历史条件与可检验结果。',
      },
      {
        title: '材料与概念｜理性、自由、进步与公共领域',
        body:
          '启蒙思想家共享批判权威和公开论证的关切，却对宗教、君主制、市场和教育的判断不同。理性可以是推理能力、公共规范或批判态度；自由可以是免于干涉、参与自治或道德自律；进步可以是知识、制度或道德改善。公共领域需要读者、媒介和表达规则，也受阶级、性别和殖民排斥。一手原典提供作者的历史回应，研究解释帮助识别整体争论，现代转述不能冒充原文。比较时要用同一维度和反例。',
        note: '每个大词都要拆成版本。',
        objective: '能解释启蒙的多元性，以及理性、自由、进步和公共领域的不同含义。',
        practice: '为四个核心词各写两种含义、一个原典线索、一个受益者和一个反例。',
        checkpoint: '检查概念版本、历史语境、参与者范围、权力结构、文本层次和比较尺度。',
      },
      {
        title: '示范与推导｜公开理性的机会与限制',
        body:
          '示范康德区分：在职位中受规则约束的表达，与作为学者面向公众运用理性并不相同。推理先说明目的，再列公开讨论提高纠错的条件，如安全表达、事实可查和回应机制。反例是只有少数人拥有媒介、异议受惩罚或错误信息被放大。表格分为论证、参与、制度、证据和代价。变式把场景换成科学争议，检查公开性与专业责任如何同时保留。',
        note: '公开不等于无责任发言。',
        objective: '能重建康德公共理性主张，并用参与、权力、证据和制度条件检验。',
        practice: '完成五栏推理、一则原典、三个支持条件、三个反例和一个科学争议变式。',
        checkpoint: '检查原典准确、公开/职位区分、参与范围、纠错机制、专业责任和反例回应。',
      },
      {
        title: '引导练习｜八段启蒙争论',
        body:
          '准备八题，覆盖宗教宽容、出版、教育、社会契约、市场、革命、殖民和进步叙事。每题先做前测标作者与问题，再写自由和进步版本，后测列受益者、被排斥者、证据与反例。变式改变参与者身份或媒介条件，观察公共性是否改变。记录“启蒙只有一种立场”“理性自证正确”“技术进步等于道德进步”等错误，并要求把一手原典、研究解释与现代评价分开。',
        note: '每项进步都要问谁付出代价。',
        objective: '能对八类启蒙材料完成作者问题、概念版本、受益排斥和历史评价。',
        practice: '提交八张争论卡、两组原典、三个参与变式、反例和错误分类。',
        checkpoint: '检查文本作者、概念差异、参与范围、殖民或性别边界、证据和进步尺度。',
      },
      {
        title: '独立迁移与评价｜写一页公共讨论短评',
        body:
          '围绕“公共讨论能否减少权力滥用”写一页短评，至少使用康德文本和一项研究解释，并加入一个历史或当代反例。必须区分可继承的批判方法、具体制度方案和欧洲中心叙事。24 小时后改变媒介或参与者做变式。评价四项：原典准确、概念分层、反例有效、进步尺度多维。最后写一个把“更多平台发帖”直接等同于启蒙的反例，并说明还需哪些制度与证据。',
        note: '批判也要接受公开检验。',
        objective: '能把启蒙问题迁移到公共讨论，并用原典、概念、反例和多维进步评价。',
        practice: '提交短评、两则来源、24 小时变式、受益排斥表和反例修正。',
        checkpoint: '四项自评：不把启蒙单一化、公共性有条件、反例被回应、进步包含权利与分配。',
      },
    ],
    quiz: [
      question(
        '课程中“启蒙”的最准确理解是什么？',
        '围绕理性、自由、进步和公共权威展开的多元历史争论',
        ['所有思想家都同意的一套制度', '只指技术进步', '只指法国大革命'],
        0,
        '启蒙思想家共享批判与公开论证关切，却在宗教、政治、经济和自由上分歧明显。把它变成单一纲领会抹掉内部争论和历史差异。',
        '事实与定义',
      ),
      question(
        '康德区分公开运用理性与职位职责，说明什么？',
        '公共论证的条件与组织内职责并不相同，需要分别评价',
        ['公开讨论可以完全不负责任', '职位规则永远不合理', '理性只能在私下使用'],
        1,
        '康德试图说明人在公共领域可面向读者检验原则，同时在职位中受职责限制。两者关系仍有争议，不能简化成任意发言或盲目服从。',
        '材料与推导',
      ),
      question(
        '哪种进步判断最片面？',
        '只看技术产量和财富增长，不检查权利、分配、殖民与环境代价',
        ['同时看知识和制度', '检查谁被排除', '比较多种进步尺度'],
        2,
        '进步不是单一曲线。技术增长可能伴随权利剥夺和分配恶化，需要多维指标与受影响者分析，不能把产量当道德证明。',
        '常见误区',
      ),
      question(
        '把启蒙方法迁移到平台治理时，哪种分析最完整？',
        '检查表达权、事实核验、参与门槛、纠错机制和被压制群体',
        ['只统计帖子数量', '只要求删除异议', '把算法热度当公共理性'],
        0,
        '公共讨论质量取决于参与、证据和纠错，不只流量。平台治理还要处理权力、隐私和申诉，不能把“更多发言”自动当启蒙。',
        '迁移应用',
      ),
    ],
  },
  'schools:德国古典：康德、黑格尔': {
    contentStatus: 'reviewed',
    prerequisite: '完成启蒙课程，能处理抽象概念并区分文本论证与口号转述。',
    plainLanguageGoal:
      '学完后，你能解释先验、物自体、辩证法、绝对精神和自由，并比较康德与黑格尔的哲学方法。',
    guidedPractice:
      '分析八段康德与黑格尔材料，写问题、前提、术语、论证步骤、反例和历史影响。',
    independentPractice:
      '围绕“自由是否需要制度和历史条件”写一页比较，分别使用康德与黑格尔的一手或权威解释材料。',
    commonErrors: [
      '把唯心主义理解为只靠主观想象，忽略其知识条件论证。',
      '把辩证法简化成任意“正反合”三拍公式。',
      '把康德的物自体当可直接经验对象，或把黑格尔绝对精神当全知人格。',
    ],
    sourceRefs: IDEALISM_SOURCES,
    studyPoints: [
      point('必背', '康德用先验条件说明经验如何可能并区分现象与物自体；黑格尔以辩证运动和历史展开精神与自由。', 1),
      point('重点', '先验不是超越经验的神秘物，绝对精神也不是某个人的无限知识；术语必须跟论证解释。', 2),
      point('易错', '辩证法不是三词模板，唯心主义也不是否认外部世界存在。', 3),
      point('考点', '用原文解释一个术语，写出它解决的问题和至少一个反对解释。', 4),
    ],
    eventDetails: [GERMAN_IDEALISM_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜“唯心”就是靠想象吗',
        body:
          '先做前测：说康德或黑格尔是唯心主义者，是否意味着他们否认杯子存在？要求区分知识依赖主体条件、实在由心灵构成和道德自由等不同命题。引一段原文或权威解释，标术语与论证。变式把“社会共识构成事实”与“物理对象存在”比较。反例是把唯心主义当心想事成。后测写出先验、物自体或绝对精神解决的问题、不能推出的结论和历史语境。',
        note: '先拆命题，再贴主义标签。',
        objective: '能区分唯心主义的不同命题，诊断主观想象式误解并定位术语。',
        practice: '完成两组前测，写存在、知识、主体、自由、术语和反例六栏。',
        checkpoint: '检查是否区分本体论与认识论、术语出处、命题强度、反例和历史语境。',
      },
      {
        title: '材料与概念｜先验、物自体、辩证法与绝对精神',
        body:
          '康德追问经验的可能条件：时空和知性范畴如何组织显现，物自体标示不能被直接经验化的界限。实践哲学中自由与自律需在道德法则下理解。黑格尔让意识在矛盾、否定和重建中展开，辩证法分析概念内部张力与历史运动；绝对精神指思想在社会、艺术、宗教和哲学中把握自身，不是全知角色。两者都关心自由，却采用不同方法。一手文本要配导读，现代比较要说明解释版本。',
        note: '抽象词必须连接问题。',
        objective: '能解释先验、物自体、辩证法、绝对精神、自由和德国观念论方法。',
        practice: '为六个术语各写问题、定义、一个误读、一个反例和一条来源。',
        checkpoint: '检查术语来源、认识论/本体论层次、辩证法步骤、精神含义和自由条件。',
      },
      {
        title: '示范与推导｜康德与黑格尔怎样处理自由',
        body:
          '示范康德式推理：若自由只是任意冲动，就不能形成普遍道德法则；自律要求行动者以可普遍化原则约束自己。再示范黑格尔式追问：抽象自由若脱离权利、关系和历史制度，如何获得现实内容？两列比较问题、主体、条件和反例。反例是把康德自由当无规则任性，把黑格尔自由当历史必然替个人决定。变式换一个家庭或职业冲突，检查两种方法各能解释什么。',
        note: '自由不是一句“我想怎样”。',
        objective: '能比较康德自律自由与黑格尔制度历史自由，并说明各自限制。',
        practice: '完成六栏比较、两段推理、两个反例、一个现实变式和来源注。',
        checkpoint: '检查道德法则、自律、制度历史、自由与必然、反例和现代应用边界。',
      },
      {
        title: '引导练习｜八张德国观念论论证卡',
        body:
          '准备八题，覆盖经验条件、物自体、道德自律、判断力、主奴意识、辩证法、绝对精神和历史自由。每题先做前测标作者与术语，再写问题与推理，后测用反例和权威解释检验。变式把个人道德问题改为制度问题，观察方法差异。记录“先验等于超自然”“物自体可随便观察”“辩证法等于正反合”“绝对精神等于上帝视角”等错误，并要求每条结论附文本或研究来源。',
        note: '每张卡只解决一个术语难题。',
        objective: '能对八类材料完成作者识别、术语解释、论证重建和反例检验。',
        practice: '提交八张论证卡、两则原文、三个概念变式、反例和错误分类。',
        checkpoint: '检查作者、问题、术语、推理步、反例、历史影响和文本层次。',
      },
      {
        title: '独立迁移与评价｜写一页自由条件比较',
        body:
          '围绕“自由是否需要制度与历史条件”写一页短文，康德部分分析自律与普遍法则，黑格尔部分分析权利、伦理生活与历史展开。至少使用一则原文和两项权威研究解释。加入一个反例，如把法律越多等同自由越多或越少。24 小时后换一个组织场景做变式。评价四项：术语准确、比较同轴、反例有效、边界清楚。最后写一个把绝对精神当全知人格的错误示范并修正。',
        note: '比较方法，不拼术语大杂烩。',
        objective: '能把德国观念论自由问题迁移到制度讨论，并用术语、比较、反例和边界评价。',
        practice: '提交短文、文本与解释来源、24 小时变式、反例和误读修订。',
        checkpoint: '四项自评：术语不混、论证可追、反例被回应、现代应用不把体系当权威；否则重写。',
      },
    ],
    quiz: [
      question(
        '康德的“先验”最接近什么？',
        '经验之所以可能的条件，不是超自然对象',
        ['任何无法观察的东西', '人的任意想象', '上帝直接启示'],
        0,
        '先验考察经验如何被主体条件组织，属于认识论问题。把它理解为神秘实体，会错失康德对知识界限的论证。还要说明它为何不是可直接观察的对象。',
        '事实与定义',
      ),
      question(
        '为什么不能把辩证法简化成“正反合”三个词？',
        '辩证法要分析概念内部矛盾、否定与历史重构，不能用固定三步代替具体论证',
        ['因为黑格尔没有写过辩证', '因为辩证法只用于数学', '因为所有哲学家都用同一定义'],
        1,
        '“正反合”是后世简化，无法说明具体文本中的矛盾运动和概念转换。要读论证结构、历史语境和解释争议，不能只套三拍模板，还要追踪矛盾怎样产生与转化。',
        '材料与推导',
      ),
      question(
        '哪种说法最误解“绝对精神”？',
        '它等于某个全知个人拥有世界全部信息',
        ['它与艺术宗教哲学有关', '它涉及精神自我把握', '它有历史展开维度'],
        2,
        '绝对精神是黑格尔体系中的哲学概念，不是某个人的超能力。理解它需要追踪精神、历史、自由和知识形式的论证，而不是拟人化，也不能把它当成可直接经验的事实。',
        '常见误区',
      ),
      question(
        '把德国观念论迁移到组织自由讨论时，哪种分析最完整？',
        '同时检查个人自律、制度约束、历史形成和反例，不用单一术语下结论',
        ['只说自由就是没有规则', '只引用绝对精神', '用正反合决定人事'],
        0,
        '自由既涉及行动者自我约束，也受制度和历史条件影响。多轴分析能避免口号化，但仍要说明具体文本支持到哪一步，以及何种制度条件仍不足以证明自由。',
        '迁移应用',
      ),
    ],
  },
  'schools:自由主义、社会主义与保守主义': {
    contentStatus: 'reviewed',
    prerequisite: '完成启蒙与德国古典课程，能区分价值主张、制度方案和现实后果。',
    plainLanguageGoal:
      '学完后，你能用自由、平等、产权、市场、福利、传统、共同体和革命等轴比较三大传统，并识别内部流派。',
    guidedPractice:
      '对读八项政策议题，分别写三大传统的可能支持理由、反对理由、受影响者、执行代价和反例。',
    independentPractice:
      '围绕一项教育或住房政策做议题矩阵，引用至少三种传统的权威资料并写出自己的有限判断。',
    commonErrors: [
      '把自由主义等同无限市场，把社会主义等同取消一切个人选择。',
      '把保守主义等同反对所有变化，忽略其内部民主与威权分支。',
      '只看左右标签，不分析自由、平等、产权和共同体的具体冲突。',
    ],
    sourceRefs: IDEOLOGY_SOURCES,
    studyPoints: [
      point('必背', '三大传统内部均有多种流派；比较要按自由、平等、产权、市场、福利、传统、共同体和革命逐轴进行。', 1),
      point('重点', '同一政策可能被不同价值理由支持，不能从手段直接推断完整意识形态。', 2),
      point('易错', '自由主义不等于无政府市场，社会主义不等于取消个人自由，保守主义也不等于完全拒绝改革。', 3),
      point('考点', '为政策写出支持理由、内部流派、受益受损、执行风险和最强反例。', 4),
    ],
    eventDetails: [IDEOLOGIES_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜减税一定是自由派吗',
        body:
          '先做前测：减税、扩大福利和提高遗产税分别会得到哪些传统支持？要求不按左右标签，直接写自由、平等、产权、市场、福利、传统、共同体和革命八轴。变式把税收换成公共住房。反例是假定“某派一定支持某政策”。后测为一项政策列三种支持理由和三种反对理由，并说明各理由属于哪一内部流派、历史语境和证据需求。',
        note: '先写理由，再贴标签。',
        objective: '能从多个价值轴诊断政策，避免把意识形态当固定政策按钮。',
        practice: '完成减税与住房两组前测，写价值理由、流派、受益受损、风险和反例。',
        checkpoint: '检查价值轴、内部流派、政策手段、历史语境、证据需求和标签化判断。',
      },
      {
        title: '材料与概念｜三大传统的重叠与分歧',
        body:
          '自由主义重视个人自由、权利和法治，但市场与社会正义立场多样；社会主义关注资本权力、阶级、所有权和平等，从革命到改良、从国家到市场方案差异明显；保守主义强调传统、制度和共同体，也可分为怀疑抽象改造、维护秩序和民主宪政等路线。三者围绕自由、平等、产权、市场、福利、传统、共同体和革命形成交叉。比较必须使用共同议题，说明原典或研究解释，不能用左右一根轴替代制度与后果分析。',
        note: '同一标签里有不同答案。',
        objective: '能解释三大传统的核心价值、内部差异和相互重叠。',
        practice: '为三大传统各写两个内部流派、共同关切、政策分歧和一个反例。',
        checkpoint: '检查价值与手段区分、内部流派、产权和福利、传统共同体、革命态度及来源。',
      },
      {
        title: '示范与推导｜同一住房政策的三条论证链',
        body:
          '示范公共住房政策：自由主义可争论产权与机会平等，社会主义可分析住房商品化和阶级，保守主义可关注家庭、社区连续性与财政能力。每条论证写价值前提、制度假设、受益者、成本、执行风险和可检验指标。反例是只用一个“自由”词就宣布结论。变式把补贴改为租金管制，观察短长期效果和不同流派变化。最后比较三条论证是否能共享某些经验证据，又在哪些价值上真正冲突。',
        note: '理由相同不代表制度相同。',
        objective: '能把三大传统转成可比较的住房政策论证和证据问题。',
        practice: '完成三条论证链、受益成本表、三个指标、两个政策变式和反例。',
        checkpoint: '检查价值前提、制度差异、内部流派、短长期后果、证据和冲突层次。',
      },
      {
        title: '引导练习｜八项政策议题矩阵',
        body:
          '准备八题，覆盖税收、福利、教育、医疗、产权、工会、移民和革命。每题先做前测列自由与平等等价值轴，再写至少两种传统的支持与反对，后测加入受影响者和经验证据。变式改变时间尺度或国家能力，观察立场是否变化。记录“市场派等于自由派”“福利派等于社会主义”“保守派等于反改革”等错误，并要求指出同一传统内部的分歧和可能联盟。',
        note: '每个标签至少拆成两派。',
        objective: '能对八项政策完成多轴比较、内部流派、利益分析和变式检验。',
        practice: '提交八张政策矩阵、三个时间变式、受益受损表、反例和来源注。',
        checkpoint: '检查价值轴、内部流派、政策工具、受影响者、证据、历史语境和联盟可能。',
      },
      {
        title: '独立迁移与评价｜做一份议题矩阵并下判断',
        body:
          '选择教育资助或住房保障，先做前测列价值冲突，再分别写自由、社会、保守传统的多种论证。至少引用三项权威研究资料，并用现实数据检查受益者、成本和结果。24 小时后改变执行规模做变式。评价四项：流派区分、论证公平、证据完整、反例有效。最后写一个“只要被某派提出就必然错误”的反例，说明怎样转向具体理由与后果评价。',
        note: '判断可以坚定，标签必须可拆。',
        objective: '能把三大传统迁移到现实政策，并用多轴、流派、证据和反例评价。',
        practice: '提交议题矩阵、三种论证、数据证据、24 小时变式、反例和有限结论。',
        checkpoint: '四项自评：未稻草人化、内部流派可见、价值与经验分开、结论说明代价；否则修订。',
      },
    ],
    quiz: [
      question(
        '比较三大意识形态时，最可靠的方法是什么？',
        '按自由、平等、产权、福利、传统等共同轴比较，并区分内部流派',
        ['按左右标签排座次', '只看代表人物国籍', '把一种政策固定给一派'],
        0,
        '共同轴能暴露价值与制度差异，内部流派分析防止稻草人。单一标签无法解释同一传统为何在不同国家和时期支持不同政策。',
        '事实与定义',
      ),
      question(
        '为什么不能把自由主义直接等同无限市场？',
        '自由主义内部对市场、福利、社会正义和权利有不同立场',
        ['因为自由主义没有自由概念', '因为所有自由派都反对产权', '因为市场与个人自由完全无关'],
        1,
        '自由主义者共享个人自由与法治关切，但对市场边界和再分配存在长期争论。把一种经济立场当全部传统，会忽略内部多样性。',
        '材料与推导',
      ),
      question(
        '哪种说法最误解保守主义？',
        '保守主义必然反对任何改革，也只有一个政治立场',
        ['保守主义重视传统和制度连续性', '保守主义内部存在分支', '保守主义会评估改革代价'],
        2,
        '保守主义可强调审慎改革、共同体或秩序，也存在民主与威权差异。它并非天然反对所有变化，关键在如何理解传统、风险和制度。',
        '常见误区',
      ),
      question(
        '分析公共住房政策时，哪种做法最完整？',
        '分别写三种传统的价值理由、内部流派、受益受损、执行成本和数据证据',
        ['只喊一个左右口号', '假定某派必然支持', '忽略住房市场与社区条件'],
        0,
        '政策评价需要价值与经验两层。公平复述各派理由、检查执行和受影响者，才能避免把复杂制度问题压成阵营投票。',
        '迁移应用',
      ),
    ],
  },
  'schools:存在主义、实用主义与分析哲学': {
    contentStatus: 'reviewed',
    prerequisite: '完成启蒙、德国古典和意识形态课程，能区分哲学问题、方法与人生口号。',
    plainLanguageGoal:
      '学完后，你能用存在、实践和语言三轴解释三大传统，并分析同一公共议题中的自由、后果与概念清晰。',
    guidedPractice:
      '分析八段现当代哲学材料，写问题、方法、核心概念、证据类型、反例和公共应用。',
    independentPractice:
      '围绕人工智能责任写三栏分析：存在处境、实践后果、语言与概念，形成有限结论。',
    commonErrors: [
      '把存在主义等同悲观或任意自由，忽略处境、责任和他者。',
      '把实用主义简化成“有用即真”，忽略探究共同体与经验修正。',
      '把分析哲学等同文字游戏，忽略它在逻辑、语言、心灵和政治哲学中的论证。',
    ],
    sourceRefs: CONTEMPORARY_SOURCES,
    studyPoints: [
      point('必背', '存在主义分析处境中的自由与意义，实用主义以实践和探究检验信念，分析哲学以逻辑与语言澄清问题。', 1),
      point('重点', '三条传统问题和方法不同，比较时先问它要解决什么，再判断证据和公共应用。', 2),
      point('易错', '存在主义不等于任意，实用主义不等于任意有用，分析哲学也不等于只会抠字眼。', 3),
      point('考点', '面对新议题分别写存在处境、实践后果和概念语言三层，再指出不能互相替代处。', 4),
    ],
    eventDetails: [CONTEMPORARY_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜算法替我决定就是自由吗',
        body:
          '先做前测：推荐算法提高选择效率，是否增加自由？要求分别从存在主义、实用主义和分析哲学提出追问：谁承担选择责任、实践后果如何、自由与操纵概念是否清楚。引一则原典或研究资料，标问题与方法。变式把算法改为校园选课。反例是把选择数量等同自由，或把“有用”直接等同正确。后测写三层分析并指出哪层决定、哪层仍需经验证据。',
        note: '同一问题，三种问法。',
        objective: '能从存在、实践和语言三层诊断自由与算法选择问题。',
        practice: '完成算法与选课前测，写责任、后果、概念、证据和至少一个反例。',
        checkpoint: '检查三种方法、自由概念、责任归属、实践证据、语言清晰度和反例。',
      },
      {
        title: '材料与概念｜存在、实践与语言',
        body:
          '存在主义关注具体处境中的自由、焦虑、他者和责任，自由受条件限制且必须承担选择。实用主义把信念放进探究与行动后果，强调公共检验和可修正性，不等于任意相信有用故事。分析哲学用逻辑、概念区分和反例澄清意义，进入语言、心灵、科学和政治问题，不等于只研究语法。三条传统可同时处理公共议题，却使用不同证据。原典、研究解释和现代转述必须分层，历史语境决定术语含义。',
        note: '方法不同，不能混成鸡汤。',
        objective: '能解释三大传统的问题、核心概念、方法差异和证据类型。',
        practice: '为三条传统各写一个核心问题、一个方法、一个常见误读和一个公共议题。',
        checkpoint: '检查存在处境、实践后果、语言清晰、方法证据、误读、来源和历史语境。',
      },
      {
        title: '示范与推导｜一个责任问题怎样三层展开',
        body:
          '示范算法误判的公共责任：存在主义层问当事人如何在制度限制中理解选择与责任；实用主义层比较申诉、审计和结果改进；分析哲学层澄清“责任”是因果责任、角色责任还是道德责任。三栏分别列问题、方法、证据和反例。反例是用抽象自由掩盖算法设计者权力。变式把场景改为医疗辅助，检查风险、专业责任和概念层级如何变化。',
        note: '先分清责任指哪一种。',
        objective: '能把算法责任拆成存在处境、实践后果和语言概念三层。',
        practice: '完成三栏分析、三个责任定义、一个反例、一个医疗变式和证据清单。',
        checkpoint: '检查自由条件、责任类型、实践指标、概念边界、专业风险和应用限制。',
      },
      {
        title: '引导练习｜八张现当代哲学卡',
        body:
          '准备八题，覆盖焦虑与选择、他者、荒诞、探究、真理、语言意义、公共理性和 AI 责任。每题先做前测判传统与方法，再写核心论证，后测用反例和现实证据检验。变式把个人议题改成制度议题，观察方法变化。记录“自由等于任意”“有用等于真”“分析等于抠字眼”“意义等于私人感受”等错误，并要求每条结论说明它是否能被证据或反例挑战。',
        note: '每个判断都要能接受反驳。',
        objective: '能对八类材料完成传统识别、论证重建、反例和公共应用。',
        practice: '提交八张哲学卡、两条原典、三个制度变式、反例和错误分类。',
        checkpoint: '检查方法匹配、概念清楚、责任与后果、证据类型、反例和现实边界。',
      },
      {
        title: '独立迁移与评价｜写一份三轴公共议题分析',
        body:
          '选择 AI 辅助、医疗决策或校园管理，先做前测列事实与价值争议，再从存在、实践和语言三层分析自由、责任和意义。至少引用三项权威资料，说明存在描述、经验检验和概念论证各自能做什么。24 小时后改变受影响者做变式。评价四项：方法区分、概念清楚、证据匹配、边界诚实。最后写一个把哲学分析直接当技术方案的反例，并说明还需哪些专业与经验工作。',
        note: '哲学帮助澄清，不替代全部专业。',
        objective: '能把三大传统迁移到现实议题，并用方法、概念、证据和边界评价。',
        practice: '提交三轴分析、三项来源、24 小时变式、证据分工、反例和有限结论。',
        checkpoint: '四项自评：方法未混、概念可检、证据适合、专业边界明确；否则重写。',
      },
    ],
    quiz: [
      question(
        '存在主义对自由的课程理解更接近什么？',
        '在具体处境和限制中承担选择与责任，而不是任意行事',
        ['完全没有条件', '只要想法积极就自由', '自由等于远离所有他人'],
        0,
        '存在主义讨论处境中的选择、焦虑、他者与责任。自由不是无条件全能，也不能取消社会条件和对他人的影响。还要追问选择是否被操纵、由谁承担后果。',
        '事实与定义',
      ),
      question(
        '实用主义为什么不能简化为“有用即真”？',
        '它强调公共探究、经验后果和可修正性，而不是任意相信对己有用的说法',
        ['因为它完全不谈行动', '因为它只研究语言', '因为真理没有公共检验'],
        1,
        '实用主义让信念接受实践检验，但“有用”需说明对谁、在何种探究和证据中。任意有用论会取消错误可能，反而违背其探究精神，也不能绕过公共论证。',
        '材料与推导',
      ),
      question(
        '哪种说法最误解分析哲学？',
        '它只是挑语病，对现实伦理和政治问题没有贡献',
        ['它重视逻辑和概念区分', '它进入心灵与语言哲学', '它使用反例检验论证'],
        2,
        '分析哲学是方法和传统，涉及语言、科学、心灵和政治等领域。澄清概念常是解决问题的一步，但不能被简化成无意义抠字，也不能取代经验研究。',
        '常见误区',
      ),
      question(
        '把三传统用于 AI 责任时，哪种分析最完整？',
        '分别检查当事人处境、责任类型、实践后果和申诉机制，不把一层替代全部',
        ['只说 AI 没有灵魂', '只统计点击率', '只背存在主义名言'],
        0,
        'AI 责任涉及概念定义、制度后果和人的处境。三轴可互补，但最终还需法律、工程和数据证据，哲学不能单独替代。',
        '迁移应用',
      ),
    ],
  },
};
