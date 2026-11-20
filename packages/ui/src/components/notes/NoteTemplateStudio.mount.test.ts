// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import NoteTemplateStudio from './NoteTemplateStudio.vue';
import { NOTE_BUILTIN_DICTIONARIES, NOTE_BUILTIN_TEMPLATES } from '@yan-zhi/shared';

const { apiPost, apiPatch, apiDelete } = vi.hoisted(() => ({
  apiPost: vi.fn(async () => ({ data: {} })),
  apiPatch: vi.fn(async () => ({ data: {} })),
  apiDelete: vi.fn(async () => ({ data: { ok: true } })),
}));

vi.mock('../../api/client', () => ({
  api: { post: apiPost, patch: apiPatch, delete: apiDelete },
}));

const mounted: Array<{ unmount: () => void }> = [];

async function mount(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp(NoteTemplateStudio as unknown as App, {
    visible: true,
    templates: NOTE_BUILTIN_TEMPLATES,
    dictionaries: NOTE_BUILTIN_DICTIONARIES,
  });
  app.mount(host);
  mounted.push({ unmount: () => app.unmount() });
  await nextTick();
  return host;
}

afterEach(() => {
  mounted.splice(0).forEach((item) => item.unmount());
  document.body.innerHTML = '';
  apiPost.mockClear();
  apiPatch.mockClear();
  apiDelete.mockClear();
});

describe('模板工作台移动交互', () => {
  it('复制内置模板后可改名字并保存字段协议', async () => {
    await mount();
    const copy = document.querySelector('button[aria-label="复制内置模板"]') as HTMLButtonElement;
    copy.click();
    await nextTick();
    const name = document.querySelector('.nts-field input') as HTMLInputElement;
    name.value = '我的进货模板';
    name.dispatchEvent(new Event('input'));
    await nextTick();
    const save = document.querySelector('.nts-editor-head .nts-primary') as HTMLButtonElement;
    save.click();
    await vi.waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/notes/templates', expect.objectContaining({
        name: '我的进货模板',
        fields: expect.any(Array),
      }));
    });
  });

  it('字段先添加到画布，再随模板一起提交，避免每改一个字段都打接口', async () => {
    await mount();
    const newTemplate = [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('新建模板')) as HTMLButtonElement;
    newTemplate.click();
    await nextTick();
    const addField = [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('添加字段')) as HTMLButtonElement;
    addField.click();
    await nextTick();
    const label = document.querySelector('.nfc-field input') as HTMLInputElement;
    label.value = '客户名称';
    label.dispatchEvent(new Event('input'));
    const saveField = [...document.querySelectorAll('.nfc-sheet footer button')]
      .find((button) => button.textContent?.includes('保存字段')) as HTMLButtonElement;
    saveField.click();
    await nextTick();
    expect(document.body.textContent).toContain('客户名称');
    const saveTemplate = document.querySelector('.nts-editor-head .nts-primary') as HTMLButtonElement;
    saveTemplate.click();
    await vi.waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/notes/templates', expect.objectContaining({
        fields: expect.arrayContaining([
          expect.objectContaining({ label: '客户名称', type: 'text' }),
        ]),
      }));
    });
  });

  it('新建字典可以连续添加选项并一次保存', async () => {
    await mount();
    const dictionaryTab = [...document.querySelectorAll('.nts-tabs button')]
      .find((button) => button.textContent?.includes('字典')) as HTMLButtonElement;
    dictionaryTab.click();
    await nextTick();
    const newDictionary = [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('新建字典')) as HTMLButtonElement;
    newDictionary.click();
    await nextTick();
    const name = document.querySelector('.nde-field input') as HTMLInputElement;
    name.value = '客户类型';
    name.dispatchEvent(new Event('input'));
    const addInput = document.querySelector('.nde-add input') as HTMLInputElement;
    addInput.value = '老客户';
    addInput.dispatchEvent(new Event('input'));
    (document.querySelector('.nde-add button') as HTMLButtonElement).click();
    addInput.value = '新客户';
    addInput.dispatchEvent(new Event('input'));
    (document.querySelector('.nde-add button') as HTMLButtonElement).click();
    await nextTick();
    const save = [...document.querySelectorAll('.nde-sheet footer button')]
      .find((button) => button.textContent?.includes('保存字典')) as HTMLButtonElement;
    save.click();
    await vi.waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/notes/dictionaries', expect.objectContaining({
        name: '客户类型',
        items: expect.arrayContaining([
          expect.objectContaining({ label: '老客户' }),
          expect.objectContaining({ label: '新客户' }),
        ]),
      }));
    });
  });
});
