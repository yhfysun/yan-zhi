import { ref, onMounted, onUnmounted } from 'vue';

const MOBILE_BREAKPOINT = 768;

const query = typeof window !== 'undefined'
  ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  : null;

const mobileRef = ref(query?.matches ?? false);

function onChange(e: MediaQueryListEvent) {
  mobileRef.value = e.matches;
}

if (query) {
  query.addEventListener('change', onChange);
}

export function useIsMobile() {
  return mobileRef;
}
