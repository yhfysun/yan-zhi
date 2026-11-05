import { describe, expect, it } from 'vitest';
import { FORCE_STOP_MARKER } from '../src/services/tool-loop-guard.js';
import {
  BROWSER_NAV_STREAK_LIMIT,
  BrowserProgressGuard,
  browserProgressGuardKey,
} from '../src/services/browser-progress-guard.js';

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

  it('旧版桌面回执没有 PageState 时仍能识别同页无进展', () => {
    const guard = new BrowserProgressGuard();
    const page = 'URL: https://example.com/list\nTitle: 商品列表\n\n【页面可见文本】\n暂无结果\n\n【可交互元素】(1 个，编号可直接用于 browser_click/browser_type 的 index 参数)\n[0] input[type=search]';
    guard.noteResult('browser_get_page_content', {}, page);
    guard.noteResult('browser_click', { index: 41 }, 'click 执行成功');
    expect(guard.noteResult('browser_get_page_content', {}, page)).toBeNull();

    guard.noteResult('browser_click', { index: 41 }, 'click 执行成功');
    const blocked = guard.noteResult('browser_get_page_content', {}, page);
    expect(blocked).toContain(FORCE_STOP_MARKER);
    expect(blocked).toContain('PageState 未变化');
  });

  it('连续换 URL 但没有任何交互进展 → 达到导航硬上限后强制收口', () => {
    const guard = new BrowserProgressGuard();
    for (let i = 1; i < BROWSER_NAV_STREAK_LIMIT; i++) {
      expect(guard.noteResult('browser_navigate', { url: `https://example.com/${i}` }, 'URL: ok')).toBeNull();
    }
    const blocked = guard.noteResult(
      'browser_navigate',
      { url: `https://example.com/${BROWSER_NAV_STREAK_LIMIT}` },
      'URL: ok',
    );
    expect(blocked).toContain(FORCE_STOP_MARKER);
    expect(blocked).toContain(`连续导航 ${BROWSER_NAV_STREAK_LIMIT} 次`);
  });

  it('一次真实交互会清零导航硬计数', () => {
    const guard = new BrowserProgressGuard();
    for (let i = 1; i < BROWSER_NAV_STREAK_LIMIT; i++) {
      guard.noteResult('browser_navigate', { url: `https://example.com/${i}` }, 'URL: ok');
    }
    guard.noteResult('browser_type', { text: '猫抓板' }, 'type 执行成功');
    for (let i = 1; i < BROWSER_NAV_STREAK_LIMIT; i++) {
      expect(guard.noteResult('browser_navigate', { url: `https://example.org/${i}` }, 'URL: ok')).toBeNull();
    }
  });

  it('共用 shared 流时，不同子任务使用不同守卫账本', () => {
    const first = browserProgressGuardKey('shared', 'call_a');
    const second = browserProgressGuardKey('shared', 'call_b');
    expect(first).not.toBe(second);
    expect(browserProgressGuardKey('shared')).toBe('shared');
  });
});
