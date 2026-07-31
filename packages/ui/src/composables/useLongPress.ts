import { ref, onUnmounted } from 'vue';

export function useLongPress(callback: (e: TouchEvent) => void, duration = 500) {
  const isLongPress = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;

  function onTouchStart(e: TouchEvent) {
    isLongPress.value = false;
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    timer = setTimeout(() => {
      isLongPress.value = true;
      callback(e);
    }, duration);
  }

  function onTouchMove(e: TouchEvent) {
    const touch = e.touches[0];
    if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
      clear();
    }
  }

  function onTouchEnd() { clear(); }

  function clear() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  onUnmounted(() => clear());

  return { isLongPress, onTouchStart, onTouchMove, onTouchEnd };
}
