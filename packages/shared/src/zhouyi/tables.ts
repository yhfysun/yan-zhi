// 周易测算纯函数库 —— 客观数据表（全部为文献口径的静态数据，无任何计算逻辑）。
// 数据出处均在各表注释中标注；本文件禁止包含任何断语/预测文本。

import type { ZhouyiTrigram } from './types';

/** 卦画：0=阴 1=阳，自下而上（初爻在最前） */
export type ZhouyiTrigramLines = [0|1, 0|1, 0|1];

/** 八卦总表：卦画、先天数、后天方位、五行、卦德、自然象
 *  出处：《周易》本经卦名与《说卦传》方位五行之通行口径（公版） */
export const ZHOUYI_TRIGRAM_INFO: Record<ZhouyiTrigram, {
  lines:ZhouyiTrigramLines; xiantian:number; houtian:string; wuxing:'金'|'木'|'水'|'火'|'土'; de:string; xiang:string;
}> = {
  乾: { lines:[1,1,1], xiantian:1, houtian:'西北', wuxing:'金', de:'健', xiang:'天' },
  兑: { lines:[1,1,0], xiantian:2, houtian:'西方', wuxing:'金', de:'悦', xiang:'泽' },
  离: { lines:[1,0,1], xiantian:3, houtian:'南方', wuxing:'火', de:'丽', xiang:'火' },
  震: { lines:[1,0,0], xiantian:4, houtian:'东方', wuxing:'木', de:'动', xiang:'雷' },
  巽: { lines:[0,1,1], xiantian:5, houtian:'东南', wuxing:'木', de:'入', xiang:'风' },
  坎: { lines:[0,1,0], xiantian:6, houtian:'北方', wuxing:'水', de:'陷', xiang:'水' },
  艮: { lines:[0,0,1], xiantian:7, houtian:'东北', wuxing:'土', de:'止', xiang:'山' },
  坤: { lines:[0,0,0], xiantian:8, houtian:'西南', wuxing:'土', de:'顺', xiang:'地' },
};

/** 先天数 → 卦名（乾一兑二离三震四巽五坎六艮七坤八） */
export const ZHOUYI_XIANTIAN_TRIGRAM: Record<number, ZhouyiTrigram> = {
  1:'乾', 2:'兑', 3:'离', 4:'震', 5:'巽', 6:'坎', 7:'艮', 8:'坤',
};

/** 六十四卦名表：外卦（上卦）× 内卦（下卦）→ 卦名。
 *  出处：《周易》本经六十四卦序通行卦名（公版）；键序按先天上下卦序排列 */
export const ZHOUYI_HEXAGRAM_NAMES: Record<ZhouyiTrigram, Record<ZhouyiTrigram, string>> = {
  乾: { 乾:'乾', 兑:'天泽履', 离:'天火同人', 震:'天雷无妄', 巽:'天风姤', 坎:'天水讼', 艮:'天山遁', 坤:'天地否' },
  兑: { 乾:'泽天夬', 兑:'兑', 离:'泽火革', 震:'泽雷随', 巽:'泽风大过', 坎:'泽水困', 艮:'泽山咸', 坤:'泽地萃' },
  离: { 乾:'火天大有', 兑:'火泽睽', 离:'离', 震:'火雷噬嗑', 巽:'火风鼎', 坎:'火水未济', 艮:'火山旅', 坤:'火地晋' },
  震: { 乾:'雷天大壮', 兑:'雷泽归妹', 离:'雷火丰', 震:'震', 巽:'雷风恒', 坎:'雷水解', 艮:'雷山小过', 坤:'雷地豫' },
  巽: { 乾:'风天小畜', 兑:'风泽中孚', 离:'风火家人', 震:'风雷益', 巽:'巽', 坎:'风水涣', 艮:'风山渐', 坤:'风地观' },
  坎: { 乾:'水天需', 兑:'水泽节', 离:'水火既济', 震:'水雷屯', 巽:'水风井', 坎:'坎', 艮:'水山蹇', 坤:'水地比' },
  艮: { 乾:'山天大畜', 兑:'山泽损', 离:'山火贲', 震:'山雷颐', 巽:'山风蛊', 坎:'山水蒙', 艮:'艮', 坤:'山地剥' },
  坤: { 乾:'地天泰', 兑:'地泽临', 离:'地火明夷', 震:'地雷复', 巽:'地风升', 坎:'地水师', 艮:'地山谦', 坤:'坤' },
};

/** 由上下卦查六十四卦名 */
export function zhouyiHexagramName(upper:ZhouyiTrigram, lower:ZhouyiTrigram): string {
  return ZHOUYI_HEXAGRAM_NAMES[upper][lower];
}

/** 由六爻卦画（自下而上）反查上下卦名 */
export function zhouyiTrigramsOfLines(lines:Array<0|1>): { upper:ZhouyiTrigram; lower:ZhouyiTrigram } {
  const keyOf = (a:0|1, b:0|1, c:0|1): ZhouyiTrigram => {
    for (const g of Object.keys(ZHOUYI_TRIGRAM_INFO) as ZhouyiTrigram[]) {
      const l = ZHOUYI_TRIGRAM_INFO[g].lines;
      if (l[0] === a && l[1] === b && l[2] === c) return g;
    }
    throw new Error('非法卦画');
  };
  return { lower:keyOf(lines[0], lines[1], lines[2]), upper:keyOf(lines[3], lines[4], lines[5]) };
}

/** 五行相生环（木生火生土生金生水生木） */
export const ZHOUYI_WUXING_SHENG = ['木','火','土','金','水'] as const;
/** 五行相克环（木克土克水克火克金克木） */
export const ZHOUYI_WUXING_KE = ['木','土','水','火','金'] as const;

/** a 生 b？ */
export function zhouyiSheng(a:'金'|'木'|'水'|'火'|'土', b:'金'|'木'|'水'|'火'|'土'): boolean {
  const i = ZHOUYI_WUXING_SHENG.indexOf(a);
  return ZHOUYI_WUXING_SHENG[(i + 1) % 5] === b;
}
/** a 克 b？ */
export function zhouyiKe(a:'金'|'木'|'水'|'火'|'土', b:'金'|'木'|'水'|'火'|'土'): boolean {
  const i = ZHOUYI_WUXING_KE.indexOf(a);
  return ZHOUYI_WUXING_KE[(i + 1) % 5] === b;
}

/** 十天干（次序即干支序），附阴阳与五行。出处：《尔雅·释天》以下通行口径（公版） */
export const ZHOUYI_TIANGAN: Array<{ gan:string; yinyang:'阳'|'阴'; wuxing:'金'|'木'|'水'|'火'|'土' }> = [
  { gan:'甲', yinyang:'阳', wuxing:'木' }, { gan:'乙', yinyang:'阴', wuxing:'木' },
  { gan:'丙', yinyang:'阳', wuxing:'火' }, { gan:'丁', yinyang:'阴', wuxing:'火' },
  { gan:'戊', yinyang:'阳', wuxing:'土' }, { gan:'己', yinyang:'阴', wuxing:'土' },
  { gan:'庚', yinyang:'阳', wuxing:'金' }, { gan:'辛', yinyang:'阴', wuxing:'金' },
  { gan:'壬', yinyang:'阳', wuxing:'水' }, { gan:'癸', yinyang:'阴', wuxing:'水' },
];

/** 十二地支，附阴阳与五行（子阳水、丑阴土、寅阳木、卯阴木、辰阳土、巳阴火、午阳火、未阴土、申阳金、酉阴金、戌阳土、亥阴水） */
export const ZHOUYI_DIZHI: Array<{ zhi:string; yinyang:'阳'|'阴'; wuxing:'金'|'木'|'水'|'火'|'土' }> = [
  { zhi:'子', yinyang:'阳', wuxing:'水' }, { zhi:'丑', yinyang:'阴', wuxing:'土' },
  { zhi:'寅', yinyang:'阳', wuxing:'木' }, { zhi:'卯', yinyang:'阴', wuxing:'木' },
  { zhi:'辰', yinyang:'阳', wuxing:'土' }, { zhi:'巳', yinyang:'阴', wuxing:'火' },
  { zhi:'午', yinyang:'阳', wuxing:'火' }, { zhi:'未', yinyang:'阴', wuxing:'土' },
  { zhi:'申', yinyang:'阳', wuxing:'金' }, { zhi:'酉', yinyang:'阴', wuxing:'金' },
  { zhi:'戌', yinyang:'阳', wuxing:'土' }, { zhi:'亥', yinyang:'阴', wuxing:'水' },
];

/** 地支本气藏干（简化口径：只取本气，不列中余气）。出处：通行命书藏干表，如《三命通会》卷二（公版） */
export const ZHOUYI_DIZHI_CANGGAN: Record<string, string> = {
  子:'癸', 丑:'己', 寅:'甲', 卯:'乙', 辰:'戊', 巳:'丙', 午:'丁', 未:'己', 申:'庚', 酉:'辛', 戌:'戊', 亥:'壬',
};

/** 六十甲子（甲子起，至癸亥终；程序化生成保证无误） */
export const ZHOUYI_LIUSHI_JIAZI: Array<{ ganzhi:string; index:number }> = Array.from({ length: 60 }, (_, i) => ({
  ganzhi: ZHOUYI_TIANGAN[i % 10].gan + ZHOUYI_DIZHI[i % 12].zhi,
  index: i,
}));

/** 公历年份 → 年干支（近似：1984 年 = 甲子年） */
export function zhouyiYearGanzhi(year:number): string {
  return ZHOUYI_LIUSHI_JIAZI[((year - 4) % 60 + 60) % 60].ganzhi;
}

/** 纳甲表：每卦内卦/外卦天干与自下而上的纳支。
 *  出处：京房纳甲系统，《京氏易传》（汉·京房，公版）；歌诀见《卜筮正宗》卷首（清·王洪绪辑，公版）：
 *  乾纳甲壬（内甲子寅辰、外壬午申戌）、坎纳戊（内寅辰午、外申戌子）、
 *  艮纳丙（内辰午申、外戌子寅）、震纳庚（内子寅辰、外午申戌）、
 *  巽纳辛（内丑亥酉、外未巳卯）、离纳己（内卯丑亥、外酉未巳）、
 *  坤纳乙癸（内未巳卯、外丑亥酉）、兑纳丁（内巳卯丑、外亥酉未） */
export const ZHOUYI_NAJIA: Record<ZhouyiTrigram, { ganNei:string; ganWai:string; zhiNei:[string,string,string]; zhiWai:[string,string,string] }> = {
  乾: { ganNei:'甲', ganWai:'壬', zhiNei:['子','寅','辰'], zhiWai:['午','申','戌'] },
  坎: { ganNei:'戊', ganWai:'戊', zhiNei:['寅','辰','午'], zhiWai:['申','戌','子'] },
  艮: { ganNei:'丙', ganWai:'丙', zhiNei:['辰','午','申'], zhiWai:['戌','子','寅'] },
  震: { ganNei:'庚', ganWai:'庚', zhiNei:['子','寅','辰'], zhiWai:['午','申','戌'] },
  巽: { ganNei:'辛', ganWai:'辛', zhiNei:['丑','亥','酉'], zhiWai:['未','巳','卯'] },
  离: { ganNei:'己', ganWai:'己', zhiNei:['卯','丑','亥'], zhiWai:['酉','未','巳'] },
  坤: { ganNei:'乙', ganWai:'癸', zhiNei:['未','巳','卯'], zhiWai:['丑','亥','酉'] },
  兑: { ganNei:'丁', ganWai:'丁', zhiNei:['巳','卯','丑'], zhiWai:['亥','酉','未'] },
};

/** 六神次序（自初爻起顺行六爻）：青龙、朱雀、勾陈、螣蛇、白虎、玄武。
 *  起例：甲乙日起青龙，丙丁日起朱雀，戊日起勾陈，己日起螣蛇，庚辛日起白虎，壬癸日起玄武。
 *  出处：《卜筮正宗》卷二「六神起例」（清·王洪绪辑，公版） */
export const ZHOUYI_LIUSHEN_ORDER = ['青龙','朱雀','勾陈','螣蛇','白虎','玄武'] as const;
/** 日干 → 六神起于初爻者（下标取 ZHOUYI_LIUSHEN_ORDER） */
export const ZHOUYI_LIUSHEN_START: Record<string, number> = {
  甲:0, 乙:0, 丙:1, 丁:1, 戊:2, 己:3, 庚:4, 辛:4, 壬:5, 癸:5,
};

/** 八宅命卦数：1坎 2坤 3震 4巽 6乾 7兑 8艮 9离；5 数男寄坤、女寄艮。
 *  出处：《八宅明镜》（清·箬冠道人 撰，旧题，公版） */
export const ZHOUYI_BAZHAI_MINGGUA: Record<number, ZhouyiTrigram> = { 1:'坎', 2:'坤', 3:'震', 4:'巽', 6:'乾', 7:'兑', 8:'艮', 9:'离' };

/** 东西四命：坎离震巽为东四命，乾坤艮兑为西四命（《八宅明镜》卷首） */
export const ZHOUYI_DONGSI: ReadonlySet<ZhouyiTrigram> = new Set(['坎','离','震','巽']);
export const ZHOUYI_XISI: ReadonlySet<ZhouyiTrigram> = new Set(['乾','坤','艮','兑']);

/** 大游年歌诀（每条自伏位起，顺后天八卦方位顺时针布于其余七宫）。
 *  出处：通行八宅大游年歌，《八宅明镜》卷二等（公版）：
 *  乾六天五祸绝延生 / 坎五天生延绝祸六 / 艮六绝祸生延天五 / 震延生祸绝五天六 /
 *  巽天五六祸生绝延 / 离六五绝延祸生天 / 坤天延绝生祸五六 / 兑生祸延绝六五天。
 *  字义：六=六煞 天=天医 五=五鬼 祸=祸害 绝=绝命 延=延年 生=生气 */
export const ZHOUYI_DAYOUNIAN: Record<ZhouyiTrigram, string> = {
  乾:'六天五祸绝延生', 坎:'五天生延绝祸六', 艮:'六绝祸生延天五', 震:'延生祸绝五天六',
  巽:'天五六祸生绝延', 离:'六五绝延祸生天', 坤:'天延绝生祸五六', 兑:'生祸延绝六五天',
};

/** 后天八卦顺时针循环（坎北→艮东北→震东→巽东南→离南→坤西南→兑西→乾西北） */
export const ZHOUYI_HOUTIAN_CLOCKWISE: ZhouyiTrigram[] = ['坎','艮','震','巽','离','坤','兑','乾'];

/** 游星字符 → 全名 */
export const ZHOUYI_YOUXING_NAMES: Record<string, string> = {
  六:'六煞', 天:'天医', 五:'五鬼', 祸:'祸害', 绝:'绝命', 延:'延年', 生:'生气',
};

/** 洛书飞泊轨迹（宫位数序：入中 5，顺行 6乾→7兑→8艮→9离→1坎→2坤→3震→4巽）。
 *  出处：《洛书》九宫数与《太一二九宫占》以下通行飞泊口径（公版） */
export const ZHOUYI_LUOSHU_TRAJECTORY = [5, 6, 7, 8, 9, 1, 2, 3, 4] as const;
/** 洛书盘面 3×3 格序（自上而下、自左而右）：4 9 2 / 3 5 7 / 8 1 6 */
export const ZHOUYI_LUOSHU_GRID = [4, 9, 2, 3, 5, 7, 8, 1, 6] as const;

/** 建除十二神顺序（建、除、满、平、定、执、破、危、成、收、开、闭）。
 *  出处：《钦定协纪辨方书》卷十一（清·允禄等奉敕撰，公版） */
export const ZHOUYI_JIANCHU_ORDER = ['建','除','满','平','定','执','破','危','成','收','开','闭'] as const;

/** 五虎遁月：年干 → 寅月天干起（甲己之年丙作首……）。
 *  出处：五虎遁口诀，通行见于《渊海子平》卷一（宋·徐子平 旧题，公版） */
export const ZHOUYI_WUHUDUN: Record<string, number> = { 甲:2, 己:2, 乙:4, 庚:4, 丙:6, 辛:6, 丁:8, 壬:8, 戊:0, 癸:0 };

/** 五鼠遁时：日干 → 子时天干起（甲己还加甲……）。
 *  出处：五鼠遁口诀，通行见于《渊海子平》卷一（公版） */
export const ZHOUYI_WUSHUDUN: Record<string, number> = { 甲:0, 己:0, 乙:2, 庚:2, 丙:4, 辛:4, 丁:6, 壬:6, 戊:8, 癸:8 };

/** 简化节气月支：公历月 → 月建地支（近似口径，不按精确节气时刻分界）：
 *  2月=寅（立春~惊蛰）、3月=卯、4月=辰、5月=巳、6月=午、7月=未、8月=申、9月=酉、10月=戌、11月=亥、12月=子、1月=丑 */
export const ZHOUYI_MONTH_ZHI: Record<number, string> = {
  1:'丑', 2:'寅', 3:'卯', 4:'辰', 5:'巳', 6:'午', 7:'未', 8:'申', 9:'酉', 10:'戌', 11:'亥', 12:'子',
};
