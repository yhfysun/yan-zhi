// 周易学科前端类型镜像 —— 与 apps/server/src/learning/zhouyi/*（另一代理实现中）同形。
// ★ @yan-zhi/shared 正在新增 Zhouyi* 导出；收口完成后，把下方本地定义替换为
//   `export type { ZhouyiAnnotation, ... } from '@yan-zhi/shared'` 风格的 re-export。
//   在此之前先按服务端契约在本地定义（字段以 server 端为准）。
// ★ ui 包 tsconfig 只 include src，不跨包 import server 源码，与 culture-types.ts 同口径。

/** 周易学习步骤（按 lesson.steps 顺序渲染，一次一步） */
export type ZhouyiStepKind = 'gloss' | 'annotate' | 'interpret' | 'plain' | 'structure' | 'check';

/** 注释：字词训诂层（注音、释词、通假、典出、名物等） */
export type ZhouyiAnnotation = {
  /** 被注的字/词（必须在原文 text 中出现，切词最长匹配依赖此约束） */
  term: string;
  /** 注音，如 'qián · 音虔' */
  pinyin?: string;
  /** 释词：一句话说清这个字在此处的意思 */
  gloss: string;
  /** 注释类型（缺省 = 释词）：释词/注音/通假/典故/名物/句式… */
  type?: string;
  /** 备注：通假关系 / 典故出处 / 校勘说明 */
  note?: string;
};

/** 注解：历代注家阐释层（paraphrase=true = 大意转述，非逐字引文） */
export type ZhouyiInterpretation = {
  /** 体例：传/注/笺/疏/正义/集解/今按（缺省按「总论」归组） */
  kind?: string;
  /** 家名 + 著作，如 '王弼《周易注》' */
  school: string;
  dynasty: string;
  /** 注语：paraphrase!==true 时为注语原文，true 时为转述大意 */
  text: string;
  /** true = 大意转述（非逐字引文） */
  paraphrase?: boolean;
  /** 白话：这条注在说什么 */
  plain: string;
};

// 待收口到 @yan-zhi/shared（shared 的 zhouyiBlockToShapes 输出元素）
export type ZhouyiShape = {
  kind: string;
  [key: string]: unknown;
};

// 待收口到 @yan-zhi/shared（卦象/图示块，经 zhouyiBlockToShapes 转成 ZhouyiShape[]）
export type ZhouyiBlock = {
  kind?: string;
  [key: string]: unknown;
};

/** 异文：同一处文字的不同传本读法 */
export type ZhouyiVariant = {
  base: string;
  reading: string;
  witness: string;
  note?: string;
};

/** 周易篇目的一行原文（卦爻辞为条，传文按句读切分） */
export type ZhouyiLine = {
  id: string;
  text: string;
  /** 平仄/卦序标记（展示用） */
  pingze?: string;
  /** 整句白话（「白话」步用） */
  plain?: string;
  /** 注释：字词训诂（契约保证必非空） */
  annotations: ZhouyiAnnotation[];
  /** 注解：历代注家（契约保证必非空） */
  interpretations: ZhouyiInterpretation[];
  variants?: ZhouyiVariant[];
  blocks?: ZhouyiBlock[];
};

/** 自测题（前端判卷，口径随内容包下发） */
export type ZhouyiQuickCheck = {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
};

/** 底本 / 参考书目 */
export type ZhouyiSource = {
  work: string;
  author?: string;
  dynasty?: string;
  juan?: string;
  /** 公版 = 正文可用；仅书目 = 只列出处不引文 */
  license: '公版' | '仅书目';
};

/** GET /learning/zhouyi/lessons/:id 的 data */
export type ZhouyiLesson = {
  id: string;
  /** read = 原文精读（注释步带诵读）；lecture = 概念讲义（gloss 步讲透概念） */
  kind: 'read' | 'lecture';
  /** 所属路径 T0-T7 */
  track: string;
  branch: string;
  title: string;
  goal: string;
  minutes: number;
  /** false = 建设中，总览层不可进入 */
  ready: boolean;
  /** 底本，如 '《周易正义》阮刻十三经注疏本' */
  source: string;
  /** 篇级白话摘要（server 下发三句） */
  plainSummary: string[];
  lines: ZhouyiLine[];
  /** 篇章脉络：节点串讲 + 对应行号 */
  structure: Array<{ label: string; hint: string; lineIndex: number }>;
  /** 本课步骤序列（沉浸台按此顺序渲染） */
  steps: ZhouyiStepKind[];
  quickCheck?: ZhouyiQuickCheck;
  /** 编者立场说明（题解步展示） */
  stance?: string;
  sources: ZhouyiSource[];
};

/** 路径（T0-T7 八条学习路径） */
export type ZhouyiTrack = {
  id: string;
  name: string;
  desc: string;
};

/** 路径下的课时条目（总览层列表用，不携带原文） */
export type ZhouyiCourse = {
  id: string;
  track: string;
  name: string;
  goal: string;
  minutes: number;
  kind: 'read' | 'lecture';
  ready: boolean;
  branch: string;
};

/** 术语索引条目（/paths 下发，总览层「术语索引」Tab 渲染） */
export type ZhouyiTerm = {
  term: string;
  pinyin?: string;
  category: string;
  definition: string;
  seeAlso?: string[];
};

/** 课程参考书目条目 */
export type ZhouyiBookEntry = {
  title: string;
  author?: string;
  dynasty?: string;
  role: string;
  license: '公版' | '仅书目';
  note?: string;
};

/** 文库精选集条目（canon-data.ts，唯一 re-export 口在 server curriculum） */
export type ZhouyiCanonWork = {
  id: string;
  title: string;
  author?: string;
  dynasty: string;
  category: string;
  license: '公版' | '仅书目';
  excerptLines: Array<{ text: string; note?: string }>;
};

/** GET /learning/zhouyi/paths 的 data */
export type ZhouyiPathsData = {
  tracks: ZhouyiTrack[];
  courses: ZhouyiCourse[];
  terms: ZhouyiTerm[];
  bibliography: ZhouyiBookEntry[];
  canon: ZhouyiCanonWork[];
  disclaimer: string;
};
