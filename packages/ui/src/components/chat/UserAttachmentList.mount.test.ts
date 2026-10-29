// @vitest-environment jsdom
// 用户消息附件卡 —— 真实挂载守门测试（2026-10-28）
//
// 用户实报：带文件的消息整个气泡里露出一大段 `[文件: image.png … 路径: C:\…]`。
// 修法是把注入块剥到气泡下方变成卡片（气泡只留用户打的字），并要求：
//   ① 图片给缩略图（地址走 /workspace/file-stream，点开灯箱）；
//   ② 附件行能折叠，收起后仍留「图片 ×1 · 文件 ×2」的概览计数；
//   ③ 文本类文件才能「引用到对话」——二进制/图片不该给这个入口；
//   ④ 落盘失败的文件只给失败标记，不给可点路径。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import { nextTick } from 'vue';

const { openPathMock, referenceFileMock, viewerMock, hoverMock, hoverCloseMock, openBrowserUrlMock } = vi.hoisted(() => ({
  openPathMock: vi.fn(),
  referenceFileMock: vi.fn(),
  viewerMock: vi.fn(),
  hoverMock: vi.fn(),
  hoverCloseMock: vi.fn(),
  openBrowserUrlMock: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  API_BASE: 'http://localhost:3002/api',
  getLicenseCode: () => null,
}));
vi.mock('../../composables/chat/useChat', () => ({
  useChat: () => ({
    openPath: openPathMock,
    referenceFile: referenceFileMock,
    store: { openBrowserUrl: openBrowserUrlMock },
  }),
}));
vi.mock('../../composables/useMediaPreview', () => ({
  openMediaViewer: viewerMock,
  openMediaMenu: vi.fn(),
  openMediaHover: hoverMock,
  closeMediaHover: hoverCloseMock,
}));

import UserAttachmentList from './UserAttachmentList.vue';
import type { UserAttachment } from '../../utils/user-attachments';

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < times; i++) await nextTick();
}

async function mountList(
  attachments: UserAttachment[],
  links: Array<{ url: string; name: string }> = [],
): Promise<{ app: App; host: HTMLElement }> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp({
    render: () => h(UserAttachmentList as never, { attachments, links }),
  });
  app.use(pinia);
  app.use(ElementPlus);
  for (const [name, comp] of Object.entries(Icons)) app.component(name, comp as never);
  app.mount(host);
  await settle();
  return { app, host };
}

const MIXED: UserAttachment[] = [
  { name: 'image.png', path: 'C:\\u\\tasks\\c1\\uploads\\f_ab_image.png', mimeType: 'image/png', sizeText: '33.7 KB', kind: 'image' },
  { name: 'report.md', path: 'C:\\u\\report.md', mimeType: 'text/markdown', sizeText: '1.2 KB', kind: 'file' },
  { name: 'setup.exe', path: 'C:\\u\\setup.exe', mimeType: 'application/octet-stream', sizeText: '9.0 MB', kind: 'file' },
];

beforeEach(() => {
  document.body.innerHTML = '';
  openPathMock.mockClear();
  referenceFileMock.mockClear();
  viewerMock.mockClear();
  hoverMock.mockClear();
  hoverCloseMock.mockClear();
  openBrowserUrlMock.mockReset();
});

describe('用户消息附件卡（真实挂载）', () => {
  it('图片缩略图 hover 唤起放大浮层，移开即关闭', async () => {
    const { app, host } = await mountList(MIXED);
    const imgItem = host.querySelector('.ual-item.is-image') as HTMLElement;
    imgItem.dispatchEvent(new MouseEvent('mouseenter'));
    await settle();
    expect(hoverMock).toHaveBeenCalledTimes(1);
    expect(hoverMock.mock.calls[0][1]).toMatchObject({ kind: 'image', name: 'image.png' });
    imgItem.dispatchEvent(new MouseEvent('mouseleave'));
    await settle();
    expect(hoverCloseMock).toHaveBeenCalled();
    app.unmount();
  });
  it('图片给缩略图，地址走会话文件流（不是裸本地路径）', async () => {
    const { app, host } = await mountList(MIXED);
    const img = host.querySelector('img.ual-thumb') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.src).toContain('/api/workspace/file-stream?path=');
    expect(img!.src).toContain(encodeURIComponent('C:\\u\\tasks\\c1\\uploads\\f_ab_image.png'));
    app.unmount();
  });

  it('★ 收起后只剩一行概览文字（图片不再渲染），点概览又展开', async () => {
    const { app, host } = await mountList(MIXED);
    expect(host.querySelector('.ual-chips')).toBeTruthy();
    // 展开态不挂概览文字（显示了图/文件就不需要那行字）
    expect(host.querySelector('.ual-summary')).toBeNull();

    (host.querySelector('.ual-fold') as HTMLElement).click();
    await settle();
    // 收起 = 图/文件整块从 DOM 消失，只剩概览文字
    expect(host.querySelector('.ual-chips')).toBeNull();
    expect(host.querySelector('img.ual-thumb')).toBeNull();
    const summary = host.querySelector('.ual-summary') as HTMLElement;
    expect(summary.textContent).toContain('图片 ×1');
    expect(summary.textContent).toContain('文件 ×2');

    summary.click();
    await settle();
    expect(host.querySelector('.ual-chips')).toBeTruthy();
    expect(host.querySelector('.ual-summary')).toBeNull();
    app.unmount();
  });

  it('只有文本类文件才有「引用到对话」入口', async () => {
    const { app, host } = await mountList(MIXED);
    const items = [...host.querySelectorAll('.ual-item')];
    const refs = host.querySelectorAll('.ual-ref');
    expect(refs).toHaveLength(1); // 只有 report.md
    const mdItem = items.find((el) => el.textContent?.includes('report.md')) as HTMLElement;
    expect(mdItem.querySelector('.ual-ref')).toBeTruthy();
    const exeItem = items.find((el) => el.textContent?.includes('setup.exe')) as HTMLElement;
    expect(exeItem.querySelector('.ual-ref')).toBeNull();
    app.unmount();
  });

  it('点引用 → 把该文件挂进输入框（走 useChat.referenceFile）', async () => {
    const { app, host } = await mountList(MIXED);
    (host.querySelector('.ual-ref') as HTMLElement).click();
    await settle();
    expect(referenceFileMock).toHaveBeenCalledWith('C:\\u\\report.md', 'report.md');
    // 不能顺带触发「打开文件」
    expect(openPathMock).not.toHaveBeenCalled();
    app.unmount();
  });

  it('点图片 → 进灯箱；点普通文件 → 站内预览', async () => {
    const { app, host } = await mountList(MIXED);
    (host.querySelector('.ual-item.is-image') as HTMLElement).click();
    await settle();
    expect(viewerMock).toHaveBeenCalledTimes(1);
    expect(viewerMock.mock.calls[0][0]).toMatchObject({ name: 'image.png', kind: 'image' });

    const exeItem = [...host.querySelectorAll('.ual-item')]
      .find((el) => el.textContent?.includes('setup.exe')) as HTMLElement;
    exeItem.click();
    await settle();
    expect(openPathMock).toHaveBeenCalledWith('C:\\u\\setup.exe', { name: 'setup.exe', forceDir: false });
    app.unmount();
  });

  it('落盘失败的文件：只给失败标记，不可点、不可引用', async () => {
    const { app, host } = await mountList([
      { name: 'x.bin', mimeType: '', sizeText: '3 B', kind: 'file', error: 'EACCES' },
    ]);
    const item = host.querySelector('.ual-item') as HTMLElement;
    expect(item.textContent).toContain('保存失败');
    expect(item.querySelector('.ual-ref')).toBeNull();
    item.click();
    await settle();
    expect(openPathMock).not.toHaveBeenCalled();
    app.unmount();
  });

  // 用户实报（2026-10-28）：点气泡里的网页引用胶囊弹出了**系统浏览器**。
  // 根因是它是 <a target="_blank">，Electron 主窗口的 windowOpenHandler 一律甩给
  // shell.openExternal；约定改成与输入框引用 chip 一致 —— 走应用内浏览器 tab。
  it('点网页引用胶囊 → 在应用内浏览器打开（不走 target=_blank / 系统浏览器）', async () => {
    openBrowserUrlMock.mockResolvedValue(true);
    const { app, host } = await mountList([], [{ url: 'https://www.baidu.com/', name: 'www.baidu.com' }]);
    const pill = host.querySelector('.ual-link') as HTMLElement;
    expect(pill.tagName).toBe('BUTTON');
    expect(pill.getAttribute('target')).toBeNull();
    expect(pill.getAttribute('href')).toBeNull();

    pill.click();
    await settle();
    expect(openBrowserUrlMock).toHaveBeenCalledWith('https://www.baidu.com/', 'www.baidu.com');
    app.unmount();
  });

  it('内置浏览器打不开时，网页引用胶囊回落新窗口', async () => {
    openBrowserUrlMock.mockResolvedValue(false);
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const { app, host } = await mountList([], [{ url: 'https://example.com/', name: 'example.com' }]);
    (host.querySelector('.ual-link') as HTMLElement).click();
    await settle();
    expect(openSpy).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
    app.unmount();
  });
});
