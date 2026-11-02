// @vitest-environment jsdom
/**
 * 矢量图层组件的**真挂载**测试（P1-10 / C-1）。
 *
 * ★ 为什么不止测几何纯函数：拖动事件、按时间过滤、代理/实时两种画中画模式
 *   都只在组件层才成立。这里钉住用户能感知的三件事：
 *     ① 字幕/贴纸在画面框内出现，字号/宽度按 1920 基准换算；
 *     ② 拖动时**不提交**、松手才 emit commit（父组件才落盘）；
 *     ③ proxy 叠第二路 <video>，live 只给命中框（画面已烤进底图）。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import ClipVectorLayer from './ClipVectorLayer.vue';

let app: App | null = null;
let host: HTMLElement | null = null;

interface VecProps {
  boxWidth?: number;
  boxHeight?: number;
  playhead?: number;
  texts?: any[];
  stickers?: any[];
  overlays?: any[];
  pipMode?: 'video' | 'hit';
  playing?: boolean;
  onSelect?: (kind: string, id: string) => void;
  onCommit?: (kind: string, id: string, x: number, y: number) => void;
}

function mount(props: VecProps = {}): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp({
    render: () => h(ClipVectorLayer, {
      boxWidth: 1080,
      boxHeight: 1920,
      playhead: 0.5,
      texts: [],
      stickers: [],
      overlays: [],
      pipMode: 'hit',
      playing: false,
      selectedTextId: '',
      selectedStickerId: '',
      selectedOverlayId: '',
      srcOf: (p: string) => `/media?p=${encodeURIComponent(p)}`,
      ...props,
    }),
  });
  app.mount(host);
  return host;
}

/** jsdom 不做布局：给根/图层元素铺一个确定的位置矩形。 */
function stubRect(el: Element, r: { left: number; top: number; width: number; height: number }) {
  (el as HTMLElement).getBoundingClientRect = () => ({
    left: r.left, top: r.top, width: r.width, height: r.height,
    right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top,
    toJSON: () => r,
  }) as DOMRect;
}

function pointer(type: string, x: number, y: number, target: EventTarget = window) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
}

afterEach(() => {
  app?.unmount();
  host?.remove();
  document.body.innerHTML = '';
  app = null;
  host = null;
});

describe('ClipVectorLayer · 图层渲染', () => {
  it('★ 无变换字幕：贴底（200 + 半行距补偿）+ 字号 88（1080x1920 画幅 1:1）', () => {
    mount({ texts: [{ id: 't1', text: '你好', start: 0, end: 2, position: 'bottom' }] });
    const el = host!.querySelector('.cp-vec-text') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.textContent).toBe('你好');
    expect(el.style.fontSize).toBe('88px');
    expect(el.style.bottom).toBe('208.8px');
  });

  it('★ 有 transform：中心定位（与 ASS \\an5 同语义）', () => {
    mount({
      texts: [{
        id: 't1', text: '居中', start: 0, end: 2,
        transform: { x: 0.1, y: -0.25, rotation: 15, scale: 1.5 },
      }],
    });
    const el = host!.querySelector('.cp-vec-text') as HTMLElement;
    expect(el.style.left).toBe('648px');
    expect(el.style.top).toBe('480px');
    expect(el.style.transform).toContain('rotate(15deg)');
  });

  it('★ 贴纸宽度 = 画面宽 × scale', () => {
    mount({ stickers: [{ id: 's1', file: 'C:/st.png', start: 0, end: 2, scale: 0.3 }] });
    const el = host!.querySelector('.cp-vec-sticker') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.style.width).toBe('324px');
    expect((el.querySelector('img') as HTMLImageElement).getAttribute('src')).toContain('/media?p=');
  });

  it('图层按播放头过滤（窗口外不渲染）', () => {
    mount({
      playhead: 3,
      texts: [{ id: 't1', text: 'x', start: 0, end: 2 }],
      stickers: [{ id: 's1', file: 'C:/st.png', start: 0, end: 2 }],
      overlays: [{ id: 'o1', file: 'C:/pip.mp4', start: 0, end: 2 }],
    });
    expect(host!.querySelector('.cp-vec-text')).toBeNull();
    expect(host!.querySelector('.cp-vec-sticker')).toBeNull();
    expect(host!.querySelector('.cp-vec-pip')).toBeNull();
  });
});

describe('ClipVectorLayer · 画中画模式', () => {
  it('★ proxy：叠第二路 <video>（可单独拖动）', () => {
    mount({
      pipMode: 'video',
      overlays: [{ id: 'o1', file: 'C:/pip.mp4', start: 0, end: 2, scale: 0.35 }],
    });
    const el = host!.querySelector('.cp-vec-pip') as HTMLElement;
    expect(el).toBeTruthy();
    const v = el.querySelector('video') as HTMLVideoElement;
    expect(v).toBeTruthy();
    expect(v.getAttribute('src')).toContain('/media?p=');
    expect(el.style.width).toBe('378px');   // 1080 × 0.35
  });

  it('★ 图片画中画用 <img> 叠加（导出对图片是 -loop 1，没有时间轴）', () => {
    mount({
      pipMode: 'video',
      overlays: [{ id: 'o1', file: 'C:/logo.png', start: 0, end: 2, scale: 0.2 }],
    });
    const el = host!.querySelector('.cp-vec-pip') as HTMLElement;
    expect(el.querySelector('video')).toBeNull();
    const img = el.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toContain('/media?p=');
  });

  it('★ live：视频只做元数据探针（透明），命中框贴在烤好的画面上', () => {
    mount({
      pipMode: 'hit',
      overlays: [{ id: 'o1', file: 'C:/pip.mp4', start: 0, end: 2, scale: 0.35 }],
    });
    const el = host!.querySelector('.cp-vec-pip') as HTMLElement;
    expect(el).toBeTruthy();
    const v = el.querySelector('video') as HTMLVideoElement;
    expect(v).toBeTruthy();
    expect(v.classList.contains('probe')).toBe(true);
    expect(v.getAttribute('preload')).toBe('metadata');
  });
});

describe('ClipVectorLayer · 拖动', () => {
  it('★ 按下即选中；拖动过程不提交；松手才 emit commit（落点按画面框换算）', async () => {
    const selects: Array<[string, string]> = [];
    const commits: Array<[string, string, number, number]> = [];
    mount({
      stickers: [{ id: 's1', file: 'C:/st.png', start: 0, end: 5, scale: 0.3 }],
      onSelect: (k, id) => selects.push([k, id]),
      onCommit: (k, id, x, y) => commits.push([k, id, x, y]),
    });
    const root = host!.firstElementChild as HTMLElement;
    stubRect(root, { left: 0, top: 0, width: 1080, height: 1920 });
    const item = host!.querySelector('.cp-vec-sticker') as HTMLElement;
    // 贴纸初始中心在画面中心
    stubRect(item, { left: 378, top: 768, width: 324, height: 384 });

    pointer('pointerdown', 540, 960, item);
    await nextTick();
    expect(selects).toEqual([['sticker', 's1']]);
    expect(commits).toEqual([]);   // 还没松手

    pointer('pointermove', 648, 1056);   // +108px, +96px（= 0.1W, 0.05H）
    await nextTick();
    expect(commits).toEqual([]);

    pointer('pointerup', 648, 1056);
    await nextTick();
    expect(commits.length).toBe(1);
    const [kind, id, x, y] = commits[0];
    expect([kind, id]).toEqual(['sticker', 's1']);
    expect(x).toBeCloseTo(0.1, 4);
    expect(y).toBeCloseTo(0.05, 4);
  });

  it('只点击不拖动 → 不提交（避免"选一下就把位置写回工程"）', async () => {
    const commits: unknown[] = [];
    mount({
      texts: [{ id: 't1', text: 'x', start: 0, end: 5 }],
      onCommit: (...args) => commits.push(args),
    });
    const root = host!.firstElementChild as HTMLElement;
    stubRect(root, { left: 0, top: 0, width: 1080, height: 1920 });
    const item = host!.querySelector('.cp-vec-text') as HTMLElement;
    stubRect(item, { left: 400, top: 1600, width: 280, height: 100 });

    pointer('pointerdown', 540, 1650, item);
    pointer('pointerup', 541, 1651);
    await nextTick();
    expect(commits).toEqual([]);
  });
});
