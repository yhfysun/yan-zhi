// 通用拖拽调宽 hook：按住分隔条拖动改变相邻面板宽度，localStorage 持久化
import { ref, onUnmounted } from 'vue';

export function useResizable(key: string, initial: number, min: number, max: number) {
  const stored = Number(localStorage.getItem(`yz_resize_${key}`));
  const width = ref(Number.isFinite(stored) && stored >= min && stored <= max ? stored : initial);
  const moved = ref(false);
  const dragging = ref(false);

  let direction: 'left' | 'right' = 'left';
  let offset = 0;

  function onMove(e: MouseEvent) {
    if (!dragging.value) return;
    const next = direction === 'left' ? e.clientX + offset : offset - e.clientX;
    const newW = Math.min(max, Math.max(min, Math.round(next)));
    if (newW !== width.value) moved.value = true;
    width.value = newW;
    localStorage.setItem(`yz_resize_${key}`, String(width.value));
  }

  function startDrag(e: MouseEvent, dir: 'left' | 'right') {
    // dir: 'left'  —— 面板在分隔条左侧，右移鼠标增大宽度（width = clientX + width0 - startX）
    //      'right' —— 面板在分隔条右侧，左移鼠标增大宽度（width = width0 + startX - clientX）
    dragging.value = true;
    direction = dir;
    moved.value = false;
    offset = dir === 'left' ? width.value - e.clientX : width.value + e.clientX;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', stopDrag);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }

  function stopDrag() {
    dragging.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', stopDrag);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  onUnmounted(stopDrag);

  return { width, startDrag, moved, dragging };
}
