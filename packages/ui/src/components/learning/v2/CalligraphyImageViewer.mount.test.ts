// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import CalligraphyImageViewer from './CalligraphyImageViewer.vue';

let app: App | null = null;
let host: HTMLElement | null = null;

function mountViewer(
  focus: { x: number; y: number; width: number; height: number } | null = null,
  onClose?: () => void,
): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(CalligraphyImageViewer, {
    image: 'test.jpg',
    title: '欧阳询《九成宫醴泉铭》',
    source: '宋拓本',
    focus,
    onClose,
  });
  app.mount(host);
  // jsdom 里图片/视口没有真实尺寸，给 fit 逻辑打底
  const img = host.querySelector('img') as HTMLImageElement;
  Object.defineProperty(img, 'naturalWidth', { value: 1000, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: 800, configurable: true });
  const vp = host.querySelector('[data-viewer="viewport"]') as HTMLElement;
  vi.spyOn(vp, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
  return host;
}

function zoomLevel(el: HTMLElement): number {
  return parseInt(el.querySelector('[data-viewer="zoom-level"]')?.textContent || '0', 10);
}
function click(el: HTMLElement, sel: string): void {
  (el.querySelector(sel) as HTMLButtonElement).click();
}

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => {
  app?.unmount();
  app = null;
  host = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('CalligraphyImageViewer 真迹查看器', () => {
  it('renders the whole original image with controls and locks background scroll', () => {
    const el = mountViewer();
    expect(el.querySelector('[data-viewer="image"]')?.getAttribute('alt')).toContain('真迹扫描图');
    expect(el.querySelector('[data-viewer="viewport"]')).toBeTruthy();
    expect(el.querySelector('.calligraphy-viewer')?.getAttribute('aria-modal')).toBe('true');
    expect(zoomLevel(el)).toBe(100);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('zooms in/out and resets to 100%', async () => {
    const el = mountViewer();
    click(el, '[data-viewer="zoom-in"]');
    await nextTick();
    expect(zoomLevel(el)).toBeGreaterThan(100);
    click(el, '[data-viewer="zoom-in"]');
    await nextTick();
    const doubled = zoomLevel(el);
    click(el, '[data-viewer="zoom-out"]');
    await nextTick();
    expect(zoomLevel(el)).toBeLessThan(doubled);
    click(el, '[data-viewer="reset"]');
    await nextTick();
    expect(zoomLevel(el)).toBe(100);
  });

  it('zoom is clamped within bounds', async () => {
    const el = mountViewer();
    for (let i = 0; i < 30; i++) click(el, '[data-viewer="zoom-in"]');
    await nextTick();
    expect(zoomLevel(el)).toBeLessThanOrEqual(800);
    for (let i = 0; i < 60; i++) click(el, '[data-viewer="zoom-out"]');
    await nextTick();
    expect(zoomLevel(el)).toBeGreaterThanOrEqual(50);
  });

  it('fits the whole image into the viewport', async () => {
    const el = mountViewer();
    for (let i = 0; i < 10; i++) click(el, '[data-viewer="zoom-in"]');
    await nextTick();
    click(el, '[data-viewer="fullscreen"]');
    await nextTick();
    // 800x600 视口、1000x800 图 → min(0.736, 0.69) ≈ 69%
    expect(zoomLevel(el)).toBeGreaterThan(60);
    expect(zoomLevel(el)).toBeLessThan(80);
  });

  it('applies initial focus on mount (zoom in on the selected character)', async () => {
    const el = mountViewer({ x: 77, y: 13, width: 11, height: 16 });
    await nextTick();
    expect(zoomLevel(el)).toBeGreaterThan(100);
  });

  it('drags to pan with pointer events', async () => {
    const el = mountViewer();
    // jsdom 没有 PointerEvent，用 MouseEvent + pointerId 补齐（组件对 setPointerCapture 已做可选调用）
    const vp = el.querySelector('[data-viewer="viewport"]') as HTMLElement;
    const stage = el.querySelector('[data-viewer="stage"]') as HTMLElement;
    const before = stage.style.transform;
    const fire = (type: string, x: number, y: number) => {
      const ev = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
      Object.defineProperty(ev, 'pointerId', { value: 1 });
      vp.dispatchEvent(ev);
    };
    fire('pointerdown', 100, 100);
    fire('pointermove', 160, 140);
    await nextTick();
    expect(stage.style.transform).not.toBe(before);
    fire('pointerup', 160, 140);
  });

  it('double click toggles zoom / reset, and keyboard shortcuts work', async () => {
    const el = mountViewer();
    const vp = el.querySelector('[data-viewer="viewport"]') as HTMLElement;
    vp.dispatchEvent(new MouseEvent('dblclick', { clientX: 400, clientY: 300, bubbles: true }));
    await nextTick();
    expect(zoomLevel(el)).toBeGreaterThan(100);
    vp.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
    await nextTick();
    expect(zoomLevel(el)).toBe(100);
  });

  it('emits close on close button', async () => {
    const onClose = vi.fn();
    const el = mountViewer(null, onClose);
    click(el, '[data-viewer="close"]');
    await nextTick();
    expect(onClose).toHaveBeenCalled();
  });

  it('restores background scroll on unmount', () => {
    document.body.style.overflow = 'auto';
    mountViewer();
    expect(document.body.style.overflow).toBe('hidden');
    app?.unmount();
    app = null;
    expect(document.body.style.overflow).toBe('auto');
  });

  it('has a mobile bottom action bar with ≥44px targets in CSS', () => {
    const css = readFileSync(resolve(__dirname, 'CalligraphyImageViewer.vue'), 'utf8');
    expect(css).toMatch(/@media \(max-width: 900px\)/);
    expect(css).toMatch(/calligraphy-viewer-tools[\s\S]*position: fixed[\s\S]*bottom: 0/);
    expect(css).toMatch(/\.calligraphy-viewer-tools button \{ width: 100%; height: 48px/);
    expect(css).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(css).toMatch(/touch-action: none/);
  });
});
