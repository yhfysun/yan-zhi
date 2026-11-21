// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { createApp } from 'vue';
import { useDragScroll } from './useDragScroll';

/**
 * useDragScroll 行为验证（2026-11-21 用户实报「电脑左右拖动没用，要按 shift 滚动才有用」）：
 * · 鼠标左键按住横向拖动 → scrollLeft 跟随位移
 * · 拖拽结束后的那一次 click 被吞（不误触页签），再点的 click 正常放行
 * · 触摸指针不接管（触摸端用原生滑动）
 * · 位移 ≤4px 不算拖拽，click 正常放行
 * · 无横向溢出的容器不接管拖拽（点了也不影响）
 */
describe('useDragScroll', () => {
  let host: HTMLElement;
  let app: ReturnType<typeof createApp>;
  let container: HTMLElement | null;

  function mountCarousel(): void {
    const wrap = ref<HTMLElement | null>(null);
    app = createApp(defineComponent({
      setup() {
        useDragScroll(wrap);
        return () => h('div', { ref: wrap, 'data-test': 'carousel', style: 'width:100px; overflow-x:auto; white-space:nowrap;' },
          Array.from({ length: 6 }, (_, i) => h('button', { 'data-id': `tab-${i}`, style: 'width:60px; height:24px; margin-right:4px;' }, `tab-${i}`)));
      },
    }));
    host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    container = host.querySelector('[data-test="carousel"]');
  }

  function fakeOverflow(): void {
    // jsdom 无布局：桩出「横向溢出」状态
    Object.defineProperty(container, 'scrollWidth', { configurable: true, value: 384 });
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 100 });
    let current = 0;
    Object.defineProperty(container, 'scrollLeft', {
      configurable: true,
      get: () => current,
      set: (v: number) => { current = v; },
    });
  }

  beforeEach(() => {
    container = null;
  });

  afterEach(() => {
    app?.unmount();
    host?.remove();
    container = null;
  });

  function makePointerEvent(type: string, x: number, opts: { pointerType?: string; button?: number } = {}): PointerEvent {
    // jsdom 没有 PointerEvent：用 MouseEvent 手工补 pointer 专有字段
    const evt = new MouseEvent(type, { bubbles: true, button: opts.button ?? 0, clientX: x, clientY: 10 });
    Object.defineProperty(evt, 'pointerId', { value: 1 });
    Object.defineProperty(evt, 'pointerType', { value: opts.pointerType ?? 'mouse' });
    Object.defineProperty(evt, 'buttons', { value: 1 });
    return evt as PointerEvent;
  }

  function pointer(type: string, x: number, opts: { pointerType?: string; button?: number } = {}): void {
    container!.dispatchEvent(makePointerEvent(type, x, opts));
  }

  it('按住左键横向拖动 → scrollLeft 跟随（start - dx）', async () => {
    mountCarousel();
    fakeOverflow();
    await nextTick();

    pointer('pointerdown', 200);
    pointer('pointermove', 160); // dx = -40 → scrollLeft = 0 - (-40) = 40（越过 4px 阈值）
    pointer('pointermove', 120); // dx = -80 → scrollLeft = 80
    pointer('pointerup', 120);

    expect(container!.scrollLeft).toBe(80);
    expect(container!.classList.contains('is-drag-scrolling')).toBe(false);
  });

  it('拖拽后的那一次 click 被吞，下一次 click 正常放行', async () => {
    mountCarousel();
    fakeOverflow();
    await nextTick();
    const clicks: string[] = [];
    const tab = container!.querySelector('[data-id="tab-2"]') as HTMLElement;
    tab.addEventListener('click', () => clicks.push('tab'));

    pointer('pointerdown', 200);
    pointer('pointermove', 120);
    pointer('pointerup', 120);
    tab.click(); // 拖拽副产物 click → 捕获层吞掉，到不了 tab
    expect(clicks).toEqual([]);

    tab.click(); // 正常选择 click → 放行
    expect(clicks).toEqual(['tab']);
  });

  it('触摸指针不接管（触摸端原生滑动）', async () => {
    mountCarousel();
    fakeOverflow();
    await nextTick();

    pointer('pointerdown', 200, { pointerType: 'touch' });
    pointer('pointermove', 100);
    pointer('pointerup', 100);
    expect(container!.scrollLeft).toBe(0);
  });

  it('位移 ≤4px 不算拖拽，click 正常放行', async () => {
    mountCarousel();
    fakeOverflow();
    await nextTick();
    const clicks: string[] = [];
    const tab = container!.querySelector('[data-id="tab-1"]') as HTMLElement;
    tab.addEventListener('click', () => clicks.push('tab'));

    pointer('pointerdown', 200);
    pointer('pointermove', 198); // dx=2，未过阈值
    pointer('pointerup', 198);
    tab.click();
    expect(clicks).toEqual(['tab']);
    expect(container!.scrollLeft).toBe(0);
  });

  it('无横向溢出的容器不接管拖拽', async () => {
    mountCarousel();
    Object.defineProperty(container, 'scrollWidth', { configurable: true, value: 100 });
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 100 });
    await nextTick();

    pointer('pointerdown', 200);
    pointer('pointermove', 100);
    pointer('pointerup', 100);
    expect(container!.scrollLeft).toBe(0);
  });
});
