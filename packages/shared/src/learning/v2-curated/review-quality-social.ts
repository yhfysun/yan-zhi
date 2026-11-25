import type { LearningV2CuratedCoursePlan } from '../v2-types.js';
import { ARTS_HUMANITIES_REMAINING_CURATED_PLANS } from './arts-humanities-remaining.js';
import { HUMANITIES_DEPTH_PATCHES } from './depth-humanities.js';
import { PARTY_REMAINING_CURATED_PLANS } from './party-remaining.js';
import { POLITICS_REMAINING_CURATED_PLANS } from './politics-remaining.js';
import { PRIORITY_EXPANSION_CURATED_PLANS } from './priority-expansion.js';
import type {
  CuratedCoursePlanPatchMap,
} from './types.js';

type ReviewDetail = {
  readonly verification: readonly [string, string, string, string, string];
  readonly sourceRefs: readonly [string, string, string];
};

const source = (title: string, use: string, url: string): string =>
  `${title}；${use}。${url}`;

const BASE_PLANS: Record<string, LearningV2CuratedCoursePlan> = {
  ...PARTY_REMAINING_CURATED_PLANS,
  ...POLITICS_REMAINING_CURATED_PLANS,
  ...PRIORITY_EXPANSION_CURATED_PLANS,
  ...ARTS_HUMANITIES_REMAINING_CURATED_PLANS,
};

for (const [key, patch] of Object.entries(HUMANITIES_DEPTH_PATCHES)) {
  const current = BASE_PLANS[key];
  if (current) {
    BASE_PLANS[key] = { ...current, ...patch };
  }
}

const REVIEWED_ONLY_KEYS = [
  'party:建党与初心',
  'party:遵义会议：转折如何发生',
  'party:全民族抗战：统一战线如何运转',
  'party:解放战争：战略态势如何翻转',
  'party:新中国成立与秩序重建',
  'party:十一届三中全会：工作重心转移',
  'politics:权力与权威：服从从哪里来',
  'politics:国家能力：概念如何比较',
  'politics:民主与法治：两套常被混淆的尺度',
  'politics:权利与义务：自由如何划界',
  'politics:柏拉图与亚里士多德',
  'politics:议会制与总统制',
  'politics:联邦制与单一制',
  'politics:公平与效率如何权衡',
  'economics:稀缺、选择与机会成本',
  'economics:供需与价格：均衡如何形成',
  'economics:弹性：价格变化影响多大',
  'economics:市场效率与外部性',
  'economics:信息不对称与市场失灵',
  'economics:消费者选择与预算约束',
  'economics:企业成本与规模经济',
  'economics:劳动、工资与人力资本',
  'economics:GDP与经济增长',
  'military:战略、战役、战术的三层尺度',
  'military:坎尼会战：包围如何形成',
  'military:地形、后勤与行动半径',
  'military:情报、欺骗与决策速度',
  'military:牧野之战：联盟与倒戈',
  'military:拿破仑战争与动员',
  'military:孙子：信息与势',
  'history:史料类型：文本、实物与记忆',
  'history:辨伪：作者、时间与传播链',
  'history:王安石变法：同一史事的四种叙述',
  'history:如何写一段有证据的论证',
  'history:先秦：礼制与列国竞争',
  'history:秦汉：统一国家的形成',
  'history:大航海与全球贸易',
  'schools:儒家：仁、礼与君子',
  'schools:义利之辨：儒墨法道四路对读',
  'schools:道家：无为与自然',
  'schools:墨家：兼爱、非攻与尚同',
  'schools:法家：法、术、势',
  'schools:古希腊：德性与城邦',
] as const;

const REWRITE_DETAILS = {
  'party:社会主义改造的路径': {
    verification: [
      '在时间轴上分别记录 1953、1955、1956 年的政策节点，以及农业、手工业和工商业三类改造对象。',
      '用三栏表比较互助组、初级社、高级社的产权、分配和退出规则，并各找一处地方执行差异。',
      '查一份公私合营章程，标出赎买、定息、人事安排和主管部门，再说明哪项安排降低了转换阻力。',
      '用产值、就业、参与比例和口述史各找一条证据，分别写在成就与代价两栏，禁止用单一指标代替评价。',
      '选一个省或行业，核对时间、统计口径和材料来源，再写一条限定地区与年份的反例。',
    ],
    sourceRefs: [
      source(
        '《关于农业生产互助合作的决议（草案）》，1951 年',
        '用于核对农业互助组到初级社的政策转折',
        'https://www.gov.cn/',
      ),
      source(
        '《中共中央关于发展农业生产合作社的决议》，1953 年',
        '用于核对初级社阶段的任务、组织方式和推进节奏',
        'https://www.gov.cn/',
      ),
      source(
        '中共中央党史和文献研究院公开的社会主义改造研究资料',
        '用于比较中央政策、地方执行和统计口径',
        'https://www.dswxyjy.org.cn/',
      ),
    ],
  },
  'party:探索中的成就与曲折': {
    verification: [
      '在冷战时间线上标出 1949、1953、1958 年的安全与工业化政策节点，并各写一项外部约束。',
      '用工业项目、教育医疗和一次经济挫折建四栏表，分别记录目标、机制、结果和代价。',
      '找一份中央文件、一次地方上报和一项统计，追踪信息失真从基层到决策层经过的环节。',
      '选两弹一星或石油会战，列出协作单位、资源优先级、科研组织方式和直接成本。',
      '写出一个限定到领域和年份的结论，并为支持与反驳各留一条可核对材料。',
    ],
    sourceRefs: [
      source(
        '《关于建国以来党的若干历史问题的决议》，1981 年',
        '用于核对探索时期成就、曲折和纠正过程的权威评价口径',
        'https://www.gov.cn/',
      ),
      source(
        '中华人民共和国国史网公开的工业化与“两弹一星”资料',
        '用于核对重大项目、组织协作和资源条件',
        'http://www.hprc.org.cn/',
      ),
      source(
        '中共中央党史和文献研究院公开的会议与政策研究资料',
        '用于追踪信息、组织、激励和纠错机制',
        'https://www.dswxyjy.org.cn/',
      ),
    ],
  },
  'party:经济特区与开放格局': {
    verification: [
      '列出 1978 年后外资、土地、价格和管理试验的四项制度变化，并在时间轴上注明各自起点。',
      '用深圳、珠海、厦门、海南四列表比较区位、基础设施、产业、人才和政策授权。',
      '在地图上按特区、沿海开放城市、开发区、内陆和沿边节点标出扩展顺序与权限差异。',
      '查一组深圳外资、出口、人口和产业数据，把环境成本与区域差距另列两栏。',
      '把一个城市数据与全国区域差距指标并读，写明统计年份、地区和不能外推的边界。',
    ],
    sourceRefs: [
      source(
        '《广东省经济特区条例》，1980 年',
        '用于核对经济特区的法律地位、管理授权和制度试验范围',
        'https://www.gov.cn/',
      ),
      source(
        '国务院关于经济特区、沿海开放城市和开发区建设的公开政策文献',
        '用于核对开放层级、区域权限和政策扩展顺序',
        'https://www.gov.cn/',
      ),
      source(
        '国家统计局公开的地方产业、人口和进出口数据',
        '用于比较深圳、珠海、厦门、海南的不同产业路径',
        'https://www.stats.gov.cn/',
      ),
    ],
  },
  'party:社会主义市场经济体制': {
    verification: [
      '把生产什么、怎样生产、为谁生产、谁承担风险写成四格，并各配一个资源配置例子。',
      '选一个污染、垄断或信息不对称案例，指出价格遗漏了哪项成本以及谁承担后果。',
      '列出产权、合同、竞争、公共服务和风险兜底各自的执行机构、工具和评估指标。',
      '用本地公交、保障房或平台案例填“工具—受益者—成本—副作用”四栏表。',
      '给出效率、公平、稳定、覆盖率和财政成本五项指标的前后对照，并标明数据来源。',
    ],
    sourceRefs: [
      source(
        '《中共中央关于建立社会主义市场经济体制若干问题的决定》，1993 年',
        '用于核对市场机制、宏观调控和公共职责的制度框架',
        'https://www.gov.cn/',
      ),
      source(
        '《中华人民共和国宪法》关于基本经济制度的条款',
        '用于核对公有制、市场机制和公共责任的规范表述',
        'https://www.gov.cn/',
      ),
      source(
        '国家发展改革委公开的要素市场与公共服务政策资料',
        '用于把产权、竞争、公共服务和风险兜底落到具体工具',
        'https://www.ndrc.gov.cn/',
      ),
    ],
  },
  'party:全面小康与脱贫攻坚': {
    verification: [
      '用收入、教育、医疗、住房、饮水五栏定义指标口径、数据年份和目标人群。',
      '画建档立卡到村级评议的流程图，标出复核、退出、异议和申诉责任人。',
      '选一个产业或就业项目，列出市场、技术、培训、财政和风险保障五项条件。',
      '用疾病、灾害或就业冲击做一个返贫情景，写出监测频率、触发阈值和响应动作。',
      '把 832 个贫困县摘帽数据与家庭调查、公共服务和产业持续性分开评价。',
    ],
    sourceRefs: [
      source(
        '《中共中央 国务院关于打赢脱贫攻坚战的决定》，2015 年',
        '用于核对精准扶贫的目标、识别和帮扶机制',
        'https://www.gov.cn/',
      ),
      source(
        '国务院新闻办公室《人类减贫的中国实践》白皮书',
        '用于核对多维减贫标准和 832 个贫困县摘帽口径',
        'https://www.gov.cn/',
      ),
      source(
        '中国政府网公开的防止返贫动态监测和帮扶政策',
        '用于核对脱贫后的风险识别、监测和响应流程',
        'https://www.gov.cn/',
      ),
    ],
  },
  'party:自我革命与制度建设': {
    verification: [
      '选一个公开案例，列出个人行为、岗位权限、审批链条和监督缺口四类证据。',
      '画纪律、监察、巡视、审计和群众监督流程，每步写发现、报告、处置和反馈责任人。',
      '用一次问责案例核对事实、责任区分、申诉、整改期限和后续复发数据。',
      '为采购或财务风险点画“留痕—复核—预警—追溯”控制链，并设置验收指标。',
      '收集整改完成率、同类问题复发率、公开程度和群众反馈四类指标。',
    ],
    sourceRefs: [
      source(
        '《中国共产党纪律处分条例》',
        '用于核对纪律责任、处分种类和程序约束',
        'https://www.gov.cn/',
      ),
      source(
        '《中国共产党巡视工作条例》',
        '用于核对巡视发现问题、反馈整改和追责闭环',
        'https://www.gov.cn/',
      ),
      source(
        '中央纪委国家监委公开的审查调查与整改通报',
        '用于比较个人责任、制度漏洞和整改结果',
        'https://www.ccdi.gov.cn/',
      ),
    ],
  },
  'party:中国式现代化的历史逻辑': {
    verification: [
      '用人口、城镇化、就业和公共服务四组数据说明超大规模带来的治理约束。',
      '把计划工业基础、市场改革和创新驱动按阶段列出政策、产出一项和结构风险。',
      '用收入分布、教育、医疗、社保和区域数据检验共同富裕的实际覆盖。',
      '选一个项目核对环评、能耗、排污、生态补偿和公开数据是否一致。',
      '用工业化、分配、国家能力、生态和国际关系五栏比较两条现代化路径。',
    ],
    sourceRefs: [
      source(
        '党的二十大报告',
        '用于核对中国式现代化的历史条件、共同特征和原则',
        'https://www.gov.cn/',
      ),
      source(
        '“十四五”规划和 2035 年远景目标纲要',
        '用于核对人口、共同富裕、生态和公共服务政策目标',
        'https://www.gov.cn/',
      ),
      source(
        '国家统计局公开的人口、收入、城镇化、能耗和公共服务数据',
        '用于把现代化目标转成可比较指标',
        'https://www.stats.gov.cn/',
      ),
    ],
  },
  'politics:周礼与封建秩序': {
    verification: [
      '用《周礼》一段原文列出身份、土地、祭祀、军役和裁决权五项分配。',
      '画宗法继承与分封关系图，标出王室、诸侯和卿大夫各自的资源与义务。',
      '并读《周礼》文本、一件青铜铭文和一处考古发现，分别记录年代与证据功能。',
      '用交通、行政和监控成本解释礼制收益，并写一个社会流动导致的失效场景。',
      '用土地、身份、军役和中央权威四维表比较周代分封与欧洲封建制。',
    ],
    sourceRefs: [
      source(
        '《周礼》原文，Chinese Text Project',
        '用于核对官职、礼制和资源分配规范',
        'https://ctext.org/rites-of-zhou',
      ),
      source(
        '《左传》原文，Chinese Text Project',
        '用于核对春秋时期礼制与政治实践',
        'https://ctext.org/chun-qiu-zuo-zhuan',
      ),
      source(
        '中国国家博物馆青铜器与考古资料',
        '用于核对册命、战争和土地关系的实际材料',
        'https://www.chnmuseum.cn/',
      ),
    ],
  },
  'politics:郡县制与官僚国家': {
    verification: [
      '列出一名郡守或县令的任免、任期、考核和调动规则，并追问其地方利益。',
      '画户籍到赋税、征兵的信息流，标出登记、复核、隐匿和逃籍风险。',
      '找一份奏报或上计材料，标出信息来源、传递层级和可能失真点。',
      '用治安、灾荒和军事三类任务比较地方资源需求与中央控制成本。',
      '用税役公平、灾荒响应、行政成本和地方稳定四项结果评价郡县制。',
    ],
    sourceRefs: [
      source(
        '《史记·秦始皇本纪》，Chinese Text Project',
        '用于核对郡县设置、中央任免和国家统一进程',
        'https://ctext.org/shiji/qin-shi-huang-ben-ji',
      ),
      source(
        '《汉书·百官公卿表》，Chinese Text Project',
        '用于核对官僚机构、秩级、职责和考绩',
        'https://ctext.org/han-shu/bai-guan-gong-qing-biao',
      ),
      source(
        '睡虎地秦简等出土行政文书研究',
        '用于核对户籍、赋税、文书和基层执行',
        'https://www.chnmuseum.cn/',
      ),
    ],
  },
  'politics:科举、流动与治理': {
    verification: [
      '比较世袭、推荐、考试三种选才方式在标准、监督和政治整合上的差异。',
      '查一组录取率、地域配额和考生家庭背景数据，区分机会扩大与门槛。',
      '选一段策论或经义题，分析它测试的能力和它强化的知识权威。',
      '画糊名、誊录、考官管理和地域配额的防弊链，并各写一个规避方式。',
      '用录取结构、地域分布、家庭背景和官职路径四项总体数据检验流动。',
    ],
    sourceRefs: [
      source(
        '《通典·选举典》，Chinese Text Project',
        '用于核对科举制度沿革、考试科目和选拔规则',
        'https://ctext.org/tong-dian',
      ),
      source(
        '《宋史·选举志》，Chinese Text Project',
        '用于核对糊名、誊录、地域配额和录取结构',
        'https://ctext.org/history/songshi',
      ),
      source(
        '中国国家图书馆科举文献与登科录',
        '用于检查录取数据和地域分布',
        'https://www.nlc.cn/',
      ),
    ],
  },
  'politics:变法的约束条件': {
    verification: [
      '把财政、军事、行政和合法性目标写成四项可观察指标，并找原始法令对应。',
      '选商鞅、王安石或清末新政，列出受益者、受损者、资源和政治联盟。',
      '沿中央、地方官、胥吏和基层画执行链，标出信息隐瞒与指标造假点。',
      '用短期税入、军事能力、长期激励和分配成本四栏比较改革效果。',
      '选两个变法案例，按初始条件、联盟、执行和结果做同维比较。',
    ],
    sourceRefs: [
      source(
        '《史记·商君列传》，Chinese Text Project',
        '用于核对商鞅变法的法令、联盟和执行条件',
        'https://ctext.org/shiji/shang-jun-lie-zhuan',
      ),
      source(
        '《宋史·王安石传》，Chinese Text Project',
        '用于核对熙宁变法的目标、阻力和地方执行',
        'https://ctext.org/history/songshi',
      ),
      source(
        '《资治通鉴》相关卷，Chinese Text Project',
        '用于并读改革过程、政治反馈和后果',
        'https://ctext.org/zi-zhi-tong-jian',
      ),
    ],
  },
  'politics:社会契约的三种答案': {
    verification: [
      '把霍布斯、洛克、卢梭的自然状态各写成“冲突来源—关键假设—政治结论”三栏。',
      '用安全、主权范围和滥权风险三项检验霍布斯的授权论证。',
      '用生命、自由、财产和反抗条件四项复述洛克的信托论证。',
      '用一个少数异议情境检验卢梭公意与个人自由如何可能冲突。',
      '用问题、假设、主权结构、权利和反抗条件五栏比较三人。',
    ],
    sourceRefs: [
      source(
        'Stanford Encyclopedia of Philosophy, Thomas Hobbes',
        '用于核对自然状态、授权和主权论证',
        'https://plato.stanford.edu/entries/hobbes/',
      ),
      source(
        'Stanford Encyclopedia of Philosophy, John Locke',
        '用于核对自然权利、政府信托和反抗条件',
        'https://plato.stanford.edu/entries/locke/',
      ),
      source(
        'Stanford Encyclopedia of Philosophy, Jean Jacques Rousseau',
        '用于核对公意、自由和制度风险',
        'https://plato.stanford.edu/entries/rousseau/',
      ),
    ],
  },
  'politics:自由主义与社会主义': {
    verification: [
      '先给古典自由主义、社会自由主义、民主社会主义各写一条政策主张。',
      '用产权、市场、福利和权力约束四项列出自由主义的两种分支答案。',
      '用所有制、阶级、分配和劳动条件四项复述社会主义的结构批判。',
      '用自由、平等、产权、国家责任和责任分配五栏做同一案例比较。',
      '选福利国家或混合经济案例，用效率、覆盖、自由和财政成本检验理论。',
    ],
    sourceRefs: [
      source(
        'Stanford Encyclopedia of Philosophy, Liberalism',
        '用于核对自由主义的分支、权利和有限权力论证',
        'https://plato.stanford.edu/entries/liberalism/',
      ),
      source(
        'Stanford Encyclopedia of Philosophy, Socialism',
        '用于核对社会主义的产权、平等和民主方案',
        'https://plato.stanford.edu/entries/socialism/',
      ),
      source(
        'Stanford Encyclopedia of Philosophy, Distributive Justice',
        '用于用共同维度比较产权和分配原则',
        'https://plato.stanford.edu/entries/justice-distributive/',
      ),
    ],
  },
  'politics:保守主义、共和主义与社群主义': {
    verification: [
      '给保守主义列一条支持渐进改革和一条反对激进设计的论证。',
      '用“是否正在被干涉”和“是否受任意支配”两个情境区分共和主义自由。',
      '用家庭、语言或教育案例说明共同体如何塑造判断，并列出多数压迫风险。',
      '把三者对个人、共同体、传统和公共善的回答放进四栏表。',
      '选家庭或教育政策，检查谁被赋权、谁被排除、如何纠错和复审。',
    ],
    sourceRefs: [
      source(
        'Stanford Encyclopedia of Philosophy, Conservatism',
        '用于核对经验、传统、制度连续性和渐进改革论证',
        'https://plato.stanford.edu/entries/conservatism/',
      ),
      source(
        'Stanford Encyclopedia of Philosophy, Republicanism',
        '用于核对非支配自由、公民参与和制度约束',
        'https://plato.stanford.edu/entries/republicanism/',
      ),
      source(
        'Stanford Encyclopedia of Philosophy, Communitarianism',
        '用于核对共同体、公共善和对抽象个人主义的批评',
        'https://plato.stanford.edu/entries/communitarianism/',
      ),
    ],
  },
  'politics:技术治理与公共问责': {
    verification: [
      '画受影响者、决策权、收益和处罚四栏图，标出最弱者的知情与申诉入口。',
      '选一项福利资格算法，核对目标、代理指标、训练数据和历史偏差。',
      '走一遍通知、解释、提交材料、人工复核和纠错的救济流程。',
      '按群体、地区和时间统计误差、漏判、误判和资源分配，并公开审计方法。',
      '为高影响决定设置人工复核、日志、回滚和公共机构停用条件。',
    ],
    sourceRefs: [
      source(
        'NIST AI Risk Management Framework',
        '用于核对治理、测量、审计和风险管理流程',
        'https://www.nist.gov/itl/ai-risk-management-framework',
      ),
      source(
        'Regulation (EU) 2024/1689, Artificial Intelligence Act',
        '用于核对高风险系统、透明度和人工监督要求',
        'https://eur-lex.europa.eu/eli/reg/2024/1689/oj',
      ),
      source(
        'OECD AI Principles',
        '用于核对公共问责、可解释性和受影响者救济',
        'https://oecd.ai/en/ai-principles',
      ),
    ],
  },
  'schools:名家、阴阳家与纵横家': {
    verification: [
      '把“白马非马”拆成“白马”“马”“非”三个词的含义和指称范围。',
      '列一张阴阳、四时、五行与政令对应表，标出每项关联的历史用途而非现代因果。',
      '选一段合纵或连横材料，列出参与国、威胁判断、承诺和短期收益。',
      '用问题、方法、证据、后果四栏比较名实、关联和利益分析。',
      '各设一个现代误用例：概念替换、牵强比附和只看利益不看正当性。',
    ],
    sourceRefs: [
      source(
        '《公孙龙子》，Chinese Text Project',
        '用于核对名实、指称和“白马非马”的概念分析',
        'https://ctext.org/gongsunlongzi',
      ),
      source(
        '《战国策》，Chinese Text Project',
        '用于核对合纵连横中的盟约、威胁和利益计算',
        'https://ctext.org/zhan-guo-ce',
      ),
      source(
        '《吕氏春秋》相关篇章，Chinese Text Project',
        '用于核对阴阳五行与政治秩序的历史关联',
        'https://ctext.org/lv-shi-chun-qiu',
      ),
    ],
  },
  'schools:农家、兵家、医家与杂家': {
    verification: [
      '把耕作技术、分工主张和赋税治理分成三栏，各找一条原文依据。',
      '用情报、粮秣、地形、士气和战争代价五项复盘一场战例。',
      '选一则证候材料，区分历史观察、诊断推理和现代临床证据层级。',
      '选《吕氏春秋》一篇，记录材料来源、编者目标及一处改写痕迹。',
      '为农业、军事、医学和综合思想各写一条专业证据与责任边界。',
    ],
    sourceRefs: [
      source(
        '《吕氏春秋·上农》等农学篇章，Chinese Text Project',
        '用于核对农家生产、分工和治理主张',
        'https://ctext.org/lv-shi-chun-qiu',
      ),
      source(
        '《孙子兵法》，Chinese Text Project',
        '用于核对情报、粮秣、地形与战争成本',
        'https://ctext.org/sunzi-bingfa',
      ),
      source(
        '《黄帝内经》，Chinese Text Project',
        '用于核对历史医学概念及其与现代临床证据的边界',
        'https://ctext.org/huangdi-neijing',
      ),
    ],
  },
  'schools:印度思想：正法、业与解脱': {
    verification: [
      '把一段文本中的 dharma 标成宇宙秩序、身份义务、伦理规范或教法之一。',
      '用意图、行为、后果和载体四栏记录业，并比较佛教无我与耆那教灵魂观。',
      '列奥义书、佛教、耆那教对“谁轮回、什么解脱”的三个不同答案。',
      '选戒律、禅修、知识或苦行一种实践，写学习者要改变的具体习惯。',
      '用共同问题、概念差异、代价和现代误读四栏收束比较，不排传统高低。',
    ],
    sourceRefs: [
      source(
        'Sue Hamilton, Indian Philosophy: A Very Short Introduction, Oxford University Press, 2001',
        '用于核对正法、业、轮回和解脱的共同问题与内部差异',
        'ISBN 9780192853746',
      ),
      source(
        '《奥义书》与吠檀多研究资料，Internet Archive',
        '用于核对梵我关系和解脱路径',
        'https://archive.org/',
      ),
      source(
        '《薄伽梵歌》，Project Gutenberg',
        '用于核对行动、义务和解脱的论证',
        'https://www.gutenberg.org/ebooks/2388',
      ),
    ],
  },
  'schools:启蒙：理性、自由与进步': {
    verification: [
      '用职位职责与面向公众写作两种场景区分理性的私人使用和公共使用。',
      '把免于任意权力、参与立法、思想自由和出版自由各配一项制度。',
      '选殖民、战争或监控案例，列出能力增长的受益者与承担代价者。',
      '检查教育、信息、言论空间和纠错制度四项公共条件是否具备。',
      '选女性或殖民地排除案例，检验普遍理性承诺能否通过普遍化检验。',
    ],
    sourceRefs: [
      source(
        'Stanford Encyclopedia of Philosophy, Enlightenment',
        '用于核对理性、自由和进步观念的多样性',
        'https://plato.stanford.edu/entries/enlightenment/',
      ),
      source(
        'Immanuel Kant, What Is Enlightenment? 公版文本',
        '用于核对理性的私人使用和公共使用',
        'https://www.gutenberg.org/',
      ),
      source(
        'Stanford Encyclopedia of Philosophy, Jean Jacques Rousseau',
        '用于核对政治参与、公意和自由',
        'https://plato.stanford.edu/entries/rousseau/',
      ),
    ],
  },
  'schools:德国古典：康德、黑格尔': {
    verification: [
      '把一条行为准则分别做普遍化检验和“人是目的”检验，并记录两栏结果。',
      '用一个视觉或因果错觉例子区分现象与物自体，写出知识边界。',
      '按欲望、承认、冲突和劳动四环节复述主奴辩证法。',
      '用家庭、市场和法律制度比较康德的自主与黑格尔的伦理现实。',
      '为两种理论各构造一个反例，定位论证承压的具体步骤。',
    ],
    sourceRefs: [
      source(
        'Stanford Encyclopedia of Philosophy, Immanuel Kant',
        '用于核对自主性、普遍化和人格目的论证',
        'https://plato.stanford.edu/entries/kant/',
      ),
      source(
        'Stanford Encyclopedia of Philosophy, Georg Wilhelm Friedrich Hegel',
        '用于核对历史性、承认和伦理制度',
        'https://plato.stanford.edu/entries/hegel/',
      ),
      source(
        'Immanuel Kant, Groundwork of the Metaphysics of Morals 公版资料',
        '用于核对道德法则和人格目的的原文',
        'https://www.gutenberg.org/',
      ),
    ],
  },
  'schools:自由主义、社会主义与保守主义': {
    verification: [
      '给三种传统各列两个分支及一条不同政策主张。',
      '用免于干涉、非支配、能力条件和参与自治四种自由分析同一政策。',
      '用产权来源、限制、继承和再分配四项比较三种传统。',
      '把一项公共政策拆成提供什么、谁执行、如何问责和财政成本四栏。',
      '用问题严重性、可逆性、试点和纠错机制评估一次制度改革。',
    ],
    sourceRefs: [
      source(
        'Stanford Encyclopedia of Philosophy, Liberalism',
        '用于核对自由主义的分支、自由定义和国家责任',
        'https://plato.stanford.edu/entries/liberalism/',
      ),
      source(
        'Stanford Encyclopedia of Philosophy, Socialism',
        '用于核对社会主义的产权、分配和民主方案',
        'https://plato.stanford.edu/entries/socialism/',
      ),
      source(
        'Stanford Encyclopedia of Philosophy, Conservatism',
        '用于核对制度经验、变革风险和责任边界',
        'https://plato.stanford.edu/entries/conservatism/',
      ),
    ],
  },
  'schools:存在主义、实用主义与分析哲学': {
    verification: [
      '给三段材料分别标出存在、实践后果或概念逻辑的问题类型。',
      '用身体、历史、他人和资源四项限制分析一个选择中的自由与责任。',
      '为一个观念列出实践差别、受益者、反证条件和进一步检验方式。',
      '先指出两个歧义点，再检查论证前提是否有经验或规范依据。',
      '用存在、后果、概念条件三栏分析同一承诺案例，并各附一段原文。',
    ],
    sourceRefs: [
      source(
        'Stanford Encyclopedia of Philosophy, Existentialism',
        '用于核对存在、自由、处境和责任',
        'https://plato.stanford.edu/entries/existentialism/',
      ),
      source(
        'Stanford Encyclopedia of Philosophy, Pragmatism',
        '用于核对观念后果、探究和民主实践',
        'https://plato.stanford.edu/entries/pragmatism/',
      ),
      source(
        'Stanford Encyclopedia of Philosophy, Analysis',
        '用于核对语言、逻辑和概念分析',
        'https://plato.stanford.edu/entries/analysis/',
      ),
    ],
  },
  'schools:义与利：动机和公共后果': {
    verification: [
      '每次出现“义”或“利”都补写主体、范围和正当标准。',
      '用角色、礼、仁和民众后果四项分析一则儒家材料。',
      '计算一项政策的总体收益与分配影响，并检查多数压迫风险。',
      '为一项赏罚设计权责、执行和问责链，并写出滥用情形。',
      '画一个名分或功利政策制造争夺的反噬回路，标出可干预节点。',
    ],
    sourceRefs: [
      source(
        '《论语》，Chinese Text Project',
        '用于核对义、礼、仁和角色义务',
        'https://ctext.org/analects',
      ),
      source(
        '《墨子》，Chinese Text Project',
        '用于核对兼爱、非攻和“兴天下之利”',
        'https://ctext.org/mozi',
      ),
      source(
        '《韩非子》，Chinese Text Project',
        '用于核对赏罚、权责和制度激励',
        'https://ctext.org/hanfeizi',
      ),
    ],
  },
  'schools:礼与法：秩序如何可能': {
    verification: [
      '把一则礼制材料拆成称谓、义务、解释权和违礼处理四个角色。',
      '为一条公开规则补上公布、统一适用、权力约束和申诉四项条件。',
      '用受益者、被排除者、执行成本和纠错方式比较礼与法。',
      '选一个礼法混合场景，标出等级权威进入法律执行的具体冲突。',
      '用权力约束、规则可理解性和受损者申诉三项检验秩序。',
    ],
    sourceRefs: [
      source(
        '《礼记》，Chinese Text Project',
        '用于核对礼的称谓、角色义务和关系秩序',
        'https://ctext.org/liji',
      ),
      source(
        '《韩非子》，Chinese Text Project',
        '用于核对公开规则、赏罚和官僚考核',
        'https://ctext.org/hanfeizi',
      ),
      source(
        '《荀子》，Chinese Text Project',
        '用于核对礼法关系、教化和约束',
        'https://ctext.org/xunzi',
      ),
    ],
  },
  'schools:自然与人为：技术时代的边界': {
    verification: [
      '分别用未干预状态、自然规律、生态阈值和生活方式四种定义评价同一技术。',
      '为一项技术列必要干预、少干预和不干预方案，比较依赖与反噬。',
      '分析技术替代判断后，人的德性、关系和责任能力发生什么变化。',
      '按提示、流程、自动决策、身体或生态改变四级标注干预深度与证据要求。',
      '为一项技术写目标、适用人群、监测、申诉、回滚和停用六项条件。',
    ],
    sourceRefs: [
      source(
        '《道德经》，Chinese Text Project',
        '用于核对无为、自然和少干预的文本依据',
        'https://ctext.org/dao-de-jing',
      ),
      source(
        '《庄子》，Chinese Text Project',
        '用于核对自然、人为和技术反噬的讨论',
        'https://ctext.org/zhuangzi',
      ),
      source(
        'UNESCO Recommendation on the Ethics of Artificial Intelligence',
        '用于核对技术风险、监督、申诉和停用边界',
        'https://www.unesco.org/en/artificial-intelligence/recommendation-ethics',
      ),
    ],
  },
  'schools:权力与自由：谁来判断正当': {
    verification: [
      '先写谁对谁拥有何种权力，再写同意、公共善、权利或问责中的哪项理由。',
      '检查一次同意前的信息、替代选项、退出成本和事后救济。',
      '用同一案例分别判断是否存在干涉、支配和伤害。',
      '列出判断者、证据标准、异议程序、复核者和撤销机制五个岗位。',
      '从最弱者位置检查知情、发声、退出和补偿四项能力。',
    ],
    sourceRefs: [
      source(
        'Stanford Encyclopedia of Philosophy, Liberty',
        '用于核对自由概念、干涉和限制',
        'https://plato.stanford.edu/entries/liberty-positive-negative/',
      ),
      source(
        'Stanford Encyclopedia of Philosophy, Republicanism',
        '用于核对非支配、任意权力和制度约束',
        'https://plato.stanford.edu/entries/republicanism/',
      ),
      source(
        'John Stuart Mill, On Liberty',
        '用于核对伤害原则和干预边界',
        'https://www.gutenberg.org/ebooks/34901',
      ),
    ],
  },
  'schools:知识与无知：如何知道我们知道': {
    verification: [
      '给一个信念分别记录内容、真假、证据和证据形成过程。',
      '构造一个“碰巧正确但理由不可靠”的反例，只改变可靠性一项。',
      '把一个可疑新闻写成局部怀疑案例，并列出核实与暂缓行动步骤。',
      '查证言者的专业性、证据、利益冲突和另一独立来源。',
      '用“已知 X、未核实 Y、出现 Z 则修正”的句式写一条置信判断。',
    ],
    sourceRefs: [
      source(
        'Stanford Encyclopedia of Philosophy, Epistemology',
        '用于核对信念、真理、证据和知识条件',
        'https://plato.stanford.edu/entries/epistemology/',
      ),
      source(
        'Stanford Encyclopedia of Philosophy, The Epistemology of Testimony',
        '用于核对证言、专业性和独立来源',
        'https://plato.stanford.edu/entries/testimony-episprob/',
      ),
      source(
        'Stanford Encyclopedia of Philosophy, Skepticism',
        '用于区分局部怀疑和全局怀疑',
        'https://plato.stanford.edu/entries/skepticism/',
      ),
    ],
  },
  'schools:平等与差异：正义的两种入口': {
    verification: [
      '给法律、机会、资源、结果、能力和承认六种平等各举一项政策。',
      '列出家庭、健康、地域和信息四项起点差异，并判断哪些可避免。',
      '用最终分配、转换条件和自由边界三项比较结果平等与能力路径。',
      '设计一个承认差异的政策，同时写反污名和个体差异护栏。',
      '用参与门槛、资源到达、污名副作用和复审时间四项做前后对照。',
    ],
    sourceRefs: [
      source(
        'Stanford Encyclopedia of Philosophy, Equality',
        '用于核对平等的对象和形式',
        'https://plato.stanford.edu/entries/equality/',
      ),
      source(
        'Stanford Encyclopedia of Philosophy, Distributive Justice',
        '用于核对结果平等、机会和分配原则',
        'https://plato.stanford.edu/entries/justice-distributive/',
      ),
      source(
        'Stanford Encyclopedia of Philosophy, Capability Approach',
        '用于核对能力路径、转换条件和真实自由',
        'https://plato.stanford.edu/entries/capability-approach/',
      ),
    ],
  },
} satisfies Record<string, ReviewDetail>;

const reviewedOnlyPatch = (): Partial<LearningV2CuratedCoursePlan> => ({
  contentStatus: 'reviewed',
});

const enhancedPatch = (
  key: string,
  detail: ReviewDetail,
): Partial<LearningV2CuratedCoursePlan> => {
  const plan = BASE_PLANS[key];
  if (!plan) {
    throw new Error(`Missing social review base plan: ${key}`);
  }
  if (plan.steps.length !== detail.verification.length) {
    throw new Error(
      `Social review verification count mismatch: ${key} has ${plan.steps.length} steps`,
    );
  }
  return {
    contentStatus: 'reviewed',
    sourceRefs: detail.sourceRefs,
    steps: plan.steps.map((step, index) => ({
      ...step,
      body: `${step.body}${detail.verification[index]}`,
    })),
  };
};

const statusOnlyPatches: CuratedCoursePlanPatchMap = Object.fromEntries(
  REVIEWED_ONLY_KEYS.map((key) => [key, reviewedOnlyPatch()]),
);

const rewrittenPatches: CuratedCoursePlanPatchMap = Object.fromEntries(
  Object.entries(REWRITE_DETAILS).map(([key, detail]) => [
    key,
    enhancedPatch(key, detail),
  ]),
);

export const SOCIAL_REVIEW_QUALITY_PATCHES = {
  ...statusOnlyPatches,
  ...rewrittenPatches,
} satisfies CuratedCoursePlanPatchMap;
