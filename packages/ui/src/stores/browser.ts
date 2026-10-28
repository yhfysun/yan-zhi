// 浏览器面板全局状态：路由切换（/browser ↔ /chat）组件卸载不丢，
// BrowserPanel 重新挂载时恢复 tabs 与激活 tab，访问状态跨页面保留。
//
// 双空间隔离（用户拍板）：对话页右栏预览（preview，pageAgent 的执行面）与
// /browser 独立浏览器页（page）各自持有独立的 tab 列表/激活 tab/历史栈，
// 互不串扰。底层主进程 BrowserView 仍共享同一个 LRU 预算（MAX_TABS=8）。
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { BrowserAnnotation } from '@yan-zhi/shared';

export interface BrowserTab {
  id: string;
  /** 当前真实 URL（页面自身跳转/重定向也实时更新），用于标题、主页判定、引用等 */
  url: string;
  /**
   * 驱动 <webview> :src 的「主动导航目标」，只在用户/agent 主动导航、以及本地栈
   * 后退前进兜底时推进。与 url 分离的原因：页面自己点链接跳转后若把新 URL 回写
   * 到 :src，webview 会再 loadURL 一次 → 历史栈里塞进两条相同记录，表现就是
   * "点了后退页面看着没动"。
   */
  srcUrl: string;
  title: string;
  loading: boolean;
  urlInput: string;
  history: string[];
  histIndex: number;
  pageZoom: number;
  canBack: boolean;
  canForward: boolean;
  /**
   * 这个页是**后台流**（`browserTarget:'background'` 的子智能体）建的工作页（2026-10-15 后台标签页方案）。
   * 用途：① 标签栏打标"后台"，避免用户以为是自己开的页；② 建页时不抢当前视图（见 BrowserPanel 的 onTabCreated）。
   * 用户自己开的页、前台 agent 开的页都不带这个标记。
   */
  background?: boolean;
  /**
   * 休眠态（2026-10-19）：主进程内存回收后 guest 已销毁，tab 壳与 url 保留。
   * 渲染层据此不挂 <webview>；切回该 tab 或收到 tabResume 时按 url 重新加载。
   */
  suspended?: boolean;
}

export type BrowserScope = string;

/** 浏览器 store 公共返回类型（setup 形式：ref 集合） */
export type BrowserStore = ReturnType<typeof browserStoreSetup>;

function browserStoreSetup() {
  const tabs = ref<BrowserTab[]>([]);
  const activeTabId = ref<string>('');
  // 当前激活 tab 的视图状态（switchTab 时与 tab 对象互存）
  const urlInput = ref('');
  const history = ref<string[]>([]);
  const histIndex = ref(-1);
  const pageZoom = ref(1);
  const electronCanBack = ref(false);
  const electronCanForward = ref(false);
  const loading = ref(false);
  /**
   * 浏览器批注队列（P0，2026-10-28）。
   * ★ 为什么放在 store 而不是 BrowserPanel 组件内：发消息时 `useChat.send()` 要读它
   *   拼批注消息块，而两者不是父子关系 —— 只能靠共享状态传。
   * ★ 按 scope 隔离（preview / page 各一份），与 tabs 同一套空间语义。
   */
  const annotations = ref<BrowserAnnotation[]>([]);
  /** 批注模式是否开启（决定工具栏按钮态与底部队列是否显示） */
  const annotationActive = ref(false);
  return {
    tabs, activeTabId, urlInput, history, histIndex, pageZoom,
    electronCanBack, electronCanForward, loading, annotations, annotationActive,
  };
}

// 历史固定 scope：保留 'preview' / 'page' 两个独立 store，TypeScript 推导完整、调用方无改动。
const storeDefs = {
  preview: defineStore('browser-preview', browserStoreSetup),
  page: defineStore('browser-page', browserStoreSetup),
};

// 动态 scope 缓存：每个 scope 一个独立 store（多会话隔离用 preview:<convId>）。
// Pinia 动态 defineStore 的返回类型与静态不同 —— 这里把 get() 的返回标成 BrowserStore，
// 调用方拿到的形态与静态 store 一致（tabs/activeTabId/...），storeToRefs 正常工作。
const dynCache = new Map<string, () => BrowserStore>();
function getDynamicStore(scope: string): BrowserStore {
  let get = dynCache.get(scope);
  if (!get) {
    const def: any = defineStore(`browser-${scope}`, browserStoreSetup);
    get = (): BrowserStore => def();
    dynCache.set(scope, get);
  }
  return get();
}

/**
 * 按空间取浏览器 store：
 * - preview：对话页右栏预览面板（pageAgent / 主 agent 浏览器工具的执行面）。
 *   ★ 2026-10-15 起它是**应用级单例**（三级归属模型：浏览器=整个应用一份，
 *   Git/文件=工作空间级，控制台=会话级）：切工作空间 / 切会话 / 切任务都不销毁它，
 *   否则 BrowserPanel 卸载会触发主进程 closeAllTabs 真销毁 BrowserView，
 *   正在跑的 pageAgent 直接断（用户实报「点别的工作空间，预览浏览器就没了」）。
 * - page：/browser 独立浏览器页
 * - preview:<convId>：**历史遗留**的多会话隔离 scope（升级前存量 tab 的标签）。
 *   新链路不再产生它；保留动态 store 仅为兼容旧标签的匹配（isSamePreviewFamily）。
 * 不传默认 page（/browser 页 <BrowserPanel /> 无需感知此参数）。
 */
export function useBrowserStore(scope: BrowserScope = 'page'): BrowserStore {
  if (scope === 'preview' || scope === 'page') return storeDefs[scope]() as unknown as BrowserStore;
  return getDynamicStore(scope);
}

// ── 弹窗去重（模块级单例，跨组件实例共享）──
// window.open / target=_blank 一次点击会同时命中「session 级 + guest 级」两个
// setWindowOpenHandler；加上面板反复挂载后残留的 IPC 监听器（preload 的 ipcRenderer.on
// 没有反向移除）会各消费一次同一个广播 —— 表现就是"点一个链接开出 2~5 个 tab"。
// 按 URL 做短窗口去重，无论多少实例/多少残留监听器，同一跳只兑现一次。
const popupGuard = new Map<string, number>();
export function claimPopup(url: string, windowMs = 1500): boolean {
  const now = Date.now();
  for (const [u, t] of popupGuard) if (now - t > windowMs * 4) popupGuard.delete(u);
  const last = popupGuard.get(url);
  if (last !== undefined && now - last < windowMs) return false;
  popupGuard.set(url, now);
  return true;
}
