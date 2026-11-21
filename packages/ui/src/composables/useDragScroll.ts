import { onBeforeUnmount, watch, type Ref } from 'vue';

/**
 * 桌面端横向滚动容器补齐「按住左键拖拽滚动」。
 *
 * 背景（2026-11-21 用户实报「电脑左右拖动没用，要按住 shift 滚动才有用」）：
 * 触摸端原生可滑、Shift+滚轮原生可滚，唯独鼠标拖拽浏览器不提供。
 * 这里用 mouse pointer 事件补上：按下记起点，位移 >4px 判定为拖拽，
 * 拖拽期间给容器加 is-drag-scrolling（CSS 变 grabbing 光标），
 * 松手后短暂吞掉一次 click —— 避免拖完误触页签。
 *
 * 注意不能用 setPointerCapture：捕获会把后续 pointer 事件重定向到容器，
 * 合成 click 的目标也变成容器 → 页签点击全部失效。
 */
export function useDragScroll(target: Ref<HTMLElement | null>): void {
  let active = false;
  let dragging = false;
  let pointerId = -1;
  let startX = 0;
  let startScroll = 0;
  let swallowNextClick = false;

  function onPointerDown(event: PointerEvent): void {
    // 只接管鼠标左键：触摸端用原生滑动，触控笔/右键不抢
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const el = target.value;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    active = true;
    dragging = false;
    pointerId = event.pointerId;
    startX = event.clientX;
    startScroll = el.scrollLeft;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
    window.addEventListener('pointercancel', onPointerUp, { once: true });
  }

  function onPointerMove(event: PointerEvent): void {
    if (!active || event.pointerId !== pointerId) return;
    const el = target.value;
    if (!el) return;
    const dx = event.clientX - startX;
    if (!dragging && Math.abs(dx) > 4) {
      dragging = true;
      el.classList.add('is-drag-scrolling');
    }
    if (dragging) el.scrollLeft = startScroll - dx;
  }

  function onPointerUp(): void {
    window.removeEventListener('pointermove', onPointerMove);
    if (dragging) swallowNextClick = true;
    const el = target.value;
    el?.classList.remove('is-drag-scrolling');
    active = false;
    dragging = false;
    pointerId = -1;
  }

  function onClickCapture(event: MouseEvent): void {
    // 刚拖拽完的那次 click 是拖拽的副产物，不是选择意图；只吞这一次
    if (swallowNextClick) {
      swallowNextClick = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function bind(el: HTMLElement | null, old: HTMLElement | null = null): void {
    old?.removeEventListener('pointerdown', onPointerDown);
    old?.removeEventListener('click', onClickCapture, true);
    el?.addEventListener('pointerdown', onPointerDown);
    el?.addEventListener('click', onClickCapture, true);
  }

  // 目标可能由 v-if 异步渲染（如行情分组页签要等数据到达），跟随 ref 变化绑定
  watch(target, bind, { immediate: true });

  onBeforeUnmount(() => {
    bind(null, target.value);
    onPointerUp();
  });
}
