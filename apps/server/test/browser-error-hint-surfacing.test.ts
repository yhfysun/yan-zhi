/**
 * 浏览器动作失败：`hint` 必须传到模型（2026-10-15）。
 *
 * ★★★ 现场：main.cjs 对每类动作失败都写了**可自纠指引**（`hint`）——
 *   点击"元素在 DOM 中但当前不可见，已按 DOM 点击；如未生效请先展开菜单"、
 *   输入"受控组件拦截了程序化输入，建议截图核验"、脚本"选择器失效先重新读页"……
 *   但 `callBrowserBridge` 只取 `json.error`，**把 hint 整条丢在桥这一层**（那是桌面端默认路径）。
 *   后果：模型只看得到"失败了"，看不到"下一步该怎么试" ⇒ 换着选择器盲试
 *   —— 正是用户说的"步骤不准、重复操作多"。
 *
 * 本测试钉住格式化契约（源码级：`callBrowserBridge` 需要活的 loopback 桥才能跑，成本过高）：
 *   ① 非超时失败 → 追加 hint；
 *   ② 超时（timedOut）→ **绝不**追加，也不得加"失败"前缀（会诱导重试）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, '..', 'src', 'browser-bridge.ts'), 'utf8');

/** 取 `if (json && json.error) {` 起的那段可执行代码（剥注释行）。 */
function errorBranch(): string {
  const at = SRC.indexOf('if (json && json.error) {');
  expect(at, '找不到业务错误分支 —— 被删除或改写了？').toBeGreaterThan(-1);
  return SRC.slice(at, at + 900)
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');
}

describe('浏览器动作失败：hint 必须传到模型（2026-10-15）', () => {
  it('★ 非超时失败必须把 hint 追加进返回文案', () => {
    const b = errorBranch();
    expect(b, '返回串里必须包含 hint').toMatch(/json\.hint/);
    expect(b, 'hint 必须被拼进返回文案').toMatch(/hint\}/);
  });

  it('★ 超时路径必须先短路返回、且不得追加 hint / 不得带"失败"前缀', () => {
    const b = errorBranch();
    // 超时必须**先** return，不能走到追加 hint 的那条路
    const timedOutIdx = b.indexOf('json.timedOut');
    const hintIdx = b.indexOf('json.hint');
    expect(timedOutIdx, '缺 timedOut 短路').toBeGreaterThan(-1);
    expect(hintIdx, '缺 hint 追加').toBeGreaterThan(-1);
    expect(timedOutIdx, '★ timedOut 判断必须**在** hint 追加之前（否则超时也会被加"失败"前缀与指引）')
      .toBeLessThan(hintIdx);
    expect(b, '超时分支不得出现"失败"字样').not.toMatch(/timedOut[\s\S]{0,80}失败/);
  });

  it('★ 「失败」前缀只出现在非超时分支（超时文案由 main.cjs 原文承载）', () => {
    const b = errorBranch();
    const lines = b.split('\n').map((l) => l.trim());
    const withFail = lines.filter((l) => l.includes('浏览器操作失败'));
    expect(withFail.length, '应恰好一处加"失败"前缀').toBe(1);
    // 该行的上下文不得是 timedOut 的短路返回
    expect(withFail[0], '带"失败"前缀的那行不应是 timedOut 的短路返回').not.toMatch(/timedOut/);
  });
});