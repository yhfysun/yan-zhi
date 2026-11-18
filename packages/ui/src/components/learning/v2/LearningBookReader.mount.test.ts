// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import LearningBookReader from './LearningBookReader.vue';

let app: App | null = null;

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('LearningBookReader', () => {
  it('loads bundled book text, renders the current chapter and keeps progress in the app', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(LearningBookReader, {
      book: {
        id: 'classics-three-kingdoms',
        title: '三国演义',
        author: '罗贯中',
        language: 'zh-Hant',
        readingMode: 'builtin',
        assetKey: 'three-kingdoms',
        sourceName: '内置公版全文',
        license: '公版',
        annotations: [{ term: '荆州', gloss: '古代九州之一，也是三国争夺要地。' }],
      },
    });
    app.mount(host);
    await vi.waitFor(() => {
      expect(host.textContent).toContain('三国演义');
      expect(host.querySelector('[data-reader-content]')).toBeTruthy();
    });

    expect(host.querySelector('[data-reader-chapters]')).toBeTruthy();
    expect(host.textContent).toContain('注释');
    expect(host.textContent).not.toContain('去来源阅读');

    (host.querySelector('[aria-label="阅读设置"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelectorAll('.lbr-theme-grid button')).toHaveLength(5);
    expect(host.textContent).toContain('行距');
    expect(host.textContent).toContain('字间距');
    expect(host.textContent).toContain('护眼模式');
    expect(host.textContent).toContain('关灯模式');

    const green = [...host.querySelectorAll('.lbr-theme-grid button')]
      .find((button) => button.textContent?.includes('护眼')) as HTMLButtonElement;
    green.click();
    await nextTick();
    expect(host.querySelector('.learning-book-reader')?.classList.contains('theme-green')).toBe(true);
    expect(localStorage.getItem('yz.learning.v2.reader.preferences.v1')).toContain('"theme":"green"');
  });
});
