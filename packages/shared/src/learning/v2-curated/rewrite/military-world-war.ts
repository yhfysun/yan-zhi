import type { LearningV2EventDetail, LearningV2Practice, LearningV2StudyPoint } from '../../v2-types.js';
import type { CuratedCoursePlanPatchMap } from '../types.js';

const q = (
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

const point = (label: LearningV2StudyPoint['label'], text: string, stepIndex: number): LearningV2StudyPoint =>
  ({ label, text, stepIndex });

const src = (id: string, title: string, issuer: string, url: string, usedFor: string) =>
  ({ id, title, issuer, url, usedFor });

const NAPOLEON_WARS = src(
  'napoleon-wars',
  'Napoleonic Wars',
  'Encyclopaedia Britannica',
  'https://www.britannica.com/event/Napoleonic-Wars',
  '核对战争时间、联盟变化、主要战役与战后秩序。',
);
const NAPOLEON = src(
  'napoleon',
  'Napoleon I',
  'Encyclopaedia Britannica',
  'https://www.britannica.com/biography/Napoleon-I',
  '核对拿破仑的政治崛起、军事组织、帝国治理与失败过程。',
);
const CLAUSEWITZ = src(
  'clausewitz',
  'On War',
  'Carl von Clausewitz，Project Gutenberg 公版英译本',
  'https://www.gutenberg.org/ebooks/1946',
  '核对政治目的、摩擦、重心与战争不确定性的理论表述。',
);
const UK_NAPOLEON = src(
  'uk-napoleon',
  'What was the impact of the Napoleonic Wars on Britain?',
  'The National Archives UK',
  'https://www.nationalarchives.gov.uk/education/resources/what-was-the-impact-of-the-napoleonic-wars-on-britain/',
  '用税收、工业、海军和社会动员材料分析战争总成本。',
);
const IWM_WWI = src(
  'iwm-wwi',
  'First World War',
  'Imperial War Museums',
  'https://www.iwm.org.uk/history/first-world-war',
  '核对西线、帝国动员、后方社会与战争记忆。',
);
const BRIT_WWI = src(
  'britannica-wwi',
  'World War I',
  'Encyclopaedia Britannica',
  'https://www.britannica.com/event/World-War-I',
  '核对战争爆发、联盟、主要战场和停战进程。',
);
const UK_WWI = src(
  'uk-wwi',
  'World War One',
  'The National Archives UK',
  'https://www.nationalarchives.gov.uk/education/resources/world-war-one/',
  '使用档案分析征兵、后方、帝国与政府记录。',
);
const ICRC = src(
  'icrc',
  'IHL Treaties',
  'International Committee of the Red Cross',
  'https://ihl-databases.icrc.org/en/ihl-treaties',
  '核对武装冲突中的平民保护、比例性和责任边界。',
);
const USHMM_WWII = src(
  'ushmm-wwii',
  'World War II in Depth',
  'United States Holocaust Memorial Museum',
  'https://encyclopedia.ushmm.org/content/en/article/world-war-ii-in-depth',
  '核对二战进程、纳粹种族灭绝、占领政策与平民伤害。',
);
const WWII_MUSEUM = src(
  'wwii-museum',
  'The War',
  'The National WWII Museum',
  'https://www.nationalww2museum.org/war',
  '核对多战场进程、工业动员、租借和总体战社会影响。',
);
const IWM_WWII = src(
  'iwm-wwii',
  'Second World War',
  'Imperial War Museums',
  'https://www.iwm.org.uk/history/second-world-war',
  '核对战争全局、平民经验、帝国兵员与战后记忆。',
);
const CUBAN_CRISIS = src(
  'cuban-crisis',
  'The Cuban Missile Crisis, 1962',
  'U.S. Office of the Historian',
  'https://history.state.gov/milestones/1961-1968/cuban-missile-crisis',
  '核对危机决策、沟通、封锁、秘密谈判与降级过程。',
);
const JFK_CUBA = src(
  'jfk-cuba',
  'Cuban Missile Crisis',
  'John F. Kennedy Presidential Library and Museum',
  'https://www.jfklibrary.org/learn/about-jfk/jfk-in-history/cuban-missile-crisis',
  '核对会议记录、公开信号、执行委员会讨论与危机管理。',
);
const WILSON = src(
  'wilson',
  'Cold War International History Project Digital Archive',
  'Wilson Center',
  'https://digitalarchive.wilsoncenter.org/',
  '检索冷战多国档案、代理冲突与危机沟通材料。',
);

const NAPOLEON_ARCHIVE = {
  id: 'napoleonic-mobilization',
  kind: 'event',
  title: '拿破仑战争：动员怎样扩大战争也制造极限',
  period: '1799 至 1815 年',
  summary:
    '拿破仑战争把大众动员、军团组织、参谋协调和快速机动推到新规模，也把占领成本、后勤压力、民族抵抗和反法联盟学习一起放大。动员不是无限资源，扩张会不断改变政治目的与军事手段。',
  background:
    '法国革命后的政治与社会变化扩大了征兵和民族动员基础，欧洲各国随后被迫改革军队、财政和联盟。战争从革命防御逐步扩展为帝国竞争，最终形成跨欧洲的大规模联盟冲突。',
  timeline: [
    {
      date: '节点 01',
      title: '革命与战争互相塑造',
      body: '法国革命引发外部干预和内部动荡，战争反过来强化国家动员、军队晋升与民族政治。革命原则能提高参与，也会造成分裂和对占领地区的强制。',
      sourceIds: ['napoleon', 'napoleon-wars'],
    },
    {
      date: '节点 02',
      title: '军团与参谋改变组织',
      body: '军团把步兵、骑兵和炮兵组合成可独立行动的单位，提高行军与集中速度。指挥仍受通信、天气和情报限制，组织创新不能消除摩擦。',
      sourceIds: ['napoleon-wars', 'napoleon'],
    },
    {
      date: '节点 03',
      title: '总动员扩大兵源与财政压力',
      body: '征兵、税收、征用和工业供应扩大可投入兵力，也把更多家庭与地区卷入战争。兵源越多，训练、装备、粮食和医疗需求同步增长。',
      sourceIds: ['uk-napoleon', 'napoleon-wars'],
    },
    {
      date: '节点 04',
      title: '快速机动依赖后勤与道路',
      body: '快速推进可以抢在对手集中前取得优势，但距离增加后，补给、马匹、道路和季节会限制可持续行动。就地征用能缓解运输，却会激化抵抗。',
      sourceIds: ['clausewitz', 'uk-napoleon'],
    },
    {
      date: '节点 05',
      title: '占领催生民族主义抵抗',
      body: '法国扩张改变边界和政权，也触发被占领地区的民族主义、游击和反法动员。军事控制若缺乏政治合法性，会持续消耗兵力和资源。',
      sourceIds: ['napoleon-wars', 'napoleon'],
    },
    {
      date: '节点 06',
      title: '反法联盟学习并调整',
      body: '失败促使对手改革动员、参谋、后勤与联合作战。联盟规模扩大不等于自动协同，政治目标和指挥关系仍需协调。',
      sourceIds: ['napoleon-wars', 'uk-napoleon'],
    },
    {
      date: '节点 07',
      title: '远征暴露战略极限',
      body: '远征俄国等行动把距离、气候、疾病、补给和敌对环境叠加，造成巨大损失。评价不能只看某次会战，而要比较政治目标与持续能力。',
      sourceIds: ['napoleon', 'clausewitz'],
    },
  ],
  outcome:
    '拿破仑战争显示大众动员和组织创新能扩大战争规模，但后勤、占领抵抗、联盟学习和政治目的会设置边界。动员越深，战争对社会成本越高。',
  significance:
    '它连接了革命政治、军事组织和工业化前动员，为理解总体战的形成与限制提供基础，也提醒分析者不能用单一会战解释帝国兴衰。',
  sourceCards: [NAPOLEON_WARS, NAPOLEON, CLAUSEWITZ, UK_NAPOLEON],
} satisfies LearningV2EventDetail;

const WWI_ARCHIVE = {
  id: 'wwi-industrial-attrition',
  kind: 'event',
  title: '第一次世界大战：工业化消耗怎样形成',
  period: '1914 至 1918 年',
  summary:
    '第一次世界大战不是指挥官愚蠢导致士兵无意义死亡的单因故事。铁路动员、火炮工业、堑壕防御、总动员和联盟承诺共同提高战争持续能力，也让速决计划迅速破产。',
  background:
    '欧洲列强拥有大规模常备军、铁路网和工业基础，联盟承诺又使局部危机迅速扩大。战争爆发后，防御火力、动员规模和后方生产把冲突推入长期消耗。',
  timeline: [
    {
      date: '节点 01',
      title: '联盟承诺放大局部危机',
      body: '刺杀事件触发奥匈与塞尔维亚冲突，但联盟、帝国竞争、动员时间表和国内政治把危机扩大。动员一旦启动，撤退和转向都承担高昂政治成本。',
      sourceIds: ['britannica-wwi', 'uk-wwi'],
    },
    {
      date: '节点 02',
      title: '铁路让动员更快也更难停止',
      body: '铁路能把大量兵员送到边境，却要求提前制定时刻表。军事时间表压缩外交空间，也让各国担心落后于对手动员。',
      sourceIds: ['britannica-wwi', 'iwm-wwi'],
    },
    {
      date: '节点 03',
      title: '火炮与防御改变战场',
      body: '机枪、火炮、堑壕和铁路补给提高防御方持续能力。进攻即使投入大量兵力，也可能在炮火准备、地形和通信限制下付出高成本。',
      sourceIds: ['iwm-wwi', 'uk-wwi'],
    },
    {
      date: '节点 04',
      title: '凡尔登与索姆河显示消耗逻辑',
      body: '大规模战役试图耗尽对手兵力与意志，却同时消耗己方。评价不能只统计推进距离，还要看伤亡、工业产出、后方承受和战略牵制。',
      sourceIds: ['iwm-wwi', 'britannica-wwi'],
    },
    {
      date: '节点 05',
      title: '总动员把后方纳入战争',
      body: '征兵、军工、粮食配给、女性劳动、宣传和财政把社会整体卷入战争。后方生产支撑前线，也承受通胀、短缺和人员损失。',
      sourceIds: ['uk-wwi', 'iwm-wwi'],
    },
    {
      date: '节点 06',
      title: '新参战者与资源变化打破僵局',
      body: '俄国革命、美国参战、潜艇战和1918年攻势改变力量平衡。停战来自军事疲劳、资源枯竭和国内危机共同作用，并非单一战役终结战争。',
      sourceIds: ['britannica-wwi', 'iwm-wwi'],
    },
    {
      date: '节点 07',
      title: '停战不等于稳定和平',
      body: '赔款、边界、帝国解体、战争责任与记忆政治继续影响战后秩序。军事停火没有自动解决社会创伤和政治冲突。',
      sourceIds: ['uk-wwi', 'britannica-wwi'],
    },
  ],
  outcome:
    '一战由联盟危机、铁路动员、工业火力、总动员和资源竞争共同推入消耗。停战结束了主要战斗，却没有自动形成稳定和平。',
  significance:
    '这一战例能解释技术、制度和后方社会如何相互作用，也能避免把伤亡仅归因于个人失误或用单场战役替代总体分析。',
  sourceCards: [IWM_WWI, BRIT_WWI, UK_WWI, ICRC],
} satisfies LearningV2EventDetail;

const WWII_ARCHIVE = {
  id: 'wwii-industrial-total-war',
  kind: 'event',
  title: '第二次世界大战：工业能力与总体战的代价',
  period: '1939 至 1945 年',
  summary:
    '第二次世界大战把工业产能、资源控制、租借、科技组织和全球后勤推到决定性位置，同时也包含侵略、占领、大屠杀和大规模平民伤亡。工业能力不能脱离政治目的与法律责任评价。',
  background:
    '纳粹德国、法西斯意大利和日本帝国发动侵略扩张，盟国通过工业动员、租借、联合指挥和全球补给反击。战争覆盖欧洲、亚洲、非洲和太平洋，平民承受巨大伤害。',
  timeline: [
    {
      date: '节点 01',
      title: '侵略扩张把地区冲突连成世界大战',
      body: '德国、意大利和日本的扩张目标与联盟关系把多个地区战争连接起来。分析起因必须同时看意识形态、帝国竞争、资源需求和绥靖失败。',
      sourceIds: ['ushmm-wwii', 'wwii-museum'],
    },
    {
      date: '节点 02',
      title: '工业产能决定持续能力',
      body: '飞机、舰船、坦克、弹药、燃料和运输需要完整供应链。产能不仅取决于工厂，还依赖矿产、能源、劳动力、技术和运输网络。',
      sourceIds: ['wwii-museum', 'iwm-wwii'],
    },
    {
      date: '节点 03',
      title: '租借与联盟连接资源',
      body: '美国租借援助向盟国提供装备、原料和运输支持，改变资源分配与战场持续能力。援助同时包含政治条件、债务和国内争论，不是单纯赠送。',
      sourceIds: ['wwii-museum', 'ushmm-wwii'],
    },
    {
      date: '节点 04',
      title: '占领经济伴随强制与掠夺',
      body: '德国和日本利用占领区资源、劳动和工业，却同时制造饥荒、强制劳动、镇压和反抗。资源控制会提高短期产出，也增加安全和治理成本。',
      sourceIds: ['ushmm-wwii', 'iwm-wwii'],
    },
    {
      date: '节点 05',
      title: '大屠杀不是工业战的脚注',
      body: '纳粹种族灭绝有独立意识形态和官僚组织，也利用战争中的占领、铁路、警察和工业体系。军事史必须把受害者经验与加害责任放在核心。',
      sourceIds: ['ushmm-wwii'],
    },
    {
      date: '节点 06',
      title: '战略轰炸与平民风险',
      body: '战略轰炸试图破坏工业、交通和意志，却造成大量平民伤亡并引发比例性与区分原则争议。军事效果需要与人员伤害、法律和道德责任一起评价。',
      sourceIds: ['ushmm-wwii', 'icrc'],
    },
    {
      date: '节点 07',
      title: '胜利之后仍有占领与审判',
      body: '战争结束不等于伤害自动修复。占领、难民、审判、去纳粹化、殖民解体与记忆政治继续塑造战后秩序。',
      sourceIds: ['ushmm-wwii', 'iwm-wwii'],
    },
  ],
  outcome:
    '二战中的工业能力、全球后勤和联盟资源决定军事持续力，但侵略、占领、大屠杀和平民伤害属于同一历史整体，不能用生产效率淡化责任。',
  significance:
    '这一框架能训练学习者同时阅读生产数据、战场行动、受害者经验与国际法，避免把总体战写成没有人的产能竞赛。',
  sourceCards: [USHMM_WWII, WWII_MUSEUM, IWM_WWII, ICRC],
} satisfies LearningV2EventDetail;

const COLD_WAR_ARCHIVE = {
  id: 'cold-war-deterrence-proxy',
  kind: 'case',
  title: '冷战威慑与代理冲突：危机怎样避免升级',
  period: '1947 至 1991 年',
  summary:
    '冷战没有形成超级大国直接全面战争，却产生大量代理冲突、军备竞赛和核危机。威慑依赖能力、沟通与信誉，遏制通过联盟和援助实施，地方战争又拥有自身政治动力。',
  background:
    '美苏竞争结合核武器、联盟体系、去殖民化和意识形态冲突。核报复能力提高全面战争代价，也使有限冲突、危机沟通和升级控制成为核心问题。',
  timeline: [
    {
      date: '节点 01',
      title: '核威慑建立在高代价预期上',
      body: '威慑要让对手相信某种行动的成本高于收益，需要能力、意图和可信承诺。核武器提高全面战争风险，却没有消除有限冲突和政治竞争。',
      sourceIds: ['cuban-crisis', 'clausewitz'],
    },
    {
      date: '节点 02',
      title: '遏制通过联盟与援助实施',
      body: '美国通过联盟、驻军、经济援助和安全承诺限制苏联影响，苏联也建立自己的阵营。前沿存在提高承诺可信度，也可能把地方争端变成大国危机。',
      sourceIds: ['cuban-crisis', 'wilson'],
    },
    {
      date: '节点 03',
      title: '代理冲突有本地政治动力',
      body: '朝鲜、越南、安哥拉和阿富汗等冲突获得大国资金与武器，但民族主义、土地、殖民遗产和政权竞争同样推动战争。外部支持会被本地行动者重新使用。',
      sourceIds: ['wilson', 'icrc'],
    },
    {
      date: '节点 04',
      title: '古巴导弹危机形成升级压力',
      body: '苏联在古巴部署导弹被美国发现后，封锁、公开信号、秘密谈判和军事准备同时进行。双方既要展示决心，又要避免误判触发不可控升级。',
      sourceIds: ['cuban-crisis', 'jfk-cuba'],
    },
    {
      date: '节点 05',
      title: '降级依靠沟通与相互让步',
      body: '危机缓和包含公开与秘密渠道、可逆步骤和给对方保留退路。沟通减少误判，却不能消除利益冲突，也可能被国内受众批评为软弱。',
      sourceIds: ['cuban-crisis', 'jfk-cuba'],
    },
    {
      date: '节点 06',
      title: '军控提高透明度但有限',
      body: '热线、条约、核查和信任措施能降低事故与误判风险，却无法自动解决代理战争、人权和联盟竞争。制度需要持续政治支持。',
      sourceIds: ['cuban-crisis', 'wilson'],
    },
    {
      date: '节点 07',
      title: '平民保护与国际法不能缺席',
      body: '代理战争中的地雷、化学武器、难民和基础设施破坏造成长期伤害。国际人道法要求区分、比例和预防措施，战略效果不能替代法律责任。',
      sourceIds: ['icrc', 'wilson'],
    },
  ],
  outcome:
    '冷战稳定不是核武器自动带来的结果，而是能力、沟通、联盟管理、危机降级和相互约束共同形成。代理冲突仍造成严重平民伤害。',
  significance:
    '这一框架能避免把冷战写成美苏遥控棋盘，也能说明威慑、危机沟通和国际法为何必须一起分析。',
  sourceCards: [CUBAN_CRISIS, JFK_CUBA, WILSON, ICRC, CLAUSEWITZ],
} satisfies LearningV2EventDetail;

export const MILITARY_WORLD_WAR_REWRITE: CuratedCoursePlanPatchMap = {
  'military:拿破仑战争与动员': {
    contentStatus: 'reviewed',
    prerequisite: '完成战争基础课程，能区分政治目的、动员规模、后勤持续和战术行动。',
    plainLanguageGoal: '学完后，你能解释拿破仑战争如何结合大众动员、军团组织与快速机动，并说明后勤、占领抵抗和联盟学习为何限制扩张。',
    guidedPractice: '为一次公开拿破仑战役画“征兵—财政—运输—军团行动—占领反应”五节点图，并标出两个最可能失效的环节。',
    independentPractice: '围绕“动员扩大能力还是扩大脆弱性”写 250 字判断，至少比较兵源、后勤和政治合法性三项。',
    commonErrors: [
      '把拿破仑胜利只归因于个人天才，不看动员、组织和对手条件。',
      '认为总动员能无限提供兵力和资源，不看训练、装备、粮食与社会成本。',
      '把占领区当静态资源，忽略民族主义、抵抗和治理成本。',
    ],
    sourceRefs: [
      'Encyclopaedia Britannica, Napoleonic Wars。https://www.britannica.com/event/Napoleonic-Wars',
      'Encyclopaedia Britannica, Napoleon I。https://www.britannica.com/biography/Napoleon-I',
      'Carl von Clausewitz, On War。https://www.gutenberg.org/ebooks/1946',
      'The National Archives UK, What was the impact of the Napoleonic Wars on Britain?。https://www.nationalarchives.gov.uk/education/resources/what-was-the-impact-of-the-napoleonic-wars-on-britain/',
    ],
    studyPoints: [
      point('必背', '拿破仑战争把大众动员、军团组织、参谋协调和快速机动结合，也受到后勤、占领抵抗和联盟学习的限制。', 1),
      point('重点', '动员扩大兵源和财政能力，同时提高训练、装备、粮食、医疗和治理需求。', 2),
      point('易错', '快速机动不等于无限行动半径，就地征用会缓解运输却可能激化抵抗。', 4),
    ],
    eventDetails: [NAPOLEON_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜动员怎样同时扩大力量与负担',
        body: '一个国家扩大征兵后能投入更多兵力，却也必须提供训练、武器、粮食、医疗和退役安置。拿破仑军团可以分路行军并快速集中，但道路、马匹、天气和补给会限制可持续距离。占领区能够提供税收和物资，也会产生抵抗、治安和行政成本。诊断要把动员、组织、后勤和战争代价放在同一张图上，而不是只看会战人数或单一胜败。',
        note: '动员增加能力，也增加成本。',
        objective: '能从兵源、财政、运输、军团行动和占领治理提出动员的双重后果。',
        practice: '为一次动员写“新增能力—新增需求—可能瓶颈—社会代价”四栏表，每栏至少三项。',
        checkpoint: '检查是否只写人数增加，是否写到装备与粮食，是否把占领抵抗和财政压力纳入结果。',
      },
      {
        title: '材料与概念｜军团、总动员与后勤约束',
        body: '法国革命和拿破仑时期扩大征兵与民族动员，军团把步兵、骑兵和炮兵组合成较独立的作战单位，参谋协调行军与集中。快速机动能够抢在对手完成集结前行动，却依赖道路、地图、通信和补给。就地征用减少运输距离，也会破坏当地经济并引发抵抗。反法联盟在失败中改革动员、财政和指挥，使拿破仑的组织优势逐渐被学习与规模抵消。',
        note: '组织创新会被对手学习。',
        objective: '能准确解释总动员、军团、参谋、后勤与联盟学习之间的关系。',
        practice: '制作“组织创新—所需保障—对手应对”三列表，写军团、总动员和快速机动各一行。',
        checkpoint: '检查是否把军团当自动胜利，是否写出后勤，是否说明联盟为何能在战争中学习。',
      },
      {
        title: '示范与推导｜从会战胜利推到帝国极限',
        body: '一次会战获胜可能打开道路、迫使对手签约并获取资源，但驻军、税收和补给会把胜利转为长期负担。若占领引发民族主义抵抗，兵力需要从机动作战转向治安与运输保护；若远征距离过长，疾病、气候和补给损耗会超过战斗损失。战略判断因此要比较政治目的、持续成本、联盟反应和替代方案，而不能把连续胜利当作无限扩张能力。',
        note: '胜利要经过占领成本检验。',
        objective: '能把会战结果连接到占领成本、后勤距离和联盟反应，并判断战略边界。',
        practice: '为一场假想胜利写三项短期收益和三项长期成本，再用一个反事实检验扩张是否仍合理。',
        checkpoint: '检查收益与成本是否同尺度，是否写到抵抗和补给，是否说明何时应停止而不是继续追击。',
      },
      {
        title: '引导练习｜比较动员与社会承受力',
        body: '练习使用税收、征兵、工业产出、粮食价格、伤亡和地方抵抗等指标，比较法国与反法国家在不同阶段的承受力。总动员不是抽象数字，而是家庭、劳动力、财政和地方秩序的变化。再检查宣传与法律如何维持动员合法性，以及失败消息怎样影响政治信任。结论应说明哪项指标最先恶化、对政策有什么反馈，并标出一项仍缺数据的判断。',
        note: '后方数据是战争能力的一部分。',
        objective: '能用社会与财政指标评估动员承受力，并把后方变化连接到战略选择。',
        practice: '选一组公开指标，做战前、战争中段和后期三列比较，写一项趋势和一项无法由数据确认的原因。',
        checkpoint: '检查是否只列绝对数字，是否比较变化速度，是否把宣传、合法性和地方差异纳入解释。',
      },
      {
        title: '独立迁移与评价｜写扩张的边界',
        body: '独立结论可写成：拿破仑战争通过总动员、军团与快速机动扩大行动规模，但远征距离、补给消耗、占领抵抗和联盟学习不断缩小可承受空间。会战胜利若不能转成稳定税收、联盟和治理，反而可能制造更多敌人。文章要区分军事能力与政治结果，说明证据、适用条件、停止条件和反证指标，并评价平民与士兵代价。',
        note: '终稿同时写能力与边界。',
        objective: '能完成一段有动员机制、后勤限制、政治成本和反证条件的 250 字分析。',
        practice: '按“动员—组织—会战—占领—抵抗—联盟—边界”写 250 字，并使用三份来源。',
        checkpoint: '四项自评：是否多因、是否写后勤、是否写占领成本、是否避免个人天才叙事。',
      },
    ],
    quiz: [
      q('拿破仑时期总动员的核心特点是什么？', '扩大征兵和社会资源投入，同时增加财政、训练与后勤需求', ['只增加军官数量', '取消所有税收', '让战争不再需要补给'], 0, '总动员把更多人口和经济资源带入战争，能扩大兵源与生产，也带来装备、粮食、医疗和社会承受压力。能力与成本必须一起分析。', '总动员'),
      q('军团组织为何能提高行动灵活性？', '把不同兵种组合成可独立行动的单位，并依赖参谋协调集中', ['让每个士兵单独作战', '完全取消通信', '使后勤距离消失'], 1, '军团把步兵、骑兵、炮兵和保障组合起来，提高行军与作战灵活性。没有参谋、通信和补给，灵活性无法持续，对手也会学习调整。', '军团组织'),
      q('快速机动最容易被什么条件限制？', '道路、天气、马匹、粮食、维修和对手抵抗', ['旗帜颜色', '将领年龄', '文书字体'], 2, '机动速度依赖运输和保障。距离越长，补给与道路问题越突出；就地征用还会改变当地政治态度并增加护送负担。', '后勤限制'),
      q('评价拿破仑扩张最稳妥的方法是什么？', '比较会战收益、占领成本、联盟反应和社会承受力', ['只看连续胜利次数', '只写个人天才', '只统计军队总人数'], 0, '会战胜利可能扩大控制，也会带来驻军、税收、抵抗和外交成本。战略边界要由收益与持续代价共同决定，并保留停止条件。', '扩张边界'),
    ],
  },
  'military:第一次世界大战与消耗': {
    contentStatus: 'reviewed',
    prerequisite: '完成动员与后勤课程，理解铁路、工业化、联盟和后方社会的基本概念。',
    plainLanguageGoal: '学完后，你能解释一战如何由联盟危机、铁路动员、火炮工业、堑壕防御和总动员进入长期消耗，并说明停战不等于稳定和平。',
    guidedPractice: '建立1914至1918年时间轴，分别标注联盟危机、动员、主要战役、新参战者、后方变化和停战。',
    independentPractice: '选择西线或东线，写250字分析铁路、火炮、地形和后方生产如何共同影响战局。',
    commonErrors: [
      '把战争爆发只归因于一次刺杀，忽略联盟承诺和动员机制。',
      '把消耗战只写成指挥官愚蠢，不看工业火力与防御条件。',
      '把停战当成和平解决，忽略赔款、边界、帝国和记忆争议。',
    ],
    sourceRefs: [
      'Imperial War Museums, First World War。https://www.iwm.org.uk/history/first-world-war',
      'Encyclopaedia Britannica, World War I。https://www.britannica.com/event/World-War-I',
      'The National Archives UK, World War One。https://www.nationalarchives.gov.uk/education/resources/world-war-one/',
      'International Committee of the Red Cross, IHL Treaties。https://ihl-databases.icrc.org/en/ihl-treaties',
    ],
    studyPoints: [
      point('必背', '一战长期消耗由联盟危机、铁路动员、工业火力、堑壕防御、总动员和资源竞争共同形成。', 1),
      point('重点', '火炮和防御工事提高持续杀伤能力，进攻需要火力、情报、通信、后勤与协同共同配合。', 2),
      point('易错', '停战只停止主要战斗，赔款、边界、帝国解体和记忆政治仍继续影响和平。', 4),
    ],
    eventDetails: [WWI_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜速决战为什么变成多年消耗',
        body: '各国动员计划以铁路时刻表为基础，快速集结能抢时间，也让撤回和改向变得困难。开战后火炮、机枪和堑壕提高防御能力，进攻需要更长炮火准备和更多兵力。工业后方可以持续生产弹药，也不断需要劳动力和原料。诊断因此要同时看联盟危机、军事时间表、火力技术和生产能力，不能只用一项原因解释长期战争。',
        note: '速决计划遇到持续能力。',
        objective: '能从联盟、动员时间表、火力、防御和工业后方提出长期消耗问题。',
        practice: '画“动员—集结—进攻—防御火力—工业生产—后方承受”六节点链，标出三处可能导致僵局的环节。',
        checkpoint: '检查是否只写刺杀或指挥官，是否说明铁路双刃性，是否把生产与前线联系起来。',
      },
      {
        title: '材料与概念｜铁路、火炮与总动员',
        body: '铁路能快速调动大量兵员，却要求固定路线、时刻表和边境集结，增加先发压力。火炮与机枪使暴露的步兵难以突破，堑壕、铁丝网和纵深阵地提高防御连续性。总动员把征兵、军工、粮食、财政、宣传和女性劳动纳入战争，后方生产支撑前线，也承受短缺和通胀。工业能力决定弹药与装备供给，运输和能源又决定这些产能能否到达战场。',
        note: '技术、制度和后方是一个系统。',
        objective: '能准确解释铁路、火炮、堑壕和总动员分别怎样影响战争持续性。',
        practice: '制作“技术—战术后果—生产需求—社会后果”四列表，铁路、火炮和堑壕各写一行。',
        checkpoint: '检查是否把技术当自动结果，是否说明生产链条，是否写到后方社会而不仅是军队。',
      },
      {
        title: '示范与推导｜凡尔登为何成为消耗象征',
        body: '凡尔登的象征来自长期炮击、巨大伤亡和战略承诺，而不只是某一天的推进距离。进攻方试图迫使对手持续投入，防守方则把象征意义转化为不能撤退的政治压力。双方都消耗兵力、弹药、运输和医疗能力。评价胜负需要比较目标、伤亡、牵制效果和后续能力，不能只用领土得失。消耗战略还可能反噬，使发起者陷入自己制造的持续投入。',
        note: '消耗战略也会消耗发起者。',
        objective: '能把象征目标、火力消耗、后方生产和战略牵制连接成因果链。',
        practice: '为凡尔登写三项军事目标、三项成本和一个能判断“是否值得”的可观察指标。',
        checkpoint: '检查是否只数伤亡，是否写到政治象征、牵制与工业消耗，是否说明成本由谁承担。',
      },
      {
        title: '引导练习｜对伤亡与战果做史料审计',
        body: '战时宣传、军事报告、医院记录、纪念碑和战后研究可能使用不同统计口径。练习把数据分成战斗伤亡、失踪、疾病、平民死亡和帝国兵员，并记录时间范围与来源。再用生产、铁路运量和粮食数据检查后方承受。数字不确定并不意味着战争无法研究，而是要求区分数量级、趋势和精确结论，避免用最大数字制造单一恐怖叙事。',
        note: '伤亡数字必须标口径。',
        objective: '能审计伤亡、生产和后方数据的不同口径，并说明不确定性对结论的影响。',
        practice: '选一组伤亡数据，列出统计对象、时间、来源和可能重复项，再写一条只依赖趋势的稳健判断。',
        checkpoint: '检查是否混用军人和平民，是否遗漏帝国兵员，是否用单一数字替代因果分析。',
      },
      {
        title: '独立迁移与评价｜写战争与和平的连续线',
        body: '独立结论可写成：一战长期化来自动员时间表、工业火力、防御工事、联盟和后方生产的相互作用；凡尔登等战役体现消耗逻辑，却不能单独解释全部结果。1918年停战改变军事态势，却没有自动解决赔款、边界、帝国解体和社会创伤。文章要把战场、后方与战后秩序连起来，并说明不同材料的证据边界和仍然无法确认的问题。',
        note: '终稿把停战和和平分开。',
        objective: '能完成一段连接战场消耗、后方社会与战后秩序的250字分析。',
        practice: '按“危机—动员—火力—消耗—后方—停战—战后”写250字，并使用三份来源。',
        checkpoint: '四项自评：是否多因、是否写工业、是否评价伤亡口径、是否区分停战与稳定和平。',
      },
    ],
    quiz: [
      q('铁路在一战爆发中为什么具有双刃性？', '能快速动员兵力，却压缩外交时间并让撤退更困难', ['只用于运送平民', '完全不受时刻表影响', '消除了联盟承诺'], 0, '铁路提高集结速度，但军事时间表一旦运行就很难停止。外交谈判空间缩小，动员与反动员形成连锁压力，误判成本上升。', '铁路动员'),
      q('一战西线长期消耗的重要技术条件是什么？', '火炮、机枪、堑壕和铁路补给共同提高防御与持续能力', ['骑兵完全消失', '所有军队只使用冷兵器', '工业生产能力无关'], 1, '火力与工事让进攻难以快速突破，铁路和工业又让双方能持续补充。技术、战术、运输和生产共同形成僵局，也使增加兵力的代价更高。', '消耗条件'),
      q('评估凡尔登战役时最完整的指标是什么？', '战略目标、伤亡、弹药与运输消耗、牵制效果和后续能力', ['只看推进公里数', '只看单日战果', '只看宣传口号'], 2, '凡尔登既是军事行动也是政治象征。需要比较双方目标、成本、牵制和长期能力，不能只用领土变化判断，也不能只数伤亡。', '战役评价'),
      q('1918年停战为什么不能直接等于稳定和平？', '军事战斗停止后，赔款、边界、帝国解体和社会创伤仍然存在', ['所有争议自动消失', '各国经济立即恢复', '战争责任已经解决'], 0, '停战结束主要军事行动，却没有自动解决政治秩序和社会后果。战后条约、帝国重组、难民与记忆政治继续影响欧洲。', '停战边界'),
    ],
  },
  'military:第二次世界大战的工业维度': {
    contentStatus: 'reviewed',
    prerequisite: '完成一战与消耗课程，理解工业、资源、联盟和战争法基础。',
    plainLanguageGoal: '学完后，你能分析二战工业能力、租借、资源和全球后勤，同时把侵略、占领、大屠杀和平民伤害放在同一历史框架中。',
    guidedPractice: '选择飞机、舰船或坦克中的一类，画原料—工厂—运输—前线—维修链条，并列出两个平民或环境成本。',
    independentPractice: '围绕“工业能力是否决定二战结果”写250字判断，至少比较产能、资源、联盟、人员与法律约束。',
    commonErrors: [
      '把工业产能当唯一胜负原因，忽略政治目的、联盟和人员代价。',
      '只统计武器产量，不看能源、矿产、运输、维修和劳动力。',
      '把大屠杀和平民伤害当军事叙述的脚注，而不是战争的一部分。',
    ],
    sourceRefs: [
      'United States Holocaust Memorial Museum, World War II in Depth。https://encyclopedia.ushmm.org/content/en/article/world-war-ii-in-depth',
      'The National WWII Museum, The War。https://www.nationalww2museum.org/war',
      'Imperial War Museums, Second World War。https://www.iwm.org.uk/history/second-world-war',
      'International Committee of the Red Cross, IHL Treaties。https://ihl-databases.icrc.org/en/ihl-treaties',
    ],
    studyPoints: [
      point('必背', '二战工业能力依赖原料、能源、劳动力、技术、运输和维修，必须与政治目的、联盟和法律责任一起分析。', 1),
      point('重点', '租借与全球后勤改变盟国资源分配，占领经济则伴随强制劳动、掠夺和治理成本。', 2),
      point('易错', '大屠杀不是工业战的附带脚注；战略轰炸与平民伤害也不能只用产量效果评价。', 4),
    ],
    eventDetails: [WWII_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜产量为什么不能单独解释胜利',
        body: '一架飞机需要铝、钢、发动机、电子设备、燃料、熟练工人、机场和维修体系。工厂产量高，如果运输被切断、备件不足或训练不够，仍不能转化为持续战斗力。占领区资源能提高短期供给，也会带来强制劳动、抵抗和安全成本。诊断要把工业能力拆成资源、生产、运输、维修和使用，再把侵略、大屠杀和平民伤害纳入同一历史分析。',
        note: '产能必须转成持续使用能力。',
        objective: '能从资源、生产、运输、维修和政治责任提出工业能力分析问题。',
        practice: '为一种装备画五段供应链，分别写产能指标、运输瓶颈、维修需求和一项社会或法律成本。',
        checkpoint: '检查是否只比总产量，是否写出原料和运输，是否遗漏人员与平民代价。',
      },
      {
        title: '材料与概念｜总体战、租借与占领经济',
        body: '总体战动员工业、劳动力、科学、宣传和财政支持战争，也扩大国家对社会的控制。美国租借援助提供装备、原料和运输，帮助盟国连接资源与战场，同时伴随政治谈判和国内争论。德国、日本等侵略国利用占领区资源与强制劳动，却制造饥荒、镇压和抵抗。工业体系可以生产武器，也可以成为大屠杀行政和铁路运输的一部分，因此技术能力必须接受政治与法律评价。',
        note: '工业体系同时生产能力和责任。',
        objective: '能准确解释总体战、租借、占领经济和大屠杀之间的关系。',
        practice: '制作“资源—制度—生产—运输—伤害”五列表，为租借与占领经济各填一行。',
        checkpoint: '检查是否把租借写成无成本赠送，是否把占领资源当纯收益，是否把受害者经验纳入。',
      },
      {
        title: '示范与推导｜从工厂产量推到战场持续性',
        body: '假设坦克月产量增加，但港口卸货能力有限、铁路遭到破坏、备件供应不足，前线可用率仍可能下降。若大量熟练工人被征召，产量也会受技能和劳动条件限制。推导应写生产、运输、维修、训练和消耗五个环节，并分别设置可观察指标。工业优势要经过全球供应链才能转成战场能力，而战略轰炸等行动还会产生平民伤害和法律争议。',
        note: '产量必须经过供应链检验。',
        objective: '能把工业产量逐段连接到运输、维修、训练和战场持续能力。',
        practice: '设计一组产量、港口、铁路、维修和出勤率数据，判断哪一环最可能限制前线可用装备。',
        checkpoint: '检查是否只看工厂产量，是否写出战损与维修，是否说明平民伤害和法律责任。',
      },
      {
        title: '引导练习｜把受害者经验放进工业史',
        body: '大屠杀依赖国家意识形态、官僚组织、警察、军队、铁路和工业掠夺，不能被写成战争效率的副作用。练习选择一组档案，分别标记决策者、执行机构、运输系统、受害者身份和援助或抵抗。再分析同一铁路和工业网络怎样同时服务军事行动与迫害。历史判断必须保留加害责任和受害者声音，不能只用产量图表覆盖。',
        note: '档案要同时追踪加害与受害。',
        objective: '能用档案连接工业系统、加害机构、受害者经验和战后责任。',
        practice: '为一份公开档案写五栏：决策、执行、基础设施、受害者、证据缺口，并说明它改变哪项判断。',
        checkpoint: '检查是否把大屠杀降为背景，是否区分军事目标与迫害机构，是否引用可靠来源。',
      },
      {
        title: '独立迁移与评价｜写有责任边界的工业战分析',
        body: '独立结论可写成：二战的工业产能、资源和全球后勤显著影响军事持续力，但产量不是唯一原因；联盟、政治目的、人员训练、占领治理和法律约束共同改变结果。侵略国用工业体系实施战争和种族灭绝，盟国战略轰炸也造成平民伤害。文章要同时评价能力、责任和受害者代价，不能把效率当道德，也不能把法律责任留作脚注。',
        note: '终稿有产能、责任和边界。',
        objective: '能完成一段结合工业能力、联盟、大屠杀与法律责任的250字分析。',
        practice: '按“资源—生产—运输—联盟—占领—大屠杀—平民—评价”写250字，并使用三份来源。',
        checkpoint: '四项自评：是否写供应链、是否写受害者、是否区分能力与责任、是否避免单一产能决定论。',
      },
    ],
    quiz: [
      q('分析二战工业能力时，为什么不能只看武器总产量？', '资源、运输、维修、训练和使用效率共同决定产量能否转成战斗力', ['因为产量完全没有作用', '因为武器不需要燃料', '因为所有工厂产能相同'], 0, '工厂产量只是供应链一环。原料、能源、港口、铁路、备件、维修和人员训练都会限制前线持续能力，也会带来社会成本。', '工业供应链'),
      q('租借援助的主要历史作用是什么？', '向盟国提供装备、原料和运输支持，并伴随政治与经济谈判', ['完全免费且没有条件', '只提供宣传材料', '自动结束所有战争'], 1, '租借改变盟国资源分配和持续能力，但包含国内政治、债务、优先顺序和战略条件，不是无成本赠送，也不能脱离联盟关系理解。', '租借机制'),
      q('大屠杀为什么不能被当作工业战的脚注？', '它有独立意识形态和官僚组织，也利用战争中的铁路、警察与工业体系', ['因为它与战争完全无关', '因为它只影响军事产量', '因为没有档案材料'], 2, '纳粹种族灭绝是战争历史的核心部分。工业与行政系统参与迫害，分析军事能力时必须保留加害责任和受害者经验。', '大屠杀责任'),
      q('评价战略轰炸最完整的方式是什么？', '同时比较军事效果、平民伤害、比例原则和法律争议', ['只看投弹数量', '只看工厂恢复速度', '只看宣传口号'], 0, '战略轰炸可能影响工业和交通，也造成大量平民伤亡。需要把任务效果、区分原则、比例性和长期社会影响放在一起评价。', '平民与法律'),
    ],
  },
  'military:冷战威慑与代理冲突': {
    contentStatus: 'reviewed',
    prerequisite: '完成世界大战课程，理解联盟、核武器、危机沟通和国际法基础。',
    plainLanguageGoal: '学完后，你能区分威慑、遏制和代理冲突，解释古巴导弹危机的升级与降级机制，并说明国际法为何不能缺席。',
    guidedPractice: '选择一场公开冷战危机，制作“行为者—目标—能力—信号—误判风险—降级步骤”六列表。',
    independentPractice: '围绕“核威慑带来稳定还是只改变冲突形式”写250字判断，至少比较能力、沟通、信誉和代理冲突。',
    commonErrors: [
      '认为核武器一旦存在，所有冲突都会自动受到控制。',
      '把代理冲突完全写成美苏遥控，忽略当地政治和社会动力。',
      '只统计武器数量，不看沟通、信誉、误判、国内政治和国际法。',
    ],
    sourceRefs: [
      'U.S. Office of the Historian, The Cuban Missile Crisis, 1962。https://history.state.gov/milestones/1961-1968/cuban-missile-crisis',
      'John F. Kennedy Presidential Library, Cuban Missile Crisis。https://www.jfklibrary.org/learn/about-jfk/jfk-in-history/cuban-missile-crisis',
      'Wilson Center, Cold War International History Project Digital Archive。https://digitalarchive.wilsoncenter.org/',
      'International Committee of the Red Cross, IHL Treaties。https://ihl-databases.icrc.org/en/ihl-treaties',
    ],
    studyPoints: [
      point('必背', '威慑依赖能力、意图和可信承诺；遏制通过联盟、援助和前沿存在实施；代理冲突有本地政治动力。', 1),
      point('重点', '古巴导弹危机的降级依靠公开信号、秘密谈判、可逆步骤和给对方保留退路。', 2),
      point('易错', '核威慑没有消除有限战争和平民伤害，战略效果不能替代国际法与责任判断。', 4),
    ],
    eventDetails: [COLD_WAR_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜核武器为什么没有让冲突消失',
        body: '核报复能力提高全面战争代价，却没有消除意识形态、联盟和地方争端。超级大国可能在欧洲保持高强度对峙，同时在亚洲、非洲和拉美支持不同阵营。危机中，公开信号与秘密谈判并存，国内受众又要求领导人显示决心。诊断需要区分能力、意图、信誉、误判、沟通和当地政治，不能只数导弹或核弹头，也不能把没有直接战争等同于没有冲突。',
        note: '核威慑改变成本，不消除竞争。',
        objective: '能从能力、意图、信誉、沟通和地方政治提出冷战安全问题。',
        practice: '为一场公开危机列出四方行为者、各自目标、可用信号和一项误判风险。',
        checkpoint: '检查是否把核武器当自动稳定器，是否写出国内政治，是否把地方行动者当被动工具。',
      },
      {
        title: '材料与概念｜威慑、遏制与代理冲突',
        body: '威慑要让对手相信某种行动的成本高于收益，因此需要能力、可传达意图和可信承诺。遏制通过联盟、军事援助、经济计划、驻军和前沿存在限制对手影响，前沿承诺提高可信度，也可能把局部冲突升级为大国危机。代理冲突获得外部资金和武器，却由本地民族主义、土地、殖民遗产和政权竞争驱动。外部资源进入后会改变力量，也会被地方行动者用于自身目标。',
        note: '大国资源进入本地政治逻辑。',
        objective: '能准确区分威慑、遏制和代理冲突，并说明各自的行为者和风险。',
        practice: '制作三列表：机制、所需信号、失败风险；分别填写威慑、遏制和代理冲突。',
        checkpoint: '检查是否把遏制等同直接战争，是否把代理冲突写成遥控，是否说明信誉和本地动力。',
      },
      {
        title: '示范与推导｜古巴危机如何保留降级台阶',
        body: '美国发现苏联在古巴部署导弹后，需要回应国内压力和盟友信任，又要避免直接攻击引发核升级。封锁、公开讲话、军事准备和秘密谈判同时使用，使对手理解底线并保留交换空间。危机降级依赖可逆步骤、可靠沟通和双方都能接受的条件。若只有最后通牒或缺乏沟通，误判、事故和国内政治压力会显著上升，任何一方也可能被公开承诺锁死。',
        note: '降级需要可逆台阶与沟通。',
        objective: '能把威慑信号、危机沟通、可逆步骤和误判风险连接成升级/降级模型。',
        practice: '为同一危机写升级、停滞、降级三条路径，各列两个触发条件和一项沟通措施。',
        checkpoint: '检查是否只写武器数量，是否说明国内压力，是否给对方保留可执行退路。',
      },
      {
        title: '引导练习｜用多国档案复盘代理冲突',
        body: '代理冲突复盘要同时使用超级大国档案、当地政府文件、组织记录、邻国材料和受害者证词。外部援助的规模、时间和条件会改变地方力量平衡，但地方行动者也会主动利用、拒绝或改造外部建议。练习记录谁提出目标、谁提供资源、谁承担战斗和平民伤害，以及谁被排除在谈判外。若只有一方档案，应明确证据缺口和可能的立场偏差。',
        note: '多国档案才能看到互动。',
        objective: '能用多来源档案分析外部支持、本地目标和平民伤害之间的互动。',
        practice: '为一场公开代理冲突填五方材料表，并写两条相互矛盾的证据和一条仍缺档案。',
        checkpoint: '检查是否只写美苏，是否把地方行动者工具化，是否把平民伤害列入结果而非脚注。',
      },
      {
        title: '独立迁移与评价｜写有边界的危机判断',
        body: '独立结论可写成：核威慑提高全面战争代价，却把竞争转移到联盟、代理战争和危机管理；古巴导弹危机的降级来自能力、信誉、沟通和相互让步共同作用，而非单一领导人的胜利。代理冲突仍造成严重平民伤害，国际人道法提供责任边界。文章要说明哪些证据支持判断、哪些档案仍不可得，并避免把稳定写成永久和平。',
        note: '终稿有稳定、冲突和法律边界。',
        objective: '能完成一段有威慑机制、危机沟通、代理冲突和国际法判断的250字分析。',
        practice: '按“能力—信誉—危机—沟通—代理冲突—平民—法律—结论”写250字，并使用三份来源。',
        checkpoint: '四项自评：是否区分威慑与遏制、是否写误判、是否覆盖本地动力、是否说明国际法边界。',
      },
    ],
    quiz: [
      q('核威慑可信度最依赖什么？', '对手相信报复能力存在且承诺会被执行，同时能理解意图', ['只拥有更多常规步兵', '完全隐藏所有沟通', '取消联盟承诺'], 0, '威慑是能力、意图和信誉的结合。若对手不相信承诺或无法理解红线，威慑可能失效，也可能因过度反应制造新的升级风险。', '威慑机制'),
      q('代理冲突为何不能只写成美苏遥控？', '当地民族主义、土地、殖民遗产和政权竞争也推动战争目标', ['地方行动者没有任何资源', '超级大国从不介入', '战争只发生在海上'], 1, '外援改变力量平衡，却会被本地政治重新使用。地方行动者有自身合法性、联盟和社会基础，也有独立目标，因此会筛选和改造外部建议。', '代理冲突主体'),
      q('古巴导弹危机降级的重要机制之一是什么？', '封锁压力下的公开信号、秘密谈判和可逆步骤', ['立即全面开战', '完全停止沟通', '只依靠媒体猜测'], 2, '危机管理需要展示决心，也要给对方保留退路。公开与秘密渠道、可逆行动和明确条件共同降低误判，并为国内政治保留解释空间。', '危机降级'),
      q('研究冷战代理战争时，国际法为什么不能缺席？', '它要求区分平民、比例性和责任调查，战略效果不能替代伤害判断', ['因为国际法自动结束战争', '因为平民不属于战争历史', '因为武器数量决定一切'], 0, '代理战争造成地雷、化学武器、难民和基础设施破坏。国际人道法提供保护与责任标准，实际执行仍需证据和监督。', '法律边界'),
    ],
  },
};
