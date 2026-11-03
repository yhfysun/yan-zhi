import { FORCE_STOP_MARKER } from './tool-loop-guard.js';

const MUTATING_BROWSER_TOOLS = new Set([
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_fill_form',
  'browser_submit_form',
  'browser_upload',
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
  return String(text || '').match(/PageState:\s*([^\s（(]+)/)?.[1] || '';
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

  noteResult(toolName: string, args: unknown, text: string): string | null {
    if (MUTATING_BROWSER_TOOLS.has(toolName)) {
      this.pendingAction = looksSuccessful(text) ? actionKey(toolName, args) : '';
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
