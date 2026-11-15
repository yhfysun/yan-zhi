// 周易测算纯函数库 —— 显式具名导出（不用 export *，避免与 shared 其他目录同名导出静默覆盖）。

// —— 类型 ——
export type {
  ZhouyiTrigram, ZhouyiBlock, ZhouyiSourceRef, ZhouyiAnnotation, ZhouyiInterpretation,
  DivinationMethod, DivinationSpec, DivinationStep, DivinationCanonRef,
  DivinationVerdict, DivinationResult, ZhouyiRuleEntry,
  ZhouyiCaseEntry, ZhouyiCaseCategory,
} from './types';
export type { ZhouyiTrigramLines } from './tables';
export type { ZhouyiShape } from './diagram';

// —— 数据表 ——
export {
  ZHOUYI_TRIGRAM_INFO, ZHOUYI_XIANTIAN_TRIGRAM, ZHOUYI_HEXAGRAM_NAMES,
  zhouyiHexagramName, zhouyiTrigramsOfLines,
  ZHOUYI_WUXING_SHENG, ZHOUYI_WUXING_KE, zhouyiSheng, zhouyiKe,
  ZHOUYI_TIANGAN, ZHOUYI_DIZHI, ZHOUYI_DIZHI_CANGGAN, ZHOUYI_LIUSHI_JIAZI, zhouyiYearGanzhi,
  ZHOUYI_NAJIA, ZHOUYI_LIUSHEN_ORDER, ZHOUYI_LIUSHEN_START,
  ZHOUYI_BAZHAI_MINGGUA, ZHOUYI_DONGSI, ZHOUYI_XISI,
  ZHOUYI_DAYOUNIAN, ZHOUYI_HOUTIAN_CLOCKWISE, ZHOUYI_YOUXING_NAMES,
  ZHOUYI_LUOSHU_TRAJECTORY, ZHOUYI_LUOSHU_GRID,
  ZHOUYI_JIANCHU_ORDER, ZHOUYI_WUHUDUN, ZHOUYI_WUSHUDUN, ZHOUYI_MONTH_ZHI,
} from './tables';

// —— 断语白名单（人工预写） ——
export { ZHOUYI_RULE_TABLE } from './rules';

// —— 事类词库（先问什么事，再选占法） ——
export {
  ZHOUYI_CASES, zhouyiCaseSearch, zhouyiCaseById, ZHOUYI_CASE_HOT,
} from './cases';

// —— 杂占数据（测字笔画 / 民俗梦书 / 姓名五格） ——
export {
  ZHOUYI_CEZI_STROKES, ZHOUYI_DREAM_TABLE, zhouyiDreamMatch,
  ZHOUYI_XINGMING_BIHUA, zhouyiWuge, ZHOUYI_XINGMING_NOTE,
} from './misc';

// —— 推演主流程 ——
export { runDivination, zhouyiRulesOfMethod, ZHOUYI_CASE_RULE_IDS } from './divination';

// —— 图形数据转换 ——
export { zhouyiBlockToShapes } from './diagram';
