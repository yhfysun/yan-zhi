<template>
  <div class="browser-shell" @click="hideTabCtx">
    <!-- 多标签页栏（Chrome 风格） -->
    <div class="browser-tabbar">
      <div class="tab-list">
        <div
          v-for="tab in tabs" :key="tab.id"
          class="tab-item"
          :class="{ active: tab.id === activeTabId }"
          @click="switchTab(tab.id)"
          @contextmenu.prevent="openTabContextMenu(tab.id, $event)"
        >
          <span class="tab-favicon" v-if="tab.loading">○</span>
          <span class="tab-favicon" v-else>●</span>
          <span class="tab-title">{{ tab.title || tab.url || '新标签页' }}</span>
          <button class="tab-close" @click.stop="closeTab(tab.id)" v-if="tabs.length > 1" title="关闭标签页">×</button>
        </div>
        <button class="tab-new" @click="newTab()" title="新建标签页">
          <svg viewBox="0 0 24 24" width="15" height="15"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor"/></svg>
        </button>
      </div>
      <!-- Tab 右键批量关闭菜单 -->
      <Teleport to="body">
<div v-if="tabCtx.visible" class="ctx-menu" :style="{ left: tabCtx.x + 'px', top: tabCtx.y + 'px' }"
        @click.stop @contextmenu.prevent>
        <div class="ctx-item" @click="ctxClose('tab')">关闭该标签页</div>
        <div class="ctx-item" @click="ctxClose('left')">关闭左侧标签页</div>
        <div class="ctx-item" @click="ctxClose('right')">关闭右侧标签页</div>
        <div class="ctx-item" @click="ctxClose('others')">关闭其他标签页</div>
        <div class="ctx-sep"></div>
        <div class="ctx-item danger" @click="ctxClose('all')">关闭全部标签页</div>
      </div>
</Teleport>
    </div>

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

      <!-- 引用到对话：把当前页面 URL 作为引用 chip 加入聊天输入区 -->
      <button class="nav-btn" @click="addQuotedUrl(currentUrl)" :disabled="!currentUrl" title="引用到任务">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
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

      <!-- 密码管理按钮 -->
      <button class="nav-btn" @click="openPasswordManager" title="密码管理">
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M7 11V7a5 5 0 0110 0v4M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2z"/></svg>
      </button>

      <!-- 更多菜单 ⋮ -->
      <el-dropdown trigger="click" @visible-change="onMoreMenuVisible" @command="onMenuCommand">
        <button class="nav-btn" title="更多工具">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="history">浏览历史 ({{ recentList.length }})</el-dropdown-item>
            <el-dropdown-item command="passwords">密码管理 ({{ savedPasswords.length }})</el-dropdown-item>
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
      <!-- Electron + webview 引擎：DOM 内嵌 <webview>，浮层可覆盖（替代原生 BrowserView 图层） -->
      <template v-if="isWebviewEngine">
        <webview
          v-for="t in tabs"
          :key="t.id"
          :ref="bindWebviewRef(t.id)"
          class="page-webview"
          :class="{ 'wv-active': t.id === activeTabId }"
          :src="t.url || 'about:blank'"
          partition="persist:browser-view"
          allowpopups="true"
          @dom-ready="onWebviewReady(t.id)"
          @did-navigate="onWebviewNavigated(t.id, $event)"
          @did-navigate-in-page="onWebviewNavigated(t.id, $event)"
          @page-title-updated="onWebviewTitle(t.id, $event)"
          @did-start-loading="onWebviewLoading(t.id, true)"
          @did-stop-loading="onWebviewLoading(t.id, false)"
        ></webview>
      </template>
      <!-- Electron + 旧引擎：BrowserView 占位 div（原生 BrowserView 会覆盖此区域） -->
      <div v-else-if="isElectron" ref="browserViewPlaceholder" class="browser-view-placeholder"></div>
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

    <!-- 密码管理弹窗 -->
    <el-dialog v-model="showPasswords" title="密码管理" width="560px" append-to-body>
      <div class="pwd-toolbar">
        <el-button size="small" type="primary" @click="openPasswordEditor(null)">添加密码</el-button>
        <el-button size="small" @click="loadSavedPasswords">刷新</el-button>
      </div>
      <div v-if="savedPasswords.length === 0" style="text-align:center;padding:30px;color:var(--el-text-color-secondary)">暂无已保存密码</div>
      <div v-for="p in savedPasswords" :key="p.id" class="pwd-row">
        <div class="pwd-main">
          <div class="pwd-host">{{ p.name || p.host }}</div>
          <div class="pwd-sub">{{ p.username }} · {{ p.host }}<span v-if="revealedPwd[p.id]"> · {{ revealedPwd[p.id] }}</span></div>
        </div>
        <div class="pwd-actions">
          <el-button size="small" text @click="revealPassword(p)">查看</el-button>
          <el-button size="small" text @click="fillPassword(p)">填充</el-button>
          <el-button size="small" text @click="openPasswordEditor(p)">编辑</el-button>
          <el-button size="small" text type="danger" @click="deletePassword(p)">删除</el-button>
        </div>
      </div>
    </el-dialog>

    <!-- 保存/编辑密码弹窗 -->
    <el-dialog v-model="showPasswordEditor" :title="editingPassword ? '编辑密码' : '保存密码'" width="420px" append-to-body :close-on-click-modal="false">
      <el-form label-width="72px" size="small">
        <el-form-item label="站点名">
          <el-input v-model="pwdForm.name" placeholder="可选，如 某AI视频站" />
        </el-form-item>
        <el-form-item label="网址">
          <el-input v-model="pwdForm.url" placeholder="https://..." @blur="syncPwdHost" />
        </el-form-item>
        <el-form-item label="域名">
          <el-input v-model="pwdForm.host" placeholder="example.com" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="pwdForm.username" placeholder="账号/邮箱/手机号" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="pwdForm.password" type="password" show-password placeholder="密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="showPasswordEditor = false">取消</el-button>
        <el-button size="small" type="primary" @click="savePasswordForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { ElMessage } from 'element-plus';
import { ZoomIn, ZoomOut } from '@element-plus/icons-vue';
import { usePlatformStore } from '../stores/platform';
import { useChatStore } from '../stores/chat';
import { useBrowserStore, type BrowserTab } from '../stores/browser';
import { usePlatform } from '../composables/usePlatform';
import { LlmClient } from '@yan-zhi/core';
import { API_BASE } from '../api/client';
import { useRoute } from 'vue-router';
import { settingsDrawerOpen } from '../composables/useSettingsDrawer';
import { titleBarOverlayOpen } from '../composables/useTitleBarOverlay';
import { useChat } from '../composables/chat/useChat';

// ── 平台检测 ──
const { isDesktop } = usePlatform();

// 检测是否在 Electron 桌面端（有 electronAPI 标识）
const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

// ── 浏览器引擎 ──
// webview：<webview> DOM 内嵌，参与正常层叠，应用内浮层（弹窗/下拉/设置抽屉）可覆盖网页 —— 与豆包一致
// browserview：旧原生图层，永远盖在 DOM 之上（回退用）
// 初始值与主进程 BROWSER_ENGINE_DEFAULT 保持一致，挂载后以主进程为准校正一次。
const browserEngine = ref<'webview' | 'browserview'>('webview');
const isWebviewEngine = computed(() => isElectron && browserEngine.value === 'webview');

// ── 组件空间：preview=对话页右栏预览（pageAgent 执行面）| page=/browser 独立浏览器页 ──
// 两边 tab 列表完全隔离（各自独立的 browser store 实例）。
const props = defineProps<{ scope?: 'preview' | 'page' }>();
const browserScope = (props.scope || 'page') as 'preview' | 'page';

// ── 多标签页管理（Electron 桌面端）──
// tabs/激活 tab/视图状态按空间存对应 browser store：路由切换组件卸载不丢，
// 重新挂载恢复访问状态（切到任务页再回浏览器，该空间的 tab 原样保留）。
const browserStore = useBrowserStore(browserScope);
const {
  tabs, activeTabId, urlInput, history, histIndex,
  pageZoom, electronCanBack, electronCanForward, loading,
} = storeToRefs(browserStore);
const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value));

// 路由 query（支持从对话页跳转并传初始 URL）
const route = useRoute();

// 聊天区弹窗开关（useChat 单例）：任一打开时隐藏原生 BrowserView，避免弹窗被其遮挡
const {
  showMount, showSkills, platformConfigDialogVisible, snapshotDialog,
  showAgentEdit, showWorkspaceDir, showSpaceEdit,
  addQuotedUrl,
} = useChat();


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

const homeInput = ref('');
const urlFocused = ref(false);

// ── 远程浏览器状态 ──
const viewportRef = ref<HTMLDivElement>();
const browserViewPlaceholder = ref<HTMLDivElement>();
const iframeKey = ref(0);

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
      try { bv.setZoomFactor(activeTabId.value, pageZoom.value); } catch { /* ignore */ }
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
  if (api?.setTheme) api.setTheme(activeTabId.value, dark ? 'dark' : 'light');
}

// ── 多标签页管理函数 ──
async function newTab(url?: string) {
  hideTabCtx();
  const api = (window as any).electronAPI;
  let tabId = '';
  if (isElectron && api?.browserView?.createTab) {
    // 主进程记录 tab 归属空间：agent 工具链的 ensureActiveTab('preview') 据此只认预览空间的 tab
    tabId = await api.browserView.createTab(browserScope);
  } else {
    tabId = 'web-tab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  }
  const tab: BrowserTab = {
    id: tabId,
    url: url || '',
    title: '',
    loading: false,
    urlInput: url || '',
    history: url ? [url] : [],
    histIndex: url ? 0 : -1,
    pageZoom: 1,
    canBack: false,
    canForward: false,
  };
  tabs.value.push(tab);
  await switchTab(tabId);
  if (url) {
    urlInput.value = url;
    navigate();
  }
}

async function switchTab(tabId: string) {
  hideTabCtx();
  if (tabId === activeTabId.value) return;
  // 保存当前标签状态
  if (activeTab.value) {
    activeTab.value.urlInput = urlInput.value;
    activeTab.value.history = [...history.value];
    activeTab.value.histIndex = histIndex.value;
    activeTab.value.pageZoom = pageZoom.value;
    activeTab.value.canBack = electronCanBack.value;
    activeTab.value.canForward = electronCanForward.value;
  }
  // 切换激活标签
  activeTabId.value = tabId;
  const tab = tabs.value.find(t => t.id === tabId);
  if (!tab) return;
  // 恢复标签状态到当前 ref
  urlInput.value = tab.urlInput;
  history.value = [...tab.history];
  histIndex.value = tab.histIndex;
  // 兜底：tab.url 由 navigate/onNavigated 实时维护，是"当前真实页面"的单一真相；
  // 若快照历史与它脱节（历史版本只存快照、页内跳转漏记等），以 tab.url 重建当前项，
  // 防止恢复后 currentUrl 为空而误显示起始主页。
  if (tab.url && currentUrl.value !== tab.url) {
    pushHistory(tab.url);
    tab.history = [...history.value];
    tab.histIndex = histIndex.value;
  }
  pageZoom.value = tab.pageZoom;
  electronCanBack.value = tab.canBack;
  electronCanForward.value = tab.canForward;
  loading.value = tab.loading;
  // Electron 端：通知主进程激活该标签的 BrowserView
  if (isElectron) {
    const api = (window as any).electronAPI;
    await api.browserView.activateTab(tabId);
    // 缩放单一真相源已迁到主进程 entry.zoomFactor：切换标签时以实际因子校正 UI 显示，
    // 避免只恢复 display（tab.pageZoom）而与实际缩放脱节。
    try {
      const z = await api.browserView.getZoomFactor(tabId);
      if (typeof z === 'number' && z > 0) {
        pageZoom.value = +z.toFixed(2);
        tab.pageZoom = pageZoom.value;
      }
    } catch { /* ignore */ }
    if (tab.url) {
      await nextTick();
      syncBrowserViewBounds();
    } else {
      api.browserView.hide(tabId);
    }
  }
}

// ── Tab 右键批量关闭菜单（关闭该页/左侧/右侧/其他/全部）──
const tabCtx = ref<{ visible: boolean; x: number; y: number; tabId: string }>({ visible: false, x: 0, y: 0, tabId: '' });
function openTabContextMenu(tabId: string, e: MouseEvent) {
  const W = 172, H = 206, pad = 8;
  const x = Math.min(e.clientX, window.innerWidth - W - pad);
  const y = Math.min(e.clientY, window.innerHeight - H - pad);
  tabCtx.value = { visible: true, x, y, tabId };
}
function hideTabCtx() { if (tabCtx.value.visible) tabCtx.value.visible = false; }
async function ctxClose(mode: 'tab' | 'left' | 'right' | 'others' | 'all') {
  const target = tabCtx.value.tabId;
  hideTabCtx();
  const list: string[] = [];
  const i = tabs.value.findIndex(t => t.id === target);
  if (mode === 'tab') { list.push(target); }
  else if (mode === 'left' && i >= 0) { for (let k = 0; k < i; k++) list.push(tabs.value[k].id); }
  else if (mode === 'right' && i >= 0) { for (let k = i + 1; k < tabs.value.length; k++) list.push(tabs.value[k].id); }
  else if (mode === 'others' && i >= 0) { for (let k = 0; k < tabs.value.length; k++) if (k !== i) list.push(tabs.value[k].id); }
  else if (mode === 'all') { for (const t of tabs.value) list.push(t.id); }
  if (mode !== 'all') {
    // 逐个关闭：用闭包固定待关集合(closeTab 内部会改 tabs,不能在循环里取 idx)
    for (const id of [...list]) {
      const idx = tabs.value.findIndex(t => t.id === id);
      if (idx === -1) continue;
      if (isElectron) { try { await (window as any).electronAPI.browserView.closeTab(id, true); } catch { /* ignore */ } }
      tabs.value.splice(idx, 1);
      if (activeTabId.value === id) {
        const nextTab = tabs.value[idx] || tabs.value[idx - 1] || null;
        if (nextTab) await switchTab(nextTab.id);
        else { activeTabId.value = ''; urlInput.value = ''; history.value = []; histIndex.value = -1; }
      }
    }
  } else {
    // 关闭全部：关光后自动新建一个空白标签，避免出现空标签栏
    for (const id of [...list]) {
      if (isElectron) { try { await (window as any).electronAPI.browserView.closeTab(id, true); } catch { /* ignore */ } }
      const k = tabs.value.findIndex(t => t.id === id);
      if (k >= 0) tabs.value.splice(k, 1);
    }
    if (tabs.value.length === 0) await newTab();
  }
}

async function closeTab(tabId: string) {
  const idx = tabs.value.findIndex(t => t.id === tabId);
  if (idx === -1) return;
  // Electron 端：关闭主进程中的 BrowserView。
  // fromUi=true：渲染层自行顶替相邻 tab，主进程不做 R5 顶替/广播，避免双顶替抖动。
  if (isElectron) {
    const api = (window as any).electronAPI;
    await api.browserView.closeTab(tabId, true);
  }
  tabs.value.splice(idx, 1);
  // 如果关闭的是当前标签，切换到相邻标签
  if (activeTabId.value === tabId) {
    const nextTab = tabs.value[idx] || tabs.value[idx - 1];
    if (nextTab) {
      await switchTab(nextTab.id);
    } else {
      activeTabId.value = '';
      urlInput.value = '';
      history.value = [];
      histIndex.value = -1;
    }
  }
}

// ── BrowserView 尺寸同步：监听占位 div 尺寸/位置变化，调用 setBounds 同步原生 BrowserView ──
let browserViewResizeObserver: ResizeObserver | null = null;
let browserViewScrollHandler: (() => void) | null = null;
let browserViewResizeHandler: (() => void) | null = null;
// 监听外层主题切换，同步到 iframe 内部滚动条
let themeObserver: MutationObserver | null = null;

/** 计算占位 div 在 BrowserWindow 内的坐标，同步到 BrowserView bounds */
let resizeRafId: number | null = null;
let lastSyncAt = 0;
let pendingSync = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
/** bounds 同步最小间隔：ResizeObserver 在拖拽/过渡期间每帧回调，过密的 IPC 会拖慢 UI */
const SYNC_MIN_INTERVAL = 100;

function hideBrowserView() {
  try { (window as any).electronAPI.browserView.hide(activeTabId.value); } catch { /* ignore */ }
}

function runBoundsSync() {
  // 用 requestAnimationFrame 等布局稳定后再计算，确保窗口缩放时等比例更新
  if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
  resizeRafId = requestAnimationFrame(() => {
    resizeRafId = null;
    lastSyncAt = Date.now();
    // 单一闸门：面板收起 / 当前不是浏览器 tab → 隐藏。
    // 面板收起时 CSS 只是宽度过渡归 0 + 透明（并非 display:none），占位元素仍在 DOM，
    // ResizeObserver 会在过渡期间连续回调；不判断可见性会把 hide() 的效果覆盖回去，
    // 导致原生图层残留（容器 UI 已隐藏、网页却仍浮在窗口上）。
    const el = browserViewPlaceholder.value;
    if (!shouldBeVisible.value || !el) { hideBrowserView(); return; }
    const rect = el.getBoundingClientRect();
    // 面板可见但尺寸仍为 0（CSS 过渡中）：跳过本次，等尾部补的那一次同步对齐
    if (rect.width < 1 || rect.height < 1) return;
    // Electron 33 的 setBounds 使用 CSS 像素（逻辑像素），不需要乘以 DPR
    (window as any).electronAPI.browserView.resize(
      activeTabId.value,
      Math.round(rect.left),
      Math.round(rect.top),
      Math.round(rect.width),
      Math.round(rect.height),
    );
  });
}

/**
 * 同步占位 div 矩形到原生 BrowserView。
 * 100ms 节流 + 尾部补一次：纯 rAF 防抖在拖拽期间会被每帧回调饿死（一次都不执行），
 * 改成节流后拖拽过程可见跟随，松手后再补一次保证 bounds 精确对齐。
 */
function syncBrowserViewBounds(force = false) {
  if (!isElectron) return;
  const elapsed = Date.now() - lastSyncAt;
  if (force || elapsed >= SYNC_MIN_INTERVAL) {
    if (syncTimer !== null) { clearTimeout(syncTimer); syncTimer = null; }
    pendingSync = false;
    runBoundsSync();
    return;
  }
  pendingSync = true;
  if (syncTimer === null) {
    syncTimer = setTimeout(() => {
      syncTimer = null;
      if (pendingSync) { pendingSync = false; runBoundsSync(); }
    }, SYNC_MIN_INTERVAL - elapsed);
  }
}

// ── 历史栈 ──
// history/histIndex/electronCanBack/electronCanForward 存全局 browser store（见顶部解构），
// 此处只保留依赖它们的派生状态。
const currentUrl = computed(() => history.value[histIndex.value] || '');
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
// 是否停留在"起始主页"。webview 引擎以激活 tab 的 url（单 tab 真相源）为准；
// 旧引擎/Web 端沿用历史栈(iframe/地址依赖 currentUrl)，语义不变。
// 根因修复：曾有"tab.url 已为目标网址、currentUrl(全局历史)却为空 → 显示首页而非网页"的
// 状态脱节；用 activeTab.url 判据可消除(URL 到了 tab 就应切走主页)。
const showHome = computed(() => isWebviewEngine.value
  ? !(activeTab.value && activeTab.value.url)
  : !currentUrl.value);

const pinned = ref<Pin[]>(safeGetJson('browser_pinned', DEFAULT_PINNED));
const searchEngine = ref(safeGetString('browser_search_engine', 'baidu'));
const defaultProxy = ref(safeGetString('browser_default_proxy', '1') === '1');
const engineName = computed(() => (SEARCH_ENGINES[searchEngine.value] || SEARCH_ENGINES.baidu).name);

const showBookmarks = ref(false);
const showHistory = ref(false);
const showSettings = ref(false);
const showPasswords = ref(false);
const showPasswordEditor = ref(false);
const newPinName = ref('');
const newPinUrl = ref('');

// Electron 桌面端：BrowserView 是原生图层，永远覆盖主窗口 DOM 之上，
// 任何 el-dialog / 全局设置抽屉 / "更多"下拉菜单（teleport 到 body 的 popper）展开时
// 都落在页面区域上方，会被它挡住。统一做法：这些浮层打开期间把 BrowserView 隐藏，
// 关闭后由 shouldBeVisible 的 watch 自动恢复（见下方单一闸门，防止节流中的 bounds 同步把视图盖回来）。
const moreMenuOpen = ref(false);
function onMoreMenuVisible(visible: boolean) {
  moreMenuOpen.value = visible;
}

// 聊天区弹窗（模型平台/Skill/MCP/编辑智能体/工作目录/编辑空间/查看提示词）避让右侧预览面板：
// 不隐藏 BrowserView（预览保持可见），而是把弹窗居中容器 .el-overlay-dialog 限制在面板左侧的可用区域，
// 弹窗在排除预览宽度后的区域居中，绝不跨入预览面板。JS 直接读面板宽度设内联 style，可靠生效。
function applyDialogAvoidPanel() {
  if (!isElectron) return;
  const panel = document.querySelector('.right-panel.open') as HTMLElement | null;
  const panelW = panel ? panel.offsetWidth : 0;
  document.querySelectorAll<HTMLElement>('.el-overlay-dialog').forEach(el => {
    if (panelW > 0) {
      el.style.setProperty('position', 'fixed', 'important');
      el.style.setProperty('left', '0', 'important');
      el.style.setProperty('right', panelW + 'px', 'important');
      el.style.setProperty('top', '0', 'important');
      el.style.setProperty('bottom', '0', 'important');
    } else {
      el.style.removeProperty('position');
      el.style.removeProperty('left');
      el.style.removeProperty('right');
      el.style.removeProperty('top');
      el.style.removeProperty('bottom');
    }
  });
  document.querySelectorAll<HTMLElement>('.el-dialog').forEach(el => {
    if (panelW > 0) {
      el.style.setProperty('max-width', `calc(100vw - ${panelW}px - 24px)`, 'important');
    } else {
      el.style.removeProperty('max-width');
    }
  });
}
watch(
  () => showMount.value || showSkills.value || platformConfigDialogVisible.value || snapshotDialog.value
    || showAgentEdit.value || showWorkspaceDir.value || showSpaceEdit.value,
  (open) => {
    if (!isElectron) return;
    if (open) nextTick(() => requestAnimationFrame(applyDialogAvoidPanel));
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
  // 更新当前标签的 url
  if (activeTab.value) {
    // url 变化会驱动 <webview :src> 自动加载（webview 引擎）；旧引擎/Web 端走下面显式加载
    activeTab.value.url = target;
    activeTab.value.urlInput = target;
    // 快照实时同步：tab.history/histIndex 只在 switchTab 时互存的话，路由切换（/browser 页 ↔
    // 对话页预览面板）重挂后 switchTab 会恢复到过期快照（history=[]），currentUrl 清空 →
    // showHome 误显示起始主页（"点了百度、tab 标题是百度、页面却变首页"的串扰根因）。
    activeTab.value.history = [...history.value];
    activeTab.value.histIndex = histIndex.value;
  }
  // webview 引擎：由 :src 响应式驱动加载，且需等 guest 出现（Vue 渲染 <webview> 后 dom-ready 注册）
  if (isWebviewEngine.value) {
    const webEl = webviewEls.get(activeTabId.value);
    if (!webEl) {
      // guest 尚未渲染：等下一次 watch(激活 url) 兜底加载
      await nextTick();
      const now = webviewEls.get(activeTabId.value);
      if (now) now.src = target;
    }
    // 归还控制权：导航实际由 guest 的 did-navigate 事件回写（onWebviewNavigated）
    return;
  }
  loading.value = true;
  iframeKey.value++;
  // Electron + 旧引擎：用 BrowserView 加载 URL，并同步 bounds
  if (isElectron) {
    const tid = activeTabId.value;
    // 等待 Vue 重新渲染（browserViewPlaceholder 需要先出现在 DOM 中才能计算 bounds）
    await nextTick();
    syncBrowserViewBounds();
    try {
      await (window as any).electronAPI.browserView.load(tid, target);
      // 加载后再次同步 bounds（确保 BrowserView 尺寸正确）
      syncBrowserViewBounds();
    } catch (e) {
      console.warn('[browser] BrowserView load 失败', e);
    }
    // 更新可前进/后退状态
    electronCanBack.value = await (window as any).electronAPI.browserView.canGoBack(tid);
    electronCanForward.value = await (window as any).electronAPI.browserView.canGoForward(tid);
    if (activeTab.value) {
      activeTab.value.canBack = electronCanBack.value;
      activeTab.value.canForward = electronCanForward.value;
    }
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
  if (activeTab.value) {
    activeTab.value.url = '';
    activeTab.value.urlInput = '';
    // 快照实时同步（同 navigate()）
    activeTab.value.history = [];
    activeTab.value.histIndex = -1;
  }
  // Electron 桌面端：隐藏 BrowserView，让主页可见
  if (isElectron) {
    electronCanBack.value = false;
    electronCanForward.value = false;
  }
  // webview 引擎：activeTab.url 清空 → :src 变 about:blank，且 v-if(!currentUrl) 隐藏视口显示主页
}

// 后退/前进/刷新（前端切换 iframe src，重新触发 /render 加载）
async function goBack() {
  if (loading.value) return;
  // webview 引擎：驱动原生 back 实现的后退
  if (isWebviewEngine.value) {
    const webEl = webviewEls.get(activeTabId.value);
    if (!webEl || !electronCanBack.value) return;
    try {
      await (window as any).electronAPI.browserView.back(activeTabId.value);
    } catch { /* ignore */ }
    return;
  }
  // Electron + 旧引擎：调用 BrowserView.goBack
  if (isElectron) {
    const tid = activeTabId.value;
    if (!electronCanBack.value) return;
    await (window as any).electronAPI.browserView.back(tid);
    electronCanBack.value = await (window as any).electronAPI.browserView.canGoBack(tid);
    electronCanForward.value = await (window as any).electronAPI.browserView.canGoForward(tid);
    return;
  }
  // Web 端：更新历史栈 + 重新加载
  if (histIndex.value <= 0) return;
  histIndex.value--;
  urlInput.value = currentUrl.value;
  loading.value = true;
  iframeKey.value++;
  // 快照实时同步（同 navigate()）
  if (activeTab.value) { activeTab.value.history = [...history.value]; activeTab.value.histIndex = histIndex.value; }
}

async function goForward() {
  if (loading.value) return;
  // webview 引擎：驱动原生 forward 实现的前进
  if (isWebviewEngine.value) {
    const webEl = webviewEls.get(activeTabId.value);
    if (!webEl || !electronCanForward.value) return;
    try {
      await (window as any).electronAPI.browserView.forward(activeTabId.value);
    } catch { /* ignore */ }
    return;
  }
  // Electron + 旧引擎：调用 BrowserView.goForward
  if (isElectron) {
    const tid = activeTabId.value;
    if (!electronCanForward.value) return;
    await (window as any).electronAPI.browserView.forward(tid);
    electronCanBack.value = await (window as any).electronAPI.browserView.canGoBack(tid);
    electronCanForward.value = await (window as any).electronAPI.browserView.canGoForward(tid);
    return;
  }
  // Web 端：更新历史栈 + 重新加载
  if (histIndex.value >= history.value.length - 1) return;
  histIndex.value++;
  urlInput.value = currentUrl.value;
  loading.value = true;
  iframeKey.value++;
  // 快照实时同步（同 navigate()）
  if (activeTab.value) { activeTab.value.history = [...history.value]; activeTab.value.histIndex = histIndex.value; }
}

async function refresh() {
  if (!currentUrl.value) return;
  // webview 引擎：直接 reload 激活的 guest（.src 指向相同 url 不会触发重新加载，须显式 reload）
  if (isWebviewEngine.value) {
    const webEl = webviewEls.get(activeTabId.value);
    if (!webEl) return;
    loading.value = true;
    try {
      await (window as any).electronAPI.browserView.reload(activeTabId.value);
    } catch (e) {
      console.warn('[browser] reload 失败', e);
    }
    return;
  }
  // Electron + 旧引擎：调用 BrowserView.reload（不检查 loading，允许刷新正在加载的页面）
  if (isElectron) {
    loading.value = true;
    try {
      await (window as any).electronAPI.browserView.reload(activeTabId.value);
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


// 智能体（LLM）调 browser_navigate 时，store.currentBrowserUrl 写入 url，
// 这里 watch 到后复用 openSite 导航 —— 让智能体打开的页面与预览面板共用同一浏览器（桌面 BrowserView）
const chatStore = useChatStore();

// 每次导航变化 → 记录到后端（供最近浏览/常用/每日 AI 分析）
// pageAgent 导航时 skipNextRecordVisit=true，跳过记录（不记录智能体浏览历史）。
// skip 标记只由 preview 空间实例消费：page 空间（/browser 页）的浏览照常记录，
// 且不能误吃掉 agent 导航的 skip 标记。
watch(currentUrl, (u) => {
  if (!u) return;
  if (browserScope === 'preview' && chatStore.skipNextRecordVisit) { chatStore.skipNextRecordVisit = false; return; }
  recordVisit(u);
});

/**
 * 渲染层单一可见性闸门：整个组件只有这一处判断 BrowserView 该不该可见。
 * 主进程侧由 applyVisibility(entry) 收敛挂载/摘除，这里只负责表达意图。
 * 早期两侧各有两份重复判断（syncBrowserViewBounds / onNavigated），容易漂移。
 *
 * 按空间区分：
 * - page（/browser 独立页）：整页即浏览器，随路由可见。绝不能用对话页右栏状态判断——
 *   否则 rightPanelOpen=false 时在 /browser 导航会被闸门 hide，表现为"第一次进百度黑屏"。
 * - preview（对话页右栏）：右栏展开且激活 tab 是浏览器时可见。
 */
const isBrowserPageRoute = computed(() => route.name === 'browser');
const shouldBeVisible = computed(() => {
  // 浮层避让：仅旧 BrowserView 原生图层需要（它永远盖在 DOM 上方，弹窗会被挡）。
  // webview 引擎下网页是普通 DOM 节点，弹窗/下拉天然浮在其上，无需本地隐藏。
  if (!isWebviewEngine.value) {
    if (moreMenuOpen.value || titleBarOverlayOpen.value || showBookmarks.value || showHistory.value ||
        showSettings.value || showPasswords.value || showPasswordEditor.value || settingsDrawerOpen.value) return false;
  }
  return browserScope === 'page'
    ? isBrowserPageRoute.value
    : chatStore.rightPanelOpen && chatStore.activeTab?.kind === 'browser';
});
// 可见性变化（右栏收起展开、切 tab）立即同步一次，不等节流窗口
watch(shouldBeVisible, () => { nextTick(() => syncBrowserViewBounds(true)); }, { flush: 'post' });

// webview 引擎：激活 tab 切换时补一次滚动条样式注入——
// 后台 tab 加载结束(did-stop-loading)时 onWebviewLoading 不覆盖非激活，故切回时主动重注入样式。
watch(
  () => (isWebviewEngine.value ? activeTabId.value : ''),
  () => { if (isWebviewEngine.value) { nextTick(() => applyElectronScrollbarTheme()); } },
  { flush: 'post' },
);

// ── webview 引擎：DOM 内嵌网页的元素级事件处理 ──
// 旧引擎下这些状态由主进程推送（browserView:onNavigated/onLoaded/onTitleUpdated）；
// webview 引擎下 guest 就在渲染层 DOM 里，直接监听元素事件，链路更短也更可靠。
const webviewEls = new Map<string, any>();
function setWebviewRef(tabId: string, el: any) {
  if (el) webviewEls.set(tabId, el);
  else webviewEls.delete(tabId);
}
/** 模板 ref 回调工厂：Vue 对每个 tab 生成的箭头函数参数需显式 any（strict 无隐式 any） */
const bindWebviewRef = (tabId: string) => (el: any) => setWebviewRef(tabId, el);

/** guest 挂载完成：把 webContentsId 注册给主进程，pageAgent 才能操作这个 tab */
function onWebviewReady(tabId: string) {
  const el = webviewEls.get(tabId);
  if (!el) return;
  try {
    const id = typeof el.getWebContentsId === 'function' ? el.getWebContentsId() : null;
    if (id) {
      (window as any).electronAPI?.browser?.wvRegister?.(tabId, id, browserScope);
    } else {
      console.warn('[browser] webview.getWebContentsId 不可用，pageAgent 将无法操作该 tab');
    }
  } catch (e) {
    console.warn('[browser] webview guest 注册失败', e);
  }
}

/** 导航状态统一处理（主进程推送与 webview 元素事件共用） */
function applyNavigated(tid: string, url: string) {
  if (tid !== activeTabId.value || !url) return;
  // 旧引擎：面板未打开却收到导航事件 → 隐藏图层避免残留（webview 引擎无需此兜底）
  if (!isWebviewEngine.value && !shouldBeVisible.value) {
    try { (window as any).electronAPI.browserView.hide(tid); } catch { /* ignore */ }
    return;
  }
  if (url !== currentUrl.value) {
    urlInput.value = url;
    // 起始页/空历史状态下 histIndex=-1，history[-1]=url 是无效写入 → currentUrl 永远为空、
    // showHome 卡死。无有效历史项时按新导航入栈。
    if (histIndex.value < 0 || histIndex.value >= history.value.length) {
      pushHistory(url);
    } else {
      history.value[histIndex.value] = url;
    }
    if (activeTab.value) {
      activeTab.value.url = url;
      activeTab.value.urlInput = url;
      // 快照实时同步（防止路由切换重挂后恢复到过期快照变首页）
      activeTab.value.history = [...history.value];
      activeTab.value.histIndex = histIndex.value;
    }
  }
  // 导航后更新可前进/后退状态
  const api = (window as any).electronAPI;
  api.browserView.canGoBack(tid).then((v: boolean) => { electronCanBack.value = v; });
  api.browserView.canGoForward(tid).then((v: boolean) => { electronCanForward.value = v; });
}

/** 标题更新统一处理（主进程推送与 webview 元素事件共用） */
function applyTitle(tid: string, title: string) {
  const tab = tabs.value.find(t => t.id === tid);
  if (tab && title) tab.title = title;
  if (browserScope === 'preview' && tid === activeTabId.value && title) {
    const bt = chatStore.previewTabs.find(t => t.kind === 'browser');
    if (bt) bt.name = title;
  }
}

function onWebviewNavigated(tabId: string, e: any) {
  applyNavigated(tabId, e?.url || '');
}
function onWebviewTitle(tabId: string, e: any) {
  applyTitle(tabId, e?.title || '');
}
function onWebviewLoading(tabId: string, isLoading: boolean) {
  if (tabId !== activeTabId.value) return;
  loading.value = isLoading;
  if (activeTab.value) activeTab.value.loading = isLoading;
  // webview 引擎：guest 原样加载完（did-stop-loading）后重注入自定义滚动条样式。
  // 插入的 CSS 会随导航重置，需在每次加载结束都补一次与旧 BrowserView did-finish-load 一致。
  if (!isLoading && isWebviewEngine.value) applyElectronScrollbarTheme();
}

// 智能体（LLM）导航通道：agent 写 currentBrowserUrl → 预览面板跟随导航。
// 仅 preview 空间实例响应；/browser 独立页（page 空间）不跟随 agent 导航（两边已隔离）。
watch(
  () => chatStore.currentBrowserUrl,
  (url) => {
    if (browserScope !== 'preview') return;
    if (!url) return;

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

// ── 密码管理（记住密码）──
interface SavedPassword {
  id: string; host: string; url?: string; name?: string; username: string;
  form_meta?: any; created_at?: number; updated_at?: number;
}
const savedPasswords = ref<SavedPassword[]>([]);

const editingPassword = ref<SavedPassword | null>(null);
const revealedPwd = ref<Record<string, string>>({});
const pwdForm = ref({ name: '', url: '', host: '', username: '', password: '' });

function getAuthHeader(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const token = localStorage.getItem('auth_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch {}
  return headers;
}

async function callPwdApi(p: string, method = 'GET', body?: any): Promise<any> {
  const res = await fetch('/api/browser' + p, { method, headers: getAuthHeader(), body: body !== undefined ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || json.error) throw new Error(json.error || `请求失败 (${res.status})`);
  return json.data ?? json;
}

async function loadSavedPasswords() {
  try {
    const data = await callPwdApi('/passwords') as any[];
    savedPasswords.value = data || [];
  } catch (e: any) {
    ElMessage.error(e?.message || '加载密码失败');
  }
}

function openPasswordManager() {
  loadSavedPasswords();
  showPasswords.value = true;
}

function openPasswordEditor(p: SavedPassword | null) {
  editingPassword.value = p;
  if (p) {
    pwdForm.value = { name: p.name || '', url: p.url || '', host: p.host, username: p.username, password: '' };
  } else {
    let h = '', u = '';
    try { h = new URL(currentUrl.value).host; u = currentUrl.value; } catch {}
    pwdForm.value = { name: '', url: u, host: h, username: '', password: '' };
  }
  showPasswordEditor.value = true;
}

function syncPwdHost() {
  try { pwdForm.value.host = new URL(pwdForm.value.url).host; } catch {}
}

async function savePasswordForm() {
  const f = pwdForm.value;
  if (!f.host || !f.username || !f.password) { ElMessage.warning('域名/用户名/密码为必填项'); return; }
  try {
    if (editingPassword.value) {
      await callPwdApi(`/passwords/${editingPassword.value.id}`, 'PUT', {
        host: f.host, url: f.url, name: f.name, username: f.username, password: f.password,
      });
      ElMessage.success('已更新');
    } else {
      await callPwdApi('/passwords', 'POST', {
        host: f.host, url: f.url, name: f.name, username: f.username, password: f.password,
      });
      ElMessage.success('已保存');
    }
    showPasswordEditor.value = false;
    loadSavedPasswords();
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  }
}

async function revealPassword(p: SavedPassword) {
  try {
    const data = await callPwdApi(`/passwords/${p.id}/reveal`, 'POST') as any;
    revealedPwd.value = { ...revealedPwd.value, [p.id]: data.password };
  } catch (e: any) {
    ElMessage.error(e?.message || '查看失败');
  }
}

async function fillPassword(p: SavedPassword) {
  if (!currentUrl.value) { ElMessage.warning('请先在浏览器打开目标登录页'); return; }
  try {
    await callPwdApi(`/passwords/${p.id}/fill`, 'POST');
    ElMessage.success('已填充，请确认后提交');
  } catch (e: any) {
    ElMessage.error(e?.message || '填充失败');
  }
}

async function deletePassword(p: SavedPassword) {
  try {
    await callPwdApi(`/passwords/${p.id}`, 'DELETE');
    ElMessage.success('已删除');
    loadSavedPasswords();
  } catch (e: any) {
    ElMessage.error(e?.message || '删除失败');
  }
}

function onMenuCommand(cmd: string) {
  if (cmd === 'history') { fetchData(); showHistory.value = true; }
  else if (cmd === 'passwords') openPasswordManager();
  else if (cmd === 'settings') showSettings.value = true;
  else if (cmd === 'bookmarks') showBookmarks.value = true;
  else if (cmd === 'clearBookmarks') {
    bookmarks.value = [];
    safeSetJson('browser_bookmarks', []);
    ElMessage.success('收藏夹已清空');
  }
}

onMounted(async () => {
  // 引擎以主进程为准（BROWSER_ENGINE_DEFAULT）：主进程是单一真相源，
  // 渲染层只负责按引擎渲染不同载体（<webview> 元素 vs BrowserView 占位 div）。
  if (isElectron) {
    try {
      const eng = await (window as any).electronAPI?.browser?.engine?.();
      if (eng === 'webview' || eng === 'browserview') browserEngine.value = eng;
    } catch { /* 主进程无此 API 时保持默认值 */ }
  }
  // 恢复式挂载：store 中已有 tabs（路由 /browser ↔ /chat 切换、预览面板重开）时
  // 恢复激活原 tab，绝不新建空 tab —— 否则每次挂载累积空白 tab 并把真实 tab 挤出
  // 主进程 MAX_TABS=8 的 LRU 窗口（切回来"变回初始"的根因）。
  const initUrl = route.query.url;
  if (tabs.value.length > 0) {
    const restoreId = (activeTabId.value && tabs.value.some(t => t.id === activeTabId.value))
      ? activeTabId.value
      : ([...tabs.value].reverse().find(t => t.url)?.id || tabs.value[tabs.value.length - 1].id);
    // switchTab 对相同 tabId 会短路，先清空强制走完整的激活 + bounds 同步
    activeTabId.value = '';
    await switchTab(restoreId);
  } else {
    // 初始化第一个标签页
    await newTab();
  }
  // 从路由 query 接收初始 URL（对话页点链接跳转过来），在应用内预览面板打开
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
    // 监听 BrowserView 导航事件，同步地址栏 URL（带 tabId）
    // 导航/标题统一走 applyNavigated / applyTitle（webview 元素事件也复用同一套，避免两份漂移）
    api.browserView.onNavigated((tid: string, url: string) => applyNavigated(tid, url));
    // 网页 window.open / target=_blank：主进程在 partition 上拦截后转成此事件，
    // 统一在应用内新标签页打开，弹窗不会逃逸成系统窗口
    (window as any).electronAPI?.onOpenTab?.((url: string) => { if (url) newTab(url); });
    // agent 首次 navigate：主进程广播"在某 scope 打开 URL"——若面板仍停主页(无 <webview>)由此把它真正打开
    (window as any).electronAPI?.onForceOpen?.((url: string, scope?: string) => {
      if (scope && scope !== browserScope) return; // 只接管归属自己空间的导航
      if (!url) return;
      if (currentUrl.value === url) return;        // 已在目标页，不重复导航
      openSite(url);
    });
    // 主进程在渲染层重载完成（did-finish-load）后的"重认领"通知：
    // did-start-navigation 兜底会摘除全部 BrowserView，恢复依赖渲染层重挂链路；
    // 若 BrowserPanel 已挂载但占位尺寸无变化、ResizeObserver 不再触发，会一直停在
    // 摘除态（黑屏/首页占位）。这里收到通知后强制重跑一次可见性闸门补齐最后一环。
    api.browserView.onResync?.(() => {
      nextTick(() => { if (shouldBeVisible.value) syncBrowserViewBounds(true); });
    });
    // 监听页面加载完成事件（带 tabId）
    api.browserView.onLoaded(async (tid: string, _url: string) => {
      if (tid !== activeTabId.value) return;
      loading.value = false;
      if (activeTab.value) activeTab.value.loading = false;
      // 页面加载完成后注入滚动条主题样式（导航到新页面会重置，需重新注入）
      applyElectronScrollbarTheme();
      // 跨源导航/崩溃重载会重置页面缩放：以主进程 entry.zoomFactor 校正 UI 百分比，
      // 保证显示与真实缩放一致（不再依赖可能陈旧的 tab.pageZoom）。
      if (isElectron) {
        try {
          const z = await (window as any).electronAPI.browserView.getZoomFactor(tid);
          if (typeof z === 'number' && z > 0) {
            pageZoom.value = +z.toFixed(2);
            if (activeTab.value) activeTab.value.pageZoom = pageZoom.value;
          }
        } catch { /* ignore */ }
      }
    });
    // 渲染进程崩溃且自动重载超过上限（主进程 CRASH_RELOAD_LIMIT=3）：
    // 只收尾 loading 状态，避免转圈不停。不新增任何可见 UI。
    api.browserView.onCrashed?.((tid: string, reason: string) => {
      if (tid !== activeTabId.value) return;
      loading.value = false;
      if (activeTab.value) activeTab.value.loading = false;
      console.warn('[BrowserPanel] 页面渲染进程崩溃且自动重载已达上限：', reason);
    });
    // 非 UI 路径（pageAgent 工具 / 页面 window.close）关闭当前 tab 时，主进程自行顶替并广播。
    // activeTabId 已一致则忽略（幂等）：UI 路径下渲染层自身也会顶替，避免两次 switchTab 抖动。
    api.browserView.onTabActivated?.((tid: string) => {
      if (tid === activeTabId.value) return;
      if (!tabs.value.some(t => t.id === tid)) return; // 渲染层没有该 tab 壳，无从切换
      switchTab(tid).catch(() => { /* ignore */ });
    });
    // 主进程兜底自建 tab（ensureActiveTab 超时自建）→ 补建 tab 壳。
    // 没有这步渲染层"无壳即忽略"，pageAgent 导航发生在主进程但预览面板毫无变化（导航黑洞）。
    // 按空间过滤：主进程广播带 scope，只认本空间的 tab，避免两边 tab 列表串扰。
    api.browserView.onTabCreated?.((tid: string, url: string | null, scope?: string) => {
      // page 空间只收明确标记为 page 的 tab；preview 空间收 preview 及未标记（旧主进程兼容）
      const belong = scope || 'preview';
      if (belong !== browserScope) return;
      if (tabs.value.some(t => t.id === tid)) return;
      tabs.value.push({
        id: tid, url: url || '', title: '', loading: false, urlInput: url || '',
        history: url ? [url] : [], histIndex: url ? 0 : -1, pageZoom: 1, canBack: false, canForward: false,
      });
      activeTabId.value = tid;
    });
    // 页面 title 变化 → 更新 tab 标题（真实网站名而非 URL）+ 对话页 browser tab 名
    // 对话页 tab chip 名称只由 preview 空间实例更新（page 空间的网页标题不牵连对话页）
    api.browserView.onTitleUpdated?.((tid: string, title: string) => applyTitle(tid, title));

    // webview 引擎：网页就在 DOM 里，无需 bounds 同步 / 无需主进程推送导航事件
    if (isWebviewEngine.value) return;

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
  if (syncTimer !== null) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
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
  // Electron 桌面端：组件卸载时隐藏所有 BrowserView
  if (isElectron) {
    for (const tab of tabs.value) {
      try { (window as any).electronAPI.browserView.hide(tab.id); } catch { /* ignore */ }
    }
  }
});

</script>

<style scoped>
.browser-shell { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--el-bg-color, #fff); min-height: 0; }

/* 多标签页栏（Chrome 风格） */
.browser-tabbar {
  display: flex; align-items: flex-end;
  background: var(--el-bg-color-page, #dee1e6);
  padding: 0 4px; height: 36px; flex-shrink: 0;
}
[data-theme="dark"] .browser-tabbar { background: var(--el-bg-color); }
.tab-list { display: flex; align-items: flex-end; overflow-x: auto; overflow-y: hidden; height: 100%; flex: 1; }
.tab-list::-webkit-scrollbar { height: 0; }
.tab-item {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 12px; height: 30px; min-width: 48px; max-width: 200px;
  cursor: pointer; white-space: nowrap; font-size: 12px;
  color: var(--el-text-color-secondary, #5f6368);
  border-radius: 8px 8px 0 0;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.tab-item:hover { background: rgba(0,0,0,0.06); }
[data-theme="dark"] .tab-item:hover { background: rgba(255,255,255,0.08); }
.tab-item.active {
  color: var(--el-text-color-primary, #202124);
  background: var(--el-bg-color, #fff);
}
/* 皮肤下的 tab/工具栏/主页等配色统一在文件末尾的“皮肤接管”段处理（浅色+深色都生效） */
.tab-favicon { font-size: 7px; opacity: 0.5; flex-shrink: 0; }
.tab-item.active .tab-favicon { opacity: 0.8; }
.tab-title { overflow: hidden; text-overflow: ellipsis; flex: 1; }
.tab-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border: none; background: transparent;
  cursor: pointer; font-size: 13px; line-height: 1; color: inherit;
  border-radius: 50%; opacity: 0; flex-shrink: 0; transition: opacity 0.15s, background 0.15s;
}
.tab-item:hover .tab-close, .tab-item.active .tab-close { opacity: 0.6; }
.tab-close:hover { opacity: 1 !important; background: rgba(0,0,0,0.1); }
[data-theme="dark"] .tab-close:hover { background: rgba(255,255,255,0.15); }
.tab-new {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 30px; border: none; background: transparent;
  cursor: pointer; color: var(--el-text-color-secondary, #5f6368);
  flex-shrink: 0; border-radius: 8px 8px 0 0; transition: background 0.15s, color 0.15s;
}
.tab-new:hover { color: var(--el-text-color-primary, #202124); background: rgba(0,0,0,0.06); }
[data-theme="dark"] .tab-new:hover { color: #fff; background: rgba(255,255,255,0.08); }



/* Chrome 风格工具栏 */
.browser-toolbar {
  display: flex; align-items: center; gap: 4px;
  padding: 8px 12px;
  background: var(--el-bg-color, #f1f3f4);
  border-bottom: 1px solid var(--el-border-color-lighter, #e0e0e0);
  flex-shrink: 0;
}
[data-theme="dark"] .browser-toolbar { background: var(--el-bg-color); }

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
.nav-btn.active { color: var(--el-color-primary); }

.url-bar {
  flex: 1; display: flex; align-items: center; gap: 6px;
  height: 36px; padding: 0 12px;
  background: var(--el-fill-color-light, #fff);
  border: 1px solid transparent; border-radius: 18px;
  transition: all 0.15s; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
[data-theme="dark"] .url-bar { background: var(--el-fill-color); box-shadow: none; }
.url-bar.focused { border-color: var(--el-color-primary); box-shadow: 0 1px 6px color-mix(in srgb, var(--el-color-primary) 15%, transparent); }
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
[data-theme="dark"] .bookmarks-bar { background: var(--el-bg-color); }
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
/* 用 background-color 而非 background 简写：简写会把 background-image 一并重置成 none，
   皮肤开启时（skin.css 里给 .browser-shell .home-page 下发了底图）会把底图清掉。
   只改这一处，视觉与原来等价。 */
.home-page { flex: 1; min-height: 0; overflow-y: auto; padding: 40px 24px 32px; background-color: var(--el-bg-color-page, #fafafa); }
[data-theme="dark"] .home-page { background-color: var(--el-bg-color); }
.home-search { display: flex; flex-direction: column; align-items: center; gap: 18px; margin-bottom: 36px; }
.home-logo { font-size: 34px; font-weight: 700; color: var(--el-color-primary); letter-spacing: 4px; }
.home-search-box {
  display: flex; align-items: center; gap: 8px;
  width: min(620px, 92%); height: 48px; padding: 0 8px 0 16px;
  background: var(--el-bg-color, #fff); border: 1px solid var(--el-border-color, #dadce0);
  border-radius: 24px; box-shadow: 0 1px 6px rgba(0,0,0,0.08);
}
[data-theme="dark"] .home-search-box { background: var(--el-fill-color); border-color: var(--el-border-color); }
.home-search-box:focus-within { border-color: var(--el-color-primary); box-shadow: 0 1px 8px color-mix(in srgb, var(--el-color-primary) 18%, transparent); }
.home-search-ico { color: var(--el-text-color-secondary, #9aa0a6); flex-shrink: 0; }
.home-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: 16px; color: var(--el-text-color-primary, #202124); }
.home-search-btn { border: none; background: var(--el-color-primary); color: #fff; height: 36px; padding: 0 20px; border-radius: 18px; cursor: pointer; font-size: 14px; }
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
[data-theme="dark"] .analysis-card { background: var(--el-bg-color-overlay); border-color: var(--el-border-color); }
.analysis-card.empty { color: var(--el-text-color-secondary); font-size: 13px; }
.analysis-summary { font-size: 14px; color: var(--el-text-color-primary, #202124); line-height: 1.6; }
.analysis-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
.analysis-tag { font-size: 12px; padding: 3px 10px; border-radius: 10px; background: color-mix(in srgb, var(--el-color-primary) 10%, transparent); color: var(--el-color-primary); }
.analysis-highlights { margin: 8px 0 0; padding-left: 18px; font-size: 13px; color: var(--el-text-color-regular, #5f6368); line-height: 1.7; }
.analysis-suggest { font-size: 13px; color: var(--el-text-color-regular, #5f6368); line-height: 1.6; margin-top: 8px; }
.analysis-model { font-size: 11px; color: var(--el-text-color-secondary, #80868b); margin-top: 8px; }
.analysis-loading { font-size: 13px; color: var(--el-text-color-secondary, #80868b); }
.analysis-error { font-size: 12px; color: var(--el-color-danger, #f56c6c); margin-top: 6px; }

/* 页面渲染区 */
.browser-viewport { flex: 1; min-height: 0; position: relative; overflow: hidden; background: #fff; display: flex; flex-direction: column; }
[data-theme="dark"] .browser-viewport { background: var(--el-bg-color); }
/* webview/iframe：flex:1 撑满 viewport */
.page-frame { flex: 1; width: 100%; min-width: 0; border: none; background: #fff; display: block; overflow: hidden; }
[data-theme="dark"] .page-frame { background: var(--el-bg-color); }

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

/* webview 引擎：<webview> 作为普通 DOM 节点铺满视口。
   非激活 tab 保留渲染（后台 tab 的截图 / JS 注入仍可用），只移出视觉层，
   不用 display:none —— 那会让 guest 停止合成，capturePage 截到空白。 */
.page-webview {
  position: absolute; left: 0; top: 0; right: 0; bottom: 0;
  width: 100%; height: 100%;
  border: 0; background: #fff;
  opacity: 0; pointer-events: none; z-index: 0;
}
.page-webview.wv-active { opacity: 1; pointer-events: auto; z-index: 1; }
[data-theme="dark"] .page-webview { background: var(--el-bg-color); }

.loading-overlay {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 12px;
  background: rgba(255,255,255,0.7); z-index: 5;
}
[data-theme="dark"] .loading-overlay { background: rgba(27,29,35,0.7); }
.loading-spinner {
  width: 36px; height: 36px; border: 3px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
  border-top-color: var(--el-color-primary, #C2410C); border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }


/* 桌面端原生浏览器占位（主窗口已加载外部网页，这里只做提示） */
.native-browser-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--el-bg-color-page, #fafafa); }
[data-theme="dark"] .native-browser-placeholder { background: var(--el-bg-color); }
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

.pwd-toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.pwd-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--el-border-color-lighter); }
.pwd-main { flex: 1; min-width: 0; }
.pwd-host { font-weight: 500; font-size: 14px; }
.pwd-sub { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; word-break: break-all; }
.pwd-actions { display: flex; gap: 4px; flex-shrink: 0; }

</style>
