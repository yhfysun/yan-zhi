// 浏览器批注（P0，2026-10-28）
//
// 用户点「批注」→ 主进程往 guest 页注入批注层（见 main.cjs 的 yzAnnotationBootstrap）→
// 用户点选元素/框选区域并写评论 → 本 composable **轮询 drain** 把结果取回 store。
//
// ★ 为什么轮询而不是 guest → 主进程 push：`will-attach-webview` 里
//   `delete webPreferences.preload` 是刻意的安全硬化，恢复它等于给所有被浏览的
//   页面开一条通往主进程的路。120ms 的延迟只影响底部队列计数（评论框与编号框
//   在页面内即时渲染），用户感知不到。详见 main.cjs 同一段注释。
//
// ★ 轮询只在批注模式开启时跑；`stop()` / 组件卸载 / 页面导航（active:false）都会停。
import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import type { BrowserAnnotation, BrowserAnnotationStatus } from '@yan-zhi/shared';
import { useBrowserStore } from '../stores/browser';
import {
  annotationPageKey,
  annotationsForPage,
  browserLocalStorage,
  loadAnnotationHistory,
  mergeAnnotationHistory,
  saveAnnotationHistory,
  withAnnotationStatus,
} from '../utils/browser-annotation';

/** drain 间隔。低于 100ms 收益不大，高于 200ms 队列计数会明显滞后于用户操作 */
const DRAIN_INTERVAL_MS = 120;

type Notify = (text: string) => void;
export type BrowserAnnotationMode = 'element' | 'text';

function browserApi(): any {
  return typeof window !== 'undefined' ? (window as any).electronAPI?.browserView : null;
}

export function useBrowserAnnotation(scope: string, notify?: Notify) {
  // 动态 scope 的 store 类型与静态 Store 不严格匹配（见 stores/browser 注释），
  // storeToRefs 要 StoreGeneric —— 这里统一按 any 取再补回精确类型。
  const store = useBrowserStore(scope) as any;
  const refs = storeToRefs(store) as any;
  const annotations = refs.annotations as Ref<BrowserAnnotation[]>;
  const annotationActive = refs.annotationActive as Ref<boolean>;
  const mode = ref<BrowserAnnotationMode>('element');

  let timer: ReturnType<typeof setInterval> | null = null;
  let draining = false;
  let seq = 0;
  /** 批注层所在的那个 tab —— 轮询与收尾都必须打回**同一页**（用户中途切 tab 不该串台） */
  let currentTabId: string | null = null;
  let currentPageKey = '';

  annotations.value = mergeAnnotationHistory(
    annotations.value,
    loadAnnotationHistory(scope, browserLocalStorage()),
  );
  watch(annotations, (value) => {
    saveAnnotationHistory(scope, value, browserLocalStorage());
  }, { deep: true });

  function newId(): string {
    seq += 1;
    return `anno-${Date.now()}-${seq}`;
  }

  function mergeIncoming(items: any[]) {
    if (!Array.isArray(items) || !items.length) return;
    const incoming: BrowserAnnotation[] = items
      .filter((it) => it && typeof it.comment === 'string' && it.comment.trim())
      .map((it) => ({
        id: String(it.id || newId()),
        tabId: currentTabId || String(it.tabId || ''),
        pageKey: currentPageKey || annotationPageKey(String(it.pageUrl || '')),
        status: 'draft' as BrowserAnnotationStatus,
        type: it.type === 'region' || it.type === 'text' ? it.type : 'element',
        label: String(it.label || ''),
        selector: it.selector || undefined,
        componentFile: it.componentFile || undefined,
        componentName: it.componentName || undefined,
        rect: it.rect && typeof it.rect === 'object'
          ? {
              x: Number(it.rect.x) || 0,
              y: Number(it.rect.y) || 0,
              w: Number(it.rect.w) || 0,
              h: Number(it.rect.h) || 0,
            }
          : { x: 0, y: 0, w: 0, h: 0 },
        comment: String(it.comment).trim(),
        pageUrl: String(it.pageUrl || ''),
        createdAt: Number(it.createdAt) || Date.now(),
        updatedAt: Number(it.updatedAt) || Date.now(),
        anchor: it.anchor && typeof it.anchor === 'object' ? it.anchor : undefined,
        additionalAnchors: Array.isArray(it.additionalAnchors) ? it.additionalAnchors : undefined,
      }));
    if (!incoming.length) return;
    annotations.value = mergeAnnotationHistory(annotations.value, incoming);
  }

  function stopPolling() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  /** 拉一次。返回 false 表示注入层已不在（页面导航过），调用方应退出批注模式。 */
  async function drainOnce(tabId: string): Promise<boolean> {
    if (draining) return true;
    draining = true;
    try {
      const api = browserApi();
      if (!api?.action) return true;
      const r: any = await api.action(tabId, 'annotation_drain');
      if (!r || r.error) return true;
      if (r.active === false) return false;
      mergeIncoming(r.items);
      return true;
    } catch {
      return true; // 轮询失败不打断：页面可能正在导航
    } finally {
      draining = false;
    }
  }

  function startPolling() {
    stopPolling();
    timer = setInterval(async () => {
      if (!currentTabId) { stopPolling(); return; }
      const alive = await drainOnce(currentTabId);
      if (alive) return;
      // 页面换文档 → 注入层随旧文档消失。**先取走残留再退出**，别把已标的丢了。
      stopPolling();
      await finish();
      currentTabId = null;
      annotationActive.value = false;
      // 两种成因：页面换了文档（注入层随旧文档消失），或 agent 抢到页面后主进程把它撤了
      notify?.('批注模式已退出（页面已切换或已被 agent 接管）；已标的批注仍保留');
    }, DRAIN_INTERVAL_MS);
  }

  /** 调 annotation_end 并收走未 drain 的残留（不改变 active 标志） */
  async function finish() {
    const tabId = currentTabId;
    if (!tabId) return;
    try {
      const api = browserApi();
      if (!api?.action) return;
      const r: any = await api.action(tabId, 'annotation_end');
      if (r && Array.isArray(r.items)) mergeIncoming(r.items);
    } catch { /* 页面已销毁 */ }
  }

  async function start(
    tabId: string,
    pageUrl: string,
    nextMode: BrowserAnnotationMode = mode.value,
  ): Promise<{ ok: boolean; error?: string }> {
    const api = browserApi();
    if (!api?.action) return { ok: false, error: '仅桌面端支持页面批注' };
    try {
      currentTabId = tabId;
      currentPageKey = annotationPageKey(pageUrl);
      mode.value = nextMode;
      const restored = annotationsForPage(annotations.value, tabId, pageUrl)
        .filter((item) => item.status !== 'resolved');
      const r: any = await api.action(tabId, 'annotation_begin', { mode: nextMode, items: restored });
      if (!r || r.error) return { ok: false, error: (r && r.error) || '批注模式开启失败' };
      annotationActive.value = true;
      startPolling();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  async function stop() {
    stopPolling();
    await finish();
    currentTabId = null;
    annotationActive.value = false;
  }

  async function setMode(nextMode: BrowserAnnotationMode) {
    mode.value = nextMode;
    if (!annotationActive.value || !currentTabId) return;
    const api = browserApi();
    if (!api?.action) return;
    await api.action(currentTabId, 'annotation_set_mode', { mode: nextMode }).catch(() => null);
  }

  function remove(id: string) {
    annotations.value = annotations.value.filter((a) => a.id !== id);
    void hideMarker(id);
  }

  async function hideMarker(id: string): Promise<{ ok: boolean; error?: string }> {
    if (annotationActive.value && currentTabId) {
      try {
        const r: any = await browserApi()?.action(currentTabId, 'annotation_remove', { id });
        return r?.error ? { ok: false, error: String(r.error) } : { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message || String(e) };
      }
    }
    return { ok: true };
  }

  function update(id: string, patch: Partial<BrowserAnnotation>) {
    const now = Date.now();
    annotations.value = annotations.value.map((item) => item.id === id
      ? { ...item, ...patch, id: item.id, updatedAt: now }
      : item);
  }

  function markStatus(ids: Iterable<string>, status: BrowserAnnotationStatus) {
    annotations.value = withAnnotationStatus(annotations.value, ids, status);
  }

  function clear(tabId = currentTabId || '', pageUrl = currentPageKey) {
    if (!tabId && !pageUrl) {
      annotations.value = [];
      return;
    }
    annotations.value = annotations.value.filter((item) => !annotationsForPage([item], tabId, pageUrl).length);
    if (annotationActive.value && currentTabId) {
      void browserApi()?.action(currentTabId, 'annotation_clear').catch(() => null);
    }
  }

  function itemsFor(tabId: string, pageUrl: string, status?: BrowserAnnotationStatus): BrowserAnnotation[] {
    return annotationsForPage(annotations.value, tabId, pageUrl, status);
  }

  async function focus(tabId: string, item: BrowserAnnotation): Promise<{ ok: boolean; error?: string }> {
    const api = browserApi();
    if (!api?.action) return { ok: false, error: '仅桌面端支持批注定位' };
    try {
      const r: any = await api.action(tabId, 'annotation_focus', { item });
      return r?.error ? { ok: false, error: String(r.error) } : { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  onBeforeUnmount(() => {
    // 卸载也要把注入层收干净：只停轮询会留下一个全屏覆盖层 + crosshair 光标
    void stop();
  });

  return {
    annotations,
    active: annotationActive,
    mode,
    start,
    stop,
    setMode,
    remove,
    hideMarker,
    update,
    markStatus,
    clear,
    itemsFor,
    focus,
  };
}
