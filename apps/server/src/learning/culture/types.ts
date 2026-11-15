// 传统文化学习内容模型 —— 精读层（本文件与 curriculum/canon-data 的 TS 常量）。
// ★ 硬约束（用户拍板，docs/传统文化与音乐学习模式方案-2026-11-14.md §2.3-2 / §4.7）：
//   精读层注解 100% 人工预写，禁止任何 LLM 生成/辅助填充本层内容；
//   `assisted`（AI 生成）只允许出现在文库层 canon_gloss 缓存，与本层无关。
// 注解四层（§2.3-1）：字面 → 白话 → 背景 → 一句话说明白；禁止裸用术语。

import type { CoupletCandidate, CoupletPos, CoupletTone } from '@yan-zhi/shared';


/** 注释：字词训诂层（客观——注音、释词、通假、典出、名物、句式） */
export type Annotation = {
  /** 被注的字/词（必须在原文 text 中出现，测试钉死） */
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

/** 注解：历代大家阐释层（各家的「说」）——只收确切记得的注语原文，记不准一律 paraphrase=true 标「大意转述」 */
export type Interpretation = {
  /** 家名 + 著作，如 '朱熹《四书章句集注》' '毛传' '左传' */
  school: string;
  dynasty: string;
  /** 注语：paraphrase=false 时为注语原文，true 时为转述大意 */
  text: string;
  /** true = 大意转述（非逐字引文）——防编造的关键标记 */
  paraphrase?: boolean;
  /** 白话：这条注在说什么 */
  plain: string;
};

/** 精读篇目的一行原文（诗行为句，散文按句读切分） */
export type CanonLine = {
  id: string;
  text: string;
  /** 平仄标注，与去标点后的字逐位等长（诗体必填，散文可省）；单字 '平'/'仄' */
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
  /** 与 options 之一全等；前端判卷（对齐英语主线 quickCheck 做法） */
  answer: string;
  explanation: string;
};

export type CultureLesson = {
  id: string;
  /** lecture = 讲义课（体裁/词牌/典籍通识）：不设诵读步，四步讲透概念，不与精读课重复 */
  kind: 'read' | 'lecture' | 'couplet' | 'recite' | 'check';
  title: string;
  goal: string;
  minutes: number;
  /** 阶（内容包自己的 level，不进全局学段） */
  level: '蒙学·对韵' | '诗词歌赋' | '四书' | '五经';
  /** 底本依据（原文公版 + 版本说明） */
  source: string;
  /** 「这一篇到底在说什么」3 句白话总览 */
  plainSummary: [string, string, string];
  lines: CanonLine[];
  /** 章句脉络（第 4 步），lineIndex 指回 lines */
  structure: Array<{ label: string; hint: string; lineIndex: number }>;
  steps: CultureStepKind[];
  quickCheck?: CultureQuickCheck;
};

/** 对句台题目：出句与期望口径全部离线预写，判卷走 shared judgeCouplet */
export type CoupletLesson = {
  id: string;
  title: string;
  /** 阶（蒙学从一字对起步，逐步加长） */
  level: '蒙学·对韵' | '诗词歌赋' | '四书' | '五经';
  /** 出句（大字展示，标点不含） */
  prompt: string;
  /** 出句平仄（与 prompt 逐字等长） */
  promptTone: string;
  /** 对句期望：词性/平仄逐位 */
  expectPos: CoupletPos[];
  expectTone: CoupletTone[];
  /** 候选字块（正确字 + 干扰字，全部带真实口径） */
  candidates: CoupletCandidate[];
  /** 古人范本（对句正解） */
  sampleAnswer: string;
  /** 为什么这么对（一句白话） */
  sampleWhy: string;
};

/** 典籍文库 · 精选集条目（文库层走 canon_work 表，本类型与 DB 列一一对应） */
export type CanonWork = {
  id: string;
  title: string;
  author: string;
  dynasty: '先秦' | '两汉' | '魏晋南北朝' | '唐' | '五代' | '宋' | '元' | '明' | '清';
  genre: '经' | '诗' | '词' | '曲' | '文' | '蒙学';
  /** 丛书，如 '唐诗三百首'；无丛书为 '' */
  collection: string;
  /** 主题 tag 数组，如 ['思乡','月亮'] */
  tags: string[];
  /** classic 经典 | notable 冷门佳作 | normal */
  popularity: 'classic' | 'notable' | 'normal';
  difficulty: '蒙学' | '入门' | '进阶' | '深造';
  /** 原文全文（长文选段在 title 标注「（节选）」） */
  text: string;
  /** 来源说明，如 '通行本' / 'chinese-poetry' */
  source: string;
};
