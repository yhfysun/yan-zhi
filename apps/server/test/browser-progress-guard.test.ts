import { describe, expect, it } from 'vitest';
import { FORCE_STOP_MARKER } from '../src/services/tool-loop-guard.js';
import { BrowserProgressGuard } from '../src/services/browser-progress-guard.js';

describe('BrowserProgressGuard', () => {
  it('相同操作连续两次后页面签名不变 → 强制收口', () => {
    const guard = new BrowserProgressGuard();
    guard.noteResult('browser_get_page_content', {}, 'PageState: sigabc#4（页面状态）');
    guard.noteResult('browser_click', { index: 41 }, '点击成功');
    expect(guard.noteResult('browser_get_page_content', {}, 'PageState: sigabc#4（页面状态）')).toBeNull();

    guard.noteResult('browser_click', { index: 41 }, '点击成功');
    const blocked = guard.noteResult('browser_get_page_content', {}, 'PageState: sigabc#4（页面状态）');
    expect(blocked).toContain(FORCE_STOP_MARKER);
    expect(blocked).toContain('PageState 未变化');
  });

  it('页面状态发生变化 → 进度计数清零', () => {
    const guard = new BrowserProgressGuard();
    guard.noteResult('browser_get_page_content', {}, 'PageState: sig-old#4');
    guard.noteResult('browser_click', { index: 41 }, '点击成功');
    guard.noteResult('browser_get_page_content', {}, 'PageState: sig-old#4');

    guard.noteResult('browser_click', { index: 41 }, '点击成功');
    expect(guard.noteResult('browser_get_page_content', {}, 'PageState: sig-new#5')).toBeNull();
  });

  it('操作参数不同 → 不算同一操作的无进展重试', () => {
    const guard = new BrowserProgressGuard();
    guard.noteResult('browser_get_page_content', {}, 'PageState: sigabc#4');
    guard.noteResult('browser_click', { index: 41 }, '点击成功');
    guard.noteResult('browser_get_page_content', {}, 'PageState: sigabc#4');

    guard.noteResult('browser_click', { index: 42 }, '点击成功');
    expect(guard.noteResult('browser_get_page_content', {}, 'PageState: sigabc#4')).toBeNull();
  });
});
