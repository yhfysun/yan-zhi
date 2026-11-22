// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, reactive, type App } from 'vue';
import NoteQuickCreateDialog from './NoteQuickCreateDialog.vue';

const apiState = vi.hoisted(() => ({ post: vi.fn(async (_url: string, _body?: unknown): Promise<unknown> => ({ id: 'n1' })) }));
vi.mock('../../api/client', () => ({ api: { post: apiState.post } }));

let app: App | null = null;
let host: HTMLElement | null = null;
let state: Record<string, unknown> | null = null;

/** 用包装组件把响应式 state 当 props 传给子组件；模拟真实流程：先关闭、再打开（组件靠 watch(visible) 预填） */
async function mountDialog(
  initial: Record<string, unknown>,
  openWith?: Record<string, unknown>,
): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  state = reactive({ visible: false, ...initial });
  const currentState = state;
  const Wrapper = defineComponent({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 测试包装器：把动态 state 透传为组件 props
    setup() { return () => h(NoteQuickCreateDialog, { ...currentState } as any); },
  });
  app = createApp(Wrapper);
  app.mount(host);
  await nextTick();
  if (openWith) {
    Object.assign(state!, openWith);
    state!.visible = true;
    await nextTick();
  }
  return host;
}

beforeEach(() => { apiState.post.mockClear(); });
afterEach(() => {
  app?.unmount();
  app = null;
  host = null;
  state = null;
  document.body.innerHTML = '';
});

describe('NoteQuickCreateDialog', () => {
  it('renders a full-screen modal by default (teleported to body)', async () => {
    await mountDialog({}, { title: '课程', content: '要点', categoryName: '学习' });
    expect(document.querySelector('.nqc-mask')).toBeTruthy();
    expect(document.querySelector('.nqc-dialog:not(.is-inline)')).toBeTruthy();
    expect((document.querySelector('.nqc-title') as HTMLInputElement)?.value).toBe('课程');
  });

  it('renders inline without a mask when inline=true (immersive lesson use)', async () => {
    const el = await mountDialog({ inline: true }, { title: '课程', content: '要点' });
    // inline：不 Teleport，内容留在挂载点；无全屏遮罩、不再有 z-index 3000 的 modal
    expect(el.querySelector('.nqc-inline')).toBeTruthy();
    expect(el.querySelector('.nqc-dialog.is-inline')).toBeTruthy();
    expect(el.querySelector('.nqc-mask')).toBeNull();
    expect(document.body.querySelector(':scope > .nqc-mask')).toBeNull();
    expect((el.querySelector('.nqc-title') as HTMLInputElement)?.value).toBe('课程');
    expect(el.querySelector('.nqc-close')).toBeTruthy();
  });

  it('prefills title/content/category on open', async () => {
    const el = await mountDialog({ inline: true }, { title: '新的标题', content: '新的内容', categoryName: '工作' });
    expect((el.querySelector('.nqc-title') as HTMLInputElement)?.value).toBe('新的标题');
    expect((el.querySelector('.nqc-content') as HTMLTextAreaElement)?.value).toBe('新的内容');
    expect((el.querySelector('.nqc-cat') as HTMLInputElement)?.value).toBe('工作');
  });

  it('saves with source=learning and closes on success', async () => {
    const onClose = vi.fn();
    const el = await mountDialog(
      { inline: true, 'onUpdate:visible': onClose },
      { title: '课程', content: '要点', categoryName: '学习' },
    );
    (el.querySelector('.nqc-primary') as HTMLButtonElement).click();
    await nextTick();
    await Promise.resolve();
    expect(apiState.post).toHaveBeenCalledWith('/notes/notes', {
      title: '课程', content: '要点', categoryName: '学习', kind: 'note', source: 'learning',
    });
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it('disables save when title empty', async () => {
    const el = await mountDialog({ inline: true }, { title: '', content: '要点' });
    expect((el.querySelector('.nqc-primary') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows API error and keeps dialog open on failure', async () => {
    apiState.post.mockResolvedValueOnce({ error: '保存失败' });
    const el = await mountDialog({ inline: true }, { title: '课程', content: '要点' });
    (el.querySelector('.nqc-primary') as HTMLButtonElement).click();
    await nextTick();
    await Promise.resolve();
    expect(el.querySelector('.nqc-error')?.textContent).toContain('保存失败');
    expect(el.querySelector('.nqc-inline')).toBeTruthy();
  });
});
