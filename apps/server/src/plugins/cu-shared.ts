// computer-use / remote-control 共享护栏：危险组合键与应用黑名单。
// ------------------------------------------------------------------
// 单独成文件的原因：远控（remote-control）与电脑使用（computer-use）的输入注入
// 必须执行同一份黑名单策略，否则会出现「聊天里按不得的键，远控面板按得」的策略分叉。
// 本文件只放纯逻辑（可单测），不碰插件 ctx。
import path from 'node:path';

/** 危险组合键黑名单（小写、修饰符排序后匹配） */
export const DENIED_KEY_COMBOS = new Set([
  'alt+f4',
  'ctrl+alt+del',
  'ctrl+alt+delete',
  'ctrl+shift+esc',
  'ctrl+shift+escape',
]);

/** open_app / 启动类操作进程名黑名单 */
export const DENIED_APPS = new Set([
  'shutdown', 'logoff', 'restart', 'taskkill', 'tskill', 'format', 'diskpart',
  'cipher', 'vssadmin', 'bcdedit', 'rundll32', 'reg', 'regedit', 'regsvr32',
]);

/** 组合键归一化：小写、去空格、修饰符排序后 `+` 连接 */
export function normalizeKeyCombo(keys: string[]): string {
  return keys
    .map((k) => String(k).trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('+');
}

/** 校验组合键是否允许（Win 键组合、黑名单组合一律拒绝，Win+Space 除外），不通过直接抛错 */
export function assertComboAllowed(keys: string[]): void {
  // 空格键在控制端是字面量 ' '，normalizeKeyCombo 会把纯空白 trim 掉 —— 先换成键名再归一
  const norm = normalizeKeyCombo(keys.map((k) => (String(k) === ' ' ? 'space' : k)));
  if (!norm) throw new Error('keys 不能为空');
  // Win 键默认整条黑名单（Win+R / Win+L / Win+E 都能把被控端带到不可控状态）。
  // 唯一放行 Win+Space：Windows 切输入法的主快捷键，无害且远控里高频需要。
  const hasWin = keys.some((k) => /^(win|super|meta|windows)$/.test(String(k).trim().toLowerCase()));
  if (hasWin && norm !== 'space+win') {
    throw new Error('不允许使用 Win 键组合（黑名单；仅放行 Win+Space 切换输入法）');
  }
  if (DENIED_KEY_COMBOS.has(norm)) throw new Error(`组合键 "${norm}" 在黑名单中，已拒绝`);
}

/** 校验启动目标是否允许（shell 元字符、黑名单进程名一律拒绝），不通过直接抛错 */
export function assertAppAllowed(target: string): void {
  const t = target.trim();
  if (!t) throw new Error('target 不能为空');
  if (/[&|;<>\^%"\n\r]/.test(t)) throw new Error('target 含非法字符（不允许 shell 元字符）');
  const base = path.basename(t, '.exe').toLowerCase();
  if (DENIED_APPS.has(base)) throw new Error(`应用 "${base}" 在黑名单中，已拒绝`);
}
