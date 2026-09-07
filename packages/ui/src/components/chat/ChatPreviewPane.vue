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

    <!-- 空态：无 tab 时三个入口 -->
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
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, type Component } from 'vue';
import { Close, Document, Link, Folder } from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
import { useSettingsStore } from '../../stores/settings';
import type { PreviewTab } from '../../stores/chat';
import FilePreview from '../FilePreview.vue';
import BrowserPanel from '../BrowserPanel.vue';
import ChatGitPanel from './ChatGitPanel.vue';

const { store, closeRightPanel } = useChat();

const settingsStore = useSettingsStore();
const gitPanelRef = ref<InstanceType<typeof ChatGitPanel> | null>(null);
const hasWorkspaceDir = computed(() => !!settingsStore.settings.workspaceDir);

const fileTabs = computed(() => store.previewTabs.filter((t) => t.kind === 'file'));
const gitTab = computed(() => store.previewTabs.find((t) => t.kind === 'git') || null);
const browserTab = computed(() => store.previewTabs.find((t) => t.kind === 'browser') || null);

/** 仓库名（Git tab 标题） */
const repoName = computed(() => {
  const dir = settingsStore.settings.workspaceDir || '';
  return dir ? dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Git' : 'Git';
});

function tabIconComp(tab: PreviewTab): Component {
  if (tab.kind === 'file') return Document;
  if (tab.kind === 'git') return Folder;
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
  return tab.name;
}

function openFileEntry() {
  store.showFilePopup = true;
}
function openBrowserEntry() {
  store.openTab({ kind: 'browser', name: '浏览器', url: '' });
}
function openGitEntry() {
  store.openTab({ kind: 'git', name: repoName.value, repoPath: settingsStore.settings.workspaceDir });
}
</script>
