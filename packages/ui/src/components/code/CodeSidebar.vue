<template>
  <div class="csb">
    <!-- 活动条 -->
    <div class="csb-bar">
      <el-tooltip content="资源管理器" placement="right" :show-after="300">
        <button class="csb-act" :class="{ on: view === 'explorer' }" @click="view = 'explorer'">
          <el-icon :size="17"><Files /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip content="搜索（文件内容）" placement="right" :show-after="300">
        <button class="csb-act" :class="{ on: view === 'search' }" @click="view = 'search'">
          <el-icon :size="17"><Search /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip content="源代码管理" placement="right" :show-after="300">
        <button class="csb-act" :class="{ on: view === 'git' }" @click="view = 'git'">
          <el-icon :size="17"><Share /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip content="运行与调试" placement="right" :show-after="300">
        <button class="csb-act" :class="{ on: view === 'run' }" @click="view = 'run'">
          <el-icon :size="17"><Aim /></el-icon>
        </button>
      </el-tooltip>

      <div class="csb-bar-spacer"></div>

      <el-tooltip content="开发环境（Java / Maven / Python）" placement="right" :show-after="300">
        <button class="csb-act" @click="openEnv">
          <el-icon :size="17"><Setting /></el-icon>
        </button>
      </el-tooltip>
    </div>

    <!-- 面板 -->
    <div class="csb-panel">
      <ExplorerPanel v-show="view === 'explorer'" @pick-dir="emit('pick-dir')" @scope-search="onScopeSearch" />
      <FileSearchPanel
        v-show="view === 'search'"
        ref="fileSearchRef"
        mode="code"
        :dir="code.projectDir"
        v-model:scope="searchScope"
      />
      <div v-show="view === 'git'" class="csb-git">
        <ChatGitPanel />
      </div>
      <RunDebugPanel v-show="view === 'run'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick } from 'vue';
import { Files, Search, Share, Aim, Setting } from '@element-plus/icons-vue';
import { useCodeStore, type SidebarView } from '../../stores/code';
import { openSettingsDrawer } from '../../composables/useSettingsDrawer';
import ExplorerPanel from './panels/ExplorerPanel.vue';
import FileSearchPanel from './panels/FileSearchPanel.vue';
import RunDebugPanel from './panels/RunDebugPanel.vue';
import ChatGitPanel from '../chat/ChatGitPanel.vue';

const emit = defineEmits<{ 'pick-dir': [] }>();
const code = useCodeStore();

const view = computed<SidebarView>({
  get: () => code.sidebarView,
  set: (v) => { code.sidebarView = v; },
});

/** 搜索范围（资源管理器右击「在此文件夹中搜索」设置，联动搜索面板） */
const searchScope = ref<{ rel: string; label: string } | null>(null);
const fileSearchRef = ref<InstanceType<typeof FileSearchPanel> | null>(null);

function onScopeSearch(payload: { rel: string; label: string }) {
  searchScope.value = payload;
  code.sidebarView = 'search';
  void nextTick(() => fileSearchRef.value?.focusQuery());
}

function openEnv() {
  openSettingsDrawer('env');
}
</script>

<style scoped>
.csb { display: flex; height: 100%; min-height: 0; overflow: hidden; }

.csb-bar {
  flex: 0 0 42px; width: 42px;
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 8px 0;
  background: var(--el-fill-color-lighter, #f6f4ef);
  border-right: 1px solid var(--glass-border, #e7e4dc);
}
.csb-bar-spacer { flex: 1; }

.csb-act {
  width: 30px; height: 30px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 8px; background: transparent;
  color: var(--color-text-secondary, #6b6b66); cursor: pointer;
  transition: all 0.15s ease; position: relative;
}
.csb-act:hover { background: var(--glass-bg-hover, #eeebe3); color: var(--color-text, #1a1a1a); }
.csb-act.on { color: var(--color-primary, #c2410c); background: color-mix(in srgb, var(--color-primary, #c2410c) 12%, transparent); }
.csb-act.on::before {
  content: ''; position: absolute; left: -8px; top: 22%; height: 56%; width: 2px;
  background: var(--color-primary, #c2410c); border-radius: 0 2px 2px 0;
}

.csb-panel { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.csb-panel > * { flex: 1; min-height: 0; }
.csb-git { display: flex; flex-direction: column; overflow: hidden; }
</style>
