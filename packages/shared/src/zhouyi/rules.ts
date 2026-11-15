// 周易测算纯函数库 —— 断语白名单规则表。
// ★ 硬约束：runDivination 的 verdict 只允许引用本表条目（按 id 查找），绝不生成新的预测文本。
//   paraphrase=false 表示已核实的古籍原句逐字引用；记不准的一律 paraphrase=true 且 quote 为编者转述句，绝不编造古籍原句。

import type { ZhouyiRuleEntry } from './types';
import type { ZhouyiSourceRef } from './types';

const SR_MEIHUA: ZhouyiSourceRef = { work:'梅花易数', author:'邵雍（旧题）', dynasty:'宋', juan:'卷二·占卜总诀', license:'公版' };
const SR_XICI: ZhouyiSourceRef = { work:'周易·系辞上', author:'佚名', dynasty:'先秦', license:'公版' };
const SR_BUSHI: ZhouyiSourceRef = { work:'卜筮正宗', author:'王洪绪 辑', dynasty:'清', juan:'卷首·纳甲装卦歌', license:'公版' };
const SR_YUANHAI: ZhouyiSourceRef = { work:'渊海子平', author:'徐子平（旧题）', dynasty:'宋', juan:'卷一', license:'公版' };
const SR_BAZHAI: ZhouyiSourceRef = { work:'八宅明镜', author:'箬冠道人（旧题）', dynasty:'清', juan:'卷上', license:'公版' };
const SR_SHENSHI: ZhouyiSourceRef = { work:'沈氏玄空学', author:'沈竹礽', dynasty:'清', juan:'卷一', license:'公版' };
const SR_HONGFAN: ZhouyiSourceRef = { work:'尚书·洪范', author:'佚名', dynasty:'先秦', license:'公版' };
const SR_XIEJI: ZhouyiSourceRef = { work:'钦定协纪辨方书', author:'允禄 等奉敕撰', dynasty:'清', juan:'卷十一', license:'公版' };
const SR_MENGLIN: ZhouyiSourceRef = { work:'梦林玄解', author:'佚名 辑', dynasty:'明', license:'公版' };
const SR_BUSHI_YONGSHEN: ZhouyiSourceRef = { work:'卜筮正宗', author:'王洪绪 辑', dynasty:'清', juan:'卷二·用神分类定例', license:'公版' };
const SR_BUSHUAN: ZhouyiSourceRef = { work:'卜筮全书', author:'佚名（旧题）', dynasty:'明', juan:'卷二·六爻诸占定位', license:'公版' };

/**
 * 断语白名单（人工预写，覆盖 8 法）。
 * 注：梅花体用总诀一句为《梅花易数》卷二「占卜总诀」口径之通行引文，已核实可逐字引用；
 *     其余记不准原句者一律 paraphrase:true。
 */
export const ZHOUYI_RULE_TABLE: ZhouyiRuleEntry[] = [
  // —— 梅花易数（体用生克） ——
  {
    id:'zhouyi-meihua-tiyong', method:'meihua', label:'体用总诀',
    quote:'体用即动静之说，体为主，用为事应。用生体及比和则吉，体生用及克体则不吉',
    sourceRef:SR_MEIHUA, paraphrase:false,
    plain:'梅花易数以体卦为主、用卦为事应：用生体或体用比和为吉，体生用或用克体为不吉。',
  },
  {
    id:'zhouyi-meihua-yong-sheng-ti', method:'meihua', label:'用生体则吉',
    quote:'用生体及比和则吉',
    sourceRef:SR_MEIHUA, paraphrase:false,
    plain:'用卦五行生扶体卦，为「用生体」，古籍断为吉。',
  },
  {
    id:'zhouyi-meihua-bihe', method:'meihua', label:'体用比和则吉',
    quote:'用生体及比和则吉',
    sourceRef:SR_MEIHUA, paraphrase:false,
    plain:'体卦与用卦五行相同为「比和」，古籍断为吉。',
  },
  {
    id:'zhouyi-meihua-ti-sheng-yong', method:'meihua', label:'体生用则泄',
    quote:'体生用及克体则不吉',
    sourceRef:SR_MEIHUA, paraphrase:false,
    plain:'体卦五行生助用卦，为「体生用」（泄体），古籍断为不吉。',
  },
  {
    id:'zhouyi-meihua-yong-ke-ti', method:'meihua', label:'用克体则凶',
    quote:'体生用及克体则不吉',
    sourceRef:SR_MEIHUA, paraphrase:false,
    plain:'用卦五行克制体卦，为「克体」，古籍断为不吉。',
  },
  {
    id:'zhouyi-meihua-ti-ke-yong', method:'meihua', label:'体克用（次吉口径）',
    quote:'体克用者，体为主而制所应之事，其事可成而须费力，诸家多以为次吉之象，然具体断法诸本不一，此处仅作文献口径展示。',
    sourceRef:SR_MEIHUA, paraphrase:true,
    plain:'体卦克制用卦为「体克用」，诸家常视为次吉（事可成但费力）；各家说法不一，此处仅作文献口径展示。',
  },
  // —— 大衍筮法 ——
  {
    id:'zhouyi-dayan-xici', method:'dayan', label:'大衍之数',
    quote:'大衍之数五十，其用四十有九。',
    sourceRef:SR_XICI, paraphrase:false,
    plain:'《系辞上》记大衍筮法用五十根蓍草，实际使用四十九根。',
  },
  {
    id:'zhouyi-dayan-guanbian', method:'dayan', label:'观变得卦',
    quote:'大衍筮法以老阳、老阴为动爻：本卦示其始，变卦示其终，观动爻所在而断，此为通行口径之转述。',
    sourceRef:SR_XICI, paraphrase:true,
    plain:'大衍筮法中老阳（九）、老阴（六）为动爻；本卦为事之始、变卦为事之终，观动爻而定，此为通行口径的转述。',
  },
  // —— 六爻纳甲 ——
  {
    id:'zhouyi-liuyao-najia', method:'liuyao', label:'纳甲装卦',
    quote:'装卦之法：以本宫五行为「我」，配六爻纳甲干支，定六亲，寻世应，此为《卜筮正宗》装卦法之转述。',
    sourceRef:SR_BUSHI, paraphrase:true,
    plain:'六爻装卦：按纳甲歌配干支，以卦宫五行为「我」定六亲，再寻世应，此为《卜筮正宗》装卦法的转述。',
  },
  {
    id:'zhouyi-liuyao-shiying', method:'liuyao', label:'世应起例',
    quote:'八宫以本宫首卦世上爻，一世卦世初爻，二世世二爻，三世世三爻，四世世四爻，五世世五爻，游魂世四爻，归魂世三爻；应爻与世爻隔三位。',
    sourceRef:SR_BUSHI, paraphrase:true,
    plain:'世爻起例的转述：本宫首卦世上爻，一至五世卦世爻依次在初至五爻，游魂世四爻、归魂世三爻，应爻与世爻相隔三位。',
  },
  {
    id:'zhouyi-liuyao-liushen', method:'liuyao', label:'六神起例',
    quote:'六神者，青龙、朱雀、勾陈、螣蛇、白虎、玄武也；甲乙日起青龙，丙丁日起朱雀，戊日起勾陈，己日起螣蛇，庚辛日起白虎，壬癸日起玄武，自初爻顺行六爻。',
    sourceRef:SR_BUSHI, paraphrase:true,
    plain:'六神按日干定初爻起神，自初爻起顺布青龙、朱雀、勾陈、螣蛇、白虎、玄武（转述）。',
  },
  // —— 四柱 ——
  {
    id:'zhouyi-sizhu-wuhudun', method:'sizhu', label:'五虎遁月',
    quote:'甲己之年丙作首，乙庚之岁戊为头。丙辛必定寻庚起，丁壬壬位顺行流。戊癸何方发，甲寅之上好追求。',
    sourceRef:SR_YUANHAI, paraphrase:false,
    plain:'五虎遁：由年干定寅月天干，顺推各月干支。',
  },
  {
    id:'zhouyi-sizhu-wushudun', method:'sizhu', label:'五鼠遁时',
    quote:'甲己还加甲，乙庚丙作初。丙辛从戊起，丁壬庚子居。戊癸何方发，壬子是真途。',
    sourceRef:SR_YUANHAI, paraphrase:false,
    plain:'五鼠遁：由日干定子时天干，顺推各时辰干支。',
  },
  {
    id:'zhouyi-sizhu-shishen', method:'sizhu', label:'十神与五行（文献口径）',
    quote:'四柱以日干为「我」，配年、月、时柱天干及地支本气论十神，观五行分布之多寡；命理诸书论断体系各异，此处仅作排盘文献展示。',
    sourceRef:SR_YUANHAI, paraphrase:true,
    plain:'四柱排盘以日干为我配十神、计五行分布；实际论命体系诸书各异，此处仅作排盘的文献展示。',
  },
  // —— 八宅 ——
  {
    id:'zhouyi-bazhai-minggua', method:'bazhai', label:'命卦起例',
    quote:'以生年数配男女定命卦：男命数=11−生年数（逾九减九），女命数=4+生年数（逾九减九）；2000 年后男减一、女加一；得一坎二坤三震四巽六乾七兑八艮九离，五数男寄坤、女寄艮。',
    sourceRef:SR_BAZHAI, paraphrase:true,
    plain:'命卦起例的转述：由出生年反复相加至一位数，按男女公式得命卦数（五数男寄坤、女寄艮），查一坎二坤三震四巽六乾七兑八艮九离。',
  },
  {
    id:'zhouyi-bazhai-dongxi', method:'bazhai', label:'东西四命',
    quote:'坎离震巽为东四命，乾坤艮兑为西四命；东四命宜配东四宅，西四命宜配西四宅，此为八宅派通行口径之转述。',
    sourceRef:SR_BAZHAI, paraphrase:true,
    plain:'坎离震巽为东四命、乾坤艮兑为西四命，东四命宜配东四宅、西四命宜配西四宅（转述）。',
  },
  // —— 玄空飞星 ——
  {
    id:'zhouyi-xuankong-feixing', method:'xuankong', label:'飞星起例',
    quote:'玄空以当运之星入中宫，按洛书轨迹顺飞九宫成运盘；山星、向星依坐向之三元龙阴阳定顺逆飞，此为《沈氏玄空学》法之转述（本实现按八方位近似定阴阳）。',
    sourceRef:SR_SHENSHI, paraphrase:true,
    plain:'玄空飞星：运星入中顺飞成运盘，山向二盘按坐向三元龙阴阳定顺逆；本实现按八方位近似简化，属简化口径。',
  },
  // —— 五行 ——
  {
    id:'zhouyi-wuxing-hongfan', method:'wuxing', label:'五行名义',
    quote:'五行：一曰水，二曰火，三曰木，四曰金，五曰土。',
    sourceRef:SR_HONGFAN, paraphrase:false,
    plain:'《尚书·洪范》举五行之名与次第。',
  },
  {
    id:'zhouyi-wuxing-shengke', method:'wuxing', label:'五行生克',
    quote:'五行相生：木生火、火生土、土生金、金生水、水生木；相克：木克土、土克水、水克火、火克金、金克木。此为历代五行书通行口径。',
    sourceRef:SR_HONGFAN, paraphrase:true,
    plain:'五行相生与相克的通行次序（转述）：相生木火土金水循环，相克木土水火金循环。',
  },
  // —— 择日 ——
  {
    id:'zhouyi-zari-jianchu', method:'zari', label:'建除起例',
    quote:'以月建对日支起「建」，按建、除、满、平、定、执、破、危、成、收、开、闭十二神顺数，日支逢月建即为建日。此为通行起例之转述。',
    sourceRef:SR_XIEJI, paraphrase:true,
    plain:'建除十二神起例的转述：日支与月建相同者为建日，其余按十二神顺序轮排。',
  },
  {
    id:'zhouyi-zari-yiji', method:'zari', label:'宜忌口径',
    quote:'《协纪辨方书》集历代择日之说而加以辨正，然民俗宜忌诸说并存；本实现仅展示干支与建除排布，宜忌条目为文献展示，不作现实建议。',
    sourceRef:SR_XIEJI, paraphrase:true,
    plain:'择日宜忌诸说并存，本实现仅作干支与建除排布的文献展示，不输出具体宜忌判断。',
  },
  // —— 事类断语（配合事类词库 caseId：事类 → 用神 → 规则口径；全部转述，绝不编造原句） ——
  {
    id:'zhouyi-liuyao-case-yixi', method:'liuyao', label:'移徙之占',
    quote:'移徙之占：最忌官鬼爻乱动；世爻宜旺相，驿马爻动为迁移之象。此为《卜筮全书》六爻诸占口径之转述。',
    sourceRef:SR_BUSHUAN, paraphrase:true,
    plain:'占搬家迁移：最忌官鬼爻乱动；世爻宜旺相，驿马爻动是迁移的征象（转述）。',
  },
  {
    id:'zhouyi-liuyao-case-hunyin', method:'liuyao', label:'婚姻之占',
    quote:'婚姻之占：男占以妻财爻为用神，女占以官鬼爻为用神；世应相生相合为吉，相克相冲不谐。此为《卜筮正宗》用神分类与世应论口径之转述。',
    sourceRef:SR_BUSHI_YONGSHEN, paraphrase:true,
    plain:'占婚姻感情：男以妻财爻、女以官鬼爻为用神；世应相生相合为吉、相克相冲为不谐（转述）。',
  },
  {
    id:'zhouyi-liuyao-case-qiucai', method:'liuyao', label:'求财之占',
    quote:'求财之占：以妻财爻为用神，子孙爻为财源顾客；财爻旺相则利，兄弟爻发动则克财。此为《卜筮正宗》六亲断事口径之转述。',
    sourceRef:SR_BUSHI_YONGSHEN, paraphrase:true,
    plain:'占财运买卖：以妻财爻为用神、子孙爻为财源；财爻旺相有利，兄弟爻发动主克财（转述）。',
  },
  {
    id:'zhouyi-liuyao-case-gongming', method:'liuyao', label:'功名之占',
    quote:'功名之占：以官鬼爻为用神，父母爻为文书；官爻旺相持世则利，子孙爻发动则不宜仕途。此为《卜筮正宗》用神分类口径之转述。',
    sourceRef:SR_BUSHI_YONGSHEN, paraphrase:true,
    plain:'占仕途前程：以官鬼爻为用神、父母爻为文书；官爻旺相持世有利，子孙爻动不利于仕途（转述）。',
  },
  {
    id:'zhouyi-liuyao-case-keju', method:'liuyao', label:'科举之占',
    quote:'科举之占：以父母爻为用神，喜父母爻持世旺相发动；父母爻动，占科举为文章之喜。此为《卜筮正宗》六亲断事歌诀「士人科举登金榜，父为文章」口径之转述。',
    sourceRef:SR_BUSHI_YONGSHEN, paraphrase:true,
    plain:'占考试录取：以父母爻为用神，喜其持世旺相；父母爻动对考试是「文章」之喜（转述）。',
  },
  {
    id:'zhouyi-liuyao-case-jibing', method:'liuyao', label:'疾病之占',
    quote:'疾病之占：以官鬼爻为病症、子孙爻为医药；子孙爻发动主药到病减，官鬼爻持世主病势缠绵。此为《卜筮正宗》用神分类口径之转述，仅作文献规则演示，不构成任何医疗建议。',
    sourceRef:SR_BUSHI_YONGSHEN, paraphrase:true,
    plain:'占疾病（文献演示）：官鬼爻为病症、子孙爻为医药；子孙动主药到病减，官鬼持世主缠绵（转述）。健康问题请就医。',
  },
  {
    id:'zhouyi-liuyao-case-shiwu', method:'liuyao', label:'失物之占',
    quote:'失物之占：财物以妻财爻为用神，文书契约类以父母爻为用神；财爻安静主物在家未出，官鬼爻发动主失脱难寻。此为《卜筮正宗》用神分类口径之转述。',
    sourceRef:SR_BUSHI_YONGSHEN, paraphrase:true,
    plain:'占失物：一般财物以妻财爻为用神；财爻安静主物未出，官鬼爻动主难寻（转述）。',
  },
  {
    id:'zhouyi-liuyao-case-cisong', method:'liuyao', label:'词讼之占',
    quote:'词讼之占：细观官鬼爻与世应；父母爻为状词，妻财爻为理，财爻所生之方占理。此为《卜筮全书》词讼断例口径之转述。',
    sourceRef:SR_BUSHUAN, paraphrase:true,
    plain:'占官司（文献演示）：看官鬼爻与世应；父母爻为状词、妻财爻为理，财爻生克哪方哪方占理（转述）。',
  },
  {
    id:'zhouyi-liuyao-case-chuxing', method:'liuyao', label:'出行之占',
    quote:'出行之占：凡占自身出行以世爻为用神，世爻受生多者吉、受克多者凶；官鬼爻动主阻碍。此为《卜筮正宗》世应论用神口径之转述。',
    sourceRef:SR_BUSHI_YONGSHEN, paraphrase:true,
    plain:'占出行吉凶：自占以世爻为用神，世爻受生多吉、受克多凶；官鬼爻动主阻碍（转述）。',
  },
  {
    id:'zhouyi-liuyao-case-taiyun', method:'liuyao', label:'胎孕之占',
    quote:'胎孕之占：喜子孙爻旺相发动；产妇占产以子孙爻为用神，子孙爻动主易产易养。此为《卜筮全书》身命婚育口径之转述。',
    sourceRef:SR_BUSHUAN, paraphrase:true,
    plain:'占怀孕生产：喜子孙爻旺相发动；子孙爻动主易产易养（转述）。',
  },
  {
    id:'zhouyi-liuyao-case-jiazhai', method:'liuyao', label:'家宅之占',
    quote:'家宅之占：以父母爻为用神，二爻为房屋、五爻为人口；六爻安静最为吉。此为《卜筮全书》家宅风水口径之转述，不提供真实布局建议。',
    sourceRef:SR_BUSHUAN, paraphrase:true,
    plain:'占家宅：以父母爻为用神，二爻为房屋、五爻为人口；六爻安静为吉（转述）。不提供真实风水布局建议。',
  },
  {
    id:'zhouyi-zari-case-yixi', method:'zari', label:'移徙择日',
    quote:'移徙择日：宜天德、月德、驿马、成日等吉神所值之日，忌月破、往亡诸凶所值。此为《钦定协纪辨方书》诸神煞口径之转述，诸说并存，为文献展示。',
    sourceRef:SR_XIEJI, paraphrase:true,
    plain:'搬家择日口径（转述）：宜天德、月德、驿马、成日等吉神日，忌月破、往亡等；诸说并存，仅文献展示。',
  },
  {
    id:'zhouyi-zari-case-jiaqu', method:'zari', label:'嫁娶择日',
    quote:'嫁娶择日：诸书以大利月为纲，配不将等吉神论宜忌。此为《钦定协纪辨方书》口径之转述，诸说并存，本实现仅作干支与建除排布的文献展示。',
    sourceRef:SR_XIEJI, paraphrase:true,
    plain:'嫁娶择日口径（转述）：以大利月为纲、配不将等吉神；诸说并存，仅文献展示。',
  },
  {
    id:'zhouyi-zari-case-kaishi', method:'zari', label:'开市择日',
    quote:'开市择日：宜天愿、民日、满日、成日等吉神，忌月破、大耗诸凶。此为《钦定协纪辨方书》口径之转述，诸说并存，为文献展示。',
    sourceRef:SR_XIEJI, paraphrase:true,
    plain:'开市择日口径（转述）：宜天愿、民日、满日、成日等，忌月破、大耗；诸说并存，仅文献展示。',
  },
  // —— 解梦（民俗梦书口径；条目本身在 misc.ts 梦书表，断语只给占梦总纲） ——
  {
    id:'zhouyi-jiemeng-dingxiang', method:'jiemeng', label:'占梦定象',
    quote:'占梦之法：先定梦象，再稽梦书条目；梦无定象，因人而应，不可执一而断。此为明代梦书占梦总论口径之转述，仅作民俗文献演示。',
    sourceRef:SR_MENGLIN, paraphrase:true,
    plain:'占梦先定梦象、再查梦书条目；同一梦象因人因境而解异，只作民俗文献演示。',
  },
  {
    id:'zhouyi-jiemeng-wuding', method:'jiemeng', label:'梦无定象',
    quote:'梦无定象，因人而异；同一梦象，境遇不同则应不同。诸说并存，为民俗文献展示，不作现实预测。',
    sourceRef:SR_MENGLIN, paraphrase:true,
    plain:'未收录的梦象不硬凑解释：梦无定象、因人而异，只作民俗文献说明。',
  },
];
