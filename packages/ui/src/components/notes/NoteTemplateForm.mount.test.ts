// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import type { NoteTemplateDefinition } from '@yan-zhi/shared';
import NoteTemplateForm from './NoteTemplateForm.vue';

const template: NoteTemplateDefinition = {
  id: 'custom-conditional',
  name: '分类联动模板',
  description: '',
  icon: 'NotebookPen',
  tone: 'slate',
  kind: 'custom',
  titleField: 'title',
  contentField: 'content',
  fields: [
    { key: 'title', label: '标题', type: 'text', required: true },
    { key: 'content', label: '正文', type: 'textarea' },
    {
      key: 'category',
      label: '业务分类',
      type: 'select',
      dictionaryId: 'custom.business',
    },
    {
      key: 'supplier',
      label: '供应商',
      type: 'text',
      visibleWhen: { field: 'category', equals: 'wholesale' },
    },
  ],
  createdAt: 0,
  updatedAt: 0,
};

const dictionaries = [{
  id: 'custom.business',
  name: '业务分类',
  description: '',
  builtin: false,
  createdAt: 0,
  updatedAt: 0,
  items: [
    { id: 'retail', label: '零售' },
    { id: 'wholesale', label: '批发' },
  ],
}];

let app: App | null = null;

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
});

describe('分类级动态字段', () => {
  it('选择特定分类后才显示该分类专用字段', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(NoteTemplateForm as unknown as App, {
      template,
      modelValue: { category: 'retail' },
      dictionaries,
    });
    app.mount(host);
    await nextTick();
    expect(host.textContent).not.toContain('供应商');

    const wholesale = [...host.querySelectorAll('.ntf-option')]
      .find((button) => button.textContent?.includes('批发')) as HTMLButtonElement;
    wholesale.click();
    await nextTick();
    expect(host.textContent).toContain('供应商');
  });
});
