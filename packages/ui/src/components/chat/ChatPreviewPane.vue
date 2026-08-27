<template>
  <aside class="right-panel" :class="{ open: store.rightPanelOpen }">
    <div class="right-panel-tabs">
      <div v-if="store.previewingFile" class="right-panel-tab" :class="{ active: store.rightPanelTab === 'file' }" @click="store.rightPanelTab = 'file'">
        <span class="right-panel-tab-title" :title="store.previewingFile.name">{{ store.previewingFile.name }}</span>
      </div>
      <div v-if="browserActive" class="right-panel-tab" :class="{ active: store.rightPanelTab === 'browser' }" @click="store.rightPanelTab = 'browser'">
        <span class="right-panel-tab-title" :title="store.currentBrowserUrl || currentBrowserLabel">{{ currentBrowserLabel }}</span>
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
  </aside>
</template>

<script setup lang="ts">
import { Close } from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
import FilePreview from '../FilePreview.vue';
import BrowserPanel from '../BrowserPanel.vue';

const {
  store, browserActive, currentBrowserLabel, closeRightPanel,
} = useChat();
</script>
