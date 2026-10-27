/**
 * run_script 语义熔断（服务端 Playwright 链路，2026-10-27）
 *
 * 与桌面端 apps/desktop/main.cjs 的 ===YZ-SCRIPT-FUSE=== 同一判据（两处需同步修改）：
 * 只对**破坏性脚本**（清空/整段改写）计数，按"页面 + 编辑目标 + 短载荷"做指纹，
 * 同目标同载荷第 2 次、同目标换文案第 4 次拒绝。URL 归一化去掉 t/_t/ts 等缓存参数，
 * 防止换个 &t=2 就把计数清零。
 *
 * 背景：conv c79811d2 在抖音编辑页反复「清空末行→写 #话题→回读 chip」96 次，
 * 服务端这条路（Web/移动端）此前完全没有脚本计数，模型换参数就能一直重试。
 */

export const SCRIPT_FUSE_EXACT_LIMIT = 2;
export const SCRIPT_FUSE_COARSE_LIMIT = 4;
export const SCRIPT_FUSE_TTL_MS = 30 * 60 * 1000;

export function fuseNormUrl(href: string): string {
  try {
    const u = new URL(String(href || ''));
    for (const k of ['t', '_t', 'ts', 'timestamp', '_']) u.searchParams.delete(k);
    u.hash = '';
    return u.origin + u.pathname + (u.search || '');
  } catch {
    return String(href || '').replace(/([?&])(t|_t|ts|timestamp|_)=[^&]*/g, '').replace(/#.*$/, '');
  }
}

function normText(s: unknown): string {
  return String(s == null ? '' : s).replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
}

export interface ScriptFuseKey {
  coarse: string;
  exact: string;
}

/** 只读脚本返回 null（不参与熔断） */
export function scriptFuseKey(script: string): ScriptFuseKey | null {
  const s = String(script || '');
  // ★ 只把**真正删除/整段赋值**算作破坏性动作：selectNodeContents 本身只是建 Range，
  //   配方用它定位光标（见 douyin-insert-topics），不能因此被判成"清空"。
  const destructive = /deleteContents|execCommand\(\s*['"](?:delete|selectAll)|\.textContent\s*=|\.innerHTML\s*=|removeChild\s*\(|\.value\s*=\s*['"]['"]/i.test(s);
  if (!destructive) return null;
  const literals = [...s.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n]){2,160})\1/g)].map((m) => normText(m[2]));
  const isSelector = (t: string): boolean => {
    if (!t) return false;
    if (/[一-龥]/.test(t) && !/contenteditable|data-|aria-/i.test(t)) return false;
    return /^[.#\[]/.test(t)
      || /^(div|span|input|textarea|button|form|p|li|ul|section|a)\b/i.test(t)
      || /contenteditable|data-|aria-|role=/i.test(t);
  };
  const targets = [...new Set(literals.filter(isSelector))].sort();
  const isPayload = (t: string): boolean => !!t && !isSelector(t) && t.length <= 20 && !/[=(){}\[\];<>]/.test(t);
  const payload = [...new Set(literals.filter(isPayload))].sort();
  const coarse = targets.join('|');
  return { coarse, exact: coarse + '::' + payload.join('|') };
}

export interface ScriptFuseResult {
  blocked: boolean;
  exact?: number;
  coarse?: number;
  message?: string;
}

interface Counter { n: number; at: number }

/**
 * @param state 进程内 Map（调用方持有，模块级常量即可）；测试可注入并控制 now
 */
export function scriptFuseCheck(
  script: string,
  href: string,
  state: Map<string, Counter>,
  now: number = Date.now(),
): ScriptFuseResult {
  const key = scriptFuseKey(script);
  if (!key) return { blocked: false };
  const page = fuseNormUrl(href);
  for (const [k, v] of state) if (now - v.at > SCRIPT_FUSE_TTL_MS) state.delete(k);
  const exactKey = 'e|' + page + '|' + key.exact;
  const coarseKey = 'c|' + page + '|' + key.coarse;
  const e = state.get(exactKey) || { n: 0, at: now };
  e.n += 1; e.at = now; state.set(exactKey, e);
  const c = state.get(coarseKey) || { n: 0, at: now };
  c.n += 1; c.at = now; state.set(coarseKey, c);
  if (e.n >= SCRIPT_FUSE_EXACT_LIMIT) {
    return {
      blocked: true, exact: e.n, coarse: c.n,
      message: `同一编辑目标已用脚本重写 ${e.n} 次（清空/重填同一段内容），判定为不收敛。`
        + '停止继续改写：改用固定的站点配方（如 browser_run_recipe douyin-insert-topics），'
        + '或先 browser_get_page_content 读一次现状再汇报。反复清空会让富文本编辑器的内部状态与 DOM 不同步，越写越坏。',
    };
  }
  if (c.n >= SCRIPT_FUSE_COARSE_LIMIT) {
    return {
      blocked: true, exact: e.n, coarse: c.n,
      message: `同一编辑目标已被脚本改写 ${c.n} 次（同目标换了不同文案）。`
        + '这说明该路径整体不通，不是文案问题：停止换文案重试，改用配方或直接汇报已核实的事实与下一步。',
    };
  }
  return { blocked: false, exact: e.n, coarse: c.n };
}
