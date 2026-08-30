<template>
  <aside class="right-panel" :class="{ open: store.rightPanelOpen }">
    <div class="right-panel-tabs">
      <div v-if="store.previewingFile" class="right-panel-tab" :class="{ active: store.rightPanelTab === 'file' }" @click="store.rightPanelTab = 'file'">
        <span class="right-panel-tab-title" :title="store.previewingFile.name">{{ store.previewingFile.name }}</span>
        <el-icon class="right-panel-tab-close" @click.stop="closeFileTab"><Close /></el-icon>
      </div>
      <div v-if="browserActive || store.rightPanelTab === 'browser'" class="right-panel-tab" :class="{ active: store.rightPanelTab === 'browser' }" @click="store.rightPanelTab = 'browser'">
        <span class="right-panel-tab-title" :title="store.currentBrowserUrl || currentBrowserLabel">{{ currentBrowserLabel }}</span>
        <el-icon class="right-panel-tab-close" @click.stop="closeBrowserTab"><Close /></el-icon>
      </div>
      <div v-if="hasWorkspaceDir || store.rightPanelTab === 'git'" class="right-panel-tab" :class="{ active: store.rightPanelTab === 'git' }" @click="store.rightPanelTab = 'git'">
        <span class="right-panel-tab-title">Git 文件</span>
        <el-icon class="right-panel-tab-close" @click.stop="closeGitTab"><Close /></el-icon>
      </div>
      <div class="right-panel-tab-actions">
        <el-button size="small" circle @click="closeRightPanel" title="收起面板">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </div>

    <div v-show="store.rightPanelTab === 'file'" class="right-panel-body">
      <FilePreview v-if="store.previewingFile" :file="store.previewingFile" />
      <el-empty v-else description="点击顶栏「文件管理」选择文件预览" :image-size="60" />
    </div>

    <div v-show="store.rightPanelTab === 'browser'" class="right-panel-body">
      <BrowserPanel />
    </div>

    <div v-show="store.rightPanelTab === 'git'" class="right-panel-body">
      <ChatGitPanel ref="gitPanelRef" />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Close } from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
import { useSettingsStore } from '../../stores/settings';
import FilePreview from '../FilePreview.vue';
import BrowserPanel from '../BrowserPanel.vue';
import ChatGitPanel from './ChatGitPanel.vue';

const {
  store, browserActive, currentBrowserLabel, closeRightPanel,
} = useChat();

const settingsStore = useSettingsStore();
const gitPanelRef = ref<InstanceType<typeof ChatGitPanel> | null>(null);
const hasWorkspaceDir = computed(() => !!settingsStore.settings.workspaceDir);

function closeFileTab() {
  store.previewingFile = null;
  if (browserActive.value) store.rightPanelTab = 'browser';
  else closeRightPanel();
}

function closeBrowserTab() {
  store.browserSteps = [];
  store.currentBrowserUrl = '';
  if (store.previewingFile) store.rightPanelTab = 'file';
  else closeRightPanel();
}

function closeGitTab() {
  if (store.previewingFile) store.rightPanelTab = 'file';
  else if (browserActive.value) store.rightPanelTab = 'browser';
  else closeRightPanel();
}
</script>
