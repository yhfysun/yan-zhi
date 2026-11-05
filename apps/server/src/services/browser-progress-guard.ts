import { FORCE_STOP_MARKER } from './tool-loop-guard.js';
import { BROWSER_NAV_STREAK_LIMIT } from '../constants.js';

export { BROWSER_NAV_STREAK_LIMIT } from '../constants.js';

/**
 * 进度守卫的隔离键：浏览器流 + 单次子智能体执行。
 *
 * 同步 pageAgent 默认共用 `shared` 流；若只按流键记账，上一个子任务留下的计数会污染
 * 下一个子任务。parentToolCallId 是每次委派的唯一生命周期 ID，必须一起进键。
 */
export function browserProgressGuardKey(flowKey: string, parentToolCallId?: string): string {
  return parentToolCallId ? `${flowKey}::sub:${parentToolCallId}` : flowKey;
}

const MUTATING_BROWSER_TOOLS = new Set([
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_fill_form',
  'browser_submit_form',
  'browser_upload',
  'browser_press_key',
  'browser_select_option',
  'browser_check',
  'browser_uncheck',
  'browser_run_recipe',
]);

const PROGRESS_BROWSER_TOOLS = new Set([
  'browser_click',
  'browser_type',
  'browser_fill_form',
  'browser_submit_form',
  'browser_upload',
  'browser_press_key',
  'browser_select_option',
  'browser_check',
  'browser_uncheck',
  'browser_run_recipe',
]);

function actionKey(toolName: string, args: unknown): string {
  let payload = '';
  try {
    const obj = args && typeof args === 'object' ? args as Record<string, unknown> : { value: args };
    payload = JSON.stringify(obj, Object.keys(obj).sort());
  } catch {
    payload = String(args);
  }
  return `${toolName}::${payload.slice(0, 600)}`;
}

function looksSuccessful(text: string): boolean {
  const s = String(text || '').trim();
  if (!s) return false;
  if (s.startsWith(FORCE_STOP_MARKER)) return false;
  return !/^(Error|工具执行失败)|浏览器操作失败|未找到匹配元素|超时|timed out|timeout/i.test(s);
}

function pageSignature(text: string): string {
  const raw = String(text || '');
  const explicit = raw.match(/PageState:\s*([^\s（(]+)/)?.[1];
  if (explicit) return explicit;

  // 兼容旧版桌面回执：未显式带 PageState 时，用 URL + 标题 + 编号元素序列
  // 生成同口径的轻量签名。否则守卫会静默失效（2026-11-03 实报：同一页反复查询，
  // 日志里只有业务回执，没有进展守卫触发）。
  const url = raw.match(/^URL:\s*(.+)$/m)?.[1]?.trim() || '';
  const title = raw.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || '';
  const count = Number(raw.match(/【可交互元素】\((\d+)\s*个/)?.[1] || 0);
  const elements = [...raw.matchAll(/^\[(\d+)\]\s+([a-z0-9-]+)/gm)]
    .map((m) => `${m[1]}:${m[2]}`)
    .join(',');
  if (!url && !title && !count && !elements) return '';

  const src = `${url}|${title}|${elements}`;
  let sig = 5381;
  for (let i = 0; i < src.length; i++) sig = ((sig << 5) + sig + src.charCodeAt(i)) >>> 0;
  return `legacy${sig.toString(16)}#${count || elements.split(',').filter(Boolean).length}`;
}

/**
 * 浏览器动作级进展守卫：同一操作成功后连续两次读到同一 PageState，判定原地打转。
 * 只在有“读页回执”时生效，避免把 scroll/wait 这类不一定改变交互集合的动作误判。
 */
export class BrowserProgressGuard {
  private pendingAction = '';
  private lastAction = '';
  private lastSignature = '';
  private sameActionWithoutProgress = 0;
  private navigationsWithoutProgress = 0;

  noteResult(toolName: string, args: unknown, text: string): string | null {
    if (MUTATING_BROWSER_TOOLS.has(toolName)) {
      const successful = looksSuccessful(text);
      this.pendingAction = successful ? actionKey(toolName, args) : '';
      if (!successful) return null;
      if (toolName === 'browser_navigate') {
        this.navigationsWithoutProgress++;
        if (this.navigationsWithoutProgress >= BROWSER_NAV_STREAK_LIMIT) {
          return `${FORCE_STOP_MARKER} 已连续导航 ${this.navigationsWithoutProgress} 次，期间没有任何点击、输入、上传或填表进展。`
            + '这通常是在不断换站点碰运气，继续 navigate 不会产生新结论。'
            + '请立即停止导航，直接汇报：已查到什么、哪些数据公开不可得、建议用户下一步怎么做。';
        }
      } else if (PROGRESS_BROWSER_TOOLS.has(toolName)) {
        this.navigationsWithoutProgress = 0;
      }
      return null;
    }
    if (toolName !== 'browser_get_page_content') return null;

    const signature = pageSignature(text);
    if (!signature) return null;
    const pending = this.pendingAction;
    this.pendingAction = '';
    if (!pending) {
      this.lastSignature = signature;
      return null;
    }

    const sameAction = pending === this.lastAction;
    const unchanged = !!this.lastSignature && signature === this.lastSignature;
    if (!unchanged) this.sameActionWithoutProgress = 0;
    else if (sameAction) this.sameActionWithoutProgress++;
    else this.sameActionWithoutProgress = 1;
    this.lastAction = pending;
    this.lastSignature = signature;

    if (this.sameActionWithoutProgress < 2) return null;
    return `${FORCE_STOP_MARKER} 同一浏览器操作已连续 2 次执行后 PageState 未变化（${signature}）。`
      + '页面没有响应这次操作，继续重试同一动作不会产生新结果。请立即停止浏览器操作，'
      + '直接汇报：当前页面是什么、哪一步没有生效、用户下一步应手动检查什么。';
  }
}
