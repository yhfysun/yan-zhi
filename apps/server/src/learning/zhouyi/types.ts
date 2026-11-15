// 周易学习内容模型 —— 独立学科（周易课程方案-2026-11-15 §4）。
// ★ 硬约束：内容 100% 人工预写，禁止 LLM 生成/辅助填充；注释与注解每行必非空（§2.6）；
//   interpretations 只收确切注语原文（paraphrase=false），记不准一律 paraphrase=true 标「大意转述」，绝不编造。

export type ZhouyiSourceRef = { work:string; author?:string; dynasty?:string; juan?:string; edition?:string; url?:string; license:'公版'|'仅书目' };
export type ZhouyiAnnotation = { term:string; pinyin?:string; gloss:string; type?:string; note?:string };
export type ZhouyiInterpretation = { kind?:string; school:string; dynasty:string; text:string; paraphrase?:boolean; plain:string };
export type ZhouyiBlock =
  | { kind:'hexagram'; lines:Array<0|1>; moving?:number; caption?:string }
  | { kind:'bagua'; scheme:'先天'|'后天' }
  | { kind:'wuxing'; mode:'生'|'克' }
  | { kind:'hetu' } | { kind:'luoshu' }
  | { kind:'jiugong'; numbers:number[] }
  | { kind:'table'; head:string[]; rows:string[][] };
export type ZhouyiLine = {
  id:string; text:string;
  pingze?:string; plain?:string;
  annotations:[ZhouyiAnnotation, ...ZhouyiAnnotation[]];          // 非空元组
  interpretations:[ZhouyiInterpretation, ...ZhouyiInterpretation[]]; // 非空元组
  variants?:Array<{ base:string; reading:string; witness:string; note?:string }>;
  blocks?:ZhouyiBlock[];
};
export type ZhouyiStepKind = 'gloss'|'annotate'|'interpret'|'plain'|'structure'|'check';
export type ZhouyiQuickCheck = { question:string; options:string[]; answer:string; explanation:string };
export type ZhouyiTrack = 'T0'|'T1'|'T2'|'T3'|'T4'|'T5'|'T6'|'T7';
export type ZhouyiLesson = {
  id:string;
  kind:'read'|'lecture';                    // read=精读（原文+五层栈），lecture=讲义
  track:ZhouyiTrack;                        // T0 入门读法 / T1 经传精读 / T2 符号象数 / T3 易学史 / T4 易图 / T5 术数易占 / T6 风水命理 / T7 外缘方法
  branch:'经部易类'|'子部术数类'|'易学外缘'|'研究方法';
  title:string; goal:string; minutes:number;
  ready:boolean;                            // P0 只给 14 门 true，其余 false（建设中）
  source:string;
  plainSummary:[string,string,string];
  lines:ZhouyiLine[];
  structure:Array<{ label:string; hint:string; lineIndex:number }>;
  steps:ZhouyiStepKind[];
  quickCheck?:ZhouyiQuickCheck;
  stance?:string;                           // T5/T6 必填：文献与辨伪定位说明
  sources:ZhouyiSourceRef[];                // 参考书目（P0 至少 1 条）
};
export type ZhouyiTerm = { term:string; pinyin?:string; category:string; definition:string; seeAlso?:string[] };
export type ZhouyiBookEntry = { title:string; author?:string; dynasty?:string; role:'原文'|'古注'|'研究'|'工具'; license:'公版'|'仅书目'; note?:string };
export type ZhouyiCourseMeta = { id:string; track:ZhouyiTrack; name:string; goal:string; minutes:number; kind:'read'|'lecture'; ready:boolean; branch:ZhouyiLesson['branch']; code:string };
