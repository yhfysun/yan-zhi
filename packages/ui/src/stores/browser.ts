// 浏览器面板全局状态：路由切换（/browser ↔ /chat）组件卸载不丢，
// BrowserPanel 重新挂载时恢复 tabs 与激活 tab，访问状态跨页面保留。
//
// 双空间隔离（用户拍板）：对话页右栏预览（preview，pageAgent 的执行面）与
// /browser 独立浏览器页（page）各自持有独立的 tab 列表/激活 tab/历史栈，
// 互不串扰。底层主进程 BrowserView 仍共享同一个 LRU 预算（MAX_TABS=8）。
import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  urlInput: string;
  history: string[];
  histIndex: number;
  pageZoom: number;
  canBack: boolean;
  canForward: boolean;
}

export type BrowserScope = 'preview' | 'page';

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
  return { tabs, activeTabId, urlInput, history, histIndex, pageZoom, electronCanBack, electronCanForward, loading };
}

// 两个独立的 store 定义（id 不同才能互不共享状态）
const storeDefs = {
  preview: defineStore('browser-preview', browserStoreSetup),
  page: defineStore('browser-page', browserStoreSetup),
};

/**
 * 按空间取浏览器 store：
 * - preview：对话页右栏预览面板（pageAgent / 主 agent 浏览器工具的执行面）
 * - page：/browser 独立浏览器页
 * 不传默认 page（/browser 页 <BrowserPanel /> 无需感知此参数）。
 */
export function useBrowserStore(scope: BrowserScope = 'page') {
  return storeDefs[scope]();
}
