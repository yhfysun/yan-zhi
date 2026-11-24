export type MobileTabRootKey = 'work' | 'notes' | 'learning' | 'news' | 'me';

const MOBILE_TAB_ROOT_EVENT = 'yz:mobile-tab-root';

export function requestMobileTabRoot(key: MobileTabRootKey): void {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(new CustomEvent(MOBILE_TAB_ROOT_EVENT, { detail: { key } }));
}

export function listenMobileTabRoot(
  key: MobileTabRootKey,
  handler: () => void,
): () => void {
  if (typeof document === 'undefined') return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ key?: string }>).detail;
    if (detail?.key === key) handler();
  };
  document.addEventListener(MOBILE_TAB_ROOT_EVENT, listener);
  return () => document.removeEventListener(MOBILE_TAB_ROOT_EVENT, listener);
}
