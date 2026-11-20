// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import NoteDirectorySheet, { type NoteDirectoryItem } from './NoteDirectorySheet.vue';

const { apiPost, apiPatch, apiDelete } = vi.hoisted(() => ({
  apiPost: vi.fn(async () => ({ data: { id: 'new-dir', name: '采购', parentId: null, path: ['采购'], depth: 0, sort: 0, count: 0 } })),
  apiPatch: vi.fn(async () => ({ data: { id: 'd2', name: '采购', parentId: null, path: ['采购'], depth: 0, sort: 0, count: 0 } })),
  apiDelete: vi.fn(async () => ({ data: { ok: true } })),
}));

vi.mock('../../api/client', () => ({
  api: { post: apiPost, patch: apiPatch, delete: apiDelete },
}));

const directories: NoteDirectoryItem[] = [
  { id: 'd1', name: '经营', parentId: null, path: ['经营'], depth: 0, sort: 0, count: 2 },
  { id: 'd2', name: '采购', parentId: 'd1', path: ['经营', '采购'], depth: 1, sort: 0, count: 1 },
  { id: '__none__', name: '未分类', parentId: null, path: ['未分类'], depth: 0, sort: 99, count: 0 },
];

const mounted: Array<() => void> = [];

async function mount(selectedId = 'd1'): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp(NoteDirectorySheet as unknown as App, {
    visible: true,
    directories,
    selectedId,
  });
  app.mount(host);
  mounted.push(() => app.unmount());
  await nextTick();
  return host;
}

afterEach(() => {
  mounted.splice(0).forEach((unmount) => unmount());
  document.body.innerHTML = '';
  apiPost.mockClear();
  apiPatch.mockClear();
  apiDelete.mockClear();
});

describe('移动端目录树', () => {
  it('显示完整路径、层级和记录数', async () => {
    await mount();
    expect(document.body.textContent).toContain('采购');
    const rows = [...document.querySelectorAll('.nds-row')];
    const child = rows.find((row) => row.textContent?.includes('采购')) as HTMLElement;
    expect(child.getAttribute('style')).toContain('--depth: 1');
  });

  it('可以新建子目录并提交 parentId', async () => {
    await mount();
    const addChild = document.querySelector('.nds-row button[aria-label="新建子目录"]') as HTMLButtonElement;
    addChild.click();
    await nextTick();
    const name = document.querySelector('.nds-editor input') as HTMLInputElement;
    name.value = '供应商';
    name.dispatchEvent(new Event('input'));
    const form = document.querySelector('.nds-editor') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/notes/categories', {
        name: '供应商',
        parentId: 'd1',
      });
    });
  });

  it('编辑目录时可修改上级目录，用于移动目录', async () => {
    await mount('d2');
    const edit = document.querySelector('.nds-row button[aria-label="编辑目录"]') as HTMLButtonElement;
    edit.click();
    await nextTick();
    const select = document.querySelector('.nds-editor select') as HTMLSelectElement;
    select.value = '';
    select.dispatchEvent(new Event('change'));
    const form = document.querySelector('.nds-editor') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(apiPatch).toHaveBeenCalledWith('/notes/categories/d1', {
        name: '经营',
        parentId: null,
      });
    });
  });
});
