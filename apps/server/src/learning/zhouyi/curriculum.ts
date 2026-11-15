// 周易 · 主线课程汇总（独立学习学科，与英语/传统文化/音乐平级）。
//   lessons-t0.ts —— T0 入门与读法（Z01-Z06，P0 全 ready）
//   lessons-t1.ts —— T1 经传精读（Z07、Z10，P0 ready；Z08/Z09/Z11/Z12 P1）
//   lessons-t2.ts —— T2 符号与象数语言（Z13、Z14、Z16 P0 ready；Z15/Z17/Z18 P1）
//   lessons-t3.ts —— T3 易学史与注疏（Z19 P0 ready；Z20-Z24 P1）
//   lessons-t4.ts —— T4 图书与易图学（Z25-Z30 全部 P1）
//   lessons-t5.ts —— T5 术数·易占（Z31 P0 ready；Z32-Z36 P1）
//   lessons-t6.ts —— T6 术数·风水命理择日（Z37 P0 ready；Z38-Z42 P1）
//   lessons-t7.ts —— T7 外缘与研究方法（Z43-Z48 全部 P1）
// ★ 注释（Annotation 训诂）与注解（Interpretation 历代注家）分层见 types.ts；
//   全部人工预写，interpretations 只收确切注语原文，记不准一律 paraphrase=true 标「大意转述」。
import type { ZhouyiBookEntry, ZhouyiCourseMeta, ZhouyiLesson, ZhouyiTerm, ZhouyiTrack } from './types.js';
import { T0_LESSONS } from './lessons-t0.js';
import { T1_LESSONS } from './lessons-t1.js';
import { T2_LESSONS } from './lessons-t2.js';
import { T3_LESSONS } from './lessons-t3.js';
import { T4_LESSONS } from './lessons-t4.js';
import { T5_LESSONS } from './lessons-t5.js';
import { T6_LESSONS } from './lessons-t6.js';
import { T7_LESSONS } from './lessons-t7.js';

export const ZHOUYI_TRACKS: ReadonlyArray<{ id: ZhouyiTrack; name: string; desc: string }> = [
  { id: 'T0', name: '入门与读法', desc: '易学是什么、读哪本书、怎么读——边界、底本与五层阅读法' },
  { id: 'T1', name: '经传精读', desc: '经文与传文逐句精读，五层阅读法的主战场' },
  { id: 'T2', name: '符号与象数语言', desc: '爻位、八卦、六十四卦、五行干支等符号系统' },
  { id: 'T3', name: '易学史与注疏', desc: '两派六宗，从汉易到清与近现代' },
  { id: 'T4', name: '图书与易图学', desc: '河洛、太极、先天后天与历代易图' },
  { id: 'T5', name: '术数·易占', desc: '梅花、六爻、三式与杂占诸法的文献与规则' },
  { id: 'T6', name: '术数·风水命理择日', desc: '形势理气、阳宅、命相择日的文献梳理' },
  { id: 'T7', name: '外缘与研究方法', desc: '出土文献、跨学科影响与引用规范' },
] as const;

// 48 门全部注册（P0 14 门 ready:true，其余 ready:false 建设中）。
export const ZHOUYI_COURSES: ZhouyiCourseMeta[] = [
  // T0 入门与读法
  { id: 'zy_z01', track: 'T0', name: '易学是什么：经、传、易学与术数的边界', goal: '分清经、传两层与「易学/术数」两个层面的边界', minutes: 8, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z01' },
  { id: 'zy_z02', track: 'T0', name: '三易与成书：连山、归藏、周易', goal: '知道三易旧说与《周易》成书的大致层次', minutes: 8, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z02' },
  { id: 'zy_z03', track: 'T0', name: '经传结构与通行本的形成', goal: '看懂通行本「经传合编」体例的来龙去脉', minutes: 8, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z03' },
  { id: 'zy_z04', track: 'T0', name: '底本与版本：读哪一本书', goal: '为后续精读选好底本与关键参考书', minutes: 10, kind: 'lecture', ready: true, branch: '研究方法', code: 'Z04' },
  { id: 'zy_z05', track: 'T0', name: '怎样读一层原文：五层阅读法', goal: '掌握本课程精读「五层阅读法」的用法', minutes: 10, kind: 'lecture', ready: true, branch: '研究方法', code: 'Z05' },
  { id: 'zy_z06', track: 'T0', name: '术语总表：象数理占', goal: '用象数理占四要素统摄全部术语', minutes: 8, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z06' },
  // T1 经传精读
  { id: 'zy_z07', track: 'T1', name: '乾卦精读：卦辞、六爻、用九', goal: '逐句精读乾卦经文，配合象传文言分层理解', minutes: 18, kind: 'read', ready: true, branch: '经部易类', code: 'Z07' },
  { id: 'zy_z08', track: 'T1', name: '坤卦精读与乾坤《文言》', goal: '精读坤卦经文与乾坤二卦文言', minutes: 18, kind: 'read', ready: true, branch: '经部易类', code: 'Z08' },
  { id: 'zy_z09', track: 'T1', name: '卦序与《序卦传》', goal: '精读序卦传，理解通行本卦序的逻辑', minutes: 12, kind: 'read', ready: true, branch: '经部易类', code: 'Z09' },
  { id: 'zy_z10', track: 'T1', name: '《系辞上》精读：一阴一阳之谓道', goal: '精读系辞上核心章句，掌握其哲学纲领', minutes: 15, kind: 'read', ready: true, branch: '经部易类', code: 'Z10' },
  { id: 'zy_z11', track: 'T1', name: '《系辞下》与《说卦》：八卦物象方位', goal: '精读系辞下与说卦的物象方位章句', minutes: 15, kind: 'read', ready: true, branch: '经部易类', code: 'Z11' },
  { id: 'zy_z12', track: 'T1', name: '《彖》《象》读法与《杂卦》', goal: '掌握彖象传的体例与杂卦的短诀', minutes: 12, kind: 'read', ready: true, branch: '经部易类', code: 'Z12' },
  // T2 符号与象数语言
  { id: 'zy_z13', track: 'T2', name: '阴阳爻位：九六、当位、承乘比应', goal: '掌握九六、当位、得中、承乘比应等爻位语言', minutes: 10, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z13' },
  { id: 'zy_z14', track: 'T2', name: '八卦：卦画、卦德、万物类象、先后天方位', goal: '掌握八卦卦画、卦德、类象与先后天方位', minutes: 10, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z14' },
  { id: 'zy_z15', track: 'T2', name: '六十四卦：八宫、错综、互卦', goal: '掌握六十四卦的八宫次序与错综互诸关系', minutes: 10, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z15' },
  { id: 'zy_z16', track: 'T2', name: '五行：生克制化与方位时序', goal: '掌握五行生克制化及其方位时序干支配属', minutes: 10, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z16' },
  { id: 'zy_z17', track: 'T2', name: '天干地支与六十甲子', goal: '掌握干支系统与六十甲子的排法', minutes: 10, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z17' },
  { id: 'zy_z18', track: 'T2', name: '筮法：大衍之数与《左传》筮例', goal: '了解大衍筮法流程与左传古筮例', minutes: 12, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z18' },
  // T3 易学史与注疏
  { id: 'zy_z19', track: 'T3', name: '两派六宗：《四库总目·易类小序》精读', goal: '精读易类小序，掌握两派六宗的易学史框架', minutes: 15, kind: 'read', ready: true, branch: '经部易类', code: 'Z19' },
  { id: 'zy_z20', track: 'T3', name: '汉易：卦气、纳甲八宫、焦林', goal: '梳理汉代象数易的卦气纳甲诸说', minutes: 10, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z20' },
  { id: 'zy_z21', track: 'T3', name: '魏晋玄学易：王弼扫象', goal: '理解王弼注易的玄学路向', minutes: 10, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z21' },
  { id: 'zy_z22', track: 'T3', name: '唐代注疏：《周易正义》与《周易集解》', goal: '了解唐代官疏与集解两种文献形态', minutes: 10, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z22' },
  { id: 'zy_z23', track: 'T3', name: '宋易：程传、本义与史事宗', goal: '梳理宋代义理易与史事宗谱系', minutes: 10, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z23' },
  { id: 'zy_z24', track: 'T3', name: '清与近现代：辨伪、汉易复兴与哲学史', goal: '了解清代考辨与近现代易学研究的展开', minutes: 10, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z24' },
  // T4 图书与易图学
  { id: 'zy_z25', track: 'T4', name: '河图洛书：源流与数理', goal: '梳理河洛图书的文献源流与数理结构', minutes: 10, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z25' },
  { id: 'zy_z26', track: 'T4', name: '太极图与《太极图说》', goal: '了解太极图谱系与太极图说文本', minutes: 10, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z26' },
  { id: 'zy_z27', track: 'T4', name: '先天图、后天图与六十四卦方圆图', goal: '掌握先后天诸图与方圆图结构', minutes: 10, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z27' },
  { id: 'zy_z28', track: 'T4', name: '卦气、爻辰、纳甲、十二消息卦', goal: '掌握四类汉代易图配伍体系', minutes: 10, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z28' },
  { id: 'zy_z29', track: 'T4', name: '易图学的独立性与清代辨伪', goal: '了解易图学的独立发展与清代考辨', minutes: 10, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z29' },
  { id: 'zy_z30', track: 'T4', name: '历代易图总览与识图法', goal: '建立历代易图总览与基本识图能力', minutes: 10, kind: 'lecture', ready: true, branch: '经部易类', code: 'Z30' },
  // T5 术数·易占
  { id: 'zy_z31', track: 'T5', name: '梅花易数（一）：源流与托名辨', goal: '掌握梅花易数的文献面貌与托名问题', minutes: 15, kind: 'read', ready: true, branch: '子部术数类', code: 'Z31' },
  { id: 'zy_z32', track: 'T5', name: '梅花易数（二）：起卦诸法', goal: '按古籍口径梳理梅花诸起卦法', minutes: 12, kind: 'lecture', ready: true, branch: '子部术数类', code: 'Z32' },
  { id: 'zy_z33', track: 'T5', name: '梅花易数（三）：体用生克与三要十应', goal: '梳理体用生克与三要十应的规则口径', minutes: 12, kind: 'lecture', ready: true, branch: '子部术数类', code: 'Z33' },
  { id: 'zy_z34', track: 'T5', name: '六爻纳甲：八宫、世应、六亲、用神', goal: '掌握六爻纳甲系统的术语框架', minutes: 12, kind: 'lecture', ready: true, branch: '子部术数类', code: 'Z34' },
  { id: 'zy_z35', track: 'T5', name: '三式：奇门、六壬、太乙', goal: '了解三式文献的谱系与基本框架', minutes: 12, kind: 'lecture', ready: true, branch: '子部术数类', code: 'Z35' },
  { id: 'zy_z36', track: 'T5', name: '杂占：易林、灵棋、小六壬、拆字', goal: '概览杂占诸书的文献形态', minutes: 10, kind: 'lecture', ready: true, branch: '子部术数类', code: 'Z36' },
  // T6 术数·风水命理择日
  { id: 'zy_z37', track: 'T6', name: '风水总论：形势与理气两大系统', goal: '建立风水文献两大系统框架与辨伪意识', minutes: 10, kind: 'lecture', ready: true, branch: '子部术数类', code: 'Z37' },
  { id: 'zy_z38', track: 'T6', name: '形势派（峦头）：龙穴砂水向', goal: '梳理形势派五要素与代表文献', minutes: 10, kind: 'lecture', ready: true, branch: '子部术数类', code: 'Z38' },
  { id: 'zy_z39', track: 'T6', name: '理气派（一）：青囊、天玉、催官', goal: '梳理理气派早期诸经的文献线索', minutes: 10, kind: 'lecture', ready: true, branch: '子部术数类', code: 'Z39' },
  { id: 'zy_z40', track: 'T6', name: '理气派（二）：八宅、玄空飞星', goal: '掌握八宅与玄空飞星的规则框架', minutes: 10, kind: 'lecture', ready: true, branch: '子部术数类', code: 'Z40' },
  { id: 'zy_z41', track: 'T6', name: '阳宅与营造：《宅经》与都城规划', goal: '梳理宅经文献与古代都城规划中的方位观念', minutes: 10, kind: 'lecture', ready: true, branch: '子部术数类', code: 'Z41' },
  { id: 'zy_z42', track: 'T6', name: '命理、相法与择日', goal: '概览命理相法择日三类文献的谱系', minutes: 10, kind: 'lecture', ready: true, branch: '子部术数类', code: 'Z42' },
  // T7 外缘与研究方法
  { id: 'zy_z43', track: 'T7', name: '易与中医：五运六气、子午流注', goal: '了解易学与中医运气学说的文献关联', minutes: 10, kind: 'lecture', ready: true, branch: '易学外缘', code: 'Z43' },
  { id: 'zy_z44', track: 'T7', name: '易与丹道、天文历法、乐律、兵法', goal: '梳理易在丹道天文乐律兵法中的援引史', minutes: 10, kind: 'lecture', ready: true, branch: '易学外缘', code: 'Z44' },
  { id: 'zy_z45', track: 'T7', name: '易与数学：莱布尼茨二进制的史学考证', goal: '考察莱布尼茨与易图的交往史料', minutes: 10, kind: 'lecture', ready: true, branch: '易学外缘', code: 'Z45' },
  { id: 'zy_z46', track: 'T7', name: '易与文学、建筑与东亚传播', goal: '梳理易在文学建筑与东亚的传播史', minutes: 10, kind: 'lecture', ready: true, branch: '易学外缘', code: 'Z46' },
  { id: 'zy_z47', track: 'T7', name: '出土易文献：帛书、上博简、王家台秦简', goal: '概览出土易文献的版本价值', minutes: 10, kind: 'lecture', ready: true, branch: '研究方法', code: 'Z47' },
  { id: 'zy_z48', track: 'T7', name: '研究方法与引用规范', goal: '掌握易学研究的基本方法与引用规范', minutes: 10, kind: 'lecture', ready: true, branch: '研究方法', code: 'Z48' },
];

export const ZHOUYI_LESSONS: ZhouyiLesson[] = [
  ...T0_LESSONS,
  ...T1_LESSONS,
  ...T2_LESSONS,
  ...T3_LESSONS,
  ...T4_LESSONS,
  ...T5_LESSONS,
  ...T6_LESSONS,
  ...T7_LESSONS,
];

export function getZhouyiLesson(id: string): ZhouyiLesson | undefined {
  return ZHOUYI_LESSONS.find((l) => l.id === id);
}

// 术语总表（人工预写，与精读注释互通；见Also 指向表内其他条目）。
export const ZHOUYI_TERMS: ZhouyiTerm[] = [
  { term: '爻', pinyin: 'yáo', category: '符号', definition: '组成卦的基本符号，分阳爻（—）与阴爻（--）；六十四卦每卦六爻。', seeAlso: ['九六'] },
  { term: '卦', category: '符号', definition: '由三爻（经卦/八卦）或六爻（别卦/六十四卦）组成的符号单位。', seeAlso: ['八卦', '六十四卦'] },
  { term: '卦辞', category: '文本', definition: '系于一卦之下的总断语，每卦一条，如乾卦「元亨利贞」。', seeAlso: ['爻辞', '彖传'] },
  { term: '爻辞', category: '文本', definition: '系于一爻之下的断语，每爻一条；乾卦另有「用九」、坤卦另有「用六」。', seeAlso: ['卦辞', '象传'] },
  { term: '大象', category: '文本', definition: '《象传》释全卦的部分，以「君子以（先王以、后以）」句式由天道落到人事。', seeAlso: ['小象'] },
  { term: '小象', category: '文本', definition: '《象传》释各爻的部分，逐爻解释爻辞之所以然。', seeAlso: ['大象'] },
  { term: '彖传', pinyin: 'tuàn zhuàn', category: '文本', definition: '《十翼》之一，随卦解释卦名、卦义与卦辞，多据爻位立论。', seeAlso: ['当位', '得中'] },
  { term: '系辞', category: '文本', definition: '《十翼》中总论易理义例的长篇，分上下两篇，为传文中哲学性最强者。', seeAlso: ['太极', '一阴一阳'] },
  { term: '九六', category: '象数', definition: '阳爻称九、阴爻称六，取揲蓍老变之数；七八为少阳少阴而不变。', seeAlso: ['爻', '大衍之数'] },
  { term: '当位', category: '象数', definition: '阳爻居初三五奇位、阴爻居二四上偶位，谓当位（得位），多主吉。', seeAlso: ['得中', '承乘比应'] },
  { term: '得中', category: '象数', definition: '爻居下卦第二位或上卦第五位之中，胜于仅当位，故「二多誉，五多功」。', seeAlso: ['当位'] },
  { term: '承', category: '象数', definition: '阴爻居阳爻之下曰承，象顺从，多不为凶。', seeAlso: ['乘', '承乘比应'] },
  { term: '乘', pinyin: 'chéng', category: '象数', definition: '阴爻居阳爻之上曰乘，乘刚多凶。', seeAlso: ['承', '承乘比应'] },
  { term: '比', pinyin: 'bǐ', category: '象数', definition: '相邻两爻阴阳亲近相比之关系。', seeAlso: ['应', '承乘比应'] },
  { term: '应', pinyin: 'yìng', category: '象数', definition: '初与四、二与五、三与上异位阴阳相求相应，应则相援。', seeAlso: ['比', '承乘比应'] },
  { term: '承乘比应', category: '象数', definition: '彖象传分析爻际关系的四种位置语言之合称。', seeAlso: ['承', '乘', '比', '应'] },
  { term: '八卦', category: '符号', definition: '乾兑离震巽坎艮坤八个三爻卦，各有卦德与类象。', seeAlso: ['卦德', '类象'] },
  { term: '六十四卦', category: '符号', definition: '八卦相重而成的六爻卦全体；通行本以乾为首、坤为次。', seeAlso: ['八卦', '非覆即变'] },
  { term: '卦德', category: '象数', definition: '《说卦》以一字定性八卦：乾健、坤顺、震动、巽入、坎陷、离丽、艮止、兑说。', seeAlso: ['八卦'] },
  { term: '类象', category: '象数', definition: '以八卦配属天地人物的象征总表，读象数文献的「词典」。', seeAlso: ['卦德'] },
  { term: '先天八卦', category: '易图', definition: '宋儒所称伏羲八卦方位：乾南坤北，与后天方位有别。', seeAlso: ['后天八卦'] },
  { term: '后天八卦', category: '易图', definition: '所称文王八卦方位：离南坎北，经文依据见《说卦》帝出乎震章。', seeAlso: ['先天八卦', '说卦'] },
  { term: '卦气', category: '汉易', definition: '汉代以四时卦候配六十四卦的配伍体系，孟喜一系为代表。', seeAlso: ['消息卦'] },
  { term: '纳甲', category: '术数', definition: '以十天干配八卦爻位的术数方法，京房一系所立，六爻法之基础。', seeAlso: ['六亲', '世应'] },
  { term: '八宫', category: '术数', definition: '京房将六十四卦按八纯卦分宫排布的体系，六爻纳甲所用。', seeAlso: ['纳甲'] },
  { term: '世应', category: '术数', definition: '六爻法中每宫各爻立「世爻」与隔二位之「应爻」，为主客对待之位。', seeAlso: ['纳甲', '六亲'] },
  { term: '六亲', category: '术数', definition: '六爻法以卦宫五行与他爻生克定出的父母、兄弟、子孙、妻财、官鬼五类（称六亲）。', seeAlso: ['世应', '用神'] },
  { term: '用神', category: '术数', definition: '六爻占断中所占之事对应的六亲爻，为断卦之枢纽。', seeAlso: ['六亲'] },
  { term: '体用', category: '术数', definition: '梅花易数术语：体卦为主、用卦为克应，以五行生克断吉凶。', seeAlso: ['梅花易数'] },
  { term: '互卦', category: '象数', definition: '取二三四爻与三四五爻另成之卦，示一事之中间环节。', seeAlso: ['变卦'] },
  { term: '变卦', category: '象数', definition: '本卦动爻变化后所成之卦，示事之归宿。', seeAlso: ['互卦'] },
  { term: '错卦', category: '象数', definition: '六爻阴阳全反所成之卦，又称对卦、旁通。', seeAlso: ['综卦'] },
  { term: '综卦', category: '象数', definition: '将本卦上下颠倒（覆）所成之卦，又称覆卦。', seeAlso: ['错卦', '非覆即变'] },
  { term: '非覆即变', category: '易史', definition: '孔颖达概括通行本卦序之语：六十四卦两两成对，或倒覆或全变。', seeAlso: ['综卦', '错卦'] },
  { term: '河图', category: '易图', definition: '宋代图书学核心图式之一，以一至十之数点阵配方位。', seeAlso: ['洛书'] },
  { term: '洛书', category: '易图', definition: '以一至九之数纵横皆十五的九宫图式，与九宫配属相通。', seeAlso: ['河图'] },
  { term: '消息卦', category: '汉易', definition: '十二辟卦：阳爻自下渐长为息、渐消为消，配十二月。', seeAlso: ['卦气'] },
  { term: '建除', category: '择日', definition: '以「建除满平定执破危成收开闭」十二直轮值日辰的择日体系。', seeAlso: ['择日'] },
  { term: '大衍之数', category: '象数', definition: '《系辞》筮法之数：「五十，其用四十有九」，历代解说不一。', seeAlso: ['九六'] },
  { term: '三要十应', category: '术数', definition: '梅花易数以外物之声色动静辅助断卦的感应理论。', seeAlso: ['体用'] },
  { term: '峦头', category: '风水', definition: '形势派俗称，专重龙穴砂水向之实地形态。', seeAlso: ['理气'] },
  { term: '理气', category: '风水', definition: '风水两派之一，重方位罗盘与阴阳五行推算。', seeAlso: ['峦头'] },
  { term: '两仪四象', category: '象数', definition: '《系辞》「太极生两仪，两仪生四象」：两仪为阴阳，四象为太阳少阴少阳太阴。', seeAlso: ['太极'] },
  { term: '太极', category: '象数', definition: '《系辞》所称万物本原：「易有太极，是生两仪」。', seeAlso: ['两仪四象'] },
  { term: '一阴一阳', category: '义理', definition: '《系辞》「一阴一阳之谓道」：阴阳交替消长即道，易学哲学总纲。', seeAlso: ['太极'] },
];

// 参考书目（公版古籍可引原文；仅书目为今人著述/整理本，只列书名供按图索骥）。
export const ZHOUYI_BIBLIOGRAPHY: ZhouyiBookEntry[] = [
  { title: '周易（王弼、韩康伯注本）', author: '王弼、韩康伯注', dynasty: '魏晋', role: '原文', license: '公版', note: '通行十三经注疏本所据底本' },
  { title: '周易正义', author: '孔颖达等奉敕撰', dynasty: '唐', role: '古注', license: '公版', note: '官修义疏，汉魏旧说之总汇' },
  { title: '周易集解', author: '李鼎祚辑', dynasty: '唐', role: '古注', license: '公版', note: '辑汉魏象数旧注三十余家' },
  { title: '伊川易传', author: '程颐', dynasty: '宋', role: '古注', license: '公版', note: '义理易代表作（程氏易传）' },
  { title: '周易本义', author: '朱熹', dynasty: '宋', role: '古注', license: '公版', note: '以「易本卜筮之书」为立场' },
  { title: '京氏易传', author: '旧题京房', dynasty: '汉', role: '古注', license: '公版', note: '八宫纳甲体系之文献依据' },
  { title: '焦氏易林', author: '旧题焦延寿', dynasty: '汉', role: '古注', license: '公版', note: '四千余繇辞的占验诗集' },
  { title: '梅花易数', author: '旧题邵雍撰（今本多明清辑录）', dynasty: '题宋', role: '古注', license: '公版', note: '托名之作，读时先辨伪' },
  { title: '卜筮正宗', author: '王洪绪（清）', dynasty: '清', role: '工具', license: '公版', note: '六爻纳甲法之集大成教科书' },
  { title: '葬书', author: '旧题郭璞撰', dynasty: '旧题晋（实晚出）', role: '古注', license: '公版', note: '形势派理论源头，托名有争议' },
  { title: '撼龙经', author: '旧题杨筠松撰', dynasty: '旧题唐', role: '古注', license: '公版', note: '形势派山川形格专书，托名' },
  { title: '钦定协纪辨方书', author: '允禄等奉敕撰', dynasty: '清', role: '工具', license: '公版', note: '官方择日术数总汇' },
  { title: '易学哲学史', author: '朱伯崑', dynasty: '今', role: '研究', license: '仅书目', note: '易学哲学通史的奠基之作' },
  { title: '王弼集校释', author: '楼宇烈校释', dynasty: '今', role: '研究', license: '仅书目', note: '王弼注易之今人整理本' },
  { title: '周易译注', author: '黄寿祺、张善文', dynasty: '今', role: '研究', license: '仅书目', note: '通行今译注释本' },
];

export const ZHOUYI_DISCLAIMER = '周易与术数内容为传统文献与民俗文化研究展示，推演为古籍规则口径的教学演示，不构成任何现实建议。';

// 文库层精选集（canon-data.ts 的唯一 re-export 口：路由与前端均经此取，不直连）
export { ZHOUYI_CANON_WORKS } from './canon-data.js';
export type { ZhouyiCanonWork } from './canon-data.js';
