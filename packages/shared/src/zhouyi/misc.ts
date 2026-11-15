// 周易测算 · 杂占数据表（测字 / 解梦 / 姓名学，纯数据无 IO）。
//
// 三张表全部是「文献/民俗口径」的人工预写条目，绝不生成新的预测文本：
//   ① 测字：按现行简体规范笔画起卦（梅花字占简化口径），笔画数逐字核实；
//   ② 解梦：常见梦象 → 民俗梦书（《梦林玄解》/ 民俗通行本《周公解梦》）条目口径的**转述**；
//   ③ 姓名学：五格剖象为二十世纪传入的近人体例（**非古籍**），只演示格数计算，
//      不做数理吉凶断语（断语体系非公版古籍，标注红线：绝不标「公版」）。

import type { ZhouyiSourceRef } from './types';

// —— 测字：常用字规范笔画表（简体现行笔画，人工逐字核对） ——
export const ZHOUYI_CEZI_STROKES: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 人: 2, 大: 3, 天: 4, 元: 4, 云: 4, 木: 4, 水: 4, 火: 4, 土: 3, 金: 8,
  心: 4, 中: 4, 日: 4, 月: 4, 明: 8, 安: 6, 字: 6, 吉: 6, 喜: 12, 生: 5, 名: 6, 利: 7,
  春: 9, 夏: 10, 秋: 9, 冬: 5, 東: 8, 成: 6, 败: 8, 得: 11, 失: 5, 进: 7, 退: 9, 和: 8,
  平: 5, 定: 8, 顺: 9, 通: 10, 达: 6, 富: 12, 贵: 9, 贫: 8, 贱: 8, 禄: 13, 寿: 7, 福: 13,
  家: 10, 宅: 6, 门: 3, 户: 4, 田: 5, 山: 3, 川: 3, 河: 8, 海: 10, 风: 4, 雨: 8, 雷: 13,
  龙: 5, 马: 3, 牛: 4, 羊: 6, 犬: 4, 王: 4, 君: 7, 臣: 6, 民: 5, 众: 6, 子: 3, 女: 3,
  男: 7, 夫: 4, 妻: 8, 兄: 5, 弟: 7, 友: 4, 客: 9, 兵: 7, 车舟: 0,
};

// —— 解梦：常见梦象 → 民俗梦书口径转述条目 ——
export type ZhouyiDreamEntry = {
  /** 梦象关键词（命中任一即视为该象；匹配对「梦见蛇」「蛇缠身」这类短语做包含判断） */
  keys: string[];
  /** 事类名（如「蛇」「水」） */
  name: string;
  /** 民俗梦书口径（转述，绝不编造原句） */
  quote: string;
  plain: string;
  sourceRef: ZhouyiSourceRef;
};

const SR_MENGLIN: ZhouyiSourceRef = { work: '梦林玄解', author: '佚名 辑', dynasty: '明', license: '公版' };
const SR_ZHOUGONG: ZhouyiSourceRef = { work: '周公解梦（民俗通行本）', author: '佚名', dynasty: '清', license: '公版' };

export const ZHOUYI_DREAM_TABLE: ZhouyiDreamEntry[] = [
  { keys: ['蛇'], name: '蛇', quote: '梦蛇为小龙之象，民俗梦书多断为「贵人相助、谋事得助」之兆；女子梦蛇另有娠象之说。', plain: '民俗口径：梦蛇多解作得贵人扶助；女子梦蛇在旧说中亦有得子娠象的说法（均为民俗转述）。', sourceRef: SR_ZHOUGONG },
  { keys: ['水', '江河', '大海', '洪水'], name: '水', quote: '梦水主财帛流通之象：清水为顺遂、浊水为阻滞；大水泛滥旧说解作事多波折。', plain: '民俗口径：清水主顺、浊水主阻，大水泛涨主波折（转述）。', sourceRef: SR_ZHOUGONG },
  { keys: ['火', '着火', '失火', '火灾'], name: '火', quote: '梦火为文明之象：火旺而不伤人旧说解作兴旺发达；火烧自身旧说解作心绪焦灼。', plain: '民俗口径：火主兴旺，烧身主焦灼（转述）。', sourceRef: SR_MENGLIN },
  { keys: ['飞', '飞翔', '上天'], name: '飞行', quote: '梦身飞起为志气舒展之象，旧说解作前程渐开；飞而不稳者解作根基未固。', plain: '民俗口径：飞主前程舒展，飞而不稳主根基未固（转述）。', sourceRef: SR_MENGLIN },
  { keys: ['掉牙', '牙齿', '落牙', '牙掉'], name: '牙齿', quote: '梦齿落旧说解作「骨肉之亲有远行离别之象」，亦有「口舌是非」之说；诸说并存。', plain: '民俗口径：掉牙旧说多关亲离与口舌，诸本不一（转述）。', sourceRef: SR_ZHOUGONG },
  { keys: ['鱼'], name: '鱼', quote: '梦鱼为「余」之谐音，民俗多解作财帛有余；捕鱼得鱼解作谋事有获。', plain: '民俗口径：鱼谐「余」，主财有余（转述）。', sourceRef: SR_ZHOUGONG },
  { keys: ['死人', '亡', '去世', '死'], name: '亡故', quote: '梦亡故之人旧说解作「哀思所感」；梦中见死而复生，旧说解作「去旧生新、事有转机」。', plain: '民俗口径：梦见亡者主哀思所感；死而复生主去旧生新（转述）。', sourceRef: SR_MENGLIN },
  { keys: ['棺', '棺材'], name: '棺木', quote: '棺谐「官」，民俗解作升迁得职之兆；亦有「财有定聚」之说。', plain: '民俗口径：棺谐「官」，主升迁得职（转述）。', sourceRef: SR_ZHOUGONG },
  { keys: ['结婚', '婚礼', '嫁娶'], name: '婚嫁', quote: '梦婚嫁为阴阳相合之象，旧说解作「人际有新合」；亦主事之「结成」。', plain: '民俗口径：婚嫁主人际新合、事有结成（转述）。', sourceRef: SR_MENGLIN },
  { keys: ['怀孕', '娠', '胎'], name: '娠孕', quote: '梦娠孕旧说解作「事将成而有期」；亦有「新计将生」之象。', plain: '民俗口径：娠孕主事将成、新计将生（转述）。', sourceRef: SR_MENGLIN },
  { keys: ['钱', '金银', '财', '金子'], name: '钱财', quote: '梦得金银旧说解作「名而非利」之辨；梦失钱财解作「破财免灾」之俗说。', plain: '民俗口径：得金银主名、失钱财主散（俗说转述）。', sourceRef: SR_ZHOUGONG },
  { keys: ['被追', '追赶', '逃', '追'], name: '被追', quote: '梦被追赶旧说解作「心有所避、事有所迫」；醒来自脱者解作「事得解脱」。', plain: '民俗口径：被追主心有所避；自脱主事得解（转述）。', sourceRef: SR_MENGLIN },
  { keys: ['房', '屋', '宅', '楼'], name: '屋宅', quote: '梦屋宅为「身之所安」：新屋解作新局将开；屋损旧说解作「根基须修」。', plain: '民俗口径：新屋主新局、屋损主修根基（转述）。', sourceRef: SR_MENGLIN },
  { keys: ['日月', '太阳', '月亮'], name: '日月', quote: '梦见日月旧说解作「明主得见、贵人当值」；日月入怀为娠象之说亦见于梦书。', plain: '民俗口径：日月主得见贵人；入怀为娠象旧说（转述）。', sourceRef: SR_ZHOUGONG },
  { keys: ['风', '台风', '大风'], name: '风', quote: '梦风为「事有消息」之象：和风解作消息顺遂，疾风骤起解作事有变动。', plain: '民俗口径：和风主消息顺、疾风主变动（转述）。', sourceRef: SR_MENGLIN },
  { keys: ['雨'], name: '雨', quote: '梦降雨旧说解作「润泽有时、谋事得济」；久雨不解解作「事有濡滞」。', plain: '民俗口径：雨主得济，久雨主濡滞（转述）。', sourceRef: SR_MENGLIN },
  { keys: ['考', '考试', '文章'], name: '考试', quote: '梦应试旧说解作「所学将验」；梦题不解者解作「学力未充，须再进」。', plain: '民俗口径：考试主所学将验；题不解主学力须进（转述）。', sourceRef: SR_MENGLIN },
  { keys: ['血'], name: '血', quote: '梦见血旧说解作「破耗之象」，亦有「得利」之说（血为财色）；诸本不一。', plain: '民俗口径：血主破耗，亦有得利之说，诸本不一（转述）。', sourceRef: SR_ZHOUGONG },
  { keys: ['哭', '泣'], name: '哭泣', quote: '梦哭旧说解作「反为吉象」——梦中哭泣，醒来事顺，民俗谓「梦哭主喜」。', plain: '民俗口径：梦哭反主喜顺（民俗「梦哭主喜」之说，转述）。', sourceRef: SR_ZHOUGONG },
  { keys: ['笑'], name: '笑', quote: '梦中大笑旧说解作「喜中藏变」，主「事顺而须防满」。', plain: '民俗口径：大笑主喜中藏变，须防满（转述）。', sourceRef: SR_MENGLIN },
  { keys: ['马'], name: '马', quote: '梦马为「行动之象」：骏马解作行事得力；马惊解作行有波折。', plain: '民俗口径：马主行动，骏马得力、马惊波折（转述）。', sourceRef: SR_ZHOUGONG },
  { keys: ['牛'], name: '牛', quote: '梦牛为「勤力之象」，旧说解作「耕耘得报」；牛驯主事顺、牛斗主口舌。', plain: '民俗口径：牛主勤力得报，牛斗主口舌（转述）。', sourceRef: SR_ZHOUGONG },
  { keys: ['山'], name: '山', quote: '梦登山旧说解作「步步高升」；山崩解作「倚靠有变」。', plain: '民俗口径：登山主高升，山崩主倚靠有变（转述）。', sourceRef: SR_ZHOUGONG },
  { keys: ['树', '花', '果树'], name: '草木', quote: '梦树木花果为「生机之象」：花开解作事将显；果熟解作事将成。', plain: '民俗口径：花主事显、果熟主事成（转述）。', sourceRef: SR_MENGLIN },
];

/** 未命中任何梦象时的通用口径条目（解梦不落空，同时守住「梦无定象」的文献口径） */
export const ZHOUYI_DREAM_FALLBACK: ZhouyiDreamEntry = {
  keys: [],
  name: '诸象未详',
  quote: '占梦诸书皆言「梦无定象，因人而应」：同一梦象，境遇不同则解不同；诸说并存，皆为民俗口径之转述，不作现实预测。',
  plain: '古籍占梦书明确讲「梦无定象」——同一梦象因人因境而异。未收录的梦象只给文献口径说明，不作预测。',
  sourceRef: SR_MENGLIN,
};

/** 梦象匹配：对 dream 文本与条目关键词做包含判断；未命中返回 fallback。 */
export function zhouyiDreamMatch(dream: string): ZhouyiDreamEntry {
  const q = dream.trim();
  if (!q) return ZHOUYI_DREAM_FALLBACK;
  for (const e of ZHOUYI_DREAM_TABLE) {
    if (e.keys.some((k) => q.includes(k))) return e;
  }
  return ZHOUYI_DREAM_FALLBACK;
}

// —— 姓名学：五格剖象（近人体例，非古籍） ——
export const ZHOUYI_XINGMING_NOTE = {
  sourceRef: { work: '五格剖象法（近人体例）', author: '二十世纪初传入', dynasty: '今', license: '仅书目' } as ZhouyiSourceRef,
  note: '五格剖象为二十世纪传入的近人姓名体例，非《周易》古籍；本演示只计算格数与笔画口径，不做数理吉凶断语。',
};

/** 常见姓氏康熙笔画对照（人工核对，节选；不在表内时由用户直接输入笔画） */
export const ZHOUYI_XINGMING_BIHUA: Record<string, number> = {
  王: 4, 李: 7, 张: 11, 刘: 15, 陈: 16, 杨: 13, 黄: 12, 赵: 14, 吴: 7, 周: 8,
  徐: 10, 孙: 10, 马: 10, 朱: 6, 胡: 9, 郭: 15, 何: 7, 林: 8, 罗: 20, 高: 10,
  郑: 19, 梁: 11, 谢: 17, 宋: 7, 唐: 10, 许: 11, 韩: 17, 冯: 12, 邓: 19, 曹: 11,
  曾: 12, 彭: 12, 肖: 9, 蔡: 14, 潘: 16, 田: 5, 董: 15, 袁: 10, 于: 3, 余: 7,
  叶: 15, 程: 12, 苏: 22, 魏: 18, 吕: 7, 丁: 2, 任: 6, 沈: 8, 姚: 9, 卢: 16,
  姜: 9, 崔: 11, 钟: 17, 谭: 19, 陆: 16, 汪: 8, 范: 11, 金: 8, 石: 5, 廖: 14,
  贾: 13, 夏: 10, 韦: 9, 傅: 12, 方: 4, 白: 5, 莫: 13, 邹: 12, 秦: 10, 江: 7,
  明: 8, 安: 6, 华: 14, 龙: 16, 万: 13, 常: 11, 温: 14, 康: 11, 文: 4, 严: 20,
  平: 5, 天: 4, 元: 4, 云: 12, 中: 4, 心: 4, 世: 5, 东: 8, 义: 13, 乐: 15,
};

/** 五格剖象计算（单姓 + 一至二字名；笔画按康熙口径由调用方给出）。
 *  全部纯函数：格数只由笔画相加构成，不含任何随机与预测。 */
export function zhouyiWuge(surname: number, given: number[]): {
  tian: number; ren: number; di: number; wai: number; zong: number;
} {
  const s = Math.max(1, Math.floor(surname));
  const g = given.map((n) => Math.max(1, Math.floor(n)));
  const zong = s + g.reduce((a, b) => a + b, 0);
  const ren = s + (g[0] ?? 1);
  const di = g.length ? g.reduce((a, b) => a + b, 0) : 1;
  const tian = s + 1;
  const wai = Math.max(1, zong - ren + (g.length >= 2 ? 1 : 1));
  return { tian, ren, di, wai, zong };
}
