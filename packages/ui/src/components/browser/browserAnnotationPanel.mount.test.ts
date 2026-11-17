// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import type { BrowserAnnotation } from '@yan-zhi/shared';
import BrowserAnnotationPanel from './BrowserAnnotationPanel.vue';

const ITEM: BrowserAnnotation = {
  id: 'a1',
  tabId: 'tab-1',
  pageKey: 'https://example.com/lesson',
  type: 'text',
  label: '文本「位置、速度与加速度」',
  selector: 'article > p:nth-of-type(2)',
  rect: { x: 10, y: 20, w: 120, h: 24 },
  comment: '这里需要补一张图',
  pageUrl: 'https://example.com/lesson',
  createdAt: 1,
  status: 'draft',
};

let app: App | null = null;

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
});

async function mountPanel(over: Partial<BrowserAnnotation> = {}) {
  const onUpdate = vi.fn();
  const onResolve = vi.fn();
  const onRemove = vi.fn();
  const Root = defineComponent({
    setup() {
      return () => h(BrowserAnnotationPanel, {
        annotations: [{ ...ITEM, ...over }],
        onUpdate,
        onResolve,
        onRemove,
      });
    },
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(Root);
  for (const [name, component] of Object.entries(Icons)) app.component(name, component as any);
  app.use(ElementPlus);
  app.mount(host);
  await nextTick();
  return { host, onUpdate, onResolve, onRemove };
}

describe('BrowserAnnotationPanel', () => {
  it('renders text anchors with the draft state', async () => {
    const { host } = await mountPanel();
    expect(host.textContent).toContain('文本「位置、速度与加速度」');
    expect(host.textContent).toContain('这里需要补一张图');
    expect(host.textContent).toContain('待发送');
    expect(host.textContent).toContain('1 条 · 1 条待发送');
  });

  it('edits a comment and emits the new text', async () => {
    const { host, onUpdate } = await mountPanel();
    const edit = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('编辑')) as HTMLButtonElement;
    edit.click();
    await nextTick();
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = '改成更具体的说明';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const save = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('保存')) as HTMLButtonElement;
    save.click();
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), '改成更具体的说明');
  });

  it('marks an annotation resolved from the side panel', async () => {
    const { host, onResolve } = await mountPanel();
    const resolve = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('解决')) as HTMLButtonElement;
    resolve.click();
    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });
});
