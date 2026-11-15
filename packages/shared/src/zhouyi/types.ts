// 周易测算纯函数库 —— 类型定义。
// ★ 硬约束：全部纯函数、离线、无 IO；随机一律 seed + mulberry32，同 seed 必得同结果；
//   断语（verdict）只查 ZHOUYI_RULE_TABLE 白名单，绝不生成新的预测文本；
//   所有简化算法在注释与输出 note 中注明「简化口径」。

/** 八卦名（后天卦名即通行卦名） */
export type ZhouyiTrigram = '乾'|'兑'|'离'|'震'|'巽'|'坎'|'艮'|'坤';

/** 前端图形块：由 diagram.zhouyiBlockToShapes 转成纯数据图形指令（前端画 SVG） */
export type ZhouyiBlock =
  | { kind:'hexagram'; lines:Array<0|1>; moving?:number; caption?:string }   // 0=阴 1=阳，自下而上
  | { kind:'bagua'; scheme:'先天'|'后天' }
  | { kind:'wuxing'; mode:'生'|'克' }
  | { kind:'hetu' } | { kind:'luoshu' }
  | { kind:'jiugong'; numbers:number[] }                                      // 9 个数字，洛书轨迹
  | { kind:'table'; head:string[]; rows:string[][] };

/** 文献出处（公版或仅书目） */
export type ZhouyiSourceRef = { work:string; author?:string; dynasty?:string; juan?:string; edition?:string; url?:string; license:'公版'|'仅书目' };

/** 注释条目（注音+训诂） */
export type ZhouyiAnnotation = { term:string; pinyin?:string; gloss:string; type?:string; note?:string };

/** 历代注解条目：记不准的古注一律 paraphrase:true；编者按用 kind:'今按' + school:'本教程编者按' + dynasty:'今' */
export type ZhouyiInterpretation = { kind?:string; school:string; dynasty:string; text:string; paraphrase?:boolean; plain:string };

/** 推演方法（11 种：易占 3 + 命理 1 + 堪舆 2 + 历法 1 + 五行 1 + 杂占 3） */
export type DivinationMethod = 'meihua'|'dayan'|'liuyao'|'sizhu'|'bazhai'|'xuankong'|'wuxing'|'zari'|'cezi'|'jiemeng'|'xingming';

/** 推演入参：method + 结构化 input（字符串或数字）+ 可选 seed（伪随机种子） */
export type DivinationSpec = { method:DivinationMethod; input:Record<string,string|number>; seed?:number; refLessonId?:string };

/** 推演步骤：每步给规则名、文献出处、输入输出与说明（可附图块） */
export type DivinationStep = { rule:string; sourceRef:ZhouyiSourceRef; input:string; output:string; note?:string; diagram?:ZhouyiBlock };

/** 原文引用：注释与注解元组必非空 */
export type DivinationCanonRef = { title:string; text:string; plain:string;
  annotations:[ZhouyiAnnotation, ...ZhouyiAnnotation[]];
  interpretations:[ZhouyiInterpretation, ...ZhouyiInterpretation[]] };

/** 断语：只允许来自 ZHOUYI_RULE_TABLE 白名单的条目 */
export type DivinationVerdict = { label:string; quote:string; sourceRef:ZhouyiSourceRef; plain:string; paraphrase?:boolean };

/** 推演结果总装：summary 客观描述排盘结果（不作预测）；disclaimer 固定文案 */
export type DivinationResult = { method:DivinationMethod; summary:string; steps:DivinationStep[]; diagrams:ZhouyiBlock[]; canonRefs:DivinationCanonRef[]; verdict?:DivinationVerdict; disclaimer:string; refLessonId?:string };

/** 断语白名单条目：人工预写，quote 为古籍原句（paraphrase=false）或转述（paraphrase=true） */
export type ZhouyiRuleEntry = { id:string; method:DivinationMethod; label:string; quote:string; sourceRef:ZhouyiSourceRef; plain:string; paraphrase?:boolean };

/** 事类分组（用户口语「算事情」的骨架：先问什么事，再选占法） */
export type ZhouyiCaseCategory = '婚姻'|'营建'|'工商'|'祭祀'|'生活'|'丧葬'|'身命'|'杂占';

/** 事类条目：文言事名 + 白话 + 推荐占法 + 用神口径（全部带公版出处，纯数据无 IO） */
export type ZhouyiCaseEntry = {
  id:string; name:string; plain:string; category:ZhouyiCaseCategory;
  methods:DivinationMethod[];
  /** 六爻用神口径，如「父母爻为用神」（出处随 sourceRef） */
  yongshen?:string;
  /** 黄历口径备注（动土/破土、入宅/移徙这类易错对必须写清） */
  note?:string;
  sourceRef:ZhouyiSourceRef;
};
