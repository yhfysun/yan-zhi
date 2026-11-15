// 传统文化前端类型镜像 —— 与 apps/server/src/learning/culture/types.ts、canon-store.ts 同形。
// ★ ui 包 tsconfig 只 include src，不跨包 import server 源码；字段以 server 端为准，
//   两端如有出入以 server types.ts 为权威，改这里时必须同步过去（判卷口径在 @yan-zhi/shared）。

import type { CoupletCandidate, CoupletPos, CoupletTone } from '@yan-zhi/shared';

/** 注释：字词训诂层（客观——注音、释词、通假、典出、名物、句式） */
export type Annotation = {
  /** 被注的字/词（必须在原文 text 中出现，server 测试钉死） */
  term: string;
  /** 注音，如 'yuè · 此处读「悦」' */
  pinyin?: string;
  /** 释词：一句话说清这个字在此处的意思 */
  gloss: string;
  /** 注释类型（缺省 = 释词） */
  type?: '释词' | '注音' | '通假' | '典故' | '名物' | '句式' | '比喻';
  /** 备注：通假关系 / 典故出处 / 句式说明 */
  note?: string;
};

/** 注解：历代大家阐释层（paraphrase=true = 大意转述，非逐字引文） */
export type Interpretation = {
  /** 家名 + 著作，如 '朱熹《四书章句集注》' */
  school: string;
  dynasty: string;
  /** 注语：paraphrase=false 时为注语原文，true 时为转述大意 */
  text: string;
  /** true = 大意转述（非逐字引文） */
  paraphrase?: boolean;
  /** 白话：这条注在说什么 */
  plain: string;
};

/** 精读篇目的一行原文（诗行为句，散文按句读切分） */
export type CanonLine = {
  id: string;
  text: string;
  pingze?: string;
  /** 整句白话（「白话」步用；讲义行可省） */
  plain?: string;
  /** 注释：字词训诂（可空数组） */
  annotations: Annotation[];
  /** 注解：历代大家（可空数组——文库层/讲义行可为空） */
  interpretations: Interpretation[];
};

export type CultureStepKind = 'recite' | 'gloss' | 'plain' | 'structure' | 'check' | 'couplet';

export type CultureQuickCheck = {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
};

export type CultureLesson = {
  id: string;
  /** lecture = 讲义课（体裁/词牌/典籍通识）：不设诵读步，四步讲透概念 */
  kind: 'read' | 'lecture' | 'couplet' | 'recite' | 'check';
  title: string;
  goal: string;
  minutes: number;
  level: '蒙学·对韵' | '诗词歌赋' | '四书' | '五经';
  source: string;
  plainSummary: [string, string, string];
  lines: CanonLine[];
  structure: Array<{ label: string; hint: string; lineIndex: number }>;
  steps: CultureStepKind[];
  quickCheck?: CultureQuickCheck;
};

/** 对句题（候选字已由服务端打乱） */
export type CoupletLesson = {
  id: string;
  title: string;
  level: '蒙学·对韵' | '诗词歌赋' | '四书' | '五经';
  prompt: string;
  promptTone: string;
  expectPos: CoupletPos[];
  expectTone: CoupletTone[];
  candidates: CoupletCandidate[];
  sampleAnswer: string;
  sampleWhy: string;
};

/** GET /learning/culture/paths 的 data.stages[*] */
export type CulturePathStage = {
  level: string;
  lessons: Array<{ id: string; kind: string; title: string; goal: string; minutes: number; steps: CultureStepKind[] }>;
  couplets: Array<{ id: string; title: string; prompt: string; promptTone: string }>;
};

/** GET /learning/culture/canon/works 的条目（与 canon_work 表列对应） */
export type CanonWorkRow = {
  id: string;
  title: string;
  author: string | null;
  dynasty: string | null;
  genre: string | null;
  collection: string;
  tags: string[];
  popularity: string;
  difficulty: string;
  text: string;
  source: string;
  verified: boolean;
};

/** GET /learning/culture/canon/collections 的 data（五维计数） */
export type CanonCollections = {
  genres: Array<{ key: string; count: number }>;
  dynasties: Array<{ key: string; count: number }>;
  collections: Array<{ key: string; count: number }>;
  popularity: Array<{ key: string; count: number }>;
  difficulties: Array<{ key: string; count: number }>;
  total: number;
};
