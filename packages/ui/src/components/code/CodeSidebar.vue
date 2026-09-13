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
      <el-tooltip content="控制台" placement="right" :show-after="300">
        <button class="csb-act" :class="{ on: code.consoleOpen }" @click="code.toggleConsole()">
          <el-icon :size="17"><Monitor /></el-icon>
        </button>
      </el-tooltip>

      <!-- 插件入口（代码类型插件列表） -->
      <el-tooltip content="插件" placement="right" :show-after="300">
        <button class="csb-act" :class="{ on: view === 'plugins' }" @click="view = 'plugins'">
          <el-icon :size="17"><Box /></el-icon>
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
        <ChatGitPanel @viewDiff="onViewDiff" />
      </div>
      <RunDebugPanel v-show="view === 'run'" />

      <!-- 插件列表面板 -->
      <div v-show="view === 'plugins'" class="csb-plugin-list">
        <div class="plugin-list-header">插件</div>
        <div class="plugin-list-body">
          <div
            v-for="p in codePlugins"
            :key="p.id"
            class="plugin-card"
            @click="openPluginDialog(p)"
          >
            <div class="plugin-card-icon">{{ p.label.charAt(0) }}</div>
            <div class="plugin-card-info">
              <div class="plugin-card-name">{{ p.label }}</div>
              <div class="plugin-card-desc">{{ p.desc || p.route }}</div>
            </div>
          </div>
          <div v-if="!codePlugins.length" class="plugin-list-empty">
            暂无代码插件
          </div>
        </div>
      </div>
    </div>

    <!-- 插件弹窗 -->
    <el-dialog
      v-model="pluginDialogVisible"
      :title="pluginDialogTitle"
      width="85%"
      top="5vh"
      class="plugin-dialog"
      destroy-on-close
    >
      <div class="plugin-dialog-body">
        <CicdConsole v-if="activePluginId === 'cicd-pipeline'" />
        <JavaSuite v-if="activePluginId === 'java-suite'" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, onMounted } from 'vue';
import { Files, Search, Share, Aim, Setting, Monitor, Box } from '@element-plus/icons-vue';
import { useCodeStore, type SidebarView } from '../../stores/code';
import { usePluginStore } from '../../stores/plugin';
import { openSettingsDrawer } from '../../composables/useSettingsDrawer';
import ExplorerPanel from './panels/ExplorerPanel.vue';
import FileSearchPanel from './panels/FileSearchPanel.vue';
import RunDebugPanel from './panels/RunDebugPanel.vue';
import ChatGitPanel from '../chat/ChatGitPanel.vue';
import CicdConsole from '../../views/plugin/CicdConsole.vue';
import JavaSuite from '../../views/plugin/JavaSuite.vue';

const emit = defineEmits<{ 'pick-dir': [] }>();
const code = useCodeStore();
const pluginStore = usePluginStore();

const view = computed<SidebarView>({
  get: () => code.sidebarView,
  set: (v) => { code.sidebarView = v; },
});

/** 搜索范围（资源管理器右击「在此文件夹中搜索」设置，联动搜索面板） */
const searchScope = ref<{ rel: string; label: string } | null>(null);
const fileSearchRef = ref<InstanceType<typeof FileSearchPanel> | null>(null);

/** 代码类型插件（kind='code'）：从已启用插件中过滤，取首个路由作为入口 */
const codePlugins = computed(() =>
  pluginStore.enabledPlugins
    .filter((p) => p.manifest.kind === 'code')
    .map((p) => ({
      id: p.manifest.id,
      label: p.manifest.name,
      route: p.manifest.contributes?.routes?.[0]?.path || '',
      desc: p.manifest.description,
    })),
);

/** 插件弹窗 */
const pluginDialogVisible = ref(false);
const pluginDialogTitle = ref('');
const activePluginId = ref('');

function openPluginDialog(p: { id: string; label: string }) {
  activePluginId.value = p.id;
  pluginDialogTitle.value = p.label;
  pluginDialogVisible.value = true;
}

function onScopeSearch(payload: { rel: string; label: string }) {
  searchScope.value = payload;
  code.sidebarView = 'search';
  void nextTick(() => fileSearchRef.value?.focusQuery());
}

function openEnv() {
  openSettingsDrawer('env');
}

/** git 面板双击文件 → 在编辑区域打开 */
function onViewDiff(payload: { path: string; staged: boolean; repoPath?: string }) {
  const base = payload.repoPath || code.projectDir || '';
  const full = base ? base.replace(/[\\/]+$/, '') + '/' + payload.path : payload.path;
  void code.openFile(full);
}

onMounted(() => {
  if (!pluginStore.loaded) pluginStore.refresh();
});
</script>

<style scoped>
.csb { display: flex; height: 100%; min-height: 0; overflow: hidden; }

.csb-bar {
  flex: 0 0 42px; width: 42px;
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 8px 0;
  background: var(--glass-bg-hover, #f1efe9);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
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

/* 插件列表面板 */
.csb-plugin-list { display: flex; flex-direction: column; overflow: hidden; }
.plugin-list-header {
  padding: 10px 14px; font-size: 13px; font-weight: 600;
  color: var(--color-text-secondary, #6b6b66);
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
}
.plugin-list-body { flex: 1; overflow-y: auto; padding: 8px; }
.plugin-card {
  display: flex; align-items: center; gap: 10px;
  padding: 10px; border-radius: 8px; cursor: pointer;
  transition: background 0.15s;
}
.plugin-card:hover { background: var(--glass-bg-hover, #eeebe3); }
.plugin-card-icon {
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 600;
  background: color-mix(in srgb, var(--color-primary, #c2410c) 15%, transparent);
  color: var(--color-primary, #c2410c);
}
.plugin-card-info { flex: 1; min-width: 0; }
.plugin-card-name { font-size: 14px; font-weight: 500; }
.plugin-card-desc { font-size: 12px; color: var(--color-text-secondary, #999); margin-top: 2px; }
.plugin-list-empty { padding: 20px; text-align: center; color: var(--color-text-secondary, #999); font-size: 13px; }

/* 插件弹窗 */
.plugin-dialog-body { height: 75vh; overflow: auto; }
</style>

<style>
/* 弹窗全局样式（非 scoped，el-dialog 渲染在 body 上） */
.plugin-dialog .el-dialog__body { padding: 0; }
</style>
