// 周易测算纯函数库 —— 推演主流程 runDivination。
// ★ 全部纯函数、离线、无 IO；随机一律 seed + mulberry32（同 seed 必得同结果）；
//   断语 verdict 只查 ZHOUYI_RULE_TABLE 白名单（按 id 查找），绝不生成新的预测文本；
//   简化算法均在步骤 note 中注明「简化口径」。

import type {
  ZhouyiTrigram, ZhouyiBlock, ZhouyiSourceRef, DivinationMethod, DivinationSpec,
  DivinationStep, DivinationCanonRef, DivinationVerdict, DivinationResult,
} from './types';
import {
  ZHOUYI_TRIGRAM_INFO, ZHOUYI_XIANTIAN_TRIGRAM, zhouyiHexagramName, zhouyiTrigramsOfLines,
  zhouyiSheng, zhouyiKe, ZHOUYI_TIANGAN, ZHOUYI_DIZHI, ZHOUYI_DIZHI_CANGGAN,
  ZHOUYI_NAJIA, ZHOUYI_LIUSHEN_ORDER, ZHOUYI_LIUSHEN_START,
  ZHOUYI_BAZHAI_MINGGUA, ZHOUYI_DONGSI, ZHOUYI_XISI, ZHOUYI_DAYOUNIAN,
  ZHOUYI_HOUTIAN_CLOCKWISE, ZHOUYI_YOUXING_NAMES, ZHOUYI_LUOSHU_TRAJECTORY, ZHOUYI_LUOSHU_GRID,
  ZHOUYI_JIANCHU_ORDER, ZHOUYI_WUHUDUN, ZHOUYI_WUSHUDUN, ZHOUYI_MONTH_ZHI,
} from './tables';
import { ZHOUYI_RULE_TABLE } from './rules';
import { ZHOUYI_CEZI_STROKES, ZHOUYI_DREAM_TABLE, zhouyiDreamMatch, ZHOUYI_XINGMING_NOTE, ZHOUYI_XINGMING_BIHUA, zhouyiWuge } from './misc';

type Wx = '金'|'木'|'水'|'火'|'土';
type Lines = Array<0|1>;

/** 固定免责声明（所有方法一致） */
const DISCLAIMER = '民俗文化体验 · 教学演示：推演为古籍规则口径的简化展示，不构成任何现实建议。';

/** mulberry32 伪随机数生成器（内部使用，不导出避免命名冲突）：同 seed 必得同序列 */
function mulberry32(seed:number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 从白名单表取断语（唯一合法途径） */
function ruleById(id:string): DivinationVerdict | undefined {
  const e = ZHOUYI_RULE_TABLE.find((r) => r.id === id);
  return e && { label:e.label, quote:e.quote, sourceRef:e.sourceRef, plain:e.plain, paraphrase:e.paraphrase };
}

/**
 * 事类 → 断语映射（配合事类词库 input.caseId）。
 * 键 = cases.ts 的 ZhouyiCaseEntry.id；值 = 各占法对应的白名单断语 id。
 * export 供契约测试钉住「映射 id 必在白名单、白名单 case 条目必被引用」双闸。
 */
export const ZHOUYI_CASE_RULE_IDS: Record<string, Partial<Record<DivinationMethod, string>>> = {
  case_yixi: { liuyao:'zhouyi-liuyao-case-yixi', zari:'zhouyi-zari-case-yixi' },
  case_hunyin: { liuyao:'zhouyi-liuyao-case-hunyin' },
  case_jiaqu: { liuyao:'zhouyi-liuyao-case-hunyin', zari:'zhouyi-zari-case-jiaqu' },
  case_nacai: { liuyao:'zhouyi-liuyao-case-hunyin' },
  case_dingmeng: { liuyao:'zhouyi-liuyao-case-hunyin' },
  case_qiucai: { liuyao:'zhouyi-liuyao-case-qiucai' },
  case_gongming: { liuyao:'zhouyi-liuyao-case-gongming' },
  case_keju: { liuyao:'zhouyi-liuyao-case-keju' },
  case_shihuan: { liuyao:'zhouyi-liuyao-case-gongming' },
  case_jibing: { liuyao:'zhouyi-liuyao-case-jibing' },
  case_qiuyi: { liuyao:'zhouyi-liuyao-case-jibing' },
  case_shiwu: { liuyao:'zhouyi-liuyao-case-shiwu' },
  case_cisong: { liuyao:'zhouyi-liuyao-case-cisong' },
  case_chuxing: { liuyao:'zhouyi-liuyao-case-chuxing' },
  case_xingren: { liuyao:'zhouyi-liuyao-case-chuxing' },
  case_taiyun: { liuyao:'zhouyi-liuyao-case-taiyun' },
  case_qiusi: { liuyao:'zhouyi-liuyao-case-taiyun' },
  case_jiazhai: { liuyao:'zhouyi-liuyao-case-jiazhai' },
  case_ruzhai: { liuyao:'zhouyi-liuyao-case-jiazhai' },
  case_kaishi: { liuyao:'zhouyi-liuyao-case-qiucai', zari:'zhouyi-zari-case-kaishi' },
};

/** 事类断语分派：input.caseId 命中映射且当前占法有事类口径时返回断语 id；未传/未命中返回 undefined（走各法默认断语）。 */
function caseRuleId(spec:DivinationSpec): string | undefined {
  const cid = typeof spec.input.caseId === 'string' ? spec.input.caseId : '';
  return cid ? ZHOUYI_CASE_RULE_IDS[cid]?.[spec.method] : undefined;
}

// ★ 输入读取（健壮性契约）：传 fallback 时非法输入退默认值（UI 层有前置校验，shared 层兜底不炸）；
//   不传 fallback 时 throw（编程错误应尽早暴露）。
const num = (input:Record<string,string|number>, key:string, fallback?:number): number => {
  const v = input[key];
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`input.${key} 缺失或不是数字`);
  }
  return n;
};
const str = (input:Record<string,string|number>, key:string, fallback?:string): string => {
  const v = input[key];
  if (typeof v !== 'string' || !v) {
    if (fallback !== undefined) return fallback;
    throw new Error(`input.${key} 缺失或不是字符串`);
  }
  return v;
};
// 范围清洗：粘连/越界的数字（如把整串生日塞进 year）退默认值，避免把原始输入回显进结果（隐私契约）
const clampNum = (n:number, lo:number, hi:number, dflt:number): number =>
  Number.isFinite(n) && n >= lo && n <= hi ? n : dflt;

const ganYinyang = (g:string): '阳'|'阴' => ZHOUYI_TIANGAN.find((x) => x.gan === g)!.yinyang;
const ganWx = (g:string): Wx => ZHOUYI_TIANGAN.find((x) => x.gan === g)!.wuxing;
const zhiIdx = (z:string): number => ZHOUYI_DIZHI.findIndex((x) => x.zhi === z);
const zhiWx = (z:string): Wx => ZHOUYI_DIZHI[zhiIdx(z)].wuxing;

/** 儒略日数（公历，格里历）；用于日柱推算（简化口径：只支持格里历日期，未处理 1582 年前儒略历差异） */
function julianDayNumber(year:number, month:number, day:number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}
/** 日干支（锚点：2000-01-07 = 甲子日；简化口径：格里历公式） */
function dayGanzhi(year:number, month:number, day:number): string {
  const idx = ((julianDayNumber(year, month, day) - julianDayNumber(2000, 1, 7)) % 60 + 60) % 60;
  return ZHOUYI_TIANGAN[idx % 10].gan + ZHOUYI_DIZHI[idx % 12].zhi;
}

/** 由天干序与地支序组合干支（用于月柱/时柱推算：遁诀给出干序、支序独立推进） */
const ganzhiFrom = (ganIdx:number, zhiIdx:number): string =>
  ZHOUYI_TIANGAN[((ganIdx % 10) + 10) % 10].gan + ZHOUYI_DIZHI[((zhiIdx % 12) + 12) % 12].zhi;

/** 六十甲子干支 by index */
const jiazi = (idx:number): string => ZHOUYI_TIANGAN[idx % 10].gan + ZHOUYI_DIZHI[idx % 12].zhi;

/** 十神：以日干为「我」，对其他天干的十神名（简化口径：按天干阴阳同异 + 五行生克） */
function shiShen(me:string, other:string): string {
  const same = ganYinyang(me) === ganYinyang(other);
  const w = ganWx(me), o = ganWx(other);
  if (w === o) return same ? '比肩' : '劫财';
  if (zhouyiSheng(w, o)) return same ? '食神' : '伤官';
  if (zhouyiSheng(o, w)) return same ? '偏印' : '正印';
  if (zhouyiKe(w, o)) return same ? '偏财' : '正财';
  return same ? '七杀' : '正官'; // 克我者
}

// —— 公用文献出处 ——
const SR_MEIHUA: ZhouyiSourceRef = { work:'梅花易数', author:'邵雍（旧题）', dynasty:'宋', juan:'卷二·占卜总诀', license:'公版' };
const SR_XICI: ZhouyiSourceRef = { work:'周易·系辞上', author:'佚名', dynasty:'先秦', license:'公版' };
const SR_BUSHI: ZhouyiSourceRef = { work:'卜筮正宗', author:'王洪绪 辑', dynasty:'清', juan:'卷首·纳甲装卦歌', license:'公版' };
const SR_YUANHAI: ZhouyiSourceRef = { work:'渊海子平', author:'徐子平（旧题）', dynasty:'宋', juan:'卷一', license:'公版' };
const SR_BAZHAI: ZhouyiSourceRef = { work:'八宅明镜', author:'箬冠道人（旧题）', dynasty:'清', juan:'卷上', license:'公版' };
const SR_SHENSHI: ZhouyiSourceRef = { work:'沈氏玄空学', author:'沈竹礽', dynasty:'清', juan:'卷一', license:'公版' };
const SR_HONGFAN: ZhouyiSourceRef = { work:'尚书·洪范', author:'佚名', dynasty:'先秦', license:'公版' };
const SR_XIEJI: ZhouyiSourceRef = { work:'钦定协纪辨方书', author:'允禄 等奉敕撰', dynasty:'清', juan:'卷十一', license:'公版' };

const JINAN: DivinationCanonRef['interpretations'][number] = {
  kind:'今按', school:'本教程编者按', dynasty:'今',
  text:'编者按：古籍原文均逐条核对出处，记不准者一律标注「大意转述」；推演为教学演示的简化口径，不代表任何流派的完整断法。',
  plain:'说明本教程对古籍引用与简化口径的处理原则。',
};

// ==================== 各法实现 ====================

/** 八宫世应表：卦画 key → { 宫, 世爻下标 }。按八宫次序（本宫→五世→游魂→归魂）程序化生成。
 *  起例出处：《卜筮正宗》卷一·八宫卦次（清·王洪绪 辑，公版） */
const flipLines = (l:Lines, idxs:number[]): Lines => l.map((v, i) => (idxs.includes(i) ? (v ? 0 : 1) : v)) as Lines;
const PALACE_MAP: Map<string, { palace:ZhouyiTrigram; shiIdx:number; guang:string }> = (() => {
  const m = new Map<string, { palace:ZhouyiTrigram; shiIdx:number; guang:string }>();
  for (const g of Object.keys(ZHOUYI_TRIGRAM_INFO) as ZhouyiTrigram[]) {
    const t = ZHOUYI_TRIGRAM_INFO[g].lines;
    const pure: Lines = [...t, ...t]; // 纯卦 = 上卦下卦相同（六爻）
    const seq: Array<{ lines:Lines; shiIdx:number; guang:string }> = [
      { lines:pure, shiIdx:5, guang:'本宫' },
      { lines:flipLines(pure, [0]), shiIdx:0, guang:'一世' },
      { lines:flipLines(pure, [0, 1]), shiIdx:1, guang:'二世' },
      { lines:flipLines(pure, [0, 1, 2]), shiIdx:2, guang:'三世' },
      { lines:flipLines(pure, [0, 1, 2, 3]), shiIdx:3, guang:'四世' },
      { lines:flipLines(pure, [0, 1, 2, 3, 4]), shiIdx:4, guang:'五世' },
      { lines:flipLines(pure, [0, 1, 2, 4]), shiIdx:3, guang:'游魂' },   // 五世再变四爻
      { lines:flipLines(pure, [4]), shiIdx:2, guang:'归魂' },            // 游魂恢复内卦
    ];
    for (const s of seq) m.set(s.lines.join(''), { palace:g, shiIdx:s.shiIdx, guang:s.guang });
  }
  return m;
})();

/** 梅花易数 · 年月日时起卦（简化口径：按传入数值直接取模；传统用农历年支数/月数/日数与时辰数） */
function divMeihua(spec:DivinationSpec): DivinationResult {
  const { year, month, day, hour } = spec.input;
  const y = clampNum(num(spec.input, 'year', 2000), 1, 9999, 2000), m = clampNum(num(spec.input, 'month', 1), 1, 12, 1), d = clampNum(num(spec.input, 'day', 1), 1, 31, 1), h = clampNum(num(spec.input, 'hour', 12), 0, 23, 12);
  const n1 = (y + m + d) % 8 === 0 ? 8 : (y + m + d) % 8;
  const n2 = (y + m + d + h) % 8 === 0 ? 8 : (y + m + d + h) % 8;
  const moving = (y + m + d + h) % 6 === 0 ? 6 : (y + m + d + h) % 6;
  const upper = ZHOUYI_XIANTIAN_TRIGRAM[n1], lower = ZHOUYI_XIANTIAN_TRIGRAM[n2];
  const lines: Lines = [...ZHOUYI_TRIGRAM_INFO[lower].lines, ...ZHOUYI_TRIGRAM_INFO[upper].lines];
  const hu: Lines = [lines[1], lines[2], lines[3], lines[2], lines[3], lines[4]];
  const bian: Lines = lines.map((v, i) => (i === moving - 1 ? (v ? 0 : 1) : v));
  const name = zhouyiHexagramName(upper, lower);
  const huName = zhouyiHexagramName(zhouyiTrigramsOfLines(hu).upper, zhouyiTrigramsOfLines(hu).lower);
  const bianName = zhouyiHexagramName(zhouyiTrigramsOfLines(bian).upper, zhouyiTrigramsOfLines(bian).lower);
  // 动爻所在卦为用、另一卦为体
  const tiTri: ZhouyiTrigram = moving <= 3 ? upper : lower;
  const yongTri: ZhouyiTrigram = moving <= 3 ? lower : upper;
  const tiWx = ZHOUYI_TRIGRAM_INFO[tiTri].wuxing, yongWx = ZHOUYI_TRIGRAM_INFO[yongTri].wuxing;
  let rel:string, verdictId:string;
  if (yongWx === tiWx) { rel = '体用比和'; verdictId = 'zhouyi-meihua-bihe'; }
  else if (zhouyiSheng(yongWx, tiWx)) { rel = '用生体'; verdictId = 'zhouyi-meihua-yong-sheng-ti'; }
  else if (zhouyiSheng(tiWx, yongWx)) { rel = '体生用'; verdictId = 'zhouyi-meihua-ti-sheng-yong'; }
  else if (zhouyiKe(yongWx, tiWx)) { rel = '用克体'; verdictId = 'zhouyi-meihua-yong-ke-ti'; }
  else { rel = '体克用'; verdictId = 'zhouyi-meihua-ti-ke-yong'; }
  const steps: DivinationStep[] = [
    { rule:'先天数起上卦', sourceRef:SR_MEIHUA, input:`${year}年${month}月${day}日`, output:`(${y}+${m}+${d}) mod 8 = ${n1}，先天数得${upper}卦（${upper}）`, note:'简化口径：按传入数值直接取模；传统以农历年支数、月数、日数计。', diagram:{ kind:'hexagram', lines:[...ZHOUYI_TRIGRAM_INFO[upper].lines], caption:`上卦 ${upper}` } },
    { rule:'先天数起下卦', sourceRef:SR_MEIHUA, input:`加时数 ${h}`, output:`(${y}+${m}+${d}+${h}) mod 8 = ${n2}，得${lower}卦（${lower}）`, note:'同上简化口径。', diagram:{ kind:'hexagram', lines:[...ZHOUYI_TRIGRAM_INFO[lower].lines], caption:`下卦 ${lower}` } },
    { rule:'取动爻', sourceRef:SR_MEIHUA, input:'总数取模', output:`(${y}+${m}+${d}+${h}) mod 6 = ${moving}（余 0 作 6），第 ${moving} 爻动（自下而上）`, note:'动爻所在之卦为用卦，另一卦为体卦。' },
    { rule:'排互卦', sourceRef:SR_MEIHUA, input:'本卦二三四爻为下互、三四五爻为上互', output:`互卦：${huName}`, note:'互卦示事之中间过程（简化口径：取爻规则为通行口径）。' },
    { rule:'排变卦', sourceRef:SR_MEIHUA, input:`第 ${moving} 爻取反`, output:`变卦：${bianName}`, note:'变卦示事之终局（简化口径：仅动爻取反）。' },
    { rule:'体用生克', sourceRef:SR_MEIHUA, input:`体=${tiTri}（${tiWx}），用=${yongTri}（${yongWx}）`, output:`${rel}`, note:'依《梅花易数》卷二「占卜总诀」体用口径断吉凶，断语只取白名单规则表。' },
  ];
  return {
    method:'meihua',
    summary:`${y}年${m}月${d}日${h}时起卦（简化口径）：得${name}（上${upper}下${lower}），第 ${moving} 爻动，互卦${huName}、变卦${bianName}；体${tiTri}（${tiWx}）、用${yongTri}（${yongWx}），关系为「${rel}」。`,
    steps,
    diagrams:[
      { kind:'hexagram', lines, moving, caption:`本卦 ${name}（第 ${moving} 爻动）` },
      { kind:'hexagram', lines:hu, caption:`互卦 ${huName}` },
      { kind:'hexagram', lines:bian, caption:`变卦 ${bianName}` },
    ],
    canonRefs:[
      { title:'梅花易数·卷二·占卜总诀（体用生克）',
        text:'「体用即动静之说，体为主，用为事应。用生体及比和则吉，体生用及克体则不吉。」',
        plain:'体卦为主、用卦为事应；用生体或比和为吉，体生用或克体为不吉。',
        annotations:[
          { term:'体用', pinyin:'tǐ yòng', gloss:'动爻所在之卦为用卦，另一卦为体卦；体为主，用为事应', type:'术语' },
          { term:'比和', gloss:'体卦与用卦五行相同', type:'术语' },
        ],
        interpretations:[
          { kind:'今按', school:'本教程编者按', dynasty:'今', text:'《梅花易数》旧题邵雍撰，实为后人编纂托名；此句为卷二「占卜总诀」之通行引文，诸本文字大同小异。', paraphrase:true, plain:'说明成书与引文来源，提示诸本差异。' },
          JINAN,
        ] },
    ],
    verdict:ruleById(caseRuleId(spec) ?? verdictId),
    disclaimer:DISCLAIMER,
    refLessonId:spec.refLessonId,
  };
}

/** 大衍筮法（简化模拟：按传统概率分布由 seed 生成六爻，非全部分二挂一揲四流程） */
function divDayan(spec:DivinationSpec): DivinationResult {
  const seed = typeof spec.seed === 'number' ? spec.seed : 20260101;
  const rng = mulberry32(seed);
  const values: number[] = []; // 爻值：6 老阴 7 少阳 8 少阴 9 老阳
  for (let i = 0; i < 6; i++) {
    const r = rng();
    // 传统概率：老阴 1/16、少阳 5/16、少阴 7/16、老阳 3/16（简化口径：直接按分布抽样）
    values.push(r < 1 / 16 ? 6 : r < 6 / 16 ? 7 : r < 13 / 16 ? 8 : 9);
  }
  const lines: Lines = values.map((v) => (v === 6 || v === 8 ? 0 : 1));
  const movingIdxs = values.map((v, i) => (v === 6 || v === 9 ? i + 1 : 0)).filter(Boolean);
  const bian: Lines = lines.map((v, i) => (movingIdxs.includes(i + 1) ? (v ? 0 : 1) : v));
  const tri = zhouyiTrigramsOfLines(lines), triB = zhouyiTrigramsOfLines(bian);
  const name = zhouyiHexagramName(tri.upper, tri.lower);
  const bianName = zhouyiHexagramName(triB.upper, triB.lower);
  const valueName = (v:number): string => ({ 6:'老阴（动）', 7:'少阳', 8:'少阴', 9:'老阳（动）' }[v] as string);
  const steps: DivinationStep[] = [
    { rule:'大衍之数', sourceRef:SR_XICI, input:'五十根蓍草', output:'其用四十有九', note:'《系辞上》原文口径；本实现为简化模拟，非全部分二挂一揲四流程。' },
    { rule:'三变成爻（简化模拟）', sourceRef:SR_XICI, input:`seed=${seed} 伪随机抽样（mulberry32）`, output:values.map((v, i) => `第${i + 1}爻：${valueName(v)}`).join('，'), note:'简化口径：按传统概率分布（老阴 1/16、少阳 5/16、少阴 7/16、老阳 3/16）直接抽样，同 seed 必得同卦。' },
    { rule:'六画成卦', sourceRef:SR_XICI, input:'自下而上六爻', output:`本卦：${name}`, diagram:{ kind:'hexagram', lines, moving:movingIdxs[0], caption:`本卦 ${name}` } },
    { rule:'动爻与变卦', sourceRef:SR_XICI, input:movingIdxs.length ? `动爻：第 ${movingIdxs.join('、')} 爻` : '无动爻', output:movingIdxs.length ? `变卦：${bianName}` : '静卦（无变卦）', note:'老阳（9）、老阴（6）为动爻，变出之卦示事之终（通行口径转述）。', diagram:{ kind:'hexagram', lines:bian, caption:movingIdxs.length ? `变卦 ${bianName}` : '静卦' } },
  ];
  return {
    method:'dayan',
    summary:`大衍筮法（简化模拟，seed=${seed}）：得本卦${name}${movingIdxs.length ? `，第 ${movingIdxs.join('、')} 爻动（${movingIdxs.map((i) => valueName(values[i - 1])).join('、')}）` : '，六爻安静'}，变卦${bianName}。`,
    steps,
    diagrams:[
      { kind:'hexagram', lines, moving:movingIdxs[0], caption:`本卦 ${name}` },
      { kind:'hexagram', lines:bian, caption:movingIdxs.length ? `变卦 ${bianName}` : '静卦' },
    ],
    canonRefs:[
      { title:'周易·系辞上（大衍之数）',
        text:'「大衍之数五十，其用四十有九。」',
        plain:'筮法用五十根蓍草，实际使用四十九根。',
        annotations:[
          { term:'大衍', pinyin:'dà yǎn', gloss:'大演、大推演，指蓍草占筮之法', type:'术语' },
          { term:'其用四十有九', gloss:'五十枚蓍草中取一枚不用，实用四十九枚', type:'术语' },
        ],
        interpretations:[
          { school:'朱熹（周易本义，大意转述）', dynasty:'宋', text:'朱熹以为四十九数分二、挂一、揲四、归奇，三变成一爻，十有八变而成卦。', paraphrase:true, plain:'朱熹对蓍法分二挂一揲四流程的说明（转述）。' },
          { kind:'今按', school:'本教程编者按', dynasty:'今', text:'本实现按传统概率分布直接抽样成爻，是简化模拟，非全部分二挂一揲四流程；同 seed 结果恒定。', paraphrase:true, plain:'明确本实现与古法的差异（简化口径）。' },
          JINAN,
        ] },
    ],
    verdict:ruleById('zhouyi-dayan-guanbian'),
    disclaimer:DISCLAIMER,
    refLessonId:spec.refLessonId,
  };
}

/** 六爻纳甲装卦（铜钱摇卦：背数口径 + 纳甲六亲世应六神，简化口径见步骤 note） */
function divLiuyao(spec:DivinationSpec): DivinationResult {
  const seed = typeof spec.seed === 'number' ? spec.seed : 20260202;
  // 背数来源（简化口径，三选一）：
  // 1) input.coins 为 6 位数字串：每爻背面数 0–3（0=交·老阴动，1=单·少阳，2=拆·少阴，3=重·老阳动）
  // 2) input.coins 为 18 位「背/字」串：每 3 枚一组计背数（标准铜钱口径）
  // 3) input.coins 为 6 位「背/字」简记串：'背' 记作三背（重·老阳动）、'字' 记作三字（交·老阴动）
  // 4) 无 coins 时由 seed 模拟掷铜钱（每枚公平，背数 3/2/1/0 概率 1/8、3/8、3/8、1/8）
  let backs:number[];
  const coinsRaw = typeof spec.input.coins === 'string' ? spec.input.coins : '';
  if (coinsRaw) {
    if (/^[0-3]{6}$/.test(coinsRaw)) backs = coinsRaw.split('').map(Number);
    else if (/^[背字]{18}$/.test(coinsRaw)) {
      backs = [0, 1, 2, 3, 4, 5].map((i) => coinsRaw.slice(i * 3, i * 3 + 3).split('').filter((c) => c === '背').length);
    } else if (/^[背字]{6}$/.test(coinsRaw)) {
      backs = coinsRaw.split('').map((c) => (c === '背' ? 3 : 0));
    } else {
      // 非法 coins 退 seed 模拟（健壮性契约：不炸，按无输入口径走）
      const rng = mulberry32(seed);
      backs = [0, 0, 0, 0, 0, 0].map(() => {
        const r = rng();
        return r < 1 / 8 ? 3 : r < 4 / 8 ? 2 : r < 7 / 8 ? 1 : 0;
      });
    }
  } else {
    const rng = mulberry32(seed);
    backs = [0, 0, 0, 0, 0, 0].map(() => {
      const r = rng();
      return r < 1 / 8 ? 3 : r < 4 / 8 ? 2 : r < 7 / 8 ? 1 : 0;
    });
  }
  const backName = (n:number): string => ({ 3:'三背（重·老阳动）', 2:'两背（拆·少阴）', 1:'单背（单·少阳）', 0:'三字（交·老阴动）' }[n] as string);
  const lines: Lines = backs.map((n) => (n === 3 || n === 1 ? 1 : 0));
  const movingIdxs = backs.map((n, i) => (n === 3 || n === 0 ? i + 1 : 0)).filter(Boolean);
  const bian: Lines = lines.map((v, i) => (movingIdxs.includes(i + 1) ? (v ? 0 : 1) : v));
  const tri = zhouyiTrigramsOfLines(lines), triB = zhouyiTrigramsOfLines(bian);
  const name = zhouyiHexagramName(tri.upper, tri.lower);
  const bianName = zhouyiHexagramName(triB.upper, triB.lower);
  // 寻宫（变爻回推之标准算法的程序化实现：PALACE_MAP 由八宫次序生成）
  const p = PALACE_MAP.get(lines.join(''))!;
  const wo = ZHOUYI_TRIGRAM_INFO[p.palace].wuxing;
  const liuqinOf = (o:Wx): string => {
    if (o === wo) return '兄弟';
    if (zhouyiSheng(wo, o)) return '子孙';
    if (zhouyiSheng(o, wo)) return '父母';
    if (zhouyiKe(wo, o)) return '妻财';
    return '官鬼';
  };
  // 装纳甲干支与六亲、六神
  const dayGan = typeof spec.input.dayGan === 'string' && ZHOUYI_TIANGAN.some((x) => x.gan === spec.input.dayGan)
    ? spec.input.dayGan
    : ZHOUYI_TIANGAN[Math.floor(mulberry32(seed + 1)() * 10)].gan;
  const liushenStart = ZHOUYI_LIUSHEN_START[dayGan];
  const rows: string[][] = [];
  for (let i = 0; i < 6; i++) {
    const isNei = i < 3;
    const trii: ZhouyiTrigram = isNei ? tri.lower : tri.upper;
    const nj = ZHOUYI_NAJIA[trii];
    const gan = isNei ? nj.ganNei : nj.ganWai;
    const zhi = isNei ? nj.zhiNei[i] : nj.zhiWai[i - 3];
    const role = i === p.shiIdx ? '世' : i === (p.shiIdx + 3) % 6 ? '应' : '';
    rows.push([
      `第${i + 1}爻`, ZHOUYI_LIUSHEN_ORDER[(liushenStart + i) % 6],
      `${gan}${zhi}`, liuqinOf(zhiWx(zhi)), role || '—',
      movingIdxs.includes(i + 1) ? '动' : '',
    ]);
  }
  const steps: DivinationStep[] = [
    { rule:'掷钱成卦', sourceRef:SR_BUSHI, input:coinsRaw ? `coins=${coinsRaw}` : `seed=${seed}（伪随机模拟三枚铜钱 × 6 次）`, output:backs.map((n, i) => `第${i + 1}爻${backName(n)}`).join('，') + `；本卦：${name}`, note:'通行口径：单背=少阳、双背=少阴、三背=老阳（动）、三字=老阴（动）；coins 简记与 seed 模拟为简化口径。', diagram:{ kind:'hexagram', lines, moving:movingIdxs[0], caption:`本卦 ${name}` } },
    { rule:'寻宫定世应', sourceRef:SR_BUSHI, input:'变爻回推寻宫（标准算法）', output:`${name}属${p.palace}宫（${p.guang}卦），世在第 ${p.shiIdx + 1} 爻，应在第 ${((p.shiIdx + 3) % 6) + 1} 爻`, note:'世应起例依《卜筮正宗》八宫次序（转述，见规则表 zhouyi-liuyao-shiying）。' },
    { rule:'装纳甲与六亲', sourceRef:SR_BUSHI, input:`${p.palace}宫五行为「我」（${wo}）`, output:rows.map((r) => `${r[0]}${r[4] !== '—' ? `(${r[4]})` : ''}${r[2]} ${r[3]}`).join('，'), note:'纳甲干支依京房纳甲系统（《京氏易传》/《卜筮正宗》卷首口径）；六亲以本卦宫五行为「我」：生我者父母、我生者子孙、克我者官鬼、我克者妻财、比和者兄弟。', diagram:{ kind:'table', head:['爻序', '六神', '纳甲', '六亲', '世应', '动爻'], rows } },
    { rule:'起六神', sourceRef:SR_BUSHI, input:`${dayGan}日${typeof spec.input.dayGan === 'string' ? '' : '（无 dayGan 输入，由 seed 派生——简化口径）'}`, output:`自初爻起：${rows.map((r) => r[1]).join('→')}`, note:'六神起例：甲乙起青龙、丙丁起朱雀、戊起勾陈、己起螣蛇、庚辛起白虎、壬癸起玄武，自初爻顺行（转述）。' },
    { rule:'动爻与变卦', sourceRef:SR_BUSHI, input:movingIdxs.length ? `动爻：第 ${movingIdxs.join('、')} 爻` : '无动爻', output:movingIdxs.length ? `变卦：${bianName}` : '静卦（无变卦）', note:'老阳老阴动而变（简化口径：变卦仅列卦名与卦画，不重装纳甲）。', diagram:{ kind:'hexagram', lines:bian, caption:movingIdxs.length ? `变卦 ${bianName}` : '静卦' } },
  ];
  return {
    method:'liuyao',
    summary:`六爻装卦（${coinsRaw ? '按 coins 输入' : `seed=${seed} 模拟`}）：得本卦${name}（${p.palace}宫${p.guang}卦），${movingIdxs.length ? `第 ${movingIdxs.join('、')} 爻动，` : '六爻安静，'}世在第 ${p.shiIdx + 1} 爻，已装纳甲六亲六神，${movingIdxs.length ? `变卦${bianName}` : '无变卦'}。`,
    steps,
    diagrams:[
      { kind:'hexagram', lines, moving:movingIdxs[0], caption:`本卦 ${name}` },
      { kind:'table', head:['爻序', '六神', '纳甲', '六亲', '世应', '动爻'], rows },
      { kind:'hexagram', lines:bian, caption:movingIdxs.length ? `变卦 ${bianName}` : '静卦' },
    ],
    canonRefs:[
      { title:'卜筮正宗·卷首·纳甲装卦歌（大意转述）',
        text:'纳甲歌将八卦配天干地支：乾纳甲壬、坎纳戊、艮纳丙、震纳庚、巽纳辛、离纳己、坤纳乙癸、兑纳丁；纳支自下而上依内外卦而定，再以本卦宫五行定六亲、以世应定主客（大意转述）。',
        plain:'纳甲干支配卦的通行口径（转述），见于《京氏易传》系统与《卜筮正宗》卷首。',
        annotations:[
          { term:'纳甲', pinyin:'nà jiǎ', gloss:'将天干（甲乙丙丁……）依歌诀配入八卦六爻，再配地支成干支', type:'术语' },
          { term:'六亲', gloss:'以本卦宫五行为「我」：生我者父母、我生者子孙、克我者官鬼、我克者妻财、比和者兄弟', type:'术语' },
          { term:'世应', gloss:'一卦之主爻为世，与世隔三位为应', type:'术语' },
        ],
        interpretations:[
          { school:'王洪绪（卜筮正宗，大意转述）', dynasty:'清', text:'王洪绪辑装卦诸歌于卷首，纳甲、六亲、世应、六神各有起例，诸本大同。', paraphrase:true, plain:'说明装卦诸法出处与体例（转述）。' },
          { kind:'今按', school:'本教程编者按', dynasty:'今', text:'本实现寻宫采用「变爻回推」标准算法的程序化生成（八宫次序表），coins 简记与 seed 派生日干为简化口径。', paraphrase:true, plain:'说明实现方式与简化口径。' },
          JINAN,
        ] },
    ],
    verdict:ruleById(caseRuleId(spec) ?? 'zhouyi-liuyao-najia'),
    disclaimer:DISCLAIMER,
    refLessonId:spec.refLessonId,
  };
}

/** 四柱排盘（简化口径：立春按 2 月 4 日近似分界、月支按公历月近似、未按节气精确时刻） */
function divSizhu(spec:DivinationSpec): DivinationResult {
  const y = clampNum(num(spec.input, 'year', 2000), 1, 9999, 2000), m = clampNum(num(spec.input, 'month', 1), 1, 12, 1), d = clampNum(num(spec.input, 'day', 1), 1, 31, 1), h = clampNum(num(spec.input, 'hour', 12), 0, 23, 12);
  // 年柱：立春 2 月 4 日近似分界
  const yGzYear = m < 2 || (m === 2 && d < 4) ? y - 1 : y;
  const yearPillar = zhouyiYearGanzhiInner(yGzYear);
  // 月柱：公历月近似节气月支 + 五虎遁
  const monthZhi = ZHOUYI_MONTH_ZHI[m];
  const monthStartGan = ZHOUYI_WUHUDUN[yearPillar[0]];
  const monthOffset = (zhiIdx(monthZhi) - 2 + 12) % 12; // 寅月为第 0 月
  const monthPillar = ganzhiFrom(monthStartGan + monthOffset, 2 + monthOffset);
  // 日柱：儒略日数 + 锚点 2000-01-07 = 甲子日
  const dayPillar = dayGanzhi(y, m, d);
  // 时柱：时支 + 五鼠遁（23:00-0:59 子时……）
  const hourZhiIdx = Math.floor(((h % 24) + 1) % 24 / 2);
  const hourZhi = ZHOUYI_DIZHI[hourZhiIdx].zhi;
  const hourStartGan = ZHOUYI_WUSHUDUN[dayPillar[0]];
  const hourPillar = ganzhiFrom(hourStartGan + hourZhiIdx, hourZhiIdx);
  // 十神（以日干为我）与五行分布（简化口径：天干取本字、地支取本气藏干）
  const me = dayPillar[0];
  const pillars = [
    { name:'年柱', gz:yearPillar }, { name:'月柱', gz:monthPillar },
    { name:'日柱', gz:dayPillar }, { name:'时柱', gz:hourPillar },
  ];
  const rows = pillars.map((p) => {
    const zhi = p.gz[1];
    const shi = p.name === '日柱' ? '日主（我）' : shiShen(me, p.gz[0]);
    const zhiShi = p.name === '日柱' ? '日主' : shiShen(me, ZHOUYI_DIZHI_CANGGAN[zhi]);
    return [p.name, p.gz[0], shi, zhi, `${zhi}（藏${ZHOUYI_DIZHI_CANGGAN[zhi]}）`, zhiShi];
  });
  const count: Record<Wx, number> = { 金:0, 木:0, 水:0, 火:0, 土:0 };
  for (const p of pillars) {
    count[ganWx(p.gz[0])]++;
    count[zhiWx(p.gz[1])]++;
  }
  const dist = (Object.keys(count) as Wx[]).map((k) => `${k}${count[k]}`).join(' ');
  const steps: DivinationStep[] = [
    { rule:'定年柱', sourceRef:SR_YUANHAI, input:`公历 ${y} 年 ${m} 月 ${d} 日`, output:`${yGzYear} 年 → 年柱 ${yearPillar}`, note:'简化口径：按立春 2 月 4 日近似分界，未按精确节气时刻；1984 年 = 甲子年。' },
    { rule:'定月柱', sourceRef:SR_YUANHAI, input:`${m} 月 → 近似月建 ${monthZhi}`, output:`五虎遁（${yearPillar[0]} 年干起）：月柱 ${monthPillar}`, note:'简化口径：按公历月近似节气月支；年上起月用五虎遁（甲己之年丙作首……）。' },
    { rule:'定日柱', sourceRef:SR_YUANHAI, input:`公历 ${y}-${m}-${d}`, output:`儒略日数推算：日柱 ${dayPillar}`, note:'简化口径：格里历儒略日数公式 + 锚点「2000-01-07 = 甲子日」。' },
    { rule:'定时柱', sourceRef:SR_YUANHAI, input:`${h} 点 → 时支 ${hourZhi}`, output:`五鼠遁（${dayPillar[0]} 日干起）：时柱 ${hourPillar}`, note:'简化口径：按整小时入时辰（23-0 子时、1-2 丑时……）；日上起时用五鼠遁（甲己还加甲……）。' },
    { rule:'排十神与五行', sourceRef:SR_YUANHAI, input:`日干 ${me} 为「我」`, output:`五行分布（8 字）：${dist}`, note:'简化口径：十神按天干阴阳同异 + 五行生克；地支只取本气藏干；论命体系诸书各异，此处仅作排盘文献展示。', diagram:{ kind:'table', head:['柱', '天干', '十神', '地支', '藏干（本气）', '支十神'], rows } },
  ];
  return {
    method:'sizhu',
    summary:`四柱排盘（简化口径）：年柱${yearPillar}、月柱${monthPillar}、日柱${dayPillar}、时柱${hourPillar}，日干${me}为我，五行分布 ${dist}。`,
    steps,
    diagrams:[
      { kind:'table', head:['柱', '天干', '十神', '地支', '藏干（本气）', '支十神'], rows },
      { kind:'wuxing', mode:'生' },
    ],
    canonRefs:[
      { title:'渊海子平·卷一（五虎遁、五鼠遁）',
        text:'「甲己之年丙作首，乙庚之岁戊为头。丙辛必定寻庚起，丁壬壬位顺行流。戊癸何方发，甲寅之上好追求。」（五虎遁）——又以五鼠遁由日干定时柱天干，再以日干为我配十神、观五行分布多寡。',
        plain:'由年干定寅月天干、顺推各月干支的五虎遁口诀。',
        annotations:[
          { term:'五虎遁', pinyin:'wǔ hǔ dùn', gloss:'年上起月法：由年干定寅月天干，顺推十二个月干支', type:'术语' },
          { term:'五鼠遁', gloss:'日上起时法：由日干定子时天干，顺推十二个时辰干支', type:'术语' },
          { term:'十神', gloss:'以日干为我，按天干阴阳同异与五行生克定比肩、劫财、食神、伤官、偏财、正财、七杀、正官、偏印、正印', type:'术语' },
        ],
        interpretations:[
          { school:'徐子平（旧题，渊海子平，大意转述）', dynasty:'宋', text:'命书以日干为权衡，配四柱干支论十神，观五行生克旺衰而断；诸书体系各异。', paraphrase:true, plain:'命理以日干配十神、观五行的通行思路（转述）。' },
          { kind:'今按', school:'本教程编者按', dynasty:'今', text:'本实现未按精确节气时刻分界（立春取 2 月 4 日近似、月支按公历月近似），地支只取本气藏干，均为简化口径，仅作排盘文献展示。', paraphrase:true, plain:'说明实现与古法的差异（简化口径）。' },
          JINAN,
        ] },
    ],
    verdict:ruleById('zhouyi-sizhu-shishen'),
    disclaimer:DISCLAIMER,
    refLessonId:spec.refLessonId,
  };
}
function zhouyiYearGanzhiInner(year:number): string { return jiazi(((year - 4) % 60 + 60) % 60); }

/** 八宅命卦（简化口径：按出生年公式，注明流派差异存在） */
function divBazhai(spec:DivinationSpec): DivinationResult {
  const year = clampNum(num(spec.input, 'year', 2000), 1, 9999, 2000);
  const gender = str(spec.input, 'gender', '男');
  if (gender !== '男' && gender !== '女') throw new Error('input.gender 需为「男」或「女」');
  // 出生年四位数字反复相加至一位 s（简化口径：直接按公历年份各数位求和）
  let s = year;
  while (s > 9) s = String(s).split('').reduce((a, c) => a + Number(c), 0);
  let v = gender === '男' ? 11 - s : 4 + s;
  while (v > 9) v -= 9;
  if (year >= 2000) { v = gender === '男' ? v - 1 : v + 1; if (v <= 0) v += 9; if (v > 9) v -= 9; }
  const mingGua = v === 5 ? (gender === '男' ? '坤' : '艮') as ZhouyiTrigram : ZHOUYI_BAZHAI_MINGGUA[v];
  const dongxi = ZHOUYI_DONGSI.has(mingGua) ? '东四命' : '西四命';
  // 八方吉凶位：大游年歌自伏位起顺时针布（后天八卦方位）
  const base = ZHOUYI_HOUTIAN_CLOCKWISE.indexOf(mingGua);
  const dirRows: string[][] = [];
  for (let k = 0; k < 8; k++) {
    const t = ZHOUYI_HOUTIAN_CLOCKWISE[(base + k) % 8];
    const star = k === 0 ? '伏位' : ZHOUYI_YOUXING_NAMES[ZHOUYI_DAYOUNIAN[mingGua][k - 1]];
    const lucky = star === '伏位' || star === '生气' || star === '延年' || star === '天医' ? '吉' : '凶';
    dirRows.push([ZHOUYI_TRIGRAM_INFO[t].houtian, t, star, lucky]);
  }
  const steps: DivinationStep[] = [
    { rule:'算命卦数', sourceRef:SR_BAZHAI, input:`${year} 年出生，性别${gender}`, output:`年份数字反复相加至一位 = ${s}；${gender === '男' ? '男命 = 11−s' : '女命 = 4+s'}${year >= 2000 ? '，2000 年后男 −1、女 +1' : ''} = ${v}${v === 5 ? `，5 数${gender === '男' ? '男寄坤' : '女寄艮'}` : ''}`, note:'简化口径：按通行公式（转述），八宅诸法流派差异存在；出处《八宅明镜》（旧题，公版）。' },
    { rule:'定命卦与东西四命', sourceRef:SR_BAZHAI, input:`命卦数 ${v}`, output:`命卦 = ${mingGua}卦，${dongxi}（坎离震巽为东四、乾坤艮兑为西四）`, diagram:{ kind:'bagua', scheme:'后天' } },
    { rule:'布八方吉凶位', sourceRef:SR_BAZHAI, input:`${mingGua}卦起大游年歌`, output:'自伏位起顺时针布游星（生气/延年/天医/伏位为吉，绝命/五鬼/六煞/祸害为凶）', note:'大游年歌为八宅派通行口径（转述）；本表按后天八卦方位顺时针排布。', diagram:{ kind:'table', head:['方位', '八卦', '游星', '吉凶'], rows:dirRows } },
  ];
  return {
    method:'bazhai',
    summary:`八宅命卦（简化口径）：命卦数 ${v} → 命卦${mingGua}，为${dongxi}；八方吉凶位已按大游年歌顺布。`,
    steps,
    diagrams:[
      { kind:'table', head:['方位', '八卦', '游星', '吉凶'], rows:dirRows },
      { kind:'bagua', scheme:'后天' },
    ],
    canonRefs:[
      { title:'八宅明镜·卷上（命卦与东西四命，大意转述）',
        text:'以生年数配男女定命卦：男命数=11−生年数（逾九减九），女命数=4+生年数（逾九减九）；得一坎二坤三震四巽六乾七兑八艮九离，五数男寄坤、女寄艮；再按大游年歌自伏位顺布八方吉凶（大意转述）。',
        plain:'命卦起例的转述：由出生年得命数，按男女公式映射八宫卦。',
        annotations:[
          { term:'命卦', gloss:'按出生年与性别推得的八卦卦命，分东西四命', type:'术语' },
          { term:'大游年', gloss:'八宅派顺布八方吉凶游星的歌诀，自伏位起顺时针排布', type:'术语' },
        ],
        interpretations:[
          { school:'本教程编者按（今按）', dynasty:'今', text:'八宅起例诸本公式略有出入（含 2000 年前后调整差异），本实现取通行口径，属简化展示；命理风水诸说并存，不作现实建议。', paraphrase:true, plain:'说明流派差异与简化口径。' },
          JINAN,
        ] },
    ],
    verdict:ruleById('zhouyi-bazhai-dongxi'),
    disclaimer:DISCLAIMER,
    refLessonId:spec.refLessonId,
  };
}

/** 玄空飞星（简化口径：山向顺逆按八方位所属天元龙近似——四正卦宫为阴逆飞、四维卦宫为阳顺飞） */
function divXuankong(spec:DivinationSpec): DivinationResult {
  // 越界退默认（健壮性契约）：非法元运按八运、非法坐向按坎坐离向处理，避免 UI 层漏校验时白屏
  const rawYun = num(spec.input, 'yun', 8);
  const yun = rawYun >= 1 && rawYun <= 9 ? rawYun : 8;
  const trigrams = Object.keys(ZHOUYI_TRIGRAM_INFO) as ZhouyiTrigram[];
  const rawSitting = str(spec.input, 'sitting', '坎') as ZhouyiTrigram;
  const rawFacing = str(spec.input, 'facing', '离') as ZhouyiTrigram;
  const sitting = trigrams.includes(rawSitting) ? rawSitting : '坎';
  const facing = trigrams.includes(rawFacing) ? rawFacing : '离';
  const isYang = (t:ZhouyiTrigram): boolean => ['乾','坤','艮','巽'].includes(t); // 简化口径：天元龙近似
  const fly = (centerStar:number, forward:boolean): Record<number, number> => {
    const map: Record<number, number> = {};
    ZHOUYI_LUOSHU_TRAJECTORY.forEach((palace, i) => {
      const delta = forward ? i : -i;
      map[palace] = (((centerStar - 1 + delta) % 9) + 9) % 9 + 1;
    });
    return map;
  };
  const yunPan = fly(yun, true); // 运盘：中宫起运星顺飞
  // 山向入中之星取「坐山/向首所在宫位之运盘星」：
  const shanCenter = yunPan[luoshuPalaceOf(sitting)];
  const xiangCenter = yunPan[luoshuPalaceOf(facing)];
  const shanPan2 = fly(shanCenter, !isYang(sitting)); // 天元龙阳顺阴逆（简化口径）
  const xiangPan = fly(xiangCenter, !isYang(facing));
  const rows = ZHOUYI_LUOSHU_GRID.map((palace) => {
    const tri = trigrams.find((t) => luoshuPalaceOf(t) === palace);
    const label = tri ? `${ZHOUYI_TRIGRAM_INFO[tri].houtian}（${tri}宫）` : '中宫';
    return [label, String(shanPan2[palace]), String(yunPan[palace]), String(xiangPan[palace])];
  });
  const steps: DivinationStep[] = [
    { rule:'起运盘', sourceRef:SR_SHENSHI, input:`${yun} 运`, output:`${yun} 星入中宫，按洛书轨迹顺飞得运盘`, note:'洛书飞泊轨迹：中 5→乾 6→兑 7→艮 8→离 9→坎 1→坤 2→震 3→巽 4。', diagram:{ kind:'jiugong', numbers:ZHOUYI_LUOSHU_TRAJECTORY.map((palace) => yunPan[palace]) } },
    { rule:'定山向顺逆', sourceRef:SR_SHENSHI, input:`坐 ${sitting}、向 ${facing}`, output:`山星（${shanCenter} 入中）${isYang(sitting) ? '顺飞' : '逆飞'}；向星（${xiangCenter} 入中）${isYang(facing) ? '顺飞' : '逆飞'}`, note:'简化口径：按八方位所属天元龙近似定阴阳（四维乾坤艮巽为阳、四正子午卯酉为阴），未按二十四山三元龙细辨。' },
    { rule:'排山向飞星盘', sourceRef:SR_SHENSHI, input:'山向二星入中飞九宫', output:'3×3 九宫盘（山星/运星/向星）', note:'玄空飞星为《沈氏玄空学》系统口径（转述）；本盘为教学演示简化口径。', diagram:{ kind:'table', head:['宫位', '山星', '运星', '向星'], rows } },
  ];
  return {
    method:'xuankong',
    summary:`玄空飞星（简化口径）：${yun} 运，坐${sitting}向${facing}；运盘 ${yun} 星入中顺飞，山星 ${shanCenter} 入中${isYang(sitting) ? '顺' : '逆'}飞、向星 ${xiangCenter} 入中${isYang(facing) ? '顺' : '逆'}飞，得 3×3 九宫盘。`,
    steps,
    diagrams:[
      { kind:'jiugong', numbers:ZHOUYI_LUOSHU_TRAJECTORY.map((palace) => yunPan[palace]) },
      { kind:'table', head:['宫位', '山星', '运星', '向星'], rows },
    ],
    canonRefs:[
      { title:'沈氏玄空学·卷一（飞星起例，大意转述）',
        text:'玄空以当运之星入中宫，按洛书轨迹顺飞九宫成运盘；山星、向星依坐向之三元龙阴阳定顺逆飞（大意转述）。',
        plain:'玄空飞星排盘的通行起例（转述），见《沈氏玄空学》。',
        annotations:[
          { term:'运盘', gloss:'当运之星入中宫顺飞九宫所得之盘', type:'术语' },
          { term:'山星', gloss:'坐山宫之运盘星入中飞九宫所得之盘', type:'术语' },
          { term:'向星', gloss:'向首宫之运盘星入中飞九宫所得之盘', type:'术语' },
          { term:'三元龙', gloss:'二十四山分地元龙、天元龙、人元龙，其阴阳决定飞星顺逆', type:'术语' },
        ],
        interpretations:[
          { school:'沈竹礽（沈氏玄空学，大意转述）', dynasty:'清', text:'沈氏以洛书轨迹飞九宫，顺逆之分系于坐向之阴阳，诸家运用大同小异。', paraphrase:true, plain:'玄空飞星顺逆规则的转述。' },
          { kind:'今按', school:'本教程编者按', dynasty:'今', text:'本实现按八方位所属天元龙近似定顺逆（四维为阳顺飞、四正为阴逆飞），未按二十四山细辨三元龙，属简化口径。', paraphrase:true, plain:'说明实现与古法的差异（简化口径）。' },
          JINAN,
        ] },
    ],
    verdict:ruleById('zhouyi-xuankong-feixing'),
    disclaimer:DISCLAIMER,
    refLessonId:spec.refLessonId,
  };
}
/** 八卦 → 其后天宫位的洛书数 */
function luoshuPalaceOf(t:ZhouyiTrigram): number {
  const dir = ZHOUYI_TRIGRAM_INFO[t].houtian.replace('方', '');
  const map: Record<string, number> = { 北:1, 西南:2, 东:3, 东南:4, 南:9, 西:7, 西北:6, 东北:8 };
  return map[dir];
}

/** 五行生克关系说明 */
function divWuxing(spec:DivinationSpec): DivinationResult {
  const a = str(spec.input, 'a') as Wx, b = str(spec.input, 'b') as Wx;
  const all: Wx[] = ['金','木','水','火','土'];
  if (!all.includes(a) || !all.includes(b)) throw new Error('input.a/b 需为「金木水火土」之一');
  const shengChain = (from:Wx): string => {
    const i = ['木','火','土','金','水'].indexOf(from);
    return [0, 1, 2, 3, 4].map((k) => ['木','火','土','金','水'][(i + k) % 5]).join('→');
  };
  const keChain = (from:Wx): string => {
    const i = ['木','土','水','火','金'].indexOf(from);
    return [0, 1, 2, 3, 4].map((k) => ['木','土','水','火','金'][(i + k) % 5]).join('→');
  };
  let rel:string;
  if (a === b) rel = '五行比和（同气）';
  else if (zhouyiSheng(a, b)) rel = `${a}生${b}`;
  else if (zhouyiSheng(b, a)) rel = `${b}生${a}`;
  else if (zhouyiKe(a, b)) rel = `${a}克${b}`;
  else rel = `${b}克${a}`;
  const steps: DivinationStep[] = [
    { rule:'五行名义', sourceRef:SR_HONGFAN, input:`a=${a}，b=${b}`, output:`《洪范》：一曰水，二曰火，三曰木，四曰金，五曰土`, note:'五行之名与次第出自《尚书·洪范》原文。', diagram:{ kind:'wuxing', mode:'生' } },
    { rule:'定生克关系', sourceRef:SR_HONGFAN, input:`a=${a}，b=${b}`, output:rel, note:'相生：木生火、火生土、土生金、金生水、水生木；相克：木克土、土克水、水克火、火克金、金克木（通行口径转述）。', diagram:{ kind:'wuxing', mode:'克' } },
    { rule:'相生相克链条', sourceRef:SR_HONGFAN, input:`以 ${a} 为起点`, output:`相生环：${shengChain(a)}；相克环：${keChain(a)}`, note:'两环均为五元素循环（简化口径：仅展示次序，不论旺衰）。',
      diagram:{ kind:'table', head:['环节', '次序'], rows:[['相生环', shengChain(a)], ['相克环', keChain(a)]] } },
  ];
  return {
    method:'wuxing',
    summary:`五行关系（客观描述）：${a} 与 ${b} 为「${rel}」；以 ${a} 为起点的相生环与相克环已列出。`,
    steps,
    diagrams:[
      { kind:'wuxing', mode:'生' },
      { kind:'wuxing', mode:'克' },
      { kind:'table', head:['环节', '次序'], rows:[['相生环', shengChain(a)], ['相克环', keChain(a)]] },
    ],
    canonRefs:[
      { title:'尚书·洪范（五行）',
        text:'「五行：一曰水，二曰火，三曰木，四曰金，五曰土。」——后世据此推演相生（木生火、火生土、土生金、金生水、水生木）与相克（木克土、土克水、水克火、火克金、金克木）之序。',
        plain:'《尚书·洪范》举五行之名与次第，生克之序为后世推演。',
        annotations:[
          { term:'五行', pinyin:'wǔ xíng', gloss:'水、火、木、金、土五种基本物质及其运行变化', type:'术语' },
          { term:'相生', gloss:'木生火、火生土、土生金、金生水、水生木——一环递相滋生', type:'术语' },
          { term:'相克', gloss:'木克土、土克水、水克火、火克金、金克木——隔位递相克制', type:'术语' },
        ],
        interpretations:[
          { school:'班固（白虎通义·五行，大意转述）', dynasty:'汉', text:'《白虎通义》以五行相生相克释其运转之序，历代五行书大同。', paraphrase:true, plain:'汉代五行生克体系化说明的转述。' },
          JINAN,
        ] },
    ],
    verdict:ruleById('zhouyi-wuxing-shengke'),
    disclaimer:DISCLAIMER,
    refLessonId:spec.refLessonId,
  };
}

/** 简易择日：干支 + 月建起建除十二神（简化口径：不处理节气交接重复日） */
function divZari(spec:DivinationSpec): DivinationResult {
  const y = clampNum(num(spec.input, 'year', 2000), 1, 9999, 2000), m = clampNum(num(spec.input, 'month', 1), 1, 12, 1), d = clampNum(num(spec.input, 'day', 1), 1, 31, 1);
  const dayPillar = dayGanzhi(y, m, d);
  const monthZhi = ZHOUYI_MONTH_ZHI[m];
  const offset = (zhiIdx(dayPillar[1]) - zhiIdx(monthZhi) + 12) % 12;
  const jianchu = ZHOUYI_JIANCHU_ORDER[offset];
  const steps: DivinationStep[] = [
    { rule:'定日干支', sourceRef:SR_XIEJI, input:`公历 ${y} 年 ${m} 月 ${d} 日`, output:`日柱 ${dayPillar}`, note:'简化口径：格里历儒略日数公式 + 锚点「2000-01-07 = 甲子日」。' },
    { rule:'定月建', sourceRef:SR_XIEJI, input:`${m} 月`, output:`月建 ${monthZhi}`, note:'简化口径：按公历月近似节气月支，未按精确节气时刻。' },
    { rule:'起建除十二神', sourceRef:SR_XIEJI, input:`日支 ${dayPillar[1]} 对月建 ${monthZhi}`, output:`建除十二神值「${jianchu}」`, note:'简化口径：日支与月建相同者为建日，其余按建除满平定执破危成收开闭轮排；不处理节气交接之重复日（传统口径中交节重复一日以两神分计）。' },
    { rule:'宜忌口径', sourceRef:SR_XIEJI, input:`${jianchu} 日`, output:'宜忌条目为文献展示，不作现实建议', note:'《钦定协纪辨方书》集历代择日之说而辨正，民俗宜忌诸说并存（转述，见规则表 zhouyi-zari-yiji）。', diagram:{ kind:'table', head:['项目', '结果'], rows:[['日柱', dayPillar], ['月建', monthZhi], ['建除十二神', jianchu]] } },
  ];
  return {
    method:'zari',
    summary:`简易择日（简化口径）：公历 ${y}年${m}月${d}日为${dayPillar}日，月建${monthZhi}，建除十二神值「${jianchu}」；宜忌条目为文献展示。`,
    steps,
    diagrams:[
      { kind:'table', head:['项目', '结果'], rows:[['日柱', dayPillar], ['月建', monthZhi], ['建除十二神', jianchu]] },
    ],
    canonRefs:[
      { title:'钦定协纪辨方书·卷十一（建除，大意转述）',
        text:'「建除十二神」以月建对日支起「建」，按建、除、满、平、定、执、破、危、成、收、开、闭十二神顺数，日支逢月建即为建日（大意转述）。',
        plain:'建除十二神起例的转述，见《钦定协纪辨方书》。',
        annotations:[
          { term:'建除十二神', gloss:'建、除、满、平、定、执、破、危、成、收、开、闭十二值日神煞', type:'术语' },
          { term:'月建', gloss:'当日节气月的地支（正月建寅、二月建卯……）', type:'术语' },
        ],
        interpretations:[
          { school:'允禄 等奉敕撰（钦定协纪辨方书，大意转述）', dynasty:'清', text:'《协纪辨方书》汇集历代选择家言而加以辨正，建除十二神各有所宜所忌，然民俗诸说并存。', paraphrase:true, plain:'《协纪辨方书》对择日诸说的汇集与辨正（转述）。' },
          { kind:'今按', school:'本教程编者按', dynasty:'今', text:'本实现仅输出干支与建除排布，不输出具体宜忌判断；节气交接之重复日未作两神分计，属简化口径。', paraphrase:true, plain:'说明实现范围与简化口径。' },
          JINAN,
        ] },
    ],
    verdict:ruleById(caseRuleId(spec) ?? 'zhouyi-zari-yiji'),
    disclaimer:DISCLAIMER,
    refLessonId:spec.refLessonId,
  };
}

// ==================== 主入口 ====================

/** 测字（字占）：按现行规范笔画仿梅花法起卦。★ 明确标注为「本教程简化口径」：
 *  以总笔画取上卦、加字数取下卦、总数取动爻；拆字部件分析（字形拆解）数据量大，P2 另做。 */
function divCezi(spec:DivinationSpec): DivinationResult {
  const charsRaw = str(spec.input, 'chars', '');
  const strokesInput = num(spec.input, 'strokes', 0);
  // 笔画来源：显式 strokes 优先；否则按内置规范笔画表逐字取（未收录字报错，UI 层有前置校验与提示）
  let total:number; let source:string; let charDetail:string;
  if (strokesInput > 0) {
    total = strokesInput; source = '用户直接给出笔画数'; charDetail = `共 ${total} 画`;
  } else if (charsRaw) {
    const list = [...charsRaw].map((ch) => ({ ch, n: ZHOUYI_CEZI_STROKES[ch] }));
    const missing = list.filter((x) => !x.n);
    if (missing.length) throw new Error(`「${missing.map((m) => m.ch).join('、')}」不在内置笔画表中，请直接输入笔画数`);
    total = list.reduce((a, b) => a + (b.n ?? 0), 0);
    source = '按内置规范笔画表逐字取'; charDetail = list.map((x) => `${x.ch}=${x.n}画`).join('，') + `，共 ${total} 画`;
  } else {
    throw new Error('请提供待测的字或笔画数');
  }
  const n1 = total % 8 === 0 ? 8 : total % 8;
  const n2 = (total + charsRaw.length) % 8 === 0 ? 8 : (total + charsRaw.length) % 8;
  const moving = (total + charsRaw.length) % 6 === 0 ? 6 : (total + charsRaw.length) % 6;
  const upper = ZHOUYI_XIANTIAN_TRIGRAM[n1], lower = ZHOUYI_XIANTIAN_TRIGRAM[n2];
  const lines: Lines = [...ZHOUYI_TRIGRAM_INFO[lower].lines, ...ZHOUYI_TRIGRAM_INFO[upper].lines];
  const name = zhouyiHexagramName(upper, lower);
  const bian: Lines = lines.map((v, i) => (i === moving - 1 ? (v ? 0 : 1) : v));
  const bianName = zhouyiHexagramName(zhouyiTrigramsOfLines(bian).upper, zhouyiTrigramsOfLines(bian).lower);
  const tiTri: ZhouyiTrigram = moving <= 3 ? upper : lower;
  const yongTri: ZhouyiTrigram = moving <= 3 ? lower : upper;
  const tiWx = ZHOUYI_TRIGRAM_INFO[tiTri].wuxing, yongWx = ZHOUYI_TRIGRAM_INFO[yongTri].wuxing;
  let rel:string, verdictId:string;
  if (yongWx === tiWx) { rel = '体用比和'; verdictId = 'zhouyi-meihua-bihe'; }
  else if (zhouyiSheng(yongWx, tiWx)) { rel = '用生体'; verdictId = 'zhouyi-meihua-yong-sheng-ti'; }
  else if (zhouyiSheng(tiWx, yongWx)) { rel = '体生用'; verdictId = 'zhouyi-meihua-ti-sheng-yong'; }
  else if (zhouyiKe(yongWx, tiWx)) { rel = '用克体'; verdictId = 'zhouyi-meihua-yong-ke-ti'; }
  else { rel = '体克用'; verdictId = 'zhouyi-meihua-ti-ke-yong'; }
  const steps: DivinationStep[] = [
    { rule:'定笔画', sourceRef:SR_MEIHUA, input:charsRaw || `${strokesInput} 画`, output:charDetail, note:`${source}；现行规范笔画为简体通行口径，与古籍康熙笔画口径有出入。` },
    { rule:'仿梅花法起卦', sourceRef:SR_MEIHUA, input:`笔画 ${total}，字数 ${charsRaw.length}`, output:`${total} mod 8 = ${n1} 得上卦${upper}；(${total}+${charsRaw.length}) mod 8 = ${n2} 得下卦${lower}；(${total}+${charsRaw.length}) mod 6 = ${moving} 为动爻`, note:'★ 本教程简化口径：仿梅花易数「以数起卦」法应用于笔画，非古籍测字原法逐字复刻。' },
    { rule:'体用生克', sourceRef:SR_MEIHUA, input:`体=${tiTri}（${tiWx}），用=${yongTri}（${yongWx}）`, output:`${rel}`, note:'字占与年月日时占同一体用断法，断语只取白名单规则表。' },
  ];
  return {
    method:'cezi',
    summary:`测「${charsRaw || `${strokesInput} 画`}」（简化口径）：${charDetail}，起卦得${name}（上${upper}下${lower}），第 ${moving} 爻动，变卦${bianName}；体${tiTri}（${tiWx}）、用${yongTri}（${yongWx}），关系为「${rel}」。`,
    steps,
    diagrams:[
      { kind:'hexagram', lines, moving, caption:`字占 ${name}（第 ${moving} 爻动）` },
      { kind:'hexagram', lines:bian, caption:`变卦 ${bianName}` },
    ],
    canonRefs:[
      { title:'梅花易数·卷二·字占（大意转述）',
        text:'《梅花易数》字占一门以字之笔画、字数起卦，观体用生克以断；本演示为该口径之简化转述，拆字部件分析另属测字术「形解」一脉（大意转述）。',
        plain:'字占按笔画起卦、观体用生克，是《梅花易数》口径的简化转述；「拆字形解」是测字术的另一路，本演示未做。',
        annotations:[
          { term:'字占', pinyin:'zì zhàn', gloss:'以字为占的起卦门类（与年月日时占并列）', type:'术语' },
          { term:'形解', gloss:'测字术按字形部件拆解断事的一路', type:'术语' },
        ],
        interpretations:[
          { kind:'今按', school:'本教程编者按', dynasty:'今', text:'《梅花易数》字占原文以笔画数起卦的细节诸本记载简略，本实现按「以数起卦」同构简化；规范笔画与古籍康熙笔画不同，仅作教学演示。', paraphrase:true, plain:'说明简化口径与笔画口径差异。' },
          JINAN,
        ] },
    ],
    verdict:ruleById(caseRuleId(spec) ?? verdictId),
    disclaimer:DISCLAIMER,
    refLessonId:spec.refLessonId,
  };
}

/** 解梦：梦象关键词 → 民俗梦书条目口径（全部转述白名单数据，确定性无随机） */
function divJiemeng(spec:DivinationSpec): DivinationResult {
  const dream = str(spec.input, 'dream');
  const entry = zhouyiDreamMatch(dream);
  const isFallback = entry.keys.length === 0;
  const steps: DivinationStep[] = [
    { rule:'定梦象', sourceRef:entry.sourceRef, input:`「${dream}」`,
      output:isFallback ? '未命中收录梦象，按「梦无定象」口径说明' : `命中梦象「${entry.name}」`,
      note:'对收录梦象按关键词匹配；未收录的梦象不硬凑解释，按梦书「梦无定象」口径说明。' },
    { rule:'梦书口径', sourceRef:entry.sourceRef, input:entry.name, output:entry.quote,
      note:'民俗梦书条目的**人工预写转述**（同断语白名单思路），不作现实预测。' },
  ];
  return {
    method:'jiemeng',
    summary:`解梦（民俗文献口径）：梦象「${dream}」${isFallback ? '未收录，按梦书「梦无定象」口径说明' : `对应「${entry.name}」`}；${entry.plain}`,
    steps,
    diagrams:[
      { kind:'table', head:['梦象', '民俗口径'], rows:[[entry.name, entry.plain]] },
    ],
    canonRefs:[
      { title:'梦林玄解·占梦总论（大意转述）',
        text:'「梦者神游也，有感而应；梦无定象，因人而异，占梦者当以象会意，不可执一而断（大意转述）。」',
        plain:'占梦先定象再会意；同一梦象因人因境而异，不能执一而断。',
        annotations:[
          { term:'梦无定象', gloss:'同一梦象因人因境而解异，是占梦书的总纲口径', type:'术语' },
          { term:'神游', pinyin:'shén yóu', gloss:'旧说谓梦为神识之游', type:'术语' },
        ],
        interpretations:[
          { kind:'今按', school:'本教程编者按', dynasty:'今', text:'《梦林玄解》为明代汇编梦书，《周公解梦》为民俗通行本；两者条目均为民俗文献口径，本演示只作转述，绝不构成现实预测或建议。', paraphrase:true, plain:'说明两本梦书的性质与演示边界。' },
          JINAN,
        ] },
    ],
    verdict:ruleById(isFallback ? 'zhouyi-jiemeng-wuding' : 'zhouyi-jiemeng-dingxiang'),
    disclaimer:DISCLAIMER,
    refLessonId:spec.refLessonId,
  };
}

/** 姓名学五格（近人体例）：只计算格数，**不输出数理吉凶断语**（八十一数理非公版古籍，合规红线） */
function divXingming(spec:DivinationSpec): DivinationResult {
  const nameRaw = str(spec.input, 'name', '');
  const strokesRaw = str(spec.input, 'strokes', '');
  // 笔画序列：显式 strokes（逗号/顿号分隔正整数）优先；否则按内置康熙笔画对照表逐字取
  let parts:number[]; let source:string; let label:string;
  if (strokesRaw) {
    parts = strokesRaw.split(/[,，、\s]+/).filter((s) => s).map((s) => parseInt(s, 10));
    if (!parts.length || parts.some((n) => !Number.isFinite(n) || n <= 0)) throw new Error('笔画需为逗号分隔的正整数（按康熙笔画口径）');
    label = strokesRaw; source = '用户直接给出康熙笔画';
  } else if (nameRaw) {
    const list = [...nameRaw].map((ch) => ({ ch, n: ZHOUYI_XINGMING_BIHUA[ch] }));
    const missing = list.filter((x) => !x.n);
    if (missing.length) throw new Error(`「${missing.map((m) => m.ch).join('、')}」不在内置笔画表中，请直接输入各字笔画`);
    parts = list.map((x) => x.n!);
    label = [...nameRaw].join(''); source = '按内置康熙笔画对照表';
  } else {
    throw new Error('请提供姓名或各字笔画');
  }
  const wuge = zhouyiWuge(parts[0], parts.slice(1));
  const steps: DivinationStep[] = [
    { rule:'定笔画序列', sourceRef:ZHOUYI_XINGMING_NOTE.sourceRef, input:label, output:`${parts.join('、')}（首字为姓，其余为名）`, note:`${source}；康熙笔画为五格体例的通行计字口径。` },
    { rule:'天格', sourceRef:ZHOUYI_XINGMING_NOTE.sourceRef, input:`姓 ${parts[0]} 画`, output:`天格 = 姓 + 1 = ${wuge.tian}`, note:'单姓口径；复姓诸本另法，本实现按单姓简化。' },
    { rule:'人格', sourceRef:ZHOUYI_XINGMING_NOTE.sourceRef, input:`姓 ${parts[0]} + 名首字 ${parts[1] ?? 1}`, output:`人格 = ${wuge.ren}`, note:'人格为「主运」，五格体系的核心格（此处仅报格数）。' },
    { rule:'地格', sourceRef:ZHOUYI_XINGMING_NOTE.sourceRef, input:`名字 ${parts.slice(1).join('、') || '（单字名按 1）'}`, output:`地格 = ${wuge.di}`, note:'单名时地格口径诸本不一，本实现按名笔画之和（单名以 1 计）简化。' },
    { rule:'外格与总格', sourceRef:ZHOUYI_XINGMING_NOTE.sourceRef, input:`总 = ${parts.join(' + ')} = ${wuge.zong}`, output:`外格 = 总 − 人格 + 1 = ${wuge.wai}；总格 = ${wuge.zong}`, note:'外格单名口径诸本不一，统一按「总 − 人格 + 1」简化；★ 本演示只算格数，不做八十一数理吉凶断语。' },
  ];
  return {
    method:'xingming',
    summary:`姓名五格（近人体例演示）：${source}得笔画 ${parts.join('、')}，五格为天${wuge.tian}、人${wuge.ren}、地${wuge.di}、外${wuge.wai}、总${wuge.zong}；只计算格数，不作数理吉凶断语。`,
    steps,
    diagrams:[
      { kind:'table', head:['五格', '计算口径', '格数'], rows:[
        ['天格', `姓（${parts[0]}）+ 1`, String(wuge.tian)],
        ['人格', `姓 + 名首字`, String(wuge.ren)],
        ['地格', '名字笔画之和', String(wuge.di)],
        ['外格', '总格 − 人格 + 1', String(wuge.wai)],
        ['总格', `${parts.join(' + ')}`, String(wuge.zong)],
      ] },
    ],
    canonRefs:[
      { title:'五格剖象法体例说明（今按）',
        text:'五格剖象法以天、人、地、外、总五格论姓名笔画配置，笔画按康熙笔画口径计；该体系为二十世纪传入的近人体例，并非《周易》古籍。',
        plain:'五格剖象是近人体例（非古籍），本演示只算格数、不做吉凶断语。',
        annotations:[
          { term:'五格', gloss:'天格、人格、地格、外格、总格', type:'术语' },
          { term:'康熙笔画', gloss:'旧体例按《康熙字典》笔画计字，与现行规范笔画有出入', type:'术语' },
        ],
        interpretations:[
          { kind:'今按', school:'本教程编者按', dynasty:'今', text:'八十一数理吉凶体系出自近人著作，无公版古籍出处，因此本演示不输出吉凶断语、不替人起名改名——只展示格数怎么算，供对照文献体例。', paraphrase:true, plain:'说明为什么没有断语：数理吉凶非公版古籍，且起名改名在课程方案中列为不做项。' },
          JINAN,
        ] },
    ],
    verdict:undefined,
    disclaimer:DISCLAIMER,
    refLessonId:spec.refLessonId,
  };
}

/** 周易测算主入口：按 method 分派 11 法；同 seed 必得同结果 */
export function runDivination(spec:DivinationSpec): DivinationResult {
  switch (spec.method) {
    case 'meihua': return divMeihua(spec);
    case 'dayan': return divDayan(spec);
    case 'liuyao': return divLiuyao(spec);
    case 'sizhu': return divSizhu(spec);
    case 'bazhai': return divBazhai(spec);
    case 'xuankong': return divXuankong(spec);
    case 'wuxing': return divWuxing(spec);
    case 'zari': return divZari(spec);
    case 'cezi': return divCezi(spec);
    case 'jiemeng': return divJiemeng(spec);
    case 'xingming': return divXingming(spec);
    default: throw new Error(`未知推演方法：${spec.method}`);
  }
}

/** 供测试/调试：白名单规则表已由 rules.ts 导出；此处补一个按 method 过滤的便捷纯函数 */
export function zhouyiRulesOfMethod(method:DivinationMethod): DivinationVerdict[] {
  return ZHOUYI_RULE_TABLE.filter((e) => e.method === method).map((e) => ({
    label:e.label, quote:e.quote, sourceRef:e.sourceRef, plain:e.plain, paraphrase:e.paraphrase,
  }));
}
