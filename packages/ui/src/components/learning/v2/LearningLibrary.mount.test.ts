// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getLearningV2Library } from '@yan-zhi/shared';
import LearningLibrary from './LearningLibrary.vue';

let app: App | null = null;

async function mountLibrary(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(LearningLibrary, {
    records: getLearningV2Library(),
    accent: '#8d4638',
    tint: '#f7ece8',
  });
  app.mount(host);
  await nextTick();
  return host;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('LearningLibrary', () => {
  it('keeps navigation and primary actions neutral instead of coloring the whole dialog with the subject accent', () => {
    const css = readFileSync(resolve(__dirname, 'learning-library.css'), 'utf8');

    expect(css).toMatch(/\.ll-nav nav button\.active \{[^}]*background: #f1f4f2;[^}]*color: #26352f;/);
    expect(css).toMatch(/\.ll-categories button\.active \{[^}]*background: #f7f8f7;[^}]*color: #26352f;/);
    expect(css).toMatch(/\.ll-book-card\.selected \{[^}]*background: #f7f8f7;/);
    expect(css).toMatch(/\.ll-detail-actions button:last-child[^{]*\{[^}]*background: #17211e;/);
  });

  it('renders categorized classics, zhiguai, authorized web novels and comics', async () => {
    const host = await mountLibrary();

    expect(host.textContent).toContain('经典名著');
    expect(host.textContent).toContain('志怪小说');
    expect(host.textContent).toContain('网络小说');
    expect(host.textContent).toContain('漫画');
    expect(host.textContent).toContain('三国演义');
    expect(host.textContent).toContain('聊斋志异');
    expect(host.textContent).toContain('番茄小说官方书库');
    expect(host.textContent).toContain('公版漫画阅览室');
  });

  it('filters the catalog and persists bookshelf choices locally', async () => {
    const host = await mountLibrary();
    const search = host.querySelector('[data-library-search]') as HTMLInputElement;
    search.value = '聊斋';
    search.dispatchEvent(new Event('input'));
    await nextTick();

    const card = [...host.querySelectorAll('.ll-book-card')]
      .find((item) => item.textContent?.includes('聊斋志异')) as HTMLButtonElement;
    expect(card).toBeTruthy();
    card.click();
    await nextTick();
    const shelfButton = [...host.querySelectorAll('.ll-detail-actions button')]
      .find((item) => item.textContent?.includes('加入书架')) as HTMLButtonElement;
    shelfButton.click();
    await nextTick();

    expect(host.textContent).toContain('移出书架');
    expect(localStorage.getItem('yz.learning.v2.library.shelf.v1')).toContain('reading:zhiguai-liaozhai');

    (host.querySelectorAll('.ll-nav nav button')[1] as HTMLButtonElement).click();
    await nextTick();
    expect(host.textContent).toContain('聊斋志异');
  });

  it('adds only explicit HTTPS custom sources and keeps their license note', async () => {
    const host = await mountLibrary();
    (host.querySelectorAll('.ll-nav nav button')[2] as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('.ll-source-head > button') as HTMLButtonElement).click();
    await nextTick();

    const inputs = host.querySelectorAll('.ll-source-form input') as NodeListOf<HTMLInputElement>;
    inputs[0].value = '我的授权书库';
    inputs[1].value = 'https://example.com/books';
    inputs[2].value = '作者授权测试来源';
    inputs[0].dispatchEvent(new Event('input'));
    inputs[1].dispatchEvent(new Event('input'));
    inputs[2].dispatchEvent(new Event('input'));
    (host.querySelector('.ll-source-form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await nextTick();

    expect(host.textContent).toContain('我的授权书库');
    expect(host.textContent).toContain('作者授权测试来源');
    expect(localStorage.getItem('yz.learning.v2.library.sources.v1')).toContain('https://example.com/books');
  });

  it('rejects insecure source URLs', async () => {
    const host = await mountLibrary();
    (host.querySelectorAll('.ll-nav nav button')[2] as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('.ll-source-head > button') as HTMLButtonElement).click();
    await nextTick();

    const inputs = host.querySelectorAll('.ll-source-form input') as NodeListOf<HTMLInputElement>;
    inputs[0].value = '非安全来源';
    inputs[1].value = 'http://example.com';
    inputs[2].value = '测试许可';
    inputs[0].dispatchEvent(new Event('input'));
    inputs[1].dispatchEvent(new Event('input'));
    inputs[2].dispatchEvent(new Event('input'));
    (host.querySelector('.ll-source-form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await nextTick();

    expect(host.textContent).toContain('书源地址必须是完整的 HTTPS 地址');
  });
});
