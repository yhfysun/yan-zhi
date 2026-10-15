<template>
  <aside class="right-panel" :class="{ open: store.rightPanelOpen }">
    <!-- 多 tab 条：previewTabs 并存，标题为真实文件名 / hostname / 仓库名 -->
    <div class="right-panel-tabs">
      <div
        v-for="tab in store.previewTabs"
        :key="tab.id"
        class="right-panel-tab"
        :class="{ active: tab.id === store.activeTabId }"
        @click="store.activatePreviewTab(tab.id)"
        @contextmenu.prevent="openTabCtx($event, tab)"
      >
        <span class="right-panel-tab-icon" :class="'kind-' + tab.kind">
          <el-icon><component :is="tabIconComp(tab)" /></el-icon>
        </span>
        <span class="right-panel-tab-title" :title="tabTitle(tab)">{{ tabTitle(tab) }}</span>
        <el-icon
          class="right-panel-tab-close"
          @click.stop="store.closePreviewTab(tab.id)"
        ><Close /></el-icon>
      </div>
      <div class="right-panel-tab-actions">
        <!-- ★ 用 Minus 而非 Close：Close 在本组件里已经是"关闭单个 tab"的语义，
             同一行再放一个 Close 当"收起面板"，图标同形、语义不同 →
             用户按 svg 指纹看到的是"两个一样的 ×"（2026-09-21 实测 2 处重复）。 -->
        <el-button size="small" circle @click="closeRightPanel" title="收起面板">
          <el-icon><Minus /></el-icon>
        </el-button>
      </div>
    </div>

    <!-- 内容区：
         file 多实例并存（v-show 切换不销毁，滚动位置保留）；
         git 单例；browser 单例（v-if 无 tab 时卸载 → BrowserPanel unmount 触发主进程摘除） -->
    <div
      v-for="tab in fileTabs"
      :key="tab.id"
      v-show="tab.id === store.activeTabId"
      class="right-panel-body"
    >
      <FilePreview :file="{ name: tab.name, path: tab.path || '', conversationId: (tab as any).conversationId, spaceId: tab.spaceId, resourceDir: tab.resourceDir }" />
    </div>

    <div v-if="gitTab" v-show="gitTab.id === store.activeTabId" class="right-panel-body">
      <!-- repo = 当前会话所属工作空间的目录（三级归属：Git = 工作空间级）。
           必须显式传：ChatGitPanel 的兜底链会落到 IDE 项目目录（跨工作空间脏值）。 -->
      <ChatGitPanel ref="gitPanelRef" :repo="gitRepoDir" @viewDiff="onViewDiff" />
    </div>

    <div v-if="browserTab && supportsBrowser" v-show="browserTab.id === store.activeTabId" class="right-panel-body">
      <!-- ★★★ 浏览器是「应用级」资源（三级归属模型，2026-10-15 用户澄清）：
           整个应用一份，切工作空间 / 切任务 / 切会话都不得销毁它。
           ⇒ key 与 scope **固定**，不再随 currentConvId 变化。
           此前 `:key="store.currentConvId" :scope="preview:${convId}"`：切会话即 unmount →
           BrowserPanel onUnmounted 调 closeAllTabs 真销毁 BrowserView → 正在跑的
           pageAgent 失去目标 webContents，任务直接中断（用户实报）。
           scope 用裸 'preview'：BrowserPanel 的 isPreviewScope / agent 导航 watch /
           主进程 tabCreated 广播三处均按「preview 与 preview:* 同空间」兼容。 -->
      <BrowserPanel :key="'app-browser'" :scope="'preview'" />
    </div>

    <div v-if="dataTab" v-show="dataTab.id === store.activeTabId" class="right-panel-body">
      <DataQueryWorkbench v-if="dataTab.contract" :key="dataTab.id" :contract="dataTab.contract" />
    </div>

    <div v-if="consoleTab" v-show="consoleTab.id === store.activeTabId" class="right-panel-body">
      <ChatConsolePanel />
    </div>

    <!-- 空态：无 tab 时各入口 -->
    <div v-if="store.previewTabs.length === 0" class="right-panel-empty">
      <button class="right-panel-empty-entry" @click="openFileEntry">
        <el-icon><Document /></el-icon><span>文件预览</span>
      </button>
      <button v-if="supportsBrowser" class="right-panel-empty-entry" @click="openBrowserEntry">
        <el-icon><Link /></el-icon><span>浏览器预览</span>
      </button>
      <button v-if="hasWorkspaceDir" class="right-panel-empty-entry" @click="openGitEntry">
        <el-icon><Folder /></el-icon><span>Git 文件</span>
      </button>
      <button class="right-panel-empty-entry" @click="store.openTab({ kind: 'data', name: '数据浏览', contract: defaultDataContract })">
        <el-icon><Grid /></el-icon><span>数据浏览</span>
      </button>
      <button class="right-panel-empty-entry" @click="openConsoleEntry">
        <el-icon><Monitor /></el-icon><span>控制台</span>
      </button>
    </div>
  </aside>

  <!-- 预览 tab 右键菜单 -->
  <Teleport to="body">
<ul v-if="tabCtx.visible" class="ctx-menu" :style="{ top: tabCtx.y + 'px', left: tabCtx.x + 'px' }">
    <li @click="ctxCloseCurrent">
      <el-icon><Close /></el-icon>关闭
    </li>
    <li :class="{ disabled: ctxIsFirst }" @click="ctxCloseLeft">
      <el-icon><Back /></el-icon>关闭左侧
    </li>
    <li :class="{ disabled: ctxIsLast }" @click="ctxCloseRight">
      <el-icon><Right /></el-icon>关闭右侧
    </li>
    <li @click="ctxCloseAll">
      <el-icon><CircleClose /></el-icon>关闭全部
    </li>
  </ul>
</Teleport>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, type Component } from 'vue';
import { clampMenuPos } from '../../utils/menuPosition';
import { useRouter } from 'vue-router';
import { Close, Minus, Document, Link, Folder, Grid, Monitor, Back, Right, CircleClose } from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
import { usePlatform } from '../../composables/usePlatform';
import { useSettingsStore } from '../../stores/settings';
import { useSpaceStore } from '../../stores/space';
import type { DataTabContract, PreviewTab } from '../../stores/chat';
import FilePreview from '../FilePreview.vue';
import BrowserPanel from '../BrowserPanel.vue';
import ChatGitPanel from './ChatGitPanel.vue';
import ChatConsolePanel from './ChatConsolePanel.vue';
import DataQueryWorkbench from './DataQueryWorkbench.vue';

const { store, closeRightPanel } = useChat();
// E12: 移动端不支持内置浏览器——隐藏「浏览器预览」入口
const { supportsBrowser } = usePlatform();

const router = useRouter();
const settingsStore = useSettingsStore();
const spaceStore = useSpaceStore();
const gitPanelRef = ref<InstanceType<typeof ChatGitPanel> | null>(null);
const hasWorkspaceDir = computed(() => !!settingsStore.settings.workspaceDir);

/**
 * Git 面板的仓库根目录（三级归属：Git = **工作空间级**）。
 * 优先取「当前会话所属空间的绑定目录」（会话归属创建时的空间，发消息不改变归属），
 * 回退到设置里的工作目录（选中空间时由 selectSpaceAndSyncDir 同步）。
 * ★ 刻意不含 codeStore.projectDir：那是 IDE 当前项目目录，与工作空间无关且长期驻留
 *   ⇒ 此前预览面板 git 显示「别的有 git 的目录」的根因。
 */
const gitRepoDir = computed(() => {
  const conv = store.conversations.find((c) => c.id === store.currentConvId);
  const sid = conv?.spaceId;
  if (sid) {
    const dir = spaceStore.spaces.find((s) => s.id === sid)?.dirPath;
    if (dir) return dir;
  }
  return settingsStore.settings.workspaceDir || '';
});

/** git 面板双击文件 → 打开文件预览 */
function onViewDiff(payload: { path: string; staged: boolean; repoPath?: string }) {
  const base = payload.repoPath || gitRepoDir.value || '';
  const full = base ? base.replace(/[\\/]+$/, '') + '/' + payload.path : payload.path;
  store.openTab({ kind: 'file', name: payload.path.split(/[\\/]/).pop() || payload.path, path: full });
}

const fileTabs = computed(() => store.previewTabs.filter((t) => t.kind === 'file'));
const gitTab = computed(() => store.previewTabs.find((t) => t.kind === 'git') || null);
const browserTab = computed(() => store.previewTabs.find((t) => t.kind === 'browser') || null);
const dataTab = computed(() => store.previewTabs.find((t) => t.kind === 'data') || null);
const consoleTab = computed(() => store.previewTabs.find((t) => t.kind === 'console') || null);

/** 空态「数据浏览」的默认契约：内置项目库的 conversation 表（真实存在的种子演示表） */
const defaultDataContract: DataTabContract = {
  title: '任务明细',
  table: 'conversation',
  filterCols: ['pinned'],
};

/** 仓库名（Git tab 标题）——与 gitRepoDir 同源，避免标题与面板内容两个目录 */
const repoName = computed(() => {
  const dir = gitRepoDir.value || '';
  return dir ? dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Git' : 'Git';
});

function tabIconComp(tab: PreviewTab): Component {
  if (tab.kind === 'file') return Document;
  if (tab.kind === 'git') return Folder;
  if (tab.kind === 'data') return Grid;
  if (tab.kind === 'console') return Monitor;
  return Link;
}

/** tab 标题：file=真实文件名；browser=真实页面标题（page-title 事件写入 name），无则回退当前站点 hostname；git=仓库目录名 */
function tabTitle(tab: PreviewTab): string {
  if (tab.kind === 'browser') {
    if (tab.name && tab.name !== '浏览器') return tab.name;
    try {
      const h = new URL(store.currentBrowserUrl).hostname;
      if (h) return h;
    } catch { /* 尚无 URL 时回退 tab.name */ }
    return tab.name || '浏览器';
  }
  if (tab.kind === 'git') return repoName.value;
  if (tab.kind === 'data') return tab.contract?.title || '数据浏览';
  return tab.name;
}

function openFileEntry() {
  // 文件管理弹窗已并入代码模式：这里直接进 IDE 工作台
  router.push('/code');
}
function openBrowserEntry() {
  store.openTab({ kind: 'browser', name: '浏览器', url: '' });
}
function openGitEntry() {
  store.openTab({ kind: 'git', name: repoName.value, repoPath: gitRepoDir.value });
}
function openConsoleEntry() {
  store.openTab({ kind: 'console', name: '控制台' });
}

// ===== 预览 tab 右键菜单：关闭 / 关闭左侧 / 关闭右侧 / 关闭全部 =====
const tabCtx = ref<{ visible: boolean; x: number; y: number; tabId: string | null }>({ visible: false, x: 0, y: 0, tabId: null });
const ctxIsFirst = computed(() => {
  if (!tabCtx.value.tabId) return false;
  return store.previewTabs.findIndex((t) => t.id === tabCtx.value.tabId) <= 0;
});
const ctxIsLast = computed(() => {
  if (!tabCtx.value.tabId) return false;
  const idx = store.previewTabs.findIndex((t) => t.id === tabCtx.value.tabId);
  return idx < 0 || idx === store.previewTabs.length - 1;
});

function openTabCtx(e: MouseEvent, tab: PreviewTab) {
  tabCtx.value = { visible: true, ...clampMenuPos(e), tabId: tab.id };
}
function closeTabCtx() {
  tabCtx.value.visible = false;
}
function ctxCloseCurrent() {
  if (tabCtx.value.tabId) store.closePreviewTab(tabCtx.value.tabId);
  closeTabCtx();
}
function ctxCloseLeft() {
  if (tabCtx.value.tabId) store.closePreviewTabsLeft(tabCtx.value.tabId);
  closeTabCtx();
}
function ctxCloseRight() {
  if (tabCtx.value.tabId) store.closePreviewTabsRight(tabCtx.value.tabId);
  closeTabCtx();
}
function ctxCloseAll() {
  store.closeAllPreviewTabs();
  closeTabCtx();
}

function onDocMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement)?.closest('.ctx-menu')) return;
  closeTabCtx();
}
onMounted(() => document.addEventListener('mousedown', onDocMouseDown, true));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown, true));
</script>
