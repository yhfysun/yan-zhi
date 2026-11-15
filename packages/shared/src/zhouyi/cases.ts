// 周易测算 · 事类词库（纯数据，无 IO）。
//
// 用户「算事情」的骨架：先问什么事（姻缘 / 前程 / 搬家 / 开市 / 出行…），再选占法。
// 词库两路合并：
//   ① 黄历宜忌事类（《钦定协纪辨方书》系固定文言词库，六大类）——推荐走择日 / 问事占；
//   ② 六爻事类与用神（《卜筮正宗·用神分类定例》，王洪绪，公版）——推荐走六爻 / 梅花。
// ★ 易错对必须写进 note：动土（阳宅开工）≠ 破土（阴宅开工）、入宅（首次住进）≠ 移徙（搬家）。
// ★ 全部是「这门手艺按古法怎么算」的文献口径：yongshen 是用神规则，不是对用户个人处境的断语。
import type { ZhouyiCaseEntry, ZhouyiCaseCategory } from './types';

const SR_XIEJI = { work: '钦定协纪辨方书', dynasty: '清', license: '公版' } as const;
const SR_BUSHI = { work: '卜筮正宗', author: '王洪绪', dynasty: '清', license: '公版' } as const;

export const ZHOUYI_CASES: ZhouyiCaseEntry[] = [
  // —— 身命 ——
  { id: 'case_shenming', name: '身命', plain: '看一个人的整体命局（生辰八字口径）', category: '身命', methods: ['sizhu', 'liuyao'], yongshen: '占自身以世爻为用神；八字则排四柱看日主', sourceRef: SR_BUSHI, note: '测算台只演示排盘与十神关系，不作命局断语。' },
  { id: 'case_zhanren', name: '占事', plain: '泛问一件事的吉凶成败（六爻问事总类）', category: '杂占', methods: ['liuyao', 'meihua', 'dayan'], yongshen: '先定用神，再看用神旺衰与世应生克', sourceRef: SR_BUSHI, note: '「用神取错，全盘皆错」——《卜筮正宗》口径。' },

  // —— 婚姻 ——
  { id: 'case_jiaqu', name: '嫁娶', plain: '举办婚礼、迎娶', category: '婚姻', methods: ['zari', 'liuyao'], yongshen: '男占财爻为对方、官爻为情敌；女占官爻为对方（占成否）', sourceRef: SR_BUSHI },
  { id: 'case_nacai', name: '纳采', plain: '提亲、下聘的第一步', category: '婚姻', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_wenming', name: '问名', plain: '合八字、问生辰旧俗', category: '婚姻', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_dingmeng', name: '订盟', plain: '订婚、交换婚书（俗称小聘）', category: '婚姻', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_anchuang', name: '安床', plain: '安置或移动睡床', category: '婚姻', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_hezhang', name: '合帐', plain: '为新人制作床帐', category: '婚姻', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_guanji', name: '冠笄', plain: '成年礼（男弱冠、女及笄）', category: '婚姻', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_hunyin', name: '婚姻', plain: '问姻缘、感情能否成', category: '婚姻', methods: ['liuyao', 'meihua'], yongshen: '世爻为自己、应爻为对方；已成关系按男看财爻、女看官爻', sourceRef: SR_BUSHI },

  // —— 营建 ——
  { id: 'case_ruzhai', name: '入宅', plain: '搬进新居、第一次住进去', category: '营建', methods: ['zari', 'liuyao'], yongshen: '家宅以父母爻为用神，二爻为房屋、五爻为人口', sourceRef: SR_XIEJI, note: '入宅（首次住进）与移徙（搬家迁移）是两件事，黄历分列。' },
  { id: 'case_yixi', name: '移徙', plain: '搬家、迁移住处', category: '营建', methods: ['zari', 'liuyao'], yongshen: '《卜筮全书》六爻诸占：移徙最忌鬼爻乱动', sourceRef: SR_XIEJI },
  { id: 'case_xiuzao', name: '修造', plain: '房屋修缮、装修', category: '营建', methods: ['zari', 'liuyao'], sourceRef: SR_XIEJI },
  { id: 'case_dongtu', name: '动土', plain: '阳宅（盖房子）开工破土', category: '营建', methods: ['zari'], sourceRef: SR_XIEJI, note: '★ 易错：动土属阳宅，破土属阴宅（墓地），二者不是一回事。' },
  { id: 'case_shangliang', name: '上梁', plain: '架设房屋大梁', category: '营建', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_shuzhu', name: '竖柱', plain: '立房屋柱子', category: '营建', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_anmen', name: '安门', plain: '放置正门门框', category: '营建', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_anxiang', name: '安香', plain: '安放香火、神位', category: '营建', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_juejing', name: '掘井', plain: '开凿水井、挖掘池塘', category: '营建', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_buyuan', name: '补垣', plain: '修补房屋或围墙', category: '营建', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_caixie', name: '拆卸', plain: '拆掉建筑物', category: '营建', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_jiazhai', name: '家宅', plain: '问住宅吉凶、家宅安宁（风水口径）', category: '营建', methods: ['liuyao', 'bazhai', 'xuankong'], yongshen: '父母爻为用神；八宅按命卦配大游年，玄空按运盘布九宫', sourceRef: SR_BUSHI, note: '只演示排盘与古籍规则，不提供真实布局建议。' },

  // —— 工商 ——
  { id: 'case_kaishi', name: '开市', plain: '开业、新店开张、复工', category: '工商', methods: ['zari', 'liuyao'], yongshen: '求财以妻财爻为用神，子孙爻为顾客、财源', sourceRef: SR_XIEJI },
  { id: 'case_guabian', name: '挂匾', plain: '悬挂招牌匾额', category: '工商', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_liquan', name: '立券', plain: '订立契约、签合同', category: '工商', methods: ['zari', 'liuyao'], sourceRef: SR_XIEJI },
  { id: 'case_jiaoyi', name: '交易', plain: '买卖、成交', category: '工商', methods: ['zari', 'liuyao'], yongshen: '妻财爻为用神，父母爻为文书契约', sourceRef: SR_BUSHI },
  { id: 'case_nacai_cai', name: '纳财', plain: '收账、进货、存款、五谷入仓', category: '工商', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_kaicang', name: '开仓', plain: '开仓出货、放贷', category: '工商', methods: ['zari'], sourceRef: SR_XIEJI },

  // —— 祭祀 ——
  { id: 'case_jisi', name: '祭祀', plain: '祭拜祖先神明', category: '祭祀', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_qifu', name: '祈福', plain: '求神赐福、还愿', category: '祭祀', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_qiusi', name: '求嗣', plain: '求子嗣', category: '祭祀', methods: ['zari', 'liuyao'], yongshen: '子孙爻为用神（占子嗣）', sourceRef: SR_BUSHI },
  { id: 'case_kaiguang', name: '开光', plain: '神像佛像点睛供奉', category: '祭祀', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_muyu', name: '沐浴', plain: '宗教仪式前的净身', category: '祭祀', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_zhaijiao', name: '斋醮', plain: '庙宇建醮前的斋戒仪式', category: '祭祀', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_suhui', name: '塑绘', plain: '雕刻、绘制神像', category: '祭祀', methods: ['zari'], sourceRef: SR_XIEJI },

  // —— 生活 ——
  { id: 'case_chuxing', name: '出行', plain: '远行、旅行、出差（含出行吉凶）', category: '生活', methods: ['zari', 'liuyao'], yongshen: '占自己出行以世爻为用神，看世爻受日月生克', sourceRef: SR_BUSHI },
  { id: 'case_xingren', name: '行人', plain: '问远行的人何时归来', category: '生活', methods: ['liuyao', 'meihua'], yongshen: '行人以应爻或用神爻看动静，父动主书信归期', sourceRef: SR_BUSHI },
  { id: 'case_chuhuo', name: '出火', plain: '移灶、迁火旧俗', category: '生活', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_lifa', name: '理发', plain: '剪发、整发旧俗', category: '生活', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_xiyi', name: '习艺', plain: '拜师学艺、学手艺', category: '生活', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_zazhong', name: '栽种', plain: '种植、播种', category: '生活', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_naxu', name: '纳畜', plain: '买入禽畜', category: '生活', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_huiqinyou', name: '会亲友', plain: '探访、聚会', category: '生活', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_ruxue', name: '入学', plain: '拜师、入学、进修', category: '生活', methods: ['zari', 'liuyao'], yongshen: '学业以父母爻为用神（文章文书），兼看官爻', sourceRef: SR_BUSHI },
  { id: 'case_qiuyi', name: '求医', plain: '就诊、动手术、针灸', category: '生活', methods: ['zari', 'liuyao'], yongshen: '占病以官鬼爻为疾病、子孙爻为医药', sourceRef: SR_BUSHI },
  { id: 'case_jiechu', name: '解除', plain: '打扫宅舍、解除灾厄（不是「解除合同」）', category: '生活', methods: ['zari'], sourceRef: SR_XIEJI },

  // —— 丧葬 ——
  { id: 'case_potu', name: '破土', plain: '阴宅（墓地）开工', category: '丧葬', methods: ['zari'], sourceRef: SR_XIEJI, note: '★ 易错：破土属阴宅，动土属阳宅（盖房子），黄历分列。' },
  { id: 'case_xiufen', name: '修坟', plain: '修理坟墓', category: '丧葬', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_qizan', name: '启攒', plain: '迁坟启土（拾骨迁葬）', category: '丧葬', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_anzang', name: '安葬', plain: '举行埋葬仪式', category: '丧葬', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_libei', name: '立碑', plain: '竖立墓碑', category: '丧葬', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_xietu', name: '谢土', plain: '工程完工后谢土神的仪式', category: '丧葬', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_chufu', name: '除服', plain: '脱下丧服（守制期满）', category: '丧葬', methods: ['zari'], sourceRef: SR_XIEJI },
  { id: 'case_fenmu', name: '坟墓', plain: '问坟地吉凶（阴宅口径）', category: '丧葬', methods: ['liuyao', 'bazhai'], yongshen: '已葬之地世爻为穴、应爻为案山；六爻安静最为吉（《卜筮全书》口径）', sourceRef: SR_BUSHI },

  // —— 六爻专事类（黄历词库之外） ——
  { id: 'case_gongming', name: '功名', plain: '仕途前程、升迁、赴任（含科举）', category: '杂占', methods: ['liuyao', 'meihua'], yongshen: '官鬼爻为用神；科举考试以父母爻为用神、官爻为辅', sourceRef: SR_BUSHI },
  { id: 'case_keju', name: '科举', plain: '考试能否录取（古今考试通用口径）', category: '杂占', methods: ['liuyao'], yongshen: '学校考试以父母爻为用神，兼看官爻', sourceRef: SR_BUSHI },
  { id: 'case_shihuan', name: '仕宦', plain: '当官、任职、上司关系', category: '杂占', methods: ['liuyao'], yongshen: '官鬼爻为用神；占上司以父母爻为用神', sourceRef: SR_BUSHI },
  { id: 'case_qiucai', name: '求财', plain: '财运、买卖利润、投资收益', category: '杂占', methods: ['liuyao', 'meihua'], yongshen: '妻财爻为用神，子孙爻为财源顾客', sourceRef: SR_BUSHI },
  { id: 'case_taiyun', name: '胎孕', plain: '怀孕、生产', category: '杂占', methods: ['liuyao'], yongshen: '子孙爻为用神，喜见子孙爻旺相（《卜筮全书》口径）', sourceRef: SR_BUSHI },
  { id: 'case_jibing', name: '疾病', plain: '病情、医药（文献规则演示）', category: '杂占', methods: ['liuyao', 'meihua'], yongshen: '官鬼爻为病症、子孙爻为医药；自占疾病以世爻为用', sourceRef: SR_BUSHI, note: '演示仅为古籍规则口径，任何健康问题请就医。' },
  { id: 'case_cisong', name: '词讼', plain: '官司、纠纷胜负（文献规则演示）', category: '杂占', methods: ['liuyao'], yongshen: '细观官鬼爻与杀爻；父母爻为状词、财爻为理', sourceRef: SR_BUSHI },
  { id: 'case_shiwu', name: '失物', plain: '丢了东西能否找回', category: '杂占', methods: ['liuyao', 'meihua'], yongshen: '一般财物以妻财爻为用神；文书契约类以父母爻为用', sourceRef: SR_BUSHI },
  { id: 'case_tianshi', name: '天时', plain: '问晴雨天气（古法口径）', category: '杂占', methods: ['liuyao', 'meihua'], yongshen: '以卦爻水火类象观阴晴；问天时晴明以妻财爻参考', sourceRef: SR_BUSHI },
  { id: 'case_zhongzuo', name: '种作', plain: '庄稼收成', category: '杂占', methods: ['liuyao'], yongshen: '子孙、妻财主收成（《卜筮全书》口径）', sourceRef: SR_BUSHI },
  { id: 'case_liuchu', name: '六畜', plain: '饲养禽畜旺衰', category: '杂占', methods: ['liuyao'], yongshen: '子孙爻为用神，最忌劫煞与亡神（《卜筮全书》口径）', sourceRef: SR_BUSHI },
];

/** 用户口语 → 事类：搜索词命中同义词后按事名归并（顺序稳定）。 */
const ZHOUYI_CASE_SYNONYMS: Record<string, string[]> = {
  '姻缘': ['婚姻', '嫁娶'], '结婚': ['嫁娶', '婚姻'], '对象': ['婚姻'], '恋爱': ['婚姻'], '相亲': ['婚姻'],
  '前程': ['功名', '仕宦', '科举'], '事业': ['仕宦', '功名', '求财'], '工作': ['仕宦', '求财'], '求职': ['仕宦'], '升职': ['仕宦', '功名'], '考试': ['科举'], '考学': ['科举', '入学'],
  '搬家': ['移徙'], '乔迁': ['移徙', '入宅'], '新房': ['入宅', '修造'], '装修': ['修造'], '盖房': ['动土', '上梁', '竖柱', '修造'],
  '开业': ['开市'], '开店': ['开市', '挂匾'], '生意': ['开市', '交易', '求财'], '签合同': ['立券'], '投资': ['交易', '纳财', '求财'], '财运': ['求财'], '赚钱': ['求财'],
  '出门': ['出行'], '旅游': ['出行'], '出差': ['出行'], '回来': ['行人'], '归期': ['行人'],
  '生病': ['疾病'], '看病': ['求医', '疾病'], '吃药': ['疾病', '求医'],
  '官司': ['词讼'], '诉讼': ['词讼'], '纠纷': ['词讼'],
  '丢东西': ['失物'], '丢了': ['失物'],
  '怀孕': ['胎孕'], '生子': ['胎孕', '求嗣'], '求子': ['求嗣'],
  '天气': ['天时'], '下雨': ['天时'], '种地': ['种作'], '养殖': ['六畜'],
  '算命': ['身命'], '八字': ['身命'], '吉凶': ['占事'], '算事': ['占事'], '问事': ['占事'], '占卜': ['占事'],
  '风水': ['家宅', '坟墓'], '阳宅': ['家宅'], '阴宅': ['坟墓', '安葬'], '坟': ['修坟', '安葬', '破土'],
};

/** 空查询返回空数组；按事名/白话包含 + 同义词展开，去重且保持词库原序。 */
export function zhouyiCaseSearch(query: string): ZhouyiCaseEntry[] {
  const q = query.trim();
  if (!q) return [];
  const hits = new Map<string, ZhouyiCaseEntry>();
  for (const e of ZHOUYI_CASES) {
    if (e.name.includes(q) || e.plain.includes(q) || e.category.includes(q)) hits.set(e.id, e);
  }
  for (const [word, targets] of Object.entries(ZHOUYI_CASE_SYNONYMS)) {
    if (!q.includes(word) && !word.includes(q)) continue;
    for (const e of ZHOUYI_CASES) {
      if (targets.includes(e.name)) hits.set(e.id, e);
    }
  }
  const order = new Map(ZHOUYI_CASES.map((e, i) => [e.id, i] as const));
  return [...hits.values()].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** 输入页的热门事类 chips（口语词，点击直接命中事类）。 */
export const ZHOUYI_CASE_HOT: Array<{ word: string; caseId: string }> = [
  { word: '姻缘', caseId: 'case_hunyin' },
  { word: '前程', caseId: 'case_gongming' },
  { word: '搬家', caseId: 'case_yixi' },
  { word: '开业', caseId: 'case_kaishi' },
  { word: '出行', caseId: 'case_chuxing' },
  { word: '考试', caseId: 'case_keju' },
  { word: '求财', caseId: 'case_qiucai' },
  { word: '算事情', caseId: 'case_zhanren' },
];

export function zhouyiCaseById(id: string): ZhouyiCaseEntry | undefined {
  return ZHOUYI_CASES.find((e) => e.id === id);
}

export type { ZhouyiCaseCategory };
