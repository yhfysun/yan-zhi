<template>
  <div class="browser-shell">
    <!-- Chrome 风格工具栏 -->
    <div class="browser-toolbar">
      <!-- 主页按钮：回到起始页 -->
      <button class="nav-btn" @click="goHome" title="主页">
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 3 2 12h3v8h6v-6h2v6h6v-8h3L12 3z"/></svg>
      </button>
      <button class="nav-btn" @click="goBack" :disabled="!canBack" title="后退">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M15.5 19l-7-7 7-7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="nav-btn" @click="goForward" :disabled="!canForward" title="前进">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M8.5 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="nav-btn" @click="refresh" title="刷新">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M17.65 6.35A7.95 7.95 0 0012 4a8 8 0 108 8h-2a6 6 0 11-6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor"/></svg>
      </button>
      <button class="nav-btn" @click="openExternal" :disabled="!urlInput" title="用系统浏览器打开">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7zM19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7z" fill="currentColor"/></svg>
      </button>

      <!-- 地址栏 -->
      <div class="url-bar" :class="{ focused: urlFocused }">
        <svg class="url-lock" viewBox="0 0 24 24" width="14" height="14" v-if="isSecure"><path fill="currentColor" d="M12 1a5 5 0 00-5 5v3H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2v-9a2 2 0 00-2-2h-1V6a5 5 0 00-5-5zm3 8H9V6a3 3 0 016 0v3z"/></svg>
        <input v-model="urlInput" class="url-input" placeholder="输入网址或搜索…" @keyup.enter="navigate" @focus="urlFocused = true" @blur="urlFocused = false" />
        <button v-if="urlInput" class="url-clear" @click="urlInput = ''">×</button>
      </div>

      <!-- 页面缩放 -->
      <div class="zoom-group">
        <button class="nav-btn" @click="zoomOut" title="缩小">
          <el-icon :size="18"><ZoomOut /></el-icon>
        </button>
        <button class="zoom-label" @click="resetZoom" title="重置缩放">{{ Math.round(pageZoom * 100) }}%</button>
        <button class="nav-btn" @click="zoomIn" title="放大">
          <el-icon :size="18"><ZoomIn /></el-icon>
        </button>
      </div>

      <!-- 收藏按钮 -->
      <button class="nav-btn" :class="{ active: isBookmarked }" @click="toggleBookmark" :title="isBookmarked ? '取消收藏' : '收藏此页'">
        <svg viewBox="0 0 24 24" width="18" height="18"><path :fill="isBookmarked ? 'currentColor' : 'none'" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
      </button>

      <!-- 更多菜单 ⋮ -->
      <el-dropdown trigger="click" @command="onMenuCommand">
        <button class="nav-btn" title="更多工具">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="history">浏览历史 ({{ recentList.length }})</el-dropdown-item>
            <el-dropdown-item command="settings">浏览器设置</el-dropdown-item>
            <el-dropdown-item command="bookmarks" divided>收藏夹 ({{ bookmarks.length }})</el-dropdown-item>
            <el-dropdown-item command="clearBookmarks">清空收藏夹</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- 收藏夹栏 -->
    <div v-if="bookmarks.length > 0" class="bookmarks-bar">
      <div v-for="bm in bookmarks.slice(0, 12)" :key="bm.url" class="bookmark-item" @click="visitBookmark(bm.url)" :title="bm.url">
        <svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        <span>{{ bm.title || bm.url.replace(/^https?:\/\//, '').split('/')[0] }}</span>
      </div>
    </div>

    <!-- 起始主页（无导航时显示） -->
    <div v-if="showHome" class="home-page">
      <div class="home-search">
        <div class="home-logo">浏览</div>
        <div class="home-search-box">
          <svg viewBox="0 0 24 24" width="18" height="18" class="home-search-ico"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z"/></svg>
          <input v-model="homeInput" class="home-search-input" :placeholder="`用 ${engineName} 搜索，或输入网址`" @keyup.enter="homeSearch" />
          <button class="home-search-btn" @click="homeSearch">搜索</button>
        </div>
      </div>

      <!-- 常用网站 -->
      <div class="home-section">
        <div class="home-section-title">常用网站</div>
        <div class="site-grid">
          <div v-for="s in commonSites" :key="s.host" class="site-tile" @click="openSite(s.url)" :title="s.url">
            <div class="site-avatar" :style="{ background: avatarColor(s.host) }">{{ siteInitial(s.name) }}</div>
            <div class="site-name">{{ s.name }}</div>
          </div>
          <div v-if="commonSites.length === 0" class="home-hint">还没有常用网站，去逛逛吧～</div>
        </div>
      </div>

      <!-- 最近浏览 -->
      <div class="home-section" v-if="recentList.length">
        <div class="home-section-title">最近浏览</div>
        <div class="recent-list">
          <div v-for="r in recentList.slice(0, 8)" :key="r.time + r.url" class="recent-item" @click="openSite(r.url)" :title="r.url">
            <div class="site-avatar sm" :style="{ background: avatarColor(r.host) }">{{ siteInitial(r.title || r.host) }}</div>
            <div class="recent-meta">
              <div class="recent-title">{{ r.title || r.host }}</div>
              <div class="recent-sub">{{ r.host }} · {{ formatTime(r.time) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 今日 AI 分析（内部自动生成，对用户无感，不显示任何提示） -->
      <div class="home-section" v-if="analysis">
        <div class="home-section-title">今日 AI 分析</div>
        <div class="analysis-card">
          <div class="analysis-summary">{{ analysis.summary }}</div>
          <div class="analysis-tags" v-if="analysis.topSites && analysis.topSites.length">
            <span v-for="t in analysis.topSites" :key="t.host" class="analysis-tag">{{ t.host }} · {{ t.count }}次</span>
          </div>
          <ul class="analysis-highlights" v-if="analysis.highlights && analysis.highlights.length">
            <li v-for="(h, i) in analysis.highlights" :key="i">{{ h }}</li>
          </ul>
          <div class="analysis-suggest" v-if="analysis.suggestion">💡 {{ analysis.suggestion }}</div>
        </div>
      </div>
    </div>

    <!-- 远程浏览器渲染区 -->
    <div v-else class="browser-viewport" ref="viewportRef">
      <!-- Electron 桌面端：BrowserView 占位 div（原生 BrowserView 会覆盖此区域） -->
      <div v-if="isElectron" ref="browserViewPlaceholder" class="browser-view-placeholder"></div>
      <!-- Web 端：iframe + Playwright DOM 预渲染 -->
      <iframe v-else-if="frameSrc" :key="iframeKey" :src="frameSrc" class="page-frame"
        referrerpolicy="no-referrer" @load="onFrameLoad"
        sandbox="allow-same-origin allow-forms allow-popups"></iframe>
      <!-- Web 端自定义滚动条（屏蔽原生，应用层自绘） -->
      <div v-if="!isElectron && frameSrc && scrollbarVisible" class="custom-scrollbar" @pointerdown="onScrollbarTrack">
        <div ref="scrollThumbRef" class="custom-scrollbar-thumb" :style="thumbStyle"
          @pointerdown.stop="onScrollbarThumb" @pointermove="onScrollbarThumbMove"
          @pointerup="onScrollbarThumbUp" @pointercancel="onScrollbarThumbUp"></div>
      </div>
      <!-- 加载中遮罩 -->
      <div v-if="loading" class="loading-overlay">
        <div class="loading-spinner"></div>
        <p>正在加载...</p>
      </div>

    </div>


    <!-- 收藏夹弹窗 -->
    <el-dialog v-model="showBookmarks" title="收藏夹" width="480px" append-to-body>
      <div v-if="bookmarks.length === 0" style="text-align:center;padding:30px;color:var(--el-text-color-secondary)">暂无收藏</div>
      <div v-for="(bm, i) in bookmarks" :key="bm.url" class="bookmark-row">
        <span class="bm-title" @click="visitBookmark(bm.url)">{{ bm.title || bm.url }}</span>
        <el-button size="small" text type="danger" @click="removeBookmark(i)">删除</el-button>
      </div>
    </el-dialog>

    <!-- 浏览历史弹窗 -->
    <el-dialog v-model="showHistory" title="浏览历史" width="520px" append-to-body>
      <div v-if="recentList.length === 0" style="text-align:center;padding:30px;color:var(--el-text-color-secondary)">暂无浏览记录</div>
      <div v-for="r in recentList" :key="r.time + r.url" class="history-row" @click="openFromHistory(r.url)">
        <div class="site-avatar sm" :style="{ background: avatarColor(r.host) }">{{ siteInitial(r.title || r.host) }}</div>
        <div class="recent-meta">
          <div class="recent-title">{{ r.title || r.host }}</div>
          <div class="recent-sub">{{ r.host }} · {{ formatTime(r.time) }}{{ r.proxy ? ' · 代理' : '' }}</div>
        </div>
      </div>
    </el-dialog>

    <!-- 浏览器设置弹窗 -->
    <el-dialog v-model="showSettings" title="浏览器设置" width="480px" append-to-body>
      <div class="setting-row">
        <span class="setting-label">默认搜索引擎</span>
        <el-select v-model="searchEngine" size="small" style="width:160px" @change="onEngineChange">
          <el-option label="百度" value="baidu" />
          <el-option label="必应" value="bing" />
          <el-option label="Google" value="google" />
        </el-select>
      </div>
      <div class="setting-row">
        <span class="setting-label">外部站点默认走代理</span>
        <el-switch v-model="defaultProxy" @change="onDefaultProxyChange" />
      </div>
      <el-divider>常用网站管理</el-divider>
      <div v-for="(p, i) in pinned" :key="p.url" class="pin-row">
        <span class="pin-name">{{ p.name }}</span>
        <span class="pin-url">{{ p.url }}</span>
        <button class="pin-del" @click="removePin(i)">×</button>
      </div>
      <div class="pin-add">
        <el-input v-model="newPinName" size="small" placeholder="名称" style="width:90px" />
        <el-input v-model="newPinUrl" size="small" placeholder="https://..." style="flex:1" />
        <el-button size="small" type="primary" @click="addPin">添加</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import { ZoomIn, ZoomOut } from '@element-plus/icons-vue';
import { usePlatformStore } from '../stores/platform';
import { useChatStore } from '../stores/chat';
import { usePlatform } from '../composables/usePlatform';
import { LlmClient } from '@yan-zhi/core';
import { API_BASE } from '../api/client';
import { useRoute } from 'vue-router';

// ── 平台检测 ──
const { isDesktop } = usePlatform();

// 检测是否在 Electron 桌面端（有 electronAPI 标识）
const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

// 路由 query（支持从对话页跳转并传初始 URL）
const route = useRoute();


interface Bookmark { url: string; title: string; }
interface Pin { name: string; url: string; host?: string; }

const SEARCH_ENGINES: Record<string, { name: string; url: (q: string) => string }> = {
  baidu: { name: '百度', url: (q) => 'https://www.baidu.com/s?wd=' + encodeURIComponent(q) },
  bing: { name: '必应', url: (q) => 'https://www.bing.com/search?q=' + encodeURIComponent(q) },
  google: { name: 'Google', url: (q) => 'https://www.google.com/search?q=' + encodeURIComponent(q) },
};
const DEFAULT_PINNED: Pin[] = [
  { name: '百度', url: 'https://www.baidu.com' },
  { name: '淘宝', url: 'https://www.taobao.com' },
  { name: '知乎', url: 'https://www.zhihu.com' },
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'Bilibili', url: 'https://www.bilibili.com' },
  { name: '稀土掘金', url: 'https://juejin.cn' },
  { name: '微博', url: 'https://weibo.com' },
  { name: '网易', url: 'https://www.163.com' },
];

const urlInput = ref('');
const homeInput = ref('');
const urlFocused = ref(false);

// ── 远程浏览器状态 ──
const loading = ref(false);
const viewportRef = ref<HTMLDivElement>();
const browserViewPlaceholder = ref<HTMLDivElement>();
const iframeKey = ref(0);

// ── 页面缩放（让浏览器网页可随应用缩放）──
const pageZoom = ref(1);

/** 向同源 iframe 内部文档注入 zoom（模拟浏览器 Ctrl+/- 缩放） */
function injectIframeZoom(zoom: number) {
  const iframe = document.querySelector('.page-frame') as HTMLIFrameElement | null;
  if (!iframe?.contentDocument) return;
  try {
    const doc = iframe.contentDocument;
    doc.documentElement.style.zoom = String(zoom);
  } catch { /* 跨域时静默跳过 */ }
}

function applyZoom() {
  if (isElectron) {
    const bv = (window as any).electronAPI?.browserView;
    // Electron 桌面端：原生 BrowserView 支持 setZoomFactor
    if (bv?.setZoomFactor) {
      try { bv.setZoomFactor(pageZoom.value); } catch { /* ignore */ }
    }
    return;
  }
  // Web 端：向 iframe 内部文档注入 zoom（CSS zoom 对 iframe 元素本身不可靠）
  injectIframeZoom(pageZoom.value);
  refreshCustomScrollbar();
}
function zoomIn() { pageZoom.value = Math.min(3, +(pageZoom.value + 0.1).toFixed(2)); applyZoom(); }
function zoomOut() { pageZoom.value = Math.max(0.3, +(pageZoom.value - 0.1).toFixed(2)); applyZoom(); }
function resetZoom() { pageZoom.value = 1; applyZoom(); }

/** 用系统默认浏览器（桌面端）或新标签页（Web 端）打开当前地址，原生预览，非 iframe/弹窗 */
function openExternal() {
  const u = urlInput.value.trim();
  if (!u || !/^https?:\/\//i.test(u)) { ElMessage.warning('请先输入有效网址'); return; }
  const electronShell = (window as any).electronAPI?.shell;
  if (electronShell?.openExternal) { electronShell.openExternal(u); return; }
  window.open(u, '_blank', 'noopener,noreferrer');
}

// ── Electron 桌面端：通知主进程当前主题，由主进程用 insertCSS 美化原生滚动条（BrowserView 是原生图层，无法用 HTML 叠加）──
function applyElectronScrollbarTheme() {
  if (!isElectron) return;
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const api = (window as any).electronAPI?.browserView;
  // 主进程会在页面加载完成时注入滚动条样式；这里只同步主题色
  if (api?.setTheme) api.setTheme(dark ? 'dark' : 'light');
}

// ── BrowserView 尺寸同步：监听占位 div 尺寸/位置变化，调用 setBounds 同步原生 BrowserView ──
let browserViewResizeObserver: ResizeObserver | null = null;
let browserViewScrollHandler: (() => void) | null = null;
let browserViewResizeHandler: (() => void) | null = null;
// 监听外层主题切换，同步到 iframe 内部滚动条
let themeObserver: MutationObserver | null = null;

/** 计算占位 div 在 BrowserWindow 内的坐标，同步到 BrowserView bounds */
let resizeRafId: number | null = null;
function syncBrowserViewBounds() {
  if (!isElectron) return;
  // 用 requestAnimationFrame 防抖：等布局稳定后再计算，确保窗口缩放时等比例更新
  if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
  resizeRafId = requestAnimationFrame(() => {
    resizeRafId = null;
    const el = browserViewPlaceholder.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Electron 33 的 setBounds 使用 CSS 像素（逻辑像素），不需要乘以 DPR
    (window as any).electronAPI.browserView.resize(
      Math.round(rect.left),
      Math.round(rect.top),
      Math.round(rect.width),
      Math.round(rect.height),
    );
  });
}

// ── 历史栈（远程浏览器方案下，前端自行维护导航历史）──
const history = ref<string[]>([]);
const histIndex = ref(-1);
const currentUrl = computed(() => history.value[histIndex.value] || '');
// Electron 端用响应式变量保存 BrowserView 的可前进/后退状态
const electronCanBack = ref(false);
const electronCanForward = ref(false);
const canBack = computed(() => isElectron ? electronCanBack.value : histIndex.value > 0);
const canForward = computed(() => isElectron ? electronCanForward.value : histIndex.value < history.value.length - 1);
const isSecure = computed(() => /^https:\/\//i.test(currentUrl.value));
const currentHost = computed(() => { try { return new URL(currentUrl.value).host; } catch { return ''; } });

// Pinia store 必须在 setup 同步顶层创建，不能在 async 函数中调用
const platformStore = usePlatformStore();

// localStorage 安全读写（防止损坏数据导致 setup 抛错白屏）
function safeGetJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function safeGetString(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function safeSetJson(key: string, value: any) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}
function safeSetString(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

const bookmarks = ref<Bookmark[]>(safeGetJson('browser_bookmarks', []));
const isBookmarked = computed(() => bookmarks.value.some(b => b.url === currentUrl.value));

// ── 主页数据：常用/最近/今日分析 ──
const recentList = ref<any[]>([]);
const frequentList = ref<any[]>([]);
const analysis = ref<any>(null);
const analysisGenerating = ref(false);
const analysisError = ref('');
const showHome = computed(() => !currentUrl.value);

const pinned = ref<Pin[]>(safeGetJson('browser_pinned', DEFAULT_PINNED));
const searchEngine = ref(safeGetString('browser_search_engine', 'baidu'));
const defaultProxy = ref(safeGetString('browser_default_proxy', '1') === '1');
const engineName = computed(() => (SEARCH_ENGINES[searchEngine.value] || SEARCH_ENGINES.baidu).name);

const showBookmarks = ref(false);
const showHistory = ref(false);
const showSettings = ref(false);
const newPinName = ref('');
const newPinUrl = ref('');

// Electron 桌面端：BrowserView 是原生图层，永远覆盖主窗口 DOM 之上，
// 任何 el-dialog 都会被它挡住。打开弹窗时临时隐藏 BrowserView，关闭后恢复。
watch(
  () => showBookmarks.value || showHistory.value || showSettings.value,
  (hasDialog) => {
    if (!isElectron) return;
    if (hasDialog) {
      (window as any).electronAPI.browserView.hide();
    } else {
      syncBrowserViewBounds();
    }
  },
);

// 常用网站 = 固定 pin + 历史常用（去重 host）
const commonSites = computed<Pin[]>(() => {
  const list: Pin[] = pinned.value.map(p => ({ name: p.name, url: p.url, host: hostOf(p.url) }));
  const seen = new Set(list.map(s => s.host!));
  for (const f of frequentList.value) {
    if (!seen.has(f.host)) { seen.add(f.host); list.push({ name: f.host, url: 'https://' + f.host, host: f.host }); }
    if (list.length >= 12) break;
  }
  return list.slice(0, 12);
});

// ── 工具函数 ──
function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}
function siteInitial(name: string): string {
  const s = (name || '?').trim();
  return s ? s[0].toUpperCase() : '?';
}
function avatarColor(host?: string): string {
  const s = host || '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 55%)`;
}
function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `今天 ${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[\w-]+(\.[\w-]+)+/.test(url)) return 'https://' + url;
  const eng = SEARCH_ENGINES[searchEngine.value] || SEARCH_ENGINES.baidu;
  return eng.url(url);
}

function pushHistory(url: string) {
  if (histIndex.value < history.value.length - 1) {
    history.value = history.value.slice(0, histIndex.value + 1);
  }
  history.value.push(url);
  histIndex.value = history.value.length - 1;
}


// 获取 viewport 尺寸（同步前端视口大小，传给后端 Playwright）
function getViewportSize() {
  const el = viewportRef.value;
  if (!el) return { width: 1280, height: 800 };
  return { width: el.clientWidth, height: el.clientHeight };
}

// iframe src：指向后端 /render 路由（Playwright 预渲染 DOM）
const frameSrc = computed(() => {
  const u = currentUrl.value;
  if (!u) return '';
  // Electron 桌面端：用 BrowserView 加载 URL，不再用 iframe
  if (isElectron) return '';
  // Web 端：通过后端 /render 预渲染 DOM
  const vp = getViewportSize();
  return `${API_BASE}/browser/render?url=${encodeURIComponent(u)}&w=${vp.width}&h=${vp.height}`;
});

async function navigate() {
  const target = normalizeUrl(urlInput.value);
  if (!target) return;
  pushHistory(target);
  loading.value = true;
  iframeKey.value++;
  // Electron 桌面端：用 BrowserView 加载 URL，并同步 bounds
  if (isElectron) {
    // 等待 Vue 重新渲染（browserViewPlaceholder 需要先出现在 DOM 中才能计算 bounds）
    await nextTick();
    syncBrowserViewBounds();
    try {
      await (window as any).electronAPI.browserView.load(target);
      // 加载后再次同步 bounds（确保 BrowserView 尺寸正确）
      syncBrowserViewBounds();
    } catch (e) {
      console.warn('[browser] BrowserView load 失败', e);
    }
    // 更新可前进/后退状态
    electronCanBack.value = await (window as any).electronAPI.browserView.canGoBack();
    electronCanForward.value = await (window as any).electronAPI.browserView.canGoForward();
  }
  // 超时保护：15 秒后自动清除 loading
  setTimeout(() => { loading.value = false; }, 15000);
}

function homeSearch() {
  const target = normalizeUrl(homeInput.value);
  if (!target) return;
  // 复用 navigate 流程（内部会 pushHistory + 调用后端导航）
  urlInput.value = target;
  navigate();
}

function openSite(url: string) {
  urlInput.value = url;
  navigate();
}

function goHome() {
  history.value = [];
  histIndex.value = -1;
  urlInput.value = '';
  // Electron 桌面端：隐藏 BrowserView，让主页可见
  if (isElectron) {
    (window as any).electronAPI.browserView.hide();
    electronCanBack.value = false;
    electronCanForward.value = false;
  }
}

// 后退/前进/刷新（前端切换 iframe src，重新触发 /render 加载）
async function goBack() {
  if (loading.value) return;
  // Electron 桌面端：调用 BrowserView.goBack
  if (isElectron) {
    if (!electronCanBack.value) return;
    await (window as any).electronAPI.browserView.back();
    electronCanBack.value = await (window as any).electronAPI.browserView.canGoBack();
    electronCanForward.value = await (window as any).electronAPI.browserView.canGoForward();
    return;
  }
  // Web 端：更新历史栈 + 重新加载
  if (histIndex.value <= 0) return;
  histIndex.value--;
  urlInput.value = currentUrl.value;
  loading.value = true;
  iframeKey.value++;
}

async function goForward() {
  if (loading.value) return;
  // Electron 桌面端：调用 BrowserView.goForward
  if (isElectron) {
    if (!electronCanForward.value) return;
    await (window as any).electronAPI.browserView.forward();
    electronCanBack.value = await (window as any).electronAPI.browserView.canGoBack();
    electronCanForward.value = await (window as any).electronAPI.browserView.canGoForward();
    return;
  }
  // Web 端：更新历史栈 + 重新加载
  if (histIndex.value >= history.value.length - 1) return;
  histIndex.value++;
  urlInput.value = currentUrl.value;
  loading.value = true;
  iframeKey.value++;
}

async function refresh() {
  if (!currentUrl.value) return;
  // Electron 桌面端：调用 BrowserView.reload（不检查 loading，允许刷新正在加载的页面）
  if (isElectron) {
    loading.value = true;
    try {
      await (window as any).electronAPI.browserView.reload();
    } catch (e) {
      console.warn('[browser] reload 失败', e);
    }
    return;
  }
  // Web 端：重新加载 iframe
  loading.value = true;
  iframeKey.value++;
}

// 屏蔽 iframe 内部原生滚动条（真正的滚动由应用层自绘滚动条驱动）
function hideNativeScrollbar(doc: Document | null, retry = false) {
  if (!doc) return;
  try {
    // head 可能尚未就绪（尤其是 sandbox 无 allow-scripts 时），等一帧再试
    if (!doc.head) {
      if (!retry) requestAnimationFrame(() => hideNativeScrollbar(doc, true));
      return;
    }
    // 彻底隐藏网页原生滚动条：Firefox/IE 用 scrollbar-width:none，WebKit 用 display:none
    const css = `
      html, body, * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
      html::-webkit-scrollbar, body::-webkit-scrollbar, *::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
    `;
    let styleEl = doc.getElementById('yz-scrollbar') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'yz-scrollbar';
      doc.head.appendChild(styleEl);
    }
    styleEl.textContent = css;

    // 延迟再注入一次：防止页面后续脚本/动态内容覆盖
    if (!retry) setTimeout(() => hideNativeScrollbar(doc, true), 800);
  } catch { /* 跨域文档无法访问时静默跳过 */ }
}

// ── 自定义滚动条（应用层自绘，控制 iframe 文档根滚动）──
const scrollThumbRef = ref<HTMLDivElement>();
const scrollbarVisible = ref(false);
const thumbStyle = ref<{ height: string; top: string }>({ height: '0px', top: '0px' });
let attachedScrollWin: Window | null = null;
let scrollDragState: { startY: number; startScrollTop: number; startThumbTop: number } | null = null;

/** 取同源 iframe 的根文档元素（跨域时返回 null） */
function getFrameDocEl(): HTMLElement | null {
  const iframe = document.querySelector('.page-frame') as HTMLIFrameElement | null;
  try { return iframe?.contentDocument?.documentElement ?? null; } catch { return null; }
}

/** 读取 iframe 根滚动指标，刷新自绘滚动条尺寸与位置 */
function refreshCustomScrollbar() {
  const docEl = getFrameDocEl();
  const viewportH = viewportRef.value?.clientHeight ?? 0;
  if (!docEl || !viewportH) { scrollbarVisible.value = false; return; }
  try {
    const scrollTop = docEl.scrollTop;
    const scrollHeight = docEl.scrollHeight;
    const clientHeight = docEl.clientHeight;
    if (!clientHeight || scrollHeight <= clientHeight + 1) {
      scrollbarVisible.value = false;
      return;
    }
    scrollbarVisible.value = true;
    const trackH = viewportH;
    const thumbH = Math.max(28, (clientHeight / scrollHeight) * trackH);
    const maxThumbTop = trackH - thumbH;
    const thumbTop = maxThumbTop <= 0 ? 0 : (scrollTop / (scrollHeight - clientHeight)) * maxThumbTop;
    thumbStyle.value = { height: `${thumbH}px`, top: `${thumbTop}px` };
  } catch { scrollbarVisible.value = false; }
}

/** iframe 内部滚动时同步自绘滚动条位置 */
function onIframeScroll() { refreshCustomScrollbar(); }

/** 点击轨道：跳转到点击位置 */
function onScrollbarTrack(e: PointerEvent) {
  const docEl = getFrameDocEl();
  if (!docEl) return;
  const trackH = viewportRef.value?.clientHeight ?? 0;
  const thumbH = parseFloat(thumbStyle.value.height) || 28;
  const maxThumbTop = trackH - thumbH;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  let newThumbTop = e.clientY - rect.top - thumbH / 2;
  newThumbTop = Math.max(0, Math.min(maxThumbTop, newThumbTop));
  const newScrollTop = maxThumbTop <= 0 ? 0 : (newThumbTop / maxThumbTop) * (docEl.scrollHeight - docEl.clientHeight);
  docEl.scrollTop = newScrollTop;
}

/** 拖拽滑块：跟随指针移动，反向驱动 iframe 文档滚动 */
function onScrollbarThumb(e: PointerEvent) {
  e.stopPropagation();
  const docEl = getFrameDocEl();
  if (!docEl) return;
  scrollDragState = {
    startY: e.clientY,
    startScrollTop: docEl.scrollTop,
    startThumbTop: parseFloat(thumbStyle.value.top) || 0,
  };
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
}

function onScrollbarThumbMove(e: PointerEvent) {
  if (!scrollDragState) return;
  const docEl = getFrameDocEl();
  if (!docEl) return;
  const trackH = viewportRef.value?.clientHeight ?? 0;
  const thumbH = parseFloat(thumbStyle.value.height) || 28;
  const maxThumbTop = trackH - thumbH;
  const dy = e.clientY - scrollDragState.startY;
  const newThumbTop = Math.max(0, Math.min(maxThumbTop, scrollDragState.startThumbTop + dy));
  const newScrollTop = maxThumbTop <= 0 ? 0 : (newThumbTop / maxThumbTop) * (docEl.scrollHeight - docEl.clientHeight);
  docEl.scrollTop = newScrollTop;
  thumbStyle.value = { height: `${thumbH}px`, top: `${newThumbTop}px` };
}

function onScrollbarThumbUp(e: PointerEvent) {
  scrollDragState = null;
  (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
}

/** 应用窗口尺寸变化：刷新自绘滚动条 */
function onAppResize() { refreshCustomScrollbar(); }

// iframe 加载完成后拦截链接点击 + 同步地址栏
function onFrameLoad() {
  loading.value = false;
  // Electron 桌面端：BrowserView 的导航事件由 onNavigated/onLoaded 回调处理，这里直接返回
  if (isElectron) return;
  // Web 端 iframe：拦截链接点击（原有逻辑）
  // 同源 iframe（无 allow-scripts），可以访问 contentDocument 拦截链接
  const iframe = document.querySelector('.page-frame') as HTMLIFrameElement | null;
  if (!iframe || !iframe.contentDocument) return;
  const doc = iframe.contentDocument;

  // 屏蔽 iframe 内部原生滚动条（改用应用层自绘滚动条）
  hideNativeScrollbar(doc);

  // 恢复当前缩放级别（导航/刷新后需要重新注入）
  if (pageZoom.value !== 1) applyZoom();

  // 监听 iframe 内部滚动，同步自绘滚动条位置
  const cw = iframe.contentWindow;
  if (cw && cw !== attachedScrollWin) {
    if (attachedScrollWin) attachedScrollWin.removeEventListener('scroll', onIframeScroll, true);
    cw.addEventListener('scroll', onIframeScroll, true);
    attachedScrollWin = cw;
  }
  refreshCustomScrollbar();

  // 拦截链接点击（capture 阶段，优先于页面内 handler）
  doc.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const link = target.closest('a') as HTMLAnchorElement | null;
    if (link && link.href) {
      e.preventDefault();
      e.stopPropagation();
      urlInput.value = link.href;
      navigate();
    }
  }, true);

  // 拦截表单提交（防止原生提交导致 iframe 跳出代理壳）
  doc.addEventListener('submit', (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // 同步地址栏（页面可能发生重定向，从后端 state 取真实 URL）
  try {
    fetch(`${API_BASE}/browser/state`).then(r => r.json()).then(resp => {
      if (resp.data?.url && resp.data.url !== currentUrl.value) {
        urlInput.value = resp.data.url;
        history.value[histIndex.value] = resp.data.url;
      }
    });
  } catch { /* ignore */ }
}


// 每次导航变化 → 记录到后端（供最近浏览/常用/每日 AI 分析）
watch(currentUrl, (u) => { if (u) recordVisit(u); });

// 智能体（LLM）调 browser_navigate 时，store.currentBrowserUrl 写入 url，
// 这里 watch 到后复用 openSite 导航 —— 让智能体打开的页面与预览面板共用同一浏览器（桌面 BrowserView）
const chatStore = useChatStore();
watch(
  () => chatStore.currentBrowserUrl,
  (url) => {
    if (!url) return;
    if (url === currentUrl.value) return; // 已打开同一页，避免重复导航
    openSite(url);
  },
);


async function recordVisit(url: string) {
  try {
    await fetch(`${API_BASE}/browser/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  } catch { /* 后端不可用则忽略，不影响浏览 */ }
}

async function fetchData() {
  try {
    const [h, a] = await Promise.all([
      fetch(`${API_BASE}/browser/history?days=30&limit=20`).then(r => r.json()),
      fetch(`${API_BASE}/browser/analysis`).then(r => r.json()),
    ]);
    recentList.value = (h.data && h.data.recent) || [];
    frequentList.value = (h.data && h.data.frequent) || [];
    const cached = a.data;
    const today = new Date().toISOString().slice(0, 10);
    if (cached && cached.date === today) {
      analysis.value = cached;
    } else {
      // 当天无缓存 → 用配置的模型平台生成（未配置则静默跳过）
      await ensureDailyAnalysis();
    }
  } catch {
    recentList.value = [];
    frequentList.value = [];
    analysis.value = null;
  }
}

/**
 * 用用户配置的「模型平台」生成今日浏览分析，回存缓存。
 * 未配置模型平台 → 静默跳过（不生成、不提示）。
 */
async function generateAnalysis() {
  analysisError.value = '';
  analysisGenerating.value = true;
  try {
    const ps = platformStore;
    if (ps.platforms.length === 0) await ps.loadPlatforms();
    if (ps.models.length === 0) await ps.loadModels();
    const llm = ps.models.find(m => m.type === 'llm' && m.isDefault)
      || ps.models.find(m => m.type === 'llm')
      || ps.models.find(m => m.enabled);
    const platform = llm && ps.platforms.find(p => p.id === llm.platformId);
    if (!llm || !platform) return; // 未配置 → 静默跳过

    const statsRes = await fetch(`${API_BASE}/browser/stats`).then(r => r.json());
    const stats = statsRes.data;
    if (!stats) return;

    const client = new LlmClient(platform, llm);
    const resp = await client.chat([
      { role: 'system', content: '你是一个简洁的「每日浏览行为分析」助手。只输出 JSON，不要任何多余文字。' },
      { role: 'user', content: buildAnalysisPrompt(stats) },
    ] as any);
    const text = (resp.delta?.content || '').trim();
    const parsed = parseAnalysis(text, stats);

    const payload = { ...parsed, date: stats.date, model: llm.modelId };
    await fetch(`${API_BASE}/browser/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    analysis.value = payload;
  } catch (e: any) {
    // 失败静默：不影响浏览，定时器会在下次补跑
    console.warn('[browser] 每日分析失败', e?.message);
  } finally {
    analysisGenerating.value = false;
  }
}

/** 每天定时跑：当天已完成则跳过；未配置平台则静默跳过 */
async function ensureDailyAnalysis() {
  const today = new Date().toISOString().slice(0, 10);
  if (analysis.value && analysis.value.date === today) return;
  await generateAnalysis();
}

// 单例定时器：每 30 分钟检查一次，跨日或新记录后自动补跑（仅应用运行时）
let dailyAnalysisTimer: ReturnType<typeof setInterval> | null = null;
function startDailyAnalysisScheduler() {
  if (dailyAnalysisTimer) return;
  dailyAnalysisTimer = setInterval(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (analysis.value && analysis.value.date === today) return;
    ensureDailyAnalysis();
  }, 30 * 60 * 1000);
}

function buildAnalysisPrompt(stats: any): string {
  const t = stats.today || {};
  const top = (t.topSites || []).map((s: any) => `${s.host}(${s.count}次)`).join('、') || '无';
  const cats = Object.entries(t.categories || {}).map(([k, v]) => `${k}:${v}`).join('、') || '无';
  const recent = (stats.recent || []).slice(0, 8).map((r: any) => r.host).join('、') || '无';
  return `以下是用户今天的网页浏览统计（日期 ${stats.date}）：\n` +
    `- 今日浏览总次数：${t.total ?? 0}，涉及站点数：${t.distinct ?? 0}\n` +
    `- 访问最频繁的站点：${top}\n` +
    `- 站点分类分布：${cats}\n` +
    `- 最近访问：${recent}\n\n` +
    `请据此生成一份「每日浏览分析」，用 JSON 返回，字段为：\n` +
    `{ "summary": "一句话总体概述（中文，30字内）", "suggestion": "一句健康/效率建议（中文，30字内）", "highlights": ["1-3条关键发现（中文短句）"] }`;
}

function parseAnalysis(text: string, stats: any): any {
  const base = {
    topSites: stats.today?.topSites || [],
    categories: stats.today?.categories || {},
    total: stats.today?.total ?? 0,
  };
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const obj = JSON.parse(m[0]);
      return {
        summary: obj.summary || '',
        suggestion: obj.suggestion || '',
        highlights: Array.isArray(obj.highlights) ? obj.highlights : [],
        ...base,
      };
    }
  } catch { /* ignore */ }
  return { summary: text.slice(0, 120), suggestion: '', highlights: [], ...base };
}

// ── 收藏 ──
function toggleBookmark() {
  const u = currentUrl.value;
  if (!u) return;
  const idx = bookmarks.value.findIndex(b => b.url === u);
  if (idx >= 0) {
    bookmarks.value.splice(idx, 1);
    ElMessage.success('已取消收藏');
  } else {
    bookmarks.value.unshift({ url: u, title: '' });
    ElMessage.success('已收藏');
  }
  safeSetJson('browser_bookmarks', bookmarks.value);
}
function removeBookmark(idx: number) {
  bookmarks.value.splice(idx, 1);
  safeSetJson('browser_bookmarks', bookmarks.value);
}
function visitBookmark(url: string) {
  urlInput.value = url;
  navigate();
  showBookmarks.value = false;
}

// ── 设置 ──
function onEngineChange(v: string) {
  searchEngine.value = v;
  safeSetString('browser_search_engine', v);
}
function onDefaultProxyChange(v: boolean) {
  defaultProxy.value = v;
  safeSetString('browser_default_proxy', v ? '1' : '0');

}
function addPin() {
  const name = newPinName.value.trim();
  let url = newPinUrl.value.trim();
  if (!name || !url) { ElMessage.warning('请填写名称和网址'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  pinned.value.unshift({ name, url });
  safeSetJson('browser_pinned', pinned.value);
  newPinName.value = '';
  newPinUrl.value = '';
  ElMessage.success('已添加');
}
function removePin(i: number) {
  pinned.value.splice(i, 1);
  safeSetJson('browser_pinned', pinned.value);
}
function openFromHistory(url: string) {
  openSite(url);
  showHistory.value = false;
}

function onMenuCommand(cmd: string) {
  if (cmd === 'history') { fetchData(); showHistory.value = true; }
  else if (cmd === 'settings') showSettings.value = true;
  else if (cmd === 'bookmarks') showBookmarks.value = true;
  else if (cmd === 'clearBookmarks') {
    bookmarks.value = [];
    safeSetJson('browser_bookmarks', []);
    ElMessage.success('收藏夹已清空');
  }
}

onMounted(() => {
  // 从路由 query 接收初始 URL（对话页点链接跳转过来），在应用内预览面板打开
  const initUrl = route.query.url;
  if (typeof initUrl === 'string' && /^https?:\/\//i.test(initUrl)) {
    nextTick(() => openSite(initUrl));
  }
  fetchData();
  startDailyAnalysisScheduler();

  // 监听外层主题切换：Web 端刷新自绘滚动条位置；Electron 端重新注入滚动条主题样式
  themeObserver = new MutationObserver(() => {
    if (isElectron) applyElectronScrollbarTheme();
    else refreshCustomScrollbar();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // Web 端：应用窗口 resize 时刷新自绘滚动条
  if (!isElectron) window.addEventListener('resize', onAppResize);

  // Electron 桌面端：注册 BrowserView 导航/加载回调 + 启动 ResizeObserver 同步 bounds
  if (isElectron) {
    const api = (window as any).electronAPI;
    // 监听 BrowserView 导航事件，同步地址栏 URL
    api.browserView.onNavigated((url: string) => {
      if (url && url !== currentUrl.value) {
        urlInput.value = url;
        history.value[histIndex.value] = url;
      }
      // 导航后更新可前进/后退状态
      api.browserView.canGoBack().then((v: boolean) => { electronCanBack.value = v; });
      api.browserView.canGoForward().then((v: boolean) => { electronCanForward.value = v; });
    });
    // 监听页面加载完成事件
    api.browserView.onLoaded((_url: string) => {
      loading.value = false;
      // 页面加载完成后注入滚动条主题样式（导航到新页面会重置，需重新注入）
      applyElectronScrollbarTheme();
    });

    // ResizeObserver 监听占位 div 尺寸变化，同步 BrowserView bounds
    browserViewResizeObserver = new ResizeObserver(() => syncBrowserViewBounds());
    // 初始时 placeholder 可能不存在（首页状态），用 watch 在它出现时开始观察
    if (browserViewPlaceholder.value) {
      browserViewResizeObserver.observe(browserViewPlaceholder.value);
    }
    // 监听 window 的 scroll 和 resize 事件（getBoundingClientRect 会随滚动变化）
    browserViewScrollHandler = () => syncBrowserViewBounds();
    browserViewResizeHandler = () => syncBrowserViewBounds();
    window.addEventListener('scroll', browserViewScrollHandler, true);
    window.addEventListener('resize', browserViewResizeHandler);
    // 初始同步一次
    syncBrowserViewBounds();
  }
});

// Electron 端：placeholder 出现时（用户导航到 URL）开始 ResizeObserver 观察
watch(browserViewPlaceholder, (el, oldEl) => {
  if (!browserViewResizeObserver) return;
  if (oldEl) browserViewResizeObserver.unobserve(oldEl);
  if (el) {
    browserViewResizeObserver.observe(el);
    syncBrowserViewBounds();
  }
});

onUnmounted(() => {
  if (resizeRafId !== null) {
    cancelAnimationFrame(resizeRafId);
    resizeRafId = null;
  }
  if (browserViewResizeObserver) {
    browserViewResizeObserver.disconnect();
    browserViewResizeObserver = null;
  }
  if (browserViewScrollHandler) {
    window.removeEventListener('scroll', browserViewScrollHandler, true);
    browserViewScrollHandler = null;
  }
  if (browserViewResizeHandler) {
    window.removeEventListener('resize', browserViewResizeHandler);
    browserViewResizeHandler = null;
  }
  if (themeObserver) {
    themeObserver.disconnect();
    themeObserver = null;
  }
  // Web 端：移除 resize 监听 + iframe 滚动监听
  if (!isElectron) {
    window.removeEventListener('resize', onAppResize);
    if (attachedScrollWin) {
      attachedScrollWin.removeEventListener('scroll', onIframeScroll, true);
      attachedScrollWin = null;
    }
  }
  // Electron 桌面端：组件卸载时隐藏 BrowserView
  if (isElectron) {
    try { (window as any).electronAPI.browserView.hide(); } catch { /* ignore */ }
  }
});

</script>

<style scoped>
.browser-shell { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--el-bg-color, #fff); min-height: 0; }

/* Chrome 风格工具栏 */
.browser-toolbar {
  display: flex; align-items: center; gap: 4px;
  padding: 8px 12px;
  background: var(--el-bg-color, #f1f3f4);
  border-bottom: 1px solid var(--el-border-color-lighter, #e0e0e0);
  flex-shrink: 0;
}
[data-theme="dark"] .browser-toolbar { background: #2b2d33; }

.nav-btn {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent;
  border-radius: 50%; cursor: pointer;
  color: var(--el-text-color-regular, #5f6368);
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.nav-btn:hover:not(:disabled) { background: rgba(0,0,0,0.08); }
[data-theme="dark"] .nav-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
.nav-btn:disabled { opacity: 0.4; cursor: default; }
.nav-btn.active { color: var(--el-color-primary, #7C3AED); }

.url-bar {
  flex: 1; display: flex; align-items: center; gap: 6px;
  height: 36px; padding: 0 12px;
  background: var(--el-fill-color-light, #fff);
  border: 1px solid transparent; border-radius: 18px;
  transition: all 0.15s; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
[data-theme="dark"] .url-bar { background: #3c4043; box-shadow: none; }
.url-bar.focused { border-color: var(--el-color-primary, #7C3AED); box-shadow: 0 1px 6px rgba(124,58,237,0.15); }
.url-lock { color: var(--el-text-color-secondary, #80868b); flex-shrink: 0; }
.url-input { flex: 1; border: none; outline: none; background: transparent; font-size: 14px; color: var(--el-text-color-primary, #202124); font-family: inherit; }
.url-input::placeholder { color: var(--el-text-color-placeholder, #9aa0a6); }
.url-clear { border: none; background: transparent; cursor: pointer; font-size: 18px; color: var(--el-text-color-secondary); line-height: 1; }
.url-clear:hover { color: var(--el-text-color-primary); }

/* 页面缩放组 */
.zoom-group { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.zoom-label {
  min-width: 48px; height: 28px; padding: 0 6px;
  border: none; background: transparent; border-radius: 8px;
  color: var(--el-text-color-regular, #5f6368); cursor: pointer;
  font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap;
  transition: background 0.15s;
}
.zoom-label:hover { background: rgba(0,0,0,0.08); }
[data-theme="dark"] .zoom-label:hover { background: rgba(255,255,255,0.1); }

/* 收藏夹栏 */
.bookmarks-bar {
  display: flex; gap: 4px; padding: 4px 12px;
  background: var(--el-bg-color-page, #f8f9fa);
  border-bottom: 1px solid var(--el-border-color-lighter, #e0e0e0);
  flex-shrink: 0; overflow-x: auto;
}
[data-theme="dark"] .bookmarks-bar { background: #23252b; }
.bookmark-item {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 12px;
  cursor: pointer; font-size: 12px; white-space: nowrap;
  color: var(--el-text-color-regular, #5f6368);
  transition: background 0.15s;
}
.bookmark-item:hover { background: rgba(0,0,0,0.08); }
[data-theme="dark"] .bookmark-item:hover { background: rgba(255,255,255,0.1); }

/* 起始主页 */
.home-page { flex: 1; min-height: 0; overflow-y: auto; padding: 40px 24px 32px; background: var(--el-bg-color-page, #fafafa); }
[data-theme="dark"] .home-page { background: #1b1d23; }
.home-search { display: flex; flex-direction: column; align-items: center; gap: 18px; margin-bottom: 36px; }
.home-logo { font-size: 34px; font-weight: 700; color: var(--el-color-primary, #7C3AED); letter-spacing: 4px; }
.home-search-box {
  display: flex; align-items: center; gap: 8px;
  width: min(620px, 92%); height: 48px; padding: 0 8px 0 16px;
  background: var(--el-bg-color, #fff); border: 1px solid var(--el-border-color, #dadce0);
  border-radius: 24px; box-shadow: 0 1px 6px rgba(0,0,0,0.08);
}
[data-theme="dark"] .home-search-box { background: #2b2d33; border-color: #3c4043; }
.home-search-box:focus-within { border-color: var(--el-color-primary, #7C3AED); box-shadow: 0 1px 8px rgba(124,58,237,0.18); }
.home-search-ico { color: var(--el-text-color-secondary, #9aa0a6); flex-shrink: 0; }
.home-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: 16px; color: var(--el-text-color-primary, #202124); }
.home-search-btn { border: none; background: var(--el-color-primary, #7C3AED); color: #fff; height: 36px; padding: 0 20px; border-radius: 18px; cursor: pointer; font-size: 14px; }
.home-search-btn:hover { filter: brightness(1.05); }

.home-section { width: min(880px, 96%); margin: 0 auto 28px; }
.home-section-title { font-size: 14px; font-weight: 600; color: var(--el-text-color-primary, #202124); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
.mini-refresh { border: none; background: transparent; cursor: pointer; font-size: 14px; color: var(--el-text-color-secondary); }
.mini-refresh:hover { color: var(--el-color-primary); }

.site-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 14px; }
.site-tile { display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer; padding: 8px 4px; border-radius: 12px; transition: background 0.15s; }
.site-tile:hover { background: rgba(0,0,0,0.05); }
[data-theme="dark"] .site-tile:hover { background: rgba(255,255,255,0.06); }
.site-avatar { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 20px; font-weight: 600; }
.site-avatar.sm { width: 34px; height: 34px; font-size: 14px; }
.site-name { font-size: 12px; color: var(--el-text-color-regular, #5f6368); max-width: 84px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.home-hint { font-size: 13px; color: var(--el-text-color-secondary); padding: 12px 0; }

.recent-list { display: flex; flex-direction: column; gap: 4px; }
.recent-item, .history-row { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 10px; cursor: pointer; transition: background 0.15s; }
.recent-item:hover, .history-row:hover { background: rgba(0,0,0,0.05); }
[data-theme="dark"] .recent-item:hover, .history-row:hover { background: rgba(255,255,255,0.06); }
.recent-meta { min-width: 0; }
.recent-title { font-size: 14px; color: var(--el-text-color-primary, #202124); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recent-sub { font-size: 12px; color: var(--el-text-color-secondary, #80868b); }

.analysis-card { background: var(--el-bg-color, #fff); border: 1px solid var(--el-border-color-lighter, #e0e0e0); border-radius: 12px; padding: 16px; }
[data-theme="dark"] .analysis-card { background: #2b2d33; border-color: #3c4043; }
.analysis-card.empty { color: var(--el-text-color-secondary); font-size: 13px; }
.analysis-summary { font-size: 14px; color: var(--el-text-color-primary, #202124); line-height: 1.6; }
.analysis-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
.analysis-tag { font-size: 12px; padding: 3px 10px; border-radius: 10px; background: rgba(124,58,237,0.1); color: var(--el-color-primary, #7C3AED); }
.analysis-highlights { margin: 8px 0 0; padding-left: 18px; font-size: 13px; color: var(--el-text-color-regular, #5f6368); line-height: 1.7; }
.analysis-suggest { font-size: 13px; color: var(--el-text-color-regular, #5f6368); line-height: 1.6; margin-top: 8px; }
.analysis-model { font-size: 11px; color: var(--el-text-color-secondary, #80868b); margin-top: 8px; }
.analysis-loading { font-size: 13px; color: var(--el-text-color-secondary, #80868b); }
.analysis-error { font-size: 12px; color: var(--el-color-danger, #f56c6c); margin-top: 6px; }

/* 页面渲染区 */
.browser-viewport { flex: 1; min-height: 0; position: relative; overflow: hidden; background: #fff; display: flex; flex-direction: column; }
[data-theme="dark"] .browser-viewport { background: #1b1d23; }
/* webview/iframe：flex:1 撑满 viewport */
.page-frame { flex: 1; width: 100%; min-width: 0; border: none; background: #fff; display: block; overflow: hidden; }
[data-theme="dark"] .page-frame { background: #1b1d23; }

/* 自定义滚动条（应用层自绘，覆盖在 iframe 右侧，原生已屏蔽） */
.custom-scrollbar {
  position: absolute; top: 0; right: 0; bottom: 0; width: 12px;
  z-index: 30; pointer-events: auto;
}
.custom-scrollbar-thumb {
  position: absolute; right: 3px; width: 6px;
  border-radius: 999px; background: var(--scrollbar-thumb, rgba(0,0,0,0.3));
  cursor: pointer; transition: background 0.15s;
}
.custom-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover, rgba(0,0,0,0.5)); }

/* Electron 桌面端：BrowserView 占位 div（原生 BrowserView 会覆盖此区域） */
.browser-view-placeholder { width: 100%; height: 100%; flex: 1; min-height: 0; }

.loading-overlay {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 12px;
  background: rgba(255,255,255,0.7); z-index: 5;
}
[data-theme="dark"] .loading-overlay { background: rgba(27,29,35,0.7); }
.loading-spinner {
  width: 36px; height: 36px; border: 3px solid rgba(124,58,237,0.2);
  border-top-color: var(--el-color-primary, #7C3AED); border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }


/* 桌面端原生浏览器占位（主窗口已加载外部网页，这里只做提示） */
.native-browser-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--el-bg-color-page, #fafafa); }
[data-theme="dark"] .native-browser-placeholder { background: #1b1d23; }
.placeholder-content { text-align: center; }
.placeholder-icon { font-size: 64px; margin-bottom: 16px; }
.placeholder-text { font-size: 18px; color: var(--el-text-color-primary); margin-bottom: 8px; }
.placeholder-hint { font-size: 13px; color: var(--el-text-color-secondary); max-width: 400px; margin: 0 auto; line-height: 1.6; }

/* 弹窗列表 */
.bookmark-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--el-border-color-lighter); }
.bm-title { font-size: 13px; color: var(--el-color-primary); cursor: pointer; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bm-title:hover { text-decoration: underline; }

.setting-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; }
.setting-label { font-size: 14px; color: var(--el-text-color-primary); }
.pin-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.pin-name { width: 90px; font-size: 13px; color: var(--el-text-color-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pin-url { flex: 1; font-size: 12px; color: var(--el-text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pin-del { border: none; background: transparent; color: var(--el-text-color-secondary); cursor: pointer; font-size: 18px; }
.pin-del:hover { color: var(--el-color-danger); }
.pin-add { display: flex; gap: 8px; align-items: center; margin-top: 10px; }



</style>
