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
        <el-button size="small" circle @click="closeRightPanel" title="收起面板">
          <el-icon><Close /></el-icon>
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
      <FilePreview :file="{ name: tab.name, path: tab.path || '' }" />
    </div>

    <div v-if="gitTab" v-show="gitTab.id === store.activeTabId" class="right-panel-body">
      <ChatGitPanel ref="gitPanelRef" />
    </div>

    <div v-if="browserTab" v-show="browserTab.id === store.activeTabId" class="right-panel-body">
      <!-- scope=preview：与 /browser 独立浏览器页的 tab 空间隔离 -->
      <BrowserPanel scope="preview" />
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
      <button class="right-panel-empty-entry" @click="openBrowserEntry">
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
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, type Component } from 'vue';
import { useRouter } from 'vue-router';
import { Close, Document, Link, Folder, Grid, Monitor, Back, Right, CircleClose } from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
import { useSettingsStore } from '../../stores/settings';
import type { DataTabContract, PreviewTab } from '../../stores/chat';
import FilePreview from '../FilePreview.vue';
import BrowserPanel from '../BrowserPanel.vue';
import ChatGitPanel from './ChatGitPanel.vue';
import ChatConsolePanel from './ChatConsolePanel.vue';
import DataQueryWorkbench from './DataQueryWorkbench.vue';

const { store, closeRightPanel } = useChat();

const router = useRouter();
const settingsStore = useSettingsStore();
const gitPanelRef = ref<InstanceType<typeof ChatGitPanel> | null>(null);
const hasWorkspaceDir = computed(() => !!settingsStore.settings.workspaceDir);

const fileTabs = computed(() => store.previewTabs.filter((t) => t.kind === 'file'));
const gitTab = computed(() => store.previewTabs.find((t) => t.kind === 'git') || null);
const browserTab = computed(() => store.previewTabs.find((t) => t.kind === 'browser') || null);
const dataTab = computed(() => store.previewTabs.find((t) => t.kind === 'data') || null);
const consoleTab = computed(() => store.previewTabs.find((t) => t.kind === 'console') || null);

/** 空态「数据浏览」的默认契约：内置项目库的 conversation 表（真实存在的种子演示表） */
const defaultDataContract: DataTabContract = {
  title: '会话明细',
  table: 'conversation',
  filterCols: ['pinned'],
};

/** 仓库名（Git tab 标题） */
const repoName = computed(() => {
  const dir = settingsStore.settings.workspaceDir || '';
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
  store.openTab({ kind: 'git', name: repoName.value, repoPath: settingsStore.settings.workspaceDir });
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
  tabCtx.value = { visible: true, x: e.clientX, y: e.clientY, tabId: tab.id };
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
