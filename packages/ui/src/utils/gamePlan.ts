/**
 * 「一键开跑」的按键序列解析（P2，2026-10-29）。
 *
 * 输入是执行条上那一行文本，语法刻意做得极简，因为它要覆盖网页游戏最常见的三种动作：
 *   `Down`            点一下
 *   `Space*800`       按住 800ms（蓄力/长按）
 *   `Right+Up*800`    两个键同时按住 800ms（斜向移动）
 * 多个动作用逗号分隔，按顺序在一轮内执行。
 *
 * 抽成纯函数是为了能直接单测：解析错了会变成"按错键"，而游戏里按错键的代价是
 * 直接的（角色跑反、误触发技能），不可能靠人眼在每一步都复核。
 */

export interface LoopStep {
  type: 'key' | 'hold';
  key?: string;
  keys?: string[];
  holdMs?: number;
  ms?: number;
}

export interface ParseResult {
  steps: LoopStep[];
  error?: string;
}

const KEY_RE = /^[A-Za-z0-9_]+$/;

export function parseKeySequence(input: string): ParseResult {
  const raw = String(input || '').trim();
  if (!raw) return { steps: [], error: '请输入按键序列，例如：Down,Left 或 Space*800' };

  const steps: LoopStep[] = [];
  const tokens = raw.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) return { steps: [], error: '请输入按键序列' };

  for (const token of tokens) {
    const m = token.match(/^([^*]+?)(?:\*(\d+))?$/);
    if (!m) return { steps: [], error: `看不懂这一段：${token}` };
    const names = m[1].split('+').map((k) => k.trim()).filter(Boolean);
    const ms = m[2] ? Number(m[2]) : 0;

    if (!names.length) return { steps: [], error: `这一段没有按键：${token}` };
    for (const n of names) {
      if (!KEY_RE.test(n)) return { steps: [], error: `按键名不合法：${n}（只支持字母/数字/下划线，如 Down、ArrowLeft、Space）` };
    }
    if (ms < 0 || ms > 10000) return { steps: [], error: `按住时长需在 0–10000ms：${token}` };

    if (names.length === 1 && !ms) steps.push({ type: 'key', key: names[0] });
    else steps.push({ type: 'hold', keys: names, ms: ms || 500 });
  }

  if (steps.length > 20) return { steps: [], error: '一轮最多 20 个动作，请拆成多次运行' };
  return { steps };
}
