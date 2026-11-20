// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import NoteFieldComposer from './NoteFieldComposer.vue';
import { NOTE_BUILTIN_DICTIONARIES } from '@yan-zhi/shared';

let app: App | null = null;

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
});

describe('自定义字段语义 key', () => {
  it('金额字段自动使用 amount key，方便账本统计直接识别', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let saved: Record<string, unknown> | null = null;
    app = createApp(NoteFieldComposer as unknown as App, {
      visible: true,
      dictionaries: NOTE_BUILTIN_DICTIONARIES,
      fields: [],
      onSave: (field: Record<string, unknown>) => { saved = field; },
    });
    app.mount(host);
    await nextTick();
    (document.body.querySelector('.nfc-field input') as HTMLInputElement).value = '金额';
    (document.body.querySelector('.nfc-field input') as HTMLInputElement).dispatchEvent(new Event('input'));
    const amountType = [...document.body.querySelectorAll('.nfc-types button')]
      .find((button) => button.textContent === '金额') as HTMLButtonElement;
    amountType.click();
    await nextTick();
    const save = [...document.body.querySelectorAll('.nfc-sheet footer button')]
      .find((button) => button.textContent?.includes('保存字段')) as HTMLButtonElement;
    save.click();
    await nextTick();
    expect(saved).toEqual(expect.objectContaining({ key: 'amount', label: '金额', type: 'amount' }));
  });
});
