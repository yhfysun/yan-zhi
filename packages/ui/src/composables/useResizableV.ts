// 纵向拖拽调高 hook（底部控制台 / 终端面板用）。
// 与 useResizable 的区别：按 clientY 计算、方向为 up/down、光标 row-resize。
// dir: 'up' —— 面板在分隔条【上方】，上移鼠标增大高度（height = offset - clientY）
//      'down' —— 面板在分隔条【下方】，下移鼠标增大高度（height = clientY + offset）
import { ref, onUnmounted } from 'vue';

export function useResizableV(key: string, initial: number, min: number, max: number) {
  const stored = Number(localStorage.getItem(`yz_resize_${key}`));
  const hasStored = Number.isFinite(stored) && stored >= min && stored <= max;
  const height = ref(hasStored ? stored : initial);
  const moved = ref(hasStored);
  const dragging = ref(false);

  let direction: 'up' | 'down' = 'up';
  let offset = 0;

  function onMove(e: MouseEvent) {
    if (!dragging.value) return;
    const next = direction === 'up' ? offset - e.clientY : e.clientY + offset;
    const newH = Math.min(max, Math.max(min, Math.round(next)));
    if (newH !== height.value) moved.value = true;
    height.value = newH;
    localStorage.setItem(`yz_resize_${key}`, String(height.value));
  }

  function startDrag(e: MouseEvent, dir: 'up' | 'down') {
    dragging.value = true;
    direction = dir;
    offset = dir === 'up' ? height.value + e.clientY : height.value - e.clientY;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', stopDrag);
    document.body.style.cursor = 'row-resize';
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

  return { height, startDrag, moved, dragging };
}
