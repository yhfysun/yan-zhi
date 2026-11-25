// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import ResizablePane from './ResizablePane.vue';

let app: App | null = null;

const STORAGE_KEY = 'yz.learning.v2.test-pane.v1';

async function mountPane(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(ResizablePane, {
    label: '章节目录',
    storageKey: STORAGE_KEY,
    side: 'left',
    defaultWidth: 190,
    minWidth: 34,
    maxWidth: 340,
  });
  app.mount(host);
  await nextTick();
  return host;
}

beforeEach(() => localStorage.clear());

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('ResizablePane', () => {
  it('starts at its default width and exposes a keyboard-resizable separator', async () => {
    const host = await mountPane();
    const pane = host.querySelector('.rpane') as HTMLElement;
    const separator = host.querySelector('[role="separator"]') as HTMLElement;

    expect(pane.style.width).toBe('190px');
    expect(separator.getAttribute('aria-valuenow')).toBe('190');

    separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await nextTick();
    expect(pane.style.width).toBe('206px');
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"width":206');
  });

  it('collapses to a narrow rail, persists the choice and restores on remount', async () => {
    const host = await mountPane();
    (host.querySelector('[aria-label="收起章节目录"]') as HTMLButtonElement).click();
    await nextTick();

    expect((host.querySelector('.rpane') as HTMLElement).style.width).toBe('34px');
    expect(host.querySelector('[aria-label="展开章节目录"]')).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"collapsed":true');

    app?.unmount();
    app = null;
    document.body.innerHTML = '';
    const restored = await mountPane();
    expect((restored.querySelector('.rpane') as HTMLElement).style.width).toBe('34px');
    expect(restored.querySelector('[aria-label="展开章节目录"]')).toBeTruthy();
  });

  it('points the reveal arrow back into the workspace', async () => {
    const host = await mountPane();
    (host.querySelector('[aria-label="收起章节目录"]') as HTMLButtonElement).click();
    await nextTick();

    const reveal = host.querySelector('[aria-label="展开章节目录"]') as HTMLElement;
    expect(reveal.querySelector('svg')?.getAttribute('class')).toContain('lucide-chevron-right');
  });
});
