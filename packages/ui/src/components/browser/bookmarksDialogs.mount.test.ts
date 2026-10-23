// @vitest-environment jsdom
/**
 * 收藏弹窗真挂载测试：管理弹窗的树形渲染 / 导入合并，以及收藏编辑弹窗的保存载荷。
 * 纯函数测试证明不了「界面上真的接上了」，这里真挂载、真点按钮。
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';
import BookmarksManagerDialog from './BookmarksManagerDialog.vue';
import BookmarkEditorDialog from './BookmarkEditorDialog.vue';
import { countUrls, makeFolderNode, makeUrlNode, type BookmarkNode } from '../../utils/browserBookmarks';

let app: App | null = null;

async function mount(component: any, props: Record<string, any>) {
  if (app) { app.unmount(); app = null; }
  document.body.innerHTML = '';
  const container = document.createElement('div');
  document.body.appendChild(container);
  app = createApp(component, props);
  app.use(ElementPlus);
  app.mount(container);
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
}

function clickBtn(label: string) {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
  if (!btn) throw new Error(`未找到按钮「${label}」`);
  (btn as HTMLButtonElement).click();
}

beforeAll(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  (globalThis as any).matchMedia = (globalThis as any).matchMedia
    || ((q: string) => ({
      matches: false, media: q,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
      dispatchEvent: () => false,
    }));
});

afterEach(() => {
  if (app) { app.unmount(); app = null; }
  document.body.innerHTML = '';
  delete (window as any).electronAPI;
});

function sampleTree(): BookmarkNode[] {
  const github = { ...makeUrlNode('https://github.com', 'GitHub'), id: 'u-gh' };
  return [{ ...makeFolderNode('AI'), id: 'f-ai', children: [github] }];
}

describe('收藏夹管理弹窗', () => {
  it('渲染文件夹与网址，并统计收藏数', async () => {
    await mount(BookmarksManagerDialog, { modelValue: true, nodes: sampleTree(), canImport: false, onChange: vi.fn() });
    const inputs = [...document.querySelectorAll('.el-dialog input')].map((i) => (i as HTMLInputElement).value);
    expect(inputs).toContain('AI');
    expect(inputs).toContain('GitHub');
    expect(document.body.textContent).toContain('共 1 个收藏');
  });

  it('从 Chrome 导入：选择配置后合并并回传新树', async () => {
    const onChange = vi.fn();
    (window as any).electronAPI = {
      bookmarks: {
        importChrome: vi.fn(async () => ({
          ok: true,
          profiles: [{
            browser: 'chrome', browserName: 'Chrome', profile: 'Default', profileName: '个人',
            path: 'C:/fake/Bookmarks', count: 2,
            roots: [{ title: '书签栏', children: [
              { title: 'GitHub', url: 'https://github.com' },
              { title: 'Docs', url: 'https://docs.example.com' },
            ] }],
          }],
        })),
      },
    };
    await mount(BookmarksManagerDialog, { modelValue: true, nodes: [], canImport: true, onChange });

    clickBtn('从 Chrome/Edge 导入');
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(document.body.textContent).toContain('Chrome · 个人（2 个）');

    clickBtn('合并导入');
    await new Promise((r) => setTimeout(r, 0));
    expect(onChange).toHaveBeenCalledTimes(1);
    const nodes = onChange.mock.calls[0][0] as BookmarkNode[];
    expect(countUrls(nodes)).toBe(2);
  });
});

describe('收藏编辑弹窗', () => {
  it('默认带入页面标题，保存时回传名称与文件夹', async () => {
    const onSave = vi.fn();
    const nodes = sampleTree();
    await mount(BookmarkEditorDialog, {
      modelValue: true,
      url: 'https://github.com',
      defaultTitle: 'GitHub 首页',
      nodes,
      existing: null,
      onSave,
    });
    const input = document.querySelector('.el-dialog input') as HTMLInputElement;
    expect(input?.value).toBe('GitHub 首页');
    clickBtn('保存');
    expect(onSave).toHaveBeenCalledWith({ title: 'GitHub 首页', folderId: null, newFolderTitle: '' });
  });
});
