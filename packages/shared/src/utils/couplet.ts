// 对句（对对子）判卷 —— server 端内容包与 ui 端对句台共用的唯一实现。
// ★ 放 shared 的原因（判据「同一语义只能有一处实现」）：平仄/词性口径若两端各写一份，
//   判卷结果必然漂移（同一个答案服务端说对、前端说错）。与 pricing-migration
//   「唯一驱动」同一道理。
// 教学规则（docs/传统文化与音乐学习模式方案 §3.1）：字数相等 + 词性相对 + 平仄相对。
// 期望平仄由题目离线预生成（出句仄收 → 对句平收），本函数只做逐位比对，不推断规则。

export type CoupletPos = '名' | '动' | '形' | '副' | '数' | '量' | '代' | '介' | '连' | '助';
export type CoupletTone = '平' | '仄';

/** 候选字块：字 + 词性 + 平仄（题目离线预写，判卷口径与期望一致） */
export type CoupletCandidate = {
  ch: string;
  pos: CoupletPos;
  tone: CoupletTone;
  pinyin?: string;
};

export type CoupletSlotVerdict = {
  index: number;
  ch: string;
  posOk: boolean;
  toneOk: boolean;
};

export type CoupletJudgeResult = {
  filled: number;
  required: number;
  /** 字数相等（填满所有字位槽） */
  lengthOk: boolean;
  posOkCount: number;
  toneOkCount: number;
  posAllOk: boolean;
  toneAllOk: boolean;
  /** 三项全过 */
  pass: boolean;
  /** 最先命中的平仄问题，如「第 4 字「春」应仄」；无则 null */
  firstToneIssue: string | null;
  /** 最先命中的词性问题，如「第 2 字「归」应为动词」；无则 null */
  firstPosIssue: string | null;
  /** 逐位判定（供 UI 逐格高亮；只含已填位） */
  slots: CoupletSlotVerdict[];
};

/**
 * 对句逐项判卷（纯函数，可直接单测）。
 * - `picked` 与 `expectPos` 等长，未填位为 null；
 * - 超长输入按 `expectPos` 截断比对，不崩溃（ui 侧槽位数量固定，此为防御）；
 * - 只提示、不裁决「不及格」——反馈语义由调用方包装（错了不惩罚）。
 */
export function judgeCouplet(
  expectPos: CoupletPos[],
  expectTone: CoupletTone[],
  picked: Array<CoupletCandidate | null>,
): CoupletJudgeResult {
  const required = expectPos.length;
  // 只统计前 required 位（ui 侧槽位数量固定，超长输入视为无效部分直接忽略）
  const filled = picked.slice(0, required).reduce<number>((n, p) => (p ? n + 1 : n), 0);
  const slots: CoupletSlotVerdict[] = [];
  let posOkCount = 0;
  let toneOkCount = 0;
  let firstToneIssue: string | null = null;
  let firstPosIssue: string | null = null;
  for (let i = 0; i < required; i++) {
    const got = picked[i] ?? null;
    if (!got) continue;
    const posOk = got.pos === expectPos[i];
    const toneOk = got.tone === expectTone[i];
    if (posOk) posOkCount++;
    else if (!firstPosIssue) firstPosIssue = `第 ${i + 1} 字「${got.ch}」应为${expectPos[i]}词`;
    if (toneOk) toneOkCount++;
    else if (!firstToneIssue) firstToneIssue = `第 ${i + 1} 字「${got.ch}」应${expectTone[i]}`;
    slots.push({ index: i, ch: got.ch, posOk, toneOk });
  }
  const lengthOk = filled === required;
  const posAllOk = lengthOk && posOkCount === required;
  const toneAllOk = lengthOk && toneOkCount === required;
  return {
    filled,
    required,
    lengthOk,
    posOkCount,
    toneOkCount,
    posAllOk,
    toneAllOk,
    pass: lengthOk && posAllOk && toneAllOk,
    firstToneIssue,
    firstPosIssue,
    slots,
  };
}
